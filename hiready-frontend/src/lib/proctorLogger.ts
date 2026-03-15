import axios from "axios";

export interface ProctorEvent {
  event: string;
  timestamp: string;
  sessionId: string;
}

const API_BASE = "http://localhost:5000/api";

/**
 * Sends a proctor event to the backend.
 * Falls back silently if the backend is unreachable so the interview is not disrupted.
 */
export async function sendProctorLog(log: ProctorEvent): Promise<void> {
  try {
    await axios.post(`${API_BASE}/interview/proctor-log`, log);
  } catch {
    // Silently fail — proctoring logs are best-effort and must never block the interview
    console.warn("[Proctor] Failed to send log to backend:", log.event);
  }
}
