const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const AssessmentTemplate = require('../models/AssessmentTemplate');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const Question = require('../models/Question');
const CodingQuestion = require('../models/CodingQuestion');

router.use(requireAuth);

const VIOLATION_WEIGHTS = {
  tab_switch: 2,
  fullscreen_exit: 2,
  window_blur: 2,
  multiple_faces_detected: 4,
  multiple_people_detected: 4,
  no_face_detected: 1,
  gaze_away_detected: 2,
  paste_attempt: 3,
  devtools_attempt: 3,
  camera_permission_denied: 5,
};

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Section builders: lock a question set into sectionState (server-only) ──

// Difficulty weighting for a balanced mix even when pools are uneven
// (dataset reality: ~755 medium / 49 hard / 5 easy). Targets: 20% easy,
// 50% medium, 30% hard — whatever a difficulty pool cannot provide is
// refilled from the remaining category pool so sections never come back short.
const DIFFICULTY_MIX = { easy: 0.2, medium: 0.5, hard: 0.3 };

async function buildAptitudeState(section, excludeIds = []) {
  const match = {};
  if (section.topic) {
    const cats = await Question.distinct('category');
    const resolved = cats.find((c) => slugify(c) === slugify(section.topic)) || section.topic;
    match.category = resolved;
  }

  const want = section.count || 10;
  const docs = [];
  const takenIds = new Set(excludeIds.map(String));

  // 1) Difficulty-weighted sampling
  for (const [difficulty, share] of Object.entries(DIFFICULTY_MIX)) {
    const n = Math.floor(want * share);
    if (n <= 0) continue;
    const picked = await Question.aggregate([
      { $match: { ...match, difficulty, _id: { $nin: [...takenIds] } } },
      { $sample: { size: n } },
    ]);
    for (const q of picked) {
      docs.push(q);
      takenIds.add(String(q._id));
    }
  }
  // 2) Refill from the category, any difficulty
  if (docs.length < want) {
    const fill = await Question.aggregate([
      { $match: { ...match, _id: { $nin: [...takenIds] } } },
      { $sample: { size: want - docs.length } },
    ]);
    for (const q of fill) {
      docs.push(q);
      takenIds.add(String(q._id));
    }
  }
  // 3) Last resort: topic pool too narrow — relax the category filter
  if (docs.length < want && section.topic) {
    const relaxed = await Question.aggregate([
      { $match: { _id: { $nin: [...takenIds] } } },
      { $sample: { size: want - docs.length } },
    ]);
    for (const q of relaxed) {
      docs.push(q);
      takenIds.add(String(q._id));
    }
  }
  // Weighted sampling clusters by difficulty — shuffle the final order
  shuffleInPlace(docs);

  const questionIds = [];
  const answerKey = {};
  const optionOrder = {};
  for (const q of docs) {
    const qid = String(q._id);
    questionIds.push(qid);
    answerKey[qid] = q.Answer;
    // Per-attempt option shuffle: server knows the mapping; the client only
    // sees shuffled option CONTENT under fixed letters A-D.
    const order = shuffleInPlace(['A', 'B', 'C', 'D'].slice());
    optionOrder[qid] = order;
  }
  return { questionIds, answerKey, optionOrder, count: questionIds.length };
}

async function buildCodingState(section, excludeIds = [], preferredTags = []) {
  const want = section.codingCount || 2;
  const base = { isPublished: true, isActive: true };
  if (section.codingDifficulty) base.difficulty = section.codingDifficulty;

  const docs = [];
  const taken = new Set(excludeIds.map(String));

  // 1) Skill-matched first: admin tags + resume-driven preferredTags
  const tags = [...new Set([...(section.codingTags || []), ...preferredTags])];
  if (tags.length) {
    const matched = await CodingQuestion.find({
      ...base,
      tags: { $in: tags },
      _id: { $nin: [...taken] },
    })
      .select('_id title difficulty')
      .limit(want)
      .lean();
    for (const d of matched) {
      docs.push(d);
      taken.add(String(d._id));
    }
  }
  // 2) Fill the rest from the generic pool
  if (docs.length < want) {
    const more = await CodingQuestion.find({ ...base, _id: { $nin: [...taken] } })
      .select('_id title difficulty')
      .limit(want - docs.length)
      .lean();
    for (const d of more) {
      docs.push(d);
      taken.add(String(d._id));
    }
  }
  return { codingQuestionIds: docs.map((d) => String(d._id)), count: docs.length };
}

