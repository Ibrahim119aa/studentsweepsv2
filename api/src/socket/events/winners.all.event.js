const Winner = require('../../models/Winner');

module.exports = (io, socket) => {
  socket.on('winners:all', async (payload) => {
    try {
      // Get all winners with populated user and prize
      const winners = await Winner.find({})
        .populate('user', '-password -__v')
        .populate('prize')
        .sort({ createdAt: -1 })
        .lean();
      
      socket.emit('winners:all:response', { success: true, winners });
    } catch (err) {
      console.error('[winners:all] Error:', err);
      socket.emit('winners:all:response', { success: false, message: err.message });
    }
  });
};





