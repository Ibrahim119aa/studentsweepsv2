const Donation = require('../../models/Donation');
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
  socket.on('donations:delete', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const { id } = payload || {};
      const admin = await isAdminFromToken(token);
      if (!admin) return socket.emit('donations:delete:response', { success: false, message: 'admin required' });
      if (!id) return socket.emit('donations:delete:response', { success: false, message: 'id required' });

      const donation = await Donation.findByIdAndDelete(id).lean();
      if (!donation) return socket.emit('donations:delete:response', { success: false, message: 'donation not found' });

      io.emit('donations:delete', { success: true, donationId: id });
      socket.emit('donations:delete:response', { success: true, donation });
    } catch (err) {
      socket.emit('donations:delete:response', { success: false, message: err.message });
    }
  });
};













