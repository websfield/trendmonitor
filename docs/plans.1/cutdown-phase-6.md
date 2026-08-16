# Phase 6 — End-to-End Proving Run + Implementation-Complete Handover

**Feature:** cutdown · **Depends on:** 5 · **Owner agent:** general-purpose

## Project Conventions Pinned (READ FIRST)

*(Identical block to `cutdown-phase-1.md` §Project Conventions Pinned — paste verbatim into the implementing agent's prompt; normative here.)*

Phase-6 additions:
- This phase can earn `PIPELINE_IMPLEMENTATION_COMPLETE`; only the later 20-output real-footage accumulation can earn `PHASE_0_EXIT_EARNED` (D-38). Status must report both names and may legitimately show the first green and the second red.
- Real client footage is rights-sensitive: it enters only with completed rights records (D-27), stays in `project-data/`, and reaches models only as minimized inputs (PRD §10.7).

## Requirements Checklist (functional)

- [ ] PRD §15 Phase 0 row — machinery for all four exit criteria demonstrated end to end
- [ ] REQ-034 and REQ-106 spot-verified on the skills-only proving job; repeat on a real job when D-27 inputs exist and record `BLOCKED-ON-D-27` otherwise
- [ ] Developer-guide §4 status-update cadence exercised (first real status report produced)

## Requirements Checklist (technical)

- [ ] The entire pipeline drivable from Claude Code via `/cutdown-*` skills alone (tech-spec §1 Stage A claim, proven)
- [ ] Kill-resume proven at job level across a multi-skill sequence (runner §8, not just per-skill)
- [ ] Cost accounting visible: per-job token/minute usage totals in run-log + `status` output (tech-spec §13)

## Implementation Tasks

| # | Task | File(s) |
|---|---|---|
| 1 | Skills-only fixture run: brief → atomic mixed-asset ingest → index → propose → plan → deterministic validate + advisory critic → draft render → draft QA → approve draft → final render → final QA → package. Save the transcript and prove the package references approval, contract set, final range validation, QA/waivers, rights, and `sourceClassification=fixture` | `cutdown/docs/proving-run-placeholder.md` |
| 2 | Kill-resume drill: kill the runner mid-pipeline (during index and again during render); resume completes without re-running finished LLM stages (run-log evidence) | run-log excerpts into the proving-run doc |
| 3 | First real job when D-27 footage/rights and D-36 account IDs exist: same flow, named approval, `sourceClassification=real`. Otherwise record explicit `BLOCKED-ON-D-27/D-36`; this does not turn the implementation milestone into the product-exit milestone | `cutdown/docs/proving-run-real.md` or blocker note |
| 4 | Golden-set seeding: promote the proving-run's job (placeholder one if real is blocked) into `data/golden-sets/e2e/` as the standing end-to-end fixture | `cutdown/data/golden-sets/e2e/**` |
| 5 | Cost report: per-stage token/compute/duration table from run-logs for one full job; flag against the D-21 ceiling | appendix in proving-run doc |
| 6 | Handover addendum: anything learned that changes `developer-guide.md` or adds `decisions.md` rows (e.g. actual CPU ASR throughput → D-17 trigger status) applied to those docs | `docs/video-editing/developer-guide.md`, `docs/video-editing/decisions.md` |
| 7 | Master-plan Progress Tracking + dated phase notes; paste status output with the two D-38 milestones and per-criterion evidence/breakdown | `docs/plans/cutdown-master-plan.md` |

## Edge Cases & Failure Paths

- Real footage absent → blocker note; implementation milestone may pass, product exit stays red. Approval rejected → `revise`, new draft, new approval; the original decision remains immutable. Final QA failure after approval → blocked before package. Warning waiver → named D-35 record. Spend ceiling hit → pause live work. A real-only failure becomes a regression fixture before its fix.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Proof |
|---|---|---|---|
| Whole pipeline | any stage blocked | job in `blocked` with structured cause; `status` names it; resume after fix | drill in task 2 |
| Owner availability | D-27 inputs missing | placeholder path + honest red; escalation logged in status update | task 3 note |

## Handoff Contracts

Consumed by operations (the 20-output accumulation) and by product-Phase-1 planning: the e2e golden set, the cost table (feeds PRD §14.3 unit-economics baselines), the proving-run docs.

## Verification Steps

1. Phase 5 evidence on disk (mirror works, package/approve round-trip).
2. Task 1's session: every public stage invoked via `/cutdown-*`; QA remains the documented runner post-step, not a fictional `/cutdown-qa` skill.
3. Task 2's kills at two different stages; resume; run-log shows skipped completed stages.
4. `cutdown status --phase0` before/after: fixture count moves but approved-real count does not; real run moves the stable account ID; milestone labels remain correct.
5. Entry gate green one final time across the whole workspace.

## Acceptance Criteria (PASS/FAIL)

- A complete ContentPackage produced through the skills-only public surface and runner-owned QA, with acyclic approval/package lineage.
- Kill-resume at job level proven twice with no LLM-stage re-execution (run-log excerpts).
- Cost table exists with per-stage numbers and a ceiling comparison.
- `status --phase0` output pasted with `PIPELINE_IMPLEMENTATION_COMPLETE` and `PHASE_0_EXIT_EARNED` independently correct.
- Real-footage task either done (rights-recorded) or explicitly BLOCKED-ON-D-27 — no third state.

## Out of Scope

The 20-output accumulation itself; any Phase 1 feature; performance/analytics claims of any kind (no baseline exists yet — PRD §14.2 is explicit that uplift claims need cohorts).

## Completion Criteria (Definition of Done)

`PIPELINE_IMPLEMENTATION_COMPLETE` green, Cutdown entry gate green, `code-reviewer` PASS, proving-run docs written, and master tracking updated. `PHASE_3_ACCEPTED_LIVE` and `PHASE_0_EXIT_EARNED` are reported independently and strictly from live/real evidence.
