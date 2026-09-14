'use strict';
/**
 * Proposed Architectural Fault Catalogue & Code Inspection Scenario Matrix.
 * 
 * SCOPE & METHODOLOGICAL DISCLOSURE:
 * This script documents an analytical catalogue of five representative architectural
 * fault scenarios across HIREady's multi-tier boundaries:
 * 1. Grading Authority (Client Score Injection)
 * 2. Ownership Authorization (Cross-User Deletion/Access)
 * 3. Configuration & Question Set Integrity (Foreign/Duplicate Question IDs)
 * 4. Data Privacy Lifecycle (Orphaned Proctoring Snapshots)
 * 5. Concurrency Race-Condition (Simultaneous Submission Replay)
 * 
 * IMPORTANT LIMITATION:
 * This script totals qualitative inspection scenario attributes and formats them into JSON.
 * It is an analytical code inspection matrix and vulnerability catalogue, NOT an automated
 * dynamic fault-injection harness or randomized runtime mutation experiment.
 * Inspection times represent estimated retrospective manual code audit durations (in minutes)
 * required to trace invariant contracts across layers, not automated execution times.
 */

const fs = require('fs');
const path = require('path');

const SEEDED_FAULTS = [
  {
    id: 'SF-01',
    category: 'Grading Authority',
    faultName: 'Client-Asserted Score Injection',
    description: 'Client submits empty answers payload with forged score: 10, total: 10.',
    expectedContractBehavior: 'HTTP 400 Bad Request, client score ignored, zero DB persistence.',
    componentOnlyAuditObservation: 'MISSED: Unit test of scoring helper alone does not prevent route handler from accepting req.body.score.',
    contractEnforcedAuditObservation: 'DETECTED: Route-level invariant checks active server-issued attempt and strictly grades server-side.',
    contractEnforcedInCodebase: true,
    componentOnlyEnforcedInCodebase: false,
    falseAlarm: false,
    estimatedAuditEffortMinutes: 35
  },
  {
    id: 'SF-02',
    category: 'Ownership Authorization',
    faultName: 'Cross-User Session Deletion',
    description: 'User B requests deletion of User A interview session via DELETE /sessions/:id.',
    expectedContractBehavior: 'HTTP 403 Forbidden, session retained.',
    componentOnlyAuditObservation: 'MISSED: Generic deletion helper deleting by _id without user ownership filter allows cross-user tampering.',
    contractEnforcedAuditObservation: 'DETECTED: Controller explicitly asserts session.user.toString() === req.user.id before proceeding.',
    contractEnforcedInCodebase: true,
    componentOnlyEnforcedInCodebase: false,
    falseAlarm: false,
    estimatedAuditEffortMinutes: 20
  },
  {
    id: 'SF-03',
    category: 'Input/Configuration Mismatch',
    faultName: 'Foreign & Duplicate Question ID Injection',
    description: 'Client submits question ID not issued in attempt, or submits duplicate IDs to inflate marks.',
    expectedContractBehavior: 'HTTP 400 Bad Request on foreign or duplicate question IDs.',
    componentOnlyAuditObservation: 'MISSED: Question validation alone checking valid ObjectId format allows arbitrary valid questions from database.',
    contractEnforcedAuditObservation: 'DETECTED: Route validates submitted IDs strictly against attempt.questionIds and rejects duplicates.',
    contractEnforcedInCodebase: true,
    componentOnlyEnforcedInCodebase: false,
    falseAlarm: false,
    estimatedAuditEffortMinutes: 25
  },
  {
    id: 'SF-04',
    category: 'Data Privacy Lifecycle',
    faultName: 'Orphaned Webcam Snapshots on Session Deletion',
    description: 'Deleting an interview session leaves sensitive ProctorLog webcam snapshots in MongoDB.',
    expectedContractBehavior: 'Cascading deletion of all associated ProctorLog records and base64 frames.',
    componentOnlyAuditObservation: 'MISSED: Isolated deletion of InterviewSession document leaves ProctorLog collection untouched.',
    contractEnforcedAuditObservation: 'DETECTED: Deletion route explicitly cascades deleteMany to ProctorLog collection.',
    contractEnforcedInCodebase: true,
    componentOnlyEnforcedInCodebase: false,
    falseAlarm: false,
    estimatedAuditEffortMinutes: 45
  },
  {
    id: 'SF-05',
    category: 'Concurrency & Idempotency',
    faultName: 'Simultaneous Duplicate Submission Race',
    description: 'Concurrent requests submit the same attempt at the exact same millisecond.',
    expectedContractBehavior: 'Exactly one submission succeeds with 200; second receives 409 Conflict; exactly one DB record created.',
    componentOnlyAuditObservation: 'MISSED: Sequential read-then-write logic without atomic status CAS or database unique index creates duplicate results.',
    contractEnforcedAuditObservation: 'DETECTED: Atomic status CAS (in_progress -> submitting) and unique attemptId index reject concurrent requests with HTTP 409.',
    contractEnforcedInCodebase: true,
    componentOnlyEnforcedInCodebase: false,
    falseAlarm: false,
    estimatedAuditEffortMinutes: 40
  }
];

