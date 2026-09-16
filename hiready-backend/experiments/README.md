# HiReady evaluation harness

Everything the paper reports comes from these scripts. Nothing in the
manuscript is typed in by hand: `make_results.py` reads the JSON files these
produce and writes `paper/results.tex`.

## Install

Copy this whole `experiments/` folder into `hiready-backend/`, so it sits
beside `routes/`, `services/` and `models/`. It uses only packages the backend
already has (`groq-sdk`, `dotenv`, `jsonwebtoken`, `mongoose`) — there is
nothing new to install.

```
hiready-backend/
  experiments/
    lib/  corpus/  out/
    exp1_structured_output.js  ...
```

Run everything **from `hiready-backend/`**, not from inside `experiments/`:

```sh
cd hiready-backend
node experiments/exp1_structured_output.js
```

Your `.env` must have `GROQ_API_KEY` (exp1–3), plus `MONGO_URI` and
`JWT_SECRET` for exp4 and `DEEPGRAM_API_KEY` for exp6.

## Before you cite anything

Two checks, and they answer different questions:

```sh
cd hiready-backend
node experiments/check-pipeline-sync.js       # does lib/pipeline.js still match routes/aiRoutes.js?
node experiments/check-results-freshness.js   # were the stored results produced against the current code?
```

The first can pass while every committed number describes a pipeline from two
weeks ago — that was the actual state of this repository. See
[RESULTS.md](RESULTS.md) for what is in `out/`, which profile produced it, and
what each result may and may not be used to claim.

## Just run this

```sh
cd hiready-backend
node experiments/run-all.js --estimate                  # budget + power, runs nothing
node experiments/run-all.js                             # free profile, ~446 calls
node experiments/run-all.js --profile power --estimate  # what a publishable run costs
```

Three profiles:

| profile | calls | per-cell n | interval at p=0.5 | for |
|---|---|---|---|---|
| `free` | ~450 | 20-48 | ±20-26 pts | proving the harness works |
| `full` | ~1500 | 60-200 | ±7-12 pts | a decent run on a paid key |
| `power` | ~3150 | 100-400 | ±5-10 pts | the numbers you would publish |

### `--profile power`: sized for the interval, not the clock

`lib/power.js` does the arithmetic the profile was chosen from. At p = 0.5 you
need **n = 93** for a ±10-point Wilson interval and **n = 381** for ±5, so:

- **exp1** 20 résumés × 5 reps = **100 per configuration**
- **exp2** 20 résumés × 20 reps = **400 per model**
- **exp3** 48 payloads × 2 bases × 3 arms × 3 reps = **288 per arm**, with 20
  clean baseline runs so the score-inflation criterion finally has the
  distribution it was written against

`--estimate` prints that table beside the n each experiment will reach, so you
see what the run can establish before spending the hours.

**"Free" is not "unlimited".** The compound systems carry no spend cap on the
developer plan, but per-minute request and token ceilings still apply. The run
paces itself, backs off on 429, and the guard aborts rather than writing a file
of zeros. Budget several hours and use `--only 2,3` to run just the parts that
sit on the free models — **exp1 is the metered one**, because it varies
`reasoning_effort` and therefore stays on `openai/gpt-oss-120b`.

**One ceiling this cannot lift.** The swing percentages in exp2 are proportions
over *résumés*, not over repetitions, so their interval is bounded by the corpus
at 20 documents (±20 pts) no matter how many reps you run. More repetitions
sharpen each résumé's SD and range; only a larger corpus sharpens the swing
percentage. Add résumés to `corpus/resumes.json` if that number matters to a
reviewer.

