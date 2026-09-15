/**
 * End-to-end guarantees of the employer product, as tests.
 *
 * These were proved once by a throwaway script that was then deleted, leaving
 * every route under /hire and all of /api/consent with no test at all. The
 * guarantees are the product: if tenancy, consent scoping or the role gate
 * regress, nothing else in the suite notices.
 *
 * Driven through the real express app with supertest, so middleware ordering
 * is exercised rather than assumed — requireAuth -> requireCompany ->
 * requireCompanyRole -> candidateAccess is itself part of what is under test.
 * Models are in-memory (see support/hireDb.js); no database is required.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci';
process.env.NODE_ENV = 'test';

jest.mock('../models/Company', () => require('./support/hireDb').collection('companies'));
jest.mock('../models/CompanyMembership', () => require('./support/hireDb').collection('memberships'));
jest.mock('../models/CandidateCompanyConsent', () => require('./support/hireDb').collection('consents'));
jest.mock('../models/User', () => require('./support/hireDb').collection('users'));
jest.mock('../models/AssessmentTemplate', () => require('./support/hireDb').collection('templates'));
jest.mock('../models/AssessmentAttempt', () => require('./support/hireDb').collection('attempts'));
jest.mock('../models/InterviewSession', () => require('./support/hireDb').collection('interviews'));
jest.mock('../models/ResumeAnalysis', () => require('./support/hireDb').collection('resumes'));
jest.mock('../models/DisclosureAudit', () => require('./support/hireDb').collection('audits'));
jest.mock('../models/Job', () => require('./support/hireDb').collection('jobs'));
jest.mock('../models/Application', () => {
  const model = require('./support/hireDb').collection('applications');
  // Taken from the real model, never retyped. The first draft of this mock
  // hand-listed the stages and got two of them wrong ('applied', 'assessed'),
  // which the suite could not notice — the route validated against the mock's
  // own invention, so it agreed with itself while disagreeing with production.
  const real = jest.requireActual('../models/Application');
  model.STAGES = real.STAGES;
  model.RECRUITER_STAGES = real.RECRUITER_STAGES;
  return model;
});
jest.mock('../models/CompanyInvite', () => {
  const crypto = require('crypto');
  const model = require('./support/hireDb').collection('invites');
  model.hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  model.mintToken = () => {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, tokenHash: model.hashToken(token) };
  };
  return model;
});

const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { db, seed, reset, oid } = require('./support/hireDb');
const app = require('../server');
const Application = jest.requireActual('../models/Application');

const ids = {
  companyA: oid(),
  companyB: oid(),
  recruiterA: oid(),
  viewerA: oid(),
  recruiterB: oid(),
  candidate: oid(),
  candidate2: oid(),
  stranger: oid(),
  tplA: oid(),
  tplB: oid(),
  tplPlatform: oid(),
};

const token = (userId) => jwt.sign({ id: String(userId) }, process.env.JWT_SECRET, { expiresIn: '1h' });
const as = (req, userId) => req.set('Authorization', `Bearer ${token(userId)}`);

/** The one refusal body. Every denial in the system must equal this exactly. */
const NOT_FOUND = { error: 'Not found' };

/** recordDisclosure is intentionally not awaited by the routes. */
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

