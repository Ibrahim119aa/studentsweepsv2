# Socket.IO Connection Testing Guide

This guide explains how to test the Socket.IO connection at `https://studentsweeps.com/api/socket.io`.

## Server Configuration

The server is configured with:
- **Path**: `/api/socket.io` (configurable via `SOCKET_IO_PATH` env var)
- **URL**: `https://studentsweeps.com/api`
- **Transports**: `['polling', 'websocket']`

## Testing Methods

### Method 1: Node.js Test Script (Recommended)

Run the test script from the `api` directory:

```bash
cd api
npm run test:socket
```

Or with a custom URL:

```bash
node test-socket-connection.js https://studentsweeps.com/api
```

**Expected Output:**
```
🧪 Testing Socket.IO Connection
================================
URL: https://studentsweeps.com/api
Path: /api/socket.io

⏳ Attempting to connect...

✅ SUCCESS: Connected to server!
   Socket ID: abc123...
   Transport: polling
```

### Method 2: Browser HTML Test Page

1. Open `test-socket.html` in your browser
2. The page will automatically attempt to connect
3. You'll see real-time connection status and logs
4. You can test with different URLs using the input field

**Features:**
- Visual connection status
- Real-time event logging
- Test different URLs
- Manual connect/disconnect buttons

### Method 3: Browser Console (Quick Test)

Open your browser's developer console and run:

```javascript
// Load socket.io client (if not already loaded)
const script = document.createElement('script');
script.src = 'https://cdn.socket.io/4.6.1/socket.io.min.js';
document.head.appendChild(script);

// Wait for script to load, then test
setTimeout(() => {
  const socket = io('https://studentsweeps.com/api', {
    path: '/api/socket.io',
    transports: ['polling', 'websocket']
  });

  socket.on('connect', () => {
    console.log('✅ Connected!', socket.id);
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
  });
}, 1000);
```

### Method 4: cURL Test (Check Endpoint Availability)

Test if the socket.io endpoint is accessible:

```bash
# Test polling transport (HTTP)
curl -v "https://studentsweeps.com/api/socket.io/?EIO=4&transport=polling"

# Expected: Should return socket.io handshake data
```

**Expected Response:**
- Status: `200 OK` or `101 Switching Protocols` (for WebSocket)
- Headers should include socket.io handshake information

### Method 5: Using Postman/HTTP Client

1. Create a new WebSocket request
2. URL: `wss://studentsweeps.com/api/socket.io/?EIO=4&transport=websocket`
3. Or test HTTP polling: `GET https://studentsweeps.com/api/socket.io/?EIO=4&transport=polling`

## Troubleshooting

### Error: "Connection refused" or "ERR_CONNECTION_REFUSED"

**Possible causes:**
1. Server is not running
2. Wrong URL or port
3. Firewall blocking the connection
4. Reverse proxy not configured correctly

**Solutions:**
- Verify server is running: `npm start` in the `api` directory
- Check server logs for errors
- Verify the URL matches your deployment

### Error: "server error" or "xhr poll error"

**Possible causes:**
1. Path mismatch between client and server
2. CORS issues
3. Reverse proxy not forwarding WebSocket connections
4. Server-side error during connection

**Solutions:**
- Verify path is `/api/socket.io` on both client and server
- Check server logs for detailed error messages
- Verify CORS configuration allows your origin
- If using nginx, ensure WebSocket upgrade headers are configured:

```nginx
location /api {
    proxy_pass http://localhost:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Error: "Transport unknown" or "Transport not supported"

**Possible causes:**
1. Transport mismatch
2. Server not configured for the transport

**Solutions:**
- Ensure both client and server use `['polling', 'websocket']`
- Check server configuration in `server.js`

## Verification Checklist

- [ ] Server is running and accessible
- [ ] Socket.io path matches: `/api/socket.io`
- [ ] CORS is configured correctly
- [ ] Reverse proxy (if used) is configured for WebSocket
- [ ] Client URL matches server URL
- [ ] No firewall blocking the connection
- [ ] Server logs show connection attempts

## Server Logs

When testing, check your server console for:

```
🚀 Server running on port 4000
[Socket.IO] Connection error: ... (if errors occur)
socket.connection { socketId: '...' } (on successful connection)
```

## Next Steps

After successful connection test:
1. Test authentication: `socket.emit('auth:status', { token: null })`
2. Test other events: `socket.emit('prizes:list', {})`
3. Monitor server logs for event handling
4. Test in production environment

