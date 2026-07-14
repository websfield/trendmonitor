# Phase 7 — Trend subsystem

**Depends on:** 0
**Primary agent:** `intelligence-plane-engineer`
**Requirement IDs:** REQ-005, REQ-005a…REQ-005i
**Critical Paths:** Measurement discipline

> **Depends only on Phase 0.** Not on the scorer, not on the breaker, not on one outcome event. Together with Phase 2 it unblocks Phase 8 — which is ADR-0007's claim made structural. *"Trends are disposable. Mechanisms compound."*

---

## Project Conventions Pinned (READ FIRST)

### Golden rules
1. Read before you write. 2. No secrets. 3. Never destroy what you didn't create. 4. Fix causes, not symptoms. 5. Match the codebase. 6. **Report honestly.** 7. Small, verifiable steps. 8. Scale caution to blast radius. 9. Current facts beat trained memory.

### Non-negotiable rules for this phase
- **Rule 5 — Measurement discipline.** **Trend signals never enter VPS at any weight.** Baselines use median/MAD, never mean/stddev. Every keyless read is `Proxy` — corroboration upgrades `confidence`, **never `provenance`**.
- **Rule 4 — Fail closed.** A source going dark freezes baselines. **No adapter ever imputes a missing volume.** *"A z-score computed across an imputed gap is a fabrication with a decimal point."*
- **Rule 8 — Tenancy.** `TrendSignal.scope`: a trend observed on the public web is public; a trend inferred from a tenant's own campaign outcomes is `internal`, tenant-scoped, and **never crosses**. `TrendVerdict` is always tenant-scoped.

### Stack
Python 3.12 + `uv`. Adapters are pure functions `(term, date_range) → [TrendObservation]`, independently deployable, independently failing, independently disabled.

### Anti-patterns
- Imputing a missing volume. A gap in the series **is a gap**.
- Mean/stddev for a trend baseline — one news event masks a genuine emerging trend for a month.
- Raising a signal on a single-day spike. `z > 3` must be **sustained across two or more consecutive days**. A single-day `z > 5` alerts a manager without creating a signal.
- A submitter resolving their own submission.
- Surfacing a numeric `days_remaining_est` before 20 trends have resolved on that platform.
- A feed showing six Reddit trends and no TikTok trends **without comment**. That reads as a claim that nothing is happening on TikTok, and it is *"the most likely way this component quietly misleads someone."*

### Available agents
`control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer`, `frontend-engineer`.

---

## Requirements Checklist (functional)
| ID | Requirement |
|---|---|
| REQ-005 | Scheduled keyless scan; robust z per tracked term vs its own trailing 28-day baseline; raise a `TrendCandidate` where `z > 3` **sustained ≥ 2 consecutive days**. |
| REQ-005a | Manager/client/resolver roles submit candidate trends with platform, vertical, evidence URIs, a **probability distribution over `{rising, peak, declining}` at T+14d**, and a rationale. `max_open_positions` default 5. |
| REQ-005b | Resolve at T+14d and T+30d. Detector resolves where an automated source observes; else a named resolver with evidence, provenance `User-provided`. **A submitter may never resolve their own submission** — such a resolution is void and logged. |
| REQ-005c | Each resolution yields a ranked probability score and `credit = skill_score × ln(1 + lead_days)`. Reputation is a **shrunk** estimate applied as a promotion weight. |
| REQ-005d | Every surfaced trend carries lifecycle stage, `days_remaining` **band**, brand-fit, risk flag, and a `go`\|`caution`\|`skip` verdict against the tenant's brief-to-live lead time. **Until ≥ 20 trends resolve on a platform, `days_remaining` is a band, never a number.** |
| REQ-005e | **No `TrendSignal` value enters VPS computation, at any weight, under any configuration.** Trend adherence may enter BAS only as a deterministic check against a format explicitly named in the stored brief. |
| REQ-005f | A `rising` trend with a `go` verdict raises exemplar ingestion priority. **This coupling is a claim, not an assumption** — it must earn its keep in Phase 8's eval, or it is deleted. |
| REQ-005g | The trend feed is visible to manager, client, resolver. **Not to creator roles.** |
| REQ-005h | A `TrendSignal` with no observation refresh inside `valid_to` is auto-archived and leaves every feed. **Archived signals remain queryable** for resolution, decay-curve fitting, and `Mechanism.occasioned_by_trend_ids` / `n_trends`. **A mechanism does not lose a trend when that trend dies.** |
| REQ-005i | **No `TrendSignal` value enters a `Mechanism`'s `warrant` computation.** A trend decides *where the corpus builder looks*; never whether a mechanism is real. The one place a trend appears in mechanism evidence is `n_trends` — a count of **unrelated** trends a predicate survived. |

