# Workflow hardening — master implementation plan

Status: PLAN READY, IMPLEMENTATION BLOCKED — security PASS/A, Cutdown PASS/A, generalist READY/A after the hard-link correction. User accepted the 53-file single-phase size risk. The configured checkpoint failed because Git cannot create `.git/index.lock`; no implementation edit has begun. This current status supersedes the historical pending-approval/review statements below.
Date: 2026-09-10. Baseline: 3273f36d6f1b7b8bd0f5cbd83aaac3944b2fa0d8.

## Objective

Fix only the revalidated workflow gaps so ownership, checks, adapter status and agent guidance agree with the existing project contract.

## Requirements

Defining set: the eight actionable rows in [the audit](../progress/workflow-hardening-audit.md). WF IDs are user-authorized workflow platform maintenance, not new product requirements.

| ID | Required outcome | Source | Task |
|---|---|---|---|
| WF-01 | Configured Claude checks fit the outer timeout and launch; skips/failures remain distinguishable | F1 | T1 |
| WF-02 | Claude-owned paths remain protected under Windows case variants and every supported file-change operation | F2; AGENTS.md ownership | T2 |
| WF-03 | Respin role instructions prescribe the current stack | F3; CLAUDE.md:9 | T1 |
| WF-04 | Offline verification includes preflight and the worker-specific typecheck | F4; CLAUDE.md Commands | T4 |
| WF-05 | Schema changes get drift+typecheck; C4 changes get C# verification; coherent patches dedup and remain bounded | F5 | T3 |
| WF-06 | Generated missing/stale/orphan status is checked; custom implementations preserved and reported separately | F7 | T5 |
| WF-07 | Start-teams loads active phase plus dependency proofs without weakening dependency gates | F8; AGENTS.md | T1 |
| WF-08 | Sensitive defaults and doctor agree with Sol/high; every generated, native and project-default route follows the current AGENTS.md policy | F9; changed AGENTS.md routing | T6 |

## Decisions baked in

