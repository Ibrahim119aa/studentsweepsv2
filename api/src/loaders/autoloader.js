const fs = require('fs');
const path = require('path');

function autoLoadRoutes(app) {
  const routesDir = path.join(__dirname, '../routes');
  fs.readdirSync(routesDir).forEach((folder) => {
    const folderPath = path.join(routesDir, folder, 'index.js');
    if (fs.existsSync(folderPath)) {
      const router = require(folderPath);
      app.use(`/${folder}`, router);
      console.log(`📦 Loaded routes: /${folder}`);
    }
  });
}

function autoLoadModels() {
  const modelsDir = path.join(__dirname, '../models');
  fs.readdirSync(modelsDir).forEach((file) => {
    if (file.endsWith('.js') && file !== 'index.js') {
      require(path.join(modelsDir, file));
      console.log(`🧩 Loaded model: ${file}`);
    }
  });
}

function autoLoadSocketEvents(io, socket) {
  const eventsDir = path.join(__dirname, '../socket/events');
  const logger = require('../utils/logger');
  
  fs.readdirSync(eventsDir).forEach((file) => {
    if (file.endsWith('.js')) {
      try {
        const eventPath = path.join(eventsDir, file);
        // Clear require cache to allow hot-reloading in development
        delete require.cache[require.resolve(eventPath)];
        const event = require(eventPath);
        
        if (typeof event === 'function') {
          try {
            event(io, socket);
            console.log(`💬 Loaded socket event: ${file}`);
          } catch (err) {
            try {
              logger.error('socket.event.init.error', {
                file,
                message: err.message,
                stack: err.stack
              });
            } catch (e) {
              // Logger error shouldn't break error handling
            }
            console.error(`❌ Error initializing socket event ${file}:`, err.message);
            console.error(`   Error stack:`, err.stack);
            // Continue loading other events even if one fails
          }
        } else {
          console.warn(`⚠️  Socket event ${file} does not export a function`);
        }
      } catch (err) {
        logger.error('socket.event.load.error', {
          file,
          message: err.message,
          stack: err.stack
        });
        console.error(`❌ Error loading socket event ${file}:`, err.message);
        // Continue loading other events even if one fails
      }
    }
  });
}

module.exports = { autoLoadRoutes, autoLoadModels, autoLoadSocketEvents };
