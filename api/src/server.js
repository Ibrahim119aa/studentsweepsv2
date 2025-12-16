require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const { autoLoadModels } = require('./loaders/autoloader');
const { initSocket } = require('./loaders/socket');

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
// Socket.IO Path Configuration:
// - If using reverse proxy (nginx/apache) that routes /api/* to this server:
//   Use path: '/socket.io' (default) - reverse proxy will make it /api/socket.io
// - If Node.js server is directly accessible at /api:
//   Use path: '/api/socket.io'
// Set SOCKET_IO_PATH env var to override (e.g., SOCKET_IO_PATH=/socket.io)
//
// To test the socket connection:
//   npm run test:socket
//   Or: node test-socket-connection.js https://studentsweeps.com/api
const io = new Server(server, {
  path: process.env.SOCKET_IO_PATH || '/socket.io', // Default: '/socket.io' (for reverse proxy setup)
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true, // Allow Engine.IO v3 clients for backward compatibility
  pingTimeout: 60000,
  pingInterval: 25000
});

// Handle connection-level errors (before socket is created)
io.on('connection_error', (err) => {
  const logger = require('./utils/logger');
  logger.error('socket.connection_error', {
    message: err.message,
    req: err.req ? {
      headers: err.req.headers,
      url: err.req.url
    } : null,
    context: err.context || null
  });
  console.error('[Socket.IO] Connection error:', err.message);
});

(async () => {
  await connectDB();
  autoLoadModels();
  initSocket(io);
  // expose io to modules that need to emit outside of socket handlers (eg: webhooks)
  try {
    const eventBus = require('./utils/eventBus');
    eventBus.setIO(io);
    // Start DB change streams after io is set so the loader can broadcast to rooms
    try {
      const { startChangeStreams } = require('./loaders/changeStreams');
      startChangeStreams();
    } catch (err) {
      console.warn('Change streams loader not started:', err && err.message ? err.message : err);
    }
  } catch (e) {
    console.warn('Failed to set eventBus io:', e.message);
  }

  // start automatic draw scheduler (checks prizes with drawTimestamp)
  try {
    const { start: startDrawScheduler } = require('./loaders/drawScheduler');
    startDrawScheduler(io);
  } catch (e) {
    console.warn('Draw scheduler not started:', e.message);
  }

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
})();
