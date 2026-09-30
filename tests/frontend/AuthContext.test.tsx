import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { saveSession, clearSession } from "@/lib/session";

/**
 * Email login used to write the session straight into localStorage, which
 * AuthContext only reads on mount. The context kept `user: null`, so the
 * navigate("/mastery") after "Login successful" was bounced back to /login by
 * ProtectedRoute — every email/password user was stuck on the login page
 * until they refreshed. These pin that a session write reaches the context.
 */

vi.mock("@/lib/firebase", () => ({ auth: { currentUser: null } }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class { addScope() {} },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  // Firebase reports "no Google user" once, as it does for an email login.
  onAuthStateChanged: (_auth: unknown, cb: (u: null) => void) => {
    cb(null);
    return () => {};
  },
}));

const Probe = () => {
  const { user, loading } = useAuthContext();
  return <div>{loading ? "loading" : user ? `signed in as ${user.displayName}` : "signed out"}</div>;
};

describe("AuthContext follows the session", () => {
  beforeEach(() => localStorage.clear());

  it("picks up an email login without a page reload", () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByText("signed out")).toBeInTheDocument();

    // The shape POST /api/auth/login returns.
    act(() => saveSession("jwt", { _id: "u1", name: "Asha", email: "a@b.c", role: "user" }));

    expect(screen.getByText("signed in as Asha")).toBeInTheDocument();
  });

  it("drops the user when the session is cleared", () => {
    localStorage.setItem("token", "jwt");
    localStorage.setItem("user", JSON.stringify({ _id: "u1", name: "Asha", email: "a@b.c" }));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByText("signed in as Asha")).toBeInTheDocument();

    act(() => clearSession());

    expect(screen.getByText("signed out")).toBeInTheDocument();
  });
});
