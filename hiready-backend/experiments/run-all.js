'use strict';
/**
 * One command to produce every automated result the paper needs.
 *
 *   cd hiready-backend
 *   node experiments/run-all.js                  # free tier (~340 calls, default)
 *   node experiments/run-all.js --estimate       # print the call budget, run nothing
 *   node experiments/run-all.js --profile full   # paid tier (~1170 calls)
 *   node experiments/run-all.js --only 1,3       # just those experiments
 *
 * Each experiment runs to completion before the next starts, writes its own
 * result file, and is logged to experiments/out/run-all.log. If one fails the
 * others still run, and the summary at the end says which succeeded - a failed
 * provider call in experiment 2 should not cost you experiment 3.
 *
 * Safe to re-run: an experiment that already has a result file is skipped
 * unless you pass --force, so an interrupted session resumes where it stopped.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const args = require('./lib/args')(process.argv, { profile: 'free', delay: 0, only: '', force: false, estimate: false });
const power = require('./lib/power');
const { verdict } = power;

const OUT = path.join(__dirname, 'out');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'run-all.log');

// Delay between provider calls. Raise it if you see http_429 in the results.
// The free tier will not sustain 1.2 s between calls across ~1100 requests -
// the first full run exhausted its quota partway through experiment 1. Default
// to a gap that a free tier survives; lower it only on a paid tier.
const DELAY = args.delay || ({ power: 3000, full: 6000, free: 8000 }[args.profile] ?? 8000);

/**
 * PROFILES are sized by provider quota, not by ambition.
 *
 * 'free' is the DEFAULT because the first full run exhausted a Groq free-tier
 * quota partway through experiment 1 and produced nothing. It trades interval
 * width for a run that finishes: every proportion still gets a Wilson interval,
 * just a wider one, and the paper reports n so a reader can judge it. A result
 * with honest wide intervals beats no result.
 *
 * 'full' is for a paid tier. Do not select it on a free key.
 */
const PROFILES = {
  free: {
    // exp1 pins a model that supports reasoning_effort and json_schema; the
    // compound systems support neither, so it is not run on the deployed
    // generator. See lib/models.js.
    1: ['--reps', '2', '--limit', '10', '--model', 'openai/gpt-oss-120b', '--delay', DELAY],
    2: ['--reps', '6', '--limit', '8', '--models', 'groq/compound,groq/compound-mini', '--delay', DELAY],
    3: ['--reps', '1', '--bases', '1', '--baseline-reps', '8', '--delay', DELAY],
    4: ['--reps', '10', '--resume', 'R02'],
    5: ['--reps', '20']                                              //  no API
  },
  full: {
    1: ['--reps', '3', '--limit', '20', '--model', 'openai/gpt-oss-120b', '--delay', DELAY],
    2: ['--reps', '10', '--limit', '20',
        '--models', 'groq/compound,groq/compound-mini,openai/gpt-oss-120b', '--delay', DELAY],
    3: ['--reps', '1', '--bases', '2', '--baseline-reps', '10', '--delay', DELAY],
    4: ['--reps', '30'],
    5: ['--reps', '20']
  },

  /**
   * 'power' - sized for the interval width, not for what fits in a coffee break.
   *
   * Every proportion in the paper carries a Wilson 95 % interval, so the sizes
   * below were read off lib/power.js rather than picked: at p = 0.5 you need
   * n = 93 for +/-10 points and n = 381 for +/-5. `--estimate` prints that
   * table next to the n each experiment will actually reach.
   *
   *   exp1  20 resumes x 5 reps  = 100 trials per configuration (+/-9.6 pts)
   *   exp2  20 resumes x 20 reps = 400 trials per model
   *   exp3  48 payloads x 2 bases x 3 arms x 3 reps = 288 per arm (+/-5.8 pts),
   *         baselines at 20 clean runs so the score goal finally has the
   *         distribution its criterion was written against
   *
   * TWO THINGS TO KNOW BEFORE STARTING IT.
   *
   * 1. The compound systems are free on the developer plan, which is not the
   *    same as unlimited: per-minute request and token ceilings still apply, so
   *    the run paces itself and backs off on 429. What "free" buys is the
   *    absence of a spend cap, not the absence of a rate limit.
   * 2. exp1 does NOT run on compound - it varies reasoning_effort, which
   *    compound has no control for. It stays on gpt-oss-120b, so exp1 is the
   *    part of this profile that consumes metered quota. Run `--only 2,3` if
   *    that is the constraint.
   *
   * Expect several hours. `--only` and the skip-if-present rule make it
   * resumable: finished experiments are not repeated.
   */
  power: {
    // exp1 is skipped: it varies reasoning_effort, which compound has no control for.
    1: [],
    2: ['--reps', '20', '--limit', '20',
        '--models', 'groq/compound,groq/compound-mini', '--delay', DELAY],
    3: ['--reps', '3', '--bases', '2', '--baseline-reps', '20', '--delay', DELAY],
    4: ['--reps', '50'],
    5: ['--reps', '40']
  }
};

