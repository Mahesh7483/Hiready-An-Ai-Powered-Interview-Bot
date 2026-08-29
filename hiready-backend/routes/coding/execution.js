const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const { executeCode } = require('../../services/sandbox');
const CodingQuestion = require('../../models/CodingQuestion');
const CodingSubmission = require('../../models/CodingSubmission');

const SUPPORTED_LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'go', 'cpp', 'rust'];
const MAX_FILES = 10;
const MAX_FILE_SIZE = 100 * 1024; // 100KB per extra file
const MAX_TEST_CASES = 20;
const MAX_CODE_LENGTH = 100000;

/**
 * Sanitizes extra files from the client: flat filenames only (no paths,
 * no traversal), size-capped. Anything invalid is silently dropped.
 */
function sanitizeFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) return {};
  const clean = {};
  for (const [name, content] of Object.entries(files).slice(0, MAX_FILES)) {
    if (typeof name !== 'string' || typeof content !== 'string') continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) continue; // flat name, no slashes
    if (name.length > 100 || content.length > MAX_FILE_SIZE) continue;
    clean[name] = content;
  }
  return clean;
}

/** Normalizes program output vs expected output for comparison. */
function normalizeOutput(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}

function truncate(s, max = 2000) {
  const str = String(s || '');
  return str.length > max ? str.slice(0, max) + '\n...[truncated]' : str;
}

/**
 * POST /api/code/execute
 * Execute code in sandbox
 */
