/**
 * Assessment Scoring & Readiness Normalization Service
 */

/**
 * Calculates score for a single assessment section with optional negative marking.
 *
 * @param {Array<{ selected?: string, correctAnswer?: string }>} answers
 * @param {boolean} [negativeMarking=false]
 * @param {number} [penalty=0.25]
 * @returns {{ score: number, rawScore: number, correct: number, wrong: number, unanswered: number, total: number, accuracy: number }}
 */
function calculateSectionScore(answers = [], negativeMarking = false, penalty = 0.25) {
  let score = 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;

  for (const ans of answers) {
    const sel = (ans?.selected || '').trim().toUpperCase();
    const expected = (ans?.correctAnswer || '').trim().toUpperCase();

    if (!sel) {
      unanswered++;
    } else if (sel === expected) {
      correct++;
      score += 1;
    } else {
      wrong++;
      if (negativeMarking) {
        score -= penalty;
      }
    }
  }

  const total = answers.length;
  const accuracy = total > 0 && (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;

  return {
    score: Math.max(0, score),
    rawScore: score,
    correct,
    wrong,
    unanswered,
    total,
    accuracy,
  };
}

/**
 * Calculates weighted composite readiness score across platform pillars.
 *
 * @param {{ aptitude?: number, interview?: number, coding?: number, resume?: number }} scores
 * @param {{ aptitude?: number, interview?: number, coding?: number, resume?: number }} [customWeights]
 * @returns {number} Normalized score 0-100
 */
function calculateReadinessScore(scores = {}, customWeights = {}) {
  const weights = {
    aptitude: 0.3,
    interview: 0.4,
    coding: 0.2,
    resume: 0.1,
    ...customWeights,
  };

  const apt = Math.max(0, Math.min(100, scores.aptitude || 0));
  const intv = Math.max(0, Math.min(100, scores.interview || 0));
  const code = Math.max(0, Math.min(100, scores.coding || 0));
  const res = Math.max(0, Math.min(100, scores.resume || 0));

  const composite = (apt * weights.aptitude) + (intv * weights.interview) + (code * weights.coding) + (res * weights.resume);
  return Math.round(Math.max(0, Math.min(100, composite)));
}

module.exports = {
  calculateSectionScore,
  calculateReadinessScore,
};
