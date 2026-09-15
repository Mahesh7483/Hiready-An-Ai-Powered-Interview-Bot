'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const backendDir = path.resolve(__dirname, '..', '..', '..', 'verification-update', 'backend');
const evidenceFile = path.resolve(__dirname, '..', '..', '..', 'verification-update', 'evidence', 'source-revision-and-hashes.txt');

let gitCommit = '4f44276438cdab5f3bd0e1effb59838e978ebcbc';
try {
  gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: path.resolve(__dirname, '..') }).trim();
} catch (e) {}

const filesToHash = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full);
    } else {
      filesToHash.push(full);
    }
  }
}
walk(backendDir);
filesToHash.sort();

const lines = [
  '# HIREady Backend Packaged Source Files SHA-256 Hashes',
  `# Git Commit: ${gitCommit}`,
  `# Generated At: ${new Date().toISOString()}`,
  '# Algorithm: SHA-256 (Hex)',
  '',
  'SHA-256 Hash                                                     Relative File Path',
  '---------------------------------------------------------------- ----------------------------------------------------'
];

for (const fp of filesToHash) {
  const content = fs.readFileSync(fp);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const rel = path.relative(backendDir, fp).replace(/\\/g, '/');
  lines.push(`${hash}  ${rel}`);
}

fs.writeFileSync(evidenceFile, lines.join('\n') + '\n');
console.log('Successfully hashed', filesToHash.length, 'packaged backend files into source-revision-and-hashes.txt');
