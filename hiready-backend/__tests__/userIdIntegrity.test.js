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

/**
 * Fields that mean "this row belongs to that person". Everything else that
 * points at a User — createdBy, actorId, adminId, grantedBy, invitedBy,
 * acceptedBy, interestBy — records who ACTED, not who is described. Cascading
 * on those would delete a company's invite because an admin was removed.
 */
const OWNERSHIP_FIELDS = ['userId', 'user', 'candidateId'];

/**
 * Ownership references deliberately left out of the delete cascade, each with
 * the reason. Anything not listed here must be cascaded.
 */
const NOT_CASCADED = {
  'DisclosureAudit.candidateId':
    'records who saw this candidate and under what consent; must outlive both',
};

/**
 * Derived from the schemas, never hand-maintained.
 *
 * The previous version of this file listed the models by hand, which is
 * precisely how models/AptitudeAttempt.js arrived with the Practice/Mastery
 * merge holding a userId that nothing deleted. A list someone has to remember
 * to update is not a guard.
 */
function userReferences() {
  const dir = path.join(BACKEND, 'models');
  const out = [];
  fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((file) => {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const re = /(\w+)\s*:\s*\{[^{}]*ref:\s*'User'[^{}]*\}/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      out.push({ model: file.replace(/\.js$/, ''), field: m[1], file: `models/${file}`, decl: m[0] });
    }
  });
  return out;
}

const REFERENCES = userReferences();
const OWNED = REFERENCES.filter((r) => OWNERSHIP_FIELDS.includes(r.field));

describe('user references are uniformly ObjectId', () => {
  test('the scan actually found the models', () => {
    // A regex that silently matches nothing would make every test below vacuous.
    expect(OWNED.length).toBeGreaterThanOrEqual(12);
  });

  test.each(OWNED.map((r) => [r.file, r.field, r]))('%s declares %s as ObjectId', (file, field, ref) => {
    expect(ref.decl).toMatch(/type:\s*mongoose\.Schema\.Types\.ObjectId/);
    // A String-typed user reference is what caused the drift in the first place.
    expect(ref.decl).not.toMatch(/type:\s*String/);
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
  const cascade = src.slice(src.indexOf("router.delete('/users/:id'"), src.indexOf("router.delete('/users/:id'") + 4000);

  test.each(
    OWNED
      .filter((r) => !NOT_CASCADED[`${r.model}.${r.field}`])
      .map((r) => [r.model, r.field])
  )('the cascade covers %s.%s', (model, field) => {
    // Derived from the schemas, so a collection added later cannot quietly
    // escape deletion the way ProctorSnapshot (biometric webcam frames) and
    // then AptitudeAttempt both did.
    expect(cascade).toMatch(new RegExp(`${model}\\.deleteMany\\(\\{\\s*${field}:`));
  });

  test.each(Object.entries(NOT_CASCADED))('%s stays out of the cascade — %s', (ref) => {
    // Exclusions must be deliberate and reasoned, not accidental.
    const [model] = ref.split('.');
    expect(cascade).not.toMatch(new RegExp(`${model}\\.deleteMany`));
  });

  test('the orphan sweep covers the same collections as the cascade', () => {
    // Two hand-written lists that must agree is one list too many: the cascade
    // stops orphans being created, the sweep removes the ones already there.
    // AptitudeAttempt was missing from BOTH.
    const sweep = read('scripts/cleanupOrphanedUserData.js');
    const missing = OWNED
      .filter((r) => !NOT_CASCADED[`${r.model}.${r.field}`])
      .filter((r) => {
        // Ask mongoose for the collection name rather than guessing it.
        // Its pluralizer is not `toLowerCase() + 's'`: ResumeAnalysis becomes
        // `resumeanalyses`, and a guess that got that wrong would report a
        // false miss here — or, worse, a false pass somewhere else.
        const collection = require(path.join(BACKEND, 'models', `${r.model}.js`)).collection.name;
        return !new RegExp(
          `collection:\\s*'${collection}',\\s*field:\\s*'${r.field}'`
        ).test(sweep);
      })
      .map((r) => `${r.model}.${r.field}`);
    expect(missing).toEqual([]);
  });

  test('the response carries per-collection deletedCount', () => {
    // The route previously returned success unconditionally, which is exactly
    // how a cascade matching zero rows looked like it had worked.
    expect(cascade).toMatch(/deletedCount/);
    expect(cascade).toMatch(/deleted\b/);
  });
});

describe('deleting an interview session purges its proctoring', () => {
  const src = read('routes/interviewSessionRoutes.js');

  test('both branches of the cascade delete ProctorSnapshot', () => {
    // Phase A split biometric webcam frames out of ProctorLog into their own
    // collection, and this path was not updated — so a student deleting their
    // session kept their images for the rest of a 90-day TTL while the
    // response said 'Deleted'. There are TWO branches (replica-set transaction
    // and standalone parallel) and they must stay in step.
    const deletes = src.match(/ProctorSnapshot\.deleteMany/g) || [];
    const logDeletes = src.match(/ProctorLog\.deleteMany/g) || [];
    expect(deletes.length).toBe(logDeletes.length);
    expect(deletes.length).toBeGreaterThanOrEqual(2);
  });

  test('the response reports what was purged', () => {
    // Silence is how the previous gap survived: nothing in the response
    // distinguished "purged nothing" from "purged everything".
    expect(src).toMatch(/purgedSnapshotsCount/);
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
