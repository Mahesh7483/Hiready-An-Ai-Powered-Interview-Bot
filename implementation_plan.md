# Implementation Plan - Unified Technical Assessment Platform (Hiready)

## Overview

Enhance the Hiready platform with six phased features that benefit both the **Aptitude** and **Interview** modules: per-question time analytics, adaptive difficulty, persisted question bookmarks, a unified readiness score, an interview leaderboard, and cross-module weak-topic recommendations. All work follows existing patterns: Express routes in `hiready-backend/routes/`, Mongoose models in `hiready-backend/models/`, React Query (`useQuery`) + `apiJson` in the frontend, shadcn/ui components, and lazy-loaded routes in `src/App.tsx`. Prior executed plan (assessments/proctoring) is preserved at the bottom of this file.

## Types

**Frontend (TypeScript)** — added to or co-located with the consuming page:

```ts
// TimeInsights — Phase 1 (AptitudeDashboard.tsx)
interface TimeInsights {
  avgCorrectMs: number;
  avgWrongMs: number;
  fastWrongCount: number;      // wrong answers answered < 15s (rushed)
  slowCorrectCount: number;    // correct answers answered > 45s (struggled)
  noAnswerCount: number;       // skipped/unanswered
  perTopic: { topic: string; avgMs: number; accuracy: number }[];
}

// BookmarkItem — Phase 3 (Saved Questions tab in notebook)
interface BookmarkItem {
  questionId: string;
  Question: string;
  "Option A": string; "Option B": string; "Option C": string; "Option D": string;
  Answer: string;
  Explanation: string;
  category: string;
  savedAt: string;
}

// ReadinessScore — Phase 4 (Dashboard.tsx, server-computed)
interface ReadinessScore {
  overall: number;             // 0–100 weighted composite
  aptitude: { score: number; weight: number };
  interview: { score: number; weight: number };
  coding: { score: number; weight: number };
  resume: { score: number; weight: number };
}

// InterviewLeaderboardRow — Phase 5 (Leaderboard.tsx)
interface InterviewLeaderboardRow {
  rank: number; name: string; isCaller: boolean;
  sessions: number; avgScore: number; bestScore: number;
}
```

**Backend (Mongoose)** — new model in Phase 3 (`models/SavedQuestion.js`):

```js
{
  userId:     { type: String, required: true, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  category:   { type: String, default: 'logical' },
  note:       { type: String, default: '', maxlength: 500 },
  createdAt:  { type: Date, default: Date.now }
}
// compound unique index { userId: 1, questionId: 1 } to prevent duplicates
```

Key decisions: voice interview stage (Deepgram), server-authoritative clocks and locked question sets, option shuffle per attempt, violation-weighted scoring with fair final warning, no new npm dependencies.

Sections: A2 (AptitudeTestPage topicOptions + questionRoutes difficulty fallback/shuffle/no-repeat + Question index), E (DashboardLayout nav: Technical Round + Assessments), B1 (models/AssessmentTemplate.js + models/AssessmentAttempt.js + routes/assessmentRoutes.js mounted at /api/assessment), B2 (lib/assessmentApi.ts + pages/AssessmentLanding.tsx + pages/AssessmentPipeline.tsx + App.tsx routes), B3 (pages/admin/AdminAssessments.tsx + scripts/seed-assessment-template.js), C (useProctoringDetection gaze_away_detected + attemptId plumbing + weighted violations), D (resumeDriven personalization from latest ResumeAnalysis), F (indexes, no-repeat serving, final tsc/lint/build verification).

---

## Files

**New files**
| Path | Purpose |
|---|---|
| `hiready-backend/models/SavedQuestion.js` | Bookmark persistence model (Phase 3) |
| `hiready-backend/routes/readinessRoutes.js` | Unified readiness score aggregation (Phase 4) |
| `hiready-frontend/src/components/ReadinessGauge.tsx` | Radial gauge card for Dashboard hero (Phase 4) |

