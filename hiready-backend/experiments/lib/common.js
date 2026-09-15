'use strict';
/**
 * Shared helpers for the HiReady evaluation harness.
 *
 * Design goals:
 *  - No new runtime dependencies beyond what hiready-backend already installs
 *    (groq-sdk, dotenv, jsonwebtoken, mongoose).
 *  - Every experiment writes BOTH a raw per-trial JSONL log (auditable) and an
 *    aggregated JSON summary (consumed by make_results.py).
 *  - Every run records a provenance block so results are reproducible and the
 *    paper can state exactly what produced each number.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const OUT_DIR = path.join(__dirname, '..', 'out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------- statistics

function mean(xs) {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Linear-interpolation percentile (type 7, matches numpy default). */
function percentile(xs, p) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

const median = (xs) => percentile(xs, 0.5);

function describe(xs) {
  const clean = xs.filter((x) => Number.isFinite(x));
  return {
    n: clean.length,
    mean: round(mean(clean), 3),
    sd: round(sd(clean), 3),
    min: clean.length ? round(Math.min(...clean), 3) : null,
    p50: round(median(clean), 3),
    p95: round(percentile(clean, 0.95), 3),
    max: clean.length ? round(Math.max(...clean), 3) : null
  };
}

function round(x, d = 3) {
  if (!Number.isFinite(x)) return null;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

/** Wilson score interval for a binomial proportion (better than normal approx at small n). */
function wilson(successes, n, z = 1.96) {
  if (n === 0) return { p: null, lo: null, hi: null };
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { p: round(p, 4), lo: round((c - s) / d, 4), hi: round((c + s) / d, 4) };
}

/** Paired bootstrap test for a difference in means. Returns two-sided p-value. */
function bootstrapDiff(a, b, iters = 10000) {
  if (!a.length || !b.length) return null;
  const obs = mean(a) - mean(b);
  const pooled = [...a, ...b];
  let extreme = 0;
  for (let i = 0; i < iters; i++) {
    const ra = [];
    const rb = [];
    for (let j = 0; j < a.length; j++) ra.push(pooled[(Math.random() * pooled.length) | 0]);
    for (let j = 0; j < b.length; j++) rb.push(pooled[(Math.random() * pooled.length) | 0]);
    if (Math.abs(mean(ra) - mean(rb)) >= Math.abs(obs)) extreme++;
  }
  return round((extreme + 1) / (iters + 1), 4);
}

// ---------------------------------------------------------------- provenance

function gitRevision() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..', '..'), stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function provenance(extra = {}) {
  return {
    timestampUtc: new Date().toISOString(),
    gitRevision: gitRevision(),
    node: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpuModel: (os.cpus()[0] || {}).model || 'unknown',
    cpuCount: os.cpus().length,
    totalMemGb: round(os.totalmem() / 1024 ** 3, 1),
    groqModel: (process.env.GROQ_MODEL || '').trim() || 'openai/gpt-oss-120b',
    ...extra
  };
}

// ---------------------------------------------------------------- output i/o

function writeResult(name, summary, trials) {
  const summaryPath = path.join(OUT_DIR, `${name}.json`);
  const trialPath = path.join(OUT_DIR, `${name}.trials.jsonl`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  if (trials) {
    fs.writeFileSync(trialPath, trials.map((t) => JSON.stringify(t)).join('\n') + '\n');
  }
  console.log(`\n[saved] ${summaryPath}`);
  if (trials) console.log(`[saved] ${trialPath}  (${trials.length} trials)`);
  return summaryPath;
}

function loadCorpus(file) {
  const p = path.join(__dirname, '..', 'corpus', file);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Stable short hash, used to label trials without storing full prompts. */
function hash(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);
}

function progress(label, i, total) {
  process.stdout.write(`\r  ${label}: ${i}/${total}   `);
  if (i === total) process.stdout.write('\n');
}

module.exports = {
  mean, sd, median, percentile, describe, round, wilson, bootstrapDiff,
  provenance, writeResult, loadCorpus, sleep, hash, progress, OUT_DIR
};
