const { calculateSectionScore, calculateReadinessScore } = require('../services/assessmentScoring');

describe('Assessment scoring & business logic rules', () => {

  test('Standard MCQ scoring awards 1 point per correct answer without penalty', () => {
    const answers = [
      { selected: 'A', correctAnswer: 'A' },
      { selected: 'B', correctAnswer: 'A' },
      { selected: 'C', correctAnswer: 'C' },
      { selected: '', correctAnswer: 'D' }
    ];

    const result = calculateSectionScore(answers, false);
    expect(result.correct).toBe(2);
    expect(result.wrong).toBe(1);
    expect(result.unanswered).toBe(1);
    expect(result.score).toBe(2);
  });

  test('Negative marking subtracts 0.25 per wrong answer', () => {
    const answers = [
      { selected: 'A', correctAnswer: 'A' },
      { selected: 'B', correctAnswer: 'C' },
      { selected: 'D', correctAnswer: 'D' },
      { selected: '', correctAnswer: 'B' }
    ];

    const result = calculateSectionScore(answers, true);
    expect(result.correct).toBe(2);
    expect(result.wrong).toBe(1);
    expect(result.score).toBe(1.75);
  });

  test('Weighted readiness score normalizes correctly across modules', () => {
    const userScores = {
      aptitude: 80,
      interview: 90,
      coding: 100,
      resume: 70
    };

    const compositeScore = calculateReadinessScore(userScores);

    expect(compositeScore).toBe(87); // 24 + 36 + 20 + 7
    expect(compositeScore).toBeGreaterThanOrEqual(0);
    expect(compositeScore).toBeLessThanOrEqual(100);
  });
});
