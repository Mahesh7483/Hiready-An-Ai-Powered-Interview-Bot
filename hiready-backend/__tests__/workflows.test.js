process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci-at-least-32-chars-long';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hiready-test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../server');
const User = require('../models/User');
const Question = require('../models/Question');
const AptitudeAttempt = require('../models/AptitudeAttempt');
const TestResult = require('../models/TestResult');
const ResumeAnalysis = require('../models/ResumeAnalysis');
const InterviewSession = require('../models/InterviewSession');
const ProctorLog = require('../models/ProctorLog');

/**
 * API Lifecycle Integration Tests.
 * 
 * SCOPE & BOUNDARIES:
 * These tests exercise the backend HTTP API routes, controllers, Mongoose schemas,
 * multi-user authorization barriers, and cascade deletion routines via Supertest.
 * They verify server-side state transitions, payload validations, and cross-user isolation.
 * They DO NOT simulate client-side browser DOM manipulation, browser-based PDF/DOCX text
 * extraction, Web Speech API / microphone media streams, or client-rendered UI workflows.
 * Complete end-to-end browser testing remains outstanding.
 */

describe('API Lifecycle Integration Tests & Multi-User Authorization Verification', () => {
  const userAId = new mongoose.Types.ObjectId();
  const userBId = new mongoose.Types.ObjectId();

  const tokenUserA = jwt.sign({ id: String(userAId) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const tokenUserB = jwt.sign({ id: String(userBId) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const expiredToken = jwt.sign({ id: String(userAId) }, process.env.JWT_SECRET, { expiresIn: '-1s' });

  const authA = () => `Bearer ${tokenUserA}`;
  const authB = () => `Bearer ${tokenUserB}`;

  let sampleQuestions = [];

  beforeAll(async () => {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hiready-test';
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => {});
      }
      await mongoose.connect(uri);
    }

    // Clean test data
    await Promise.all([
      Question.deleteMany({ category: 'workflow-test-suite' }),
      AptitudeAttempt.deleteMany({ userId: { $in: [userAId, userBId] } }),
      TestResult.deleteMany({ userId: { $in: [userAId, userBId] } }),
      ResumeAnalysis.deleteMany({ user: { $in: [userAId, userBId] } }),
      InterviewSession.deleteMany({ user: { $in: [userAId, userBId] } }),
      ProctorLog.deleteMany({ userId: { $in: [userAId, userBId] } })
    ]);
    // requireAuth confirms the account still exists, so tokens minted for ids
    // with no User document are correctly rejected. Create the two users the
    // fixture acts as.
    await User.deleteMany({ _id: { $in: [userAId, userBId] } });
    await User.create([
      { _id: userAId, name: 'Fixture A', email: `fixture-a-${userAId}@test.invalid` },
      { _id: userBId, name: 'Fixture B', email: `fixture-b-${userBId}@test.invalid` },
    ]);


    sampleQuestions = await Question.create([
      {
        Question: 'What is the time complexity of binary search?',
        'Option A': 'O(n)',
        'Option B': 'O(log n)',
        'Option C': 'O(n^2)',
        'Option D': 'O(1)',
        Answer: 'B',
        category: 'workflow-test-suite',
        difficulty: 'easy'
      },
      {
        Question: 'Which protocol is connection-oriented?',
        'Option A': 'UDP',
        'Option B': 'IP',
        'Option C': 'TCP',
        'Option D': 'DNS',
        Answer: 'C',
        category: 'workflow-test-suite',
        difficulty: 'easy'
      }
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      Question.deleteMany({ category: 'workflow-test-suite' }),
      AptitudeAttempt.deleteMany({ userId: { $in: [userAId, userBId] } }),
      TestResult.deleteMany({ userId: { $in: [userAId, userBId] } }),
      ResumeAnalysis.deleteMany({ user: { $in: [userAId, userBId] } }),
      InterviewSession.deleteMany({ user: { $in: [userAId, userBId] } }),
      ProctorLog.deleteMany({ userId: { $in: [userAId, userBId] } })
    ]);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
  });

  // ---------------------------------------------------------------------------
  // WORKFLOW 1: RÉSUMÉ ANALYSIS & PERSISTENCE LIFECYCLE
  // ---------------------------------------------------------------------------
  describe('Workflow 1: Résumé Extraction, Validation, Persistence & Cross-User Security', () => {
    let savedResumeId = null;

    test('1a. Upload/save extracted résumé analysis to database (POST /api/resumes)', async () => {
      const payload = {
        label: 'Senior Fullstack Resume',
        targetRole: 'Senior Backend Engineer',
        experienceLevel: 'Senior (5+ years)',
        sourceText: 'Experienced Node.js, Express, MongoDB, and TypeScript engineer.',
        resultJson: {
          atsScore: 88,
          keywordMatch: 82,
          formatScore: 90,
          overallScore: 87,
          extractedSkills: ['Node.js', 'Express', 'MongoDB', 'Docker'],
          missingKeywords: ['Kubernetes', 'GraphQL'],
          verdict: 'Strong candidate profile',
          summary: 'Solid technical background in scalable distributed systems.'
        }
      };

      const res = await request(app)
        .post('/api/resumes')
        .set('Authorization', authA())
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      savedResumeId = res.body.id;

      // Verify DB persistence
      const doc = await ResumeAnalysis.findById(savedResumeId);
      expect(doc).not.toBeNull();
      expect(doc.targetRole).toBe('Senior Backend Engineer');
      expect(doc.overallScore).toBe(87);
    });

    test('1b. Retrieve saved résumé analysis by owner (GET /api/resumes/:id)', async () => {
      const res = await request(app)
        .get(`/api/resumes/${savedResumeId}`)
        .set('Authorization', authA());

      expect(res.status).toBe(200);
      expect(res.body.overallScore).toBe(87);
      expect(res.body.skills).toContain('Node.js');
    });

    test('1c. Cross-user isolation: User B cannot view User A résumé analysis (returns 404)', async () => {
      const res = await request(app)
        .get(`/api/resumes/${savedResumeId}`)
        .set('Authorization', authB());

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    test('1d. Malformed payload validation rejects invalid score structures (POST /api/resumes)', async () => {
      const malformedPayload = {
        targetRole: 'Engineer',
        experienceLevel: 'Entry',
        resultJson: {
          atsScore: 'not-a-number',
          keywordMatch: 80,
          formatScore: 85,
          overallScore: 82
        }
      };

      const res = await request(app)
        .post('/api/resumes')
        .set('Authorization', authA())
        .send(malformedPayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/must be a 0-100 number/i);
    });

    test('1e. Delete résumé analysis by owner (DELETE /api/resumes/:id)', async () => {
      const res = await request(app)
        .delete(`/api/resumes/${savedResumeId}`)
        .set('Authorization', authA());

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted/i);

      // Verify removed from DB
      const doc = await ResumeAnalysis.findById(savedResumeId);
      expect(doc).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // WORKFLOW 2: INTERVIEW SESSION, INTEGRITY EVENTS & CASCADE DELETION
  // ---------------------------------------------------------------------------
  describe('Workflow 2: Spoken/Text Interview Session, Integrity Logs & Cascade Cleanup', () => {
    let savedSessionId = null;
    const interviewSessionKey = 'workflow-sess-uuid-999';

    test('2a. Save completed interview session with conversation log (POST /api/interviews/sessions)', async () => {
      const sessionPayload = {
        sessionId: interviewSessionKey,
        role: 'Distributed Systems Engineer',
        experienceLevel: 'Mid-Level',
        mode: 'assessment',
        durationSeconds: 940,
        conversationLog: [
          { role: 'interviewer', text: 'Explain horizontal vs vertical scaling.' },
          { role: 'user', text: 'Horizontal scaling adds more machines into the pool of resources.' },
          { role: 'interviewer', text: 'What are the main tradeoffs?' }
        ],
        integrity: {
          violations: 1,
          maxViolations: 3,
          terminated: false
        },
        interviewType: 'technical'
      };

      const res = await request(app)
        .post('/api/interviews/sessions')
        .set('Authorization', authA())
        .send(sessionPayload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      savedSessionId = res.body.id;

      // Attach proctoring log with snapshot
      await ProctorLog.create({
        sessionId: interviewSessionKey,
        userId: userAId,
        event: 'gaze_away_detected',
        timestamp: new Date(),
        snapshot: 'data:image/jpeg;base64,mocked_frame_data'
      });
    });

    test('2b. Retrieve session details by owner (GET /api/interviews/sessions/:id)', async () => {
      const res = await request(app)
        .get(`/api/interviews/sessions/${savedSessionId}`)
        .set('Authorization', authA());

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(interviewSessionKey);
      expect(res.body.durationSeconds).toBe(940);
      expect(res.body.conversationLog).toHaveLength(3);
    });

    test('2c. Cross-user unauthorized deletion blocked with HTTP 403 Forbidden', async () => {
      const res = await request(app)
        .delete(`/api/interviews/sessions/${savedSessionId}`)
        .set('Authorization', authB());

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/forbidden/i);

      // Verify records remain in DB
      expect(await InterviewSession.findById(savedSessionId)).not.toBeNull();
      expect(await ProctorLog.find({ sessionId: interviewSessionKey })).toHaveLength(1);
    });

    test('2d. Owner deletion cleanly cascades and purges interview session and proctor snapshots', async () => {
      const res = await request(app)
        .delete(`/api/interviews/sessions/${savedSessionId}`)
        .set('Authorization', authA());

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted/i);
      expect(res.body.purgedLogsCount).toBe(1);

      // Verify session and proctor logs are removed
      expect(await InterviewSession.findById(savedSessionId)).toBeNull();
      expect(await ProctorLog.find({ sessionId: interviewSessionKey })).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // WORKFLOW 3: APTITUDE QUIZ COMPLETE LIFECYCLE & SECURITY
  // ---------------------------------------------------------------------------
  describe('Workflow 3: Aptitude Quiz Start -> Answer -> Server Grading -> Result Lifecycle', () => {
    let activeAttemptId = null;
    let savedResultId = null;

    test('3a. Start quiz issues server-locked attempt and sanitizes answer keys (POST /api/questions/quiz/start)', async () => {
      const res = await request(app)
        .post('/api/questions/quiz/start')
        .set('Authorization', authA())
        .send({
          topic: 'workflow-test-suite',
          count: 2,
          mode: 'test',
          negativeMarking: true
        });

      expect([200, 201]).toContain(res.status);
      // The id travels in the BODY. It was also mirrored into an X-Attempt-Id
      // header, which a cross-origin browser cannot read without
      // Access-Control-Expose-Headers — the client always saw null and every
      // graded action failed. The redundant header is gone.
      activeAttemptId = res.body.attemptId;
      expect(activeAttemptId).toBeTruthy();
      expect(res.body.questions).toHaveLength(2);

      // CRITICAL: Correct answers MUST NOT be sent to client
      res.body.questions.forEach((q) => {
        expect(q).not.toHaveProperty('Answer');
        expect(q).not.toHaveProperty('Explanation');
        expect(q).toHaveProperty('Option A');
        expect(q).toHaveProperty('Option B');
      });
    });

    test('3b. Submit answers evaluates score server-side and marks attempt completed (POST /api/questions/quiz/save-result)', async () => {
      // Q1: B (correct, +1)
      // Q2: A (wrong, -0.25 on negativeMarking)
      // Expected score: max(0, 1 - 0.25) = 0.75
      const payload = {
        attemptId: activeAttemptId,
        score: 100, // Forged client score MUST BE IGNORED
        answers: [
          { questionId: String(sampleQuestions[0]._id), selected: 'B' },
          { questionId: String(sampleQuestions[1]._id), selected: 'A' }
        ]
      };

      const res = await request(app)
        .post('/api/questions/quiz/save-result')
        .set('Authorization', authA())
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.score).toBe(0.75);
      expect(res.body.totalQuestions).toBe(2);
      expect(res.body.percentage).toBe(37.5);
      savedResultId = res.body.id;
    });

    test('3c. Retrieve saved result by owner (GET /api/questions/quiz/result/:id)', async () => {
      const res = await request(app)
        .get(`/api/questions/quiz/result/${savedResultId}`)
        .set('Authorization', authA());

      expect(res.status).toBe(200);
      expect(res.body.score).toBe(0.75);
      expect(res.body.markingMode).toBe('negative_0.25');
    });

    test('3d. Non-owner cannot retrieve another user\'s test result (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/questions/quiz/result/${savedResultId}`)
        .set('Authorization', authB());

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/unauthorized/i);
    });

    test('3e. Expired JWT token rejects with HTTP 401 Unauthorized', async () => {
      const res = await request(app)
        .get(`/api/questions/quiz/result/${savedResultId}`)
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    test('3f. Missing Authorization header rejects with HTTP 401 Unauthorized', async () => {
      const res = await request(app)
        .get(`/api/questions/quiz/result/${savedResultId}`);

      expect(res.status).toBe(401);
    });
  });
});
