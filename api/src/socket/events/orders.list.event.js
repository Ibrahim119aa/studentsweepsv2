const Transaction = require('../../models/Transaction');
const { verifyToken } = require('../../utils/jwt');
const User = require('../../models/User');

async function isAdminFromToken(token) {
  if (!token) return false;
  try {
    const data = verifyToken(token);
    if (!data || !data.id) return false;
    const user = await User.findById(data.id).lean();
    return !!user && user.isAdmin === true;
  } catch (err) {
    return false;
  }
}

module.exports = (io, socket) => {
  socket.on('orders:list', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = { type: 'object', additionalProperties: false };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const admin = await isAdminFromToken(token);
      if (!admin) return socket.emit('error', { message: 'admin required' });

      // Populate user data for both top-level user and order.user
      const orders = await Transaction.find({ category: 'order' })
        .populate('user', 'fullName emailAddress')
        .populate('order.user', 'fullName emailAddress')
        .sort({ createdAt: -1 })
        .lean();
      socket.emit('orders:list:response', { success: true, orders });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });
};
