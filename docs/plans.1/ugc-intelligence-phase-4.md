# Phase 4 — C3 Calibration Monitor (the referee) + C1 internal corpus assembler

**Depends on:** 3
**Primary agents:** `control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer`
**Requirement IDs:** REQ-050, REQ-051, REQ-052, REQ-053
**Critical Paths:** Boundaries & authority · Measurement discipline

> *"A scorer that decides whether to keep trusting itself never stops trusting itself."* C3 exists because neither C1 nor C2 can be allowed to grade its own homework. **C3 has no component doc** — that is a known gap in the doc set, and closing it (`docs/initial/component-3-calibration-monitor.md`) is task `P4-T1` of this phase (deferral **D4**).

---

## Project Conventions Pinned (READ FIRST)

### Golden rules
1. Read before you write. 2. No secrets. 3. Never destroy what you didn't create. 4. Fix causes, not symptoms. 5. Match the codebase. 6. **Report honestly.** 7. Small, verifiable steps. 8. Scale caution to blast radius. 9. Current facts beat trained memory.

### Non-negotiable rules for this phase
- **Rule 3 — One-way call-graph, sole authorities.** C1 and C3 only consume the append-only event log; **C2 is the sole OutcomeEvent writer; C3 alone trips/arms the breaker and vetoes pattern-library promotion.** No config, admin flag, or per-campaign exemption overrides these — *an authority overridable from the component it governs is a comment.*
- **Rule 4 — Fail closed.** Unreachable C3 or breaker cache older than 60 s ⇒ the cohort is `cold`. **Never treat an unreachable referee as permission.**
- **Rule 5 — Measurement discipline.** Calibration uses **temporal holdouts, never random splits.** Baselines use median/MAD.
- **Rule 8 — Tenancy.** Tenant outcome data never crosses tenants.

### Stack
C# for C3 (deterministic authority). Python for C1's assembler + the Spearman computation (`scipy.stats.spearmanr`). C3 owns the decision; Python may compute the statistic.

### Anti-patterns
- `train_test_split`. **Two posts from the same campaign share a brief, a product, and an audience — a random split leaks.**
- Reconstructing `breaker_state_at_score` from flag history. It **travels with the score**.
- An `armBreaker()` with no recorded reason. Automatic to trip; manual, **with a recorded reason**, to arm.
- A rolling correlation computed across a library swap. Promotion **resets the window**.

### Available agents
`control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer`, `frontend-engineer`.

---

## Requirements Checklist (functional)
| ID | Requirement |
|---|---|
| REQ-050 | Every VPS stored against the eventual measured 7-day performance percentile of the post it scored. |
| REQ-051 | Per-cohort rolling Spearman between predicted VPS and actual 7d percentile, **on a held-out set**, visible to the operator at all times. |
| REQ-052 | Below threshold ⇒ VPS for that cohort **automatically** degrades to advisory: computed, stored, not shown to clients, **zero weight in AWS**. An automatic circuit breaker, not a manual decision. |
| REQ-053 | Explore-arm outcomes weighted **equally** with exploit-arm outcomes when updating the Pattern Library. |

## The high side of the threshold, which is not a win

The eval plan states, in advance so it cannot be rationalised afterwards: *"If the composite shows ρ > 0.5 out-of-sample on n ≥ 60, look for the leak before celebrating."* A craft score claiming ρ = 0.7 on out-of-sample data is **a craft score with a leak**, because content performance is dominated by factors outside the content.

So the harness has **two** discipline signals, not one:
- `ρ < 0.35` ⇒ breaker `tripped` (automatic).
- `ρ > 0.5` on n ≥ 60 out-of-sample ⇒ **`suspected_leak = true`**, surfaced on `/api/calibration/{vertical}/{platform}` and on the operator dashboard. It does **not** trip the breaker — it is not a failure of skill — but it is never presented as a success either.

