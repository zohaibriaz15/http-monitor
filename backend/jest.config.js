'use strict';

module.exports = {
  testEnvironment: 'node',
  // Integration tests share a single DB; run serially (also set via --runInBand).
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'coverage',
  // Surface open handles if anything forgets to close a pool/socket.
  detectOpenHandles: false,
  verbose: true,
};
