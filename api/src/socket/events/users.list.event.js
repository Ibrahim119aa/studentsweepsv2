const User = require('../../models/User');

module.exports = (io, socket) => {
  socket.on('users:list', async (payload) => {
    try {
      // Get all users, excluding password
      const users = await User.find({})
        .select('-password -__v')
        .sort({ createdAt: -1 })
        .lean();
      
      socket.emit('users:list:response', { success: true, users });
    } catch (err) {
      console.error('[users:list] Error:', err);
      socket.emit('users:list:response', { success: false, message: err.message });
    }
  });
};





