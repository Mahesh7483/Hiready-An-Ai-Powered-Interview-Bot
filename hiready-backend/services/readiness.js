const mongoose = require('mongoose');

/**
 * The one place readiness is computed.
 *
 * It was inlined in routes/readinessRoutes.js, and the Mastery dashboard's
 * "Today's session" card then re-derived the weakest pillar in the browser
 * from the same numbers. Two implementations of one rule is how a student ends
 * up being told to work on aptitude while the score says coding — and, as the
 * README puts it about this exact calculation, they are shown the one that is
 * wrong.
 *
 * GET /api/readiness/me and GET /api/mastery/today now both read from here, so
 * there is one rule and one place to change it.
 *
 * Weights: interview 40, aptitude 30, coding 20, resume 10. A pillar with no
 * data is dropped and the remaining weights renormalise to 100 — a student who
 * has only taken aptitude tests is not punished for the three they have not
 * tried yet.
 */

const WEIGHTS = { interview: 40, aptitude: 30, coding: 20, resume: 10 };

/** Display order, and the order ties break in when picking what to work on. */
const PILLAR_ORDER = ['resume', 'interview', 'coding', 'aptitude'];

async function computeReadiness(userId) {
  const userOid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : userId;

  // eslint-disable-next-line global-require
  const TestResult = require('../models/TestResult');
  // eslint-disable-next-line global-require
  const InterviewSession = require('../models/InterviewSession');
  // eslint-disable-next-line global-require
  const CodingSubmission = require('../models/CodingSubmission');
  // eslint-disable-next-line global-require
  const ResumeAnalysis = require('../models/ResumeAnalysis');

  // ── Aptitude: accuracy over every graded answer ──
  const testResults = await TestResult.find({ userId: userOid }).select('selectedAnswers').lean();
  let aCorrect = 0;
  let aAnswered = 0;
  testResults.forEach((r) => (r.selectedAnswers || []).forEach((a) => {
    if (a.selected) { aAnswered += 1; if (a.isCorrect) aCorrect += 1; }
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
    { key: 'interview', score: interviewScore, weight: WEIGHTS.interview },
    { key: 'aptitude', score: aptitudeScore, weight: WEIGHTS.aptitude },
    { key: 'coding', score: codingScore, weight: WEIGHTS.coding },
    { key: 'resume', score: resumeScore, weight: WEIGHTS.resume },
  ];
  const present = pillars.filter((p) => p.score !== null);
  const totalWeight = present.reduce((sum, p) => sum + p.weight, 0);
  const overall = totalWeight > 0
    ? Math.round(present.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight)
    : 0;

  return {
    overall,
    hasAnyData: present.length > 0,
    aptitude: { score: aptitudeScore, weight: WEIGHTS.aptitude, answered: aAnswered },
    interview: { score: interviewScore, weight: WEIGHTS.interview },
    coding: { score: codingScore, weight: WEIGHTS.coding },
    resume: { score: resumeScore, weight: WEIGHTS.resume },
  };
}

/**
 * Which pillar to work on next.
 *
 * An UNTRIED pillar outranks a merely weak one — you cannot improve what you
 * have not attempted, and a zero you have never scored is not evidence. Among
 * tried pillars the lowest score wins, ties broken by PILLAR_ORDER so the
 * answer is stable rather than dependent on object key order.
 */
function weakestPillar(readiness) {
  const scored = PILLAR_ORDER.map((key) => ({ key, score: readiness[key] ? readiness[key].score : null }));
  const untried = scored.find((p) => p.score === null || p.score === undefined);
  if (untried) return untried.key;
  return scored.reduce((lowest, p) => (p.score < lowest.score ? p : lowest)).key;
}

module.exports = { computeReadiness, weakestPillar, WEIGHTS, PILLAR_ORDER };
