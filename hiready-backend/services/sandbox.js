const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const IS_WINDOWS = process.platform === 'win32';
const MAX_OUTPUT_CHARS = 512 * 1024;
const MAX_CONCURRENT = 4;
const MAX_QUEUE = 100;

function buildSandboxEnv(tempDir) {
  const env = { PATH: process.env.PATH || process.env.Path || '' };
  if (IS_WINDOWS) {
    for (const k of ['SystemRoot', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'COMSPEC']) {
      if (process.env[k]) env[k] = process.env[k];
    }
  } else {
    env.HOME = tempDir;
    if (process.env.LANG) env.LANG = process.env.LANG;
  }
  return env;
}

let running = 0;
const waitQueue = [];
function acquireSlot() {
  if (running < MAX_CONCURRENT) {
    running++;
    return Promise.resolve();
  }
  if (waitQueue.length >= MAX_QUEUE) {
    return Promise.reject(new Error('Too many concurrent executions, please try again'));
  }
  return new Promise((resolve, reject) => {
    const entry = {
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject,
      timer: null
    };
    const timer = setTimeout(() => {
      const idx = waitQueue.indexOf(entry);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(new Error('Execution queue timeout'));
    }, 30000);
    entry.timer = timer;
    waitQueue.push(entry);
  });
}

function releaseSlot() {
  const next = waitQueue.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve();
  } else {
    running = Math.max(0, running - 1);
  }
}

const LANGUAGE_CONFIGS = {
  python: {
    extension: 'py',
    command: IS_WINDOWS ? 'python' : 'python3',
    args: ['{file}'],
    timeout: 10000
  },
  javascript: {
    extension: 'js',
    command: 'node',
    args: ['{file}'],
    timeout: 10000
  },
  typescript: {
    extension: 'ts',
    command: IS_WINDOWS ? 'npx.cmd' : 'npx',
    args: ['--yes', 'ts-node', '{file}'],
    timeout: 15000
  },
  java: {
    extension: 'java',
    mainFile: 'Main.java',
    compileCommand: 'javac',
    compileArgs: ['{file}'],
    command: 'java',
    args: ['{className}'],
    timeout: 15000
  },
  go: {
    extension: 'go',
    command: 'go',
    args: ['run', '{file}'],
    timeout: 15000
  },
  cpp: {
    extension: 'cpp',
    compileCommand: 'g++',
    compileArgs: ['-std=c++17', '-O2', '{file}', '-o', '{binary}'],
    command: '{binaryPath}',
    args: [],
    timeout: 15000
  },
  rust: {
    extension: 'rs',
    compileCommand: 'rustc',
    compileArgs: ['{file}', '-o', '{binary}'],
    command: '{binaryPath}',
    args: [],
    timeout: 20000
  },
};

function generateExecutionId() {
  return 'exec_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex');
}

function createTempDir(executionId) {
  const base = path.join(os.tmpdir(), 'hiready_exec_' + executionId + '_');
  const tempDir = fs.mkdtempSync(base);
  if (!IS_WINDOWS) {
    try { fs.chmodSync(tempDir, 0o777); } catch { /* ignore */ }
  }
  return tempDir;
}

function cleanupTempDir(tempDir) {
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('Failed to cleanup temp dir:', err.message);
  }
}

function writeCodeFiles(tempDir, files) {
  const written = [];
  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content, { mode: 0o644 });
    written.push({ filename, path: filePath });
  }
  return written;
}

function mainFileName(config) {
  return config.mainFile || ('main.' + config.extension);
}

function binaryName() {
  return IS_WINDOWS ? 'main.exe' : 'main';
}

function buildRunCommand(config) {
  const file = mainFileName(config);
  if (config.compileCommand || config.compile) {
    const binary = binaryName();
    const compileCmd = (config.compile || `${config.compileCommand} ${config.compileArgs.join(' ')}`)
      .replace('{file}', file)
      .replace('{binary}', binary);
    const runPath = (IS_WINDOWS ? '.\\' : './') + binary;
    const runCmd = (config.command + (config.args && config.args.length ? ' ' + config.args.join(' ') : ''))
      .replace('{binaryPath}', runPath)
      .replace('{binary}', runPath)
      .replace('{className}', 'Main')
      .replace('{file}', file);
    return { full: compileCmd + ' && ' + runCmd };
  }
  const cmd = (config.command + (config.args && config.args.length ? ' ' + config.args.join(' ') : ''))
    .replace('{file}', file)
    .replace('{className}', 'Main');
  return { full: cmd };
}

function killTree(child) {
  try {
    if (IS_WINDOWS) {
      if (child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    } else {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
  } catch {
    try { child.kill('SIGKILL'); } catch { /* */ }
  }
}

function runProcess(command, args, input, timeout, cwd, tempDir) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        cwd,
        windowsHide: true,
        detached: !IS_WINDOWS,
        env: buildSandboxEnv(cwd || tempDir || os.tmpdir())
      });
    } catch (err) {
      resolve({
        stdout: '',
        stderr: 'Failed to spawn ' + command + ': ' + err.message,
        exitCode: -1,
        signal: null,
        timedOut: false
      });
      return;
    }

    const cap = (s) => (s.length > MAX_OUTPUT_CHARS ? s.slice(0, MAX_OUTPUT_CHARS) + '\n...[output truncated]' : s);
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout: cap(stdout), stderr: cap(stderr), exitCode, signal, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeout);

    try { if (input) child.stdin.write(input); } catch { /* */ }
    try { child.stdin.end(); } catch { /* */ }

    child.stdout.on('data', (d) => {
      const s = d.toString();
      if (stdout.length < MAX_OUTPUT_CHARS) stdout += s.slice(0, MAX_OUTPUT_CHARS - stdout.length);
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      if (stderr.length < MAX_OUTPUT_CHARS) stderr += s.slice(0, MAX_OUTPUT_CHARS - stderr.length);
    });
    child.on('error', (err) => {
      stderr += '\n' + err.message;
      finish(-1, null);
    });
    child.on('close', (code, signal) => {
      if (timedOut) stderr += '\nExecution timed out after ' + timeout + 'ms';
      finish(code, signal);
    });
  });
}

