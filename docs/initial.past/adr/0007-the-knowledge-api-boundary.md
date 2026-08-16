# ADR-0007: The Knowledge API, and Why It Is a Fourth Component

**Status:** Accepted
**Date:** 2026-07-10 · **Revised:** 2026-07-14 (§6 + Integration status, per audit finding #3)
**Deciders:** Fred
**Related:** [ADR-0006](0006-mechanisms-and-the-warrant-ladder.md) · [ADR-0001](0001-trend-signal-sourcing.md) · [ADR-0008](0008-durable-outcome-and-artefact-store.md)
**Amends:** [ADR-0005](0005-three-components-and-the-referee.md), which describes this system as three components

---

## Context

ADR-0006 creates the `Mechanism`: a tenant-neutral, falsifiable, number-free hypothesis about why a content structure recurs among high performers. It does not say who reads one.

The requirement is that this knowledge be reachable by a machine — by ClientHub's brief composer, by the manager UI, by the quarterly "what changed" report (REQ-007), and by a client's own tooling under an authenticated key. The knowledge is the compounding asset. An asset nobody can query is a document.

The obvious implementation is to expose Component 1 over HTTP. It already holds the mechanisms; it already holds the exemplar corpus; it is already the component that knows things. Every instinct says put a controller on it.

That instinct is wrong three times over, and each way it is wrong is a way this design has already been broken once elsewhere.

**It reintroduces the synchronous dependency ADR-0005 spent a whole document removing.** C1 runs batch statistics and multi-hour mining jobs. C2 must never depend on it at request time. The moment C1 has a public read surface, the shortest path from "the brief composer needs a mechanism" to "the scorer needs a mechanism" is one pull request long, and the decoupling becomes a diagram again.

**It puts tenant data one authorisation bug away from the internet.** C1 holds the internal labelled corpus: every submission, verdict, override, and outcome for every tenant. An HTTP surface on C1 means the tenancy of the entire closed loop rests on a scoping check in a controller. The separation invariant in [compliance-notes.md](../compliance-notes.md) is described there as structural rather than a policy someone can relax. A repository-layer scope with an HTTP endpoint above it is a policy someone can relax.

**It creates a side door around the circuit breaker.** REQ-052 and REQ-038 exist so that a cohort whose scorer has not demonstrated skill shows a client a ranking and no numbers. An API on C1 that answers "what works for beauty on TikTok" with confident-sounding effect sizes serves the number the breaker was built to withhold. It would not even feel like a violation. It would feel like a different feature.

## Decision

**A fourth component. Read-only. It holds no tenant data at all. C2 never calls it.**

**Component 4, the Knowledge API.** *Serves beliefs.* It reads published `MechanismLibraryVersion` artefacts from one prefix of the artefact store and serves them over an authenticated HTTP surface. It has no database of its own that is not a cache of that artefact store. It writes nothing, anywhere.

### 1. The property that makes external exposure safe

**C4 holds no tenant-scoped data, so a bug in C4's tenancy check cannot leak a tenant's data.**

This is not a claim about C4's code quality. It is a claim about what is reachable from C4's process. It reads mechanism artefacts, which ADR-0006 makes tenant-neutral *by construction* — they are mined exclusively from the public exemplar corpus and from trend signals, and the schema forbids the fields through which outcome data could arrive.

The tenant API key on a C4 request is therefore **entitlement and rate-limiting, not isolation**. There is nothing to isolate. This is the entire reason a knowledge surface can be exposed outside ClientHub at all, and it is why the boundary is drawn here rather than around a scoping parameter.

The corollary is a rule, not a guideline: **C4 never reads the Pattern Library, the OutcomeEvent log, C1's internal corpus, or any ClientHub operational table.** It is granted read access to one artefact-store prefix. If C4 ever needs a second data source, the design is wrong.

### 2. The call graph, extended

```
                 (A) PatternLibraryVersion          (E) MechanismLibraryVersion
   C1 ─────────────────────────────────▶ artefact store ◀──────────────────── C1
   │                                          │                    │
   │                                    C2 reads (pinned)     C4 reads (published)
   │                                          │                    │
   │◀── (B) OutcomeEvents ── C2 ──▶ C3        │                    ▼
   │                          ▲     │         │              tenant-authenticated
   │◀── (D) LibraryVerdict ── C3    │         │                  HTTP clients
                                    └─ (C) BreakerState ─┘

   C2 ──X──▶ C1        C2 ──X──▶ C4        C4 ──X──▶ C1, C2, C3
   C4 emits no events.  C4 reads no breaker.  C4 writes nothing.
```

`C2 ──X──▶ C4` is the new rule, and it is the same rule as `C2 ──X──▶ C1`, applied to the surface that would otherwise make it easy to violate. A scoring path that reads a mechanism has laundered Proxy-selected evidence into a client-facing number, and has made a VPS irreproducible from its pinned version triple. Per ADR-0006, no mechanism, and nothing derived from one, is ever an input to a veto, a verdict, a VPS, an AWS term, or a budget allocation.

### 3. C4 does not read Contract C, and that is a feature

C4 has no breaker dependency. It serves nothing a breaker governs: no calibrated prediction, no effect size, no number the eval plan has an opinion about. Wiring C4 to C3 would create a dependency that could only ever fail closed on data that was never at risk.

What C4 serves instead of a confidence number is a **warrant rung**, computed deterministically from corpus counts, present on every response. `armed`/`tripped` is the right shape for a prediction. `recurrent`/`contrasted`/`falsified` is the right shape for a hypothesis.

### 4. Every response carries its own limitations

A C4 response is not permitted to be a bare fact. Each one carries `warrant`, `provenance.label` (`Proxy-selected, Measured-evaluated`), `never_tested_against` (`content that was attempted and failed`), `mechanism_library_version`, and `sha256`.

This is [ADR-0001](0001-trend-signal-sourcing.md)'s closing argument applied to a machine surface. An agency that hands a client a number and the provenance of every input is an agency the client's finance partner can be shown. A JSON payload is where provenance is most likely to be stripped and most cheaply retained.

### 5. It is a component, not a library

C4 must not be deployed as a library inside C1's process, however small it is. That would recreate, at deploy time, the request-time dependency on C1 that this ADR exists to prevent, and it would put an HTTP listener in the process that holds every tenant's internal corpus.

Whether C4 is a service, a container, or a static site generator writing signed JSON to a CDN is a deployment decision. What is not negotiable: it does not share a process with C1, it has no write path anywhere, and its read grant is one artefact-store prefix.

### 6. Host-project separation is the runtime safety property — not reference-graph non-reachability alone

The reference-graph assertion test (`ReferenceGraphTests.cs`) proves that the C2 *assembly* references neither C1 nor C4, and that C4 references no event log or breaker. That is necessary but not sufficient. Two assemblies that never reference each other can still be **co-hosted in one process** by a composition root that references both — at which point `C2 ──X──▶ C4` is true on paper and false at runtime, because a mechanism artefact and the scorer share an address space and the distance from "held" to "retrieved into a prompt" is again one refactor.

The property this ADR actually asserts is therefore stronger: **C2, C3, and C4 each run as a separate host project — a distinct executable/process — not merely as separate assemblies.** C4's host may reference only its one artefact-store prefix; it references no C1/C2/C3 assembly, no event log, no breaker. C3's host is a reader/authority: it consumes the append-only log through `IOutcomeEventReader` and is the sole breaker/library authority; it references neither `UgcIntelligence.Events.Writer` nor C1. C2's host is the sole event writer and never references C1 or C4. A host-separation test asserts these three grants at the composition-root level, not just the assembly level.

The residual — a *future* deployment topology whose composition root co-hosts two of these in one process — is not closed by the current test; it is a tracked hardening item (see Integration status).

## Consequences

**Four components is more operational surface than three, and C4 is the smallest thing in the system.** It reads immutable artefacts and returns them. It is cacheable to the edge indefinitely, because its inputs are content-addressed. Arguing it should be folded into C1 will be tempting on the grounds of size, and size is precisely why it is safe to keep separate.

**The knowledge surface ships before the knowledge is good, or it does not ship.** A mechanism library at `conjectured` serves nothing (`conjectured` is not served). The API will return empty collections for months, per cohort, until the corpus clears eight independent creators across two cohorts and two unrelated trends. An empty, honest API is the correct early state, and it will be indistinguishable, to an impatient observer, from a broken one. The response must therefore distinguish *no mechanisms have cleared the bar* from *no mechanisms exist*, the same way ADR-0004 insists a trend feed distinguish a coverage gap from an absence of trends.

**Somebody will ask C4 for a score.** "You know what works — just tell me what this submission will do." The answer is that C4 cannot, that C2 can and does, and that the number C2 produces is governed by a breaker C4 has no access to. The two surfaces answer different questions and it must be impossible to mistake one for the other. This is why C4's responses have no `0-100` field anywhere.

**Serving public exemplars raises a privacy question the internal corpus never did.** A mechanism is grounded in public posts by identifiable creators who never entered an agreement with this agency. C4 serves the *predicate*, the *counts*, and at most a public post URI — never frames, never a transcript, never a face. When a source post is deleted, the URI dies and the mechanism keeps its counts, because the counts were computed at `corpus_snapshot_sha256` and the artefact is immutable. See [compliance-notes.md](../compliance-notes.md).

**An external contract is a versioning obligation.** `mechanisms-v1.json` becomes a published contract the moment a tenant integrates against it. It bumps; it never mutates in place. The immutability rule on `MechanismLibraryVersion` is what makes a response served under `beauty.tiktok.m3` reconstructible after `m4` supersedes it.

## Integration status (recorded 2026-07-14, per audit finding #3)

The component boundaries above are correct and enforced *within* each language plane, but the **cross-process transport that carries Contracts A, C, and E between the Python intelligence plane and the C# control plane is not yet built** — as of this date it exists only as in-process fixtures in the test suites. Specifically, tracked as a **dated, open integration gap** (not a silent one):

- **No host project exists yet.** C2/C3/C4 are class libraries; none is hosted as a running service (no `Program.cs`). Host-project separation (§6) is asserted by design and by a reference-graph test, but is not yet demonstrated by three running processes. *Receiving work: the host projects.*
- **Contract A/E (artefacts) writer/reader is fixture-only.** Python `pattern_library.py` / `mechanism_library.py` build in-memory structures; they do not yet write the `<prefix>/<sha256[0:2]>/<sha256>.json` layout the C# `ArtefactStore` reads. Consequently VPS can reach `Anchored` only in fixtures, not in shipped code. *Receiving work: the real Python writer + C# resolver.*
- **Contract C (breaker) has no cross-process reader.** `BreakerCache`'s only readers are in-process; the C2→C3 HTTP/gRPC `IBreakerReader` client is unbuilt. *Receiving work: the breaker client, fail-closed to `cold`.*

This gap is scheduled for closure in the audit-remediation plan (phases R4a/R4b). It is recorded here so the boundary claims above are read as *designed and partially enforced*, not as *fully wired at runtime*. The **stronger co-hosting property** of §6 (preventing a future single-process composition root) is a further hardening item, dependent on a chosen deployment topology, and is not closed by the current host-separation test.

## Alternatives Considered

**Expose C1 directly over HTTP.** Rejected, for the three reasons in the Context: it reintroduces a synchronous dependency into the component that must never be one, it places the entire internal labelled corpus behind a controller's scoping check, and it creates a path by which knowledge-shaped numbers reach a client without passing the breaker. Each of these is a failure this design has already spent an ADR preventing somewhere else.

**Serve mechanisms from C2, which already has a tenant-authenticated API surface.** Rejected. C2 would then hold a mechanism in the same process as the scorer, and the distance between "held" and "retrieved into a prompt" is one convenient refactor. The rule `C2 never reads a mechanism` is enforceable only if C2 has no path to one.

**Make C4 read breaker state and suppress mechanisms for `tripped` cohorts.** Considered seriously, and rejected as a category error that would have looked like caution. A tripped breaker means *this scorer's numeric predictions have not demonstrated rank skill in this cohort*. It says nothing about whether a structural regularity in public content is real, because the mechanism was never a prediction and was never estimated from that scorer's outcome data. Suppressing on breaker state would imply a relationship between the two artefacts that ADR-0006 spent its length denying, and would leave the system with a dependency that fails closed on nothing.

**Ship the mechanism library as a quarterly PDF and skip the API.** Genuinely the cheapest correct thing, and it is what REQ-007 originally described. Rejected because a document cannot be queried at the moment a brief is being written, which is the only moment the knowledge is worth anything, and because a quarterly cadence hides falsification: a mechanism withdrawn in week two sits in a printed report for eleven more. The API's `falsified` state is withdrawn the same cycle it is detected. Retained as a *derived* artefact — the quarterly report reads C4, rather than C4 being written to satisfy the report.

**One combined `/api/knowledge` surface on the existing ClientHub .NET API, sharing its auth and its process.** Attractive: no new deployment, one auth story, existing rate limiting. Rejected because the ClientHub API *is* the control plane, holds every tenant's operational tables, and computes every deterministic decision. Putting a tenant-neutral, externally-reachable read surface inside it means the property in §1 — *there is no tenant data here to leak* — becomes false on day one, and it is the only property that makes external exposure defensible.
