const fs = require('fs');
const path = require('path');
const {
  LANGUAGE_CONFIGS,
  buildRunCommand,
  createTempDir,
  cleanupTempDir,
} = require('../services/sandbox');

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
