const express = require('express');
const Question = require('../models/Question');
const TestResult = require('../models/TestResult');
const AptitudeAttempt = require('../models/AptitudeAttempt');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { DIFFICULTIES } = require('../utils/constants');

const SUBMISSION_LEASE_DURATION_MS = parseInt(process.env.SUBMISSION_LEASE_DURATION_MS, 10) || 60000;

/**
 * Issues a server-authoritative AptitudeAttempt and returns its id.
 *
 * The id is returned in the RESPONSE BODY, never only in a header. It was
 * briefly sent as X-Attempt-Id, which a cross-origin browser cannot read
 * unless the server lists it in Access-Control-Expose-Headers — so the client
 * silently received null and every graded action failed. The body is not
 * subject to that rule.
 *
 * `questions` must still carry Answer; the caller strips it before responding.
 */
async function issueAptitudeAttempt({ userId, questions, topic, difficulty, mode, negativeMarking }) {
  const answerKey = new Map();
  questions.forEach((q) => {
    answerKey.set(String(q._id), String(q.Answer || '').trim().toUpperCase());
  });
  const attempt = new AptitudeAttempt({
    userId,
    topic: topic || 'logical',
    difficulty: difficulty || '',
    mode: mode === 'practice' ? 'practice' : 'test',
    negativeMarking: Boolean(negativeMarking),
    questionIds: questions.map((q) => q._id),
    answerKey,
    status: 'in_progress',
    keyVersion: 1,
    startedAt: new Date(),
    // Backstop only — the client clock runs the real countdown. save-result
    // refuses an expired attempt, so a tight value here would destroy honest work.
    expiresAt: new Date(Date.now() + (questions.length * 3 + 15) * 60000),
  });
  await attempt.save();
  return String(attempt._id);
}

// Helper to extract authenticated user id from Authorization header if present
function getAuthUserId(req) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      // No `|| 'secret'` fallback: an unset JWT_SECRET must fail closed, not
      // fall back to a literal any attacker can sign with.
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      return decoded.id || decoded.userId || null;
    }
  } catch {
    // ignore
  }
  return null;
}

// POST /api/questions/quiz/start — starts a server-authoritative quiz attempt session
router.post('/quiz/start', requireAuth, async (req, res) => {
  try {
    const { topic, count = 10, difficulty, mode, negativeMarking } = req.body;
    const requestedCount = Math.min(Math.max(parseInt(count, 10) || 10, 1), 50);

    const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const requestedSlug = slugify(topic);

    const allCategories = await Question.distinct('category');
    const isMixed = requestedSlug === 'all' || requestedSlug === 'mixed' || !topic;
    const resolvedCategory = isMixed
      ? null
      : allCategories.find((c) => slugify(c) === requestedSlug) || topic;

    const baseMatch = resolvedCategory ? { category: resolvedCategory } : {};

    let docs = [];
    if (difficulty) {
      docs = await Question.aggregate([
        { $match: { ...baseMatch, difficulty } },
        { $sample: { size: requestedCount } }
      ]);
    }
    if (docs.length < requestedCount) {
      const excludeIds = docs.map((q) => q._id);
      const remaining = requestedCount - docs.length;
      const fill = await Question.aggregate([
        { $match: { ...baseMatch, _id: { $nin: excludeIds } } },
        { $sample: { size: remaining } }
      ]);
      docs = [...docs, ...fill];
    }
    if (docs.length < requestedCount && resolvedCategory) {
      const excludeIds = docs.map((q) => q._id);
      const remaining = requestedCount - docs.length;
      const fill = await Question.aggregate([
        { $match: { _id: { $nin: excludeIds } } },
        { $sample: { size: remaining } }
      ]);
      docs = [...docs, ...fill];
    }

    if (docs.length === 0) {
      return res.status(404).json({ error: 'No questions available to start attempt' });
    }

    const questionIds = docs.map((q) => q._id);
    const answerKey = new Map();
    docs.forEach((q) => {
      answerKey.set(String(q._id), String(q.Answer || '').trim().toUpperCase());
    });

    const attempt = new AptitudeAttempt({
      userId: req.user.id,
      topic: resolvedCategory || topic || 'logical',
      difficulty: difficulty || '',
      mode: mode === 'practice' ? 'practice' : 'test',
      negativeMarking: Boolean(negativeMarking),
      questionIds,
      answerKey,
      status: 'in_progress',
      keyVersion: 1,
      startedAt: new Date(),
      // Same backstop as the auto-issued path: an attempt left open cannot be
      // revived days later with the answers looked up in between. Generous,
      // because save-result refuses an expired attempt and a tight value here
      // would destroy honest work.
      expiresAt: new Date(Date.now() + (questionIds.length * 3 + 15) * 60000)
    });

    await attempt.save();

    const sanitizedQuestions = docs.map((q) => {
      const { Answer, Explanation, ...safe } = q;
      return safe;
    });

    res.status(201).json({
      attemptId: attempt._id,
      topic: attempt.topic,
      difficulty: attempt.difficulty,
      mode: attempt.mode,
      negativeMarking: attempt.negativeMarking,
      totalQuestions: questionIds.length,
      questions: sanitizedQuestions
    });
  } catch (err) {
    console.error('Start quiz attempt error:', err.message);
    res.status(500).json({ error: 'Failed to start quiz attempt' });
  }
});

