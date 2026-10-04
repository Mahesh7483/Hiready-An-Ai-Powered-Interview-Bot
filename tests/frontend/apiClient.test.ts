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
 * Two layers, because they fail differently:
 *
 *   - ESLint (`no-restricted-globals` / `no-restricted-properties` in
 *     hiready-frontend/eslint.config.js) is the enforcement. It resolves
 *     references, so it also sees an aliased `fetch`, `window.fetch`,
 *     XMLHttpRequest and EventSource, which no text search can.
 *   - This file is the backstop, and it is why the rule cannot be quietly
 *     switched off: a text scan that runs in `npm test`, derived by walking the
 *     tree rather than from a list someone must remember to extend.
 *
 * An exception is marked at the call site, with the reason, and both layers
 * read the same marker — there is no second list to drift:
 *
 *   // eslint-disable-next-line no-restricted-globals -- <why>
 */

// The tree under test is another package now, so this is anchored on the
// repository root rather than on this file being next to the code.
const SRC = join(__dirname, "..", "..", "hiready-frontend", "src");

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

interface Hit {
  file: string;
  line: number;
  text: string;
}

/**
 * Any network call that is not apiFetch.
 *
 * Deliberately NOT conditioned on the line mentioning API_BASE_URL. An earlier
 * version required that, and `const response = await fetch(url, {})` — the URL
 * built a few lines above — sailed through it: the aptitude runner shipped
 * with no Authorization header and every quiz request came back 401. A rule
 * that needs the call and the base URL on one line only catches the callers
 * who happen to write it that way. Case-sensitivity keeps `apiFetch(` out
 * (`Fetch` is not `fetch`); `\b` keeps `prefetch(` out.
 */
export function isRawNetworkCall(line: string): boolean {
  if (/^\s*(\*|\/\/|\/\*)/.test(line)) return false; // comments, incl. one-line /* … */ and /** … */
  return /\b(fetch|axios\.(get|post|put|patch|delete))\s*\(/.test(line);
}

/**
 * What the line above a call says about exempting it.
 *   undefined → no exemption marker
 *   ""        → marked, but gives no reason (a violation in its own right)
 *   "<text>"  → marked, with the stated reason
 */
export function exemptionReason(previousLine: string | undefined): string | undefined {
  // Parsed in two linear steps rather than one regex with a lazy `[^\n]*?`
  // beside `\s+`, which backtracks quadratically on a long near-miss line.
  const directive = /^\s*\/\/\s*eslint-disable-next-line\s+(.*)$/.exec(previousLine ?? "");
  if (!directive) return undefined;

  // ESLint's own syntax: rule list, then `--`, then the description. Rule names
  // never contain `--`, so the first one ends the list.
  const dash = directive[1].indexOf("--");
  const rules = dash < 0 ? directive[1] : directive[1].slice(0, dash);
  const reason = dash < 0 ? "" : directive[1].slice(dash + 2).trim();

  // Both rules, because they cover different shapes: no-restricted-globals sees
  // a bare `fetch(`, no-restricted-properties sees `window.fetch(` /
  // `navigator.sendBeacon(`. A legitimate exception to either must be
  // expressible. The lookahead stops `no-restricted-globals-extra` matching.
  if (!/(?:^|[\s,])no-restricted-(?:globals|properties)(?![\w-])/.test(rules)) return undefined;
  return reason;
}

function scan(): { bypasses: Hit[]; exempt: (Hit & { reason: string })[] } {
  const bypasses: Hit[] = [];
  const exempt: (Hit & { reason: string })[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file).split(sep).join("/");
    // lib/api.ts IS the client — its own fetch is the one legitimate call.
    if (rel === "lib/api.ts") continue;

    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!isRawNetworkCall(line)) return;
      const hit = { file: rel, line: i + 1, text: line.trim() };
      const reason = exemptionReason(lines[i - 1]);
      if (reason) exempt.push({ ...hit, reason });
      else bypasses.push(hit); // unmarked, or marked without a reason
    });
  }
  return { bypasses, exempt };
}

