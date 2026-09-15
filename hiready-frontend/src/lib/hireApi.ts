import { apiFetch } from "./api";

/** Scopes a CandidateAccess capability can carry, mirroring the backend. */
export type HireScope = "identity" | "resume" | "assessment" | "interview";

export type IntegrityVerdict = "clean" | "flagged" | "invalidated" | "unknown";

export type PipelineStage =
  | "invited" | "started" | "completed" | "shortlisted"
  | "interviewing" | "offered" | "hired" | "rejected" | "withdrawn";

/** Stages a recruiter may move a candidate to. `withdrawn` is the candidate's. */
export const RECRUITER_STAGES: PipelineStage[] = [
  "invited", "started", "completed", "shortlisted",
  "interviewing", "offered", "hired", "rejected",
];

export interface HireJob {
  _id: string;
  title: string;
  description?: string;
  location?: string;
  templateId?: string | null;
  status: "draft" | "open" | "closed";
  createdAt: string;
  funnel?: Partial<Record<PipelineStage, number>>;
  total?: number;
}

export interface PipelineRow {
  applicationId: string;
  candidateId: string;
  stage: PipelineStage;
  source: "invite" | "search" | "apply";
  hasAttempt: boolean;
  updatedAt: string;
}

export interface Scorecard {
  candidateId: string;
  /** Null for viewer-role members — the page renders pseudonymously. */
  identity: { name: string; email: string } | null;
  assessments: Array<{
    attemptId: string;
    status: string;
    integrity: IntegrityVerdict;
    sections: Array<{
      index: number; type: string; score: number; maxScore: number; percent: number | null;
    }>;
    startedAt: string;
    completedAt: string;
  }>;
  interviews: Array<{
    sessionId: string; role: string; experienceLevel: string;
    durationSeconds: number; overallScore: number | null;
    dimensions: Record<string, number> | null; at: string;
  }>;
  resume: {
    overallScore: number; atsScore: number; keywordMatch: number;
    targetRole: string; missingKeywords: string[]; at: string;
  } | null;
  scopes: HireScope[];
}

export interface DiscoverRow {
  handle: string;
  assessmentPercent: number | null;
  assessments: number;
  lastActiveAt: string;
}

/**
 * The company a recruiter is acting as.
 *
 * A user may belong to several companies, and the server refuses rather than
 * guessing which one — so every scoped call carries x-company-id. Stored per
 * browser, never trusted: the server re-validates membership on each request.
 */
const COMPANY_KEY = "hire.companyId";

export function getActiveCompany(): string | null {
  try { return localStorage.getItem(COMPANY_KEY); } catch { return null; }
}
export function setActiveCompany(id: string | null) {
  try {
    if (id) localStorage.setItem(COMPANY_KEY, id);
    else localStorage.removeItem(COMPANY_KEY);
  } catch { /* private window — the single-company path still works */ }
}

function companyHeaders(): Record<string, string> {
  const id = getActiveCompany();
  return id ? { "x-company-id": id } : {};
}

async function get<T>(path: string): Promise<T> {
  const res = await apiFetch(path, { headers: companyHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...companyHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface CompanyMembershipRow {
  companyId: string;
  name: string;
  status: string;
  role: "owner" | "recruiter" | "viewer";
  membershipId: string;
}

export const hireAPI = {
  /** Not company-scoped: this is how the client learns which companies exist for it. */
  me: () => get<{ companies: CompanyMembershipRow[]; defaultCompanyId: string | null }>("/hire/me"),

  listJobs: () => get<{ jobs: HireJob[] }>("/hire/jobs"),
  createJob: (body: { title: string; description?: string; location?: string; templateId?: string | null }) =>
    send<HireJob>("/hire/jobs", "POST", body),
  getJob: (id: string) => get<{ job: HireJob; applications: PipelineRow[] }>(`/hire/jobs/${id}`),
  moveStage: (jobId: string, appId: string, stage: PipelineStage) =>
    send<{ applicationId: string; stage: PipelineStage; from: PipelineStage }>(
      `/hire/jobs/${jobId}/applications/${appId}`, "PATCH", { stage }
    ),

  getCandidate: (id: string) => get<Scorecard>(`/hire/candidates/${id}`),
  compare: (candidateIds: string[]) =>
    send<{ candidates: Scorecard[] }>("/hire/candidates/compare", "POST", { candidateIds }),

  listInvites: () =>
    get<{ invites: Array<{ _id: string; email: string; status: string; createdAt: string; acceptedAt: string | null; expiresAt: string }> }>("/hire/invites"),
  invite: (body: { emails: string[]; jobId?: string | null }) =>
    send<{ invited: number; invites: Array<{ inviteId: string; email: string; token: string }> }>(
      "/hire/invites", "POST", body
    ),
  revokeInvite: (id: string) => send<{ _id: string; status: string }>(`/hire/invites/${id}`, "DELETE"),

  discover: (params: { minScore?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.minScore) qs.set("minScore", String(params.minScore));
    if (params.limit) qs.set("limit", String(params.limit));
    return get<{ candidates: DiscoverRow[]; total: number }>(`/hire/discover?${qs}`);
  },
  expressInterest: (handle: string) =>
    send<{ ok: boolean; handle: string }>(`/hire/discover/${handle}/interest`, "POST"),
};

// ── Candidate-side consent ──────────────────────────────────────────────────

export interface ConsentRow {
  consentId: string;
  company: { id: string; name: string } | null;
  state: "DISCOVERABLE" | "REVEALED" | "IN_PROCESS";
  source: string;
  grantedAt: string;
  interestAt: string | null;
}

export const consentAPI = {
  mine: () => get<{ companies: ConsentRow[] }>("/consent/me"),
  previewInvite: (token: string) =>
    get<{ company: string; email: string; expiresAt: string; grants: string }>(`/consent/invite/${token}`),
  acceptInvite: (token: string) => send<{ ok: boolean; state: string }>(`/consent/invite/${token}/accept`, "POST"),
  declineInvite: (token: string) => send<{ ok: boolean }>(`/consent/invite/${token}/decline`, "POST"),
  reveal: (companyId: string) => send<{ ok: boolean; state: string }>(`/consent/${companyId}/reveal`, "POST"),
  revoke: (companyId: string) =>
    send<{ ok: boolean; state: string; note: string }>(`/consent/${companyId}`, "DELETE"),
};
