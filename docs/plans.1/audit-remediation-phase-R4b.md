# Phase R4b — Real cross-process transport (Contracts A, C, E)

**Depends on:** R0 (ADRs), R2 (verified wire format), R4a (hosts). **Primary agents:** `control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer`. **Gates:** `boundary-reviewer`, `measurement-reviewer` (VPS `Anchored` reachability).

## Project Conventions Pinned (READ FIRST — verbatim from CLAUDE.md)

- **Non-negotiable rule 3:** One-way call-graph; C2 never calls C1 and never calls C4; C1/C3 only consume the append-only event log; C2 is the sole OutcomeEvent writer; C4 reads one artefact prefix, writes nothing.
- **Non-negotiable rule 4:** Fail closed — unreachable C3 / stale breaker (>60s) / version-triple mismatch / missing library degrades to `cold`/advisory, never a default score, never approval.
- **Non-negotiable rule 5:** A `Proxy` value never enters an effect-size calculation; pattern *estimation* reads the internal corpus only.
- **Planned conventions:** content-addressed immutable artefacts (sha256), `<prefix>/<sha256[0:2]>/<sha256>.json` layout (`ArtefactStore.cs:7-12`).
- **Available agents:** `control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer`, `boundary-reviewer`, `measurement-reviewer`.

## Requirements Checklist (functional)

1. **#3 writer-side:** Python `pattern_library.py:117-134` and `publishers/mechanism_library.py:206-269` write their built artefacts to the documented shared filesystem/blob layout `<prefix>/<sha256[0:2]>/<sha256>.json`, matching `ArtefactStore.cs`'s "language-neutral layout contract" — not only in-memory dicts. **The Python writer writes only content-addressed `<sha>` artefacts; it MUST NOT write any `pointer/active_version` key** — repointing `active_version` *is* library promotion, which is C3's sole authority (`RepointActiveVersion` is writer/`internal`, gated on `LibraryVerdict`, ADR-0005). A Python writer that could repoint would let C1 self-promote and bypass C3. **Pattern-library and mechanism-library artefacts occupy distinct, type-discriminated keyspaces/prefixes** — C2's VPS pattern resolver must never load a mechanism artefact (mechanisms carry `Proxy`-selected provenance and are hypotheses; a mechanism reaching VPS would violate "mechanisms never enter VPS").
2. **#3 reader-side:** C2 gains a production pattern-artefact resolution call (`CohortResolver.Resolve` can receive a non-null pattern library from the store), so VPS can reach `Anchored` in shipped code, not only advisory.
3. **#3 breaker:** a cross-process `IBreakerReader` HTTP client (C2 → C3's calibration API) replaces the fail-closed stub from R4a; on unreachable/stale it returns `cold` (rule 4).
4. **#3 end-to-end test:** one test starts from Python's **actual serialized output** (not hand-built C# fixtures) → written to the store → read by C2 → VPS resolves `Anchored`; and breaker read-through returns a live state, `cold` on outage.

## Requirements Checklist (technical)

- The store write is content-addressed (sha256), immutable, one read prefix for C4 (rule 3). Python and C# agree on the layout and the R2 wire format.
- `IBreakerReader` HTTP client honors the 60s TTL then `cold`; no path yields a default numeric score.
- `Proxy` cannot enter estimation across the new read path — estimation still reads the internal corpus only (measurement reviewer verifies the seam).
- Sole-writer intact: the transport adds a **reader** for artefacts and a breaker client; it does **not** give Python a second event-writer path.

## Edge Cases & Failure Paths

- **Store artefact missing / sha mismatch:** C2 read refuses on mismatch (like `ArtefactStore` read), VPS falls back to advisory — never a fabricated `Anchored`.
- **C3 API down / slow:** breaker client returns `cold` past TTL; scoring advisory; no approval.
- **Version-triple mismatch** between the written library and C2's expected pointer: fail closed to advisory.
- **Double failure:** store unreachable *and* C3 down → advisory + `cold`, host stays up.

## Handoff Contracts

