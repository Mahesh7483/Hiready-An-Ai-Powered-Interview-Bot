const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { requireAuth } = require('../middleware/auth');

// All routes here are authenticated and share the global API rate limit
router.use(requireAuth);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// Configurable so retired models can be swapped without code changes
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

/**
 * Call Groq chat completions with basic size guards.
 */
async function groqChat(messages, options = {}) {
  const payload = {
    model: GROQ_MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 300
  };
  // Reasoning models (gpt-oss/qwen) silently burn the token budget on hidden
  // chain-of-thought first — with small max_tokens this leaves `content`
  // EMPTY. Capping reasoning effort keeps the budget for the actual answer.
  // NOTE: `timeout` is NOT a valid create() property on this groq-sdk version
  // (400 "property 'timeout' is unsupported") — use a hard timer instead.
  if (/gpt-oss|qwen/i.test(GROQ_MODEL)) {
    payload.reasoning_effort = 'low';
  }
  const timeoutMs = options.timeoutMs ?? 90000;
  return Promise.race([
    groq.chat.completions.create(payload),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Groq call timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return false;
  }
  return messages.every(
    (m) =>
      m &&
      typeof m.content === 'string' &&
      m.content.length <= 8000 &&
      ['system', 'user', 'assistant'].includes(m.role)
  );
}

// POST /api/ai/star-coach — STAR-method feedback on a behavioral answer
router.post('/star-coach', async (req, res) => {
  const { question, answer } = req.body;
  if (!question || typeof question !== 'string' || question.length > 2000) {
    return res.status(400).json({ error: 'question is required (max 2000 chars)' });
  }
  if (!answer || typeof answer !== 'string' || answer.length > 8000) {
    return res.status(400).json({ error: 'answer is required (max 8000 chars)' });
  }

  try {
    const response = await groqChat([
      {
        role: 'system',
        content: 'You are a behavioral interview coach. Analyze the candidate answer using the STAR method (Situation, Task, Action, Result). Reply with STRICT JSON only, no markdown: {"situation":{"present":true/false,"note":"..."},"task":{"present":true/false,"note":"..."},"action":{"present":true/false,"note":"..."},"result":{"present":true/false,"note":"..."},"score":<0-10>,"improvedAnswer":"a rewritten 3-4 sentence STAR version of their answer"}',
      },
      { role: 'user', content: `Interview question: ${question}\n\nCandidate answer: ${answer}` },
    ], { temperature: 0.4, maxTokens: 700 });

    const raw = response.choices?.[0]?.message?.content || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'Empty response from AI provider' });
    let parsed;
    try { parsed = JSON.parse(match[0]); } catch { return res.status(502).json({ error: 'Malformed AI response' }); }
    res.json(parsed);
  } catch (err) {
    console.error('STAR coach error:', err.message);
    res.status(502).json({ error: 'AI provider request failed' });
  }
});

// POST /api/ai/draft-question — AI Question Writer for admins (drafts → admin approves)
router.post('/draft-question', async (req, res) => {
  // Only admins may draft questions
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { topic, difficulty = 'medium', category = 'logical' } = req.body;
  if (!topic || typeof topic !== 'string' || topic.length > 200) {
    return res.status(400).json({ error: 'topic is required (max 200 chars)' });
  }
  if (!CATEGORIES_SAFE.includes(category) || !DIFFS_SAFE.includes(difficulty)) {
    return res.status(400).json({ error: 'invalid category or difficulty' });
  }

  try {
    const response = await groqChat([
      {
        role: 'system',
        content: 'You write high-quality multiple-choice aptitude interview questions. Reply with STRICT JSON only, no markdown: {"Question":"...","Option A":"...","Option B":"...","Option C":"...","Option D":"...","Answer":"A"|"B"|"C"|"D","difficulty":"easy"|"medium"|"hard","Explanation":"1-3 sentences explaining why the answer is correct"}',
      },
      { role: 'user', content: `Write one ${difficulty} ${category} aptitude question about: ${topic}. Make distractors plausible.` },
    ], { temperature: 0.6, maxTokens: 500 });

    const raw = response.choices?.[0]?.message?.content || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'Empty response from AI provider' });
    let parsed;
    try { parsed = JSON.parse(match[0]); } catch { return res.status(502).json({ error: 'Malformed AI response' }); }
    if (!parsed.Question || !parsed['Option A'] || !parsed.Answer) {
      return res.status(502).json({ error: 'AI draft missing required fields' });
    }
    res.json({ ...parsed, category, difficulty });
  } catch (err) {
    console.error('Draft question error:', err.message);
    res.status(502).json({ error: 'AI provider request failed' });
  }
});

