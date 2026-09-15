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
    /**
     * Questions whose answer was shown mid-attempt (practice mode only).
     *
     * MUST stay declared. Under mongoose's default strict:true an undeclared
     * path is dropped in silence — no error, no update — which is how the
     * express-interest funnel on the hire side sat dead for weeks while every
     * response said {ok:true}. Recorded so a practice run that was walked
     * through can never be presented as an unaided score.
     */
    revealedQuestionIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    }],
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
