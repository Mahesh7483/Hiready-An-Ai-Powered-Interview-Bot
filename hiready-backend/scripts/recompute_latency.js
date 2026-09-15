'use strict';
/**
 * Latency Recomputation & Summary Aggregator for HIREady Experiment 4.
 * 
 * Recomputes all summary statistics and percentiles directly from the 180 raw
 * measurement rows in exp4_latency_e2e.trials.csv.
 * 
 * Quartiles and percentiles are calculated strictly using zero-based index (n - 1)p
 * linear interpolation (p = 0.25, 0.50, 0.75, 0.95), matching Section IV-D of the paper.
 * Sample standard deviations use Bessel's correction (n - 1).
 */

const fs = require('fs');
const path = require('path');

const trialsCsvPath = path.resolve(__dirname, '..', '..', '..', 'final-paper-verification-pack', 'data', 'exp4_latency_e2e.trials.csv');
const rawCsv = fs.readFileSync(trialsCsvPath, 'utf8');
const lines = rawCsv.trim().split('\n').map(l => l.trim()).filter(Boolean);

const trialsByEndpoint = {};

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  const parts = line.split(',').map(p => p.replace(/^"|"$/g, ''));
  const [ep, layer, rep, status, lat, ok, err] = parts;
  if (!trialsByEndpoint[ep]) trialsByEndpoint[ep] = [];
  trialsByEndpoint[ep].push({
    endpoint: ep,
    layer,
    rep: parseInt(rep, 10),
    status: status ? parseInt(status, 10) : null,
    latencyMs: parseFloat(lat),
    ok: ok === 'true',
    error: err || ''
  });
}

function quantileLinear(sorted, p) {
  if (!sorted || sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const i = Math.floor(idx);
  const f = idx - i;
  if (i + 1 < sorted.length) {
    return sorted[i] + f * (sorted[i + 1] - sorted[i]);
  }
  return sorted[i];
}

function round(val, dec = 2) {
  if (val === null || val === undefined || isNaN(val)) return null;
  const factor = Math.pow(10, dec);
  return Math.round(val * factor) / factor;
}

const summaryResults = {};
const summaryCsvRows = [];
const summaryCsvHeader = 'endpoint,layer,totalRequests,successCount,successRatePct,p50_median_ms,q1_ms,q3_ms,iqr_ms,p95_ms,min_ms,max_ms,mean_ms,sd_sample_ms,sd_pop_ms,status_counts\n';

for (const ep of Object.keys(trialsByEndpoint)) {
  const allTrials = trialsByEndpoint[ep];
  const goodTrials = allTrials.filter(t => t.ok);
  const goodLats = goodTrials.map(t => t.latencyMs).sort((a, b) => a - b);
  const n = goodLats.length;

  const p50 = quantileLinear(goodLats, 0.50);
  const q1 = quantileLinear(goodLats, 0.25);
  const q3 = quantileLinear(goodLats, 0.75);
  const p95 = quantileLinear(goodLats, 0.95);
  const iqr = (q1 !== null && q3 !== null) ? round(q3 - q1, 2) : null;
  const minVal = goodLats.length ? goodLats[0] : null;
  const maxVal = goodLats.length ? goodLats[goodLats.length - 1] : null;

  const mean = n > 0 ? goodLats.reduce((a, b) => a + b, 0) / n : 0;
  const varianceSample = n > 1 ? goodLats.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1) : 0;
  const variancePop = n > 0 ? goodLats.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n : 0;
  const sdSample = Math.sqrt(varianceSample);
  const sdPop = Math.sqrt(variancePop);

  const statusCounts = allTrials.reduce((acc, t) => {
    const k = String(t.status || 'unknown');
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const ratePct = round((goodTrials.length / (allTrials.length || 1)) * 100, 1);
  const layer = allTrials[0].layer;

  summaryResults[ep] = {
    layer,
    totalRequests: allTrials.length,
    successCount: goodTrials.length,
    successRatePct: ratePct,
    latencyMs: {
      n,
      mean: round(mean, 2),
      sdSample: round(sdSample, 2),
      sdPop: round(sdPop, 2),
      p50: round(p50, 2),
      q1: round(q1, 2),
      q3: round(q3, 2),
      iqrMs: iqr,
      p95: round(p95, 2),
      min: round(minVal, 2),
      max: round(maxVal, 2)
    },
    statusCounts
  };

  const statusStr = JSON.stringify(statusCounts).replace(/"/g, '""');
  summaryCsvRows.push(
    `"${ep}","${layer}",${allTrials.length},${goodTrials.length},${ratePct},${round(p50, 2)},${round(q1, 2)},${round(q3, 2)},${iqr},${round(p95, 2)},${round(minVal, 2)},${round(maxVal, 2)},${round(mean, 2)},${round(sdSample, 2)},${round(sdPop, 2)},"${statusStr}"`
  );
}

const correctedJson = {
  experiment: 'exp4_latency_e2e',
  provenance: {
    description: 'Empirical latency distributions recomputed directly from 180 raw trials in exp4_latency_e2e.trials.csv',
    recomputedAtUtc: new Date().toISOString(),
    quartileMethod: 'zero-based (n - 1)p linear interpolation',
    stdDevMethod: 'Sample standard deviation with Bessel correction (n - 1)'
  },
  byEndpoint: summaryResults
};

// Export to output locations
const outDir = path.resolve(__dirname, '..', '..', '..', 'verification-update', 'analysis');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'corrected-latency.json'), JSON.stringify(correctedJson, null, 2));
fs.writeFileSync(path.join(outDir, 'corrected-latency-summary.csv'), summaryCsvHeader + summaryCsvRows.join('\n') + '\n');

console.log('Successfully recomputed latency stats directly from raw CSV rows:');
for (const [ep, data] of Object.entries(summaryResults)) {
  console.log(`  ${ep.padEnd(26)} | p50: ${String(data.latencyMs.p50).padStart(8)} ms | mean: ${String(data.latencyMs.mean).padStart(8)} ms | sd: ${String(data.latencyMs.sdSample).padStart(7)} ms | status: ${JSON.stringify(data.statusCounts)}`);
}