| # | Script | Needs | Calls (free) | Calls (full) |
|---|--------|-------|-------------|-------------|
| 1 | `exp1_structured_output.js` | Groq key | 120 | 360 |
| 2 | `exp2_score_stability.js` | Groq key | 48 | 400 |
| 3 | `exp3_injection.js` | Groq key | 112 | 232 |
| 4 | `exp4_latency_e2e.js` | backend on :5000 + a user in Mongo | 60 | 180 |
| 5 | `exp5_sandbox.js` | nothing | 0 | 0 |
| 6 | `exp6_wer.js` | Deepgram key + recorded audio | 1/clip | 1/clip |

Start with **exp5** (`--only 5`) — no key, no network, two minutes, and it
proves the harness is wired up.

### What happened on the first full run, and why the defaults are what they are

The suite completed all five experiments and wrote result files in which every
schema-validity figure was **0 %**. The pipeline was fine; the free-tier quota
had been exhausted partway through experiment 1, so essentially every later
request returned 429 or 413 and the trial never happened. The aggregator
counted a rate-limit refusal as a failed trial, and the output looked like a
finding. Two and a half hours produced nothing.

Three things now prevent a repeat:

1. **Preflight.** `run-all.js` makes one cheap call first and aborts in seconds
   if the quota is already gone.
2. **Backoff.** A 429 is retried with exponential backoff, honouring
   `Retry-After`. A rate-limit is not a trial outcome.
3. **Guard.** After a 12-trial warm-up, if more than half the trials never
   reached the model, the experiment aborts and **writes no result file** - a
   file of zeros is worse than no file.

### 429 versus 413 - they need different fixes

- **429** is a *rate* limit. Wait for the window, or raise `--delay`.
- **413** is a *size* refusal: one request exceeded the tier's per-request token
  ceiling. Waiting does nothing. Use a shorter document (`--resume R01`,
  `--limit 8`) or lower `max_tokens` in the configuration under test.

### Before a real run

Clear `out/` of anything from a smoke or failed run, or `run-all.js` will skip
those experiments as already done.
## What each one answers

**exp1 — structured-output reliability.** Five configurations crossing
reasoning effort (default vs `low`), completion budget (700 vs 4000 tokens) and
the truncation-repair stage. The point is the failure *decomposition*: an
empty-content failure and a malformed-JSON failure need opposite fixes, and a
pipeline that treats them alike retries its way through the wrong one.

**exp2 — score stability.** Same résumé, same config, 10 repetitions at the
deployed temperature 0.3, across the generation models in `--models`
(default `groq/compound,groq/compound-mini,openai/gpt-oss-120b`). Reports per-résumé SD and range of the displayed
score, and Kendall's τ between each run's ranking and the mean ranking. If the
range is large but τ is high, individual scores wobble while the ordering
holds — which means comparative feedback is defensible and an absolute integer
score is not.

**exp3 — injection resistance.** 48 payloads × 9 families × **3 arms**
(unhardened, hardened, hardened + input classifier) against 2 base résumés, plus
clean-run baselines and a false-positive screen of the unpoisoned documents. Reports success rate by goal
and channel and the residual set of payloads that survive hardening. Success
criteria were fixed before any data was collected; see the header of the
script.

`--payload-limit N` samples in a stratified round robin over families, so a
short run still touches every family. Two things make a run **unpublishable as
a full result** and the aggregator now says so instead of hiding it: a family
that drew no payload (its channel is reported as *not evaluated*, not as 0 %),
and `--baseline-reps 1`, which leaves the score goal with no clean-run
distribution to compare against — those trials are reported as *not evaluated*
too. Use `--baseline-reps 10` for a run whose score-inflation cells you intend
to report.

**exp4 — end-to-end latency.** Real HTTP requests with a real signed JWT, so
the numbers include auth, validation, provider round-trip and serialisation.
One warm-up per endpoint is discarded. Start the backend first
(`node server.js`) and make sure at least one user exists in the database.

**exp5 — sandbox isolation.** Nine control tests with stated expected
outcomes, plus per-language cold and warm execution latency. Languages whose
toolchain is absent on the host are skipped and recorded as skipped, not as
failures. **Note which sandbox mode it reports** — the nsjail path and the
fallback path do not offer the same guarantees, and the paper says so.

