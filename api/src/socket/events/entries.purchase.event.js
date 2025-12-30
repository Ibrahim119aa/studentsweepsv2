const Transaction = require('../../models/Transaction');
const Prize = require('../../models/Prize');

function generateTrxID() {
  return `TRX${Date.now()}${Math.floor(Math.random() * 9000) + 1000}`;
}

module.exports = (io, socket) => {
  socket.on('entries:purchase', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          prizeId: { type: 'string' },
          amount: { type: 'number' },
          totalCost: { type: 'number' },
          paymentProvider: { type: 'string' },
          user: { type: 'object', properties: { id: { type: 'string' }, emailAddress: { type: 'string', format: 'email' } }, required: ['id', 'emailAddress'] }
        },
        required: ['prizeId', 'amount', 'totalCost', 'user'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const { prizeId, amount, totalCost, user } = payload;
      const prize = await Prize.findById(prizeId).lean();
      if (!prize) return socket.emit('error', { message: 'prize not found' });

      const trxID = generateTrxID();
      const costPerEntry = amount ? (totalCost / amount) : 0;

      // Get payment provider from payload or default to 'malum'
      const paymentProvider = payload.paymentProvider || 'malum';

      const trx = await Transaction.create({
        trxID,
        user: user.id,
        category: 'order',
        order: {
          prizeName: prize.name,
          dateTimestamp: new Date(),
          status: 'pendingPayment',
          isWinner: false,
          isPaid: false,
          paymentProvider, // Store payment provider in order
          entries: {
            amount,
            costPerEntry,
            totalCost,
            entryNumbers: []
          },
          user: user.id
        }
      });

      // Attach transaction to user immediately (same as donation.purchase)
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
        logger.warn('entries.purchase.userAttachFailed', { err: e.message, trxID: trx.trxID });
      }

      const { createNowPaymentsInvoice, createMalumCheckoutForm } = require('../../services/invoiceIntegration');
      const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

      if (paymentProvider === 'nowpayments') {
        const invoice = await createNowPaymentsInvoice({
          priceAmount: totalCost,
          priceCurrency: 'USD',
          orderId: trx.trxID,
          orderDescription: `Entries for ${prize.name}`,
          ipnCallbackUrl: `https://studentsweeps.com/api/api/webhooks/nowpayments/ipn`,
          successUrl: `https://studentsweeps.com`,
          cancelUrl: `https://studentsweeps.com`
        });
        trx.order.invoiceId = invoice && (invoice.id || invoice.invoice_id || invoice.invoiceId);
        trx.order.paymentProvider = 'nowpayments';
        trx.order.invoiceData = invoice;
        await trx.save();
        socket.emit('entries:purchase:invoice', { invoice, trxID: trx.trxID });
        const logger = require('../../utils/logger');
        logger.info('entries.purchase.invoice.created', { trxID: trx.trxID, provider: 'nowpayments', prizeId });
      } else if (paymentProvider === 'malum') {
        const malumResp = await createMalumCheckoutForm({
          amount: totalCost,
          currency: 'USD',
          webhookUrl: `https://studentsweeps.com/api/api/webhooks/malum/webhook`,
          successUrl: `https://studentsweeps.com`,
          cancelUrl: `https://studentsweeps.com`,

          customerEmail: user.emailAddress,
          metadata: JSON.stringify({ trxID: trx.trxID }),
          buyerPaysFees: 0
        });
        trx.order.invoiceId = malumResp && malumResp.txn;
        trx.order.paymentProvider = 'malum';
        trx.order.invoiceData = malumResp;
        await trx.save();
        socket.emit('entries:purchase:invoice', { invoice: malumResp, trxID: trx.trxID });
        const logger = require('../../utils/logger');
        logger.info('entries.purchase.invoice.created', { trxID: trx.trxID, provider: 'malum', prizeId });
      } else {
        socket.emit('entries:purchase:created', { trxID: trx.trxID });
      }

      io.emit('orders:new', { trxID: trx.trxID, userEmail: user.emailAddress, totalCost });
    } catch (err) {
      const logger = require('../../utils/logger');
      logger.error('entries.purchase.error', { message: err.message });
      io.emit('payments:failed', { trxID: (err && err.trxID) || null, reason: err.message });
      socket.emit('error', { message: err.message });
    }
  });
};