// GET random quiz by category (supports ?count=N&difficulty=X)
// Keeps backwards compatibility: /quiz/logical still works with default 10
// Category is resolved flexibly: "quantitative", "Quantitative Aptitude",
// "quantitative-aptitude" all match the stored category name.
// Requires auth: an open question feed lets anyone enumerate the bank, and
// pairs with a graded attempt that must belong to a known user.
router.get('/quiz/:category', requireAuth, async (req, res) => {
  try {
    const count = Math.min(Math.max(parseInt(req.query.count) || 10, 1), 50);
    const { difficulty, negativeMarking, mode } = req.query;

    const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const requestedSlug = slugify(req.params.category);

    // Resolve the requested topic against the categories that actually exist.
    // "all" = mixed quiz with no category filter.
    const allCategories = await Question.distinct('category');
    const isMixed = requestedSlug === 'all' || requestedSlug === 'mixed';
    const resolved = isMixed ? null : allCategories.find((c) => slugify(c) === requestedSlug) || req.params.category;

    const baseMatch = resolved ? { category: resolved } : {};

    // Fetch full question documents (including Answer for server-authoritative key lock)
    let questions = [];
    if (difficulty) {
      questions = await Question.aggregate([
        { $match: { ...baseMatch, difficulty } },
        { $sample: { size: count } },
      ]);
    }
    if (questions.length < count) {
      const excludeIds = questions.map((q) => q._id);
      const remaining = count - questions.length;
      const fill = await Question.aggregate([
        { $match: { ...baseMatch, _id: { $nin: excludeIds } } },
        { $sample: { size: remaining } },
      ]);
      questions = [...questions, ...fill];
    }

    const attemptId = await issueAptitudeAttempt({
      userId: req.user.id,
      questions,
      topic: resolved || req.params.category,
      difficulty,
      mode,
      negativeMarking: negativeMarking === 'true' || negativeMarking === '1',
    });

    // Answer and Explanation never cross this line.
    const sanitized = questions.map((q) => {
      const { Answer, Explanation, ...safe } = q;
      return safe;
    });

    res.json({ attemptId, questions: sanitized });
  } catch (err) {
    console.error('Quiz fetch error:', err.message);
    res.status(500).json({ error: 'Failed to load questions' });
  }
});


// GET adaptive quiz by category — difficulty adapts to the caller's history.
// Recent accuracy decides the starting level, then the batch follows a gentle
// ladder (up after strong streaks, down after misses) so the set stays at the
// edge of the user's ability. Answers are never exposed.
router.get('/quiz/:category/adaptive', requireAuth, async (req, res) => {
  try {
    const count = Math.min(Math.max(parseInt(req.query.count) || 10, 1), 50);

    const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const requestedSlug = slugify(req.params.category);
    const allCategories = await Question.distinct('category');
    const isMixed = requestedSlug === 'all' || requestedSlug === 'mixed';
    const resolved = isMixed ? null : allCategories.find((c) => slugify(c) === requestedSlug) || req.params.category;
    const baseMatch = resolved ? { category: resolved } : {};

    // Recent performance (last 20 results) → starting difficulty
    const recent = await TestResult.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('selectedAnswers')
      .lean();
    let correct = 0;
    let answered = 0;
    recent.forEach((r) => (r.selectedAnswers || []).forEach((a) => {
      if (a.selected) { answered++; if (a.isCorrect) correct++; }
    }));
    const accuracy = answered > 0 ? correct / answered : 0.5;

    const order = DIFFICULTIES;
    const startLevel = accuracy >= 0.8 ? 2 : accuracy >= 0.5 ? 1 : 0;

    // Gentle ladder: hold each level for 2 questions, then drift up when the
    // caller is strong and down when they are struggling.
    let level = startLevel;
    const ladder = [];
    for (let i = 0; i < count; i++) {
      ladder.push(order[level]);
      if ((i + 1) % 2 === 0) {
        if (accuracy >= 0.7 && level < 2) level++;
        else if (accuracy < 0.4 && level > 0) level--;
      }
    }

    // Serve per-difficulty with no repeats; fall back to any difficulty if a
    // rung of the ladder has a thin pool.
    const seen = new Set();
    const questions = [];
    for (const diff of ladder) {
      if (questions.length >= count) break;
      const pool = await Question.aggregate([
        { $match: { ...baseMatch, difficulty: diff, _id: { $nin: [...seen] } } },
        { $sample: { size: count - questions.length } },
        { $project: { Answer: 0 } },
      ]);
      pool.forEach((q) => { seen.add(q._id); if (questions.length < count) questions.push(q); });
    }
    if (questions.length < count) {
      const fill = await Question.aggregate([
        { $match: { ...baseMatch, _id: { $nin: [...seen] } } },
        { $sample: { size: count - questions.length } },
        { $project: { Answer: 0 } },
      ]);
      fill.forEach((q) => { seen.add(q._id); if (questions.length < count) questions.push(q); });
    }

    // This route projects Answer out of its samples, so it had no key to lock
    // and issued no attempt at all — adaptive runs could never be graded.
    // Re-read just the keys for the chosen ids, then issue.
    const withKeys = await Question.find({ _id: { $in: questions.map((q) => q._id) } })
      .select('_id Answer')
      .lean();
    const attemptId = await issueAptitudeAttempt({
      userId: req.user.id,
      questions: withKeys,
      topic: req.params.category,
      difficulty: '',
      mode: req.query.mode,
      negativeMarking: req.query.negativeMarking === 'true' || req.query.negativeMarking === '1',
    });

    res.json({
      attemptId,
      startDifficulty: order[startLevel],
      recentAccuracy: Math.round(accuracy * 100),
      questions,
    });
  } catch (err) {
    console.error('Adaptive quiz error:', err.message);
    res.status(500).json({ error: 'Failed to load adaptive questions' });
  }
});


// Submit quiz — optional negative marking (-0.25 per wrong answer)
/*
 * REMOVED: POST /quiz/submit
 *
 * It took an arbitrary list of questionIds — bound to no attempt, from any
 * caller, with NO requireAuth — and returned `correctAnswer` for every one of
 * them. Combined with the equally open GET /quiz/:category it was a complete
 * answer key, readable by anyone who could reach the server, logged in or not.
 *
 * Grading now happens in exactly one place: POST /quiz/save-result, which binds
 * to a server-issued attempt, verifies ownership and expiry, iterates the
 * server-locked questionIds, and ignores any score the client sends.
 *
 * Practice mode's per-question feedback is served by
 * POST /quiz/attempt/:attemptId/reveal below, which discloses ONE answer, only
 * from the caller's own in-progress PRACTICE attempt.
 */

