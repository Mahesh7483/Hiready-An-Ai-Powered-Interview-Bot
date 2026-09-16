'use strict';
/**
 * Guard against a stored RESULT going stale while the harness stays in sync.
 *
 * check-pipeline-sync.js answers "does lib/pipeline.js still match
 * routes/aiRoutes.js?". That is necessary and it is not enough, because it
 * says nothing about WHEN the numbers in experiments/out were produced. Both
 * can be true at once:
 *
 *     the harness matches the deployed code            (sync passes)
 *     the committed results were produced months ago   (nobody notices)
 *
 * That is the state this repository was in. exp3_injection.json records
 * gitRevision 4f44276, and routes/aiRoutes.js has changed by ~190 lines
 * since — including the commit that added constrained JSON decoding and the
 * one that tripled the completion-token budget, both of which change the
 * generation path exp3 exercises. The paper would have reported measurements
 * of a pipeline that is no longer deployed, with every automated check green.
 *
 *   node experiments/check-results-freshness.js
 *
 * Exits non-zero if any result is older than the code it measures. Run it
 * before submission, next to check-pipeline-sync.js.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, 'out');
const REPO = path.resolve(__dirname, '..', '..');

/**
 * What each experiment's numbers actually depend on.
 *
 * Paths are repo-relative. Keep this list honest: an experiment whose
 * dependencies are understated will be reported fresh when it is not.
 */
const DEPENDENCIES = {
  exp1_structured_output: ['hiready-backend/routes/aiRoutes.js', 'hiready-backend/experiments/lib/pipeline.js'],
  exp2_score_stability: ['hiready-backend/routes/aiRoutes.js', 'hiready-backend/experiments/lib/pipeline.js'],
  exp3_injection: ['hiready-backend/routes/aiRoutes.js', 'hiready-backend/experiments/lib/pipeline.js'],
  exp4_latency_e2e: ['hiready-backend/routes/aiRoutes.js', 'hiready-backend/server.js'],
  exp5_sandbox: ['hiready-backend/services/sandbox.js', 'hiready-backend/routes/coding/execution.js'],
};

const git = (args) =>
  execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();

function revisionExists(rev) {
  try {
    git(['cat-file', '-e', `${rev}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

let stale = 0;
let missing = 0;
let fresh = 0;
const lines = [];

for (const [name, deps] of Object.entries(DEPENDENCIES)) {
  const file = path.join(OUT, `${name}.json`);

  if (!fs.existsSync(file)) {
    missing += 1;
    lines.push(`  MISSING   ${name}  — no result file; the paper cannot cite this experiment`);
    continue;
  }

  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rev = result.provenance && result.provenance.gitRevision;

  if (!rev) {
    // Older result files predate the provenance block. We cannot prove they
    // are current, and saying nothing would be the same mistake again.
    stale += 1;
    const when = result.provenance?.timestampUtc || result.timestamp || 'unknown date';
    lines.push(`  UNKNOWN   ${name}  — no gitRevision recorded (${when}); re-run to make it traceable`);
    continue;
  }

  if (!revisionExists(rev)) {
    stale += 1;
    lines.push(`  UNKNOWN   ${name}  — recorded revision ${rev} is not in this repository`);
    continue;
  }

  const changed = git(['log', '--oneline', `${rev}..HEAD`, '--', ...deps])
    .split('\n')
    .filter(Boolean);

  if (changed.length === 0) {
    fresh += 1;
    lines.push(`  fresh     ${name}  (${rev})`);
  } else {
    stale += 1;
    lines.push(`  STALE     ${name}  (${rev}) — ${changed.length} commit(s) to its dependencies since:`);
    changed.slice(0, 5).forEach((c) => lines.push(`                ${c}`));
    if (changed.length > 5) lines.push(`                … and ${changed.length - 5} more`);
  }
}

console.log('\nResult freshness (experiments/out vs the code each one measures)\n');
console.log(lines.join('\n'));
console.log(`\n  ${fresh} fresh · ${stale} stale · ${missing} missing\n`);

if (stale || missing) {
  console.error('Some results do not describe the current pipeline. Re-run them before');
  console.error('citing their numbers:  node experiments/run-all.js --only <n> --force\n');
  process.exit(1);
}

console.log('Every committed result was produced against the current code.\n');
