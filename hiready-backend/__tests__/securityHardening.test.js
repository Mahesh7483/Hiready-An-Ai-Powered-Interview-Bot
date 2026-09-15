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

describe('L-1 · token verification pins the algorithm', () => {
  test.each([
    ['middleware/auth.js', auth],
    ['routes/questionRoutes.js', questionRoutes],
  ])('%s passes algorithms to jwt.verify', (_label, src) => {
    const calls = src.match(/jwt\.verify\([^)]*\)/g) || [];
    const ours = calls.filter((c) => c.includes('JWT_SECRET'));
    expect(ours.length).toBeGreaterThan(0);
    ours.forEach((c) => expect(c).toMatch(/algorithms:\s*\[\s*['"]HS256['"]\s*\]/));
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
