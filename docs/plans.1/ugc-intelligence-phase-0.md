# Phase 0 — Foundation: contracts, provenance types, event log, artefact store

**Depends on:** none
**Primary agents:** `control-plane-engineer`, `eval-harness-engineer`
**Requirement IDs:** REQ-002 (provenance), REQ-004 (versioned + immutable, every score names its triple), plus the Contract A–E substrate every later phase reads.
**Critical Paths:** Boundaries & authority · Measurement discipline

---

## Project Conventions Pinned (READ FIRST)

*Pasted verbatim from `CLAUDE.md`. A spawned agent does not read `CLAUDE.md` — this block is your contract.*

### Golden rules
1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.** Credentials live in env/config; a leaked secret is a rotate-everything incident.
3. **Never destroy what you didn't create without explicit confirmation** — files, data, branches, running state.
4. **Fix causes, not symptoms.**
5. **Match the codebase.** Existing conventions beat your preferences; a new dependency needs a reason the standard library can't answer.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that — "done" is a claim the checks have to back.
7. **Small, verifiable steps.** If you can't verify it, say so.
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.** Verify library APIs against the installed version.

### Non-negotiable rules that apply to this phase
- **Rule 3 — One-way call-graph, sole authorities.** C2 never calls C1 **and never calls C4**; C1 and C3 only consume the append-only event log; C2 is the sole OutcomeEvent writer; C3 alone trips/arms the breaker and vetoes *pattern*-library promotion; C4 writes nothing, calls nothing, reads no breaker, and its whole read grant is one artefact-store prefix — *an authority overridable from the component it governs is a comment.*
- **Rule 4 — Fail closed.** Unreachable C3, stale breaker cache (>60s), version-triple mismatch, missing library, or model schema/parse failure degrades to `cold`/advisory/`NEEDS_REVIEW` — never to a default score, never to approval.
- **Rule 5 — Measurement discipline.** A `Proxy` value is never shown or aggregated as `Measured`, **and never enters an effect-size calculation**. Every rate names a period-stable denominator; organic and boosted series are never summed; baselines use median/MAD, never mean/stddev.
- **Rule 7 — Money & exploration.** ε stays in [0.10, 0.30] with no path to zero.
- **Rule 8 — Rights & tenancy.** `organic_publish` never implies `paid_amplification`; a grant without `evidence_uri` is not a grant; tenant outcome data never crosses tenants — no widening override, no admin path.
- **Rule 9 — Invariants change by ADR, not by drift.** A semantic change to `rubric-v1.json` / `events-v1.json` / `mechanisms-v1.json` bumps the version — never mutates a published contract in place.

### Stack and package manager
- **C#/.NET 10.0.203** (`dotnet build`, `dotnet test`). Control plane. Every deterministic decision.
- **Python 3.12.10 + `uv`** (`uv run pytest`, `uv run ruff check`). Intelligence plane. Never a verdict.
- **Node 20.9.0 + npm.** Frontend only.
- Artefacts: content-addressed, sha256, immutable. Events: append-only, idempotency-keyed.

### Anti-patterns to avoid
- A `provenance` **string column** instead of a provenance **type**. ADR-0001 chose *structural* over *documentary* provenance precisely so a `Proxy` value entering an effect-size calculation is impossible rather than merely discouraged.
- A `double Epsilon { get; set; }` config key. It will be set to zero.
- A convenience `ProjectReference` from C2 to C1 or C4.
- An "admin override" / "ignore query filters" escape hatch on tenancy.

### Available specialist agents
`control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer`, `frontend-engineer`.
Reviewers (read-only): `veto-integrity-reviewer`, `boundary-reviewer`, `measurement-reviewer`, `budget-exploration-reviewer`, `code-reviewer`, `security-reviewer`.
**Do NOT request** any agent not in this list.

---

## Requirements Checklist (functional)

