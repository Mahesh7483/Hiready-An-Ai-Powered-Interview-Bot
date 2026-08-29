// 1. Import packages
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Keep the API alive on unexpected async failures — log and continue instead of crashing
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const { requireAuth } = require('./middleware/auth');

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
      // Allow any localhost/127.0.0.1 origin (dev convenience: Vite may serve
      // via 127.0.0.1 or a LAN IP in some setups). Production origins are
      // controlled strictly via CORS_ORIGINS — this regex never matches them.
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
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
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.error('DB Error:', err && err.message ? err.message : err));

// 5. Basic test route
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
const { initCollab } = require('./services/collab');
const assessmentRoutes = require('./routes/assessmentRoutes');
const readinessRoutes = require('./routes/readinessRoutes');

// 7. Use Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/questions', apiLimiter, questionRoutes);
app.use('/api/interview', apiLimiter, interviewRoutes);
app.use('/api/ai', apiLimiter, aiRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/resumes', apiLimiter, resumeRoutes);
app.use('/api/interviews', apiLimiter, interviewSessionRoutes);
app.use('/api/code', apiLimiter, codingRoutes);
app.use('/api/assessment', apiLimiter, assessmentRoutes);
app.use('/api/readiness', apiLimiter, readinessRoutes);

// Expose the auth middleware for routes that need it after mounting
app.locals.requireAuth = requireAuth;

// 8. Centralized error handler — never leak raw error details to clients
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error('Unhandled error:', err && err.message ? err.message : err);
  return res.status(500).json({ error: 'Internal server error' });
});

// 9. Start server
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  if (!process.env.JWT_SECRET) {
    console.warn('WARNING: JWT_SECRET is not set. Auth-protected endpoints will reject all tokens.');
  }
  const http = require('http');
  const server = http.createServer(app);
  // Socket.io collaboration (coding interviews: code + cursor sync)
  initCollab(server);
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