/**
 * Rough provider-call count per profile, for --estimate.
 *
 * exp3 now has three arms rather than two. The guard arm costs one classifier
 * call per document chunk instead of an analysis call, and a flagged document
 * costs nothing further, so its true cost is lower per trial than the other
 * arms - these figures are the pessimistic case where nothing is flagged.
 */
const CALL_ESTIMATE = {
  free:  { 1: 120, 2: 96,   3: 170, 4: 60,  5: 0 },
  full:  { 1: 360, 2: 600,  3: 350, 4: 180, 5: 0 },
  power: { 1: 0, 2: 1200, 3: 950, 4: 300, 5: 0 }
};

/** Trials each experiment reaches per reported cell, for the power readout. */
const CELL_N = {
  free:  { 1: 20,  2: 48,  3: 48  },
  full:  { 1: 60,  2: 200, 3: 96  },
  power: { 2: 400, 3: 288 }
};
const CELL_LABEL = {
  1: 'per configuration (validity rate)',
  2: 'per model (score repetitions)',
  3: 'per arm (injection success rate)'
};

const EXPERIMENTS = [
  { n: 1, script: 'exp1_structured_output.js', result: 'exp1_structured_output', needs: 'GROQ_API_KEY' },
  { n: 2, script: 'exp2_score_stability.js',   result: 'exp2_score_stability',   needs: 'GROQ_API_KEY' },
  { n: 3, script: 'exp3_injection.js',         result: 'exp3_injection',         needs: 'GROQ_API_KEY' },
  { n: 4, script: 'exp4_latency_e2e.js',       result: 'exp4_latency_e2e',       needs: 'backend running on :5000 and a user in MongoDB' },
  { n: 5, script: 'exp5_sandbox.js',           result: 'exp5_sandbox',           needs: 'nothing' }
];

// A misspelled profile used to fall through to `full`, so `--profile power` on
// a copy of the harness that predates that profile ran a different experiment
// design than the operator asked for and said nothing. Sizes are the whole
// point of a profile: getting a different one silently is worse than stopping.
if (!PROFILES[args.profile]) {
  console.error(`\nUnknown profile "${args.profile}".`);
  console.error(`Available: ${Object.keys(PROFILES).join(', ')}`);
  console.error('If you expected a profile that is not listed, this copy of the');
  console.error('harness is older than the one that defines it - re-copy experiments/.\n');
  process.exit(2);
}
const profile = PROFILES[args.profile];
const only = String(args.only).split(',').map((s) => s.trim()).filter(Boolean).map(Number);

function log(line) {
  process.stdout.write(line + '\n');
  fs.appendFileSync(LOG, `${new Date().toISOString()}  ${line}\n`);
}

function run(script, argv) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, script), ...argv.map(String)], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (d) => process.stdout.write(d));
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('close', (code) => resolve(code));
  });
}

/**
 * One cheap call before committing hours to the suite. The first full run of
 * this harness spent 2.5 hours producing result files of zeros because the
 * provider quota was already exhausted; this catches that in three seconds.
 */
async function preflight() {
  if (!process.env.GROQ_API_KEY) return { ok: true, skipped: 'no GROQ_API_KEY - LLM experiments will self-report' };
  const { callModel } = require('./lib/pipeline');
  const r = await callModel('Reply with the single word: ok', {
    maxTokens: 16, temperature: 0, reasoningEffort: 'low', maxRateLimitRetries: 0, timeoutMs: 30000
  });
  if (r.error && (r.rateLimited || /http_(429|413)/.test(r.error))) {
    return { ok: false, why: r.error };
  }
  return { ok: true, latencyMs: r.latencyMs };
}

