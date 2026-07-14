# Phase 9 — Manager UI, operator dashboard, fairness audit

**Depends on:** 5, 8
**Primary agents:** `frontend-engineer`, `eval-harness-engineer`
**Requirement IDs:** REQ-019, REQ-038, REQ-039, REQ-051, REQ-054, REQ-070
**Critical Paths:** Measurement discipline · Veto & verdict integrity (the human click)

> This is where the system's honesty either survives contact with a human or quietly dies. *"A reviewer who approves forty submissions in ninety seconds has not exercised judgement, and a regulator would be right to say so."*

---

## Project Conventions Pinned (READ FIRST)

### Golden rules
1. Read before you write. 2. No secrets. 3. Never destroy what you didn't create. 4. Fix causes, not symptoms. 5. Match the codebase. 6. **Report honestly.** 7. Small, verifiable steps. 8. Scale caution to blast radius. 9. Current facts beat trained memory.

### Non-negotiable rules for this phase
- **Rule 2 — No auto-approval, ever.** Every `APPROVED` requires a real human click. **No bulk approve. No "approve all". No shortcut that approves without reading.**
- **Rule 4 — Fail closed.** Breaker not `armed` ⇒ **no VPS number is rendered**. Client-facing behaviour is a **direct read of breaker state, not a second decision**.
- **Rule 5 — Measurement discipline.** Every number carries its provenance label and `as_of`. Every VPS and AWS is `Estimated`. A `Proxy` value is never displayed as `Measured`.
- **Rule 6 — Mechanisms.** The knowledge surface shows **no number**, no `0-100` field, no effect size. `prevalence_ratio` is served **with** its warrant, `never_tested_against`, and provenance label.

### Stack
React 18 + TypeScript, Vite, `npm run typecheck`, `npm test`. **Types generated from `docs/initial/schemas/*.json`** — never hand-written, never widened.

### Anti-patterns
- A bulk-approve button, an "approve all" checkbox, or a keyboard shortcut that approves without opening the submission.
- Rendering a VPS when the cohort's breaker is `tripped` or `cold`.
- An empty list with no explanation. **An empty state says why it is empty.**
- Hiding a `blocked_rights` candidate. **Name the missing grant**, so the manager can go and get it — the day it takes is the day the surfacing buys.
- Showing a rolling Spearman without its `n`.

### Available agents
`control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer`, `frontend-engineer`.

---

## Requirements Checklist (functional)
| ID | Requirement |
|---|---|
| REQ-019 | Queue sorted by triage priority: compliance risks first, then borderline verdicts, then clear passes. |
| REQ-038 | Below the confidence threshold ⇒ ranking **without numeric scores**, limitation stated plainly. |
| REQ-039 | The naive-baseline counterfactual is shown. |
| REQ-051 | Rolling Spearman per cohort with breaker state, **visible to the operator at all times**. |
| REQ-054 | Quarterly fairness audit: VPS distribution by creator follower band; **regress measured 7d performance on follower band and compare the slope to VPS-on-follower-band.** |
| REQ-070 | The quarterly "what changed" report is **derived by reading C4**. |

## Surfaces
| Surface | Must show | Must never |
|---|---|---|
| Triage queue | risks first; why each is risky | present forty submissions as equally easy |
| Verdict panel | vetoes with **evidence**, `suspected_veto[]` clearly labelled as *model-raised, not acted on* | offer bulk approve |
| Approval | one human click → `human_approved_at` | pre-check the box |
| Evidence | the patterns + exemplars a score was anchored on | a score with no evidence |
| Degraded banner | which criteria were scored without audio | hide degradation |
| Advisory banner | breaker `tripped`/`cold` + **the reason** | a VPS number |
| Amplification | ranking, rationale, arm tags, ε and why it exists | a recommendation without sign-off |
| Blocked candidates | `blocked_rights` + **the named missing grant** | hide them |
| Counterfactual | what the naive baseline would have boosted | omit it |
| Knowledge | statement, falsifier, warrant, `Proxy-selected, Measured-evaluated`, `never_tested_against` | any number a breaker governs |
| Operator dashboard | ρ **with n and CI**, breaker state, override rate by cohort **and creator tier**, mechanisms by warrant rung, mechanisms falsified this refresh, `contrasted`-rate by ingestion arm, **ratification volume + median latency + rejection rate** | a headline "accuracy" figure — *there is no accuracy here* |

