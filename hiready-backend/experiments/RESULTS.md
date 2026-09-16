# Results — what is in `out/`, how it was produced, and what it may be used for

Run this before citing anything:

```sh
cd hiready-backend
node experiments/check-pipeline-sync.js        # harness still matches the shipped code
node experiments/check-results-freshness.js    # results still match the shipped code
```

The two ask different questions, and only the second one caught the problem
described below.

---

## Current state

As of `c60cdd7`:

| Experiment | File | Revision | Status |
|---|---|---|---|
| 1 · structured output | — | — | **missing** |
| 2 · score stability | — | — | **missing** |
| 3 · prompt injection | `exp3_injection.json` | `4f44276` | **stale** |
| 4 · end-to-end latency | `exp4_latency_e2e.json` | not recorded | **unverifiable** |
| 5 · sandbox isolation | `exp5_sandbox.json` | `c60cdd7` | **fresh** |

**One of five results currently describes the deployed system.**

---

## Why the existing results cannot be cited

`check-pipeline-sync.js` passes — `lib/pipeline.js` does still match
`routes/aiRoutes.js`. That is necessary and it is not sufficient, because it
says nothing about *when* the numbers were produced. Both were true at once:

- the harness matched the deployed code, and
- the committed results were produced two weeks and ~190 lines earlier.

`exp3_injection.json` records `gitRevision 4f44276` (2026-09-01). Since then
`routes/aiRoutes.js` has taken six commits, two of which rewrote exactly the
generation path exp3 exercises:

- `55829b8` — the completion-token budget went 1200 → 3000 and a
  `finish_reason === 'length'` retry was added. Before it, every response was
  truncated mid-object.
- `475f30c` — `response_format: { type: 'json_object' }`, constrained
  decoding. Measured on one resume: 3 of 6 responses were invalid without it,
  0 of 6 with it.

An injection experiment run before both is measuring a different generator.
`exp4` measures end-to-end latency of `/api/ai/resume-analyze`, whose token
budget tripled in the same window, so its numbers moved too.

`check-results-freshness.js` exists so this is detected rather than noticed.
It maps each experiment to the files its numbers depend on and fails when any
has moved since the recorded revision.

### Two further problems with `exp3_injection.json`

Read its `provenance` block before using it even as a placeholder:

- `reps: 1, baselineReps: 1` — below even the `free` profile, which uses
  `--baseline-reps 8`. This is a smoke-sized run, not a measurement.
- `model: openai/gpt-oss-20b` while `groqModel: openai/gpt-oss-120b`. The
  experiment ran against a different model from the one the application
  deploys.

---

## `exp5_sandbox.json` — fresh, with one caveat that must travel with it

Produced at `c60cdd7`, 20 reps. All 9 isolation controls passed.

**`provenance.sandboxMode` is `direct`, not `nsjail`.** The host had no nsjail
binary, so these numbers describe the cross-platform fallback path. The
experiment's own caveat field says what that means:

> The nsjail path enforces kernel-level address-space, CPU and file-size
> limits; the cross-platform fallback path enforces time, output volume and
> environment stripping only.

So this run supports claims about time limits, output caps, environment
stripping and filesystem containment. It does **not** support any claim about
kernel-level isolation. To measure that, run it on a Linux host with nsjail
installed and check `provenance.sandboxMode` reads `nsjail` before citing it.

Also: `cpp` and `go` toolchains were unavailable, so latency covers
JavaScript, Python and Java only — three of the five supported languages.

---

## What re-running costs

`--estimate` runs nothing and prints both the call count and the interval
width the sample size actually buys:

```sh
node experiments/run-all.js --estimate                  # free profile
node experiments/run-all.js --profile power --estimate  # publishable
```

| Profile | Calls | Time | What it supports |
|---|---|---|---|
| `free` | ~446 | ~104 min | exp1 ±20.1 pts — *too wide to support any comparison*; exp2/exp3 ±13.6 pts — directional only |
| `full` | ~1170 | — | intermediate |
| `power` | ~2450 | ~368 min | exp2 ±4.9 pts — tight enough to compare arms; exp3 ±5.7 pts |

Read that first column honestly. A `free` run fills the files and will not
support a comparative claim; the harness says so itself rather than letting
the interval go unstated.

Only the missing and stale ones need running:

```sh
node experiments/run-all.js --only 1,2               # the two missing       ~216 calls
node experiments/run-all.js --only 3,4 --force       # the two stale         ~230 calls
```

`--force` is required for 3 and 4: `run-all.js` skips any experiment that
already has a result file, which is why a stale result quietly survives a
full re-run.

`exp1` is `[]` in the `power` profile by design — it varies `reasoning_effort`,
which the compound systems have no control for. Run it under `free` or `full`,
which pin `openai/gpt-oss-120b`. The archived trials in
`old-gpt-oss-run-backup/` are 120/120 `http_400` for exactly this reason and
must not be used to reconstruct anything.

---

## Before running anything

The Groq key in this repository's git history is public. Rotate it first —
see [SECURITY.md](../../SECURITY.md). Spending quota on a key that needs
revoking wastes the run.

---

## `old-gpt-oss-run-backup/`

Per-trial raw data from a superseded run, kept because it is evidence rather
than output. Do not aggregate it into results:

| File | Trials | Usable |
|---|---|---|
| `exp1_structured_output` | 120 | **0** — every trial `http_400` |
| `exp2_score_stability` | 27 | 24 |
| `exp3_injection` | 22 | 16 |
| `exp4_latency_e2e` | 30 | 26 |
| `exp5_sandbox` | 65 | 60 |

The directory name invites deletion and the contents do not deserve it. It
predates the `2026-09-08b` harness revision described in `VERSION.md`, which
fixed the `reasoning_effort` 400 that emptied exp1.

---

## The chain to the paper

`make_results.py` reads `out/*.json` and writes `results.tex`. It lives
outside this repository, so nothing here can regenerate the manuscript tables,
and nothing here fails when they drift. If that script is ever brought into
this repo, wire it behind `check-results-freshness.js` so a stale result
cannot reach a table.
