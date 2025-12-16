const Prize = require('../../models/Prize');

module.exports = (io, socket) => {
  socket.on('prizes:get', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          prizeId: { type: 'string' },
          id: { type: 'string' }
        },
        anyOf: [ { required: ['prizeId'] }, { required: ['id'] } ],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const prizeId = (payload && (payload.prizeId || payload.id));
      const prize = await Prize.findById(prizeId).lean();
      if (!prize) return socket.emit('prizes:get:response', { success: false, message: 'prize not found' });

      socket.emit('prizes:get:response', { success: true, prize });
    } catch (err) {
      socket.emit('prizes:get:response', { success: false, message: err.message });
    }
  });
};