| ID | Requirement | Where satisfied |
|---|---|---|
| REQ-002 | Every metric carries a provenance label of `Measured` \| `User-provided` \| `Estimated` \| `Proxy` **and an as-of date**. A `Proxy` value is never displayed or aggregated as `Measured`, in any report, at any layer. | `Provenanced<T>`, `AsOf` |
| REQ-004 | Libraries versioned and immutable once published; every score references the exact `pattern_library_version` and `rubric_version` used. | `VersionTriple`, `ArtefactStore` |

## Requirements Checklist (technical)

- Contracts A–E exist as code, generated from / validated against `docs/initial/schemas/*.json`. The JSON is the source of truth; the C# types must not drift from it, and a test asserts they don't.
- The `OutcomeEvent` envelope has exactly one writer type, and it lives in C2's assembly. `UgcIntelligence.Events` exposes an append API that C1/C3 assemblies cannot reach.
- `idempotency_key = hash(event_type, entity_id, logical_timestamp)`; duplicate append is a no-op, not an error. *"A double-counted outcome inflates an effect size, and effect sizes are what the whole system rests on."*
- No event carries a raw media URI — only `feature_record_id`.
- Artefact store: write-once, content-addressed by sha256; a read that fails its hash check **refuses the artefact** and raises P1, it does not return it.
- ε: `ExplorationRate` value object. Floor 0.10, ceiling 0.30, default 0.18. No parameterless constructor, no implicit conversion from `double`, no `JsonConstructor` that bypasses validation.

## Edge Cases & Failure Paths

| Question | Answer | Becomes |
|---|---|---|
| **Inverse events** — every lifecycle event has a teardown | Artefact write has no delete (immutable, by contract); rollback is repointing `active_version`. Event append has no delete; correction is a compensating event. | `P0-T5` asserts no delete API exists on either. |
| **Double failure** — the recovery mechanism itself fails | Artefact sha256 mismatch *and* no previous verified version → refuse, serve nothing, alarm P1. Never return an unverified artefact. | `P0-T4`, test `Artefact_HashMismatch_WithNoPriorVersion_Refuses` |
| **Degraded mode** — external dependency down | Artefact store unreachable → last verified cache with `stale_as_of`. Never a bare 500. (C4 consumes this in Phase 8.) | `P0-T4` |
| Duplicate event delivery | Dedupe on `idempotency_key`. At-least-once is normal. | `P0-T3`, test `Append_DuplicateIdempotencyKey_IsNoOp` |
| A `Proxy` value reaches an effect-size estimator | **Must not compile.** The estimator's parameter type is `Provenanced<T>` constrained to `Measured`/`UserProvided`. | `P0-T2`, test `EffectSize_CannotAcceptProxy_TypeTest` |
| Two rates on different denominators compared | `EngagementRate` carries its `Denominator`; comparison across differing denominators throws. | `P0-T2` |

## Failure Modes & Degraded Behavior

| Boundary crossing | Failure | Degraded behavior | Reconciliation | Spec that proves it |
|---|---|---|---|---|
| Artefact store read | Unreachable | Serve last verified cache, stamp `stale_as_of` | Retry; alarm after TTL | `Artefact_StoreUnreachable_ServesStaleWithStamp` |
| Artefact store read | sha256 mismatch | **Refuse.** Serve previous verified version. Alarm **P1** — the store is not what the contract says it is. | Manual investigation | `Artefact_HashMismatch_RefusesAndAlarmsP1` |
| Event log append | Duplicate key | No-op, return existing event id | — | `Append_DuplicateIdempotencyKey_IsNoOp` |
| Event log append | Store down | Fail the write, surface to caller. **Never silently drop an outcome.** | Caller retries; idempotency makes it safe | `Append_StoreDown_Throws_NeverDrops` |

## Handoff Contracts (pinned; cited by consuming phases)

