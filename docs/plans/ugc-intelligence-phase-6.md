# Phase 6 — C1 Pattern Miner + Library Publisher

**Depends on:** 4, 5
**Primary agents:** `intelligence-plane-engineer`, `eval-harness-engineer`
**Requirement IDs:** REQ-003, REQ-006, REQ-008, REQ-053
**Critical Paths:** Measurement discipline · Boundaries & authority

> **The single most important sentence in this component:** *Proposal runs over the union of both corpora. Estimation runs over the internal corpus only.*

---

## Project Conventions Pinned (READ FIRST)

### Golden rules
1. Read before you write. 2. No secrets. 3. Never destroy what you didn't create. 4. Fix causes, not symptoms. 5. Match the codebase. 6. **Report honestly.** 7. Small, verifiable steps. 8. Scale caution to blast radius. 9. Current facts beat trained memory.

### Non-negotiable rules for this phase
- **Rule 5 — Measurement discipline.** A `Proxy` value is never shown or aggregated as `Measured`, **and never enters an effect-size calculation** — pattern *proposal* reads both corpora, pattern *estimation* reads the internal corpus only. Calibration uses temporal holdouts, never random splits. **Trend signals never enter VPS at any weight.**
- **Rule 3 — Sole authorities.** C1 **cannot publish a pattern library without C3's `LibraryVerdict`** (Contract D). C1 never calls C2, C3, or C4.
- **Rule 8 — Tenancy.** `Pattern.tenant_id` is enforced at the repository layer with **no widening override**. Tenant A's outcome data never informs Tenant B's library.
- **Rule 9 — Immutability.** A published library version is never modified. Rollback is repointing `active_version`, never editing an artefact.

### Stack
Python 3.12 + `uv`; `scipy` / `statsmodels`. Benjamini–Hochberg via `statsmodels.stats.multitest`.

### Anti-patterns
- Pooling exemplar and internal outcomes in an estimator. *"The provenance label is correct at the point of computation and is gone one hop later."*
- Estimating an effect size on exploit-arm data and calling it settled. Exploit-arm estimates are **upper bounds pending replication**.
- BH correction across the **survivors** rather than the full candidate set.
- A deadline by which a pattern must become active. **There is none.** `insufficient_evidence` is a resting state, not a queue.
- `train_test_split`.

### Available agents
`control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer`, `frontend-engineer`.

---

## Requirements Checklist (functional)
| ID | Requirement |
|---|---|
| REQ-003 | Pattern Library keyed by (vertical, platform); each pattern records assertion, effect size, sample size, confidence band, `valid_from`, `valid_to`. Below the sample-size threshold ⇒ `insufficient_evidence`, **not used for scoring**. |
| REQ-006 | A pattern past its validity window without refresh is flagged `stale` and **excluded from scoring**, rather than silently continuing to apply. |
| REQ-008 | Proposal over the **union**; estimation over the **internal labelled corpus only**. **No `Proxy`-provenance value enters an effect-size calculation, at any weight, under any configuration.** |
| REQ-053 | Explore-arm outcomes weighted **equally** with exploit-arm outcomes when updating the library. |

## The two stages
**Stage 1 — Proposal, over the union.** Candidate feature predicates: hook archetype, first-frame face scale, on-screen text density inside the hook window, cut-cadence band, filler-word rate, opening-line syntactic form, and combinations. *"Cheap, generous, biased — and that is fine, because promotion is where the discipline lives."*