**exp6 — transcription accuracy.** Needs audio you record plus human-typed
reference transcripts. The layout is documented in the script header. Do not
generate the reference transcript with a model; the whole point is an
independent ground truth.

## Reproducibility

Each script writes two files into `out/`:

- `<name>.json` — the aggregate summary the paper reads
- `<name>.trials.jsonl` — one line per trial, so any aggregate can be recomputed

Both carry a provenance block: git revision, model identifier, Node version,
host CPU and memory, and a UTC timestamp. Release both with the paper.

## Keeping the harness honest

`lib/pipeline.js` reproduces the résumé prompt and the parsing helpers from
`routes/aiRoutes.js` so the experiments can vary parameters the production
route hard-codes. **If you change `aiRoutes.js`, re-copy them.** If the two
drift apart, the paper describes a pipeline you are not shipping — which is
the one form of dishonesty in an experimental paper that is genuinely hard to
detect from the outside and fatal if found.


## Models

`lib/models.js` is the single source of truth for what each model can do, and
every experiment asserts its requirements before spending any quota.

| model | kind | reasoning\_effort | strict json\_schema | json\_object | used by |
|---|---|---|---|---|---|
| `groq/compound` | agentic system | no | **unknown — probe** | yes | exp2, exp3 (deployed generator) |
| `groq/compound-mini` | agentic system | no | **unknown — probe** | yes | exp2 |
| `openai/gpt-oss-120b` | reasoning chat | yes | yes | yes | exp1, exp2 |
| `meta-llama/llama-prompt-guard-2-86m` | classifier | n/a | n/a | n/a | exp3 guard arm |

### Settle the unknowns before running exp1

```sh
node experiments/probe-capabilities.js                       # all generative models
node experiments/probe-capabilities.js --models groq/compound
```

Groq documents strict `json_schema` for the gpt-oss and qwen3.8 models and says
nothing either way about the compound systems, so the registry marks them
`null` (unknown) rather than guessing. The probe sends one small real request
per feature and records what came back, into `out/model-capabilities.json`,
which `lib/models.js` then reads **in preference to its own table**.

It distinguishes three outcomes, and the third is the reason the probe exists:

| outcome | meaning |
|---|---|
| `supported` | call succeeded and the output satisfied the schema |
| `rejected` | provider refused the parameter with a 4xx |
| `accepted_but_unenforced` | call succeeded, output violated the schema |

The last one is recorded as **not supported**. A parameter the provider accepts
and ignores is more dangerous than one it refuses, because the result file looks
identical to a real constrained-decoding run.

Experiment 1 now carries two ceilings: **F** (strict `json_schema`) and **G**
(`json_object` mode — valid JSON, no schema). Whichever the model does not
support is recorded in `unsupportedConfigs` and printed in the paper as *not
supported by this model*, never as a 0 % rate and never as a `??`.

Three consequences worth knowing before changing a default:

1. **exp1 cannot run on the compound systems.** It varies `reasoning_effort`
   and, in configuration F, strict constrained decoding. Compound documents
   neither. Pointed at compound the ablation would print six rows of which A/C
   and B/D were the same configuration, so the script refuses to start
   (`--model` overrides, but only to a model that supports both).
2. **The compound systems are agentic.** They may invoke built-in web search or
   code execution while answering, which means a candidate document can leave
   the provider boundary. That is an architectural claim in Sec. III of the
   paper, so it has to be stated, not assumed away.
3. **prompt-guard-2-86m does not generate.** It is a 512-token injection
   classifier: it returns a label for the text it is given. Feeding it a résumé
   prompt yields no analysis, so it belongs in exp3 as a defense arm — screen
   the document, block it if flagged, and report the false-positive rate on
   clean documents next to the block rate. A filter that flags everything stops
   every attack and is useless.
