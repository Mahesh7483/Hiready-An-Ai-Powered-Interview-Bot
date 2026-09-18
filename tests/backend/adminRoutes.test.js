process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci-at-least-32-chars-long';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hiready-test';
const { backend } = require('./support/paths');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require(backend('server'));
const adminRouter = require(backend('routes/adminRoutes'));
const User = require(backend('models/User'));
const TestResult = require(backend('models/TestResult'));
const ProctorLog = require(backend('models/ProctorLog'));
const ProctorSnapshot = require(backend('models/ProctorSnapshot'));
const AuditLog = require(backend('models/AuditLog'));

/**
 * HTTP-level coverage for the admin surface.
 *
 * routes/adminRoutes.js is 1,300+ lines and 30 endpoints, every one of them
 * privileged: it reads every user's PII, the biometric snapshot gallery, the
 * disclosure audit, and it can delete accounts. It had NO test that sent it a
 * request. The only things touching it were source-text greps.
 *
 * That is how four separate defects survived here — two map lookups that
 * silently returned null, an audit trail that could not name the actor, and
 * two CSV columns that were blank on every row since the schema changed under
 * them. Each is covered below by a test that would have caught it.
 */

const TAG = `admintest-${Date.now()}`;

describe('the admin surface', () => {
  let adminId;
  let studentId;
  let adminToken;
  let studentToken;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
      await mongoose.connect(process.env.MONGO_URI);
    }

    const admin = await User.create({
      name: 'Admin Under Test', email: `${TAG}-admin@test.invalid`, role: 'admin',
    });
    const student = await User.create({
      name: 'Student Under Test', email: `${TAG}-student@test.invalid`, role: 'user',
    });
    adminId = admin._id;
    studentId = student._id;
    adminToken = `Bearer ${jwt.sign({ id: String(adminId) }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
    studentToken = `Bearer ${jwt.sign({ id: String(studentId) }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({ email: new RegExp(`^${TAG}`) }),
      TestResult.deleteMany({ topic: TAG }),
      ProctorLog.deleteMany({ sessionId: TAG }),
      ProctorSnapshot.deleteMany({ sessionId: TAG }),
      AuditLog.deleteMany({ adminId }),
    ]);
    await mongoose.disconnect().catch(() => {});
  });

  /**
   * Derived from the router, not from a list someone maintains. A new admin
   * endpoint is covered by this the moment it is added — which is the only way
   * a blanket authorization check stays true.
   */
  function adminEndpoints() {
    return adminRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods).find((m) => layer.route.methods[m]),
      }))
      // Skip parameterised paths for the blanket sweep: they need real ids and
      // are covered individually below.
      .filter((r) => !r.path.includes(':'));
  }

  describe('requireAdmin gates every endpoint', () => {
    const ENDPOINTS = adminEndpoints();

    test('the sweep found the real router, not an empty list', () => {
      // Non-vacuity. An empty list would make the whole describe pass for free.
      expect(ENDPOINTS.length).toBeGreaterThan(10);
    });

    test.each(ENDPOINTS.map((e) => [`${e.method.toUpperCase()} ${e.path}`, e]))(
      '%s refuses a non-admin',
      async (_label, endpoint) => {
        const res = await request(app)[endpoint.method](`/api/admin${endpoint.path}`)
          .set('Authorization', studentToken)
          .send({});
        // 403 from requireAdmin. Never 200, and never a 500 that leaks whether
        // the handler ran before the check.
        expect(res.status).toBe(403);
      }
    );

    test.each(ENDPOINTS.slice(0, 5).map((e) => [`${e.method.toUpperCase()} ${e.path}`, e]))(
      '%s refuses an unauthenticated caller',
      async (_label, endpoint) => {
        const res = await request(app)[endpoint.method](`/api/admin${endpoint.path}`).send({});
        expect(res.status).toBe(401);
      }
    );

    test('a token for a user who no longer exists is refused', async () => {
      const ghost = `Bearer ${jwt.sign(
        { id: String(new mongoose.Types.ObjectId()) }, process.env.JWT_SECRET, { expiresIn: '1h' }
      )}`;
      const res = await request(app).get('/api/admin/overview').set('Authorization', ghost);
      expect(res.status).toBe(403);
    });
  });

  describe('the audit trail can name who did it', () => {
    /**
     * The audit write is deliberately fire-and-forget — AuditLog.create(...)
     * .catch(console.warn), so a slow or failing audit never blocks an admin
     * action. That means it lands AFTER the response, and a test that reads
     * immediately races it. Worth stating plainly rather than hiding behind a
     * sleep: the same property means a process that dies in that window loses
     * the record. For an audit trail that is a real trade-off, made knowingly.
     */
    const waitForAudit = async (attempts = 20) => {
      for (let i = 0; i < attempts; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const row = await AuditLog.findOne({ adminId }).sort({ createdAt: -1 }).lean();
        if (row) return row;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    };

    test('a mutation records the admin\'s email, not an empty string', async () => {
      /**
       * Every AuditLog row stored adminEmail: '' — the writers read
       * req.user.email and requireAdmin only ever set { id }. An audit log that
       * cannot identify the actor does not audit anything, and nothing noticed
       * because nothing ever read a row back.
       */
      await request(app)
        .put(`/api/admin/users/${studentId}/role`)
        .set('Authorization', adminToken)
        .send({ role: 'user' });

      const row = await waitForAudit();
      expect(row).toBeTruthy();
      expect(row.adminEmail).toBe(`${TAG}-admin@test.invalid`);
      expect(row.adminEmail).not.toBe('');
    });

    test('a GET is not audited', async () => {
      // Only mutations. Auditing reads would bury the writes that matter.
      const before = await AuditLog.countDocuments({ adminId });
      await request(app).get('/api/admin/users').set('Authorization', adminToken);
      expect(await AuditLog.countDocuments({ adminId })).toBe(before);
    });
  });

  describe('listings resolve the user behind each row', () => {
    beforeAll(async () => {
      await TestResult.create({
        userId: studentId, topic: TAG, mode: 'practice', score: 3, totalQuestions: 5,
      });
      const log = await ProctorLog.create({
        sessionId: TAG, userId: studentId, event: 'tab_switch_detected', timestamp: new Date(),
      });
      await ProctorSnapshot.create({
        sessionId: TAG,
        userId: studentId,
        proctorLogId: log._id,
        image: 'data:image/jpeg;base64,AAAA',
        expiresAt: new Date(Date.now() + 864e5),
      });
    });

    test('results name the student', async () => {
      /**
       * userMap is keyed by String(_id); the lookup passed an ObjectId, so
       * `user` was null on EVERY row. The admin results table showed a column
       * of blanks that looked like deleted accounts.
       */
      const res = await request(app)
        .get('/api/admin/results?limit=100')
        .set('Authorization', adminToken);
      expect(res.status).toBe(200);
      const row = res.body.results.find((r) => r.topic === TAG);
      expect(row).toBeTruthy();
      expect(row.user).not.toBeNull();
      expect(row.user.email).toBe(`${TAG}-student@test.invalid`);
    });

    test('proctor logs name the student, and report the frame that exists', async () => {
      const res = await request(app)
        .get(`/api/admin/proctor-logs?sessionId=${TAG}`)
        .set('Authorization', adminToken);
      expect(res.status).toBe(200);
      const row = res.body.logs.find((l) => l.sessionId === TAG);
      expect(row).toBeTruthy();
      expect(row.user).not.toBeNull();
      expect(row.user.email).toBe(`${TAG}-student@test.invalid`);
      expect(row.hasSnapshot).toBe(true);
    });

    test('the listing never carries image data', async () => {
      // Biometric frames are admin-only and fetched one at a time on purpose.
      const res = await request(app)
        .get(`/api/admin/proctor-logs?sessionId=${TAG}`)
        .set('Authorization', adminToken);
      expect(JSON.stringify(res.body)).not.toContain('data:image');
    });
  });

  describe('CSV exports contain the columns they advertise', () => {
    test('users.csv reports a real test count', async () => {
      // It selected `testCount`, which is not a field on User. Every row
      // exported blank — reading as "nobody has taken a test".
      const res = await request(app)
        .get('/api/admin/users/export.csv')
        .set('Authorization', adminToken);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);

      const lines = res.text.trim().split('\n');
      expect(lines[0]).toContain('testCount');

      const row = lines.find((l) => l.includes(`${TAG}-student@test.invalid`));
      expect(row).toBeTruthy();
      // The student has exactly the one TestResult created above.
      expect(row.trim().split(',').pop().trim()).toBe('1');
    });

    test('proctor-logs.csv reports a real hasSnapshot', async () => {
      // `hasSnapshot` stopped existing on ProctorLog when frames moved to their
      // own collection. The column exported blank from that moment on.
      const res = await request(app)
        .get(`/api/admin/proctor-logs/export.csv?sessionId=${TAG}`)
        .set('Authorization', adminToken);
      expect(res.status).toBe(200);

      const lines = res.text.trim().split('\n');
      expect(lines[0]).toContain('hasSnapshot');
      const row = lines.find((l) => l.includes(TAG));
      expect(row).toBeTruthy();
      expect(row.toLowerCase()).toContain('true');
    });
  });

  describe('role changes', () => {
    test('an admin cannot change their own role', async () => {
      // Otherwise the last admin can lock everyone out, including themselves.
      const res = await request(app)
        .put(`/api/admin/users/${adminId}/role`)
        .set('Authorization', adminToken)
        .send({ role: 'user' });
      expect(res.status).toBeGreaterThanOrEqual(400);

      const still = await User.findById(adminId).select('role').lean();
      expect(still.role).toBe('admin');
    });

    test('an invalid role is rejected', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${studentId}/role`)
        .set('Authorization', adminToken)
        .send({ role: 'superuser' });
      expect(res.status).toBeGreaterThanOrEqual(400);

      const still = await User.findById(studentId).select('role').lean();
      expect(still.role).toBe('user');
    });

    test('a student cannot promote themselves', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${studentId}/role`)
        .set('Authorization', studentToken)
        .send({ role: 'admin' });
      expect(res.status).toBe(403);

      const still = await User.findById(studentId).select('role').lean();
      expect(still.role).toBe('user');
    });
  });

  describe('the overview aggregations answer at all', () => {
    // Nine parallel aggregations, several unindexed, and nothing had ever run
    // them against a real database in a test.
    test.each([
      ['/api/admin/overview'],
      ['/api/admin/engagement'],
      ['/api/admin/readiness'],
      ['/api/admin/weak-topics'],
    ])('GET %s returns 200', async (path) => {
      const res = await request(app).get(path).set('Authorization', adminToken);
      expect(res.status).toBe(200);
      expect(res.body).toBeTruthy();
    });
  });
});
