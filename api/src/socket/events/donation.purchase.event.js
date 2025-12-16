const Donation = require('../../models/Donation');
const Transaction = require('../../models/Transaction');

function generateTrxID() {
  return `DON${Date.now()}${Math.floor(Math.random() * 9000) + 1000}`;
}

module.exports = (io, socket) => {
  socket.on('donation:purchase', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          donationId: { type: 'string' },
          amount: { type: 'number' },
          paymentProvider: { type: 'string' },
          user: { type: 'object', properties: { id: { type: 'string' }, emailAddress: { type: 'string', format: 'email' } }, required: ['id', 'emailAddress'] }
        },
        required: ['donationId', 'amount', 'user'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const { donationId, amount, user } = payload;
      const donation = await Donation.findById(donationId);
      if (!donation) return socket.emit('donation:purchase:error', { message: 'donation not found' });

      const trxID = generateTrxID();
      
      // Get payment provider from payload or default to 'malum' (same as entries purchase)
      const paymentProvider = payload.paymentProvider || 'malum';

      const trx = await Transaction.create({
        trxID,
        user: user.id,
        category: 'donation',
        donation: {
          name: donation.name,
          dateTimestamp: new Date(),
          amount: amount, // Store the donation amount
          isPaid: false,
          user: user.id,
          paymentProvider
        }
      });

      // Attach transaction to user immediately (similar to how entries work)
      const User = require('../../models/User');
      try {
        const userDoc = await User.findById(user.id);
        if (userDoc) {
          userDoc.transactions = userDoc.transactions || [];
          if (!userDoc.transactions.includes(trx._id)) {
            userDoc.transactions.push(trx._id);
            await userDoc.save();
          }
        }
      } catch (e) {
        const logger = require('../../utils/logger');
        logger.warn('donation.purchase.userAttachFailed', { err: e.message, trxID: trx.trxID });
      }

      const { createNowPaymentsInvoice, createMalumCheckoutForm } = require('../../services/invoiceIntegration');
      const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const apiBase = process.env.API_BASE_URL || base;
      let invoiceResult = null;

      if (paymentProvider === 'nowpayments') {
        invoiceResult = await createNowPaymentsInvoice({
          priceAmount: amount,
          priceCurrency: 'USD',
          orderId: trx.trxID,
          orderDescription: `Donation ${donation.name}`,
          ipnCallbackUrl: `${apiBase}/api/webhooks/nowpayments/ipn`,
          successUrl: `${base}/success`,
          cancelUrl: `${base}/cancel`
        });
        trx.donation.invoiceId = invoiceResult && (invoiceResult.id || invoiceResult.invoice_id || invoiceResult.invoiceId);
        trx.donation.invoiceData = invoiceResult;
        await trx.save();
        socket.emit('donation:purchase:invoice', { invoice: invoiceResult, trxID: trx.trxID });
        const logger = require('../../utils/logger');
        logger.info('donation.purchase.invoice.created', { trxID: trx.trxID, amount, provider: 'nowpayments' });
      } else if (paymentProvider === 'malum') {
        const malumResp = await createMalumCheckoutForm({
          amount,
          currency: 'USD',
          webhookUrl: `${apiBase}/api/webhooks/malum/webhook`,
          successUrl: `${base}/success`,
          cancelUrl: `${base}/cancel`,
          customerEmail: user.emailAddress,
          metadata: JSON.stringify({ trxID: trx.trxID }),
          buyerPaysFees: 0
        });
        trx.donation.invoiceId = malumResp && malumResp.txn;
        trx.donation.invoiceData = malumResp;
        await trx.save();
        socket.emit('donation:purchase:invoice', { invoice: malumResp, trxID: trx.trxID });
        const logger = require('../../utils/logger');
        logger.info('donation.purchase.invoice.created', { trxID: trx.trxID, amount, provider: 'malum' });
      } else {
        socket.emit('donation:purchase:created', { trxID: trx.trxID });
      }

      io.emit('donation:new', { trxID: trx.trxID, donationId });
    } catch (err) {
      const logger = require('../../utils/logger');
      logger.error('donation.purchase.error', { message: err.message });
      io.emit('payments:failed', { trxID: (err && err.trxID) || null, reason: err.message });
      socket.emit('donation:purchase:error', { message: err.message });
    }
  });
};