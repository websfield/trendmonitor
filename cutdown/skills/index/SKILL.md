---
name: index
skillVersion: 1.0.0
description: Index one ingested asset — transcript and speaker turns, shots and scenes, on-screen text, visual descriptions, audio events, quality flags — then cut the deterministic Moment Graph with transcript embeddings.
entrypoint: ["uv", "run", "--project", "../..", "python", "../../workers/indexer-python/src/main.py"]
execution: sync
inputSchema: ./schema/input.json
outputSchema: ./schema/output.json
contractsUsed:
  - source-index-v1
  - moment-v1
sideEffects: [reads-project-data, writes-project-data, network]
timeoutSeconds: 7200
---

# index — one public skill, seven internal sub-stages

Implements tech-spec §15 build-steps 3–4, covering PRD REQ-010 through REQ-019.

## Why one skill and not seven

tech-spec §6.5 fixes this: `index` is **one public surface** while transcript,
shots, scenes, OCR, visual description, audio events, quality flags and Moment
extraction are internal sub-stages. Each is an individually resumable checkpoint
in `run-log.jsonl` with its own fixture directory.

The reason is churn. The sub-stage list is the part of this pipeline most likely
to change — a better VAD, a real diarisation model, frame embeddings — and every
sub-stage promoted to a public skill would be a registry entry, a CLI command, a
`.claude` mirror file and a contract that all have to stay stable. One public
surface keeps that churn internal.

## Resume

Every sub-stage is keyed by `content hash + indexer version + model config`
(REQ-005). A sub-stage whose checkpoint records the same key **and** whose
artefact is still on disk is skipped, and the skip is logged as a cache hit.
Both halves are required: a checkpoint without its artefact is exactly what a
crash between the two writes produces, and treating it as complete would hand
the next sub-stage a missing input.

Killing the process during OCR and re-running therefore skips transcript and
shots, and resumes at OCR.

Model config is inside the cache key because swapping a whisper model changes the
transcript for byte-identical media; a key that ignored it would serve a stale
artefact forever.

## Rules it enforces

- **Segmentation is never model-driven** (decisions.md D-31). Moment boundaries
  come from the intersection of speaker turns and shot boundaries, targeting
  3–30 s. A model may enrich `candidateNarrativeFunctions` and nothing else. The
  produced artefact records `segmentation.method` and the contributing turn and
  shot IDs, so the rule is auditable from the data rather than only from the code.
- **Nothing is ever fabricated.** A sub-stage that did not run leaves an empty
  collection plus a `subStages` record carrying `status` and a `reason`. A Moment
  with no visual description carries `visualSummary: {value: null, absentReason}`.
  "We did not look" and "we looked and found nothing" stay distinguishable.
- **Verbatim and display transcript text stay separate.** The deterministic
  quotation gate tokenises the verbatim side, so a cleaned caption can never
  launder a misquote past it.
- **Every range is bounds-checked.** `cutdown index` runs `range-check.ts` — the
  single implementation — over every generated Moment. This is the mechanism
  behind the "zero invalid source ranges" Phase 0 exit criterion.
- **Volume alone is never emotional importance** (REQ-015). An energy cue names
  the classified audio events that justified it.
- **Timecode is rational.** Integer ticks plus a `{num, den}` timebase, never
  float seconds. A VFR source carries an explicit normalisation map (REQ-019)
  rather than an assumed frame rate.

## What it does not do

No editorial retrieval or ranking (Phase 3), no rendering (Phase 4). Frame and
clip embeddings and near-duplicate grouping are REQ-017's remainder, deferred to
product Phase 1 — only **transcript** embeddings are computed here. Real
diarisation and forced alignment remain deferred under D-17.
