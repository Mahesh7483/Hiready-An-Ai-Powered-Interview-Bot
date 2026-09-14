const express = require('express');
const router = express.Router();
const ProctorLog = require('../models/ProctorLog');
const ProctorSnapshot = require('../models/ProctorSnapshot');
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
    const safeSessionId = String(sessionId).slice(0, 128);
    const logEntry = await ProctorLog.create({
      sessionId: safeSessionId,
      userId: req.user.id,
      event: String(event).slice(0, 256),
      timestamp: parsedTimestamp
    });

    // The frame goes to its own collection, never onto the log row.
    if (safeSnapshot) {
      await ProctorSnapshot.create({
        sessionId: safeSessionId,
        userId: req.user.id,
        proctorLogId: logEntry._id,
        image: safeSnapshot,
        capturedAt: parsedTimestamp
      });
    }

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
    const logs = await ProctorLog.find({
      sessionId: req.params.sessionId,
      userId: req.user.id
    })
      .sort({ receivedAt: 1 })
      .limit(500)
      .lean();

    // Frames live in their own collection now. A candidate may see their own
    // (policy: proctorSnapshots -> candidate OWN), so this stays supported —
    // but it is a second, opt-in query rather than a field that rides along on
    // every log read. Both filters are kept: sessionId scopes the session and
    // userId scopes the owner, so neither alone can widen the result.
    let frames = new Map();
    if (withSnapshots && logs.length) {
      const rows = await ProctorSnapshot.find({
        proctorLogId: { $in: logs.map((l) => l._id) },
        userId: req.user.id
      })
        .select('proctorLogId image')
        .lean();
      frames = new Map(rows.map((f) => [String(f.proctorLogId), f.image]));
    }

    res.json({
      sessionId: req.params.sessionId,
      logs: logs.map((l) => {
        const image = frames.get(String(l._id));
        return {
          event: l.event,
          timestamp: l.timestamp,
          sessionId: l.sessionId,
          receivedAt: l.receivedAt,
          ...(image ? { snapshot: image } : {})
        };
      })
    });
  } catch (err) {
    console.error('Proctor fetch error:', err.message);
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

module.exports = router;
