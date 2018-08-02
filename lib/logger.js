const debug = require('debug')('onkyo.js');

const debugLogger = {
  debug: debug,
  info: debug,
  warn: debug,
  silly: debug,
  error: debug
};

module.exports = debugLogger;
