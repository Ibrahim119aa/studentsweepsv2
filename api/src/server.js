require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const { autoLoadModels } = require('./loaders/autoloader');
const { initSocket } = require('./loaders/socket');

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

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
