# Phase 4: Durable Store — Cross-run Persistence + Idempotency

## Objective
Give the runtime's cross-run state durability under **one state root**: the `TrendSignalStore`, the identity index, the resolved-samples history, the `TermRegistry`, and the `VerdictLedger` — so nightly runs accumulate, `archive_due` works across runs, `days_remaining` has history, Phase 8's term admissions survive to the next cron invocation (the core loop "trend detected tonight → corpus points at it tomorrow" closes across processes), and re-runs stay idempotent across restarts. Today all of these are in-memory only (`archive.py:23`, `registry/terms.py:88-96`, `verdict.py:129` — lost on exit).

## Prerequisites
- [ ] Phase 3 spine merged.
- [ ] Read `detector/archive.py` fully (its API is the contract to preserve).

## Requirements Checklist
- [ ] R1: A durable backing (content-addressed/append-friendly file store — e.g. JSON/NDJSON under a configured root) implementing the **same `TrendSignalStore` API** (`add`, `refresh`, `archive_due`, `get`, `feed`, `query`). **Repository-layer tenancy:** `feed`/`query` are tenant/scope-aware in the store itself — an internal-scope signal is returned only to a query carrying its `tenant_id`; there is no unfiltered read path a caller can forget to filter (caller-side-only filtering is the "one omitted argument from a cross-tenant read" shape). Acceptance: existing `archive.py` tests pass against the durable store unchanged (or a shared test suite runs on both); a store-level test in the shared suite proves internal signals are invisible without the owning `tenant_id`.
- [ ] R2: **Restart idempotency + identity index.** The store persists an **immutable identity → (`first_seen`, `first_detected_at`) record** at first detection (`first_seen` = the candidate's start day at first sight; `first_detected_at` = the store-add event timestamp — the internal, non-revisable anchor Phase 9 scoring uses). `TrendSignal` carries neither `term` nor `first_seen`, so this index is the persistence home the Phase 2 R2 id rule and Phase 9 R1 anchoring depend on. The index record stores **both directions**: `signal_id ↔ (scope, tenant_id, platform, vertical, term)` identity plus (`first_seen`, `first_detected_at`) — the reverse lookup is what Phase 8 uses to resolve a verdict's `trend_id` back to its term. **Clock rule:** `first_detected_at` is derived from the injected `as_of` (UTC, timezone-aware; the scan's logical-day start, i.e. `as_of` at 00:00 UTC — never wall-clock `datetime.now()`, per Phase 5 R6's no-hidden-clock rule); this is deliberately conservative for the Phase 9 comparison (a submission on the detection day counts as not-predating). Load store → `run_scan` for `as_of=D` → persist → new process loads store → `run_scan` for `as_of=D` again → signal set is unchanged (deterministic ids from Phase 2). Acceptance: a test that persists, reloads, re-runs, asserts no duplicates — **including the shifted-`start_day` case across a restart** (source revises the window; the persisted `first_seen` wins; no re-minted id).
- [ ] R3: **Resolved-samples history** for `days_remaining`: the store (or a sibling) accumulates resolved trend durations per platform across runs so `days_remaining(stage, resolved_samples)` can cross `MIN_RESOLUTIONS=20`. **Resolution definition:** a sample closes at the first nightly scan that classifies the signal `declining` (automated origin, closes at that scan's day), at a recorded human resolution observing decline (human origin), **or at archive** — an archive-closed sample closes at the signal's own `valid_to`, never at tonight's scan day (a missed cron or a long-dark source must not inflate the lifetime by the outage length); `valid_to` embeds the presumption horizon, so archive-closed lifetimes are deliberate **upper bounds** — preferred over outage-length inflation (measurement gate round 2, 2026-07-16). Duration = days from the signal's persisted `first_seen` to that closing date, accumulated per platform. Two measurement guards: (a) the shared pool accumulates **public-scope signals only** — an internal-scope signal's duration is tenant data and never enters it; (b) each sample is **labelled with its resolution origin** (`automated` volume-decline vs `human` resolution — two different measurement bases), and a signal's `days_remaining` estimate draws only on samples of its own origin class, each pool gated by `MIN_RESOLUTIONS` independently. Acceptance: after ≥20 same-origin resolutions, `days_remaining.is_numeric` is True; below it, band-only (test both — preserves `test_days_remaining_gated`); a test shows internal-scope durations excluded and origins not pooled.
- [ ] R4: **Immutability discipline.** A published/stored signal is never mutated in place except via the defined `refresh`/`archive_due` transitions (append/compensate, never destructive edit). Acceptance: boundary-reviewer confirms no in-place rewrite of history.
- [ ] R5: Fail-closed on a corrupt/unreadable store file — raise, never silently start empty (which would hide history loss). Acceptance: corrupt-file test raises a clear error.
- [ ] R6: **Registry + ledger durability (the amnesia fix — N1).** Under the same state root: the `TermRegistry`'s admitted terms (term, origin, kind, admitted-at) and the `VerdictLedger`'s records persist and rehydrate, so a Phase 8 `go`-verdict admission tonight is in `TermRegistry.active()` tomorrow, and REQ-005f's `go_accuracy` eval gate has a durable data path. Same discipline as R4/R5 (append/compensate, fail-closed on corruption). Acceptance: admit a term → persist → new process → term is in `active()`; a ledger record survives a restart (tests).

## Implementation Tasks
1. [ ] Add a durable store implementation behind the `TrendSignalStore` API (config: store root path).
2. [ ] Factor the store API into a shared test suite exercising both in-memory and durable.
3. [ ] Add resolved-samples accumulation + tests.
4. [ ] Corrupt-file and restart-idempotency tests.

## Files to Create/Modify
| File | Action | Purpose |
|---|---|---|
| `src/IntelligencePlane/c1_pattern_engine/detector/store_durable.py` | Create | File-backed `TrendSignalStore` + identity index + resolved samples + registry/ledger persistence (one state root) |
| `src/IntelligencePlane/c1_pattern_engine/detector/archive.py` | Modify | Extract a shared interface if needed (minimal) |
| `src/IntelligencePlane/c1_pattern_engine/detector/identity.py` | Modify | Make Phase 3's in-memory identity index durable (R2) |
| `src/IntelligencePlane/c1_pattern_engine/detector/run_scan.py` | Modify | Wire resolution-sample capture (archive/first-declining) + `first_detected_at` recording + resurrection guard (R2/R3) |
| `tests/Architecture/test_trend_store_durable.py` | Create | Persistence, restart-idempotency, corrupt-file, resolved-samples, registry/ledger rehydration |

## Verification Steps
1. [ ] Durable store passes the shared store suite.
2. [ ] Persist → reload → re-run adds no duplicates.
3. [ ] `test_days_remaining_gated` green; ≥20 resolutions unlock numeric.

## Completion Criteria
- [ ] Boundaries + Measurement gates PASS; guard tests green; entry gate no new failures.
