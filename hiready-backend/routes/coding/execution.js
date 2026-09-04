const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../../middleware/auth');
const { executeCode } = require('../../services/sandbox');
const CodingQuestion = require('../../models/CodingQuestion');
const CodingSubmission = require('../../models/CodingSubmission');
const { CODING_LANGUAGES, DIFFICULTIES, DIFFICULTY_ORDER } = require('../../utils/constants');

const SUPPORTED_LANGUAGES = CODING_LANGUAGES;
const MAX_FILES = 10;
const MAX_FILE_SIZE = 100 * 1024;
const MAX_TEST_CASES = 20;
const MAX_CODE_LENGTH = 100000;

const DIFF_ORDER = DIFFICULTY_ORDER;

// Stricter limiter for heavy execution endpoints
const execLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many execution requests, slow down' },
});

function sanitizeFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) return {};
  const clean = {};
  for (const [name, content] of Object.entries(files).slice(0, MAX_FILES)) {
    if (typeof name !== 'string' || typeof content !== 'string') continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) continue;
    if (name.length > 100 || content.length > MAX_FILE_SIZE) continue;
    clean[name] = content;
  }
  return clean;
}

function normalizeOutput(s) {
  return String(s || '').replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/g, '')).join('\n').trim();
}
function truncate(s, max = 2000) {
  const str = String(s || '');
  return str.length > max ? str.slice(0, max) + '\n...[truncated]' : str;
}
function clampInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

/**
 * POST /api/code/execute
 */
router.post('/execute', requireAuth, execLimiter, async (req, res) => {
  try {
    const { code, language, input = '', files = {}, timeLimit = 10000, memoryLimit = 256, cpuLimit = 1 } = req.body;
    if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Code is required' });
    if (!language || !SUPPORTED_LANGUAGES.includes(language)) return res.status(400).json({ error: `Unsupported language: ${language}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}` });
    if (code.length > MAX_CODE_LENGTH) return res.status(400).json({ error: 'Code too long (max 100KB)' });
    if (typeof input !== 'string') return res.status(400).json({ error: 'input must be string' });
    if (input.length > 10000) return res.status(400).json({ error: 'Input too long (max 10KB)' });

    const result = await executeCode({
      code, language, input, files: sanitizeFiles(files),
      timeLimit: clampInt(timeLimit, 10000, 500, 30000),
      memoryLimit: clampInt(memoryLimit, 256, 64, 512),
      cpuLimit: clampInt(cpuLimit, 1, 1, 2),
    });
    res.json(result);
  } catch (error) {
    console.error('Code execution error:', error.message);
    res.status(500).json({ error: 'Execution failed' });
  }
});

/**
 * GET /api/code/questions  candidate-facing, published only, hidden tests stripped
 */
