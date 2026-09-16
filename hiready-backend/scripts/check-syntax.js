/**
 * Cross-platform JavaScript syntax checker using Node's native vm module.
 * Recursively scans directories and validates JS syntax on Windows/Linux/macOS.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// '../tests/backend' because the suites live at <repo>/tests, not in this
// package. scanDir() returns silently for a directory that does not exist, so
// leaving the old '__tests__' here would have dropped every test file from the
// check without failing or saying anything.
const DIRECTORIES = ['routes', 'models', 'middleware', 'services', 'utils', 'scripts', '../tests/backend'];
const ROOT_FILES = ['server.js', 'eslint.config.js', 'jest.config.js'];

let errors = 0;
let checked = 0;

function checkFile(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    new vm.Script(code, { filename: filePath });
    checked++;
  } catch (err) {
    console.error(`❌ Syntax error in ${filePath}:`, err.message);
    errors++;
  }
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      scanDir(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      checkFile(fullPath);
    }
  }
}

// Check root files
for (const file of ROOT_FILES) {
  const fullPath = path.join(__dirname, '..', file);
  if (fs.existsSync(fullPath)) {
    checkFile(fullPath);
  }
}

// Check directories
for (const dir of DIRECTORIES) {
  const fullPath = path.join(__dirname, '..', dir);
  scanDir(fullPath);
}

console.log(`\nChecked ${checked} files.`);
if (errors > 0) {
  console.error(`\nFound ${errors} syntax errors.`);
  process.exit(1);
} else {
  console.log('✅ All backend JavaScript files passed syntax check.');
}
