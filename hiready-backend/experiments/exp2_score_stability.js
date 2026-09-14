'use strict';
/**
 * EXPERIMENT 2 - Stability of LLM-produced résumé scores under repetition.
 *
 * Research question
 *   HiReady shows the candidate a numeric ATS score. If the same résumé,
 *   analysed with an identical prompt and configuration, yields a materially
 *   different number on each run, then the number is not a measurement and
 *   must not be presented as one. How large is the run-to-run spread, and does
 *   lowering temperature remove it?
 *
 * Design
 *   M models x N résumés x R repetitions at the deployed configuration.
 *
 *   MODEL IS THE OUTER FACTOR, DELIBERATELY. A spread measured on one hosted
 *   model is an observation about that product at that moment and expires when
 *   the vendor ships a new one. The same spread reproduced across independent
 *   models supports a transferable claim - that scores produced this way are
 *   unstable at the granularity interfaces display them - which is the claim
 *   the paper actually wants to make.
 *
 *   Temperature is held at the deployed 0.3. Temperature 0 was dropped as a
 *   factor: it does not give determinism on a hosted mixture-of-experts served
 *   under dynamic batching, so it was buying a column that could not mean what
 *   a reader would assume it meant.
 *
 * Usage
 *   node experiments/exp2_score_stability.js [--reps 10] [--limit 20] [--delay 1200]
 */

require('dotenv').config();
const {
  describe, mean, sd, round, writeResult, loadCorpus, provenance, sleep, progress
} = require('./lib/common');
const { analyseOnce } = require('./lib/pipeline');
const { RateLimitGuard } = require('./lib/guard');
const { assertSupports } = require('./lib/models');
// Score stability needs models that GENERATE a resume analysis. The guard
// model (meta-llama/llama-prompt-guard-2-86m) is a 512-token injection
// classifier and cannot produce one, so it is not a member of this sweep - it
// appears in experiment 3 as a defense arm instead.
const args = require('./lib/args')(process.argv, {
  reps: 10, limit: 20, delay: 1200, temperature: 0.3,
  models: 'groq/compound,groq/compound-mini,openai/gpt-oss-120b'
});

const FIELDS = ['atsScore', 'keywordMatch', 'formatScore', 'overallScore'];
// --models "a,b" narrows the sweep; a single model still produces a valid but
// vendor-specific result, and the paper must say so if run that way.
const MODELS = String(args.models).split(',').map((m) => m.trim()).filter(Boolean);

/** Kendall's tau-b between two rankings given as arrays of values. */
function kendallTau(a, b) {
  let concordant = 0, discordant = 0, tiesA = 0, tiesB = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      const da = a[i] - a[j];
      const db = b[i] - b[j];
      if (da === 0 && db === 0) { tiesA++; tiesB++; continue; }
      if (da === 0) { tiesA++; continue; }
      if (db === 0) { tiesB++; continue; }
      if (da * db > 0) concordant++; else discordant++;
    }
  }
  const n0 = concordant + discordant + tiesA + tiesB;
  const denom = Math.sqrt((n0 - tiesA) * (n0 - tiesB));
  return denom === 0 ? null : round((concordant - discordant) / denom, 4);
}

