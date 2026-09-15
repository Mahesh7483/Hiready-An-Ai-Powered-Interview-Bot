'use strict';
/**
 * EXPERIMENT 1 - Structured-output reliability under reasoning-budget ablation.
 *
 * Research question
 *   Reasoning-tuned models spend part of the completion budget on hidden
 *   reasoning tokens before emitting an answer. When the budget is small the
 *   visible content can come back EMPTY, which a naive pipeline reports as a
 *   parse failure and retries - multiplying latency without fixing anything.
 *   How much of HiReady's structured-output reliability is attributable to
 *   (a) capping reasoning effort, (b) raising max_tokens, (c) truncation repair?
 *
 * Design
 *   5 configurations x N resumes x R repetitions, fully crossed.
 *   Outcome per trial: schema-valid (yes/no), empty-content count,
 *   parse-failure count, repair invocations, provider calls used, latency.
 *
 * Usage
 *   node experiments/exp1_structured_output.js [--reps 3] [--limit 20] [--delay 1200]
 */

require('dotenv').config();
const path = require('path');
const {
  describe, wilson, writeResult, loadCorpus, provenance, sleep, progress, round
} = require('./lib/common');
const { analyseOnce } = require('./lib/pipeline');
const { RateLimitGuard } = require('./lib/guard');
const { assertSupports, capabilities } = require('./lib/models');

// This experiment VARIES reasoning_effort and, in configuration F, strict
// constrained decoding. Both are model capabilities, not prompt choices, so
// the model is pinned here rather than inherited from the deployed default:
// groq/compound has no reasoning_effort control and no documented json_schema
// support, which would make A identical to C and F impossible while the table
// still printed six distinct rows.
const args = require('./lib/args')(process.argv, {
  reps: 3, limit: 20, delay: 1200, model: 'openai/gpt-oss-120b'
});
const MODEL = String(args.model);

// reasoning_effort is set EXPLICITLY in every configuration. gpt-oss models
// accept only low|medium|high; relying on an unstated provider default would
// make the logged configuration ambiguous, so 'medium' is sent, not omitted.
//
// A-E are five cells of the 2(effort) x 2(budget) x 2(repair) design. They
// identify main effects, not the repair x effort interaction - the paper says
// so rather than claiming a full factorial.
//
// F is not part of that design: it replaces the prompt-level JSON contract with
// the provider's strict constrained decoding (response_format json_schema),
// which Groq documents as supported for the deployed model. It is the ceiling
// the prompt-level configurations are measured against.
const CONFIGS = [
  { id: 'A', label: 'medium effort, 700 tok, no repair',  reasoningEffort: 'medium', maxTokens: 700,  repair: false, maxAttempts: 2, hardened: true },
  { id: 'B', label: 'medium effort, 4000 tok, no repair', reasoningEffort: 'medium', maxTokens: 4000, repair: false, maxAttempts: 2, hardened: true },
  { id: 'C', label: 'low effort, 700 tok, no repair',     reasoningEffort: 'low',    maxTokens: 700,  repair: false, maxAttempts: 2, hardened: true },
  { id: 'D', label: 'low effort, 4000 tok, no repair',    reasoningEffort: 'low',    maxTokens: 4000, repair: false, maxAttempts: 2, hardened: true },
  { id: 'E', label: 'low effort, 4000 tok, repair (deployed)', reasoningEffort: 'low', maxTokens: 4000, repair: true, maxAttempts: 2, hardened: true },
  { id: 'F', label: 'strict json_schema constrained decoding', reasoningEffort: 'low', maxTokens: 4000, repair: true, maxAttempts: 2, hardened: true, structured: 'strict' },
  // G is the fallback ceiling for models that do not offer constrained
  // decoding: json_object mode guarantees syntactically valid JSON but not the
  // schema, so it separates "could not produce JSON" from "produced JSON of the
  // wrong shape" - two failures the prompt-level configurations conflate.
  { id: 'G', label: 'json_object mode (valid JSON, no schema)', reasoningEffort: 'low', maxTokens: 4000, repair: true, maxAttempts: 2, hardened: true, structured: 'json_object' }
];

