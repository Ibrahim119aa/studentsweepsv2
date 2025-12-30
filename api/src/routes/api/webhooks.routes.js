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
  // ✅ WEBHOOK TRIGGERED - Log immediately when webhook is called
  console.log('🔔 [NOWPAYMENTS WEBHOOK] ========================================');
  console.log('🔔 [NOWPAYMENTS WEBHOOK] Webhook triggered at:', new Date().toISOString());
  console.log('🔔 [NOWPAYMENTS WEBHOOK] Request method:', req.method);
  console.log('🔔 [NOWPAYMENTS WEBHOOK] Request URL:', req.url);
  console.log('🔔 [NOWPAYMENTS WEBHOOK] Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('🔔 [NOWPAYMENTS WEBHOOK] Request body:', JSON.stringify(req.body, null, 2));
  console.log('🔔 [NOWPAYMENTS WEBHOOK] ========================================');
  
  try {
    // 1. Get the signature from the specific header mentioned in docs
    // Check multiple possible header name variations (case-insensitive)
    const receivedSignature = req.headers['x-nowpayments-sig'] || 
                              req.headers['X-NowPayments-Sig'] ||
                              req.headers['X-NOWPAYMENTS-SIG'] ||
                              req.headers['x-nowpayments-signature'] ||
                              req.headers['signature'];
    
    console.log('🔔 [NOWPAYMENTS WEBHOOK] All headers keys:', Object.keys(req.headers));
    console.log('🔔 [NOWPAYMENTS WEBHOOK] Looking for signature in: x-nowpayments-sig');
    console.log('🔔 [NOWPAYMENTS WEBHOOK] Signature received:', receivedSignature ? 'YES' : 'NO');
    
    if (!receivedSignature) {
      console.error('❌ [NOWPAYMENTS WEBHOOK] Missing signature header');
      console.error('❌ [NOWPAYMENTS WEBHOOK] Available headers:', JSON.stringify(req.headers, null, 2));
      console.warn('⚠️  [NOWPAYMENTS WEBHOOK] Processing without signature verification (UNSAFE - for testing only)');
      logger.warn('nowpayments.ipn.missing_signature', { 
        headers: Object.keys(req.headers),
        allHeaders: req.headers 
      });
      
      // ⚠️ WARNING: In production, you should NOT process without signature
      // For now, we'll allow it but log a warning
      // TODO: Remove this in production and return error instead
      // return res.status(400).send('No signature provided');
    }

    // 2. Sort parameters alphabetically and convert to string per documentation
    const params = req.body;
    const sortedString = JSON.stringify(params, Object.keys(params).sort());

    console.log('🔔 [NOWPAYMENTS WEBHOOK] Payment params:', JSON.stringify(params, null, 2));
    logger.error('nowpayments.ipn.received', { params: sortedString });

    // 3. Sign the string with IPN-secret key using HMAC and SHA-512
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET; // Ensure this is set in your .env
    
    if (!ipnSecret) {
      logger.error('nowpayments.ipn.config_error', { message: 'Missing IPN Secret' });
      return res.status(500).send('Server Configuration Error');
    }

    // 4. Verify signature if provided
    if (receivedSignature) {
      console.log('🔔 [NOWPAYMENTS WEBHOOK] Verifying signature...');
      const hmac = crypto.createHmac('sha512', ipnSecret);
      hmac.update(sortedString);
      const calculatedSignature = hmac.digest('hex');

      // Compare signatures
      if (receivedSignature !== calculatedSignature) {
        console.error('❌ [NOWPAYMENTS WEBHOOK] Signature mismatch!');
        console.error('   Received:', receivedSignature?.substring(0, 20) + '...');
        console.error('   Calculated:', calculatedSignature?.substring(0, 20) + '...');
        logger.warn('nowpayments.ipn.signature_mismatch', { 
          received: receivedSignature, 
          calculated: calculatedSignature 
        });
        
        const io = eventBus.getIO();
        if (io) io.emit('payments:ipn:signatureMismatch', { provider: 'nowpayments' });
        
        return res.status(400).send('Invalid signature');
      }

      console.log('✅ [NOWPAYMENTS WEBHOOK] Signature verified successfully!');
    } else {
      console.warn('⚠️  [NOWPAYMENTS WEBHOOK] Processing WITHOUT signature verification (UNSAFE)');
      console.warn('⚠️  [NOWPAYMENTS WEBHOOK] This should only happen in test/sandbox mode');
    }

    // 5. Process the payload
    const { payment_status, order_id, invoice_id, pay_amount, pay_currency } = params;
    console.log('🔔 [NOWPAYMENTS WEBHOOK] Payment Status:', payment_status);
    console.log('🔔 [NOWPAYMENTS WEBHOOK] Order ID:', order_id);
    console.log('🔔 [NOWPAYMENTS WEBHOOK] Invoice ID:', invoice_id);
    console.log('🔔 [NOWPAYMENTS WEBHOOK] Amount:', pay_amount, pay_currency);
    logger.info('nowpayments.ipn.received', { payment_status, order_id, invoice_id });

    const trx = await Transaction.findOne({ trxID: order_id });
    if (!trx) {
      console.warn('⚠️  [NOWPAYMENTS WEBHOOK] Transaction not found for order_id:', order_id);
      logger.warn('nowpayments.ipn.transaction_not_found', { order_id });
      return res.status(200).send('OK'); // Return OK to stop IPN retries if trx doesn't exist
    }

    console.log('✅ [NOWPAYMENTS WEBHOOK] Transaction found:', trx.trxID);
    console.log('🔔 [NOWPAYMENTS WEBHOOK] Current transaction status:', trx.order?.status || trx.donation?.status);
    console.log('🔔 [NOWPAYMENTS WEBHOOK] Current isPaid:', trx.order?.isPaid || trx.donation?.isPaid);

    if (payment_status === 'finished' || payment_status === 'paid' || payment_status === 'confirmed') {
      console.log('✅ [NOWPAYMENTS WEBHOOK] Payment completed! Updating transaction...');
      
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
      console.log('✅ [NOWPAYMENTS WEBHOOK] Transaction saved with updated status');

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
            console.log('✅ [NOWPAYMENTS WEBHOOK] Transaction attached to user');
          } else {
            console.log('ℹ️  [NOWPAYMENTS WEBHOOK] Transaction already attached to user');
          }
        }
      } catch (e) { 
        console.error('❌ [NOWPAYMENTS WEBHOOK] Failed to attach transaction to user:', e.message);
        logger.warn('nowpayments.ipn.userAttachFailed', { err: e.message, trxID: trx.trxID }); 
      }

      // Notify sockets
      const io = eventBus.getIO();
      if (io) {
        io.emit('payments:paid', { trxID: trx.trxID, provider: 'nowpayments' });
        console.log('✅ [NOWPAYMENTS WEBHOOK] Socket event emitted: payments:paid');
      }
      
      console.log('✅ [NOWPAYMENTS WEBHOOK] Payment processing completed successfully!');
    } else {
      // Handle other statuses (waiting, failed, expired, etc.)
      console.log('ℹ️  [NOWPAYMENTS WEBHOOK] Payment status:', payment_status, '- No action taken');
      logger.info('nowpayments.ipn.status_update', { status: payment_status, order_id });
    }

    console.log('✅ [NOWPAYMENTS WEBHOOK] Returning 200 OK to NowPayments');
    return res.status(200).send('OK');

  } catch (err) {
    console.error('❌ [NOWPAYMENTS WEBHOOK] ERROR:', err.message);
    console.error('❌ [NOWPAYMENTS WEBHOOK] Stack:', err.stack);
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