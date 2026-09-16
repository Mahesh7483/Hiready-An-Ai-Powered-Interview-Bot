const path = require('path');

/**
 * The suites live at <repo>/tests/backend, not inside this package.
 *
 * Two things follow from that, and both need saying because neither is the
 * default:
 *
 *   rootDir is the REPOSITORY root, so `roots` can point outside this package.
 *   Jest will not look above rootDir, so leaving it here would find nothing.
 *
 *   modulePaths adds this package's node_modules explicitly. Node resolves a
 *   bare `require('mongoose')` by walking up from the requiring FILE — from
 *   tests/backend that walk reaches <repo>/node_modules, which holds only the
 *   root dev runner. Without this line every suite fails at import on a
 *   dependency that is plainly installed.
 */
module.exports = {
  rootDir: path.resolve(__dirname, '..'),
  roots: ['<rootDir>/tests/backend'],
  modulePaths: [path.join(__dirname, 'node_modules')],

  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  collectCoverage: false,
  verbose: true,
  testTimeout: 15000,
};
