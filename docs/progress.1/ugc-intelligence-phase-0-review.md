# Phase 0 review — Foundation: contracts, provenance types, event log, artefact store

**Date:** 2026-07-11 · **Plan:** [`ugc-intelligence-phase-0.md`](../plans/ugc-intelligence-phase-0.md)
**Verdict: Ready.** Both applicable Critical-Path gates PASS after one BLOCK round each.

---

## Entry gate

| Check | Result |
|---|---|
| Three contract schemas parse | **PASS** |
| `dotnet build UgcIntelligence.slnx` | **PASS** — 0 warnings, 0 errors |
| `dotnet test tests/Architecture` | **PASS** — 124 passed, 0 failed |
| `uv run ruff check` | **PASS** — clean |
| `uv run pytest tests/architecture` | **PASS** — 16 passed |

140 tests total. `CLAUDE.md` §Commands and `.claude/workspaces.json` now run these for real; the post-edit hook blocked three of my own edits during this phase, which is the first evidence it does anything.

## Critical-Path gates

| Gate | Round 1 | Round 2 |
|---|---|---|
| `boundary-reviewer` | **BLOCK** | **PASS** · Grade A |
| `measurement-reviewer` | **BLOCK** | **PASS** · Grade A |

### What the gates caught

**`boundary-reviewer` — BLOCK.** `ArtefactStore` was a public class with a public constructor, public `Write`, and public `RepointActiveVersion`. C4 references that assembly. So C4 — the component whose *entire* safety argument is *"a bug in its tenancy check cannot leak tenant data, because there is none in the process"* — could write artefacts, read the `patterns/` prefix, and **repoint `active_version`**, which is the promotion authority ADR-0005 spends a document protecting. The `PrefixScopedReader` was a wrapper nobody was forced through.

*Fixed:* constructor, `Write`, `Read`, `RepointActiveVersion` are now `internal`. The capability moved to a new `UgcIntelligence.Artefacts.Writer` assembly, granted via `InternalsVisibleTo` and referenced by **no C# component** (C1 is Python). The only public door is `ArtefactStore.OpenPrefix(root, prefix)` → a `PrefixScopedReader` whose entire public surface is `Read` and `ResolveActiveVersion`. This mirrors how `IOutcomeEventWriter` was already split.

**`measurement-reviewer` — BLOCK.** Python's `MeasuredOutcome` was a `@dataclass`, and a dataclass generates a public `__init__`. So `MeasuredOutcome(1.41, Provenance.PROXY, as_of)` constructed a Proxy-bearing outcome directly, straight past `try_from`. **In the language Phase 6's estimator is written in, ADR-0001's central invariant was a comment.** The C# twin had a private constructor; the parity fixture only exercised `try_from`, so it never saw the hole.

*Fixed:* `__post_init__` raises `ProvenanceLaunderingError` unless the provenance is measurable — mirroring C#'s private constructor. Tests now cover direct construction and `dataclasses.replace`.

Also fixed from the same gate: `Origin` now rides on `Provenanced<T>` and `MeasuredOutcome` (it previously fell off, making `Origin.Fixture` inert); `default(MeasuredOutcome)` threw open a *fabricated measured zero* (value 0, provenance `Measured` = enum 0) and now throws; cross-**series** comparison (organic vs boosted) is refused, not just cross-denominator; `ToReplayExportNdjson` is tenant-scoped like `ReplayAsync`.

## Falsification evidence

The eval plan's standard: *"If none of these tests can fail, none of them are tests."* Each check below was made to fail on purpose, then restored.

| Suite | Falsification | Result |
|---|---|---|
| `ReferenceGraphTests` | add `ProjectReference` C2 → KnowledgeApi | **2 failures**, then green on revert |
| `ReferenceGraphTests` | add `ProjectReference` C4 → Artefacts.Writer | **1 failure**, then green on revert |
| `MechanismSchemaTests` | add `effect_size` to `mechanisms-v1.json` | **1 failure**; contract restored, sha256 verified identical to original |
| `ProvenanceParityTests` + `test_provenance.py` | flip the fixture so `Proxy` is "admitted" | **fails on both the C# and the Python side** |
| Python `MeasuredOutcome` | `MeasuredOutcome(1.41, PROXY, …)` | raises `ProvenanceLaunderingError` |
| Python `MeasuredOutcome` | `dataclasses.replace(m, provenance=PROXY)` | raises — `__post_init__` re-runs |
| `ugc-epsilon-zero` guardrail | write `epsilon = 0.0` to a `.cs`/`.py`/`.json`/`.yaml` | **blocks (exit 2)**; `0.18` passes; prose passes |

