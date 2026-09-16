import { defineConfig } from "vitest/config";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("./package.json");

/**
 * Resolve every dependency from THIS package, wherever the importer lives.
 *
 * The suites are at <repo>/tests/frontend, outside this package. Vite resolves
 * a bare specifier by walking up from the importing FILE, and that walk goes
 * tests/frontend -> tests -> <repo>, reaching a root node_modules holding only
 * the dev runner. So `import { render } from "@testing-library/react"` fails
 * outright — and worse, `vi.mock("pdfjs-dist")` silently registers under a
 * different module id from the one the source imports, so the mock never
 * applies and the real browser build loads and dies on `DOMMatrix is not
 * defined`.
 *
 * Aliasing packages one at a time does not scale: every new component test
 * imports another. This derives the list from package.json, so a dependency
 * added tomorrow is covered without anyone remembering to add it here.
 *
 * Exact-match regex with an optional sub-path, NOT a plain string key: Vite's
 * string aliases match by PREFIX, so an entry for "react" would also capture
 * "react-dom" and "react-router-dom" and rewrite both to the wrong directory.
 * The `$1` preserves sub-path imports such as "@testing-library/jest-dom/vitest".
 */
const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const packageAliases = Object.keys({
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
}).map((name) => ({
  find: new RegExp(`^${escapeForRegex(name)}(/.*)?$`),
  replacement: `${path.resolve(__dirname, "node_modules", name)}$1`,
}));

export default defineConfig({
  resolve: {
    alias: [
      // Mirrors the "@" alias in vite.config.ts. Without it any module that
      // imports through "@/..." fails to resolve under vitest, so a test could
      // only ever cover files that happened to use relative imports — which is
      // most of src/, and none of the pages.
      { find: /^@\/(.*)$/, replacement: `${path.resolve(__dirname, "./src")}/$1` },
      ...packageAliases,
    ],
  },

  /**
   * The automatic JSX runtime, matching `"jsx": "react-jsx"` in
   * tsconfig.app.json. vite.config.ts gets this from @vitejs/plugin-react;
   * this config does not load plugins, so without it every component test
   * fails with "React is not defined" — the classic-runtime error, from a
   * codebase that never imports React because it does not have to.
   */
  esbuild: { jsx: "automatic" },

  // Vite refuses to read files outside its root, and the suites now live at
  // <repo>/tests. Without this the setup file fails to load with "Does the
  // file exist?" while sitting plainly on disk.
  server: {
    fs: { allow: [path.resolve(__dirname, "..")] },
  },

  test: {
    /**
     * jsdom everywhere. The structural suites read the source tree with fs,
     * which still works — vitest's jsdom is a DOM on top of Node, not instead
     * of it — and component suites need a document.
     *
     * This jsdom provides `document` and `window` but NOT localStorage, even
     * with a real origin; that was verified, not assumed. tests/frontend/
     * setup.ts installs one and explains why it has to.
     */
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost:8080/" } },
    setupFiles: ["../tests/frontend/setup.ts"],
    include: ["../tests/frontend/**/*.test.{ts,tsx}"],
  },
});
