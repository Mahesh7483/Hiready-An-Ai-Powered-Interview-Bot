'use strict';
process.env.NODE_ENV = 'test';
/**
 * 3-Arm Comparative Contribution Evaluation Harness (Multi-Run Paired Execution)
 * 
 * Research Question:
 * "Does the module-specific report contract detect cross-component integrity failures
 *  that a reasonable component-level validation approach misses?"
 * 
 * Evaluated Arms:
 * 1. Arm 1: Schema / Type Validation Only
 *    - Pure syntactic baseline validating payload types and required fields in memory.
 * 
 * 2. Arm 2: Current Practical Baseline Controller
 *    - Executes live baseline Express controller endpoints (/api/questions/quiz/save-result-baseline)
 *      with all standard application security checks (auth, user ownership, attempt existence,
 *      snapshot answer key grading, negative marking).
 *    - Crucial architectural difference: Lacks worker lease token fencing on completion writes.
 *    - On RC-02 (delayed worker resuming after lease takeover), unconditioned completion writes
 *      allow Worker A to overwrite Worker B's completion write without detection (defective state).
 * 
 * 3. Arm 3: Existing Checks + Contract-Driven Multi-Tier Invariants
 *    - Executes live contract Express controller endpoints (/api/questions/quiz/save-result).
 *    - Enforces full multi-tier invariants: dedicated worker lease tokens (leaseToken),
 *      CAS conditional completion writes ({ _id, leaseToken: currentLeaseToken }),
 *      atomic cascade cleanup, and bidirectional recovery invariants.
 *    - On RC-02, Worker A's write conditions on stale tokenA, matches 0 documents, and returns HTTP 409,
 *      preserving Worker B's state completely uncorrupted.
 * 
 * Rigorous Timing Methodology:
 * - Timers (process.hrtime.bigint()) isolate strictly the request execution duration (excluding DB setup).
 * - Paired repeated measurements (3 repetitions per case) compute statistically sound latencies.
 * - Explicitly measures contract overhead (Arm 3 latency - Arm 2 latency), demonstrating the non-negative
 *   computational cost of formal invariant enforcement.
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

const app = require('../server');
const AptitudeAttempt = require('../models/AptitudeAttempt');
const TestResult = require('../models/TestResult');
const InterviewSession = require('../models/InterviewSession');
const ProctorLog = require('../models/ProctorLog');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hiready-test';
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci';

// --- Arm 1 Schema / Type Validator Helpers ---
function validateAptitudeSubmissionSchema(payload) {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'Payload must be an object' };
  if (!payload.attemptId || typeof payload.attemptId !== 'string') return { valid: false, error: 'Invalid attemptId' };
  if (!/^[a-fA-F0-9]{24}$/.test(payload.attemptId)) return { valid: false, error: 'attemptId is not a valid ObjectId' };
  if (!Array.isArray(payload.answers)) return { valid: false, error: 'answers must be an array' };
  for (const ans of payload.answers) {
    if (!ans || typeof ans !== 'object') return { valid: false, error: 'answer item must be an object' };
    if (!ans.questionId || typeof ans.questionId !== 'string') return { valid: false, error: 'Invalid questionId' };
    if (!/^[a-fA-F0-9]{24}$/.test(ans.questionId)) return { valid: false, error: 'questionId is not an ObjectId' };
  }
  return { valid: true };
}

function validateSessionDeletionSchema(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return { valid: false, error: 'Invalid sessionId' };
  if (!/^[a-fA-F0-9]{24}$/.test(sessionId)) return { valid: false, error: 'sessionId is not a valid ObjectId' };
  return { valid: true };
}

function validateCodeExecutionSchema(payload) {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'Payload must be an object' };
  if (!payload.code || typeof payload.code !== 'string') return { valid: false, error: 'code must be a non-empty string' };
  if (!payload.language || typeof payload.language !== 'string') return { valid: false, error: 'language must be a string' };
  return { valid: true };
}

// --- Benchmark Cases Definition with Independent Ground Truth ---
const BENCHMARK_CASES = [
  // --- Fault-Free Controls (3 cases) ---
  {
    id: 'FF-01',
    name: 'Valid Aptitude Submission',
    class: 'fault_free',
    groundTruth: {
      defectDescription: 'None (benign valid submission matching server-locked attempt)',
      intendedOperation: 'POST /api/questions/quiz/save-result',
      expectedOutcome: 'ACCEPT',
      expectedHttpCode: 200,
      expectedDbPostCondition: 'AptitudeAttempt.status === "completed" AND exactly 1 matching TestResult created',
      recoveryPolicy: 'N/A'
    }
  },
  {
    id: 'FF-02',
    name: 'Valid Session Deletion & Cascade',
    class: 'fault_free',
    groundTruth: {
      defectDescription: 'None (authorized session deletion with associated proctor logs)',
      intendedOperation: 'DELETE /api/interviews/sessions/:id',
      expectedOutcome: 'ACCEPT',
      expectedHttpCode: 200,
      expectedDbPostCondition: 'InterviewSession and all associated ProctorLog records deleted',
      recoveryPolicy: 'N/A'
    }
  },
  {
    id: 'FF-03',
    name: 'Valid Sandboxed Code Execution',
    class: 'fault_free',
    groundTruth: {
      defectDescription: 'None (standard execution within resource boundaries)',
      intendedOperation: 'POST /api/code/execute',
      expectedOutcome: 'ACCEPT',
      expectedHttpCode: 200,
      expectedDbPostCondition: 'Zero host contamination; clean execution result returned',
      recoveryPolicy: 'N/A'
    }
  },

  // --- Canonical Faults (6 cases) ---
  {
    id: 'CF-01',
    name: 'Forged Grades (Client Score Injection)',
    class: 'canonical_fault',
    groundTruth: {
      defectDescription: 'Client submits empty answers but asserts { score: 10, total: 10 } in payload',
      intendedOperation: 'POST /api/questions/quiz/save-result',
      expectedOutcome: 'REJECT',
      expectedHttpCode: 400,
      expectedDbPostCondition: 'Zero TestResult records created; Attempt status remains "in_progress"',
      recoveryPolicy: 'N/A'
    }
  },
  {
    id: 'CF-02',
    name: 'Mismatched Ownership (Cross-User Access)',
    class: 'canonical_fault',
    groundTruth: {
      defectDescription: 'User B attempts to grade or delete User A resource',
      intendedOperation: 'POST /api/questions/quiz/save-result',
      expectedOutcome: 'REJECT',
      expectedHttpCode: 403,
      expectedDbPostCondition: 'User A attempt unchanged; zero results saved by User B',
      recoveryPolicy: 'N/A'
    }
  },
  {
    id: 'CF-03',
    name: 'Configuration Tampering (Key Version Drift)',
    class: 'canonical_fault',
    groundTruth: {
      defectDescription: 'Attempt locked with snapshot answerKey; payload evaluated with server snapshot vs mutated bank',
      intendedOperation: 'POST /api/questions/quiz/save-result',
      expectedOutcome: 'DETECT',
      expectedHttpCode: 200,
      expectedDbPostCondition: 'Score computed strictly using locked snapshot key, not mutated DB question',
      recoveryPolicy: 'N/A'
    }
  },
  {
    id: 'CF-04',
    name: 'Foreign / Duplicate Question ID Injection',
    class: 'canonical_fault',
    groundTruth: {
      defectDescription: 'Payload contains foreign questionId or duplicate question IDs',
      intendedOperation: 'POST /api/questions/quiz/save-result',
      expectedOutcome: 'REJECT',
      expectedHttpCode: 400,
      expectedDbPostCondition: 'Zero TestResult records saved; attempt remains "in_progress"',
      recoveryPolicy: 'N/A'
    }
  },
  {
    id: 'CF-05',
    name: 'Incomplete Deletion (Orphaned Proctor Logs)',
    class: 'canonical_fault',
    groundTruth: {
      defectDescription: 'Deleting interview session must cascade to purge sensitive proctor logs',
      intendedOperation: 'DELETE /api/interviews/sessions/:id',
      expectedOutcome: 'DETECT',
      expectedHttpCode: 200,
      expectedDbPostCondition: 'ProctorLog.countDocuments === 0 (no orphaned webcam frames)',
      recoveryPolicy: 'N/A'
    }
  },
  {
    id: 'CF-06',
    name: 'Interrupted Submission Write Failure',
    class: 'canonical_fault',
    groundTruth: {
      defectDescription: 'Transient DB failure on completion write during submission',
      intendedOperation: 'POST /api/questions/quiz/save-result',
      expectedOutcome: 'REJECT',
      expectedHttpCode: 500,
      expectedDbPostCondition: 'Rollback cleans up: zero orphaned TestResults, status reverted to "in_progress"',
      recoveryPolicy: 'Request-triggered retry reconciliation'
    }
  },

  // --- Pilot Regression Cases (3 cases) ---
  {
    id: 'RC-01',
    name: 'Stale / Expired Attempt Submission',
    class: 'regression_case',
    groundTruth: {
      defectDescription: 'Valid payload structure, but attempt timestamp exceeds server expiration deadline',
      intendedOperation: 'POST /api/questions/quiz/save-result',
      expectedOutcome: 'REJECT',
      expectedHttpCode: 400,
      expectedDbPostCondition: 'Attempt rejected as expired; zero TestResults saved',
      recoveryPolicy: 'N/A'
    }
  },
  {
    id: 'RC-02',
    name: 'Delayed Worker Resuming After Lease Expiry',
    class: 'regression_case',
    groundTruth: {
      defectDescription: 'Worker A pauses > lease timeout; Worker B takes over; Worker A resumes and attempts commit',
      intendedOperation: 'POST /api/questions/quiz/save-result (Worker A resumption)',
      expectedOutcome: 'REJECT',
      expectedHttpCode: 409,
      expectedDbPostCondition: 'Worker A rejected via lease fencing; Worker B result intact; attempt status "completed"',
      recoveryPolicy: 'Fencing token invalidation'
    }
  },
  {
    id: 'RC-03',
    name: 'Omitted Answer Denominator Manipulation',
    class: 'regression_case',
    groundTruth: {
      defectDescription: 'Submitting 2 of 10 answers claiming total=2 to artificially inflate percentage to 100%',
      intendedOperation: 'POST /api/questions/quiz/save-result',
      expectedOutcome: 'DETECT',
      expectedHttpCode: 200,
      expectedDbPostCondition: 'Percentage calculated strictly as 2/10 = 20%, NOT 2/2 = 100%',
      recoveryPolicy: 'N/A'
    }
  }
];

const NUM_ROUNDS = 3; // 3 repeated paired executions per case to establish empirical latencies

async function runEvaluation() {
  console.log('================================================================================');
  console.log('HIREady: 3-Arm Comparative Contribution Evaluation Harness');
  console.log('Research Question: Does the module contract detect cross-component failures?');
  console.log(`Executing ${NUM_ROUNDS} repeated paired rounds with isolated HTTP request timing`);
  console.log('================================================================================\n');

  if (mongoose.connection.readyState !== 1) {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
  }
  await TestResult.syncIndexes();

  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const tokenA = jwt.sign({ id: String(userA) }, JWT_SECRET, { expiresIn: '1h' });
  const tokenB = jwt.sign({ id: String(userB) }, JWT_SECRET, { expiresIn: '1h' });
  const authA = `Bearer ${tokenA}`;
  const authB = `Bearer ${tokenB}`;

  const caseSummary = new Map();
  for (const tc of BENCHMARK_CASES) {
    caseSummary.set(tc.id, {
      arm1Latencies: [],
      arm2Latencies: [],
      arm3Latencies: [],
      rounds: [],
      arm1Outcome: null,
      arm2Outcome: null,
      arm3Outcome: null,
      arm3DbPostConditionSatisfied: false
    });
  }

  // Warmup cycle to equalize V8 JIT optimization across both controllers before taking timing measurements
  const warmupQid = new mongoose.Types.ObjectId();
  const warmupAttempt1 = await AptitudeAttempt.create({ userId: userA, questionIds: [warmupQid], answerKey: { [String(warmupQid)]: 'A' }, status: 'in_progress', mode: 'practice' });
  await request(app).post('/api/questions/quiz/save-result-baseline').set('Authorization', authA).send({ attemptId: String(warmupAttempt1._id), answers: [{ questionId: String(warmupQid), selected: 'A' }] });
  const warmupAttempt2 = await AptitudeAttempt.create({ userId: userA, questionIds: [warmupQid], answerKey: { [String(warmupQid)]: 'A' }, status: 'in_progress', mode: 'practice' });
  await request(app).post('/api/questions/quiz/save-result').set('Authorization', authA).send({ attemptId: String(warmupAttempt2._id), answers: [{ questionId: String(warmupQid), selected: 'A' }] });
  await AptitudeAttempt.deleteMany({ userId: userA });
  await TestResult.deleteMany({ userId: userA });

  for (let round = 0; round < NUM_ROUNDS; round++) {
    for (const tc of BENCHMARK_CASES) {
      const qid1 = new mongoose.Types.ObjectId();
      const qid2 = new mongoose.Types.ObjectId();
      const qids = [qid1, qid2];
      const answerKey = { [String(qid1)]: 'A', [String(qid2)]: 'B' };

      // --- Arm 1 Evaluation ---
      let arm1Outcome = null;
      let arm1Ms = 0;
      {
        const t0 = process.hrtime.bigint();
        if (tc.id === 'FF-01') {
          const check = validateAptitudeSubmissionSchema({ attemptId: String(new mongoose.Types.ObjectId()), answers: [{ questionId: String(qid1), selected: 'A' }] });
          arm1Outcome = check.valid ? 'ACCEPT' : 'REJECT';
        } else if (tc.id === 'FF-02') {
          const check = validateSessionDeletionSchema(String(new mongoose.Types.ObjectId()));
          arm1Outcome = check.valid ? 'ACCEPT' : 'REJECT';
        } else if (tc.id === 'FF-03') {
          const check = validateCodeExecutionSchema({ language: 'javascript', code: 'console.log("ok");' });
          arm1Outcome = check.valid ? 'ACCEPT' : 'REJECT';
        } else if (tc.id === 'CF-01') {
          const check = validateAptitudeSubmissionSchema({ attemptId: String(new mongoose.Types.ObjectId()), answers: [], score: 10, total: 10 });
          arm1Outcome = check.valid ? 'ACCEPT' : 'REJECT'; // Schema allows empty array -> Missed
        } else if (tc.id === 'CF-02') {
          const check = validateAptitudeSubmissionSchema({ attemptId: String(new mongoose.Types.ObjectId()), answers: [{ questionId: String(qid1), selected: 'A' }] });
          arm1Outcome = check.valid ? 'ACCEPT' : 'REJECT'; // Missed
        } else if (tc.id === 'CF-03') {
          arm1Outcome = 'ACCEPT'; // Missed
        } else if (tc.id === 'CF-04') {
          const check = validateAptitudeSubmissionSchema({ attemptId: String(new mongoose.Types.ObjectId()), answers: [{ questionId: String(new mongoose.Types.ObjectId()), selected: 'A' }] });
          arm1Outcome = check.valid ? 'ACCEPT' : 'REJECT'; // Missed
        } else if (tc.id === 'CF-05') {
          const check = validateSessionDeletionSchema(String(new mongoose.Types.ObjectId()));
          arm1Outcome = check.valid ? 'ACCEPT' : 'REJECT'; // Missed
        } else if (tc.id === 'CF-06') {
          arm1Outcome = 'ACCEPT'; // Missed
        } else if (tc.id === 'RC-01') {
          arm1Outcome = 'ACCEPT'; // Missed
        } else if (tc.id === 'RC-02') {
          arm1Outcome = 'ACCEPT'; // Missed
        } else if (tc.id === 'RC-03') {
          const check = validateAptitudeSubmissionSchema({ attemptId: String(new mongoose.Types.ObjectId()), answers: [{ questionId: String(qid1), selected: 'A' }] });
          arm1Outcome = check.valid ? 'ACCEPT' : 'REJECT'; // Missed
        }
        const t1 = process.hrtime.bigint();
        arm1Ms = Number(t1 - t0) / 1e6;
      }

      // --- Arm 2: Baseline Controller Execution ---
      // Reset DB collections
      await AptitudeAttempt.deleteMany({ userId: { $in: [userA, userB] } });
      await TestResult.deleteMany({ userId: { $in: [userA, userB] } });
      await InterviewSession.deleteMany({ user: { $in: [userA, userB] } });
      await ProctorLog.deleteMany({ userId: { $in: [userA, userB] } });

      let arm2Outcome = null;
      let arm2Ms = 0;
      {
        if (tc.id === 'FF-01') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result-baseline').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });
          const t1 = process.hrtime.bigint();
          arm2Ms = Number(t1 - t0) / 1e6;
          arm2Outcome = res.status === 200 ? 'ACCEPT' : 'REJECT';
        } else if (tc.id === 'FF-02') {
          const sessionIdStr = 'sess-' + crypto.randomUUID();
          const session = await InterviewSession.create({ user: userA, sessionId: sessionIdStr, role: 'Full Stack', experienceLevel: 'junior', status: 'completed' });
          await ProctorLog.create({ sessionId: sessionIdStr, userId: userA, event: 'tab_switch', timestamp: new Date() });
          const t0 = process.hrtime.bigint();
          const res = await request(app).delete(`/api/interviews/sessions/${session._id}`).set('Authorization', authA);
          const t1 = process.hrtime.bigint();
          arm2Ms = Number(t1 - t0) / 1e6;
          arm2Outcome = res.status === 200 ? 'ACCEPT' : 'REJECT';
        } else if (tc.id === 'FF-03') {
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/code/execute').set('Authorization', authA).send({ language: 'javascript', code: 'console.log("ok");' });
          const t1 = process.hrtime.bigint();
          arm2Ms = Number(t1 - t0) / 1e6;
          arm2Outcome = res.status === 200 ? 'ACCEPT' : 'REJECT';
        } else if (tc.id === 'CF-01') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result-baseline').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [], score: 10, total: 10 });
          const t1 = process.hrtime.bigint();
          arm2Ms = Number(t1 - t0) / 1e6;
          arm2Outcome = res.status === 400 ? 'REJECT' : 'ACCEPT';
        } else if (tc.id === 'CF-02') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result-baseline').set('Authorization', authB).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });
          const t1 = process.hrtime.bigint();
          arm2Ms = Number(t1 - t0) / 1e6;
          arm2Outcome = res.status === 403 ? 'REJECT' : 'ACCEPT';
        } else if (tc.id === 'CF-03') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: [qid1], answerKey: { [String(qid1)]: 'A' }, status: 'in_progress', mode: 'practice' });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result-baseline').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });
          const t1 = process.hrtime.bigint();
          arm2Ms = Number(t1 - t0) / 1e6;
          arm2Outcome = res.status === 200 && res.body.score === 1 ? 'DETECT' : 'REJECT';
        } else if (tc.id === 'CF-04') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });
          const foreignQid = new mongoose.Types.ObjectId();
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result-baseline').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(foreignQid), selected: 'A' }] });
          const t1 = process.hrtime.bigint();
          arm2Ms = Number(t1 - t0) / 1e6;
          arm2Outcome = res.status === 400 ? 'REJECT' : 'ACCEPT';
        } else if (tc.id === 'CF-05') {
          const sessionIdStr = 'sess-' + crypto.randomUUID();
          const session = await InterviewSession.create({ user: userA, sessionId: sessionIdStr, role: 'Backend', experienceLevel: 'junior', status: 'completed' });
          await ProctorLog.create({ sessionId: sessionIdStr, userId: userA, event: 'face_not_detected', timestamp: new Date() });
          const t0 = process.hrtime.bigint();
          const res = await request(app).delete(`/api/interviews/sessions/${session._id}`).set('Authorization', authA);
          const remainingLogs = await ProctorLog.countDocuments({ sessionId: sessionIdStr });
          const t1 = process.hrtime.bigint();
          arm2Ms = Number(t1 - t0) / 1e6;
          arm2Outcome = res.status === 200 && remainingLogs === 0 ? 'DETECT' : 'REJECT';
        } else if (tc.id === 'CF-06') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });
          const originalUpdateOne = AptitudeAttempt.updateOne;
          AptitudeAttempt.updateOne = function (filter, update, options) {
            if (update && update.$set && update.$set.status === 'completed') {
              return Promise.reject(new Error('Simulated transient DB error'));
            }
            return originalUpdateOne.call(this, filter, update, options);
          };
          try {
            const t0 = process.hrtime.bigint();
            const res = await request(app).post('/api/questions/quiz/save-result-baseline').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });
            const t1 = process.hrtime.bigint();
            arm2Ms = Number(t1 - t0) / 1e6;
            // Score by DB post-condition, not just HTTP status:
            // Detection requires BOTH error response AND proper state recovery
            const postAttempt = await AptitudeAttempt.findById(attempt._id);
            const postResults = await TestResult.countDocuments({ attemptId: attempt._id });
            const stateRecovered = postAttempt.status === 'in_progress' && postResults === 0;
            arm2Outcome = (res.status === 500 && stateRecovered) ? 'REJECT' : 'ACCEPT';
          } finally {
            AptitudeAttempt.updateOne = originalUpdateOne;
          }
        } else if (tc.id === 'RC-01') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice', expiresAt: new Date(Date.now() - 30000) });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result-baseline').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });
          const t1 = process.hrtime.bigint();
          arm2Ms = Number(t1 - t0) / 1e6;
          arm2Outcome = res.status === 400 ? 'REJECT' : 'ACCEPT';
        } else if (tc.id === 'RC-02') {
          // Delayed Worker Resumption in Baseline (Live HTTP request to baseline controller with pause header)
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });

          const t0 = process.hrtime.bigint();
          // Worker A starts request to baseline handler with 500ms pause, submitting wrong answer 'B' (score 0)
          const workerAPromise = new Promise((resolve, reject) => {
            request(app)
              .post('/api/questions/quiz/save-result-baseline')
              .set('Authorization', authA)
              .set('X-Test-Pause-Before-Commit-Ms', '500')
              .send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'B' }] })
              .end((err, res) => (err ? reject(err) : resolve(res)));
          });

          // Poll until Worker A has acquired lock and entered pause
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 20));
            const cur = await AptitudeAttempt.findById(attempt._id);
            if (cur && cur.status === 'submitting') break;
          }

          // Simulate lease timeout while Worker A is paused
          await AptitudeAttempt.updateOne(
            { _id: attempt._id },
            { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } }
          );

          // Worker B takes over expired lease and completes with correct answer 'A' (score 1)
          const resB = await request(app)
            .post('/api/questions/quiz/save-result-baseline')
            .set('Authorization', authA)
            .send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });

          // Worker A unpauses and completes without lease fencing
          const resA = await workerAPromise;
          const t1 = process.hrtime.bigint();
          arm2Ms = Number(t1 - t0) / 1e6;

          // In baseline, Worker A succeeds without lease fencing and overwrites Worker B's score in DB!
          const finalAttempt = await AptitudeAttempt.findById(attempt._id);
          const finalResult = await TestResult.findOne({ attemptId: attempt._id });
          // Overwrite is proven: finalResult.score === 0 (Worker A overwrote Worker B's score 1)
          const defectFenced = (resA.status === 409 && finalResult && finalResult.score === 1);
          arm2Outcome = defectFenced ? 'REJECT' : 'ACCEPT'; // false -> ACCEPT (Defect Missed!)
        } else if (tc.id === 'RC-03') {
          const tenQids = [qid1, qid2, ...Array.from({ length: 8 }, () => new mongoose.Types.ObjectId())];
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: tenQids, answerKey, status: 'in_progress', mode: 'practice' });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result-baseline').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }, { questionId: String(qid2), selected: 'B' }], totalQuestions: 2 });
          const t1 = process.hrtime.bigint();
          arm2Ms = Number(t1 - t0) / 1e6;
          arm2Outcome = res.status === 200 && res.body.percentage === 20 ? 'DETECT' : 'REJECT';
        }
      }

      // --- Arm 3: Contract Controller Execution ---
      // Reset DB collections
      await AptitudeAttempt.deleteMany({ userId: { $in: [userA, userB] } });
      await TestResult.deleteMany({ userId: { $in: [userA, userB] } });
      await InterviewSession.deleteMany({ user: { $in: [userA, userB] } });
      await ProctorLog.deleteMany({ userId: { $in: [userA, userB] } });

      let arm3Outcome = null;
      let arm3Ms = 0;
      let dbPostConditionSatisfied = false;
      {
        if (tc.id === 'FF-01') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });
          const t1 = process.hrtime.bigint();
          arm3Ms = Number(t1 - t0) / 1e6;
          arm3Outcome = res.status === 200 ? 'ACCEPT' : 'REJECT';
          const postAttempt = await AptitudeAttempt.findById(attempt._id);
          const postResult = await TestResult.findOne({ attemptId: attempt._id });
          dbPostConditionSatisfied = postAttempt && postAttempt.status === 'completed' && postResult !== null;
        } else if (tc.id === 'FF-02') {
          const sessionIdStr = 'sess-' + crypto.randomUUID();
          const session = await InterviewSession.create({ user: userA, sessionId: sessionIdStr, role: 'Full Stack', experienceLevel: 'junior', status: 'completed' });
          await ProctorLog.create({ sessionId: sessionIdStr, userId: userA, event: 'tab_switch', timestamp: new Date() });
          const t0 = process.hrtime.bigint();
          const res = await request(app).delete(`/api/interviews/sessions/${session._id}`).set('Authorization', authA);
          const t1 = process.hrtime.bigint();
          arm3Ms = Number(t1 - t0) / 1e6;
          arm3Outcome = res.status === 200 ? 'ACCEPT' : 'REJECT';
          const sCount = await InterviewSession.countDocuments({ _id: session._id });
          const pCount = await ProctorLog.countDocuments({ sessionId: sessionIdStr });
          dbPostConditionSatisfied = sCount === 0 && pCount === 0;
        } else if (tc.id === 'FF-03') {
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/code/execute').set('Authorization', authA).send({ language: 'javascript', code: 'console.log("contract clean");' });
          const t1 = process.hrtime.bigint();
          arm3Ms = Number(t1 - t0) / 1e6;
          arm3Outcome = res.status === 200 ? 'ACCEPT' : 'REJECT';
          dbPostConditionSatisfied = res.status === 200;
        } else if (tc.id === 'CF-01') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [], score: 10, total: 10 });
          const t1 = process.hrtime.bigint();
          arm3Ms = Number(t1 - t0) / 1e6;
          arm3Outcome = res.status === 400 ? 'REJECT' : 'ACCEPT';
          const postAttempt = await AptitudeAttempt.findById(attempt._id);
          const postResults = await TestResult.countDocuments({ attemptId: attempt._id });
          dbPostConditionSatisfied = postAttempt.status === 'in_progress' && postResults === 0;
        } else if (tc.id === 'CF-02') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result').set('Authorization', authB).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });
          const t1 = process.hrtime.bigint();
          arm3Ms = Number(t1 - t0) / 1e6;
          arm3Outcome = res.status === 403 ? 'REJECT' : 'ACCEPT';
          const postAttempt = await AptitudeAttempt.findById(attempt._id);
          const postResults = await TestResult.countDocuments({ attemptId: attempt._id });
          dbPostConditionSatisfied = postAttempt.status === 'in_progress' && postResults === 0;
        } else if (tc.id === 'CF-03') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: [qid1], answerKey: { [String(qid1)]: 'A' }, status: 'in_progress', mode: 'practice' });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });
          const t1 = process.hrtime.bigint();
          arm3Ms = Number(t1 - t0) / 1e6;
          arm3Outcome = res.status === 200 && res.body.score === 1 ? 'DETECT' : 'REJECT';
          dbPostConditionSatisfied = res.body.score === 1;
        } else if (tc.id === 'CF-04') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });
          const foreignQid = new mongoose.Types.ObjectId();
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(foreignQid), selected: 'A' }] });
          const t1 = process.hrtime.bigint();
          arm3Ms = Number(t1 - t0) / 1e6;
          arm3Outcome = res.status === 400 ? 'REJECT' : 'ACCEPT';
          const postResults = await TestResult.countDocuments({ attemptId: attempt._id });
          dbPostConditionSatisfied = postResults === 0;
        } else if (tc.id === 'CF-05') {
          const sessionIdStr = 'sess-' + crypto.randomUUID();
          const session = await InterviewSession.create({ user: userA, sessionId: sessionIdStr, role: 'Backend', experienceLevel: 'junior', status: 'completed' });
          await ProctorLog.create({ sessionId: sessionIdStr, userId: userA, event: 'face_not_detected', timestamp: new Date() });
          const t0 = process.hrtime.bigint();
          const res = await request(app).delete(`/api/interviews/sessions/${session._id}`).set('Authorization', authA);
          const remainingLogs = await ProctorLog.countDocuments({ sessionId: sessionIdStr });
          const t1 = process.hrtime.bigint();
          arm3Ms = Number(t1 - t0) / 1e6;
          arm3Outcome = res.status === 200 && remainingLogs === 0 ? 'DETECT' : 'REJECT';
          dbPostConditionSatisfied = remainingLogs === 0;
        } else if (tc.id === 'CF-06') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });
          const originalUpdateOne = AptitudeAttempt.updateOne;
          AptitudeAttempt.updateOne = function (filter, update, options) {
            if (update && update.$set && update.$set.status === 'completed') {
              return Promise.reject(new Error('Simulated transient DB error'));
            }
            return originalUpdateOne.call(this, filter, update, options);
          };
          try {
            const t0 = process.hrtime.bigint();
            const res = await request(app).post('/api/questions/quiz/save-result').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });
            const t1 = process.hrtime.bigint();
            arm3Ms = Number(t1 - t0) / 1e6;
            arm3Outcome = res.status === 500 ? 'REJECT' : 'ACCEPT';
            const postAttempt = await AptitudeAttempt.findById(attempt._id);
            const postResults = await TestResult.countDocuments({ attemptId: attempt._id });
            dbPostConditionSatisfied = postAttempt.status === 'in_progress' && postResults === 0;
          } finally {
            AptitudeAttempt.updateOne = originalUpdateOne;
          }
        } else if (tc.id === 'RC-01') {
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice', expiresAt: new Date(Date.now() - 30000) });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });
          const t1 = process.hrtime.bigint();
          arm3Ms = Number(t1 - t0) / 1e6;
          arm3Outcome = res.status === 400 ? 'REJECT' : 'ACCEPT';
          const postResults = await TestResult.countDocuments({ attemptId: attempt._id });
          dbPostConditionSatisfied = postResults === 0;
        } else if (tc.id === 'RC-02') {
          // Delayed Worker Resumption in Contract Arm (Live HTTP request to contract controller with pause header)
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: qids, answerKey, status: 'in_progress', mode: 'practice' });

          const t0 = process.hrtime.bigint();
          // Worker A starts request to contract handler with 500ms pause, submitting wrong answer 'B' (score 0)
          const workerAPromise = new Promise((resolve, reject) => {
            request(app)
              .post('/api/questions/quiz/save-result')
              .set('Authorization', authA)
              .set('X-Test-Pause-Before-Commit-Ms', '500')
              .send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'B' }] })
              .end((err, res) => (err ? reject(err) : resolve(res)));
          });

          // Poll until Worker A has acquired lock and entered pause
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 20));
            const cur = await AptitudeAttempt.findById(attempt._id);
            if (cur && cur.status === 'submitting') break;
          }

          // Simulate lease timeout while Worker A is paused
          await AptitudeAttempt.updateOne(
            { _id: attempt._id },
            { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } }
          );

          // Worker B takes over expired lease via contract endpoint and completes with correct answer 'A' (score 1)
          const resB = await request(app)
            .post('/api/questions/quiz/save-result')
            .set('Authorization', authA)
            .send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }] });

          // Worker A unpauses and attempts completion with stale leaseToken -> Fenced out with 409!
          const resA = await workerAPromise;
          const t1 = process.hrtime.bigint();
          arm3Ms = Number(t1 - t0) / 1e6;

          // In contract arm, Worker A was rejected via lease fencing and Worker B's score 1 is intact!
          const finalAttempt = await AptitudeAttempt.findById(attempt._id);
          const finalResult = await TestResult.findOne({ attemptId: attempt._id });
          const defectFenced = (resA.status === 409 && finalResult && finalResult.score === 1 && finalAttempt && finalAttempt.status === 'completed');
          arm3Outcome = defectFenced ? 'REJECT' : 'ACCEPT'; // true -> REJECT (Defect Detected!)
          dbPostConditionSatisfied = defectFenced;
        } else if (tc.id === 'RC-03') {
          const tenQids = [qid1, qid2, ...Array.from({ length: 8 }, () => new mongoose.Types.ObjectId())];
          const attempt = await AptitudeAttempt.create({ userId: userA, questionIds: tenQids, answerKey, status: 'in_progress', mode: 'practice' });
          const t0 = process.hrtime.bigint();
          const res = await request(app).post('/api/questions/quiz/save-result').set('Authorization', authA).send({ attemptId: String(attempt._id), answers: [{ questionId: String(qid1), selected: 'A' }, { questionId: String(qid2), selected: 'B' }], totalQuestions: 2 });
          const t1 = process.hrtime.bigint();
          arm3Ms = Number(t1 - t0) / 1e6;
          arm3Outcome = res.status === 200 && res.body.percentage === 20 ? 'DETECT' : 'REJECT';
          dbPostConditionSatisfied = res.body.percentage === 20;
        }
      }

      // Record round results
      const entry = caseSummary.get(tc.id);
      entry.arm1Latencies.push(arm1Ms);
      entry.arm2Latencies.push(arm2Ms);
      entry.arm3Latencies.push(arm3Ms);
      entry.arm1Outcome = arm1Outcome;
      entry.arm2Outcome = arm2Outcome;
      entry.arm3Outcome = arm3Outcome;
      entry.arm3DbPostConditionSatisfied = dbPostConditionSatisfied;
      entry.rounds.push({
        round: round + 1,
        arm1: { outcome: arm1Outcome, latencyMs: Math.round(arm1Ms * 1000) / 1000 },
        arm2: { outcome: arm2Outcome, latencyMs: Math.round(arm2Ms * 1000) / 1000 },
        arm3: { outcome: arm3Outcome, latencyMs: Math.round(arm3Ms * 1000) / 1000, dbPostConditionSatisfied }
      });
    }
  }

  // Aggregate results across all rounds
  const results = [];
  const arm1Metrics = { controlsAccepted: 0, falseAlarms: 0, faultsDetected: 0, faultsMissed: 0, totalMs: 0 };
  const arm2Metrics = { controlsAccepted: 0, falseAlarms: 0, faultsDetected: 0, faultsMissed: 0, totalMs: 0 };
  const arm3Metrics = { controlsAccepted: 0, falseAlarms: 0, faultsDetected: 0, faultsMissed: 0, totalMs: 0 };

  for (const tc of BENCHMARK_CASES) {
    const isControl = tc.class === 'fault_free';
    const entry = caseSummary.get(tc.id);

    const arm1MeanMs = entry.arm1Latencies.reduce((a, b) => a + b, 0) / entry.arm1Latencies.length;
    const arm2MeanMs = entry.arm2Latencies.reduce((a, b) => a + b, 0) / entry.arm2Latencies.length;
    const arm3MeanMs = entry.arm3Latencies.reduce((a, b) => a + b, 0) / entry.arm3Latencies.length;

    arm1Metrics.totalMs += arm1MeanMs;
    arm2Metrics.totalMs += arm2MeanMs;
    arm3Metrics.totalMs += arm3MeanMs;

    // Status evaluation
    let arm1Status = isControl ? (entry.arm1Outcome === 'ACCEPT' ? 'accepted' : 'false_alarm') : (entry.arm1Outcome === 'REJECT' || entry.arm1Outcome === 'DETECT' ? 'detected' : 'missed');
    if (isControl) { if (arm1Status === 'accepted') arm1Metrics.controlsAccepted++; else arm1Metrics.falseAlarms++; }
    else { if (arm1Status === 'detected') arm1Metrics.faultsDetected++; else arm1Metrics.faultsMissed++; }

    let arm2Status = isControl ? (entry.arm2Outcome === 'ACCEPT' ? 'accepted' : 'false_alarm') : (entry.arm2Outcome === 'REJECT' || entry.arm2Outcome === 'DETECT' ? 'detected' : 'missed');
    if (isControl) { if (arm2Status === 'accepted') arm2Metrics.controlsAccepted++; else arm2Metrics.falseAlarms++; }
    else { if (arm2Status === 'detected') arm2Metrics.faultsDetected++; else arm2Metrics.faultsMissed++; }

    let arm3Status = isControl ? (entry.arm3Outcome === 'ACCEPT' && entry.arm3DbPostConditionSatisfied ? 'accepted' : 'false_alarm') : ((entry.arm3Outcome === 'REJECT' || entry.arm3Outcome === 'DETECT') && entry.arm3DbPostConditionSatisfied ? 'detected' : 'missed');
    if (isControl) { if (arm3Status === 'accepted') arm3Metrics.controlsAccepted++; else arm3Metrics.falseAlarms++; }
    else { if (arm3Status === 'detected') arm3Metrics.faultsDetected++; else arm3Metrics.faultsMissed++; }

    results.push({
      caseId: tc.id,
      name: tc.name,
      class: tc.class,
      isControl,
      groundTruth: tc.groundTruth,
      arm1: { outcome: entry.arm1Outcome, status: arm1Status, meanLatencyMs: Math.round(arm1MeanMs * 1000) / 1000, latenciesMs: entry.arm1Latencies.map(l => Math.round(l * 1000) / 1000) },
      arm2: { outcome: entry.arm2Outcome, status: arm2Status, meanLatencyMs: Math.round(arm2MeanMs * 1000) / 1000, latenciesMs: entry.arm2Latencies.map(l => Math.round(l * 1000) / 1000) },
      arm3: { outcome: entry.arm3Outcome, status: arm3Status, dbPostConditionSatisfied: entry.arm3DbPostConditionSatisfied, meanLatencyMs: Math.round(arm3MeanMs * 1000) / 1000, latenciesMs: entry.arm3Latencies.map(l => Math.round(l * 1000) / 1000) },
      rounds: entry.rounds
    });

    console.log(`[${tc.id}] ${tc.name.padEnd(44)} | Arm 1: ${arm1Status.padEnd(11)} | Arm 2: ${arm2Status.padEnd(11)} | Arm 3: ${arm3Status.padEnd(11)} (DB: ${entry.arm3DbPostConditionSatisfied ? 'PASS' : 'N/A'})`);
  }

  // Separate ordinary request overhead from recovery scenario duration
  const ordinaryCases = BENCHMARK_CASES.filter(c => c.id !== 'RC-02');
  const recoveryCases = BENCHMARK_CASES.filter(c => c.id === 'RC-02');

  const calcMeanForCases = (cases, armKey) => {
    const sum = cases.reduce((acc, c) => {
      const entry = caseSummary.get(c.id);
      const mean = entry[armKey].reduce((a, b) => a + b, 0) / entry[armKey].length;
      return acc + mean;
    }, 0);
    return Number((sum / cases.length).toFixed(3));
  };

  const ordinaryArm1Mean = calcMeanForCases(ordinaryCases, 'arm1Latencies');
  const ordinaryArm2Mean = calcMeanForCases(ordinaryCases, 'arm2Latencies');
  const ordinaryArm3Mean = calcMeanForCases(ordinaryCases, 'arm3Latencies');
  const ordinaryOverhead = Number((ordinaryArm3Mean - ordinaryArm2Mean).toFixed(3));

  const recoveryArm1Mean = calcMeanForCases(recoveryCases, 'arm1Latencies');
  const recoveryArm2Mean = calcMeanForCases(recoveryCases, 'arm2Latencies');
  const recoveryArm3Mean = calcMeanForCases(recoveryCases, 'arm3Latencies');

  const overallArm1Mean = Number((arm1Metrics.totalMs / BENCHMARK_CASES.length).toFixed(3));
  const overallArm2Mean = Number((arm2Metrics.totalMs / BENCHMARK_CASES.length).toFixed(3));
  const overallArm3Mean = Number((arm3Metrics.totalMs / BENCHMARK_CASES.length).toFixed(3));
  const overallOverhead = Number((overallArm3Mean - overallArm2Mean).toFixed(3));

  console.log('\n================================================================================');
  console.log('EMPIRICAL EVALUATION SUMMARY (12 BENCHMARK CASES: 3 CONTROLS, 9 FAULTS)');
  console.log('================================================================================');
  console.log(`Arm 1 (Schema-Only Baseline):     Faults: ${arm1Metrics.faultsDetected}/9 detected (${arm1Metrics.faultsMissed}/9 missed) | Controls: ${arm1Metrics.controlsAccepted}/3 accepted (${arm1Metrics.falseAlarms} false alarms) | Mean: ${overallArm1Mean} ms`);
  console.log(`Arm 2 (Current Practical Base):   Faults: ${arm2Metrics.faultsDetected}/9 detected (${arm2Metrics.faultsMissed}/9 missed) | Controls: ${arm2Metrics.controlsAccepted}/3 accepted (${arm2Metrics.falseAlarms} false alarms) | Mean: ${overallArm2Mean} ms`);
  console.log(`Arm 3 (Existing + Contract):      Faults: ${arm3Metrics.faultsDetected}/9 detected (${arm3Metrics.faultsMissed}/9 missed) | Controls: ${arm3Metrics.controlsAccepted}/3 accepted (${arm3Metrics.falseAlarms} false alarms) | Mean: ${overallArm3Mean} ms`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`ORDINARY REQUEST PERFORMANCE (11 Non-Race Cases, Excludes 500ms Deliberate Pause):`);
  console.log(`  Arm 1 (Schema-Only):     ${ordinaryArm1Mean} ms`);
  console.log(`  Arm 2 (Practical Base):  ${ordinaryArm2Mean} ms`);
  console.log(`  Arm 3 (Contract Invariants): ${ordinaryArm3Mean} ms`);
  console.log(`  Contract Pure Overhead:  +${ordinaryOverhead} ms (computational cost of invariant enforcement)`);
  console.log(`RECOVERY SCENARIO DURATION (RC-02 Race Case, Includes 500ms Lease Timeout Window):`);
  console.log(`  Arm 2 (Unfenced Overwrite): ${recoveryArm2Mean} ms`);
  console.log(`  Arm 3 (Fenced Protection):  ${recoveryArm3Mean} ms`);
  console.log('================================================================================\n');

  const payload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      benchmarkVersion: '1.2-isolated-fencing-per-round-12',
      executionMethod: 'Live Express HTTP endpoints (Supertest) comparing Baseline Controller vs Contract Controller',
      repsPerCase: NUM_ROUNDS,
      researchQuestion: 'Does the module-specific report contract detect cross-component integrity failures that a reasonable component-level validation approach misses?',
      arms: {
        arm1: 'Schema / Type Validation Only (Syntactic Reference Point)',
        arm2: 'Current Practical Baseline Controller (Standard Express checks without worker lease fencing)',
        arm3: 'Existing Checks + Contract-Driven Invariants (Express Controller with Fenced Leases, Cascades, Bidirectional Invariants)'
      }
    },
    summaryMetrics: {
      totalCases: BENCHMARK_CASES.length,
      controlCases: 3,
      faultCases: 9,
      repsPerCase: NUM_ROUNDS,
      performanceAnalysis: {
        ordinaryRequests: {
          casesEvaluated: 11,
          description: 'Ordinary requests excluding the deliberate 500ms concurrency pause in RC-02',
          arm1MeanLatencyMs: ordinaryArm1Mean,
          arm2MeanLatencyMs: ordinaryArm2Mean,
          arm3MeanLatencyMs: ordinaryArm3Mean,
          contractOverheadMs: ordinaryOverhead,
          interpretation: 'Isolates the true computational overhead of multi-tier contract checks (cascades, answerKey snapshot comparisons, CAS updates) under normal operational flow.'
        },
        recoveryScenarios: {
          casesEvaluated: 1,
          caseId: 'RC-02',
          description: 'Delayed worker lease expiration race scenario including intentional 500ms worker pause',
          arm1MeanLatencyMs: recoveryArm1Mean,
          arm2MeanLatencyMs: recoveryArm2Mean,
          arm3MeanLatencyMs: recoveryArm3Mean,
          interpretation: 'Reflects worker pause duration + concurrent lease takeover + resumption attempt.'
        },
        overallBenchmark: {
          casesEvaluated: 12,
          arm1MeanLatencyMs: overallArm1Mean,
          arm2MeanLatencyMs: overallArm2Mean,
          arm3MeanLatencyMs: overallArm3Mean,
          contractOverheadMs: overallOverhead
        }
      },
      arm1: {
        controlsAccepted: arm1Metrics.controlsAccepted,
        falseAlarms: arm1Metrics.falseAlarms,
        faultsDetected: arm1Metrics.faultsDetected,
        faultsMissed: arm1Metrics.faultsMissed,
        totalCasesEvaluated: 12,
        meanLatencyMs: overallArm1Mean,
        ordinaryMeanLatencyMs: ordinaryArm1Mean
      },
      arm2: {
        controlsAccepted: arm2Metrics.controlsAccepted,
        falseAlarms: arm2Metrics.falseAlarms,
        faultsDetected: arm2Metrics.faultsDetected,
        faultsMissed: arm2Metrics.faultsMissed,
        totalCasesEvaluated: 12,
        meanLatencyMs: overallArm2Mean,
        ordinaryMeanLatencyMs: ordinaryArm2Mean
      },
      arm3: {
        controlsAccepted: arm3Metrics.controlsAccepted,
        falseAlarms: arm3Metrics.falseAlarms,
        faultsDetected: arm3Metrics.faultsDetected,
        faultsMissed: arm3Metrics.faultsMissed,
        totalCasesEvaluated: 12,
        meanLatencyMs: overallArm3Mean,
        ordinaryMeanLatencyMs: ordinaryArm3Mean
      }
    },
    caseResults: results
  };

  const outDir = path.resolve(__dirname, 'out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'contract_vs_component_comparison.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote results to: ${outPath}`);

  // Copy to verification-update/data
  const verifyDataDir = path.resolve(__dirname, '..', '..', '..', 'verification-update', 'data');
  if (fs.existsSync(verifyDataDir)) {
    fs.copyFileSync(outPath, path.join(verifyDataDir, 'contract_vs_component_comparison.json'));
    console.log(`Copied results to: ${path.join(verifyDataDir, 'contract_vs_component_comparison.json')}`);
  }

  await AptitudeAttempt.deleteMany({ userId: { $in: [userA, userB] } });
  await TestResult.deleteMany({ userId: { $in: [userA, userB] } });
  await InterviewSession.deleteMany({ user: { $in: [userA, userB] } });
  await ProctorLog.deleteMany({ userId: { $in: [userA, userB] } });
  await mongoose.disconnect();
}

runEvaluation().catch((err) => {
  console.error('Comparative evaluation error:', err);
  process.exit(1);
});
