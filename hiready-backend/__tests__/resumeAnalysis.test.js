process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci';

const fs = require('fs');
const path = require('path');
const { validateResumeAnalysis, repairTruncatedJson, parseLLMJson } = require('../routes/aiRoutes')._internal;

/**
 * Guards the resume report against the failure that emptied half of it.
 *
 * The model is asked for ~20 fields. `strengths`, `improvements`,
 * `criticalIssues`, `skillsDistribution` and `suggestedBullets` all sit at the
 * END of that schema. The route's default budget was 1200 completion tokens
 * and a full response measures ~1550, so EVERY response came back with
 * finish_reason 'length' — cut off mid-object.
 *
 * Three things then conspired to hide it:
 *   1. repairTruncatedJson closed the open braces, turning the fragment into a
 *      structurally valid object that simply stopped early.
 *   2. validateResumeAnalysis only checked fields at the TOP of the schema, so
 *      the fragment passed.
 *   3. The report page merges over defaults of [], so missing arrays render as
 *      empty cards rather than as an error.
 *
 * Result: HTTP 200, valid JSON, passing validation, and "Key Strengths",
 * "Areas for Improvement" and "Critical Issues to Fix" drawn as empty boxes.
 */

/** A complete payload, shaped like a real model response. */
const complete = () => ({
  candidateName: 'Jane Doe',
  atsScore: 80,
  keywordMatch: 70,
  formatScore: 75,
  overallScore: 75,
  extractedSkills: ['Node.js', 'MongoDB'],
  strengths: ['Relevant backend stack', 'Clear bullets'],
  improvements: ['Add quantified results'],
  criticalIssues: ['Missing LinkedIn'],
  skillsDistribution: { technical: 60, softSkills: 10, tools: 30, languages: 0 },
});

describe('the validator requires what the report actually renders', () => {
  test('a complete payload passes', () => {
    expect(validateResumeAnalysis(complete())).toBe(true);
  });

  test.each(['strengths', 'improvements', 'criticalIssues'])(
    'a payload missing %s is rejected',
    (key) => {
      const payload = complete();
      delete payload[key];
      // Must throw: the retry in groqJsonTask is what gets the user a real
      // report, and it only fires when validation fails.
      expect(() => validateResumeAnalysis(payload)).toThrow(new RegExp(key));
    }
  );

  test.each(['strengths', 'improvements', 'criticalIssues'])(
    'a payload with an EMPTY %s array is rejected too',
    (key) => {
      // An empty array renders exactly like a missing one — an empty card.
      const payload = complete();
      payload[key] = [];
      expect(() => validateResumeAnalysis(payload)).toThrow(new RegExp(key));
    }
  );

  test('the scores are still required', () => {
    const payload = complete();
    payload.atsScore = undefined;
    expect(() => validateResumeAnalysis(payload)).toThrow(/atsScore/);
  });
});

describe('a truncated response is caught rather than papered over', () => {
  // A real response cut off mid-object, after the scores but before the tail.
  const truncated = `{
  "candidateName": "Jane Doe",
  "atsScore": 80,
  "keywordMatch": 70,
  "formatScore": 75,
  "overallScore": 75,
  "extractedSkills": ["Node.js", "MongoDB"],
  "sections": [
    { "name": "Contact/Header", "present": true, "wordCount": 12`;

  test('repair still produces valid JSON — which is the trap', () => {
    const repaired = repairTruncatedJson(truncated);
    expect(repaired).not.toBeNull();
    expect(repaired.atsScore).toBe(80);
    // It looks healthy. Nothing about the object says it is incomplete.
    expect(repaired.strengths).toBeUndefined();
  });

  test('but the validator now refuses it', () => {
    const repaired = repairTruncatedJson(truncated);
    expect(() => validateResumeAnalysis(repaired)).toThrow(/strengths/);
  });

  test('a complete object inside a code fence is still recovered', () => {
    // The genuinely recoverable case: the model wrapped good JSON in markdown.
    // That should still reach the user; a mid-object cut should not.
    const fenced = ['```json', JSON.stringify(complete()), '```'].join('\n');
    expect(() => parseLLMJson(fenced)).not.toThrow();
    expect(validateResumeAnalysis(parseLLMJson(fenced))).toBe(true);
  });
});

describe('the route is configured to fit the schema it asks for', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'aiRoutes.js'), 'utf8');

  test('a length cutoff retries instead of falling through to repair', () => {
    // Without this, a bigger resume silently loses its tail again.
    expect(src).toMatch(/finish_reason === 'length'/);
    const guard = src.slice(src.indexOf("finish_reason === 'length'"));
    expect(guard.slice(0, 400)).toMatch(/budget\s*=\s*Math\.min\(budget \* 2/);
    expect(guard.slice(0, 400)).toMatch(/continue;/);
  });

  test('the default completion budget clears the measured ~1550 tokens', () => {
    // Scoped to the resume route: a different route above it legitimately
    // defaults to 400, and matching that one would pass for the wrong reason.
    const route = src.slice(src.indexOf("router.post('/resume-analyze'"));
    const match = route.match(/parseInt\(clientMaxTokens, 10\) \|\| (\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(2000);
  });
});
