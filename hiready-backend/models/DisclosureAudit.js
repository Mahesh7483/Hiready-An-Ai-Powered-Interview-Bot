const mongoose = require('mongoose');

/**
 * The record that answers: who was disclosed, to which company, what was
 * disclosed, when, and under which consent.
 *
 * This is deliberately not a generic activity log. A login trail tells you
 * someone was busy; this tells you whose personal data left the platform and
 * on what authority. It is the artifact you need the day a candidate asks
 * "who has seen my results?" — or a regulator does.
 *
 * Append-only by convention: nothing in the codebase updates or deletes these,
 * and the consent row they reference may be revoked without touching them.
 */
const disclosureAuditSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    /** The consent in force at the moment of disclosure. */
    consentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CandidateCompanyConsent',
      default: null,
    },

    action: {
      type: String,
      enum: ['granted', 'revoked', 'state_changed', 'disclosed'],
      required: true,
    },

    /** Which CandidateAccess scopes were actually read. */
    scopes: [{ type: String }],

    /** The recruiter who read it, or null when the candidate acted. */
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** Free-form context: previous/next state, the route that read it. */
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// "Everything ever disclosed about this candidate", newest first.
disclosureAuditSchema.index({ candidateId: 1, createdAt: -1 });
// "Everything this company has seen", for the admin export.
disclosureAuditSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model('DisclosureAudit', disclosureAuditSchema);
