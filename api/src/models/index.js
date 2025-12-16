// Automatically loads all models when required
const fs = require('fs');
const path = require('path');

fs.readdirSync(__dirname).forEach((file) => {
  if (file.endsWith('.js') && file !== 'index.js') {
    require(path.join(__dirname, file));
  }
});