const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// GET /api/readiness/me — composite interview-readiness score across the four
// pillars: aptitude accuracy, AI-scored interviews, coding pass-rate, resume.
// Weights: interview 40, aptitude 30, coding 20, resume 10. Modules with no
// data are dropped and the remaining weights renormalize to 100.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const uid = req.user.id;
    const userOid = mongoose.Types.ObjectId.isValid(uid)
      ? new mongoose.Types.ObjectId(uid)
      : uid;

    const TestResult = require('../models/TestResult');
    const InterviewSession = require('../models/InterviewSession');
    const CodingSubmission = require('../models/CodingSubmission');
    const ResumeAnalysis = require('../models/ResumeAnalysis');

    // ── Aptitude: accuracy over every graded answer ──
    const testResults = await TestResult.find({ userId: uid }).select('selectedAnswers').lean();
    let aCorrect = 0;
    let aAnswered = 0;
    testResults.forEach((r) => (r.selectedAnswers || []).forEach((a) => {
      if (a.selected) { aAnswered++; if (a.isCorrect) aCorrect++; }
    }));
    const aptitudeScore = aAnswered > 0 ? Math.round((aCorrect / aAnswered) * 100) : null;

    // ── Interview: avg of AI analysis overallScore (0-100) ──
    const [interviewAgg] = await InterviewSession.aggregate([
      { $match: { user: userOid, analysisJson: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$analysisJson.overallScore' } } },
    ]);
    const interviewScore = interviewAgg && Number.isFinite(interviewAgg.avg)
      ? Math.round(interviewAgg.avg)
      : null;

    // ── Coding: pass rate over the latest submission per attempted question ──
    // (raw `score` is points-based, not 0-100, so pass rate normalizes it)
    const codingAgg = await CodingSubmission.aggregate([
      { $match: { userId: userOid } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$questionId', status: { $first: '$status' } } },
      { $group: {
        _id: null,
        attempted: { $sum: 1 },
        accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
      } },
    ]);
    const codingScore = codingAgg.length > 0 && codingAgg[0].attempted > 0
      ? Math.round((codingAgg[0].accepted / codingAgg[0].attempted) * 100)
      : null;

    // ── Resume: most recent analysis overallScore ──
    const latestResume = await ResumeAnalysis.findOne({ user: userOid })
      .sort({ createdAt: -1 })
      .select('overallScore')
      .lean();
    const resumeScore = latestResume ? Math.round(latestResume.overallScore) : null;

    // ── Weighted composite with renormalization ──
    const pillars = [
      { key: 'interview', score: interviewScore, weight: 40 },
      { key: 'aptitude', score: aptitudeScore, weight: 30 },
      { key: 'coding', score: codingScore, weight: 20 },
      { key: 'resume', score: resumeScore, weight: 10 },
    ];
    const present = pillars.filter((p) => p.score !== null);
    const totalWeight = present.reduce((sum, p) => sum + p.weight, 0);
    const overall = totalWeight > 0
      ? Math.round(present.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight)
      : 0;

    res.json({
      overall,
      hasAnyData: present.length > 0,
      aptitude: { score: aptitudeScore, weight: 30, answered: aAnswered },
      interview: { score: interviewScore, weight: 40 },
      coding: { score: codingScore, weight: 20 },
      resume: { score: resumeScore, weight: 10 },
    });
  } catch (err) {
    console.error('Readiness score error:', err.message);
    res.status(500).json({ error: 'Failed to compute readiness' });
  }
});

module.exports = router;
