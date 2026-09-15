const fs = require('fs');
const path = require('path');
const { forbiddenForRecruiters, POLICY, NEVER } = require('../policy/dataAccess');

/**
 * Build-time enforcement of the recruiter data boundary.
 *
 * A DIRECT-import check is not sufficient for a security boundary. This passes
 * a naive check while the boundary is already broken:
 *
 *   routes/hire/scorecard.js
 *      └─ services/integrity.js      <- looks innocent
 *           └─ models/ProctorLog.js  <- boundary already crossed
 *
 * So this walks the TRANSITIVE local require graph from every entry point
 * under the recruiter trees and fails on any reachable forbidden model,
 * reporting the full path that reaches it.
 */

const BACKEND = path.resolve(__dirname, '..');
const RECRUITER_TREES = ['routes/hire', 'services/hire'];
const FORBIDDEN = forbiddenForRecruiters();

/** Every .js file under a directory, recursively. */
function walkDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkDir(full);
    return entry.isFile() && full.endsWith('.js') ? [full] : [];
  });
}

/** Local (relative) require targets in a file, resolved to absolute paths. */
function localRequires(file) {
  const src = fs.readFileSync(file, 'utf8');
  const targets = [];
  const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const base = path.resolve(path.dirname(file), m[1]);
    const candidate = [base, `${base}.js`, path.join(base, 'index.js')].find(
      (p) => fs.existsSync(p) && fs.statSync(p).isFile()
    );
    if (candidate) targets.push(candidate);
  }
  return targets;
}

/**
 * Depth-first walk of the local require closure.
 * Returns the first path that reaches a forbidden model, or null.
 */
function findForbiddenPath(entry) {
  const seen = new Set();
  const stack = [[entry, [entry]]];

  while (stack.length) {
    const [file, trail] = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    const stem = path.basename(file, '.js');
    if (FORBIDDEN.includes(stem) && path.basename(path.dirname(file)) === 'models') {
      return trail;
    }
    for (const dep of localRequires(file)) {
      stack.push([dep, [...trail, dep]]);
    }
  }
  return null;
}

const rel = (p) => path.relative(BACKEND, p).replace(/\\/g, '/');

describe('recruiter data boundary', () => {
  test('the forbidden list is derived from the policy table, not hand-written', () => {
    const expected = [
      ...new Set(POLICY.filter((p) => p.recruiter === NEVER).flatMap((p) => p.models)),
    ];
    expect(FORBIDDEN.sort()).toEqual(expected.sort());
    // Guards against someone emptying the policy and silently disabling this
    // whole suite.
    expect(FORBIDDEN).toEqual(expect.arrayContaining(['ProctorSnapshot', 'ProctorLog']));
  });

  test('no recruiter file reaches a forbidden model, directly or transitively', () => {
    const entries = RECRUITER_TREES.flatMap((t) => walkDir(path.join(BACKEND, t)));

    const violations = entries
      .map((entry) => ({ entry, trail: findForbiddenPath(entry) }))
      .filter((v) => v.trail)
      .map((v) => `${rel(v.entry)}\n      ${v.trail.map(rel).join('\n   -> ')}`);

    expect(violations).toEqual([]);
  });

  describe('the walker itself', () => {
    // Without these, the suite above passes trivially while the recruiter
    // trees are still empty — and would keep passing even if the walker were
    // broken. These prove the detection works, and specifically that it sees
    // through one level of indirection, which is the whole point of walking
    // the graph rather than checking direct imports.
    const FIXTURES = path.join(__dirname, '__fixtures__', 'boundary');

    beforeAll(() => {
      fs.mkdirSync(FIXTURES, { recursive: true });
      // entry -> mid -> models/ProctorLog  (entry never names the model)
      fs.writeFileSync(path.join(FIXTURES, 'entry.js'), "require('./mid');\n");
      fs.writeFileSync(path.join(FIXTURES, 'mid.js'), "require('../../../models/ProctorLog');\n");
      fs.writeFileSync(path.join(FIXTURES, 'clean.js'), "require('../../../policy/dataAccess');\n");
    });

    afterAll(() => {
      fs.rmSync(path.join(__dirname, '__fixtures__'), { recursive: true, force: true });
    });

    test('detects a forbidden model reached through an intermediate file', () => {
      const trail = findForbiddenPath(path.join(FIXTURES, 'entry.js'));
      expect(trail).not.toBeNull();
      expect(trail.map((p) => path.basename(p))).toEqual([
        'entry.js', 'mid.js', 'ProctorLog.js',
      ]);
    });

    test('does not flag a file whose closure is clean', () => {
      expect(findForbiddenPath(path.join(FIXTURES, 'clean.js'))).toBeNull();
    });
  });

  describe('the policy table describes models that actually exist', () => {
    /**
     * The forbidden list is matched by MODEL FILE NAME while walking the
     * require graph, so a name with no file behind it can never match and the
     * check silently under-enforces.
     *
     * This was not hypothetical: policy/dataAccess.js named AptitudeAttempt in
     * the practiceHistory row while models/AptitudeAttempt.js lived only on an
     * unmerged branch. For as long as that lasted the boundary test reported
     * clean whether or not anything under /hire could reach aptitude history.
     */
    test('every model named anywhere in the table has a file', () => {
      const missing = [...new Set(POLICY.flatMap((row) => row.models))]
        .filter((name) => !fs.existsSync(path.join(__dirname, '..', 'models', `${name}.js`)));
      expect(missing).toEqual([]);
    });

    test('the forbidden list is non-empty and all of it resolves', () => {
      // A list that silently emptied itself would make the whole walk vacuous.
      const forbidden = forbiddenForRecruiters();
      expect(forbidden.length).toBeGreaterThan(0);
      forbidden.forEach((name) => {
        expect(fs.existsSync(path.join(__dirname, '..', 'models', `${name}.js`))).toBe(true);
      });
    });
  });
});
