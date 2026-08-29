const mongoose = require('mongoose');

// Admin-defined assessment blueprint: an ordered list of sections
// (aptitude MCQ / coding / voice AI interview) with optional breaks.
const assessmentSectionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['aptitude', 'coding', 'voice-interview'],
      required: true,
    },
    title: { type: String, default: '', maxlength: 120 },
    // aptitude sections
    topic: { type: String, default: '' }, // category name/slug, '' = mixed
    count: { type: Number, default: 15, min: 1, max: 50 },
    negativeMarking: { type: Boolean, default: true },
    // coding sections
    codingTags: [{ type: String, trim: true, lowercase: true }],
    codingDifficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', ''],
      default: '',
    },
    codingCount: { type: Number, default: 2, min: 1, max: 5 },
    // voice-interview sections
    interviewDurationMin: { type: Number, default: 10, min: 1, max: 60 },
    focusAreas: [{ type: String, trim: true, maxlength: 120 }],
    // shared
    minutes: { type: Number, required: true, min: 1, max: 180 },
  },
  { _id: false }
);

const assessmentBreakSchema = new mongoose.Schema(
  {
    afterSectionIndex: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 1, max: 30 },
  },
  { _id: false }
);

const assessmentTemplateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: '', maxlength: 1000 },
    targetRole: { type: String, default: '', maxlength: 120 },
    sections: {
      type: [assessmentSectionSchema],
      validate: [(v) => v.length >= 1 && v.length <= 8, '1-8 sections required'],
    },
    breaks: { type: [assessmentBreakSchema], default: [] },
    // Resume-driven templates personalize question selection from the
    // candidate's latest resume analysis (topics, coding skills, focus areas).
    resumeDriven: { type: Boolean, default: false },
    attemptLimit: { type: Number, default: 1, min: 1, max: 10 },
    cooldownDays: { type: Number, default: 0, min: 0, max: 365 },
    // Weighted violation score at which the attempt is auto-submitted
    violationThreshold: { type: Number, default: 100, min: 10 },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

assessmentTemplateSchema.index({ targetRole: 1, isPublished: 1 });

module.exports = mongoose.model('AssessmentTemplate', assessmentTemplateSchema);