beforeEach(() => {
  jest.clearAllMocks();
  reset();

  seed('companies', { _id: ids.companyA, name: 'Acme', status: 'active' });
  seed('companies', { _id: ids.companyB, name: 'Globex', status: 'active' });

  seed('memberships', { userId: ids.recruiterA, companyId: ids.companyA, role: 'owner', status: 'active' });
  seed('memberships', { userId: ids.viewerA, companyId: ids.companyA, role: 'viewer', status: 'active' });
  seed('memberships', { userId: ids.recruiterB, companyId: ids.companyB, role: 'recruiter', status: 'active' });

  seed('users', { _id: ids.candidate, name: 'Ada Lovelace', email: 'ada@uni.edu' });
  seed('users', { _id: ids.candidate2, name: 'Grace Hopper', email: 'grace@uni.edu' });
  seed('users', { _id: ids.stranger, name: 'Mallory', email: 'mallory@elsewhere.com' });

  // Ada consented to Acme only. Grace consented to Acme too, for /compare.
  seed('consents', {
    candidateId: ids.candidate,
    companyId: ids.companyA,
    state: 'REVEALED',
    source: 'invite',
    revokedAt: null,
  });
  seed('consents', {
    candidateId: ids.candidate2,
    companyId: ids.companyA,
    state: 'REVEALED',
    source: 'invite',
    revokedAt: null,
  });

  seed('templates', { _id: ids.tplA, companyId: ids.companyA, name: 'Acme private instrument' });
  seed('templates', { _id: ids.tplB, companyId: ids.companyB, name: 'Globex private instrument' });
  seed('templates', { _id: ids.tplPlatform, companyId: null, name: 'Platform baseline' });

  const attempt = (templateId, score) => ({
    userId: ids.candidate,
    templateId,
    status: 'completed',
    integrityVerdict: 'clean',
    sectionResults: [{ sectionIndex: 0, type: 'mcq', score, maxScore: 100 }],
    startedAt: new Date(),
    completedAt: new Date(),
  });
  seed('attempts', attempt(ids.tplA, 91));
  seed('attempts', attempt(ids.tplB, 44));
  seed('attempts', attempt(ids.tplPlatform, 70));
});

// ── the client's copy of the stage list ────────────────────────────────────

describe('the frontend stage list matches the model', () => {
  const fs = require('fs');
  const path = require('path');

  test('RECRUITER_STAGES in hireApi.ts is identical to the model, in order', () => {
    // The list is hand-duplicated across the wire because TypeScript cannot
    // import a mongoose enum. Duplication is fine; SILENT duplication is not —
    // a stage the client offers but the model rejects is a 400 the user sees
    // as "nothing happened when I dragged the card".
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'hiready-frontend', 'src', 'lib', 'hireApi.ts'),
      'utf8'
    );
    const match = src.match(/RECRUITER_STAGES:\s*PipelineStage\[\]\s*=\s*\[([^\]]*)\]/);
    expect(match).not.toBeNull();

    const client = match[1].split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    expect(client).toEqual(Application.RECRUITER_STAGES);
  });

  test('the client never offers withdrawn', () => {
    // It is the candidate's lever. Offering it to a recruiter would let them
    // record someone as having left of their own accord.
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'hiready-frontend', 'src', 'lib', 'hireApi.ts'),
      'utf8'
    );
    const match = src.match(/RECRUITER_STAGES:\s*PipelineStage\[\]\s*=\s*\[([^\]]*)\]/);
    expect(match[1]).not.toMatch(/withdrawn/);
  });
});

// ── the tenant boundary ────────────────────────────────────────────────────

describe('tenancy', () => {
  test('a user with no membership cannot reach the hire tree at all', async () => {
    const res = await as(request(app).get('/api/hire/jobs'), ids.stranger);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('an unauthenticated caller is refused before any company lookup', async () => {
    const res = await request(app).get('/api/hire/jobs');
    expect(res.status).toBe(401);
  });

  test('belonging to two companies without x-company-id is refused, not guessed', async () => {
    // Picking one with a bare findOne() follows natural collection order and
    // would silently act on the wrong company's pipeline.
    seed('memberships', {
      userId: ids.recruiterA, companyId: ids.companyB, role: 'recruiter', status: 'active',
    });
    const res = await as(request(app).get('/api/hire/jobs'), ids.recruiterA);
    expect(res.status).toBe(404);

    const picked = await as(request(app).get('/api/hire/jobs'), ids.recruiterA)
      .set('x-company-id', String(ids.companyB));
    expect(picked.status).toBe(200);
  });

  test('x-company-id naming a company the caller does not belong to is refused', async () => {
    const res = await as(request(app).get('/api/hire/jobs'), ids.recruiterA)
      .set('x-company-id', String(ids.companyB));
    expect(res.status).toBe(404);
  });
});

// ── consent is per company, and is the only door ───────────────────────────

describe('consent', () => {
  test('the consenting company sees identity and evidence', async () => {
    const res = await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterA);
    expect(res.status).toBe(200);
    expect(res.body.identity).toEqual({ name: 'Ada Lovelace', email: 'ada@uni.edu' });
    expect(res.body.assessments.length).toBeGreaterThan(0);
  });

  test('a company with no consent row gets the same 404 as an unknown candidate', async () => {
    const unconsented = await as(
      request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterB
    );
    const unknown = await as(request(app).get(`/api/hire/candidates/${oid()}`), ids.recruiterB);
    const malformed = await as(request(app).get('/api/hire/candidates/not-an-id'), ids.recruiterB);

    expect(unconsented.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    // Byte-identical, or the difference enumerates the candidate pool.
    expect(unconsented.text).toBe(unknown.text);
    expect(malformed.text).toBe(unknown.text);
    expect(unconsented.body).toEqual(NOT_FOUND);
  });

  test('a DISCOVERABLE candidate cannot be resolved to a person', async () => {
    db.consents = [];
    seed('consents', {
      candidateId: ids.candidate,
      companyId: ids.companyA,
      state: 'DISCOVERABLE',
      source: 'discovery',
      revokedAt: null,
    });
    const res = await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterA);
    expect(res.status).toBe(404);
  });

  test('revocation closes access on the very next request', async () => {
    const before = await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterA);
    expect(before.status).toBe(200);

    db.consents[0].state = 'REVOKED';
    db.consents[0].revokedAt = new Date();

    const after = await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterA);
    expect(after.status).toBe(404);
  });

  test('suspending the company kills access without touching consent', async () => {
    db.companies[0].status = 'suspended';
    const res = await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterA);
    expect(res.status).toBe(404);
    // The consent row is untouched — suspension is the company's problem, not
    // a withdrawal of the candidate's permission.
    expect(db.consents[0].state).toBe('REVEALED');
  });
});

