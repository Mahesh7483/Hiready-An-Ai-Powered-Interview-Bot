import { apiJson } from "./api";

export interface AssessmentSectionDTO {
  index: number;
  type: "aptitude" | "coding" | "voice-interview";
  title: string;
  minutes: number;
  topic: string;
  state: {
    questionIds?: string[];
    optionOrder?: Record<string, string[]>;
    count?: number;
    codingQuestionIds?: string[];
    focusAreas?: string[];
    durationMin?: number;
  };
}

export interface AttemptDTO {
  _id: string;
  templateId: string;
  templateTitle: string;
  status: "not_started" | "in_break" | "in_progress" | "completed" | "auto_submitted" | "expired";
  currentSectionIndex: number;
  sections: AssessmentSectionDTO[];
  sectionStartedAt: string | null;
  breakEndsAt: string | null;
  violationScore: number;
  violationThreshold: number;
  sectionResults: Array<{
    sectionIndex: number;
    type: string;
    score: number;
    maxScore: number;
  }>;
  startedAt: string;
  completedAt: string | null;
}

export interface TemplateDTO {
  _id: string;
  title: string;
  description: string;
  targetRole: string;
  sections: Array<{ type: string; title?: string; count?: number; minutes: number; topic?: string }>;
  breaks: Array<{ afterSectionIndex: number; minutes: number }>;
  resumeDriven: boolean;
  attemptLimit: number;
  cooldownDays: number;
  violationThreshold: number;
}

export const assessmentAPI = {
  getTemplates: () => apiJson<{ templates: TemplateDTO[] }>("/assessment/templates"),

  start: (templateId: string) =>
    apiJson<{ attempt: AttemptDTO; resumed: boolean }>(`/assessment/start/${templateId}`, { method: "POST" }),

  current: () => apiJson<{ attempt: AttemptDTO | null; expired?: boolean }>("/assessment/attempt/current"),

  submitSection: (
    attemptId: string,
    sectionIndex: number,
    body: Record<string, unknown>
  ) =>
    apiJson<{ attempt: AttemptDTO }>(`/assessment/attempt/${attemptId}/section/${sectionIndex}/submit`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  endBreak: (attemptId: string) =>
    apiJson<{ attempt: AttemptDTO }>(`/assessment/attempt/${attemptId}/break/end`, { method: "POST" }),

  faceCheck: (attemptId: string, snapshot: string | null) =>
    apiJson<{ ok: boolean; sectionIndex: number; withSnapshot: boolean }>(
      `/assessment/attempt/${attemptId}/face-check`,
      { method: "POST", body: JSON.stringify({ snapshot }) }
    ),

  reportViolation: (attemptId: string, type: string) =>
    apiJson<{ violationScore: number; threshold: number; autoSubmitted: boolean }>(
      `/assessment/attempt/${attemptId}/violation`,
      { method: "POST", body: JSON.stringify({ type }) }
    ),

  report: (attemptId: string) =>
    apiJson<{
      template: TemplateDTO;
      attempt: AttemptDTO;
      summary: { totalScore: number; maxScore: number; pct: number; violationScore: number; status: string };
    }>(`/assessment/attempt/${attemptId}/report`),

  getCodingQuestion: (id: string) =>
    apiJson<{
      _id: string;
      title: string;
      description: string;
      difficulty: string;
      constraints: string;
      starterCode: Record<string, string>;
      testCases: Array<{ input: string; output: string }>;
    }>(`/assessment/coding-question/${id}`),

  // Admin
  createTemplate: (payload: Record<string, unknown>) =>
    apiJson<TemplateDTO>("/assessment/templates", { method: "POST", body: JSON.stringify(payload) }),
  adminAttempts: (templateId?: string) =>
    apiJson<{ attempts: Array<Record<string, unknown>> }>(
      `/assessment/admin/attempts${templateId ? `?templateId=${templateId}` : ""}`
    ),
};