## Detection maths
```
robust_z = 0.6745 · (x_today − median₂₈) / MAD₂₈
```
**Lifecycle** — 3-day EMA; `v` = first difference, `a` = second: `rising` iff `v>0 ∧ a≥0`; `peak` iff `v≈0 ∧ a<0`, or `v>0` with strongly negative `a`; `declining` iff `v<0`.

**Verdict**
```
go      iff stage=rising ∧ band ∈ {medium,long}
         ∧ (days_remaining_est is null ∨ days_remaining_est > lead_time × 1.5)
         ∧ brand_fit ≥ θ_fit ∧ risk_flag = none
caution iff stage=peak ∨ risk_flag=caution
skip    iff stage=declining ∨ risk_flag=blocked ∨ band=short
```
The **× 1.5** safety factor exists because brief-to-live is a median, not a guarantee, and the cost of landing a campaign into a dying trend is the whole campaign.

## Submitter scoring
```
RPS = (1/(k−1)) · Σᵢ₌₁^{k−1} (Pᵢ − Oᵢ)²                     k = 3, classes ordered rising ≺ peak ≺ declining
skill_score = clamp(1 − RPS / RPS_baseline, 0, 1)
lead_days   = max(0, corroboration_date − submitted_at)
credit      = skill_score × ln(1 + lead_days)
shrunk_weight = (n/(n+k))·observed_mean_credit + (k/(n+k))·prior_credit      k = 20
```
RPS not Brier, because the classes are **ordered**. `ln(1 + 0) = 0` is the **sandbagging guard**: a correct call made after independent corroboration earns nothing, structurally rather than by policy.

## Edge Cases & Failure Paths
| Question | Answer | Becomes |
|---|---|---|
| **Inverse** | signal-raise ↔ auto-archive at `valid_to` (REQ-005h), **archived stays queryable**. submission-open ↔ resolve/void. | `P7-T6`, `P7-T5` |
| **Double failure** | A source goes dark **and** the only submitter is the would-be resolver → signal drops to `single_source`, resolution blocked, surfaced as a coverage gap. Never self-resolved. | test `SelfResolution_Void_AndLogged` |
| **Degraded mode** | Source dark ⇒ baselines freeze; signals drop to `single_source` or archive at `valid_to`. **Never impute.** Alert. | `P7-T2` |
| < 20 resolved trends on a platform | `days_remaining_est` stays `null`; band from stage alone (`rising→long`, `peak→short`, `declining→short`). | test `DaysRemaining_Under20Resolved_NullEstimate` |
| Evidence URI dead / points at nonexistent content | Submission **voided**; position not freed for 14 days. | test `DeadEvidenceUri_Voids_PositionHeld14d` |
| Prompt injection in `rationale` / `evidence_uris` | Fenced as untrusted. **Never enters verdict computation, which is deterministic.** Logged. | test `Rationale_Injection_NeverEntersVerdict` |
| Zero human submissions for a platform for 30 days | Surfaced as a **coverage gap**, not as an absence of trends. | test `NoSubmissions_SurfacesCoverageGap` |
| Trend called `go`, campaign ships, trend already dead | Recorded as a **verdict miss**. Verdict accuracy is itself tracked and reported. | test `VerdictMiss_Recorded` |
| A submitter holds 5 open positions | A sixth submission is refused. | test `MaxOpenPositions_Enforced` |

## Failure Modes & Degraded Behavior
| Boundary | Failure | Degraded | Reconciliation | Spec |
|---|---|---|---|---|
| Any keyless adapter | RSS 404 / API shape change | Baselines freeze for terms sourced only from it. `single_source` or archive. **Never impute a volume.** | Adapter fix; backfill | `Adapter_Dark_FreezesBaseline_NoImputation` |
| Second source | Corroborates | `confidence` upgrades to `corroborated`. **`provenance` stays `Proxy`.** | — | `Corroboration_UpgradesConfidenceNotProvenance` |
| Human submission | Predates automated corroboration | `confidence` → `human_corroborated`; `corroboration_date` stamped. | — | `HumanCorroboration_StampsDate` |

## Handoff Contracts
```python
# Consumed by P8 (ingestion priority; occasioned_by_trend_ids; n_trends). NEVER by C2's scorer.
@dataclass(frozen=True)
class TrendSignal:
    id: UUID; scope: Literal["public","internal"]; tenant_id: UUID | None   # non-null iff internal
    platform: str; vertical: str; kind: Literal["format","sound","hashtag","topic","aesthetic"]
    lifecycle_stage: Literal["candidate","rising","peak","declining","archived"]
    confidence: Literal["single_source","corroborated","human_corroborated"]
    valid_to: date; archived_at: datetime | None
# Archived signals REMAIN QUERYABLE (REQ-005h).
```

