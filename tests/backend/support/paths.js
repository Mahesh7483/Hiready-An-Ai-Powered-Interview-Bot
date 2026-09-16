const path = require('path');

/**
 * Where the code under test lives.
 *
 * Every suite used to compute this for itself — `path.resolve(__dirname, '..')`
 * appeared in eight files, and `path.join(__dirname, '..', 'models')` and
 * friends in twenty more. That works exactly as long as the tests sit inside
 * the package, and breaks in twenty-eight separate places the moment they do
 * not.
 *
 * Resolving it once means the suites no longer know or care where they live:
 * moving this directory again is a one-line change here, not a sweep.
 *
 * REPO_ROOT is derived from this file's own location (tests/backend/support),
 * not from process.cwd(), because jest may be invoked from either package or
 * from the root and cwd would differ each time.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND = path.join(REPO_ROOT, 'hiready-backend');
const FRONTEND = path.join(REPO_ROOT, 'hiready-frontend');

/** Absolute path to a file inside the backend package. */
const backend = (...segments) => path.join(BACKEND, ...segments);

/** Absolute path to a file inside the frontend package. */
const frontend = (...segments) => path.join(FRONTEND, ...segments);

/**
 * require() a backend module by its path relative to hiready-backend/.
 *
 *   const User = req('models/User');
 *
 * Node resolves a relative require against the REQUIRING file, so
 * `require('../models/User')` silently meant something different once these
 * files moved. An absolute path cannot drift like that.
 */
const req = (relative) => require(backend(relative));

module.exports = { REPO_ROOT, BACKEND, FRONTEND, backend, frontend, req };
