const express = require('express');
const Question = require('../models/Question');
const TestResult = require('../models/TestResult');
const mongoose = require('mongoose');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { DIFFICULTIES } = require('../utils/constants');

// GET random quiz by category (supports ?count=N&difficulty=X)
// Keeps backwards compatibility: /quiz/logical still works with default 10
// Category is resolved flexibly: "quantitative", "Quantitative Aptitude",
// "quantitative-aptitude" all match the stored category name.
router.get('/quiz/:category', async (req, res) => {
  try {
    const count = Math.min(Math.max(parseInt(req.query.count) || 10, 1), 50);
    const { difficulty } = req.query;

    const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const requestedSlug = slugify(req.params.category);

    // Resolve the requested topic against the categories that actually exist.
    // "all" = mixed quiz with no category filter.
    const allCategories = await Question.distinct('category');
    const isMixed = requestedSlug === 'all' || requestedSlug === 'mixed';
    const resolved = isMixed ? null : allCategories.find((c) => slugify(c) === requestedSlug) || req.params.category;

    const baseMatch = resolved ? { category: resolved } : {};

    // Difficulty with fallback: if the requested difficulty pool is too thin,
    // serve from the whole category instead of returning 0 questions.
    let questions = [];
    if (difficulty) {
      questions = await Question.aggregate([
        { $match: { ...baseMatch, difficulty } },
        { $sample: { size: count } },
        { $project: { Answer: 0 } },
      ]);
    }
    if (questions.length < count) {
      const excludeIds = questions.map((q) => q._id);
      const remaining = count - questions.length;
      const fill = await Question.aggregate([
        { $match: { ...baseMatch, _id: { $nin: excludeIds } } },
        { $sample: { size: remaining } },
        { $project: { Answer: 0 } },
      ]);
      questions = [...questions, ...fill];
    }

    res.json(questions);
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

    res.json({
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
router.post('/quiz/submit', async (req, res) => {
  try {
    const { answers, negativeMarking } = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'answers must be a non-empty array' });
    }

    // Collect valid ids and grade all questions in one query (avoids N+1)
    let ids;
    try {
      ids = answers.map((a) => new mongoose.Types.ObjectId(a.questionId));
    } catch {
      return res.status(400).json({ error: 'Invalid questionId format' });
    }

    const questions = await Question.find({ _id: { $in: ids } });
    const questionMap = new Map(questions.map((q) => [String(q._id), q]));

    const applyPenalty = Boolean(negativeMarking);
    // Anti-cheat: grade each question at most once (first answer wins) —
    // duplicate questionIds in the payload can't inflate the score.
    const gradedIds = new Set();
    let score = 0;
    const results = [];
    for (const item of answers) {
      const qid = String(item.questionId);
      if (gradedIds.has(qid)) continue;
      gradedIds.add(qid);
      const question = questionMap.get(qid);
      if (question) {
        const isCorrect = question.Answer === item.selected;
        if (isCorrect) score += 1;
        else if (applyPenalty && item.selected) score -= 0.25;
        results.push({
          questionId: item.questionId,
          selected: item.selected,
          correctAnswer: question.Answer,
          isCorrect
        });
      }
    }
    if (applyPenalty) score = Math.max(0, Math.round(score * 100) / 100);

    res.json({ score, negativeApplied: applyPenalty, results });
  } catch (err) {
    console.error('Quiz submit error:', err.message);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

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


// Save test result for analytics — identity comes from the verified token, never the body
router.post('/quiz/save-result', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id; // derived from JWT — client-supplied userId is ignored
    const { score, totalQuestions, selectedAnswers, mode, warningCount, topic, difficulty, timeTaken, negativeMarking, preset } = req.body;

    if (typeof score !== 'number' || typeof totalQuestions !== 'number' || !Array.isArray(selectedAnswers)) {
      return res.status(400).json({ error: 'score, totalQuestions (number) and selectedAnswers (array) are required' });
    }

    // Sanitize per-answer entries — allow optional per-question timing
    const safeAnswers = selectedAnswers.slice(0, 100).map((a) => ({
      questionId: String(a && a.questionId ? a.questionId : '').slice(0, 64),
      selected: String(a && a.selected != null ? a.selected : ''),
      correctAnswer: String(a && a.correctAnswer != null ? a.correctAnswer : ''),
      isCorrect: Boolean(a && a.isCorrect),
      timeSpentMs: Number.isFinite(a && a.timeSpentMs)
        ? Math.max(0, Math.min(Math.round(a.timeSpentMs), 30 * 60 * 1000))
        : null
    }));

    const testResult = new TestResult({
      userId,
      score,
      totalQuestions,
      selectedAnswers: safeAnswers,
      mode: mode === 'practice' ? 'practice' : 'test',
      warningCount: Number.isFinite(warningCount) ? warningCount : 0,
      negativeMarking: Boolean(negativeMarking),
      preset: typeof preset === 'string' ? preset.slice(0, 60) : '',
      topic: topic || 'logical',
      difficulty,
      timeTaken
    });

    await testResult.save();

    // Percentile vs same-topic results ("you beat X% of candidates")
    let percentile = null;
    try {
      const betterCount = await TestResult.countDocuments({
        topic: topic || 'logical',
        $expr: { $gt: [{ $divide: ['$score', '$totalQuestions'] }, { $divide: [score, totalQuestions] }] }
      });
      const totalCount = await TestResult.countDocuments({ topic: topic || 'logical', totalQuestions: { $gt: 0 } });
      percentile = totalCount > 1 ? Math.round((betterCount / totalCount) * 100) : null;
    } catch { /* non-critical */ }

    res.json({ success: true, id: testResult._id, percentile });
  } catch (err) {
    console.error('Save result error:', err.message);
    res.status(500).json({ error: 'Failed to save result' });
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
