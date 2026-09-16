import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, relative, sep } from "path";

/**
 * Every authenticated call must go through apiFetch.
 *
 * apiFetch is where an expired session is handled: on a 401 it clears the
 * stale token and sends the user to /login. A raw fetch skips all of that, so
 * an expired JWT surfaced as a generic error toast on a page that then sat
 * there broken. Eighteen call sites did this — the aptitude runner, the coding
 * workspace, the assessment pipeline and the interview report among them.
 *
 * Derived by walking the tree, not from a list someone must remember to
 * extend: a new raw fetch added next month fails this test on the day it
 * lands.
 */

const SRC = join(__dirname, "..");

/** Calls made before a token exists. apiFetch skips its 401 redirect for these anyway. */
const PRE_AUTH = ["/auth/signup", "/auth/login", "/auth/google"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

interface Offender {
  file: string;
  line: number;
  text: string;
}

function rawApiCalls(): Offender[] {
  const found: Offender[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file).split(sep).join("/");
    // lib/api.ts IS the client — its own fetch is the one legitimate call.
    if (rel === "lib/api.ts") continue;

    readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
      if (/^\s*(\*|\/\/)/.test(line)) return;             // comments
      if (!/\b(fetch|axios\.(get|post|put|patch|delete))\s*\(/.test(line)) return;
      if (!/API_BASE_URL/.test(line)) return;             // not an API call
      if (PRE_AUTH.some((p) => line.includes(p))) return; // pre-auth by design
      found.push({ file: rel, line: i + 1, text: line.trim() });
    });
  }
  return found;
}

describe("the API client is the only way to reach the backend", () => {
  it("scans a real source tree", () => {
    // Non-vacuity: a walker that found nothing would make the next test pass
    // for free, which is exactly how the guard this replaces failed.
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith("api.ts"))).toBe(true);
  });

  it("no authenticated call bypasses apiFetch", () => {
    const offenders = rawApiCalls().map((o) => `${o.file}:${o.line}  ${o.text}`);
    expect(offenders).toEqual([]);
  });

  it("apiFetch still handles 401 by clearing the token and redirecting", () => {
    // The reason the rule above exists. If this behaviour is ever removed,
    // routing everything through apiFetch stops buying anything.
    const client = readFileSync(join(SRC, "lib", "api.ts"), "utf8");
    expect(client).toMatch(/res\.status === 401/);
    expect(client).toMatch(/localStorage\.removeItem\("token"\)/);
    expect(client).toMatch(/window\.location\.assign\("\/login"\)/);
    // And must not loop on the auth endpoints themselves.
    expect(client).toMatch(/!path\.startsWith\("\/auth\/"\)/);
  });
});
