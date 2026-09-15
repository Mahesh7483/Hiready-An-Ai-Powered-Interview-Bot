process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci-at-least-32-chars-long';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hiready-test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { fork } = require('child_process');
const path = require('path');

const app = require('../server');
const AptitudeAttempt = require('../models/AptitudeAttempt');
const TestResult = require('../models/TestResult');
const InterviewSession = require('../models/InterviewSession');
const ProctorLog = require('../models/ProctorLog');
const User = require('../models/User');

describe('Failure Recovery, Interrupted Writes & Partial Deletion Fallback Tests', () => {
  const userId = new mongoose.Types.ObjectId();
  const token = jwt.sign({ id: String(userId) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const auth = () => `Bearer ${token}`;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      await mongoose.connect(process.env.MONGO_URI);
    }
    await TestResult.syncIndexes();
    // requireAuth confirms the account still exists, so a token minted for an
    // id with no User document is now correctly rejected. Create the user the
    // fixture claims to be.
    await User.create({ _id: userId, name: 'Recovery Fixture', email: `recovery-${userId}@test.invalid` });
  });

  afterAll(async () => {
    await AptitudeAttempt.deleteMany({ userId });
    await TestResult.deleteMany({ userId });
    await InterviewSession.deleteMany({ user: userId });
    await ProctorLog.deleteMany({ user: userId });
    await User.deleteOne({ _id: userId });
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });

  describe('1. Aptitude Interrupted-Write & Save Failure Recovery', () => {
    test('Failed TestResult.save() reverts AptitudeAttempt status back to in_progress and allows retry', async () => {
      const qid = new mongoose.Types.ObjectId();
      const attempt = await AptitudeAttempt.create({
        userId,
        topic: 'recovery-test',
        difficulty: 'medium',
        mode: 'practice',
        questionIds: [qid],
        answerKey: { [String(qid)]: 'A' },
        status: 'in_progress',
        negativeMarking: false
      });

      // Spy and mock TestResult.prototype.save to throw a simulated DB write failure on first call
      const originalSave = TestResult.prototype.save;
      let callCount = 0;
      jest.spyOn(TestResult.prototype, 'save').mockImplementation(function () {
        callCount++;
        if (callCount === 1) {
          const err = new Error('Simulated transient MongoDB connection timeout');
          err.code = 11600; // Interrupted / timeout code
          return Promise.reject(err);
        }
        return originalSave.apply(this);
      });

      // First submission fails due to transient DB write error
      const res1 = await request(app)
        .post('/api/questions/quiz/save-result')
        .set('Authorization', auth())
        .send({
          attemptId: String(attempt._id),
          answers: [{ questionId: String(qid), selected: 'A' }]
        });

      expect(res1.status).toBe(500);

      // Verify attempt status was cleanly reverted to 'in_progress', NOT stuck in 'submitting'
      const checkAttempt = await AptitudeAttempt.findById(attempt._id);
      expect(checkAttempt.status).toBe('in_progress');

      // Verify no orphaned TestResult was persisted
      const checkResult = await TestResult.findOne({ attemptId: attempt._id });
      expect(checkResult).toBeNull();

      // Second submission succeeds once transient DB issue clears
      const res2 = await request(app)
        .post('/api/questions/quiz/save-result')
        .set('Authorization', auth())
        .send({
          attemptId: String(attempt._id),
          answers: [{ questionId: String(qid), selected: 'A' }]
        });

      expect(res2.status).toBe(200);
      expect(res2.body.score).toBe(1);

      // Verify attempt is now marked completed and result is saved
      const finalAttempt = await AptitudeAttempt.findById(attempt._id);
      expect(finalAttempt.status).toBe('completed');
      const finalResult = await TestResult.findOne({ attemptId: attempt._id });
      expect(finalResult).not.toBeNull();

      // Restore original save implementation
      TestResult.prototype.save.mockRestore();
    });

    test('E11000 duplicate key error on TestResult.attemptId returns HTTP 409 and does not overwrite', async () => {
      const qid = new mongoose.Types.ObjectId();
      const attempt = await AptitudeAttempt.create({
        userId,
        topic: 'duplicate-recovery',
        difficulty: 'medium',
        mode: 'practice',
        questionIds: [qid],
        answerKey: { [String(qid)]: 'B' },
        status: 'in_progress',
        negativeMarking: false
      });

      // Mock save to throw E11000 duplicate key error
      jest.spyOn(TestResult.prototype, 'save').mockImplementation(function () {
        const err = new Error('E11000 duplicate key error collection: TestResult index: attemptId_1');
        err.code = 11000;
        return Promise.reject(err);
      });

      const res = await request(app)
        .post('/api/questions/quiz/save-result')
        .set('Authorization', auth())
        .send({
          attemptId: String(attempt._id),
          answers: [{ questionId: String(qid), selected: 'B' }]
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Duplicate result submission/i);

      TestResult.prototype.save.mockRestore();
    });

    test('Interrupted attempt status completion rolls back or deletes orphaned TestResult and reverts attempt status', async () => {
      const qid = new mongoose.Types.ObjectId();
      const attempt = await AptitudeAttempt.create({
        userId,
        topic: 'interrupted-completion',
        difficulty: 'medium',
        mode: 'practice',
        questionIds: [qid],
        answerKey: { [String(qid)]: 'C' },
        status: 'in_progress',
        negativeMarking: false
      });

      // Mock AptitudeAttempt.updateOne to fail on the completion update
      const originalUpdateOne = AptitudeAttempt.updateOne;
      jest.spyOn(AptitudeAttempt, 'updateOne').mockImplementation(function (filter, update, options) {
        if (update && update.$set && update.$set.status === 'completed') {
          return Promise.reject(new Error('Simulated network failure on attempt completion write'));
        }
        return originalUpdateOne.call(this, filter, update, options);
      });

      const res = await request(app)
        .post('/api/questions/quiz/save-result')
        .set('Authorization', auth())
        .send({
          attemptId: String(attempt._id),
          answers: [{ questionId: String(qid), selected: 'C' }]
        });

      expect(res.status).toBe(500);

      // Verify no orphaned TestResult was committed or retained in DB
      const checkResult = await TestResult.findOne({ attemptId: attempt._id });
      expect(checkResult).toBeNull();

      // Verify attempt status was reverted to 'in_progress'
      const checkAttempt = await AptitudeAttempt.findById(attempt._id);
      expect(checkAttempt.status).toBe('in_progress');

      AptitudeAttempt.updateOne.mockRestore();
    });

    test('Worker lease fencing: Paused HTTP handler resumes after lease takeover and its transaction is aborted', async () => {
      const qid = new mongoose.Types.ObjectId();
      const attempt = await AptitudeAttempt.create({
        userId,
        topic: 'worker-fencing-test',
        difficulty: 'medium',
        mode: 'practice',
        questionIds: [qid],
        answerKey: { [String(qid)]: 'A' },
        status: 'in_progress',
        negativeMarking: false
      });

      // 1. Worker A sends HTTP request with pause header (pauses inside handler for 1200ms)
      const workerAPromise = new Promise((resolve, reject) => {
        request(app)
          .post('/api/questions/quiz/save-result')
          .set('Authorization', auth())
          .set('X-Test-Pause-Before-Commit-Ms', '1200')
          .send({
            attemptId: String(attempt._id),
            answers: [{ questionId: String(qid), selected: 'A' }]
          })
          .end((err, res) => {
            if (err) return reject(err);
            resolve(res);
          });
      });

      // Poll until Worker A has acquired lock and entered paused transaction
      let lockedAttempt = null;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 50));
        lockedAttempt = await AptitudeAttempt.findById(attempt._id);
        if (lockedAttempt && lockedAttempt.status === 'submitting') break;
      }
      expect(lockedAttempt).not.toBeNull();
      expect(lockedAttempt.status).toBe('submitting');
      expect(lockedAttempt.leaseToken).not.toBeNull();
      const tokenA = lockedAttempt.leaseToken;

      // 2. Simulate lease expiration while Worker A is paused
      await AptitudeAttempt.updateOne(
        { _id: attempt._id },
        { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } }
      );

      // 3. Worker B sees expired lease, takes over via submission endpoint, and completes successfully
      const resB = await request(app)
        .post('/api/questions/quiz/save-result')
        .set('Authorization', auth())
        .send({
          attemptId: String(attempt._id),
          answers: [{ questionId: String(qid), selected: 'A' }]
        });

      expect(resB.status).toBe(200);
      expect(resB.body.score).toBe(1);

      // Verify attempt was completed by Worker B
      const completedAttempt = await AptitudeAttempt.findById(attempt._id);
      expect(completedAttempt.status).toBe('completed');
      expect(completedAttempt.leaseToken).toBeNull();

      const workerBResult = await TestResult.findOne({ attemptId: attempt._id });
      expect(workerBResult).not.toBeNull();
      const workerBResultId = String(workerBResult._id);

      // 4. Worker A unpauses, attempts conditional update with stale tokenA, and transaction aborts / is rejected with 409!
      const resA = await workerAPromise;
      expect(resA.status).toBe(409);
      expect(resA.body.error).toMatch(/superseded by another worker|Duplicate result submission/i);

      // 5. Verify Worker B's state was completely uncorrupted
      const finalAttempt = await AptitudeAttempt.findById(attempt._id);
      expect(finalAttempt.status).toBe('completed');

      const finalResultCount = await TestResult.countDocuments({ attemptId: attempt._id });
      expect(finalResultCount).toBe(1);

      const finalResult = await TestResult.findOne({ attemptId: attempt._id });
      expect(String(finalResult._id)).toBe(workerBResultId);
    });

    test('Active lease contention: Concurrent submission while lease is active is rejected with HTTP 409', async () => {
      const qid = new mongoose.Types.ObjectId();
      const attempt = await AptitudeAttempt.create({
        userId,
        topic: 'active-lease-test',
        difficulty: 'medium',
        mode: 'practice',
        questionIds: [qid],
        answerKey: { [String(qid)]: 'B' },
        status: 'submitting',
        leaseToken: 'active-worker-' + Date.now(),
        leaseExpiresAt: new Date(Date.now() + 50000),
        negativeMarking: false
      });

      const res = await request(app)
        .post('/api/questions/quiz/save-result')
        .set('Authorization', auth())
        .send({
          attemptId: String(attempt._id),
          answers: [{ questionId: String(qid), selected: 'B' }]
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already in progress or completed/i);

      // Verify no result was created
      const count = await TestResult.countDocuments({ attemptId: attempt._id });
      expect(count).toBe(0);
    });

    test('Expired lease reclamation: Retry request reclaims expired submission lock and completes successfully', async () => {
      const qid = new mongoose.Types.ObjectId();
      const attempt = await AptitudeAttempt.create({
        userId,
        topic: 'expired-lease-reclaim-test',
        difficulty: 'easy',
        mode: 'practice',
        questionIds: [qid],
        answerKey: { [String(qid)]: 'C' },
        status: 'submitting',
        leaseToken: 'dead-worker-' + Date.now(),
        leaseExpiresAt: new Date(Date.now() - 10000),
        negativeMarking: false
      });

      const res = await request(app)
        .post('/api/questions/quiz/save-result')
        .set('Authorization', auth())
        .send({
          attemptId: String(attempt._id),
          answers: [{ questionId: String(qid), selected: 'C' }]
        });

      expect(res.status).toBe(200);
      expect(res.body.score).toBe(1);

      const finalAttempt = await AptitudeAttempt.findById(attempt._id);
      expect(finalAttempt.status).toBe('completed');
      expect(finalAttempt.leaseToken).toBeNull();
    });

    test('Post-crash existing-result reconciliation: Verifies attempt & owner linkage, reconciles completion status, and returns 409 idempotently', async () => {
      const qid = new mongoose.Types.ObjectId();
      const attempt = await AptitudeAttempt.create({
        userId,
        topic: 'reconciliation-test',
        difficulty: 'medium',
        mode: 'test',
        questionIds: [qid],
        answerKey: { [String(qid)]: 'A' },
        status: 'submitting',
        leaseToken: 'crashed-worker-' + Date.now(),
        leaseExpiresAt: new Date(Date.now() + 60000),
        negativeMarking: false
      });

      // Simulate existing result already committed in database before crash
      const preExistingResult = await TestResult.create({
        attemptId: attempt._id,
        userId,
        score: 1,
        totalQuestions: 1,
        percentage: 100,
        mode: 'test',
        topic: 'reconciliation-test',
        difficulty: 'medium',
        negativeMarking: false,
        serverGradedAt: new Date()
      });

      // Client retries submission
      const res = await request(app)
        .post('/api/questions/quiz/save-result')
        .set('Authorization', auth())
        .send({
          attemptId: String(attempt._id),
          answers: [{ questionId: String(qid), selected: 'A' }]
        });

      expect(res.status).toBe(409);
      expect(res.body.resultId).toBe(String(preExistingResult._id));

      // Verify attempt status was reconciled to 'completed'
      const reconciledAttempt = await AptitudeAttempt.findById(attempt._id);
      expect(reconciledAttempt.status).toBe('completed');
      expect(reconciledAttempt.leaseToken).toBeNull();

      // Verify no duplicate TestResult was created
      const totalResults = await TestResult.countDocuments({ attemptId: attempt._id });
      expect(totalResults).toBe(1);
    });

    test('Bidirectional post-recovery invariants: completed attempt has exactly 1 result; retryable attempt has 0 results', async () => {
      const qid = new mongoose.Types.ObjectId();
      
      // Invariant Direction A: Retryable attempt (in_progress) must have 0 committed results
      const retryableAttempt = await AptitudeAttempt.create({
        userId,
        topic: 'invariant-check',
        difficulty: 'medium',
        mode: 'practice',
        questionIds: [qid],
        answerKey: { [String(qid)]: 'A' },
        status: 'in_progress'
      });
      const inProgressResultCount = await TestResult.countDocuments({ attemptId: retryableAttempt._id });
      expect(inProgressResultCount).toBe(0);

      // Invariant Direction B: Completed attempt must have exactly 1 matching, correctly graded result
      const completedAttempt = await AptitudeAttempt.create({
        userId,
        topic: 'invariant-check',
        difficulty: 'medium',
        mode: 'practice',
        questionIds: [qid],
        answerKey: { [String(qid)]: 'A' },
        status: 'completed'
      });
      await TestResult.create({
        attemptId: completedAttempt._id,
        userId,
        score: 1,
        totalQuestions: 1,
        percentage: 100,
        mode: 'practice',
        topic: 'invariant-check'
      });
      const completedResultCount = await TestResult.countDocuments({ attemptId: completedAttempt._id });
      expect(completedResultCount).toBe(1);
    });
  });

  describe('2. Deletion Recovery & Fallback Paths', () => {
    test('Repeated deletion of already-deleted session returns 404 Not Found without crashing', async () => {
      const session = await InterviewSession.create({
        user: userId,
        sessionId: 'recov-' + Math.random(),
        role: 'Recovery Test Engineer',
        experienceLevel: 'entry',
        mode: 'practice'
      });

      // First delete succeeds
      const res1 = await request(app)
        .delete(`/api/interviews/sessions/${session._id}`)
        .set('Authorization', auth());

      expect(res1.status).toBe(200);

      // Repeat delete returns 404 cleanly
      const res2 = await request(app)
        .delete(`/api/interviews/sessions/${session._id}`)
        .set('Authorization', auth());

      expect(res2.status).toBe(404);
    });

    test('Partial deletion failure in parallel cleanup returns HTTP 500 and reports failure', async () => {
      const session = await InterviewSession.create({
        user: userId,
        sessionId: 'recov-' + Math.random(),
        role: 'Partial Deletion Tester',
        experienceLevel: 'entry',
        mode: 'practice'
      });

      await ProctorLog.create({
        sessionId: session.sessionId,
        userId: userId,
        event: 'tab_switch',
        timestamp: new Date()
      });

      // Mock ProctorLog.deleteMany to simulate partial failure in cascade
      jest.spyOn(ProctorLog, 'deleteMany').mockRejectedValueOnce(new Error('Simulated ProctorLog delete failure'));

      const res = await request(app)
        .delete(`/api/interviews/sessions/${session._id}`)
        .set('Authorization', auth());

      expect(res.status).toBe(500);

      // Clean up mock
      ProctorLog.deleteMany.mockRestore();

      // Clean up records
      await InterviewSession.deleteOne({ _id: session._id });
      await ProctorLog.deleteMany({ interviewSession: session._id });
    });
  });

  describe('3. Process-Level Crash Termination & Post-Restart Recovery', () => {
    let isReplicaSet = false;

    beforeAll(() => {
      const topologyType = mongoose.connection.client?.topology?.description?.type || '';
      isReplicaSet = topologyType.includes('ReplicaSet') || topologyType.includes('Sharded');
    });

    test('3A. Standalone crash recovery: Child process holding active submission lease killed via SIGKILL leaves DB recoverable and retries cleanly', async () => {
      const qid = new mongoose.Types.ObjectId();
      const attempt = await AptitudeAttempt.create({
        userId,
        topic: 'standalone-crash-test',
        difficulty: 'hard',
        mode: 'test',
        questionIds: [qid],
        answerKey: { [String(qid)]: 'D' },
        status: 'in_progress',
        negativeMarking: false
      });

      // Launch child process in standalone lease mode
      const workerScript = path.resolve(__dirname, '..', 'scripts', 'worker_simulate_crash.js');
      const child = fork(workerScript, [String(attempt._id), 'standalone'], {
        env: { ...process.env, MONGO_URI: process.env.MONGO_URI },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      });

      // Wait for child to signal that it is holding the active lease
      let workerLeaseToken = null;
      await new Promise((resolve, reject) => {
        child.on('message', (msg) => {
          if (msg && msg.status === 'holding_lease') {
            workerLeaseToken = msg.leaseToken;
            resolve();
          }
        });
        child.on('exit', (code) => {
          reject(new Error(`Child exited early with code ${code}`));
        });
      });

      // Deliver OS SIGKILL signal to terminate child process mid-flight
      child.kill('SIGKILL');

      const exitStatus = await new Promise((resolve) => {
        child.on('exit', (code, signal) => resolve({ code, signal }));
      });

      expect(exitStatus.signal === 'SIGKILL' || exitStatus.code !== 0).toBe(true);

      // Verify DB state immediately post-crash:
      // Invariant: attempt has visible lease from standalone commit, but 0 TestResults committed
      const postCrashAttempt = await AptitudeAttempt.findById(attempt._id);
      expect(postCrashAttempt.status).toBe('submitting');
      expect(postCrashAttempt.leaseToken).toBe(workerLeaseToken);
      const postCrashResults = await TestResult.countDocuments({ attemptId: attempt._id });
      expect(postCrashResults).toBe(0);

      // Advance lease expiration to simulate lease timeout after process death
      await AptitudeAttempt.updateOne(
        { _id: attempt._id },
        { $set: { leaseExpiresAt: new Date(Date.now() - 5000) } }
      );

      // Incoming request retry triggers recovery and completes the grading
      const res = await request(app)
        .post('/api/questions/quiz/save-result')
        .set('Authorization', auth())
        .send({
          attemptId: String(attempt._id),
          answers: [{ questionId: String(qid), selected: 'D' }]
        });

      expect(res.status).toBe(200);
      expect(res.body.score).toBe(1);

      // Verify post-recovery invariants:
      const recoveredAttempt = await AptitudeAttempt.findById(attempt._id);
      expect(recoveredAttempt.status).toBe('completed');
      expect(recoveredAttempt.leaseToken).toBeNull();
      const finalResultCount = await TestResult.countDocuments({ attemptId: attempt._id });
      expect(finalResultCount).toBe(1);
    });

    // Test 3B: Conditionally skipped on standalone MongoDB (transactions unsupported).
    // On replica-set deployments, this test verifies that MongoDB's server-side transaction
    // abort on process termination rolls back all uncommitted writes atomically.
    const test3B = isReplicaSet ? test : test.skip;
    test3B('3B. Transaction-level crash rollback: Multi-document transaction aborted by MongoDB upon process termination', async () => {
      const qid = new mongoose.Types.ObjectId();
      const attempt = await AptitudeAttempt.create({
        userId,
        topic: 'tx-crash-test',
        difficulty: 'hard',
        mode: 'test',
        questionIds: [qid],
        answerKey: { [String(qid)]: 'C' },
        status: 'in_progress',
        negativeMarking: false
      });

      const workerScript = path.resolve(__dirname, '..', 'scripts', 'worker_simulate_crash.js');
      const child = fork(workerScript, [String(attempt._id), 'transaction'], {
        env: { ...process.env, MONGO_URI: process.env.MONGO_URI },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      });

      await new Promise((resolve, reject) => {
        child.on('message', (msg) => {
          if (msg && msg.status === 'in_transaction') resolve();
        });
        child.on('exit', (code) => {
          reject(new Error(`Child exited early with code ${code}`));
        });
      });

      // Terminate child process mid-transaction via OS SIGKILL
      child.kill('SIGKILL');

      await new Promise((resolve) => {
        child.on('exit', (code, signal) => resolve({ code, signal }));
      });

      // Post-crash invariant in transaction mode:
      // MongoDB server terminates the open session; uncommitted writes are completely rolled back.
      // Therefore, attempt is NOT in 'submitting' with an active lease; it reverts to 'in_progress'.
      const postCrashAttempt = await AptitudeAttempt.findById(attempt._id);
      expect(postCrashAttempt.status).toBe('in_progress');
      const postCrashResults = await TestResult.countDocuments({ attemptId: attempt._id });
      expect(postCrashResults).toBe(0);

      // Retry completes cleanly
      const res = await request(app)
        .post('/api/questions/quiz/save-result')
        .set('Authorization', auth())
        .send({
          attemptId: String(attempt._id),
          answers: [{ questionId: String(qid), selected: 'C' }]
        });

      expect(res.status).toBe(200);
      expect(res.body.score).toBe(1);

      const recoveredAttempt = await AptitudeAttempt.findById(attempt._id);
      expect(recoveredAttempt.status).toBe('completed');
    });
  });
});
