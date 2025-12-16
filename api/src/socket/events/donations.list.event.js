const Donation = require('../../models/Donation');

module.exports = (io, socket) => {
  socket.on('donations:list', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = { type: 'object', additionalProperties: false };
      if (payload && !validateEmit(schema, payload, socket)) return;

      const donations = await Donation.find({}).sort({ createdAt: -1 }).lean();
      socket.emit('donations:list:response', { success: true, donations });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });
};