const AssessmentAttempt = require('../../models/AssessmentAttempt');
const AssessmentTemplate = require('../../models/AssessmentTemplate');
const InterviewSession = require('../../models/InterviewSession');
const ResumeAnalysis = require('../../models/ResumeAnalysis');
const User = require('../../models/User');
const { requireScope } = require('./access');

/**
 * The whitelisted evidence readers.
 *
 * EVERY function here takes a CandidateAccess capability, never a bare
 * candidateId. That is the point: there is no signature in this module you can
 * call without having passed through candidateAccess(), so authorization is an
 * API shape rather than a convention someone has to remember.
 *
 * What this module deliberately does NOT import, per policy/dataAccess.js:
 *   ProctorLog, ProctorSnapshot  — recruiters get integrityVerdict instead
 *   TestResult, AptitudeAttempt  — practice history is not hiring evidence
 *   SavedQuestion, CodingSubmission
 *
 * __tests__/hireBoundary.test.js walks this file's transitive require graph
 * and fails the build if any of those become reachable.
 */

/**
 * Templates this company is allowed to see results from: its own private
 * instruments, plus platform-wide ones.
 *
 * Without this filter a scorecard returns EVERY attempt the candidate ever
 * made. A candidate who sat Acme's private instrument and later accepts Globex
 * would show Globex the Acme attempt — its templateId, section composition and
 * score — so Globex learns that Acme assessed her, roughly what they tested and
 * how she did. Self-practice attempts would surface as hiring evidence too.
 */
async function visibleTemplateIds(companyId) {
  const templates = await AssessmentTemplate.find({
    $or: [{ companyId }, { companyId: null }],
  })
    .select('_id')
    .lean();
  return templates.map((t) => t._id);
}

/** Assessment evidence: section scores and the derived integrity verdict. */
async function getScorecard(access) {
  requireScope(access, 'assessment');

  const attempts = await AssessmentAttempt.find({
    userId: access.candidateId,
    status: { $in: ['completed', 'auto_submitted'] },
    templateId: { $in: await visibleTemplateIds(access.companyId) },
  })
    // Note what is absent: sectionState (the answer key) and violations (the
    // event list). Only the graded outcome and the verdict cross this line.
    .select('templateId status sectionResults integrityVerdict startedAt completedAt')
    .sort({ completedAt: -1 })
    .limit(20)
    .lean();

  return attempts.map((a) => ({
    attemptId: a._id,
    templateId: a.templateId,
    status: a.status,
    // Older attempts predate the derived field; absent is honest, and better
    // than implying a clean run we never actually evaluated.
    integrity: a.integrityVerdict || 'unknown',
    sections: (a.sectionResults || []).map((s) => ({
      index: s.sectionIndex,
      type: s.type,
      score: s.score,
      maxScore: s.maxScore,
      percent: s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : null,
    })),
    startedAt: a.startedAt,
    completedAt: a.completedAt,
  }));
}

/** Interview evidence: the AI's scores. Never the audio. */
async function getInterviewSummary(access) {
  requireScope(access, 'interview');

  // mode filter is load-bearing: this module's header asserts that practice
  // history is not hiring evidence, and a candidate's throwaway practice runs
  // were being scored and shown to recruiters alongside real ones.
  const sessions = await InterviewSession.find({
    user: access.candidateId,
    mode: { $ne: 'practice' },
  })
    .select('role experienceLevel durationSeconds analysisJson createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return sessions
    .filter((s) => s.analysisJson)
    .map((s) => ({
      sessionId: s._id,
      role: s.role,
      experienceLevel: s.experienceLevel,
      durationSeconds: s.durationSeconds,
      overallScore: s.analysisJson.overallScore ?? null,
      // Dimension scores only. The transcript is a separate, later consent.
      // The analyser emits performanceBreakdown / skillsAssessment. Reading
      // `dimensions` or `scores` — neither of which it has ever produced —
      // meant every scorecard rendered an empty breakdown.
      dimensions:
        s.analysisJson.performanceBreakdown
        || s.analysisJson.skillsAssessment
        || null,
      at: s.createdAt,
    }));
}

/** Resume evidence: ATS scoring and keyword fit. */
async function getResumeSummary(access) {
  requireScope(access, 'resume');

  const latest = await ResumeAnalysis.findOne({ user: access.candidateId })
    .select('overallScore atsScore keywordMatch targetRole missingKeywords createdAt')
    .sort({ createdAt: -1 })
    .lean();
  if (!latest) return null;

  return {
    overallScore: latest.overallScore,
    atsScore: latest.atsScore,
    keywordMatch: latest.keywordMatch,
    targetRole: latest.targetRole,
    missingKeywords: (latest.missingKeywords || []).slice(0, 12),
    at: latest.createdAt,
  };
}

/**
 * Identity. The only reader that returns a real person, and the only one a
 * viewer-role member cannot call.
 */
async function getIdentity(access) {
  requireScope(access, 'identity');

  const user = await User.findById(access.candidateId).select('name email').lean();
  if (!user) return null;
  return { name: user.name, email: user.email };
}

/**
 * Everything a scorecard screen needs, in one call.
 *
 * Each part is fetched through its own scope check, so a viewer gets the
 * evidence with `identity: null` rather than an error — the page renders,
 * pseudonymously, which is the correct behaviour for that role.
 */
async function getFullScorecard(access) {
  const [assessments, interviews, resume] = await Promise.all([
    getScorecard(access),
    getInterviewSummary(access),
    getResumeSummary(access),
  ]);
  const identity = access.has('identity') ? await getIdentity(access) : null;

  return {
    candidateId: access.candidateId,
    identity,
    assessments,
    interviews,
    resume,
    scopes: access.scopes(),
  };
}

module.exports = {
  getScorecard,
  getInterviewSummary,
  getResumeSummary,
  getIdentity,
  getFullScorecard,
};