**The ratification decay signals and the override rate are uncomfortable numbers to publish about your own colleagues, and both are the only reason the human controls in this system are controls.**

## The fairness audit (REQ-054)
Quarterly, per cohort: VPS distribution by follower band (nano < 10k, micro 10–100k, mid 100k–500k, macro > 500k). Then **the thing that actually matters**: regress measured 7-day performance on follower band, and compare that slope to the slope of VPS on follower band. **If VPS rises with follower band faster than performance does, the rubric is scoring audience size and calling it craft.**
Action: raise `authenticity_register` weight (currently 0.06, *"a guess"* — *"expect to raise it"*) and re-run calibration. Where it persists, decompose by criterion. `text_readability` and `pacing` are the likely culprits: both reward editing labour.
**Second check:** override rate by creator tier. If managers override `REVISIONS_REQUIRED` for macro creators at a materially higher rate than for nano creators, the humans are correcting a bias the system has.

## Edge Cases & Failure Paths
| Question | Answer | Becomes |
|---|---|---|
| **Inverse** | approve ↔ override (recorded, reasoned, emits `VerdictOverridden`). | `P9-T3` |
| **Double failure** | Breaker `cold` **and** `insufficient_baseline` → ranking only, both reasons stated, no numbers. | test `Ui_NoNumbers_BothReasonsShown` |
| **Degraded mode** | C4 unreachable → knowledge panel shows "unreachable", **not** an empty mechanism list. An empty list means *below the bar*; unreachable means *unknown*. **These must not look alike.** | test `Knowledge_Unreachable_DistinctFromEmpty` |
| Queue is empty | "No submissions" — distinct from "all filtered out". | test `Queue_EmptyStates_Distinct` |
| A manager presses Enter on the queue | Nothing approves. | test `NoKeyboardApprove` |
| Rank-1 band overlaps rank-4 | Ordering shown as tied, with the overlap stated. | test `Ranking_OverlapShownAsTie` |
| ρ exists but n = 45 | **No ρ rendered.** Breaker `cold` + reason. | test `Dashboard_NoRhoBelowN60` |

## Failure Modes & Degraded Behavior
| Boundary | Failure | Degraded | Reconciliation | Spec |
|---|---|---|---|---|
| C2 API | Down | Queue shows a stale-data banner with `as_of`; **no verdict may be submitted** | Retry | `Ui_ApiDown_NoVerdictSubmission` |
| C3 calibration API | Down | Dashboard shows "breaker state unknown"; **UI treats unknown as not-armed** and hides numbers | Retry | `Ui_BreakerUnknown_HidesNumbers` |
| C4 | Down | Knowledge panel "unreachable"; nothing else affected | Retry | `Knowledge_Unreachable_DistinctFromEmpty` |

## Handoff Contracts
Types generated from `docs/initial/schemas/{rubric,events,mechanisms}-v1.json`. A generated type is **never widened by hand**; a schema change regenerates them and is a contract-version bump (CLAUDE.md rule 9).

## Implementation Tasks
| # | Task | Owner | File(s) |
|---|---|---|---|
| P9-T1 | Scaffold Vite + React + TS; schema → type codegen; wire `npm run typecheck` into `.claude/workspaces.json` | `frontend-engineer` | `src/Frontend/**`, `.claude/workspaces.json`, `CLAUDE.md` |
| P9-T2 | Triage queue (REQ-019) with risk-first ordering and per-item reason | `frontend-engineer` | `src/Frontend/queue/**` |
| P9-T3 | Verdict panel: vetoes + evidence, `suspected_veto[]` labelled model-raised, single-click approve, override with reason | `frontend-engineer` | `src/Frontend/verdict/**` |
| P9-T4 | Degraded + advisory banners, breaker-derived (REQ-018, REQ-038, REQ-052) | `frontend-engineer` | `src/Frontend/banners/**` |
| P9-T5 | Amplification + sign-off (REQ-037), blocked-rights naming, counterfactual (REQ-039) | `frontend-engineer` | `src/Frontend/amplification/**` |
| P9-T6 | Knowledge panel: statement, falsifier, warrant, provenance, `never_tested_against`; **no number** | `frontend-engineer` | `src/Frontend/knowledge/**` |
| P9-T7 | Operator dashboard: ρ+n+CI, breaker, **`suspected_leak` banner when ρ > 0.5 out-of-sample** (a leaking cohort is `armed`, so a high ρ must render as a warning, never as a win), override rate by cohort **and tier**, warrant rungs, falsified-this-refresh, `contrasted`-rate by ingestion arm, **ratification volume/latency/rejection** | `frontend-engineer` | `src/Frontend/operator/**` |
| P9-T8 | Fairness audit (REQ-054): the two slopes, per cohort, quarterly | `eval-harness-engineer` | `.../c1_pattern_engine/eval/fairness.py` |
| P9-T9 | UI suite: no bulk approve; no number when not armed; empty ≠ unreachable; no headline accuracy figure | `eval-harness-engineer` | `src/Frontend/__tests__/honesty.test.tsx` |
| P9-T10 | Quarterly "what changed" report **derived by reading C4** (REQ-070) | `frontend-engineer` | `src/Frontend/reports/**` |

