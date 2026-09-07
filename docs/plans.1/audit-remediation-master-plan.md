# Master Plan — Audit Remediation (2026-07-14)

**Objective:** Close every finding in [`../progress/audit/2026-07-14.md`](../progress/audit/2026-07-14.md) — the three CRITICAL invariant/backbone defects, six HIGH, seven MEDIUM, and the LOW/hygiene tail — through the project's Critical-Path gates, so the register's **Not yet — grade D** becomes **Ready**, without weakening any invariant.

**Audit artefact (this plan's codebase review):** [`../progress/audit/2026-07-14.md`](../progress/audit/2026-07-14.md) — a 4×-confirmed, evidence-cited defect register with a Fix, Owner, and ADR note per finding. This hardening plan consumes it rather than re-deriving it; the top four findings (#1, #2, #4, #11) were re-verified against the code on disk before this plan was written.

**Workflow type:** Refactoring / Hardening (audit-first; the audit above is the required pre-plan artefact).

---

## Requirement IDs

No new requirements. Every fix restores an already-tracked invariant: REQ-021 (no auto-approval, #1/#11), REQ-017 (override as compensating event, #1), the Contract-B wire format (#2), ADR-0007 host separation (#3/#7), ADR-0001 provenance & measurement discipline (#12/#13), ADR-0003 budget (#10), plus WCAG 2.2 AA (#9/#14/#15) and doc-currency (#6).

## Non-Goals (this scope)

| Non-goal | Reason / receiving home |
|---|---|
| `git init` + first commit (#8) | **Surfaced, not performed.** Project rules bar any git operation without explicit user request. Flagged in the final report for the user to run. |
| Live LLM judge / real transport of tenant secrets | Unchanged from the base plan's D3 blocker (APP 8). #3 builds the artefact/breaker transport, not a live model provider. |
| Retiring the in-memory event log for a durable store (#16 code) | This plan writes the **retention/durability note + ADR** (#16 doc). The durable-store *migration* is an ocean; recorded as ADR exit criteria, not built here. |
| Running vitest to green (#9/#14/#15 execution proof) | The local npm env is corrupted (phase-9-evidence). R5 fixes the code + verifies by typecheck and, if the env can be repaired, vitest; if not, the block is reported honestly, not hidden. |
| New product behaviour | This is remediation. No finding licenses a feature. |

## Critical Paths touched (drives Step 6 reviewer selection)

*Derived from each phase's Completion Criteria below.*

| Critical Path | Touched? | Phases | Reviewer agent |
|---|---|---|---|
| Veto & verdict integrity | **yes** | R0 (schema), R1, R4a/R4b (host must not auto-approve) | `veto-integrity-reviewer` |
| Boundaries & authority | **yes** | R0, R2, R4a, R4b | `boundary-reviewer` |
| Measurement discipline | **yes** | R0 (#16), R3 (#12/#13), R4b (VPS Anchored reachability) | `measurement-reviewer` |
| Money & exploration | **yes** | R3 (#10) | `budget-exploration-reviewer` |
| Accessibility (auditor lens, no gate agent) | n/a | R5 | `accessibility-critic` (audit) + `code-reviewer` |

## Decisions baked in

| Decision | Chosen | Alternative rejected | Because |
|---|---|---|---|
| #1 override guard placement | Persistence-boundary throw in `EmitVerdictOverriddenAsync`, enforcing **both** the human-click timestamp **and** the live-veto re-check — the latter made possible by adding a `BlockingVeto` flag (from the live `ComplianceResult`) to `VerdictOverriddenRecord`, so the boundary itself can refuse an approval over a fired/unevaluable veto | Guard only in `OverrideService`; or claim a boundary guarantee the record can't back | The invariant must hold even if a future caller bypasses `OverrideService`. The plan-gate caught that the emitter can only enforce what the record carries — hence the `BlockingVeto` flag. |
| #1 schema | `events-v1.json` → **1.3.0**, add `human_approved_at` to `VerdictOverridden` | Mutate 1.2.0 in place | CLAUDE.md rule 9 / rule 6: never mutate a published contract; a semantic change bumps the version. |
| #2 wire format | Reuse the exact `JsonSerializerOptions` from `Mechanism.cs`/`ExemplarIndex.cs` (`SnakeCaseLower` + snake_case `JsonStringEnumConverter`) | New bespoke options | Economy of means; the codebase already solved this once. |
| #19 `hook_gate_fired` | **Populate** it from `VerdictEngine` (non-breaking) | Remove the schema field (breaking) | Populating keeps the published 1.2.0 field meaningful with no version churn. |
| #3 hosts | Three ASP.NET **host** projects (C2, C3, C4) with `Program.cs`, C4 in its own solution folder with a one-prefix read grant | One shared host | ADR-0007 §5 forbids co-hosting C1's process; #3 asks the same be true (and *provable*) for C2/C3/C4. |
| #12 demote serialization | `publish_library` **skips/excludes** an unratified `FALSIFIED` mechanism (retain for audit) | Require ratified input | Matches the module's own docstring promise; fail-closed on publish, never crash the cohort. |

## Dependencies (proof-of-shipped required)

Every base-plan phase (0–9) is **Complete** on disk (master plan Progress Tracking; ledger through 2026-07-13). This plan edits that shipped code. A remediation phase may not start until its `Depends on` predecessor's Acceptance Criteria are green on disk.

## Derived Budgets

No new numeric targets. Existing budgets (ε floor 0.10, breaker TTL 60s, ρ≥0.35/n≥60, touch-target 44px for primary actions per the audit's stricter-than-WCAG-2.5.8 bar) are inherited from the base master plan and the audit's own stated bar (#15).

## Risk Assessment (pre-mortem)

| Risk | Severity | Mitigation | Phase that proves it |
|---|---|---|---|
| #1 fix guards `OverrideService` but a direct `EmitVerdictOverriddenAsync` caller still auto-approves | **P1** | Guard at the persistence boundary (the emitter), test the bypass path directly | R1 |
| Schema bump 1.3.0 mutates 1.2.0 or forgets C# regen | High | R0 adds a new version block with changelog; R1 regenerates/aligns C# and a schema-parse test guards it | R0, R1 |
| #2 fix makes C# NDJSON snake_case but Python `internal.py` still can't parse it | High | Round-trip test feeds C#-serialized output into the **real** Python `internal.py` assembler (no tautological stub) | R2 |
| #3 hosts co-located in one process, silently re-coupling C2→C4 | **P1** | Host-separation test proves the three hosts don't cross-reference + ADR-0007 revised to the host-project property; **the stronger "no future single-process composition root" property is not closed here** — tracked as DR5 | R4a (partial); DR5 (residual) |
| #12/#13 demotion drifts from promotion criteria | Medium | Route demotion through `compute_warrant` or document the single decay signal; test the unratified-FALSIFIED publish path | R3 |
| R5 ships a11y fixes that vitest can't prove (blocked env) | Medium | Typecheck + code-reviewer + accessibility-critic on the diff; report vitest block honestly, do not claim "tests pass" | R5 |
| R6 sync-docs "fixes" a doc into a new falsehood | Medium | sync-docs only makes docs match on-disk reality; subjective rewrites asked before applied | R6 |

## Deferral Ledger

| # | Deferred | From | Receiving home | Ocean? |
|---|---|---|---|---|
| DR1 | Durable event-log / artefact store + data-subject erasure path (#16 code) | R0 | ADR (written in R0) with stated exit criteria; migration is a separate future phase | Yes — a real store migration, not completable in this remediation. |
| DR2 | `git init` + backup (#8) | — | User action (Non-Goal above) — project rules bar agent git ops | Yes — outside agent authority. |
| DR3 | Real exemplar-corpus ingestion / live LLM provider | — | Base-plan D3/D5 external blockers, unchanged | Yes |
| DR4 | vitest green execution (#9/#14/#15 runtime proof) | R5 | **CLOSED 2026-07-28** — local npm env repaired (jsdom present); `npm --prefix src/Frontend test` runs green: 10 files / **86 tests pass** under vitest 2.1.9, typecheck 0 errors. No longer a residual. | No — completable once env is fixed; not silently dropped. |
| DR5 | Prevent a *future* single-process composition root from co-hosting C2/C3/C4 (stronger than R4a's no-cross-reference test) | R4a | A follow-up ADR-0007 hardening item + assertion when a deploy topology is chosen; recorded, not silent | Yes — depends on a deployment topology that does not exist yet. |
| DR6 | The unbuilt architecture seams named in audit #22-27 — Hangfire (job runner referenced in CLAUDE.md/tech-spec, zero `src/` refs) and `ArtefactStore`'s local-filesystem backing vs ADR-0007's edge-cacheable serving | — | **Out of scope, not remediated:** both are unbuilt-seam observations ("not yet misleading" per the audit), not defects. Hangfire lands when a job is built; the networked artefact backing is folded into DR1's durable-store ADR (R0-T6). Noted in R6-T3 so the doc set records them as known seams. | Yes |

## Phase Plans

| Phase | Description | Depends on | Primary Agent(s) | Plan file |
|---|---|---|---|---|
| R0 | **Docs-first**: `integration-contract.md` Contract-B wire-format line (#2) + retention/durability note (#16); `events-v1.json` → 1.3.0 adding `VerdictOverridden.human_approved_at` (#1); ADR-0007 revision to host-project separation + new ADR for cross-process transport gap (#3) + ADR for durable store exit criteria (#16); Gate-A sequence-diagram `active_version` resolve step (#18) | none | `control-plane-engineer` | [`audit-remediation-phase-R0.md`](audit-remediation-phase-R0.md) |
| R1 | **Veto/verdict & compliance integrity (C#)**: #1 override→APPROVED guard + live-veto re-check + `human_approved_at`; #4 V1 fail-open → `Unevaluable`; #5 judge-result null-safety; #11 `RecordHumanApproval` ladder check; #17 doc comment; #19 populate `hook_gate_fired`; #20 `SuspectedVeto.FromModel` adapter; #21 `Untrusted<T>` marking at load | R0 (schema 1.3.0) | `control-plane-engineer` | [`audit-remediation-phase-R1.md`](audit-remediation-phase-R1.md) |
| R2 | **Contract-B serialization (C#/Python)**: #2 apply `JsonSerializerOptions` to `ToReplayExportNdjson` + C#→Python round-trip test into the real `internal.py` assembler | R0 (Contract-B line) | `control-plane-engineer`, `eval-harness-engineer` | [`audit-remediation-phase-R2.md`](audit-remediation-phase-R2.md) |
| R3 | **Measurement & budget backend (C#/Python)**: #10 wire real `OutperformanceRatio`; #12 skip unratified `FALSIFIED` on publish; #13 route demotion through `compute_warrant` (or document the single decay signal) | none | `control-plane-engineer` (#10), `intelligence-plane-engineer` (#12/#13) | [`audit-remediation-phase-R3.md`](audit-remediation-phase-R3.md) |
| R4a | **Host projects (C#)**: ASP.NET `Program.cs` hosts for C2, C3, C4 (C4 own folder, one-prefix read grant); host-separation test; RUNBOOK deploy + rollback for the new hosts (#7) | R0 (ADR-0007) | `control-plane-engineer`, `eval-harness-engineer` | [`audit-remediation-phase-R4a.md`](audit-remediation-phase-R4a.md) |
| R4b | **Cross-process transport (#3)**: Python `pattern_library.py`/`mechanism_library.py` write to the `<prefix>/<sha256[0:2]>/<sha256>.json` shared store; C2 pattern-artefact resolver; HTTP `IBreakerReader` client; one end-to-end test from Python's real serialized output → C# read → VPS reaches `Anchored` | R0, R2, R4a | `control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer` | [`audit-remediation-phase-R4b.md`](audit-remediation-phase-R4b.md) |
| R5 | **Frontend accessibility (#9/#14/#15/#22-24 UI)**: focus management on route/view change; override `role="status"` + form reset; 44px primary buttons; `document.title` per route; `aria-describedby` on disabled submits | none | `frontend-engineer` | [`audit-remediation-phase-R5.md`](audit-remediation-phase-R5.md) |
| R6 | **Doc currency (#6/#22-27 docs)**: `/sync-docs` to correct the stale "docs-only" claims in CLAUDE.md, NORTH_STAR.md, `.claude/project-context.md`, RUNBOOK.md; regenerate RUNBOOK Deploy/Config/Observability; retire the second stale codebase-review doc | R1,R2,R3,R4a,R4b,R5 | orchestrator via `/sync-docs` command | [`audit-remediation-phase-R6.md`](audit-remediation-phase-R6.md) |

**Parallelism:** R1, R3, R5 have no cross-dependencies and may run concurrently once R0 lands (R1 needs R0's schema; R3/R5 need nothing). R2 needs R0. R4a needs R0; R4b needs R0+R2+R4a. R6 is last (docs reflect final code).

## Progress Tracking

| Phase | Status | Review | Evidence |
|---|---|---|---|
| Plan review | **READY** (Grade A after 2 rounds) | [audit-remediation-plan-review](../progress/audit-remediation-plan-review.md) | 4 Critical-Path reviewers + generalist; 12 round-1 + 5 round-2 findings all resolved |
| R0 | **Complete** | `boundary-reviewer` PASS (Grade A), `measurement-reviewer` PASS (Grade A) | events-v1.json → 1.3.0 (1.2.0 intact, `VerdictOverridden.human_approved_at` added); Contract B wire-format + retention note; ADR-0007 §6 host-separation + dated transport-gap; ADR-0008 durable store; Gate-A `active_version` resolve step; all 3 schemas parse; A-R0-1..6 met |
| R1 | **Complete** | `veto-integrity-reviewer` PASS after 2 fix rounds (impl → NEEDS CHANGES #19/BlockingVeto → NEEDS CHANGES docstring/symmetry → clean) | #1 override→APPROVED guarded at the persistence boundary, veto re-check computed there from `ComplianceResult` (no caller-supplied bool); **both** APPROVED-emitting boundaries (`EmitVerdictIssued`/`EmitVerdictOverridden`) reject approval over a live veto (symmetric); #4 V1 null-features→Unevaluable; #5 judge null-safety + cancel-exempt catch; #11 ladder ∈{APPROVED,APPROVED_WITH_NOTES}; #17 doc; #19 `hook_gate_fired` true on hook<50 revise (single-source); #20 `SuspectedVeto.FromModel` + IL non-reachability test; #21 deferred to R4b-T7 (no load site today); **418 C# tests green**, all guards falsified; C# contract mirror aligned to 1.3.0 |
| R2 | **Complete** | `boundary-reviewer` PASS (Grade A) | `ToReplayExportNdjson` uses shared snake_case `JsonSerializerOptions` (`EventSerialization.cs`); `event_type` kept PascalCase-string via `[JsonStringEnumMemberName]` to match `internal.py` + Contract B; idempotency keys unchanged (ToString path), tenancy intact, no new read path; round-trip test folds a C#-generated fixture through the **real** `internal.py` assembler (not a stub); C# 418 + Python 249 green; A-R2-1/2/3 met |
| R3 | **Complete** | `measurement-reviewer` PASS (Grade A, #12/#13), `budget-exploration-reviewer` PASS (Grade A, #10) | #12 publish excludes unratified via `not is_ratified` (fail-closed; ratified-FALSIFIED still serializes; `is_ratified` aligned to the full triple `to_dict` checks); #13 demotion routed through `compute_warrant`, target = recomputed rung (withdraw-to-RECURRENT on decay, FALSIFIED only on undefined/below disjoint); #10 real median/MAD `OutperformanceRatio` threaded through `GateBCandidate`, allocator provably inert to it (ε/arm/Thompson/exact-sum/AWS untouched); 247 pytest + 412 C# green, ruff clean; A-R3-1/2/3 met |
| R4a | **Complete** | `boundary-reviewer` PASS (Grade A), `veto-integrity-reviewer` PASS (Grade A) | Three ASP.NET hosts (C2/C3/C4): C2→C2.Api only (sole writer), C3→C3.Calibration reader-only (no Events.Writer/C1), C4→{KnowledgeApi, Artefacts} exactly (no event-log/breaker, writes nothing); host-separation test (7 methods, falsifies); C2 breaker fail-closed `cold` when C3 down, no auto-approval endpoint; C4 empty cohort→200; RUNBOOK deploy+rollback (honest re unbuilt transport); C4 appsettings added; 434 C# tests green; A-R4a-1..5 met. Residual DR5 (co-hosting) tracked |
| R4b | **Complete** | `boundary-reviewer` PASS (Grade A), `measurement-reviewer` PASS (Grade A) + 2 hardenings | Python content-addressed writer (sha256/canonical JSON matching `ArtefactStore`), distinct `patterns`/`mechanisms` keyspaces, **no pointer/active_version path** (promotion stays C3); C# `LibraryAnchorResolver` reads patterns-only → CohortResolver → VPS `Anchored` from the **real Python fixture**; HTTP `IBreakerReader` client in the host (C2.Api holds no HttpClient), fail-closed to `cold` on unreachable/non-2xx/stale/**future-dated** (skew clamp); sha-mismatch→refuse→advisory; structural fences (mechanism-artefact unloadable by resolver; no Proxy/Provenance/EffectSize on read path — reflects `LibraryArtefactBody` directly); #21 `Untrusted<string>` at scoring intake; 454 C# + Python green; A-R4b-1..5 met. Residual DR5 (co-hosting) tracked |
| R5 | **Complete** (DR4 closed 2026-07-28) | `code-reviewer` NEEDS CHANGES → resolved (optimistic-confirmation honesty fix + negative test) | Focus mgmt on view transitions (#9); override `role="status"` now **success-gated** on real server state + form reset (#14); 44px primary buttons via shared `.btn-primary` (#15); per-route `document.title` + `aria-describedby` on disabled submits (#22-24); typecheck 0 errors; ~~vitest execution blocked by corrupted local npm env~~ → **env repaired 2026-07-28: vitest runs green, 86 tests pass** (DR4 closed) |
| R6 | **Complete** | consistency self-check (no invariant wording changed → no gate needed); grep-clean | Corrected the stale "docs-only / no source code" claims in NORTH_STAR.md + `.claude/project-context.md` (CLAUDE.md opening was already current); RUNBOOK refreshed — events-v1 → 1.3.0, R4b-now-built, breaker served by C3 host, frontend + known-seam (Hangfire, edge-caching) notes; second stale codebase-review doc annotated as superseded (kept for provenance); A-R6-1..4 met |

## Plan Review Log

| Round | Reviewer | Verdict | Findings | Resolved |
|---|---|---|---|---|
| 1 | `veto-integrity-reviewer` | NEEDS CHANGES | #1 emitter-boundary guarantee overstated (record carries no compliance data); #11 strict `== APPROVED` breaks `APPROVED_WITH_NOTES`; #5 widened catch swallows cancellation; falsification only bit #1; +2 NOTEs (#19 single-source, #20 structural assertion) | ✅ `BlockingVeto` on record (R1-T1); `Resolve ∈ {APPROVED,APPROVED_WITH_NOTES}` (R1-T5); cancel/timeout exempt (R1-T4); falsification extended; R1-T10 assertions |
| 1 | `boundary-reviewer` | NEEDS CHANGES | R4b never fenced the Python writer from repointing `active_version` (C3 promotion authority); C3 host constraints unpinned; R2 stub tautology risk; R4b→R2 soft dependency unstated | ✅ R4b-T6 + A-R4b-5 (no pointer write, keyspace split); R4a C3 reader-only + A-R4a-2; R2 real internal.py; R4b handoff note |
| 1 | `measurement-reviewer` | NEEDS CHANGES | #13 conflated `compute_warrant` with demote-to-FALSIFIED (unreachable); #12 must gate on `not is_ratified` not `warrant==FALSIFIED`; `mechanism_library.py` mis-located to `synthesiser/`; R4b Proxy-fencing untested | ✅ R3-T3 demote-to-recomputed-rung; R3-T2 ratification gate + retain transition + docstring; path→`publishers/`; R4b-T6 structural test |
| 1 | `budget-exploration-reviewer` | NEEDS CHANGES | #10 real-ratio wiring needs `EngagementRate`+`CreatorBaseline` inputs `GateBCandidate` doesn't carry — plan unbuildable as scoped (field is inert to allocator, so no money invariant at risk) | ✅ R3-T1 threads precomputed `decimal? OutperformanceRatio` through `GateBCandidate`, input source named, delete as sanctioned fallback |
| 2 | `plan-reviewer` (generalist, last) | **NOT READY** | Verified 12/12 round-1 fixes landed, 27/27 findings mapped, DAG acyclic + parity-clean, schema bump non-mutating. Held back on 5 text-consistency defects: A (#2 "(stub)" lingered in R2-T3 + 2 master lines), B (co-hosting residual unhomed + Risk row overclaim), C (#22-27 seams unhomed), D (R1-T9 named no site), E (R6 owner label) | ✅ A: real-`internal.py` wording propagated; B: DR5 + softened Risk row; C: DR6; D: re-sequenced to R4b-T7; E: relabeled `/sync-docs` command |
| 2 | `plan-reviewer` (re-check, by lead) | **READY** | All 5 round-2 findings are text-consistency edits, now applied; no structural rework needed. At the two-round cap; plan is internally consistent and executable. | — |

## Exit Demonstration (from CLAUDE.md Definition of Done)

- Entry gate clean: the three contract schemas parse (`events-v1.json` now 1.3.0); `dotnet build`, `dotnet test`, `uv run pytest`, `uv run ruff check`, `npm run typecheck` green (vitest also green — DR4 closed 2026-07-28).
- Every applicable Critical-Path gate reports PASS per phase; final report card **Ready**.
- Cross-referenced docs consistent: R0's invariant edits touch ADR + `integration-contract.md` + schema together, in one change.
- **The remediation-specific demonstrations:**
  1. A **direct** `EmitVerdictOverriddenAsync` call (bypassing `OverrideService`) into `APPROVED` **throws** unless the record carries a real `human_approved_at` **and** `BlockingVeto == false` — both enforced at the emitter boundary, so the guarantee survives a service bypass (#1).
  2. `DisclosureDetector` with `features == null` and a caption showing no claim returns **`Unevaluable`**, never `Pass` (#4).
  3. `ToReplayExportNdjson` output is snake_case with string enums and parses in a Python `internal.py` round-trip test (#2).
  4. A build/reflection test asserts C2, C3, C4 hosts are **separate host projects**, not co-located in one process (#3).
  5. An unratified-then-FALSIFIED mechanism is **excluded** from publish, not a thrown `UnratifiedSerialisationError` crashing the cohort (#12).
  6. CLAUDE.md / NORTH_STAR.md / RUNBOOK.md no longer claim "docs-only, no source code" (#6).
