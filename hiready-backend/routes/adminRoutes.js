const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Question = require('../models/Question');
const TestResult = require('../models/TestResult');
const ProctorLog = require('../models/ProctorLog');
const { requireAdmin } = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');
const Announcement = require('../models/Announcement');

// Every route below requires a valid JWT AND the admin role (fresh DB check)
router.use(requireAdmin);

// Audit trail: automatically record every admin mutation (POST/PUT/PATCH/DELETE)
router.use((req, res, next) => {
  if (req.method !== 'GET') {
    AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email || '',
      action: req.method + ' ' + req.originalUrl,
      target: req.params && req.params.id ? req.params.id : '',
      meta: { bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body).slice(0, 15) : [] },
    }).catch((err) => console.warn('Audit log failed:', err.message));
  }
  next();
});

const CATEGORIES = ['logical', 'quantitative', 'verbal'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function clampPage(req) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

function escapeRegex(str) { return String(str).replace(/[.*+?^{}()|[\\]\\\\]/g, String.fromCharCode(39) + String.fromCharCode(92) + String.fromCharCode(36) + String.fromCharCode(38) + String.fromCharCode(39)); }

// GET /api/admin/me

function escapeCsvField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function arrayToCsv(rows, headers) {
  const headerLine = headers.map(escapeCsvField).join(',');
  const dataLines = rows.map(row => headers.map(h => escapeCsvField(row[h])).join(','));
  return [headerLine, ...dataLines].join('\n');
}


/** Fire-and-forget audit trail for admin mutations (never blocks the request). */
function logAdminAction(req, action, target = '', meta = {}) {
  AuditLog.create({
    adminId: req.user.id,
    adminEmail: req.user.email || '',
    action,
    target,
    meta,
  }).catch((err) => console.warn('Audit log failed:', err.message));
}

// GET /api/admin/audit-logs — accountability trail (latest 200)
router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json({ logs });
  } catch (err) {
    console.error('Audit logs error:', err.message);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

// GET /api/admin/announcements — all announcements (admin view)
router.get('/announcements', async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(20).lean();
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load announcements' });
  }
});

// POST /api/admin/announcements — broadcast a banner to all users
router.post('/announcements', async (req, res) => {
  try {
    const { message, level = 'info' } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required' });
    }
    const announcement = await Announcement.create({
      message: message.trim().slice(0, 500),
      level: ['info', 'warning', 'success'].includes(level) ? level : 'info',
      createdBy: req.user.id,
    });
    logAdminAction(req, 'announcement.create', 'Announcement:' + announcement._id, { level });
    res.status(201).json(announcement);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// DELETE /api/admin/announcements/:id — deactivate (soft delete)
router.delete('/announcements/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true }
    );
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    logAdminAction(req, 'announcement.deactivate', 'Announcement:' + req.params.id);
    res.json(announcement);
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate announcement' });
  }
});

