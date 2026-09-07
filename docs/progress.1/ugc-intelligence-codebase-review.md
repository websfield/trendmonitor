# Codebase review — UGC Intelligence

> **⚠️ Superseded / historical (annotated 2026-07-14).** This is the *original pre-code* codebase review, written 2026-07-10 when the repo was docs-only. It is kept for provenance and is accurate **as of its date only** — do not cite it for current state. The codebase now exists (phases 0–9 + audit-remediation R0–R6): C# control plane, Python intelligence plane, React frontend, three ASP.NET hosts, real cross-process transport. For current state see `.claude/project-context.md`, `RUNBOOK.md`, `docs/plans/ugc-intelligence-master-plan.md`, and `docs/plans/audit-remediation-master-plan.md`.

**Workflow type:** Feature Development (greenfield). Not a refactor — there is no code to audit. *(True on 2026-07-10; no longer true — see the superseded banner above.)*
**Brief:** [`docs/plans/ugc-intelligence-brief.md`](../plans/ugc-intelligence-brief.md)
**Date:** 2026-07-10

---

## 1. Requirement IDs satisfied

| Family | IDs | Source |
|---|---|---|
| Pattern Engine | REQ-001…008 | `docs/initial/prd-ugc-intelligence.md` |
| Knowledge layer | REQ-060…070, REQ-065a/b/c | `docs/initial/tech-spec-knowledge-layer.md` |
| Gate A | REQ-010…021 | PRD |
| Gate B | REQ-030…039 | PRD |
| Calibration | REQ-050…054 | PRD |
| Trend subsystem | REQ-005, 005a…005i | `docs/initial/tech-spec-trend-subsystem.md` |

Every phase below binds ≥ 1 ID. No phase is unbound plumbing except Phase 0, justified as the contract substrate every other phase reads.

## 2. State of the repo (ground truth, verified 2026-07-10)

- **No source code.** No solution, manifest, lockfile, CI, or container definition. `find` over the repo returns only `docs/`, `.claude/`, `CLAUDE.md`, `NORTH_STAR.md`, `RUNBOOK.md`.
- **Not a git repository.**
- **Toolchain present on this machine:** .NET 10.0.203, Python 3.12.10, Node 20.9.0, uv 0.9.28, git 2.52.0.
- **Authoritative doc set:** `docs/initial/` (20 files). Superseded first draft: `docs/initial.backup/`.
- **The only wired check** (three contract schemas parse) was pointing at `docs/final/schemas/`, which does not exist. Repaired 2026-07-10 in `CLAUDE.md`, `.claude/workspaces.json`, `.claude/guardrails.rules.json` (`ugc-contract-schema-edit` also omitted `mechanisms-v1.json`), and `.claude/project-context.md`. Verified: entry gate green; `ε = 0.0` blocks (exit 2); `ε = 0.18` passes.

## 3. Where this fits the roadmap

PRD Phase 0 → 6. There is nothing to instrument (PRD Phase 0 assumes a live ClientHub approval workflow that does not exist here), so build-Phase 0 is the contract substrate instead, and the decision-logging obligation is discharged structurally: the append-only `OutcomeEvent` log **is** the instrumentation, and it exists before the first scorer.

**Proof-of-shipped for each dependency is a test, not a plan table.** No phase may start on a predecessor whose acceptance criteria are not green on disk.

## 4. Modules and ownership (which component owns each new entity)

| Entity | Owner | Never reachable from |
|---|---|---|
| `Tenant`, `Campaign`, `Brief`, `Submission`, `Creator`, `RightsGrant`, `Verdict`, `LivePost` | C2 control plane | C1, C4 |
| `ComplianceCheck`, `VpsScore`, `BriefAdherenceScore`, `AmplificationCandidate`, `BudgetAllocation` | C2 | C1 (except via Contract B), C4 |
| `OutcomeEvent` | C2 (**sole writer**) | C4 (never), C1/C3 read-only |
| `FeatureRecord` | Extraction Service (shared, stateless, versioned) | — |
| `TrendSignal`, `TrendObservation`, `TrendSubmission`, `SubmitterReputation`, `ExemplarPost` | C1 | C2, C4 |
| `Pattern`, `PatternLibraryVersion` | C1 (publishes) → C2 (reads pinned artefact) | C4 (**never**) |
| `Mechanism`, `MechanismLibraryVersion`, `MechanismWarrantTransition` | C1 (publishes) → C4 (reads) | **C2 (no code path)** |
| `BreakerState`, `LibraryVerdict`, `CalibrationRecord` | C3 (**sole writer** of breaker + verdict) | C4 (reads no breaker) |

## 5. Cross-boundary reach — the whole design is here

The one-way call-graph is **not** a convention to follow; per ADR-0007 it must be a property of *what is reachable from a process*. Enforcement is structural, at three levels:

| Boundary | How it is reached | How the reverse is made impossible |
|---|---|---|
| C1 → C2 | Contract A: immutable content-addressed artefact + pointer table | C2's build graph has **no reference** to C1. Asserted by a test over the project reference graph. |
| C2 → C1, C2 → C3 | Contract B: append-only event log (C2 sole writer) | C1/C3 have no write path; the log's append API is not exported to them. |
| C3 → C2 | Contract C: read-through breaker cache, TTL 60s | C2 has no write path to breaker state. No config, admin flag, or per-campaign exemption exists. Fail-closed to `cold` past TTL. |
| C3 → C1 | Contract D: `LibraryVerdict` | C1 cannot set `active_version` for a *pattern* library without one. |
| C1 → C4 | Contract E: immutable mechanism artefact | **C2 has no reference to C4 and no mechanism type in scope.** C4 has no reference to C1/C2/C3, no DB, no writer, and a read grant to exactly one artefact-store prefix. |

