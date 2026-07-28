# Phase 2: Candidate → TrendSignal Assembler

## Objective
Build the single sharpest missing seam: a production function that turns a `TrendCandidate` (+ context) into a `TrendSignal`, with a **deterministic, stable id** so nightly re-runs don't duplicate. Today this exists only as the `make_signal` test helper (`tests/Architecture/test_trends.py:71`).

## Prerequisites
- [ ] Phase 1 ADR merged.
- [ ] Read `detector/signals.py`, `detector/lifecycle.py`, `detector/detect.py`.

## Requirements Checklist
- [ ] R1: `assemble_signal(candidate, *, term, platform, vertical, kind, distinct_sources, volumes, as_of, tenant_id=None, scope="public") -> TrendSignal` (final signature to be confirmed against callers). **`kind` has a source:** `TrackedTerm` gains a `kind` field (defaulting to `"topic"` for config/scan-seeded terms — an open-web volume series can't distinguish sound/format, so `topic` is the honest default) and the assembler takes it from the term; Phase 9's submission-born signals take `kind` from the submission (the trend tech-spec API names it). Acceptance: returns a valid `TrendSignal`; `__post_init__` passes; **no numeric field is added** (REQ-005e).
- [ ] R2: **Deterministic id** from a business key: `uuid5(NAMESPACE, f"{scope}:{tenant_id}:{platform}:{vertical}:{term}:{first_seen}")`. **`first_seen` is a caller-resolved, persisted first-detection date — never recomputed from the fetched window** (live keyless sources revise history: Google Trends renormalizes its 0–100 index per request window, so a nightly-recomputed `start_day` would shift and mint duplicate ids for the same real trend). Resolution rule (the orchestrator owns it, Phase 3 R6; the persistence home is Phase 4 R2's identity index): if the store holds a live (non-archived) signal for the same `(scope, tenant_id, platform, vertical, term)` identity, reuse its `first_seen`; otherwise `first_seen := candidate.start_day` at first detection, persisted thereafter. **An archived-then-resurging identity deliberately mints a new signal (new-episode semantics — do not "fix" this into id reuse across an archive boundary).** Acceptance: same identity + same `first_seen` → same id across processes; a unit test asserts re-assembly with a *shifted* `start_day` but caller-supplied stable `first_seen` yields an equal id; different term/platform → different id.
- [ ] R2b: **Multi-source merge rule.** One signal per `(scope, tenant_id, platform, vertical, term)` identity — a second corroborating source raises `distinct_sources`, it never mints a second signal. The series driving `ema→classify_stage` is the **primary series**: the source with the most observed days in the window for that identity, ties broken lexicographically by source name (deterministic; volumes are never arithmetically combined across sources). Near-tie flips of the primary source between runs are expected — each run records which source was primary so stage jitter is diagnosable. Acceptance: a two-source candidate set yields one signal, `corroborated` confidence, and the documented primary-series stage.
- [ ] R3: `lifecycle_stage` computed via `ema(volumes)` → `classify_stage(...)`, not passed in. Acceptance: rising/peak/declining matches the smoothed series; test covers each.
- [ ] R4: `confidence` via `assess_confidence(distinct_sources=..., human_corroborated=...)`. Acceptance: 1 source → `single_source`, ≥2 → `corroborated`, human flag → `human_corroborated`.
- [ ] R5: `valid_to` derived by a stated rule (e.g. `as_of + lifecycle-dependent horizon`), documented in a docstring. Acceptance: deterministic, no magic number without a comment.
- [ ] R6: `scope`/`tenant_id` invariant honored — `tenant_id` non-null iff `scope=="internal"` (already enforced by `signals.py:55`; the assembler must not violate it).

## Implementation Tasks
1. [ ] Add `detector/assemble.py` (or extend `signals.py`) with `assemble_signal(...)` + a stable-id helper.
2. [ ] Write unit tests: id determinism, stage classification, confidence rungs, tenant/scope invariant, no-numeric-field assertion.
3. [ ] `ruff` clean.

## Files to Create/Modify
| File | Action | Purpose |
|---|---|---|
| `src/IntelligencePlane/c1_pattern_engine/detector/assemble.py` | Create | The candidate→signal assembler + stable id |
| `src/IntelligencePlane/c1_pattern_engine/registry/terms.py` | Modify | Add `kind` to `TrackedTerm` (default `"topic"`) — R1 |
| `src/IntelligencePlane/c1_pattern_engine/detector/__init__.py` | Modify | Export `assemble_signal` |
| `tests/Architecture/test_trend_assemble.py` | Create | Unit tests for the assembler |

## Verification Steps
1. [ ] `uv run --with pytest pytest tests/Architecture/test_trend_assemble.py` green.
2. [ ] `test_trends.py::test_trend_never_enters_vps` still green (assembler adds no numeric).
3. [ ] Re-assembling the same candidate produces an identical id (idempotency foundation).

## Completion Criteria
- [ ] Measurement + Boundaries gates PASS.
- [ ] All five guard tests green; entry gate no new failures.
