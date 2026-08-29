const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const CodingQuestion = require('../models/CodingQuestion');
const { parseCsv } = require('../utils/csvParser');

const MAX_IMPORT = 100;

// GET /api/admin/coding-questions?page=&category=&difficulty=&search=
router.get('/questions', requireAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = require('../utils/pagination')(req);
    const filter = {};

    if (req.query.category) filter.category = req.query.category;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    if (req.query.search) filter.title = { $regex: new RegExp(req.query.search, 'i') };
    if (req.query.published !== undefined) filter.isPublished = req.query.published === 'true';

    const [questions, total] = await Promise.all([
      CodingQuestion.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CodingQuestion.countDocuments(filter)
    ]);

    res.json({
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      total,
      questions,
    });
  } catch (err) {
    console.error('Admin questions error:', err.message);
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

// POST /api/admin/coding-questions
router.post('/questions', requireAdmin, async (req, res) => {
  try {
    const invalid = validateQuestionPayload(req.body);
    if (invalid) return res.status(400).json({ error: invalid });

    const question = await CodingQuestion.create({
      ...req.body,
      createdBy: req.user.id,
    });

    res.status(201).json(question);
  } catch (err) {
    console.error('Create question error:', err.message);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// GET /api/admin/coding-questions/:id
router.get('/questions/:id', requireAdmin, async (req, res) => {
  try {
    const question = await CodingQuestion.findById(req.params.id).lean();
    if (!question) return res.status(404).json({ error: 'Not found' });
    res.json(question);
  } catch (err) {
    console.error('Get question error:', err.message);
    res.status(500).json({ error: 'Failed to load question' });
  }
});

// PUT /api/admin/coding-questions/:id
router.put('/questions/:id', requireAdmin, async (req, res) => {
  try {
    const invalid = validateQuestionPayload(req.body);
    if (invalid) return res.status(400).json({ error: invalid });

    const question = await CodingQuestion.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).lean();

    if (!question) return res.status(404).json({ error: 'Not found' });
    res.json(question);
  } catch (err) {
    console.error('Update question error:', err.message);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// DELETE /api/admin/coding-questions/:id
router.delete('/questions/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await CodingQuestion.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Question deleted' });
  } catch (err) {
    console.error('Delete question error:', err.message);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// POST /api/admin/coding-questions/bulk
router.post('/questions/bulk', requireAdmin, async (req, res) => {
  try {
    let items = [];

    if (Array.isArray(req.body.items)) {
      items = req.body.items;
    } else if (typeof req.body.csv === 'string' && req.body.csv.trim()) {
      const rows = parseCsv(req.body.csv);
      if (rows.length < 2) {
        return res.status(400).json({ error: 'CSV needs a header row plus at least one data row' });
      }
      const header = rows[0].map((h) => h.trim());
      items = rows.slice(1).map((cells) => {
        const obj = {};
        header.forEach((h, idx) => {
          obj[h] = cells[idx];
        });
        return obj;
      });
    } else {
      return res.status(400).json({ error: 'Provide either items (array) or csv (string)' });
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'No questions provided' });
    }
    if (items.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 questions per import' });
    }

    const dryRun = req.body.dryRun === true;
    const docs = [];
    const errors = [];

    items.forEach((item, idx) => {
      const normalized = {
        title: item.Question || item.title,
        'Option A': item['Option A'],
        'Option B': item['Option B'],
        'Option C': item['Option C'],
        'Option D': item['Option D'],
        Answer: typeof item.Answer === 'string' ? item.Answer.trim().toUpperCase() : item.Answer,
        category: typeof item.category === 'string' ? item.category.trim().toLowerCase() : 'logical',
        difficulty: typeof item.difficulty === 'string' && item.difficulty.trim()
          ? item.difficulty.trim().toLowerCase() : 'easy',
        Explanation: typeof item.Explanation === 'string' ? item.Explanation.slice(0, 2000) : '',
        starterCode: {
          python: item.starterCode?.python || item['starterCode.python'] || '',
          javascript: item.starterCode?.javascript || item['starterCode.javascript'] || '',
          java: item.starterCode?.java || item['starterCode.java'] || '',
          go: item.starterCode?.go || item['starterCode.go'] || '',
        },
        testCases: parseTestCases(item),
      };

      if (!normalized.starterCode) normalized.starterCode = {};
      if (!normalized.starterCode.python) normalized.starterCode.python = '';
      if (!normalized.starterCode.javascript) normalized.starterCode.javascript = '';
      if (!normalized.starterCode.java) normalized.starterCode.java = '';
      if (!normalized.starterCode.go) normalized.starterCode.go = '';

      if (!normalized.title) normalized.title = item.title || item.Question;
      normalized.slug = (normalized.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 100);

      const invalid = validateQuestionPayload(normalized);
      if (invalid) {
        errors.push({ row: idx + 1, error: invalid });
      } else {
        docs.push(normalized);
      }
    });

    if (dryRun) {
      return res.json({
        dryRun: true,
        wouldImport: docs.length,
        errors: errors.length,
        errors: errors.slice(0, 20),
      });
    }

    let inserted = [];
    if (docs.length > 0) {
      inserted = await CodingQuestion.insertMany(docs, { ordered: false }).catch(() => []);
    }

    res.json({
      imported: inserted.length,
      failed: errors.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error('Bulk import error:', err.message);
    res.status(500).json({ error: 'Failed to import questions' });
  }
});

function parseTestCases(item) {
  const cases = [];
  // Try to parse test cases from various formats
  for (let i = 1; i <= 10; i++) {
    const input = item[`testCase${i}Input`] || item[`testCase${i}Input`] || item[`input${i}`];
    const output = item[`testCase${i}Output`] || item[`testCase${i}Output`] || item[`output${i}`] || item[`expected${i}`];
    const isHidden = item[`testCase${i}Hidden`] === 'true' || item[`testCase${i}Hidden`] === true;
    const points = parseInt(item[`testCase${i}Points`] || item[`points${i}`] || '1', 10) || 1;
    const description = item[`testCase${i}Description`] || item[`explanation${i}`] || '';

    if (input !== undefined && output !== undefined) {
      cases.push({
        input: String(input).trim(),
        output: String(output).trim(),
        isHidden: Boolean(isHidden),
        points: Math.max(1, Math.min(10, points)),
        description: String(description || '').slice(0, 500),
      });
    }
  }
  return cases;
}

function validateQuestionPayload(body) {
  const q = body.Question || body.title;
  const opts = {
    A: body['Option A'] || body['optionA'],
    B: body['Option B'] || body['optionB'],
    C: body['Option C'] || body['optionC'],
    D: body['Option D'] || body['optionD'],
  };
  if (!q || typeof q !== 'string' || !q.trim()) return 'Question text is required';
  for (const key of Object.keys(opts)) {
    const v = opts[key];
    if (v === undefined || v === null || String(v).trim() === '') return `Option ${key} is required`;
  }
  if (!['A', 'B', 'C', 'D'].includes(body.Answer)) return 'Answer must be one of A, B, C, D';
  return null;
}

module.exports = router;