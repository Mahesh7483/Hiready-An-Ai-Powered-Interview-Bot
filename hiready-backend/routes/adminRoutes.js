const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/User');
const Question = require('../models/Question');
const TestResult = require('../models/TestResult');
const ProctorLog = require('../models/ProctorLog');
const ProctorSnapshot = require('../models/ProctorSnapshot');
const CandidateCompanyConsent = require('../models/CandidateCompanyConsent');
const Application = require('../models/Application');
const CompanyMembership = require('../models/CompanyMembership');
const { requireAdmin } = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');
const Announcement = require('../models/Announcement');
const InterviewSession = require('../models/InterviewSession');
const ResumeAnalysis = require('../models/ResumeAnalysis');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const CodingSubmission = require('../models/CodingSubmission');
const SavedQuestion = require('../models/SavedQuestion');

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

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  } catch {
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
  } catch {
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
  } catch {
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
    const objectIds = ids.map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id));
    const counts = await TestResult.aggregate([
      { $match: { userId: { $in: objectIds } } },
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

    const id = req.params.id;

    // Every collection holding a reference to this person.
    //
    // DisclosureAudit is deliberately ABSENT: it records who saw this
    // candidate's data and under what consent, and it must outlive both the
    // consent and the account or it cannot answer that question later. Do not
    // add it here.
    const cascade = {
      user: () => User.deleteOne({ _id: id }),
      testResults: () => TestResult.deleteMany({ userId: id }),
      proctorLogs: () => ProctorLog.deleteMany({ userId: id }),
      // Biometric webcam frames. Missing from this cascade until now, so images
      // outlived the deleted account for the remainder of their 90-day TTL —
      // in a collection whose own header calls it a DPDP/GDPR boundary.
      proctorSnapshots: () => ProctorSnapshot.deleteMany({ userId: id }),
      interviewSessions: () => InterviewSession.deleteMany({ user: id }),
      resumeAnalyses: () => ResumeAnalysis.deleteMany({ user: id }),
      assessmentAttempts: () => AssessmentAttempt.deleteMany({ userId: id }),
      codingSubmissions: () => CodingSubmission.deleteMany({ userId: id }),
      savedQuestions: () => SavedQuestion.deleteMany({ userId: id }),
      // Hiring-side references: a deleted candidate must not keep live consents,
      // applications, memberships or pending invites.
      consents: () => CandidateCompanyConsent.deleteMany({ candidateId: id }),
      applications: () => Application.deleteMany({ candidateId: id }),
      memberships: () => CompanyMembership.deleteMany({ userId: id }),
    };

    const entries = Object.entries(cascade);
    const settled = await Promise.all(entries.map(([, run]) => run()));
    const deleted = Object.fromEntries(
      entries.map(([name], i) => [name, settled[i].deletedCount ?? 0])
    );

    // Reported rather than assumed. This route previously returned success
    // unconditionally, which is how a cascade that matched zero rows — because
    // the ids were string-typed and the filter cast them — looked like it had
    // worked for months.
    logAdminAction(req, 'user.delete', 'User:' + id, deleted);
    res.json({ message: 'User and associated data deleted', deleted });
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

    // Which of these events still have a frame. Asked as a separate id-only
    // query so the list never loads image data it does not render — and so a
    // frame that has passed its TTL simply reports false.
    const framed = new Set(
      (await ProctorSnapshot.find({ proctorLogId: { $in: logs.map((l) => l._id) } })
        .select('proctorLogId')
        .lean()).map((f) => String(f.proctorLogId))
    );

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
        hasSnapshot: framed.has(String(l._id)),
        user: l.userId ? userMap.get(l.userId) || null : null
      }))
    });
  } catch (err) {
    console.error('Admin proctor logs error:', err.message);
    res.status(500).json({ error: 'Failed to load proctor logs' });
  }
});