## Files to Create / Modify
New under `src/Frontend/**`, `.../c1_pattern_engine/eval/fairness.py`. Modify `CLAUDE.md` §Commands, `.claude/workspaces.json`.

## Migration Steps
None.

## Verification Steps
1. `npm run typecheck && npm test` green. *(requires P9-T1..T10)*
2. Grep the built bundle for a bulk-approve handler → none. *(requires step 1)*
3. Set a cohort breaker to `tripped` → no VPS number rendered anywhere; the reason is shown. *(requires Phase 4 + step 1)*
4. Set n = 45 → no ρ rendered. *(requires step 1)*
5. Stop C4 → knowledge panel shows "unreachable", visually distinct from an empty-because-below-bar state. *(requires Phase 8)*
6. Attempt to approve via keyboard without opening the submission → nothing approves. *(requires step 1)*
7. Run the fairness audit on a fixture where VPS slope > performance slope by follower band → the report flags it. *(requires step 1)*
8. Run an accessibility pass (`accessibility-critic`) over the queue and verdict panel. *(requires step 1)*

## Acceptance Criteria
| # | Criterion | Evidence |
|---|---|---|
| A1 | **No bulk-approve exists** in any form | `honesty.test.tsx` + bundle grep |
| A2 | Breaker not `armed` ⇒ **no VPS number rendered**, reason shown | `Ui_NoNumberWhenNotArmed` |
| A3 | Breaker state unknown ⇒ treated as **not armed** (fail closed) | `Ui_BreakerUnknown_HidesNumbers` |
| A4 | `suspected_veto[]` is labelled model-raised and visibly **not acted on** | `VerdictPanel.test.tsx` |
| A5 | Every number carries provenance + `as_of`; every VPS/AWS labelled `Estimated` | `ProvenanceDisplay.test.tsx` |
| A6 | Empty ≠ unreachable, for both the knowledge panel and the trend feed | `Knowledge_Unreachable_DistinctFromEmpty` |
| A7 | `blocked_rights` candidates shown with the **named missing grant** | `Amplification.test.tsx` |
| A8 | Counterfactual displayed | `Counterfactual.test.tsx` |
| A9 | No client artefact without sign-off | `Signoff.test.tsx` |
| A10 | Knowledge panel renders **no `0-100` field, no effect size** | `Knowledge.test.tsx` |
| A11 | Dashboard shows ρ **with n and CI**; hides ρ when n < 60 | `Dashboard_NoRhoBelowN60` |
| A11b | ρ > 0.5 out-of-sample renders a **`suspected_leak` warning**, visually distinct from a healthy high ρ, on an `armed` cohort | `Dashboard_HighRho_ShowsSuspectedLeak` |
| A2b | The AWS artefact renders numberless on **low confidence with an armed breaker** (`insufficient_baseline` / overlapping bands), mirroring Phase 5 A11 — not only on breaker `not armed` | `Amplification_NumberlessOnLowConfidence` |
| A12 | Dashboard shows ratification volume, median latency, rejection rate per cohort | `Dashboard.test.tsx` |
| A13 | Override rate broken down by cohort **and creator tier** | `Dashboard.test.tsx` |
| A14 | **No headline accuracy figure anywhere** | `honesty.test.tsx` |
| A15 | Fairness audit compares VPS-on-band slope to performance-on-band slope | `test_fairness_slopes` |
| A16 | WCAG 2.2 AA on queue + verdict panel | `accessibility-critic` report |

## Out of Scope
No creator-facing trend feed (REQ-005g). No ad-account integration.

## Completion Criteria
Entry gate clean; `npm run typecheck` + `npm test` green; `measurement-reviewer` **PASS**, `veto-integrity-reviewer` **PASS**; `accessibility-critic` audited.
