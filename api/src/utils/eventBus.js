const EventEmitter = require('events');
const bus = new EventEmitter();
let ioRef = null;

function setIO(io) {
  ioRef = io;
  bus.emit('io:set', io);
}

function getIO() {
  return ioRef;
}

module.exports = { bus, setIO, getIO };
