'use strict';
/**
 * Abort a run that is being destroyed by rate limiting, instead of letting it
 * finish and write a result file full of zeros.
 *
 * WHY THIS EXISTS. The first full run of this harness completed all five
 * experiments and produced result files in which every schema-validity figure
 * was 0 %. The cause was not the pipeline: the provider's free tier had been
 * exhausted, so essentially every request came back 429 or 413 and the trial
 * never happened. A rate-limit outcome is not a measurement, but the aggregator
 * counted it as a failed trial, and the result was a plausible-looking file
 * that meant nothing. Two and a half hours of wall-clock time produced no data.
 *
 * The guard makes that failure loud and early: after a warm-up window, if the
 * share of trials that never reached the model exceeds a threshold, the
 * experiment stops, writes no result file, and prints what to do about it.
 */

class RateLimitGuard {
  /**
   * @param {string} experiment  name, used in the message
   * @param {{warmup?:number, threshold?:number}} opts
   *   warmup    - trials to observe before the guard can fire (default 12)
   *   threshold - fraction of rate-limited trials that triggers abort (0.5)
   */
  constructor(experiment, opts = {}) {
    this.experiment = experiment;
    this.warmup = opts.warmup ?? 12;
    this.threshold = opts.threshold ?? 0.5;
    this.total = 0;
    this.limited = 0;
    this.ok = 0;
  }

  /** Record one trial outcome. Call for every trial. */
  record(trialRecord) {
    this.total++;
    if (trialRecord.rateLimited) this.limited++;
    if (trialRecord.ok) this.ok++;
    return this;
  }

  get limitedFraction() {
    return this.total ? this.limited / this.total : 0;
  }

  /** Throws when the run has stopped being an experiment. */
  check() {
    if (this.total < this.warmup) return;
    if (this.limitedFraction < this.threshold) return;

    const pct = (this.limitedFraction * 100).toFixed(0);
    const msg = [
      '',
      '='.repeat(70),
      `ABORTING ${this.experiment}: the provider is rate limiting this run.`,
      '='.repeat(70),
      `${this.limited} of ${this.total} trials (${pct} %) never reached the model.`,
      `Only ${this.ok} produced a usable result.`,
      '',
      'These are not measurements and no result file has been written, because a',
      'file of zeros is worse than no file - it looks like a finding.',
      '',
      'What to do:',
      '  1. Wait for the quota window to reset (Groq free tier resets daily),',
      '     or use an API key on a paid tier.',
      '  2. Re-run with a much longer gap between calls, e.g.',
      '       node experiments/run-all.js --delay 8000',
      '  3. If the errors are 413 rather than 429, the request itself is too',
      '     large for the tier: lower --limit so fewer/shorter resumes are used,',
      '     or reduce max_tokens in the configuration under test.',
      '  4. Run one experiment at a time with --only <n> so a single quota',
      '     window covers it.',
      '='.repeat(70),
      ''
    ].join('\n');
    const err = new Error(msg);
    err.isRateLimitAbort = true;
    throw err;
  }

  /** Summary block to embed in a result file that DID complete. */
  summary() {
    return {
      trialsObserved: this.total,
      rateLimitedTrials: this.limited,
      rateLimitedFraction: this.total ? Number((this.limited / this.total).toFixed(4)) : 0,
      note: this.limited
        ? 'Some trials were rate limited and retried with backoff; see the trial log.'
        : 'No trial was rate limited.'
    };
  }
}

/** Wrap an experiment main() so a guard abort exits cleanly with the message. */
function runGuarded(fn) {
  fn().catch((err) => {
    if (err && err.isRateLimitAbort) {
      console.error(err.message);
      process.exit(2);
    }
    console.error(err);
    process.exit(1);
  });
}

module.exports = { RateLimitGuard, runGuarded };