function buildVoiceState(section, resumeData) {
  const focus = [...(section.focusAreas || [])];
  if (resumeData && Array.isArray(resumeData.missingKeywords)) {
    focus.push(...resumeData.missingKeywords.slice(0, 4));
  }
  return { focusAreas: focus.slice(0, 6), durationMin: section.interviewDurationMin || 10 };
}

// ── Sanitizers: what the client is allowed to see (never the answer key) ────

function sanitizeSectionState(section, state) {
  if (!state) return {};
  if (section.type === 'aptitude') {
    return { questionIds: state.questionIds || [], optionOrder: state.optionOrder || {}, count: state.count };
  }
  if (section.type === 'coding') {
    return { codingQuestionIds: state.codingQuestionIds || [], count: state.count };
  }
  if (section.type === 'voice-interview') {
    return { focusAreas: state.focusAreas || [], durationMin: state.durationMin };
  }
  return {};
}

function attemptForClient(attempt, template) {
  const sections = template.sections.map((s, idx) => ({
    index: idx,
    type: s.type,
    title: s.title || s.type,
    minutes: s.minutes,
    topic: s.topic || '',
    state: sanitizeSectionState(s, (attempt.sectionState || {})[idx]),
  }));
  return {
    _id: attempt._id,
    templateId: attempt.templateId,
    templateTitle: template.title,
    status: attempt.status,
    currentSectionIndex: attempt.currentSectionIndex,
    sections,
    sectionStartedAt: attempt.sectionStartedAt,
    breakEndsAt: attempt.breakEndsAt,
    violationScore: attempt.violationScore,
    violationThreshold: template.violationThreshold,
    sectionResults: attempt.sectionResults,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
  };
}

// ── Template CRUD ───────────────────────────────────────────────────────────

