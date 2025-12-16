require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { autoLoadRoutes } = require('./loaders/autoloader');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Diagnostic endpoint for socket.io debugging
app.get('/api/socket-debug', (req, res) => {
  try {
    const eventBus = require('./utils/eventBus');
    const io = eventBus.getIO();
    
    if (!io) {
      return res.json({ 
        status: 'error', 
        message: 'Socket.IO not initialized' 
      });
    }
    
    const sockets = [];
    io.sockets.sockets.forEach((socket) => {
      sockets.push({
        id: socket.id,
        connected: socket.connected,
        userId: socket.userId || null
      });
    });
    
    res.json({
      status: 'ok',
      socketIO: {
        path: io._path || '/socket.io',
        connected: io.engine?.clientsCount || 0,
        sockets: sockets
      },
      server: {
        nodeVersion: process.version,
        uptime: process.uptime()
      }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
      stack: err.stack
    });
  }
});

// Endpoint to check server logs for recent connection errors
app.get('/api/socket-errors', (req, res) => {
  // This is a placeholder - in production, you'd want to use a proper logging system
  // For now, we'll just return a message indicating where to check logs
  res.json({
    message: 'Check server console logs for Socket.IO connection errors',
    note: 'Look for lines starting with [Socket.IO] in your server logs',
    recentErrors: 'Server-side error logging is configured. Check your server console output.'
  });
});

// Load routes automatically
autoLoadRoutes(app);

module.exports = app;
