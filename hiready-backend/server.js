// 1. Import packages
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
require('dotenv').config();

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});
/**
 * Fail fast on a missing or weak signing key.
 *
 * middleware/auth.js verifies with process.env.JWT_SECRET, and one helper used
 * to fall back to the literal 'secret' when it was unset — forgeable by anyone.
 * The fallback is gone; this makes the condition that motivated it impossible
 * instead of merely unreachable. The README claimed compose enforced this; the
 * application did not.
 */
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET must be set and at least 32 characters. '
    + 'Generate one with crypto.randomBytes(48).toString("hex").'
  );
}

// 2. Create app
const app = express();
app.set('trust proxy', 1);

// 3. Security middleware
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGINS ||
  'http://localhost:3000,http://localhost:8080,http://localhost:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests (curl, health checks) and allowlisted origins
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Development convenience only. In production the allowlist is the whole
      // policy — otherwise anything serving from localhost on an operator's
      // machine can call a production API with credentials.
      if (
        process.env.NODE_ENV !== 'production'
        && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true
  })
);

// Global API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

/**
 * The paid endpoints get their own budget, keyed on the USER.
 *
 * Groq and Deepgram calls cost money per request, and the global limiter is
 * per-IP and generous enough (300 / 15 min) that one authenticated account can
 * exhaust a daily provider quota — which has already happened here once.
 *
 * The first version of this limiter did nothing at all, in two ways at once,
 * and both are worth naming because each is easy to write again:
 *
 *   1. It was mounted BEFORE the router whose `router.use(requireAuth)` sets
 *      req.user, so `req.user` was always undefined and the per-account branch
 *      was never taken. requireAuth is now mounted ahead of it, below.
 *
 *   2. `ipKeyGenerator` takes an IP STRING, not the request. Passing `req`
 *      returned the request object itself, and MemoryStore keys by identity —
 *      so every request got a fresh bucket with a count of one and nothing was
 *      ever limited.
 *
 * Its test asserted on the source text of this file and passed throughout.
 * The replacement sends real requests; see __tests__/aiRateLimit.test.js.
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id) || ipKeyGenerator(req.ip),
  message: { error: 'AI usage limit reached for this hour. Please try again later.' },
});

// Stricter limit for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later' }
});

app.use(express.json({ limit: '10mb' }));

/**
 * 4. Connect to MongoDB.
 *
 * Two deliberate choices here, both learned the hard way:
 *
 * A missing MONGO_URI used to skip the connect entirely, so the process booted
 * happily with no database and every data route failed at request time instead.
 * That is the worst shape a failure can take — healthy on the outside, broken
 * on every path that matters. It now fails at boot like JWT_SECRET does.
 *
 * serverSelectionTimeoutMS defaults to 30s. With the database down, a login
 * took 30 seconds to return a generic 500; measured, not guessed. Five seconds
 * is long enough to ride out a reconnect and short enough that the caller gets
 * an answer rather than a hung tab.
 */
if (process.env.NODE_ENV !== 'test') {
  if (!process.env.MONGO_URI) {
    throw new Error(
      'MONGO_URI must be set. The API cannot serve any data route without it. '
      + 'For local development: mongodb://127.0.0.1:27017/hiready'
    );
  }
  mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log('MongoDB Connected'))
    .catch((err) => console.error('DB Error:', err && err.message ? err.message : err));
}

// 5. Root + test routes
app.get('/', (req, res) => {
  res.json({
    name: 'Hiready API',
    status: 'running',
    frontend: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',')[0] : 'http://localhost:8080',
    apiBase: `${req.protocol}://${req.get('host')}/api`,
    health: `${req.protocol}://${req.get('host')}/api/health`,
  });
});

/**
 * Liveness. Says the process is up and nothing more — it deliberately touches
 * no dependency, so it stays cheap and always answers.
 */
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working' });
});

/**
 * Readiness — whether this process can actually serve a request.
 *
 * /api/test returned 200 "Backend is working" while the database was
 * unreachable and every login took 30 seconds to fail. The Docker HEALTHCHECK
 * pointed at it, so the container reported healthy through a total outage. A
 * health check that cannot fail is not a health check.
 *
 * Reports only whether each provider key is PRESENT. Never the key, never a
 * prefix, never a length — this endpoint is unauthenticated on purpose so that
 * a probe can reach it, which means it must give an attacker nothing.
 */
const MONGO_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

app.get('/api/health', (req, res) => {
  const readyState = mongoose.connection.readyState;
  const database = MONGO_STATES[readyState] || 'unknown';
  const ok = readyState === 1;

  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    database,
    // Configuration presence, not reachability: a wrong key still reads true.
    // It separates "nobody set this up" from "the provider is having a day".
    providers: {
      groq: Boolean(process.env.GROQ_API_KEY),
      deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
      firebase: Boolean(process.env.FIREBASE_PROJECT_ID),
    },
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// 6. Import Routes
const { requireAuth } = require('./middleware/auth');
const questionRoutes = require('./routes/questionRoutes');
const authRoutes = require('./routes/authRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const aiRoutes = require('./routes/aiRoutes');
const adminRoutes = require('./routes/adminRoutes');
const resumeRoutes = require('./routes/resumeRoutes');
const interviewSessionRoutes = require('./routes/interviewSessionRoutes');
const codingRoutes = require('./routes/coding/execution');
const codingQuestionRoutes = require('./routes/coding/questions');
const { initCollab } = require('./services/collab');
const assessmentRoutes = require('./routes/assessmentRoutes');
const readinessRoutes = require('./routes/readinessRoutes');
const hireRoutes = require('./routes/hire');
const consentRoutes = require('./routes/consentRoutes');

// 7. Use Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/questions', apiLimiter, questionRoutes);
app.use('/api/interview', apiLimiter, interviewRoutes);
// requireAuth MUST precede aiLimiter: the limiter keys on req.user.id, which
// does not exist until requireAuth has run. aiRoutes keeps its own
// router.use(requireAuth) so the router is never servable unauthenticated if
// it is ever mounted somewhere else; the second pass is a Map hit against the
// existence cache in middleware/auth.js, not a second database read.
app.use('/api/ai', apiLimiter, requireAuth, aiLimiter, aiRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/resumes', apiLimiter, resumeRoutes);
app.use('/api/interviews', apiLimiter, interviewSessionRoutes);
app.use('/api/code', apiLimiter, codingRoutes);
app.use('/api/admin/coding-questions', apiLimiter, codingQuestionRoutes);
app.use('/api/assessment', apiLimiter, assessmentRoutes);
app.use('/api/readiness', apiLimiter, readinessRoutes);
app.use('/api/hire', apiLimiter, hireRoutes);
app.use('/api/consent', apiLimiter, consentRoutes);

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// 8. 404 handler for undefined routes
app.use('/api', notFoundHandler);
app.use(notFoundHandler);

// 9. Centralized error handler
app.use(errorHandler);

// 9. Start server
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  const http = require('http');
  const server = http.createServer(app);
  // Socket.io collaboration (coding interviews: code + cursor sync)
  initCollab(server);
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
