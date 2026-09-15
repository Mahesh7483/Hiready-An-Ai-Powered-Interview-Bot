'use strict';
/**
 * EXPERIMENT 6 - Transcription quality on the voice-interview path.
 *
 * Research question
 *   HiReady feeds an ASR transcript into the feedback model. Transcription
 *   error is therefore upstream of every downstream judgement, and it must be
 *   measured separately from feedback quality. What is the word error rate on
 *   spoken interview answers recorded through the platform's own browser
 *   capture path, and how does it vary by speaker?
 *
 * Data collection (do this before running the script)
 *   1. Each participant reads a set of prompts aloud into the app's voice
 *      interview screen, or records them with the same browser capture
 *      settings. Save each answer as its own audio file.
 *   2. Produce a verbatim reference transcript for each file - typed by a
 *      human listening to the recording, NOT copied from the model output.
 *   3. Lay the files out as:
 *        experiments/audio/<speakerId>/<utteranceId>.webm
 *        experiments/audio/<speakerId>/<utteranceId>.txt     (reference)
 *      A manifest.json in experiments/audio/ may carry per-speaker metadata
 *      (e.g. {"S01": {"firstLanguage": "Kannada", "consentRef": "C-01"}}).
 *      Do not store participant names or any direct identifier.
 *
 * Scoring
 *   WER on a Levenshtein alignment after light normalisation (case folding,
 *   punctuation removal, number-word preservation). Substitutions, deletions
 *   and insertions are reported separately, because a system that deletes
 *   words and one that substitutes them fail the downstream model differently.
 *
 * Usage (from hiready-backend)
 *   node experiments/exp6_wer.js [--dir experiments/audio] [--model nova-2]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { describe, round, writeResult, provenance, progress, mean } = require('./lib/common');
const args = require('./lib/args')(process.argv, { dir: 'experiments/audio', model: 'nova-2' });

function normalise(s) {
  return String(s)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein alignment over word tokens, returning S/D/I counts. */
function align(refWords, hypWords) {
  const n = refWords.length, m = hypWords.length;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const bp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(''));
  for (let i = 0; i <= n; i++) { d[i][0] = i; bp[i][0] = 'D'; }
  for (let j = 0; j <= m; j++) { d[0][j] = j; bp[0][j] = 'I'; }
  bp[0][0] = '';
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = d[i - 1][j - 1] + (refWords[i - 1] === hypWords[j - 1] ? 0 : 1);
      const del = d[i - 1][j] + 1;
      const ins = d[i][j - 1] + 1;
      d[i][j] = Math.min(sub, del, ins);
      bp[i][j] = d[i][j] === sub ? (refWords[i - 1] === hypWords[j - 1] ? 'C' : 'S') : (d[i][j] === del ? 'D' : 'I');
    }
  }
  let i = n, j = m, S = 0, D = 0, I = 0, C = 0;
  while (i > 0 || j > 0) {
    const op = bp[i][j];
    if (op === 'C') { C++; i--; j--; }
    else if (op === 'S') { S++; i--; j--; }
    else if (op === 'D') { D++; i--; }
    else { I++; j--; }
  }
  return { S, D, I, C, N: n };
}

async function transcribe(buffer, model) {
  const res = await fetch(`https://api.deepgram.com/v1/listen?model=${encodeURIComponent(model)}&smart_format=true&punctuate=true&language=en`, {
    method: 'POST',
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/octet-stream' },
    body: buffer
  });
  if (!res.ok) throw new Error(`Deepgram returned ${res.status}`);
  const j = await res.json();
  return j.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
}

