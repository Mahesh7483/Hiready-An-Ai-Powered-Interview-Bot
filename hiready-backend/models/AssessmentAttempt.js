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
        /**
         * MUST stay wrapped as `{ type: String }`.
         *
         * Mongoose's typeKey is 'type', so a bare `type: String` here makes it
         * read this whole object as a TYPE DECLARATION rather than a
         * subdocument definition — sectionResults compiles to [String], and
         * pushing a result object throws a CastError at the push. That is not
         * a subtle degradation: POST /attempt/:id/section/submit caught it and
         * returned 500 'Failed to submit section', so no assessment could ever
         * be completed and no scorecard ever had anything on it.
         *
         * `violations` below is written the same way for the same reason.
         */
        type: { type: String },
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

    /**
     * Derived at finalisation from violationScore. This is the ONLY integrity
     * signal a recruiter ever sees: it lives on the result they commissioned,
     * so /hire needs no path to ProctorLog at all.
     *
     *   clean       nothing of note
     *   flagged     violations occurred; the score is usable with judgement
     *   invalidated the attempt was auto-submitted on the threshold
     */
    integrityVerdict: {
      type: String,
      enum: ['clean', 'flagged', 'invalidated', null],
      default: null,
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

assessmentAttemptSchema.index({ userId: 1, templateId: 1, createdAt: -1 });

module.exports = mongoose.model('AssessmentAttempt', assessmentAttemptSchema);