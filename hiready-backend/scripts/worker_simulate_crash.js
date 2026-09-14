'use strict';
/**
 * Process-level Crash Simulation Worker
 * Used by failureRecovery.test.js to verify real process termination and recovery.
 *
 * Supports two distinct execution modes:
 * 1. 'standalone':
 *    Acquires an atomic submission lease with dedicated leaseToken before result commit,
 *    signals 'holding_lease', and halts until killed via OS SIGKILL.
 *    Verifies that an abandoned lease leaves DB in recoverable state and retry reclaims after expiration.
 *
 * 2. 'transaction':
 *    Requires a replica set / mongos. Opens a multi-document session transaction,
 *    writes attempt status and uncommitted TestResult, signals 'in_transaction', and halts until SIGKILL.
 *    Verifies that MongoDB server automatically aborts uncommitted transactions upon client termination.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const AptitudeAttempt = require('../models/AptitudeAttempt');
const TestResult = require('../models/TestResult');

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hiready-test';
const attemptId = process.argv[2];
const mode = process.argv[3] || 'standalone';

if (!attemptId) {
  console.error('Error: attemptId argument required');
  process.exit(1);
}

async function run() {
  await mongoose.connect(mongoUri);

  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + 60000);

  const existingAttempt = await AptitudeAttempt.findById(attemptId);
  if (!existingAttempt) {
    console.error('Attempt not found:', attemptId);
    process.exit(2);
  }

  if (mode === 'transaction') {
    // Probe replica set topology — do NOT silently fall back!
    const topologyType = mongoose.connection.client?.topology?.description?.type || '';
    const isReplicaSet = topologyType.includes('ReplicaSet') || topologyType.includes('Sharded');

    if (!isReplicaSet) {
      console.error('Error: Transaction mode requires a replica set or sharded cluster');
      process.exit(3); // Explicit error code: replica set required
    }

    let session = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      await AptitudeAttempt.updateOne(
        { _id: attemptId, status: 'in_progress' },
        { $set: { status: 'submitting', leaseToken, leaseExpiresAt } },
        { session }
      );

      const tr = new TestResult({
        attemptId: existingAttempt._id,
        userId: existingAttempt.userId,
        score: 1,
        totalQuestions: 1,
        percentage: 100,
        mode: 'test',
        topic: 'crash-worker-tx'
      });
      await tr.save({ session });

      if (process.send) {
        process.send({ status: 'in_transaction', mode: 'transaction', pid: process.pid, leaseToken });
      }

      // Keep transaction open until parent delivers SIGKILL
      await new Promise(() => {});
    } catch (err) {
      if (session) {
        try { await session.abortTransaction(); } catch { /* ignore */ }
        try { await session.endSession(); } catch { /* ignore */ }
      }
      throw err;
    }
  } else if (mode === 'standalone') {
    // Standalone CAS mode: acquire atomic lease before result commit
    await AptitudeAttempt.updateOne(
      { _id: attemptId, status: 'in_progress' },
      { $set: { status: 'submitting', leaseToken, leaseExpiresAt } }
    );

    if (process.send) {
      process.send({ status: 'holding_lease', mode: 'standalone', pid: process.pid, leaseToken });
    }

    // Keep running holding active lease until parent delivers SIGKILL
    await new Promise(() => {});
  } else {
    console.error('Unknown mode:', mode);
    process.exit(4);
  }
}

run().catch((err) => {
  console.error('Worker error:', err.message);
  process.exit(1);
});
