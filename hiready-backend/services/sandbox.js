const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const IS_WINDOWS = process.platform === 'win32';
const MAX_OUTPUT_CHARS = 512 * 1024;
const MAX_CONCURRENT = 4;
const MAX_QUEUE = 100;
const TS_TRANSPILE = path.join(__dirname, 'tsTranspile.js');

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
  // Transpiled by the backend's own typescript package, then run with node.
  // `npx ts-node` downloaded ts-node on every run, and ts-node 10 cannot load
  // .ts files at all under Node 20.19+ ("Unknown file extension .ts").
  typescript: {
    extension: 'ts',
    compileCommand: process.execPath,
    compileArgs: [TS_TRANSPILE, '{file}', 'main.js'],
    command: process.execPath,
    args: ['main.js'],
    timeout: 15000
  },
  java: {
    extension: 'java',
    jvm: true,
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
    compilesOnRun: true,
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

function runProcess(command, args, input, timeout, cwd, tempDir, identity = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        cwd,
        windowsHide: true,
        detached: !IS_WINDOWS,
        env: buildSandboxEnv(cwd || tempDir || os.tmpdir()),
        ...identity,
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

  /*
   * NO automatic fallback to unsandboxed execution.
   *
   * This used to re-run the program via executeDirect when
   *   exitCode === 255 && !stdout && /nsjail/i.test(stderr)
   * — three values the SUBMITTED PROGRAM controls. Any solution could exit
   * 255, print nothing to stdout and write "nsjail" to stderr, and the server
   * would obligingly run it again outside the jail: no network namespace, no
   * rlimits, no uid drop. That is a sandbox escape triggered by ordinary
   * user input.
   *
   * There is no way to distinguish the jail failing from the child pretending
   * it did, using the child's own output. So when the jail is in use it is the
   * only thing that runs: a genuine nsjail failure surfaces as an error the
   * operator can see, not as a silent downgrade of isolation.
   */
  if (result.exitCode === 255 && !result.stdout && /nsjail/i.test(result.stderr)) {
    console.error('[sandbox] nsjail reported a failure:', result.stderr.slice(0, 500));
    return {
      stdout: '',
      stderr: 'The execution environment is unavailable. Please try again shortly.',
      exitCode: 1,
      executionTime: result.executionTime || 0,
      timedOut: false,
      sandbox: 'unavailable',
    };
  }

  return { ...result, sandbox: 'nsjail' };
}

/*
 * The restricted runner: isolation for hosts where nsjail cannot run.
 *
 * nsjail needs to create namespaces, which ordinary container platforms
 * (Render included) refuse. Without it the only other path was executeDirect,
 * which runs the submission AS THE SERVER — able to read /proc/1/environ and
 * so the JWT secret, the database password and every API key. Production
 * rightly refuses that.
 *
 * This runner is enabled with SANDBOX_RUNNER=restricted and requires the API
 * to run as root inside its container (the Dockerfile's default). Each
 * execution then runs as its OWN random, unprivileged uid:
 *   - the server's /proc/<pid>/environ is root-only, so its secrets are out
 *     of reach;
 *   - the exec dir is chowned to that uid with mode 0700, and no two runs
 *     share a uid, so one submission cannot read, alter or signal another;
 *   - CPU time, memory, file size, open files and process count are capped
 *     with rlimits (the process cap is per uid, so a fork bomb stops itself);
 *   - the wall-clock timeout kills the whole process group, as before.
 *
 * What it does NOT give, unlike nsjail: a private network or a private
 * filesystem view. Submitted code can open outbound connections and read
 * world-readable files (the app's source, which is public anyway). That is
 * the trade for running on a host that forbids namespaces; it is written down
 * here so nobody mistakes this for the jail.
 */
const RESTRICTED_UID_BASE = 100000;
const RESTRICTED_UID_RANGE = 60000;
const COMPILE_TIMEOUT_MS = Number(process.env.SANDBOX_COMPILE_TIMEOUT_MS) || 15000;

function restrictedRunnerEnabled() {
  return process.env.SANDBOX_RUNNER === 'restricted';
}

function restrictedLimitArgs({ cpuSeconds, memoryMb, fileMb = 64, maxProcs = 128 }) {
  const int = (n) => Math.max(1, Math.floor(Number(n)) || 1);
  const limits = [
    `ulimit -t ${int(cpuSeconds)}`,
    `ulimit -f ${int(fileMb) * 1024}`,
    'ulimit -n 64',
    `ulimit -u ${int(maxProcs)}`,
    'ulimit -c 0',
  ];
  // RLIMIT_DATA covers heap and private mappings. A JVM reserves its whole
  // heap up front and cannot start under it, so Java is held by -Xmx instead.
  if (memoryMb) limits.push(`ulimit -d ${int(memoryMb) * 1024}`);
  // The command and its arguments arrive as "$@", never spliced into the
  // script, so nothing from a template or a filename is parsed as shell.
  return ['-c', limits.join(' && ') + ' && exec "$@"', 'sandbox'];
}

function chownTree(dir, uid) {
  fs.chownSync(dir, uid, uid);
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (fs.lstatSync(p).isDirectory()) chownTree(p, uid);
    else fs.chownSync(p, uid, uid);
  }
}