// POST /api/ai/chat — proxies interviewer chat to Groq (key never reaches the browser)
router.post('/chat', async (req, res) => {
  const { messages } = req.body;

  if (!validateMessages(messages)) {
    return res.status(400).json({
      error: 'messages must be an array (max 40) of {role, content} with content <= 8000 chars'
    });
  }

  try {
    const response = await groqChat(messages);
    const reply = response.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(502).json({ error: 'Empty response from AI provider' });
    }
    res.json({ reply });
  } catch (err) {
    console.error('AI chat error:', err.message);
    res.status(502).json({ error: 'AI provider request failed' });
  }
});

/**
 * Attempt to salvage a JSON object that was truncated by max_tokens by
 * closing any open strings and brackets. Returns null when unsalvageable.
 */
function repairTruncatedJson(text) {
  let s = String(text).trim();
  const start = s.indexOf('{');
  if (start === -1) return null;
  s = s.slice(start);

  const stack = [];
  let inString = false;
  let escape = false;
  for (const ch of s) {
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (inString) s += '"';
  for (let i = stack.length - 1; i >= 0; i--) s += stack[i] === '{' ? '}' : ']';

  try {
    return JSON.parse(s);
  } catch {
    try {
      return JSON.parse(s.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

/**
 * Extract and parse a JSON object out of an LLM response.
 * Handles markdown fences and surrounding prose; falls back to repairing
 * responses truncated mid-JSON by the token limit.
 */
function parseLLMJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text.match(/\{[\s\S]*/)?.[0];
  if (!candidate) throw new Error('No JSON found in response');
  try {
    return JSON.parse(candidate);
  } catch {
    const repaired = repairTruncatedJson(candidate);
    if (repaired) return repaired;
    throw new Error('Invalid JSON in response');
  }
}

/**
 * Run a one-shot JSON-producing Groq task with a single strict retry
 * when the model returns unparseable output.
 */
async function groqJsonTask(prompt, { temperature = 0.3, maxTokens = 2000, maxAttempts = 2 } = {}) {
  let analysisText = '';
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await groqChat(
      [
        {
          role: 'user',
          content:
            prompt +
            (attempt === 1 ? '\n\nIMPORTANT: Your previous response was not valid JSON. Respond ONLY with the raw JSON object.' : '')
        }
      ],
      { temperature, maxTokens }
    );
    analysisText = response.choices?.[0]?.message?.content || '';
    if (!analysisText.trim()) {
      // Usually means reasoning consumed the whole token budget
      console.warn('Groq returned EMPTY content (attempt %d) — max_tokens may be too low', attempt + 1);
      continue;
    }
    try {
      return parseLLMJson(analysisText);
    } catch {
      continue;
    }
  }
  throw new Error('Failed to produce valid JSON');
}

const RESUME_ANALYSIS_PROMPT = (resumeText, targetRole, experienceLevel) =>
  `You are an expert resume analyst, ATS (Applicant Tracking System) specialist, and technical recruiter. Perform a deep analysis of the resume below.

TARGET ROLE: ${targetRole}
EXPERIENCE LEVEL: ${experienceLevel}

RESUME TEXT:
${resumeText}

Respond ONLY with valid JSON (no additional text) matching this exact schema:
{
  "candidateName": "Extracted candidate name from resume, or 'Unknown' if not found",
  "atsScore": <number 0-100, how well the resume would pass ATS systems>,
  "keywordMatch": <number 0-100, relevance of keywords to the target role>,
  "formatScore": <number 0-100, quality of resume structure and formatting>,
  "overallScore": <number 0-100, weighted average of all scores>,
  "verdict": "One-sentence overall verdict of this resume for the target role",
  "targetRole": "${targetRole}",
  "experienceLevel": "${experienceLevel}",
  "contactInfo": {
    "email": "email found in resume or empty string",
    "phone": "phone number found or empty string",
    "linkedin": "linkedin URL or username or empty string",
    "github": "github URL or username or empty string",
    "portfolio": "portfolio/website URL or empty string"
  },
  "extractedSkills": ["skill1", "skill2", "...up to 15 most relevant skills"],
  "education": ["Degree/Certification 1", "Degree/Certification 2"],
  "certifications": ["Certification 1", "Certification 2"],
  "wordCount": <total word count of the resume text>,
  "missingKeywords": ["keyword expected for a ${targetRole} role but ABSENT from this resume", "...up to 10"],
  "experienceSummary": "Brief 1-2 sentence summary of the candidate's experience",
  "experience": [
    {
      "company": "Company name",
      "title": "Job title",
      "startDate": "MM/YYYY or 'Unknown'",
      "endDate": "MM/YYYY, 'Present', or 'Unknown'",
      "duration": "e.g. '2 yrs 3 mos' — compute from dates, or 'Unknown'"
    }
  ],
  "sections": [
    { "name": "Contact/Header", "present": true, "wordCount": <number>, "score": <0-100>, "feedback": "one short sentence" },
    { "name": "Professional Summary", "present": true, "wordCount": <number>, "score": <0-100>, "feedback": "one short sentence" },
    { "name": "Work Experience", "present": true, "wordCount": <number>, "score": <0-100>, "feedback": "one short sentence" },
    { "name": "Education", "present": true, "wordCount": <number>, "score": <0-100>, "feedback": "one short sentence" },
    { "name": "Skills", "present": true, "wordCount": <number>, "score": <0-100>, "feedback": "one short sentence" },
    { "name": "Projects", "present": false, "wordCount": 0, "score": 0, "feedback": "one short sentence" }
  ],
  "bulletAnalysis": {
    "totalBullets": <number of achievement/bullet points found>,
    "quantifiedBullets": <bullets containing numbers, %, metrics, or dollar amounts>,
    "actionVerbScore": <0-100: how consistently bullets start with strong action verbs>,
    "weakPhrases": ["weak phrase found, e.g. 'responsible for'", "'worked on'"]
  },
  "suggestedBullets": [
    {
      "original": "the weakest original bullet copied verbatim from the resume",
      "rewritten": "stronger version with action verb + quantified impact",
      "reason": "why this rewrite is stronger (one sentence)"
    }
  ],
  "strengths": ["Specific strength 1", "Specific strength 2", "Specific strength 3", "Specific strength 4"],
  "improvements": ["Specific improvement suggestion 1", "Specific improvement suggestion 2", "Specific improvement suggestion 3", "Specific improvement suggestion 4"],
  "criticalIssues": ["Critical issue 1", "Critical issue 2", "Critical issue 3"],
  "skillsDistribution": {
    "technical": <number, percentage of technical/hard skills>,
    "softSkills": <number, percentage of soft/interpersonal skills>,
    "tools": <number, percentage of tools/platforms/frameworks>,
    "languages": <number, percentage of programming/spoken languages>
  }
}

Guidelines:
- BE CONCISE: every string field must be short. feedback/suggestion/reason strings under 15 words each
- Output budget matters: keep the whole JSON compact so it never gets truncated
- contactInfo: extract ONLY what is literally present; use "" for anything missing. Never invent values
- experience: list ALL work entries found, most recent first. If dates are missing use 'Unknown'. Do NOT fabricate entries
- sections: audit these six sections exactly (Contact/Header, Professional Summary, Work Experience, Education, Skills, Projects). Set present=false, wordCount=0, score=0 when a section is absent
- bulletAnalysis: count bullets across all roles. weakPhrases should quote actual phrases found (max 4), e.g. "responsible for", "helped with", "worked on"
- suggestedBullets: pick the 4 WEAKEST bullets (unquantified, passive, vague) and rewrite them concretely with strong verbs and quantified impact where plausible. Keep rewrites truthful to what the bullet says — do not invent achievements that are not implied by the original
- atsScore: ATS compatibility based on keyword usage, formatting, section structure, and standard headings
- keywordMatch: how well the resume keywords align with the target role "${targetRole}"
- missingKeywords: concrete skills/tools/qualifications a recruiter for "${targetRole}" expects but that do NOT appear anywhere in the resume. Max 10, most important first
- wordCount: approximate total words in RESUME TEXT
- formatScore: structure, readability, consistent formatting, proper sections
- overallScore: weighted average (ATS 40%, Keywords 35%, Format 25%)
- strengths: 3-5 specific positive observations from actual content
- improvements: 3-5 actionable suggestions for the target role
- criticalIssues: 2-4 issues that could cause ATS rejection or poor impression
- skillsDistribution: must sum to 100
- Keep every string concise. Base everything strictly on the actual resume content provided`;

/**
 * Validates the v2 resume analysis payload returned by the LLM.
 * Throws when a required core field is missing or malformed.
 */
function validateResumeAnalysis(a) {
  const isNum = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
  if (!a || typeof a !== 'object') throw new Error('not an object');
  for (const key of ['atsScore', 'keywordMatch', 'formatScore', 'overallScore']) {
    if (!isNum(a[key])) throw new Error(`missing/invalid ${key}`);
  }
  if (!Array.isArray(a.extractedSkills)) throw new Error('extractedSkills must be an array');
  if (typeof a.candidateName !== 'string') throw new Error('candidateName missing');
  return true;
}

// POST /api/ai/resume-analyze — ATS analysis runs server-side
router.post('/resume-analyze', async (req, res) => {
  const { resumeText, targetRole, experienceLevel, jobDescription } = req.body;

  if (
    !resumeText ||
    typeof resumeText !== 'string' ||
    resumeText.length < 50 ||
    resumeText.length > 60000
  ) {
    return res.status(400).json({ error: 'resumeText must be a string between 50 and 60000 characters' });
  }

  const safeRole = String(targetRole || 'Software Engineer').slice(0, 120);
  const safeLevel = String(experienceLevel || 'Mid-Level').slice(0, 60);
  // Optional job description — when present, keyword matching targets THIS JD
  const safeJd =
    typeof jobDescription === 'string' && jobDescription.trim().length >= 30
      ? jobDescription.trim().slice(0, 3000)
      : null;

  // Free-tier Groq allows only ~8000 tokens/min per request.
  // Cap the resume to ~12k chars (~3k tokens) and output to 2400 tokens
  // so prompt + completion always fit inside the window.
  const MAX_RESUME_CHARS = 12000;
  const trimmedResume =
    resumeText.length > MAX_RESUME_CHARS
      ? resumeText.slice(0, MAX_RESUME_CHARS)
      : resumeText;

  const isRateLimit = (err) =>
    err && (err.status === 413 || err.status === 429 || err.code === 'rate_limit_exceeded');

  // When a JD is supplied, keywordMatch + missingKeywords target it exactly
  const jdBlock = safeJd
    ? `\n\nJOB DESCRIPTION TO MATCH (keywordMatch and missingKeywords MUST be computed against THIS text, not generic role expectations):\n---\n${safeJd}\n---`
    : '';

  try {
    let lastError = null;
    const startedAt = Date.now();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const prompt =
          RESUME_ANALYSIS_PROMPT(trimmedResume, safeRole, safeLevel) +
          jdBlock +
          (attempt === 1 ? '\n\nIMPORTANT: Your previous response was not valid JSON. Respond ONLY with the raw JSON object.' : '');
        const analysis = await groqJsonTask(prompt, { temperature: 0.3, maxTokens: 4000, maxAttempts: 2 });
        validateResumeAnalysis(analysis);
        console.log(`Resume analyze OK in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (attempt ${attempt + 1})`);
        return res.json(analysis);
      } catch (err) {
        // Rate limits won't heal on an immediate retry — bail out fast
        if (isRateLimit(err)) {
          console.error('Resume analyze rate-limited:', err.message);
          return res.status(413).json({
            error:
              'The resume is too large for the free AI tier right now. Please try again in a minute.'
          });
        }
        // Retry on invalid JSON or invalid shape; keep last error for reporting
        lastError = err;
        continue;
      }
    }
    console.error('Resume analyze error:', lastError ? lastError.message : 'unknown');
    return res.status(502).json({ error: 'Failed to produce a valid analysis' });
  } catch (err) {
    console.error('Resume analyze error:', err.message);
    return res.status(502).json({ error: 'AI provider request failed' });
  }
});

// GET /api/ai/stt-token — mints a short-lived Deepgram access token for live transcription
router.get('/stt-token', async (req, res) => {
  if (!process.env.DEEPGRAM_API_KEY) {
    return res.status(500).json({ error: 'Speech service is not configured' });
  }

  try {
    // POST /v1/auth/grant — temporary JWT (default TTL 30s, max 3600)
    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ttl_seconds: 60 })
    });

    if (!response.ok) {
      throw new Error(`Deepgram grant endpoint returned ${response.status}`);
    }

    const data = await response.json();
    res.json({ accessToken: data.access_token, expiresIn: data.expires_in });
  } catch (err) {
    console.error('Deepgram token error:', err.message);
    res.status(502).json({ error: 'Failed to mint speech token' });
  }
});

