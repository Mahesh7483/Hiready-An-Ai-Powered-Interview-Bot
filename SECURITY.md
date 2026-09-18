# Security

## Reporting

Open a private security advisory on the repository, or contact the maintainer
directly. Please do not open a public issue for an unpatched vulnerability.

---

## Known exposure: credentials in git history

**Status: the affected values must be treated as public. Rotate them.**

Two commits early in this repository's history added `.env` files:

| Commit | File |
|---|---|
| `f682a40` | `hiready-backend/.env` |
| `4cf440e` | `hiready-frontend/.env` |

Both commits are reachable from `main` on the public GitHub repository, and
from the upstream fork. Anyone who has ever cloned the repository has them.

Variables present in those blobs:

- `VITE_GROQ_API_KEY`
- `VITE_DEEPGRAM_API_KEY`
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_PROJECT_ID`,
  `VITE_FIREBASE_STORAGE_BUCKET`
- `MONGO_URI`

### What to do

1. **Groq** — revoke the key at <https://console.groq.com/keys>, issue a new
   one, set `GROQ_API_KEY` in `hiready-backend/.env`.
2. **Deepgram** — revoke at <https://console.deepgram.com>, issue a new one,
   set `DEEPGRAM_API_KEY`.
3. **MongoDB** — change the password on the database user in the connection
   string and update `MONGO_URI`. If it pointed at a cluster reachable from
   the internet, restrict its IP allowlist too.
4. **Firebase** — the `VITE_FIREBASE_*` values are public identifiers by
   design and are not secrets; Firebase expects them in client code. They
   still deserve a look: confirm the API key is restricted to your domains,
   check the authorised-domains list, and review the security rules. What
   protects a Firebase project is its rules, not the key.

### Why the history was not rewritten

Rewriting it would rewrite every commit hash, break every existing clone and
every pull-request link, and require the upstream fork's cooperation — and it
would not undo the disclosure, because the values have been publicly readable
for months. Rotation is what actually makes them worthless. The old commits
stay and point at dead credentials.

### What stops it happening again

- `.gitignore` blocks `.env` and `.env.*` at any depth. Templates are named
  `env.example` (no leading dot) so they cannot match those patterns and
  cannot be mistaken for a live file.
- A CI job to refuse any tracked `.env` file, or a template containing
  something shaped like a real key, is written at `.github/workflows/ci.yml`
  but NOT YET COMMITTED: pushing a workflow file needs an OAuth token with the
  `workflow` scope. Until it is, this is enforced only by running
  `npm run lint` and reading the diff. Previously nothing enforced it at all,
  and nothing noticed — `.github/` was itself gitignored and CI had never run.
- The frontend no longer reads any provider key. Groq and Deepgram are called
  server-side; the browser gets a 60-second scoped Deepgram token. Twelve
  documents instructing contributors to put `VITE_GROQ_API_KEY` in the
  frontend `.env` — where Vite inlines it into the public bundle — have been
  removed.

---

## Security posture

Documented in the root `README.md`. In brief:

- **Signing key** — the API refuses to boot without a `JWT_SECRET` of at least
  32 characters. Every `jwt.verify` against it pins HS256, enforced by a test
  that walks `routes/`, `services/` and `middleware/` rather than naming files.
- **Admin role** — granted only on a verified identity. Signup never promotes:
  an address nobody has proven ownership of confers nothing. Seed the first
  admin with `node scripts/makeAdmin.js you@example.com`.
- **Code execution** — submitted code runs under nsjail with network, memory
  and CPU limits, `shell: false`, and process-tree kill. There is no automatic
  fallback to unsandboxed execution; in production it is refused outright
  unless `ALLOW_UNSAFE_SANDBOX=1` is set deliberately.
- **Tenancy** — every employer-facing query is scoped by company at the query
  level, and a build-time test fails if a route under `routes/hire` can even
  reach a model it must never read.
- **Biometric data** — webcam frames are stored separately from proctor logs,
  are admin-only, and expire via a TTL index. Set
  `PROCTOR_SNAPSHOT_RETENTION_DAYS` to the shortest period your policy allows.
- **Consent** — employers see nothing about a candidate without a consent row.
  Practice data is never shareable. Revocation is one click, and every
  disclosure is audited.

## Known gaps

Honest about what is not done:

- The session token lives in `localStorage`, so it is readable by any script
  that achieves XSS on the origin. An httpOnly cookie with CSRF protection
  would be better.
- Proctoring evidence is client-reported: the session id is chosen by the
  client and event types are free-form strings. Treat the integrity verdict as
  a signal, not proof.
- There is no email verification for password signup, which is why the admin
  role cannot be granted through that path.
- No rate limit on WebSocket collaboration messages.
