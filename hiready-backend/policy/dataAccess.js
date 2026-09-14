/**
 * The single source of truth for who may read what.
 *
 * This file is read by machines and people. __tests__/hireBoundary.test.js
 * DERIVES its forbidden-import list from the NEVER rows below, so adding a new
 * NEVER entry automatically extends the build-time check — the list is never
 * maintained by hand in two places.
 *
 * A rule that lives only in a review comment gets broken by the fourth
 * endpoint someone adds in a hurry. This one breaks the build instead.
 */

// ── Access levels ───────────────────────────────────────────────────────────

/** Only the subject's own rows. */
const OWN = 'own';

/** Requires an active CandidateCompanyConsent carrying the matching scope. */
const CONSENT = 'consent';

/** Permitted outright for this actor. */
const ALLOW = 'allow';

/** Permitted, but audited, and the caller must record a reason. */
const RESTRICTED = 'restricted';

/**
 * No code path may exist to even perform the check.
 *
 * Deliberately distinct from a denial. "Denied" is an authorization outcome —
 * the check ran and said no. NEVER asserts that recruiter code must not be
 * able to reach the model at all, which is what the import test enforces.
 * One table, two guards: runtime and build time.
 */
const NEVER = 'never';

// ── The table ───────────────────────────────────────────────────────────────
//
// `scope` names the CandidateAccess scope a reader must hold to see this.
// It is null wherever recruiters have no path to the data at all.

const POLICY = [
  {
    key: 'assessmentResult',
    models: ['AssessmentAttempt'],
    scope: 'assessment',
    candidate: OWN, recruiter: CONSENT, admin: ALLOW,
  },
  {
    key: 'resumeAnalysis',
    models: ['ResumeAnalysis'],
    scope: 'resume',
    candidate: OWN, recruiter: CONSENT, admin: ALLOW,
  },
  {
    key: 'interviewScores',
    models: ['InterviewSession'],
    scope: 'interview',
    candidate: OWN, recruiter: CONSENT, admin: ALLOW,
  },
  {
    key: 'identity',
    models: ['User'],
    scope: 'identity',
    candidate: OWN, recruiter: CONSENT, admin: ALLOW,
  },
  {
    // Derived onto AssessmentAttempt at finalisation from the violation score.
    // This is how a recruiter learns a result is untrustworthy WITHOUT any
    // path to the proctoring records that produced it.
    key: 'integrityVerdict',
    models: [],
    scope: 'assessment',
    candidate: OWN, recruiter: CONSENT, admin: ALLOW,
  },
  {
    key: 'proctorEvents',
    models: ['ProctorLog'],
    scope: null,
    candidate: OWN, recruiter: NEVER, admin: RESTRICTED,
  },
  {
    // Biometric. See models/ProctorSnapshot.js.
    key: 'proctorSnapshots',
    models: ['ProctorSnapshot'],
    scope: null,
    candidate: OWN, recruiter: NEVER, admin: RESTRICTED,
  },
  {
    key: 'practiceHistory',
    models: ['TestResult', 'AptitudeAttempt', 'SavedQuestion', 'CodingSubmission'],
    scope: null,
    candidate: OWN, recruiter: NEVER, admin: RESTRICTED,
  },
];

/** Model names no recruiter-facing file may reach, directly or transitively. */
function forbiddenForRecruiters() {
  return [...new Set(POLICY.filter((p) => p.recruiter === NEVER).flatMap((p) => p.models))];
}

/** The CandidateAccess scopes a recruiter can ever hold. */
function recruiterScopes() {
  return [...new Set(POLICY.filter((p) => p.recruiter === CONSENT && p.scope).map((p) => p.scope))];
}

module.exports = {
  OWN, CONSENT, ALLOW, RESTRICTED, NEVER,
  POLICY,
  forbiddenForRecruiters,
  recruiterScopes,
};
