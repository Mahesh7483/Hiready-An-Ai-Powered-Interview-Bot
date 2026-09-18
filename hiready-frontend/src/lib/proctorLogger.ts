import { apiFetch } from "./api";

export interface ProctorEvent {
  event: string;
  timestamp: string;
  sessionId: string;
  /** Optional webcam snapshot (base64 JPEG data URI) captured at the violation */
  snapshot?: string;
}

/**
 * Sends a proctor event to the backend.
 * Falls back silently if the backend is unreachable so the interview is not disrupted.
 */
export async function sendProctorLog(log: ProctorEvent): Promise<void> {
  try {
    // This was the only axios call in the codebase — a whole HTTP library for
    // one POST, and the one call that skipped the shared 401 handling.
    await apiFetch("/interview/proctor-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log),
    });
  } catch {
    // Silently fail — proctoring logs are best-effort and must never block the interview
    console.warn("[Proctor] Failed to send log to backend:", log.event);
  }
}