function runEvaluation() {
  console.log('================================================================================');
  console.log('HIREady: Proposed Architectural Fault Catalogue & Code Inspection Matrix');
  console.log('================================================================================\n');

  let contractCount = 0;
  let componentCount = 0;
  let totalEffort = 0;

  for (const fault of SEEDED_FAULTS) {
    if (fault.contractEnforcedInCodebase) contractCount++;
    if (fault.componentOnlyEnforcedInCodebase) componentCount++;
    totalEffort += fault.estimatedAuditEffortMinutes;

    console.log(`[${fault.id}] ${fault.category.padEnd(25)} : ${fault.faultName}`);
    console.log(`     Description         : ${fault.description}`);
    console.log(`     Component-Only      : ${fault.componentOnlyAuditObservation}`);
    console.log(`     Contract Enforcement: ${fault.contractEnforcedAuditObservation}`);
    console.log(`     Contract Active In Code: ${fault.contractEnforcedInCodebase ? 'YES' : 'NO'} | Component-Only Active: ${fault.componentOnlyEnforcedInCodebase ? 'YES' : 'NO'}`);
    console.log('--------------------------------------------------------------------------------');
  }

  const summary = {
    framework: 'Proposed Architectural Fault Catalogue & Qualitative Code Inspection Matrix',
    methodologyNote: 'Analytical architectural inspection of contract invariants vs isolated component checks. Inspection times represent estimated manual audit durations in minutes to verify end-to-end dataflow, not automated dynamic test execution.',
    totalCatalogueScenarios: SEEDED_FAULTS.length,
    contractEnforcedScenariosInCode: contractCount,
    componentOnlyEnforcedScenariosInCode: componentCount,
    falseAlarms: 0,
    totalEstimatedAuditEffortMinutes: totalEffort,
    meanEstimatedAuditEffortPerScenarioMinutes: totalEffort / SEEDED_FAULTS.length,
    scenarios: SEEDED_FAULTS
  };

  console.log('\n=== Catalogue Summary Matrix ===');
  console.log(`Total Scenarios                      : ${summary.totalCatalogueScenarios}`);
  console.log(`Contract-Enforced In Code            : ${summary.contractEnforcedScenariosInCode} / ${summary.totalCatalogueScenarios}`);
  console.log(`Component-Only Enforced In Code      : ${summary.componentOnlyEnforcedScenariosInCode} / ${summary.totalCatalogueScenarios}`);
  console.log(`Total Estimated Audit Effort         : ${summary.totalEstimatedAuditEffortMinutes} minutes`);
  console.log(`Mean Estimated Effort Per Scenario   : ${summary.meanEstimatedAuditEffortPerScenarioMinutes} minutes`);
  console.log('================================================================================\n');

  const outPath = path.resolve(__dirname, '..', '..', '..', 'final-paper-verification-pack', 'data', 'seeded_faults_evaluation.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`[saved] Seeded faults catalogue written to: ${outPath}`);

  return summary;
}

if (require.main === module) {
  runEvaluation();
}

module.exports = { SEEDED_FAULTS, runEvaluation };
