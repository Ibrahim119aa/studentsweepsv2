const { autoLoadSocketEvents } = require('./autoloader');

function initSocket(io) {
  io.on('connection', (socket) => {
    const logger = require('../utils/logger');
    logger.info('socket.connection', { socketId: socket.id });
    
    // Handle socket-level errors
    socket.on('error', (err) => {
      logger.error('socket.error', {
        socketId: socket.id,
        message: err.message,
        stack: err.stack
      });
      console.error(`[Socket.IO] Socket error for ${socket.id}:`, err.message);
    });
    
    // Instrument socket and io to log incoming events and outgoing emits.
    try {
      // wrap socket.on to log incoming events and payloads
      const originalOn = socket.on.bind(socket);
      socket.on = function (event, handler) {
        if (typeof handler === 'function') {
          const wrapped = function (...args) {
            try { logger.info('socket.event.received', { socketId: socket.id, event, payload: args }); } catch (e) {}
            try { return handler.apply(this, args); } catch (err) { try { logger.error('socket.handler.error', { socketId: socket.id, event, message: err && err.message }); } catch (e) {} throw err; }
          };
          return originalOn(event, wrapped);
        }
        return originalOn(event, handler);
      };

      // wrap socket.emit to log outgoing emits from this socket
      const originalSocketEmit = socket.emit.bind(socket);
      socket.emit = function (event, ...args) {
        try { logger.info('socket.emit', { socketId: socket.id, event, payload: args }); } catch (e) {}
        return originalSocketEmit(event, ...args);
      };

      // wrap socket.broadcast.emit if available
      try {
        if (socket.broadcast && typeof socket.broadcast.emit === 'function') {
          const origBroadcastEmit = socket.broadcast.emit.bind(socket.broadcast);
          socket.broadcast.emit = function (event, ...args) {
            try { logger.info('socket.broadcast.emit', { socketId: socket.id, event, payload: args }); } catch (e) {}
            return origBroadcastEmit(event, ...args);
          };
        }
      } catch (e) {}

      // wrap socket.to(room).emit by intercepting socket.to and wrapping the returned operator's emit
      try {
        if (typeof socket.to === 'function') {
          const origTo = socket.to.bind(socket);
          socket.to = function (room) {
            const operator = origTo(room);
            try {
              if (operator && typeof operator.emit === 'function') {
                const origOpEmit = operator.emit.bind(operator);
                operator.emit = function (event, ...args) {
                  try { logger.info('socket.to.emit', { socketId: socket.id, room, event, payload: args }); } catch (e) {}
                  return origOpEmit(event, ...args);
                };
              }
            } catch (e) {}
            return operator;
          };
        }
      } catch (e) {}

      // wrap io.emit to log server-wide emits
      try {
        if (io && typeof io.emit === 'function') {
          const origIoEmit = io.emit.bind(io);
          io.emit = function (event, ...args) {
            try { logger.info('io.emit', { event, payload: args }); } catch (e) {}
            return origIoEmit(event, ...args);
          };
        }
      } catch (e) {}
    } catch (e) {
      // non-fatal instrumentation errors should not stop socket loading
      try { logger.warn('socket.instrumentation.failed', { socketId: socket.id, message: e.message }); } catch (e) {}
    }

    // Load socket event handlers - wrap in try-catch to prevent connection failures
    try {
      autoLoadSocketEvents(io, socket);
    } catch (err) {
      logger.error('socket.events.load.failed', {
        socketId: socket.id,
        message: err.message,
        stack: err.stack
      });
      console.error(`[Socket.IO] Failed to load events for ${socket.id}:`, err.message);
      // Still allow connection, but socket won't have event handlers
      socket.emit('error', { message: 'Failed to initialize socket handlers' });
    }

    socket.on('disconnect', () => {
      const logger = require('../utils/logger');
      logger.info('socket.disconnected', { socketId: socket.id });
    });
  });
}

module.exports = { initSocket };