**An early version of `ReferenceGraphTests` did not fail** when the forbidden reference was added: it used `Assembly.GetReferencedAssemblies()`, and Roslyn elides a reference whose types are never used. It was certifying an absence it could not see. It now reads the declared `.csproj` `ProjectReference` graph (ground truth) **and** the emitted metadata.

## Acceptance criteria

| # | Criterion | Evidence |
|---|---|---|
| A1 | Solution builds clean | 0 warnings, 0 errors |
| A2 | `MeasuredOutcome.TryFrom(Proxy)` is null | `ProvenanceTypeTests.Proxy_CannotBecomeMeasuredOutcome` |
| A3 | Effect-size estimator cannot accept `Proxy` | `EffectSizeEstimator_AcceptsOnlyMeasuredOutcomes` |
| A4 | Duplicate append is a no-op returning the original id | `Append_DuplicateIdempotencyKey_IsNoOp_ReturningTheOriginalId` |
| A5 | No delete/update API on either store | `ImmutabilityTests.NoDeleteOrUpdateApiExists` (4 types) |
| A6 | sha256 mismatch refuses, alarms P1 | `HashMismatch_Refuses_AndDoesNotReturnTheArtefact` |
| A7 | ε: 0 / 0.05 / 0.31 rejected; 0.10 / 0.18 / 0.30 accepted; **`default(struct)` throws**; no public ctor; JSON route closed | `ExplorationRateTests` (11 tests, 3 routes) |
| A8 | `effect_size` on a `Mechanism` fails validation | `MechanismSchemaTests` (10 forbidden fields) |
| A9 | `ReferenceGraphTests` passes **and fails on a forbidden edge** | falsification table above |
| A10 | `CLAUDE.md` + `workspaces.json` run the real build/test | post-edit hook blocked 3 edits this phase |
| A11 | `IOutcomeEventWriter` unresolvable from C1/C3 | `SoleEventWriter_IsUnreachableFrom`, `…GrantedToExactlyOneProductionAssembly` |
| A12 | Prefix grant cannot cross prefix | `PrefixGrant_CannotCrossPrefix` |
| A13 | Fixture origin never client-facing | `FixtureOriginTests` (4 tests) |
| A14 | Mixed-provenance aggregation needs a logged override, with a reason | `AggregationGuardTests` (4 tests) |
| A15 | `try_from(Proxy)` is `None` **in Python**; estimator typed `Iterable[MeasuredOutcome]` | `test_provenance.py` (16 tests) |
| A16 | C# and Python accept/reject the same fixture set | `ProvenanceParityTests` + `test_python_matches_the_shared_parity_fixture` |
| A17 | Replay export is tenant-scoped; `Append` not public | `ReplayExport_IsTenantScoped`, `Append_IsNotPublicOnTheLog` |
| A18 | (artefact round-trip Python↔C#) | **Not yet** — see Carried forward |

## Carried forward (open, non-blocking)

| # | Item | Where it lands |
|---|---|---|
| C1 | **`OpenPrefix` lets the caller name the prefix.** Nothing structural stops C2 from `OpenPrefix(root, "mechanisms")` and reading mechanism JSON as an opaque string, bypassing the `Contracts.Mechanisms` type barrier. No offending code exists (C2 is an empty shell), but the reference-graph test gives false assurance at the byte level. **Bind the grant per component at composition, and assert C2 never opens the mechanisms prefix.** | Phase 3 acceptance criterion |
| C2 | `ArtefactWriter.Read`/`ResolveActiveVersion` are unguarded across prefixes. Confined (only the test project references the writer assembly), but should take typed prefix constants. | Phase 6 (first real writer) |
| C3 | `C2_HoldsNoHttpClientOrSubprocess` inspects fields/properties, not method bodies. A `new HttpClient()` inside a method escapes it. Needs an IL scan. | Phase 3 |
| C4 | `ReplayAsync(null)` returns all tenants. An operational affordance; consumers must always pass a tenant. | Phase 4 (first consumer) |
| C5 | P0-T15/T16's **Python halves** (event-log reader, artefact layout) are specified and unshipped. A18's round-trip test needs them. | Phase 4 / Phase 6, at first Python consumer |
| C6 | Illustrative `EstimateEffectSize` test stubs use the mean. The real estimator owes median/MAD. | Phase 6 |

## Definition of Done

- ✅ Entry gate clean first.
- ✅ Every applicable Critical-Path gate reports PASS (`boundary-reviewer`, `measurement-reviewer`).
- ✅ Cross-referenced docs consistent — this phase changed no invariant, and no ADR or schema edit was needed.
- ✅ `CLAUDE.md` §Commands updated (behaviour/config changed).
- ⚠️ Acceptance criteria: **17 of 18 met.** A18 is carried to the phase with the first Python artefact consumer.