/*
 * REMOVED: POST /quiz/attempt/:attemptId/reveal
 *
 * It existed to give practice mode per-question feedback after the open
 * answer-key oracle was deleted. Practice no longer reveals answers mid-run at
 * all — you answer every question, submit, and review the whole thing against
 * the server's grading, exactly as a test works minus the timer and the
 * proctoring. That removes a reveal path entirely rather than guarding one,
 * and removes the mid-attempt network call that could strand a session.
 */

// GET /api/questions/leaderboard?range=week|all — top users by accuracy
router.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const range = req.query.range === 'week' ? 'week' : 'all';
    const match = range === 'week'
      ? { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) }, mode: 'test' }
      : {};

    const rows = await TestResult.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$userId',
          tests: { $sum: 1 },
          totalScore: { $sum: '$score' },
          totalQuestions: { $sum: '$totalQuestions' },
          bestScorePct: {
            $max: {
              $cond: [
                { $gt: ['$totalQuestions', 0] },
                { $multiply: [{ $divide: ['$score', '$totalQuestions'] }, 100] },
                0
              ]
            }
          }
        }
      },
      { $match: { totalQuestions: { $gt: 0 } } },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          tests: 1,
          accuracy: {
            $round: [{ $multiply: [{ $divide: ['$totalScore', '$totalQuestions'] }, 100] }, 1]
          },
          bestScorePct: { $round: ['$bestScorePct', 1] }
        }
      },
      { $sort: { accuracy: -1, tests: -1 } },
      { $limit: 25 }
    ]);

    // Attach names (and flag the caller's row when authenticated)
    const User = require('../models/User');
    const populated = await Promise.all(
      rows.map(async (row, idx) => {
        let name = 'Anonymous';
        let isCaller = false;
        try {
          const user = await User.findById(row.userId).select('name email').lean();
          if (user) {
            name = user.name || (user.email ? user.email.split('@')[0] : name);
            if (req.user && String(req.user.id) === String(row.userId)) isCaller = true;
          }
        } catch { /* keep anonymous */ }
        return { rank: idx + 1, name, tests: row.tests, accuracy: row.accuracy, bestScorePct: row.bestScorePct, isCaller };
      })
    );

    res.json({ range, leaderboard: populated });
  } catch (err) {
    console.error('Leaderboard error:', err.message);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// GET /api/questions/wrong-answers/me — questions this user got wrong, with explanations
router.get('/wrong-answers/me', requireAuth, async (req, res) => {
  try {
    const userObjId = mongoose.Types.ObjectId.isValid(req.user.id) ? new mongoose.Types.ObjectId(String(req.user.id)) : req.user.id;
    const wrong = await TestResult.aggregate([
      { $match: { userId: userObjId } },
      { $unwind: '$selectedAnswers' },
      {
        $match: {
          'selectedAnswers.isCorrect': false,
          'selectedAnswers.selected': { $ne: '' }
        }
      },
      // Latest attempt wins per question
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$selectedAnswers.questionId',
          selected: { $first: '$selectedAnswers.selected' },
          correctAnswer: { $first: '$selectedAnswers.correctAnswer' },
          lastWrongAt: { $first: '$createdAt' },
          timesWrong: { $sum: 1 }
        }
      },
      { $sort: { timesWrong: -1, lastWrongAt: -1 } },
      { $limit: 50 }
    ]);

    // Join question text/options/explanations
    const ids = wrong.map((w) => w._id).filter((id) => mongoose.Types.ObjectId.isValid(id));
    const questions = ids.length
      ? await Question.find({ _id: { $in: ids } }).lean()
      : [];
    const qMap = new Map(questions.map((q) => [String(q._id), q]));

    const items = wrong
      .filter((w) => qMap.has(String(w._id)))
      .map((w) => {
        const q = qMap.get(String(w._id));
        return {
          questionId: w._id,
          question: q.Question,
          options: {
            A: q['Option A'],
            B: q['Option B'],
            C: q['Option C'],
            D: q['Option D']
          },
          correctAnswer: q.Answer,
          explanation: (q.Explanation || '').trim(),
          topic: q.category || 'general',
          difficulty: q.difficulty || '',
          yourAnswer: w.selected,
          timesWrong: w.timesWrong,
          lastWrongAt: w.lastWrongAt
        };
      });

    res.json({ items });
  } catch (err) {
    console.error('Wrong answers error:', err.message);
    res.status(500).json({ error: 'Failed to load wrong answers' });
  }
});


