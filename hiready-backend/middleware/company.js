const mongoose = require('mongoose');
const Company = require('../models/Company');
const CompanyMembership = require('../models/CompanyMembership');

/**
 * Recruiter authorization. Mirrors requireAdmin: nothing is trusted from the
 * token beyond the user id, and everything else is re-read from the database
 * on EVERY request.
 *
 * Invariants this file carries (frozen for Phase A):
 *
 *  2. Membership, Company.status and consent are resolved fresh per request.
 *     Nothing here is cached, memoised or attached to a session. A suspended
 *     company is denied on its very next request rather than at next login.
 *
 *  4. Denial is externally indistinguishable from nonexistence. Every refusal
 *     below returns the same 404 body, so a recruiter cannot use response
 *     differences to learn that a company or candidate exists.
 *
 *  9. Company status is checked BEFORE any capability is created, so a
 *     suspension cuts access ahead of the consent lookup rather than after it.
 *
 * MULTI-TENANCY: a user may belong to several companies. Picking one with a
 * bare findOne() is non-deterministic — it follows natural collection order —
 * and would let a recruiter act on the wrong company's pipeline without
 * noticing. So the company is resolved explicitly:
 *
 *   1. an `x-company-id` header, validated against an active membership; else
 *   2. the user's single active membership, when they have exactly one; else
 *   3. refusal. listMemberships() below is how a client learns what to send.
 */

/** The single refusal. Identical for every reason, on purpose. */
function refuse(res) {
  return res.status(404).json({ error: 'Not found' });
}

/** Every active membership for a user, with company name and status. */
async function listMemberships(userId) {
  const memberships = await CompanyMembership.find({ userId, status: 'active' })
    .sort({ createdAt: 1 })
    .lean();
  if (!memberships.length) return [];

  const companies = await Company.find({ _id: { $in: memberships.map((m) => m.companyId) } })
    .select('name status')
    .lean();
  const byId = new Map(companies.map((c) => [String(c._id), c]));

  return memberships
    .map((m) => {
      const company = byId.get(String(m.companyId));
      return company
        ? {
          companyId: String(m.companyId),
          name: company.name,
          status: company.status,
          role: m.role,
          membershipId: String(m._id),
        }
        : null;
    })
    .filter(Boolean);
}

/**
 * Populates req.company = { companyId, role, membershipId } on success.
 *
 * Deliberately does NOT grant access to any candidate — that requires
 * candidateAccess(). This only establishes "you are an active member of this
 * active company".
 */
async function requireCompany(req, res, next) {
  try {
    if (!req.user || !req.user.id) return refuse(res);

    const requested = req.get('x-company-id') || req.query.companyId || null;

    let membership;
    if (requested) {
      if (!mongoose.Types.ObjectId.isValid(String(requested))) return refuse(res);
      membership = await CompanyMembership.findOne({
        userId: req.user.id,
        companyId: requested,
        status: 'active',
      }).lean();
    } else {
      const active = await CompanyMembership.find({ userId: req.user.id, status: 'active' })
        .limit(2)
        .lean();
      // Exactly one is unambiguous. Two or more and the caller must say which:
      // guessing here is how a recruiter ends up looking at the wrong company.
      if (active.length !== 1) return refuse(res);
      [membership] = active;
    }
    if (!membership) return refuse(res);

    // Read the company fresh. This is the suspension kill switch: flipping
    // status to 'suspended' denies on the next request, with no UI required.
    const company = await Company.findById(membership.companyId)
      .select('status')
      .lean();
    if (!company || company.status !== 'active') return refuse(res);

    req.company = {
      companyId: String(membership.companyId),
      // Pre-cast for aggregation pipelines, which do no casting of their own.
      // Exposed here so no route has to construct an ObjectId from a request
      // value — that pattern is what __tests__/userIdIntegrity.test.js forbids,
      // because the guarded and unguarded forms look identical at a glance.
      companyOid: membership.companyId,
      role: membership.role,
      membershipId: String(membership._id),
    };
    return next();
  } catch (err) {
    console.error('requireCompany error:', err.message);
    return refuse(res);
  }
}

/**
 * Narrows a route to particular company roles. Compose after requireCompany:
 *
 *   router.post('/jobs', requireCompany, requireCompanyRole('owner', 'recruiter'), handler)
 *
 * A viewer reading a pipeline is fine; a viewer moving a candidate or
 * revealing an identity is not.
 */
function requireCompanyRole(...roles) {
  return function checkRole(req, res, next) {
    if (!req.company || !roles.includes(req.company.role)) return refuse(res);
    return next();
  };
}

module.exports = { requireCompany, requireCompanyRole, listMemberships };
