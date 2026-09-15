/**
 * Live end-to-end check of the employer product, against a real database.
 *
 * WHY THIS EXISTS ALONGSIDE __tests__/hireFlow.test.js
 *
 * That suite mocks the models, so it proves the AUTHORIZATION LOGIC — middleware
 * ordering, scope derivation, refusal shape. It cannot prove that a mongoose
 * filter matches the documents mongo actually holds, and that gap is where every
 * serious bug in this codebase has lived: strict:true dropping an undeclared
 * path, a cast filter matching nothing, an index rejecting a write. Those only
 * appear against a real server and a real mongod.
 *
 * Everything it creates is tagged with a unique run id and deleted afterwards,
 * including on failure. It touches no pre-existing row.
 *
 *   node scripts/smokeHireFlow.js
 *
 * Exits non-zero if any check fails.
 */
require('dotenv').config({ quiet: true });

process.env.NODE_ENV = process.env.NODE_ENV || 'test'; // stop server.js self-listening

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../server');
const User = require('../models/User');
const Company = require('../models/Company');
const CompanyMembership = require('../models/CompanyMembership');
const CandidateCompanyConsent = require('../models/CandidateCompanyConsent');
const CompanyInvite = require('../models/CompanyInvite');
const AssessmentTemplate = require('../models/AssessmentTemplate');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const Job = require('../models/Job');
const Application = require('../models/Application');
const DisclosureAudit = require('../models/DisclosureAudit');

