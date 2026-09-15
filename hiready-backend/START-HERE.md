# Run the five experiments on the updated models

Everything the paper reports comes from these scripts. Nothing is typed in by
hand: `make_results.py` reads the JSON they write and regenerates every table.

## 1. Replace the old harness — do this first, nothing else works without it

The probe script, the model registry and the `power` profile live in the
updated folder. If you skip this step, `probe-capabilities.js` will not exist
and `--profile power` will not be recognised, because your `experiments\` is
still the previous version.

Unpack `hiready-experiments-updated.tar.gz`, then copy into `hiready-backend\`,
replacing what is there:

```
hiready-backend\
  experiments\          <- REPLACE THE WHOLE FOLDER (do not merge)
  ..\make_results.py    <- replace (it lives beside the paper)
```

Delete the old `experiments\` folder rather than copying over it: a merge
leaves stale files behind and the two versions disagree about defaults.

Also copy `RUN-EXPERIMENTS.bat` into `Downloads\pro major\`, replacing the old
one. Nothing new needs installing — the harness uses packages the backend
already has.

**Verify before going further**, from `hiready-backend`:

```
node experiments\run-all.js --profile power --estimate
```

Correct copy: prints a budget *and* a "Statistical power of this profile"
block. Old copy: prints `Unknown profile "power"` and stops. `experiments\VERSION.md`
lists the four files that must be present.

## 2. Clear the previous run

The old results came from `openai/gpt-oss-120b` and predate the model change.
`run-all.js` skips experiments whose result file already exists, so move them
aside or it will skip everything:

```
cd hiready-backend\experiments\out
mkdir old-gpt-oss-run
move exp*.json old-gpt-oss-run\
move exp*.trials.jsonl old-gpt-oss-run\
```

Keep that folder. If the new run breaks, the old numbers are still what the
current PDF reports, and mixing the two would be worse than either.

## 3. Start the backend (only needed for experiment 4)

In a separate terminal:

```
cd hiready-backend
node server.js
```

Experiment 4 measures real HTTP latency through auth and validation, so it needs
the server up and at least one registered user in MongoDB. If it is not running,
that one experiment fails and the other four still complete.

## 4. Run it

Double-click `RUN-EXPERIMENTS.bat`, or from `hiready-backend`:

```
node experiments\probe-capabilities.js
node experiments\run-all.js --profile power
```

The probe runs first and settles what the compound systems actually support. To
see the cost and the interval widths before committing the time:

```
node experiments\run-all.js --profile power --estimate
```

| profile | calls | time | interval at p=0.5 |
|---|---|---|---|
| `free` | ~450 | ~1 h | ±20-26 pts (directional only) |
| `full` | ~1500 | ~2.5 h | ±7-12 pts |
| `power` | ~3150 | several hours | ±5-10 pts |

`--only 2,3` runs just the experiments that sit on the free compound models.
Experiment 1 stays on `openai/gpt-oss-120b`, because it varies
`reasoning_effort` and compound has no such control — that is the part that
consumes metered quota.

Stopping and restarting is safe: finished experiments are skipped.

## 5. Send back

Everything in `experiments\out\`:

- `model-capabilities.json` — what the probe found
- `exp1..exp5 .json` — the aggregates the paper reads
- `*.trials.jsonl` — per-trial logs, so any aggregate can be recomputed
- `run-all.log` — including any rate-limit abort

Then, from the paper folder: `python make_results.py` regenerates every table
and tells you what is still missing.

## What to expect, honestly

- **A rate-limit abort is a success, not a failure.** If more than half the
  trials in an experiment never reach the model, it stops and writes no file. A
  file of zeros looks like a finding and is not; that is exactly what ruined the
  first run of this harness.
- **Experiment 1 may print `config F skipped`.** That happens when the probe
  found no strict `json_schema` support for the model being used. The paper then
  prints *not supported by this model* for that row rather than a rate.
- **Free is not unlimited.** The compound systems have no spend cap on the
  developer plan, but per-minute request and token ceilings still apply. The run
  paces itself and backs off on 429; it will take hours, and that is normal.
