# tests

Every suite in the project lives here rather than inside the two packages.

```
tests/
  backend/           19 Jest suites · 293 tests
    support/
      paths.js       resolves the code under test
      hireDb.js      in-memory model mocks for the hire suite
  frontend/          2 Vitest suites · 11 tests
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
| `hiready-frontend/vitest.config.ts` | `include` points at `../tests/frontend`; `pdfjs-dist` and `mammoth` are aliased to absolute paths so `vi.mock` and the source agree on one module id |
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
