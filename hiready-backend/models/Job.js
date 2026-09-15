const mongoose = require('mongoose');

/**
 * A role a company is hiring for, bound to the assessment candidates sit.
 *
 * templateId points at an AssessmentTemplate whose companyId matches this job's
 * company (or null for a platform template). That check happens at write time
 * in routes/hire/jobs.js — a company must never attach another company's
 * private instrument.
 */
const jobSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: '', maxlength: 4000 },
    location: { type: String, default: '', maxlength: 120 },

    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentTemplate',
      default: null,
    },

    status: {
      type: String,
      enum: ['draft', 'open', 'closed'],
      default: 'draft',
      index: true,
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Every recruiter-facing job query filters by company first.
jobSchema.index({ companyId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Job', jobSchema);
