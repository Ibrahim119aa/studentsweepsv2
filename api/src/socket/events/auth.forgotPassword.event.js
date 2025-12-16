module.exports = (io, socket) => {
  const { validateEmit } = require('../ajvValidator');

  socket.on('auth:forgotPassword', async (payload) => {
    try {
      const schema = { type: 'object', properties: { email: { type: 'string', format: 'email' } }, required: ['email'], additionalProperties: false };
      if (!validateEmit(schema, payload, socket)) return;

      const { email } = payload || {};

      // Template: no mailer configured. In a real app we'd generate a token and send an email.
      console.log(`Password reset requested for: ${email}`);

      socket.emit('auth:forgotPassword:response', { success: true, message: 'If that email exists, a reset link would be sent.' });
    } catch (err) {
      socket.emit('auth:forgotPassword:response', { success: false, message: err.message });
    }
  });
};
