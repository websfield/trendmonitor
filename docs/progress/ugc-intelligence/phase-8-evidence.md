# Phase 8 — C1 Mechanism Synthesiser + C4 Knowledge API — Completion Evidence

**Status: Complete — Ready.** All three Critical-Path gates PASS, plus a best-quality hardening round re-confirmed. DoD satisfied.

## Gate verdicts
| Reviewer | Critical Path | Verdict | Re-confirm (hardening) |
|---|---|---|---|
| `boundary-reviewer` | Boundaries & authority | **PASS** (Grade A, 0 BLOCK/CHANGE) | (skipped — hardening only removes a served field) |
| `measurement-reviewer` | Measurement discipline | **PASS** (Grade A) | **PASS** (Grade A, REQ-069) |
| `veto-integrity-reviewer` | Veto & verdict integrity (ratification) | **PASS** (Grade A) | **PASS** (Grade A, falsifier lexicon) |

## Entry gate (artefact: `phase-8-entry-gate.md`, re-verified post-hardening)
- `uv run pytest` → **226 Python** · `dotnet test` → **395 C#** · ruff clean · schemas parse
- Eval plan's schema/lexicon/provenance suites green (the plan's precondition for any C4 response shipping)

## Acceptance Criteria (all PASS)
A1 forbidden fields fail schema validation (6) · A2 `synthesise()` admits no OutcomeEvent/Pattern/Snapshot/tenant · A3 synthesiser doesn't import Phase-6 proposer (transitive) · A4 C2 has no mechanism path · A4b c1 imports nothing from control plane · A5 no tenant axis · A6 warrant ladder from counts · A7 contrasted needs ≥2 ordered non-overlapping slices · A8 zero-contrast ⇒ undefined ratio, stays conjectured · A9 auto-demote / human-promote · A10 no unratified/admin/bypass · A11 no 0-100/effect-size on any C4 response · A12 every response carries warrant/provenance/never_tested_against/falsifier/version/sha256 · A13 coverage.state 4 states + blocking counts · A14 sha256 mismatch ⇒ refuse + previous verified + P1 alarm · A15 `/exemplars` URIs+booleans only, no PII · A16 forbidden verbs rejected at ratification AND serve time · A17 subtle injection unservable without ratification · A18 C4 no breaker/events/write path · A18b PrefixScopedReader can't resolve a PatternLibrary (fails) · A19 predicate about content not creator · A20 contrasted-rate by ingestion_arm reported.

## Findings resolved this phase
- **Lexicon drift (eval-found, pre-gate):** the Python ratification regex missed four causal inflections (`causing/driving/drove/driven`) the C# serve-time lexicon caught. Fixed: explicit `FORBIDDEN_VERB_FORMS` enumeration verbatim-identical to C#, with a runtime cross-plane equivalence guard (`test_both_planes_forbid_the_identical_inflected_set`, 17 forms each) so they can't re-drift.
- **Best-quality hardening (post-gate, from NOTEs):**
  - **REQ-069:** `/exemplars` served a `creator_handle`; removed from type, composer, stored record, and wire — now URI + predicate boolean + observation date only. Guard strengthened (scans names + serialized JSON for identity fields), proven falsifiable.
  - **Falsifier lexicon:** the forbidden-verb lexicon now gates BOTH `statement` and `falsifier` (both served) at BOTH ratification (Python) and serve time (C#) — closing a gap where a model-drafted causal falsifier could ship.
  - Dead coverage-state ternary → real mapping with fail-fast guard; `C4_HasNoScoreField` exact-string → substring.

## Definition of Done
- ✅ Entry gate clean; all suites green
- ✅ `boundary-reviewer` PASS · `measurement-reviewer` PASS · `veto-integrity-reviewer` PASS (all re-confirmed after hardening)
- ✅ Acceptance criteria met with cited evidence
- ✅ Schema/lexicon/provenance suites green before C4 ships

## Accepted residuals (non-gating)
1. **C4 as `KnowledgeApiEndpoints` handler methods, not a live ASP.NET host** — process isolation is structural (separate project, references no C1/C2/C3; C4 is C#, C1 is Python), matching Phase 4's `CalibrationApi`. Host is deferred deployment wiring, not a boundary gap.
2. **`.claude/workspaces.json` unchanged** — C4 build already covered by the solution-wide `.cs` check (KnowledgeApi is in the `.slnx`); a separate matcher would be redundant.
3. **`recurrent` has no auto-demotion path** — defensible by design (the falsifiable prevalence-ratio claim lives at `contrasted`; `recurrent` is a recurrence-count rung); worth a one-line confirmation.
4. **Two forbidden-verb lexicons stay in lock-step by a runtime equivalence test**, not a shared cross-language source — the structural anti-drift guard until a shared config exists.
