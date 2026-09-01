/**
 * Seed aptitude questions into MongoDB from a dataset file (CSV or JSON).
 *
 * Usage:
 *   node scripts/seed-aptitude-questions.js <path-to-file> [category]
 *
 * CSV header (exactly): Question,"Option A","Option B","Option C","Option D",Answer,difficulty
 *   - category comes from the CLI arg (default: "logical"), difficulty column optional
 * JSON format: array of { Question, "Option A", "Option B", "Option C", "Option D", Answer, category?, difficulty? }
 *
 * Examples:
 *   node scripts/seed-aptitude-questions.js ../datasets/quant.csv quantitative-aptitude
 *   node scripts/seed-aptitude-questions.js ../datasets/mixed.json
 */
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const Question = require('../models/Question');

function parseCsv(text) {
  const rows = [];
  let cur = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur); cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = ''; }
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function normalize(row) {
  const get = (k) => String(row[k] ?? '').trim();
  const doc = {
    Question: get('Question'),
    'Option A': get('Option A'),
    'Option B': get('Option B'),
    'Option C': get('Option C'),
    'Option D': get('Option D'),
    Answer: get('Answer').toUpperCase(),
  };
  if (row.category !== undefined) doc.category = get('category') || 'logical';
  if (row.difficulty !== undefined && ['easy', 'medium', 'hard'].includes(get('difficulty'))) {
    doc.difficulty = get('difficulty');
  }
  const errors = [];
  for (const k of Object.keys(doc)) {
    if (!doc[k] && k !== 'difficulty') errors.push(`missing ${k}`);
  }
  if (!['A', 'B', 'C', 'D'].includes(doc.Answer)) errors.push(`invalid Answer "${doc.Answer}"`);
  return { doc, errors };
}

(async () => {
  const file = process.argv[2];
  const defaultCategory = process.argv[3] || 'logical';
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: node scripts/seed-aptitude-questions.js <file.csv|file.json> [category]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hireadyDB');
  console.log('MongoDB connected');

  const raw = fs.readFileSync(file, 'utf8');
  let items;
  if (file.toLowerCase().endsWith('.json')) {
    items = JSON.parse(raw).map((r) => ({ category: defaultCategory, ...r }));
  } else {
    const rows = parseCsv(raw);
    if (rows.length < 2) { console.error('CSV needs a header + data rows'); process.exit(1); }
    const header = rows[0].map((h) => h.trim());
    items = rows.slice(1).map((r) => {
      const obj = {};
      header.forEach((h, i) => { obj[h] = r[i]; });
      if (obj.category === undefined) obj.category = defaultCategory;
      return obj;
    });
  }

  const docs = [];
  const errors = [];
  items.forEach((item, idx) => {
    const { doc, errors: e } = normalize(item);
    if (e.length) errors.push({ row: idx + 1, errors: e });
    else docs.push(doc);
  });

  let inserted = 0;
  if (docs.length) {
    const res = await Question.insertMany(docs, { ordered: false });
    inserted = res.length;
  }
  console.log(`Inserted: ${inserted} | Failed: ${errors.length}`);
  if (errors.length) console.log('First errors:', JSON.stringify(errors.slice(0, 10), null, 2));
  const byCat = await Question.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);
  console.log('Bank by category:', byCat.map((c) => `${c._id}: ${c.count}`).join(', '));
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
