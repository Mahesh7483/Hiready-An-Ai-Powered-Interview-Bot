const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

/**
 * Guards against a schema silently compiling to the wrong shape.
 *
 * Mongoose's `typeKey` is the string 'type'. So a subdocument definition that
 * happens to contain a field genuinely called `type`:
 *
 *   sectionResults: [{ sectionIndex: Number, type: String, score: Number }]
 *
 * is not read as a subdocument at all. Mongoose sees the `type` key, treats
 * the whole object as a TYPE DECLARATION, and compiles the path to [String].
 * There is no warning. The model loads, the app starts, the tests pass — and
 * then `attempt.sectionResults.push({...})` throws a CastError at the push,
 * which POST /attempt/:id/section/submit caught and reported as a generic
 * 500 'Failed to submit section'.
 *
 * The result: no assessment could ever be completed, the collection held zero
 * scored attempts, and every recruiter scorecard was empty for a reason no
 * error message anywhere named. Present since the initial commit.
 *
 * The fix is to wrap it — `type: { type: String }` — which `violations` in the
 * same file had always done. These tests assert the compiled shape rather than
 * the source text, because the source looked perfectly reasonable.
 */

const MODELS = path.join(__dirname, '..', 'models');

/** Paths that MUST be arrays of subdocuments, with the fields each needs. */
const SUBDOCUMENT_ARRAYS = [
  ['AssessmentAttempt', 'sectionResults', ['sectionIndex', 'type', 'score', 'maxScore', 'meta']],
  ['AssessmentAttempt', 'violations', ['type', 'weight', 'at']],
  ['Application', 'history', ['from', 'to', 'at']],
];

describe('subdocument arrays did not collapse to a primitive', () => {
  test.each(SUBDOCUMENT_ARRAYS)('%s.%s', (modelName, pathName, fields) => {
    // eslint-disable-next-line global-require
    const Model = require(path.join(MODELS, `${modelName}.js`));
    const schemaPath = Model.schema.path(pathName);

    expect(schemaPath).toBeDefined();
    expect(schemaPath.instance).toBe('Array');
    // The whole point: a collapsed path is an Array whose caster is a String,
    // and has no subdocument schema at all.
    expect(schemaPath.schema).toBeTruthy();
    fields.forEach((f) => expect(Object.keys(schemaPath.schema.paths)).toContain(f));
  });
});

describe('a section result survives a push and validation', () => {
  // The structural check above would pass on a schema that is subdocument-
  // shaped but wrong in some other way, so exercise the operation that broke.
  test('pushing a scored section validates cleanly and keeps its fields', () => {
    // eslint-disable-next-line global-require
    const AssessmentAttempt = require(path.join(MODELS, 'AssessmentAttempt.js'));
    const attempt = new AssessmentAttempt({
      userId: new mongoose.Types.ObjectId(),
      templateId: new mongoose.Types.ObjectId(),
    });

    expect(() => {
      attempt.sectionResults.push({
        sectionIndex: 0,
        type: 'aptitude',
        score: 7,
        maxScore: 10,
        meta: { questionIds: ['a', 'b'] },
      });
    }).not.toThrow();

    expect(attempt.validateSync()).toBeUndefined();

    const [stored] = attempt.sectionResults;
    expect(stored.type).toBe('aptitude');
    expect(stored.score).toBe(7);
    expect(stored.maxScore).toBe(10);
    // meta carries the no-repeat question ids that later attempts exclude.
    expect(stored.meta.questionIds).toEqual(['a', 'b']);
  });

  test('the readers can compute a percent from what was stored', () => {
    // services/hire/readers.js divides score by maxScore. On the collapsed
    // schema both were undefined, so every section rendered as null.
    // eslint-disable-next-line global-require
    const AssessmentAttempt = require(path.join(MODELS, 'AssessmentAttempt.js'));
    const attempt = new AssessmentAttempt({
      userId: new mongoose.Types.ObjectId(),
      templateId: new mongoose.Types.ObjectId(),
    });
    attempt.sectionResults.push({ sectionIndex: 0, type: 'aptitude', score: 9, maxScore: 10 });

    const s = attempt.sectionResults[0];
    expect(s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : null).toBe(90);
  });
});

