const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const crypto = require('crypto'); // Required for HMAC SHA-512 and MD5
// verifyMalumSignature removed as we implemented it inline
const Transaction = require('../../models/Transaction');
const Donation = require('../../models/Donation');
const User = require('../../models/User');
const logger = require('../../utils/logger');
const eventBus = require('../../utils/eventBus');

// NowPayments IPN
router.post('/nowpayments/ipn', bodyParser.json(), async (req, res) => {
  try {
    // 1. Get the signature from the specific header mentioned in docs
    const receivedSignature = req.headers['x-nowpayments-sig'];
    
    if (!receivedSignature) {
      logger.warn('nowpayments.ipn.missing_signature');
      return res.status(400).send('No signature provided');
    }

    // 2. Sort parameters alphabetically and convert to string per documentation
    const params = req.body;
    const sortedString = JSON.stringify(params, Object.keys(params).sort());

    logger.error('nowpayments.ipn.received', { params: sortedString });

    // 3. Sign the string with IPN-secret key using HMAC and SHA-512
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET; // Ensure this is set in your .env
    
    if (!ipnSecret) {
      logger.error('nowpayments.ipn.config_error', { message: 'Missing IPN Secret' });
      return res.status(500).send('Server Configuration Error');
    }

    console.log("this is now payment");
    const hmac = crypto.createHmac('sha512', ipnSecret);
    hmac.update(sortedString);
    const calculatedSignature = hmac.digest('hex');

    // 4. Compare signatures
    if (receivedSignature !== calculatedSignature) {
      logger.warn('nowpayments.ipn.signature_mismatch', { 
        received: receivedSignature, 
        calculated: calculatedSignature 
      });
      
      const io = eventBus.getIO();
      if (io) io.emit('payments:ipn:signatureMismatch', { provider: 'nowpayments' });
      
      return res.status(400).send('Invalid signature');
    }

    // 5. Process the payload
    const { payment_status, order_id, invoice_id, pay_amount, pay_currency } = params;
    logger.info('nowpayments.ipn.received', { payment_status, order_id, invoice_id });

    const trx = await Transaction.findOne({ trxID: order_id });
    if (!trx) {
      logger.warn('nowpayments.ipn.transaction_not_found', { order_id });
      return res.status(200).send('OK'); // Return OK to stop IPN retries if trx doesn't exist
    }

    if (payment_status === 'finished' || payment_status === 'paid' || payment_status === 'confirmed') {
      
      // Handle Order Logic
      if (trx.category === 'order') {
        trx.order.isPaid = true;
        trx.order.status = 'active';
        trx.order.invoiceId = invoice_id || trx.order.invoiceId;
      } 
      // Handle Donation Logic
      else if (trx.category === 'donation') {
        trx.donation.isPaid = true;
        trx.donation.invoiceId = invoice_id || trx.donation.invoiceId;
        
        // Update donation raised amount
        try {
          const donationRecord = await Donation.findOne({ name: trx.donation.name });
          if (donationRecord) {
            // Use pay_amount from payload or fallback to 0
            donationRecord.raised = (donationRecord.raised || 0) + (parseFloat(pay_amount) || 0);
            await donationRecord.save();
          }
        } catch (e) {
          logger.error('nowpayments.ipn.donationUpdateFailed', { err: e.message });
        }
      }

      await trx.save();

      // Add transaction ref to user
      try {
        const user = await User.findById(trx.user);
        if (user) {
          // Initialize array if it doesn't exist
          user.transactions = user.transactions || [];
          // Prevent duplicate pushes if IPN fires twice
          if (!user.transactions.includes(trx._id)) {
            user.transactions.push(trx._id);
            await user.save();
          }
        }
      } catch (e) { 
        logger.warn('nowpayments.ipn.userAttachFailed', { err: e.message, trxID: trx.trxID }); 
      }

      // Notify sockets
      const io = eventBus.getIO();
      if (io) io.emit('payments:paid', { trxID: trx.trxID, provider: 'nowpayments' });
      
    } else {
      // Handle other statuses (waiting, failed, expired, etc.)
      logger.info('nowpayments.ipn.status_update', { status: payment_status, order_id });
    }

    return res.status(200).send('OK');

  } catch (err) {
    logger.error('nowpayments.ipn.error', { message: err.message, stack: err.stack });
    return res.status(500).send('ERR');
  }
});

// Malum webhook
router.post('/malum/webhook', bodyParser.json(), async (req, res) => {
  try {
    const payload = req.body || {};
    const { txn, status, metadata, amount, timestamp, signature } = payload;
    
    // 1. Get Webhook Key
    const webhookKey = process.env.MALUM_WEBHOOK_KEY;
    if (!webhookKey) {
      logger.error('malum.webhook.config_error', { message: 'Missing Malum Webhook Key' });
      return res.status(500).send('Server Configuration Error');
    }

    logger.error('malum.webhook.received', { payload });

    // 2. Verify Signature: md5(txn|timestamp|webhook_key)
    // PHP Example: $signature = md5($txn . '|' . $timestamp . '|' . $webhook_key);
    const dataString = `${txn}|${timestamp}|${webhookKey}`;
    const calculatedSignature = crypto.createHash('md5').update(dataString).digest('hex');

    if (calculatedSignature !== signature) {
      logger.warn('malum.webhook.signature_mismatch', { 
        received: signature, 
        calculated: calculatedSignature,
        txn,
        timestamp
      });
      const io = eventBus.getIO();
      if (io) io.emit('payments:ipn:signatureMismatch', { provider: 'malum' });
      return res.status(400).send('Invalid signature');
    }

    logger.info('malum.webhook.received', { txn, status, amount });

    // Try to parse trxID from metadata
    let parsed = {};
    try { parsed = JSON.parse(metadata || '{}'); } catch (e) { parsed = {}; }
    
    const trxID = parsed.trxID || txn;
    const trx = await Transaction.findOne({ trxID });
    
    if (!trx) return res.status(200).send('OK');

    if (status === 'COMPLETED') {
      if (trx.category === 'order') {
        trx.order.isPaid = true;
        trx.order.status = 'active';
        trx.order.invoiceId = txn || trx.order.invoiceId;
      } else if (trx.category === 'donation') {
        trx.donation.isPaid = true;
        trx.donation.invoiceId = txn || trx.donation.invoiceId;
        
        // Update donation raised amount (same as NowPayments webhook)
        try {
          const donationRecord = await Donation.findOne({ name: trx.donation.name });
          if (donationRecord) {
            const donationAmount = parseFloat(amount) || parseFloat(trx.donation.amount) || 0;
            donationRecord.raised = (donationRecord.raised || 0) + donationAmount;
            await donationRecord.save();
          }
        } catch (e) {
          logger.error('malum.webhook.donationUpdateFailed', { err: e.message });
        }
      }
      trx.invoiceId = txn || trx.invoiceId;
      await trx.save();

      // attach to user (with duplicate check)
      try {
        const user = await User.findById(trx.user);
        if (user) {
          user.transactions = user.transactions || [];
          if (!user.transactions.includes(trx._id)) {
            user.transactions.push(trx._id);
            await user.save();
          }
        }
      } catch (e) { logger.warn('malum.webhook.userAttachFailed', { err: e.message, trxID: trx.trxID }); }

      const io = eventBus.getIO();
      if (io) io.emit('payments:paid', { trxID: trx.trxID, provider: 'malum' });
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Error handling malum webhook:', err);
    return res.status(500).send('ERR');
  }
});

module.exports = router;