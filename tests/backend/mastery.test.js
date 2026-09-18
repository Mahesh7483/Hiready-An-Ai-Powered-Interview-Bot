process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci-at-least-32-chars-long';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hiready-test';

const fs = require('fs');
const path = require('path');
const { backend, frontend } = require('./support/paths');
const { weakestPillar, PILLAR_ORDER, WEIGHTS } = require(backend('services/readiness'));

/**
 * The Mastery dashboard's "Today's session" card decides what a student works
 * on next. That decision used to be made in the browser, from its own copy of
 * a rule the server also implements, under a comment reading "Replace with GET
 * /api/mastery/today once the backend lands".
 *
 * Two implementations of one rule is how a student is told to work on aptitude
 * while the score beside it says coding. The README makes exactly that argument
 * about readiness itself; the session card was the same mistake one step on.
 */

describe('the weakest pillar is chosen once, on the server', () => {
  const full = {
    interview: { score: 70 },
    aptitude: { score: 40 },
    coding: { score: 55 },
    resume: { score: 90 },
  };

  test('the lowest scored pillar wins', () => {
    expect(weakestPillar(full)).toBe('aptitude');
  });

  test('an UNTRIED pillar outranks a merely weak one', () => {
    // You cannot improve what you have not attempted, and a zero nobody has
    // scored is not evidence of anything.
    const untriedCoding = { ...full, coding: { score: null } };
    expect(weakestPillar(untriedCoding)).toBe('coding');
  });

  test('ties break in a stable, declared order rather than by key order', () => {
    const tied = {
      interview: { score: 50 },
      aptitude: { score: 50 },
      coding: { score: 50 },
      resume: { score: 50 },
    };
    // Same answer every time, and it is the first of PILLAR_ORDER.
    expect(weakestPillar(tied)).toBe(PILLAR_ORDER[0]);
    expect(weakestPillar(tied)).toBe(weakestPillar(tied));
  });

  test('a pillar missing from the object counts as untried, not as zero', () => {
    // Treating absent as 0 would send every new student to whichever pillar
    // happened to be missing from the response.
    const partial = { aptitude: { score: 80 }, interview: { score: 75 } };
    expect(['resume', 'coding']).toContain(weakestPillar(partial));
  });
});

describe('there is one readiness calculation, not two', () => {
  test('the route delegates rather than inlining the maths', () => {
    const route = fs.readFileSync(backend('routes/readinessRoutes.js'), 'utf8');
    expect(route).toMatch(/require\('\.\.\/services\/readiness'\)/);
    // The weights must not be restated here — that is how two copies begin.
    expect(route).not.toMatch(/weight:\s*40/);
  });

  test('mastery reads the same service the readiness route does', () => {
    const mastery = fs.readFileSync(backend('routes/masteryRoutes.js'), 'utf8');
    expect(mastery).toMatch(/require\('\.\.\/services\/readiness'\)/);
    expect(mastery).toMatch(/computeReadiness/);
    expect(mastery).toMatch(/weakestPillar/);
  });

  test('the weights still add to 100', () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  test('the client no longer derives the weakest pillar itself', () => {
    /**
     * The specific regression: Mastery.tsx reduced over the readiness pillars
     * to pick one. If that returns, the two rules can disagree again and
     * nothing would report it — both sides would be internally consistent.
     */
    const page = fs.readFileSync(frontend('src/pages/Mastery.tsx'), 'utf8');
    expect(page).toMatch(/mastery\/today/);
    expect(page).not.toMatch(/scored\.reduce\(/);
    expect(page).not.toMatch(/const weakestPillar[^=]*=\s*\(\(\)/);
  });
});

describe('the endpoint is mounted and guarded', () => {
  const server = fs.readFileSync(backend('server.js'), 'utf8');

  test('mounted at /api/mastery', () => {
    expect(server).toMatch(/app\.use\('\/api\/mastery'/);
  });

  test('it requires authentication', () => {
    // It reports one student's weaknesses; it must never answer anonymously.
    const src = fs.readFileSync(backend('routes/masteryRoutes.js'), 'utf8');
    expect(src).toMatch(/router\.get\('\/today',\s*requireAuth/);
  });

  test('it returns a decision, not rendered copy', () => {
    // The server picks WHAT to practise; the client owns the wording. A label
    // leaking into the response means the two can disagree about the words.
    const src = fs.readFileSync(backend('routes/masteryRoutes.js'), 'utf8');
    expect(src).toMatch(/weakestPillar/);
    expect(src).toMatch(/kind: 'recall'/);
    expect(src).not.toMatch(/detail:\s*`One /);
  });
});

describe('a claim in a schema comment matches the code', () => {
  test('Company.seats does not claim an enforcement that does not exist', () => {
    /**
     * It read "Enforced when inviting". Nothing enforces it, and nothing can:
     * no route creates a CompanyMembership, so there is no team-invitation
     * flow for a seat ceiling to gate. POST /api/hire/invites invites
     * CANDIDATES, which consume no seat.
     */
    const model = fs.readFileSync(backend('models/Company.js'), 'utf8');
    expect(model).not.toMatch(/Enforced when inviting/);
    expect(model).toMatch(/NOT ENFORCED/);
  });

  /**
   * Walk once, so the scan's REACH can be asserted separately from its result.
   *
   * The first version of this only checked that the offender list was empty —
   * which is exactly how a broken walker passes. A wrong root, a typo'd
   * extension filter or a regex that never matches all produce an empty list
   * and a green test, and the conclusion drawn from it ("nothing creates a
   * membership") would be an artefact of the scan rather than a fact about
   * the code.
   */
  const scanForMembershipCreators = () => {
    const creators = [];
    let filesScanned = 0;
    const walk = (dir) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        if (e.name === 'node_modules') return;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        if (!e.name.endsWith('.js')) return;
        filesScanned += 1;
        const src = fs.readFileSync(full, 'utf8');
        if (/CompanyMembership\s*\.\s*(create|insertMany|findOneAndUpdate)/.test(src)) {
          creators.push(path.relative(backend(), full).split(path.sep).join('/'));
        }
      });
    };
    walk(backend('routes'));
    walk(backend('services'));
    return { creators, filesScanned };
  };

  test('the scan actually reached the route and service trees', () => {
    const { filesScanned } = scanForMembershipCreators();
    expect(filesScanned).toBeGreaterThan(15);
  });

  test('its regex matches a real creation call when one is present', () => {
    // Proves the pattern, not just the absence. scripts/smokeHireFlow.js is
    // the one place that creates a membership, and it is outside the scanned
    // trees on purpose — so it doubles as a positive control.
    const smoke = fs.readFileSync(backend('scripts/smokeHireFlow.js'), 'utf8');
    expect(/CompanyMembership\s*\.\s*(create|insertMany|findOneAndUpdate)/.test(smoke)).toBe(true);
  });

  test('and no route has quietly started creating memberships since', () => {
    // If one ever does, this fails and the seats comment must be revisited.
    const { creators } = scanForMembershipCreators();
    expect(creators).toEqual([]);
  });
});
