const mongoose = require('mongoose');

const codingQuestionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    required: true,
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
  category: {
    type: String,
    enum: ['arrays', 'strings', 'linked-lists', 'trees', 'graphs', 'dynamic-programming', 'sorting', 'searching', 'greedy', 'backtracking', 'bit-manipulation', 'math', 'geometry', 'databases', 'system-design'],
    default: 'arrays',
  },
  companies: [{
    type: String,
    trim: true,
  }],

  // Code templates per language
  starterCode: {
    python: { type: String, default: '' },
    javascript: { type: String, default: '' },
    typescript: { type: String, default: '' },
    java: { type: String, default: '' },
    go: { type: String, default: '' },
    cpp: { type: String, default: '' },
    rust: { type: String, default: '' },
  },
  
  // Solution code per language
  solution: {
    python: { type: String, default: '' },
    javascript: { type: String, default: '' },
    typescript: { type: String, default: '' },
    java: { type: String, default: '' },
    go: { type: String, default: '' },
    cpp: { type: String, default: '' },
    rust: { type: String, default: '' },
  },
  
  // Test cases
  testCases: [{
    input: { type: String, required: true },
    output: { type: String, required: true },
    isHidden: { type: Boolean, default: false },
    points: { type: Number, default: 1 },
    description: { type: String, default: '' },
  }],
  
  // Multiple files support
  starterFiles: {
    type: Map,
    of: String,
    default: {},
  },
  
  solutionFiles: {
    type: Map,
    of: String,
    default: {},
  },
  
  // Constraints and limits
  constraints: {
    type: String,
    default: '',
  },
  timeLimit: {
    type: Number,
    default: 2000, // ms
  },
  memoryLimit: {
    type: Number,
    default: 256, // MB
  },
  
  // Metadata
  company: { type: String, default: '' },
  frequency: { type: Number, default: 0 },
  relatedTopics: [{ type: String }],
  explanation: { type: String, default: '' },
  
  // Status
  isPublished: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Indexes (slug already indexed via unique: true)
codingQuestionSchema.index({ difficulty: 1, category: 1 });
codingQuestionSchema.index({ tags: 1 });
codingQuestionSchema.index({ isPublished: 1, isActive: 1 });
codingQuestionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CodingQuestion', codingQuestionSchema);