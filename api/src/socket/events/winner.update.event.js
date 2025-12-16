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
  socket.on('winner:update', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          winnerId: { type: 'string' },
          prizeId: { type: 'string' },
          imageUrl: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['winnerId', 'prizeId', 'imageUrl'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const admin = await isAdminFromToken(token);
      if (!admin) {
        return socket.emit('winner:update:response', { success: false, message: 'Admin access required' });
      }

      const { winnerId, prizeId, imageUrl, description } = payload;

      const winner = await Winner.findById(winnerId);
      if (!winner) {
        return socket.emit('winner:update:response', { success: false, message: 'Winner not found' });
      }

      const prize = await Prize.findById(prizeId);
      if (!prize) {
        return socket.emit('winner:update:response', { success: false, message: 'Prize not found' });
      }

      // If changing prize, handle the unique constraint
      const isChangingPrize = winner.prize.toString() !== prizeId;
      
      if (isChangingPrize) {
        // Check if the new prize already has a winner
        const existingWinnerForPrize = await Winner.findOne({ prize: prizeId });
        if (existingWinnerForPrize && existingWinnerForPrize._id.toString() !== winnerId) {
          // Remove the existing winner for the new prize (to allow the change)
          await Winner.findByIdAndDelete(existingWinnerForPrize._id);
        }
      }

      // Update winner
      winner.prize = prizeId;
      winner.imageUrl = imageUrl;
      winner.description = description || '';
      
      try {
        await winner.save();
      } catch (err) {
        // Handle unique constraint errors
        if (err.code === 11000 || err.message.includes('duplicate')) {
          return socket.emit('winner:update:response', { success: false, message: 'This prize already has a winner. Please assign a different prize.' });
        }
        throw err;
      }

      // Populate user and prize for response
      await winner.populate('user', '-password -__v');
      await winner.populate('prize');

      socket.emit('winner:update:response', { success: true, winner });
      
      // Broadcast to all clients
      io.emit('winner:updated', { winner });
    } catch (err) {
      console.error('[winner:update] Error:', err);
      socket.emit('winner:update:response', { success: false, message: err.message });
    }
  });
};

