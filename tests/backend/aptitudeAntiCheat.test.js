const { backend, frontend } = require('./support/paths');
const fs = require('fs');
const path = require('path');

/**
 * Structural guards for the aptitude anti-cheat work.
 *
 * What was wrong: POST /api/questions/quiz/submit had NO requireAuth, accepted
 * any list of questionIds bound to no attempt, and returned `correctAnswer` for
 * every one of them. GET /quiz/:category was also unauthenticated, so the ids
 * to feed it were free too. Together they were a complete, public answer key.
 *
 * Worse, the aptitude test page graded itself from that response and kept the
 * score in sessionStorage, with a pure client-side fallback that read
 * `question.Answer` directly — a field the browser should never hold.
 *
 * These are source-level assertions because the properties are about which
 * code paths EXIST, not about what one request returns. A runtime test can
 * show a route behaving; only this can show the dangerous route is gone.
 */

const BACKEND = backend();
const FRONTEND = frontend();
const read = (p) => fs.readFileSync(p, 'utf8');

const questionRoutes = read(path.join(BACKEND, 'routes', 'questionRoutes.js'));
const aptitudeTest = read(path.join(FRONTEND, 'src', 'pages', 'AptitudeTest.tsx'));

describe('the unauthenticated answer-key oracle is gone', () => {
  test('POST /quiz/submit no longer exists', () => {
    expect(questionRoutes).not.toMatch(/router\.post\(\s*['"]\/quiz\/submit['"]/);
  });

  test('no route returns a correctAnswer built from Question.Answer', () => {
    // The oracle's tell: `correctAnswer: question.Answer` in a response.
    expect(questionRoutes).not.toMatch(/correctAnswer:\s*question\.Answer/);
  });

  test('the frontend no longer calls it', () => {
    expect(aptitudeTest).not.toMatch(/quiz\/submit/);
  });
});

describe('every question-serving route requires authentication', () => {
  test.each([
    ['/quiz/:category', "router.get('/quiz/:category'"],
    ['/quiz/:category/adaptive', "router.get('/quiz/:category/adaptive'"],
  ])('%s is behind requireAuth', (_label, needle) => {
    const at = questionRoutes.indexOf(needle);
    expect(at).toBeGreaterThan(-1);
    // requireAuth must appear in the handler signature itself, not merely
    // somewhere in the file.
    expect(questionRoutes.slice(at, at + 120)).toMatch(/requireAuth/);
  });
});

describe('grading is server-authoritative', () => {
  const saveResult = questionRoutes.slice(
    questionRoutes.indexOf("router.post('/quiz/save-result'"),
    questionRoutes.indexOf("router.get('/quiz/result/:id'")
  );

  test('the grader is reachable and scoped', () => {
    expect(saveResult.length).toBeGreaterThan(500);
  });

  test('it binds to a server-issued attempt and checks ownership', () => {
    expect(saveResult).toMatch(/AptitudeAttempt\.findById/);
    expect(saveResult).toMatch(/attempt\.userId\) !== String\(userId\)/);
  });

  test('it rejects an expired attempt', () => {
    expect(saveResult).toMatch(/attempt\.expiresAt/);
  });

  test('it grades over the ids the SERVER locked, not the ids submitted', () => {
    // The denominator has to come from the attempt, or a short submission
    // scores 3/3 instead of 3/20.
    expect(saveResult).toMatch(/for \(const idObj of attempt\.questionIds\)/);
  });

  test('it states that client-supplied scores are ignored', () => {
    expect(saveResult).toMatch(/completely ignored/i);
  });
});

describe('an issued attempt carries a server-side deadline', () => {
  test('EVERY attempt-creation site sets expiresAt', () => {
    // Without it the model's expiry check can never fire, so an attempt could
    // be parked and resumed days later with the answers looked up in between.
    // There are two creation sites — /quiz/start and the auto-issue inside
    // /quiz/:category — and the first draft of this guard only checked one,
    // which is exactly how the second stayed unset.
    const sites = [...questionRoutes.matchAll(/new AptitudeAttempt\(\{/g)].map((m) => m.index);
    expect(sites.length).toBeGreaterThanOrEqual(2);
    const missing = sites.filter((i) => !/expiresAt:\s*new Date\(/.test(questionRoutes.slice(i, i + 1400)));
    expect(missing).toEqual([]);
  });
});

describe('no route reveals an answer mid-attempt', () => {
  test('the reveal endpoint is gone', () => {
    // It existed briefly to give practice per-question feedback after the open
    // oracle was deleted. Practice now answers everything and reviews against
    // the server's grading at the end, so there is no mid-attempt reveal path
    // to guard — which is stronger than guarding one.
    expect(questionRoutes).not.toMatch(/router\.post\([^)]*reveal/);
  });

  test('no handler returns an answer key field', () => {
    expect(questionRoutes).not.toMatch(/correctAnswer:\s*(question|key|String\(key)/);
  });

  test('the client has no reveal call', () => {
    expect(aptitudeTest).not.toMatch(/\/reveal/);
  });
});

describe('the attempt id reaches the browser', () => {
  test('both question routes return attemptId in the BODY', () => {
    // It was sent only as an X-Attempt-Id response header, which a
    // cross-origin browser cannot read without Access-Control-Expose-Headers.
    // The client therefore always saw null, and every graded action failed
    // with "not registered" — practice could not even be finished.
    expect(questionRoutes).toMatch(/res\.json\(\{ attemptId, questions: sanitized \}\)/);
    const adaptive = questionRoutes.slice(questionRoutes.indexOf("'/quiz/:category/adaptive'"));
    expect(adaptive.slice(0, 4000)).toMatch(/attemptId,/);
  });

  test('no route relies on a custom header to carry it', () => {
    expect(questionRoutes).not.toMatch(/setHeader\('X-Attempt-Id'/);
  });

  test('the adaptive route issues an attempt at all', () => {
    // It projected Answer out of its samples, so it had no key to lock and
    // issued nothing — adaptive runs could never be graded.
    const adaptive = questionRoutes.slice(questionRoutes.indexOf("'/quiz/:category/adaptive'"));
    expect(adaptive.slice(0, 4000)).toMatch(/issueAptitudeAttempt\(/);
  });

  test('the client reads it from the body and fails loudly without it', () => {
    expect(aptitudeTest).toMatch(/attemptIdRef\.current = data\.attemptId/);
    expect(aptitudeTest).toMatch(/did not register this session/);
  });
});

describe('the browser never grades', () => {
  test('AptitudeTest has no client-side scoring fallback', () => {
    // It used to compute isCorrect from `question?.Answer` when the server
    // response was empty — reading a field the client should not possess.
    expect(aptitudeTest).not.toMatch(/isCorrect:\s*question\?\.Answer/);
    expect(aptitudeTest).not.toMatch(/correctAnswer:\s*question\?\.Answer/);
  });

  test('the displayed score comes from the grader response', () => {
    expect(aptitudeTest).toMatch(/score:\s*graded\.score/);
    expect(aptitudeTest).toMatch(/totalQuestions:\s*graded\.totalQuestions/);
  });

  test('it refuses to submit without a server-issued attempt', () => {
    expect(aptitudeTest).toMatch(/if \(!attemptId\)/);
  });

  test('it declares the mode to the server, not just to the UI', () => {
    expect(aptitudeTest).toMatch(/mode: isPractice \? "practice" : "test"/);
  });
});

describe('the revealed-questions field is declared on the schema', () => {
  test('AptitudeAttempt declares revealedQuestionIds', () => {
    // strict:true drops an undeclared path in silence — no error, no update —
    // which would make the reveal record a no-op that still answers 200.
    const model = read(path.join(BACKEND, 'models', 'AptitudeAttempt.js'));
    expect(model).toMatch(/revealedQuestionIds:\s*\[\{/);
  });
});
