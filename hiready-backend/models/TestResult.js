const mongoose = require('mongoose');

const testResultSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  mode: {
    type: String,
    enum: ['practice', 'test'],
    required: true
  },
  score: {
    type: Number,
    required: true
  },
  totalQuestions: {
    type: Number,
    required: true
  },
  topic: {
    type: String,
    default: 'logical'
  },
  difficulty: {
    type: String
  },
  timeTaken: {
    type: String
  },
  warningCount: {
    type: Number,
    default: 0
  },
  selectedAnswers: [{
    questionId: String,
    selected: String,
    correctAnswer: String,
    isCorrect: Boolean
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('TestResult', testResultSchema);
