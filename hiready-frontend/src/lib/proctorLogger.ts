import axios from "axios";
import { API_BASE_URL, getAuthHeaders } from "./api";

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
    await axios.post(`${API_BASE_URL}/interview/proctor-log`, log, {
      headers: getAuthHeaders(),
    });
  } catch {
    // Silently fail — proctoring logs are best-effort and must never block the interview
    console.warn("[Proctor] Failed to send log to backend:", log.event);
  }
}
