const { autoLoadSocketEvents } = require('./autoloader');

// Require logger at module level to avoid issues during connection
let logger;
try {
  logger = require('../utils/logger');
} catch (e) {
  console.warn('[Socket.IO] Logger not available, using console only');
  logger = {
    info: () => {},
    error: () => {},
    warn: () => {}
  };
}

function initSocket(io) {
  io.on('connection', (socket) => {
    // Wrap entire connection handler in try-catch to prevent unhandled errors
    try {
      try {
        logger.info('socket.connection', { socketId: socket.id });
      } catch (e) {
        // Logger error shouldn't break connection
      }
      console.log(`[Socket.IO] New connection: ${socket.id}`);
      
      // Handle socket-level errors
      socket.on('error', (err) => {
        try {
          logger.error('socket.error', {
            socketId: socket.id,
            message: err.message,
            stack: err.stack
          });
        } catch (e) {
          // Logger error shouldn't break error handling
        }
        console.error(`[Socket.IO] Socket error for ${socket.id}:`, err.message);
        if (err.stack) {
          console.error(`[Socket.IO] Error stack:`, err.stack);
        }
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
      console.log(`[Socket.IO] Loading events for ${socket.id}...`);
      autoLoadSocketEvents(io, socket);
      console.log(`✅ Successfully loaded all socket events for ${socket.id}`);
    } catch (err) {
      try {
        logger.error('socket.events.load.failed', {
          socketId: socket.id,
          message: err.message,
          stack: err.stack
        });
      } catch (e) {
        // Logger error shouldn't break error handling
      }
      console.error(`[Socket.IO] Failed to load events for ${socket.id}:`, err.message);
      console.error(`[Socket.IO] Error stack:`, err.stack);
      // Don't emit error to client - just log it and allow connection to continue
      // Some events may have loaded successfully
      // Connection should still work even if some events fail to load
    }
    
    // Ensure connection is marked as successful even if some events failed
    console.log(`[Socket.IO] Connection setup complete for ${socket.id}`);
    
    // Explicitly acknowledge connection is ready
    // This helps ensure the connection is established even if there were errors
    try {
      // Send a test message to confirm connection is working
      socket.emit('connection:ready', { socketId: socket.id, timestamp: new Date().toISOString() });
    } catch (e) {
      console.warn(`[Socket.IO] Could not send connection:ready for ${socket.id}:`, e.message);
    }

      socket.on('disconnect', () => {
        try {
          logger.info('socket.disconnected', { socketId: socket.id });
        } catch (e) {
          // Logger error shouldn't break disconnect handler
        }
        console.log(`[Socket.IO] Disconnected: ${socket.id}`);
      });
    } catch (err) {
      // Catch any unhandled errors during connection setup
      logger.error('socket.connection.setup.error', {
        socketId: socket.id,
        message: err.message,
        stack: err.stack
      });
      console.error(`[Socket.IO] Fatal error during connection setup for ${socket.id}:`, err.message);
      console.error(`[Socket.IO] Error stack:`, err.stack);
      
      // Try to emit error to client before disconnecting
      try {
        socket.emit('error', { 
          message: 'Server error during connection setup',
          code: 'CONNECTION_SETUP_ERROR'
        });
      } catch (e) {
        // Ignore if we can't emit
      }
      
      // Disconnect the socket
      try {
        socket.disconnect(true);
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  });
}

module.exports = { initSocket };
