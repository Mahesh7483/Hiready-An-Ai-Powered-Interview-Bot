const express = require('express');
const Question = require('../models/Question');
const mongoose = require('mongoose');
const router = express.Router();


// GET random logical quiz
router.get('/quiz/logical', async (req, res) => {
  try {
    const questions = await Question.aggregate([
      { $match: { category: "logical" } },
      { $sample: { size: 10 } },
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

module.exports = router;