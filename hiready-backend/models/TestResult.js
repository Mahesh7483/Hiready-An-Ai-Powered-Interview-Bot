const mongoose = require('mongoose');

const testResultSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
  negativeMarking: {
    type: Boolean,
    default: false
  },
  attemptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AptitudeAttempt',
    unique: true,
    sparse: true,
    index: true
  },
  percentage: {
    type: Number
  },
  markingMode: {
    type: String,
    enum: ['standard', 'negative_0.25'],
    default: 'standard'
  },
  keyVersion: {
    type: Number,
    default: 1
  },
  serverGradedAt: {
    type: Date,
    default: Date.now
  },
  audit: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  preset: {
    type: String,
    default: '',
    maxlength: 60
  },
  selectedAnswers: [{
    questionId: String,
    selected: String,
    correctAnswer: String,
    isCorrect: Boolean,
    timeSpentMs: {
      type: Number,
      default: null
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('TestResult', testResultSchema);