// ── cross-tenant evidence isolation (regression: getScorecard was unscoped) ──

describe('a company never sees another company instrument', () => {
  test('the Acme scorecard contains no attempt on the Globex template', async () => {
    const res = await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterA);
    expect(res.status).toBe(200);

    const templates = res.body.assessments.map((a) => String(a.templateId));
    expect(templates).toContain(String(ids.tplA));
    expect(templates).toContain(String(ids.tplPlatform));
    // Without the template filter Globex's private instrument, its section
    // composition and Ada's score on it all cross the tenant line.
    expect(templates).not.toContain(String(ids.tplB));
  });

  test('the same holds for the company on the other side', async () => {
    seed('consents', {
      candidateId: ids.candidate,
      companyId: ids.companyB,
      state: 'REVEALED',
      source: 'invite',
      revokedAt: null,
    });
    const res = await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterB);
    const templates = res.body.assessments.map((a) => String(a.templateId));
    expect(templates).toContain(String(ids.tplB));
    expect(templates).not.toContain(String(ids.tplA));
  });

  test('practice interviews are not served as hiring evidence', async () => {
    seed('interviews', {
      user: ids.candidate,
      mode: 'practice',
      role: 'SDE',
      analysisJson: { overallScore: 80, performanceBreakdown: { clarity: 8 } },
      createdAt: new Date(),
    });
    seed('interviews', {
      user: ids.candidate,
      mode: 'assessment',
      role: 'SDE',
      analysisJson: { overallScore: 65, performanceBreakdown: { clarity: 6 } },
      createdAt: new Date(),
    });
    const res = await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterA);
    expect(res.body.interviews).toHaveLength(1);
    expect(res.body.interviews[0].overallScore).toBe(65);
    // The analyser emits performanceBreakdown; reading `dimensions` rendered
    // an empty breakdown on every scorecard.
    expect(res.body.interviews[0].dimensions).toEqual({ clarity: 6 });
  });
});

// ── the viewer role (regression: /invites returned raw addresses) ───────────

describe('a viewer can read the pipeline but never unmask anyone', () => {
  test('the scorecard renders with identity null rather than erroring', async () => {
    const res = await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.viewerA);
    expect(res.status).toBe(200);
    expect(res.body.identity).toBeNull();
    expect(res.body.scopes).not.toContain('identity');
    expect(res.body.assessments.length).toBeGreaterThan(0);
  });

  test('no route returns an email to a viewer', async () => {
    seed('invites', {
      companyId: ids.companyA,
      email: 'ada@uni.edu',
      status: 'accepted',
      tokenHash: 'x',
      expiresAt: new Date(Date.now() + 864e5),
    });

    const routes = [
      `/api/hire/candidates/${ids.candidate}`,
      '/api/hire/invites',
      '/api/hire/jobs',
      '/api/hire/discover',
    ];
    for (const route of routes) {
      const res = await as(request(app).get(route), ids.viewerA);
      expect([200, 404]).toContain(res.status);
      expect(res.text).not.toMatch(/ada@uni\.edu/);
    }
  });

  test('the invite list is role-gated outright', async () => {
    const viewer = await as(request(app).get('/api/hire/invites'), ids.viewerA);
    expect(viewer.status).toBe(404);
    expect(viewer.body).toEqual(NOT_FOUND);
  });
});