A cohort seeded from fixtures cannot reach an operator or client surface at all (`Origin.Fixture`, Phase 0 `P0-T10`). At t = 0 every cohort is `cold` by construction, which is the correct early state.

## Contract C — BreakerState (C3 writes, C2 reads; C2 has no write path)
Cohort key: `(tenant_id, vertical, platform, rubric_version, pattern_library_version)`. Read-through cache, **TTL 60 s**.

| State | Condition | C2's behaviour |
|---|---|---|
| `armed` | rolling ρ ≥ 0.35 on n ≥ 60 held out | VPS surfaced with band; weight 0.15 in AWS |
| `tripped` | rolling ρ below threshold | VPS computed + stored, **not shown**; weight 0 in AWS; redistributed to measured terms |
| `cold` | n < 60, **or** no library, **or** compatibility-triple mismatch | same as `tripped`; **reason differs and is surfaced** |
| `shadow` | champion/challenger in progress | C2 scores twice; champion surfaces; both stored |

**Automatic to trip, manual to arm.** Arming requires a human and a recorded reason.

## Contract D — LibraryVerdict (C1 requests, C3 issues)
`promote` \| `reject` \| `extend_shadow`. The challenger must beat the incumbent **on the same held-out submissions** — a paired comparison, which controls for the quarter being an easy one. `extend_shadow` is the common verdict and costs only doubled model spend. On `promote`, **C3 resets the calibration window**; the breaker drops to `cold` until n rebuilds.

## C1 Internal Corpus Assembler (§1.6)
Fold `SubmissionScored`, `VerdictIssued`, `VerdictOverridden`, `PostPublished`, `PerformanceSnapshot`, `AmplificationAllocated` into a per-submission record joining features → outcome, arm, human judgement.
- **Dedupe on `idempotency_key` before folding.** A double-counted outcome inflates an effect size.
- **Replay is the primary operation, not a recovery path.** An extractor bump ⇒ backfill features, replay the log, re-mine.
- **Arm propagation:** `AmplificationAllocated.arm` is stamped onto every subsequent `PerformanceSnapshot` for that post. *"An assembler that loses the arm tag converts the exploration budget from an investment into a donation."*

## Edge Cases & Failure Paths
| Question | Answer | Becomes |
|---|---|---|
| **Inverse** | trip ↔ arm (arm requires human + reason). shadow-start ↔ `LibraryVerdict`. | `P4-T4`, `P4-T6` |
| **Double failure** | C3 down **and** breaker cache stale → `cold`. **Not the last known state.** Not `armed`. | test `Breaker_C3Down_CacheStale_IsCold` |
| **Degraded mode** | C3 down → C2 fails closed to `cold`; compliance unaffected; C1 cannot promote a pattern library (**the safe direction**); mechanism publication unaffected (C3 never gated it). | `P4-T5` |
| n = 59 | `cold`. **The harness refuses to emit a ρ.** | test `Calibration_BelowN60_RefusesToEmitRho` |
| Library promoted mid-window | Cohort key changes ⇒ window resets ⇒ breaker `cold` until n rebuilds. | test `Promotion_ResetsCalibrationWindow` |
| Duplicate `PerformanceSnapshot` delivered | Deduped on idempotency key before folding. | test `Assembler_DuplicateEvent_CountedOnce` |
| A score flagged `anomalous` | **Excluded** from the calibration dataset. | test `Calibration_ExcludesAnomalous` |
| `arm` missing on a snapshot for an amplified post | Assembler raises. It never imputes an arm. | test `Assembler_MissingArm_Raises` |

## Failure Modes & Degraded Behavior
| Boundary | Failure | Degraded | Reconciliation | Spec |
|---|---|---|---|---|
| C2 → C3 breaker read | Unreachable | `cold` after TTL. Never permission. | Cache refresh | `Breaker_Unreachable_TreatedAsCold` |
| C3 → event log | Lag | Windows stop advancing. Neither degrades incorrectly; both stop learning. Alarm. | Catch-up replay | `Calibration_LogLag_StopsAdvancing_DoesNotGuess` |
| C1 → event log | Lag > 24 h | A `PerformanceSnapshot` records its **true `as_of`**, not its intended horizon. | — | `Snapshot_RecordsTrueAsOf` |
| C3 write | Fails | Breaker unchanged; alarm. Never a partial state. | Retry | `Breaker_WriteFails_StateUnchanged` |

