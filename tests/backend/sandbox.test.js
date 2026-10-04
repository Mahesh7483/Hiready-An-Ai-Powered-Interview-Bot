const { backend } = require('./support/paths');
const fs = require('fs');
const path = require('path');
const {
  LANGUAGE_CONFIGS,
  buildRunCommand,
  createTempDir,
  cleanupTempDir,
  restrictedLimitArgs,
} = require(backend('services/sandbox'));

describe('Sandbox service unit tests', () => {
  test('Supported languages have valid configuration properties', () => {
    const requiredLanguages = ['python', 'javascript', 'typescript', 'java', 'go', 'cpp', 'rust'];
    for (const lang of requiredLanguages) {
      expect(LANGUAGE_CONFIGS).toHaveProperty(lang);
      const conf = LANGUAGE_CONFIGS[lang];
      expect(conf).toHaveProperty('extension');
      expect(conf).toHaveProperty('command');
      expect(conf).toHaveProperty('timeout');
      expect(typeof conf.timeout).toBe('number');
    }
  });

  test('buildRunCommand generates valid command templates without syntax errors', () => {
    const pyCmd = buildRunCommand(LANGUAGE_CONFIGS.python);
    expect(pyCmd.full).toMatch(/python/i);
    expect(pyCmd.full).toContain('main.py');

    const jsCmd = buildRunCommand(LANGUAGE_CONFIGS.javascript);
    expect(jsCmd.full).toContain('node');
    expect(jsCmd.full).toContain('main.js');

    const javaCmd = buildRunCommand(LANGUAGE_CONFIGS.java);
    expect(javaCmd.full).toContain('javac');
    expect(javaCmd.full).toContain('Main.java');
  });

  test('restricted runner passes the command as arguments, never as shell text', () => {
    // Everything after the script is "$@" to bash. If a template or filename
    // were ever spliced into the -c script, a name like "x; curl evil" would
    // run; as an argument it is only ever a filename.
    const args = restrictedLimitArgs({ cpuSeconds: 2, memoryMb: 256 });
    expect(args[0]).toBe('-c');
    expect(args[1]).toMatch(/exec "\$@"$/);
    expect(args[1]).toContain('ulimit -t 2');
    expect(args[1]).toContain('ulimit -d 262144');
    expect(args[1]).toContain('ulimit -u 128');
    expect(args[1]).toContain('ulimit -f 65536');
    expect(args[1]).not.toMatch(/main\.|python|node/);
  });

  test('restricted runner limits coerce to integers, so a limit cannot carry shell text', () => {
    const args = restrictedLimitArgs({ cpuSeconds: '1; rm -rf /', memoryMb: '64$(id)' });
    expect(args[1]).not.toMatch(/rm|\$\(|;\s*rm/);
    expect(args[1]).toMatch(/ulimit -t \d+ /);
  });

  test('restricted runner omits the data limit when none is given (the JVM case)', () => {
    expect(restrictedLimitArgs({ cpuSeconds: 2, memoryMb: null })[1]).not.toContain('ulimit -d');
  });

  test('TypeScript compiles with the bundled transpiler, not a per-run npx download', () => {
    const ts = LANGUAGE_CONFIGS.typescript;
    expect(ts.compileArgs.join(' ')).toMatch(/tsTranspile\.js/);
    expect([ts.command, ...(ts.args || []), ts.compileCommand].join(' ')).not.toMatch(/npx|ts-node/);
  });

  test('createTempDir and cleanupTempDir cycle cleans up files reliably', () => {
    const dir = createTempDir('unit_test_' + Date.now());
    expect(fs.existsSync(dir)).toBe(true);

    const testFile = path.join(dir, 'test.txt');
    fs.writeFileSync(testFile, 'hello sandbox');
    expect(fs.existsSync(testFile)).toBe(true);

    cleanupTempDir(dir);
    expect(fs.existsSync(dir)).toBe(false);
  });
});
