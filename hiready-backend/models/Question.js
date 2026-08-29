const mongoose = require('mongoose');

// MCQ question for aptitude quizzes
const questionSchema = new mongoose.Schema({
  Question: {
    type: String,
    required: true
  },
  'Option A': {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  'Option B': {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  'Option C': {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  'Option D': {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  Answer: {
    type: String,
    required: true
  },
  // Step-by-step solution shown after answering / in the wrong-answer notebook
  Explanation: {
    type: String,
    default: '',
    maxlength: 2000
  },
  category: {
    type: String,
    default: "logical"
  },
  difficulty: {
    type: String,
    enum: ["easy", "medium", "hard"],
    default: null
  }
});

// Indexes for fast quiz serving
questionSchema.index({ category: 1, difficulty: 1 });

module.exports = mongoose.model('Question', questionSchema);