**The dataflow invariant that outranks all filters:** the mechanism synthesiser proposes its own predicates over the exemplar corpus *alone* — it does not consume the pattern miner's union-reading proposal stage (C1 §1.9). The duplication is the price of the invariant, and it is why C4 can be exposed externally at all. A permanent test asserts no `OutcomeEvent` / `Pattern` / `Submission` / `tenant_id` is reachable from the synthesiser's input set.

## 6. Critical-Path triggers (from `CLAUDE.md`)

All four fire across this work. Per-phase mapping is in the master plan; the table below is the union.

| Critical Path | Triggered by | Reviewer agent |
|---|---|---|
| Veto & verdict integrity | V1–V6, verdict engine, approval flow, model prompt/output handling, rubric lanes, mechanism ratification | `veto-integrity-reviewer` |
| Boundaries & authority | call-graph, event log, breaker, library promotion, version triple, tenancy, Contract E / C4 | `boundary-reviewer` |
| Measurement discipline | provenance, baselines/denominators, calibration, trend subsystem, holdouts, prevalence & warrant ladder | `measurement-reviewer` |
| Money & exploration | budget allocation, ε, `arm` tags, AWS weights, recommendations | `budget-exploration-reviewer` |

## 7. Inherited stopgaps

Greps run over the repo for `TODO`, `FIXME`, `placeholder`, `demo`, `SHORTCUT:`, hardcoded IDs, env-var defaults, and single-tenant assumptions:

```
rg -n "TODO|FIXME|XXX|HACK|SHORTCUT:|placeholder|demo" --glob '!docs/**' --glob '!.claude/**'
rg -n "tenant_id\s*[:=]\s*(null|none)" 
```

**None found** — there is no code. The only stopgaps in the repo were the four stale pack pointers named in §2, all retired in this change.

## 8. Files this work will touch

All new. No existing source file is modified. Top-level layout (justified: the tech spec's three planes are the directory structure — control plane, intelligence plane, untrusted plane):

```
src/
  ControlPlane/            C# — C2 + C3 (deterministic decisions)
    UgcIntelligence.Domain/            entities, provenance types, vetoes, verdict engine
    UgcIntelligence.Contracts/         Contracts A–E as code; schema validators
    UgcIntelligence.Events/            append-only log, idempotency
    UgcIntelligence.Artefacts/         content-addressed store (sha256)
    UgcIntelligence.C2.Api/            Gate A + Gate B HTTP surface
    UgcIntelligence.C3.Calibration/    breaker + LibraryVerdict (sole authority)
  IntelligencePlane/       Python — C1 + extraction
    extraction/            FeatureRecord producer, versioned
    c1_pattern_engine/     registry, adapters, detector, corpora, miner, synthesiser, publishers
  KnowledgeApi/            C# — C4, its own process, one read grant
  Frontend/                React/TS manager queue
tests/
  Architecture/            the suites that test the architecture, not the model
```

**`UgcIntelligence.C2.Api` has no ProjectReference to `c1_pattern_engine`, to `KnowledgeApi`, or to any mechanism type.** This is asserted by a test, not by review.

## 9. Existing patterns to follow

None exist in-repo. The patterns to replicate are **specified in the doc set** and are pinned verbatim into each phase plan:
- Fenced untrusted prompt block — `component-2-scoring-amplification.md` §2.4.
- Verdict engine pseudocode — `component-2-scoring-amplification.md` §2.5.
- Robust z / lifecycle — `tech-spec-trend-subsystem.md` §Detection maths.
- Prevalence + warrant ladder — `tech-spec-knowledge-layer.md` §The maths.
- AWS composition + redistribution — `rubric-vps-v1.md` §Gate B.

## 10. Risks

| Risk | Blast radius | Guard |
|---|---|---|
| "Full automation" implemented literally (auto-approve, model clears veto, timed warrant promotion) | **P1 regulatory** — a stated compliance control does not exist | Adversarial suites written before the code they guard; `human_approved_at` non-null is an acceptance criterion; guardrail `ugc-auto-approve` + `ugc-model-clears-veto` |
| Synthetic-fixture Spearman read as skill | Client-facing false confidence | Calibration refuses to emit ρ below n = 60; breaker `cold` by construction; fixtures carry fixture provenance |
| C2 → C1 / C2 → C4 reference added for convenience | Architecture collapses to a diagram | Build-graph assertion test; C4 in its own process |
| `Proxy` value entering an effect-size calculation | Laundered provenance, undetectable from inside | Provenance is a **type**, not a column: the estimator's input type cannot hold a `Proxy` value; permanent test asserts the estimator's input set contains no exemplar-sourced outcome |
| ε reachable at zero | Pattern collapse; exploration budget becomes a donation | ε is a validated value object with floor 0.10 / ceiling 0.30 — no zero constructor; guardrail `ugc-epsilon-zero` blocks at write time |
| Shared extraction version drift across the contrast-set ratio | Prevalence ratio compares 3.2 features against 4.0 features | Both corpus halves extracted under one `extractor_version`; compatibility triple checked at read time |
