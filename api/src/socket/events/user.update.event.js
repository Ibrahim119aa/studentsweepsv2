const User = require('../../models/User');

module.exports = (io, socket) => {
  // payload: { userId?, updates: { name?, phone?, notifications? } }
  socket.on('user:update', async (payload) => {
    console.log('[Socket] user:update received', JSON.stringify(payload));
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          updates: { type: 'object' }
        },
        required: ['updates'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const userId = payload.userId || socket.userId;
      if (!userId) {
        console.warn('[Socket] user:update missing userId');
        return socket.emit('user:update:response', { success: false, message: 'unauthorized' });
      }

      // Ensure the socket is acting on its own user unless admin
      try {
        if (String(socket.userId || '') !== String(userId) && !socket.userIsAdmin) {
          console.warn('[Socket] user:update forbidden for user', socket.userId, 'target', userId);
          return socket.emit('user:update:response', { success: false, message: 'forbidden' });
        }
      } catch (e) { console.warn('[Socket] user:update admin check error', e); }

      const updates = payload.updates || {};
      const set = {};
      // Support both 'name' and 'fullName' field names
      if (typeof updates.fullName === 'string') set.fullName = updates.fullName;
      if (typeof updates.name === 'string') set.fullName = updates.name;
      if (typeof updates.phone === 'string') set.phoneNumber = updates.phone;
      if (typeof updates.phoneNumber === 'string') set.phoneNumber = updates.phoneNumber;
      if (typeof updates.profileImage === 'string') set.profileImage = updates.profileImage;

      // Handle billing address
      if (updates.billingAddress && typeof updates.billingAddress === 'object') {
        const addr = updates.billingAddress;
        if (typeof addr.street === 'string') set['billingAddress.street'] = addr.street;
        if (typeof addr.city === 'string') set['billingAddress.city'] = addr.city;
        if (typeof addr.state === 'string') set['billingAddress.state'] = addr.state;
        if (typeof addr.postalCode === 'string') set['billingAddress.postalCode'] = addr.postalCode;
        if (typeof addr.country === 'string') set['billingAddress.country'] = addr.country;
      }

      // Support both 'settings' and 'notifications' objects
      if (updates.settings && typeof updates.settings === 'object') {
        if (typeof updates.settings.prizeAlert !== 'undefined') set['settings.prizeAlert'] = !!updates.settings.prizeAlert;
        if (typeof updates.settings.drawResults !== 'undefined') set['settings.drawResults'] = !!updates.settings.drawResults;
        if (typeof updates.settings.newsLetter !== 'undefined') set['settings.newsLetter'] = !!updates.settings.newsLetter;
      }
      if (updates.notifications && typeof updates.notifications === 'object') {
        if (typeof updates.notifications.newPrizes !== 'undefined') set['settings.prizeAlert'] = !!updates.notifications.newPrizes;
        if (typeof updates.notifications.drawResults !== 'undefined') set['settings.drawResults'] = !!updates.notifications.drawResults;
        if (typeof updates.notifications.newsletter !== 'undefined') set['settings.newsLetter'] = !!updates.notifications.newsletter;
      }

      if (Object.keys(set).length === 0) {
        console.warn('[Socket] user:update no changes', set);
        return socket.emit('user:update:response', { success: false, message: 'no changes' });
      }

      console.log('[Socket] user:update applying set:', set);
      const updated = await User.findOneAndUpdate({ _id: userId }, { $set: set }, { new: true }).lean();
      if (!updated) {
        console.warn('[Socket] user:update user not found', userId);
        return socket.emit('user:update:response', { success: false, message: 'user not found' });
      }

      // sanitize
      const userObj = { ...updated };
      if (userObj) {
        delete userObj.password;
        delete userObj.__v;
        // Ensure billingAddress and phoneNumber are present in the response
        if (!userObj.billingAddress) {
          userObj.billingAddress = {
            street: updated['billingAddress']?.street || '',
            city: updated['billingAddress']?.city || '',
            state: updated['billingAddress']?.state || '',
            postalCode: updated['billingAddress']?.postalCode || '',
            country: updated['billingAddress']?.country || ''
          };
        }
        if (!userObj.phoneNumber && updated.phoneNumber) {
          userObj.phoneNumber = updated.phoneNumber;
        }
      }

      // Emit back to requester and broadcast to user's room for realtime update
      try {
        socket.emit('user:update:response', { success: true, user: userObj });
        console.log('[Socket] user:update:response sent', userObj);
      } catch (e) { console.warn('[Socket] emit response error', e); }
      try {
        if (io && userObj && userObj._id) io.to(`user:${String(userObj._id)}`).emit('user:updated', userObj);
      } catch (e) { console.warn('[Socket] broadcast error', e); }
    } catch (err) {
      console.warn('[Socket] user:update error', err);
      socket.emit('user:update:response', { success: false, message: err.message });
    }
  });
};
