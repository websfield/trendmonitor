# Phase R4a — Host projects (C2, C3, C4) + RUNBOOK deploy/rollback

**Depends on:** R0 (ADR-0007 host-separation property). **Primary agents:** `control-plane-engineer`, `eval-harness-engineer`. **Gates:** `boundary-reviewer`, `veto-integrity-reviewer` (host must not introduce an auto-approval or model-in-decision path).

> **Scope note.** #3/#7 are the audit's largest item. R4a makes the components *runnable services* (the missing `Program.cs`). R4b (next) wires the *real cross-process transport* between them. Splitting bounds each phase's blast radius and lets each gate independently.

## Project Conventions Pinned (READ FIRST — verbatim from CLAUDE.md)

- **Non-negotiable rule 3:** C2 never calls C1 and never calls C4; C4 writes nothing, calls nothing, reads no breaker; its whole read grant is one artefact-store prefix. **No config, admin flag, or per-campaign exemption overrides these.**
- **Non-negotiable rule 4:** Fail closed. Unreachable C3 / stale breaker cache (>60s) / version-triple mismatch / missing library / model schema failure degrades to `cold`/advisory/`NEEDS_REVIEW`.
- **Non-negotiable rule 2:** No auto-approval, ever — the host exposes no endpoint that approves without a human click.
- **ADR-0007 (as revised in R0):** C2/C3/C4 must not share a *host project* at runtime. The safety property is host-project separation, provable, not just reference-graph non-reachability.
- **Available agents:** `control-plane-engineer`, `eval-harness-engineer`, `boundary-reviewer`, `veto-integrity-reviewer`.

## Requirements Checklist (functional)

1. **#7/#3:** three ASP.NET host projects with `Program.cs` — C2 (`UgcIntelligence.C2.Host`), C3 (`UgcIntelligence.C3.Host`), C4 (`UgcIntelligence.KnowledgeApi.Host`, own solution folder). Each is `Microsoft.NET.Sdk.Web`, hosting its existing class-library logic.
2. C4's host wires **only** the one-prefix artefact read grant — no event-log reference, no breaker reader, no C1/C2/C3 project reference.
3. A **host-separation test** asserts the three hosts are distinct executables and: C2's host references neither C1 nor the Knowledge API assembly; **C3's host is reader-only** (references `IOutcomeEventReader`, not `UgcIntelligence.Events.Writer`, and not C1); C4's host references neither the event log nor the breaker (extends `ReferenceGraphTests.cs` from assembly-reachability to host-composition). **Residual (named, not closed here):** this test proves the three hosts don't cross-reference, but does not prevent a *future* composition root from referencing all three host assemblies and co-hosting them in one process — that stronger property is out of scope for R4a and tracked as **DR5** in the master plan's Deferral Ledger (a follow-up ADR-0007 hardening item when a deploy topology is chosen).
4. **#7:** RUNBOOK.md gains a real Deploy section (per-host run command, environment list) and a named Rollback path for the new hosts.

## Requirements Checklist (technical)

- Endpoints expose existing deterministic logic; **no new decision logic** is written in the host. Approval endpoints require `human_approved_at` (delegate to `ApprovalService`, unchanged).
- Fail-closed wiring: C2's breaker reader is the R4b HTTP client (stubbed until R4b) that returns `cold` when C3 is unreachable — never a default that permits scoring/approval.
- Config/secrets via env/`appsettings` (no secrets in code — golden rule 2). `appsettings.json` holds non-secret config only.
- C4 host has no `IOutcomeEventReader`, no `IBreakerReader`, no C1/C2 reference — provable by the host-separation test.

## Edge Cases & Failure Paths

- **C3 unreachable at C2 startup:** C2 host starts, breaker reads `cold`, scoring is advisory — host does not crash and does not approve. (Full transport is R4b; here the client is a fail-closed stub.)
- **C4 asked for a cohort with no artefact:** returns `200` + `coverage.state` (per base-plan A/#8 of Exit Demo), never `500`.
- **Teardown:** each host has a clean shutdown; no host writes the event log except C2 (sole-writer preserved — C3/C4 hosts reference the reader/none).

## Handoff Contracts

Consumes R0's ADR-0007. Produces three runnable hosts + a fail-closed `IBreakerReader` HTTP client seam that R4b fills with the real transport.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| R4a-T1 | `UgcIntelligence.C2.Host` (Web SDK, `Program.cs`, endpoints delegating to existing C2 services) | control-plane-engineer | `src/ControlPlane/UgcIntelligence.C2.Host/*` (new) |
| R4a-T2 | `UgcIntelligence.C3.Host` (breaker/calibration endpoints) | control-plane-engineer | `src/ControlPlane/UgcIntelligence.C3.Host/*` (new) |
| R4a-T3 | `UgcIntelligence.KnowledgeApi.Host` (own folder, one-prefix read grant only) | control-plane-engineer | `src/KnowledgeApi/UgcIntelligence.KnowledgeApi.Host/*` (new) |
| R4a-T4 | Host-separation test (distinct hosts; C2 host references no C1/C4; C4 host references no event-log/breaker) | eval-harness-engineer | `tests/Architecture/ReferenceGraphTests.cs` (extend) |
| R4a-T5 | Add the three hosts to `UgcIntelligence.slnx` | control-plane-engineer | `UgcIntelligence.slnx` |
| R4a-T6 | RUNBOOK Deploy + Rollback for the new hosts | control-plane-engineer | `RUNBOOK.md` |

## Files to Create / Modify

New host projects under `src/ControlPlane/` (C2, C3) and `src/KnowledgeApi/` (C4); `UgcIntelligence.slnx` (Mod), `tests/Architecture/ReferenceGraphTests.cs` (Mod), `RUNBOOK.md` (Mod), `appsettings.json` per host (New, non-secret).

## Verification Steps

1. `dotnet build UgcIntelligence.slnx` → all four+three projects build. (State: R4a-T1..T5.)
2. `dotnet test tests/Architecture` → host-separation test green (R4a-T4). 
3. `dotnet run --project src/ControlPlane/UgcIntelligence.C2.Host` starts and serves a health endpoint (smoke). (State: R4a-T1.)
4. Falsification: add a temporary C4→event-log reference → host-separation test fails; remove.

## Acceptance Criteria (verifiable PASS/FAIL)

- **A-R4a-1:** three host projects exist, each with a `Program.cs`, all in `.slnx`, all build. (evidence: files + build output)
- **A-R4a-2:** host-separation test asserts C2 host → no C1/C4 assembly; C3 host → reader-only (no `Events.Writer`, no C1); C4 host → no event-log/breaker. (evidence: test name)
- **A-R4a-3:** C2 host with C3 unreachable serves advisory (breaker `cold`), never approves. (evidence: test/smoke)
- **A-R4a-4:** RUNBOOK has per-host deploy commands, an env list, and a named rollback. (evidence: RUNBOOK line)
- **A-R4a-5:** existing suites green; no auto-approval endpoint (veto reviewer confirms).

## Out of Scope

The real Python→store write and C# artefact read (R4b). No frontend. No live LLM. No secret values committed.

## Completion Criteria (DoD)

Build + tests green; a host smoke-starts; `boundary-reviewer` PASS (host separation, C4 grant, sole-writer intact); `veto-integrity-reviewer` PASS (no auto-approval path in the host).
