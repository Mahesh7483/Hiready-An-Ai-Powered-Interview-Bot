/**
 * Derives the single integrity signal a recruiter is allowed to see.
 *
 * This lives OUTSIDE services/hire on purpose. It is part of the
 * evidence-production domain, which is allowed to know about violations;
 * hiring is the consumption domain, which is not. /hire reads the stored
 * verdict off AssessmentAttempt and never calls this.
 *
 * A company that commissioned an assessment cannot be left hiring on a score
 * the system knows was cheated — but it also has no business seeing which
 * events fired or what the webcam recorded.
 */

/**
 * @param {object} attempt  an AssessmentAttempt
 * @param {number} threshold  template.violationThreshold
 * @returns {'clean'|'flagged'|'invalidated'}
 */
function deriveVerdict(attempt, threshold = 100) {
  if (!attempt) return 'clean';

  // Auto-submitted means the threshold was crossed mid-attempt: the run was
  // cut short by the anti-cheat, so the score does not represent the work.
  if (attempt.status === 'auto_submitted') return 'invalidated';

  const score = Number(attempt.violationScore) || 0;
  if (score >= (Number(threshold) || 100)) return 'invalidated';

  // Any recorded violation weight at all is worth surfacing, without
  // disclosing what it was.
  if (score > 0 || (Array.isArray(attempt.violations) && attempt.violations.length > 0)) {
    return 'flagged';
  }
  return 'clean';
}

/** Sets the verdict on an attempt document. Call once, at finalisation. */
function stampVerdict(attempt, threshold) {
  attempt.integrityVerdict = deriveVerdict(attempt, threshold);
  return attempt.integrityVerdict;
}

module.exports = { deriveVerdict, stampVerdict };
