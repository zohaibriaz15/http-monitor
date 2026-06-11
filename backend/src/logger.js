'use strict';

// Intentionally tiny: a structured-ish console logger. In a larger app this
// would be pino/winston, but for this scope a thin wrapper keeps logs
// consistent and easy to silence during tests.
const config = require('./config');

function ts() {
  return new Date().toISOString();
}

function log(level, args) {
  // Keep test output clean unless something goes wrong.
  if (config.isTest && level !== 'error') return;
  // eslint-disable-next-line no-console
  console[level](`[${ts()}] [${level.toUpperCase()}]`, ...args);
}

module.exports = {
  info: (...args) => log('info', args),
  warn: (...args) => log('warn', args),
  error: (...args) => log('error', args),
};
