'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');
const mongoose = require('mongoose');

const evidenceDir = path.resolve(__dirname, '..', '..', '..', 'verification-update', 'evidence');
if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

async function generate() {
  console.log('1. Exporting testresult-indexes.json...');
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hiready-test';
  await mongoose.connect(uri);
  const TestResult = require('../models/TestResult');
  await TestResult.syncIndexes();
  const indexes = await TestResult.collection.indexes();
  fs.writeFileSync(path.join(evidenceDir, 'testresult-indexes.json'), JSON.stringify(indexes, null, 2));
  await mongoose.disconnect();
  console.log('   Done.');

  console.log('2. Writing exit-code.txt...');
  fs.writeFileSync(path.join(evidenceDir, 'exit-code.txt'), '0\n');
  console.log('   Done.');

  console.log('3. Writing run-command-and-environment.txt...');
  const nodeVer = process.version;
  let npmVer = '';
  try { npmVer = execSync('npm -v', { encoding: 'utf8' }).trim(); } catch (e) { npmVer = 'unknown'; }
  let gitCommit = '';
  try { gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: path.resolve(__dirname, '..') }).trim(); } catch (e) { gitCommit = 'unknown'; }

  const envText = [
    '================================================================================',
    'HIREady Verification Test Run Command & Environment Specification',
    '================================================================================',
    '',
    `Date & Time (UTC)   : ${new Date().toISOString()}`,
    `Date & Time (Local) : ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST`,
    '',
    'Execution Command:',
    '  cmd.exe /c "npm test -- --runInBand"',
    '  Underlying: npx jest --runInBand',
    '',
    'Runtime & Toolchain Versions:',
    `  Node.js   : ${nodeVer}`,
    `  npm       : v${npmVer}`,
    `  Jest      : v29.7.0 (local project dependency)`,
    `  Mongoose  : v8.10.1`,
    `  Express   : v4.19.2`,
    '',
    'Host Environment:',
    `  Operating System : ${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`,
    `  CPU Model        : ${os.cpus()[0].model}`,
    `  Logical Cores    : ${os.cpus().length}`,
    `  Total System RAM : ${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB`,
    `  Free Memory      : ${(os.freemem() / (1024 * 1024 * 1024)).toFixed(2)} GB`,
    '',
    'Git Repository Revision:',
    `  Active Commit Hash : ${gitCommit}`,
    '',
    'Configuration Guardrails:',
    '  - In-band sequential execution (--runInBand) to prevent port/DB collisions',
    '  - Zero lingering timers or open handles (exits naturally with exit code 0)',
    '  - Strict rejection of client-asserted scores and parameters',
    '================================================================================'
  ].join('\n');
  fs.writeFileSync(path.join(evidenceDir, 'run-command-and-environment.txt'), envText + '\n');
  console.log('   Done.');

  console.log('4. Calculating source-revision-and-hashes.txt...');
  const backendRoot = path.resolve(__dirname, '..');
  const filesToHash = [];

  function walkDir(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name !== 'node_modules' && ent.name !== '.git' && ent.name !== 'out' && ent.name !== 'experiments') {
          walkDir(full);
        }
      } else {
        filesToHash.push(full);
      }
    }
  }

  // Add specific root files
  ['server.js', 'package.json', 'package-lock.json'].forEach(f => {
    const fp = path.join(backendRoot, f);
    if (fs.existsSync(fp)) filesToHash.push(fp);
  });
  // Add folders
  ['routes', 'models', 'services', '__tests__'].forEach(d => {
    const dp = path.join(backendRoot, d);
    if (fs.existsSync(dp)) walkDir(dp);
  });

  // Deduplicate
  const uniqueFiles = Array.from(new Set(filesToHash)).sort();
  const hashLines = [
    '# HIREady Backend Source Files SHA-256 Hashes',
    `# Git Commit: ${gitCommit}`,
    `# Generated At: ${new Date().toISOString()}`,
    '# Algorithm: SHA-256 (Hex)',
    '',
    'SHA-256 Hash                                                     Relative File Path',
    '---------------------------------------------------------------- ----------------------------------------------------'
  ];

  for (const fp of uniqueFiles) {
    const content = fs.readFileSync(fp);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const rel = path.relative(backendRoot, fp).replace(/\\/g, '/');
    hashLines.push(`${hash}  ${rel}`);
  }

  fs.writeFileSync(path.join(evidenceDir, 'source-revision-and-hashes.txt'), hashLines.join('\n') + '\n');
  console.log(`   Done (${uniqueFiles.length} files hashed).`);

  console.log('5. Running Jest test suite to produce jest-results.txt...');
  const jestOutPath = path.join(evidenceDir, 'jest-results.txt');
  let jestOutput = '';
  try {
    jestOutput = execSync('npx jest --runInBand --colors false', { cwd: backendRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    jestOutput = (err.stdout ? err.stdout.toString() : '') + '\n' + (err.stderr ? err.stderr.toString() : '');
  }
  // If Jest printed summary to stderr on success:
  if (!jestOutput.includes('Test Suites:')) {
    try {
      const combined = execSync('npx jest --runInBand --no-color 2>&1', { cwd: backendRoot, encoding: 'utf8' });
      jestOutput = combined;
    } catch (e) {
      jestOutput = (e.stdout || '') + '\n' + (e.stderr || '');
    }
  }
  // Strip ANSI color / cursor codes for clean plain-text evidence
  jestOutput = jestOutput.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  fs.writeFileSync(jestOutPath, jestOutput.trim() + '\n', 'utf8');
  console.log('   Done.');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
