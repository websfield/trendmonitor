# Phase 2 — Indexing (5 sub-stages) + Moment Extraction

**Feature:** cutdown · **Depends on:** 1 · **Owner agent:** general-purpose

## Project Conventions Pinned (READ FIRST)

*(Identical block to `cutdown-phase-1.md` §Project Conventions Pinned — golden rules 1–9 verbatim, Cutdown independence + contract-docs-are-law + stack + schema rules + agent roster. Paste that block here verbatim when handing this phase to an agent; it is normative for this phase.)*

Phase-2 additions:
- Python work lives in `cutdown/workers/indexer-python/` under the uv workspace; entrypoints are `["uv", "run", ...]` argv arrays (tech-spec §6.2). Model configs are part of the cache key (REQ-005).
- Engine decisions are settled: faster-whisper (D-17), PySceneDetect (D-18), PaddleOCR (D-19), silero-vad + PANNs (D-20), deterministic Moment segmentation (D-31). Do not swap engines; a forced swap (e.g. install failure) is a `decisions.md` append per the escalation protocol.

## Requirements Checklist (functional)

- [ ] REQ-010 (word-level transcript, verbatim separate), REQ-011 *Phase-0 subset per D-17* (segment turns + optional speaker-map corrections + low-confidence marking), REQ-012 (hard cuts, fades, camera changes, longer scene grouping; every threshold recorded), REQ-013 (OCR + shot/Moment descriptions), REQ-014 (**all named quality fields**, not a sample), REQ-015 (classified audio events), REQ-017 *Phase-0 subset* (transcript embeddings only), REQ-018, REQ-019
- [ ] tech-spec §15 steps 3–4 *Done when* criteria

## Requirements Checklist (technical)

- [ ] One public `index` skill; sub-stages as internal resumable checkpoints in `run-log.jsonl`, per-sub-stage fixtures (tech-spec §6.5)
- [ ] Index artefacts keyed by content hash + indexer version; envelope metadata outside the content hash (tech-spec §3)
- [ ] TRACEPARENT propagated CLI → Python subprocesses (tech-spec §13)

## Implementation Tasks

