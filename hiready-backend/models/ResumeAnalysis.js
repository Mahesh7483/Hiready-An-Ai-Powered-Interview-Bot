const mongoose = require('mongoose');

// Stores one completed resume analysis per upload, so users can track
// their score over time and re-open past reports.
const ResumeAnalysisSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    label: {
      type: String,
      default: '',
      maxlength: 120 // optional user-friendly name, e.g. "Google variant"
    },
    targetRole: { type: String, required: true, maxlength: 120 },
    experienceLevel: { type: String, required: true, maxlength: 60 },
    atsScore: { type: Number, required: true, min: 0, max: 100 },
    keywordMatch: { type: Number, required: true, min: 0, max: 100 },
    formatScore: { type: Number, required: true, min: 0, max: 100 },
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    skills: [{ type: String, maxlength: 60 }],
    missingKeywords: [{ type: String, maxlength: 60 }],
    // Full LLM analysis payload — kept verbatim so old reports render forever
    resultJson: { type: mongoose.Schema.Types.Mixed, required: true },
    // Source resume text — enables AI tools (cover letter, rewrites) on old reports
    sourceText: { type: String, maxlength: 30000, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ResumeAnalysis', ResumeAnalysisSchema);