const RUN = `smoke-${Date.now()}`;
const tag = (s) => `${RUN}-${s}@smoke.invalid`;

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`);
  }
}

async function main() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  await mongoose.connect(process.env.MONGO_URI);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const token = (id) => jwt.sign({ id: String(id) }, process.env.JWT_SECRET, { expiresIn: '10m' });

  /** Returns { status, body, text }. Never throws on a non-2xx. */
  async function call(path, { as, company, method = 'GET', body } = {}) {
    const headers = {};
    if (as) headers.Authorization = `Bearer ${token(as)}`;
    if (company) headers['x-company-id'] = String(company);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: parsed, text };
  }

  try {
    // ── 4. seed ────────────────────────────────────────────────────────────
    console.log(`\nseeding (${RUN})\n`);

    const [acme, globex, suspendable] = await Company.create([
      { name: `${RUN} Acme`, status: 'active' },
      { name: `${RUN} Globex`, status: 'active' },
      { name: `${RUN} Initech`, status: 'active' },
    ]);

    const [recruiterA, viewerA, recruiterB, ada, grace] = await User.create([
      { name: 'Smoke Recruiter A', email: tag('recruiter-a') },
      { name: 'Smoke Viewer A', email: tag('viewer-a') },
      { name: 'Smoke Recruiter B', email: tag('recruiter-b') },
      { name: 'Smoke Ada', email: tag('ada') },
      { name: 'Smoke Grace', email: tag('grace') },
    ]);

    await CompanyMembership.create([
      { userId: recruiterA._id, companyId: acme._id, role: 'owner', status: 'active' },
      { userId: viewerA._id, companyId: acme._id, role: 'viewer', status: 'active' },
      { userId: recruiterB._id, companyId: globex._id, role: 'recruiter', status: 'active' },
      { userId: recruiterA._id, companyId: suspendable._id, role: 'owner', status: 'active' },
    ]);

    const section = { type: 'aptitude', title: 'Logic', count: 5, minutes: 10 };
    const [tplAcme, tplGlobex, tplPlatform] = await AssessmentTemplate.create([
      { title: `${RUN} Acme private`, companyId: acme._id, sections: [section] },
      { title: `${RUN} Globex private`, companyId: globex._id, sections: [section] },
      { title: `${RUN} Platform`, companyId: null, sections: [section] },
    ]);

    const attempt = (templateId, score) => ({
      userId: ada._id,
      templateId,
      status: 'completed',
      integrityVerdict: 'clean',
      sectionResults: [{ sectionIndex: 0, type: 'aptitude', score, maxScore: 100 }],
      startedAt: new Date(),
      completedAt: new Date(),
    });
    await AssessmentAttempt.create([
      attempt(tplAcme._id, 91),
      attempt(tplGlobex._id, 44),
      attempt(tplPlatform._id, 70),
    ]);

    // Ada consents to Acme only. Grace consents to Acme too, for /compare.
    const [adaAcme] = await CandidateCompanyConsent.create([
      { candidateId: ada._id, companyId: acme._id, state: 'REVEALED', source: 'invite' },
      { candidateId: grace._id, companyId: acme._id, state: 'REVEALED', source: 'invite' },
    ]);

    const job = await Job.create({
      companyId: acme._id, title: `${RUN} Backend Engineer`, status: 'open', createdBy: recruiterA._id,
    });
    const application = await Application.create({
      jobId: job._id, companyId: acme._id, candidateId: ada._id,
      // Required: an application must name the consent that permits it, so a
      // row can never outlive the permission it was created under.
      consentId: adaAcme._id,
      source: 'invite', stage: 'shortlisted',
    });

    console.log('checks\n');

    // ── 5. cross-tenant isolation ──────────────────────────────────────────
    const acmeCard = await call(`/api/hire/candidates/${ada._id}`, { as: recruiterA._id, company: acme._id });
    check('5a  Acme sees Ada: identity and evidence',
      acmeCard.status === 200 && acmeCard.body.identity && acmeCard.body.identity.email === tag('ada'),
      `status ${acmeCard.status}`);

    const seenTemplates = (acmeCard.body?.assessments ?? []).map((a) => String(a.templateId));
    check('5b  Acme sees its own and the platform template',
      seenTemplates.includes(String(tplAcme._id)) && seenTemplates.includes(String(tplPlatform._id)),
      `saw ${seenTemplates.length} attempt(s)`);
    check("5c  Acme does NOT see Globex's private instrument",
      !seenTemplates.includes(String(tplGlobex._id)));

    const globexCard = await call(`/api/hire/candidates/${ada._id}`, { as: recruiterB._id, company: globex._id });
    const globexUnknown = await call(`/api/hire/candidates/${new mongoose.Types.ObjectId()}`, { as: recruiterB._id, company: globex._id });
    const globexMalformed = await call('/api/hire/candidates/not-an-id', { as: recruiterB._id, company: globex._id });
    check('5d  Globex has no consent: 404', globexCard.status === 404, `status ${globexCard.status}`);
    check('5e  refusals are byte-identical across unconsented, unknown and malformed',
      globexCard.text === globexUnknown.text && globexMalformed.text === globexUnknown.text,
      `${globexCard.text} | ${globexUnknown.text} | ${globexMalformed.text}`);

    // ── 6. the viewer role ─────────────────────────────────────────────────
    const viewerCard = await call(`/api/hire/candidates/${ada._id}`, { as: viewerA._id, company: acme._id });
    check('6a  viewer gets the scorecard with identity null',
      viewerCard.status === 200 && viewerCard.body.identity === null
        && (viewerCard.body.assessments || []).length > 0,
      `status ${viewerCard.status}`);

    await CompanyInvite.create({
      companyId: acme._id, email: tag('ada'), status: 'sent',
      tokenHash: CompanyInvite.hashToken('smoke-token-unused'),
      expiresAt: new Date(Date.now() + 864e5), invitedBy: recruiterA._id,
    });

    const viewerRoutes = ['/api/hire/jobs', '/api/hire/invites', '/api/hire/discover',
      `/api/hire/candidates/${ada._id}`];
    const leaked = [];
    for (const route of viewerRoutes) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call(route, { as: viewerA._id, company: acme._id });
      if (res.text.includes(tag('ada'))) leaked.push(route);
    }
    check('6b  no route returns an email to a viewer', leaked.length === 0, leaked.join(', '));

    const viewerInvites = await call('/api/hire/invites', { as: viewerA._id, company: acme._id });
    check('6c  the invite list is role-gated', viewerInvites.status === 404, `status ${viewerInvites.status}`);

    const recruiterInvites = await call('/api/hire/invites', { as: recruiterA._id, company: acme._id });
    check('6d  an unaccepted address is masked even for a recruiter',
      recruiterInvites.status === 200 && !recruiterInvites.text.includes(tag('ada')),
      recruiterInvites.text.slice(0, 120));

    // ── 7. discovery → interest → reveal ───────────────────────────────────
    await CandidateCompanyConsent.create({
      candidateId: grace._id, companyId: globex._id, state: 'DISCOVERABLE', source: 'discovery',
    });

    const discovered = await call('/api/hire/discover', { as: recruiterB._id, company: globex._id });
    check('7a  a DISCOVERABLE candidate appears in discovery',
      discovered.status === 200
        && (discovered.body.candidates || []).some((c) => String(c.handle) === String(grace._id)),
      `status ${discovered.status}, ${(discovered.body?.candidates || []).length} row(s)`);

    const gracePseudonymous = await call(`/api/hire/candidates/${grace._id}`, { as: recruiterB._id, company: globex._id });
    check('7b  but cannot be resolved to a person', gracePseudonymous.status === 404,
      `status ${gracePseudonymous.status}`);

    const interest = await call(`/api/hire/discover/${grace._id}/interest`, {
      as: recruiterB._id, company: globex._id, method: 'POST',
    });
    check('7c  expressing interest is accepted', interest.status === 200, `status ${interest.status}`);

    // This is the check that would have caught the strict:true silent drop: the
    // route answered {ok:true} while the field was never written, so the Reveal
    // button could never render and the whole funnel was dead.
    const graceConsents = await call('/api/consent/me', { as: grace._id });
    const globexRow = (graceConsents.body?.companies ?? [])
      .find((c) => c.company && String(c.company.id) === String(globex._id));
    check('7d  the interest reaches the candidate privacy screen',
      Boolean(globexRow && globexRow.interestAt),
      globexRow ? `interestAt=${globexRow.interestAt}` : 'no row for Globex');

    const revealed = await call(`/api/consent/${globex._id}/reveal`, { as: grace._id, method: 'POST' });
    check('7e  the candidate can reveal, and the company then resolves them',
      revealed.status === 200 && revealed.body.state === 'REVEALED');
    const graceCard = await call(`/api/hire/candidates/${grace._id}`, { as: recruiterB._id, company: globex._id });
    check('7f  Globex now sees Grace', graceCard.status === 200 && Boolean(graceCard.body.identity),
      `status ${graceCard.status}`);

    // ── 8. revocation ──────────────────────────────────────────────────────
    const revoked = await call(`/api/consent/${acme._id}`, { as: ada._id, method: 'DELETE' });
    check('8a  Ada can revoke Acme', revoked.status === 200 && revoked.body.state === 'REVOKED');

    const afterRevoke = await call(`/api/hire/candidates/${ada._id}`, { as: recruiterA._id, company: acme._id });
    check('8b  Acme is locked out on the very next request', afterRevoke.status === 404,
      `status ${afterRevoke.status}`);

    const board = await call(`/api/hire/jobs/${job._id}`, { as: recruiterA._id, company: acme._id });
    const row = (board.body?.applications ?? []).find((a) => String(a.applicationId) === String(application._id));
    check('8c  the board row reads withdrawn, not shortlisted',
      Boolean(row) && row.stage === 'withdrawn', row ? `stage=${row.stage}` : 'row missing');

    const moveWithdrawn = await call(
      `/api/hire/jobs/${job._id}/applications/${application._id}`,
      { as: recruiterA._id, company: acme._id, method: 'PATCH', body: { stage: 'hired' } }
    );
    check('8d  a withdrawn candidate cannot be moved to hired', moveWithdrawn.status === 409,
      `status ${moveWithdrawn.status}`);

    // ── 9. suspension ──────────────────────────────────────────────────────
    const beforeSuspend = await call('/api/hire/jobs', { as: recruiterA._id, company: suspendable._id });
    check('9a  Initech works while active', beforeSuspend.status === 200, `status ${beforeSuspend.status}`);

    await Company.updateOne({ _id: suspendable._id }, { $set: { status: 'suspended' } });
    const afterSuspend = await call('/api/hire/jobs', { as: recruiterA._id, company: suspendable._id });
    check('9b  suspension bites on the next request, with no re-login',
      afterSuspend.status === 404, `status ${afterSuspend.status}`);

    // ── 10. the disclosure audit ───────────────────────────────────────────
    // Written without being awaited by the routes, so give it a moment.
    await new Promise((r) => { setTimeout(r, 300); });

    const audits = await DisclosureAudit.find({
      candidateId: { $in: [ada._id, grace._id] },
    }).lean();

    const disclosures = audits.filter((a) => a.action === 'disclosed');
    check('10a the recruiter read is recorded',
      disclosures.some((a) => String(a.candidateId) === String(ada._id)
        && String(a.companyId) === String(acme._id)
        && (a.scopes || []).includes('identity')),
      `${disclosures.length} disclosure row(s)`);

    check('10b the VIEWER read is recorded too, without an identity scope',
      disclosures.some((a) => String(a.candidateId) === String(ada._id)
        && !(a.scopes || []).includes('identity')
        && (a.scopes || []).includes('assessment')));

    check('10c revocation is recorded', audits.some((a) => a.action === 'revoked'));

    check('10d revocation did not erase the disclosure trail',
      disclosures.filter((a) => String(a.candidateId) === String(ada._id)).length >= 2,
      `${disclosures.length} total`);
  } finally {
    // ── cleanup: everything this run made, and nothing else ────────────────
    const users = await User.find({ email: new RegExp(`^${RUN}-`) }).select('_id').lean();
    const userIds = users.map((u) => u._id);
    const companies = await Company.find({ name: new RegExp(`^${RUN} `) }).select('_id').lean();
    const companyIds = companies.map((c) => c._id);

    const removed = await Promise.all([
      AssessmentAttempt.deleteMany({ userId: { $in: userIds } }),
      CandidateCompanyConsent.deleteMany({ candidateId: { $in: userIds } }),
      DisclosureAudit.deleteMany({ candidateId: { $in: userIds } }),
      CompanyInvite.deleteMany({ companyId: { $in: companyIds } }),
      Application.deleteMany({ companyId: { $in: companyIds } }),
      Job.deleteMany({ companyId: { $in: companyIds } }),
      CompanyMembership.deleteMany({ userId: { $in: userIds } }),
      AssessmentTemplate.deleteMany({ title: new RegExp(`^${RUN} `) }),
      Company.deleteMany({ _id: { $in: companyIds } }),
      User.deleteMany({ _id: { $in: userIds } }),
    ]);
    console.log(`\ncleaned up ${removed.reduce((n, r) => n + r.deletedCount, 0)} seeded row(s)`);

    await new Promise((resolve) => { server.close(resolve); });
    await mongoose.disconnect();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nfailed:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nsmoke run crashed:', err);
  process.exitCode = 1;
});
