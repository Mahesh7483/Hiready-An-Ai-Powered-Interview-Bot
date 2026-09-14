'use strict';
/**
 * MODEL CAPABILITY REGISTRY
 *
 * Why this file exists. Three of the experiments vary provider parameters that
 * only some models accept, and a model that ignores a parameter does not say
 * so - it returns a perfectly normal-looking completion. If experiment 1 sends
 * `reasoning_effort` to a model that has no such control, configurations A and
 * C become the same configuration and the ablation silently measures nothing
 * while still printing a difference. That failure is invisible in the result
 * file, which is the worst kind.
 *
 * So each model declares what it supports, every experiment declares what it
 * needs, and a mismatch is an error before any provider call is made.
 *
 * Sources: GroqCloud model list, the structured-outputs page and the compound
 * page, read 2026-09-08. Three distinct things get confused with each other:
 *
 *   json_schema, strict  - constrained decoding. Documented for the gpt-oss and
 *                          qwen3.8 models only.
 *   json_schema, best-effort - schema passed, adherence not guaranteed. Same
 *                          short model list.
 *   json_object          - "JSON mode": syntactically valid JSON, no schema.
 *                          The structured-outputs page states this works with
 *                          ALL models.
 *
 * For the compound systems the docs are SILENT on response_format rather than
 * negative, and silence is not a capability claim in either direction. So the
 * registry marks the strict path `null` (= unknown, must be probed) instead of
 * guessing, and `probe-capabilities.js` settles it against the live API. What
 * the probe writes wins over what is written here, because the provider is the
 * authority and this file is only a prior.
 */

const MODELS = {
  // --- agentic systems -----------------------------------------------------
  'groq/compound': {
    kind: 'agentic',
    generates: true,
    reasoningEffort: false,      // no documented reasoning_effort control
    // Probed 2026-09-08 against the live API: compound returns HTTP 400 for
    // every response_format variant and for reasoning_effort. The docs are
    // silent; the provider is not. Prompt-level JSON is the only contract
    // available on this model.
    structuredStrict: false,
    structuredBestEffort: false,
    structuredJsonObject: false,
    maxCompletionTokens: 8192,
    contextTokens: 131072,
    note: 'Agentic system with built-in web search and code execution. Tool use '
        + 'means a resume can reach an external search: state that in the paper '
        + 'before deploying it on candidate documents.'
  },
  'groq/compound-mini': {
    kind: 'agentic',
    generates: true,
    reasoningEffort: false,
    structuredStrict: false,     // probed 2026-09-08: HTTP 400, as compound
    structuredBestEffort: false,
    structuredJsonObject: false,
    maxCompletionTokens: 8192,
    contextTokens: 131072,
    note: 'Lighter variant of groq/compound; same tool-use caveat.'
  },

  // --- reasoning-tuned chat models -----------------------------------------
  'openai/gpt-oss-120b': {
    kind: 'chat',
    generates: true,
    reasoningEffort: true,
    structuredStrict: true,
    structuredBestEffort: true,
    structuredJsonObject: true,
    maxCompletionTokens: 65536,
    contextTokens: 131072
  },
  'openai/gpt-oss-20b': {
    kind: 'chat',
    generates: true,
    reasoningEffort: true,
    structuredStrict: true,
    structuredBestEffort: true,
    structuredJsonObject: true,
    maxCompletionTokens: 65536,
    contextTokens: 131072
  },
  'qwen/qwen3.8-27b': {
    kind: 'chat',
    generates: true,
    reasoningEffort: true,
    structuredStrict: true,
    structuredBestEffort: true,
    structuredJsonObject: true,
    maxCompletionTokens: 32768,
    contextTokens: 131072
  },

  // --- classifiers ---------------------------------------------------------
  'meta-llama/llama-prompt-guard-2-86m': {
    kind: 'classifier',
    generates: false,         // returns a label, not a resume analysis
    reasoningEffort: false,
    structuredStrict: false,
    structuredBestEffort: false,
    structuredJsonObject: false,
    maxCompletionTokens: 512,
    contextTokens: 512,
    note: 'Jailbreak / prompt-injection detector. 512-token window, so long '
        + 'documents must be chunked and scanned segment by segment. Use it as '
        + 'a defense arm in experiment 3, never as a generation model.'
  }
};

// A probe result, when one exists, overrides the table above. It is written by
// probe-capabilities.js from real API responses, so a doc change or an
// undocumented capability cannot leave the harness working from a stale prior.
const PROBE_PATH = require('path').join(__dirname, '..', 'out', 'model-capabilities.json');
let PROBED = {};
try {
  PROBED = JSON.parse(require('fs').readFileSync(PROBE_PATH, 'utf8')).models || {};
} catch (_) { /* no probe yet: fall back to the documented prior */ }

/**
 * Capabilities for a model id; unknown ids get a conservative default.
 * `null` in any structured field means "not established" - callers must treat
 * it as unavailable until the probe says otherwise, and say so in the log.
 */
function capabilities(model) {
  const base = MODELS[model] || {
    kind: 'unknown',
    generates: true,
    reasoningEffort: false,
    structuredStrict: false,
    structuredBestEffort: false,
    maxCompletionTokens: 4096,
    contextTokens: 8192,
    note: 'Model not in the registry: capabilities assumed minimal. Add it to '
        + 'lib/models.js before reporting results from it.'
  };
  const probed = PROBED[model];
  return probed ? { ...base, ...probed.capabilities, probedAt: probed.probedAt } : base;
}

/** True only when a capability is established, never when it is unknown. */
function supports(model, feature) {
  return capabilities(model)[feature] === true;
}

/**
 * Fail loudly, before spending quota, when a model cannot support what an
 * experiment varies.
 * @param {string} model
 * @param {string[]} needs  any of: 'generates', 'reasoningEffort',
 *                          'structuredStrict', 'classifier'
 * @param {string} who      experiment name, for the message
 */
function assertSupports(model, needs, who) {
  const cap = capabilities(model);
  const missing = needs.filter((n) => (n === 'classifier' ? cap.kind !== 'classifier' : cap[n] !== true));
  if (!missing.length) return cap;
  console.error(
    `\n${who} cannot run on ${model}.\n` +
    `  missing: ${missing.join(', ')}\n` +
    (missing.some((n) => cap[n] === null)
      ? '  (marked unknown in the registry: run `node experiments/probe-capabilities.js` to settle it)\n' : '') +
    (cap.note ? `  note: ${cap.note}\n` : '') +
    '  Pass --model with a model that supports it, or run a different experiment.\n'
  );
  process.exit(3);
}

module.exports = { MODELS, capabilities, supports, assertSupports, PROBE_PATH };
