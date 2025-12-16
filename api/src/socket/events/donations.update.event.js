const Donation = require('../../models/Donation');
const { verifyToken } = require('../../utils/jwt');
const User = require('../../models/User');

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
  socket.on('donations:update', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          update: { type: 'object' }
        },
        required: ['id', 'update'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const { id, update } = payload || {};
      const admin = await isAdminFromToken(token);
      if (!admin) return socket.emit('donations:update:response', { success: false, message: 'admin required' });
      if (!id) return socket.emit('donations:update:response', { success: false, message: 'id required' });

      // Transform the form data to match the Donation model structure
      const updateData = {};
      if (update.title || update.name) {
        updateData.name = update.title || update.name;
      }
      if (update.short || update.shortDescription !== undefined) {
        updateData.shortDescription = update.short || update.shortDescription;
      }
      if (update.image !== undefined || update.imageUrl !== undefined) {
        updateData.image = update.image || update.imageUrl || '';
      }
      if (update.goal !== undefined) {
        updateData.goal = update.goal;
      }
      if (update.raised !== undefined) {
        updateData.raised = update.raised;
      }
      if (update.detail || update.content) {
        updateData.content = update.detail ? [{
          key: 'description',
          value: [{
            description: update.detail
          }]
        }] : update.content;
      }

      const donation = await Donation.findByIdAndUpdate(id, updateData, { new: true }).lean();
      if (!donation) return socket.emit('donations:update:response', { success: false, message: 'donation not found' });

      io.emit('donations:update', { success: true, donation });
      socket.emit('donations:update:response', { success: true, donation });
    } catch (err) {
      socket.emit('donations:update:response', { success: false, message: err.message });
    }
  });
};









