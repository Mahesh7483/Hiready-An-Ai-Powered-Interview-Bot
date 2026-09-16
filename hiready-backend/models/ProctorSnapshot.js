const mongoose = require('mongoose');

/**
 * Webcam frames captured during proctoring, split out of ProctorLog.
 *
 * This separation is a SECURITY BOUNDARY, not tidiness. These are images of a
 * person's face — biometric data under India's DPDP Act 2023 and under GDPR
 * for EU candidates. Keeping them in their own collection means a query for
 * violation counts physically cannot carry an image back, because the image is
 * not in that document.
 *
 * Rules that go with it:
 *   - Nothing under routes/hire/** or services/hire/** may import this model.
 *     Enforced at build time by tests/backend/hireBoundary.test.js, which derives
 *     its forbidden list from policy/dataAccess.js.
 *   - Recruiters learn whether an assessment is trustworthy from
 *     AssessmentAttempt.integrityVerdict, never from here.
 *   - Rows expire. Biometric evidence has a purpose window — a disputed
 *     result — and after it closes the safest place for this data is nowhere.
 *
 * Keyed on sessionId, matching ProctorLog, because proctoring spans BOTH
 * assessments (sessionId `assessment-<attemptId>`) and voice interviews
 * (a client-supplied session string). Keying on attemptId would leave
 * interview snapshots — the same biometric material — with nowhere to go.
 */
const RETENTION_DAYS = Number(process.env.PROCTOR_SNAPSHOT_RETENTION_DAYS || 90);

const proctorSnapshotSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true, maxlength: 128 },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    // The ProctorLog row this frame was captured alongside, so the admin
    // evidence view can pair an event with its image.
    proctorLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProctorLog',
      index: true,
    },

    // Base64 JPEG data URI, ~15-30KB.
    image: { type: String, required: true, maxlength: 80000 },

    capturedAt: { type: Date, default: Date.now },

    // TTL anchor. Always set on write — see the pre-validate hook below, which
    // exists so a future caller cannot create a row that never expires.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Second line of defence: even if an image leaks somewhere internally, the
// sensitive artifact has a bounded lifetime.
proctorSnapshotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

proctorSnapshotSchema.pre('validate', function setExpiry(next) {
  if (!this.expiresAt) {
    const from = this.capturedAt || new Date();
    this.expiresAt = new Date(from.getTime() + RETENTION_DAYS * 864e5);
  }
  next();
});

module.exports = mongoose.model('ProctorSnapshot', proctorSnapshotSchema);
module.exports.RETENTION_DAYS = RETENTION_DAYS;
