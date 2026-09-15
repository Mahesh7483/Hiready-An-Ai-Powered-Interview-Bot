'use strict';
/** Minimal --flag value parser with typed defaults. */
module.exports = function parseArgs(argv, defaults) {
  const out = { ...defaults };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key.startsWith('no-')) {
      out[key.slice(3)] = false;
      out[key] = true;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    if (next === 'true') { out[key] = true; i++; continue; }
    if (next === 'false') { out[key] = false; i++; continue; }
    const asNum = Number(next);
    out[key] = Number.isFinite(asNum) && next.trim() !== '' ? asNum : next;
    i++;
  }
  return out;
};
