import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "./api";

/**
 * Socket.io collaboration client for coding interviews (code + cursor sync).
 * The socket URL is derived from API_BASE_URL (http://host:port → ws root).
 */

export type CollabRole = "candidate" | "interviewer";

export interface CollabCursor {
  line: number;
  column: number;
  userId: string;
  name: string;
}

/** Derives the socket server root from the REST API base URL. */
function socketUrl(): string {
  return API_BASE_URL.replace(/\/api\/?$/, "");
}

/** Extracts the JWT used for socket auth (same token as REST calls). */
function authToken(): string {
  try {
    const raw = localStorage.getItem("token") || localStorage.getItem("authToken") || "";
    return raw.replace(/^Bearer\s+/i, "");
  } catch {
    return "";
  }
}

export function connectCollab(sessionId: string, role: CollabRole): Socket {
  const socket = io(socketUrl(), {
    auth: { token: authToken() },
    transports: ["websocket", "polling"],
    reconnectionAttempts: 5,
  });

  socket.on("connect", () => {
    socket.emit("coding:join", { sessionId, role });
  });

  return socket;
}

export type { Socket };