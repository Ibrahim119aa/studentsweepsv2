# Socket.IO "Server Error" Debugging Guide

## Problem
Users are experiencing "server error" during socket.io connection in production, even though the endpoint is accessible (curl test succeeds).

## Root Cause
The error occurs **after** the initial handshake, likely during:
1. Socket event handler loading (`autoLoadSocketEvents`)
2. Connection initialization
3. Event handler registration

## Improvements Made

### 1. Enhanced Error Handling in Event Loading (`api/src/loaders/autoloader.js`)
- Each event file is now loaded in a try-catch block
- If one event file fails, others continue loading
- Detailed error logging for each failed event file

### 2. Improved Connection Error Handling (`api/src/loaders/socket.js`)
- Entire connection handler wrapped in try-catch
- Errors during connection setup are caught and logged
- Connection continues even if some events fail to load
- More detailed error logging with stack traces

### 3. Better Connection-Level Error Logging (`api/src/server.js`)
- Enhanced `connection_error` handler with detailed error information
- Logs request headers, URL, and error context
- Stack traces are logged for debugging

## How to Debug

### Step 1: Check Server Logs
When the error occurs, check your server logs for:

```
[Socket.IO] Connection error: ...
[Socket.IO] Error details: ...
❌ Error loading socket event: <filename>
❌ Error initializing socket event: <filename>
```

This will tell you which event file is causing the issue.

### Step 2: Test Individual Event Files
If a specific event file is failing, check:
- Syntax errors in the file
- Missing dependencies
- Database connection issues
- Environment variable issues

### Step 3: Check Database Connection
Verify MongoDB is connected:
```bash
# In server logs, you should see:
✅ MongoDB connected
```

### Step 4: Test Locally
Run the server locally and test:
```bash
cd api
npm start
# In another terminal:
node test-socket-connection.js http://localhost:4000
```

### Step 5: Check Environment Variables
Ensure all required environment variables are set:
- `JWT_SECRET`
- `MONGODB_URI` (if using env var)
- Any other variables your event handlers need

## Common Issues

### Issue: Event File Throws Error
**Solution:** The error is now caught and logged. Check server logs to identify the problematic file.

### Issue: Database Not Connected
**Solution:** Ensure MongoDB connection is established before accepting socket connections. The server waits for DB connection before starting.

### Issue: Missing Dependencies
**Solution:** Check that all npm packages are installed:
```bash
cd api
npm install
```

### Issue: Environment Variables Missing
**Solution:** Check your `.env` file or environment configuration.

## Monitoring

After deploying these changes, monitor your server logs for:
- `socket.connection_error` - Connection-level errors
- `socket.event.load.error` - Event file loading errors
- `socket.event.init.error` - Event initialization errors
- `socket.connection.setup.error` - Connection setup errors

## Next Steps

1. Deploy the updated code
2. Monitor server logs when errors occur
3. Identify which event file is causing issues (if any)
4. Fix the specific event file based on error logs
5. Test the connection again

## Testing

After deployment, test the connection:
```bash
# From server
cd /var/www/studentsweepsv2/api
node test-socket-connection.js https://studentsweeps.com/api
```

Or use the browser test page: `test-socket.html`

