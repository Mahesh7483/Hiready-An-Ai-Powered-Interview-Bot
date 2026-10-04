import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch, apiJson, getAuthHeaders } from "@/lib/api";

/**
 * The 401 path, which nothing had ever exercised.
 *
 * apiFetch is the only place an expired session is handled: it clears the
 * stale token and sends the user to /login. Nineteen call sites used to bypass
 * it, so an expired JWT surfaced as a meaningless error toast on a page that
 * then sat there broken. A structural guard now stops new bypasses — but it
 * asserts that callers go through apiFetch, and says nothing about whether
 * apiFetch still does the thing worth going through it for.
 *
 * That is this file. If these behaviours are ever removed, routing everything
 * through the client stops buying anything and the structural guard keeps
 * passing.
 */

const setLocation = () => {
  // jsdom's window.location is not assignable; replace it with a plain object
  // so `assign` can be observed without navigating.
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { pathname: "/mastery", assign, href: "http://localhost/mastery" },
  });
  return assign;
};

const respond = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response);

describe("getAuthHeaders", () => {
  beforeEach(() => localStorage.clear());

  it("attaches a bearer token when one is stored", () => {
    localStorage.setItem("token", "abc123");
    expect(getAuthHeaders()).toEqual({ Authorization: "Bearer abc123" });
  });

  it("sends nothing at all when logged out", () => {
    // An `Authorization: Bearer null` header is worse than none: it turns a
    // logged-out request into a malformed-token request.
    expect(getAuthHeaders()).toEqual({});
  });
});

describe("apiFetch handles an expired session", () => {
  beforeEach(() => localStorage.clear());

  it("clears the token and redirects on a 401", async () => {
    localStorage.setItem("token", "expired-token");
    const assign = setLocation();
    vi.stubGlobal("fetch", respond(401));

    await apiFetch("/readiness/me");

    expect(localStorage.getItem("token")).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("does not redirect when there was no token to expire", async () => {
    // Already logged out. ProtectedRoute handles this case; redirecting from
    // here as well would fight it.
    const assign = setLocation();
    vi.stubGlobal("fetch", respond(401));

    await apiFetch("/readiness/me");

    expect(assign).not.toHaveBeenCalled();
  });

  it("never loops on the auth endpoints themselves", async () => {
    // A 401 from /auth/login is "wrong password", not "session expired".
    // Redirecting to /login from /login is an infinite bounce.
    localStorage.setItem("token", "whatever");
    const assign = setLocation();
    vi.stubGlobal("fetch", respond(401));

    await apiFetch("/auth/login", { method: "POST" });

    expect(assign).not.toHaveBeenCalled();
    expect(localStorage.getItem("token")).toBe("whatever");
  });

  it("does not redirect when already on /login", async () => {
    localStorage.setItem("token", "expired-token");
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { pathname: "/login", assign },
    });
    vi.stubGlobal("fetch", respond(401));

    await apiFetch("/readiness/me");

    expect(assign).not.toHaveBeenCalled();
  });

  it("leaves a successful response untouched", async () => {
    localStorage.setItem("token", "good-token");
    const assign = setLocation();
    vi.stubGlobal("fetch", respond(200, { ok: true }));

    const res = await apiFetch("/readiness/me");

    expect(res.status).toBe(200);
    expect(localStorage.getItem("token")).toBe("good-token");
    expect(assign).not.toHaveBeenCalled();
  });

  it("attaches the token to the outgoing request", async () => {
    localStorage.setItem("token", "good-token");
    setLocation();
    const spy = respond(200);
    vi.stubGlobal("fetch", spy);

    await apiFetch("/readiness/me");

    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer good-token",
    });
  });

  it("does not discard headers the caller supplied", async () => {
    // Content-Type is set by most POST callers; dropping it silently changes
    // how the body is parsed server-side.
    localStorage.setItem("token", "good-token");
    setLocation();
    const spy = respond(200);
    vi.stubGlobal("fetch", spy);

    await apiFetch("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer good-token",
    });
  });
});

describe("apiFetch labels a JSON body as JSON", () => {
  // fetch sends a string body as text/plain, and express.json() ignores
  // anything not labelled JSON: the route then sees an empty req.body. Six
  // callers forgot the header and shipped silently broken.
  beforeEach(() => localStorage.clear());

  const sentHeaders = async (init: RequestInit) => {
    setLocation();
    const spy = respond(200);
    vi.stubGlobal("fetch", spy);
    await apiFetch("/assessment/attempt/a1/violation", init);
    return (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
  };

  it("adds Content-Type: application/json to a string body that has none", async () => {
    const headers = await sentHeaders({ method: "POST", body: JSON.stringify({ type: "tab_switch" }) });
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("does not override a Content-Type the caller chose", async () => {
    const headers = await sentHeaders({
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    });
    expect(headers["Content-Type"]).toBe("text/plain");
  });

  it("recognises the caller's header whatever its casing, rather than adding a second", async () => {
    const headers = await sentHeaders({
      method: "POST",
      headers: { "content-type": "application/x-ndjson" },
      body: "{}",
    });
    expect(headers["content-type"]).toBe("application/x-ndjson");
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("leaves bodyless requests alone", async () => {
    const headers = await sentHeaders({ method: "POST" });
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("leaves non-string bodies to the browser, which must set their own boundary", async () => {
    // Forcing JSON onto a FormData body would destroy its multipart boundary.
    const headers = await sentHeaders({ method: "POST", body: new FormData() });
    expect(headers["Content-Type"]).toBeUndefined();
  });
});

describe("apiJson surfaces the server's message", () => {
  beforeEach(() => localStorage.clear());

  it("throws with the server's `error` field", async () => {
    setLocation();
    vi.stubGlobal("fetch", respond(400, { error: "No valid email addresses" }));
    await expect(apiJson("/hire/invites")).rejects.toThrow("No valid email addresses");
  });

  it("falls back to `message`, which is the shape authRoutes uses", async () => {
    // authRoutes answers { message } while everything else answers { error }.
    // A client reading only one of them shows "Request failed (401)" for a
    // wrong password.
    setLocation();
    vi.stubGlobal("fetch", respond(401, { message: "Invalid credentials" }));
    await expect(apiJson("/auth/login")).rejects.toThrow("Invalid credentials");
  });

  it("still throws something useful when the body is not JSON", async () => {
    setLocation();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 502,
        ok: false,
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response)
    );
    await expect(apiJson("/ai/chat")).rejects.toThrow(/502/);
  });

  it("returns the parsed body on success", async () => {
    setLocation();
    vi.stubGlobal("fetch", respond(200, { overall: 62 }));
    await expect(apiJson<{ overall: number }>("/readiness/me")).resolves.toEqual({ overall: 62 });
  });
});
