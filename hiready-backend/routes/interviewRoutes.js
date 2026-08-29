const express = require('express');
const router = express.Router();
const ProctorLog = require('../models/ProctorLog');
const { requireAuth } = require('../middleware/auth');

// POST /api/interview/proctor-log
router.post('/proctor-log', requireAuth, async (req, res) => {
  const { event, timestamp, sessionId, snapshot } = req.body;

  if (!event || !timestamp || !sessionId) {
    return res.status(400).json({ error: 'Missing required fields: event, timestamp, sessionId' });
  }

  const parsedTimestamp = new Date(timestamp);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return res.status(400).json({ error: 'timestamp must be a valid ISO date' });
  }

  // Optional evidence snapshot: base64 JPEG data URI from the webcam
  let safeSnapshot;
  if (
    typeof snapshot === 'string' &&
    snapshot.startsWith('data:image/jpeg;base64,') &&
    snapshot.length <= 80000
  ) {
    safeSnapshot = snapshot;
  }

  try {
    const logEntry = await ProctorLog.create({
      sessionId: String(sessionId).slice(0, 128),
      userId: req.user.id,
      event: String(event).slice(0, 256),
      timestamp: parsedTimestamp,
      snapshot: safeSnapshot
    });

    res.status(201).json({ message: 'Log recorded', log: { id: logEntry._id } });
  } catch (err) {
    console.error('Proctor log error:', err.message);
    res.status(500).json({ error: 'Failed to record log' });
  }
});

// GET /api/interview/proctor-logs/:sessionId — only returns logs belonging to the caller
router.get('/proctor-logs/:sessionId', requireAuth, async (req, res) => {
  try {
    const withSnapshots = req.query.snapshots === '1';
    const projection = withSnapshots ? undefined : '-snapshot';
    const logs = await ProctorLog.find(
      { sessionId: req.params.sessionId, userId: req.user.id },
      projection
    )
      .sort({ receivedAt: 1 })
      .limit(500)
      .lean();

    res.json({
      sessionId: req.params.sessionId,
      logs: logs.map((l) => ({
        event: l.event,
        timestamp: l.timestamp,
        sessionId: l.sessionId,
        receivedAt: l.receivedAt,
        ...(withSnapshots && l.snapshot ? { snapshot: l.snapshot } : {})
      }))
    });
  } catch (err) {
    console.error('Proctor fetch error:', err.message);
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

module.exports = router;
