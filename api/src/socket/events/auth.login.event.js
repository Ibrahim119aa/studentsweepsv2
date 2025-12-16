const User = require('../../models/User');
const { signToken } = require('../../utils/jwt');

function safeCompare(user, password) {
  // If model has comparePassword use it (backend/User), otherwise fallback to plain compare
  if (!user) return false;
  if (typeof user.comparePassword === 'function') return user.comparePassword(password);
  return Promise.resolve(user.password === password);
}

module.exports = (io, socket) => {
  // Accept only { emailAddress, password }
  const { validateEmit } = require('../ajvValidator');

  socket.on('auth:login', async (payload) => {
    try {
      const schema = {
        type: 'object',
        properties: {
          emailAddress: { type: 'string' },
          password: { type: 'string' }
        },
        required: ['emailAddress', 'password'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const { emailAddress, password } = payload || {};

      // Lookup by email only
      const user = await User.findOne({ emailAddress });
      if (!user) return socket.emit('error', { message: 'invalid credentials' });

      const ok = await safeCompare(user, password);
      if (!ok) return socket.emit('error', { message: 'invalid credentials' });

      const token = signToken({ id: user._id });

      // Return the literal user schema (plain object) but strip sensitive/internal fields
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

      socket.emit('auth:login:success', { token, user: userObj });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });
};
