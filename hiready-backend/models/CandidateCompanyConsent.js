const mongoose = require('mongoose');

/**
 * Permission for ONE company to see ONE candidate.
 *
 * Consent is a relationship, never a property of the candidate. Being open to
 * Company A tells Company B nothing and cannot — there is no global "revealed"
 * flag anywhere in the system.
 *
 * PRIVATE is deliberately not a state: it is the ABSENCE of a row. No document
 * for a (candidate, company) pair means that company has no access at all, so
 * default-deny falls out of the schema rather than depending on anyone
 * remembering to check a field.
 *
 *   DISCOVERABLE  pseudonymous only. Reachable by aggregate discovery
 *                 (Phase E), never by candidateAccess() — a recruiter cannot
 *                 resolve a DISCOVERABLE candidate to a person.
 *   REVEALED      this company may see identity and evidence.
 *   IN_PROCESS    as REVEALED, with a live application attached.
 *
 * Revocation sets revokedAt and moves state to REVOKED. It stops FUTURE
 * access; it does not reach back and delete assessments a company already ran.
 * Invariant 10.
 */
const STATES = ['DISCOVERABLE', 'REVEALED', 'IN_PROCESS', 'REVOKED'];

/** The states candidateAccess() will issue a capability for. */
const ACCESS_STATES = ['REVEALED', 'IN_PROCESS'];

const candidateCompanyConsentSchema = new mongoose.Schema(
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
    state: {
      type: String,
      enum: STATES,
      required: true,
    },
    /** How this consent came to exist. Accepting an invite IS a consent event. */
    source: {
      type: String,
      enum: ['invite', 'discovery', 'application'],
      required: true,
    },
    grantedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },

    /** Who acted, for the disclosure audit. Null when the candidate acted. */
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// One consent row per candidate per company.
candidateCompanyConsentSchema.index({ candidateId: 1, companyId: 1 }, { unique: true });

// The exact lookup candidateAccess() performs on every request.
candidateCompanyConsentSchema.index({ candidateId: 1, companyId: 1, state: 1, revokedAt: 1 });

const CandidateCompanyConsent = mongoose.model(
  'CandidateCompanyConsent',
  candidateCompanyConsentSchema
);

CandidateCompanyConsent.STATES = STATES;
CandidateCompanyConsent.ACCESS_STATES = ACCESS_STATES;

module.exports = CandidateCompanyConsent;
