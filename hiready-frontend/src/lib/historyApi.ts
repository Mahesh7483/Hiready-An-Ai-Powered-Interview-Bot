import { apiJson, getAuthHeaders, API_BASE_URL } from "./api";

// ── Resume analysis history ────────────────────────────────────────────
export interface ResumeHistoryItem {
  _id: string;
  label?: string;
  targetRole: string;
  experienceLevel: string;
  atsScore: number;
  keywordMatch: number;
  formatScore: number;
  overallScore: number;
  createdAt: string;
  missingKeywords?: string[];
}

export async function saveResumeAnalysis(payload: {
  label?: string;
  targetRole: string;
  experienceLevel: string;
  resultJson: unknown;
  sourceText?: string;
}): Promise<string | null> {
  const res = await fetch(`${API_BASE_URL}/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.id ?? null;
}

export async function renameResumeAnalysis(id: string, label: string): Promise<boolean> {
  try {
    await apiJson(`/resumes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function fetchResumeHistory(limit = 50): Promise<ResumeHistoryItem[]> {
  const data = await apiJson<{ items: ResumeHistoryItem[] }>(
    `/resumes?limit=${limit}`
  );
  return data.items ?? [];
}

export async function fetchResumeAnalysis(id: string): Promise<{
  resultJson?: Record<string, unknown>;
  sourceText?: string;
  label?: string;
  [key: string]: unknown;
}> {
  return apiJson(`/resumes/${id}`);
}

export async function deleteResumeAnalysis(id: string): Promise<boolean> {
  try {
    await apiJson(`/resumes/${id}`, { method: "DELETE" });
    return true;
  } catch {
    return false;
  }
}

// ── Interview session history ──────────────────────────────────────────
export interface InterviewSessionSummary {
  _id: string;
  sessionId: string;
  role: string;
  experienceLevel: string;
  mode: "assessment" | "practice";
  durationSeconds: number;
  integrity?: { violations: number; maxViolations: number; terminated: boolean };
  analyzedAt: string | null;
  createdAt: string;
}

export interface ConversationTurn {
  role: "interviewer" | "user";
  text: string;
}

export async function saveInterviewSession(payload: {
  sessionId: string;
  role: string;
  experienceLevel: string;
  jobDescription?: string;
  mode?: "assessment" | "practice";
  durationSeconds?: number;
  conversationLog: ConversationTurn[];
  integrity?: { violations: number; maxViolations: number; terminated: boolean };
  metricsJson?: unknown;
  interviewType?: "technical" | "behavioral";
}): Promise<string | null> {
  const res = await fetch(`${API_BASE_URL}/interviews/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.id ?? null;
}

export async function attachInterviewAnalysis(
  id: string,
  analysisJson: unknown
): Promise<void> {
  await fetch(`${API_BASE_URL}/interviews/sessions/${id}/analysis`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ analysisJson }),
  }).catch(() => {});
}

export async function fetchInterviewSessions(
  limit = 50
): Promise<InterviewSessionSummary[]> {
  const data = await apiJson<{ items: InterviewSessionSummary[] }>(
    `/interviews/sessions?limit=${limit}`
  );
  return data.items ?? [];
}

export async function fetchInterviewSession(id: string): Promise<{
  conversationLog: ConversationTurn[];
  role: string;
  experienceLevel: string;
  integrity?: { violations: number; maxViolations: number; terminated: boolean };
  durationSeconds: number;
  analysisJson?: unknown;
}> {
  return apiJson(`/interviews/sessions/${id}`);
}

export async function deleteInterviewSession(id: string): Promise<boolean> {
  try {
    await apiJson(`/interviews/sessions/${id}`, { method: "DELETE" });
    return true;
  } catch {
    return false;
  }
}

export interface InterviewSummaryStats {
  totalSessions: number;
  avgDurationSeconds: number;
  terminatedCount: number;
  sessionsLast30Days: number;
  practiceCount: number;
}

export async function fetchInterviewSummary(): Promise<InterviewSummaryStats> {
  return apiJson<InterviewSummaryStats>(`/interviews/sessions/summary`);
}

