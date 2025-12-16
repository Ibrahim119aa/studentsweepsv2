const Winner = require('../../models/Winner');
const User = require('../../models/User');
const Prize = require('../../models/Prize');
const Transaction = require('../../models/Transaction');

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
  socket.on('winner:assign', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          prizeId: { type: 'string' },
          imageUrl: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['userId', 'prizeId', 'imageUrl'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const admin = await isAdminFromToken(token);
      if (!admin) {
        return socket.emit('winner:assign:response', { success: false, message: 'Admin access required' });
      }

      const { userId, prizeId, imageUrl, description } = payload;

      // Verify user and prize exist
      const user = await User.findById(userId);
      if (!user) {
        return socket.emit('winner:assign:response', { success: false, message: 'User not found' });
      }

      const prize = await Prize.findById(prizeId);
      if (!prize) {
        return socket.emit('winner:assign:response', { success: false, message: 'Prize not found' });
      }

      // Check if there's already a winner for this prize
      const existingWinner = await Winner.findOne({ prize: prizeId });
      
      let winner;
      if (existingWinner) {
        // Update existing winner (change user, image, description)
        existingWinner.user = userId;
        existingWinner.imageUrl = imageUrl;
        existingWinner.description = description || '';
        winner = await existingWinner.save();
      } else {
        // Check if this user is already a winner for a different prize
        const userWinner = await Winner.findOne({ user: userId });
        if (userWinner) {
          // Update the existing winner record to point to the new prize
          userWinner.prize = prizeId;
          userWinner.imageUrl = imageUrl;
          userWinner.description = description || '';
          winner = await userWinner.save();
        } else {
          // Create new winner
          winner = await Winner.create({
            user: userId,
            prize: prizeId,
            imageUrl: imageUrl,
            description: description || ''
          });
        }
      }

      // Mark prize as drawn
      prize.status = 'drawn';
      await prize.save();

      // Try to find and mark a transaction as winner (optional)
      try {
        const transaction = await Transaction.findOne({
          user: userId,
          category: 'order',
          'order.prizeName': prize.name,
          'order.isPaid': true
        });
        
        if (transaction) {
          transaction.order.isWinner = true;
          transaction.order.status = 'drawnWinner';
          await transaction.save();
          
          // Update winner with transaction reference
          winner.transaction = transaction._id;
          await winner.save();
        }
      } catch (e) {
        // Ignore if no transaction found
        console.warn('[winner:assign] No transaction found for user/prize:', e.message);
      }

      // Populate user and prize for response
      await winner.populate('user', '-password -__v');
      await winner.populate('prize');

      socket.emit('winner:assign:response', { success: true, winner });
      
      // Broadcast to all clients
      io.emit('winner:assigned', { winner });
    } catch (err) {
      console.error('[winner:assign] Error:', err);
      socket.emit('winner:assign:response', { success: false, message: err.message });
    }
  });
};

