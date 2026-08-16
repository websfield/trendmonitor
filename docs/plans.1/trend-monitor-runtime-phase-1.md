# Phase 1: Docs-first — Runtime ADR + Contract Note

## Objective
Record the trend-monitor runtime architecture (Python entrypoint + external cron) and its divergence from the tech spec's named Hangfire runner **before** any runtime code, per CLAUDE.md docs-first / non-negotiable rule 9.

## Prerequisites
- [ ] `DECISIONS.md` entries for scope + scheduler host exist (done 2026-07-16).
- [ ] Brief + codebase review read.

## Requirements Checklist
- [ ] R1: A new ADR (`docs/initial/adr/0009-trend-monitor-runtime.md` — 0008 is taken by `0008-durable-outcome-and-artefact-store.md`; verify 0009 is still free) states: the trend scan is non-decisional intelligence-plane work; it runs as a Python entrypoint behind a scheduling *port*; external cron/scheduler triggers it; Hangfire stays for .NET-side jobs only. Acceptance: ADR has Status/Date/Deciders, Context, Decision, Consequences, and links ADR-0004/0006.
- [ ] R2: The ADR names the invariants the runtime must preserve (REQ-005e trend→score isolation; Proxy labelling; `ingestion_arm` ≠ amplification `arm`; manager-facing feed; **the per-tenant verdict-input supplier is config/artefact-only forever — C1 never grows a read path into ClientHub operational data, Phase 6 R1**; **the trend-path allowlist gates keyless volume fetch only — the D5 legal gate on live exemplar-media ingestion stays closed, Phase 7 R4**) and points at the five guard tests (enumerated in the master plan §Quality Gates). Acceptance: each invariant cites its rule/test.
- [ ] R3: `docs/initial/integration-contract.md` gets a short runtime note (the trend monitor is a scheduled C1 job writing `TrendSignal`s to its own store; it calls no other component and no other component calls it). Acceptance: note added, cross-links the ADR; no existing contract text weakened.
- [ ] R4: The stale scheduler expectation is corrected where it actually lives: `RUNBOOK.md:44` (the known-unbuilt-seams note naming the Hangfire runner) and `docs/initial/tech-spec-trend-subsystem.md` §Cadence/API (`/internal/trends/scan → scheduled`) get a pointer that the trend scan is hosted by the Python entrypoint + external cron per ADR-0009. **`tech-spec-ugc-intelligence.md:23`'s Hangfire line stays** — it is the .NET submission-enqueue path, genuinely Hangfire's job, unaffected by this decision. Acceptance: no text remains that reads as "Hangfire runs the trend scan"; the submission-path Hangfire mention is untouched.

## Implementation Tasks
1. [ ] Confirm the next free ADR number (`ls docs/initial/adr/`).
2. [ ] Write the ADR from R1/R2.
3. [ ] Add the integration-contract runtime note (R3).
4. [ ] Correct the tech-spec/RUNBOOK Hangfire pointer (R4).

## Files to Create/Modify
| File | Action | Purpose |
|---|---|---|
| `docs/initial/adr/000N-trend-monitor-runtime.md` | Create | The runtime decision + divergence |
| `docs/initial/integration-contract.md` | Modify | Runtime note for the scheduled C1 job |
| trend tech spec / `RUNBOOK.md` | Modify | Correct the Hangfire-runner expectation |

## Verification Steps
1. [ ] ADR renders, links resolve, invariants each cite a rule/test (R1,R2).
2. [ ] Integration-contract note is consistent with ADR-0004/0006; no invariant weakened (R3).
3. [ ] No contradictory "Hangfire runs the trend scan" text remains (R4).

## Completion Criteria
- [ ] Boundaries gate (`component-boundaries` / `boundary-reviewer`) PASS on the docs diff.
- [ ] Docs cross-references consistent; entry gate unaffected (docs-only).