(async () => {
  const started = Date.now();

  if (args.estimate) {
    const est = CALL_ESTIMATE[args.profile] || CALL_ESTIMATE.free;
    const sel = only.length ? only : [1, 2, 3, 4, 5];
    const calls = sel.reduce((a, n) => a + (est[n] || 0), 0);
    const mins = Math.round((calls * (DELAY / 1000) + calls * 6) / 60);
    console.log(`profile "${args.profile}", experiments ${sel.join(',')}`);
    for (const n of sel) console.log(`  experiment ${n}: ~${est[n] || 0} provider calls`);
    console.log(`  TOTAL: ~${calls} calls, roughly ${mins} min at ${DELAY} ms spacing`);

    // What the run can actually establish. A call count says what it costs; the
    // interval width says whether the result is worth printing.
    const cells = CELL_N[args.profile] || CELL_N.free;
    console.log('\nStatistical power of this profile:');
    for (const n of sel) {
      if (!cells[n]) continue;
      console.log(`  experiment ${n}: n = ${String(cells[n]).padStart(4)} ${CELL_LABEL[n].padEnd(34)} ${verdict(cells[n])}`);
    }
    power.table();
    console.log('\nNothing was run (--estimate).');
    process.exit(0);
  }

  log(`=== run-all starting, profile "${args.profile}", delay ${DELAY}ms ===`);

  const pf = await preflight();
  if (!pf.ok) {
    log('');
    log('='.repeat(70));
    log(`PREFLIGHT FAILED: the provider is already rate limiting (${pf.why}).`);
    log('='.repeat(70));
    log('Nothing has been run. A suite started in this state produces result');
    log('files full of zeros, which look like findings and are not.');
    log('');
    log('Wait for the quota window to reset, or use a paid-tier key, then:');
    log('  node experiments/run-all.js --delay 8000');
    log('='.repeat(70));
    process.exit(2);
  }
  log(pf.skipped ? `preflight: ${pf.skipped}` : `preflight: provider reachable (${pf.latencyMs} ms)`);

  const results = [];
  for (const exp of EXPERIMENTS) {
    if (only.length && !only.includes(exp.n)) continue;

    const resultFile = path.join(OUT, `${exp.result}.json`);
    if (fs.existsSync(resultFile) && !args.force) {
      // A result produced on a different machine is worse than no result: the
      // paper's latency figures would silently mix hosts. Redo those.
      let staleHost = null;
      try {
        const prov = JSON.parse(fs.readFileSync(resultFile, 'utf8')).provenance || {};
        const here = `${os.platform()} ${os.release()} ${os.arch()}`;
        if (prov.platform && prov.platform !== here) staleHost = prov.platform;
      } catch { /* unreadable result file - just redo it */ }

      if (staleHost) {
        log(`--- experiment ${exp.n}: existing result came from a different machine`);
        log(`      (${staleHost}) - discarding it and re-running here`);
        fs.renameSync(resultFile, resultFile + '.other-host.bak');
      } else {
        log(`--- experiment ${exp.n}: already has a result file, skipping (use --force to redo)`);
        results.push({ n: exp.n, status: 'skipped (already done)' });
        continue;
      }
    }

    // An empty arg list means the profile deliberately skips this experiment.
    if (Array.isArray(profile[exp.n]) && profile[exp.n].length === 0) {
      log(`\n--- experiment ${exp.n}: SKIPPED by profile (no args configured)`);
      results.push({ n: exp.n, status: 'skipped (no args)' });
      continue;
    }

    log(`\n--- experiment ${exp.n}: ${exp.script}  (needs: ${exp.needs})`);
    const t0 = Date.now();
    const code = await run(exp.script, profile[exp.n] || []);
    const mins = ((Date.now() - t0) / 60000).toFixed(1);

    if (code === 2) {
      log(`--- experiment ${exp.n}: ABORTED - rate limited. No result file written.`);
      log('    Stopping the suite: later experiments would abort the same way.');
      results.push({ n: exp.n, status: 'ABORTED (rate limited)' });
      break;
    }
    if (code === 0 && fs.existsSync(resultFile)) {
      log(`--- experiment ${exp.n}: done in ${mins} min`);
      results.push({ n: exp.n, status: `ok (${mins} min)` });
    } else {
      log(`--- experiment ${exp.n}: FAILED (exit ${code}) after ${mins} min - continuing with the rest`);
      results.push({ n: exp.n, status: `FAILED (exit ${code})` });
    }
  }

  const totalMins = ((Date.now() - started) / 60000).toFixed(1);
  log(`\n=== finished in ${totalMins} min ===`);
  for (const r of results) log(`  experiment ${r.n}: ${r.status}`);

  const failed = results.filter((r) => r.status.startsWith('FAILED'));
  log('\nNext: copy experiments/out/*.json back into the paper package and run');
  log('  python make_results.py');
  if (failed.length) {
    log(`\n${failed.length} experiment(s) failed. Check experiments/out/run-all.log,`);
    log('fix the cause, then re-run just those:  node experiments/run-all.js --only <n>');
  }
  process.exit(failed.length ? 1 : 0);
})();
