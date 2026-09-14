const mongoose = require('mongoose');

// Server-authoritative standalone aptitude quiz attempt.
// Locks the question IDs, answer key, and negative marking configuration at start time.
const aptitudeAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    topic: {
      type: String,
      default: 'logical'
    },
    difficulty: {
      type: String,
      default: ''
    },
    mode: {
      type: String,
      enum: ['practice', 'test'],
      default: 'test'
    },
    negativeMarking: {
      type: Boolean,
      default: false
    },
    questionIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true
    }],
    answerKey: {
      type: Map,
      of: String,
      required: true
    },
    status: {
      type: String,
      enum: ['in_progress', 'submitting', 'completed', 'abandoned'],
      default: 'in_progress',
      index: true
    },
    keyVersion: {
      type: Number,
      default: 1
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    leaseToken: {
      type: String,
      default: null
    },
    leaseExpiresAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

aptitudeAttemptSchema.index({ userId: 1, status: 1, createdAt: -1 });
aptitudeAttemptSchema.index({ status: 1, leaseExpiresAt: 1 });

module.exports = mongoose.model('AptitudeAttempt', aptitudeAttemptSchema);
