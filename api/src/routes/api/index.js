const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const apiDir = __dirname;
fs.readdirSync(apiDir).forEach((file) => {
  if (file === 'index.js' || !file.endsWith('.js')) return;
  const route = require(path.join(apiDir, file));
  const routeName = `/${file.replace('.routes.js', '')}`;
  
  router.use(routeName, route);
  console.log(`📡 Mounted API route: /api${routeName}`);
});

module.exports = router;
