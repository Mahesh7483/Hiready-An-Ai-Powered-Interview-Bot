/**
 * Bring a fresh database up to a working demo, in one command.
 *
 *   npm run seed
 *
 * Before this existed, a clone came up logged-in and completely empty: the
 * aptitude seeders needed dataset folders that are not in the repository, and
 * nothing tied the three separate seed scripts together. The app looked
 * broken to anybody who had not already populated a database by hand.
 *
 * Idempotent. Everything upserts, nothing is deleted, and re-running changes
 * nothing. `scripts/seed-coding-questions.js --reset` is the only thing here
 * that can destroy data, and you have to ask for it by name.
 */
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mongoose = require('mongoose');

const Question = require('../models/Question');

const SEED_FILE = path.join(__dirname, '..', 'seeds', 'aptitude.json');

async function seedAptitude() {
  if (!fs.existsSync(SEED_FILE)) {
    console.error(`  missing ${path.relative(process.cwd(), SEED_FILE)} — run scripts/export-seed.js against a populated database`);
    return { inserted: 0, updated: 0 };
  }

  const rows = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    // Upsert on the stem plus category. The Question collection has no unique
    // index, so a plain insertMany would duplicate the whole bank on a second
    // run — which is exactly what the older seeders do.
    const filter = { Question: row.Question, category: row.category };
    // eslint-disable-next-line no-await-in-loop
    const res = await Question.updateOne(filter, { $set: row }, { upsert: true });
    if (res.upsertedCount) inserted += 1;
    else if (res.matchedCount) updated += 1;
  }

  return { inserted, updated };
}

/** Run one of the existing standalone seeders as a child process. */
function runScript(file, label) {
  const res = spawnSync(process.execPath, [path.join(__dirname, file)], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  const ok = res.status === 0;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) {
    const out = `${res.stdout || ''}${res.stderr || ''}`.trim().split('\n').slice(-4);
    out.forEach((l) => console.log(`          ${l}`));
  }
  return ok;
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Copy env.example to .env first.');
    process.exit(2);
  }

  console.log('\nseeding\n');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  const { inserted, updated } = await seedAptitude();
  console.log(`  ok    aptitude questions — ${inserted} inserted, ${updated} already present`);
  await mongoose.disconnect();

  // These two manage their own connections and exit on completion.
  const coding = runScript('seed-coding-questions.js', 'coding questions');
  const template = runScript('seed-assessment-template.js', 'assessment template');

  const total = await (async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    const n = await Question.countDocuments();
    await mongoose.disconnect();
    return n;
  })();

  console.log(`\n${total} aptitude questions in the bank.`);
  console.log('Create an admin with:  node scripts/makeAdmin.js you@example.com\n');

  process.exit(coding && template ? 0 : 1);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
