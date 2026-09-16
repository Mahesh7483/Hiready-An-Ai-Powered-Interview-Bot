const fs = require('fs');
const path = require('path');

/**
 * Guards for the findings from the security audit.
 *
 * Structural, because each one is about a code path EXISTING or NOT existing.
 * A runtime test can show a route behaving today; only this can show the
 * dangerous path is gone.
 */

const BACKEND = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(BACKEND, rel), 'utf8');

const sandbox = read('services/sandbox.js');
const server = read('server.js');
const auth = read('middleware/auth.js');
const questionRoutes = read('routes/questionRoutes.js');

describe('H-1 · the sandbox never downgrades its own isolation', () => {
  test('there is no automatic fallback to direct execution from the jail', () => {
    // The old condition — exitCode 255, empty stdout, "nsjail" in stderr — is
    // three values the submitted program controls. Any solution could satisfy
    // all three and get itself re-run outside the jail.
    const fn = sandbox.slice(
      sandbox.indexOf('async function executeWithNsjail'),
      sandbox.indexOf('function scrubPaths')
    );
    expect(fn).not.toMatch(/executeDirect\(/);
    expect(fn).not.toMatch(/direct-fallback/);
  });

  test('a reported jail failure returns an error, not a result', () => {
    const fn = sandbox.slice(
      sandbox.indexOf('async function executeWithNsjail'),
      sandbox.indexOf('function scrubPaths')
    );
    expect(fn).toMatch(/sandbox: 'unavailable'/);
  });

  test('production still refuses unsandboxed execution without an explicit opt-in', () => {
    expect(sandbox).toMatch(/NODE_ENV === 'production' && process\.env\.ALLOW_UNSAFE_SANDBOX !== '1'/);
  });

  test('child processes never get a shell', () => {
    // shell:false is what stops argument construction becoming command injection.
    expect(sandbox).toMatch(/shell: false/);
  });
});

describe('H-2 · the signing key cannot be absent or weak', () => {
  test('the server refuses to boot without a strong JWT_SECRET', () => {
    expect(server).toMatch(/JWT_SECRET \|\| process\.env\.JWT_SECRET\.length < 32/);
  });

  test('no module falls back to a literal secret', () => {
    // `process.env.JWT_SECRET || 'secret'` verified tokens against the string
    // "secret" whenever the variable was unset — forgeable by anyone.
    for (const src of [auth, questionRoutes]) {
      expect(src).not.toMatch(/JWT_SECRET\s*\|\|\s*['"]/);
    }
  });
});

describe('L-1 · every token verification pins the algorithm', () => {
  /**
   * Derived, not listed. The first version of this guard named two files by
   * hand and passed while services/collab.js — a third jwt.verify against our
   * own secret — stayed unpinned. A list someone must remember to extend is
   * not a guard.
   */
  function verifySites() {
    const out = [];
    const walk = (dir) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        if (e.name === 'node_modules' || e.name === '__tests__') return;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        if (!e.name.endsWith('.js')) return;
        const src = fs.readFileSync(full, 'utf8');
        const re = /jwt\.verify\([\s\S]{0,200}?\)/g;
        let m;
        while ((m = re.exec(src)) !== null) {
          // Only our own HMAC tokens; the Firebase path verifies RS256 against
          // Google's certs and pins its algorithms separately.
          if (m[0].includes('JWT_SECRET')) {
            out.push({ file: path.relative(BACKEND, full).split(path.sep).join('/'), call: m[0] });
          }
        }
      });
    };
    for (const d of ['routes', 'services', 'middleware']) walk(path.join(BACKEND, d));
    return out;
  }

  const SITES = verifySites();

  test('the scan found every verification site', () => {
    // Non-vacuity: a regex matching nothing would make the rest pass for free.
    expect(SITES.length).toBeGreaterThanOrEqual(3);
  });

  test.each(SITES.map((s) => [s.file, s]))('%s pins HS256', (_file, site) => {
    expect(site.call).toMatch(/algorithms:\s*\[\s*['"]HS256['"]\s*\]/);
  });
});

describe('M-1 · a deleted account loses access without waiting for expiry', () => {
  test('requireAuth confirms the account still exists', () => {
    expect(auth).toMatch(/User\.exists\(/);
  });

  test('the check is cached rather than run on every request', () => {
    // A lookup per request makes authentication depend on database latency
    // and availability; the cache bounds revocation instead.
    expect(auth).toMatch(/EXISTENCE_TTL_MS/);
  });

  test('a database outage does not log everyone out', () => {
    // Refusing valid, correctly signed tokens because storage hiccuped turns
    // a degraded dependency into a total outage. The gap is logged, not silent.
    const fn = auth.slice(auth.indexOf('async function accountStillExists'), auth.indexOf('async function requireAuth'));
    expect(fn).toMatch(/catch \(err\)/);
    expect(fn).toMatch(/console\.warn/);
    expect(fn).toMatch(/return true;/);
  });
});

describe('I-1 · the localhost CORS escape hatch is development-only', () => {
  test('it is gated on NODE_ENV', () => {
    const origin = server.slice(server.indexOf('origin(origin, callback)'), server.indexOf('methods:'));
    expect(origin).toMatch(/NODE_ENV !== 'production'/);
  });
});

describe('baseline protections stay in place', () => {
  test.each([
    ['helmet', /app\.use\(helmet\(\)\)/],
    ['a global rate limit', /rateLimit\(\{/],
    ['a JSON body cap', /express\.json\(\{ limit:/],
  ])('%s', (_label, re) => {
    expect(server).toMatch(re);
  });

  test('uploaded filenames are allowlisted, not merely sanitised', () => {
    // Blocks path traversal into the execution directory.
    const exec = read('routes/coding/execution.js');
    expect(exec).toMatch(/\^\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\*\$/);
  });
});

describe('A-1 · an unverified email cannot confer a role', () => {
  const src = read('routes/authRoutes.js');

  test('promotion is gated on a verified identity', () => {
    expect(src).toMatch(/maybePromoteAdmin\(userDoc, \{ emailVerified = false \} = \{\}\)/);
    const fn = src.slice(src.indexOf('async function maybePromoteAdmin'), src.indexOf('function signToken'));
    expect(fn).toMatch(/if \(!emailVerified\) return;/);
  });

  test('signup never promotes', () => {
    // It creates an account from an address nobody has proven ownership of.
    const signup = src.slice(src.indexOf('router.post("/signup"'), src.indexOf('router.post("/login"'));
    expect(signup).not.toMatch(/maybePromoteAdmin\(/);
  });

  test('the Google path promotes only after email_verified was enforced', () => {
    const google = src.slice(src.indexOf('router.post("/google"'), src.indexOf('router.post("/signup"'));
    expect(google).toMatch(/payload\.email_verified/);
    expect(google).toMatch(/maybePromoteAdmin\(user, \{ emailVerified: true \}\)/);
  });

  test('login cannot grant a role to a non-admin', () => {
    const login = src.slice(src.indexOf('router.post("/login"'));
    expect(login).toMatch(/emailVerified: user\.role === "admin"/);
  });
});

describe('A-2 / A-3 · collab authorization fails closed', () => {
  const src = read('services/collab.js');

  test('an unreachable database refuses the join', () => {
    // The checks used to live inside `if (readyState === 1)`, so an outage
    // skipped them entirely and every socket joined any room it named.
    const guard = src.slice(src.indexOf('readyState !== 1'), src.indexOf('readyState !== 1') + 200);
    expect(guard).toMatch(/return socket\.emit\('coding:error'/);
  });

  test('a verification error refuses the join', () => {
    const join = src.slice(src.indexOf("socket.on('coding:join'"), src.indexOf("socket.on('coding:state-request'"));
    const catchBlock = join.slice(join.indexOf('} catch (err)'));
    expect(catchBlock).toMatch(/return socket\.emit\('coding:error'/);
  });

  test('ad-hoc rooms belong to whoever opened them', () => {
    // The default used to be ALLOW for any sessionId with no InterviewSession
    // behind it — which is exactly the shape the workspace generated.
    expect(src).toMatch(/adhocRoomOwners/);
    const join = src.slice(src.indexOf("socket.on('coding:join'"));
    expect(join).toMatch(/owner && owner !== uid/);
  });
});

/**
 * A-5 · paid endpoints are metered per user.
 *
 * The guard that lived here asserted on the source text of server.js — that
 * the mount line read a certain way and that the word `keyGenerator:` was
 * present. Both were true, and the limiter still did nothing: it was mounted
 * ahead of the middleware that sets req.user, and its fallback called
 * ipKeyGenerator with a request object instead of an IP string, giving every
 * request its own bucket.
 *
 * A control can be present in the source and wrong at runtime. Source-text
 * assertions cannot tell the difference, so the real guard now sends requests
 * and watches them get rejected:
 *
 *   __tests__/aiRateLimit.test.js
 *
 * Verified by reverting both defects: 5 of its 6 tests fail.
 */