describe('invite listing discloses only where consent exists', () => {
  beforeEach(() => {
    const base = { companyId: ids.companyA, tokenHash: 'h', expiresAt: new Date(Date.now() + 864e5) };
    seed('invites', { ...base, email: 'accepted@uni.edu', status: 'accepted' });
    seed('invites', { ...base, email: 'declined@uni.edu', status: 'declined' });
    seed('invites', { ...base, email: 'pending@uni.edu', status: 'sent' });
  });

  test('accepted addresses come back raw; everything else is masked', async () => {
    const res = await as(request(app).get('/api/hire/invites'), ids.recruiterA);
    expect(res.status).toBe(200);
    const byStatus = Object.fromEntries(res.body.invites.map((i) => [i.status, i]));

    expect(byStatus.accepted.email).toBe('accepted@uni.edu');
    expect(byStatus.accepted.emailMasked).toBe(false);

    // Declining is not consent. A refusal must not become a disclosure.
    expect(byStatus.declined.email).not.toBe('declined@uni.edu');
    expect(byStatus.declined.email).toMatch(/@uni\.edu$/);
    expect(byStatus.declined.emailMasked).toBe(true);
    expect(byStatus.sent.emailMasked).toBe(true);
  });

  test('no token or hash is ever returned', async () => {
    const res = await as(request(app).get('/api/hire/invites'), ids.recruiterA);
    expect(res.text).not.toMatch(/tokenHash|"token"/);
  });
});

// ── invite redemption is bound to the invited address ──────────────────────

describe('an invite token alone is not enough', () => {
  const TOKEN = 'a'.repeat(64);
  const hash = crypto.createHash('sha256').update(TOKEN).digest('hex');

  beforeEach(() => {
    seed('invites', {
      companyId: ids.companyA,
      email: 'ada@uni.edu',
      status: 'sent',
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 864e5),
      jobId: null,
    });
  });

  test('a different account cannot redeem it', async () => {
    const res = await as(
      request(app).post(`/api/consent/invite/${TOKEN}/accept`), ids.stranger
    );
    expect(res.status).toBe(404);
    // And critically the invite is NOT burned — otherwise the real invitee is
    // locked out of an invite addressed to her.
    expect(db.invites[0].status).toBe('sent');
    expect(db.consents.some((c) => String(c.candidateId) === String(ids.stranger))).toBe(false);
  });

  test('a different account cannot preview it either', async () => {
    const res = await as(request(app).get(`/api/consent/invite/${TOKEN}`), ids.stranger);
    expect(res.status).toBe(404);
    expect(res.text).not.toMatch(/ada@uni\.edu/);
  });

  test('a different account cannot decline it on her behalf', async () => {
    const res = await as(
      request(app).post(`/api/consent/invite/${TOKEN}/decline`), ids.stranger
    );
    expect(res.status).toBe(404);
    expect(db.invites[0].status).toBe('sent');
  });

  test('the invitee can redeem it, and that IS the consent event', async () => {
    db.consents = [];
    const res = await as(
      request(app).post(`/api/consent/invite/${TOKEN}/accept`), ids.candidate
    );
    expect(res.status).toBe(200);
    expect(db.invites[0].status).toBe('accepted');

    const consent = db.consents.find((c) => String(c.candidateId) === String(ids.candidate));
    expect(consent.state).toBe('REVEALED');
    expect(String(consent.companyId)).toBe(String(ids.companyA));
    // Accepting Acme's invite must not make her visible to Globex.
    expect(db.consents.some((c) => String(c.companyId) === String(ids.companyB))).toBe(false);
  });
});

// ── the disclosure audit ───────────────────────────────────────────────────