router.get('/questions', requireAuth, async (req, res) => {
  try {
    const filter = { isPublished: true, isActive: true };
    const allowedDiffs = DIFFICULTIES;
    const allowedCats = ['arrays', 'strings', 'linked-lists', 'trees', 'graphs', 'dynamic-programming', 'sorting', 'searching', 'greedy', 'backtracking', 'bit-manipulation', 'math', 'geometry', 'databases', 'system-design'];
    if (req.query.difficulty && allowedDiffs.includes(String(req.query.difficulty).toLowerCase())) filter.difficulty = String(req.query.difficulty).toLowerCase();
    if (req.query.category && allowedCats.includes(String(req.query.category).toLowerCase())) filter.category = String(req.query.category).toLowerCase();
    if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim()) {
      const s = String(req.query.search).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = { $regex: s, $options: 'i' };
    }
    const limit = clampInt(req.query.limit, 50, 1, 100);
    const questions = await CodingQuestion.find(filter)
      .select('-solution -solutionFiles -createdBy')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Strip hidden test outputs and sort by difficulty order for UX
    const mapped = questions.map(q => ({
      ...q,
      testCases: (q.testCases || []).filter(tc => !tc.isHidden).map(tc => ({ input: tc.input, output: tc.output, isHidden: false, points: tc.points, description: tc.description })).slice(0, 10),
    })).sort((a, b) => (DIFF_ORDER[a.difficulty] ?? 1) - (DIFF_ORDER[b.difficulty] ?? 1));

    res.json({ questions: mapped });
  } catch (error) {
    console.error('List coding questions error:', error.message);
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

/**
 * POST /api/code/run-tests/:questionId  visible tests only
 */
router.post('/run-tests/:questionId', requireAuth, execLimiter, async (req, res) => {
  try {
    const { code, language, files = {} } = req.body;
    if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Code is required' });
    if (code.length > MAX_CODE_LENGTH) return res.status(400).json({ error: 'Code too long (max 100KB)' });
    if (!SUPPORTED_LANGUAGES.includes(language)) return res.status(400).json({ error: 'Invalid language' });
    if (!mongoose.Types.ObjectId.isValid(req.params.questionId)) return res.status(400).json({ error: 'Invalid questionId' });

    const question = await CodingQuestion.findOne({ _id: req.params.questionId, isActive: true, isPublished: true }).lean();
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const visibleCases = (question.testCases || []).filter((tc) => !tc.isHidden).slice(0, MAX_TEST_CASES);
    if (visibleCases.length === 0) return res.status(400).json({ error: 'Question has no visible test cases' });

    const cleanFiles = sanitizeFiles(files);
    const timeLimit = clampInt(question.timeLimit || 5000, 5000, 500, 15000);
    const memoryLimit = clampInt(question.memoryLimit || 256, 256, 64, 512);

    const deadline = Date.now() + 60000; // overall 60s
    const testResults = [];
    let passedCount = 0;
    let lastRun = null;

    for (const tc of visibleCases) {
      if (Date.now() > deadline) {
        testResults.push({ passed: false, input: truncate(tc.input), expected: truncate(tc.output), actual: '', executionTime: 0, error: 'Overall time limit exceeded' });
        continue;
      }
      const run = await executeCode({ code, language, input: tc.input || '', files: cleanFiles, timeLimit, memoryLimit, cpuLimit: 2 });
      lastRun = run;
      const passed = run.exitCode === 0 && !run.timedOut && normalizeOutput(run.stdout) === normalizeOutput(tc.output);
      if (passed) passedCount++;
      testResults.push({
        passed, input: truncate(tc.input), expected: truncate(tc.output), actual: truncate(run.stdout), executionTime: run.executionTime,
        error: run.timedOut ? 'Time limit exceeded' : run.exitCode !== 0 ? truncate(run.stderr, 1000) : undefined,
      });
    }

    res.json({ success: passedCount === visibleCases.length, passedCount, total: visibleCases.length, testResults, stdout: lastRun ? lastRun.stdout : '', stderr: lastRun ? lastRun.stderr : '' });
  } catch (error) {
    console.error('Run tests error:', error.message);
    res.status(500).json({ error: 'Failed to run tests' });
  }
});

/**
 * POST /api/code/submit/:questionId  all tests, persists
 */
router.post('/submit/:questionId', requireAuth, execLimiter, async (req, res) => {
  try {
    const { code, language, files = {} } = req.body;
    if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Code is required' });
    if (!SUPPORTED_LANGUAGES.includes(language)) return res.status(400).json({ error: 'Invalid language' });
    if (code.length > MAX_CODE_LENGTH) return res.status(400).json({ error: 'Code too long (max 100KB)' });
    if (!mongoose.Types.ObjectId.isValid(req.params.questionId)) return res.status(400).json({ error: 'Invalid questionId' });

    const question = await CodingQuestion.findOne({ _id: req.params.questionId, isActive: true }).lean();
    if (!question) return res.status(404).json({ error: 'Question not found' });
    const cases = (question.testCases || []).slice(0, MAX_TEST_CASES);
    if (cases.length === 0) return res.status(400).json({ error: 'Question has no test cases' });

    const cleanFiles = sanitizeFiles(files);
    const timeLimit = clampInt(question.timeLimit || 5000, 5000, 500, 15000);
    const memoryLimit = clampInt(question.memoryLimit || 256, 256, 64, 512);

    const fullResults = []; // stored with real hidden data
    const maskedResults = []; // returned to client
    let passedCount = 0;
    let score = 0;
    let timedOutAny = false;
    let runtimeErrorAny = false;
    const startedAt = Date.now();
    const deadline = startedAt + 120000;

    for (const tc of cases) {
      if (Date.now() > deadline) {
        fullResults.push({ input: truncate(tc.input), expected: truncate(tc.output), actual: '', passed: false, executionTime: 0, error: 'Overall time limit exceeded', isHidden: !!tc.isHidden });
        maskedResults.push({ input: truncate(tc.input), expected: tc.isHidden ? '(hidden)' : truncate(tc.output), actual: tc.isHidden ? '(hidden)' : '', passed: false, executionTime: 0, error: 'Overall time limit exceeded', isHidden: !!tc.isHidden });
        continue;
      }
      const run = await executeCode({ code, language, input: tc.input || '', files: cleanFiles, timeLimit, memoryLimit, cpuLimit: 2 });
      const passed = run.exitCode === 0 && !run.timedOut && normalizeOutput(run.stdout) === normalizeOutput(tc.output);
      if (passed) { passedCount++; score += tc.points || 1; }
      if (run.timedOut) timedOutAny = true;
      if (run.exitCode !== 0 && !run.timedOut) runtimeErrorAny = true;
      fullResults.push({ input: truncate(tc.input), expected: truncate(tc.output), actual: truncate(run.stdout), passed, executionTime: run.executionTime, error: run.timedOut ? 'Time limit exceeded' : run.exitCode !== 0 ? truncate(run.stderr, 1000) : undefined, isHidden: !!tc.isHidden });
      maskedResults.push({ input: truncate(tc.input), expected: tc.isHidden ? '(hidden)' : truncate(tc.output), actual: tc.isHidden ? '(hidden)' : truncate(run.stdout), passed, executionTime: run.executionTime, error: run.timedOut ? 'Time limit exceeded' : run.exitCode !== 0 ? truncate(run.stderr, 1000) : undefined, isHidden: !!tc.isHidden });
    }

    const status = passedCount === cases.length ? 'accepted' : timedOutAny ? 'time_limit_exceeded' : runtimeErrorAny ? 'runtime_error' : 'wrong_answer';

    const submission = await CodingSubmission.create({
      userId: req.user.id, questionId: question._id, code, language, status, passedCount, totalTests: cases.length, score, executionTime: Date.now() - startedAt, testResults: fullResults,
    });

    res.status(201).json({ submissionId: submission._id, status, passedCount, total: cases.length, score, maxScore: cases.reduce((s, tc) => s + (tc.points || 1), 0), testResults: maskedResults });
  } catch (error) {
    console.error('Submit error:', error.message);
    res.status(500).json({ error: 'Failed to submit solution' });
  }
});

router.get('/submissions', requireAuth, async (req, res) => {
  try {
    const submissions = await CodingSubmission.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50).populate('questionId', 'title slug difficulty').lean();
    res.json({ submissions });
  } catch (error) {
    console.error('Submissions list error:', error.message);
    res.status(500).json({ error: 'Failed to load submissions' });
  }
});

router.get('/submissions/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const submission = await CodingSubmission.findOne({ _id: req.params.id, userId: req.user.id }).populate('questionId', 'title slug difficulty').lean();
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    // Mask hidden on replay as well
    submission.testResults = (submission.testResults || []).map(r => r.isHidden ? { ...r, expected: '(hidden)', actual: '(hidden)' } : r);
    res.json({ submission });
  } catch (error) {
    console.error('Submission fetch error:', error.message);
    res.status(500).json({ error: 'Failed to load submission' });
  }
});

router.post('/validate', requireAuth, async (req, res) => {
  try {
    const { code, language } = req.body;
    if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Code is required' });
    if (!language || !SUPPORTED_LANGUAGES.includes(language)) return res.status(400).json({ error: 'Invalid language' });
    res.json({ valid: true });
  } catch {
    res.status(500).json({ error: 'Validation failed' });
  }
});

router.get('/languages', (req, res) => {
  const languages = [
    { id: 'python', name: 'Python', extension: 'py', version: '3.11' },
    { id: 'javascript', name: 'JavaScript (Node.js)', extension: 'js', version: '20.x' },
    { id: 'typescript', name: 'TypeScript', extension: 'ts', version: '5.x' },
    { id: 'java', name: 'Java', extension: 'java', version: '21' },
    { id: 'go', name: 'Go', extension: 'go', version: '1.22' },
    { id: 'cpp', name: 'C++', extension: 'cpp', version: '17' },
    { id: 'rust', name: 'Rust', extension: 'rs', version: '1.78' },
  ];
  res.json({ languages });
});

module.exports = router;
