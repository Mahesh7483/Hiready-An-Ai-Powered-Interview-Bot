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

    // Ceiling on active CompanyMembership rows. Enforced when inviting.
    seats: { type: Number, default: 3, min: 1, max: 500 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', companySchema);
