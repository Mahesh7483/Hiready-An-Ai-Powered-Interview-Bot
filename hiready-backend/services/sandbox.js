const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const IS_WINDOWS = process.platform === 'win32';
const MAX_OUTPUT_CHARS = 512 * 1024; // 512KB output cap per stream
const MAX_CONCURRENT = 4;            // max simultaneous executions (host protection)

// ── Environment isolation ────────────────────────────────────────────────────
// Spawned executions receive a MINIMAL environment. The server's real env is
// never passed through: user-submitted code could otherwise read secrets
// (JWT_SECRET, GROQ_API_KEY, DEEPGRAM_API_KEY, MONGO_URI) straight from
// process.env / os.environ.
function buildSandboxEnv(tempDir) {
  const env = { PATH: process.env.PATH || process.env.Path || '' };
  if (IS_WINDOWS) {
    // Windows runtimes (python/node/javac) fail to start without these
    for (const k of ['SystemRoot', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'COMSPEC']) {
      if (process.env[k]) env[k] = process.env[k];
    }
  } else {
    // go/rustc need a writable HOME for their caches; point it at the temp dir
    env.HOME = tempDir;
  }
  return env;
}

// ── Concurrency guard: caps simultaneous executions to protect the host ──
let running = 0;
const waitQueue = [];
function acquireSlot() {
  if (running < MAX_CONCURRENT) { running++; return Promise.resolve(); }
  return new Promise((resolve) => waitQueue.push(resolve));
}
function releaseSlot() {
  const next = waitQueue.shift();
  if (next) next(); // transfer the slot to the queued execution
  else running--;
}

const LANGUAGE_CONFIGS = {
  python: { extension: 'py', command: IS_WINDOWS ? 'python' : 'python3', args: ['{file}'], timeout: 10000 },
  javascript: { extension: 'js', command: 'node', args: ['{file}'], timeout: 10000 },
  typescript: { extension: 'ts', command: 'ts-node', args: ['{file}'], timeout: 15000 },
  java: { extension: 'java', mainFile: 'Main.java', compile: 'javac {file}', command: 'java', args: ['{className}'], timeout: 15000 },
  go: { extension: 'go', command: 'go', args: ['run', '{file}'], timeout: 15000 },
  cpp: { extension: 'cpp', compile: 'g++ -std=c++17 -O2 {file} -o {binary}', command: '{binary}', args: [], timeout: 15000 },
  rust: { extension: 'rs', compile: 'rustc {file} -o {binary}', command: '{binary}', args: [], timeout: 20000 },
};

function generateExecutionId() { return 'exec_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex'); }

function createTempDir(executionId) {
  const tempDir = path.join(os.tmpdir(), 'hiready_exec_' + executionId);
  fs.mkdirSync(tempDir, { recursive: true });
  // World-writable so the unprivileged `nobody` user can run inside it when nsjail is used
  if (!IS_WINDOWS) { try { fs.chmodSync(tempDir, 0o777); } catch { /* ignore */ } }
  return tempDir;
}

function cleanupTempDir(tempDir) {
  try { if (fs.existsSync(tempDir)) { fs.rmSync(tempDir, { recursive: true, force: true }); } } catch (err) { console.warn('Failed to cleanup temp dir:', err.message); }
}

function writeCodeFiles(tempDir, files) {
  const writtenFiles = [];
  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content, { mode: 0o666 });
    writtenFiles.push({ filename, path: filePath });
  }
  return writtenFiles;
}

function mainFileName(config) { return config.mainFile || ('main.' + config.extension); }
function binaryName() { return IS_WINDOWS ? 'main.exe' : 'main'; }

/**
 * Builds the shell command used by both direct execution and nsjail.
 * Returns a single command string (compile + run for compiled languages).
 */
function buildRunCommand(config) {
  const file = mainFileName(config);
  if (config.compile) {
    const binary = binaryName();
    const compileCmd = config.compile.replace('{file}', file).replace('{binary}', binary);
    const runPath = (IS_WINDOWS ? '.\\' : './') + binary;
    const runCmd = (config.command + (config.args.length ? ' ' + config.args.join(' ') : ''))
      .replace('{binary}', runPath)
      .replace('{className}', 'Main');
    return { full: compileCmd + ' && ' + runCmd };
  }
  const cmd = (config.command + (config.args.length ? ' ' + config.args.join(' ') : ''))
    .replace('{file}', file)
    .replace('{className}', 'Main');
  return { full: cmd };
}