// Save test result for analytics — ZERO CLIENT TRUST
router.post('/quiz/save-result', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    // CRITICAL: Any score, total, totalQuestions, isCorrect, or percentage in req.body is completely ignored.
    const { attemptId, sessionId, answers, selectedAnswers, warningCount, timeTaken, preset } = req.body;

    const rawAttemptId = attemptId || sessionId;
    if (!rawAttemptId || !mongoose.Types.ObjectId.isValid(rawAttemptId)) {
      return res.status(400).json({ error: 'Valid attemptId is required' });
    }

    // 1. Strictly reference an active, server-issued attempt ID
    const attempt = await AptitudeAttempt.findById(rawAttemptId);
    if (!attempt) {
      return res.status(400).json({ error: 'Attempt ID not found' });
    }

    // Verify ownership: foreign attempt returns HTTP 403
    if (String(attempt.userId) !== String(userId)) {
      return res.status(403).json({ error: 'Unauthorized: attempt belongs to a different user' });
    }

    // Check expiration where applicable
    if (attempt.expiresAt && attempt.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Attempt has expired' });
    }

    // Check if result already exists (repeated submission / idempotent return / crash recovery)
    // Verify attempt AND owner linkage before returning or reconciling
    const existingResult = await TestResult.findOne({ attemptId: rawAttemptId, userId });
    if (existingResult) {
      if (attempt.status !== 'completed') {
        await AptitudeAttempt.updateOne(
          { _id: rawAttemptId, userId },
          { $set: { status: 'completed', leaseToken: null, leaseExpiresAt: null, completedAt: existingResult.serverGradedAt || new Date() } }
        );
      }
      return res.status(409).json({
        error: 'This attempt has already been submitted and graded',
        resultId: existingResult._id,
        score: existingResult.score,
        totalQuestions: existingResult.totalQuestions
      });
    }

    // 2. Fail-closed on answers payload: empty array or missing answers must immediately reject
    const submittedAnswers = answers || selectedAnswers;
    if (!Array.isArray(submittedAnswers) || submittedAnswers.length === 0) {
      return res.status(400).json({ error: 'answers must be a non-empty array' });
    }

    // 3. Verify all submitted question IDs: must be valid ObjectIds, no duplicates, no foreign IDs
    const issuedIdSet = new Set(attempt.questionIds.map((id) => String(id)));
    const seenQids = new Set();
    const submissionMap = new Map();

    for (const item of submittedAnswers) {
      const qid = String(item && item.questionId ? item.questionId : '').trim();
      if (!qid || !mongoose.Types.ObjectId.isValid(qid)) {
        return res.status(400).json({ error: 'Invalid questionId format in submission' });
      }

      // Check for duplicate question IDs in payload
      if (seenQids.has(qid)) {
        return res.status(400).json({ error: `Duplicate questionId detected in submission: ${qid}` });
      }
      seenQids.add(qid);

      // Check that question ID exists in the server-issued attempt set
      if (!issuedIdSet.has(qid)) {
        return res.status(400).json({ error: `Foreign questionId not part of issued attempt: ${qid}` });
      }

      submissionMap.set(qid, item);
    }

    // Concurrency & Lease Acquisition with Fencing Token:
    // Atomic acquisition of lock: either attempt is 'in_progress', OR 'submitting' with leaseExpiresAt < now
    // (recovering from an abandoned lock due to node crash/termination).
    // Generates a dedicated currentLeaseToken to fence out delayed workers.
    const currentLeaseToken = crypto.randomUUID();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + SUBMISSION_LEASE_DURATION_MS);

    const lock = await AptitudeAttempt.findOneAndUpdate(
      {
        _id: rawAttemptId,
        userId,
        $or: [
          { status: 'in_progress' },
          { status: 'submitting', leaseExpiresAt: { $lt: now } }
        ]
      },
      {
        $set: {
          status: 'submitting',
          leaseToken: currentLeaseToken,
          leaseExpiresAt
        }
      },
      { new: true }
    );
    if (!lock) {
      return res.status(409).json({ error: 'Submission already in progress or completed' });
    }

    // Test hook for concurrency and worker lease race verification — strictly restricted to test environment
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-pause-before-commit-ms']) {
      const pauseMs = Math.min(5000, parseInt(req.headers['x-test-pause-before-commit-ms'], 10) || 0);
      if (pauseMs > 0) {
        await new Promise((r) => setTimeout(r, pauseMs));
      }
    }

    // 4. Server-authoritative scoring:
    // Score = max(0, N_correct - (lambda * N_wrong))
    // lambda = 0.25 if negativeMarking is enabled, else 0.
    // Unanswered/omitted answers contribute 0 marks and 0 deduction.
    const lambda = attempt.negativeMarking ? 0.25 : 0;
    let nCorrect = 0;
    let nWrong = 0;
    let nUnanswered = 0;
    const safeAnswers = [];

    // Iterate across server-locked questionIds to guarantee denominator and order
    for (const idObj of attempt.questionIds) {
      const qid = String(idObj);
      const subItem = submissionMap.get(qid);
      const expectedAnswer = (attempt.answerKey instanceof Map
        ? attempt.answerKey.get(qid)
        : attempt.answerKey[qid]) || '';

      const selected = subItem && subItem.selected != null ? String(subItem.selected).trim().toUpperCase() : '';
      let isCorrect = false;

      if (!selected || selected === 'OMITTED') {
        nUnanswered++;
      } else if (selected === expectedAnswer) {
        nCorrect++;
        isCorrect = true;
      } else {
        nWrong++;
        isCorrect = false;
      }

      safeAnswers.push({
        questionId: qid,
        selected,
        correctAnswer: expectedAnswer,
        isCorrect,
        timeSpentMs: Number.isFinite(subItem && subItem.timeSpentMs)
          ? Math.max(0, Math.min(Math.round(subItem.timeSpentMs), 30 * 60 * 1000))
          : null
      });
    }

    // Calculate score
    const rawScore = nCorrect - (lambda * nWrong);
    const finalScore = Math.max(0, Math.round(rawScore * 100) / 100);

    // Denominator is STRICTLY derived from server attempt question count, NEVER client-reported length
    const totalQuestions = attempt.questionIds.length;
    const percentage = totalQuestions > 0 ? Math.round((finalScore / totalQuestions) * 10000) / 100 : 0;

    // 5. Save immutable audit record in TestResult BEFORE marking attempt as completed
    const testResult = new TestResult({
      attemptId: attempt._id,
      userId,
      score: finalScore,
      totalQuestions,
      percentage,
      markingMode: attempt.negativeMarking ? 'negative_0.25' : 'standard',
      keyVersion: attempt.keyVersion || 1,
      serverGradedAt: new Date(),
      mode: attempt.mode,
      topic: attempt.topic,
      difficulty: attempt.difficulty,
      warningCount: Number.isFinite(warningCount) ? warningCount : 0,
      negativeMarking: attempt.negativeMarking,
      preset: typeof preset === 'string' ? preset.slice(0, 60) : '',
      timeTaken,
      selectedAnswers: safeAnswers,
      audit: {
        attemptId: String(attempt._id),
        userId: String(userId),
        score: finalScore,
        total: totalQuestions,
        percentage,
        breakdown: {
          nCorrect,
          nWrong,
          nUnanswered,
          lambda
        },
        timestamp: new Date().toISOString(),
        markingMode: attempt.negativeMarking ? 'negative_0.25' : 'standard',
        keyVersion: attempt.keyVersion || 1
      }
    });

    // 5 & 6. Transactional Persistence: Wrap TestResult save and AptitudeAttempt status update
    // in a formal MongoDB session transaction with worker lease fencing and automatic rollback.
    let session = null;
    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        await testResult.save({ session });
        const updateRes = await AptitudeAttempt.updateOne(
          { _id: rawAttemptId, leaseToken: currentLeaseToken, status: 'submitting' },
          { $set: { status: 'completed', leaseToken: null, leaseExpiresAt: null, completedAt: new Date() } },
          { session }
        );
        if (updateRes.matchedCount === 0) {
          const fencingErr = new Error('Submission lease expired and was superseded by another worker');
          fencingErr.name = 'LeaseFencingError';
          throw fencingErr;
        }
      });
    } catch (txErr) {
      if (txErr.name === 'LeaseFencingError') {
        return res.status(409).json({ error: 'Submission lease expired and was superseded by another worker' });
      }

      // Check if transactions are unsupported on this MongoDB deployment (e.g., standalone local Mongo)
      const isStandaloneOrUnsupported =
        txErr.code === 20 ||
        txErr.codeName === 'IllegalOperation' ||
        /replica set/i.test(txErr.message) ||
        /transactions are not supported/i.test(txErr.message) ||
        /transaction numbers are only allowed/i.test(txErr.message);

      if (isStandaloneOrUnsupported) {
        // Fallback: Two-phase update pattern with token fencing and explicit rollback cleanup
        try {
          await testResult.save();
          try {
            const fallbackUpdate = await AptitudeAttempt.updateOne(
              { _id: rawAttemptId, leaseToken: currentLeaseToken, status: 'submitting' },
              { $set: { status: 'completed', leaseToken: null, leaseExpiresAt: null, completedAt: new Date() } }
            );
            if (fallbackUpdate.matchedCount === 0) {
              await TestResult.deleteOne({ _id: testResult._id }).catch(() => {});
              return res.status(409).json({ error: 'Submission lease expired and was superseded by another worker' });
            }
          } catch (updateErr) {
            // Rollback: delete orphaned testResult and revert attempt status ONLY if we still hold the leaseToken
            await TestResult.deleteOne({ _id: testResult._id }).catch(() => {});
            await AptitudeAttempt.updateOne(
              { _id: rawAttemptId, leaseToken: currentLeaseToken },
              { $set: { status: 'in_progress', leaseToken: null, leaseExpiresAt: null } }
            ).catch(() => {});
            throw updateErr;
          }
        } catch (saveErr) {
          if (saveErr.code === 11000) {
            return res.status(409).json({ error: 'Duplicate result submission for this attempt' });
          }
          await AptitudeAttempt.updateOne(
            { _id: rawAttemptId, leaseToken: currentLeaseToken },
            { $set: { status: 'in_progress', leaseToken: null, leaseExpiresAt: null } }
          ).catch(() => {});
          throw saveErr;
        }
      } else {
        // Transaction failed in replica-set environment (duplicate key, transient abort, or write failure)
        if (txErr.code === 11000) {
          return res.status(409).json({ error: 'Duplicate result submission for this attempt' });
        }
        // Revert attempt status back to 'in_progress' ONLY IF our leaseToken is still valid
        await AptitudeAttempt.updateOne(
          { _id: rawAttemptId, leaseToken: currentLeaseToken },
          { $set: { status: 'in_progress', leaseToken: null, leaseExpiresAt: null } }
        ).catch(() => {});
        throw txErr;
      }
    } finally {
      if (session) {
        await session.endSession().catch(() => {});
      }
    }

    // Percentile computation
    let percentile = null;
    try {
      const betterCount = await TestResult.countDocuments({
        topic: attempt.topic,
        $expr: { $gt: [{ $divide: ['$score', '$totalQuestions'] }, { $divide: [finalScore, totalQuestions] }] }
      });
      const totalCount = await TestResult.countDocuments({ topic: attempt.topic, totalQuestions: { $gt: 0 } });
      percentile = totalCount > 1 ? Math.round((betterCount / totalCount) * 100) : null;
    } catch { /* non-critical */ }

    res.json({
      success: true,
      id: testResult._id,
      attemptId: attempt._id,
      score: finalScore,
      totalQuestions,
      percentage,
      breakdown: {
        correct: nCorrect,
        wrong: nWrong,
        unanswered: nUnanswered,
        negativeMarking: attempt.negativeMarking,
        lambda
      },
      percentile,
      results: safeAnswers
    });
  } catch (err) {
    console.error('Save result error:', err.message);
    res.status(500).json({ error: 'Failed to save result' });
  }
});

