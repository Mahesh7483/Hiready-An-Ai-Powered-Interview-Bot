const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAdmin } = require('../../middleware/auth');
const CodingQuestion = require('../../models/CodingQuestion');
const { parseCsv } = require('../../utils/csvParser');
const pagination = require('../../utils/pagination');

const MAX_IMPORT = 100;
const ALLOWED_FIELDS = [
  'title', 'slug', 'description', 'difficulty', 'category', 'tags',
  'starterCode', 'solution', 'testCases', 'starterFiles', 'solutionFiles',
  'constraints', 'timeLimit', 'memoryLimit', 'company', 'frequency',
  'relatedTopics', 'explanation', 'isPublished', 'isActive'
];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const CATEGORIES = ['arrays', 'strings', 'linked-lists', 'trees', 'graphs', 'dynamic-programming', 'sorting', 'searching', 'greedy', 'backtracking', 'bit-manipulation', 'math', 'geometry', 'databases', 'system-design'];

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function pickAllowed(body) {
  const out = {};
  for (const k of ALLOWED_FIELDS) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

function validateCodingPayload(body, isUpdate = false) {
  // On update, allow partial
  if (!isUpdate || body.title !== undefined) {
    if (!body.title || typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) return 'title is required (1-200 chars)';
  }
  if (!isUpdate || body.description !== undefined) {
    if (!body.description || typeof body.description !== 'string' || body.description.trim().length < 20) return 'description is required (min 20 chars)';
    if (body.description.length > 20000) return 'description too long (max 20000)';
  }
  if (!isUpdate || body.difficulty !== undefined) {
    if (!body.difficulty || !DIFFICULTIES.includes(String(body.difficulty).toLowerCase())) return 'difficulty must be one of ' + DIFFICULTIES.join(', ');
  }
  if (body.category !== undefined && body.category !== '' && !CATEGORIES.includes(String(body.category).toLowerCase())) return 'category must be one of ' + CATEGORIES.join(', ');
  if (body.slug !== undefined && body.slug !== '' && !/^[a-z0-9-]+$/.test(String(body.slug).toLowerCase())) return 'slug must be lowercase alphanumeric with dashes';
  if (body.testCases !== undefined) {
    if (!Array.isArray(body.testCases)) return 'testCases must be an array';
    if (body.testCases.length > 20) return 'testCases max 20';
    for (let i = 0; i < body.testCases.length; i++) {
      const tc = body.testCases[i];
      if (!tc || typeof tc.input !== 'string' || typeof tc.output !== 'string') return `testCases[${i}] input/output required strings`;
      if (tc.input.length > 50000 || tc.output.length > 50000) return `testCases[${i}] input/output too large`;
      if (tc.points !== undefined && (typeof tc.points !== 'number' || tc.points < 1 || tc.points > 10)) return `testCases[${i}] points 1-10`;
    }
  }
  if (body.timeLimit !== undefined && (typeof body.timeLimit !== 'number' || body.timeLimit < 500 || body.timeLimit > 30000)) return 'timeLimit 500-30000 ms';
  if (body.memoryLimit !== undefined && (typeof body.memoryLimit !== 'number' || body.memoryLimit < 64 || body.memoryLimit > 512)) return 'memoryLimit 64-512 MB';
  return null;
}

function genSlug(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'untitled';
}

// GET /api/admin/coding-questions?page=&category=&difficulty=&search=
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req);
    const filter = {};
    if (req.query.category && CATEGORIES.includes(String(req.query.category).toLowerCase())) filter.category = String(req.query.category).toLowerCase();
    if (req.query.difficulty && DIFFICULTIES.includes(String(req.query.difficulty).toLowerCase())) filter.difficulty = String(req.query.difficulty).toLowerCase();
    if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim()) {
      const s = escapeRegex(req.query.search.trim().slice(0, 100));
      filter.title = { $regex: s, $options: 'i' };
    }
    if (req.query.published !== undefined) filter.isPublished = req.query.published === 'true';

    const [questions, total] = await Promise.all([
      CodingQuestion.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CodingQuestion.countDocuments(filter)
    ]);
    res.json({ page, pages: Math.max(Math.ceil(total / limit), 1), total, questions });
  } catch (err) {
    console.error('Admin questions error:', err.message);
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

// Legacy alias
router.get('/questions', requireAdmin, async (req, res) => {
  res.redirect(307, `/api/admin/coding-questions?${new URLSearchParams(req.query).toString()}`);
});

// POST /api/admin/coding-questions
router.post('/', requireAdmin, async (req, res) => {
  try {
    const data = pickAllowed(req.body);
    // Normalize difficulty/category lowercase
    if (data.difficulty) data.difficulty = String(data.difficulty).toLowerCase();
    if (data.category) data.category = String(data.category).toLowerCase();
    if (!data.slug && data.title) data.slug = genSlug(data.title);
    else if (data.slug) data.slug = genSlug(data.slug);
    const invalid = validateCodingPayload(data);
    if (invalid) return res.status(400).json({ error: invalid });
    // Deduplicate slug on collision
    const slugBase = data.slug;
    let counter = 1;
    while (await CodingQuestion.findOne({ slug: data.slug }).lean()) {
      counter += 1;
      data.slug = `${slugBase}-${counter}`.slice(0, 100);
      if (counter > 20) return res.status(400).json({ error: 'slug collision too many, pick different title' });
    }
    const question = await CodingQuestion.create({ ...data, createdBy: req.user.id });
    res.status(201).json(question);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'slug already exists' });
    console.error('Create question error:', err.message);
    res.status(500).json({ error: 'Failed to create question' });
  }
});
router.post('/questions', requireAdmin, (req, res) => {
  req.url = '/'; req.method = 'POST'; router.handle(req, res);
});

