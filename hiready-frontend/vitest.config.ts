import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    /**
     * Mirrors the "@" alias in vite.config.ts. Without it any module that
     * imports through "@/..." fails to resolve under vitest, so a test could
     * only ever cover files that happened to use relative imports — which is
     * most of src/, and none of the pages.
     */
    alias: {
      "@": path.resolve(__dirname, "./src"),

      /**
       * The suites live at <repo>/tests/frontend, outside this package, so a
       * bare specifier resolves from a directory whose node_modules walk never
       * reaches this package's. That broke `vi.mock("pdfjs-dist")` silently:
       * the mock registered under one module id and the source imported
       * another, so the real browser build loaded and died on `DOMMatrix is
       * not defined` at import time.
       *
       * Pinning the heavy browser-only dependencies to absolute paths makes
       * both sides agree on the id being mocked.
       */
      "pdfjs-dist": path.resolve(__dirname, "node_modules/pdfjs-dist"),
      mammoth: path.resolve(__dirname, "node_modules/mammoth"),
    },
  },
  test: {
    environment: "node",
    // .tsx is included so component tests are possible at all; they also need
    // environment "jsdom", which is a separate change.
    include: ["../tests/frontend/**/*.test.{ts,tsx}"],
  },
});