```csharp
// Consumed by: every phase.
public enum Provenance { Measured, UserProvided, Estimated, Proxy }

// A value that cannot be laundered. Consumed by P4 (calibration), P6 (miner), P8 (synthesiser).
public readonly record struct Provenanced<T>(T Value, Provenance Provenance, DateTimeOffset AsOf);

// Marker constraint: only these may enter an effect-size calculation (ADR-0001).
public readonly record struct MeasuredOutcome  // constructible ONLY from Measured | UserProvided
{
    public static MeasuredOutcome? TryFrom<T>(Provenanced<T> v);   // returns null for Proxy | Estimated
}

// Consumed by: P3 (score pinning), P4 (cohort key), P6 (compatibility check).
public readonly record struct VersionTriple(string ExtractorVersion, string RubricVersion, string PatternLibraryVersion);

// Consumed by: P4 (breaker), P6 (promotion resets window).
public readonly record struct CohortKey(Guid TenantId, string Vertical, string Platform, string RubricVersion, string PatternLibraryVersion);

// Consumed by: P5 (allocator). Floor 0.10, ceiling 0.30. No zero.
public readonly record struct ExplorationRate { public static ExplorationRate Default => From(0.18m); public static ExplorationRate From(decimal v); }

// Consumed by: P5 (collector), P4 (calibration). Denominator is period-stable and named.
public enum Denominator { Reach, Impressions, Followers }
public enum Series { Organic, Boosted }   // never summed

// IOutcomeEventWriter is reachable from C2 ONLY. Consumed by P1, P3, P5 — all C2 code.
// C3 (P4) and C1 (P4, P6) are CONSUMERS: they get IOutcomeEventReader and nothing else.
// This is asserted structurally by P0-T7, not left to the interface split.
public interface IOutcomeEventWriter { Task<Guid> AppendAsync(OutcomeEvent e, CancellationToken ct); }
public interface IOutcomeEventReader { IAsyncEnumerable<OutcomeEvent> ReplayAsync(...); }  // C1, C3 get ONLY this

// A fixture-seeded outcome is structurally distinguishable and may never reach a client surface.
// Same discipline as Provenance: a type, not a flag. (See P0-T10.)
public readonly record struct Origin { public static Origin Real; public static Origin Fixture; }
```

### The substrate crosses two languages, so the substrate is built in both

The control plane is C# and the intelligence plane is Python, but **three of Phase 0's consumers are Python**: Phase 4's internal-corpus assembler reads the event log, Phase 6's estimator is typed on `MeasuredOutcome`, and Phase 6/8's publishers write artefacts a C# reader resolves. An invariant that exists only in C# is not an invariant for the code that actually enforces it.

So Phase 0 ships **a Python mirror with parity tests**, not a C#-only substrate:

```python
# src/IntelligencePlane/substrate/provenance.py — mirrors the C# types, parity-tested.
class Provenance(StrEnum): MEASURED="Measured"; USER_PROVIDED="User-provided"; ESTIMATED="Estimated"; PROXY="Proxy"

@dataclass(frozen=True)
class Provenanced[T]: value: T; provenance: Provenance; as_of: datetime

@dataclass(frozen=True)
class MeasuredOutcome:
    """Constructible ONLY from Measured | User-provided. This is what makes
    'a Proxy value never enters an effect-size calculation' a type error (ADR-0001)."""
    @staticmethod
    def try_from[T](v: Provenanced[T]) -> "MeasuredOutcome | None": ...   # None for Proxy | Estimated

# P6's estimator signature MUST be: estimate_effect_size(outcomes: Iterable[MeasuredOutcome]) -> EffectSize
```

