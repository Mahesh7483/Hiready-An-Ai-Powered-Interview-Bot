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

There is no automated test suite yet. CI runs lint, typecheck, frontend build,
backend syntax checks, and a no-DB boot smoke test. When contributing, run:

```sh
cd hiready-frontend && npm run lint && npm run typecheck && npm run build
cd hiready-backend && node --check server.js
```

## Security notes

- Report vulnerabilities privately via GitHub Security Advisories (add one under
  *Security → Advisories* when the repo is public).
- Rotate `JWT_SECRET` and API keys if they were ever used outside local development.
- Admin access is re-checked against the database on every admin request; all
  admin and user-data routes are authenticated and ownership-scoped.