- One implementation phase, sequential owner handoff. No independent write agents are needed.
- Claude-owned corrections are a named upstream handoff, not permission for Codex to edit .claude/**. Codex may build tests and its own fixes; the phase cannot be complete until the upstream changes are supplied by Claude/the owner.
- Use parent execution via $implement for Codex tooling; no suitable workflow implementation specialist exists. Do not invent a role or send tooling to respin-engineer, whose scope is respin/. A blanket $start-teams execution is not an authorized workaround.
- Keep first-match focused routing; encode schema drift+typecheck together, route C4 through solution build plus architecture tests, retain dedup. Verify actual configured hook bootstrap and owned-child cleanup. No generic multi-match check engine.
- Keep all existing Claude route command budgets. Increase the outer hook budget only enough to support their current maximum with cleanup headroom.
- Sensitive mixed-risk generated roles respin-engineer and control-plane-engineer default to Sol/high. Classify all five current writers explicitly; unknown writers fail generation/doctor before writes. Non-sensitive work follows the current AGENTS.md ordinary route. Defaults do not prevent explicit bad runtime overrides.
- AGENTS.md was edited externally during review to Astra orchestration/reviews and higher Terra/Luna effort levels. Preserve the user's change and include the full corresponding migration in this phase: `.codex/config.toml`, the three native route files, `.codex/codex-overlay.md`, and all 30 marked generated agent projections. AGENTS.md is a read-only policy input for this phase, not a Codex-owned edit.
- Use one small shared Codex model-policy helper consumed by generator and doctor; independently pinned route tests prevent tautological green.
- Do not overwrite custom skills or delete orphans. Enumerate writers; generated-orphan diagnostics offer upstream source restoration before optional separately approved cleanup. Sync/doctor share pre-open path checks; doctor hashes only explicit canonical inputs, not the whole Claude tree.
- No nested Codex self-review: this session is Codex. Independent same-model reviewer contexts provide the required plan gate; independent cross-model assurance is unavailable.

## Critical Paths touched

Defining set: every row in CLAUDE.md's Critical-Path tables plus the security trigger.

| Path | Touched? | Reviewer / reason |
|---|---|---|
| Veto & verdict integrity | No | No product decisions changed |
| Boundaries & authority (UGC) | No | C4 check routing only, not its implementation |
| Measurement discipline | No | No metric/eval changes |
| Money & exploration | No | Model metadata only, not allocation logic |
| Cutdown measurement honesty | No | No counting or performance claims |
| Cutdown tenancy & boundaries | Yes | cutdown-boundary-reviewer; mirror traversal, Full gates=yes |
| Respin billing & credits | No | No billing or ledger change |
| Respin brain tenancy | No | No scope/query/data change |
| Respin spin compliance | No | No ingestion or output change |
| Respin learning honesty | No | No learning logic change |
| Security (additional gate) | Yes | security-reviewer; ownership guard and generated-target safety |

Gate: two separate path/security reviewers, then plan-reviewer last. Lean does not merge the Cutdown full gate. Round 1 used the previously observed Sol/max policy; the external policy delta was discovered after the generalist dispatch. The final round-2 gate must honor current AGENTS.md at Astra/max. Two path reviews completed in round 1; the generalist was paused after additional findings. No final independent READY verdict exists yet. Implementation repeats applicable gates; a plan PASS is not a code PASS.

## Project conventions pinned

Phase 1 embeds the golden rules and relevant lessons verbatim, plus ownership, stack, reachability, failure and verification contracts. Product invariants remain unchanged. Only the active phase and dependency proof are needed for implementation; plan review deliberately reads the entire plan set.

## Dependencies

Existing hooks, generator, package commands and Cutdown CLI are proven by the source paths in [the codebase review](../progress/workflow-hardening-codebase-review.md). No unshipped product dependency.

Execution authorization: the 2026-09-10 `$go implement` request authorizes the full plan scope and Codex-owned changes. Claude-owned T1 still requires the upstream owner. Dependencies/tool availability and live DB authority are verified separately before executing their checks.

## Phase plans

| Phase | Description | Depends on | Primary execution owner | Plan file |
|---|---|---|---|---|
| 1 | Complete workflow hardening and regression verification | none | Parent via $implement; Claude owner supplies T1; existing security-reviewer/cutdown-boundary-reviewer gate code | [Phase 1](workflow-hardening-phase-1.md) |

Parent execution is an explicit exception to specialist routing, not a newly invented agent. The existing reviewer roles are present in .claude/agents/.

## Deferral ledger / non-goals

No original-scope behavior or test is deferred to another phase. T1 is a within-phase owner handoff, not a partial-completion exemption. T6 includes the full routing migration caused by the external AGENTS.md policy change; no route is left to unnamed concurrent work.

Excluded: F6 caching/queues; universal parked-product post-edit coverage; automatic orphan deletion; converting custom skills; deployment, purchases or live database writes; changes to product contracts/auth/billing/tenancy; hypothetical enforcement of arbitrary runtime model overrides; unrelated project-context cleanup. These are not promised follow-up work.

## Derived budgets

| Budget | Derivation / limit |
|---|---|
| Claude outer post-edit | 330 seconds = current maximum command budget 300 seconds + 30 seconds cleanup/diagnostic headroom; preserves existing command work |
| Claude accepted maximum | 300000 ms = maximum current .claude/workspaces.json command budget; default remains 150000 ms |
| Codex aggregate child-work deadline | Existing outer 300 seconds minus existing design's 15-second cleanup margin = 285000 ms; child timeout is min(configured budget, remaining aggregate budget) |
| Reviewer rounds | At most 2 gate rounds, from create-plan §6d; third requires user direction. Three contexts were started in round 1; two completed and the generalist was paused. No round 2 has run. |
| Agents / updates | At most 4 subagents, waits <=50 seconds and updates at least once/minute, from AGENTS.md |
| Recurring cost / dependencies | No new external service, paid dependency or recurring infrastructure cost; no dollar saving estimate |
| Performance claims | None; timing recorded only as observed evidence, never extrapolated token savings |

## Risks and recovery

Guard regression can permit protected writes: planted negative probes must fail before code acceptance. Sync failure must preserve custom/upstream bytes and return nonzero with a remedy. Model changes can increase ordinary work cost: bounded non-sensitive overrides remain available. Timeouts must not silently report unfinished work as passed. Missing toolchains or live DB authorization result in explicit missing evidence, not a green phase.

Recovery is a narrow reviewed correction/reversion of owned changes; never reset a dirty worktree, delete unowned adapters, or roll back the user's files. No data migration exists.

## Progress tracking

| Phase | Implementation | Evidence | State |
|---|---|---|---|
| 1 | Not started | Final plan gates PASS/A; checkpoint attempt failed with filesystem permission denial | BLOCKED before implementation: checkpoint disposition; later T1 still requires upstream owner |

One phase report card at docs/progress/workflow-hardening/1-report.md, transcripts in that directory, and this ledger row; no per-task report sets.

## Exit demonstration

There is no separate workflow phase exit-gate doc. The applicable CLAUDE.md Definition of Done says verbatim:

> **Reachability:** a user path reaches this change — or the plan names the slice that makes it live. A capability nothing can reach is not done, it is inventory.

Demonstrate: supported edit inputs select/execute expected bounded checks; mixed-case protected targets deny without writes; sync -Check detects a planted orphan in a fixture and is clean on the real target; generated sensitive defaults are Sol/high; the real offline entry profile runs every declared command. Live migration/concurrency evidence is separately authorized and cannot be inferred from offline success.

## Plan review log

Initial mechanical audit passed: requirement parity 8/8, one phase, file/task closure 19/19, verbatim golden rules and four unique invariant IDs. The scope-pinned revision has 53 exact file rows, including all 30 generated role projections and the three native routes. This exceeds the 25-row size signal. The proposed disposition is one phase because one sync invocation computes the complete marked projection population and splitting plan documents would not shrink the actual write surface. The user's request authorizes this full WF-08 scope, but explicit acceptance of the size-related review risk remains pending and no gate or round limit is waived.

Round 1: security-reviewer BLOCK (six findings); cutdown-boundary-reviewer NEEDS CHANGES (two retained findings; the proposed start-teams target write was withdrawn after source inspection). The final plan-reviewer began last and added C4 Host compile coverage plus sync-read coverage (merged with security's read-scope issue); it was paused before a final verdict while the external routing decision was unresolved.

Round 2 used separate Astra/max security and Cutdown contexts, then an Astra/max plan-integrity context last. It returned NOT READY with six findings: structural marker ownership, source-less orphan candidate reads, a planted exact-manifest widening witness, two stale/contradictory descriptions, and the unresolved >25-row size disposition. All five contract corrections are incorporated; explicit user acceptance of the size risk and one final reviewer round are still required. No code fix, product gate or independent final sign-off is claimed. See [the review record](../progress/workflow-hardening-plan-review.md).