router.get('/templates', async (req, res) => {
  try {
    const templates = await AssessmentTemplate.find({ isPublished: true }).sort({ createdAt: -1 }).lean();
    res.json({ templates });
  } catch {
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

router.post('/templates', requireAdmin, async (req, res) => {
  try {
    const { title, sections } = req.body;
    if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title is required' });
    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ error: 'at least one section is required' });
    }
    const template = await AssessmentTemplate.create({
      ...req.body,
      title: title.slice(0, 150),
      createdBy: req.user.id,
    });
    res.status(201).json(template);
  } catch (err) {
    console.error('Create template error:', err.message);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/templates/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await AssessmentTemplate.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Template not found' });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/templates/:id', requireAdmin, async (req, res) => {
  try {
    const hasAttempts = await AssessmentAttempt.exists({ templateId: req.params.id });
    if (hasAttempts) {
      const updated = await AssessmentTemplate.findByIdAndUpdate(
        req.params.id,
        { isPublished: false, isArchived: true },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Template not found' });
      return res.json({ message: 'Template archived (cannot hard-delete template with existing candidate attempts)' });
    }
    const deleted = await AssessmentTemplate.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Template not found' });
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ── Attempt lifecycle ───────────────────────────────────────────────────────

async function loadTemplateFor(attempt) {
  return AssessmentTemplate.findById(attempt.templateId).lean();
}

// Builds + locks the sectionState for the section at `idx`
async function lockSection(attempt, template, idx, resumeData) {
  const section = template.sections[idx];
  if (!section) return {};
  const state = (attempt.sectionState || {})[idx] || {};
  // "Locked" = the type-specific question ids exist. A pre-seeded partial
  // object ({ preferredTags }) must NOT count as locked.
  const locked =
    (section.type === 'aptitude' && Array.isArray(state.questionIds)) ||
    (section.type === 'coding' && Array.isArray(state.codingQuestionIds)) ||
    (section.type === 'voice-interview' && Array.isArray(state.focusAreas));
  if (locked) return state;

  // Within-attempt no-repeat: exclude questions from already-graded sections
  const excludeIds = [];
  for (const res of attempt.sectionResults || []) {
    if (res.meta && Array.isArray(res.meta.questionIds)) excludeIds.push(...res.meta.questionIds);
  }
  // Cross-attempt no-repeat: also exclude what this user saw in prior attempts
  // of the same template (best-effort — never block section creation).
  try {
    const pastAttempts = await AssessmentAttempt.find({
      _id: { $ne: attempt._id },
      userId: attempt.userId,
      templateId: attempt.templateId,
      status: { $in: ['completed', 'auto_submitted', 'expired'] },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('sectionState sectionResults')
      .lean();
    for (const pa of pastAttempts) {
      for (const key of Object.keys(pa.sectionState || {})) {
        const ids = pa.sectionState[key] && pa.sectionState[key].questionIds;
        if (Array.isArray(ids)) excludeIds.push(...ids);
      }
      for (const res of pa.sectionResults || []) {
        if (res.meta && Array.isArray(res.meta.questionIds)) excludeIds.push(...res.meta.questionIds);
      }
    }
  } catch (err) {
    console.warn('No-repeat exclusion skipped:', err.message);
  }

  if (section.type === 'aptitude') return buildAptitudeState(section, excludeIds);
  if (section.type === 'coding') return buildCodingState(section, excludeIds, state.preferredTags || []);
  if (section.type === 'voice-interview') return buildVoiceState(section, resumeData);
  return {};
}

function findBreakAfter(template, idx) {
  return (template.breaks || []).find((b) => b.afterSectionIndex === idx);
}

async function advanceOrFinish(attempt, template, sectionResult) {
  const nextIdx = attempt.currentSectionIndex + 1;
  if (sectionResult) attempt.sectionResults.push(sectionResult);

  if (nextIdx >= template.sections.length) {
    attempt.status = 'completed';
    attempt.completedAt = new Date();
    return;
  }
  const brk = findBreakAfter(template, attempt.currentSectionIndex);
  if (brk) {
    attempt.status = 'in_break';
    attempt.breakEndsAt = new Date(Date.now() + brk.minutes * 60000);
    attempt.currentSectionIndex = nextIdx;
  } else {
    attempt.status = 'in_progress';
    attempt.currentSectionIndex = nextIdx;
    attempt.sectionStartedAt = new Date();
  }
}

// POST /start/:templateId — create a new attempt (enforces limit + cooldown)
router.post('/start/:templateId', async (req, res) => {
  try {
    const template = await AssessmentTemplate.findOne({ _id: req.params.templateId, isPublished: true }).lean();
    if (!template) return res.status(404).json({ error: 'Template not found' });

    // Resume an existing in-flight attempt instead of creating a new one
    const inflight = await AssessmentAttempt.findOne({
      userId: req.user.id,
      templateId: template._id,
      status: { $in: ['not_started', 'in_progress', 'in_break'] },
    });
    if (inflight) {
      return res.json({ attempt: attemptForClient(inflight, template), resumed: true });
    }

    // Attempt limit + cooldown
    const prior = await AssessmentAttempt.find({
      userId: req.user.id,
      templateId: template._id,
      status: { $in: ['completed', 'auto_submitted', 'expired'] },
    })
      .sort({ createdAt: -1 })
      .limit(template.attemptLimit)
      .lean();
    if (prior.length >= template.attemptLimit) {
      const last = prior[0];
      const cooldownEnd = new Date(last.createdAt.getTime() + template.cooldownDays * 86400000);
      if (new Date() < cooldownEnd) {
        return res.status(429).json({
          error: `Attempt limit reached. Next attempt available ${cooldownEnd.toISOString().slice(0, 10)}.`,
        });
      }
    }

    const attempt = new AssessmentAttempt({
      templateId: template._id,
      userId: req.user.id,
      status: 'in_progress',
      currentSectionIndex: 0,
      sectionState: {},
      sectionStartedAt: new Date(),
    });

    // Resume-driven personalization: pull the latest resume analysis once
    let resumeData = null;
    if (template.resumeDriven) {
      const ResumeAnalysis = require('../models/ResumeAnalysis');
      const latest = await ResumeAnalysis.findOne({ user: req.user.id }).sort({ createdAt: -1 }).lean();
      if (latest) resumeData = latest.resultJson || latest;
    }

    const state0 = await lockSection(attempt, template, 0, resumeData);
    attempt.sectionState = { 0: state0 };

    // Resume-driven personalization is decided once at start (the resume may
    // change mid-attempt): pre-seed preferredTags / focusAreas for later
    // sections. lockSection ignores these partial seeds and consumes them
    // when it actually locks the section.
    if (template.resumeDriven) {
      const tags = Array.isArray(resumeData?.extractedSkills)
        ? resumeData.extractedSkills.map((s) => String(s).toLowerCase().replace(/\s+/g, '-')).slice(0, 6)
        : [];
      template.sections.forEach((s, i) => {
        if (i === 0) return;
        if (s.type === 'coding' && tags.length) {
          attempt.sectionState[i] = { preferredTags: tags };
        } else if (s.type === 'voice-interview') {
          attempt.sectionState[i] = buildVoiceState(s, resumeData);
        }
      });
    }

    await attempt.save();
    res.status(201).json({ attempt: attemptForClient(attempt, template), resumed: false });
  } catch (err) {
    console.error('Start attempt error:', err.message);
    res.status(500).json({ error: 'Failed to start assessment' });
  }
});

// GET /attempt/current — the user's in-flight attempt (server clock applied)
router.get('/attempt/current', async (req, res) => {
  try {
    const attempt = await AssessmentAttempt.findOne({
      userId: req.user.id,
      status: { $in: ['not_started', 'in_progress', 'in_break'] },
    })
      .sort({ createdAt: -1 })
      .lean();
    if (!attempt) return res.json({ attempt: null });
    const template = await loadTemplateFor(attempt);
    if (!template) return res.json({ attempt: null });

    // Server clock: auto-submit if the section expired beyond the 60s grace
    if (attempt.status === 'in_progress' && attempt.sectionStartedAt) {
      const section = template.sections[attempt.currentSectionIndex];
      const deadline = new Date(attempt.sectionStartedAt.getTime() + section.minutes * 60000 + 60000);
      if (new Date() > deadline) {
        attempt.status = 'auto_submitted';
        attempt.completedAt = new Date();
        await AssessmentAttempt.updateOne({ _id: attempt._id }, { $set: { status: attempt.status, completedAt: attempt.completedAt } });
        return res.json({ attempt: attemptForClient(attempt, template), expired: true });
      }
    }
    res.json({ attempt: attemptForClient(attempt, template) });
  } catch (err) {
    console.error('Current attempt error:', err.message);
    res.status(500).json({ error: 'Failed to load attempt' });
  }
});

// POST /attempt/:id/section/:idx/submit — grade + advance
router.post('/attempt/:id/section/:idx/submit', async (req, res) => {
  try {
    const attempt = await AssessmentAttempt.findOne({ _id: req.params.id, userId: req.user.id });
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Section not active' });

    const template = await loadTemplateFor(attempt);
    const idx = parseInt(req.params.idx, 10);
    if (idx !== attempt.currentSectionIndex) return res.status(400).json({ error: 'Section out of order' });
    const section = template.sections[idx];
    const state = (attempt.sectionState || {})[idx] || {};

    // Server-side deadline enforcement: the section must be submitted within
    // its time window (+60s grace, matching GET /attempt/current). Late
    // submissions are rejected and the attempt is closed — nothing is graded.
    if (attempt.sectionStartedAt) {
      const deadline = new Date(attempt.sectionStartedAt.getTime() + section.minutes * 60000 + 60000);
      if (new Date() > deadline) {
        attempt.status = 'auto_submitted';
        attempt.completedAt = new Date();
        await attempt.save();
        return res.status(400).json({ error: 'Section time expired — the attempt has been closed' });
      }
    }

    const result = { sectionIndex: idx, type: section.type, score: 0, maxScore: 0, meta: {}, completedAt: new Date() };

    if (section.type === 'aptitude') {
      const { answers = [] } = req.body; // [{questionId, selected}]
      const negative = section.negativeMarking !== false;
      // Anti-cheat: only questions locked into THIS section count, and each
      // question is graded at most once (first answer wins) — duplicate or
      // foreign questionIds can no longer inflate the score.
      const sectionQuestionIds = new Set((state.questionIds || []).map(String));
      const gradedIds = new Set();
      let score = 0;
      const graded = [];
      for (const a of Array.isArray(answers) ? answers : []) {
        const qid = String(a && a.questionId ? a.questionId : '');
        if (!qid || !sectionQuestionIds.has(qid) || gradedIds.has(qid)) continue;
        gradedIds.add(qid);
        const originalAnswer = state.answerKey?.[qid];
        if (!originalAnswer) continue;
        const isCorrect = a.selected === originalAnswer;
        if (isCorrect) score += 1;
        else if (negative && a.selected) score -= 0.25;
        graded.push({ questionId: qid, selected: a.selected, isCorrect });
      }
      score = Math.max(0, Math.round(score * 100) / 100);
      result.score = score;
      result.maxScore = (state.questionIds || []).length;
      result.meta = { answers: graded, questionIds: state.questionIds || [] };
    } else if (section.type === 'coding') {
      // Scores come from already-verified CodingSubmissions made during the
      // section. Anti-cheat: only submissions for questions locked into THIS
      // section count (submissions against unrelated questions are ignored),
      // only the best submission per question is scored, and the total is
      // capped at maxScore so foreign submissions can't inflate the result.
      const { submissionIds = [] } = req.body;
      const CodingSubmission = require('../models/CodingSubmission');
      const sectionQuestionIds = new Set((state.codingQuestionIds || []).map(String));
      const validObjectIds = (Array.isArray(submissionIds) ? submissionIds : [])
        .map((id) => String(id))
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const subs = validObjectIds.length
        ? await CodingSubmission.find({ _id: { $in: validObjectIds }, userId: req.user.id }).lean()
        : [];
      const bestPerQuestion = new Map(); // questionId -> normalized score 0..1
      for (const s of subs) {
        const qid = String(s.questionId);
        if (!sectionQuestionIds.has(qid)) continue;
        const max = (s.testResults || []).length || 1;
        const normalized = (s.score !== undefined ? s.score : 0) / max;
        const prev = bestPerQuestion.get(qid);
        if (prev === undefined || normalized > prev) bestPerQuestion.set(qid, normalized);
      }
      let score = 0;
      for (const normalized of bestPerQuestion.values()) score += normalized;
      result.maxScore = (state.codingQuestionIds || []).length;
      result.score = Math.min(Math.round(score * 100) / 100, result.maxScore);
      result.meta = { submissionIds: [...bestPerQuestion.keys()], codingQuestionIds: state.codingQuestionIds || [] };
    } else if (section.type === 'voice-interview') {
      // Voice stage: the score is derived SERVER-SIDE from verifiable inputs
      // only (duration vs. target, conversation turns). A client-posted
      // analysis score is stored as advisory metadata — it never becomes the
      // grade, so a manipulated client can't award itself points.
      const rawDuration = Number(req.body.durationSeconds);
      const rawTurns = Number(req.body.conversationTurns);
      const durationSeconds = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.min(rawDuration, section.minutes * 60 + 120) : 0;
      const conversationTurns = Number.isFinite(rawTurns) && rawTurns > 0 ? Math.min(Math.round(rawTurns), 200) : 0;
      const targetSeconds = (section.interviewDurationMin || 10) * 60;
      // 80% for meeting the duration target, 20% for sustained conversation
      // (roughly one turn per minute, capped) — generous caps keep honest reporters whole.
      const durationScore = Math.min(durationSeconds / targetSeconds, 1) * 8;
      const turnScore = Math.min(conversationTurns / Math.max(targetSeconds / 60, 1), 1) * 2;
      result.score = Math.round((durationScore + turnScore) * 100) / 100;
      result.maxScore = 10;
      result.meta = {
        durationSeconds,
        conversationTurns,
        reportedAnalysisScore: req.body.analysisScore ?? null,
        scoredBy: 'server-derived',
      };
    }

    await advanceOrFinish(attempt, template, result);
    // Lock the next section immediately when there is no break between them —
    // otherwise the section would serve an empty question set.
    if (attempt.status === 'in_progress') {
      const nextState = await lockSection(attempt, template, attempt.currentSectionIndex, null);
      attempt.sectionState = { ...attempt.sectionState, [attempt.currentSectionIndex]: nextState };
    }
    await attempt.save();
    res.json({ attempt: attemptForClient(attempt, template) });
  } catch (err) {
    console.error('Section submit error:', err.message);
    res.status(500).json({ error: 'Failed to submit section' });
  }
});

// POST /attempt/:id/break/end — leave the break early
router.post('/attempt/:id/break/end', async (req, res) => {
  try {
    const attempt = await AssessmentAttempt.findOne({ _id: req.params.id, userId: req.user.id });
    if (!attempt || attempt.status !== 'in_break') return res.status(400).json({ error: 'Not in a break' });
    const template = await loadTemplateFor(attempt);
    attempt.status = 'in_progress';
    attempt.sectionStartedAt = new Date();
    attempt.breakEndsAt = null;
    const state = await lockSection(attempt, template, attempt.currentSectionIndex, null);
    attempt.sectionState = { ...attempt.sectionState, [attempt.currentSectionIndex]: state };
    await attempt.save();
    res.json({ attempt: attemptForClient(attempt, template) });
  } catch (err) {
    console.error('Break end error:', err.message);
    res.status(500).json({ error: 'Failed to end break' });
  }
});

// POST /attempt/:id/face-check — face re-verification at section boundaries.
// The client captures a webcam snapshot each time a new section starts; the
// evidence trail lets admins confirm the same person took every section.
router.post('/attempt/:id/face-check', async (req, res) => {
  try {
    const attempt = await AssessmentAttempt.findOne({ _id: req.params.id, userId: req.user.id });
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (['completed', 'auto_submitted', 'expired'].includes(attempt.status)) {
      return res.status(400).json({ error: 'Attempt not active' });
    }
    const raw = typeof req.body.snapshot === 'string' ? req.body.snapshot : '';
    const snapshot = raw.startsWith('data:image') ? raw.slice(0, 80000) : null;
    const ProctorLog = require('../models/ProctorLog');
    await ProctorLog.create({
      sessionId: `assessment-${attempt._id}`,
      userId: String(attempt.userId),
      event: `section_face_check_s${attempt.currentSectionIndex}`,
      timestamp: new Date(),
      ...(snapshot ? { snapshot } : {}),
    });
    res.json({ ok: true, sectionIndex: attempt.currentSectionIndex, withSnapshot: Boolean(snapshot) });
  } catch (err) {
    console.error('Face check error:', err.message);
    res.status(500).json({ error: 'Failed to record face check' });
  }
});

// POST /attempt/:id/violation — weighted violation feed
router.post('/attempt/:id/violation', async (req, res) => {
  try {
    const attempt = await AssessmentAttempt.findOne({ _id: req.params.id, userId: req.user.id });
    if (!attempt || attempt.status !== 'in_progress') {
      return res.json({ violationScore: attempt?.violationScore ?? 0 });
    }
    const template = await loadTemplateFor(attempt);
    const type = String(req.body.type || 'unknown');
    const weight = VIOLATION_WEIGHTS[type] || 1;
    attempt.violations.push({ type, weight, at: new Date() });
    attempt.violationScore = attempt.violations.reduce((s, v) => s + v.weight, 0);
    let autoSubmitted = false;
    if (attempt.violationScore >= (template.violationThreshold || 100)) {
      attempt.status = 'auto_submitted';
      attempt.completedAt = new Date();
      autoSubmitted = true;
    }
    await attempt.save();
    res.json({ violationScore: attempt.violationScore, threshold: template.violationThreshold, autoSubmitted });
  } catch (err) {
    console.error('Violation error:', err.message);
    res.status(500).json({ error: 'Failed to record violation' });
  }
});

// GET /attempt/:id/report — composite report
router.get('/attempt/:id/report', async (req, res) => {
  try {
    const attempt = await AssessmentAttempt.findOne({ _id: req.params.id, userId: req.user.id }).lean();
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    const template = await AssessmentTemplate.findById(attempt.templateId).select('title targetRole sections').lean();
    const totalScore = (attempt.sectionResults || []).reduce((s, r) => s + (r.score || 0), 0);
    const maxScore = (attempt.sectionResults || []).reduce((s, r) => s + (r.maxScore || 0), 0);
    res.json({
      template,
      attempt,
      summary: {
        totalScore: Math.round(totalScore * 100) / 100,
        maxScore,
        pct: maxScore ? Math.round((totalScore / maxScore) * 100) : 0,
        violationScore: attempt.violationScore,
        status: attempt.status,
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to load report' });
  }
});

// GET /api/assessment/attempt/:id/section/:idx/questions — locked aptitude questions
// for the active section, with NO answer key. The per-question visual order comes
// from attempt.sectionState[idx].optionOrder (already sent in the attempt DTO).
router.get('/attempt/:id/section/:idx/questions', async (req, res) => {
  try {
    const attempt = await AssessmentAttempt.findOne({ _id: req.params.id, userId: req.user.id });
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    const idx = parseInt(req.params.idx, 10);
    const state = (attempt.sectionState || {})[idx] || {};
    const ids = (state.questionIds || []).map((x) => {
      try {
        return new mongoose.Types.ObjectId(String(x));
      } catch {
        return null;
      }
    }).filter(Boolean);
    if (!ids.length) return res.json([]);

    const docs = await Question.find({ _id: { $in: ids } })
      .select('Question Option A Option B Option C Option D difficulty')
      .lean();
    // Preserve the locked order
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);
    res.json(ordered);
  } catch (err) {
    console.error('Section questions error:', err.message);
    res.status(500).json({ error: 'Failed to load section questions' });
  }
});

// GET /api/assessment/coding-question/:id — candidate-safe single coding question
router.get('/coding-question/:id', async (req, res) => {
  try {
    const q = await CodingQuestion.findOne({ _id: req.params.id, isPublished: true, isActive: true })
      .select('title description difficulty constraints starterCode timeLimit memoryLimit testCases')
      .lean();
    if (!q) return res.status(404).json({ error: 'Question not found' });
    // Only visible test cases leave the server
    q.testCases = (q.testCases || []).filter((tc) => !tc.isHidden);
    res.json(q);
  } catch {
    res.status(500).json({ error: 'Failed to load coding question' });
  }
});

// GET /admin/attempts?templateId= — admin monitoring
router.get('/admin/attempts', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.templateId) filter.templateId = req.query.templateId;
    const attempts = await AssessmentAttempt.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('userId', 'name email')
      .lean();
    res.json({ attempts });
  } catch {
    res.status(500).json({ error: 'Failed to load attempts' });
  }
});

module.exports = router;