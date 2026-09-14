/**
 * Moves existing webcam frames off ProctorLog rows into ProctorSnapshot.
 *
 * The schema change alone does not do this: Mongoose stops *returning* the
 * field, but the base64 images stay in the proctorlogs collection, which is
 * exactly the exposure the split was meant to remove. Run this once after
 * deploying the split.
 *
 *   node scripts/migrateProctorSnapshots.js --dry
 *   node scripts/migrateProctorSnapshots.js
 *
 * Safe to re-run: rows already migrated are skipped, and the unset only
 * happens after the new document is written.
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const ProctorSnapshot = require('../models/ProctorSnapshot');

const DRY = process.argv.includes('--dry');
const BATCH = 100;

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const logs = mongoose.connection.collection('proctorlogs');

  const total = await logs.countDocuments({ snapshot: { $exists: true, $ne: null } });
  console.log(`${total} proctor log row(s) still carry an inline snapshot`);
  if (!total) {
    console.log('nothing to migrate');
    await mongoose.disconnect();
    return;
  }
  if (DRY) {
    console.log('dry run — no writes. Re-run without --dry to migrate.');
    await mongoose.disconnect();
    return;
  }

  let moved = 0;
  let skipped = 0;
  let cleared = 0;

  while (true) {
    const batch = await logs
      .find({ snapshot: { $exists: true, $ne: null } })
      .limit(BATCH)
      .toArray();
    if (!batch.length) break;

    for (const log of batch) {
      const already = await ProctorSnapshot.exists({ proctorLogId: log._id });
      if (already) {
        skipped++;
      } else {
        await ProctorSnapshot.create({
          sessionId: log.sessionId,
          userId: log.userId,
          proctorLogId: log._id,
          image: log.snapshot,
          // Preserve original capture time so the TTL measures from when the
          // frame was actually taken, not from when this script happened to run.
          capturedAt: log.timestamp || log.receivedAt || log.createdAt || new Date(),
        });
        moved++;
      }
      // Only after the frame is safely in its own collection.
      await logs.updateOne({ _id: log._id }, { $unset: { snapshot: '' } });
      cleared++;
    }
    process.stdout.write(`  ${cleared}/${total}\r`);
  }

  console.log(`\nmoved ${moved}, skipped ${skipped} already-migrated, cleared ${cleared} log rows`);

  const remaining = await logs.countDocuments({ snapshot: { $exists: true, $ne: null } });
  console.log(remaining === 0
    ? 'verified: no inline snapshots remain on proctorlogs'
    : `WARNING: ${remaining} row(s) still carry a snapshot`);

  await mongoose.disconnect();
  process.exitCode = remaining === 0 ? 0 : 1;
})().catch((err) => {
  console.error('migration failed:', err.message);
  process.exitCode = 1;
});
