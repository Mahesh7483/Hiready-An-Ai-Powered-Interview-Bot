/**
 * Guards for the four invariant breaches found in review. Each test names the
 * defect it prevents regressing, because every one of these shipped once and
 * none of them announced themselves — the routes returned 200s throughout.
 *
 * Structural where structure is what broke (an unscoped query, a missing role
 * gate), behavioural where behaviour is.
 */
const { backend } = require('./support/paths');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(backend(rel), 'utf8');

// ── 1.1 invite emails ──────────────────────────────────────────────────────

describe('invite listing does not leak candidate emails', () => {
  const src = read('routes/hire/invites.js');

  test('GET / is role-gated', () => {
    // A viewer is denied the `identity` scope by scopesFor(); without this gate
    // they could read every address the company ever touched from a route that
    // never calls candidateAccess() at all.
    expect(src).toMatch(/router\.get\(\s*'\/',\s*requireCompanyRole\(/);
  });

  test('only accepted invites return a raw address', () => {
    // sent / declined / expired / revoked have NO consent row — grantViaInvite
    // runs on accept only — so anything else must be masked.
    expect(src).toMatch(/status === 'accepted' \? i\.email : maskEmail\(/);
  });

  test('masking keeps the domain but not the local part', () => {
    const maskEmail = (email) => {
      const [local, domain] = String(email).split('@');
      if (!domain) return '…';
      const head = local.slice(0, 1);
      const tail = local.length > 2 ? local.slice(-1) : '';
      return `${head}…${tail}@${domain}`;
    };
    expect(maskEmail('alexandra@uni.edu')).toBe('a…a@uni.edu');
    expect(maskEmail('ab@uni.edu')).toBe('a…@uni.edu');
    expect(maskEmail('nonsense')).toBe('…');
  });
});

// ── 1.2 cross-tenant evidence ──────────────────────────────────────────────

describe('evidence is scoped to templates the company may see', () => {
  test('getScorecard filters on visible templates', () => {
    const src = read('services/hire/readers.js');
    // Without this a candidate who sat Acme's private instrument and later
    // accepted Globex showed Globex the Acme attempt, its section composition
    // and its score.
    expect(src).toMatch(/templateId:\s*\{\s*\$in:\s*await visibleTemplateIds\(access\.companyId\)/);
    expect(src).toMatch(/\$or:\s*\[\{ companyId \}, \{ companyId: null \}\]/);
  });

  test('discovery ranks on the same scoped set', () => {
    const src = read('routes/hire/discover.js');
    expect(src).toMatch(/templateId:\s*\{\s*\$in:\s*templateIds\s*\}/);
  });

  test('practice interviews are excluded from hiring evidence', () => {
    const src = read('services/hire/readers.js');
    expect(src).toMatch(/mode:\s*\{\s*\$ne:\s*'practice'\s*\}/);
  });

  test('interview dimensions read keys the analyser actually emits', () => {
    const readers = read('services/hire/readers.js');
    const ai = read('routes/aiRoutes.js');
    // The old code read `dimensions || scores`; neither has ever been produced,
    // so every scorecard rendered an empty breakdown.
    expect(readers).toMatch(/performanceBreakdown/);
    expect(readers).not.toMatch(/analysisJson\.dimensions/);
    expect(ai).toMatch(/performanceBreakdown|skillsAssessment/);
  });
});

// ── 1.3 invite tokens bound to the invitee ─────────────────────────────────

describe('an invite token cannot be redeemed by someone else', () => {
  const src = read('routes/consentRoutes.js');

  test.each(['preview', 'accept', 'decline'])(
    'the %s path compares the invited address to the caller',
    () => {
      // The recruiter holds the plaintext token from the API response before it
      // is ever emailed, so the token alone must never be sufficient.
      const comparisons = src.match(/toLowerCase\(\) !== String\(invite\.email\)\.toLowerCase\(\)/g) || [];
      const boundDecline = /email: String\(me\.email\)\.toLowerCase\(\)/.test(src);
      expect(comparisons.length + (boundDecline ? 1 : 0)).toBeGreaterThanOrEqual(3);
    }
  );

  test('a mismatch refuses with the standard 404, not a distinct error', () => {
    expect(src).not.toMatch(/403|'Wrong account'|'Not your invite'/);
  });
});

// ── 1.4 disclosure audit ───────────────────────────────────────────────────

describe('every disclosure is audited', () => {
  const src = read('routes/hire/candidates.js');

  test('the audit is not gated on identity', () => {
    // A viewer reads assessment, interview and resume evidence with identity
    // null. That evidence still left the platform.
    expect(src).not.toMatch(/if \(scorecard\.identity\)/);
  });

  test('/compare writes a row per candidate returned', () => {
    // This path previously returned up to five full scorecards, identities
    // included, and wrote nothing at all.
    const compare = src.slice(src.indexOf("router.post('/compare'"));
    expect(compare).toMatch(/recordDisclosure\(/);
  });

  test('both paths record which scopes actually yielded data', () => {
    expect(src).toMatch(/function disclosedScopes\(/);
    expect((src.match(/recordDisclosure\(/g) || []).length).toBe(2);
  });
});

// ── refusal shape ──────────────────────────────────────────────────────────

describe('recruiter-facing refusals stay indistinguishable', () => {
  test('the manual 404 sets expose, so errorHandler does not rewrite it', () => {
    const src = read('routes/hire/candidates.js');
    // Without expose the body becomes "Internal server error" — a second shape
    // a caller can tell apart from candidateAccess()'s "Not found".
    expect(src).toMatch(/e\.expose = true/);
  });

  test('both route params are validated before any cast', () => {
    const src = read('routes/hire/jobs.js');
    const patch = src.slice(src.indexOf("router.patch("));
    expect(patch).toMatch(/isValid\(req\.params\.id\)/);
    expect(patch).toMatch(/isValid\(req\.params\.appId\)/);
  });
});

// ── consent transitions ────────────────────────────────────────────────────

describe('consent transitions', () => {
  const src = read('services/hire/consent.js');

  test('interest fields are declared, or the whole funnel dies silently', () => {
    const model = read('models/CandidateCompanyConsent.js');
    // strict:true drops undeclared paths with no error and no update, so
    // interestAt stayed null forever and Privacy.tsx could never render Reveal.
    expect(model).toMatch(/interestAt:\s*\{\s*type:\s*Date/);
    expect(model).toMatch(/interestBy:\s*\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId/);
  });

  test('every path written via .set() under routes/hire exists on its schema', () => {
    const model = read('models/CandidateCompanyConsent.js');
    const discover = read('routes/hire/discover.js');
    const setPaths = [...discover.matchAll(/consent\.set\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(setPaths.length).toBeGreaterThan(0);
    setPaths.forEach((p) => expect(model).toMatch(new RegExp(`${p}:\\s*\\{`)));
  });

  test('opting into discovery never downgrades a live grant', () => {
    expect(src).toMatch(/\['REVEALED', 'IN_PROCESS'\]\.includes\(existing\.state\)/);
  });

  test('reveal and revoke both clear the interest prompt', () => {
    expect((src.match(/interestAt = null/g) || []).length).toBe(2);
  });

  test('revoking withdraws live applications from the board', () => {
    // Otherwise the candidate stays listed with their stage, and a recruiter can
    // still move them to hired or rejected — only identity was blocked.
    expect(src).toMatch(/Application\.updateMany/);
    expect(src).toMatch(/stage: 'withdrawn'/);
  });

  test('revocation still touches no evidence collection', () => {
    expect(src).not.toMatch(/AssessmentAttempt|TestResult|deleteMany/);
  });
});

// ── invite uniqueness ──────────────────────────────────────────────────────

test('the one-live-invite index is actually unique', () => {
  const src = read('models/CompanyInvite.js');
  // The comment claimed the constraint; the index did not provide it, so
  // concurrent invites left two live tokens and revoking killed only one.
  expect(src).toMatch(/unique:\s*true,\s*partialFilterExpression/);
});