describe('no array path silently lost its subdocument schema', () => {
  /** Arrays that are legitimately arrays of primitives. */
  const PRIMITIVE_ARRAYS = new Set([
    'CodingQuestion.tags',
    'CodingQuestion.companies',
    'CodingQuestion.relatedTopics',
    'DisclosureAudit.scopes',
    'ResumeAnalysis.skills',
    'ResumeAnalysis.missingKeywords',
  ]);

  test('every non-primitive array across all models is a subdocument array', () => {
    const collapsed = [];
    fs.readdirSync(MODELS).filter((f) => f.endsWith('.js')).forEach((file) => {
      // eslint-disable-next-line global-require
      const Model = require(path.join(MODELS, file));
      if (!Model || !Model.schema) return;
      const name = file.replace(/\.js$/, '');
      Model.schema.eachPath((p, type) => {
        if (type.instance !== 'Array' || type.schema) return;
        const caster = type.caster ? type.caster.instance : null;
        // ObjectId arrays are references, not subdocuments.
        if (!caster || caster === 'ObjectId') return;
        if (PRIMITIVE_ARRAYS.has(`${name}.${p}`)) return;
        collapsed.push(`${name}.${p} -> [${caster}]`);
      });
    });
    // Anything new here is either a genuine string array — add it to
    // PRIMITIVE_ARRAYS above, deliberately — or a collapsed subdocument.
    expect(collapsed).toEqual([]);
  });
});

describe('a projection never asks for a schema path it cannot name', () => {
  /**
   * Mongoose's string form of .select() splits on whitespace. Any schema path
   * that contains a space therefore CANNOT be expressed that way:
   *
   *   .select('Question Option A Option B Option C Option D difficulty')
   *
   * asked Mongo for Question, Option, A, B, C, D and difficulty. Only two of
   * those exist. Every candidate reached the aptitude section of the
   * assessment pipeline with no answer options to choose from, and nothing
   * errored — Mongo returns documents for a projection of paths that do not
   * exist, just without those fields.
   *
   * Derived from the models, not from a list someone has to remember to
   * extend: if a future schema adds another space-bearing path, this guard
   * covers it the moment it exists.
   */
  const BACKEND_ROOT = path.join(__dirname, '..');
  const SRC_DIRS = ['routes', 'services'];

  /** Every schema path anywhere in models/ whose name contains whitespace. */
  function spaceBearingPaths() {
    const out = new Set();
    fs.readdirSync(MODELS).filter((f) => f.endsWith('.js')).forEach((file) => {
      // eslint-disable-next-line global-require
      const Model = require(path.join(MODELS, file));
      if (!Model || !Model.schema) return;
      Model.schema.eachPath((p) => {
        if (/\s/.test(p)) out.add(p);
      });
    });
    return out;
  }

  /** Every string-form .select('...') call under routes/ and services/. */
  function stringSelects() {
    const out = [];
    const walk = (dir) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        if (e.name === 'node_modules') return;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        if (!e.name.endsWith('.js')) return;
        const src = fs.readFileSync(full, 'utf8');
        src.split(/\r?\n/).forEach((line, i) => {
          // Skip comments — the fix documents the broken form in prose.
          if (/^\s*(\*|\/\/)/.test(line)) return;
          const m = line.match(/\.select\(\s*'([^']+)'\s*\)/);
          if (m) {
            out.push({
              file: path.relative(BACKEND_ROOT, full).split(path.sep).join('/'),
              line: i + 1,
              projection: m[1],
            });
          }
        });
      });
    };
    SRC_DIRS.forEach((d) => walk(path.join(BACKEND_ROOT, d)));
    return out;
  }

  const SPACED = spaceBearingPaths();
  const SELECTS = stringSelects();

  test('the scan actually found space-bearing paths and projections', () => {
    // Non-vacuity. A regex matching nothing would make the real test pass free.
    expect(SPACED.size).toBeGreaterThan(0);
    expect(SELECTS.length).toBeGreaterThan(5);
  });

  test('no string projection mentions a path that contains a space', () => {
    // The leading token of 'Option A' is 'Option'. A string projection that
    // contains that bare word is trying to select a path it cannot express.
    const leadingTokens = new Set([...SPACED].map((p) => p.split(/\s+/)[0]));
    const offenders = SELECTS.filter((s) =>
      s.projection.split(/\s+/).some((tok) => leadingTokens.has(tok))
    ).map((s) => `${s.file}:${s.line} -> .select('${s.projection}')`);

    expect(offenders).toEqual([]);
  });

  test('the array form is what actually reaches Mongo', () => {
    // Proves the distinction rather than asserting it: same intent, two forms.
    const schema = new mongoose.Schema({
      Question: String,
      'Option A': mongoose.Schema.Types.Mixed,
      'Option B': mongoose.Schema.Types.Mixed,
      difficulty: String,
    });
    const M = mongoose.models.__ProjectionProbe
      || mongoose.model('__ProjectionProbe', schema);

    const broken = M.find().select('Question Option A Option B difficulty').projection();
    expect(broken).not.toHaveProperty('Option A');
    expect(broken).toHaveProperty('Option');   // a path that does not exist

    const correct = M.find().select(['Question', 'Option A', 'Option B', 'difficulty']).projection();
    expect(correct).toHaveProperty('Option A');
    expect(correct).toHaveProperty('Option B');
    expect(correct).not.toHaveProperty('Option');
  });
});
