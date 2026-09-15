const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * A company inviting a candidate by email.
 *
 * Accepting is the consent event — it grants this one company access without
 * making the candidate discoverable to anyone else. That is the whole private
 * market path: PRIVATE -> invited by Company A -> REVEALED to Company A, with
 * no global visibility in between.
 *
 * The token is stored HASHED. The plaintext goes out in the email once and is
 * never persisted, so a database leak does not hand an attacker a set of
 * working consent-granting links.
 */
const companyInviteSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    // Null until Phase C jobs exist for it; an invite may precede a job.
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },

    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },

    tokenHash: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ['sent', 'accepted', 'declined', 'expired', 'revoked'],
      default: 'sent',
      index: true,
    },

    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedAt: { type: Date, default: null },

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// One live invite per company per email.
companyInviteSchema.index(
  { companyId: 1, email: 1, status: 1 },
  { partialFilterExpression: { status: 'sent' } }
);

const CompanyInvite = mongoose.model('CompanyInvite', companyInviteSchema);

/** Returns { token, tokenHash }. Only the hash is ever stored. */
CompanyInvite.mintToken = function mintToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: CompanyInvite.hashToken(token) };
};

CompanyInvite.hashToken = function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

module.exports = CompanyInvite;
