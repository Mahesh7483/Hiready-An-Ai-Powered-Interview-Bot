/**
 * Export a small, stratified slice of the live question bank into a committed
 * seed file.
 *
 * WHY THIS EXISTS
 *
 * seed-dataset-aptitude.js reads three dataset folders (prepinsta_enriched,
 * indiabix_enriched, geeksforgeeks) that are not in this repository and are
 * not on the machine that built it. seed-aptitude-questions.js needs a CSV
 * path you supply. So a fresh clone had no way at all to populate the aptitude
 * bank: the app came up, logged you in, and every practice surface was empty.
 *
 * This exports a sample small enough to commit and broad enough to exercise
 * every category and difficulty the UI offers.
 *
 *   node scripts/export-seed.js                  # default 40 per category
 *   node scripts/export-seed.js --per-category 25
 *
 * Writes seeds/aptitude.json. Re-run it when the bank changes materially;
 * the output is deterministic for a given database (sorted by _id), so an
 * unchanged bank produces an unchanged file and no noisy diff.
 */
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Question = require('../models/Question');

const argIndex = process.argv.indexOf('--per-category');
const PER_CATEGORY = argIndex > -1 ? parseInt(process.argv[argIndex + 1], 10) : 40;

if (!Number.isFinite(PER_CATEGORY) || PER_CATEGORY < 1) {
  console.error('--per-category must be a positive integer');
  process.exit(2);
}

const OUT = path.join(__dirname, '..', 'seeds', 'aptitude.json');

const OPTION_KEYS = ['Option A', 'Option B', 'Option C', 'Option D'];

/**
 * Only questions a candidate could actually answer.
 *
 * The bank was scraped, and a third of it did not survive the scrape. Two
 * failure shapes dominate, and both look fine until you read one:
 *
 *   1. The stem references a bar graph, table or passage that was an IMAGE on
 *      the source page and is not in the database. Unanswerable by anyone.
 *
 *   2. Multi-part questions collapsed. The shared preamble became the stem,
 *      the actual sub-question was parsed into "Option A", and the real
 *      choices shifted into B, C and D — so the question has four options,
 *      passes every structural check, and is nonsense:
 *
 *        Question: "10. The bar graph below provides the information…"
 *        Option A: "Find the company with the minimum average production."
 *        Option B: "Company C"   Option C: "Company B"   Option D: "Company A"
 *
 * Shipping those as the demo seed would make a reviewer's first aptitude test
 * look broken. Measured on the first export: 39 of 109 were unusable.
 */
function isUsable(q) {
  const options = OPTION_KEYS.map((k) => String(q[k] ?? '').trim());

  const hasAllOptions = options.every((o) => o.length > 0);
  const hasAnswer = ['A', 'B', 'C', 'D'].includes(String(q.Answer ?? '').trim().toUpperCase());
  const stem = String(q.Question ?? '').trim();
  if (!hasAllOptions || !hasAnswer || !stem) return false;

  // (1) Depends on media the database does not hold.
  if (/\b(bar graph|pie chart|line graph|graph below|table below|chart below|following (graph|table|chart)|study the (graph|table)|given (graph|table)|passage|diagram|figure)\b/i.test(stem)) {
    return false;
  }

  // (2) An "option" that is itself a question — the collapsed multi-part case.
  if (options.some((o) => /\?\s*$/.test(o) || /^(find|what|which|how many|calculate|determine)\b/i.test(o))) {
    return false;
  }

  // A leading "10." is the source page's numbering, and reliably marks a row
  // torn out of a multi-part block.
  if (/^\s*\d+\s*[.)]/.test(stem)) return false;

  // An option that runs to a sentence is prose that belongs in the stem.
  if (options.some((o) => o.length > 80)) return false;

  return true;
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  const categories = (await Question.distinct('category')).filter(Boolean).sort();
  const picked = [];
  const report = [];

  for (const category of categories) {
    const difficulties = (await Question.distinct('difficulty', { category })).filter(Boolean).sort();
    // Spread the quota across difficulties so the "hard" filter is not empty
    // in a fresh clone — the bank is heavily skewed towards medium.
    const perDifficulty = Math.max(1, Math.floor(PER_CATEGORY / Math.max(difficulties.length, 1)));
    let takenForCategory = 0;

    for (const difficulty of difficulties) {
      const rows = await Question.find({ category, difficulty })
        .sort({ _id: 1 })          // deterministic: same DB -> same file
        .limit(perDifficulty * 12) // over-fetch hard: a third of the bank is unusable
        .lean();

      const usable = rows.filter(isUsable).slice(0, perDifficulty);
      usable.forEach((q) => {
        picked.push({
          Question: q.Question,
          'Option A': q['Option A'],
          'Option B': q['Option B'],
          'Option C': q['Option C'],
          'Option D': q['Option D'],
          Answer: q.Answer,
          ...(q.Explanation ? { Explanation: q.Explanation } : {}),
          category: q.category,
          difficulty: q.difficulty,
        });
      });
      takenForCategory += usable.length;
      report.push(`  ${category.padEnd(22)} ${String(difficulty).padEnd(8)} ${usable.length}`);
    }

    if (takenForCategory === 0) {
      console.warn(`  WARNING: no usable questions exported for ${category}`);
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(picked, null, 2)}\n`);

  console.log(report.join('\n'));
  console.log(`\n${picked.length} questions -> ${path.relative(process.cwd(), OUT)}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Export failed:', err.message);
  process.exit(1);
});
