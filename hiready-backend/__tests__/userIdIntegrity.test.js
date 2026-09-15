const fs = require('fs');
const path = require('path');

/**
 * Guards against the failure that produced the userId migration.
 *
 * Commit a94c3f0 retyped three schemas from String to ObjectId and shipped no
 * migration. The damage was invisible for months because Mongoose casts query
 * FILTERS on typed paths: the stale rows stopped matching any read, and
 * deleteMany silently matched nothing while the route reported success.
 *
 * These are structural checks. The runtime check — that no string-typed rows
 * exist — belongs to scripts/migrateUserIdTypes.js, which verifies it and exits
 * non-zero otherwise.
 */
const BACKEND = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(BACKEND, rel), 'utf8');

/** Every model file and the user-reference fields it declares. */
const USER_REF_MODELS = [
  ['models/TestResult.js', 'userId'],
  ['models/SavedQuestion.js', 'userId'],
  ['models/ProctorLog.js', 'userId'],
  ['models/ProctorSnapshot.js', 'userId'],
  ['models/CodingSubmission.js', 'userId'],
  ['models/AssessmentAttempt.js', 'userId'],
  ['models/InterviewSession.js', 'user'],
  ['models/ResumeAnalysis.js', 'user'],
  ['models/CandidateCompanyConsent.js', 'candidateId'],
  ['models/Application.js', 'candidateId'],
  ['models/CompanyMembership.js', 'userId'],
];

describe('user references are uniformly ObjectId', () => {
  test.each(USER_REF_MODELS)('%s declares %s as ObjectId', (file, field) => {
    const src = read(file);
    const decl = new RegExp(`${field}:\\s*\\{[^}]*type:\\s*mongoose\\.Schema\\.Types\\.ObjectId`, 's');
    expect(src).toMatch(decl);
    // A String-typed user reference is what caused the drift in the first place.
    const asString = new RegExp(`${field}:\\s*\\{[^}]*type:\\s*String`, 's');
    expect(src).not.toMatch(asString);
  });
});

describe('the migration exists and is honest about its limits', () => {
  const src = read('scripts/migrateUserIdTypes.js');

  test('it uses the raw driver', () => {
    // A Mongoose query cannot find these rows — it casts the filter before the
    // driver ever sees it, so the broken rows are invisible to the very tool
    // meant to repair them.
    expect(src).toMatch(/mongoose\.connection\.db/);
    expect(src).toMatch(/\$type:\s*'string'/);
  });

  test('it dedupes savedquestions before converting', () => {
    // The unique {userId, questionId} index never saw the string rows as
    // duplicates, so converting blind would violate it.
    expect(src).toMatch(/dedupeSavedQuestions/);
    expect(src.indexOf('dedupeSavedQuestions(db)')).toBeLessThan(src.indexOf('await convert(db'));
  });

  test('it supports a dry run and verifies afterwards', () => {
    expect(src).toMatch(/--dry/);
    expect(src).toMatch(/string rows remaining/);
    expect(src).toMatch(/process\.exitCode = remaining === 0 \? 0 : 1/);
  });
});

describe('deleting a user is complete and reports what it did', () => {
  const src = read('routes/adminRoutes.js');
  const cascade = src.slice(src.indexOf("router.delete('/users/:id'"), src.indexOf("router.delete('/users/:id'") + 3000);

  test.each([
    'ProctorSnapshot',          // biometric frames — the worst omission
    'CandidateCompanyConsent',
    'Application',
    'CompanyMembership',
  ])('the cascade covers %s', (model) => {
    expect(cascade).toMatch(new RegExp(`${model}\\.deleteMany`));
  });

  test('DisclosureAudit is deliberately NOT cascaded', () => {
    // It records who saw this candidate's data and under what consent, and must
    // outlive both the consent and the account.
    expect(cascade).not.toMatch(/DisclosureAudit\.deleteMany/);
  });

  test('the response carries per-collection deletedCount', () => {
    // The route previously returned success unconditionally, which is exactly
    // how a cascade matching zero rows looked like it had worked.
    expect(cascade).toMatch(/deletedCount/);
    expect(cascade).toMatch(/deleted\b/);
  });
});

describe('unguarded ObjectId casts', () => {
  test('no route constructs an ObjectId from a request value without a guard', () => {
    const routes = [];
    const walk = (dir) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.js')) routes.push(full);
      });
    };
    walk(path.join(BACKEND, 'routes'));

    const offenders = [];
    routes.forEach((file) => {
      const src = fs.readFileSync(file, 'utf8');
      // `new ObjectId(req.…)` on the same line, with no isValid anywhere near it
      const re = /new mongoose\.Types\.ObjectId\(\s*req\.[^)]*\)/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        const window = src.slice(Math.max(0, m.index - 400), m.index);
        if (!/isValid/.test(window)) {
          offenders.push(`${path.relative(BACKEND, file)}: ${m[0]}`);
        }
      }
    });
    expect(offenders).toEqual([]);
  });
});