/** Kills a spawned process and its whole tree (shell:true spawns a shell wrapper). */
function killTree(child) {
  try {
    if (IS_WINDOWS) {
      if (child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    } else {
      try { process.kill(-child.pid, 'SIGKILL'); } // kill the process group
      catch { child.kill('SIGKILL'); }
    }
  } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
}

/** Shared spawn logic: always closes stdin (EOF), caps output, settles exactly once. */
function runProcess(command, args, input, timeout, cwd, tempDir) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        cwd,
        windowsHide: true,
        detached: !IS_WINDOWS,
        // Secrets never reach executed code — see buildSandboxEnv above
        env: buildSandboxEnv(cwd || tempDir || os.tmpdir()),
      });
    } catch (err) {
      resolve({ stdout: '', stderr: 'Failed to spawn ' + command + ': ' + err.message, exitCode: -1, signal: null, timedOut: false });
      return;
    }

    const cap = (s) => (s.length > MAX_OUTPUT_CHARS ? s.slice(0, MAX_OUTPUT_CHARS) + '\n...[output truncated]' : s);
    let stdout = '', stderr = '', settled = false, timedOut = false;
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

    // Always write + close stdin so programs reading input get EOF instead of hanging
    try { if (input) child.stdin.write(input); } catch { /* ignore */ }
    try { child.stdin.end(); } catch { /* ignore */ }

    child.stdout.on('data', (d) => { if (stdout.length <= MAX_OUTPUT_CHARS) stdout += d.toString(); });
    child.stderr.on('data', (d) => { if (stderr.length <= MAX_OUTPUT_CHARS) stderr += d.toString(); });
    child.on('error', (err) => { stderr += '\n' + err.message; finish(-1, null); });
    child.on('close', (code, signal) => {
      if (timedOut) stderr += '\nExecution timed out after ' + timeout + 'ms';
      finish(code, signal);
    });
  });
}

async function executeDirect(config, tempDir, input, timeLimit) {
  // Unsandboxed execution on a Linux server is host-level code execution.
  // Block it in production unless explicitly opted in via ALLOW_UNSAFE_SANDBOX=1.
  if (!IS_WINDOWS && process.env.NODE_ENV === 'production' && process.env.ALLOW_UNSAFE_SANDBOX !== '1') {
    throw new Error(
      'Secure code sandbox (nsjail) is not available on this server. ' +
      'Install nsjail, or set ALLOW_UNSAFE_SANDBOX=1 to explicitly permit unsandboxed execution.'
    );
  }
  const { full } = buildRunCommand(config);
  const result = await runProcess(full, [], input, timeLimit, tempDir);
  return { ...result, sandbox: 'direct' };
}

// ── nsjail support (Linux production servers) ──────────────────────────────
// When nsjail is installed, code runs inside it with hard resource limits:
//   --rlimit_as    memory cap (MB)        --user/--group 65534 ("nobody")
//   --time_limit   wall-clock cap (s)     --rlimit_cpu  CPU-seconds cap
// Requires root (or CAP_SYS_ADMIN). Flags may need tuning per server; if
// nsjail itself fails to launch we degrade gracefully to direct execution.

let nsjailAvailable = null; // cached probe result
function detectNsjail() {
  if (nsjailAvailable !== null) return nsjailAvailable;
  if (IS_WINDOWS) { nsjailAvailable = false; return nsjailAvailable; } // nsjail is Linux-only
  try {
    const r = spawnSync('nsjail', ['--help'], { timeout: 3000 });
    nsjailAvailable = r.status === 0;
  } catch { nsjailAvailable = false; }
  return nsjailAvailable;
}

async function executeWithNsjail(config, tempDir, input, timeLimit, memoryLimit, cpuLimit) {
  const { full } = buildRunCommand(config);
  const args = [
    '-Mo',                                  // one-shot execution mode
    '--user', '65534', '--group', '65534',  // drop privileges to nobody
    '--rlimit_as', String(memoryLimit),     // memory cap (MB)
    '--rlimit_cpu', String(cpuLimit),       // CPU-seconds cap
    '--rlimit_fsize', '64',                 // max written file size (MB)
    '--rlimit_nofile', '64',
    '--time_limit', String(Math.ceil(timeLimit / 1000)),
    '--disable_proc',
    '--quiet',
    '--cwd', tempDir,
    '--bindmount', tempDir + ':' + tempDir, // rw access to the work dir only
    '--', '/bin/sh', '-c', full,
  ];
  // nsjail itself gets a slightly larger wall-clock allowance than the payload
  const result = await runProcess('nsjail', args, input, timeLimit + 5000, tempDir);
  // exit 255 with no output typically means nsjail failed to set up its sandbox
  if (result.exitCode === 255 && !result.stdout) {
    const fallback = await executeDirect(config, tempDir, input, timeLimit);
    return { ...fallback, sandbox: 'direct-fallback', nsjailError: result.stderr };
  }
  return { ...result, sandbox: 'nsjail' };
}

async function executeInSandbox(options) {
  const { language, code, input = '', files = {}, timeLimit = 10000, memoryLimit = 256, cpuLimit = 2 } = options;
  const config = LANGUAGE_CONFIGS[language];
  if (!config) throw new Error('Unsupported language: ' + language);

  await acquireSlot();
  const executionId = generateExecutionId();
  const tempDir = createTempDir(executionId);
  try {
    const mainFile = mainFileName(config);
    const allFiles = { [mainFile]: code, ...files };
    writeCodeFiles(tempDir, allFiles);

    if (detectNsjail()) {
      return await executeWithNsjail(config, tempDir, input, timeLimit, memoryLimit, cpuLimit);
    }
    return await executeDirect(config, tempDir, input, timeLimit);
  } finally {
    cleanupTempDir(tempDir);
    releaseSlot();
  }
}

async function executeCode(options) {
  const startTime = Date.now();
  try {
    const result = await executeInSandbox(options);
    return {
      ...result,
      success: result.exitCode === 0 && !result.timedOut,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return { success: false, stdout: '', stderr: error.message, exitCode: -1, executionTime: Date.now() - startTime, timedOut: false, error: error.message };
  }
}

module.exports = { executeCode, executeInSandbox, LANGUAGE_CONFIGS, createTempDir, cleanupTempDir, buildRunCommand };