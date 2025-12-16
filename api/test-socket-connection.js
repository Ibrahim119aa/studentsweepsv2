/**
 * Test script for Socket.IO connection
 * Tests connection to https://studentsweeps.com/api/socket.io
 * 
 * Usage:
 *   node test-socket-connection.js
 *   node test-socket-connection.js https://studentsweeps.com/api
 */

const { io } = require('socket.io-client');

const SOCKET_URL = process.argv[2] || 'https://studentsweeps.com/api';
const SOCKET_PATH = '/api/socket.io';

console.log('🧪 Testing Socket.IO Connection');
console.log('================================');
console.log(`URL: ${SOCKET_URL}`);
console.log(`Path: ${SOCKET_PATH}`);
console.log('');

// Create socket connection
const socket = io(SOCKET_URL, {
  path: SOCKET_PATH,
  transports: ['polling', 'websocket'],
  reconnection: false, // Don't auto-reconnect for testing
  timeout: 10000
});

// Connection events
socket.on('connect', () => {
  console.log('✅ SUCCESS: Connected to server!');
  console.log(`   Socket ID: ${socket.id}`);
  console.log(`   Transport: ${socket.io.engine.transport.name}`);
  console.log('');
  
  // Test emitting a simple event
  console.log('📤 Testing emit: auth:status');
  socket.emit('auth:status', { token: null }, (response) => {
    if (response) {
      console.log('✅ Response received:', response);
    }
  });
  
  // Disconnect after 2 seconds
  setTimeout(() => {
    console.log('');
    console.log('🔌 Disconnecting...');
    socket.disconnect();
    process.exit(0);
  }, 2000);
});

socket.on('connect_error', (error) => {
  console.error('❌ CONNECTION ERROR:', error.message);
  console.error('   Type:', error.type);
  console.error('   Description:', error.description || 'N/A');
  console.error('');
  console.error('💡 Troubleshooting:');
  console.error('   1. Check if server is running');
  console.error('   2. Verify the path is correct: /api/socket.io');
  console.error('   3. Check CORS configuration');
  console.error('   4. Verify reverse proxy settings (if using nginx)');
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log(`🔌 Disconnected: ${reason}`);
});

socket.on('error', (error) => {
  console.error('❌ Socket error:', error);
});

// Timeout after 15 seconds
setTimeout(() => {
  if (!socket.connected) {
    console.error('❌ Connection timeout after 15 seconds');
    socket.disconnect();
    process.exit(1);
  }
}, 15000);

console.log('⏳ Attempting to connect...');
console.log('');