// POST /api/ai/transcribe — prerecorded transcription runs server-side (raw audio body)
router.post(
  '/transcribe',
  express.raw({ type: () => true, limit: '25mb' }),
  async (req, res) => {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: 'Audio body is required' });
    }

    if (!process.env.DEEPGRAM_API_KEY) {
      return res.status(500).json({ error: 'Speech service is not configured' });
    }

    try {
      const dgResponse = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&punctuate=true',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
            'Content-Type': req.headers['content-type'] || 'audio/webm'
          },
          body: req.body
        }
      );

      if (!dgResponse.ok) {
        throw new Error(`Deepgram listen endpoint returned ${dgResponse.status}`);
      }

      const data = await dgResponse.json();
      const transcript =
        data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      res.json({ transcript });
    } catch (err) {
      console.error('Transcribe error:', err.message);
      res.status(502).json({ error: 'Failed to transcribe audio' });
    }
  }
);

// POST /api/ai/interview-analyze — scores an interview transcript server-side
router.post('/interview-analyze', async (req, res) => {
  const { transcript, targetRole } = req.body;

  if (!transcript || typeof transcript !== 'string' || transcript.length < 20 || transcript.length > 60000) {
    return res.status(400).json({ error: 'transcript must be a string between 20 and 60000 characters' });
  }

  const safeRole = String(targetRole || '').slice(0, 120);

  const prompt = `You are an expert interview analyst. Analyze the following interview transcript and provide a detailed assessment.
${safeRole ? `\nTARGET ROLE: ${safeRole}` : ''}

INTERVIEW TRANSCRIPT:
${transcript}

Please provide a comprehensive analysis in the following JSON format (respond ONLY with valid JSON, no additional text):
{
  "role": "Identified role/position being interviewed for",
  "confidenceScore": <number 0-100>,
  "contentScore": <number 0-100>,
  "overallScore": <number 0-100>,
  "strengths": ["Strength point 1", "Strength point 2", "Strength point 3"],
  "improvements": ["Improvement area 1", "Improvement area 2", "Improvement area 3"],
  "rejectionReasons": ["Potential rejection reason 1", "Potential rejection reason 2", "Potential rejection reason 3"],
  "performanceBreakdown": {
    "technicalSkills": <number 0-100>,
    "communication": <number 0-100>,
    "problemSolving": <number 0-100>,
    "confidence": <number 0-100>
  },
  "skillsAssessment": {
    "technical": <number 0-100>,
    "communication": <number 0-100>,
    "leadership": <number 0-100>,
    "problemSolving": <number 0-100>,
    "adaptability": <number 0-100>,
    "teamwork": <number 0-100>
  },
  "questionScores": [
    {
      "question": "The interviewer's question, condensed",
      "answerSummary": "One-line summary of the candidate's answer",
      "score": <number 0-10 for this individual answer>,
      "rationale": "One sentence: what earned or lost points",
      "category": "technical" | "scenario" | "behavioral" | "background"
    }
  ]
}

Guidelines:
- confidenceScore: Communication clarity, confidence, articulation (0-100)
- contentScore: Relevance, depth, technical accuracy of answers (0-100)
- overallScore: Average of confidence and content scores
- strengths: 3-5 specific positive observations
- improvements: 3-5 specific areas needing development
- rejectionReasons: 3-5 potential reasons that could lead to rejection
- performanceBreakdown and skillsAssessment: detailed 0-100 sub-scores
- questionScores: grade EACH interviewer question + candidate answer pair individually on 0-10. Be strict — vague answers get low scores. Max 10 entries
- Ensure all scores are realistic numbers between 0-100
- Base analysis strictly on the actual transcript content`;

  try {
    const analysis = await groqJsonTask(prompt, { temperature: 0.3, maxTokens: 3000 });
    return res.json(analysis);
  } catch (err) {
    console.error('Interview analyze error:', err.message);
    return res.status(502).json({ error: 'AI provider request failed' });
  }
});

