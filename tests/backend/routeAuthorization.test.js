process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci-at-least-32-chars-long';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hiready-test';
const { backend } = require('./support/paths');

const request = require('supertest');
const app = require(backend('server'));

/**
 * The set of endpoints that answer without a token, pinned.
 *
 * This is the guard I most wanted and least trusted myself to write, because
 * the obvious version — walk the router stack, count the unguarded ones —
 * I got WRONG twice while auditing:
 *
 *   1. The mount-path regex failed for 130 of 133 routers, collapsing every
 *      route onto a wrong path.
 *   2. `app.use('/api/ai', requireAuth, aiRoutes)` registers a PATH-SCOPED
 *      middleware at app level. Treating it as global marked every router
 *      mounted after that line as protected — including /api/code/languages,
 *      which really was open. The report said "6 unauthenticated" when the
 *      answer was 7, and the one that mattered was the one it hid.
 *
 * So this does not introspect anything. It SENDS REQUESTS and reads status
 * codes, because a 200 without a token is not a matter of interpretation.
 * scripts/audit-routes.js does the introspection and prints a list to read;
 * this asserts the property.
 */

/** Every endpoint that may answer an anonymous caller, and why. */
const PUBLIC = [
  ['get', '/', 'service banner'],
  ['get', '/api/test', 'liveness probe'],
  ['get', '/api/health', 'readiness probe — booleans only, never a key value'],
  ['post', '/api/auth/signup', 'creates the account that a token would come from'],
  ['post', '/api/auth/login', 'exchanges credentials for a token'],
  ['post', '/api/auth/google', 'exchanges a Firebase ID token for ours'],
];

/** A sample across every mounted router. Each must refuse an anonymous caller. */
const GUARDED = [
  ['get', '/api/questions/quiz/logical'],
  ['get', '/api/questions/leaderboard'],
  ['get', '/api/readiness/me'],
  ['get', '/api/mastery/today'],
  ['get', '/api/consent/me'],
  ['get', '/api/hire/me'],
  ['get', '/api/resumes'],
  ['get', '/api/interviews/sessions'],
  ['get', '/api/assessment/templates'],
  ['get', '/api/assessment/attempt/current'],
  ['get', '/api/admin/users'],
  ['get', '/api/admin/overview'],
  // Its own mount, separate from /api/admin — and the coverage test below
  // caught that this sample had missed it entirely.
  ['get', '/api/admin/coding-questions'],
  ['get', '/api/code/questions'],
  ['get', '/api/code/languages'],
  ['post', '/api/code/execute'],
  ['post', '/api/ai/chat'],
  ['get', '/api/ai/stt-token'],
  ['post', '/api/interview/proctor-log'],
];

describe('only the endpoints that must answer anonymously do', () => {
  test.each(GUARDED.map(([m, p]) => [`${m.toUpperCase()} ${p}`, m, p]))(
    '%s refuses an anonymous caller',
    async (_label, method, path) => {
      const res = await request(app)[method](path).send({});
      expect([401, 403]).toContain(res.status);
    }
  );

  test.each(PUBLIC.map(([m, p, why]) => [`${m.toUpperCase()} ${p} — ${why}`, m, p]))(
    '%s answers without a token, deliberately',
    async (_label, method, path) => {
      const res = await request(app)[method](path).send({});
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    }
  );

  test('the guarded sample covers every mounted router', () => {
    // Non-vacuity of a different kind: a sample that missed a whole router
    // would pass while that router was wide open. Derived from server.js so a
    // new mount fails this until it is sampled above.
    const fs = require('fs');
    const server = fs.readFileSync(backend('server.js'), 'utf8');
    const mounted = [...server.matchAll(/app\.use\('(\/api\/[^']+)'/g)].map((m) => m[1]);

    expect(mounted.length).toBeGreaterThan(10);

    const sampled = new Set(GUARDED.concat(PUBLIC.map(([m, p]) => [m, p])).map(([, p]) => p));
    const uncovered = mounted.filter(
      (mount) => ![...sampled].some((p) => p === mount || p.startsWith(`${mount}/`))
    );
    expect(uncovered).toEqual([]);
  });

  test('/api/health never returns a credential, only whether one is set', async () => {
    // It is public so a probe can reach it, which makes what it says load-bearing.
    const secret = 'gsk_a_fake_key_used_only_in_this_test';
    const prev = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = secret;
    try {
      const res = await request(app).get('/api/health');
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(secret);
      expect(body).not.toContain(secret.slice(0, 10));
      expect(res.body.providers.groq).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = prev;
    }
  });
});
