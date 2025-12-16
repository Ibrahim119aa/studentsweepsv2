/**
 * Diagnostic script to test different Socket.IO path configurations
 * Helps identify the correct path setup for your deployment
 */

const { io } = require('socket.io-client');

const BASE_URL = process.argv[2] || 'https://studentsweeps.com/api';
const PATHS_TO_TEST = [
  '/socket.io',        // Default (for reverse proxy)
  '/api/socket.io',    // Direct /api access
  '/socket.io/',       // With trailing slash
  '/api/socket.io/'    // With trailing slash
];

console.log('🔍 Socket.IO Path Diagnostic Test');
console.log('==================================');
console.log(`Base URL: ${BASE_URL}`);
console.log(`Testing ${PATHS_TO_TEST.length} different paths...`);
console.log('');

let testsCompleted = 0;
let successfulPath = null;

function testPath(path, index) {
  return new Promise((resolve) => {
    console.log(`\n[${index + 1}/${PATHS_TO_TEST.length}] Testing path: ${path}`);
    
    const socket = io(BASE_URL, {
      path: path,
      transports: ['polling', 'websocket'],
      reconnection: false,
      timeout: 5000
    });

    const timeout = setTimeout(() => {
      if (!socket.connected) {
        console.log(`   ❌ Timeout - No connection`);
        socket.disconnect();
        resolve(false);
      }
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      console.log(`   ✅ SUCCESS! Connected with path: ${path}`);
      console.log(`   Socket ID: ${socket.id}`);
      successfulPath = path;
      socket.disconnect();
      resolve(true);
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      console.log(`   ❌ Error: ${error.message}`);
      if (error.message.includes('404') || error.message.includes('Not Found')) {
        console.log(`   → Path not found (404)`);
      } else if (error.message.includes('server error')) {
        console.log(`   → Server error (path might be correct but server issue)`);
      }
      socket.disconnect();
      resolve(false);
    });
  });
}

async function runTests() {
  for (let i = 0; i < PATHS_TO_TEST.length; i++) {
    const success = await testPath(PATHS_TO_TEST[i], i);
    if (success) {
      console.log('\n' + '='.repeat(50));
      console.log(`✅ FOUND WORKING PATH: ${PATHS_TO_TEST[i]}`);
      console.log('='.repeat(50));
      console.log('\n💡 Update your server.js:');
      console.log(`   path: '${PATHS_TO_TEST[i]}'`);
      console.log('\n💡 Update your socketClient.browser.js:');
      console.log(`   path: '${PATHS_TO_TEST[i]}'`);
      break;
    }
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (!successfulPath) {
    console.log('\n' + '='.repeat(50));
    console.log('❌ No working path found');
    console.log('='.repeat(50));
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Verify server is running');
    console.log('   2. Check reverse proxy configuration');
    console.log('   3. Verify firewall/network settings');
    console.log('   4. Check server logs for errors');
    console.log('   5. Try testing locally first:');
    console.log('      node test-socket-paths.js http://localhost:4000');
  }
}

runTests().then(() => {
  process.exit(successfulPath ? 0 : 1);
});