// ── Resume+ AI tools ────────────────────────────────────────────────────
const isGroqRateLimit = (err) =>
  err && (err.status === 413 || err.status === 429 || err.code === 'rate_limit_exceeded');

function guardResumeToolInput(res, text, min = 50, max = 20000) {
  if (!text || typeof text !== 'string' || text.length < min || text.length > max) {
    res.status(400).json({ error: `input must be a string between ${min} and ${max} characters` });
    return false;
  }
  return true;
}

async function groqTextTask(prompt, { maxTokens = 1500, temperature = 0.6 } = {}) {
  try {
    const completion = await groqChat([{ role: 'user', content: prompt }], { temperature, maxTokens });
    return completion.choices?.[0]?.message?.content?.trim() || '';
  } catch (err) {
    if (isGroqRateLimit(err)) throw Object.assign(new Error('RATE_LIMIT'), { rateLimited: true });
    throw err;
  }
}

// POST /api/ai/cover-letter — generates a tailored cover letter
router.post('/cover-letter', async (req, res) => {
  const { resumeText, targetRole, jobDescription, companyName } = req.body;
  if (!guardResumeToolInput(res, resumeText)) return;

  const safeRole = String(targetRole || '').slice(0, 120);
  if (!safeRole) return res.status(400).json({ error: 'targetRole is required' });
  const safeJd = typeof jobDescription === 'string' ? jobDescription.slice(0, 3000) : '';
  const safeCompany = String(companyName || 'your company').slice(0, 80);

  try {
    const letter = await groqTextTask(
      `Write a professional cover letter for the role of ${safeRole} at ${safeCompany}.
Keep it under 300 words. Use a confident but not arrogant tone. Do NOT invent experience that is not in the resume.
${safeJd ? `Tailor it to this job description:\n${safeJd}\n` : ''}
RESUME:
${resumeText.slice(0, 8000)}

Respond with ONLY the cover letter body (no subject line, no placeholder brackets like [Company] — use "${safeCompany}" or generic phrasing).`,
      { maxTokens: 900, temperature: 0.65 }
    );
    if (!letter) throw new Error('Empty response');
    res.json({ letter });
  } catch (err) {
    if (err.rateLimited) {
      return res.status(413).json({ error: 'AI tier limit hit — try again in a minute.' });
    }
    console.error('Cover letter error:', err.message);
    res.status(502).json({ error: 'Failed to generate cover letter' });
  }
});

