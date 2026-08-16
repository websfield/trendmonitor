# Phase 3 — C2 Gate A scoring lanes (BAS, VPS, the model that never decides) — Completion Evidence

**Status: Complete — Ready.** Both Critical-Path gates PASS. DoD satisfied. Closes deferral D1.

## Gate verdicts
| Reviewer | Critical Path | Round 1 | Round 2 | Final |
|---|---|---|---|---|
| `veto-integrity-reviewer` | Veto & verdict integrity | **PASS** (Grade A) | — | **PASS** |
| `measurement-reviewer` | Measurement discipline | NEEDS CHANGES (Grade B) | **PASS** (Grade A) | **PASS** |

## Entry gate (artefact: `phase-3-entry-gate.md`, re-verified post-fix)
- `dotnet build UgcIntelligence.slnx` → 0W/0E
- `dotnet test tests/Architecture` → **266 passed** (192 Phase-0/1 + 74 Phase-3, none weakened)
- 65 Python tests green (no regression) · schemas parse

## Acceptance Criteria (all PASS)
A1 hook<50 ⇒ ≥REVISIONS even when degraded · A2 model output never reaches veto/verdict (type-granularity IL scan, falsifiable) · A3 two parse failures ⇒ NEEDS_REVIEW, no default score · A4 out-of-range clamped, anomalous, excluded from calibration · A5 shareability contributes exactly 0 · A6 VPS composed in C#, judge type has no Vps/Bas/verdict · A7 no trend/mechanism reachable from any scoring path (falsifiable) · A8 generic revision note fails acceptance · A9 every stored score pins VersionTriple + breaker_state_at_score · A10 APPROVED still requires human_approved_at.

## Defect caught in build (self-review, control engineer)
`ScoringService` would have AI-scored a V6-excluded minor. Guarded: any submission with a fired OR unevaluable veto is not scored (model not called, no `SubmissionScored` emitted); verdict from the compliance branch alone. Tests `V6Excluded_IsNotScored_ModelNotCalled`, `FiredVeto_IsNotScored_ModelNotCalled` (throwing fake judge → non-vacuous).

## Round-1 measurement finding resolved
**Audio-degradation enforced in C#, not trusted from the model.** When `audio_present==false`, `Composition.ApplyAudioDegradation` forces `degraded=true` on the three audio-dependent criteria: `degraded = model_degraded OR (audio_absent AND audio_dependent)` — the model can raise a degradation but never clear one the missing audio implies (the compliance thesis applied to confidence). The audio-dependent set is sourced from `rubric-v1.json` `vps.criteria[].audio_dependent` with drift guard `CompositionTests.AudioDependentSet_MatchesRubricExactly`. Enforcement proven on the stored event by `AudioAbsent_ForcesDegraded_EvenWhenModelSaysOtherwise` (falsifiable), plus `AudioPresent_HonoursModelDegradedFlag`.

## Definition of Done
- ✅ Entry gate clean; build + test green
- ✅ `veto-integrity-reviewer` PASS · `measurement-reviewer` PASS
- ✅ Acceptance criteria met with cited evidence
- ✅ D1 closed (verdict ladder extended with bas/hook/vps branches)

## Accepted residuals / deferrals (tracked, non-gating)
1. **`APPROVED_WITH_NOTES` keys on `vps < 70` only**, not the plan's "or open notes exist" clause — deliberate deferral: no open-notes input to `Resolve` and no data model for advisory notes on a passing submission yet. Only effect: a clean high-VPS piece resolves APPROVED not APPROVED_WITH_NOTES, and APPROVED still needs a human click (no auto-approval). Wiring point: **Phase 9** notes-attachment model → `Resolve` gains an `openNotes` boolean (never a model-output parameter), branch becomes `vps < 70 || openNotes`.
2. **Composite confidence-band widening deferred to Phase 4** (with the breaker bands). Raw `audio_present`/`degraded`/`anomalous` flags are all stored on `SubmissionScored`, so the widened band is computable later — no `Proxy`-as-`Measured` in the interim.
3. **In-memory persistence** (matching Phase 0/1) — accepted by prior reviewers.
4. **`breaker_state_at_score`** pinned as fail-closed default `cold` this phase; the real breaker read is wired in Phase 4.