**Event-log read path (C# writer → Python readers).** C1 and C3 consume the log through a read-only, prefix-scoped **replay export** — an append-only NDJSON projection of the event table, content-addressed per batch — never by opening C2's database. This preserves *"C1 has no read access to ClientHub's operational tables"* and keeps replay a first-class operation. `IOutcomeEventWriter` stays unreachable from Python by construction: the export is read-only and the writer is a C# interface in C2's assembly.

**Artefact-store layout is a language-neutral contract**, pinned here and implemented twice: `<prefix>/<sha256[0:2]>/<sha256>.json` + a `pointer/<key>.json` holding `active_version`. Prefixes: `patterns/` (C1 writes, C2 reads) and `mechanisms/` (C1 writes, **C4 reads, and only this one**). A `PrefixScopedReader` cannot address outside its prefix (`P0-T11`).

## Implementation Tasks

| # | Task | Owner agent | File(s) |
|---|---|---|---|
| P0-T1 | Solution skeleton + 7 projects; wire `dotnet build`/`test`, `uv`, `npm` into `CLAUDE.md` §Commands and `.claude/workspaces.json` | `control-plane-engineer` | `UgcIntelligence.sln`, `src/ControlPlane/*/​*.csproj`, `CLAUDE.md`, `.claude/workspaces.json` |
| P0-T2 | Provenance **types**: `Provenance`, `Provenanced<T>`, `MeasuredOutcome.TryFrom`, `EngagementRate` + `Denominator`, `Series` | `control-plane-engineer` | `src/ControlPlane/UgcIntelligence.Domain/Provenance/*.cs` |
| P0-T3 | Append-only event log: envelope per `events-v1.json`, idempotency-key unique index, `IOutcomeEventWriter` (C2-only) / `IOutcomeEventReader` (C1, C3) | `control-plane-engineer` | `src/ControlPlane/UgcIntelligence.Events/*.cs` |
| P0-T4 | Content-addressed artefact store: write-once, sha256 verify on read, refuse-on-mismatch, stale-cache fallback | `control-plane-engineer` | `src/ControlPlane/UgcIntelligence.Artefacts/*.cs` |
| P0-T5 | Contracts A–E as code + a test asserting the C# types match `docs/initial/schemas/*.json` | `control-plane-engineer` | `src/ControlPlane/UgcIntelligence.Contracts/*.cs` |
| P0-T6 | `ExplorationRate` value object — no zero constructible, no JSON bypass | `control-plane-engineer` | `src/ControlPlane/UgcIntelligence.Domain/ExplorationRate.cs` |
| P0-T7 | **Reference-graph assertion test**, covering every edge ADR-0005/0007 make structural: (a) C2 references neither C1 nor KnowledgeApi; (b) C4 references none of C1/C2/C3; (c) **C3 references neither C1 nor C2** — *"C3 calls nothing"*; (d) **`IOutcomeEventWriter` is reachable from C2 only** — C1 and C3 resolve `IOutcomeEventReader` and nothing else; (e) **no C2 type constructs an HTTP client or subprocess against C1** (the C#→Python edge a `ProjectReference` test cannot see) | `eval-harness-engineer` | `tests/Architecture/ReferenceGraphTests.cs` |
| P0-T8 | **Schema suite**: adding `effect_size`/`lift`/`vps`/`aws`/`arm` to a `Mechanism` fails validation | `eval-harness-engineer` | `tests/Architecture/MechanismSchemaTests.cs` |
| P0-T9 | **Provenance type test**: an effect-size estimator cannot accept a `Proxy` value (compile-time via a negative-compilation test, plus `MeasuredOutcome.TryFrom(Proxy) == null`) | `eval-harness-engineer` | `tests/Architecture/ProvenanceTypeTests.cs` |
| P0-T10 | **Fixture-origin type** (`Origin.Fixture`) + assertion that fixture-sourced calibration data cannot reach a client-facing surface — the structural form of the master plan's "synthetic Spearman" mitigation | `eval-harness-engineer` | `tests/Architecture/FixtureOriginTests.cs` |
| P0-T11 | **Artefact prefix grant**: the store exposes a prefix-scoped reader; a reader granted the mechanism prefix **cannot resolve a pattern-library artefact**. This is what makes ADR-0007 §1's *"if C4 ever needs a second data source, the design is wrong"* a reachability fact rather than a convention. | `control-plane-engineer` | `.../UgcIntelligence.Artefacts/PrefixScopedReader.cs` |
| P0-T12 | **Mixed-provenance aggregation guard**: the query layer refuses to aggregate across mixed provenance without an explicit, **logged** override (ADR-0001, *"provenance is structural, not documentary"*) | `control-plane-engineer` | `.../UgcIntelligence.Domain/Provenance/AggregationGuard.cs` |
| P0-T13 | **Python provenance mirror**: `Provenance`, `Provenanced[T]`, `MeasuredOutcome.try_from`, `Origin` — the types Phase 6's estimator is typed on. Without these, "a `Proxy` value cannot enter an effect-size calculation" is a comment, not a type error. | `intelligence-plane-engineer` | `src/IntelligencePlane/substrate/provenance.py` |
| P0-T14 | **Cross-language parity test**: the C# and Python provenance types accept and reject exactly the same set of values; a fixture table drives both. A divergence is a build failure. | `eval-harness-engineer` | `tests/Architecture/ProvenanceParityTests.cs`, `tests/architecture/test_provenance_parity.py` |
| P0-T15 | **Event-log replay export** (read-only NDJSON projection, prefix-scoped) + its Python reader. C1/C3 never open C2's database. `IOutcomeEventWriter` stays unreachable from Python. | `control-plane-engineer`, `intelligence-plane-engineer` | `.../UgcIntelligence.Events/ReplayExport.cs`, `src/IntelligencePlane/substrate/event_log.py` |
| P0-T16 | **Artefact-store layout** as a language-neutral contract (`<prefix>/<sha256[0:2]>/<sha256>.json`, `pointer/<key>.json`), implemented in C# and Python, with a round-trip test: an artefact written by Python resolves byte-identically in C# and verifies its sha256. | `control-plane-engineer`, `intelligence-plane-engineer` | `.../UgcIntelligence.Artefacts/Layout.cs`, `src/IntelligencePlane/substrate/artefacts.py` |

## Files to Create / Modify

| Path | New/Mod | Owner | Notes |
|---|---|---|---|
| `UgcIntelligence.sln` | new | control-plane | 7 projects |
| `src/ControlPlane/UgcIntelligence.Domain/**` | new | control-plane | provenance, ε, cohort key, version triple |
| `src/ControlPlane/UgcIntelligence.Contracts/**` | new | control-plane | Contracts A–E |
| `src/ControlPlane/UgcIntelligence.Events/**` | new | control-plane | append-only log |
| `src/ControlPlane/UgcIntelligence.Artefacts/**` | new | control-plane | sha256 store |
| `src/ControlPlane/UgcIntelligence.C2.Api/**` | new | control-plane | empty shell this phase; **no ref to C1/C4** |
| `src/ControlPlane/UgcIntelligence.C3.Calibration/**` | new | control-plane | empty shell this phase |
| `src/KnowledgeApi/UgcIntelligence.KnowledgeApi/**` | new | control-plane | empty shell; own process |
| `tests/Architecture/**` | new | eval-harness | the suites that can fail |
| `CLAUDE.md` | **mod** | control-plane | §Commands — add real build/test commands |
| `.claude/workspaces.json` | **mod** | control-plane | wire `dotnet build` + `dotnet test` post-edit check |

## Migration Steps

EF Core model introduced here for `OutcomeEvent` only. `dotnet ef migrations add Phase0_EventLog`; run against a fresh SQLite DB; assert the idempotency-key unique index exists.

## Verification Steps

1. `dotnet build UgcIntelligence.sln` → 0 errors, 0 warnings. *(requires: P0-T1 complete)*
2. `dotnet test tests/Architecture` → all green. *(requires: step 1)*
3. `node -e "[...3 schemas...].forEach(f=>JSON.parse(...))"` → entry gate green. *(requires: nothing)*
4. Attempt `new ExplorationRate(0m)` in a test → does not compile / throws. *(requires: step 1)*
5. Attempt to add a `ProjectReference` from `UgcIntelligence.C2.Api` to `KnowledgeApi`, run `dotnet test tests/Architecture` → **`ReferenceGraphTests` fails**. Revert. *(requires: step 2)* — this proves the test can fail.

## Acceptance Criteria (verifiable PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| A1 | Solution builds clean | `dotnet build` exit 0 |
| A2 | `MeasuredOutcome.TryFrom(Provenanced<T>{Provenance=Proxy})` returns `null` | test `ProvenanceTypeTests.Proxy_CannotBecomeMeasuredOutcome` |
| A3 | An effect-size estimator signature cannot accept a `Proxy` value | test `ProvenanceTypeTests.EffectSizeEstimator_RejectsProxy_AtType` |
| A4 | Duplicate append on the same idempotency key is a no-op returning the original id | test `EventLogTests.Append_DuplicateIdempotencyKey_IsNoOp` |
| A5 | No delete API exists on the artefact store or event log | test `ImmutabilityTests.NoDeleteApiExists` |
| A6 | sha256 mismatch on artefact read refuses and does not return the artefact | test `ArtefactStoreTests.HashMismatch_Refuses` |
| A7 | `ExplorationRate.From(0m)` throws; `From(0.05m)` throws; `From(0.18m)` succeeds; `From(0.31m)` throws | test `ExplorationRateTests` |
| A8 | Adding `effect_size` to a `Mechanism` fixture fails schema validation | test `MechanismSchemaTests.EffectSize_FailsValidation` |
| A9 | `ReferenceGraphTests` passes all five edges (a–e), **and fails when a forbidden reference is added** (step 5) | test output, both directions |
| A10 | `CLAUDE.md` §Commands and `.claude/workspaces.json` run the real build+test, verified by editing a `.cs` file and observing the post-edit hook run `dotnet build` | hook output |
| A11 | `IOutcomeEventWriter` is not resolvable from the C1 or C3 assemblies | `ReferenceGraphTests.SoleEventWriter` |
| A12 | A prefix-scoped reader granted the mechanism prefix **cannot resolve a pattern-library artefact** | `ArtefactStoreTests.PrefixGrant_CannotCrossPrefix` |
| A13 | Fixture-origin calibration data cannot reach a client-facing surface | `FixtureOriginTests.FixtureNeverClientFacing` |
| A14 | Aggregating across mixed provenance without a logged override throws | `AggregationGuardTests.MixedProvenance_RequiresLoggedOverride` |
| A15 | `MeasuredOutcome.try_from(Proxy)` is `None` **in Python**, and `estimate_effect_size` is typed `Iterable[MeasuredOutcome]` — the invariant is a type error in the language that enforces it | `test_provenance.py::test_proxy_cannot_become_measured_outcome` |
| A16 | The C# and Python provenance types accept and reject **exactly the same** fixture set; a divergence fails the build | `ProvenanceParityTests` + `test_provenance_parity.py` |
| A17 | C1/C3 read the event log only through the read-only replay export; **no Python code opens C2's database**, and `IOutcomeEventWriter` is unreachable from Python | `ReferenceGraphTests.SoleEventWriter` + `test_event_log_readonly.py` |
| A18 | An artefact written by Python resolves byte-identically in C# and verifies its sha256 | `ArtefactRoundTripTests` |

## Out of Scope (Surgical Changes)

Do not implement: any veto, any scorer, any breaker logic, any allocator, any C4 endpoint. The C2/C3/C4 projects are **empty shells** this phase — they exist so the reference-graph test has something to assert about.
Do not touch `docs/initial/**` — the doc set is the contract, and this phase changes no invariant.

## Completion Criteria (Definition of Done)

- Entry gate clean first: the three contract schemas parse; `dotnet build` + `dotnet test` green.
- Critical-Path gates: `boundary-reviewer` and `measurement-reviewer` both report PASS.
- Cross-referenced docs stay consistent — this phase changes no invariant, so no ADR or schema edit is expected. If one becomes necessary, stop and surface it.
- `CLAUDE.md` §Commands updated (behaviour/config changed).
