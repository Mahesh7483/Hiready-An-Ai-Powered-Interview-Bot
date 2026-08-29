import { apiFetch } from "./api";

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  firebaseUid?: string | null;
  createdAt?: string;
  testCount?: number;
}

export interface AdminQuestion {
  _id: string;
  Question: string;
  "Option A": string | number;
  "Option B": string | number;
  "Option C": string | number;
  "Option D": string | number;
  Answer: "A" | "B" | "C" | "D";
  category: string;
  difficulty?: string | null;
}

export interface AdminTestResult {
  _id: string;
  userId: string;
  user?: { name?: string; email?: string } | null;
  mode: string;
  score: number;
  totalQuestions: number;
  topic: string;
  difficulty?: string | null;
  timeTaken?: string;
  warningCount: number;
  createdAt: string;
  selectedAnswers: Array<{
    questionId: string;
    selected: string;
    correctAnswer: string;
    isCorrect: boolean;
  }>;
}

export interface AdminProctorLog {
  id: string;
  event: string;
  sessionId: string;
  timestamp: string;
  receivedAt: string;
  hasSnapshot?: boolean;
  user?: { name?: string; email?: string } | null;
}

export interface AdminInterviewSession {
  _id: string;
  sessionId: string;
  role: string;
  experienceLevel: string;
  mode: string;
  durationSeconds: number;
  integrity?: { violations: number; maxViolations: number; terminated: boolean };
  createdAt: string;
  user?: { name?: string; email?: string } | null;
}

interface Paged<T> {
  page: number;
  pages: number;
  total: number;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const adminAPI = {
  me: () => getJson<{ _id: string; name: string; email: string; role: string }>("/admin/me"),

  getOverview: () =>
    getJson<{
      totals: { users: number; newUsers30d: number; questions: number; tests: number; tests7d: number };
      avgScorePct: number;
      questionsByCategory: Array<{ category: string; count: number }>;
      violationEvents: Array<{ event: string; count: number }>;
      testsOverTime: Array<{ date: string; count: number }>;
    }>("/admin/overview"),

  getUsers: (params: { page?: number; limit?: number; search?: string; role?: string }) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.search) qs.set("search", params.search);
    if (params.role && params.role !== "all") qs.set("role", params.role);
    return getJson<Paged<AdminUser> & { users: AdminUser[] }>(`/admin/users?${qs}`);
  },

  getUserDetail: (id: string) =>
    getJson<{
      user: AdminUser & { experienceLevel?: string };
      results: AdminTestResult[];
      logs: Array<{ event: string; sessionId: string; timestamp: string }>;
    }>(`/admin/users/${id}`),

  setUserRole: (id: string, role: "user" | "admin") =>
    sendJson<{ message: string; user: AdminUser }>(`/admin/users/${id}/role`, "PUT", { role }),

  deleteUser: (id: string) => sendJson<{ message: string }>(`/admin/users/${id}`, "DELETE"),

  // Base64 JPEG data URI for a proctor-log evidence snapshot
  getProctorSnapshot: (id: string) => getJson<{ snapshot: string }>(`/admin/proctor-logs/${id}/snapshot`),

  getQuestions: (params: { page?: number; limit?: number; category?: string; difficulty?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.category && params.category !== "all") qs.set("category", params.category);
    if (params.difficulty && params.difficulty !== "all") qs.set("difficulty", params.difficulty);
    if (params.search) qs.set("search", params.search);
    return getJson<Paged<AdminQuestion> & { questions: AdminQuestion[] }>(`/admin/questions?${qs}`);
  },

  createQuestion: (q: Omit<AdminQuestion, "_id">) =>
    sendJson<AdminQuestion>("/admin/questions", "POST", q),

  updateQuestion: (id: string, q: Omit<AdminQuestion, "_id">) =>
    sendJson<AdminQuestion>(`/admin/questions/${id}`, "PUT", q),

  deleteQuestion: (id: string) => sendJson<{ message: string }>(`/admin/questions/${id}`, "DELETE"),

  bulkImportQuestions: (payload: { items?: unknown[]; csv?: string; dryRun?: boolean }) =>
    sendJson<{ imported: number; failed: number; errors: Array<{ row: number; error: string }> }>(
      "/admin/questions/bulk",
      "POST",
      payload
    ),

  getResults: (params: { page?: number; limit?: number; mode?: string; topic?: string; userId?: string }) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.mode && params.mode !== "all") qs.set("mode", params.mode);
    if (params.topic && params.topic !== "all") qs.set("topic", params.topic);
    if (params.userId) qs.set("userId", params.userId);
    return getJson<Paged<AdminTestResult> & { results: AdminTestResult[] }>(`/admin/results?${qs}`);
  },

  getProctorLogs: (params: { page?: number; limit?: number; event?: string; sessionId?: string }) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.event && params.event !== "all") qs.set("event", params.event);
    if (params.sessionId) qs.set("sessionId", params.sessionId);
    return getJson<Paged<AdminProctorLog> & { eventTypes: string[]; logs: AdminProctorLog[] }>(
      `/admin/proctor-logs?${qs}`
    );
  },

  getSnapshot: async (logId: string): Promise<string | null> => {
    try {
      const res = await apiFetch(`/admin/proctor-logs/${logId}/snapshot`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.snapshot ?? null;
    } catch {
      return null;
    }
  },

  getInterviewSessions: (params: { page?: number; limit?: number; flagged?: boolean }) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.flagged) qs.set("flagged", "1");
    return getJson<Paged<AdminInterviewSession> & { sessions: AdminInterviewSession[] }>(
      `/admin/interview-sessions?${qs}`
    );
  },

  exportUsersCsv: async (): Promise<string> => {
    const res = await apiFetch('/admin/users/export.csv');
    if (!res.ok) throw new Error('Failed to export users');
    return res.text();
  },

  exportResultsCsv: async (params: { mode?: string; topic?: string; userId?: string } = {}): Promise<string> => {
    const qs = new URLSearchParams();
    if (params.mode && params.mode !== 'all') qs.set('mode', params.mode);
    if (params.topic && params.topic !== 'all') qs.set('topic', params.topic);
    if (params.userId) qs.set('userId', params.userId);
    const res = await apiFetch(`/admin/results/export.csv?${qs}`);
    if (!res.ok) throw new Error('Failed to export results');
    return res.text();
  },

  exportProctorLogsCsv: async (params: { event?: string; sessionId?: string } = {}): Promise<string> => {
    const qs = new URLSearchParams();
    if (params.event && params.event !== 'all') qs.set('event', params.event);
    if (params.sessionId) qs.set('sessionId', params.sessionId);
    const res = await apiFetch(`/admin/proctor-logs/export.csv?${qs}`);
    if (!res.ok) throw new Error('Failed to export proctor logs');
    return res.text();
  },
};
