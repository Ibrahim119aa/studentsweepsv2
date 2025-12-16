/**
 * Test script for Socket.IO connection
 * Tests connection to https://studentsweeps.com/api/socket.io
 * 
 * Usage:
 *   node test-socket-connection.js
 *   node test-socket-connection.js https://studentsweeps.com/api
 */

const { io } = require('socket.io-client');

// Default: connect to base domain (matches browser client)
// Browser client uses: https://studentsweeps.com with path /api/socket.io
const BASE_URL = process.argv[2] || 'https://studentsweeps.com';
const SOCKET_PATH = process.argv[3] || '/api/socket.io';

// If URL ends with /api, we need to use /socket.io path (server sees /socket.io after proxy strips /api)
let SOCKET_URL = BASE_URL;
let ACTUAL_PATH = SOCKET_PATH;

if (BASE_URL.endsWith('/api')) {
  // Connecting to /api subpath - server sees /socket.io (proxy strips /api)
  ACTUAL_PATH = '/socket.io';
  console.log('⚠️  Detected /api in URL, using path: /socket.io (proxy will route /api/socket.io → /socket.io)');
} else {
  // Connecting to base domain - use full path /api/socket.io
  ACTUAL_PATH = SOCKET_PATH;
}

console.log('🧪 Testing Socket.IO Connection');
console.log('================================');
console.log(`Base URL: ${SOCKET_URL}`);
console.log(`Socket Path: ${ACTUAL_PATH}`);
console.log(`Full endpoint: ${SOCKET_URL}${ACTUAL_PATH}`);
console.log('');
console.log('💡 This matches browser client configuration');
console.log('   Browser uses: https://studentsweeps.com with path /api/socket.io');
console.log('');

// Create socket connection
const socket = io(SOCKET_URL, {
  path: ACTUAL_PATH,
  transports: ['polling', 'websocket'],
  reconnection: false, // Don't auto-reconnect for testing
  timeout: 10000,
  forceNew: true // Force a new connection
});

// Connection events
socket.on('connect', () => {
  console.log('✅ SUCCESS: Connected to server!');
  console.log(`   Socket ID: ${socket.id}`);
  console.log(`   Transport: ${socket.io.engine.transport.name}`);
  console.log('');
  
  // Test emitting a simple event
  console.log('📤 Testing emit: auth:status (without token)');
  // Send empty object - server will return { success: true, valid: false }
  socket.emit('auth:status', {}, (response) => {
    if (response) {
      console.log('✅ Response received:', JSON.stringify(response, null, 2));
      if (response.success && !response.valid) {
        console.log('   ✓ Expected response: No token provided, auth status invalid');
      }
    }
  });
  
  // Also test with a listener for the response event
  socket.on('auth:status:response', (response) => {
    console.log('✅ Received auth:status:response event:', JSON.stringify(response, null, 2));
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
  console.error('   Type:', error.type || 'N/A');
  console.error('   Description:', error.description || 'N/A');
  console.error('   Data:', error.data || 'N/A');
  console.error('');
  
  if (error.message.includes('Invalid namespace')) {
    console.error('💡 "Invalid namespace" usually means path mismatch.');
    console.error('   Try these alternatives:');
    console.error(`   node test-socket-connection.js https://studentsweeps.com /api/socket.io`);
    console.error(`   node test-socket-connection.js https://studentsweeps.com/api /socket.io`);
  } else {
    console.error('💡 Troubleshooting:');
    console.error('   1. Check if server is running');
    console.error('   2. Verify the path is correct (try both /api/socket.io and /socket.io)');
    console.error('   3. Check CORS configuration');
    console.error('   4. Verify reverse proxy settings (if using nginx)');
    console.error('   5. Check server logs for connection errors');
  }
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
console.log(`   Full connection URL: ${SOCKET_URL}${ACTUAL_PATH}`);
console.log('');

