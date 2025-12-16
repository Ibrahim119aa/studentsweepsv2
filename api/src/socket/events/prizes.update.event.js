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
  socket.on('prizes:update', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          update: { type: 'object' }
        },
        required: ['id', 'update'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const { id, update } = payload || {};
      const admin = await isAdminFromToken(token);
      if (!admin) return socket.emit('prizes:update:response', { success: false, message: 'admin required' });
      if (!id) return socket.emit('prizes:update:response', { success: false, message: 'id required' });

      // Get current prize to check status and drawTimestamp
      const currentPrize = await Prize.findById(id).lean();
      if (!currentPrize) return socket.emit('prizes:update:response', { success: false, message: 'prize not found' });

      // If drawTimestamp is being updated, automatically adjust status
      if (update.drawTimestamp) {
        const newDrawTimestamp = new Date(update.drawTimestamp);
        const now = new Date();
        const isNewDateInFuture = newDrawTimestamp > now;
        const isNewDateInPast = newDrawTimestamp < now;
        const currentStatus = currentPrize.status;

        // If draw date is changed to future and prize is currently "drawn", reopen it as "active"
        if (isNewDateInFuture && currentStatus === 'drawn') {
          update.status = 'active';
          console.log(`[prizes:update] Draw date moved to future (${newDrawTimestamp.toISOString()}), reopening prize from "drawn" to "active"`);
        }
        // If draw date is changed to past but prize is "active", keep it as "active" 
        // (don't auto-change to "drawn" - that requires an actual draw process)
        // Note: Status will remain "active" until a draw is performed
      }

      const prize = await Prize.findByIdAndUpdate(id, update || {}, { new: true }).lean();
      if (!prize) return socket.emit('prizes:update:response', { success: false, message: 'prize not found' });

      io.emit('prizes:update', { success: true, prize });
      socket.emit('prizes:update:response', { success: true, prize });
    } catch (err) {
      socket.emit('prizes:update:response', { success: false, message: err.message });
    }
  });
};
