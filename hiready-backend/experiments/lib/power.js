'use strict';
/**
 * HOW BIG DOES A RUN HAVE TO BE?
 *
 * "Run more trials" is not a plan. Every proportion in the paper is reported
 * with a Wilson 95 % interval, so the honest way to size a run is to decide how
 * wide an interval is still worth printing, then read off the n that gets you
 * there. This module does that arithmetic so the profiles in run-all.js are
 * chosen rather than guessed, and so a reader can check the choice.
 *
 * The width depends on the proportion itself: p near 0 or 1 needs far fewer
 * trials than p near 0.5. The functions below therefore take the p you expect,
 * and the profiles use the worst case (p = 0.5) where the outcome is unknown.
 */

const Z = 1.96;

/** Half-width of the Wilson 95 % interval for k/n successes. */
function wilsonHalfWidth(p, n, z = Z) {
  if (!n) return null;
  const den = 1 + (z * z) / n;
  return (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
}

/** Smallest n whose Wilson half-width is at or below `target` (in points). */
function nForHalfWidth(target, p = 0.5, cap = 100000) {
  for (let n = 1; n <= cap; n++) {
    if (wilsonHalfWidth(p, n) <= target) return n;
  }
  return null;
}

/**
 * What a run of size n can and cannot establish, in words rather than jargon.
 * Used by --estimate so the operator sees the consequence before spending two
 * hours of quota.
 */
function verdict(n, p = 0.5) {
  const hw = wilsonHalfWidth(p, n);
  if (hw === null) return 'no trials';
  const pts = (hw * 100).toFixed(1);
  if (hw <= 0.05) return `+/-${pts} pts: tight enough to compare arms`;
  if (hw <= 0.10) return `+/-${pts} pts: differences above ~20 pts are visible`;
  if (hw <= 0.20) return `+/-${pts} pts: directional only`;
  return `+/-${pts} pts: too wide to support any comparison`;
}

/** Print the sizing table the profiles were chosen from. */
function table(sizes = [3, 10, 20, 30, 60, 100, 200, 400]) {
  console.log('\n  n     half-width at p=0.5   what it supports');
  for (const n of sizes) {
    console.log(`  ${String(n).padStart(4)}   ${(wilsonHalfWidth(0.5, n) * 100).toFixed(1).padStart(5)} pts           ${verdict(n)}`);
  }
  console.log(`\n  For a +/-5 pt interval at p=0.5 you need n = ${nForHalfWidth(0.05)}.`);
  console.log(`  For +/-10 pts, n = ${nForHalfWidth(0.10)}.\n`);
}

module.exports = { wilsonHalfWidth, nForHalfWidth, verdict, table };
