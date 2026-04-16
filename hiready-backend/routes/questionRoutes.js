const express = require('express');
const Question = require('../models/Question');
const TestResult = require('../models/TestResult');
const mongoose = require('mongoose');
const router = express.Router();


// GET random quiz by category (supports ?count=N&difficulty=X)
// Keeps backwards compatibility: /quiz/logical still works with default 10
router.get('/quiz/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const count = parseInt(req.query.count) || 10;
    const { difficulty } = req.query;

    const match = { category };
    if (difficulty) match.difficulty = difficulty;

    const questions = await Question.aggregate([
      { $match: match },
      { $sample: { size: count } },
      { $project: { Answer: 0 } }
    ]);

    res.json(questions);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Submit quiz
router.post('/quiz/submit', async (req, res) => {
  try {
    const { answers } = req.body;
    let score = 0;
    const results = [];

    for (let item of answers) {
      const question = await Question.findById(
        new mongoose.Types.ObjectId(item.questionId)
      );

      if (question) {
        const isCorrect = question.Answer === item.selected;
        if (isCorrect) {
          score++;
        }
        results.push({
          questionId: item.questionId,
          selected: item.selected,
          correctAnswer: question.Answer,
          isCorrect: isCorrect
        });
      }
    }

    res.json({ score, results });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Save test result for analytics
router.post('/quiz/save-result', async (req, res) => {
  try {
    const { userId, score, totalQuestions, selectedAnswers, mode, warningCount, topic, difficulty, timeTaken } = req.body;

    const testResult = new TestResult({
      userId,
      score,
      totalQuestions,
      selectedAnswers,
      mode: mode || 'test',
      warningCount: warningCount || 0,
      topic: topic || 'logical',
      difficulty,
      timeTaken,
    });

    await testResult.save();
    res.json({ success: true, id: testResult._id });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET analytics for a user
router.get('/analytics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
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
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
