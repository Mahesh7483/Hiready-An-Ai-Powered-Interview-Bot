const mongoose = require('mongoose');

/**
 * One candidate moving through one job's pipeline.
 *
 * consentId is required: an application cannot exist without the consent that
 * authorises it. That makes the authorization trail part of the row rather
 * than something to look up hopefully later.
 *
 * `withdrawn` is the candidate's lever — they can leave without being
 * rejected, and the recruiter sees only that they withdrew. Never why, never
 * where they went.
 */
const STAGES = [
  'invited',
  'started',
  'completed',
  'shortlisted',
  'interviewing',
  'offered',
  'hired',
  'rejected',
  'withdrawn',
];

/** Stages a recruiter may move a candidate to. Withdrawal is not one of them. */
const RECRUITER_STAGES = STAGES.filter((s) => s !== 'withdrawn');

const applicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },
    // Denormalised so every pipeline query can filter by company without a
    // join. Kept in sync at creation; a job never changes company.
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    consentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CandidateCompanyConsent',
      required: true,
    },

    source: {
      type: String,
      enum: ['invite', 'search', 'apply'],
      required: true,
    },

    stage: { type: String, enum: STAGES, default: 'invited', index: true },

    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentAttempt',
      default: null,
    },

    // Rejection decisions get disputed, so every transition records who and
    // when. Append-only in practice.
    history: [
      {
        from: String,
        to: String,
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

// One application per candidate per job.
applicationSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });
// The pipeline board query.
applicationSchema.index({ companyId: 1, jobId: 1, stage: 1 });

const Application = mongoose.model('Application', applicationSchema);
Application.STAGES = STAGES;
Application.RECRUITER_STAGES = RECRUITER_STAGES;

module.exports = Application;
