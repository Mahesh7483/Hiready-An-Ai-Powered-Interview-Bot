process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci-at-least-32-chars-long';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hiready-test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../server');
const Question = require('../models/Question');
const AptitudeAttempt = require('../models/AptitudeAttempt');
const TestResult = require('../models/TestResult');
const User = require('../models/User');
const InterviewSession = require('../models/InterviewSession');
const ProctorLog = require('../models/ProctorLog');

describe('Aptitude Zero-Client-Trust Grading & Data Privacy Cascade Deletion', () => {
  const userAId = new mongoose.Types.ObjectId();
  const userBId = new mongoose.Types.ObjectId();

  const tokenUserA = jwt.sign({ id: String(userAId) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const tokenUserB = jwt.sign({ id: String(userBId) }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const authA = () => `Bearer ${tokenUserA}`;
  const authB = () => `Bearer ${tokenUserB}`;

  let testQuestions = [];

  beforeAll(async () => {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hiready-test';
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => {});
      }
      await mongoose.connect(uri);
    }

    // Clean test collections
    await Promise.all([
      Question.deleteMany({ category: 'security-test-suite' }),
      AptitudeAttempt.deleteMany({ userId: { $in: [userAId, userBId] } }),
      TestResult.deleteMany({ userId: { $in: [userAId, userBId] } }),
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


    // Create 4 test questions
    testQuestions = await Question.create([
      {
        Question: 'Test Question 1?',
        'Option A': 'Alpha',
        'Option B': 'Beta',
        'Option C': 'Gamma',
        'Option D': 'Delta',
        Answer: 'A',
        category: 'security-test-suite',
        difficulty: 'easy'
      },
      {
        Question: 'Test Question 2?',
        'Option A': 'Alpha',
        'Option B': 'Beta',
        'Option C': 'Gamma',
        'Option D': 'Delta',
        Answer: 'B',
        category: 'security-test-suite',
        difficulty: 'easy'
      },
      {
        Question: 'Test Question 3?',
        'Option A': 'Alpha',
        'Option B': 'Beta',
        'Option C': 'Gamma',
        'Option D': 'Delta',
        Answer: 'C',
        category: 'security-test-suite',
        difficulty: 'medium'
      },
      {
        Question: 'Test Question 4?',
        'Option A': 'Alpha',
        'Option B': 'Beta',
        'Option C': 'Gamma',
        'Option D': 'Delta',
        Answer: 'D',
        category: 'security-test-suite',
        difficulty: 'hard'
      }
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      Question.deleteMany({ category: 'security-test-suite' }),
      AptitudeAttempt.deleteMany({ userId: { $in: [userAId, userBId] } }),
      TestResult.deleteMany({ userId: { $in: [userAId, userBId] } }),
      InterviewSession.deleteMany({ user: { $in: [userAId, userBId] } }),
      ProctorLog.deleteMany({ userId: { $in: [userAId, userBId] } })
    ]);
    await mongoose.disconnect();
  });

  // ---------------------------------------------------------------------------
  // 1. VULNERABILITY EXPLOIT ATTEMPT: Empty Answers with Forged Score
  // ---------------------------------------------------------------------------
  test('POST /api/questions/quiz/save-result with { answers: [], score: 10, total: 10 } returns HTTP 400 and does NOT save to DB', async () => {
    const countBefore = await TestResult.countDocuments({ userId: userAId });

    // 1a. Attempt without attemptId
    const resNoAttempt = await request(app)
      .post('/api/questions/quiz/save-result')
      .set('Authorization', authA())
      .send({
        answers: [],
        score: 10,
        total: 10
      });

    expect(resNoAttempt.status).toBe(400);
    expect(resNoAttempt.body).toHaveProperty('error');

    // 1b. Attempt with valid active attempt but empty answers array
    const attempt = await AptitudeAttempt.create({
      userId: userAId,
      topic: 'logical',
      questionIds: testQuestions.map((q) => q._id),
      answerKey: new Map(testQuestions.map((q) => [String(q._id), q.Answer])),
      status: 'in_progress',
      negativeMarking: false
    });

    const resEmptyAnswers = await request(app)
      .post('/api/questions/quiz/save-result')
      .set('Authorization', authA())
      .send({
        attemptId: String(attempt._id),
        answers: [],
        score: 10,
        total: 10
      });

    expect(resEmptyAnswers.status).toBe(400);
    expect(resEmptyAnswers.body.error).toMatch(/non-empty/i);

    // Assert zero DB records saved
    const countAfter = await TestResult.countDocuments({ userId: userAId });
    expect(countAfter).toBe(countBefore);

    // Verify attempt is still in_progress
    const attemptFresh = await AptitudeAttempt.findById(attempt._id);
    expect(attemptFresh.status).toBe('in_progress');
  });

  // ---------------------------------------------------------------------------
  // 2. FOREIGN & DUPLICATE QUESTION ID INJECTIONS
  // ---------------------------------------------------------------------------
  test('POST /api/questions/quiz/save-result rejects foreign question IDs not issued in the attempt', async () => {
    const foreignId = new mongoose.Types.ObjectId();
    const attempt = await AptitudeAttempt.create({
      userId: userAId,
      topic: 'logical',
      questionIds: [testQuestions[0]._id, testQuestions[1]._id],
      answerKey: new Map([
        [String(testQuestions[0]._id), testQuestions[0].Answer],
        [String(testQuestions[1]._id), testQuestions[1].Answer]
      ]),
      status: 'in_progress'
    });

    const res = await request(app)
      .post('/api/questions/quiz/save-result')
      .set('Authorization', authA())
      .send({
        attemptId: String(attempt._id),
        answers: [
          { questionId: String(testQuestions[0]._id), selected: 'A' },
          { questionId: String(foreignId), selected: 'A' }
        ]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/foreign/i);

    const saved = await TestResult.findOne({ attemptId: attempt._id });
    expect(saved).toBeNull();
  });

  test('POST /api/questions/quiz/save-result rejects duplicate question IDs in answers payload', async () => {
    const attempt = await AptitudeAttempt.create({
      userId: userAId,
      topic: 'logical',
      questionIds: [testQuestions[0]._id, testQuestions[1]._id],
      answerKey: new Map([
        [String(testQuestions[0]._id), testQuestions[0].Answer],
        [String(testQuestions[1]._id), testQuestions[1].Answer]
      ]),
      status: 'in_progress'
    });

    const res = await request(app)
      .post('/api/questions/quiz/save-result')
      .set('Authorization', authA())
      .send({
        attemptId: String(attempt._id),
        answers: [
          { questionId: String(testQuestions[0]._id), selected: 'A' },
          { questionId: String(testQuestions[0]._id), selected: 'A' }
        ]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/duplicate/i);

    const saved = await TestResult.findOne({ attemptId: attempt._id });
    expect(saved).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 3. SERVER-AUTHORITATIVE STANDARD SCORING (lambda = 0)
  // ---------------------------------------------------------------------------
  test('Standard scoring: enforces server grading (lambda = 0), ignores client score, handles unanswered questions', async () => {
    const attempt = await AptitudeAttempt.create({
      userId: userAId,
      topic: 'security-test-suite',
      questionIds: testQuestions.map((q) => q._id),
      answerKey: new Map(testQuestions.map((q) => [String(q._id), q.Answer])),
      status: 'in_progress',
      negativeMarking: false
    });

    // Submitting 4 questions:
    // Q1: 'A' -> correct (+1)
    // Q2: 'C' -> wrong (0 penalty)
    // Q3: ''  -> unanswered (0 marks, 0 deduction)
    // Q4: 'D' -> correct (+1)
    // Client attempts score inflation by sending score: 99, total: 99
    const res = await request(app)
      .post('/api/questions/quiz/save-result')
      .set('Authorization', authA())
      .send({
        attemptId: String(attempt._id),
        score: 99,
        total: 99,
        totalQuestions: 99,
        answers: [
          { questionId: String(testQuestions[0]._id), selected: 'A' },
          { questionId: String(testQuestions[1]._id), selected: 'C' },
          { questionId: String(testQuestions[2]._id), selected: '' },
          { questionId: String(testQuestions[3]._id), selected: 'D' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Score = max(0, 2 - (0 * 1)) = 2. Client score of 99 MUST BE IGNORED.
    expect(res.body.score).toBe(2);
    expect(res.body.totalQuestions).toBe(4);
    expect(res.body.percentage).toBe(50);
    expect(res.body.breakdown).toEqual({
      correct: 2,
      wrong: 1,
      unanswered: 1,
      negativeMarking: false,
      lambda: 0
    });

    // Check DB persistence
    const saved = await TestResult.findOne({ attemptId: attempt._id });
    expect(saved).not.toBeNull();
    expect(saved.score).toBe(2);
    expect(saved.totalQuestions).toBe(4);
    expect(saved.markingMode).toBe('standard');
    expect(saved.audit.breakdown.lambda).toBe(0);

    // Check attempt is marked completed
    const freshAttempt = await AptitudeAttempt.findById(attempt._id);
    expect(freshAttempt.status).toBe('completed');
  });

  // ---------------------------------------------------------------------------
  // 4. SERVER-AUTHORITATIVE NEGATIVE MARKING (lambda = 0.25)
  // ---------------------------------------------------------------------------
  test('Negative marking: applies lambda = 0.25 penalty per wrong answer and 0 for unanswered', async () => {
    const attempt = await AptitudeAttempt.create({
      userId: userAId,
      topic: 'security-test-suite',
      questionIds: testQuestions.map((q) => q._id),
      answerKey: new Map(testQuestions.map((q) => [String(q._id), q.Answer])),
      status: 'in_progress',
      negativeMarking: true
    });

    // Submitting:
    // Q1: 'A' -> correct (+1)
    // Q2: 'C' -> wrong (-0.25)
    // Q3: ''  -> unanswered (0)
    // Q4: 'A' -> wrong (-0.25)
    // Score = max(0, 1 - (0.25 * 2)) = 0.5
    const res = await request(app)
      .post('/api/questions/quiz/save-result')
      .set('Authorization', authA())
      .send({
        attemptId: String(attempt._id),
        score: 10,
        total: 10,
        answers: [
          { questionId: String(testQuestions[0]._id), selected: 'A' },
          { questionId: String(testQuestions[1]._id), selected: 'C' },
          { questionId: String(testQuestions[2]._id), selected: 'OMITTED' },
          { questionId: String(testQuestions[3]._id), selected: 'A' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(0.5);
    expect(res.body.totalQuestions).toBe(4);
    expect(res.body.percentage).toBe(12.5);
    expect(res.body.breakdown).toEqual({
      correct: 1,
      wrong: 2,
      unanswered: 1,
      negativeMarking: true,
      lambda: 0.25
    });

    const saved = await TestResult.findOne({ attemptId: attempt._id });
    expect(saved.score).toBe(0.5);
    expect(saved.markingMode).toBe('negative_0.25');
  });

  // ---------------------------------------------------------------------------
  // 5. CASCADE DELETION & DATA PRIVACY ENFORCEMENT
  // ---------------------------------------------------------------------------
  test('Interview deletion cascades and purges associated ProctorLog records and webcam snapshots', async () => {
    const sessionDoc = await InterviewSession.create({
      user: userAId,
      sessionId: 'session-cascade-test-101',
      role: 'Backend Architect',
      experienceLevel: 'Senior',
      conversationLog: [{ role: 'interviewer', text: 'Hello candidate' }]
    });

    // Insert 2 associated ProctorLog entries with webcam snapshots
    await ProctorLog.create([
      {
        sessionId: sessionDoc.sessionId,
        userId: userAId,
        event: 'gaze_away_detected',
        timestamp: new Date(),
        snapshot: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD...'
      },
      {
        sessionId: sessionDoc.sessionId,
        userId: userAId,
        event: 'tab_switch',
        timestamp: new Date(),
        snapshot: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/fake...'
      }
    ]);

    // Verify logs exist before deletion
    const logsBefore = await ProctorLog.find({ sessionId: sessionDoc.sessionId });
    expect(logsBefore.length).toBe(2);

    // 5a. Unauthorized User B attempts to delete User A's session -> HTTP 403 Forbidden
    const resForbidden = await request(app)
      .delete(`/api/interviews/sessions/${sessionDoc._id}`)
      .set('Authorization', authB());

    expect(resForbidden.status).toBe(403);

    // Confirm session and proctor logs still exist
    const sessionStillExists = await InterviewSession.findById(sessionDoc._id);
    expect(sessionStillExists).not.toBeNull();
    const logsStillExist = await ProctorLog.find({ sessionId: sessionDoc.sessionId });
    expect(logsStillExist.length).toBe(2);

    // 5b. Authorized User A deletes session -> Cascades and deletes ProctorLog snapshots
    const resCascade = await request(app)
      .delete(`/api/interviews/sessions/${sessionDoc._id}`)
      .set('Authorization', authA());

    expect(resCascade.status).toBe(200);
    expect(resCascade.body.message).toMatch(/deleted/i);
    expect(resCascade.body.purgedLogsCount).toBe(2);

    // Verify InterviewSession document deleted
    const sessionAfter = await InterviewSession.findById(sessionDoc._id);
    expect(sessionAfter).toBeNull();

    // Verify all ProctorLog records and webcam snapshots are PURGED
    const logsAfter = await ProctorLog.find({ sessionId: sessionDoc.sessionId });
    expect(logsAfter.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 6. FOREIGN-OWNER ATTEMPT ID REJECTION (HTTP 403)
  // ---------------------------------------------------------------------------
  test('POST /api/questions/quiz/save-result rejects attempt belonging to another user with HTTP 403', async () => {
    const attemptA = await AptitudeAttempt.create({
      userId: userAId,
      topic: 'security-test-suite',
      questionIds: [testQuestions[0]._id],
      answerKey: new Map([[String(testQuestions[0]._id), testQuestions[0].Answer]]),
      status: 'in_progress'
    });

    // User B attempts to submit User A's attempt
    const resForbidden = await request(app)
      .post('/api/questions/quiz/save-result')
      .set('Authorization', authB())
      .send({
        attemptId: String(attemptA._id),
        answers: [{ questionId: String(testQuestions[0]._id), selected: 'A' }]
      });

    expect(resForbidden.status).toBe(403);
    expect(resForbidden.body.error).toMatch(/unauthorized|different user/i);

    const saved = await TestResult.findOne({ attemptId: attemptA._id });
    expect(saved).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 7. EXPIRED ATTEMPT REJECTION (HTTP 400)
  // ---------------------------------------------------------------------------
  test('POST /api/questions/quiz/save-result rejects expired attempts with HTTP 400', async () => {
    const expiredAttempt = await AptitudeAttempt.create({
      userId: userAId,
      topic: 'security-test-suite',
      questionIds: [testQuestions[0]._id],
      answerKey: new Map([[String(testQuestions[0]._id), testQuestions[0].Answer]]),
      status: 'in_progress',
      expiresAt: new Date(Date.now() - 60000) // 1 minute in the past
    });

    const resExpired = await request(app)
      .post('/api/questions/quiz/save-result')
      .set('Authorization', authA())
      .send({
        attemptId: String(expiredAttempt._id),
        answers: [{ questionId: String(testQuestions[0]._id), selected: 'A' }]
      });

    expect(resExpired.status).toBe(400);
    expect(resExpired.body.error).toMatch(/expired/i);

    const saved = await TestResult.findOne({ attemptId: expiredAttempt._id });
    expect(saved).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 8. REPEATED & CONCURRENT SUBMISSIONS (IDEMPOTENCY & RACE-CONDITION GUARD)
  // ---------------------------------------------------------------------------
  test('Simultaneous submissions for the same attempt resolve with exactly one 200 and one 409 Conflict, creating exactly one DB record', async () => {
    const concurrentAttempt = await AptitudeAttempt.create({
      userId: userAId,
      topic: 'security-test-suite',
      questionIds: [testQuestions[0]._id, testQuestions[1]._id],
      answerKey: new Map([
        [String(testQuestions[0]._id), testQuestions[0].Answer],
        [String(testQuestions[1]._id), testQuestions[1].Answer]
      ]),
      status: 'in_progress'
    });

    const payload = {
      attemptId: String(concurrentAttempt._id),
      answers: [
        { questionId: String(testQuestions[0]._id), selected: 'A' },
        { questionId: String(testQuestions[1]._id), selected: 'B' }
      ]
    };

    // Execute two simultaneous HTTP submissions
    const [res1, res2] = await Promise.all([
      request(app).post('/api/questions/quiz/save-result').set('Authorization', authA()).send(payload),
      request(app).post('/api/questions/quiz/save-result').set('Authorization', authA()).send(payload)
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Verify exactly ONE TestResult is persisted in MongoDB
    const resultsCount = await TestResult.countDocuments({ attemptId: concurrentAttempt._id });
    expect(resultsCount).toBe(1);

    // Repeated third sequential submission returns HTTP 409
    const resRepeated = await request(app)
      .post('/api/questions/quiz/save-result')
      .set('Authorization', authA())
      .send(payload);

    expect(resRepeated.status).toBe(409);
    expect(resRepeated.body.error).toMatch(/already.*(submitted|graded|processed)/i);
  });

  // ---------------------------------------------------------------------------
  // 9. KEY SNAPSHOT IMMUTABILITY AFTER QUESTION BANK MODIFICATION
  // ---------------------------------------------------------------------------
  test('Grading uses locked attempt answerKey snapshot even if question bank is modified in DB', async () => {
    // Initial answer for testQuestions[2] is 'C'
    const snapshotAttempt = await AptitudeAttempt.create({
      userId: userAId,
      topic: 'security-test-suite',
      questionIds: [testQuestions[2]._id],
      answerKey: new Map([[String(testQuestions[2]._id), 'C']]),
      status: 'in_progress'
    });

    // Mutate the question bank in DB to 'D' AFTER attempt was issued
    await Question.findByIdAndUpdate(testQuestions[2]._id, { Answer: 'D' });

    // User submits 'C' (which matches the attempt snapshot)
    const res = await request(app)
      .post('/api/questions/quiz/save-result')
      .set('Authorization', authA())
      .send({
        attemptId: String(snapshotAttempt._id),
        answers: [{ questionId: String(testQuestions[2]._id), selected: 'C' }]
      });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(1);
    expect(res.body.breakdown.correct).toBe(1);

    // Revert DB question back to 'C'
    await Question.findByIdAndUpdate(testQuestions[2]._id, { Answer: 'C' });
  });

  // ---------------------------------------------------------------------------
  // 10. RESULT RETRIEVAL WITH OWNER & NON-OWNER PERMISSIONS
  // ---------------------------------------------------------------------------
  test('GET /api/questions/quiz/result/:id allows owner access and rejects non-owner with HTTP 403', async () => {
    const testResult = await TestResult.create({
      userId: userAId,
      mode: 'test',
      score: 3,
      totalQuestions: 4,
      percentage: 75,
      markingMode: 'standard',
      keyVersion: 1
    });

    // 10a. Owner (User A) retrieves result -> 200
    const resOwner = await request(app)
      .get(`/api/questions/quiz/result/${testResult._id}`)
      .set('Authorization', authA());

    expect(resOwner.status).toBe(200);
    expect(resOwner.body.score).toBe(3);
    expect(resOwner.body.percentage).toBe(75);

    // 10b. Non-owner (User B) attempts to retrieve result -> 403 Forbidden
    const resNonOwner = await request(app)
      .get(`/api/questions/quiz/result/${testResult._id}`)
      .set('Authorization', authB());

    expect(resNonOwner.status).toBe(403);
    expect(resNonOwner.body.error).toMatch(/unauthorized|different user/i);

    // 10c. Invalid ID format -> 400
    const resInvalid = await request(app)
      .get('/api/questions/quiz/result/invalid-hex-id')
      .set('Authorization', authA());
    expect(resInvalid.status).toBe(400);

    // 10d. Non-existent ID -> 404
    const resNotFound = await request(app)
      .get(`/api/questions/quiz/result/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', authA());
    expect(resNotFound.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // 11. SELECTIVE CASCADE DELETION & REPEATED DELETION IDEMPOTENCY
  // ---------------------------------------------------------------------------
  test('Session deletion removes only intended records, leaves other sessions intact, and returns 404 on repeat', async () => {
    // Create 2 sessions for User A
    const session1 = await InterviewSession.create({
      user: userAId,
      sessionId: 'session-target-1',
      role: 'Engineer 1',
      experienceLevel: 'Mid',
      conversationLog: []
    });

    const session2 = await InterviewSession.create({
      user: userAId,
      sessionId: 'session-target-2',
      role: 'Engineer 2',
      experienceLevel: 'Senior',
      conversationLog: []
    });

    // Create proctor logs for both sessions
    await ProctorLog.create([
      { sessionId: session1.sessionId, userId: userAId, event: 'log1', timestamp: new Date() },
      { sessionId: session2.sessionId, userId: userAId, event: 'log2', timestamp: new Date() }
    ]);

    // Delete session 1
    const resDel1 = await request(app)
      .delete(`/api/interviews/sessions/${session1._id}`)
      .set('Authorization', authA());

    expect(resDel1.status).toBe(200);

    // Verify session 1 and its logs are gone
    expect(await InterviewSession.findById(session1._id)).toBeNull();
    expect(await ProctorLog.find({ sessionId: session1.sessionId })).toHaveLength(0);

    // CRITICAL: Verify session 2 and its logs are STILL INTACT (selective cleanup)
    expect(await InterviewSession.findById(session2._id)).not.toBeNull();
    expect(await ProctorLog.find({ sessionId: session2.sessionId })).toHaveLength(1);

    // Repeated deletion of session 1 -> returns 404 Not Found
    const resRepeatDel = await request(app)
      .delete(`/api/interviews/sessions/${session1._id}`)
      .set('Authorization', authA());

    expect(resRepeatDel.status).toBe(404);

    // Cleanup session 2
    await request(app)
      .delete(`/api/interviews/sessions/${session2._id}`)
      .set('Authorization', authA());
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
});
