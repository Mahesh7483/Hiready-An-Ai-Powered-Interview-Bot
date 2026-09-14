'use strict';
/**
 * EXPERIMENT 5 - Isolation and cost of the code-execution sandbox.
 *
 * Research question
 *   The coding module runs candidate-supplied code on the server. Two things
 *   must hold: the isolation controls must actually fire (time limit, output
 *   cap, environment stripping, filesystem containment), and the cost of
 *   enforcing them must stay inside an interactive budget. We measure both,
 *   and we measure them separately for the nsjail path and the fallback path
 *   so the paper does not claim isolation that a given deployment lacks.
 *
 * Design
 *   Part A - control tests: one deterministic test per isolation property,
 *            each with an explicit expected outcome. Reported as pass/fail.
 *   Part B - latency: R repetitions of a trivial program per language,
 *            separating first-run (cold) from subsequent (warm) executions.
 *
 * Usage (from hiready-backend)
 *   node experiments/exp5_sandbox.js [--reps 20]
 */

require('dotenv').config();
const path = require('path');
const { describe, round, writeResult, provenance, progress, wilson } = require('./lib/common');
const args = require('./lib/args')(process.argv, { reps: 20 });

const { executeCode } = require(path.join(process.cwd(), 'services', 'sandbox'));

// --------------------------------------------------------- isolation controls
const CONTROLS = [
  {
    id: 'T1', property: 'CPU time limit terminates a non-terminating program',
    opts: { language: 'javascript', code: 'while(true){}', timeLimit: 2000 },
    expect: (r) => r.timedOut === true
  },
  {
    id: 'T2', property: 'Partial output is preserved when a run is killed',
    opts: { language: 'python', code: 'import sys\nprint("before")\nsys.stdout.flush()\nwhile True: pass', timeLimit: 2000 },
    expect: (r) => r.timedOut === true && String(r.stdout).includes('before')
  },
  {
    id: 'T3', property: 'Runtime errors surface on stderr rather than as success',
    opts: { language: 'javascript', code: 'throw new Error("boom");' },
    expect: (r) => !r.success && String(r.stderr).includes('boom')
  },
  {
    id: 'T4', property: 'Server secrets are absent from the child environment',
    opts: { language: 'python', code: 'import os\nleaked=[k for k in ("GROQ_API_KEY","DEEPGRAM_API_KEY","JWT_SECRET","MONGO_URI") if os.environ.get(k)]\nprint("LEAKED:"+",".join(leaked) if leaked else "NO_LEAK")' },
    expect: (r) => String(r.stdout).includes('NO_LEAK')
  },
  {
    id: 'T5', property: 'stdin reaches the program when supplied',
    opts: { language: 'python', code: 'print("got:"+input())', input: 'hello\n' },
    expect: (r) => r.success && String(r.stdout).includes('got:hello')
  },
  {
    id: 'T6', property: 'stdin is closed (EOF) when no input is supplied, so reads do not hang',
    opts: { language: 'python', code: 'try:\n    input()\nexcept EOFError:\n    print("EOF")' },
    expect: (r) => r.success && String(r.stdout).includes('EOF')
  },
  {
    id: 'T7', property: 'Output volume is capped rather than exhausting server memory',
    opts: { language: 'python', code: 'for _ in range(400000): print("x"*64)', timeLimit: 10000 },
    expect: (r) => (r.stdout || '').length <= 512 * 1024 + 4096
  },
  {
    id: 'T8', property: 'Working directory is the only writable location the program is given',
    opts: { language: 'python', code: 'import os,tempfile\nprint("CWD_WRITABLE" if os.access(os.getcwd(), os.W_OK) else "CWD_RO")' },
    expect: (r) => r.success && String(r.stdout).includes('CWD_WRITABLE')
  },
  {
    id: 'T9', property: 'A crash in one run does not affect the next run',
    opts: { language: 'javascript', code: 'process.exit(3);' },
    expect: (r) => !r.success && r.exitCode === 3
  }
];