// GET /api/admin/proctor-logs/:id/snapshot — evidence frame for one log.
//
// Reads ProctorSnapshot, not ProctorLog: the image no longer lives on the log
// row. This endpoint is admin-only and RESTRICTED in policy/dataAccess.js —
// no recruiter-facing code may reach it or the model behind it.
router.get('/proctor-logs/:id/snapshot', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const frame = await ProctorSnapshot.findOne({ proctorLogId: req.params.id })
      .select('image')
      .lean();
    // Absent is normal, not an error: frames expire on their TTL while the
    // event they belonged to is retained.
    if (!frame || !frame.image) return res.status(404).json({ error: 'No snapshot' });
    res.json({ snapshot: frame.image });
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

// ─────────────────────────────────────────────────────────────────────────────
//  Phase D — companies and the disclosure audit.
//
//  Approval is the switch that lets an employer exist at all: a company signs
//  up as `pending` and nothing works until an admin activates it. Suspension
//  is the reverse, and it bites on the suspended company's next request
//  because middleware/company.js re-reads status every time.
// ─────────────────────────────────────────────────────────────────────────────

const Company = require('../models/Company');
const DisclosureAudit = require('../models/DisclosureAudit');
const Job = require('../models/Job');

// GET /api/admin/companies
router.get('/companies', async (req, res) => {
  try {
    const { page, limit, skip } = clampPage(req);
    const filter = {};
    if (['pending', 'active', 'suspended'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.search) {
      filter.name = new RegExp(escapeRegex(req.query.search), 'i');
    }

    const [companies, total] = await Promise.all([
      Company.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Company.countDocuments(filter),
    ]);

    const ids = companies.map((c) => c._id);
    const [members, jobs] = await Promise.all([
      CompanyMembership.aggregate([
        { $match: { companyId: { $in: ids }, status: 'active' } },
        { $group: { _id: '$companyId', n: { $sum: 1 } } },
      ]),
      Job.aggregate([
        { $match: { companyId: { $in: ids } } },
        { $group: { _id: '$companyId', n: { $sum: 1 } } },
      ]),
    ]);
    const memberMap = new Map(members.map((m) => [String(m._id), m.n]));
    const jobMap = new Map(jobs.map((j) => [String(j._id), j.n]));

    res.json({
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      total,
      companies: companies.map((c) => ({
        ...c,
        membersActive: memberMap.get(String(c._id)) || 0,
        jobs: jobMap.get(String(c._id)) || 0,
        seatsUsed: memberMap.get(String(c._id)) || 0,
      })),
    });
  } catch (err) {
    console.error('Admin companies error:', err.message);
    res.status(500).json({ error: 'Failed to load companies' });
  }
});

// POST /api/admin/companies — create a tenant directly (the seed path)
router.post('/companies', async (req, res) => {
  try {
    const { name, domain = '', seats = 3, status = 'pending' } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const company = await Company.create({
      name: name.trim().slice(0, 150),
      domain: String(domain).trim().toLowerCase().slice(0, 120),
      seats: Math.min(Math.max(parseInt(seats, 10) || 3, 1), 500),
      status: ['pending', 'active', 'suspended'].includes(status) ? status : 'pending',
      createdBy: req.user.id,
    });
    logAdminAction(req, 'company.create', 'Company:' + company._id, { name: company.name });
    res.status(201).json(company);
  } catch (err) {
    console.error('Admin company create error:', err.message);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// GET /api/admin/companies/:id
router.get('/companies/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const company = await Company.findById(req.params.id).lean();
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const [memberships, jobs, applications, consents] = await Promise.all([
      CompanyMembership.find({ companyId: company._id }).lean(),
      Job.countDocuments({ companyId: company._id }),
      Application.countDocuments({ companyId: company._id }),
      CandidateCompanyConsent.countDocuments({
        companyId: company._id,
        state: { $in: ['REVEALED', 'IN_PROCESS'] },
        revokedAt: null,
      }),
    ]);

    const userIds = memberships.map((m) => m.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('name email').lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    res.json({
      company,
      members: memberships.map((m) => ({
        membershipId: m._id,
        userId: m.userId,
        name: (userMap.get(String(m.userId)) || {}).name || null,
        email: (userMap.get(String(m.userId)) || {}).email || null,
        role: m.role,
        status: m.status,
      })),
      counts: { jobs, applications, candidatesWithAccess: consents },
    });
  } catch (err) {
    console.error('Admin company detail error:', err.message);
    res.status(500).json({ error: 'Failed to load company' });
  }
});

// PUT /api/admin/companies/:id/status — approve, suspend, reinstate
router.put('/companies/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    ).lean();
    if (!company) return res.status(404).json({ error: 'Company not found' });

    // Nothing else to do: middleware/company.js re-reads status on every
    // request, so suspension takes effect on the company's very next call.
    logAdminAction(req, 'company.status', 'Company:' + req.params.id, { status });
    res.json(company);
  } catch (err) {
    console.error('Admin company status error:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PUT /api/admin/companies/:id/seats
router.put('/companies/:id/seats', async (req, res) => {
  try {
    const seats = Math.min(Math.max(parseInt(req.body.seats, 10) || 0, 1), 500);
    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { $set: { seats } },
      { new: true }
    ).lean();
    if (!company) return res.status(404).json({ error: 'Company not found' });
    logAdminAction(req, 'company.seats', 'Company:' + req.params.id, { seats });
    res.json(company);
  } catch (err) {
    console.error('Admin seats error:', err.message);
    res.status(500).json({ error: 'Failed to update seats' });
  }
});

/**
 * GET /api/admin/disclosure
 *
 * Who was disclosed, to which company, what was disclosed, when, and under
 * which consent. This is not an activity log — a login trail tells you someone
 * was busy; this tells you whose personal data left the platform and on what
 * authority. It is the answer to "who has seen my results?".
 */
router.get('/disclosure', async (req, res) => {
  try {
    const { page, limit, skip } = clampPage(req);
    const filter = {};
    if (req.query.candidateId && mongoose.Types.ObjectId.isValid(req.query.candidateId)) {
      filter.candidateId = req.query.candidateId;
    }
    if (req.query.companyId && mongoose.Types.ObjectId.isValid(req.query.companyId)) {
      filter.companyId = req.query.companyId;
    }
    if (['granted', 'revoked', 'state_changed', 'disclosed'].includes(req.query.action)) {
      filter.action = req.query.action;
    }

    const [rows, total] = await Promise.all([
      DisclosureAudit.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      DisclosureAudit.countDocuments(filter),
    ]);

    const candidateIds = [...new Set(rows.map((r) => String(r.candidateId)))];
    const companyIds = [...new Set(rows.map((r) => String(r.companyId)))];
    const [users, companies] = await Promise.all([
      User.find({ _id: { $in: candidateIds } }).select('name email').lean(),
      Company.find({ _id: { $in: companyIds } }).select('name').lean(),
    ]);
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const companyMap = new Map(companies.map((c) => [String(c._id), c]));

    res.json({
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      total,
      events: rows.map((r) => ({
        id: r._id,
        action: r.action,
        scopes: r.scopes || [],
        at: r.createdAt,
        candidate: userMap.get(String(r.candidateId))
          ? {
            id: r.candidateId,
            name: userMap.get(String(r.candidateId)).name,
            email: userMap.get(String(r.candidateId)).email,
          }
          : { id: r.candidateId, name: null, email: null },
        company: companyMap.get(String(r.companyId))
          ? { id: r.companyId, name: companyMap.get(String(r.companyId)).name }
          : { id: r.companyId, name: null },
        consentId: r.consentId,
        meta: r.meta || {},
      })),
    });
  } catch (err) {
    console.error('Admin disclosure error:', err.message);
    res.status(500).json({ error: 'Failed to load disclosure log' });
  }
});

// GET /api/admin/disclosure/export.csv
router.get('/disclosure/export.csv', async (req, res) => {
  try {
    const rows = await DisclosureAudit.find().sort({ createdAt: -1 }).limit(10000).lean();
    const candidateIds = [...new Set(rows.map((r) => String(r.candidateId)))];
    const companyIds = [...new Set(rows.map((r) => String(r.companyId)))];
    const [users, companies] = await Promise.all([
      User.find({ _id: { $in: candidateIds } }).select('email').lean(),
      Company.find({ _id: { $in: companyIds } }).select('name').lean(),
    ]);
    const userMap = new Map(users.map((u) => [String(u._id), u.email]));
    const companyMap = new Map(companies.map((c) => [String(c._id), c.name]));

    const csv = arrayToCsv(
      rows.map((r) => ({
        at: r.createdAt ? r.createdAt.toISOString() : '',
        action: r.action,
        candidate: userMap.get(String(r.candidateId)) || String(r.candidateId),
        company: companyMap.get(String(r.companyId)) || String(r.companyId),
        scopes: (r.scopes || []).join(' '),
        consentId: String(r.consentId || ''),
      })),
      ['at', 'action', 'candidate', 'company', 'scopes', 'consentId']
    );
    logAdminAction(req, 'disclosure.export', '', { rows: rows.length });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="disclosure.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Admin disclosure export error:', err.message);
    res.status(500).json({ error: 'Failed to export' });
  }
});

module.exports = router;
