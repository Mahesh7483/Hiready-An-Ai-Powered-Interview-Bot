const mongoose = require('mongoose');

// One candidate run of an AssessmentTemplate. The server owns everything:
// the locked question set per section, all clocks (sectionStartedAt), the
// grade book, and the weighted violation score.
const assessmentAttemptSchema = new mongoose.Schema(
  {
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentTemplate',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['not_started', 'in_break', 'in_progress', 'completed', 'auto_submitted', 'expired'],
      default: 'not_started',
    },
    currentSectionIndex: { type: Number, default: 0 },
    // Server-locked per-section state. Never sent raw to the client:
    //   aptitude: { questionIds: [...], optionOrder: { qid: [A,B,C,D] } }
    //   coding:   { codingQuestionIds: [...] }
    //   voice:    { focusAreas: [...] }
    sectionState: { type: mongoose.Schema.Types.Mixed, default: {} },
    sectionStartedAt: { type: Date, default: null },
    breakEndsAt: { type: Date, default: null },
    sectionResults: [
      {
        sectionIndex: Number,
        type: String,
        score: { type: Number, default: 0 },
        maxScore: { type: Number, default: 0 },
        meta: { type: mongoose.Schema.Types.Mixed, default: {} },
        completedAt: { type: Date, default: Date.now },
      },
    ],
    violations: [
      {
        type: { type: String, required: true },
        weight: { type: Number, default: 1 },
        at: { type: Date, default: Date.now },
      },
    ],
    violationScore: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

assessmentAttemptSchema.index({ userId: 1, templateId: 1, createdAt: -1 });

module.exports = mongoose.model('AssessmentAttempt', assessmentAttemptSchema);