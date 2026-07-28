---
name: propose
skillVersion: 1.0.0
description: Propose N distinct CreativeBrief angles from a job's Moment Graph, or refuse with a reason when the footage cannot support them (REQ-036).
entrypoint: ["node", "dist/src/main.js"]
execution: sync
inputSchema: ./schema/input.json
outputSchema: ./schema/output.json
contractsUsed:
  - job-brief-v1
  - moment-v1
  - creative-brief-v1
sideEffects: [reads-project-data, writes-project-data, network]
timeoutSeconds: 300
---

# propose — CreativeBrief angle generation

Implements tech-spec §7's `cutdown propose <job-id> --variants N` and PRD
REQ-030/031/034/036. The MODEL PROPOSES angles; deterministic code VALIDATES and
owns every reject (decisions.md D-37).

## What it does

1. Loads the job's `JobBrief` (newest in `brief/`) and every `Moment` (`moments/`).
2. Ranks the Moments against the brief (retrieval; a query vector is supplied via
   `queryVectorPath`, else computed by the Python `embed_query` entrypoint).
3. Runs the deterministic `assessFootageSufficiency` pre-check. If the indexed
   footage cannot support N genuinely distinct angles, it emits the REQ-036
   **refusal** variant — fewer-with-a-reason, never a padded weak cut.
4. Otherwise calls the editorial gateway (structured output) to propose N angles,
   then — inside the gateway validator so a bad response gets D-32's one repair —
   assembles full CreativeBriefs, validates them against `creative-brief-v1`,
   asserts every referenced Moment id was offered in the input (a hallucinated id
   is a hard reject, REQ-034), and computes `distinctness` in code (REQ-031).
5. Writes each CreativeBrief to `creative-briefs/` and returns their refs.

## Output is a tagged union

`{kind:"briefs", ...}` (success), `{kind:"refusal", ...}` (REQ-036), or
`{kind:"skipped", code:"MODEL_NOT_CONFIGURED", ...}` — so "refuse", "succeed", and
"the gateway isn't configured" are distinct, honest states rather than one being
smuggled inside another. A refusal is an honest result, not a failure.

## Model configuration

When `recordedModelPath` is given (tests, recorded-fixture proving) the gateway
replays a captured response over an injected transport — never the network. When
it is absent and the gateway is unconfigured (no key / no D-21 spend ceiling), the
skill returns the clean `skipped` result rather than attempting a paid call.
