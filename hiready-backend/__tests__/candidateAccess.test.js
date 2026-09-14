/**
 * Phase A/B invariants, as tests rather than review comments.
 *
 * Models are mocked so this runs without a database — the point is the
 * authorization logic and the shape of the capability, not Mongo.
 */

jest.mock('../models/CandidateCompanyConsent', () => ({ findOne: jest.fn() }));
jest.mock('../models/Company', () => ({ findById: jest.fn() }));
jest.mock('../models/CompanyMembership', () => ({ findOne: jest.fn() }));

const CandidateCompanyConsent = require('../models/CandidateCompanyConsent');
const Company = require('../models/Company');
const CompanyMembership = require('../models/CompanyMembership');
const { candidateAccess, requireScope, scopesFor } = require('../services/hire/access');
const { requireCompany } = require('../middleware/company');

const CANDIDATE = '6a8d13f539fc72e44cfaa894';
const COMPANY = '6a8aab87b931980132a1d724';

/** Mongoose chain stubs: .select().lean() and .lean(). */
const consentResolving = (doc) => ({ select: () => ({ lean: async () => doc }) });
const companyResolving = (doc) => ({ select: () => ({ lean: async () => doc }) });
const membershipResolving = (doc) => ({ lean: async () => doc });

const reqWithCompany = (role = 'recruiter') => ({
  company: { companyId: COMPANY, role, membershipId: 'm1' },
});

beforeEach(() => jest.clearAllMocks());

// ── Invariant 3: missing consent means deny ────────────────────────────────

describe('invariant 3 — no consent row means deny', () => {
  test('refuses when no consent exists', async () => {
    CandidateCompanyConsent.findOne.mockReturnValue(consentResolving(null));
    await expect(candidateAccess(reqWithCompany(), CANDIDATE)).rejects.toMatchObject({ status: 404 });
  });

  test('refuses a DISCOVERABLE candidate — pseudonymous is not resolvable', async () => {
    // The query itself filters to REVEALED/IN_PROCESS, so a DISCOVERABLE row
    // simply does not come back.
    CandidateCompanyConsent.findOne.mockReturnValue(consentResolving(null));
    await expect(candidateAccess(reqWithCompany(), CANDIDATE)).rejects.toMatchObject({ status: 404 });

    const query = CandidateCompanyConsent.findOne.mock.calls[0][0];
    expect(query.state).toEqual({ $in: ['REVEALED', 'IN_PROCESS'] });
    expect(query.revokedAt).toBeNull();
  });

  test('the consent lookup is always scoped to the calling company', async () => {
    CandidateCompanyConsent.findOne.mockReturnValue(consentResolving(null));
    await candidateAccess(reqWithCompany(), CANDIDATE).catch(() => {});
    expect(CandidateCompanyConsent.findOne.mock.calls[0][0].companyId).toBe(COMPANY);
  });
});

// ── Invariant 4: denial looks like nonexistence ────────────────────────────

describe('invariant 4 — denial is indistinguishable from nonexistence', () => {
  test('unknown candidate and unconsented candidate produce identical errors', async () => {
    CandidateCompanyConsent.findOne.mockReturnValue(consentResolving(null));
    const unknown = await candidateAccess(reqWithCompany(), 'deadbeefdeadbeefdeadbeef').catch((e) => e);
    const unconsented = await candidateAccess(reqWithCompany(), CANDIDATE).catch((e) => e);

    expect(unknown.status).toBe(404);
    expect(unconsented.status).toBe(404);
    expect(unknown.message).toBe(unconsented.message);
  });

  test('a missing capability and a missing scope also 404, never 403', async () => {
    await expect(candidateAccess({}, CANDIDATE)).rejects.toMatchObject({ status: 404 });
    expect(() => requireScope(null, 'identity')).toThrow(expect.objectContaining({ status: 404 }));
  });
});

// ── Invariant 1: the capability is request-scoped ──────────────────────────

describe('invariant 1 — the capability cannot outlive the request', () => {
  const grant = () =>
    CandidateCompanyConsent.findOne.mockReturnValue(
      consentResolving({ _id: 'c1', state: 'REVEALED' })
    );

  test('is frozen', async () => {
    grant();
    const access = await candidateAccess(reqWithCompany(), CANDIDATE);
    expect(Object.isFrozen(access)).toBe(true);
  });

  test('throws if anything tries to serialise it', async () => {
    grant();
    const access = await candidateAccess(reqWithCompany(), CANDIDATE);
    expect(() => JSON.stringify(access)).toThrow(/must not be serialised/);
  });

  test('its scope set cannot be widened from outside', async () => {
    grant();
    const access = await candidateAccess(reqWithCompany(), CANDIDATE);
    access.scopes().push('identity', 'everything'); // mutating the copy
    expect(access.has('everything')).toBe(false);
    expect(access.scopes()).not.toContain('everything');
  });

  test('refuses to run at all without a live request that passed requireCompany', async () => {
    grant();
    await expect(candidateAccess(undefined, CANDIDATE)).rejects.toMatchObject({ status: 404 });
    await expect(candidateAccess({ company: {} }, CANDIDATE)).rejects.toMatchObject({ status: 404 });
  });
});

