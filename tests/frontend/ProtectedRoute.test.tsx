import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

/**
 * The first component test in this repository.
 *
 * ProtectedRoute is the gate in front of every student and recruiter page —
 * twenty-six routes — and nothing had ever rendered it. It is four lines of
 * logic, which is exactly the kind of thing that stays correct until someone
 * reorders the branches and sends half-loaded users to the login screen.
 *
 * What it does NOT do is also worth pinning: it checks that a user object
 * exists, never that the token is still valid. Server-side checks are what
 * actually protect data; this only decides what to paint. A test that implied
 * otherwise would be worse than none.
 */

const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));

const renderAt = (path = "/mastery") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/mastery"
          element={
            <ProtectedRoute>
              <div>protected content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>login screen</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("ProtectedRoute", () => {
  beforeEach(() => mockUseAuth.mockReset());

  it("renders the page for a signed-in user", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "u1", email: "a@b.c" }, loading: false });
    renderAt();
    expect(screen.getByText("protected content")).toBeInTheDocument();
  });

  it("redirects to /login when there is no user", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderAt();
    expect(screen.getByText("login screen")).toBeInTheDocument();
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  it("waits while auth is still resolving, instead of bouncing to login", () => {
    /**
     * The branch order that matters. If `loading` were checked after `user`,
     * every signed-in user would be redirected to /login for the moment before
     * their session restored — a logout flicker on every page load, and one
     * that would look like a session bug rather than a routing bug.
     */
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderAt();

    expect(screen.queryByText("login screen")).not.toBeInTheDocument();
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("does not paint the page while loading, even once a user is present", () => {
    // Rendering children mid-restore means a page fetches with a token that
    // may be about to be replaced.
    mockUseAuth.mockReturnValue({ user: { uid: "u1" }, loading: true });
    renderAt();
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });
});
