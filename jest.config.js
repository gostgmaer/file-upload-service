'use strict';

module.exports = {
  testEnvironment: 'node',
  // Set required env vars before any module is loaded
  setupFiles: ['./tests/setup.js'],
  // Suppress errorHandler console.error noise during expected-error tests
  setupFilesAfterEnv: ['./tests/suppress-noise.js'],
  testMatch: ['**/tests/**/*.test.js'],
  // Clear mock state (calls, instances, results) between every test
  clearMocks: true,
  testTimeout: 10000,
  // Show verbose test names
  verbose: true,
};
