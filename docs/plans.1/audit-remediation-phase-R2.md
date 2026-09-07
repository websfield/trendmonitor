# Phase R2 — Contract-B serialization fix + round-trip test

**Depends on:** R0 (Contract-B wire-format line). **Primary agents:** `control-plane-engineer`, `eval-harness-engineer`. **Gate:** `boundary-reviewer`.

## Project Conventions Pinned (READ FIRST — verbatim from CLAUDE.md)

- **Non-negotiable rule 3:** One-way call-graph; C1/C3 only consume the append-only event log. The NDJSON replay export is that consumption path — it must stay a read-only projection with no new read grant.
- **Non-negotiable rule 8:** Tenant outcome data never crosses tenants. `ToReplayExportNdjson(tenantId)` is tenant-scoped and must stay so.
- **Golden rule 5:** Match the codebase — reuse the existing serialization convention, do not invent a new one.
- **Available agents:** `control-plane-engineer`, `eval-harness-engineer`, `boundary-reviewer`.

## Requirements Checklist (functional)

1. **#2 (CRITICAL):** `AppendOnlyEventLog.ToReplayExportNdjson` (`src/ControlPlane/UgcIntelligence.Events/AppendOnlyEventLog.cs:67-72`) serializes with the **same** `JsonSerializerOptions` used in `Mechanism.cs:98-103` / `ExemplarIndex.cs:25-29` — `JsonNamingPolicy.SnakeCaseLower` + a snake_case `JsonStringEnumConverter` — so keys are snake_case and `event_type` is a string, satisfying `events-v1.json:20-33`.
2. A **round-trip test** feeds the C#-serialized NDJSON into the **real** `c1_pattern_engine/corpora/internal.py` assembler (`:66-79`) — not a hand-written stub, which risks a tautology built to match what C# emits — and asserts it parses the snake_case keys. If the real assembler needs inputs the test can't easily supply, exercise the narrowest real parse entry point rather than reimplementing it.

## Requirements Checklist (technical)

- Options are shared/centralized, not copy-pasted three times if a single accessible source exists (economy of means); if `Mechanism.cs` exposes them, reuse; else factor a single `static JsonSerializerOptions` into the Events assembly.
- Tenant scoping unchanged; the export remains write-path-free.
- `OutcomeEvent`'s undecorated int enum (`OutcomeEvent.cs:26-33`) now serializes as a string via the converter.

## Edge Cases & Failure Paths

- **Enum:** `OutcomeEventType` must emit as snake_case string, not an integer. Test one event of each type.
- **Nested payload:** `Payload` is `Dictionary<string,object?>` already built snake_case in `ComplianceEventEmitter`; ensure the top-level envelope keys (event_id, event_type, idempotency_key, tenant_id, occurred_at, recorded_at, payload) become snake_case too.
- **Degraded mode:** Python parse failure in the round-trip test = a red test, the intended failure signal (no silent skip).

## Handoff Contracts

Consumes R0's stated Contract-B wire format. Produces the verified NDJSON format that R4b's real Python reader relies on.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| R2-T1 | Apply shared snake_case `JsonSerializerOptions` to `ToReplayExportNdjson` | control-plane-engineer | `UgcIntelligence.Events/AppendOnlyEventLog.cs` (+ options source) |
| R2-T2 | C# test: NDJSON keys are snake_case, `event_type` is a string, per event type | control-plane-engineer | `tests/Architecture/ArtefactAndEventLogTests.cs` |
| R2-T3 | Python round-trip test: C#-serialized NDJSON → the **real** `internal.py` assembler (narrowest real parse entry point; no tautological stub) parses it | eval-harness-engineer | `tests/architecture/` (Python) + fixture |

## Files to Create / Modify

`src/ControlPlane/UgcIntelligence.Events/AppendOnlyEventLog.cs` (Mod), a shared options source (reuse `Mechanism.cs`'s if accessible, else new small file in Events), `tests/Architecture/ArtefactAndEventLogTests.cs` (Mod), a Python round-trip test under `tests/architecture/` (New).

## Verification Steps

1. `dotnet build UgcIntelligence.slnx` → clean. (State: R2-T1.)
2. `dotnet test tests/Architecture` → R2-T2 green. (State: R2-T2.)
3. `uv run --with pytest pytest tests/architecture` → R2-T3 green. (State: R2-T3.)
4. Falsification: revert R2-T1 → R2-T2 and R2-T3 both fail; restore.

## Acceptance Criteria (verifiable PASS/FAIL)

- **A-R2-1:** `ToReplayExportNdjson` output for a sample log has all snake_case keys and string `event_type`. (evidence: C# test name)
- **A-R2-2:** Python round-trip test parses the C# output without error. (evidence: Python test name)
- **A-R2-3:** existing 395 C# / 243 Python suites still green.

## Out of Scope

No changes to what the export *contains* (still tenant-scoped OutcomeEvent projection). No new read path. No frontend/Python-miner changes.

## Completion Criteria (DoD)

Both suites green; `boundary-reviewer` PASS (confirms no new read grant, tenancy intact, wire format matches Contract B).
