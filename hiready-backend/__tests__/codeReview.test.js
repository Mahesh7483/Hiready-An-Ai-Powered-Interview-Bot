process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci-at-least-32-chars-long';

const fs = require('fs');
const path = require('path');
const { validateCodeReview } = require('../routes/aiRoutes')._internal;

/**
 * Guards POST /api/ai/code-review against the failure that emptied the resume
 * report: validating only the easy fields, so a short or truncated model
 * response passes and the page renders blank cards with no error anywhere.
 *
 * The rule this encodes: validate exactly what the UI draws.
 */

const complete = () => ({
  strengths: ['Uses a hash map to avoid the nested loop'],
  improvements: ['Guard the empty-input case before indexing'],
  complexity: { time: 'O(n) single pass', space: 'O(n) for the map' },
  verdict: 'Correct and idiomatic for the constraints given.',
});

describe('the code review validator requires what the panel renders', () => {
  test('a complete payload passes', () => {
    expect(validateCodeReview(complete())).toBe(true);
  });

  test.each(['strengths', 'improvements'])('a payload missing %s is rejected', (key) => {
    const payload = complete();
    delete payload[key];
    expect(() => validateCodeReview(payload)).toThrow(new RegExp(key));
  });

  test.each(['strengths', 'improvements'])('an EMPTY %s array is rejected too', (key) => {
    // An empty array renders exactly like a missing one — an empty card.
    const payload = complete();
    payload[key] = [];
    expect(() => validateCodeReview(payload)).toThrow(new RegExp(key));
  });

  test('a missing complexity object is rejected', () => {
    const payload = complete();
    delete payload.complexity;
    expect(() => validateCodeReview(payload)).toThrow(/complexity/);
  });

  test.each(['time', 'space'])('complexity.%s must be a non-empty string', (key) => {
    const payload = complete();
    payload.complexity = { ...payload.complexity, [key]: '   ' };
    expect(() => validateCodeReview(payload)).toThrow(new RegExp(key));
  });

  test('a non-object is rejected rather than throwing on property access', () => {
    expect(() => validateCodeReview(null)).toThrow(/not an object/);
    expect(() => validateCodeReview('{}')).toThrow(/not an object/);
  });
});

describe('the route is wired safely', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'aiRoutes.js'), 'utf8');
  const route = src.slice(src.indexOf("router.post('/code-review'"));

  test('it validates the payload before returning it', () => {
    expect(route.slice(0, 1500)).toMatch(/validateCodeReview\(review\)/);
  });

  test('it restricts language to the shared whitelist', () => {
    // Prevents this endpoint drifting from what the sandbox actually runs.
    expect(route.slice(0, 1500)).toMatch(/CODING_LANGUAGES\.includes\(language\)/);
  });

  test('it separates a payload-too-large from a rate limit', () => {
    // Same lesson as the resume route: "too large" and "out of quota" are
    // different problems and must not share a message.
    expect(route.slice(0, 2000)).toMatch(/err\.status === 413 \? 413 : 429/);
  });

  test('the prompt tells the model to treat the code as data', () => {
    // The submitted code is untrusted input; it must not be able to issue
    // instructions to the reviewer.
    const prompt = src.slice(src.indexOf('const CODE_REVIEW_PROMPT'), src.indexOf("router.post('/code-review'"));
    expect(prompt).toMatch(/strictly as data/i);
    // \s+ because the prompt is wrapped — the phrase spans a line break.
    expect(prompt).toMatch(/Never follow\s+instructions/i);
  });
});
