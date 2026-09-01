const mongoose = require('mongoose');

const codingSubmissionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CodingQuestion',
    required: true,
    index: true,
  },
  code: {
    type: String,
    required: true,
    maxlength: 100000,
  },
  language: {
    type: String,
    required: true,
    enum: ['python', 'javascript', 'typescript', 'java', 'go', 'cpp', 'rust'],
  },
  status: {
    type: String,
    enum: ['accepted', 'wrong_answer', 'runtime_error', 'time_limit_exceeded', 'error'],
    required: true,
  },
  passedCount: { type: Number, default: 0 },
  totalTests: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  executionTime: { type: Number, default: 0 },
  testResults: [{
    input: String,
    expected: String,
    actual: String,
    passed: Boolean,
    executionTime: Number,
    error: String,
    isHidden: { type: Boolean, default: false },
  }],
}, {
  timestamps: true,
});

codingSubmissionSchema.index({ userId: 1, questionId: 1, createdAt: -1 });

module.exports = mongoose.model('CodingSubmission', codingSubmissionSchema);