const User = require('../../models/User');
const { signToken } = require('../../utils/jwt');

module.exports = (io, socket) => {
  // Expecting { fullName, emailAddress, password }
  const { validateEmit } = require('../ajvValidator');

  socket.on('auth:signup', async (payload) => {
    try {
      const schema = {
        type: 'object',
        properties: {
          fullName: { type: 'string' },
          emailAddress: { type: 'string', format: 'email' },
          password: { type: 'string' }
        },
        required: ['fullName', 'emailAddress', 'password'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const { fullName, emailAddress, password } = payload || {};

      const exists = await User.findOne({ emailAddress });
      if (exists) return socket.emit('error', { message: 'email already taken' });

      const user = await User.create({ fullName, emailAddress, password });
      const token = signToken({ id: user._id });

      // Convert to plain object and return the literal user schema (strip sensitive/internal fields)
      let userObj = (typeof user.toObject === 'function') ? user.toObject({ getters: true }) : JSON.parse(JSON.stringify(user));
      if (userObj && typeof userObj === 'object') {
        delete userObj.password;
        delete userObj.__v;
      }

      // Mark socket as belonging to this user and join a user-specific room for realtime updates
      try {
        socket.userId = (user && user._id) ? user._id.toString() : (userObj && userObj._id) ? String(userObj._id) : null;
        if (socket.userId) socket.join(`user:${socket.userId}`);
      } catch (e) {
        // ignore join failures
      }

      socket.emit('auth:signup:success', { message: 'Account created successfully.' });
      // Also return token and full user schema to the client for convenience
      socket.emit('auth:login:success', { token, user: userObj });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });
};
