// Integrate settings.json into socket events
const fs = require('fs');
const path = require('path');
// Try to load the Ajv validator if present; otherwise use a no-op validator
let validateEmit = (schema, payload, socket) => true;
try {
  const ajvVal = require('../ajvValidator');
  if (ajvVal && typeof ajvVal.validateEmit === 'function') validateEmit = ajvVal.validateEmit;
} catch (err) {
  // ajv or ajvValidator not available in this environment — skip runtime validation
}

const settingsPath = path.resolve(__dirname, '../../', 'config', 'settings.json');

async function loadSettings() {
  const raw = await fs.promises.readFile(settingsPath, 'utf8');
  return JSON.parse(raw);
}

async function saveSettings(obj) {
  const content = JSON.stringify(obj, null, 2) + '\n';
  await fs.promises.writeFile(settingsPath, content, 'utf8');
}

module.exports = (io, socket) => {
  socket.on('settings:get', async () => {
    try {
      const settings = await loadSettings();
      socket.emit('settings:get:response', { success: true, settings });
    } catch (err) {
      socket.emit('settings:get:response', { success: false, message: err.message });
    }
  });

  socket.on('settings:update', async (payload) => {
    // Admin-only: require a JWT token (from socket.handshake.auth.token) and verify isAdmin
    try {
      // clients should send only the updates object; older clients that pass token in payload are still supported
      const schema = {
        type: 'object',
        properties: {
          updates: { type: 'object' }
        },
        required: ['updates'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      // Prefer token from socket.handshake.auth.token; fall back to payload.token for backward compatibility
      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);

      const secret = process.env.JWT_SECRET;
      if (!secret) return socket.emit('settings:update:response', { success: false, message: 'Server JWT_SECRET not configured' });

      if (!token) return socket.emit('settings:update:response', { success: false, message: 'Missing token' });

      let data;
      try {
        data = require('jsonwebtoken').verify(token, secret);
      } catch (err) {
        return socket.emit('settings:update:response', { success: false, message: 'Invalid token' });
      }

      const User = require('../../models/User');
      const user = await User.findById(data.id);
      if (!user || !user.isAdmin) return socket.emit('settings:update:response', { success: false, message: 'Unauthorized' });

      const current = await loadSettings();
      const merged = Object.assign({}, current, payload.updates || {});
      await saveSettings(merged);

      io.emit('settings:update', { success: true, settings: merged });
      socket.emit('settings:update:response', { success: true, settings: merged });
    } catch (err) {
      socket.emit('settings:update:response', { success: false, message: err.message });
    }
  });

  // convenience: set bot chance for draws (admin only)
  socket.on('settings:setBotChance', async (payload) => {
    try {
      const schema = { type: 'object', properties: { botChance: { type: 'number', minimum: 0, maximum: 1 } }, required: ['botChance'], additionalProperties: false };
      if (!validateEmit(schema, payload, socket)) return;
      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const secret = process.env.JWT_SECRET;
      if (!secret) return socket.emit('settings:setBotChance:response', { success: false, message: 'Server JWT_SECRET not configured' });
      if (!token) return socket.emit('settings:setBotChance:response', { success: false, message: 'Missing token' });
      let data;
      try { data = require('jsonwebtoken').verify(token, secret); } catch (err) { return socket.emit('settings:setBotChance:response', { success: false, message: 'Invalid token' }); }
      const User = require('../../models/User');
      const user = await User.findById(data.id);
      if (!user || !user.isAdmin) return socket.emit('settings:setBotChance:response', { success: false, message: 'Unauthorized' });

      const current = await loadSettings();
      current.draw = current.draw || {};
      current.draw.botChance = payload.botChance;
      await saveSettings(current);
      io.emit('settings:update', { success: true, settings: current });
      socket.emit('settings:setBotChance:response', { success: true, settings: current });
    } catch (err) {
      socket.emit('settings:setBotChance:response', { success: false, message: err.message });
    }
  });
};
