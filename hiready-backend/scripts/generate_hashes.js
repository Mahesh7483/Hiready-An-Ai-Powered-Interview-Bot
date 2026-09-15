'use strict';
/**
 * Cryptographic Manifest Generation Script
 * 
 * Generates evidence/source-revision-and-hashes.txt for the HIREady verification package.
 * Covers: backend/, data/, analysis/, documentation/, evidence/, REPRODUCE.md, and scripts/.
 * Excludes the manifest itself, node_modules, and git directories.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Determine base verification directory
const baseDir = path.resolve(__dirname, '..', '..', '..', 'verification-update');
const evidenceFile = path.join(baseDir, 'evidence', 'source-revision-and-hashes.txt');

if (!fs.existsSync(baseDir)) {
  console.error('Error: verification-update directory not found at', baseDir);
  process.exit(1);
}

let gitCommit = '4f44276438cdab5f3bd0e1effb59838e978ebcbc';
try {
  gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: path.resolve(__dirname, '..') }).trim();
} catch (e) {}

const filesToHash = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === '.DS_Store' || ent.name === 'Thumbs.db') {
      continue;
    }
    if (ent.isDirectory()) {
      walk(full);
    } else {
      // Exclude manifest file itself
      if (path.resolve(full) === path.resolve(evidenceFile)) {
        continue;
      }
      filesToHash.push(full);
    }
  }
}

// Walk target directories and root files
['backend', 'data', 'analysis', 'documentation', 'evidence', 'scripts'].forEach(d => {
  walk(path.join(baseDir, d));
});

// Also include root REPRODUCE.md
const reproduceFile = path.join(baseDir, 'REPRODUCE.md');
if (fs.existsSync(reproduceFile)) {
  filesToHash.push(reproduceFile);
}

// Deduplicate and sort deterministically
const uniqueFiles = Array.from(new Set(filesToHash)).sort();

const lines = [
  '# HIREady Verification Package SHA-256 Manifest',
  `# Git Commit: ${gitCommit}`,
  `# Generated At: ${new Date().toISOString()}`,
  '# Algorithm: SHA-256 (Hex)',
  '# Scope: backend/, data/, analysis/, documentation/, evidence/, REPRODUCE.md, scripts/',
  '# Exclusion: evidence/source-revision-and-hashes.txt (manifest self)',
  '',
  'SHA-256 Hash                                                     Relative File Path',
  '---------------------------------------------------------------- ----------------------------------------------------'
];

for (const fp of uniqueFiles) {
  const content = fs.readFileSync(fp);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const rel = path.relative(baseDir, fp).replace(/\\/g, '/');
  lines.push(`${hash}  ${rel}`);
}

const evidenceDir = path.dirname(evidenceFile);
if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

fs.writeFileSync(evidenceFile, lines.join('\n') + '\n');
console.log(`Successfully generated manifest with ${uniqueFiles.length} files into evidence/source-revision-and-hashes.txt`);
