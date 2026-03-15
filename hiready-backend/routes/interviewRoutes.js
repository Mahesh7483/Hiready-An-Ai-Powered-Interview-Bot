const express = require('express');
const router = express.Router();

// In-memory store for proctor logs (swap for a Mongoose model when you need persistence)
const proctorLogs = [];

// POST /api/interview/proctor-log
router.post('/proctor-log', (req, res) => {
  const { event, timestamp, sessionId } = req.body;

  if (!event || !timestamp || !sessionId) {
    return res.status(400).json({ error: 'Missing required fields: event, timestamp, sessionId' });
  }

  const logEntry = { event, timestamp, sessionId, receivedAt: new Date().toISOString() };
  proctorLogs.push(logEntry);
  console.log('[Proctor Log]', logEntry);

  res.status(201).json({ message: 'Log recorded', log: logEntry });
});

// GET /api/interview/proctor-logs/:sessionId
router.get('/proctor-logs/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const sessionLogs = proctorLogs.filter(l => l.sessionId === sessionId);
  res.json({ sessionId, logs: sessionLogs });
});

module.exports = router;
