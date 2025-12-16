
console.log('[user.changePassword.event.js] Loaded');
const User = require('../../models/User');

module.exports = (io, socket) => {
  // payload: { userId, currentPassword, newPassword }
  socket.on('user:changePassword', async (payload, callback) => {
    console.log('[user.changePassword.event.js] user:changePassword event received', payload);
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          currentPassword: { type: 'string' },
          newPassword: { type: 'string' }
        },
        required: ['userId', 'currentPassword', 'newPassword'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) {
        console.log('[user.changePassword.event.js] Invalid payload', payload);
        return callback && callback({ success: false, message: 'Invalid payload' });
      }

      const { userId, currentPassword, newPassword } = payload;
      if (!userId) {
        console.log('[user.changePassword.event.js] Unauthorized');
        return callback && callback({ success: false, message: 'Unauthorized' });
      }

      // Only allow user to change their own password unless admin
      if (String(socket.userId || '') !== String(userId) && !socket.userIsAdmin) {
        console.log('[user.changePassword.event.js] Forbidden');
        return callback && callback({ success: false, message: 'Forbidden' });
      }

      const user = await User.findById(userId);
      if (!user) {
        console.log('[user.changePassword.event.js] User not found');
        return callback && callback({ success: false, message: 'User not found' });
      }

      // Check current password
      const ok = await user.comparePassword(currentPassword);
      if (!ok) {
        console.log('[user.changePassword.event.js] Current password is incorrect');
        return callback && callback({ success: false, message: 'Current password is incorrect' });
      }

      // Set new password and save
      user.password = newPassword;
      await user.save();
      console.log('[user.changePassword.event.js] Password updated for user', userId);

      // Optionally, emit a user update event
      const userObj = user.toObject();
      delete userObj.password;
      delete userObj.__v;
      try { socket.emit('user:update:response', { success: true, user: userObj }); } catch (e) {}
      try { if (io && userObj && userObj._id) io.to(`user:${String(userObj._id)}`).emit('user:updated', userObj); } catch (e) {}

      return callback && callback({ success: true });
    } catch (err) {
      return callback && callback({ success: false, message: err.message });
    }
  });
};
console.log('user.changePassword.event.js loaded');
