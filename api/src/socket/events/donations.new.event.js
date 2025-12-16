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
  socket.on('donations:new', async (payload) => {
    try {
      const { validateEmit } = require('../ajvValidator');
      const schema = {
        type: 'object',
        properties: {
          donation: { type: 'object' }
        },
        required: ['donation'],
        additionalProperties: false
      };
      if (!validateEmit(schema, payload, socket)) return;

      // Prefer token from handshake auth for authenticated sockets; fallback to payload.token for older clients
      const handshakeAuth = (socket.handshake && socket.handshake.auth) ? socket.handshake.auth : {};
      const token = handshakeAuth.token || (payload && payload.token);
      const { donation } = payload || {};
      const admin = await isAdminFromToken(token);
      if (!admin) return socket.emit('donations:new:response', { success: false, message: 'admin required' });

      // Transform the form data to match the Donation model structure
      const donationData = {
        name: donation.title || donation.name,
        shortDescription: donation.short || donation.shortDescription,
        image: donation.image || donation.imageUrl || '',
        goal: donation.goal || 0,
        raised: donation.raised || 0,
        content: donation.detail ? [{
          key: 'description',
          value: [{
            description: donation.detail
          }]
        }] : donation.content || []
      };

      const created = await Donation.create(donationData);
      io.emit('donations:new', { success: true, donation: created });
      socket.emit('donations:new:response', { success: true, donation: created });
    } catch (err) {
      socket.emit('donations:new:response', { success: false, message: err.message });
    }
  });
};









