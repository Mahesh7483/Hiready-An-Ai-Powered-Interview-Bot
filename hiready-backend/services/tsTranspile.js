/*
 * Compile step for TypeScript submissions: main.ts -> main.js.
 *
 * Transpile only, no type check. A full `tsc` against @types/node took 52s on
 * Render's free 0.1-CPU instance (measured), longer than any candidate should
 * wait; transpileModule does one file with no lib loading. Syntax errors
 * still fail the compile. Type errors do not, which matches how a coding
 * round is judged — on output, not on the type checker.
 *
 * Runs as the submission's own uid inside the sandbox, like any compiler.
 */
const fs = require('fs');
const ts = require('typescript');

const [src = 'main.ts', out = 'main.js'] = process.argv.slice(2);
const result = ts.transpileModule(fs.readFileSync(src, 'utf8'), {
  fileName: src,
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
});

const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
if (errors.length) {
  for (const d of errors) {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : null;
    process.stderr.write(`${src}${pos ? `(${pos.line + 1},${pos.character + 1})` : ''}: error TS${d.code}: ${msg}\n`);
  }
  process.exit(1);
}
fs.writeFileSync(out, result.outputText);
