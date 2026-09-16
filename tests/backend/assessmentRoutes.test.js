process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci-at-least-32-chars-long';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hiready-test';
const { backend } = require('./support/paths');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require(backend('server'));
const User = require(backend('models/User'));
const Question = require(backend('models/Question'));
const AssessmentTemplate = require(backend('models/AssessmentTemplate'));
const AssessmentAttempt = require(backend('models/AssessmentAttempt'));

/**
 * HTTP coverage for the assessment surface.
 *
 * 759 lines, and nothing in `npm test` sent it a request. The projection bug
 * that served every candidate an aptitude section with NO ANSWER OPTIONS lived
 * here, undetected, because the only thing exercising these routes was a smoke
 * script that is not part of the test run — and that script counted questions
 * rather than reading them.
 *
 * These cover the two things unit tests structurally cannot: what the route
 * actually returns, and who it lets do what.
 */

const TAG = `asmt-${Date.now()}`;

describe('the assessment surface', () => {
  let adminId;
  let studentAId;
  let studentBId;
  let adminToken;
  let studentAToken;
  let studentBToken;
  let templateId;
  let questionIds = [];

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
      await mongoose.connect(process.env.MONGO_URI);
    }

    const [admin, a, b] = await Promise.all([
      User.create({ name: 'A', email: `${TAG}-admin@test.invalid`, role: 'admin' }),
      User.create({ name: 'B', email: `${TAG}-a@test.invalid`, role: 'user' }),
      User.create({ name: 'C', email: `${TAG}-b@test.invalid`, role: 'user' }),
    ]);
    adminId = admin._id; studentAId = a._id; studentBId = b._id;

    const sign = (id) => `Bearer ${jwt.sign({ id: String(id) }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
    adminToken = sign(adminId); studentAToken = sign(studentAId); studentBToken = sign(studentBId);

    // Five answerable questions in their own category, cleaned up afterwards.
    const docs = await Question.insertMany(
      Array.from({ length: 5 }, (_, i) => ({
        Question: `${TAG} question ${i}?`,
        'Option A': `A${i}`, 'Option B': `B${i}`, 'Option C': `C${i}`, 'Option D': `D${i}`,
        Answer: 'B', category: TAG, difficulty: 'easy',
      }))
    );
    questionIds = docs.map((d) => d._id);

    const template = await AssessmentTemplate.create({
      title: `${TAG} single section`,
      companyId: null,
      isPublished: true,
      sections: [{ type: 'aptitude', title: 'Logic', count: 5, negativeMarking: false, minutes: 30 }],
    });
    templateId = template._id;
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({ email: new RegExp(`^${TAG}`) }),
      Question.deleteMany({ category: TAG }),
      AssessmentTemplate.deleteMany({ title: new RegExp(`^${TAG}`) }),
      AssessmentAttempt.deleteMany({ templateId }),
    ]);
    await mongoose.disconnect().catch(() => {});
  });

  describe('a served section is answerable', () => {
    let attemptId;

    beforeAll(async () => {
      const started = await request(app)
        .post(`/api/assessment/start/${templateId}`)
        .set('Authorization', studentAToken)
        .send({});
      attemptId = started.body.attempt && (started.body.attempt.id || started.body.attempt._id);
    });

    test('an attempt starts', () => {
      expect(attemptId).toBeTruthy();
    });

    test('every question carries all four options', async () => {
      /**
       * THE regression. The route projected its option paths with the STRING
       * form of .select(), which splits on whitespace — so 'Option A'..'Option
       * D' were never requested and every candidate reached the section with a
       * bare question stem and nothing to choose from.
       *
       * Counting questions does not notice: there were still five of them.
       */
      const res = await request(app)
        .get(`/api/assessment/attempt/${attemptId}/section/0/questions`)
        .set('Authorization', studentAToken);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(5);

      res.body.forEach((q) => {
        ['Option A', 'Option B', 'Option C', 'Option D'].forEach((k) => {
          expect(String(q[k] ?? '')).not.toHaveLength(0);
        });
      });
    });

    test('the answer key never reaches the candidate', async () => {
      const res = await request(app)
        .get(`/api/assessment/attempt/${attemptId}/section/0/questions`)
        .set('Authorization', studentAToken);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('"Answer"');
      expect(body).not.toContain('answerKey');
    });

    test('another student cannot read this attempt', async () => {
      // Every attempt query is scoped { _id, userId }. A 404 rather than a 403
      // so the existence of someone else's attempt is not confirmed either.
      const res = await request(app)
        .get(`/api/assessment/attempt/${attemptId}/section/0/questions`)
        .set('Authorization', studentBToken);
      expect(res.status).toBe(404);
    });

    test('another student cannot submit into it', async () => {
      const res = await request(app)
        .post(`/api/assessment/attempt/${attemptId}/section/0/submit`)
        .set('Authorization', studentBToken)
        .send({ answers: [] });
      expect(res.status).toBe(404);

      const still = await AssessmentAttempt.findById(attemptId).lean();
      expect(still.status).toBe('in_progress');
    });
  });

  describe('template administration', () => {
    test('a student cannot create a template', async () => {
      const res = await request(app)
        .post('/api/assessment/templates')
        .set('Authorization', studentAToken)
        .send({ title: 'nope', sections: [{ type: 'aptitude', count: 1, minutes: 1 }] });
      expect(res.status).toBe(403);
    });

    test('a student cannot edit one', async () => {
      const res = await request(app)
        .put(`/api/assessment/templates/${templateId}`)
        .set('Authorization', studentAToken)
        .send({ title: 'hijacked' });
      expect(res.status).toBe(403);
    });

    test('an update cannot move a template into a company', async () => {
      /**
       * This route did `$set: req.body` wholesale. companyId is a declared
       * path, so one unvalidated field could move a PLATFORM template (visible
       * to everyone) into a single company's private scope — or pull a rival's
       * out of theirs. services/hire/readers.js decides what a recruiter may
       * see from that field, which makes it an authorization input, not
       * content.
       */
      const foreign = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/assessment/templates/${templateId}`)
        .set('Authorization', adminToken)
        .send({ title: `${TAG} renamed`, companyId: foreign });

      expect(res.status).toBe(200);

      const after = await AssessmentTemplate.findById(templateId).lean();
      expect(after.title).toBe(`${TAG} renamed`);   // the allowed field applied
      expect(after.companyId).toBeNull();           // the tenancy field did not
    });

    test('an update naming only unknown fields is refused, not silently applied', async () => {
      // Otherwise a typo in a field name reads as a successful save.
      const res = await request(app)
        .put(`/api/assessment/templates/${templateId}`)
        .set('Authorization', adminToken)
        .send({ notAField: true, companyId: new mongoose.Types.ObjectId() });
      expect(res.status).toBe(400);
    });

    test('students see only platform templates', async () => {
      const res = await request(app)
        .get('/api/assessment/templates')
        .set('Authorization', studentAToken);
      expect(res.status).toBe(200);
      (res.body.templates || []).forEach((t) => {
        expect(t.companyId == null).toBe(true);
      });
    });
  });

  describe('authentication', () => {
    test.each([
      ['get', '/api/assessment/templates'],
      ['get', '/api/assessment/attempt/current'],
    ])('%s %s requires a token', async (method, path) => {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    });
  });
});
