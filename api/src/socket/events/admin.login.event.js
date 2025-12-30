const User = require('../../models/User');
const { signToken } = require('../../utils/jwt');

module.exports = (io, socket) => {
  const { validateEmit } = require('../ajvValidator');

  socket.on('admin:login', async (payload) => {
    try {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        },
        required: ['email', 'password'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const { email, password } = payload || {};
      // Ensure email is lowercase for lookup (User model stores emails in lowercase)
      const lookup = { emailAddress: email ? email.toLowerCase().trim() : null };
      if (!lookup.emailAddress) {
        return socket.emit('admin:login:response', { success: false, message: 'Email is required' });
      }
      console.log("this is admis");
      let u=await User.find({});
      console.log(u);
      const user = await User.findOne(lookup);
      if (!user) return socket.emit('admin:login:response', { success: false, message: 'invalid credentials' });

      // const ok = await user.comparePassword(password);
      // if (!ok) return socket.emit('admin:login:response', { success: false, message: 'invalid credentials' });

      // if (!user.isAdmin) return socket.emit('admin:login:response', { success: false, message: 'not an admin' });

  const token = signToken({ id: user._id });
  // Convert to plain object and strip sensitive/internal fields
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

  socket.emit('admin:login:response', { success: true, user: userObj, token });
    } catch (err) {
      socket.emit('admin:login:response', { success: false, message: err.message });
    }
  });
};