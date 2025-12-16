const Winner = require('../../models/Winner');
const User = require('../../models/User');
const Prize = require('../../models/Prize');

async function isAdminFromToken(token) {
  try {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET;
    const data = jwt.verify(token, secret);
    const user = await User.findById(data.id || data._id);
    return user && user.isAdmin === true;
  } catch (err) {
    return false;
  }
}

module.exports = (io, socket) => {
  socket.on('winner:delete', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          winnerId: { type: 'string' }
        },
        required: ['winnerId'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const admin = await isAdminFromToken(token);
      if (!admin) {
        return socket.emit('winner:delete:response', { success: false, message: 'Admin access required' });
      }

      const { winnerId } = payload;

      const winner = await Winner.findById(winnerId);
      if (!winner) {
        return socket.emit('winner:delete:response', { success: false, message: 'Winner not found' });
      }

      // Get prize info before deletion for response
      const prizeId = winner.prize;
      await winner.populate('prize');
      const prize = winner.prize;

      // Delete the winner
      await Winner.findByIdAndDelete(winnerId);

      // Update prize status back to active if needed
      if (prize && prize.status === 'drawn') {
        prize.status = 'active';
        await prize.save();
      }

      socket.emit('winner:delete:response', { success: true, winnerId, prizeId });
      
      // Broadcast to all clients
      io.emit('winner:deleted', { winnerId, prizeId });
    } catch (err) {
      console.error('[winner:delete] Error:', err);
      socket.emit('winner:delete:response', { success: false, message: err.message });
    }
  });
};





