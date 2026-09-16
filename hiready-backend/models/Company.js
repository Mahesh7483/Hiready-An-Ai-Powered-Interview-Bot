const mongoose = require('mongoose');

/**
 * An employer tenant.
 *
 * `status` is part of the authorization path, not a display field. The company
 * middleware re-reads it on every recruiter request, so flipping a company to
 * `suspended` is an immediate deny-all switch — it takes effect on the next
 * request, not at next login. That is deliberate: the admin UI for flipping it
 * does not exist until Phase D, but the mechanism has to work from day one.
 */
const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },

    // Email domain used to auto-associate recruiter signups. Not a security
    // boundary on its own — membership is still explicit.
    domain: { type: String, default: '', lowercase: true, trim: true, maxlength: 120 },

    status: {
      type: String,
      enum: ['pending', 'active', 'suspended'],
      default: 'pending',
      index: true,
    },

    /**
     * Intended ceiling on active CompanyMembership rows.
     *
     * NOT ENFORCED, and the note that used to sit here claimed that inviting
     * enforced it. Nothing does, and nothing can yet: no route creates a
     * CompanyMembership at all. The only code that does is
     * scripts/smokeHireFlow.js, so a team is assembled by hand against the
     * database. POST /api/hire/invites does not consume a seat — it invites
     * CANDIDATES, which is a consent event, not a team membership.
     *
     * GET /api/admin/companies does report seatsUsed, and that number is real
     * — it counts actual membership rows. The ceiling beside it is currently
     * advisory.
     *
     * When a team-invitation flow is built, enforce it at the point a
     * membership row is created, and make this comment true.
     */
    seats: { type: Number, default: 3, min: 1, max: 500 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', companySchema);
