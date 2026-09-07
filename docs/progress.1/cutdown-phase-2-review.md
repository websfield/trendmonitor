# Phase Review — cutdown Phase 2 (Indexing + Moment Extraction)

**Feature:** cutdown · **Phase:** 2 · **Date:** 2026-07-22 · **Verdict: Almost**

Phase 2 is **implementation-complete and gated**, with four accepted residuals
carried forward and named below. Every one of the twelve Implementation Tasks
landed with tests; the entry gate is green; both reviewer rounds were run and
their confirmed findings fixed. It is **not** marked Ready because two of the
residuals are the same class of defect the phase itself blocked on (an empty
result indistinguishable from work that did not run), and because one fix in
this phase was a self-inflicted regression that only a reviewer caught.

## Entry gate (must be clean before any reviewer runs)

| Command | Result |
|---|---|
| `uv run pytest workers/indexer-python/tests packages/contracts/tests -m "not slow"` | **641 passed**, 17 slow deselected, 0 fail |
| `uv run pytest ... -m "slow"` (real models) | 9 passed (real PANNs CNN14 + pinned digest path) |
| `pnpm test` (aggregate, exit 0) | **311 passed**, 0 fail — contracts 70, renderer-core 65, skill-runtime 38, cli 80, ingest 31, brief 27 |
| `cutdown validate:contracts` | PASS — 15 cases, 0 lint violations, 0 cross-validator disagreements |
| `cutdown build:contracts --check` | PASS — generated trees current |

Total: **952 tests passing, 0 failures.**

The UGC entry-gate commands (`dotnet`, root `pytest`, frontend) do not apply:
tech-spec §14 exempts cutdown-only changes. The three UGC schemas were confirmed
still parsing (untouched).

## Acceptance Criteria (phase plan)

| Criterion | Verdict | Evidence |
|---|---|---|
| tech-spec §15 steps 3–4 *Done when* met | **PASS** | Each of the seven sub-stages has an owning module, its own fixtures, and artefacts keyed by content hash + indexer version. Bounds property test green over generated Moments (`test_bounds.py::TestGeneratedMomentsAreInBounds`) |
| Resume-after-kill demonstrated | **PASS** | `test_harness.py::TestResume` (7 tests incl. other-sub-stages-resume-independently); live proof — second `cutdown index` run served **7/7 sub-stages from checkpoint** |
| Every Moment field of REQ-018 populated or explicitly null-with-reason | **PASS** | Schema-enforced; asserted against the generated Pydantic `Moment` in `test_moments.py::TestEveryRequiredFieldIsPopulated` and `TestNullWithReasonNeverFabrication` |
| REQ-011/012/014 coverage matrices complete | **PARTIAL** | REQ-011 and REQ-012 complete with recorded thresholds. REQ-014: **11 of 12** kinds fully implemented; `poor_crop` covers framing only, not subject-clipping (see Residual 1) |
| No re-index on unchanged content | **PASS** | `cacheHits: 7` on the second live run; `test_harness.py::TestResume::test_first_run_computes_and_second_run_is_a_cache_hit` |
| Source-bounds check is a SINGLE implementation | **PASS** | `range-check.ts` only; Python drives it through the CLI (`test_bounds.py`, 25 tests) rather than reimplementing it |

## Reviewer gate

Per `CLAUDE.md`'s Critical-Path table and tech-spec §14, cutdown touches **none**
of the four UGC Critical Paths, so the generic reviewers applied — never zero
reviewers.

| Round | Reviewer | Verdict | Outcome |
|---|---|---|---|
| 1 | security-reviewer | **BLOCK** | 1 HIGH, 2 MEDIUM, 2 LOW — all fixed |
| 1 | code-reviewer (TypeScript) | **BLOCK** | 1 BLOCK, 7 CHANGE, 4 OPTIONAL — all fixed |
| 1 | code-reviewer (Python worker) | **BLOCK** | 3 BLOCK, 5 CHANGE, 4 NOTE — all BLOCKs + 4 CHANGEs fixed |
| 2 | code-reviewer (verification) | **BLOCK** | 17/19 verified CLOSED; **1 REGRESSION** + 1 PARTIAL found and fixed |

Round 2 is the final round (the `/implement` two-round limit). Remaining
findings are carried as residuals below rather than fixed in a further loop.

### The defects that mattered

Two of the three round-1 BLOCKs were in code written by the driving session, and
one was a **test that could not fail**:

1. **Mixed timebases unioned as raw integers** (BLOCK). Sub-stages emit ticks in
   three different timebases — 16 kHz for transcript/audio, container video
   (1/15360) for shots/OCR, mixed frame/sample for quality. The orchestrator
   unioned them directly, silently displacing every Moment boundary. Worse, a
   16 kHz tick is numerically *larger* than the video tick for the same instant,
   so out-of-range detections were **dropped rather than reported** — observed
   live in job `idx-1`, where a speech end at 4.98 s was discarded against a
   5.0 s asset. Two modules in the same diff (`scenes.py`, `quality.py`) already
   stated and obeyed this rule. Fixed with exact `Fraction` rescaling; verified
   on the real artefact (**exactly one timebase now appears across every
   collection**).
2. **`Number.isInteger` where `Number.isSafeInteger` was needed** (BLOCK). Above
   2^53 the tick was already destroyed by `JSON.parse`, so an out-of-bounds
   range was reported **clean** — the exact defect `range-check.ts` exists to
   catch. The test claiming to cover it was a tautology: both literals rounded
   to the same value, so it demonstrated float rounding while asserting the
   opposite. **A test that cannot fail is what let the BLOCK land.**
