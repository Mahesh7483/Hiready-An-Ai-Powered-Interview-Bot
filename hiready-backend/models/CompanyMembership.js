const mongoose = require('mongoose');

/**
 * Links a User to a Company with a role. This is what makes a user a recruiter —
 * there is no `recruiter` value on User.role, because recruiter-ness is a
 * relationship to a tenant, not a global property of the person.
 *
 * Roles:
 *   owner     — manages seats and members, everything a recruiter can do
 *   recruiter — runs the pipeline, may reveal identity where consent allows
 *   viewer    — reads the pipeline, may not move candidates or reveal identity
 */
const companyMembershipSchema = new mongoose.Schema(
  {
    userId: {
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
    role: {
      type: String,
      enum: ['owner', 'recruiter', 'viewer'],
      default: 'recruiter',
    },
    status: {
      type: String,
      enum: ['invited', 'active', 'removed'],
      default: 'invited',
      index: true,
    },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One membership per person per company. A user may belong to several
// companies; each is a separate row and never sees the others.
companyMembershipSchema.index({ userId: 1, companyId: 1 }, { unique: true });

// The lookup the authorization middleware performs on every recruiter request.
companyMembershipSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('CompanyMembership', companyMembershipSchema);