// Test-only baseline controller endpoint (Arm 2 evaluation: matched application checks WITHOUT worker lease fencing)
// CRITICAL: This controller is architecturally identical to the contract controller above, with ONE difference:
// - No leaseToken is generated, stored, or checked on the completion write.
// - Lock admission, write ordering (TestResult first → completion second), duplicate handling (409),
//   and rollback behavior are all identical to the contract controller.
// This isolation ensures the 3-arm comparison measures ONLY the contribution of lease fencing.
if (process.env.NODE_ENV === 'test') {
  router.post('/quiz/save-result-baseline', requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const { attemptId, sessionId, answers, selectedAnswers, warningCount, timeTaken, preset } = req.body;
      const rawAttemptId = attemptId || sessionId;
      if (!rawAttemptId || !mongoose.Types.ObjectId.isValid(rawAttemptId)) {
        return res.status(400).json({ error: 'Valid attemptId is required' });
      }
      const attempt = await AptitudeAttempt.findById(rawAttemptId);
      if (!attempt) return res.status(400).json({ error: 'Attempt ID not found' });
      if (String(attempt.userId) !== String(userId)) {
        return res.status(403).json({ error: 'Unauthorized: attempt belongs to a different user' });
      }
      if (attempt.expiresAt && attempt.expiresAt < new Date()) {
        return res.status(400).json({ error: 'Attempt has expired' });
      }

      // Check if result already exists (same as contract — returns 409 with reconciliation)
      const existingResult = await TestResult.findOne({ attemptId: rawAttemptId, userId });
      if (existingResult) {
        if (attempt.status !== 'completed') {
          await AptitudeAttempt.updateOne(
            { _id: rawAttemptId, userId },
            { $set: { status: 'completed', completedAt: existingResult.serverGradedAt || new Date() } }
          );
        }
        return res.status(409).json({
          error: 'This attempt has already been submitted and graded',
          resultId: existingResult._id,
          score: existingResult.score,
          totalQuestions: existingResult.totalQuestions
        });
      }

      const submittedAnswers = answers || selectedAnswers;
      if (!Array.isArray(submittedAnswers) || submittedAnswers.length === 0) {
        return res.status(400).json({ error: 'answers must be a non-empty array' });
      }
      const issuedIdSet = new Set(attempt.questionIds.map((id) => String(id)));
      const seenQids = new Set();
      const submissionMap = new Map();
      for (const item of submittedAnswers) {
        const qid = String(item && item.questionId ? item.questionId : '').trim();
        if (!qid || !mongoose.Types.ObjectId.isValid(qid)) {
          return res.status(400).json({ error: 'Invalid questionId format in submission' });
        }
        if (seenQids.has(qid)) {
          return res.status(400).json({ error: `Duplicate questionId detected in submission: ${qid}` });
        }
        seenQids.add(qid);
        if (!issuedIdSet.has(qid)) {
          return res.status(400).json({ error: `Foreign questionId not part of issued attempt: ${qid}` });
        }
        submissionMap.set(qid, item);
      }

      // Lock Acquisition — MATCHED to contract controller's $or admission logic,
      // but WITHOUT generating or storing a leaseToken.
      // Both arms allow takeover of 'submitting' attempts with expired leases.
      const now = new Date();
      const lock = await AptitudeAttempt.findOneAndUpdate(
        {
          _id: rawAttemptId,
          userId,
          $or: [
            { status: 'in_progress' },
            { status: 'submitting', leaseExpiresAt: { $lt: now } }
          ]
        },
        {
          $set: {
            status: 'submitting',
            // NO leaseToken set — this is the critical architectural difference
            leaseExpiresAt: new Date(now.getTime() + 60000)
          }
        },
        { new: true }
      );
      if (!lock) {
        return res.status(409).json({ error: 'Submission already in progress or completed' });
      }

      // Test hook for concurrency pause (same as contract)
      if (req.headers['x-test-pause-before-commit-ms']) {
        const pauseMs = Math.min(5000, parseInt(req.headers['x-test-pause-before-commit-ms'], 10) || 0);
        if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
      }

      // Server-authoritative scoring (identical to contract)
      const lambda = attempt.negativeMarking ? 0.25 : 0;
      let nCorrect = 0, nWrong = 0, nUnanswered = 0;
      const safeAnswers = [];
      for (const idObj of attempt.questionIds) {
        const qid = String(idObj);
        const subItem = submissionMap.get(qid);
        const expectedAnswer = (attempt.answerKey instanceof Map
          ? attempt.answerKey.get(qid)
          : attempt.answerKey[qid]) || '';
        const selected = subItem && subItem.selected != null ? String(subItem.selected).trim().toUpperCase() : '';
        let isCorrect = false;
        if (!selected || selected === 'OMITTED') {
          nUnanswered++;
        } else if (selected === expectedAnswer) {
          nCorrect++;
          isCorrect = true;
        } else {
          nWrong++;
          isCorrect = false;
        }
        safeAnswers.push({
          questionId: qid,
          selected,
          correctAnswer: expectedAnswer,
          isCorrect,
          timeSpentMs: Number.isFinite(subItem && subItem.timeSpentMs)
            ? Math.max(0, Math.min(Math.round(subItem.timeSpentMs), 30 * 60 * 1000))
            : null
        });
      }
      const rawScore = nCorrect - (lambda * nWrong);
      const finalScore = Math.max(0, Math.round(rawScore * 100) / 100);
      const totalQuestions = attempt.questionIds.length;
      const percentage = totalQuestions > 0 ? Math.round((finalScore / totalQuestions) * 10000) / 100 : 0;

      // Save TestResult FIRST (matched write ordering with contract)
      const testResult = new TestResult({
        attemptId: attempt._id,
        userId,
        score: finalScore,
        totalQuestions,
        percentage,
        markingMode: attempt.negativeMarking ? 'negative_0.25' : 'standard',
        keyVersion: attempt.keyVersion || 1,
        serverGradedAt: new Date(),
        mode: attempt.mode,
        topic: attempt.topic,
        difficulty: attempt.difficulty,
        warningCount: Number.isFinite(warningCount) ? warningCount : 0,
        negativeMarking: attempt.negativeMarking,
        preset: typeof preset === 'string' ? preset.slice(0, 60) : '',
        timeTaken,
        selectedAnswers: safeAnswers,
        audit: {
          attemptId: String(attempt._id),
          userId: String(userId),
          score: finalScore,
          total: totalQuestions,
          percentage,
          breakdown: { nCorrect, nWrong, nUnanswered, lambda },
          timestamp: new Date().toISOString(),
          markingMode: attempt.negativeMarking ? 'negative_0.25' : 'standard',
          keyVersion: attempt.keyVersion || 1
        }
      });

      // Persistence WITHOUT worker lease fencing
      // Baseline uses standard un-fenced update by attemptId without token-conditioned CAS
      try {
        const resultData = testResult.toObject();
        delete resultData._id;
        const savedResult = await TestResult.findOneAndUpdate(
          { attemptId: attempt._id },
          { $set: resultData },
          { upsert: true, new: true, runValidators: true }
        );

        // UN-FENCED completion write: updates by _id only without leaseToken check!
        // This allows a delayed worker to overwrite concurrent state changes without detection.
        await AptitudeAttempt.updateOne(
          { _id: rawAttemptId },
          { $set: { status: 'completed', leaseExpiresAt: null, completedAt: new Date() } }
        );
      } catch (err) {
        // Rollback: delete orphaned testResult and revert attempt status (un-fenced)
        await TestResult.deleteOne({ attemptId: rawAttemptId }).catch(() => {});
        await AptitudeAttempt.updateOne(
          { _id: rawAttemptId },
          { $set: { status: 'in_progress', leaseExpiresAt: null } }
        ).catch(() => {});
        console.error('Baseline save result error:', err.message);
        return res.status(500).json({ error: 'Failed to save result' });
      }

      // Percentile computation (identical to contract)
      let percentile = null;
      try {
        const betterCount = await TestResult.countDocuments({
          topic: attempt.topic,
          $expr: { $gt: [{ $divide: ['$score', '$totalQuestions'] }, { $divide: [finalScore, totalQuestions] }] }
        });
        const totalCount = await TestResult.countDocuments({ topic: attempt.topic, totalQuestions: { $gt: 0 } });
        percentile = totalCount > 1 ? Math.round((betterCount / totalCount) * 100) : null;
      } catch { /* non-critical */ }

      return res.json({
        success: true,
        id: testResult._id,
        attemptId: attempt._id,
        score: finalScore,
        totalQuestions,
        percentage,
        breakdown: {
          correct: nCorrect,
          wrong: nWrong,
          unanswered: nUnanswered,
          negativeMarking: attempt.negativeMarking,
          lambda
        },
        percentile,
        results: safeAnswers,
        baseline: true
      });
    } catch (err) {
      console.error('Baseline save result error:', err.message);
      return res.status(500).json({ error: 'Failed to save result' });
    }
  });
}

