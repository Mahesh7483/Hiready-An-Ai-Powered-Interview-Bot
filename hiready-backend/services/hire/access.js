const CandidateCompanyConsent = require('../../models/CandidateCompanyConsent');

/**
 * The only way recruiter code reaches a candidate.
 *
 * Authorization is an API shape here, not a convention. Every reader under
 * services/hire takes the capability this returns; none of them accept a bare
 * candidateId, so there is no signature you can call without having passed
 * through this function.
 *
 * Invariants carried here (frozen for Phase A):
 *
 *  1. The capability is request-scoped. It is frozen, its scope set is closed
 *     over rather than exposed, and JSON.stringify on it throws — so it cannot
 *     be parked in a session, signed into a token, or returned in a response
 *     by accident. A capability that outlives the request is a capability that
 *     outlives revocation.
 *
 *  2. Consent is re-read on every call. Nothing is cached. requireCompany has
 *     already re-read membership and Company.status for this same request.
 *
 *  3. No consent row means deny. PRIVATE is the absence of a row.
 *
 *  4. Denial is externally indistinguishable from nonexistence: every refusal
 *     is the same notFound. The audit layer can still tell them apart.
 *
 *  9. Company status was checked by requireCompany BEFORE this runs, and this
 *     function refuses outright if that middleware did not run.
 */

/** Scopes that exist. Mirrors policy/dataAccess.js recruiterScopes(). */
const SCOPES = ['identity', 'resume', 'assessment', 'interview'];

/** The single refusal. Identical for every reason, on purpose (invariant 4). */
function notFound() {
  const err = new Error('Not found');
  err.status = 404;
  err.expose = true;
  return err;
}

/**
 * What a given consent state and company role may see.
 *
 * DISCOVERABLE is absent deliberately: a pseudonymous candidate cannot be
 * resolved to a person through this door at all. Discovery (Phase E) is an
 * aggregate, non-identifying query that never issues a capability.
 */
function scopesFor(consentState, role) {
  if (consentState !== 'REVEALED' && consentState !== 'IN_PROCESS') return [];
  const scopes = ['assessment', 'interview', 'resume'];
  // A viewer may read the pipeline but never unmask anyone.
  if (role !== 'viewer') scopes.push('identity');
  return scopes;
}

/**
 * Builds the capability. Frozen, non-serialisable, and its scope set is held
 * in a closure so it cannot be widened after the fact.
 */
function makeAccess({ candidateId, companyId, consentId, role, scopes }) {
  const granted = new Set(scopes);
  const access = {
    candidateId: String(candidateId),
    companyId: String(companyId),
    consentId: String(consentId),
    role,
    /** The only reader of the scope set. */
    has(scope) {
      return granted.has(scope);
    },
    /** A copy, so a caller cannot mutate the real set. */
    scopes() {
      return [...granted];
    },
    toJSON() {
      throw new Error(
        'CandidateAccess must not be serialised — it is request-scoped (invariant 1)'
      );
    },
  };
  return Object.freeze(access);
}

/**
 * @param {import('express').Request} req  the live request — taken rather than
 *   a user object so a caller holding a capability outside a request has
 *   nothing to pass, which is what makes invariant 1 awkward to break.
 * @param {string} candidateId
 * @returns {Promise<Readonly<object>>} the capability
 * @throws  a 404 for every refusal
 */
async function candidateAccess(req, candidateId) {
  // requireCompany must have run: it re-read membership AND Company.status for
  // this request. Refusing here enforces the middleware ordering (invariant 9)
  // rather than trusting callers to compose correctly.
  if (!req || !req.company || !req.company.companyId) throw notFound();
  if (!candidateId) throw notFound();

  const consent = await CandidateCompanyConsent.findOne({
    candidateId,
    companyId: req.company.companyId, // never optional — consent is per company
    state: { $in: ['REVEALED', 'IN_PROCESS'] },
    revokedAt: null,
  })
    .select('_id state')
    .lean();

  // Covers "no such candidate", "candidate exists but never consented",
  // "consent revoked" and "consent is only DISCOVERABLE" with one response.
  if (!consent) throw notFound();

  const scopes = scopesFor(consent.state, req.company.role);
  if (!scopes.length) throw notFound();

  return makeAccess({
    candidateId,
    companyId: req.company.companyId,
    consentId: consent._id,
    role: req.company.role,
    scopes,
  });
}

/**
 * Asserts a capability carries a scope. Every reader calls this first:
 *
 *   function getScorecard(access) {
 *     requireScope(access, 'assessment');
 *     ...
 *   }
 */
function requireScope(access, scope) {
  if (!access || typeof access.has !== 'function') throw notFound();
  if (!SCOPES.includes(scope)) throw new Error(`unknown scope: ${scope}`);
  if (!access.has(scope)) throw notFound();
  return access;
}

module.exports = { candidateAccess, requireScope, scopesFor, notFound, SCOPES };