async function executeDirect(config, tempDir, input, timeLimit) {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_UNSAFE_SANDBOX !== '1') {
    throw new Error('Secure code sandbox (nsjail/container) is required in production. Set ALLOW_UNSAFE_SANDBOX=1 only for explicit non-isolated testing.');
  }

  const file = mainFileName(config);
  const binary = binaryName();

  // Step 1: Compile if necessary
  if (config.compileCommand) {
    const compileArgs = (config.compileArgs || []).map(a =>
      a.replace('{file}', file).replace('{binary}', binary)
    );
    const compileResult = await runProcess(config.compileCommand, compileArgs, '', 15000, tempDir, tempDir);
    if (compileResult.exitCode !== 0 || compileResult.timedOut) {
      return {
        ...compileResult,
        stdout: '',
        stderr: 'Compilation error:\n' + compileResult.stderr,
        sandbox: 'direct'
      };
    }
  }

  // Step 2: Execute
  let runCommand = config.command;
  if (runCommand === '{binaryPath}') {
    runCommand = path.join(tempDir, binary);
  }
  const runArgs = (config.args || []).map(a =>
    a.replace('{file}', file).replace('{className}', 'Main').replace('{binary}', binary)
  );

  const result = await runProcess(runCommand, runArgs, input, timeLimit, tempDir, tempDir);
  return { ...result, sandbox: 'direct' };
}

let nsjailAvailable = null;
function detectNsjail() {
  if (nsjailAvailable !== null) return nsjailAvailable;
  if (IS_WINDOWS) { nsjailAvailable = false; return nsjailAvailable; }
  try {
    const r = spawnSync('nsjail', ['--help'], { timeout: 3000 });
    nsjailAvailable = r.status === 0;
  } catch {
    nsjailAvailable = false;
  }
  return nsjailAvailable;
}

async function executeWithNsjail(config, tempDir, input, timeLimit, memoryLimit, cpuLimit) {
  const { full } = buildRunCommand(config);
  const args = [
    '-Mo', '--user', '65534', '--group', '65534',
    '--rlimit_as', String(memoryLimit),
    '--rlimit_cpu', String(cpuLimit),
    '--rlimit_fsize', '64', '--rlimit_nofile', '64',
    '--time_limit', String(Math.ceil(timeLimit / 1000)),
    '--disable_proc', '--quiet', '--cwd', tempDir,
    '--bindmount', tempDir + ':' + tempDir,
    '--bindmount_ro', '/usr:/usr',
    '--bindmount_ro', '/lib:/lib',
    '--bindmount_ro', '/lib64:/lib64',
    '--bindmount_ro', '/bin:/bin',
    '--clone_newnet', '--clone_newipc', '--clone_newuts',
    '--', '/bin/sh', '-c', full,
  ];
  const result = await runProcess('nsjail', args, input, timeLimit + 5000, tempDir, tempDir);
  const isNsjailError = result.stderr && /nsjail/i.test(result.stderr);
  if (result.exitCode === 255 && !result.stdout && isNsjailError) {
    const fallback = await executeDirect(config, tempDir, input, timeLimit);
    return { ...fallback, sandbox: 'direct-fallback', nsjailError: result.stderr.slice(0, 1000) };
  }
  return { ...result, sandbox: 'nsjail' };
}

function scrubPaths(result, tempDir) {
  const scrub = (s) => (typeof s === 'string' ? s.split(tempDir).join('[exec-dir]') : s);
  return {
    ...result,
    stdout: scrub(result.stdout),
    stderr: scrub(result.stderr),
    ...(result.nsjailError ? { nsjailError: scrub(result.nsjailError) } : {}),
  };
}

async function executeInSandbox(options) {
  const { language, code, input = '', files = {}, timeLimit = 10000, memoryLimit = 256, cpuLimit = 2 } = options;
  const config = LANGUAGE_CONFIGS[language];
  if (!config) throw new Error('Unsupported language: ' + language);
  if (typeof input === 'string' && input.length > 10000) throw new Error('Input too long');
  let acquired = false;
  let tempDir = null;
  try {
    await acquireSlot();
    acquired = true;
    tempDir = createTempDir(generateExecutionId());
    const mainFile = mainFileName(config);
    const allFiles = { ...files, [mainFile]: code };
    writeCodeFiles(tempDir, allFiles);
    let result;
    if (detectNsjail()) {
      result = await executeWithNsjail(config, tempDir, input, timeLimit, memoryLimit, cpuLimit);
    } else {
      result = await executeDirect(config, tempDir, input, timeLimit);
    }
    return scrubPaths(result, tempDir);
  } finally {
    if (acquired) releaseSlot();
    if (tempDir) cleanupTempDir(tempDir);
  }
}

async function executeCode(options) {
  const startTime = Date.now();
  try {
    const result = await executeInSandbox(options);
    return { ...result, success: result.exitCode === 0 && !result.timedOut, executionTime: Date.now() - startTime };
  } catch (error) {
    return { success: false, stdout: '', stderr: error.message, exitCode: -1, executionTime: Date.now() - startTime, timedOut: false, error: error.message };
  }
}

module.exports = { executeCode, executeInSandbox, LANGUAGE_CONFIGS, createTempDir, cleanupTempDir, buildRunCommand };
