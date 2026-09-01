const mongoose = require('mongoose');

// A question the user explicitly saved ("bookmark") so they can revisit it
// later from the notebook. One save per user per question.
const savedQuestionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  category: {
    type: String,
    default: 'logical'
  },
  note: {
    type: String,
    default: '',
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Prevent duplicate saves of the same question by the same user
savedQuestionSchema.index({ userId: 1, questionId: 1 }, { unique: true });

module.exports = mongoose.model('SavedQuestion', savedQuestionSchema);
