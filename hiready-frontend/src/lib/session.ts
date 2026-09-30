/**
 * The one place the backend session is written to and cleared from storage.
 *
 * AuthContext reads localStorage once on mount. Writing the session directly
 * from a page left the context holding `user: null`, so the navigate() that
 * followed a successful email login was bounced straight back to /login by
 * ProtectedRoute. Every write now announces itself so the context re-reads.
 */
export const SESSION_EVENT = "hiready:session";

export function saveSession(token: string, user?: unknown): void {
  localStorage.setItem("token", token);
  if (user) localStorage.setItem("user", JSON.stringify(user));
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function clearSession(): void {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.dispatchEvent(new Event(SESSION_EVENT));
}
