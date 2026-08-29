/**
 * Sandbox verification script
 * Usage: node scripts/test-sandbox.js
 * Tests: basic execution (JS + Python), stdin passing, stdin EOF, timeout kill.
 */
const { executeCode } = require('../services/sandbox');

const tests = [
  {
    name: 'JavaScript basic',
    opts: { language: 'javascript', code: 'console.log("hello from node");' },
    check: (r) => r.success && r.stdout.includes('hello from node'),
  },
  {
    name: 'Python basic',
    opts: { language: 'python', code: 'print("hello from python")' },
    check: (r) => r.success && r.stdout.includes('hello from python'),
  },
  {
    name: 'stdin passed to program',
    opts: { language: 'python', code: 'name = input()\nprint("hi", name)', input: 'Mahi\n' },
    check: (r) => r.success && r.stdout.includes('hi Mahi'),
  },
  {
    name: 'stdin EOF (no input, program reads stdin)',
    opts: { language: 'python', code: 'try:\n    input()\nexcept EOFError:\n    print("got EOF")' },
    check: (r) => r.success && r.stdout.includes('got EOF'),
  },
  {
    name: 'timeout kill (infinite loop)',
    opts: { language: 'javascript', code: 'while(true){}', timeLimit: 2000 },
    check: (r) => r.timedOut === true,
  },
  {
    name: 'runtime error surfaces stderr',
    opts: { language: 'javascript', code: 'throw new Error("boom");' },
    check: (r) => !r.success && r.stderr.includes('boom'),
  },
];

(async () => {
  let pass = 0, fail = 0;
  for (const t of tests) {
    const start = Date.now();
    const r = await executeCode(t.opts);
    const ms = Date.now() - start;
    const ok = t.check(r);
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${t.name} | ${ms}ms | exit=${r.exitCode} timedOut=${r.timedOut} sandbox=${r.sandbox} | stdout=${JSON.stringify((r.stdout || '').slice(0, 80))}${r.stderr ? ' | stderr=' + JSON.stringify(r.stderr.slice(0, 100)) : ''}`);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();