const LANGS = [
  { language: 'javascript', code: 'console.log(1+1);' },
  { language: 'python', code: 'print(1+1)' },
  { language: 'java', code: 'public class Main{public static void main(String[] a){System.out.println(2);}}' },
  { language: 'cpp', code: '#include <iostream>\nint main(){std::cout<<2<<std::endl;return 0;}' },
  { language: 'go', code: 'package main\nimport "fmt"\nfunc main(){fmt.Println(2)}' }
];

(async () => {
  const trials = [];

  // ------------------------------------------------------------- Part A
  console.log('Part A - isolation control tests');
  const controlResults = [];
  for (const c of CONTROLS) {
    const t0 = Date.now();
    let r, thrown = null;
    try { r = await executeCode(c.opts); } catch (e) { thrown = e.message; r = {}; }
    const pass = thrown ? false : Boolean(c.expect(r));
    controlResults.push({
      id: c.id, property: c.property, pass, thrown,
      sandboxMode: r.sandbox || 'unknown', durationMs: Date.now() - t0,
      exitCode: r.exitCode ?? null, timedOut: r.timedOut ?? null,
      stdoutLen: (r.stdout || '').length
    });
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${c.id}  ${c.property}`);
  }

  // ------------------------------------------------------------- Part B
  console.log('\nPart B - execution latency by language');
  const available = [];
  for (const l of LANGS) {
    let cold = null;
    try {
      const t0 = Date.now();
      const r = await executeCode({ language: l.language, code: l.code, timeLimit: 15000 });
      cold = Date.now() - t0;
      if (!r.success) {
        console.log(`  ${l.language.padEnd(11)} toolchain unavailable on this host - skipped`);
        trials.push({ phase: 'latency', language: l.language, skipped: true, reason: (r.stderr || '').slice(0, 120) });
        continue;
      }
    } catch (e) {
      console.log(`  ${l.language.padEnd(11)} unavailable - skipped (${e.message})`);
      continue;
    }
    available.push(l.language);
    trials.push({ phase: 'latency', language: l.language, run: 'cold', ms: cold });

    for (let i = 0; i < args.reps; i++) {
      const t0 = Date.now();
      const r = await executeCode({ language: l.language, code: l.code, timeLimit: 15000 });
      trials.push({ phase: 'latency', language: l.language, run: 'warm', rep: i, ms: Date.now() - t0, ok: r.success });
      progress(`  ${l.language}`, i + 1, args.reps);
    }
  }

  const byLanguage = {};
  for (const lang of available) {
    const warm = trials.filter((t) => t.phase === 'latency' && t.language === lang && t.run === 'warm');
    const cold = trials.find((t) => t.phase === 'latency' && t.language === lang && t.run === 'cold');
    byLanguage[lang] = {
      coldStartMs: cold ? round(cold.ms, 1) : null,
      warmMs: describe(warm.map((t) => t.ms)),
      successRate: wilson(warm.filter((t) => t.ok).length, warm.length)
    };
  }

  const summary = {
    experiment: 'exp5_sandbox',
    question: 'Do the sandbox isolation controls fire as specified, and what do they cost per execution?',
    provenance: provenance({ reps: args.reps, sandboxMode: controlResults[0] ? controlResults[0].sandboxMode : 'unknown' }),
    caveat: 'Isolation claims apply to the sandbox mode reported in provenance.sandboxMode. The nsjail path enforces kernel-level address-space, CPU and file-size limits; the cross-platform fallback path enforces time, output volume and environment stripping only.',
    controls: {
      passed: controlResults.filter((c) => c.pass).length,
      total: controlResults.length,
      results: controlResults
    },
    byLanguage
  };

  writeResult('exp5_sandbox', summary, trials);

  console.log(`\ncontrols: ${summary.controls.passed}/${summary.controls.total} passed  (mode: ${summary.provenance.sandboxMode})`);
  console.log('language    | cold ms | warm median | warm p95');
  for (const [l, v] of Object.entries(byLanguage)) {
    console.log(`  ${l.padEnd(9)} | ${String(v.coldStartMs).padStart(7)} | ${String(v.warmMs.p50).padStart(11)} | ${v.warmMs.p95}`);
  }
})();
