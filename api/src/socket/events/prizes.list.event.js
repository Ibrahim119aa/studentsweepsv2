const Prize = require('../../models/Prize');

module.exports = (io, socket) => {
  socket.on('prizes:list', async (payload) => {
    try {
      // Accept empty payload or {} -- validate that it's an object if provided
      const { validateEmit } = require('../ajvValidator');
      const schema = { type: 'object', additionalProperties: false };
      if (payload && !validateEmit(schema, payload, socket)) return;

      // Return all prizes (both active and drawn) so Draw Management can show both sections
      const prizes = await Prize.find({}).sort({ createdAt: -1 }).lean();
      socket.emit('prizes:list:response', { success: true, prizes });
    } catch (err) {
      socket.emit('prizes:list:response', { success: false, message: err.message });
    }
  });
};
