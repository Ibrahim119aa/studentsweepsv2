const Transaction = require('../../models/Transaction');

module.exports = (io, socket) => {
  // payload: { userId }
  socket.on('entries:myTransactions', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = { type: 'object', properties: { userId: { type: 'string' } }, required: ['userId'], additionalProperties: false };
      if (!validateEmit(schema, payload, socket)) return;

      const { userId } = payload || {};

      // Find all transactions for this user (orders, donations, and prize payouts)
      const tx = await Transaction.find({ user: userId }).sort({ createdAt: -1 }).lean();
      
      // Log for debugging
      const logger = require('../../utils/logger');
      const donationCount = tx.filter(t => t.category === 'donation').length;
      const orderCount = tx.filter(t => t.category === 'order').length;
      logger.info('entries.myTransactions.response', { 
        userId, 
        totalTransactions: tx.length, 
        donationCount, 
        orderCount 
      });
      
      socket.emit('entries:myTransactions:response', { success: true, transactions: tx });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });
};
