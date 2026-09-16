'use strict';
const fs = require('fs');
const path = require('path');

const srcBackend = path.resolve(__dirname, '..');
const dstBackend = path.resolve(__dirname, '..', '..', '..', 'verification-update', 'backend');

if (!fs.existsSync(dstBackend)) fs.mkdirSync(dstBackend, { recursive: true });

// 1. Write sanitized .env.example
const envExample = [
  '# ==============================================================================#',
  '# HIREady Backend Environment Configuration Template (Sanitized Placeholders)  #',
  '# ==============================================================================#',
  'PORT=5000',
  'NODE_ENV=test',
  'MONGO_URI=mongodb://127.0.0.1:27017/hiready-test',
  'JWT_SECRET=placeholder_jwt_secret_for_local_verification_only',
  'GROQ_API_KEY=placeholder_groq_api_key',
  'GROQ_MODEL=openai/gpt-oss-120b',
  'ASR_SERVICE_KEY=placeholder_asr_key'
].join('\n') + '\n';
fs.writeFileSync(path.join(dstBackend, '.env.example'), envExample);

// 2. Copy root files
['server.js', 'package.json', 'package-lock.json'].forEach(f => {
  const sp = path.join(srcBackend, f);
  if (fs.existsSync(sp)) {
    fs.copyFileSync(sp, path.join(dstBackend, f));
    console.log(`Copied ${f}`);
  }
});

// 3. Recursive directory copy helper
function copyDirRecursive(srcDir, destDir) {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const sp = path.join(srcDir, ent.name);
    const dp = path.join(destDir, ent.name);
    if (ent.isDirectory()) {
      copyDirRecursive(sp, dp);
    } else {
      fs.copyFileSync(sp, dp);
    }
  }
}

// 4. Copy required directories
['routes', 'models', 'services', 'middleware', 'utils', 'scripts', 'experiments'].forEach(d => {
  const sp = path.join(srcBackend, d);
  const dp = path.join(dstBackend, d);
  if (fs.existsSync(sp)) {
    copyDirRecursive(sp, dp);
    console.log(`Copied directory: ${d}`);
  }
});

console.log('Backend directory sync complete!');
