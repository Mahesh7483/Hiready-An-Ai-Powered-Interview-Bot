const mongoose = require('mongoose');

const proctorLogSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    index: true
  },
  event: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    required: true
  },
  // Optional webcam snapshot captured at the moment of the violation.
  // Small base64 JPEG data URI (~15-30KB) — evidence trail for flagged sessions.
  snapshot: {
    type: String,
    maxlength: 80000 // ~60KB base64 ceiling
  },
  receivedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ProctorLog', proctorLogSchema);
