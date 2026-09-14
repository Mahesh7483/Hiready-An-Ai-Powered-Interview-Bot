const mongoose = require('mongoose');

/**
 * A proctoring event. Deliberately holds NO image.
 *
 * Webcam frames live in ProctorSnapshot. They were split out so that a query
 * for violation counts cannot accidentally carry biometric data back with it —
 * see models/ProctorSnapshot.js for the full rationale. Do not re-add a
 * `snapshot` field here.
 */
const proctorLogSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    event: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProctorLog', proctorLogSchema);