| # | Task | File(s) |
|---|---|---|
| 1 | indexer worker scaffold + shared sub-stage harness (input hash check, checkpoint write, resume skip, structured errors) | `cutdown/workers/indexer-python/src/harness.py` |
| 2 | Transcript/speaker sub-stage: faster-whisper, word timestamps, segment turns and confidence; verbatim vs display text separate. Accept optional `--speaker-map <yaml>` mapping stable turn IDs to names/corrections; preserve original inference and corrected value with author/timestamp lineage | `.../transcript.py`, `.../speaker_map.py` |
| 3 | Shot/scene sub-stage: PySceneDetect ContentDetector + ThresholdDetector for hard cuts/fades; camera-change signals; versioned adjacent-shot grouping for longer scenes using transcript, visual, and temporal continuity. All detector and grouping thresholds are stored in the index | `.../shots.py`, `.../scenes.py` |
| 4 | OCR sub-stage: PaddleOCR on per-shot keyframes, time-ranged text | `.../ocr.py` |
| 5 | Visual-description sub-stage: VLM adapter (Anthropic, selective keyframes only — count logged), shot-level descriptions; **skippable with `--no-vlm`** until the D-21 spend ceiling is set (recorded-fixture path still tests it) | `.../visual.py`, `cutdown/workers/indexer-python/src/model_gateway.py` |
| 6 | Audio-events sub-stage: silero-vad + PANNs CNN14 + RMS-delta energy track | `.../audio_events.py` |
| 7 | Quality-flags sub-stage with a field-by-field REQ-014 matrix: blur, shake, under/overexposure, black/frozen frames, occlusion, poor crop, low resolution, duplicate frames, audio clipping, noise, speech intelligibility, and silence. Each field has positive + negative fixtures and records algorithm/version/threshold | `.../quality.py`, `cutdown/skills/index/fixtures/quality/**` |
| 8 | `source-index-v1` assembly: merge sub-stage artefacts, rational-timebase normalization map (VFR → explicit mapping), indexer-version stamp | `.../assemble_index.py` |
| 9 | Moment extraction (D-31): speaker-turn × shot-boundary segmentation, 3–30 s, full REQ-018 field population; **transcript-text embedding per Moment computed here** (bge-small-en-v1.5 local, D-22 — stored on the Moment artefact so Phase 3 retrieval reads vectors, never calls Python); optional LLM narrative-tag enrichment behind the same `--no-vlm`-style flag | `.../moments.py`, `.../embed.py` |
| 10 | **Source-bounds check — single implementation**: `range-check.ts` in the contracts package is the *only* implementation; `cutdown index` runs it as a deterministic CLI post-step over every generated Moment (and Phase 3's `validate` reuses it for EDL ranges). The Python test suite exercises it **through the CLI** against a committed fixture corpus with expected verdicts — no second Python implementation to drift | `cutdown/packages/contracts/src/range-check.ts`, `cutdown/workers/indexer-python/tests/test_bounds.py` (drives the CLI), `cutdown/packages/contracts/fixtures/range-check/**` |
| 11 | `cutdown index <job-id>` CLI wiring incl. per-sub-stage resume; TRACEPARENT env propagation | `cutdown/apps/cli/src/commands/index.ts` |
| 12 | Per-sub-stage fixtures: speaker correction + low-confidence cases; hard cut/fade/camera-change/semantic-scene cases; every REQ-014 quality flag with present/absent controls; exact deterministic outputs and recorded-model VLM enrichment | `cutdown/skills/index/fixtures/**` |

## Edge Cases & Failure Paths

- Silent clip → transcript empty but valid; Moments fall back to scene/shot segmentation. Unknown speaker-map turn ID or duplicate correction → validation failure, original inference untouched. Music-only/non-English → flagged. Static take → time-sliced fallback. Fade and camera-change fixtures must not collapse into one unbounded scene. Offline model failure names model/cache and remains resumable. Kill mid-stage resumes. VFR bounds use the mapping. CPU fallback is recorded and D-17 throughput escalation remains active.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Proof |
|---|---|---|---|
| HF/model downloads | offline / gated | structured error naming model; other sub-stages proceed; resume completes later | offline-mode test |
| Anthropic API (VLM) | error / no ceiling set | sub-stage skipped with `--no-vlm` semantics + WARN in index artefact; never a fabricated description | fixture asserting `descriptions: absent, reason` |
| Python subprocess | crash mid-stage | checkpointed resume; no partial index artefact (atomic write) | kill-during-run test |

## Handoff Contracts (consumed by Phase 3+)

- `source-index-v1` + `moment-v1` artefact shapes on disk (`index/`, `moments/`), including the timebase-mapping record **and the per-Moment embedding vector + model ID** (Phase 3's `retrieval.ts` consumes stored vectors in-process; it never invokes Python).
- The exported range-check (`range-check.ts`) — Phase 3's `validate` skill and Phase 4's render preflight both call it.
- `model_gateway.py` provider adapter for the VLM sub-stage only (Phase 3's TS gateway mirrors its config surface; keys from `cutdown/.env` only).

## Verification Steps

1. Phase 1 gates green (predecessor proof: its acceptance evidence on disk).
2. `cutdown index test-1` (Phase 1's `clean.mp4` job) → all sub-stage artefacts + assembled index + Moments with embeddings (requires Phase 1's ingested jobs).
3. Kill the process during OCR; re-run → transcript/shots skipped, OCR resumes (requires step 2 started).
4. `cutdown index test-1 --speaker-map <fixture>` → corrected name appears with original inference and author/timestamp preserved; bad turn IDs fail.
5. Scene fixtures prove hard cut, fade, camera change, and longer grouping; the quality matrix proves all twelve REQ-014 signals both present and absent.
6. `cutdown index test-2` → VFR bounds green; `cutdown index test-3` → silent scene/shot fallback.
7. `uv run --directory cutdown pytest workers/indexer-python/tests` + `cutdown test:skills index` → green.

## Acceptance Criteria (PASS/FAIL)

- tech-spec §15 steps 3–4 *Done when* met verbatim (fixtures per sub-stage; artefacts hash-keyed; property test green on all fixtures — test names as evidence).
- Resume-after-kill demonstrated (test name / recorded run log showing skip).
- Every Moment field of REQ-018 populated or explicitly null-with-reason (schema-enforced; fixture evidence).
- REQ-011/012/014 coverage matrices are complete: every promised field has an implementation, positive fixture, negative fixture, and recorded threshold/model version.
- No re-index on unchanged content (cache-hit log line).

## Out of Scope

Editorial retrieval/ranking (Phase 3), frame/clip embeddings and near-duplicate grouping (REQ-017 remainder), rendering, `.claude` mirror. Real diarisation/forced alignment (D-17 triggers). Transcript embeddings on Moments are explicitly **in** this phase. No engine swaps.

## Completion Criteria (Definition of Done)

Cutdown entry gate green; `code-reviewer` PASS; honest report; new decisions appended to `decisions.md`.
