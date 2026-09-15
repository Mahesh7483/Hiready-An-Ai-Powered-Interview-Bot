'use strict';
/**
 * Cryptographic Manifest Verification Script
 * 
 * Verifies that the verification package has not drifted, experienced tampering, or omitted/added files.
 * Validates:
 * 1. All files listed in evidence/source-revision-and-hashes.txt exist and match SHA-256 hashes.
 * 2. No unexpected / unmanifested files exist across the package scope.
 * 3. Excludes the manifest itself from checking.
 * 
 * Exit Code: 0 on 100% integrity match; 1 if any discrepancy detected.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Resolve base directory
let baseDir = path.resolve(__dirname, '..', '..', '..', 'verification-update');
if (!fs.existsSync(baseDir)) {
  baseDir = path.resolve(__dirname, '..');
}
if (!fs.existsSync(path.join(baseDir, 'evidence', 'source-revision-and-hashes.txt'))) {
  baseDir = path.resolve(__dirname);
}

const evidenceFile = path.join(baseDir, 'evidence', 'source-revision-and-hashes.txt');

if (!fs.existsSync(evidenceFile)) {
  console.error('Error: Manifest file not found at', evidenceFile);
  process.exit(1);
}

console.log('================================================================================');
console.log('HIREady: Cryptographic Manifest Verification');
console.log(`Target Directory: ${baseDir}`);
console.log(`Manifest File:    ${evidenceFile}`);
console.log('================================================================================\n');

// 1. Parse manifest file
const manifestContent = fs.readFileSync(evidenceFile, 'utf8');
const manifestEntries = new Map();

for (const line of manifestContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed.startsWith('SHA-256')) {
    continue;
  }
  const match = trimmed.match(/^([a-f0-9]{64})\s+(.+)$/i);
  if (match) {
    const hash = match[1].toLowerCase();
    const relPath = match[2].trim().replace(/\\/g, '/');
    manifestEntries.set(relPath, hash);
  }
}

console.log(`Parsed ${manifestEntries.size} file entries from manifest.\n`);

let missingCount = 0;
let mismatchCount = 0;
let matchedCount = 0;

// 2. Verify all manifest entries against files on disk
for (const [relPath, expectedHash] of manifestEntries.entries()) {
  const fullPath = path.join(baseDir, ...relPath.split('/'));
  if (!fs.existsSync(fullPath)) {
    console.error(`[MISSING]   ${relPath}`);
    missingCount++;
    continue;
  }

  const content = fs.readFileSync(fullPath);
  const actualHash = crypto.createHash('sha256').update(content).digest('hex').toLowerCase();

  if (actualHash !== expectedHash) {
    console.error(`[MISMATCH]  ${relPath}`);
    console.error(`            Expected: ${expectedHash}`);
    console.error(`            Actual:   ${actualHash}`);
    mismatchCount++;
  } else {
    matchedCount++;
  }
}

// 3. Reverse scan: check for unexpected / unmanifested files
const diskFiles = [];
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
      if (path.resolve(full) === path.resolve(evidenceFile)) {
        continue;
      }
      diskFiles.push(full);
    }
  }
}

['backend', 'data', 'analysis', 'documentation', 'evidence', 'scripts'].forEach(d => {
  walk(path.join(baseDir, d));
});
const reproFile = path.join(baseDir, 'REPRODUCE.md');
if (fs.existsSync(reproFile)) diskFiles.push(reproFile);

let unexpectedCount = 0;
for (const fp of diskFiles) {
  const relPath = path.relative(baseDir, fp).replace(/\\/g, '/');
  if (!manifestEntries.has(relPath)) {
    console.warn(`[UNEXPECTED] ${relPath} is present on disk but not in manifest`);
    unexpectedCount++;
  }
}

console.log('\n================================================================================');
console.log('VERIFICATION SUMMARY');
console.log('================================================================================');
console.log(`Total Manifest Entries:   ${manifestEntries.size}`);
console.log(`Matching Files Verified:  ${matchedCount}`);
console.log(`Missing Files:            ${missingCount}`);
console.log(`Hash Mismatches:          ${mismatchCount}`);
console.log(`Unexpected Files:         ${unexpectedCount}`);
console.log('================================================================================');

if (missingCount === 0 && mismatchCount === 0 && unexpectedCount === 0) {
  console.log('\nSUCCESS: 100% Cryptographic Integrity Verified. Zero drift detected.');
  process.exit(0);
} else {
  console.error('\nFAILURE: Cryptographic drift detected. Manifest verification failed.');
  process.exit(1);
}
