# tests

Every suite in the project lives here rather than inside the two packages.

```
tests/
  backend/           22 Jest suites · 387 tests
    support/
      paths.js       resolves the code under test
      hireDb.js      in-memory model mocks for the hire suite
  frontend/           4 Vitest suites ·  28 tests
    setup.ts         jsdom storage polyfill + cleanup
```

## Running them

Nothing changed about how you run them — each package still owns its runner and
its dependencies.

```sh
npm test                                  # from the repo root: both, plus typecheck
npm test        --prefix hiready-backend  # Jest
npm run test    --prefix hiready-frontend # Vitest
npm run smoke   --prefix hiready-backend  # live, against a real server and mongod
npm run lint:tests                        # lints this directory
```

## How the runners find code that is no longer next door

Three things had to be told where to look, and each is commented where it lives:

| Where | What it does |
|---|---|
| `hiready-backend/jest.config.js` | `rootDir` is the repo root so `roots` can point outside the package; `modulePaths` adds that package's `node_modules`, because a bare `require('mongoose')` from here would otherwise walk up to the root and find only the dev runner |
| `hiready-frontend/vitest.config.ts` | `include` points at `../tests/frontend`; EVERY dependency in package.json is aliased to this package's node_modules, derived not listed; `esbuild.jsx: "automatic"` because no React plugin is loaded here; `server.fs.allow` widened to the repo |
| `hiready-frontend/tsconfig.app.json` | `include` covers `../tests/frontend`, and `vitest` is pinned in `paths` |

## Use `support/paths.js`, not `..`

```js
const { backend, frontend, req } = require('./support/paths');

const User = req('models/User');
const src  = fs.readFileSync(backend('routes/aiRoutes.js'), 'utf8');
```

Roughly half these suites assert on source text — they walk `routes/`,
`services/` and `models/` and fail when a guard is missing. That only works if
they can find those directories, and `path.resolve(__dirname, '..')` appeared in
eight files before this move, with twenty-six more ad-hoc joins.

A wrong path in a structural test does not error. It reads nothing, finds no
violations, and **passes**. Resolving the root in one place is what stops a
relocation turning a suite green by accident.

The exception is `jest.mock()`. Jest hoists it above every import, so its
module path cannot reference the helper — those call sites use literal relative
paths and say so.

## After moving anything here, re-prove the guards

Test files that read source are the ones most likely to break silently. Both of
these were checked after this move, by re-injecting the defect and watching the
suite go red:

- `tests/backend/schemaShape.test.js` — restore the broken `.select()` string
  and "no string projection mentions a path that contains a space" must fail.
- `tests/frontend/apiClient.test.ts` — add a raw `fetch` to any lib module and
  "no authenticated call bypasses apiFetch" must fail.

Each structural suite also carries a non-vacuity test ("the scan actually found
…") asserting that its walk returned something. Those are load-bearing, not
decoration.

## Resolution, in one place

Three separate things had to be told that a bare specifier should resolve from
`hiready-frontend`, and each failed differently before it was:

| Symptom | Cause |
|---|---|
| `vi.mock("pdfjs-dist")` silently stopped mocking; the real browser build loaded and died on `DOMMatrix is not defined` | the mock registered under one module id, the source imported another |
| `Failed to resolve import "@testing-library/react"` | Vite's walk from `tests/frontend` never reaches the package |
| `Cannot find module '@testing-library/react' or its corresponding type declarations` while the tests passed | TypeScript resolves separately from Vite, so `tsc` needed its own `paths` |

The Vite side is now derived from `package.json` rather than listed, so a
dependency added tomorrow is covered. The TypeScript side is **deliberately
not** a `"*"` catch-all: that makes `tsc` resolve `react` to
`node_modules/react/index.js` and stop looking for `@types/react`, and the
whole app loses its types to implicit `any`. Targeted entries only.

## jsdom does not give you localStorage here

Verified, not assumed: with `environment: "jsdom"` and a real origin,
`typeof document` is `"object"` and both `localStorage` and
`window.localStorage` are `undefined`. That reads as "jsdom is off" and is not.

`setup.ts` installs a Map-backed `Storage`. The app keeps its session token
there, so the 401 handling in `lib/api.ts` — the reason every call goes through
`apiFetch` at all — cannot be tested without it.
