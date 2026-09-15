/**
 * Converts string-typed `userId` values to ObjectId.
 *
 * WHY THIS EXISTS
 *
 * Commit a94c3f0 (1 Sep) retyped three schemas from `type: String` to
 * `type: ObjectId` and shipped no migration. Every row written before that date
 * still holds a string. Because Mongoose casts query FILTERS on typed paths,
 * those rows are invisible to ordinary reads as well as aggregations:
 *
 *   - TestResult.find({ userId }) returns nothing for them, so /wrong-answers/me
 *     is empty and the readiness aptitude pillar reads null — which renormalises
 *     the remaining weights and inflates the affected students' scores.
 *   - deleteMany({ userId }) matches nothing, so deleting one of these accounts
 *     removes the User row, leaves every assessment and proctoring event behind,
 *     and reports success.
 *   - The leaderboard groups by raw $userId, so an affected user appears twice —
 *     once under their name, once as "Anonymous".
 *
 * This script MUST use the raw driver. A Mongoose query cannot find the rows it
 * needs to fix, because it would cast the filter before the driver ever sees it.
 *
 *   node scripts/migrateUserIdTypes.js --dry
 *   node scripts/migrateUserIdTypes.js
 *
 * Safe to re-run: already-converted rows are not matched.
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

const DRY = process.argv.includes('--dry');
const BATCH = 200;

/** Collections carrying a user reference that was once typed String. */
const TARGETS = [
  { collection: 'testresults', field: 'userId' },
  { collection: 'savedquestions', field: 'userId' },
  { collection: 'proctorlogs', field: 'userId' },
];

const isObjectIdString = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

/** Rows whose field is stored as a BSON string. $type is the only way to ask. */
function stringFilter(field) {
  return { [field]: { $type: 'string' } };
}

/**
 * savedquestions carries a unique index on { userId, questionId }. The index
 * never saw the string rows as duplicates of their ObjectId counterparts —
 * different BSON types never collide — so converting blind would violate it.
 * Drop the string copy where an ObjectId copy already exists.
 */
async function dedupeSavedQuestions(db) {
  const coll = db.collection('savedquestions');
  const strays = await coll.find(stringFilter('userId')).toArray();
  let removed = 0;

  for (const row of strays) {
    if (!isObjectIdString(row.userId)) continue;
    const twin = await coll.findOne({
      userId: new mongoose.Types.ObjectId(row.userId),
      questionId: row.questionId,
    });
    if (twin) {
      if (!DRY) await coll.deleteOne({ _id: row._id });
      removed++;
    }
  }
  return removed;
}

async function convert(db, { collection, field }) {
  const coll = db.collection(collection);
  const total = await coll.countDocuments(stringFilter(field));
  if (!total) return { collection, total: 0, converted: 0, skipped: 0 };

  if (DRY) return { collection, total, converted: 0, skipped: 0 };

  let converted = 0;
  let skipped = 0;

  while (true) {
    const batch = await coll.find(stringFilter(field)).limit(BATCH).toArray();
    if (!batch.length) break;

    for (const row of batch) {
      const raw = row[field];
      if (!isObjectIdString(raw)) {
        // Not a castable id — leave it and report rather than guessing.
        skipped++;
        await coll.updateOne({ _id: row._id }, { $set: { [`${field}_unmigratable`]: true } });
        continue;
      }
      await coll.updateOne(
        { _id: row._id },
        { $set: { [field]: new mongoose.Types.ObjectId(raw) } }
      );
      converted++;
    }
    // Guard against a batch that made no progress (all unmigratable).
    if (skipped >= total) break;
  }
  return { collection, total, converted, skipped };
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  console.log(DRY ? 'DRY RUN — no writes\n' : 'MIGRATING\n');

  // Before: what the raw driver sees, per collection and per type.
  for (const t of TARGETS) {
    const coll = db.collection(t.collection);
    const [asString, asOid, all] = await Promise.all([
      coll.countDocuments(stringFilter(t.field)),
      coll.countDocuments({ [t.field]: { $type: 'objectId' } }),
      coll.countDocuments({}),
    ]);
    console.log(`  ${t.collection.padEnd(16)} total ${String(all).padStart(5)}  `
      + `objectId ${String(asOid).padStart(5)}  string ${String(asString).padStart(5)}`);
  }

  const dupes = await dedupeSavedQuestions(db);
  if (dupes) {
    console.log(`\n  savedquestions: ${dupes} string row(s) duplicate an existing `
      + `ObjectId row${DRY ? ' and would be removed' : ' — removed'}`);
  }

  console.log('');
  const results = [];
  for (const t of TARGETS) results.push(await convert(db, t));

  if (DRY) {
    const pending = results.reduce((n, r) => n + r.total, 0);
    console.log(`${pending} row(s) would be converted. Re-run without --dry.`);
    await mongoose.disconnect();
    return;
  }

  results.forEach((r) => {
    if (!r.total) return;
    console.log(`  ${r.collection.padEnd(16)} converted ${r.converted}`
      + (r.skipped ? `, ${r.skipped} unmigratable (flagged, not touched)` : ''));
  });

  // After: prove it.
  console.log('');
  let remaining = 0;
  for (const t of TARGETS) {
    const n = await db.collection(t.collection).countDocuments(stringFilter(t.field));
    remaining += n;
    console.log(`  ${t.collection.padEnd(16)} string rows remaining: ${n}`);
  }
  console.log(remaining === 0
    ? '\nverified: every userId is now an ObjectId'
    : `\nWARNING: ${remaining} row(s) still string-typed — check the unmigratable flags`);

  await mongoose.disconnect();
  process.exitCode = remaining === 0 ? 0 : 1;
})().catch((err) => {
  console.error('migration failed:', err.message);
  process.exitCode = 1;
});