**Modified files**
| Path | Change |
|---|---|
| `hiready-backend/routes/questionRoutes.js` | P1: extend `GET /analytics/me` with `timeInsights`. P2: add `GET /quiz/:category/adaptive`. P3: add bookmark routes. P6: add `GET /weak-topics/me` |
| `hiready-backend/routes/interviewSessionRoutes.js` | P5: add `GET /sessions/leaderboard` aggregating `analysisJson` scores per user |
| `hiready-backend/server.js` | P4: mount `readinessRoutes` at `/api/readiness`; P3: add `DELETE` to CORS methods (needed for bookmark removal from the browser — preflight currently only allows GET/POST) |
| `hiready-frontend/src/pages/AptitudeDashboard.tsx` | P1: new "Time Insights" card (Recharts BarChart, avg time per topic + rushed/struggled counters) |
| `hiready-frontend/src/pages/AptitudeTestPage.tsx` | P2: "Adaptive difficulty" toggle, passed to `AptitudeTest` |
| `hiready-frontend/src/pages/AptitudeTest.tsx` | P2: accept `adaptive` prop, difficulty badge per question; P3: Bookmark button next to Mark-for-Review |
| `hiready-frontend/src/pages/WrongAnswersNotebook.tsx` | P3: tabbed layout — "Wrong Answers" / "Saved Questions" |
| `hiready-frontend/src/pages/Dashboard.tsx` | P4: use server-computed `/readiness/me` (fallback to existing client calc) + `ReadinessGauge`; P6: weak-topic chips |
| `hiready-frontend/src/pages/Leaderboard.tsx` | P5: tabs "Aptitude" / "Interview" |

**Read-only dependencies (no schema change needed):** `TestResult.js` (`timeSpentMs` already captured), `InterviewSession.js` (`analysisJson` Mixed), `Question.js` (`difficulty` field exists), `ResumeAnalysis.js` (`overallScore` 0–100), `CodingSubmission.js` (`passed`, `score`).

## Functions

- `computeTimeInsights(results)` — `questionRoutes.js`; pure aggregation over `TestResult.selectedAnswers.timeSpentMs`. FAST_WRONG < 15s, SLOW_CORRECT > 45s. Merged into `/analytics/me` response as `timeInsights` (additive, backwards compatible).
- `GET /quiz/:category/adaptive` — `questionRoutes.js`; reads up to 50 recent `TestResult` docs for `req.user.id`, computes per-topic accuracy, picks a difficulty ladder (start medium; 2 right → up, 2 wrong → down), serves a mixed batch. Never exposes `Answer`.
- `POST /bookmarks` / `GET /bookmarks/me` / `DELETE /bookmarks/:questionId` — `questionRoutes.js`; requireAuth; upsert guarded by compound unique index; DELETE restricted to the caller's own rows.
- `GET /weak-topics/me` — `questionRoutes.js`; topics with accuracy < 60% and ≥ 5 answered questions from `TestResult`.
- `GET /sessions/leaderboard` — `interviewSessionRoutes.js`; aggregates `InterviewSession.analysisJson` scores per user (tolerant `$ifNull` for score location), attaches names like the aptitude leaderboard.
- `GET /api/readiness/me` — `readinessRoutes.js`; weights: aptitude accuracy 30%, interview avg analysis score 40%, coding pass-rate 20%, resume `overallScore` 10%; missing modules drop out and weights renormalize to 100%.

## Dependencies

- **No new npm packages.** Recharts (`RadialBarChart` for the gauge), lucide-react (`Bookmark`, `BookmarkCheck`, `Gauge` icons) and React Query are already in use.
- MongoDB compound index on `SavedQuestion` is created automatically on first use.

## Testing

1. `node --check` each modified backend file; `npx tsc --noEmit` + `npx eslint` on touched frontend files; `npm run build` must stay green.
2. Manual smoke: `/analytics/me` (verify `timeInsights`), `/quiz/logical/adaptive`, bookmark POST/GET/DELETE round-trip, `/readiness/me` with partial data (no coding submissions), interview leaderboard.

## Implementation Order

1. **Phase 1 — Time insights** (backend analytics → dashboard card)
2. **Phase 2 — Adaptive difficulty** (new quiz endpoint → test-page toggle)
3. **Phase 3 — Bookmarks** (model → routes → test-page button → notebook tabs)
4. **Phase 4 — Unified readiness score** (readiness route → Dashboard gauge)
5. **Phase 5 — Interview leaderboard** (session leaderboard route → Leaderboard tabs)
6. **Phase 6 — Cross-module recommendations** (weak-topics endpoint → Dashboard chips)