**Stage 2 — Estimation, over the internal corpus only.** Lift in 24h engagement-rate percentile for posts satisfying the predicate vs the cohort median, with a bootstrapped CI.
**Type-level enforcement:** the estimator's signature accepts `Iterable[MeasuredOutcome]`. An exemplar's `Proxy` engagement **cannot be constructed** into a `MeasuredOutcome` (Phase 0's `MeasuredOutcome.TryFrom` returns `None`). This is not a code-review rule; it is a type error.

## Confounding by treatment, and the correction (ADR-0003)
A post that was amplified performed better partly *because* it was amplified. Regressing outcome on features across a corpus where amplification was assigned by AWS is regressing outcome on a variable that **caused the treatment**.
- **Estimate on explore-arm data where n permits.**
- Treat exploit-arm effect sizes as **upper bounds requiring replication**.
- Where neither is possible honestly, the pattern stays `insufficient_evidence` **indefinitely**.

## Three guards before promotion
1. **Multiple comparisons** — Benjamini–Hochberg **across the full candidate set, not the survivors**.
2. **Temporal replication** — mined on period 1, confirmed on period 2.
3. **Back-test** — evaluated against the prior quarter before it can influence a score; result recorded on the pattern. Passes replication but back-tests poorly ⇒ promoted with a note and watched.

**Floor:** `sample_size ≥ 30` **and** a bootstrapped effect-size CI excluding zero. Below ⇒ `insufficient_evidence`: retained as a hypothesis, shipped inside the artefact for auditability, **never retrieved, never shown to a client**.

## Contract D — publication
C1 cuts a `candidate` at any time (cheap). It requests shadow from C3. C2 dual-scores 6–12 weeks until n ≥ 60 accumulate **against both**. C3 computes the rank correlation for each library **on the same held-out submissions** and issues `promote` | `reject` | `extend_shadow`. On `promote`, C1 writes the artefact and repoints `active_version`; C3 resets the window.

**Cadence:** mining nightly; publishing bounded below by calibration accumulation (~quarterly). *"This is invisible until the third library swap, at which point somebody notices the rolling correlation has been meaningless for a year."*

## Edge Cases & Failure Paths
| Question | Answer | Becomes |
|---|---|---|
| **Inverse** | `active` ↔ `stale` (automatic, on `valid_to`). candidate-cut ↔ `reject` recorded against the mining run. | `P6-T6`, `P6-T7` |
| **Double failure** | C3 unreachable **and** a candidate is cut → **no publication.** C1 cannot promote itself. The safe direction. | test `Publish_WithoutVerdict_Refused` |
| **Degraded mode** | No explore-arm data → exploit-arm estimate is an upper bound, pattern stays `insufficient_evidence`. No deadline. | `P6-T3` |
| An exemplar post reaches the estimator | **Type error.** `MeasuredOutcome.TryFrom(Proxy) → None`. | test `Estimator_RejectsExemplarSourcedOutcome` |
| Duplicate outcome event | Deduped upstream (Phase 4 assembler). A double count inflates an effect size. | `Assembler_DuplicateEvent_CountedOnce` |
| Pattern past `valid_to` | `stale`, auto-excluded from retrieval. Shipped in the artefact for auditability. | test `Pattern_PastValidTo_IsStale_NotRetrieved` |
| Tenant A pattern queried in Tenant B's scope | Repository returns nothing. **No widening override exists.** | test `Pattern_CrossTenant_Unreachable` |
| A trend signal proposed as a predicate | Permitted at **proposal**. It never enters an effect size and never enters VPS. | test `TrendSignal_NeverEntersVps` |

## Failure Modes & Degraded Behavior
| Boundary | Failure | Degraded | Reconciliation | Spec |
|---|---|---|---|---|
| C1 → C3 shadow request | C3 down | Candidate stays a candidate. **No publication.** | Retry | `Publish_WithoutVerdict_Refused` |
| C1 → event log | Lag | Corpus stale; mining runs on what it has; staleness alarm at 30 days. **Never imputes an outcome.** | Replay | `Miner_StaleCorpus_Alarms_NoImputation` |
| Artefact store | Write fails | `active_version` unchanged. Never a half-published library. | Retry | `Publish_WriteFails_PointerUnchanged` |
| Extractor version bump | Features invalidated | Backfill → replay → re-mine. A **long** operation, not a dangerous one. | — | `Replay_AfterExtractorBump_Reconstructs` |

## Handoff Contracts
```python
# Consumed by C2 (Contract A, pinned read) and P8's *independent* synthesiser (which does NOT read this).
@dataclass(frozen=True)
class Pattern:
    id: UUID; assertion: str; feature_predicate: dict
    effect_size: float; effect_ci: tuple[float, float]; sample_size: int
    evidence_arm: Literal["exploit", "explore"]
    evidence_status: Literal["active", "insufficient_evidence", "stale", "retired"]
    valid_from: date; valid_to: date
def estimate_effect_size(outcomes: Iterable[MeasuredOutcome]) -> EffectSize: ...   # cannot accept Proxy
```

## Implementation Tasks
| # | Task | Owner | File(s) |
|---|---|---|---|
| P6-T1 | Predicate proposal over the **union** of both corpora | `intelligence-plane-engineer` | `.../c1_pattern_engine/miner/propose.py` |
| P6-T2 | Estimator over the **internal corpus only**; typed `Iterable[MeasuredOutcome]` | `intelligence-plane-engineer` | `.../miner/estimate.py` |
| P6-T3 | Arm conditioning: estimate on explore-arm where n permits; exploit-arm ⇒ upper bound | `intelligence-plane-engineer` | `.../miner/arm.py` |
| P6-T4 | Benjamini–Hochberg **across the full candidate set** | `intelligence-plane-engineer` | `.../miner/multiplicity.py` |
| P6-T5 | Temporal replication + prior-quarter back-test | `intelligence-plane-engineer` | `.../miner/replicate.py` |
| P6-T6 | Evidence status: `active` / `insufficient_evidence` / `stale` (auto on `valid_to`) | `intelligence-plane-engineer` | `.../miner/status.py` |
| P6-T7 | Library publisher: cut candidate, request shadow, publish **only on `promote`**, repoint `active_version` | `intelligence-plane-engineer` | `.../publishers/pattern_library.py` |
| P6-T8 | Tenant-scoped repository, no widening override | `intelligence-plane-engineer` | `.../corpora/repository.py` |
| P6-T9 | **Provenance suite:** *"a test asserting that the estimator's input set contains no exemplar-sourced outcome is a permanent regression test on the architecture"* | `eval-harness-engineer` | `tests/Architecture/test_estimator_provenance.py` |
| P6-T10 | Assert C1 cannot publish without a `LibraryVerdict`; assert no trend value enters VPS | `eval-harness-engineer` | `tests/Architecture/test_publication_authority.py` |

## Files to Create / Modify
New under `src/IntelligencePlane/c1_pattern_engine/{miner,publishers,corpora}/**`, `tests/Architecture/**`.

## Migration Steps
None relational for C1. `PatternLibraryVersion` is a content-addressed artefact; `active_version` is a pointer row per `(tenant_id, vertical, platform)`.

## Verification Steps
1. `uv run ruff check && uv run pytest` green. *(requires P6-T1..T10)*
2. Feed the estimator an exemplar-sourced outcome → **rejected at the type boundary**, not at runtime validation. *(requires step 1)*
3. Mine 100 candidate predicates over 300 posts → BH applied across all 100; assert the survivor count is not the uncorrected count. *(requires step 1)*
4. Cut a candidate; attempt publish with no `LibraryVerdict` → refused. *(requires step 1)*
5. Issue `promote` → artefact written, `active_version` repointed, prior version **still resolvable**. *(requires step 4)*
6. Set a pattern's `valid_to` in the past → `stale`, excluded from retrieval, still present in the artefact. *(requires step 1)*
7. Query a Tenant-A pattern in Tenant-B scope → empty. Grep confirms no override parameter exists. *(requires step 1)*
8. Add a union-reading line to `estimate.py` → **`test_estimator_provenance` fails.** Revert.

## Acceptance Criteria
| # | Criterion | Evidence |
|---|---|---|
| A1 | The estimator's input set contains **no** exemplar-sourced outcome; the test **fails** when one is introduced | `test_estimator_provenance` + step 8 |
| A2 | `MeasuredOutcome.TryFrom(Proxy)` is `None`; the estimator cannot be called with a `Proxy` value | type test |
| A3 | Proposal reads the union; estimation reads the internal corpus only | `test_proposal_union_estimation_internal` |
| A4 | BH applied across the **full** candidate set | `test_bh_full_candidate_set` |
| A5 | Explore-arm and exploit-arm outcomes weighted equally in library updates (REQ-053) | `test_arm_equal_weight` |
| A6 | Exploit-arm effect sizes marked as upper bounds pending replication | `test_exploit_arm_upper_bound` |
| A7 | `sample_size < 30` or CI includes zero ⇒ `insufficient_evidence`, never retrieved | `test_evidence_floor` |
| A8 | Pattern past `valid_to` ⇒ `stale`, excluded from retrieval, retained in artefact | `test_stale_excluded_retained` |
| A9 | C1 cannot publish a pattern library without C3's `promote` | `test_publish_requires_verdict` |
| A10 | Published versions immutable; a superseded version still resolves | `test_immutability_and_rollback` |
| A11 | Cross-tenant pattern retrieval impossible; no override parameter exists | `test_cross_tenant_unreachable` |
| A12 | No trend signal value enters VPS at any weight | `test_trend_never_enters_vps` |

## Out of Scope
**No mechanism synthesis** — that is Phase 8, and it reads a different corpus with a different proposal stage. Do not let this phase's proposal output reach it.

## Completion Criteria
Entry gate clean; `pytest` + `ruff` green; `measurement-reviewer` **PASS**, `boundary-reviewer` **PASS**.
