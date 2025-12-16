const Transaction = require('../../models/Transaction');
const Prize = require('../../models/Prize');

module.exports = (io, socket) => {
  socket.on('draw:history', async (payload) => {
    try {
      // Get all drawn prizes (with status 'drawn')
      const drawnPrizes = await Prize.find({ status: 'drawn' })
        .sort({ drawTimestamp: -1 })
        .lean();
      
      console.log(`[draw:history] Found ${drawnPrizes.length} drawn prizes`);
      socket.emit('draw:history:response', { success: true, results: drawnPrizes });
    } catch (err) {
      console.error('[draw:history] Error:', err);
      socket.emit('draw:history:response', { success: false, message: err.message });
    }
  });
};