## Handoff Contracts
```csharp
public enum BreakerState { Armed, Tripped, Cold, Shadow }
public sealed record BreakerReading(BreakerState State, string Reason, int N, decimal? Rho,
                                    bool SuspectedLeak, DateTimeOffset AsOf);
// Rho is null whenever N < 60. There is no overload that returns a rho for a small n.
// SuspectedLeak is true when Rho > 0.5 out-of-sample on N >= 60 — a warning, never a win.
public interface IBreakerReader { Task<BreakerReading> ReadAsync(CohortKey k, CancellationToken ct); }  // C2 gets ONLY this
public interface IBreakerAuthority { Task TripAsync(CohortKey k, string reason);
                                     Task ArmAsync(CohortKey k, Guid humanId, string recordedReason); } // C3 ONLY
public enum LibraryVerdict { Promote, Reject, ExtendShadow }
```

## Implementation Tasks
| # | Task | Owner | File(s) |
|---|---|---|---|
| P4-T1 | **Write `docs/initial/component-3-calibration-monitor.md`** — closes the doc-set gap (D4); config: window length, threshold, cohort keying, held-out split method | `control-plane-engineer` | `docs/initial/component-3-calibration-monitor.md`, `docs/initial/README.md` |
| P4-T2 | Temporal holdout splitter (never random) | `intelligence-plane-engineer` | `.../c1_pattern_engine/calibration/holdout.py` |
| P4-T3 | Rolling Spearman; **refuses n < 60**; flags `suspected_leak` when out-of-sample ρ > 0.5 | `intelligence-plane-engineer` | `.../calibration/spearman.py` |
| P4-T3b | Exclude from the calibration dataset: `anomalous` scores, **`EXCLUDED_FROM_AI_SCORING` (V6) submissions**, and any `Origin.Fixture` outcome | `intelligence-plane-engineer` | `.../calibration/dataset.py` |
| P4-T4 | Breaker store + `IBreakerAuthority` (C3 sole writer); auto-trip, manual-arm-with-reason | `control-plane-engineer` | `.../C3.Calibration/Breaker/*.cs` |
| P4-T5 | `IBreakerReader` read-through cache, TTL 60 s, fail-closed to `cold` | `control-plane-engineer` | `.../C2.Api/Breaker/BreakerCache.cs` |
| P4-T6 | `LibraryVerdict` + paired champion/challenger evaluation; promotion resets the window | `control-plane-engineer` | `.../C3.Calibration/Verdicts/*.cs` |
| P4-T7 | C1 internal corpus assembler: replay, dedupe, arm propagation | `intelligence-plane-engineer` | `.../c1_pattern_engine/corpora/internal.py` |
| P4-T8 | `GET /api/calibration/{vertical}/{platform}` → ρ, n, breaker state, **reason** | `control-plane-engineer` | `.../C3.Calibration/Api/*.cs` |
| P4-T9 | Assert C2 has no write path to breaker state; no config overrides it | `eval-harness-engineer` | `tests/Architecture/BreakerAuthorityTests.cs` |
| P4-T10 | Assert no random split exists anywhere (`train_test_split` grep + type-level temporal splitter) | `eval-harness-engineer` | `tests/Architecture/TemporalHoldoutTests.cs` |

## Files to Create / Modify
New: `.../C3.Calibration/**`, `.../c1_pattern_engine/{calibration,corpora}/**`, `docs/initial/component-3-calibration-monitor.md`, tests. Modify: `.../C2.Api/Breaker/**` (reader only), `docs/initial/README.md` (add C3 doc to the read order).

