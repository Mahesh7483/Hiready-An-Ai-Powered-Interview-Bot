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
 */

/** The single refusal. Identical for every reason, on purpose. */
function refuse(res) {
  return res.status(404).json({ error: 'Not found' });
}

/**
 * Populates req.company = { companyId, role, membershipId } on success.
 *
 * Deliberately does NOT grant access to any candidate — that requires
 * candidateAccess(), which is Phase B. This middleware only establishes
 * "you are an active member of an active company".
 */
async function requireCompany(req, res, next) {
  try {
    if (!req.user || !req.user.id) return refuse(res);

    const membership = await CompanyMembership.findOne({
      userId: req.user.id,
      status: 'active',
    }).lean();
    if (!membership) return refuse(res);

    // Read the company fresh. This is the suspension kill switch: flipping
    // status to 'suspended' denies on the next request, with no UI required.
    const company = await Company.findById(membership.companyId)
      .select('status')
      .lean();
    if (!company || company.status !== 'active') return refuse(res);

    req.company = {
      companyId: String(membership.companyId),
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

module.exports = { requireCompany, requireCompanyRole };
