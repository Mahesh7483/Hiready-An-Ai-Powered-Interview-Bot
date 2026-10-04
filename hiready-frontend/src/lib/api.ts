import { clearSession } from "./session";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/**
 * Returns auth headers for API calls that require the backend JWT.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * fetch wrapper that attaches the backend JWT when present.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) || {}),
    ...getAuthHeaders(),
  };

  // A string body is JSON in this API (every caller passes JSON.stringify(...)),
  // but fetch labels a string body `text/plain`, and express.json() skips
  // anything not labelled JSON — the handler then sees an empty req.body and
  // answers as if the caller had sent nothing. Six call sites (assessment
  // section submit, face-check, violation reports, template creation, the
  // assessment's coding submit) had forgotten the header, so this is done once
  // here rather than hoping every future caller remembers it.
  if (typeof init.body === "string" && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  // Expired/invalid JWT: clear the stale token and send the user to login.
  // Guards: never loop on auth endpoints themselves, and only redirect when
  // we actually had a token (a missing token means we're already logged out —
  // ProtectedRoute handles that case).
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    if (localStorage.getItem("token")) {
      clearSession();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    }
  }

  return res;
}

/**
 * apiFetch + JSON parsing + error surfacing. Throws Error with the
 * server's message on non-OK responses.
 */
export async function apiJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string; message?: string }).error ||
      (err as { message?: string }).message || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface AuthResponse {
  message: string;
  token?: string;
  user?: {
    _id: string;
    name: string;
    email: string;
  };
}

export const authAPI = {
  signup: async (data: SignupRequest): Promise<AuthResponse> => {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || "Signup failed");
    }

    return response.json();
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || "Login failed");
    }

    return response.json();
  },
};
