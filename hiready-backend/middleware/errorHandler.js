/**
 * Centralized error handler middleware.
 * Maps common operational errors (Mongoose validation, CastError, JWT errors, CORS, JSON syntax)
 * to appropriate HTTP status codes and safe JSON response payloads.
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // CORS rejection
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  // Body parser JSON syntax error
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }

  // Mongoose schema validation error
  if (err && err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      error: 'Validation failed',
      details: messages.length ? messages : [err.message]
    });
  }

  // Mongoose invalid ObjectId / CastError
  if (err && err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid ${err.path}: ${err.value}` });
  }

  // JWT errors
  if (err && (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Log unhandled server error for debugging
  console.error('[Unhandled Server Error]:', err && err.stack ? err.stack : err);

  return res.status(err && err.status ? err.status : 500).json({
    error: err && err.expose ? err.message : 'Internal server error'
  });
}

/**
 * 404 Not Found handler for undefined API routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Cannot ${req.method} ${req.originalUrl} - Endpoint not found`
  });
}

module.exports = { errorHandler, notFoundHandler };