**Doc-set change note (CLAUDE.md rule 9):** adding `component-3-calibration-monitor.md` *documents* an existing invariant; it weakens none. No ADR or schema bump is required. If writing it surfaces a contradiction with ADR-0005 or Contracts C/D, **stop and surface it** rather than resolving it in code.

## Migration Steps
`dotnet ef migrations add Phase4_Calibration` — `CalibrationRecord`, `BreakerStateRow` (cohort-keyed, C3-writable only), `LibraryVerdictRow`.

## Verification Steps
1. `dotnet build && dotnet test && uv run pytest` green. *(requires P4-T1..T10)*
2. Seed 59 scored+measured submissions in one cohort → `GET /api/calibration/beauty/tiktok` returns `cold`, a reason, **and no ρ**. *(requires step 1)*
3. Add the 60th with ρ ≥ 0.35 → `armed`. *(requires step 2)*
4. Degrade the data so ρ < 0.35 → breaker `tripped` **with no human action**. *(requires step 3)*
5. Call arm without a reason → rejected. Call arm with a human id + reason → `armed`, reason recorded. *(requires step 4)*
6. Stop C3; wait > 60 s; C2 reads breaker → `cold`, not the last known `armed`. *(requires step 3)*
7. Promote a library → cohort key changes, window resets, breaker `cold`. *(requires step 3)*
8. Add `from sklearn.model_selection import train_test_split` to a calibration module → **`TemporalHoldoutTests` fails.** Revert.

## Acceptance Criteria
| # | Criterion | Evidence |
|---|---|---|
| A1 | Calibration **refuses** to emit ρ when n < 60 | `Calibration_BelowN60_RefusesToEmitRho` |
| A2 | Breaker trips automatically; arming requires a human id **and** a non-empty recorded reason | `BreakerTests.AutoTrip_ManualArmWithReason` |
| A3 | C2 has no write path to breaker state; no config/admin/per-campaign override exists | `BreakerAuthorityTests` |
| A4 | C3 unreachable or cache > 60 s ⇒ `cold`, never last-known-armed | `Breaker_C3Down_CacheStale_IsCold` |
| A5 | Splits are temporal; the test **fails** if a random split is introduced | `TemporalHoldoutTests` + step 8 |
| A6 | Library promotion resets the calibration window | `Promotion_ResetsCalibrationWindow` |
| A7 | Assembler dedupes on `idempotency_key`; a duplicate outcome is counted once | `Assembler_DuplicateEvent_CountedOnce` |
| A8 | `arm` propagates to every subsequent snapshot; a missing arm raises rather than imputes | `Assembler_MissingArm_Raises` |
| A9 | `anomalous` scores, `EXCLUDED_FROM_AI_SCORING` (V6) submissions, and `Origin.Fixture` outcomes are all excluded from the calibration dataset | `Calibration_ExcludesAnomalous`, `Calibration_ExcludesV6`, `Calibration_ExcludesFixtures` |
| A9b | Out-of-sample ρ > 0.5 on n ≥ 60 sets `suspected_leak` and is surfaced, never celebrated | `Calibration_HighRho_FlagsSuspectedLeak` |
| A9c | A fixture-seeded cohort never reaches an operator or client surface | `FixtureOriginTests.FixtureNeverClientFacing` |
| A10 | `breaker_state_at_score` travels with the score, never reconstructed | `SubmissionScoredTests.BreakerStateTravels` |
| A11 | `component-3-calibration-monitor.md` exists and is linked from `README.md` | file + link |

## Out of Scope
No Gate B, no allocator, no mining, no mechanisms. Do not weaken any invariant while writing the C3 doc.

## Completion Criteria
Entry gate clean; all three test suites green; `boundary-reviewer` **PASS**, `measurement-reviewer` **PASS**. `CLAUDE.md`'s "C3 has no component doc — known gap" line is updated, since it no longer holds.