(async () => {
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not set. Run this from hiready-backend with its .env in place.');
    process.exit(1);
  }

  // A--E need reasoning_effort. F needs strict constrained decoding and G needs
  // json_object mode; either may be absent on a given model, in which case that
  // row is recorded as unsupported rather than skipped silently or, worse,
  // reported as a 0 % validity rate.
  assertSupports(MODEL, ['generates', 'reasoningEffort'],
                 'Experiment 1 (structured-output ablation)');
  const cap = capabilities(MODEL);
  const CONFIGS_TO_RUN = CONFIGS.filter((c) => {
    if (c.structured === 'strict' && cap.structuredStrict !== true) {
      console.log(`config ${c.id} skipped: ${MODEL} does not support strict json_schema`
        + (cap.structuredStrict === null ? ' (unknown - run probe-capabilities.js)' : ''));
      return false;
    }
    if (c.structured === 'json_object' && cap.structuredJsonObject !== true) {
      console.log(`config ${c.id} skipped: ${MODEL} does not support json_object mode`);
      return false;
    }
    return true;
  });
  const skipped = CONFIGS.filter((c) => !CONFIGS_TO_RUN.includes(c))
    .map((c) => ({ id: c.id, label: c.label, reason: `unsupported on ${MODEL}` }));

  const guard = new RateLimitGuard('exp1_structured_output');

  const corpus = loadCorpus('resumes.json').resumes.slice(0, args.limit);
  const trials = [];
  const total = CONFIGS_TO_RUN.length * corpus.length * args.reps;
  let done = 0;

  console.log(`Experiment 1: ${CONFIGS_TO_RUN.length} configs x ${corpus.length} resumes x ${args.reps} reps = ${total} trials`);
  console.log(`Model: ${MODEL} (${capabilities(MODEL).kind})\n`);

  for (const cfg of CONFIGS_TO_RUN) {
    console.log(`config ${cfg.id} - ${cfg.label}`);
    for (const resume of corpus) {
      for (let rep = 0; rep < args.reps; rep++) {
        const r = await analyseOnce(resume, { ...cfg, model: MODEL, requireReasoningEffort: true });
        guard.record(r).check();
        trials.push({
          config: cfg.id, resumeId: resume.id, profile: resume.profile,
          family: resume.family, rep,
          ok: r.ok, attempts: r.attempts, emptyContent: r.emptyContent,
          parseFail: r.parseFail, repaired: r.repaired,
          latencyMs: r.totalLatencyMs, failureReason: r.failureReason,
          promptTokens: r.promptTokens, completionTokens: r.completionTokens,
          atsScore: r.value ? r.value.atsScore : null,
          overallScore: r.value ? r.value.overallScore : null
        });
        progress(`config ${cfg.id}`, ++done - (CONFIGS.indexOf(cfg) * corpus.length * args.reps), corpus.length * args.reps);
        if (args.delay) await sleep(args.delay);
      }
    }
  }

  // ------------------------------------------------------------- aggregation
  const byConfig = {};
  for (const cfg of CONFIGS_TO_RUN) {
    const t = trials.filter((x) => x.config === cfg.id);
    const n = t.length;
    const ok = t.filter((x) => x.ok).length;
    byConfig[cfg.id] = {
      label: cfg.label,
      reasoningEffort: cfg.reasoningEffort,
      maxTokens: cfg.maxTokens,
      repair: cfg.repair,
      structured: Boolean(cfg.structured),
      trials: n,
      schemaValid: ok,
      schemaValidRate: wilson(ok, n),
      emptyContentRate: wilson(t.filter((x) => x.emptyContent > 0).length, n),
      parseFailRate: wilson(t.filter((x) => x.parseFail > 0).length, n),
      repairRescueRate: wilson(t.filter((x) => x.repaired > 0 && x.ok).length, n),
      meanProviderCalls: round(t.reduce((a, b) => a + b.attempts, 0) / n, 3),
      latencySeconds: describe(t.map((x) => x.latencyMs / 1000)),
      latencySecondsSuccessOnly: describe(t.filter((x) => x.ok).map((x) => x.latencyMs / 1000)),
      completionTokens: describe(t.map((x) => x.completionTokens).filter(Boolean)),
      failureBreakdown: t.filter((x) => !x.ok).reduce((acc, x) => {
        acc[x.failureReason || 'unknown'] = (acc[x.failureReason || 'unknown'] || 0) + 1;
        return acc;
      }, {})
    };
  }

  const summary = {
    experiment: 'exp1_structured_output',
    question: 'Which mitigations account for structured-output reliability in a reasoning-tuned LLM under a fixed token budget?',
    rateLimiting: guard.summary(),
    provenance: provenance({ reps: args.reps, resumes: corpus.length, model: MODEL,
      modelKind: cap.kind, structuredStrict: cap.structuredStrict,
      structuredJsonObject: cap.structuredJsonObject,
      configs: CONFIGS_TO_RUN.map((c) => c.id) }),
    unsupportedConfigs: skipped,
    byConfig
  };

  writeResult('exp1_structured_output', summary, trials);

  console.log('\nconfig | schema-valid | empty | parse-fail | calls | median s');
  for (const [id, v] of Object.entries(byConfig)) {
    console.log(
      `  ${id}    |    ${String((v.schemaValidRate.p * 100).toFixed(1)).padStart(5)}%   | ` +
      `${String((v.emptyContentRate.p * 100).toFixed(1)).padStart(5)}% | ` +
      `${String((v.parseFailRate.p * 100).toFixed(1)).padStart(6)}%    | ` +
      `${v.meanProviderCalls.toFixed(2)} | ${v.latencySeconds.p50}`
    );
  }
})();
