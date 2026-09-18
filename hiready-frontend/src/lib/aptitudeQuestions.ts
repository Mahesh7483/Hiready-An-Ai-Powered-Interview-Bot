/**
 * Types for the aptitude runner.
 *
 * This file also held a hardcoded array of ten questions WITH THEIR ANSWERS,
 * left over from before the question bank moved server-side. Nothing imported
 * it — both consumers take only AptitudeTestResult — and it was tree-shaken out
 * of the bundle, so it was never a live answer-key leak. It was still a copy of
 * an answer key sitting in client source, which is not a thing to keep lying
 * around in a repository whose whole aptitude design is that the server is the
 * only grader.
 */
export interface AptitudeQuestion {
  id: number;
  question: string;
  options: string[];
  answer: string;
}

export interface AptitudeTestResult {
  score: number;
  totalQuestions: number;
  selectedAnswers: { questionId: string; selected: string; correctAnswer: string; isCorrect: boolean }[];
  startTime: Date;
  endTime: Date;
  timeTaken: string;
  mode: "practice" | "test";
  warningCount?: number;
  topic?: string;
  difficulty?: string;
}
