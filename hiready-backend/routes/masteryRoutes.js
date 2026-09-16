const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { computeReadiness, weakestPillar } = require('../services/readiness');

const TestResult = require('../models/TestResult');
const SavedQuestion = require('../models/SavedQuestion');

/**
 * GET /api/mastery/today — what to work on now.
 *
 * This decision used to be made in the browser. Mastery.tsx re-derived the
 * weakest pillar from the readiness response using its own copy of the rule,
 * under a comment reading "Replace with GET /api/mastery/today once the
 * backend lands". So the hero element of the primary dashboard was a heuristic
 * that agreed with the score only by coincidence — the same class of mistake
 * the README calls out for readiness itself: two formulas inevitably disagree,
 * and the student is shown the one that is wrong.
 *
 * Returns the DECISION and the evidence behind it, never the copy. Which
 * pillar, which topic, how many items are due. Wording and route paths stay in
 * the client: the server has no business choosing button labels, and the
 * client has none choosing what a student practises.
 */
router.get('/today', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const readiness = await computeReadiness(userId);

    /**
     * Weak topics and the wrong-answer queue, derived exactly as
     * GET /api/questions/weak-topics/me derives them: a topic counts as weak
     * below 60% accuracy with at least 5 answered, because two wrong out of
     * three is noise, not a weakness.
     */
    const results = await TestResult.find({ userId }).select('topic selectedAnswers').lean();

    const topicMap = {};
    let dueCount = 0;
    results.forEach((r) => {
      const topic = r.topic || 'logical';
      if (!topicMap[topic]) topicMap[topic] = { correct: 0, answered: 0 };
      (r.selectedAnswers || []).forEach((a) => {
        if (!a.selected) return;
        topicMap[topic].answered += 1;
        if (a.isCorrect) topicMap[topic].correct += 1;
        else dueCount += 1;
      });
    });

    const weakTopics = Object.entries(topicMap)
      .map(([topic, t]) => ({
        topic,
        accuracy: t.answered > 0 ? Math.round((t.correct / t.answered) * 100) : 0,
        answered: t.answered,
      }))
      .filter((t) => t.answered >= 5 && t.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy);

    const bookmarked = await SavedQuestion.countDocuments({ userId });
    const pillar = weakestPillar(readiness);

    res.json({
      generatedAt: new Date().toISOString(),
      overall: readiness.overall,
      hasAnyData: readiness.hasAnyData,

      // The decision, and the evidence it rests on.
      weakestPillar: pillar,
      weakestTopic: weakTopics[0] || null,
      dueCount,
      bookmarked,

      // Three blocks, roughly fifteen minutes. `kind` is a stable contract;
      // the client maps it to a label and a route.
      blocks: [
        {
          kind: 'recall',
          minutes: 4,
          count: Math.min(dueCount, 5),
          topic: weakTopics[0] ? weakTopics[0].topic : null,
        },
        { kind: 'stretch', minutes: 7, pillar },
        { kind: 'speak', minutes: 4 },
      ],
    });
  } catch (err) {
    console.error('Mastery today error:', err.message);
    res.status(500).json({ error: "Failed to compose today's session" });
  }
});

module.exports = router;
