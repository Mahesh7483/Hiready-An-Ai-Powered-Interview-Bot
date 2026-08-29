/**
 * Seed the aptitude Question bank from three large dataset folders.
 * Sources:
 *   prepinsta_enriched\<Topic>\*.csv   header: Question,"Option A"..,"Answer",Category,Type,Sub-type
 *   indiabix_enriched\<Topic>\*.csv    same header
 *   geeksforgeeks\<Topic>\*.csv        header: Question,Option_A..D,Correct_Answer
 *
 * Folder -> app category mapping:
 *   Logical_Reasoning -> logical
 *   Quantitative_Aptitude -> quantitative
 *   Verbal_Ability -> verbal
 *   Data_Interpretation -> data-interpretation
 *
 * Usage: node scripts/seed-dataset-aptitude.js [PER_TOPIC_CAP=200]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const Question = require('../models/Question');

const SOURCES = [
  {
    root: 'C:\\Users\\mahes\\Downloads\\prepinsta_enriched',
    format: 'prepinsta',
    categoryMap: {
      'Logical_Reasoning': 'logical',
      'Quantitative_Aptitude': 'quantitative',
      'Verbal_Ability': 'verbal',
      'Data_Interpretation': 'data-interpretation',
    }
  },
  {
    root: 'C:\\Users\\mahes\\Downloads\\indiabix_enriched',
    format: 'indiabix',
    categoryMap: {
      'Logical_Reasoning': 'logical',
      'Quantitative_Aptitude': 'quantitative',
      'Verbal_Ability': 'verbal',
      'Data_Interpretation': 'data-interpretation',
    }
  },
  {
    root: 'C:\\Users\\mahes\\Downloads\\geeksforgeeks',
    format: 'gfg',
    categoryMap: {
      'Logical_Reasoning': 'logical',
      'Quantitative_Aptitude': 'quantitative',
      'Verbal_Ability': 'verbal',
      'Data_Interpretation': 'data-interpretation',
    }
  },
];

const CAP = parseInt(process.argv[2], 10) || 200;
const TOPIC_LIMIT = CAP;

// Category mapping from dataset folders to app categories
const FOLDER_CATEGORY = {
  'Logical_Reasoning': 'logical',
  'Quantitative_Aptitude': 'quantitative',
  'Verbal_Ability': 'verbal',
  'Data_Interpretation': 'data-interpretation',
};

// ──────────────────────────────────────────────────────────────
// CSV Parser (handles quoted fields with commas/newlines)
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else {
        cur += c;
      }
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = ''; }
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// ──────────────────────────────────────────────────────────────
// Helpers
function normalizeAnswer(ans) {
  if (!ans) return 'A';
  const a = String(ans).trim().toUpperCase();
  if (['A','B','C','D'].includes(a)) return a;
  if (a === 'OPTION A') return 'A';
  if (a === 'OPTION B') return 'B';
  if (a === 'OPTION C') return 'C';
  if (a === 'OPTION D') return 'D';
  if (a === '1') return 'A';
  if (a === '2') return 'B';
  if (a === '3') return 'C';
  if (a === '4') return 'D';
  if (/^OPTION\s*[A-D]$/i.test(a)) return a.slice(-1).toUpperCase();
  if (a === '1') return 'A';
  if (a === '2') return 'B';
  if (a === '3') return 'C';
  if (a === '4') return 'D';
  return 'A';
}

function cleanText(text) {
  if (!text) return '';
  return String(text).trim().replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ');
}

function inferDifficulty(question, options) {
  if (!question) return 'medium';
  const combinedText = (question + ' ' + Object.values(options || {}).join(' ')).toLowerCase();
  const hardKeywords = ['recursion', 'dynamic programming', 'dp', 'graph', 'tree', 'bitwise', 'backtracking', 'segment tree', 'fenwick', 'trie', 'suffix', 'kmp', 'z-algorithm', 'backtracking', 'branch and bound', 'np-hard'];
  const mediumKeywords = ['binary search', 'two pointer', 'sliding window', 'prefix sum', 'hash map', 'hash set', 'heap', 'priority queue', 'stack', 'queue', 'linked list', 'dfs', 'bfs', 'sort', 'greedy', 'divide and conquer'];
  const text = (question + ' ' + Object.values(options || {}).join(' ')).toLowerCase();
  if (hardKeywords.some(k => text.includes(k))) return 'hard';
  if (mediumKeywords.some(k => text.includes(k))) return 'medium';
  return 'medium';
}

// ──────────────────────────────────────────────────────────────
// CSV Parsers
// ============================================================

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else {
        cur += c;
      }
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = ''; }
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function parseCsvToObjects(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  const rowsData = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue;
    const obj = {};
    headers.forEach((h, i) => { obj[headers[i]] = row[i] || ''; });
    rowsData.push(obj);
  }
  return rowsData;
}

// Parse functions for each format
async function parsePrepinstaFile(filePath, category) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue;
    const obj = {};
    headers.forEach((h, i) => { obj[headers[i]] = row[i] || ''; });
    const question = cleanText(obj.Question || obj.question || '');
    if (!question) continue;
    const options = {
      A: cleanText(obj['Option A']),
      B: cleanText(obj['Option B']),
      C: cleanText(obj['Option C']),
      D: cleanText(obj['Option D']),
    };
    const answer = normalizeAnswer(obj.Answer);
    if (!['A','B','C','D'].includes(answer)) continue;
    if (!options.A || !options.B || !options.C || !options.D) continue;
    results.push({
      question: cleanText(question),
      options: {
        A: cleanText(obj['Option A']),
        B: cleanText(obj['Option B']),
        C: cleanText(obj['Option C']),
        D: cleanText(obj['Option D']),
      },
      answer: normalizeAnswer(obj.Answer),
      category: 'logical', // will be overridden
      difficulty: inferDifficulty(question, options),
      explanation: '',
      source: 'prepinsta',
    });
  }
  return results;
}

async function parseIndiabixFile(filePath, category) {
  return parsePrepinstaFile(filePath, category); // same format
}

async function parseGfgFile(filePath, category) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue;
    const obj = {};
    headers.forEach((h, i) => { obj[headers[i]] = row[i] || ''; });
    const question = cleanText(obj.Question);
    if (!question) continue;
    const options = {
      A: cleanText(obj.Option_A),
      B: cleanText(obj.Option_B),
      C: cleanText(obj.Option_C),
      D: cleanText(obj.Option_D),
    };
    const answer = normalizeAnswer(obj.Correct_Answer);
    if (!['A','B','C','D'].includes(answer)) continue;
    if (!options.A || !options.B || !options.C || !options.D) continue;
    results.push({
      question: cleanText(question),
      options: {
        A: cleanText(obj.Option_A),
        B: cleanText(obj.Option_B),
        C: cleanText(obj.Option_C),
        D: cleanText(obj.Option_D),
      },
      answer: normalizeAnswer(obj.Correct_Answer),
      category: 'logical', // will be overridden
      difficulty: inferDifficulty(question, options),
      explanation: '',
      source: 'gfg',
    });
  }
  return results;
}

// Deduplication
function deduplicate(questions) {
  const seen = new Map();
  for (const q of questions) {
    const key = q.question.toLowerCase().replace(/[^a-z0-9]/gi, '').substring(0, 100);
    if (!seen.has(key)) seen.set(key, q);
  }
  return Array.from(seen.values());
}

// ============================================================
// MAIN IMPORT
// ============================================================

async function main() {
  const CAP = parseInt(process.argv[2], 10) || 200;
  console.log(`🚀 Starting import with cap: ${CAP} per topic`);

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hireadyDB');
  console.log('✅ Connected to MongoDB');

  const allQuestions = [];

  // ── Process each source ─────────────────────────────────────
  for (const source of SOURCES) {
    console.log(`\n📂 Processing source: ${source.root} (${source.format})`);
    const topics = fs.readdirSync(source.root).filter(d => 
      fs.statSync(path.join(source.root, d)).isDirectory()
    );

    for (const topic of topics) {
      const category = FOLDER_CATEGORY[topic] || 'general';
      const topicPath = path.join(source.root, topic);
      const files = fs.readdirSync(topicPath).filter(f => f.endsWith('.csv'));

      let total = 0;
      for (const file of files) {
        const filePath = path.join(topicPath, file);
        let questions = [];

        if (source.format === 'prepinsta' || source.format === 'indiabix') {
          questions = await parsePrepinstaFile(path.join(topicPath, file), topic);
        } else if (source.format === 'gfg') {
          questions = await parseGfgFile(path.join(topicPath, file), topic);
        }

        // Apply category and difficulty
        for (const q of questions) {
          q.category = FOLDER_CATEGORY[topic] || 'general';
          q.difficulty = inferDifficulty(q.question, q.options);
        }

        allQuestions.push(...questions);
        total += questions.length;
      }

      console.log(`  ✅ ${topic}: ${total} questions`);
    }
  }

  // Deduplicate
  console.log('\n🔍 Deduplicating...');
  const unique = deduplicate(allQuestions);
  console.log(`📦 Unique questions: ${unique.length} (removed ${allQuestions.length - unique.length} duplicates)`);

  // Cap per topic
  const byCategory = {};
  for (const q of unique) {
    const cat = q.category || 'general';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(q);
  }

  const finalQuestions = [];
  for (const [cat, questions] of Object.entries(byCategory)) {
    const shuffled = questions.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, CAP);
    finalQuestions.push(...selected);
    console.log(`  ${cat}: ${selected.length} questions (from ${byCategory[cat].length} available)`);
  }

  // Assign difficulty if not set
  for (const q of finalQuestions) {
    if (!q.difficulty) {
      q.difficulty = inferDifficulty(q.question, q.options);
    }
  }

  // Insert into MongoDB
  console.log('\n💾 Inserting into MongoDB...');
  let inserted = 0;
  for (const q of finalQuestions) {
    try {
      await Question.create({
        Question: q.question,
        'Option A': q.options.A,
        'Option B': q.options.B,
        'Option C': q.options.C,
        'Option D': q.options.D,
        Answer: q.answer,
        Explanation: q.explanation || '',
        category: q.category,
        difficulty: q.difficulty,
      });
      inserted++;
    } catch (err) {
      console.error('Insert failed:', err.message);
    }
  }

  console.log(`\n✅ Done! Inserted ${inserted} questions.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});