## Implementation Tasks
| # | Task | Owner | File(s) |
|---|---|---|---|
| P7-T1 | Term registry: 5 admission origins, priority function, 90-day eviction to cold storage (**never deleted**), cap 250 per (vertical, platform) | `intelligence-plane-engineer` | `.../c1_pattern_engine/registry/*.py` |
| P7-T2 | Source adapters (7), each `Proxy`, independently failing, **no imputation** | `intelligence-plane-engineer` | `.../adapters/*.py` |
| P7-T3 | Detector: robust z, 2-consecutive-day rule, single-day `z>5` alert-without-signal | `intelligence-plane-engineer` | `.../detector/detect.py` |
| P7-T4 | Lifecycle (3-day EMA, v/a), days-remaining band + curve fit gated at 20 resolutions | `intelligence-plane-engineer` | `.../detector/lifecycle.py` |
| P7-T5 | Submission + resolution: RPS, credit, shrunk reputation (k=20), self-resolution void, max open positions | `intelligence-plane-engineer` | `.../submissions/*.py` |
| P7-T6 | Auto-archive at `valid_to`; **archived remains queryable** | `intelligence-plane-engineer` | `.../detector/archive.py` |
| P7-T7 | Tenant-scoped `TrendVerdict` (`go`/`caution`/`skip`) with the ×1.5 safety factor | `intelligence-plane-engineer` | `.../detector/verdict.py` |
| P7-T8 | Coverage reporter: per-platform, automated vs human-sourced, open submissions. **A gap is stated, never implied.** | `intelligence-plane-engineer` | `.../detector/coverage.py` |

## Files to Create / Modify
New under `src/IntelligencePlane/c1_pattern_engine/{registry,adapters,detector,submissions}/**`.

## Migration Steps
`TrendSignal`, `TrendObservation`, `TrendSubmission`, `TrendResolution`, `SubmitterReputation`, `TrendVerdict` — relational, tenant-scoped where the model says so.

## Verification Steps
1. `uv run ruff check && uv run pytest` green. *(requires P7-T1..T8)*
2. Feed a term a single-day `z = 6` → alert raised, **no `TrendSignal` created**. *(requires step 1)*
3. Feed two consecutive days of `z = 3.5` → candidate raised. *(requires step 1)*
4. Delete a day from an observation series → the z-score for that day is **not computed**; no imputation. *(requires step 1)*
5. Resolve a submission as its own submitter → 403, resolution void, logged. *(requires step 1)*
6. With 19 resolved trends on a platform → `days_remaining_est is None`. Add the 20th → curve fits, estimate exposed with its interval. *(requires step 1)*
7. Archive a signal, then query it for `n_trends` → still returned. *(requires step 1)*
8. Grep every scoring path for a `TrendSignal` import → none. *(requires Phase 3)*

## Acceptance Criteria
| # | Criterion | Evidence |
|---|---|---|
| A1 | `z>3` sustained ≥ 2 consecutive days raises a candidate; a single-day `z>5` does not | `test_two_consecutive_day_rule` |
| A2 | Baselines use median + MAD | `test_median_mad_baseline` |
| A3 | **No adapter imputes a missing volume** | `test_no_imputation` |
| A4 | Every keyless read is `Proxy`; corroboration upgrades `confidence`, never `provenance` | `test_corroboration_not_provenance` |
| A5 | Self-resolution is void and logged | `test_self_resolution_void` |
| A6 | `credit = skill_score × ln(1+lead_days)`; post-corroboration call earns exactly 0 | `test_sandbagging_guard` |
| A7 | Reputation shrunk with k=20; n=0 carries exactly the prior | `test_shrinkage` |
| A8 | `days_remaining_est` null until ≥ 20 resolutions on that platform | `test_days_remaining_gated` |
| A9 | Archived signals remain queryable for `n_trends` (REQ-005h) | `test_archived_still_queryable` |
| A10 | **No `TrendSignal` value is reachable from VPS** (REQ-005e) | `test_trend_never_enters_vps` |
| A11 | Coverage gap is stated per platform, never implied by an empty list | `test_coverage_gap_stated` |
| A12 | Trend feed not visible to creator roles (REQ-005g) | `test_creator_role_denied` |
| A13 | Injection in `rationale` never enters verdict computation | `test_rationale_injection_isolated` |

## Out of Scope
No mechanism synthesis, no exemplar corpus ingestion (Phase 8), no pattern mining.

## Completion Criteria
Entry gate clean; `pytest` + `ruff` green; `measurement-reviewer` **PASS**.
