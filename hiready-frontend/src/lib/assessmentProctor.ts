import { apiJson, getAuthHeaders, API_BASE_URL } from "./api";

export type ViolationType =
  | "tab_switch"
  | "fullscreen_exit"
  | "window_blur"
  | "multiple_faces_detected"
  | "multiple_people_detected"
  | "no_face_detected"
  | "gaze_away_detected"
  | "paste_attempt"
  | "devtools_attempt"
  | "camera_permission_denied";

const DEDUPE_MS = 8000;

/**
 * Reports a weighted violation to the backend for the active assessment.
 * A resilient fire-and-forget wrapper: never throws, dedupes the same
 * violation type within a short window to avoid spamming the score.
 */
export async function reportViolationEvent(
  attemptId: string,
  type: ViolationType | string,
  opts: { dedupeMs?: number } = {}
) {
  const key = `assess-vio-${attemptId}-${type}`;
  const last = Number(sessionStorage.getItem(key) || 0);
  const now = Date.now();
  const dedupeMs = opts.dedupeMs || DEDUPE_MS;
  if (now - last < dedupeMs) return; // already reported recently

  try {
    // Try authenticated endpoint first
    await apiJson<{ violationScore: number; threshold: number; autoSubmitted: boolean }>(
      `/assessment/attempt/${attemptId}/violation`,
      { method: "POST", body: JSON.stringify({ type }) }
    );
    sessionStorage.setItem(key, String(now));
  } catch {
    // Fallback: raw fetch so a bad auth token never breaks the attempt UI
    try {
      const res = await fetch(`${API_BASE_URL}/assessment/attempt/${attemptId}/violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ type }),
      });
      if (res.ok) sessionStorage.setItem(key, String(now));
    } catch {
      /* offline — ignore */
    }
  }
}