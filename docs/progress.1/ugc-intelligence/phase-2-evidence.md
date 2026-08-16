# Phase 2 — Extraction Service (versioned `FeatureRecord`) — Completion Evidence

**Status: Complete — Ready.** Measurement gate PASS (Grade A, after one NEEDS-CHANGES round). DoD satisfied.

## Gate verdict
| Reviewer | Critical Path | Round 1 | Round 2 | Final |
|---|---|---|---|---|
| `measurement-reviewer` | Measurement discipline | NEEDS CHANGES (Grade B) — 1 CHANGE + 1 promoted CHANGE + 2 doc NOTEs | **PASS** (Grade A) | **PASS** |

Phase 2 touches only the Measurement discipline Critical Path (per master-plan reviewer-selection table), so this single gate governs.

## Entry gate (re-verified post-fix)
- `uv run ruff check src/IntelligencePlane tests/architecture` → All checks passed
- `uv run pytest` (default testpaths, casing-corrected) → **65 passed** (26 extraction + 16 provenance + 23 trends)
- 192 C# tests green (no regression) · 3 contract schemas parse

## Acceptance Criteria (all PASS)
A1 cross-version comparison raises · A2 ≥3 frames in hook window + true first frame · A3 audio-absent degrades hook/emotional/completion, band widened, **hard gate still applies** · A4 transcript_source recorded · A5 OCR failure ⇒ `onscreen_text_complete=false`, absence proves nothing · A6 `Untrusted[str]` cannot reach a prompt unfenced · A7 non-allowlisted source refused · A8 de-identification drops frames+transcript, retains derived scalars · A9 OCR contrast is a 3-band enum not a float.

## Round-1 finding resolved
**`filler_word_rate` completeness marker.** An audio-derived scalar that survives de-identification into Phase 8 prevalence counts had no completeness marker — a no-audio `0.0` was indistinguishable from a measured zero (the OCR absence-vs-incompleteness class). Fixed: new `AuthenticitySignals.audio_signals_complete` computed in the pipeline as `audio_present AND signal.audio_signals_complete` (an extractor cannot assert completeness the media doesn't support), threaded onto `DeidentifiedRecord`. Guarded by `test_AudioAbsent_FillerWordRate_NotCountedAsMeasuredZero` (non-vacuous).
**Promoted CHANGE — CI casing.** `pyproject.toml` testpaths `tests/architecture`→`tests/Architecture`; a lowercase path collected zero tests on Linux CI (a gate that couldn't fail). Fixed and confirmed the suite collects 63→65 across the runs.

## Definition of Done
- ✅ Entry gate clean; pytest + ruff green
- ✅ `measurement-reviewer` PASS
- ✅ Acceptance criteria met with cited evidence
- ✅ `CLAUDE.md` §Commands already covered `src/IntelligencePlane`/`tests/architecture` (no new command surface); no edit needed

## Accepted residuals (non-gating)
1. **Provenance boundary is deliberate.** Structural features (the X) carry per-feature reliability (`onscreen_text_complete`, `cut_confidence`, `DegradationFlag`, `audio_signals_complete`, `derived_at`, `extractor_version`) but are NOT wrapped in `Provenanced`/`MeasuredOutcome`. That barrier governs *outcome* metrics (the Y — engagement, `Proxy` on exemplars), joined later (Phase 3/6). Extraction produces no effect-size-bound metric, so the wrapper is genuinely not required here. Reviewer confirmed the claim correct.
2. **Deferred test seam:** `audio_signals_complete` is driven by `audio_present` alone; the "audio present but analyzer failed" path is correctly wired (the pipeline AND propagates it) but not yet exercised by a dedicated fake. Coverage gap over a correctly-wired guard, not an unguarded invariant. Follow-up test candidate.