async function executeRestricted(config, tempDir, input, timeLimit, memoryLimit, cpuLimit) {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
    // Refuse rather than quietly run as the server's own user.
    throw new Error('SANDBOX_RUNNER=restricted requires the API to run as root so submissions can run as a separate user.');
  }

  const uid = RESTRICTED_UID_BASE + crypto.randomInt(0, RESTRICTED_UID_RANGE);
  chownTree(tempDir, uid);
  fs.chmodSync(tempDir, 0o700);
  const identity = { uid, gid: uid };

  const file = mainFileName(config);
  const binary = binaryName();
  const jvmMemory = config.jvm ? null : memoryLimit;

  if (config.compileCommand) {
    let compileArgs = (config.compileArgs || []).map((a) => a.replace('{file}', file).replace('{binary}', binary));
    if (config.jvm) compileArgs = ['-J-Xmx256m', '-J-XX:+UseSerialGC', '-J-XX:TieredStopAtLevel=1', ...compileArgs];
    const compile = await runProcess(
      'bash',
      [...restrictedLimitArgs({ cpuSeconds: COMPILE_TIMEOUT_MS / 1000, memoryMb: config.jvm ? null : 1024 }), config.compileCommand, ...compileArgs],
      '', COMPILE_TIMEOUT_MS, tempDir, tempDir, identity
    );
    if (compile.exitCode !== 0 || compile.timedOut) {
      return {
        ...compile,
        stdout: '',
        stderr: 'Compilation error:\n' + (compile.timedOut ? 'Compilation timed out' : compile.stderr),
        sandbox: 'restricted',
      };
    }
  }

  const runCommand = config.command === '{binaryPath}' ? path.join(tempDir, binary) : config.command;
  let runArgs = (config.args || []).map((a) => a.replace('{file}', file).replace('{className}', 'Main').replace('{binary}', binary));
  if (config.jvm) runArgs = [`-Xmx${memoryLimit}m`, '-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', ...runArgs];

  // `go run` and ts-node compile inside the run step, so they get the
  // compile allowance on top of the program's own limits.
  const extraMs = config.compilesOnRun ? COMPILE_TIMEOUT_MS : 0;
  const result = await runProcess(
    'bash',
    [
      ...restrictedLimitArgs({
        cpuSeconds: cpuLimit + extraMs / 1000,
        memoryMb: config.compilesOnRun ? Math.max(jvmMemory || 0, 1024) : jvmMemory,
      }),
      runCommand,
      ...runArgs,
    ],
    input, timeLimit + extraMs, tempDir, tempDir, identity
  );
  // An rlimit kill arrives as a bare signal with nothing on stderr, which
  // reads to a candidate as the program silently doing nothing.
  if (!result.timedOut && (result.signal === 'SIGXCPU' || result.signal === 'SIGKILL')) {
    result.stderr += (result.stderr ? '\n' : '') + (result.signal === 'SIGXCPU'
      ? `CPU time limit exceeded (${cpuLimit}s)`
      : 'Killed: resource limit exceeded');
  }
  return { ...result, sandbox: 'restricted' };
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
    } else if (restrictedRunnerEnabled()) {
      result = await executeRestricted(config, tempDir, input, timeLimit, memoryLimit, cpuLimit);
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

module.exports = { executeCode, executeInSandbox, LANGUAGE_CONFIGS, createTempDir, cleanupTempDir, buildRunCommand, restrictedLimitArgs };
