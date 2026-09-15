# Harness version

**2026-09-08b — post-probe revision.**

Changes since 2026-09-08:

- **Probe bug fixed.** `json_object` mode requires the literal word "JSON" in
  the prompt; the first probe omitted it, so gpt-oss-120b was recorded as
  *rejecting* json_object when the request was simply malformed. The probe now
  includes the word and reads the 400 body, reporting a malformed request as
  `error` rather than as a capability finding. An `error` outcome no longer
  writes `false` into the registry.
- **Compound no longer fails every trial.** The first probe established that
  `groq/compound` returns HTTP 400 for `reasoning_effort`. Experiments 2 and 3
  merely inherit that setting rather than varying it, so the parameter is now
  dropped (and recorded in `droppedParams`) instead of failing the call.
  Experiment 1, which does vary it, still fails loudly.
- Registry priors for both compound systems updated from *unknown* to *false*
  for all response_format modes, citing the probe.

If any of the following is missing from your `experiments/` folder, you are
running an older copy and must replace the whole folder before the run
instructions apply:

| file | what it adds |
|---|---|
| `probe-capabilities.js` | asks the provider what it actually supports |
| `lib/models.js` | model capability registry |
| `lib/power.js` | sample-size arithmetic behind the profiles |
| `VERSION.md` | this file |

Quick check, from `hiready-backend`:

```sh
node experiments/run-all.js --profile power --estimate
```

- Prints a budget **and** a "Statistical power of this profile" block → correct copy.
- Prints `Unknown profile "power"` and exits → old copy, replace `experiments/`.
- Prints a budget with **no** power block → older copy still, replace it.

Changes in this revision:

1. Generation model moved to `groq/compound`; `groq/compound-mini` added to the
   experiment 2 sweep.
2. `meta-llama/llama-prompt-guard-2-86m` added to experiment 3 as an input
   classifier arm, with a false-positive screen on clean documents. It is not a
   generation model and is not in the experiment 2 sweep.
3. Experiment 1 pins `openai/gpt-oss-120b`: it varies `reasoning_effort`, which
   the compound systems do not expose. It refuses to start on a model that
   cannot support what it varies.
4. Experiment 1 gained configuration G (`json_object` mode) beside F (strict
   `json_schema`), so a model without constrained decoding still has a ceiling.
5. `--profile power`, sized from Wilson interval widths rather than by feel.
6. An unknown `--profile` now exits instead of silently falling back to `full`.