(async () => {
  if (!process.env.DEEPGRAM_API_KEY) {
    console.error('DEEPGRAM_API_KEY is not set.');
    process.exit(1);
  }
  const root = path.resolve(process.cwd(), args.dir);
  if (!fs.existsSync(root)) {
    console.error(`No audio directory at ${root}. See the header of this file for the expected layout.`);
    process.exit(1);
  }
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

  const speakers = fs.readdirSync(root).filter((d) => fs.statSync(path.join(root, d)).isDirectory());
  const trials = [];

  for (const speaker of speakers) {
    const dir = path.join(root, speaker);
    const audio = fs.readdirSync(dir).filter((f) => /\.(webm|wav|mp3|m4a|ogg)$/i.test(f));
    let done = 0;
    for (const file of audio) {
      const stem = file.replace(/\.[^.]+$/, '');
      const refPath = path.join(dir, `${stem}.txt`);
      if (!fs.existsSync(refPath)) {
        console.warn(`  no reference transcript for ${speaker}/${file} - skipped`);
        continue;
      }
      const reference = fs.readFileSync(refPath, 'utf8');
      const buffer = fs.readFileSync(path.join(dir, file));
      const t0 = Date.now();
      let hypothesis = '', err = null;
      try { hypothesis = await transcribe(buffer, args.model); } catch (e) { err = e.message; }
      const latencyMs = Date.now() - t0;

      const refW = normalise(reference).split(' ').filter(Boolean);
      const hypW = normalise(hypothesis).split(' ').filter(Boolean);
      const a = align(refW, hypW);
      trials.push({
        speaker, utterance: stem, error: err,
        refWords: a.N, ...a,
        wer: a.N ? round((a.S + a.D + a.I) / a.N, 4) : null,
        subRate: a.N ? round(a.S / a.N, 4) : null,
        delRate: a.N ? round(a.D / a.N, 4) : null,
        insRate: a.N ? round(a.I / a.N, 4) : null,
        audioBytes: buffer.length, latencyMs,
        firstLanguage: manifest[speaker]?.firstLanguage ?? null
      });
      progress(`  ${speaker}`, ++done, audio.length);
    }
  }

  const good = trials.filter((t) => !t.error && t.refWords > 0);
  // Corpus-level WER is the pooled ratio, not the mean of per-utterance WERs.
  const pooled = good.reduce((a, t) => ({ S: a.S + t.S, D: a.D + t.D, I: a.I + t.I, N: a.N + t.refWords }), { S: 0, D: 0, I: 0, N: 0 });

  const bySpeaker = {};
  for (const sp of [...new Set(good.map((t) => t.speaker))]) {
    const t = good.filter((x) => x.speaker === sp);
    const p = t.reduce((a, x) => ({ S: a.S + x.S, D: a.D + x.D, I: a.I + x.I, N: a.N + x.refWords }), { S: 0, D: 0, I: 0, N: 0 });
    bySpeaker[sp] = {
      utterances: t.length, referenceWords: p.N,
      wer: round((p.S + p.D + p.I) / p.N, 4),
      firstLanguage: t[0].firstLanguage
    };
  }

  const summary = {
    experiment: 'exp6_wer',
    question: 'What transcription error does the voice-interview path introduce before any feedback model sees the answer?',
    provenance: provenance({ asrModel: args.model, speakers: Object.keys(bySpeaker).length, utterances: good.length }),
    corpus: { utterances: good.length, referenceWords: pooled.N, speakers: Object.keys(bySpeaker).length },
    pooledWer: round((pooled.S + pooled.D + pooled.I) / pooled.N, 4),
    pooledSubRate: round(pooled.S / pooled.N, 4),
    pooledDelRate: round(pooled.D / pooled.N, 4),
    pooledInsRate: round(pooled.I / pooled.N, 4),
    perUtteranceWer: describe(good.map((t) => t.wer)),
    bySpeaker,
    transcriptionLatencySeconds: describe(good.map((t) => t.latencyMs / 1000))
  };

  writeResult('exp6_wer', summary, trials);
  console.log(`\npooled WER: ${(summary.pooledWer * 100).toFixed(2)}%  over ${pooled.N} reference words from ${summary.corpus.speakers} speakers`);
  console.log(`  substitutions ${(summary.pooledSubRate * 100).toFixed(2)}%  deletions ${(summary.pooledDelRate * 100).toFixed(2)}%  insertions ${(summary.pooledInsRate * 100).toFixed(2)}%`);
})();
