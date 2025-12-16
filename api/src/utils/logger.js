const util = require('util');

const LEVELS = ['debug', 'info', 'warn', 'error'];
const MIN_LEVEL = (process.env.LOG_LEVEL && LEVELS.indexOf(process.env.LOG_LEVEL)) || 1; // default 'info'

function format(level, message, meta) {
  const out = {
    ts: new Date().toISOString(),
    level,
    message: typeof message === 'string' ? message : util.inspect(message, { depth: 3 }),
    meta: meta || null
  };
  return JSON.stringify(out);
}

module.exports = {
  debug: (msg, meta) => { if (MIN_LEVEL <= 0) console.log(format('debug', msg, meta)); },
  info: (msg, meta) => { if (MIN_LEVEL <= 1) console.log(format('info', msg, meta)); },
  warn: (msg, meta) => { if (MIN_LEVEL <= 2) console.warn(format('warn', msg, meta)); },
  error: (msg, meta) => { if (MIN_LEVEL <= 3) console.error(format('error', msg, meta)); }
};