describe('every read that yields data is audited', () => {
  test('a scorecard read writes one row naming the scopes used', async () => {
    await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterA);
    await flush();

    expect(db.audits).toHaveLength(1);
    expect(db.audits[0]).toMatchObject({
      action: 'disclosed',
      candidateId: String(ids.candidate),
      companyId: String(ids.companyA),
    });
    expect(db.audits[0].scopes).toEqual(expect.arrayContaining(['identity', 'assessment']));
  });

  test('a viewer read is audited too, despite disclosing no identity', async () => {
    await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.viewerA);
    await flush();

    expect(db.audits).toHaveLength(1);
    expect(db.audits[0].scopes).not.toContain('identity');
    expect(db.audits[0].scopes).toContain('assessment');
  });

  test('compare writes one row per candidate actually returned', async () => {
    const res = await as(request(app).post('/api/hire/candidates/compare'), ids.recruiterA)
      .send({ candidateIds: [String(ids.candidate), String(ids.candidate2)] });
    await flush();

    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(2);
    expect(db.audits).toHaveLength(2);
    expect(db.audits.map((a) => a.candidateId).sort())
      .toEqual([String(ids.candidate), String(ids.candidate2)].sort());
  });

  test('compare silently omits candidates the caller cannot see', async () => {
    const res = await as(request(app).post('/api/hire/candidates/compare'), ids.recruiterA)
      .send({ candidateIds: [String(ids.candidate), String(oid())] });
    await flush();

    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(1);
    // One inaccessible candidate must not announce itself by changing the shape.
    expect(db.audits).toHaveLength(1);
  });

  test('a refused read writes nothing', async () => {
    await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterB);
    await flush();
    expect(db.audits).toHaveLength(0);
  });
});

// ── discovery is a left join, not an inner one ─────────────────────────────

describe('discovery lists everyone who opted in', () => {
  const { aggregates } = require('./support/hireDb');

  beforeEach(() => {
    db.consents = [];
    // Two opted-in candidates for Acme. Only one has ever sat anything.
    seed('consents', {
      candidateId: ids.candidate, companyId: ids.companyA,
      state: 'DISCOVERABLE', source: 'discovery', revokedAt: null, grantedAt: new Date(),
    });
    seed('consents', {
      candidateId: ids.candidate2, companyId: ids.companyA,
      state: 'DISCOVERABLE', source: 'discovery', revokedAt: null, grantedAt: new Date(),
    });
    aggregates.attempts = [
      { _id: ids.candidate, attempts: 2, lastAt: new Date(), percent: 84 },
    ];
  });

  test('a candidate with no attempt still appears, scored null', async () => {
    // Ranking straight off the attempt aggregate made this an inner join: a
    // candidate with nothing to rank produced no group and vanished, despite
    // having opted in. In a placement cell that is the student a company most
    // wants — consented, available, not yet assessed.
    const res = await as(request(app).get('/api/hire/discover'), ids.recruiterA);
    expect(res.status).toBe(200);

    const handles = res.body.candidates.map((c) => String(c.handle));
    expect(handles).toContain(String(ids.candidate));
    expect(handles).toContain(String(ids.candidate2));

    const unscored = res.body.candidates.find((c) => String(c.handle) === String(ids.candidate2));
    expect(unscored.assessmentPercent).toBeNull();
    expect(unscored.assessments).toBe(0);
  });

  test('scored candidates rank above unscored ones', async () => {
    const res = await as(request(app).get('/api/hire/discover'), ids.recruiterA);
    expect(String(res.body.candidates[0].handle)).toBe(String(ids.candidate));
    expect(res.body.candidates[0].assessmentPercent).toBe(84);
  });

  test('a score floor excludes candidates with no evidence', async () => {
    // A floor is a statement about evidence, so someone with none cannot meet
    // it. At the default floor of 0 they are included.
    const res = await as(request(app).get('/api/hire/discover?minScore=50'), ids.recruiterA);
    const handles = res.body.candidates.map((c) => String(c.handle));
    expect(handles).toEqual([String(ids.candidate)]);
  });

  test('total is the size of the pool, not of the page', async () => {
    const res = await as(request(app).get('/api/hire/discover?limit=1'), ids.recruiterA);
    expect(res.body.candidates).toHaveLength(1);
    // Previously this reported the already-limited length, so a recruiter
    // reading "1 candidate" was reading the page size.
    expect(res.body.total).toBe(2);
    expect(res.body.capped).toBe(true);
  });

  test('a candidate who never opted in is absent entirely', async () => {
    const res = await as(request(app).get('/api/hire/discover'), ids.recruiterA);
    const handles = res.body.candidates.map((c) => String(c.handle));
    expect(handles).not.toContain(String(ids.stranger));
    expect(res.body.total).toBe(2);
  });
});