// POST /api/ai/improve-resume — full rewrite applying the analysis suggestions
router.post('/improve-resume', async (req, res) => {
  const { resumeText, targetRole, missingKeywords } = req.body;
  if (!guardResumeToolInput(res, resumeText)) return;

  const safeRole = String(targetRole || '').slice(0, 120);
  if (!safeRole) return res.status(400).json({ error: 'targetRole is required' });
  const kwList = Array.isArray(missingKeywords)
    ? missingKeywords.slice(0, 10).map((k) => String(k).slice(0, 60)).filter(Boolean)
    : [];

  try {
    const improved = await groqTextTask(
      `Rewrite the resume below to maximize its impact for a ${safeRole} position.

Rules:
- Keep every fact truthful: do NOT invent employers, dates, degrees, or achievements that are not implied by the original
- Strengthen bullet points with strong action verbs and plausible quantification where the source implies it
- Use clean ALL-CAPS section headings: SUMMARY, SKILLS, EXPERIENCE, PROJECTS (if any), EDUCATION, CERTIFICATIONS (if any)
${kwList.length ? `- Naturally weave in these currently-missing keywords where the candidate's background plausibly supports them: ${kwList.join(', ')}` : ''}
- Plain text output only, no markdown formatting

RESUME:
${resumeText.slice(0, 8000)}

Respond with ONLY the rewritten resume text.`,
      { maxTokens: 1800, temperature: 0.5 }
    );
    if (!improved) throw new Error('Empty response');
    res.json({ improvedResume: improved });
  } catch (err) {
    if (err.rateLimited) {
      return res.status(413).json({ error: 'AI tier limit hit — try again in a minute.' });
    }
    console.error('Improve resume error:', err.message);
    res.status(502).json({ error: 'Failed to generate improved resume' });
  }
});

// POST /api/ai/skill-recommendations — learning path for missing keywords
router.post('/skill-recommendations', async (req, res) => {
  const { missingKeywords, targetRole } = req.body;

  const skills = Array.isArray(missingKeywords)
    ? missingKeywords.slice(0, 10).map((k) => String(k).slice(0, 60)).filter(Boolean)
    : [];
  if (skills.length === 0) {
    return res.json({ recommendations: [] });
  }

  const safeRole = String(targetRole || '').slice(0, 120);

  try {
    const raw = await groqJsonTask(
      `For each skill below, recommend ONE concrete way to learn it, tailored to landing a ${safeRole} job.
Prefer well-known free/cheap resources (official docs, freeCodeCamp, Coursera, YouTube channels, documentation).
Be specific (name the actual course/resource type), one short sentence each.

SKILLS: ${skills.join(', ')}

Respond ONLY with valid JSON:
{"recommendations": [{"skill": "<skill>", "recommendation": "<one sentence>"}]}`,
      { temperature: 0.4, maxTokens: 800 }
    );
    const recs = Array.isArray(raw.recommendations) ? raw.recommendations.slice(0, 10) : [];
    res.json({ recommendations: recs });
  } catch (err) {
    console.error('Skill recommendation error:', err.message);
    res.status(502).json({ error: 'Failed to generate recommendations' });
  }
});

// POST /api/ai/resume-interview-questions — predicts what recruiters will probe
router.post('/resume-interview-questions', async (req, res) => {
  const { missingKeywords, targetRole, weakBullets } = req.body;

  const skills = Array.isArray(missingKeywords)
    ? missingKeywords.slice(0, 10).map((k) => String(k).slice(0, 60)).filter(Boolean)
    : [];
  const bullets = Array.isArray(weakBullets)
    ? weakBullets.slice(0, 5).map((b) => String(b).slice(0, 200)).filter(Boolean)
    : [];

  if (skills.length === 0 && bullets.length === 0) {
    return res.json({ questions: [] });
  }

  const safeRole = String(targetRole || '').slice(0, 120);

  try {
    const raw = await groqJsonTask(
      `You are a technical recruiter preparing to interview a candidate for ${safeRole || 'the role'}.
Based ONLY on the resume gaps below, predict the ${Math.min(Math.max(skills.length, 4), 8)} toughest questions this candidate should prepare for.
Mix direct grills on each missing skill with questions probing the weak bullet points.

MISSING SKILLS: ${skills.join(', ') || 'none'}
WEAK BULLETS: ${bullets.join(' | ') || 'none'}

Respond ONLY with valid JSON:
{"questions": [{"question": "<interview question>", "why": "<one sentence: what this tests>", "difficulty": "easy|medium|hard"}]}`,
      { temperature: 0.5, maxTokens: 1200 }
    );
    const questions = Array.isArray(raw.questions) ? raw.questions.slice(0, 8) : [];
    res.json({ questions });
  } catch (err) {
    if (isGroqRateLimit(err)) {
      return res.status(413).json({ error: 'AI tier limit hit — try again in a minute.' });
    }
    console.error('Question predictor error:', err.message);
    res.status(502).json({ error: 'Failed to generate predicted questions' });
  }
});

module.exports = router;
