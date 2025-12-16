module.exports = (io, socket) => {
  // message:notify and stats:update are server-emit events; add small handlers / acks
  socket.on('message:notify', (payload) => {
    // server usually emits this; echo ack for clients that send it by mistake
    socket.emit('message:notify:ack', { received: true });
  });

  socket.on('stats:update', (payload) => {
    // server-emit: broadcast updated stats to all clients
    io.emit('stats:update', payload || {});
  });
};