describe("the API client is the only way to reach the backend", () => {
  it("scans a real source tree", () => {
    // Non-vacuity: a walker that found nothing would make the next test pass
    // for free, which is exactly how the guard this replaces failed.
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith("api.ts"))).toBe(true);
  });

  it("recognises the shapes a bypass takes, and only those", () => {
    // Non-vacuity for the matcher itself. The first four are real or likely
    // bypasses — the first is the exact line that shipped; the rest must stay
    // quiet or the guard cries wolf and gets deleted.
    expect(isRawNetworkCall("const response = await fetch(url, {});")).toBe(true);
    expect(isRawNetworkCall("const r = await fetch(`${API_BASE_URL}/x`, { headers });")).toBe(true);
    expect(isRawNetworkCall("  return fetch (endpoint);")).toBe(true);
    expect(isRawNetworkCall("axios.post(url, body)")).toBe(true);
    expect(isRawNetworkCall("const r = await apiFetch(path);")).toBe(false);
    expect(isRawNetworkCall("// fetch(url) is wrong here")).toBe(false);
    expect(isRawNetworkCall(" * never call fetch( directly")).toBe(false);
    expect(isRawNetworkCall("/* fetch(url) is wrong here */")).toBe(false);
    expect(isRawNetworkCall("prefetch(url)")).toBe(false);
  });

  it("reads an exemption marker, and tells a reasoned one from a bare one", () => {
    const marker = "// eslint-disable-next-line no-restricted-globals";
    expect(exemptionReason(`${marker} -- pre-auth: mints the JWT`)).toBe("pre-auth: mints the JWT");
    expect(exemptionReason(`    ${marker} -- a reason`)).toBe("a reason");
    expect(exemptionReason(marker)).toBe(""); // marked, no reason
    expect(exemptionReason(`${marker} --`)).toBe(""); // dash with nothing after it
    expect(exemptionReason(`${marker} --    `)).toBe("");
    // The property rule covers window.fetch / navigator.sendBeacon, so its
    // marker must count too — alone, or stacked with the globals rule.
    expect(exemptionReason("// eslint-disable-next-line no-restricted-properties -- third-party widget")).toBe(
      "third-party widget",
    );
    expect(
      exemptionReason("// eslint-disable-next-line no-restricted-globals, no-restricted-properties -- both apply"),
    ).toBe("both apply");
    expect(exemptionReason("// eslint-disable-next-line no-console -- unrelated rule")).toBeUndefined();
    // A rule that merely starts with the name, or a decoy that only mentions it
    // in the description, is not an exemption.
    expect(exemptionReason("// eslint-disable-next-line no-restricted-globals-extra -- x")).toBeUndefined();
    expect(
      exemptionReason("// eslint-disable-next-line no-restricted-syntax -- mentions no-restricted-globals here"),
    ).toBeUndefined();
    expect(exemptionReason("// eslint-disable-line no-restricted-globals -- wrong directive")).toBeUndefined();
    // Linear on a long line that nearly matches (was quadratic: ~5 s at 200k chars).
    const started = Date.now();
    exemptionReason(`// eslint-disable-next-line${" ".repeat(200_000)}x`);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(exemptionReason("const x = 1;")).toBeUndefined();
    expect(exemptionReason(undefined)).toBeUndefined();
  });

  it("no authenticated call bypasses apiFetch", () => {
    // Also fails on an exemption that states no reason: silencing the rule
    // with nothing written down is how a bypass becomes permanent.
    const offenders = scan().bypasses.map((o) => `${o.file}:${o.line}  ${o.text}`);
    expect(offenders).toEqual([]);
  });

  it("every exemption explains itself in a phrase, not a token", () => {
    // Not a list and not a quota — the reasons are read out of the source. A
    // bare "ok" or "needed" silences the rule as thoroughly as no reason at
    // all, so a reason must say why: at least four words. Failure prints the
    // call, so the offending exemption is visible in review.
    const thin = scan()
      .exempt.filter((e) => e.reason.split(/\s+/).length < 4)
      .map((e) => `${e.file}:${e.line}  reason "${e.reason}"`);
    expect(thin).toEqual([]);
  });

  it("apiFetch still handles 401 by clearing the token and redirecting", () => {
    // The reason the rule above exists. If this behaviour is ever removed,
    // routing everything through apiFetch stops buying anything.
    const client = readFileSync(join(SRC, "lib", "api.ts"), "utf8");
    expect(client).toMatch(/res\.status === 401/);
    expect(client).toMatch(/clearSession\(\)/);
    const session = readFileSync(join(SRC, "lib", "session.ts"), "utf8");
    expect(session).toMatch(/localStorage\.removeItem\("token"\)/);
    expect(client).toMatch(/window\.location\.assign\("\/login"\)/);
    // And must not loop on the auth endpoints themselves.
    expect(client).toMatch(/!path\.startsWith\("\/auth\/"\)/);
  });
});
