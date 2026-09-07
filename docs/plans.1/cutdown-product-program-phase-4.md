# Stage 4 — Indexing and rendering upgrade (OUTLINE)

**Governing PRD phase:** Phase 1. **Depends on:** Stage 1.
**Detail level:** Outline + gates. **Re-planning trigger:** run `/create-plan` when Stage 1 is proven complete on disk.

---

## Objective

Widen the creative vocabulary from "hard cuts and duration-preserving fades" to something a producer would call editing, and make indexing fast enough to use — without losing the byte-identical determinism that Phase 4 proved.

## Requirement bindings

REQ-017 remainder (frame/clip embeddings, near-duplicate grouping) · REQ-104 (caption accuracy) · D-17 revisit triggers (diarisation, forced alignment) · Remotion adapter + determinism tiers 2–3 · **supersession of D-47**.

## Two halves

**Indexing.** The real run spent ~3 hours on 183 seconds of footage, ~95% of it in PaddleOCR at 30–120 s per shot-keyframe. Selective and deduplicated OCR is the single highest-leverage fix in the whole program's engineering surface. Then: real diarisation replacing heuristic speaker turns; forced alignment; subject/face/product tracks; stable crop tracks; frame/clip embeddings and near-duplicate detection; watermark, provenance-risk and privacy classifiers. Subject tracks are also what finally closes the `poor_crop` residual — it cannot detect subject clipping today because no subject model exists.

**Rendering.** Mixed silent/audio timelines; dialogue cleanup; music ducking; per-clip audio matching; licensed and native music modes; animated captions; subject-aware reframe; crossfades; split-screen; motion graphics; colour/HDR conversion; clean masters.

## D-47 must be superseded, not ignored

`subject_reframe` and `split_screen` are **currently refused by a settled decision**. This stage may not implement them until a new decision appended to `decisions.md` supersedes D-47 with its reasoning — most likely "the subject tracks that made the refusal correct now exist". Silent reversal is precisely the drift the append-only decision log exists to prevent.

## Exit gate (PASS/FAIL)

| # | Criterion | Source |
|---|---|---|
| E1 | Technical QA first-pass ≥ **98%** of final renders pass automated QA on first final render | PRD §14.1 |
| E2 | Caption readiness ≥ **98%** token accuracy on supported-language golden sets | PRD §14.1 |
| E3 | **No routine reliance on waivers** — the real proving run needed four; a warning-waiver is for the exceptional case | D-35 intent |
| E4 | Indexing latency budget met per worker class, with the budget stated per source minute | PRD §14.1 measurement column |
| E5 | Index cache hit rate on reused assets ≥ **95%** | PRD §14.3 |
| E6 | Render failure rate after valid preflight < **2%** | PRD §14.3 |
| E7 | Tier-1 byte-identical determinism still proven, for **every** new filter path | Phase 4 precedent |

## Risks that must not be discovered late

1. **Determinism regression.** Byte-identical Tier-1 output on FFmpeg 8.0.1 is a hard-won asset and every new filter, codec or font path can destroy it. Every new path needs its determinism test **in the same phase** — Phase 4's reviewer found a gate built, unit-tested and never wired into the production runner, twice.
2. **The QA gate must be wired, not merely written.** Same lesson, same file family.
3. **Selective OCR that skips the wrong frames** produces silently worse indexes — the failure is invisible downstream. Needs a recall measurement against the current exhaustive baseline before the old path is removed.
4. **New model dependencies** (diarisation, subject tracking) each need a decision record and an import-proven install — a dependency install is proven by *importing* the package, never by the installer's exit code (`CLAUDE.md` Lessons, 2026-07-21).
