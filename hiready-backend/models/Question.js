const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  Question: {
    type: String,
    required: true
  },
  "Option A": {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  "Option B": {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  "Option C": {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  "Option D": {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  Answer: {
    type: String,
    required: true
  },
  category: {
    type: String,
    default: "logical"
  }
});

module.exports = mongoose.model('Question', questionSchema);