Consumes R4a's hosts + breaker seam and R0's ADRs. **On R2:** the artefact-store path (pattern/mechanism library → `ArtefactStore` read → VPS) is governed by the *already-correct* `Mechanism.cs`/`ExemplarIndex.cs` snake_case options, not by R2's `ToReplayExportNdjson` (event-log) fix — so R2 is a hard dependency **only** for the part of R4b's end-to-end test that replays event-log NDJSON across the process boundary; the artefact-read path does not depend on R2. The Depends-on line keeps R2 because R4b's e2e exercises both. This is the terminal transport phase — no later phase consumes its output except R6 (doc sync).

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| R4b-T1 | Python: write pattern-library artefacts to the sha256 layout store | intelligence-plane-engineer | `c1_pattern_engine/publishers/pattern_library.py` (+ a store-writer module) |
| R4b-T2 | Python: write mechanism-library artefacts to the store, in a keyspace distinct from pattern-library artefacts | intelligence-plane-engineer | `c1_pattern_engine/publishers/mechanism_library.py` |
| R4b-T3 | C#: production pattern-artefact resolver feeding `CohortResolver.Resolve` (resolves from the pattern keyspace only) | control-plane-engineer | `src/ControlPlane/UgcIntelligence.C2.Api/.../CohortResolver.cs` (+ resolver) |
| R4b-T4 | C#: HTTP `IBreakerReader` client (C2→C3), fail-closed to `cold` | control-plane-engineer | `src/ControlPlane/.../BreakerCache.cs` neighbour (new client) |
| R4b-T5 | End-to-end test: Python serialized output → store → C2 read → VPS `Anchored`; breaker read-through + outage `cold` | eval-harness-engineer | `tests/Architecture/*` + Python fixture producer |
| R4b-T6 | Structural tests: Python writer cannot write a `pointer/active_version` key (promotion stays C3's `RepointActiveVersion`); C2's pattern resolver cannot load a mechanism artefact; no `Proxy`-provenance value can reach the VPS/effect-size computation via the new read path | eval-harness-engineer, control-plane-engineer | `tests/Architecture/*` |
| R4b-T7 | (#21, re-sequenced from R1) Mark `Untrusted<T>` on caption/transcript **at the scoring-endpoint load site** built in R4a/R4b — the point content enters the process — not only inside `FencedPrompt.Build`'s signature | control-plane-engineer | C2 host scoring endpoint + feature-load path |

## Files to Create / Modify

Python publishers/synthesiser under `src/IntelligencePlane/c1_pattern_engine/`, a shared store-writer, C# resolver + breaker HTTP client under `src/ControlPlane/UgcIntelligence.C2.Api/`, end-to-end test spanning both planes.

## Verification Steps

1. `dotnet build` + `dotnet test tests/Architecture` → green incl. R4b-T5. 
2. `uv run --with pytest pytest` → Python writer tests green.
3. E2E: run the Python producer, point C2 read at the produced store, assert VPS `Anchored`; kill the breaker endpoint, assert `cold` + advisory.
4. Falsification: corrupt one artefact's content → C2 read refuses on sha mismatch (test proves fail-closed).

## Acceptance Criteria (verifiable PASS/FAIL)

- **A-R4b-1:** a Python-written artefact lands at `<prefix>/<sha256[0:2]>/<sha256>.json` and C# `ArtefactStore` reads it. (evidence: e2e test)
- **A-R4b-2:** VPS reaches `Anchored` in a non-fixture path driven by the real transport. (evidence: e2e test name)
- **A-R4b-3:** breaker HTTP client returns a live state when C3 up, `cold` when down/stale. (evidence: test)
- **A-R4b-4:** sha mismatch → C2 refuses, VPS advisory (fail-closed). (evidence: test)
- **A-R4b-5:** sole-writer + one-way call graph unchanged; a structural test proves the Python writer cannot repoint `active_version` (promotion stays C3), the pattern resolver cannot load a mechanism artefact, and no `Proxy`-provenance value reaches VPS/effect-size via the new read path — not left to reviewer attestation. (evidence: R4b-T6 test names)

## Out of Scope

No live LLM. No live external blob provider required (filesystem store satisfies the layout). No frontend. No new event-writer path for Python.

## Completion Criteria (DoD)

Both suites + e2e green; `boundary-reviewer` PASS (one-way graph, sole writer, C4 grant); `measurement-reviewer` PASS (Proxy fenced from estimation, `Anchored` reachability honest).
