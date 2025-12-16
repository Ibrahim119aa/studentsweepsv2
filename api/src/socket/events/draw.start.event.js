const Prize = require('../../models/Prize');
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

// pick a random winner from transactions for this prize
async function pickWinnerForPrize(prize) {
  if (!prize) return null;
  // find paid order transactions for this prize
  const trx = await Transaction.find({ category: 'order', 'order.prizeName': prize.name, 'order.isPaid': true }).populate('order.user').lean();
  if (!trx || trx.length === 0) return null;

  // pick a random transaction
  const winnerTrx = trx[Math.floor(Math.random() * trx.length)];
  return winnerTrx;
}

module.exports = (io, socket) => {
  socket.on('draw:start', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          prizeId: { type: 'string' }
        },
        required: ['prizeId'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const { prizeId } = payload || {};
      const admin = await isAdminFromToken(token);
      if (!admin) return socket.emit('draw:start:response', { success: false, message: 'admin required' });
      if (!prizeId) return socket.emit('draw:start:response', { success: false, message: 'prizeId required' });

      const prize = await Prize.findById(prizeId);
      if (!prize) return socket.emit('draw:start:response', { success: false, message: 'prize not found' });

      // mark prize drawn
      prize.status = 'drawn';
      await prize.save();

      const winner = await pickWinnerForPrize(prize);
      if (!winner) {
        io.emit('draw:result', { success: false, message: 'no eligible entries', prize: prizeId });
        return socket.emit('draw:start:response', { success: true, message: 'draw completed, no winners', prize: prizeId });
      }

      // mark transaction/user as winner (template)
      try {
        await Transaction.findByIdAndUpdate(winner._id, { $set: { 'order.isWinner': true, 'order.status': 'drawnWinner' } });
      } catch (e) {
        // ignore
      }

      io.emit('draw:result', { success: true, prize: prizeId, winner });
      socket.emit('draw:start:response', { success: true, prize: prizeId, winner });
    } catch (err) {
      socket.emit('draw:start:response', { success: false, message: err.message });
    }
  });
};
