require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { autoLoadRoutes } = require('./loaders/autoloader');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Load routes automatically
autoLoadRoutes(app);

module.exports = app;
