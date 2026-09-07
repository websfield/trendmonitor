---
name: component-boundaries
description: Use whenever a change touches the component call-graph (C1 Pattern Engine, C2 Scoring/Amplification, C3 Calibration Monitor), the OutcomeEvent log or events-v1.json, the circuit breaker, pattern-library publishing/promotion, the version triple, the Extraction Service, or tenant isolation. The hard rules — C2 never calls C1; C2 is the sole event writer; C3 alone controls the breaker and library promotion; everything fails closed; tenant data never crosses. Mandatory before writing any cross-component, event, breaker, or library code, and before editing integration-contract.md.
---

# Component Boundaries & Authority

## The call-graph (one-way, by design)

- **C2 never calls C1** — no code path from a scoring request into the Pattern Engine. C2 reads a pinned, immutable library artefact. C1↔C2 latency is *weeks* by design; a score depending on a pattern mined from scores is feedback inside a request.
- **C1 calls nothing** — it consumes the append-only event log and has **no read access to ClientHub operational tables** ("building a read replica for its convenience is how the decoupling dies").
- **C3 calls nothing** — same event log in; exactly one flag (BreakerState) and one verdict (LibraryVerdict) out.
- **C2 is the sole writer to the OutcomeEvent stream.** C1 and C3 are consumers only. "If C1 needed to tell C2 something, the design is wrong."

## Sole authorities (no override paths)

- **C3 alone trips/arms the circuit breaker** per cohort `(tenant, vertical, platform, rubric_version, pattern_library_version)`. Automatic to trip (instant, no human); manual with recorded reason to arm. **No C2 config, admin flag, or per-campaign exemption overrides a breaker** — "a breaker that can be switched off from the component it governs is a comment."
- **C3 alone approves library promotion** (Contract D). C1 mines nightly and may cut candidates anytime, but cannot set `active_version` without a `promote` LibraryVerdict — not on a timer, not under commercial pressure, not by config. Challenger beats incumbent on the *same* paired held-out submissions. Promotion resets the calibration window (breaker → cold until n ≥ 60 rebuilds), so cadence is ~quarterly, bounded by outcome accumulation, never by mining cadence.

## Contracts A–D (see `docs/initial.past/integration-contract.md` — the spine)

- **A — PatternLibraryVersion (C1→C2):** immutable content-addressed blob (sha256); rollback = repoint `active_version`, never edit. Every score pins the `(extractor × rubric × pattern_library)` version triple; compatibility enforced at read time — mismatch ⇒ cohort `cold`, never scores against an incompatible library. Only `evidence_status: active` patterns are retrieved; `insufficient_evidence`/`stale` ship for audit but are never retrieved, never shown to a client.
- **B — OutcomeEvent (C2→C1,C3):** append-only, at-least-once, `idempotency_key = hash(event_type, entity_id, logical_timestamp)`, consumers dedupe (a double-counted outcome silently inflates an effect size). The `arm` tag and `breaker_state_at_score` travel with events; events reference `feature_record_id`, never a raw media URI (must survive de-identification).
- **C — BreakerState (C3→C2, read-only):** read-through cache, 60s TTL. **Fail closed**: unreachable C3 or stale cache ⇒ cohort treated as `cold` (advisory), never as permission.
- **D — LibraryVerdict (C3→C1):** 6–12wk shadow window; `promote | reject | extend_shadow`.

## Tenancy

Tenant A's internal outcome data **never** informs Tenant B's scoring — enforced at the repository layer via `Pattern.tenant_id`, **no widening override, no admin path, not a configuration option**. Public exemplars are tenant-neutral; internal corpus never crosses.

## Failure semantics (the safe directions)

C1 down → C2 continues on the last pinned library indefinitely (staleness alarm at 30d). C2 down → C1/C3 stop learning, nothing degrades incorrectly. C3 down → C2 fails to `cold`, C1 cannot promote. Extraction down → NEEDS_REVIEW; compliance still runs on caption/metadata. **Nothing in the critical path of a creator submission depends on C1 or C3 being alive.**

## Anti-patterns

- Any synchronous call, shared database table, or "convenience" read replica between components.
- A second writer to the event stream, or an event mutated/deleted after append.
- A breaker check that defaults open, caches past TTL as valid, or is skippable per campaign.
- Publishing or hotfixing a library version in place; comparing features across extractor versions without a cohort split.

While code doesn't exist yet, these invariants gate **doc and schema edits**: changes to `integration-contract.md` or `events-v1.json` that add a call path, a second writer, or an override are design regressions — see CLAUDE.md rules 3 and 8.
