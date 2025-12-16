const PaymentOption = require('../../models/PaymentOption');
const User = require('../../models/User');
const { verifyToken } = require('../../utils/jwt');

async function isAdminFromToken(token) {
  if (!token) return false;
  try {
    const data = verifyToken(token);
    if (!data || !data.id) return false;
    const user = await User.findById(data.id).lean();
    return !!user && user.isAdmin === true;
  } catch (err) {
    return false;
  }
}

module.exports = (io, socket) => {
  // list all payment options
  socket.on('paymentOptions:list', async () => {
    try {
      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || null;
      const admin = await isAdminFromToken(token);
      const list = await PaymentOption.find().lean();
      const processed = list.map(item => {
        // If requester is admin, decrypt credentials; otherwise mask values
        if (admin && item && Array.isArray(item.credentials)) {
          const ss = require('../../utils/secretStore');
          item.credentials = item.credentials.map(c => ({ key: c.key, value: ss.decrypt(c.value) }));
        } else if (item && Array.isArray(item.credentials)) {
          item.credentials = item.credentials.map(c => ({ key: c.key, value: c.value ? '*****' : c.value }));
        }
        return item;
      });
      socket.emit('paymentOptions:list:response', { success: true, paymentOptions: processed });
    } catch (err) {
      socket.emit('paymentOptions:list:response', { success: false, message: err.message });
    }
  });

  // get one
  socket.on('paymentOptions:get', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false };
      if (!validateEmit(schema, payload, socket)) return;

      const { id } = payload || {};
      const item = await PaymentOption.findById(id).lean();
      if (!item) return socket.emit('paymentOptions:get:response', { success: false, message: 'not found' });
      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || null;
      const admin = await isAdminFromToken(token);
      if (admin && item && Array.isArray(item.credentials)) {
        const ss = require('../../utils/secretStore');
        item.credentials = item.credentials.map(c => ({ key: c.key, value: ss.decrypt(c.value) }));
      } else if (item && Array.isArray(item.credentials)) {
        item.credentials = item.credentials.map(c => ({ key: c.key, value: c.value ? '*****' : c.value }));
      }
      socket.emit('paymentOptions:get:response', { success: true, paymentOption: item });
    } catch (err) {
      socket.emit('paymentOptions:get:response', { success: false, message: err.message });
    }
  });

  // create (admin only)
  socket.on('paymentOptions:new', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          providerName: { type: 'string' },
          enabled: { type: 'boolean' },
          credentials: { type: 'array' }
        },
        required: ['providerName'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const admin = await isAdminFromToken(token);
      if (!admin) return socket.emit('paymentOptions:new:response', { success: false, message: 'admin required' });

  const { providerName, enabled = false, credentials = [] } = payload || {};
  // credentials will be encrypted by model pre-save hook
  const created = await PaymentOption.create({ providerName, enabled, credentials });
      io.emit('paymentOptions:new', { success: true, paymentOption: created });
      socket.emit('paymentOptions:new:response', { success: true, paymentOption: created });
    } catch (err) {
      socket.emit('paymentOptions:new:response', { success: false, message: err.message });
    }
  });

  // update (admin only)
  socket.on('paymentOptions:update', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = { type: 'object', properties: { id: { type: 'string' }, update: { type: 'object' } }, required: ['id', 'update'], additionalProperties: false };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const admin = await isAdminFromToken(token);
      if (!admin) return socket.emit('paymentOptions:update:response', { success: false, message: 'admin required' });

      const { id, update } = payload || {};
      // if update contains credentials, they will be encrypted by pre-save on save. Use findById then set then save to trigger hook.
      let updated = null;
      if (update && update.credentials) {
        const doc = await PaymentOption.findById(id);
        if (!doc) return socket.emit('paymentOptions:update:response', { success: false, message: 'not found' });
        doc.set(update);
        await doc.save();
        updated = doc.toObject();
      } else {
        updated = await PaymentOption.findByIdAndUpdate(id, update || {}, { new: true }).lean();
      }
      if (!updated) return socket.emit('paymentOptions:update:response', { success: false, message: 'not found' });
      io.emit('paymentOptions:update', { success: true, paymentOption: updated });
      socket.emit('paymentOptions:update:response', { success: true, paymentOption: updated });
    } catch (err) {
      socket.emit('paymentOptions:update:response', { success: false, message: err.message });
    }
  });

  // enable/disable (admin only)
  socket.on('paymentOptions:setEnabled', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['id', 'enabled'], additionalProperties: false };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const admin = await isAdminFromToken(token);
      if (!admin) return socket.emit('paymentOptions:setEnabled:response', { success: false, message: 'admin required' });

  const { id, enabled } = payload || {};
  const updated = await PaymentOption.findByIdAndUpdate(id, { enabled }, { new: true }).lean();
      if (!updated) return socket.emit('paymentOptions:setEnabled:response', { success: false, message: 'not found' });
      io.emit('paymentOptions:enabledChanged', { success: true, paymentOption: updated });
      socket.emit('paymentOptions:setEnabled:response', { success: true, paymentOption: updated });
    } catch (err) {
      socket.emit('paymentOptions:setEnabled:response', { success: false, message: err.message });
    }
  });

  // delete (admin only)
  socket.on('paymentOptions:delete', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const admin = await isAdminFromToken(token);
      if (!admin) return socket.emit('paymentOptions:delete:response', { success: false, message: 'admin required' });

  const { id } = payload || {};
  const removed = await PaymentOption.findByIdAndRemove(id).lean();
      if (!removed) return socket.emit('paymentOptions:delete:response', { success: false, message: 'not found' });
      io.emit('paymentOptions:deleted', { success: true, id });
      socket.emit('paymentOptions:delete:response', { success: true, id });
    } catch (err) {
      socket.emit('paymentOptions:delete:response', { success: false, message: err.message });
    }
  });
};
