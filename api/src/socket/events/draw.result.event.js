module.exports = (io, socket) => {
  // draw:result is primarily emitted by the server when a draw completes.
  // Include a handler so clients can optionally request the latest result broadcast.
  socket.on('draw:result', (payload) => {
    // no-op: server will broadcast draw results. This handler keeps the event available.
    // Optionally we could re-emit the payload back to the requester.
    socket.emit('draw:result:ack', { received: true });
  });
};
