import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * Shared setup for the component suites.
 *
 * Only files that opt in with `@vitest-environment jsdom` get a DOM; the
 * structural suites still run under node because they read the source tree
 * with fs. This file is loaded for both, so everything in it must be safe
 * without a document.
 */

/**
 * A Storage implementation, because this jsdom does not ship one.
 *
 * Verified rather than assumed: under `environment: "jsdom"` with a real
 * origin (http://localhost:8080/), `typeof document` is "object" and
 * `typeof window` is "object", while BOTH `localStorage` and
 * `window.localStorage` are undefined. That combination reads as "jsdom is
 * off" and is not — it is on, and storage is simply unimplemented.
 *
 * The app keeps its session token here, so the 401 handling in lib/api.ts
 * cannot be tested at all without it. A plain Map is enough: the code under
 * test uses getItem, setItem, removeItem and clear, and a real Storage would
 * add quota behaviour nothing here depends on.
 */
function installStorage(name: "localStorage" | "sessionStorage") {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, name, { value: storage, configurable: true, writable: true });
  }
}

if (typeof window !== "undefined" && typeof window.localStorage === "undefined") {
  installStorage("localStorage");
  installStorage("sessionStorage");
}

afterEach(() => {
  // React Testing Library does not unmount between tests on its own when
  // globals are off, and a leaked tree makes the NEXT test's queries match
  // elements from the previous one — which fails in a way that points at the
  // wrong test.
  if (typeof document !== "undefined") cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
  } catch {
    // No storage under the node environment; nothing to clear.
  }
});