router.post('/execute', requireAuth, async (req, res) => {
  try {
    const {
      code,
      language,
      input = '',
      files = {},
      timeLimit = 10000,
      memoryLimit = 256,
      cpuLimit = 1,
    } = req.body;

    // Validation
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Code is required' });
    }

    if (!language || !SUPPORTED_LANGUAGES.includes(language)) {
      return res.status(400).json({
        error: `Unsupported language: ${language}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
      });
    }

    if (code.length > MAX_CODE_LENGTH) {
      return res.status(400).json({ error: 'Code too long (max 100KB)' });
    }

    if (input.length > 10000) {
      return res.status(400).json({ error: 'Input too long (max 10KB)' });
    }

    // Execute code (extra files are sanitized — flat names only)
    const result = await executeCode({
      code,
      language,
      input,
      files: sanitizeFiles(files),
      timeLimit: Math.min(timeLimit, 30000),
      memoryLimit: Math.min(memoryLimit, 512),
      cpuLimit: Math.min(cpuLimit, 2),
    });

    res.json(result);
  } catch (error) {
    console.error('Code execution error:', error);
    res.status(500).json({ 
      error: 'Execution failed',
      message: error.message 
    });
  }
});

/**
 * GET /api/code/questions
 * Candidate-facing question list: published + active only, solutions stripped.
 */
router.get('/questions', requireAuth, async (req, res) => {
  try {
    const filter = { isPublished: true, isActive: true };
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.search) filter.title = { $regex: new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const questions = await CodingQuestion.find(filter)
      .select('-solution -solutionFiles -createdBy')
      .sort({ difficulty: 1, createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ questions });
  } catch (error) {
    console.error('List coding questions error:', error.message);
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

/**
 * POST /api/code/run-tests/:questionId
 * Runs the candidate's code against the question's VISIBLE test cases.
 */
router.post('/run-tests/:questionId', requireAuth, async (req, res) => {
  try {
    const { code, language, files = {} } = req.body;
    if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Code is required' });
    if (!SUPPORTED_LANGUAGES.includes(language)) return res.status(400).json({ error: 'Invalid language' });

    const question = await CodingQuestion.findOne({ _id: req.params.questionId, isActive: true }).lean();
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const visibleCases = (question.testCases || []).filter((tc) => !tc.isHidden).slice(0, MAX_TEST_CASES);
    const cleanFiles = sanitizeFiles(files);
    const timeLimit = Math.min(question.timeLimit || 5000, 15000);
    const memoryLimit = Math.min(question.memoryLimit || 256, 512);

    const testResults = [];
    let passedCount = 0;
    let lastRun = null;

    for (const tc of visibleCases) {
      const run = await executeCode({
        code, language,
        input: tc.input || '',
        files: cleanFiles,
        timeLimit, memoryLimit, cpuLimit: 2,
      });
      lastRun = run;

      const passed = run.exitCode === 0 && !run.timedOut && normalizeOutput(run.stdout) === normalizeOutput(tc.output);
      if (passed) passedCount++;

      testResults.push({
        passed,
        input: truncate(tc.input),
        expected: truncate(tc.output),
        actual: truncate(run.stdout),
        executionTime: run.executionTime,
        error: run.timedOut ? 'Time limit exceeded' : run.exitCode !== 0 ? truncate(run.stderr, 1000) : undefined,
      });
    }

    res.json({
      success: visibleCases.length > 0 && passedCount === visibleCases.length,
      passedCount,
      total: visibleCases.length,
      testResults,
      stdout: lastRun ? lastRun.stdout : '',
      stderr: lastRun ? lastRun.stderr : '',
    });
  } catch (error) {
    console.error('Run tests error:', error);
    res.status(500).json({ error: 'Failed to run tests' });
  }
});

/**
 * POST /api/code/submit/:questionId
 * Runs ALL test cases (visible + hidden), computes the score, persists a
 * CodingSubmission and returns results (hidden-case data masked).
 */
router.post('/submit/:questionId', requireAuth, async (req, res) => {
  try {
    const { code, language, files = {} } = req.body;
    if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Code is required' });
    if (!SUPPORTED_LANGUAGES.includes(language)) return res.status(400).json({ error: 'Invalid language' });
    if (code.length > MAX_CODE_LENGTH) return res.status(400).json({ error: 'Code too long (max 100KB)' });

    const question = await CodingQuestion.findOne({ _id: req.params.questionId, isActive: true }).lean();
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const cases = (question.testCases || []).slice(0, MAX_TEST_CASES);
    const cleanFiles = sanitizeFiles(files);
    const timeLimit = Math.min(question.timeLimit || 5000, 15000);
    const memoryLimit = Math.min(question.memoryLimit || 256, 512);

    const testResults = [];
    let passedCount = 0;
    let score = 0;
    let timedOutAny = false;
    let runtimeErrorAny = false;
    const startedAt = Date.now();

    for (const tc of cases) {
      const run = await executeCode({
        code, language,
        input: tc.input || '',
        files: cleanFiles,
        timeLimit, memoryLimit, cpuLimit: 2,
      });

      const passed = run.exitCode === 0 && !run.timedOut && normalizeOutput(run.stdout) === normalizeOutput(tc.output);
      if (passed) { passedCount++; score += tc.points || 1; }
      if (run.timedOut) timedOutAny = true;
      if (run.exitCode !== 0 && !run.timedOut) runtimeErrorAny = true;

      testResults.push({
        input: truncate(tc.input),
        // Mask hidden-case expected/actual data before returning AND before persisting
        expected: tc.isHidden ? '(hidden)' : truncate(tc.output),
        actual: tc.isHidden ? '(hidden)' : truncate(run.stdout),
        passed,
        executionTime: run.executionTime,
        error: run.timedOut ? 'Time limit exceeded' : run.exitCode !== 0 ? truncate(run.stderr, 1000) : undefined,
        isHidden: !!tc.isHidden,
      });
    }

    const status = cases.length > 0 && passedCount === cases.length
      ? 'accepted'
      : timedOutAny ? 'time_limit_exceeded'
      : runtimeErrorAny ? 'runtime_error'
      : 'wrong_answer';

    const submission = await CodingSubmission.create({
      userId: req.user.id,
      questionId: question._id,
      code,
      language,
      status,
      passedCount,
      totalTests: cases.length,
      score,
      executionTime: Date.now() - startedAt,
      testResults,
    });

    res.status(201).json({
      submissionId: submission._id,
      status,
      passedCount,
      total: cases.length,
      score,
      maxScore: cases.reduce((s, tc) => s + (tc.points || 1), 0),
      testResults,
    });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ error: 'Failed to submit solution' });
  }
});

/**
 * GET /api/code/submissions
 * The current user's submission history (latest 50).
 */
router.get('/submissions', requireAuth, async (req, res) => {
  try {
    const submissions = await CodingSubmission.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('questionId', 'title slug difficulty')
      .lean();
    res.json({ submissions });
  } catch (error) {
    console.error('Submissions list error:', error.message);
    res.status(500).json({ error: 'Failed to load submissions' });
  }
});

/**
 * GET /api/code/submissions/:id
 * Replay a single submission (owner only).
 */
router.get('/submissions/:id', requireAuth, async (req, res) => {
  try {
    const submission = await CodingSubmission.findOne({
      _id: req.params.id,
      userId: req.user.id,
    }).populate('questionId', 'title slug difficulty').lean();
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    res.json({ submission });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load submission' });
  }
});

/**
 * POST /api/code/validate
 * Validate code syntax without execution
 */
router.post('/validate', requireAuth, async (req, res) => {
  try {
    const { code, language } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Code is required' });
    }

    if (!language || !['python', 'javascript', 'typescript', 'java', 'go', 'cpp', 'rust'].includes(language)) {
      return res.status(400).json({ error: 'Invalid language' });
    }

    // Quick syntax check by attempting to parse/compile
    try {
      // For now, just return success - actual validation happens during execution
      // In the future, we could add language-specific linters/parsers
      res.json({ valid: true });
    } catch (error) {
      res.json({ valid: false, error: error.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Validation failed' });
  }
});

/**
 * GET /api/code/languages
 * Get supported languages and their configurations
 */
router.get('/languages', requireAuth, (req, res) => {
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