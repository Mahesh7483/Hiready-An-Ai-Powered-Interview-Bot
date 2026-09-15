'use strict';
/**
 * CAPABILITY PROBE - ask the provider instead of trusting the documentation.
 *
 * Groq's structured-outputs page lists strict `json_schema` support for the
 * gpt-oss and qwen3.8 models. For groq/compound and groq/compound-mini it says
 * nothing at all, which is not the same as saying no. Rather than encode a
 * guess in lib/models.js and publish results that depend on it, this script
 * makes one small real call per (model, feature) pair and records what actually
 * came back.
 *
 * Each probe has three possible outcomes and they are NOT collapsed:
 *   supported     - the call succeeded and, where applicable, the output
 *                   satisfied the schema
 *   rejected      - the provider refused the parameter (4xx naming it)
 *   accepted_but_unenforced - the call succeeded but the output violates the
 *                   schema, i.e. the parameter was taken and ignored. This is
 *                   the dangerous case: it looks like support and is not, and
 *                   an experiment that trusts it reports a constrained-decoding
 *                   number produced by an unconstrained model.
 *
 * Output: experiments/out/model-capabilities.json, which lib/models.js reads in
 * preference to its own table. Re-run it whenever the provider changes.
 *
 * Usage:
 *   node experiments/probe-capabilities.js
 *   node experiments/probe-capabilities.js --models groq/compound,groq/compound-mini
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { callModel } = require('./lib/pipeline');
const { MODELS, PROBE_PATH } = require('./lib/models');
const { sleep } = require('./lib/common');
const args = require('./lib/args')(process.argv, { models: '', delay: 1500 });

// A schema small enough to cost nothing and strict enough that an unconstrained
// model will usually violate it: exactly two keys, one of them an enum.
const PROBE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'probe',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['yes', 'no'] },
        score: { type: 'integer' }
      },
      required: ['verdict', 'score'],
      additionalProperties: false
    }
  }
};

// The literal word "JSON" must appear in the prompt. OpenAI-compatible
// json_object mode returns HTTP 400 when it does not, and the first version of
// this probe omitted it - which made gpt-oss-120b look as though it rejected
// json_object mode when it was the probe that was malformed. A capability
// prober that reports its own bugs as provider limitations is worse than no
// prober, so the word is here and the 400 body is inspected below.
const PROMPT =
  'Is the sky blue on a clear day? Reply with JSON: an object having exactly '
  + 'the keys "verdict" (either "yes" or "no") and "score" (an integer 0-100).';

function schemaSatisfied(text) {
  let v;
  try { v = JSON.parse(text); } catch (_) { return false; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v).sort();
  return keys.length === 2 && keys[0] === 'score' && keys[1] === 'verdict'
    && ['yes', 'no'].includes(v.verdict) && Number.isInteger(v.score);
}

/** One probe. Returns 'supported' | 'rejected' | 'accepted_but_unenforced' | 'error'. */
async function probe(model, feature) {
  const cfg = { model, maxTokens: 256, temperature: 0, probeRaw: true };
  if (feature === 'reasoningEffort') cfg.reasoningEffortRaw = 'low';
  if (feature === 'structuredStrict') cfg.responseFormatRaw = PROBE_SCHEMA;
  if (feature === 'structuredBestEffort') {
    cfg.responseFormatRaw = JSON.parse(JSON.stringify(PROBE_SCHEMA));
    cfg.responseFormatRaw.json_schema.strict = false;
  }
  if (feature === 'structuredJsonObject') cfg.responseFormatRaw = { type: 'json_object' };

  const r = await callModel(PROMPT, cfg);
  if (r.error) {
    const status = String(r.error);
    if (/http_4\d\d/.test(status)) {
      // Distinguish "the model does not support this" from "the request was
      // malformed". Only the first is a capability finding.
      const body = String(r.errorBody || '').toLowerCase();
      if (body.includes("'json'") || body.includes('word json') || body.includes('must contain')) {
        return { result: 'error', detail: `${status} - request rejected for prompt content, not capability: ${body.slice(0, 160)}` };
      }
      return { result: 'rejected', detail: status + (body ? ` - ${body.slice(0, 160)}` : '') };
    }
    return { result: 'error', detail: status };
  }
  if (feature === 'reasoningEffort') {
    // Acceptance is all the API tells us here; whether the knob changed the
    // computation is a separate question the ablation itself answers.
    return { result: 'supported', detail: 'parameter accepted' };
  }
  if (feature === 'structuredJsonObject') {
    let ok = true;
    try { JSON.parse(r.content); } catch (_) { ok = false; }
    return ok
      ? { result: 'supported', detail: 'returned parseable JSON' }
      : { result: 'accepted_but_unenforced', detail: 'output was not JSON' };
  }
  return schemaSatisfied(r.content)
    ? { result: 'supported', detail: 'output satisfied the schema' }
    : { result: 'accepted_but_unenforced', detail: `output violated the schema: ${r.content.slice(0, 120)}` };
}

(async () => {
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not set.');
    process.exit(1);
  }
  const models = args.models
    ? String(args.models).split(',').map((m) => m.trim()).filter(Boolean)
    : Object.keys(MODELS).filter((m) => MODELS[m].generates);

  const FEATURES = ['reasoningEffort', 'structuredJsonObject', 'structuredBestEffort', 'structuredStrict'];
  const out = { probedAtUtc: new Date().toISOString(), models: {} };

  for (const model of models) {
    console.log(`\n${model}`);
    const capabilities = {};
    const evidence = {};
    for (const feature of FEATURES) {
      const { result, detail } = await probe(model, feature);
      // Only a clean success counts as support. "Accepted but unenforced" is
      // recorded as false: a parameter the provider swallows without honouring
      // is worse than one it refuses, because nothing in the result file
      // reveals it.
      // 'error' means the probe itself failed (network, or a malformed request
      // like json_object without the word "json"). Writing false for that would
      // freeze the probe's own bug into the registry as a provider limitation,
      // so the key is left unset and the documented prior stands.
      if (result !== 'error') capabilities[feature] = result === 'supported';
      evidence[feature] = { result, detail };
      const mark = result === 'supported' ? 'yes' : (result === 'rejected' ? 'no ' : '!! ');
      console.log(`  ${mark} ${feature.padEnd(22)} ${result}${detail ? ' - ' + detail : ''}`);
      if (args.delay) await sleep(args.delay);
    }
    out.models[model] = { probedAt: out.probedAtUtc, capabilities, evidence };
  }

  fs.mkdirSync(path.dirname(PROBE_PATH), { recursive: true });
  fs.writeFileSync(PROBE_PATH, JSON.stringify(out, null, 2));
  console.log(`\n[written] ${PROBE_PATH}`);
  console.log('lib/models.js now reads these results in preference to its own table.');
  console.log('Re-run experiment 1 afterwards if the structured-output columns changed.');
})();
