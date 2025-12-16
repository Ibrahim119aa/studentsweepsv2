# Frontend Socket.IO Connection Debugging Guide

## Issue
Test script connects successfully, but frontend browser client does not connect.

## Configuration Check ✅

Your configuration is correct:
- **Frontend URL**: `https://studentsweeps.com`
- **Frontend Path**: `/api/socket.io`
- **Server Path**: `/socket.io` (accessible at `/api/socket.io` via reverse proxy)

This matches the working test script configuration.

## Debugging Steps

### Step 1: Check Browser Console

Open your browser's Developer Tools (F12) and check the Console tab. Look for:

**Expected logs (if working):**
```
[SocketClient] Initializing with token: absent
[SocketClient] Connecting to: https://studentsweeps.com
[SocketClient] Socket.io path: /api/socket.io
[SocketClient] Full endpoint URL: https://studentsweeps.com/api/socket.io
[SocketClient] Socket options: {...}
[SocketClient] Connected successfully to https://studentsweeps.com
```

**Error logs to look for:**
- `[SocketClient] Socket.io not loaded` - Socket.io library not loaded
- `[SocketClient] Connection error:` - Connection failed
- `Invalid namespace` - Path mismatch
- `server error` - Server-side error
- `ERR_CONNECTION_REFUSED` - Network/firewall issue

### Step 2: Verify Socket.io Library is Loaded

In browser console, type:
```javascript
window.io
```

**Expected:** Should show a function/object (socket.io client)
**If undefined:** The socket.io library didn't load. Check:
- Network tab for failed script load
- CDN URL: `https://cdn.socket.io/4.6.1/socket.io.min.js`
- CORS issues blocking the script

### Step 3: Check Network Tab

1. Open Developer Tools → Network tab
2. Filter by "WS" (WebSocket) or "socket.io"
3. Reload the page
4. Look for requests to `/api/socket.io`

**What to check:**
- Are there any requests to `/api/socket.io`?
- What's the status code? (200 = good, 404 = path wrong, 500 = server error)
- Are there any CORS errors?

### Step 4: Test Connection Manually

In browser console, try connecting manually:

```javascript
// Test 1: Check if socket.io is loaded
console.log('Socket.io loaded:', typeof window.io !== 'undefined');

// Test 2: Try manual connection
const testSocket = io('https://studentsweeps.com', {
  path: '/api/socket.io',
  transports: ['polling', 'websocket']
});

testSocket.on('connect', () => {
  console.log('✅ Manual test: Connected!', testSocket.id);
});

testSocket.on('connect_error', (err) => {
  console.error('❌ Manual test: Error', err.message);
});
```

### Step 5: Check for JavaScript Errors

Look for any JavaScript errors that might prevent initialization:
- Syntax errors in `socketClient.browser.js`
- Errors in `index.html`
- Errors from other scripts

### Step 6: Verify File is Deployed

Make sure the updated `socketClient.browser.js` is deployed:
1. Check file modification date
2. Verify the file contains the updated code
3. Clear browser cache and hard refresh (Ctrl+Shift+R)

### Step 7: Check CORS Configuration

Even though CORS is set to `origin: '*'`, check:
- Are there any CORS errors in console?
- Check Network tab for CORS-related errors
- Verify server CORS headers are being sent

### Step 8: Check Server Logs

When the frontend tries to connect, check server logs for:
- `[Socket.IO] Connection error:` - Connection-level errors
- `[Socket.IO] New connection:` - Successful connections
- Any error messages

## Common Issues & Solutions

### Issue: "Socket.io not loaded"
**Solution:**
- Check CDN URL is accessible
- Verify script tag in HTML is correct
- Check for ad blockers blocking the CDN

### Issue: "Invalid namespace"
**Solution:**
- Verify path matches: `/api/socket.io`
- Check server path configuration
- Ensure reverse proxy is routing correctly

### Issue: "Connection refused" or "ERR_CONNECTION_REFUSED"
**Solution:**
- Verify server is running
- Check firewall settings
- Verify reverse proxy is configured

### Issue: "server error"
**Solution:**
- Check server logs for detailed error
- Verify database connection
- Check for errors in event handlers

### Issue: No connection attempts in Network tab
**Solution:**
- Check if `SocketClient.init()` is being called
- Verify no JavaScript errors preventing execution
- Check if DOMContentLoaded event fired

## Quick Test

Run this in browser console to test everything:

```javascript
// 1. Check socket.io loaded
console.log('1. Socket.io loaded:', typeof window.io !== 'undefined');

// 2. Check SocketClient exists
console.log('2. SocketClient exists:', typeof window.SocketClient !== 'undefined');

// 3. Check if already initialized
console.log('3. Socket exists:', window.SocketClient?._getSocket ? 'yes' : 'no');

// 4. Try manual connection
const test = io('https://studentsweeps.com', { path: '/api/socket.io' });
test.on('connect', () => console.log('4. ✅ Manual connection works!'));
test.on('connect_error', (e) => console.error('4. ❌ Manual connection failed:', e.message));
```

## Next Steps

1. **Check browser console** - Look for the detailed logs we added
2. **Share console output** - The enhanced logging will show exactly what's happening
3. **Check Network tab** - See if connection attempts are being made
4. **Verify deployment** - Make sure updated code is deployed

The enhanced logging will help identify the exact issue!

