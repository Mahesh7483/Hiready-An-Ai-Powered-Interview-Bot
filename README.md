# HiREady

An AI-assisted interview preparation platform, and the hiring surface built on
top of it.

Students practise aptitude, coding, and voice interviews, sit proctored
multi-section assessments, and track a single readiness score. Employers invite
those students, run assessments against them, and review the results — but only
for candidates who have explicitly granted that company access, and only ever
the graded outcome, never the proctoring evidence behind it.

---

## Contents

- [Architecture](#architecture)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
- [The student surface](#the-student-surface)
- [The employer surface](#the-employer-surface)
- [Code-execution sandbox](#code-execution-sandbox)
- [Testing](#testing)
- [Scripts](#scripts)
- [Security](#security)
- [Contributors](#contributors)

---

## Architecture

```
hiready-backend/     Express 4 + Mongoose 8 REST API
                     JWT auth · Groq LLM · Deepgram STT · sandboxed code runner
hiready-frontend/    React 18 + Vite 5 + TypeScript 5 SPA
                     Tailwind + shadcn/ui · TensorFlow.js proctoring · Monaco · Recharts
docker-compose.yml   Local stack: MongoDB + API + nginx-served SPA
```

| Layer | Runs on | Notes |
|---|---|---|
| API | `:5000` | `npm run dev` (nodemon) or `npm start` |
| SPA | `:8080` | Vite dev server; port is fixed in `vite.config.ts` |
| MongoDB | `:27017` | Local, Atlas, or the Compose service |

Requires Node 20 or newer.

---

## Quickstart

### Manual

You need Node 20+ and a MongoDB you can reach.

```sh
git clone https://github.com/Mahesh7483/Hiready-An-Ai-Powered-Interview-Bot.git
cd Hiready-An-Ai-Powered-Interview-Bot
```

**1. Configure.** Each app ships a commented template. Copy it and fill in the
values — the comments say which are required and what breaks without each.

```sh
cp env.example .env                                   # docker compose only
cp hiready-backend/env.example  hiready-backend/.env
cp hiready-frontend/env.example hiready-frontend/.env
```

`JWT_SECRET` must be at least 32 characters; the API refuses to boot below
that. Generate one:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**2. Install and seed.** The seed step is not optional — without it the app
comes up completely empty, with no questions to practise on.

```sh
npm install                 # root: the two-app dev runner
npm run install:all         # both apps
npm run seed                # 89 aptitude questions, 6 coding problems, 1 template
```

**3. Run both.**

```sh
npm run dev                 # API on :5000, SPA on :8080
```

Or separately, if you prefer two terminals:

```sh
npm run dev:backend         # http://localhost:5000
npm run dev:frontend        # http://localhost:8080
```

**4. Make yourself an admin** (optional — needed for `/admin`):

```sh
cd hiready-backend && node scripts/makeAdmin.js you@example.com
```

`GET /api/health` reports whether the database is reachable and which provider
keys are configured. It returns 503 when it cannot serve, so it is worth
checking first if something looks wrong.

### Docker

```sh
docker compose up --build        # SPA on :3000
# The API and MongoDB are reachable only on the compose network — nginx
# proxies /api and /socket.io to the backend, so :3000 is the only open port.
```

Compose reads a `.env` at the repository root and refuses to start without
`JWT_SECRET`. Generate one with:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Configuration

| Variable | Side | Required | Purpose |
|---|---|---|---|
| `JWT_SECRET` | backend | yes | Signs session tokens. 48+ random bytes |
| `MONGO_URI` | backend | yes | MongoDB connection string |
| `GROQ_API_KEY` | backend | for AI features | LLM chat, interview and resume analysis |
| `GROQ_MODEL` | backend | optional | Overrides the default model |
| `DEEPGRAM_API_KEY` | backend | for voice | Speech-to-text. The browser only ever receives 60-second scoped tokens |
| `FIREBASE_PROJECT_ID` | backend | for Google sign-in | Verifies Firebase ID tokens (issuer and audience) |
| `ADMIN_EMAILS` | backend | optional | Comma-separated addresses **eligible** for admin. Listing one grants nothing on its own — promotion also requires a verified identity (Google sign-in with `email_verified`), because signup proves nothing about who owns an address. Seed the first admin with `node scripts/makeAdmin.js` |
| `CORS_ORIGINS` | backend | optional | Allowed browser origins. Defaults to localhost |
| `ALLOW_UNSAFE_SANDBOX` | backend | optional | See [sandbox](#code-execution-sandbox). `1` opts in |
| `PROCTOR_SNAPSHOT_RETENTION_DAYS` | backend | optional | Lifetime of stored webcam frames before the TTL index drops them. Default `90`. This is biometric data — set the shortest period your policy and jurisdiction allow, not the longest |
| `VITE_API_URL` | frontend | yes | API base URL, e.g. `http://localhost:5000/api` |
| `VITE_FIREBASE_*` | frontend | for Google sign-in | Firebase web config. These are public identifiers |

Every variable above is documented in the commented templates —
`env.example`, `hiready-backend/env.example` and `hiready-frontend/env.example`.
Copy those rather than working from this table.

**Never commit a populated `.env`.** `.gitignore` blocks `.env` and `.env.*`
at any depth, and CI fails the build if one is ever tracked. The templates are
named `env.example` without a leading dot precisely so they cannot match those
patterns and cannot be mistaken for a live file.

Env files were committed to this repository twice in the past and are still in
its history. See [SECURITY.md](SECURITY.md) — those credentials need rotating.

---

## The student surface

| Route | Purpose |
|---|---|
| `/mastery` | Readiness score across four weighted pillars, and the weakest one to work on next |
| `/mastery/review` | Every question previously answered incorrectly |
| `/practice` | Self-directed practice: aptitude, coding, interviews, resume, leaderboard |
| `/practice/assessment` | Timed multi-section assessments with anti-cheat |
| `/privacy` | Every company that can currently see you, with one-click revoke |

Readiness is computed **server-side only**, in `routes/readinessRoutes.js`:
interview 40, aptitude 30, coding 20, resume 10, renormalised when a pillar has
no data. The client renders that number and never recomputes it — two formulas
inevitably disagree, and the student is shown the one that is wrong.

---

## The employer surface

A separate application at `/hire`, governed by a single rule:

> **No recruiter obtains candidate identity or hiring evidence unless an active,
> company-specific authorization exists for that candidate.**

| Concept | Meaning |
|---|---|
| `Company` / `CompanyMembership` | Tenancy. Being a recruiter is a relationship to a company, not a `User.role` |
| `CandidateCompanyConsent` | Permission for one company to see one candidate. "Private" is the **absence** of a row, so default-deny falls out of the schema |
| `candidateAccess(req, id)` | The only door. Returns a frozen, request-scoped capability; every reader takes one and none accept a bare id |
| `integrityVerdict` | How a recruiter learns a result is untrustworthy without any path to the proctoring records that determined it |
| `DisclosureAudit` | Who saw which candidate, under which consent, when. Deliberately outlives both |

| Route | Purpose |
|---|---|
| `/hire` | Every job and its funnel counts |
| `/hire/jobs/:id` | The pipeline board; invite by email; select two to five candidates to compare |
| `/hire/invites` | Outgoing invites and their status, with revoke |
| `/hire/compare` | Side-by-side, section by section |
| `/hire/candidates/:id` | The scorecard — the only screen that can resolve a real person |
| `/admin/companies` | Approve, activate and suspend companies |
| `/admin/disclosure` | The disclosure audit, exportable |

Design decisions worth not re-litigating:

- **Every refusal is a byte-identical 404.** A 403 would confirm that a
  candidate exists and let the pool be enumerated.
- **Suspension bites on the next request.** Membership and company status are
  re-read per request, never cached into a session.
- **Revocation stops future access only.** A company that already ran an
  assessment keeps that result; the UI says so rather than implying otherwise.
- **Comparison produces no composite score.** Candidates who sat different
  instruments are not comparable on one number, and presenting one anyway would
  be a confident figure with nothing behind it.
- **Recruiters never receive** proctoring events, webcam frames, raw interview
  audio, practice history, or another company's pipeline. `ProctorSnapshot` is
  a separate collection with a TTL, and `tests/backend/hireBoundary.test.js` walks
  the transitive `require` graph from `routes/hire/**` and fails the build if
  any of them becomes reachable.

---

## Code-execution sandbox

The coding module executes user-submitted Python, JavaScript/TypeScript, Java,
Go, C++ and Rust. Executed processes receive a **minimal environment** — server
secrets are never passed to user code.

On Linux in production, unsandboxed execution is **refused** unless
[nsjail](https://github.com/google/nsjail) is installed (recommended; needs root
or `CAP_SYS_ADMIN`) or `ALLOW_UNSAFE_SANDBOX=1` is set explicitly. The Docker
Compose path runs execution inside the backend container and defaults to the
opt-in, which is acceptable for local self-hosting only.

---

## Testing

Two layers, because they fail differently.

**`npm test`** — 293 tests across 19 suites. Models are mocked, so this proves
logic: middleware ordering, scope derivation, refusal shape, compiled schema
shape, and the data-access boundary. No database required.

**`npm run smoke`** — 38 checks against a real server and a real `mongod`. Each
run seeds under a unique tag, drives the real HTTP surface, and deletes
everything afterwards including on failure.

The second layer exists because the first cannot prove that a Mongoose filter
matches the documents MongoDB actually holds — and that is where this
codebase's worst defects have lived. A `strict: true` schema silently dropping
an undeclared `.set()` path; a cast query filter matching zero rows while the
route reports success; a subdocument array compiling to `[String]` because one
of its fields was named `type`. Each passed review, and none produced an error
message that named the cause.

```sh
cd hiready-backend  && npm test && npm run typecheck && npm run lint
cd hiready-frontend && npm run typecheck && npm run lint && npm run build
```

`npm run smoke` additionally needs MongoDB running and a populated `.env`.

**CI.** `.github/workflows/ci.yml` runs all of the above on every pull request:
frontend lint, typecheck, Vitest and build; backend lint, syntax check, the
Jest suite against a real `mongo:7` service, both smoke runs, and a boot check.
A fourth job fails the build if any `.env` file is tracked or a template
contains something shaped like a real key.

This workflow existed, fully written, for the life of the repository and never
ran once: `.gitignore` listed `.github/`, so it could not be committed.

---

## Scripts

### Backend

| Command | Description |
|---|---|
| `npm run dev` | Development server with nodemon |
| `npm start` | Production server |
| `npm test` | Jest suite |
| `npm run smoke` | Both live end-to-end runs (needs MongoDB) |
| `npm run smoke:assessment` | Student assessment pipeline only |
| `npm run smoke:hire` | Employer product only |
| `npm run typecheck` | Syntax check across all backend sources |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run seed` | Populate a fresh database (idempotent) |
| `npm run seed:export` | Regenerate `seeds/aptitude.json` from a populated database |

### Frontend

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server on `:8080` |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc -b` |
| `npm test` | Vitest |
| `npm run lint` | ESLint |

### Maintenance

| Command | Description |
|---|---|
| `node scripts/migrateUserIdTypes.js --dry` | Converts legacy string-typed `userId` values to `ObjectId`. Uses the raw driver, because a Mongoose query cannot find the rows it must repair |
| `node scripts/cleanupOrphanedUserData.js` | Reports rows belonging to deleted accounts. Add `--commit` to delete; every row is dumped to `backups/` first |
| `node scripts/migrateProctorSnapshots.js --dry` | Moves inline proctoring frames into `ProctorSnapshot` |

All maintenance scripts default to a dry run and print what they would change.

---

## Security

- Report vulnerabilities privately through GitHub Security Advisories
  (*Security → Advisories*) rather than a public issue.
- Rotate `JWT_SECRET` and every API key if they were ever used outside local
  development.
- Admin status is re-read from the database on every admin request, so a
  demotion takes effect immediately without reissuing tokens.
- All user-data routes are authenticated and ownership-scoped.
- Deleting an account cascades across every collection holding a reference to
  that person, including biometric snapshots, and reports a per-collection
  deleted count. `DisclosureAudit` is excluded by design: it must outlive the
  consent it records, or it cannot answer "who saw my results?" later.

---

## Contributors

- **Mahesh** ([@1at23cs079-Mahi](https://github.com/1at23cs079-Mahi)) — architecture,
  security hardening, proctoring ML, full-stack engineering
- **Prajwal** ([@Prajwal-SM-2005](https://github.com/Prajwal-SM-2005)) — platform
  design and collaboration
