# HiREady — web client

React 18 · TypeScript · Vite 5 · Tailwind · shadcn/ui · TanStack Query

The full project README, including architecture and the consent model, is one
directory up. This file covers only what you need to work on the SPA.

## Run it

```sh
cp env.example .env     # then set VITE_API_URL
npm install
npm run dev             # http://localhost:8080
```

The API must be running separately — see `../hiready-backend`. From the
repository root, `npm run dev` starts both.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on :8080 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built bundle locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b` |
| `npm test` | Vitest |

All five run in CI on every pull request.

## Configuration

Copy `env.example` and read the comments in it — they say which variables
matter and why.

One rule worth repeating here: **every `VITE_`-prefixed variable is inlined
into the public bundle at build time.** It is readable by anyone who opens
devtools. No provider key, no secret, no credential may ever go in the
frontend `.env`. Groq and Deepgram are called server-side; the browser
receives a 60-second scoped Deepgram token and never sees a Groq key.

Twelve documents in this directory used to instruct the opposite. They were
written in March, never updated, and are gone.

## Layout

```
src/
  pages/        one file per route; App.tsx holds the route table
  components/   shared UI — components/ui/ is vendored shadcn
  lib/          API client, domain helpers, integrations
  hooks/        shared React hooks
  context/      AuthContext
```

## Talking to the API

Use `apiFetch` / `apiJson` from `src/lib/api.ts`. Never call `fetch` against
the API directly: `apiFetch` is where an expired session is handled — it
clears the stale token and redirects to login. Nineteen call sites once
bypassed it, so an expired JWT surfaced as a meaningless error toast on a page
that then sat there broken.

`src/lib/apiClient.test.ts` walks the source tree and fails the build on any
new raw call, so this is enforced rather than remembered.

## Loading, empty and error states

A page must distinguish three things: still loading, genuinely empty, and
could not ask. Use `QueryError` from `src/components/QueryError.tsx` for the
third.

The test is `isError || data === undefined`, **not** `isError` alone. When
TanStack cannot reach the server it may pause a query rather than fail it,
leaving `isLoading` false, `isError` false and `data` undefined — which slips
past both branches and lands on the empty state. Eleven pages once told users
"no results" for a backend that was simply down; the consent screen told
candidates nobody could see their data.

Never claim a list is empty while `data` is undefined.
