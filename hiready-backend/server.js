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
 * Keying on req.user.id means one noisy account cannot spend everyone else's
 * allowance, and falls back to IP for anything unauthenticated.
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id) || ipKeyGenerator(req),
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

// 4. Connect to MongoDB
if (process.env.NODE_ENV !== 'test' && process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
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
    health: `${req.protocol}://${req.get('host')}/api/test`,
  });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working' });
});

// 6. Import Routes
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
app.use('/api/ai', apiLimiter, aiLimiter, aiRoutes);
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
