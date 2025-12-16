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
  fs.readdirSync(eventsDir).forEach((file) => {
    if (file.endsWith('.js')) {
      const event = require(path.join(eventsDir, file));
      if (typeof event === 'function') {
        event(io, socket);
        console.log(`💬 Loaded socket event: ${file}`);
      }
    }
  });
}

module.exports = { autoLoadRoutes, autoLoadModels, autoLoadSocketEvents };
