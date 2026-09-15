/**
 * Removes records belonging to users that no longer exist.
 *
 * WHY THESE EXIST
 *
 * The admin delete route cascaded with `deleteMany({ userId })`. For rows whose
 * userId was string-typed (see scripts/migrateUserIdTypes.js), Mongoose cast the
 * filter and matched nothing — so the User row was deleted, everything else
 * stayed, and the route reported success. This is the residue of every such
 * deletion.
 *
 * Those accounts were deleted. Their assessment history, proctoring events and
 * webcam frames should have gone with them, and keeping them is both a data
 * protection problem and a source of wrong numbers — orphans inflated a cohort
 * accuracy reading by 13 points and produced "7 of 5 students scored".
 *
 *   node scripts/cleanupOrphanedUserData.js --dry     (default-safe: shows only)
 *   node scripts/cleanupOrphanedUserData.js --commit  (actually deletes)
 *
 * Run migrateUserIdTypes.js FIRST. Orphan detection compares ids, and mixed
 * types would misclassify live rows as orphaned.
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

const COMMIT = process.argv.includes('--commit');

/**
 * Collections to sweep, and the field naming their owner.
 *
 * DisclosureAudit is deliberately absent — it records who saw a candidate's
 * data and under what consent, and must outlive both the consent and the
 * account. Deleting it would destroy the only answer to "who saw my results?".
 */
const TARGETS = [
  { collection: 'testresults', field: 'userId' },
  { collection: 'savedquestions', field: 'userId' },
  { collection: 'proctorlogs', field: 'userId' },
  { collection: 'proctorsnapshots', field: 'userId' },
  { collection: 'interviewsessions', field: 'user' },
  { collection: 'resumeanalyses', field: 'user' },
  { collection: 'assessmentattempts', field: 'userId' },
  { collection: 'codingsubmissions', field: 'userId' },
  { collection: 'candidatecompanyconsents', field: 'candidateId' },
  { collection: 'applications', field: 'candidateId' },
  { collection: 'companymemberships', field: 'userId' },
  { collection: 'aptitudeattempts', field: 'userId' },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const liveIds = new Set(
    (await db.collection('users').distinct('_id')).map(String)
  );
  console.log(`${liveIds.size} live user(s)\n`);

  let grandTotal = 0;
  const plan = [];

  for (const { collection, field } of TARGETS) {
    const coll = db.collection(collection);
    const owners = await coll.distinct(field);
    const orphanIds = owners.filter((o) => o && !liveIds.has(String(o)));
    if (!orphanIds.length) {
      console.log(`  ${collection.padEnd(26)} clean`);
      continue;
    }
    const n = await coll.countDocuments({ [field]: { $in: orphanIds } });
    grandTotal += n;
    plan.push({ coll, collection, field, orphanIds, n });
    console.log(`  ${collection.padEnd(26)} ${String(n).padStart(5)} row(s) `
      + `from ${orphanIds.length} deleted account(s)`);
  }

  if (!grandTotal) {
    console.log('\nnothing orphaned');
    await mongoose.disconnect();
    return;
  }

  if (!COMMIT) {
    console.log(`\n${grandTotal} row(s) would be deleted.`);
    console.log('This is irreversible. Re-run with --commit to proceed.');
    await mongoose.disconnect();
    return;
  }

  console.log('');
  let deleted = 0;
  for (const p of plan) {
    const r = await p.coll.deleteMany({ [p.field]: { $in: p.orphanIds } });
    deleted += r.deletedCount;
    console.log(`  ${p.collection.padEnd(26)} deleted ${r.deletedCount}`);
  }

  // Prove it.
  let remaining = 0;
  for (const { collection, field } of TARGETS) {
    const owners = await db.collection(collection).distinct(field);
    remaining += owners.filter((o) => o && !liveIds.has(String(o))).length;
  }
  console.log(`\ndeleted ${deleted} row(s); orphaned owners remaining: ${remaining}`);

  await mongoose.disconnect();
  process.exitCode = remaining === 0 ? 0 : 1;
})().catch((err) => {
  console.error('cleanup failed:', err.message);
  process.exitCode = 1;
});
