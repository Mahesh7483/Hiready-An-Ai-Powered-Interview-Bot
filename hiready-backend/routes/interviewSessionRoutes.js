const express = require('express');
const mongoose = require('mongoose');
const InterviewSession = require('../models/InterviewSession');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// POST /api/interviews/sessions — persist a completed interview session
router.post('/sessions', async (req, res) => {
  const { sessionId, role, experienceLevel, jobDescription, mode, durationSeconds, conversationLog, integrity, metricsJson, interviewType } = req.body;

  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 120) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (!role || typeof role !== 'string') {
    return res.status(400).json({ error: 'role is required' });
  }
  if (!experienceLevel || typeof experienceLevel !== 'string') {
    return res.status(400).json({ error: 'experienceLevel is required' });
  }
  if (!Array.isArray(conversationLog)) {
    return res.status(400).json({ error: 'conversationLog array is required' });
  }
  // Hard size guard: max ~80 entries (40 questions round-trip), each capped
  if (conversationLog.length > 80) {
    return res.status(400).json({ error: 'conversationLog too large' });
  }

  try {
    const doc = new InterviewSession({
      user: req.user.id,
      sessionId: String(sessionId).slice(0, 120),
      role: String(role).slice(0, 120),
      experienceLevel: String(experienceLevel).slice(0, 60),
      jobDescription: String(jobDescription || '').slice(0, 2500),
      mode: mode === 'practice' ? 'practice' : 'assessment',
      durationSeconds: Math.max(0, Math.min(parseInt(durationSeconds, 10) || 0, 4 * 3600)),
      conversationLog: conversationLog.slice(0, 80).map((m) => ({
        role: m && m.role === 'user' ? 'user' : 'interviewer',
        text: String(m && m.text ? m.text : '').slice(0, 8000)
      })),
      integrity: {
        violations: Math.max(0, Math.min(Number(integrity && integrity.violations) || 0, 20)),
        maxViolations: Math.max(1, Math.min(Number(integrity && integrity.maxViolations) || 3, 10)),
        terminated: Boolean(integrity && integrity.terminated)
      },
      metricsJson:
        metricsJson && typeof metricsJson === 'object' && !Array.isArray(metricsJson)
          ? metricsJson
          : null,
      interviewType:
        interviewType === 'behavioral' ? 'behavioral' : 'technical'
    });
    await doc.save();
    res.status(201).json({ message: 'Interview session saved', id: doc._id });
  } catch (err) {
    console.error('Save interview session error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/interviews/sessions — my sessions (summary list, newest first)
router.get('/sessions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const items = await InterviewSession.find({ user: req.user.id })
      .select('sessionId role experienceLevel mode durationSeconds integrity analyzedAt createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ items });
  } catch (err) {
    console.error('List interview sessions error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/interviews/sessions/summary — aggregate stats for dashboard
router.get('/sessions/summary', async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [totals] = await InterviewSession.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(req.user.id) } },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          avgDuration: { $avg: '$durationSeconds' },
          terminatedCount: { $sum: { $cond: ['$integrity.terminated', 1, 0] } },
          last30: { $sum: { $cond: [{ $gte: ['$createdAt', since] }, 1, 0] } },
          practiceCount: { $sum: { $cond: [{ $eq: ['$mode', 'practice'] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      totalSessions: totals ? totals.totalSessions : 0,
      avgDurationSeconds: totals ? Math.round(totals.avgDuration || 0) : 0,
      terminatedCount: totals ? totals.terminatedCount : 0,
      sessionsLast30Days: totals ? totals.last30 : 0,
      practiceCount: totals ? totals.practiceCount : 0
    });
  } catch (err) {
    console.error('Interview summary error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/interviews/sessions/:id/analysis — attach the report analysis
// GET /api/interviews/sessions/leaderboard — ranked by AI-analyzed interview
// score (avg of analysisJson.overallScore across each user's analyzed sessions)
router.get('/sessions/leaderboard', async (req, res) => {
  try {
    const rows = await InterviewSession.aggregate([
      { $match: { analysisJson: { $ne: null } } },
      {
        $addFields: {
          scoreNum: { $toDouble: { $ifNull: ['$analysisJson.overallScore', 0] } },
        },
      },
      {
        $group: {
          _id: '$user',
          sessions: { $sum: 1 },
          avgScore: { $avg: '$scoreNum' },
          bestScore: { $max: '$scoreNum' },
        },
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          sessions: 1,
          avgScore: { $round: ['$avgScore', 1] },
          bestScore: { $round: ['$bestScore', 1] },
        },
      },
      { $sort: { avgScore: -1, sessions: -1 } },
      { $limit: 25 },
    ]);

    // Attach names (and flag the caller's row), mirroring the aptitude leaderboard
    const User = require('../models/User');
    const populated = await Promise.all(
      rows.map(async (row, idx) => {
        let name = 'Anonymous';
        let isCaller = false;
        try {
          const user = await User.findById(row.userId).select('name email').lean();
          if (user) {
            name = user.name || (user.email ? user.email.split('@')[0] : name);
            if (String(req.user.id) === String(row.userId)) isCaller = true;
          }
        } catch { /* keep anonymous */ }
        return {
          rank: idx + 1,
          name,
          sessions: row.sessions,
          avgScore: row.avgScore,
          bestScore: row.bestScore,
          isCaller,
        };
      })
    );

    res.json({ leaderboard: populated });
  } catch (err) {
    console.error('Interview leaderboard error:', err.message);
    res.status(500).json({ error: 'Failed to load interview leaderboard' });
  }
});

router.patch('/sessions/:id/analysis', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const { analysisJson } = req.body;
  if (!analysisJson || typeof analysisJson !== 'object') {
    return res.status(400).json({ error: 'analysisJson object is required' });
  }
  try {
    const updated = await InterviewSession.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { analysisJson, analyzedAt: new Date() },
      { new: true }
    ).select('_id').lean();
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Analysis attached' });
  } catch (err) {
    console.error('Attach interview analysis error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/interviews/sessions/:id — one full session (must own it)
router.get('/sessions/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const item = await InterviewSession.findOne({ _id: req.params.id, user: req.user.id }).lean();
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    console.error('Get interview session error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/interviews/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const deleted = await InterviewSession.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete interview session error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

