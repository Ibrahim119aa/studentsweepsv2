const jwt = require('jsonwebtoken');

module.exports = (io, socket) => {
  const { validateEmit } = require('../ajvValidator');
  const User = require('../../models/User');

  socket.on('auth:status', async (payload) => {
    try {
      // token may come from socket.handshake.auth.token or from the payload (back-compat)
      const schema = { type: 'object', properties: { token: { type: 'string' } }, additionalProperties: false };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      if (!token) return socket.emit('auth:status:response', { success: true, valid: false });

      try {
        const secret = process.env.JWT_SECRET;
        const data = jwt.verify(token, secret);

        // Lookup user and, if found, join the user-specific room so this socket receives realtime updates
        let userObj = null;
        try {
          const user = await User.findById(data && data.id ? data.id : data && data._id ? data._id : null);
          if (user) {
            userObj = (typeof user.toObject === 'function') ? user.toObject({ getters: true }) : JSON.parse(JSON.stringify(user));
            if (userObj && typeof userObj === 'object') {
              delete userObj.password;
              delete userObj.__v;
            }
            try {
              socket.userId = (user && user._id) ? user._id.toString() : (userObj && userObj._id) ? String(userObj._id) : null;
              if (socket.userId) socket.join(`user:${socket.userId}`);
            } catch (e) {
              // ignore join failures
            }
          }
        } catch (e) {
          // swallow DB lookup errors and continue
        }

        socket.emit('auth:status:response', { success: true, valid: true, data: data, user: userObj });
      } catch (err) {
        socket.emit('auth:status:response', { success: true, valid: false });
      }
    } catch (err) {
      socket.emit('auth:status:response', { success: false, valid: false, message: err.message });
    }
  });
};
