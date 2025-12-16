module.exports = (io, socket) => {
  socket.on('newsletter:subscribe', (payload) => {
    const { email } = payload || {};
    if (!email) return socket.emit('error', { message: 'email required' });
    // In a real app we'd persist this and send a confirmation; here we acknowledge
    socket.emit('newsletter:subscribe:response', { success: true, email });
  });
};
