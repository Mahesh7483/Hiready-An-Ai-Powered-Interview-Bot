import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import { API_BASE_URL, getAuthHeaders } from "./api";
import PdfWorker from "./pdfWorker?worker";

// Bundle the worker ourselves (with hex-method polyfills baked in) instead of
// loading /pdf.worker.min.mjs — keeps the worker version locked to pdfjs-dist
// and fixes "toHex is not a function" on older browsers.
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

export interface ContactInfo {
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  duration: string;
}

export interface SectionAudit {
  name: string;
  present: boolean;
  wordCount: number;
  score: number;
  feedback: string;
}

export interface BulletAnalysis {
  totalBullets: number;
  quantifiedBullets: number;
  actionVerbScore: number;
  weakPhrases: string[];
}

export interface SuggestedBullet {
  original: string;
  rewritten: string;
  reason: string;
}

export interface ResumeAnalysisResult {
  candidateName: string;
  targetRole: string;
  experienceLevel: string;
  contactInfo?: ContactInfo;
  extractedSkills: string[];
  education: string[];
  certifications?: string[];
  experienceSummary: string;
  experience?: ExperienceEntry[];
  sections?: SectionAudit[];
  bulletAnalysis?: BulletAnalysis;
  suggestedBullets?: SuggestedBullet[];
  atsScore: number;
  keywordMatch: number;
  formatScore: number;
  overallScore: number;
  strengths: string[];
  improvements: string[];
  criticalIssues: string[];
  skillsDistribution: {
    technical: number;
    softSkills: number;
    tools: number;
    languages: number;
  };
  /** One-sentence overall verdict (v2.1) */
  verdict?: string;
  /** Role keywords absent from the resume (v2.1) */
  missingKeywords?: string[];
  /** Total words in the resume text (v2.1) */
  wordCount?: number;
}

/** Error thrown when a PDF has no extractable text (scanned/image-only) */
export class ScannedResumeError extends Error {
  constructor() {
    super(
      "This looks like a scanned or image-only resume with no selectable text. Please upload a text-based PDF or DOCX."
    );
    this.name = "ScannedResumeError";
  }
}

/**
 * Extract text from a PDF file using pdfjs-dist.
 * Throws ScannedResumeError when the PDF yields (nearly) no text.
 */
async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    textParts.push(pageText);
  }

  const fullText = textParts.join("\n\n");

  // Scanned/image-only detection: essentially no text across all pages
  const avgCharsPerPage = fullText.replace(/\s+/g, "").length / Math.max(pdf.numPages, 1);
  if (fullText.replace(/\s+/g, "").length < 200 || avgCharsPerPage < 20) {
    throw new ScannedResumeError();
  }

  return fullText;
}

/**
 * Extract text from a DOCX file using mammoth
 */
async function extractTextFromDOCX(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/**
 * Extract text from an uploaded resume file (PDF, DOCX, or TXT)
 */
export async function extractResumeText(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    return extractTextFromPDF(file);
  } else if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
    return extractTextFromDOCX(file);
  } else if (fileName.endsWith(".txt")) {
    return file.text();
  }

  throw new Error("Unsupported file format. Please upload a PDF, DOCX, or TXT file.");
}

/**
 * Analyze resume text — the LLM call runs on the backend, so no API key
 * is exposed to the browser. JSON parsing, retries, and shape validation
 * happen server-side.
 */
export async function analyzeResumeWithLLM(
  resumeText: string,
  targetRole: string,
  experienceLevel: string,
  jobDescription?: string
): Promise<ResumeAnalysisResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/ai/resume-analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ resumeText, targetRole, experienceLevel, jobDescription }),
    });
  } catch {
    throw new Error(
      `Cannot reach the API server (${API_BASE_URL}). Check that the backend is running and try again.`
    );
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Analysis failed (${response.status})`);
  }

  const analysis: ResumeAnalysisResult = await response.json();

  // Basic shape validation of the parsed result
  if (
    typeof analysis.overallScore !== "number" ||
    !Array.isArray(analysis.extractedSkills)
  ) {
    throw new Error("Received a malformed analysis from the AI service");
  }

  return analysis;
}

// ── Resume+ AI tools ────────────────────────────────────────────────────

async function postAiTool<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/ai/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function generateCoverLetter(payload: {
  resumeText: string;
  targetRole: string;
  jobDescription?: string;
  companyName?: string;
}): Promise<string> {
  const data = await postAiTool<{ letter: string }>("cover-letter", payload);
  if (!data.letter) throw new Error("The AI returned an empty cover letter");
  return data.letter;
}

export async function generateImprovedResume(payload: {
  resumeText: string;
  targetRole: string;
  missingKeywords?: string[];
}): Promise<string> {
  const data = await postAiTool<{ improvedResume: string }>("improve-resume", payload);
  if (!data.improvedResume) throw new Error("The AI returned an empty resume");
  return data.improvedResume;
}

export interface SkillRecommendation {
  skill: string;
  recommendation: string;
}

export async function fetchSkillRecommendations(
  missingKeywords: string[],
  targetRole: string
): Promise<SkillRecommendation[]> {
  const data = await postAiTool<{ recommendations: SkillRecommendation[] }>(
    "skill-recommendations",
    { missingKeywords, targetRole }
  );
  return data.recommendations ?? [];
}
