/**
 * Live end-to-end check of the STUDENT assessment pipeline.
 *
 * WHY
 *
 * models/AssessmentAttempt.js declared `sectionResults` with a bare
 * `type: String` inside the subdocument. Mongoose's typeKey is 'type', so it
 * read the whole object as a type declaration and compiled the path to
 * [String]. Pushing a section result then threw a CastError at the push, which
 * the submit route caught and reported as 500 'Failed to submit section' — so
 * no assessment could ever be completed, and the collection held zero scored
 * attempts.
 *
 * A unit test can assert the compiled schema shape. Only this can assert that
 * a student can actually start a test, answer it, and get a score back.
 *
 *   node scripts/smokeAssessment.js
 *
 * Seeds under a unique run tag and deletes everything afterwards, including on
 * failure. Exits non-zero if any check fails.
 */
require('dotenv').config({ quiet: true });

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../server');
const User = require('../models/User');
const Question = require('../models/Question');
const AssessmentTemplate = require('../models/AssessmentTemplate');
const AssessmentAttempt = require('../models/AssessmentAttempt');

const RUN = `smoke-asmt-${Date.now()}`;

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

  let student = null;
  let template = null;

  async function call(path, { as, method = 'GET', body } = {}) {
    const headers = {};
    if (as) headers.Authorization = `Bearer ${jwt.sign({ id: String(as) }, process.env.JWT_SECRET, { expiresIn: '10m' })}`;
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
    console.log(`\nseeding (${RUN})\n`);

    const pool = await Question.find({}).select('_id Answer').limit(5).lean();
    if (pool.length < 5) throw new Error(`need at least 5 questions in the bank, found ${pool.length}`);

    student = await User.create({ name: 'Smoke Student', email: `${RUN}@smoke.invalid` });
    template = await AssessmentTemplate.create({
      title: `${RUN} single section`,
      companyId: null,
      isPublished: true,
      sections: [{ type: 'aptitude', title: 'Logic', count: 5, negativeMarking: false, minutes: 30 }],
    });

    console.log('checks\n');

    // ── start ──────────────────────────────────────────────────────────────
    const started = await call(`/api/assessment/start/${template._id}`, { as: student._id, method: 'POST' });
    // 201 on a fresh attempt, 200 when resuming an in-flight one.
    check('1  a student can start an attempt',
      [200, 201].includes(started.status) && Boolean(started.body.attempt),
      `status ${started.status} ${started.text.slice(0, 140)}`);
    if (!started.body || !started.body.attempt) throw new Error('cannot continue without an attempt');

    const attemptId = started.body.attempt.id || started.body.attempt._id;
    check('2  the attempt is in progress on section 0',
      started.body.attempt.status === 'in_progress' && started.body.attempt.currentSectionIndex === 0,
      `status=${started.body.attempt.status} idx=${started.body.attempt.currentSectionIndex}`);

    // ── the locked question set ────────────────────────────────────────────
    const questions = await call(`/api/assessment/attempt/${attemptId}/section/0/questions`, { as: student._id });
    check('3  the section serves its locked questions',
      questions.status === 200 && Array.isArray(questions.body) && questions.body.length === 5,
      `got ${Array.isArray(questions.body) ? questions.body.length : questions.text.slice(0, 80)}`);

    /**
     * A question with no options is not answerable, and counting questions
     * does not notice. The route projected its option paths with the string
     * form of .select(), which splits on whitespace — so 'Option A'..'Option D'
     * were never requested and every candidate got a bare question stem with
     * nothing to choose from. Check 3 passed throughout: there were still
     * five of them.
     */
    const missingOptions = (questions.body || []).filter(
      (q) => !['Option A', 'Option B', 'Option C', 'Option D'].every(
        (k) => q[k] !== undefined && q[k] !== null && String(q[k]).length > 0
      )
    );
    check('4  every served question carries all four options',
      questions.body && questions.body.length > 0 && missingOptions.length === 0,
      missingOptions.length
        ? `${missingOptions.length} unanswerable; first has keys [${Object.keys(missingOptions[0]).join(', ')}]`
        : '');

    check('5  the answer key never reaches the client',
      !/"Answer"/.test(questions.text) && !/answerKey/.test(questions.text));

    // ── submit, answering everything correctly ─────────────────────────────
    const stored = await AssessmentAttempt.findById(attemptId).lean();
    const key = (stored.sectionState && stored.sectionState['0'] && stored.sectionState['0'].answerKey) || {};
    const answers = questions.body.map((q) => ({ questionId: String(q._id), selected: key[String(q._id)] }));

    const submitted = await call(`/api/assessment/attempt/${attemptId}/section/0/submit`, {
      as: student._id, method: 'POST', body: { answers },
    });
    // THE regression. This returned 500 'Failed to submit section' for every
    // assessment ever attempted, because pushing the result threw at the push.
    check('6  submitting a section succeeds', submitted.status === 200,
      `status ${submitted.status} ${submitted.text.slice(0, 160)}`);

    check('7  the attempt is now complete',
      submitted.body?.attempt?.status === 'completed',
      `status=${submitted.body?.attempt?.status}`);

    // ── what actually persisted ────────────────────────────────────────────
    const finished = await AssessmentAttempt.findById(attemptId).lean();
    const [section] = finished.sectionResults || [];

    check('8  a section result was persisted as an object, not a string',
      Boolean(section) && typeof section === 'object' && !Array.isArray(section),
      `sectionResults=${JSON.stringify(finished.sectionResults).slice(0, 120)}`);

    check('9  it carries the score, the maximum and the type',
      Boolean(section) && section.type === 'aptitude' && section.maxScore === 5 && section.score === 5,
      section ? `type=${section.type} score=${section.score}/${section.maxScore}` : 'no section');

    check('10 meta retained the question ids the no-repeat logic needs',
      Boolean(section?.meta?.questionIds?.length === 5),
      `meta=${JSON.stringify(section?.meta || {}).slice(0, 120)}`);

    check('11 an integrity verdict was stamped',
      ['clean', 'flagged', 'invalidated'].includes(finished.integrityVerdict),
      `verdict=${finished.integrityVerdict}`);

    // ── the report the student sees ────────────────────────────────────────
    const report = await call(`/api/assessment/attempt/${attemptId}/report`, { as: student._id });
    check('12 the report renders a real score', report.status === 200 && report.text.includes('5'),
      `status ${report.status} ${report.text.slice(0, 160)}`);

    // ── and what a recruiter would read off it ─────────────────────────────
    // services/hire/readers.js computes percent = score / maxScore. On the
    // collapsed schema both were undefined and every section rendered null.
    const percent = section && section.maxScore > 0
      ? Math.round((section.score / section.maxScore) * 100)
      : null;
    check('13 a recruiter scorecard can compute a percent from it', percent === 100,
      `percent=${percent}`);
  } finally {
    const attempts = student ? await AssessmentAttempt.deleteMany({ userId: student._id }) : { deletedCount: 0 };
    const templates = await AssessmentTemplate.deleteMany({ title: new RegExp(`^${RUN} `) });
    const users = await User.deleteMany({ email: new RegExp(`^${RUN}@`) });
    console.log(`\ncleaned up ${attempts.deletedCount + templates.deletedCount + users.deletedCount} seeded row(s)`);

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
  console.error('\nsmoke run crashed:', err.message);
  process.exitCode = 1;
});
