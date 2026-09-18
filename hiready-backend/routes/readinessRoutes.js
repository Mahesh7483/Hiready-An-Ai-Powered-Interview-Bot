const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { computeReadiness } = require('../services/readiness');

// GET /api/readiness/me — composite interview-readiness score across the four
// pillars: aptitude accuracy, AI-scored interviews, coding pass-rate, resume.
//
// The calculation itself lives in services/readiness.js so that this route and
// GET /api/mastery/today cannot drift apart. They answer different questions
// from the same numbers, and two copies of the rule is how a student gets told
// to work on aptitude while the score says coding.
router.get('/me', requireAuth, async (req, res) => {
  try {
    res.json(await computeReadiness(req.user.id));
  } catch (err) {
    console.error('Readiness score error:', err.message);
    res.status(500).json({ error: 'Failed to compute readiness' });
  }
});

module.exports = router;