// GET /api/admin/me — current admin's identity
router.get('/me', async (req, res) => {
  const user = await User.findById(req.user.id).select('name email role').lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// GET /api/admin/overview — dashboard stats + chart series
router.get('/overview', async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d7 = new Date(startOfToday.getTime() - 6 * 86400000);
    const d14 = new Date(startOfToday.getTime() - 13 * 86400000);
    const d30 = new Date(startOfToday.getTime() - 29 * 86400000);

    const [
      totalUsers,
      newUsers30d,
      totalQuestions,
      questionsByCategory,
      totalTests,
      tests7d,
      avgScoreAgg,
      violationByEvent,
      testsPerDay
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: d30 } }),
      Question.countDocuments({}),
      Question.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      TestResult.countDocuments({}),
      TestResult.countDocuments({ createdAt: { $gte: d7 } }),
      TestResult.aggregate([
        { $match: { totalQuestions: { $gt: 0 } } },
        { $group: { _id: null, avgPct: { $avg: { $divide: ['$score', '$totalQuestions'] } } } }
      ]),
      ProctorLog.aggregate([
        { $match: { timestamp: { $gte: d30 } } },
        { $group: { _id: '$event', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 }
      ]),
      TestResult.aggregate([
        { $match: { createdAt: { $gte: d14 } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      totals: {
        users: totalUsers,
        newUsers30d,
        questions: totalQuestions,
        tests: totalTests,
        tests7d
      },
      avgScorePct: Math.round(((avgScoreAgg[0] && avgScoreAgg[0].avgPct) || 0) * 100),
      questionsByCategory: questionsByCategory.map((c) => ({ category: c._id || 'unknown', count: c.count })),
      violationEvents: violationByEvent.map((v) => ({ event: v._id || 'unknown', count: v.count })),
      testsOverTime: testsPerDay.map((d) => ({ date: d._id, count: d.count }))
    });
  } catch (err) {
    console.error('Admin overview error:', err.message);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

// ── Users ────────────────────────────────────────────────────────────

// GET /api/admin/users?page=&limit=&search=&role=
router.get('/users', async (req, res) => {
  try {
    const { page, limit, skip } = clampPage(req);
    const filter = {};
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    if (req.query.role === 'admin' || req.query.role === 'user') {
      filter.role = req.query.role;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('name email role firebaseUid createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    // Test counts for the listed users in one aggregation
    const ids = users.map((u) => u._id);
    const counts = await TestResult.aggregate([
      { $match: { userId: { $in: ids.map(String) } } },
      { $group: { _id: '$userId', tests: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.tests]));

    res.json({
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      total,
      users: users.map((u) => ({
        ...u,
        testCount: countMap.get(String(u._id)) || 0
      }))
    });
  } catch (err) {
    console.error('Admin users error:', err.message);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// GET /api/admin/users/export.csv — export users to CSV
router.get('/users/export.csv', async (req, res) => {
  try {
    const users = await User.find({})
      .select('name email role createdAt testCount')
      .sort({ createdAt: -1 })
      .lean();
    const csv = arrayToCsv(users, ['name', 'email', 'role', 'createdAt', 'testCount']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Export users error:', err.message);
    res.status(500).json({ error: 'Failed to export users' });
  }
});

// GET /api/admin/results/export.csv — export test results to CSV
router.get('/results/export.csv', async (req, res) => {
  try {
    const filter = {};
    if (req.query.mode && req.query.mode !== 'all') filter.mode = req.query.mode;
    if (req.query.topic && req.query.topic !== 'all') filter.topic = req.query.topic;
    if (req.query.userId) filter.userId = req.query.userId;

    const results = await TestResult.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const csv = arrayToCsv(results, [
      '_id', 'userId', 'mode', 'score', 'totalQuestions', 'topic', 'difficulty',
      'timeTaken', 'warningCount', 'negativeMarking', 'preset', 'createdAt'
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="test-results.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Export results error:', err.message);
    res.status(500).json({ error: 'Failed to export results' });
  }
});

// GET /api/admin/proctor-logs/export.csv — export proctor logs to CSV
router.get('/proctor-logs/export.csv', async (req, res) => {
  try {
    const filter = {};
    if (req.query.event) filter.event = req.query.event;
    if (req.query.sessionId) filter.sessionId = req.query.sessionId;

    const logs = await ProctorLog.find(filter)
      .sort({ timestamp: -1 })
      .lean();

    const csv = arrayToCsv(logs, [
      '_id', 'sessionId', 'userId', 'event', 'timestamp', 'receivedAt', 'hasSnapshot'
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="proctor-logs.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Export proctor logs error:', err.message);
    res.status(500).json({ error: 'Failed to export proctor logs' });
  }
});

// GET /api/admin/users/:id — profile with results and proctor logs
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [results, logs] = await Promise.all([
      TestResult.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(50).lean(),
      ProctorLog.find({ userId: req.params.id }).sort({ receivedAt: -1 }).limit(100).lean()
    ]);

    res.json({
      user,
      results,
      logs: logs.map((l) => ({ event: l.event, sessionId: l.sessionId, timestamp: l.timestamp }))
    });
  } catch (err) {
    console.error('Admin user detail error:', err.message);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// PUT /api/admin/users/:id/role — promote/demote (cannot change yourself)
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: "role must be 'user' or 'admin'" });
    }
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('name email role');

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: `Role updated`, user });
  } catch (err) {
    console.error('Admin set role error:', err.message);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/admin/users/:id — delete user + cascade; admins are protected
router.delete('/users/:id', async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const target = await User.findById(req.params.id).select('role').lean();
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'admin') {
      return res.status(400).json({ error: 'Demote this admin before deleting' });
    }

    await Promise.all([
      User.deleteOne({ _id: req.params.id }),
      TestResult.deleteMany({ userId: req.params.id }),
      ProctorLog.deleteMany({ userId: req.params.id })
    ]);

    res.json({ message: 'User and associated data deleted' });
  } catch (err) {
    console.error('Admin delete user error:', err.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ── Question bank ────────────────────────────────────────────────────

function validateQuestionPayload(body) {
  const q = body.Question;
  const opts = {
    A: body['Option A'],
    B: body['Option B'],
    C: body['Option C'],
    D: body['Option D']
  };
  if (!q || typeof q !== 'string' || !q.trim()) return 'Question text is required';
  for (const key of Object.keys(opts)) {
    const v = opts[key];
    if (v === undefined || v === null || String(v).trim() === '') return `Option ${key} is required`;
  }
  if (!['A', 'B', 'C', 'D'].includes(body.Answer)) return 'Answer must be one of A, B, C, D';
  if (!CATEGORIES.includes(body.category)) return `category must be one of: ${CATEGORIES.join(', ')}`;
  if (body.difficulty && !DIFFICULTIES.includes(body.difficulty)) {
    return `difficulty must be one of: ${DIFFICULTIES.join(', ')}`;
  }
  return null;
}

// GET /api/admin/questions?page=&category=&difficulty=&search=
router.get('/questions', async (req, res) => {
  try {
    const { page, limit, skip } = clampPage(req);
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    if (req.query.search) filter.Question = new RegExp(escapeRegex(req.query.search), 'i');

    const [questions, total] = await Promise.all([
      Question.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
      Question.countDocuments(filter)
    ]);

    res.json({ page, pages: Math.max(Math.ceil(total / limit), 1), total, questions });
  } catch (err) {
    console.error('Admin questions error:', err.message);
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

// POST /api/admin/questions
router.post('/questions', async (req, res) => {
  try {
    const invalid = validateQuestionPayload(req.body);
    if (invalid) return res.status(400).json({ error: invalid });

    const question = await Question.create(req.body);
    res.status(201).json(question);
  } catch (err) {
    console.error('Admin create question error:', err.message);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// PUT /api/admin/questions/:id
router.put('/questions/:id', async (req, res) => {
  try {
    const invalid = validateQuestionPayload(req.body);
    if (invalid) return res.status(400).json({ error: invalid });

    const question = await Question.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).lean();

    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json(question);
  } catch (err) {
    console.error('Admin update question error:', err.message);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// DELETE /api/admin/questions/:id
router.delete('/questions/:id', async (req, res) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.id).lean();
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json({ message: 'Question deleted' });
  } catch (err) {
    console.error('Admin delete question error:', err.message);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

/**
 * Minimal CSV parser for bulk import.
 * Expected header: Question,"Option A","Option B","Option C","Option D",Answer,category,difficulty
 */
function parseCsv(text) {
  const rows = [];
  let cur = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (cur !== '' || row.length > 0) {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = '';
      }
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// POST /api/admin/questions/bulk — accepts { csv: "..." } or { items: [...] }, max 500
router.post('/questions/bulk', async (req, res) => {
  try {
    const MAX = 500;
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
    if (items.length > MAX) {
      return res.status(400).json({ error: `Maximum ${MAX} questions per import` });
    }

    const dryRun = Boolean(req.body.dryRun);

    const docs = [];
    const errors = [];
    items.forEach((item, idx) => {
      const normalized = {
        Question: item.Question,
        'Option A': item['Option A'],
        'Option B': item['Option B'],
        'Option C': item['Option C'],
        'Option D': item['Option D'],
        Answer: typeof item.Answer === 'string' ? item.Answer.trim().toUpperCase() : item.Answer,
        category:
          typeof item.category === 'string' ? item.category.trim().toLowerCase() : undefined,
        difficulty:
          typeof item.difficulty === 'string' && item.difficulty.trim()
            ? item.difficulty.trim().toLowerCase()
            : null,
        Explanation: typeof item.Explanation === 'string' ? item.Explanation.slice(0, 2000) : ''
      };
      if (!normalized.category) normalized.category = 'logical';
      const invalid = validateQuestionPayload(normalized);
      if (invalid) {
        errors.push({ row: idx + 1, error: invalid });
      } else {
        docs.push(normalized);
      }
    });

    let inserted = [];
    if (docs.length > 0) {
      if (!dryRun) {
        inserted = await Question.insertMany(docs, { ordered: false });
      } else {
        // Dry run: just validate, don't insert
        inserted = docs;
      }
    }

    res.json({
      imported: inserted.length,
      failed: errors.length,
      errors: errors.slice(0, 20),
      dryRun: dryRun || false
    });
  } catch (err) {
    console.error('Admin bulk import error:', err.message);
    res.status(500).json({ error: 'Bulk import failed' });
  }
});

// ── Test results ─────────────────────────────────────────────────────

// GET /api/admin/results?page=&mode=&topic=&userId=
router.get('/results', async (req, res) => {
  try {
    const { page, limit, skip } = clampPage(req);
    const filter = {};
    if (req.query.mode === 'practice' || req.query.mode === 'test') filter.mode = req.query.mode;
    if (req.query.topic) filter.topic = req.query.topic;
    if (req.query.userId) filter.userId = req.query.userId;

    const [results, total] = await Promise.all([
      TestResult.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      TestResult.countDocuments(filter)
    ]);

    // Join user emails/names in one query
    const userIds = [...new Set(results.map((r) => r.userId))];
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), { name: u.name, email: u.email }]));

    res.json({
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      total,
      results: results.map((r) => ({
        ...r,
        selectedAnswers: r.selectedAnswers || [],
        user: userMap.get(r.userId) || null
      }))
    });
  } catch (err) {
    console.error('Admin results error:', err.message);
    res.status(500).json({ error: 'Failed to load results' });
  }
});

// ── Proctoring feed ──────────────────────────────────────────────────

// GET /api/admin/proctor-logs?page=&event=&sessionId=
router.get('/proctor-logs', async (req, res) => {
  try {
    const { page, limit, skip } = clampPage(req);
    const filter = {};
    if (req.query.event) filter.event = req.query.event;
    if (req.query.sessionId) filter.sessionId = req.query.sessionId;

    const [logs, total, eventTypes] = await Promise.all([
      ProctorLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      ProctorLog.countDocuments(filter),
      ProctorLog.distinct('event')
    ]);

    const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), { name: u.name, email: u.email }]));

    res.json({
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      total,
      eventTypes: eventTypes.sort(),
      logs: logs.map((l) => ({
        id: l._id,
        event: l.event,
        sessionId: l.sessionId,
        timestamp: l.timestamp,
        receivedAt: l.receivedAt,
        hasSnapshot: Boolean(l.snapshot),
        user: l.userId ? userMap.get(l.userId) || null : null
      }))
    });
  } catch (err) {
    console.error('Admin proctor logs error:', err.message);
    res.status(500).json({ error: 'Failed to load proctor logs' });
  }
});

// GET /api/admin/proctor-logs/:id/snapshot — evidence thumbnail for one log
router.get('/proctor-logs/:id/snapshot', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const log = await ProctorLog.findById(req.params.id).select('snapshot').lean();
    if (!log || !log.snapshot) return res.status(404).json({ error: 'No snapshot' });
    res.json({ snapshot: log.snapshot });
  } catch (err) {
    console.error('Snapshot fetch error:', err.message);
    res.status(500).json({ error: 'Failed to load snapshot' });
  }
});

// ── Flagged interview sessions (terminated first, then by violations) ──

// GET /api/admin/interview-sessions?flagged=1&page=
router.get('/interview-sessions', async (req, res) => {
  try {
    const { page, limit, skip } = clampPage(req);
    const filter = {};
    if (req.query.flagged === '1') filter['integrity.terminated'] = true;

    const InterviewSession = require('../models/InterviewSession');
    const [sessions, total] = await Promise.all([
      InterviewSession.find(filter)
        .sort({ 'integrity.terminated': -1, 'integrity.violations': -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('sessionId role experienceLevel mode durationSeconds integrity createdAt')
        .lean(),
      InterviewSession.countDocuments(filter)
    ]);

    const userIds = [...new Set(sessions.map((s) => s.user).filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } }).select('name email').lean();
    const userMap = new Map(users.map((u) => [String(u._id), { name: u.name, email: u.email }]));

    res.json({
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      total,
      sessions: sessions.map((s) => ({
        ...s,
        user: s.user ? userMap.get(String(s.user)) || null : null
      }))
    });
  } catch (err) {
    console.error('Admin interview sessions error:', err.message);
    res.status(500).json({ error: 'Failed to load interview sessions' });
  }
});

module.exports = router;

