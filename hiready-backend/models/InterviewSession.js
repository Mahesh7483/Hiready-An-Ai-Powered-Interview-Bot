const mongoose = require('mongoose');

// One completed voice interview session — conversation, integrity record,
// and (optionally) the LLM's per-question scoring.
const InterviewSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    sessionId: { type: String, required: true },
    role: { type: String, required: true, maxlength: 120 },
    experienceLevel: { type: String, required: true, maxlength: 60 },
    jobDescription: { type: String, maxlength: 2500, default: '' },
    mode: {
      type: String,
      enum: ['assessment', 'practice'],
      default: 'assessment'
    },
    interviewType: {
      type: String,
      enum: ['technical', 'behavioral'],
      default: 'technical'
    },
    durationSeconds: { type: Number, default: 0, min: 0 },
    conversationLog: [
      {
        role: { type: String, enum: ['interviewer', 'user'], required: true },
        text: { type: String, required: true, maxlength: 8000 }
      }
    ],
    integrity: {
      violations: { type: Number, default: 0, min: 0 },
      maxViolations: { type: Number, default: 3, min: 0 },
      terminated: { type: Boolean, default: false }
    },
    // Filled after /api/ai/interview-analyze runs on this session
    analysisJson: { type: mongoose.Schema.Types.Mixed, default: null },
    analyzedAt: { type: Date, default: null },
    // Delivery metrics: per-answer durations, WPM, filler-word counts
    metricsJson: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

InterviewSessionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('InterviewSession', InterviewSessionSchema);
