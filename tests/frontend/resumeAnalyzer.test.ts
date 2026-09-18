import { describe, it, expect, vi } from "vitest";

// itemsToLines() itself is pure, but importing resumeAnalyzer.ts also runs
// top-level code that is unsafe/meaningless under Vitest's Node runtime:
//  - "./pdfWorker?worker" is a Vite build-time import suffix.
//  - "pdfjs-dist" resolves to build/pdf.mjs (its browser-targeted build,
//    confirmed via its package.json main/exports), not a Node-safe build.
// Both are mocked so only the real logic under test actually executes.
// mammoth and ./api have no top-level side effects and are left real.
vi.mock("@/lib/pdfWorker?worker", () => ({
  default: class MockPdfWorker {},
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));

import { itemsToLines } from "@/lib/resumeAnalyzer";

describe("itemsToLines", () => {
  it("returns an empty string for empty input", () => {
    expect(itemsToLines([])).toBe("");
  });

  it("skips items without a str property", () => {
    const items = [
      { str: "Keep", transform: [1, 0, 0, 1, 0, 700] },
      { type: "beginMarkedContent", tag: "Artifact" },
      { str: "Also", transform: [1, 0, 0, 1, 0, 700] },
    ];
    expect(itemsToLines(items)).toBe("Keep Also");
  });

  it("joins fragments sharing a baseline into one line with single spaces", () => {
    const items = [
      { str: "Hello", transform: [1, 0, 0, 1, 0, 700] },
      { str: "World", transform: [1, 0, 0, 1, 0, 700] },
    ];
    expect(itemsToLines(items)).toBe("Hello World");
  });

  it("collapses stray whitespace within a joined line to single spaces", () => {
    const items = [
      { str: "Hello ", transform: [1, 0, 0, 1, 0, 700] },
      { str: " World", transform: [1, 0, 0, 1, 0, 700] },
    ];
    expect(itemsToLines(items)).toBe("Hello World");
  });

  it("starts a new line when the baseline y changes", () => {
    const items = [
      { str: "Heading", transform: [1, 0, 0, 1, 0, 700] },
      { str: "Body text", transform: [1, 0, 0, 1, 0, 680] },
    ];
    expect(itemsToLines(items)).toBe("Heading\nBody text");
  });

  it("does not break a line for sub-pixel baseline jitter within tolerance", () => {
    const items = [
      { str: "Same", transform: [1, 0, 0, 1, 0, 700] },
      { str: "line", transform: [1, 0, 0, 1, 0, 701.5] },
    ];
    expect(itemsToLines(items)).toBe("Same line");
  });

  it("breaks the line on hasEOL even when later fragments share the prior baseline", () => {
    const items = [
      { str: "A", transform: [1, 0, 0, 1, 0, 700], hasEOL: true },
      { str: "B", transform: [1, 0, 0, 1, 0, 700] },
      { str: "C", transform: [1, 0, 0, 1, 0, 700] },
    ];
    expect(itemsToLines(items)).toBe("A\nB C");
  });

  it("regression: a heading followed by body text on a different baseline stays on its own line", () => {
    // Pins the bug this function fixes: the old code joined every
    // fragment with a single space into ONE flattened line, so a
    // heading like "Projects" sat mid-sentence next to body text and
    // was indistinguishable from it. hasEOL is deliberately NOT set on
    // either item here: hasEOL flushes and forces a break before the
    // baseline-diff branch (`Math.abs(y - lastY) > 2`) ever runs on the
    // next item, so a hasEOL-driven version of this test would still
    // pass even if that branch — the actual fix — were deleted. This
    // version can only pass if the baseline-change logic itself works.
    const items = [
      { str: "Projects", transform: [1, 0, 0, 1, 0, 700] },
      {
        str: "Built a resume parser that groups pdf.js text fragments into lines.",
        transform: [1, 0, 0, 1, 0, 680],
      },
    ];
    const result = itemsToLines(items);
    const lines = result.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toBe("Projects");
    expect(lines[0]).not.toContain("Built");
  });
});
