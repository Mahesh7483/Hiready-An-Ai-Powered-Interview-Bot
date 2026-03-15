import Groq from "groq-sdk";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

// Configure pdf.js worker from public folder
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export interface ResumeAnalysisResult {
  candidateName: string;
  targetRole: string;
  experienceLevel: string;
  extractedSkills: string[];
  education: string[];
  experienceSummary: string;
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
}

/**
 * Extract text from a PDF file using pdfjs-dist
 */
async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(" ");
    textParts.push(pageText);
  }

  return textParts.join("\n\n");
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
 * Extract text from an uploaded resume file (PDF or DOCX)
 */
export async function extractResumeText(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    return extractTextFromPDF(file);
  } else if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
    return extractTextFromDOCX(file);
  }

  throw new Error("Unsupported file format. Please upload a PDF or DOCX file.");
}

/**
 * Analyze resume text using the Groq LLM
 */
export async function analyzeResumeWithLLM(
  resumeText: string,
  targetRole: string,
  experienceLevel: string
): Promise<ResumeAnalysisResult> {
  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
  const groq = new Groq({ apiKey: GROQ_API_KEY, dangerouslyAllowBrowser: true });

  const analysisPrompt = `You are an expert resume analyst and ATS (Applicant Tracking System) specialist. Analyze the following resume text and provide a detailed assessment.

TARGET ROLE: ${targetRole}
EXPERIENCE LEVEL: ${experienceLevel}

RESUME TEXT:
${resumeText}

Provide a comprehensive analysis in the following JSON format (respond ONLY with valid JSON, no additional text):
{
  "candidateName": "Extracted candidate name from resume, or 'Unknown' if not found",
  "targetRole": "${targetRole}",
  "experienceLevel": "${experienceLevel}",
  "extractedSkills": ["skill1", "skill2", "skill3", "...up to 15 most relevant skills"],
  "education": ["Degree/Certification 1", "Degree/Certification 2"],
  "experienceSummary": "Brief 1-2 sentence summary of the candidate's experience",
  "atsScore": <number 0-100, how well the resume would pass ATS systems>,
  "keywordMatch": <number 0-100, relevance of keywords to the target role>,
  "formatScore": <number 0-100, quality of resume structure and formatting>,
  "overallScore": <number 0-100, weighted average of all scores>,
  "strengths": [
    "Specific strength 1",
    "Specific strength 2",
    "Specific strength 3",
    "Specific strength 4"
  ],
  "improvements": [
    "Specific improvement suggestion 1",
    "Specific improvement suggestion 2",
    "Specific improvement suggestion 3",
    "Specific improvement suggestion 4"
  ],
  "criticalIssues": [
    "Critical issue 1 that needs immediate attention",
    "Critical issue 2",
    "Critical issue 3"
  ],
  "skillsDistribution": {
    "technical": <number, percentage of technical/hard skills>,
    "softSkills": <number, percentage of soft/interpersonal skills>,
    "tools": <number, percentage of tools/platforms/frameworks>,
    "languages": <number, percentage of programming/spoken languages>
  }
}

Guidelines:
- atsScore: Evaluate ATS compatibility based on keyword usage, formatting, section structure, and standard headings
- keywordMatch: How well the resume keywords align with the target role "${targetRole}"
- formatScore: Assess structure, readability, consistent formatting, and proper sections
- overallScore: Weighted average (ATS 40%, Keywords 35%, Format 25%)
- strengths: 3-5 specific positive observations from the actual resume content
- improvements: 3-5 actionable suggestions for the target role
- criticalIssues: 2-4 issues that could cause ATS rejection or poor impression
- skillsDistribution: Must sum to 100
- extractedSkills: List actual skills found in the resume
- education: List actual education/certifications found
- Base all analysis strictly on the actual resume content provided`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "user",
        content: analysisPrompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const analysisText = response.choices[0]?.message?.content || "";

  // Parse JSON response
  const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const analysis: ResumeAnalysisResult = JSON.parse(jsonMatch[0]);
    return analysis;
  }

  throw new Error("Failed to parse analysis response from LLM");
}