3. **Unvalidated `jobId`/`assetId` in the Python worker** (HIGH security).
   Arbitrary file write/read outside `project-data/`. The TypeScript CLI guarded
   `jobId`; the Python worker — whose own docstring documents direct invocation
   — did not, and `assetId` was validated nowhere.
4. **Artefacts written before the gate that claimed to refuse them** (BLOCK).
5. **A self-inflicted regression** (round 2). The round-1 fix for the VFR
   timebase map refused every `vfr`, `unknown` and audio-only asset, gated on a
   field no code produces, as a bare `ValueError` fired *after* the paid VLM
   stage. Trading a silent lie for a hard outage is not a fix. Corrected: empty
   `entries` is honest when the normalized timebase **is** the source timebase
   (identity resolution holds for VFR too); only a genuine re-basing without a
   mapping is refused.

## Live proving runs (fixture footage)

Two assets were indexed end to end through `cutdown index`, and the artefacts on
disk are the evidence — not the console output.

| Asset | Job | Result |
|---|---|---|
| `clean.mp4` (CFR, 5.0 s) | `idx-1` | 8/8 sub-stages recorded, `boundsCheck {checked: 1, ok: true}`, Moment spans the full asset. Re-run served **7/7 from checkpoint** with an **identical `indexId`** — resume and deterministic identity both proven |
| `ugly.mp4` (**VFR** + rotation + HDR metadata, 3.8 s) | `idx-vfr` | Indexed successfully — the case the round-1 regression had made impossible. `timebaseMap: vfr, entries: 0` (honest identity resolution), Moment range `0 → 58368` exactly equalling the asset duration (half-open end, in bounds) |

**Exactly one timebase (1/15360) appears across every collection in both
indexes** — the direct, artefact-level proof that the mixed-timebase BLOCK is
closed, on a VFR source as well as a CFR one.

## Definition of Done

| Item | Verdict |
|---|---|
| Cutdown entry gate green | **PASS** |
| `code-reviewer` PASS | **NOT MET** — round 2 closed 17/19 and its two new findings were fixed, but no third round was run to confirm (two-round limit) |
| Honest status report | **PASS** — residuals below |
| New decisions appended to `decisions.md` | **PASS** — D-43 (single pinned OpenCV distribution) |

## Residuals (carried forward, not fixed)

1. **`poor_crop` is half-covered (REQ-014).** Detects letterbox/pillarbox
   framing, not subject-clipping. A saliency rule was built, measured
   (1.18 textured / 0.16 flat / 0.77 edge-clipped), found to have no
   content-independent fire point, and **removed** rather than shipped as a
   detector tuned to one footage type. Closing it needs a subject/face model.
2. **`quality.py` omits a whole modality silently.** When a video stream is
   absent or unprobeable, the artefact carries no video flags and the ledger
   says `completed, reason: null` — indistinguishable from a clean picture.
   This is the same "did we look?" ambiguity the phase blocked on twice
   elsewhere; it deserves the same `_skipped()`-with-reason treatment.
3. **`quality.py::iter_luma_frames` ignores ffmpeg's exit status** and never
   drains stderr. A mid-stream decode failure truncates the frame series and the
   resulting flags read as clean. This project already documents (in
   `probe.ts`) that ffmpeg exits 0 on truncated input, so the evidence is in
   hand. Pipe-deadlock risk needs >64 KB of stderr.
4. **`silence` semantics disagree between two modules.** `audio_events.py`
   synthesises a whole-asset `silence` detection for an asset with no audio
   stream; `quality.py` argues the opposite ("silence is a property of audio
   that exists"). Both are individually defensible — this needs a decision
   record before Phase 3 consumes `audioEvents`, or the inconsistency becomes
   load-bearing.

Minor, unfixed: `_SAFE_ID` accepts Windows reserved device names (`con`, `nul`)
— a confusing failure, not an escape; `checkSourceRanges` skips holes in a
sparse array (unreachable from `JSON.parse`); `range-check` is a bare verb
behaving as a meta command (tech-spec §7 naming only).

## Deviations from the plan

- **Delegation.** The plan names `general-purpose` as the owner agent. Six
  sub-stages and the Phase-1 test-gap fix were delegated to parallel
  general-purpose agents against a shared written contract; the harness,
  assembly, Moment extraction, range-check, orchestrator and all gate work were
  done by the driving session. One agent (T4/OCR) ended without a completion
  report — its work was verified directly (45 fast tests) rather than assumed.
- **Phase-1 residuals fixed in this phase.** `pnpm test` failed in aggregate
  (three packages declared a test script with no tests directory, so
  `skills/brief` had **zero** tests); the `pnpm cutdown` script pointed at a
  non-existent path, breaking the documented entry-gate command. Both fixed,
  +145 tests added.
- **A dual-validator disagreement was found and fixed.** Ajv and Pydantic
  disagreed on *fixture discovery* — the gate whose entire purpose is
  cross-validator agreement disagreeing with itself.
- **Toolchain.** A single OpenCV distribution had to be pinned (D-43); three
  distributions were clobbering one `cv2/` directory and breaking three engines
  at import while the installer reported success.

## Exit-criterion mechanism (built here)

The "zero invalid source ranges in final renders" criterion is now measurable:
`range-check.ts` is the single implementation, `cutdown range-check` exposes it,
`cutdown index` refuses to commit an index whose Moments fail it, and both the
TypeScript and Python suites drive the same committed corpus. An empty range
list exits 2 — "nothing to check" can never be reported as "nothing wrong".