// ── Scope derivation ───────────────────────────────────────────────────────

describe('scopes', () => {
  test('a viewer never receives identity', () => {
    expect(scopesFor('REVEALED', 'viewer')).not.toContain('identity');
    expect(scopesFor('REVEALED', 'recruiter')).toContain('identity');
    expect(scopesFor('REVEALED', 'owner')).toContain('identity');
  });

  test('DISCOVERABLE and REVOKED grant nothing through this door', () => {
    expect(scopesFor('DISCOVERABLE', 'owner')).toEqual([]);
    expect(scopesFor('REVOKED', 'owner')).toEqual([]);
  });

  test('requireScope gates a reader', async () => {
    CandidateCompanyConsent.findOne.mockReturnValue(
      consentResolving({ _id: 'c1', state: 'REVEALED' })
    );
    const viewer = await candidateAccess(reqWithCompany('viewer'), CANDIDATE);
    expect(() => requireScope(viewer, 'assessment')).not.toThrow();
    expect(() => requireScope(viewer, 'identity')).toThrow(expect.objectContaining({ status: 404 }));
  });
});

// ── Invariant 2: everything re-read per request ────────────────────────────

describe('invariant 2 — nothing is cached across requests', () => {
  test('two sequential calls each hit the consent collection', async () => {
    CandidateCompanyConsent.findOne.mockReturnValue(
      consentResolving({ _id: 'c1', state: 'REVEALED' })
    );
    await candidateAccess(reqWithCompany(), CANDIDATE);
    await candidateAccess(reqWithCompany(), CANDIDATE);
    expect(CandidateCompanyConsent.findOne).toHaveBeenCalledTimes(2);
  });

  test('two sequential requests each re-read membership and company status', async () => {
    CompanyMembership.findOne.mockReturnValue(
      membershipResolving({ _id: 'm1', companyId: COMPANY, role: 'recruiter' })
    );
    Company.findById.mockReturnValue(companyResolving({ status: 'active' }));

    const run = async () => {
      const req = { user: { id: 'u1' } };
      await new Promise((done) => requireCompany(req, { status: () => ({ json: done }) }, done));
      return req;
    };
    await run();
    await run();

    expect(CompanyMembership.findOne).toHaveBeenCalledTimes(2);
    expect(Company.findById).toHaveBeenCalledTimes(2);
  });
});

// ── Invariant 9: suspension bites before any capability exists ─────────────

describe('invariant 9 — suspension is enforced before capability creation', () => {
  test('a suspended company is denied, and consent is never even queried', async () => {
    CompanyMembership.findOne.mockReturnValue(
      membershipResolving({ _id: 'm1', companyId: COMPANY, role: 'owner' })
    );
    Company.findById.mockReturnValue(companyResolving({ status: 'suspended' }));

    const req = { user: { id: 'u1' } };
    const body = await new Promise((resolve) =>
      requireCompany(req, { status: () => ({ json: resolve }) }, () =>
        resolve(new Error('should not have called next()'))
      )
    );

    expect(body).toEqual({ error: 'Not found' });
    expect(req.company).toBeUndefined();
    // The ordering proof: no consent lookup happened.
    expect(CandidateCompanyConsent.findOne).not.toHaveBeenCalled();
  });

  test('a removed member is denied even while the company is active', async () => {
    CompanyMembership.findOne.mockReturnValue(membershipResolving(null));
    Company.findById.mockReturnValue(companyResolving({ status: 'active' }));

    const req = { user: { id: 'u1' } };
    const body = await new Promise((resolve) =>
      requireCompany(req, { status: () => ({ json: resolve }) }, () =>
        resolve(new Error('should not have called next()'))
      )
    );
    expect(body).toEqual({ error: 'Not found' });
    expect(Company.findById).not.toHaveBeenCalled();
  });
});

// ── Invariant 10: revocation is forward-only ───────────────────────────────

describe('invariant 10 — revocation stops future access only', () => {
  test('a revoked consent yields no capability', async () => {
    // revokedAt: null is part of the query, so a revoked row never matches.
    CandidateCompanyConsent.findOne.mockReturnValue(consentResolving(null));
    await expect(candidateAccess(reqWithCompany(), CANDIDATE)).rejects.toMatchObject({ status: 404 });
    expect(CandidateCompanyConsent.findOne.mock.calls[0][0].revokedAt).toBeNull();
  });

  test('revocation touches no assessment or result collection', () => {
    // Structural check: the consent service must not reach evidence at all.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'services', 'hire', 'consent.js'),
      'utf8'
    );
    expect(src).not.toMatch(/AssessmentAttempt|TestResult|deleteMany|remove\(/);
  });
});
