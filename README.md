# Hiready — AI-Powered Interview Preparation Platform

Hiready is a full-stack interview-prep platform: aptitude practice and proctored tests with analytics, AI-analyzed voice interviews, an AI resume analyzer, a coding playground with a sandboxed judge, timed assessments with anti-cheat, and a unified "readiness" dashboard.

## Project structure

```
hiready-backend/    Express 5 + Mongoose API (JWT auth, Groq LLM, Deepgram STT,
                    code-execution sandbox, Socket.io collaboration)
hiready-frontend/   React 18 + Vite + TypeScript + Tailwind/shadcn (Firebase auth,
                    TensorFlow.js proctoring, Monaco editor, Recharts)
docker-compose.yml  One-command local stack (Mongo + API + nginx-served SPA)
.github/workflows/  CI: frontend lint/typecheck/build + backend syntax & boot check
```

## Quickstart (manual)

Prerequisites: Node 20+, MongoDB (local or Atlas), Python 3 optionally (for code execution).

```sh
# 1. Backend
cd hiready-backend
cp ../.env.example .env          # then fill in the values (see below)
npm install
npm run dev                      # http://localhost:5000

# 2. Frontend
cd ../hiready-frontend
cp ../.env.example .env          # fill in VITE_* values
npm install
npm run dev                      # http://localhost:5173
```

## Quickstart (Docker)

```sh
cp .env.example .env             # fill in JWT_SECRET + API keys first
docker compose up --build        # frontend :3000, API :5000, Mongo :27017
```

`JWT_SECRET` is **required** — compose refuses to start without it. Generate one:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Employers (`/hire`)

A separate surface for companies hiring through the platform, governed by one
rule: **no recruiter obtains candidate identity or evidence without an active,
company-specific consent.**

| Concept | Meaning |
|---|---|
| `Company` / `CompanyMembership` | Tenancy. Recruiter-ness is a relationship to a company, not a `User.role` |
| `CandidateCompanyConsent` | Permission for ONE company to see ONE candidate. "Private" is the absence of a row |
| `candidateAccess(req, id)` | The only door. Returns a frozen, request-scoped capability; every reader takes it, none accept a bare id |
| `integrityVerdict` | How a recruiter learns a result is untrustworthy without any path to proctoring records |

Recruiters never receive proctoring events or webcam frames, raw interview
audio, practice history, or another company's pipeline. `ProctorSnapshot` is a
separate collection with a TTL, and `__tests__/hireBoundary.test.js` fails the
build if anything under `routes/hire/**` can reach it, directly or transitively.

Candidates manage this at `/privacy`: every company that can see them, with
one-click revoke. Revoking stops future access — assessments a company already
ran stay with that company, and the UI says so.

Admins approve and suspend companies at `/admin/companies`; `/admin/disclosure`
records who was disclosed, to whom, what, when, and under which consent.

## Environment variables

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `JWT_SECRET` | backend | ✅ | JWT signing (48+ random bytes) |
| `MONGO_URI` | backend | ✅ | MongoDB connection string |
| `GROQ_API_KEY` / `GROQ_MODEL` | backend | for AI features | LLM chat/analysis |
| `DEEPGRAM_API_KEY` | backend | for voice | STT (browser gets 60s scoped tokens only) |
| `FIREBASE_PROJECT_ID` | backend | for Google sign-in | Verifies Firebase ID tokens (issuer/audience) |
| `ADMIN_EMAILS` | backend | optional | Comma-separated emails auto-promoted to admin |
| `CORS_ORIGINS` | backend | optional | Allowed browser origins (localhost defaults) |
| `ALLOW_UNSAFE_SANDBOX` | backend | optional | Linux+production refuses unsandboxed code execution unless `1` |
| `VITE_API_URL` | frontend | ✅ | API base URL |
| `VITE_FIREBASE_*` | frontend | for Google sign-in | Firebase web config (public identifiers) |

Never commit filled-in `.env` files — they are gitignored.

## Scripts

| Command | Location | Description |
|---|---|---|
| `npm run dev` | both | Dev servers (nodemon / Vite) |
| `npm start` | backend | Production API server |
| `npm run build` | frontend | Production SPA build |
| `npm run lint` / `npm run typecheck` | frontend | ESLint / `tsc -b` (also run in CI) |
| `npm audit` | both | Dependency vulnerability check |

## Code-execution sandbox

The coding module executes user-submitted code (Python, JS/TS, Java, Go, C++, Rust).
Executed processes receive a **minimal environment** — server secrets are never
passed to user code. On Linux production servers, unsandboxed ("direct") execution
is **refused** unless [nsjail](https://github.com/google/nsjail) is installed
(recommended; needs root/CAP_SYS_ADMIN) or `ALLOW_UNSAFE_SANDBOX=1` is set
explicitly. The docker-compose path runs execution inside the backend container
and defaults to the opt-in, which is acceptable for local self-hosting only.

## Testing

Run unit tests and verification across backend and frontend:

```sh
cd hiready-backend && npm test
cd hiready-frontend && npm run lint && npm run typecheck && npm run build
```

## 👥 Contributors

- **Mahi / Mahesh** ([@1at23cs079-Mahi](https://github.com/1at23cs079-Mahi)) — Lead Architect, Security Hardening, Proctoring ML Engine, and Full-Stack Engineering.
- **Prajwal** ([@Prajwal-SM-2005](https://github.com/Prajwal-SM-2005)) — Project Collaboration & Platform Design.

## Security notes

- Report vulnerabilities privately via GitHub Security Advisories (add one under
  *Security → Advisories* when the repo is public).
- Rotate `JWT_SECRET` and API keys if they were ever used outside local development.
- Admin access is re-checked against the database on every admin request; all
  admin and user-data routes are authenticated and ownership-scoped.

