'use strict';
/**
 * EXPERIMENT 4 - End-to-end responsiveness of each interactive module.
 *
 * Research question
 *   Interview practice is interactive: a candidate waits in front of the
 *   screen. Where does the wall-clock time go, and which modules meet an
 *   interactive budget? We separate browser-local work, backend work, and
 *   external-provider work, because only the first two are under the system's
 *   control.
 *
 * Design
 *   Requests go through the real HTTP surface with a real signed JWT, so the
 *   numbers include auth, validation, provider call and serialisation - what a
 *   user actually waits for. R repetitions per endpoint, reported as median,
 *   p95 and IQR rather than a mean, because provider latency is heavy-tailed.
 *
 * Prerequisites
 *   - backend running (node server.js) and reachable at --base
 *   - at least one user document in MongoDB (the JWT is signed for it)
 *
 * Usage
 *   node experiments/exp4_latency_e2e.js [--reps 30] [--base http://localhost:5000] [--delay 800]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { describe, round, writeResult, loadCorpus, provenance, sleep, progress, wilson } = require('./lib/common');
// --resume selects which corpus document drives the analyse endpoint. A long
// document can exceed a free tier's per-request token limit, which the provider
// returns as HTTP 413 - that is a request-SIZE refusal, not a rate limit, and
// no amount of waiting fixes it. R02 is a compact resume for that reason.
const args = require('./lib/args')(process.argv, {
  reps: 30, base: 'http://localhost:5000', delay: 800, resume: 'R02'
});

const CODE_SAMPLES = {
  javascript: 'const a=[5,3,8,1];a.sort((x,y)=>x-y);console.log(a.join(","));',
  python: 'a=[5,3,8,1]\na.sort()\nprint(",".join(map(str,a)))'
};

async function timed(fn) {
  const t0 = process.hrtime.bigint();
  let ok = false, status = null, err = null;
  try {
    const r = await fn();
    ok = r.ok;
    status = r.status;
  } catch (e) {
    err = e.message;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ms, ok, status, err };
}

(async () => {
  const User = require(path.join(process.cwd(), 'models', 'User'));
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hireadyDB');
  const user = await User.findOne({}).select('_id').lean();
  if (!user) {
    console.error('No user in the database. Register one through the app first.');
    process.exit(1);
  }
  const token = jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '2h' });
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const all = loadCorpus('resumes.json').resumes;
  const resume = all.find((r) => r.id === args.resume) || all[0];
  console.log(`Resume driving the analyse endpoint: ${resume.id} (${resume.text.length} chars)`);

  const endpoints = [
    {
      name: 'resume-analyze',
      layer: 'backend + external LLM',
      call: () => fetch(`${args.base}/api/ai/resume-analyze`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ resumeText: resume.text, targetRole: resume.targetRole, experienceLevel: resume.experienceLevel })
      })
    },
    {
      name: 'interview-turn (chat)',
      layer: 'backend + external LLM',
      call: () => fetch(`${args.base}/api/ai/chat`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a technical interviewer. Ask one concise follow-up question.' },
            { role: 'user', content: 'I built an event-driven reconciliation pipeline with Kafka handling 2.4M transactions per day.' }
          ]
        })
      })
    },
    {
      name: 'star-coach',
      layer: 'backend + external LLM',
      call: () => fetch(`${args.base}/api/ai/star-coach`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          question: 'Tell me about a time you handled a production incident.',
          answer: 'Our payment service started failing. I checked the logs, found a bad deploy, rolled it back and we recovered in about 20 minutes.'
        })
      })
    },
    {
      name: 'code-execute (javascript)',
      layer: 'backend sandbox only',
      call: () => fetch(`${args.base}/api/code/execute`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ language: 'javascript', code: CODE_SAMPLES.javascript })
      })
    },
    {
      name: 'code-execute (python)',
      layer: 'backend sandbox only',
      call: () => fetch(`${args.base}/api/code/execute`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ language: 'python', code: CODE_SAMPLES.python })
      })
    },
    {
      name: 'stt-token mint',
      layer: 'backend + external ASR auth',
      call: () => fetch(`${args.base}/api/ai/stt-token`, { headers: H })
    }
  ];

  const trials = [];
  console.log(`Experiment 4: ${endpoints.length} endpoints x ${args.reps} reps against ${args.base}\n`);

  for (const ep of endpoints) {
    // one warm-up call, excluded from the reported distribution
    await timed(ep.call);
    for (let rep = 0; rep < args.reps; rep++) {
      const r = await timed(ep.call);
      trials.push({ endpoint: ep.name, layer: ep.layer, rep, ...r });
      progress(`  ${ep.name}`, rep + 1, args.reps);
      if (args.delay) await sleep(args.delay);
    }
  }

  // Zero-based index (n - 1)p linear interpolation for quartiles and quantiles
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

  const byEndpoint = {};
  for (const ep of endpoints) {
    const t = trials.filter((x) => x.endpoint === ep.name);
    const good = t.filter((x) => x.ok);
    const ms = good.map((x) => x.ms);
    const sorted = [...ms].sort((a, b) => a - b);
    const p50 = quantileLinear(sorted, 0.50);
    const q1 = quantileLinear(sorted, 0.25);
    const q3 = quantileLinear(sorted, 0.75);
    const p95 = quantileLinear(sorted, 0.95);
    const iqr = (q1 !== null && q3 !== null) ? round(q3 - q1, 2) : null;
    const minVal = sorted.length ? sorted[0] : null;
    const maxVal = sorted.length ? sorted[sorted.length - 1] : null;

    byEndpoint[ep.name] = {
      layer: ep.layer,
      successRate: wilson(good.length, t.length),
      latencyMs: {
        ...describe(ms),
        p50: p50 !== null ? round(p50, 2) : null,
        p95: p95 !== null ? round(p95, 2) : null,
        q1: q1 !== null ? round(q1, 2) : null,
        q3: q3 !== null ? round(q3, 2) : null
      },
      q1Ms: q1 !== null ? round(q1, 2) : null,
      q3Ms: q3 !== null ? round(q3, 2) : null,
      iqrMs: iqr,
      minMs: minVal !== null ? round(minVal, 2) : null,
      maxMs: maxVal !== null ? round(maxVal, 2) : null,
      statusCounts: t.reduce((a, x) => { const k = x.err ? `err:${x.err}` : String(x.status); a[k] = (a[k] || 0) + 1; return a; }, {})
    };
  }

  const sizeRefusals = trials.filter((t) => t.status === 413).length;
  const rateLimited = trials.filter((t) => t.status === 429).length;
  if (sizeRefusals || rateLimited) {
    console.log(`\n  NOTE: ${sizeRefusals} request(s) refused for size (413), ` +
                `${rateLimited} rate limited (429).`);
    if (sizeRefusals) {
      console.log('  413 is a per-request token ceiling, not a quota: pick a shorter');
      console.log('  document with --resume, or lower the route\'s max_tokens.');
    }
  }

  const summary = {
    experiment: 'exp4_latency_e2e',
    providerRefusals: { sizeRefusals413: sizeRefusals, rateLimited429: rateLimited },
    resumeUsed: { id: resume.id, chars: resume.text.length },
    question: 'What does a candidate actually wait for in each interactive module, and which modules are provider-bound?',
    provenance: provenance({ reps: args.reps, base: args.base }),
    note: 'Warm-up call per endpoint excluded. Latency includes authentication, validation, provider round-trip and serialisation. Quartiles computed via zero-based index (n - 1)p with linear interpolation.',
    byEndpoint
  };

  writeResult('exp4_latency_e2e', summary, trials);

  // Write CSV outputs as required by research paper methodology:
  const outDir = path.join(__dirname, '..', 'out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const trialsCsvPath = path.join(outDir, 'exp4_latency_e2e.trials.csv');
  const trialsCsvHeader = 'endpoint,layer,rep,status,latencyMs,ok,error\n';
  const trialsCsvRows = trials.map((t) =>
    `"${t.endpoint}","${t.layer}",${t.rep},${t.status ?? ''},${round(t.ms, 2)},${t.ok},"${(t.err || '').replace(/"/g, '""')}"`
  ).join('\n');
  fs.writeFileSync(trialsCsvPath, trialsCsvHeader + trialsCsvRows + '\n');
  console.log(`[saved] ${trialsCsvPath} (${trials.length} rows)`);

  const summaryCsvPath = path.join(outDir, 'exp4_latency_e2e.summary.csv');
  const summaryCsvHeader = 'endpoint,layer,totalRequests,successCount,successRatePct,p50_median_ms,q1_ms,q3_ms,iqr_ms,p95_ms,min_ms,max_ms\n';
  const summaryCsvRows = Object.entries(byEndpoint).map(([name, v]) => {
    const t = trials.filter((x) => x.endpoint === name);
    const good = t.filter((x) => x.ok);
    const ratePct = round((good.length / (t.length || 1)) * 100, 1);
    return `"${name}","${v.layer}",${t.length},${good.length},${ratePct},${v.latencyMs.p50 ?? ''},${v.q1Ms ?? ''},${v.q3Ms ?? ''},${v.iqrMs ?? ''},${v.latencyMs.p95 ?? ''},${v.minMs ?? ''},${v.maxMs ?? ''}`;
  }).join('\n');
  fs.writeFileSync(summaryCsvPath, summaryCsvHeader + summaryCsvRows + '\n');
  console.log(`[saved] ${summaryCsvPath}`);

  console.log('\nendpoint                     | median ms | p95 ms | IQR ms | success');
  for (const [name, v] of Object.entries(byEndpoint)) {
    console.log(
      `  ${name.padEnd(26)} | ${String(v.latencyMs.p50).padStart(9)} | ${String(v.latencyMs.p95).padStart(6)} | ` +
      `${String(v.iqrMs).padStart(6)} | ${(v.successRate.p * 100).toFixed(0)}%`
    );
  }

  await mongoose.disconnect();
})();