// GET /api/admin/coding-questions/:id
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const question = await CodingQuestion.findById(req.params.id).lean();
    if (!question) return res.status(404).json({ error: 'Not found' });
    res.json(question);
  } catch (err) {
    console.error('Get question error:', err.message);
    res.status(500).json({ error: 'Failed to load question' });
  }
});

// PUT /api/admin/coding-questions/:id
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const data = pickAllowed(req.body);
    if (data.difficulty) data.difficulty = String(data.difficulty).toLowerCase();
    if (data.category) data.category = String(data.category).toLowerCase();
    if (data.slug) data.slug = genSlug(data.slug);
    const invalid = validateCodingPayload(data, true);
    if (invalid) return res.status(400).json({ error: invalid });
    // Prevent overwriting slug to colliding value
    if (data.slug) {
      const existing = await CodingQuestion.findOne({ slug: data.slug, _id: { $ne: req.params.id } }).lean();
      if (existing) return res.status(409).json({ error: 'slug already exists' });
    }
    const question = await CodingQuestion.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true, runValidators: true }
    ).lean();
    if (!question) return res.status(404).json({ error: 'Not found' });
    res.json(question);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'slug already exists' });
    console.error('Update question error:', err.message);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// DELETE /api/admin/coding-questions/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await CodingQuestion.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Question deleted' });
  } catch (err) {
    console.error('Delete question error:', err.message);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// POST /api/admin/coding-questions/bulk
router.post('/bulk', requireAdmin, async (req, res) => {
  try {
    let items = [];
    if (Array.isArray(req.body.items)) {
      items = req.body.items;
    } else if (typeof req.body.csv === 'string' && req.body.csv.trim()) {
      const rows = parseCsv(req.body.csv);
      if (rows.length < 2) return res.status(400).json({ error: 'CSV needs header plus data' });
      const header = rows[0].map((h) => h.trim());
      items = rows.slice(1).map((cells) => {
        const obj = {}; header.forEach((h, idx) => { obj[h] = (cells[idx] || '').trim(); }); return obj;
      });
    } else return res.status(400).json({ error: 'Provide items array or csv string' });

    if (items.length === 0) return res.status(400).json({ error: 'No questions provided' });
    if (items.length > MAX_IMPORT) return res.status(400).json({ error: `Maximum ${MAX_IMPORT} per import` });

    const dryRun = req.body.dryRun === true;
    const docs = [];
    const errors = [];
    const seenSlugs = new Set();

    items.forEach((item, idx) => {
      const normalized = {
        title: (item.title || item.Question || '').trim(),
        description: (item.description || item.Description || 'Imported question').trim(),
        difficulty: String(item.difficulty || 'easy').trim().toLowerCase(),
        category: String(item.category || 'arrays').trim().toLowerCase(),
        tags: item.tags ? String(item.tags).split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [],
        starterCode: {
          python: item.starterCode?.python || item['starterCode.python'] || '',
          javascript: item.starterCode?.javascript || item['starterCode.javascript'] || '',
          typescript: item.starterCode?.typescript || item['starterCode.typescript'] || '',
          java: item.starterCode?.java || item['starterCode.java'] || '',
          go: item.starterCode?.go || item['starterCode.go'] || '',
          cpp: item.starterCode?.cpp || item['starterCode.cpp'] || '',
          rust: item.starterCode?.rust || item['starterCode.rust'] || '',
        },
        solution: {
          python: item.solution?.python || item['solution.python'] || '',
          javascript: item.solution?.javascript || item['solution.javascript'] || '',
          java: item.solution?.java || item['solution.java'] || '',
        },
        testCases: parseTestCases(item),
        constraints: typeof item.constraints === 'string' ? item.constraints.slice(0, 2000) : '',
        timeLimit: item.timeLimit ? parseInt(item.timeLimit, 10) : 2000,
        memoryLimit: item.memoryLimit ? parseInt(item.memoryLimit, 10) : 256,
        isPublished: item.isPublished === true || item.isPublished === 'true',
      };
      if (!DIFFICULTIES.includes(normalized.difficulty)) normalized.difficulty = 'easy';
      if (!CATEGORIES.includes(normalized.category)) normalized.category = 'arrays';
      normalized.slug = genSlug(normalized.title);
      // dedup within batch
      const base = normalized.slug;
      let c = 1;
      while (seenSlugs.has(normalized.slug)) {
        c += 1; normalized.slug = `${base}-${c}`.slice(0, 100);
      }
      seenSlugs.add(normalized.slug);
      const invalid = validateCodingPayload(normalized);
      if (invalid) errors.push({ row: idx + 1, error: invalid });
      else docs.push(normalized);
    });

    if (dryRun) return res.json({ dryRun: true, wouldImport: docs.length, errorCount: errors.length, errors: errors.slice(0, 20) });

    let inserted = [];
    let bulkError = null;
    if (docs.length > 0) {
      // Check DB slug collisions
      const existingSlugs = new Set((await CodingQuestion.find({ slug: { $in: docs.map(d=>d.slug) } }).select('slug').lean()).map(d=>d.slug));
      const filtered = [];
      docs.forEach(d => {
        if (existingSlugs.has(d.slug)) errors.push({ row: 'db', error: `slug ${d.slug} already exists` });
        else filtered.push(d);
      });
      if (filtered.length) {
        try {
          inserted = await CodingQuestion.insertMany(filtered.map(d=>({...d, createdBy: req.user.id})), { ordered: false });
        } catch (e) {
          bulkError = e;
          // insertMany ordered:false may partially succeed — extract inserted
          if (e.insertedDocs) inserted = e.insertedDocs;
          else if (e.result && e.result.nInserted) inserted = filtered.slice(0, e.result.nInserted);
        }
      }
    }
    res.json({ imported: inserted.length, failed: errors.length, errors: errors.slice(0, 20), bulkError: bulkError ? bulkError.message.slice(0,200) : undefined });
  } catch (err) {
    console.error('Bulk import error:', err.message);
    res.status(500).json({ error: 'Failed to import questions' });
  }
});
router.post('/questions/bulk', requireAdmin, (req, res) => { req.url = '/bulk'; req.method='POST'; router.handle(req,res); });

function parseTestCases(item) {
  const cases = [];
  for (let i = 1; i <= 10; i++) {
    const input = item[`testCase${i}Input`] ?? item[`input${i}`];
    const output = item[`testCase${i}Output`] ?? item[`output${i}`] ?? item[`expected${i}`];
    if (input === undefined || output === undefined) continue;
    const sIn = String(input).trim(); const sOut = String(output).trim();
    if (sIn === '' && sOut === '') continue;
    const isHidden = item[`testCase${i}Hidden`] === 'true' || item[`testCase${i}Hidden`] === true;
    const points = parseInt(item[`testCase${i}Points`] || item[`points${i}`] || '1', 10) || 1;
    const description = item[`testCase${i}Description`] || item[`explanation${i}`] || '';
    cases.push({ input: sIn, output: sOut, isHidden: Boolean(isHidden), points: Math.max(1, Math.min(10, points)), description: String(description).slice(0,500) });
  }
  return cases;
}

module.exports = router;