(async () => {
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not set.');
    process.exit(1);
  }

  for (const m of MODELS) assertSupports(m, ['generates'], 'Experiment 2 (score stability)');

  const guard = new RateLimitGuard('exp2_score_stability');

  const corpus = loadCorpus('resumes.json').resumes.slice(0, args.limit);
  const trials = [];
  const perModel = {};

  console.log(`Experiment 2: ${MODELS.length} models x ${corpus.length} résumés x ${args.reps} reps`);
  console.log(`Models: ${MODELS.join(', ')}\n`);

  for (const model of MODELS) {
    console.log(`model ${model}`);
    let done = 0;
    const totalHere = corpus.length * args.reps;
    for (const resume of corpus) {
      for (let rep = 0; rep < args.reps; rep++) {
        // reasoningEffort is deliberately NOT sent here: the sweep spans
        // models with and without that control, and sending it to one that
        // lacks it would make the arms incomparable.
        const r = await analyseOnce(resume, {
          maxTokens: 4000, repair: true, maxAttempts: 2, hardened: true,
          temperature: args.temperature, model
        });
        guard.record(r).check();
        const row = {
          model, resumeId: resume.id, profile: resume.profile,
          family: resume.family, rep, ok: r.ok, latencyMs: r.totalLatencyMs
        };
        for (const f of FIELDS) row[f] = r.value ? r.value[f] : null;
        trials.push(row);
        progress(`  ${model}`, ++done, totalHere);
        if (args.delay) await sleep(args.delay);
      }
    }

    // ---- per-résumé spread
    const perResume = corpus.map((resume) => {
      const t = trials.filter((x) => x.model === model && x.resumeId === resume.id && x.ok);
      const entry = { resumeId: resume.id, profile: resume.profile, successfulRuns: t.length };
      for (const f of FIELDS) {
        const vals = t.map((x) => x[f]).filter((v) => Number.isFinite(v));
        entry[f] = {
          mean: round(mean(vals), 2),
          sd: round(sd(vals), 2),
          range: vals.length ? round(Math.max(...vals) - Math.min(...vals), 2) : null
        };
      }
      return entry;
    });

    // ---- rank stability across repetitions
    const meanOverall = perResume.map((p) => p.overallScore.mean);
    const taus = [];
    for (let rep = 0; rep < args.reps; rep++) {
      const runVals = corpus.map((resume) => {
        const row = trials.find((x) => x.model === model && x.resumeId === resume.id && x.rep === rep && x.ok);
        return row ? row.overallScore : null;
      });
      if (runVals.every((v) => Number.isFinite(v))) {
        taus.push(kendallTau(runVals, meanOverall));
      }
    }

    perModel[model] = {
      model,
      perResume,
      spreadAcrossResumes: Object.fromEntries(
        FIELDS.map((f) => [f, {
          sd: describe(perResume.map((p) => p[f].sd)),
          range: describe(perResume.map((p) => p[f].range))
        }])
      ),
      // How often does a repeated analysis move the displayed score by >= 5 points?
      pointSwingLargerThan5: round(
        perResume.filter((p) => (p.overallScore.range ?? 0) >= 5).length / perResume.length, 4
      ),
      pointSwingLargerThan10: round(
        perResume.filter((p) => (p.overallScore.range ?? 0) >= 10).length / perResume.length, 4
      ),
      kendallTauToMeanRanking: describe(taus),
      latencySeconds: describe(trials.filter((x) => x.model === model).map((x) => x.latencyMs / 1000))
    };
  }

  const summary = {
    experiment: 'exp2_score_stability',
    question: 'How reproducible is a displayed résumé score across identical repeated analyses?',
    rateLimiting: guard.summary(),
    provenance: provenance({ reps: args.reps, resumes: corpus.length, models: MODELS, temperature: args.temperature }),
    generalization: MODELS.length > 1
      ? 'Spread measured on ' + MODELS.length + ' independent models; a pattern common to all of them is not a property of one vendor snapshot.'
      : 'SINGLE MODEL ONLY - this result is vendor-specific and the paper must not generalize from it.',
    byModel: perModel
  };

  writeResult('exp2_score_stability', summary, trials);

  console.log('\nmodel                      | mean SD | mean range | >=5pt | tau');
  for (const [m, v] of Object.entries(perModel)) {
    console.log(
      `  ${m.padEnd(24)} | ${String(v.spreadAcrossResumes.overallScore.sd.mean).padStart(7)} | ` +
      `${String(v.spreadAcrossResumes.overallScore.range.mean).padStart(10)} | ` +
      `${String((v.pointSwingLargerThan5 * 100).toFixed(0) + '%').padStart(5)} | ${v.kendallTauToMeanRanking.mean}`
    );
  }
})();