// ── the candidate's own side ───────────────────────────────────────────────

describe('the candidate can see and withdraw access', () => {
  test('consent/me lists exactly the companies that can see them', async () => {
    const res = await as(request(app).get('/api/consent/me'), ids.candidate);
    expect(res.status).toBe(200);
    expect(res.body.companies).toHaveLength(1);
    expect(res.body.companies[0].state).toBe('REVEALED');
    // Named, not just counted — a privacy screen that says "1 company" without
    // saying which one is not a privacy screen.
    expect(res.body.companies[0].company).toMatchObject({ name: 'Acme' });
  });

  test('revoking withdraws live applications rather than leaving them on the board', async () => {
    seed('applications', {
      candidateId: ids.candidate,
      companyId: ids.companyA,
      jobId: oid(),
      stage: 'shortlisted',
      history: [],
    });

    const res = await as(
      request(app).delete(`/api/consent/${ids.companyA}`), ids.candidate
    );
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('REVOKED');
    // Without this the candidate stays on the pipeline board and a recruiter
    // can still move them to hired or rejected.
    expect(db.applications[0].stage).toBe('withdrawn');
    // The response says plainly what revocation does NOT do.
    expect(res.body.note).toMatch(/already ran remain/i);
  });

  test('revocation does not delete the disclosure trail', async () => {
    await as(request(app).get(`/api/hire/candidates/${ids.candidate}`), ids.recruiterA);
    await flush();
    const disclosures = db.audits.filter((a) => a.action === 'disclosed').length;

    await as(request(app).delete(`/api/consent/${ids.companyA}`), ids.candidate);
    await flush();

    // The audit must outlive the consent it records — it is the only answer to
    // "who saw my results?".
    expect(db.audits.filter((a) => a.action === 'disclosed')).toHaveLength(disclosures);
    expect(db.audits.some((a) => a.action === 'revoked')).toBe(true);
  });

  test('expressing interest surfaces on the candidate privacy screen', async () => {
    db.consents = [];
    seed('consents', {
      candidateId: ids.candidate,
      companyId: ids.companyA,
      state: 'DISCOVERABLE',
      source: 'discovery',
      revokedAt: null,
    });

    const interest = await as(
      request(app).post(`/api/hire/discover/${ids.candidate}/interest`), ids.recruiterA
    );
    expect(interest.status).toBe(200);

    // interestAt is written through doc.set(); an undeclared path is dropped in
    // silence under strict:true and the route still answers {ok:true}, which is
    // exactly how this funnel was dead while every response looked healthy.
    const mine = await as(request(app).get('/api/consent/me'), ids.candidate);
    expect(mine.body.companies[0].interestAt).toBeTruthy();
  });

  test('accepting that interest moves the consent to REVEALED and clears the prompt', async () => {
    db.consents = [];
    seed('consents', {
      candidateId: ids.candidate,
      companyId: ids.companyA,
      state: 'DISCOVERABLE',
      source: 'discovery',
      revokedAt: null,
      interestAt: new Date(),
      interestBy: ids.recruiterA,
    });

    const res = await as(request(app).post(`/api/consent/${ids.companyA}/reveal`), ids.candidate);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('REVEALED');
    expect(db.consents[0].interestAt).toBeNull();
  });

  test('opting into discovery never downgrades a live grant', async () => {
    const res = await as(
      request(app).post(`/api/consent/discoverable/${ids.companyA}`), ids.candidate
    );
    expect(res.status).toBe(200);
    // Cutting a recruiter off mid-pipeline and rewriting `source` is not what
    // "I am open to being discovered" means.
    expect(res.body.state).toBe('REVEALED');
    expect(db.consents[0].source).toBe('invite');
  });
});