// GET /api/questions/quiz/result/:id — retrieve single test result with strict ownership check
router.get('/quiz/result/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid result ID format' });
    }
    const result = await TestResult.findById(id).lean();
    if (!result) {
      return res.status(404).json({ error: 'Test result not found' });
    }
    if (String(result.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized: result belongs to a different user' });
    }
    res.json(result);
  } catch (err) {
    console.error('Fetch result error:', err.message);
    res.status(500).json({ error: 'Failed to fetch result' });
  }
});


// GET my test history (dates + scores) — powers streaks and activity feeds
router.get('/history/me', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const items = await TestResult.find({ userId: req.user.id })
      .select('score totalQuestions mode topic createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ items });
  } catch (err) {
    console.error('Test history error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Phase 1: per-question time insights ──────────────────────────────────────
// Derives pacing patterns from the timeSpentMs already stored on every answer.
// FAST_WRONG_MS: answered quicker than this AND wrong → rushed/guessed.
// SLOW_CORRECT_MS: took longer than this AND correct → struggled but got there.
const FAST_WRONG_MS = 15_000;
const SLOW_CORRECT_MS = 45_000;

function computeTimeInsights(results) {
  let correctMs = 0;
  let correctN = 0;
  let wrongMs = 0;
  let wrongN = 0;
  let fastWrongCount = 0;
  let slowCorrectCount = 0;
  let noAnswerCount = 0;
  const topicMap = {};

  results.forEach((r) => {
    const topic = r.topic || 'logical';
    if (!topicMap[topic]) topicMap[topic] = { totalMs: 0, timed: 0, correct: 0, answered: 0 };
    const t = topicMap[topic];

    r.selectedAnswers.forEach((a) => {
      const ms = Number(a.timeSpentMs);
      const timed = Number.isFinite(ms) && ms > 0;
      const hasAnswer = Boolean(a.selected);

      if (!hasAnswer) {
        noAnswerCount++;
      } else {
        t.answered++;
        if (a.isCorrect) {
          t.correct++;
          if (timed) {
            correctMs += ms;
            correctN++;
            t.totalMs += ms;
            t.timed++;
            if (ms > SLOW_CORRECT_MS) slowCorrectCount++;
          }
        } else {
          if (timed) {
            wrongMs += ms;
            wrongN++;
            t.totalMs += ms;
            t.timed++;
            if (ms < FAST_WRONG_MS) fastWrongCount++;
          }
        }
      }
    });
  });

  const perTopic = Object.entries(topicMap).map(([topic, t]) => ({
    topic,
    avgMs: t.timed > 0 ? Math.round(t.totalMs / t.timed) : 0,
    accuracy: t.answered > 0 ? Math.round((t.correct / t.answered) * 100) : 0,
  }));

  return {
    avgCorrectMs: correctN > 0 ? Math.round(correctMs / correctN) : 0,
    avgWrongMs: wrongN > 0 ? Math.round(wrongMs / wrongN) : 0,
    fastWrongCount,
    slowCorrectCount,
    noAnswerCount,
    perTopic,
  };
}

// GET analytics for the authenticated user (userId in the path is ignored — token wins)
router.get(['/analytics/:userId', '/analytics/me'], requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const results = await TestResult.find({ userId }).sort({ createdAt: 1 });

    if (results.length === 0) {
      return res.json({
        totalTests: 0,
        avgScore: 0,
        accuracy: 0,
        avgTimePerQuestion: 0,
        topicPerformance: [],
        progressOverTime: [],
        correctCount: 0,
        wrongCount: 0,
        timeInsights: computeTimeInsights([]),
      });
    }

    const totalTests = results.length;
    let totalCorrect = 0;
    let totalAnswered = 0;
    let totalQuestions = 0;
    let totalTimeSeconds = 0;

    // Topic aggregation
    const topicMap = {};

    results.forEach((r) => {
      totalQuestions += r.totalQuestions;

      // Parse timeTaken "MM:SS" to seconds
      if (r.timeTaken) {
        const parts = r.timeTaken.split(':');
        if (parts.length === 2) {
          totalTimeSeconds += parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
      }

      r.selectedAnswers.forEach((a) => {
        totalAnswered++;
        if (a.isCorrect) totalCorrect++;
      });

      // Topic-wise
      const topic = r.topic || 'logical';
      if (!topicMap[topic]) topicMap[topic] = { correct: 0, total: 0 };
      r.selectedAnswers.forEach((a) => {
        topicMap[topic].total++;
        if (a.isCorrect) topicMap[topic].correct++;
      });
    });

    const avgScore = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
    const accuracy = totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;
    const avgTimePerQuestion = totalAnswered > 0 ? totalTimeSeconds / totalAnswered : 0;

    const topicPerformance = Object.entries(topicMap).map(([topic, data]) => ({
      topic,
      correct: data.correct,
      total: data.total,
      accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
    }));

    const progressOverTime = results.map((r) => ({
      date: new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      score: r.score,
      total: r.totalQuestions,
      mode: r.mode,
    }));

    res.json({
      totalTests,
      avgScore,
      accuracy,
      avgTimePerQuestion,
      topicPerformance,
      progressOverTime,
      correctCount: totalCorrect,
      wrongCount: totalAnswered - totalCorrect,
      timeInsights: computeTimeInsights(results),
    });
  } catch (err) {
    console.error('Analytics error:', err.message);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});


// GET /api/questions/weak-topics/me — topics below 60% accuracy (min 5 answered).
// Powers the dashboard's targeted-practice chips.
router.get('/weak-topics/me', requireAuth, async (req, res) => {
  try {
    const results = await TestResult.find({ userId: req.user.id })
      .select('topic selectedAnswers')
      .lean();
    const topicMap = {};
    results.forEach((r) => {
      const topic = r.topic || 'logical';
      if (!topicMap[topic]) topicMap[topic] = { correct: 0, answered: 0 };
      (r.selectedAnswers || []).forEach((a) => {
        if (!a.selected) return;
        topicMap[topic].answered++;
        if (a.isCorrect) topicMap[topic].correct++;
      });
    });
    const weakTopics = Object.entries(topicMap)
      .map(([topic, t]) => ({
        topic,
        accuracy: t.answered > 0 ? Math.round((t.correct / t.answered) * 100) : 0,
        answered: t.answered,
      }))
      .filter((t) => t.answered >= 5 && t.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);
    res.json({ weakTopics });
  } catch (err) {
    console.error('Weak topics error:', err.message);
    res.status(500).json({ error: 'Failed to load weak topics' });
  }
});

// ── Bookmarks: persist questions across sessions (saved-question notebook) ──
const SavedQuestion = require('../models/SavedQuestion');

// POST /api/questions/bookmarks — save a question for later review
router.post('/bookmarks', requireAuth, async (req, res) => {
  try {
    const { questionId } = req.body;
    if (!questionId || !mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ error: 'Valid questionId is required' });
    }
    const question = await Question.findById(questionId).select('category').lean();
    if (!question) return res.status(404).json({ error: 'Question not found' });

    // Upsert: re-saving an already-saved question is a no-op
    await SavedQuestion.updateOne(
      { userId: req.user.id, questionId: question._id },
      { $setOnInsert: { userId: req.user.id, questionId: question._id, category: question.category || 'logical' } },
      { upsert: true }
    );
    res.status(201).json({ message: 'Saved to notebook' });
  } catch (err) {
    console.error('Bookmark save error:', err.message);
    res.status(500).json({ error: 'Failed to save bookmark' });
  }
});

// GET /api/questions/bookmarks/me — my saved questions, newest first
router.get('/bookmarks/me', requireAuth, async (req, res) => {
  try {
    const saved = await SavedQuestion.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const ids = saved
      .map((s) => s.questionId)
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    const questions = await Question.find({ _id: { $in: ids } }).lean();
    const qMap = new Map(questions.map((q) => [String(q._id), q]));

    const items = saved
      .map((s) => {
        const q = qMap.get(String(s.questionId));
        if (!q) return null; // question deleted since saving
        return {
          questionId: String(q._id),
          Question: q.Question,
          'Option A': q['Option A'],
          'Option B': q['Option B'],
          'Option C': q['Option C'],
          'Option D': q['Option D'],
          Answer: q.Answer,
          Explanation: q.Explanation || '',
          category: q.category || 'logical',
          difficulty: q.difficulty || null,
          savedAt: s.createdAt,
        };
      })
      .filter(Boolean);
    res.json({ items });
  } catch (err) {
    console.error('Bookmark list error:', err.message);
    res.status(500).json({ error: 'Failed to load bookmarks' });
  }
});

// DELETE /api/questions/bookmarks/:questionId — remove one of my bookmarks
router.delete('/bookmarks/:questionId', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.questionId)) {
      return res.status(400).json({ error: 'Invalid questionId' });
    }
    await SavedQuestion.deleteOne({ userId: req.user.id, questionId: req.params.questionId });
    res.json({ message: 'Removed from notebook' });
  } catch (err) {
    console.error('Bookmark delete error:', err.message);
    res.status(500).json({ error: 'Failed to remove bookmark' });
  }
});


module.exports = router;
