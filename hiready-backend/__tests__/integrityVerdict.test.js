const { deriveVerdict } = require('../services/integrity');

/**
 * The verdict is the ONLY integrity signal that crosses into hiring, so its
 * edges matter more than most derived fields: a false `clean` means a company
 * hires on a score the system knew was cheated.
 */
describe('integrityVerdict', () => {
  test('a clean run with no violations', () => {
    expect(deriveVerdict({ status: 'completed', violationScore: 0, violations: [] })).toBe('clean');
  });

  test('any recorded violation weight flags the attempt', () => {
    expect(deriveVerdict({ status: 'completed', violationScore: 2, violations: [{}] }, 100))
      .toBe('flagged');
  });

  test('violations present but zero-weighted still flag', () => {
    // A weightless event is still an event the recruiter should weigh.
    expect(deriveVerdict({ status: 'completed', violationScore: 0, violations: [{ type: 'x' }] }))
      .toBe('flagged');
  });

  test('auto-submission invalidates regardless of score', () => {
    // The anti-cheat cut the run short, so the score does not represent work
    // the candidate actually finished.
    expect(deriveVerdict({ status: 'auto_submitted', violationScore: 0, violations: [] }))
      .toBe('invalidated');
  });

  test('crossing the template threshold invalidates', () => {
    expect(deriveVerdict({ status: 'completed', violationScore: 100 }, 100)).toBe('invalidated');
    expect(deriveVerdict({ status: 'completed', violationScore: 99 }, 100)).toBe('flagged');
  });

  test('respects a custom threshold from the template', () => {
    expect(deriveVerdict({ status: 'completed', violationScore: 12 }, 10)).toBe('invalidated');
    expect(deriveVerdict({ status: 'completed', violationScore: 12 }, 50)).toBe('flagged');
  });

  test('a missing threshold falls back to 100 rather than to zero', () => {
    // Defaulting to 0 would invalidate every attempt; defaulting to undefined
    // would compare against NaN and silently return flagged forever.
    expect(deriveVerdict({ status: 'completed', violationScore: 50 }, undefined)).toBe('flagged');
    expect(deriveVerdict({ status: 'completed', violationScore: 150 }, undefined)).toBe('invalidated');
  });

  test('a null attempt is clean rather than throwing', () => {
    expect(deriveVerdict(null)).toBe('clean');
  });
});

describe('every exit from an attempt stamps a verdict', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'assessmentRoutes.js'), 'utf8'
  );

  test('the normal completion path stamps one', () => {
    // It used to stamp only on the ABNORMAL exits — expiry, auto submission,
    // violation — so an attempt finished honestly ended with integrityVerdict
    // null, which readers.js maps to 'unknown' and the scorecard renders as
    // "Not evaluated". The one integrity signal a recruiter gets was therefore
    // absent on exactly the attempts that had earned a clean verdict.
    // findBreakAfter is declared ABOVE advanceOrFinish, so slice forward to
    // the next route instead — a reversed slice silently yields '', which
    // would make toContain fail for the wrong reason or pass vacuously.
    const start = src.indexOf('async function advanceOrFinish');
    const fn = src.slice(start, src.indexOf('router.post(', start));
    expect(start).toBeGreaterThan(-1);
    expect(fn).toContain("attempt.status = 'completed'");
    expect(fn).toMatch(/stampVerdict\(/);
  });

  test('no assignment to completed or auto_submitted lacks a nearby stamp', () => {
    const unstamped = [];
    const re = /attempt\.status = '(completed|auto_submitted)'/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      // The stamp belongs with the transition, so look in the lines around it
      // rather than anywhere in the file.
      // Generous, because the stamp sits under an explanatory comment.
      const window = src.slice(m.index, m.index + 1200);
      if (!/stampVerdict\(/.test(window)) {
        unstamped.push(`${m[1]} at offset ${m.index}`);
      }
    }
    expect(unstamped).toEqual([]);
  });
});

describe('the verdict is the only integrity signal in the hiring domain', () => {
  test('services/integrity.js lives outside services/hire', () => {
    // Evidence production may know about violations; hiring consumption may
    // not. Moving this file under services/hire would put ProctorLog knowledge
    // one import away from the recruiter tree.
    const fs = require('fs');
    const path = require('path');
    expect(fs.existsSync(path.join(__dirname, '..', 'services', 'integrity.js'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '..', 'services', 'hire', 'integrity.js'))).toBe(false);
  });

  test('the hire readers expose integrity but never violations', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'services', 'hire', 'readers.js'),
      'utf8'
    );
    expect(src).toMatch(/integrityVerdict/);
    // .select() must not pull the event list into the recruiter's response
    expect(src).not.toMatch(/select\([^)]*violations/);

    // Match actual requires, not prose. The file names the forbidden models in
    // its header comment on purpose — documenting the boundary is not crossing
    // it, and the transitive check in hireBoundary.test.js is what enforces
    // the real rule.
    const requires = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(requires.filter((r) => /Proctor(Log|Snapshot)/.test(r))).toEqual([]);
  });
});
