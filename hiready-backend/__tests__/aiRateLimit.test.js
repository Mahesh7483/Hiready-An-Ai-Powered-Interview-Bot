process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci-at-least-32-chars-long';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hiready-test';

const request = require('supertest');
const jwt = require('jsonwebtoken');

/**
 * The paid endpoints must be metered PER ACCOUNT.
 *
 * This file exists because the previous guard did not test the limiter — it
 * read server.js with fs.readFileSync and string-matched the mount line and
 * the word `keyGenerator:`. It passed for as long as the limiter existed and
 * said nothing about whether it worked. It did not:
 *
 *   1. aiLimiter was mounted before the router that sets req.user, so the
 *      per-account branch was unreachable and every request took the fallback.
 *   2. The fallback called ipKeyGenerator(req). That helper takes an IP
 *      string; handed a request object it returns the object, and the memory
 *      store keys by identity — a brand-new bucket per request, forever.
 *
 * Net effect: no limit at all on the only endpoints that cost money.
 *
 * So every test here sends real requests through the real middleware stack and
 * asserts on status codes. A limit nobody has watched reject a request has not
 * been shown to exist.
 */

// The mocks keep this suite off the network and off Mongo: we are testing the
// limiter in front of the routes, not the routes themselves.
jest.mock('../middleware/auth', () => {
  const actual = jest.requireActual('../middleware/auth');
  const jsonwebtoken = require('jsonwebtoken');
  return {
    ...actual,
    // Same contract as the real one (sets req.user = { id }), minus the
    // account-existence lookup, which would need a live database.
    requireAuth: (req, res, next) => {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Authentication required' });
      try {
        const payload = jsonwebtoken.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        req.user = { id: payload.id };
        return next();
      } catch {
        return res.status(401).json({ error: 'Invalid token' });
      }
    },
  };
});

const app = require('../server');

const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { algorithm: 'HS256' });

/** The cheapest authenticated /api/ai route: rejected at validation, still limited. */
const call = (token) =>
  request(app).post('/api/ai/chat').set('Authorization', `Bearer ${token}`).send({ messages: [] });

describe('the AI limiter counts, and counts per account', () => {
  test('repeated calls from one account share a bucket', async () => {
    // The original defect made every request its own bucket, so the remaining
    // count never moved. Watching it decrease is the proof it is counting.
    const token = tokenFor('aaaaaaaaaaaaaaaaaaaaaaa1');

    const first = await call(token);
    const second = await call(token);

    expect(first.headers).toHaveProperty('ratelimit-remaining');
    const r1 = Number(first.headers['ratelimit-remaining']);
    const r2 = Number(second.headers['ratelimit-remaining']);

    expect(Number.isNaN(r1)).toBe(false);
    expect(r2).toBe(r1 - 1);
  });

  test('one account cannot spend another account s allowance', async () => {
    // This is the property that matters: the whole point of keying on the user
    // is that a noisy account is isolated. Under the old code both accounts
    // shared nothing and neither was ever limited, so this could not fail.
    const noisy = tokenFor('bbbbbbbbbbbbbbbbbbbbbbb2');
    const quiet = tokenFor('ccccccccccccccccccccccc3');

    let noisyLimited = false;
    for (let i = 0; i < 65; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call(noisy);
      if (res.status === 429) {
        noisyLimited = true;
        break;
      }
    }
    expect(noisyLimited).toBe(true);

    const other = await call(quiet);
    expect(other.status).not.toBe(429);
  });

  test('the limit response says what happened', async () => {
    const token = tokenFor('ddddddddddddddddddddddd4');
    let limited = null;
    for (let i = 0; i < 65; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call(token);
      if (res.status === 429) {
        limited = res;
        break;
      }
    }
    expect(limited).not.toBeNull();
    expect(limited.body.error).toMatch(/AI usage limit/i);
  });

  test('an unauthenticated caller is refused before it can consume budget', async () => {
    // It must not fall through to an IP bucket shared by every logged-out
    // visitor, and it must never reach a paid provider.
    const res = await request(app).post('/api/ai/chat').send({ messages: [] });
    expect(res.status).toBe(401);
  });
});

describe('the key generator is called correctly', () => {
  test('ipKeyGenerator receives an IP string, never the request', () => {
    // Handed a request object it returns that object, which the memory store
    // keys by identity — one bucket per request, which is no limit at all.
    const { ipKeyGenerator } = require('express-rate-limit');
    const fakeReq = { ip: '203.0.113.7', headers: {} };

    expect(ipKeyGenerator(fakeReq)).toBe(fakeReq);        // the trap
    expect(ipKeyGenerator(fakeReq.ip)).toBe('203.0.113.7'); // the correct call

    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    expect(src).not.toMatch(/ipKeyGenerator\(req\)/);
  });

  test('requireAuth is mounted ahead of the limiter it feeds', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const mount = src.match(/app\.use\('\/api\/ai'[^)]*\)/);
    expect(mount).not.toBeNull();
    const order = mount[0];
    expect(order.indexOf('requireAuth')).toBeGreaterThan(-1);
    expect(order.indexOf('requireAuth')).toBeLessThan(order.indexOf('aiLimiter'));
  });
});
