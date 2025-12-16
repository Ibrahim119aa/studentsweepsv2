const Prize = require('../../models/Prize');
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
  socket.on('prizes:new', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          prize: { type: 'object' }
        },
        required: ['prize'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      // Prefer token from handshake auth for authenticated sockets; fallback to payload.token for older clients
      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const { prize } = payload || {};
      const admin = await isAdminFromToken(token);
      if (!admin) return socket.emit('prizes:new:response', { success: false, message: 'admin required' });

      const created = await Prize.create(prize || {});
      io.emit('prizes:new', { success: true, prize: created });
      socket.emit('prizes:new:response', { success: true, prize: created });
    } catch (err) {
      socket.emit('prizes:new:response', { success: false, message: err.message });
    }
  });
};
