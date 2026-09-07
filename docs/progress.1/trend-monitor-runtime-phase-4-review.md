# Phase 4 review — trend-monitor-runtime

## Report card
**Overall: Ready** — the durable state root closes the plan review's biggest risk (nightly-process amnesia): signals, per-episode identity anchors, origin-scoped resolution samples, term admissions, and verdict records all survive across cron-invoked processes, fail-closed on corruption, with repository-layer tenancy.

| Gate | Result | One line |
|------|--------|----------|
| Entry checks (ruff + pytest) | Ready | 315/315 green (22 durable-state tests), ruff clean; guard tests green inside the run |
| Boundaries (`boundary-reviewer`) | Ready · A (round 1: Almost · B-) | Round-1 CHANGEs (episode-unfaithful reverse lookup; `refresh()` missing the archived guard) fixed + test-locked; round-2 PASS with episode-replay rebuild verified order-correct; its 3 advisory notes taken same day |
| Measurement (`measurement-reviewer`) | Ready after fixes · rounds: B- → B- → closed | Round-1 CHANGEs (lifetime-vs-remaining contract; untested samples persistence) fixed; round-2's 3 residuals (band also needs age-adjustment — pinned into lifecycle + Phase 6 R2; exact-duration pinning test; mixed-basis plan sentence) all fixed with the pinning test green (`samples[0] == 8`, derived + constant) |
| Acceptance criteria | 6/6 PASS (R1–R6) | evidenced below |
| Definition of Done | met | plan text updated where the gates pinned semantics (Phase 4 R3 closing bases; Phase 6 R2 age-adjusted est **and** band) |

**Top things to fix (in order):** none blocking. Carried forward: Phase 6 must implement + test the age-adjusted `est` and re-derived `band` (pinned as its R2 acceptance); a lock file when the cron trigger deploys (single-invocation model for now).

*Ask `/go` to explain any finding in plain words — or to just fix them.*

---

## Diff scope
NEW `detector/store_durable.py` (`StateRoot` one-file atomic JSON root; `ResolvedSampleBook`; `StateCorrupted`), `tests/Architecture/test_trend_store_durable.py` (22 tests). MODIFIED `detector/archive.py` (tenancy-aware `feed`/`query` via `_visible`, archived-immutability guards on `add` **and** `refresh`), `detector/identity.py` (per-episode records, episode-faithful `by_signal_id`, `first_detected_at` anchor immutable per episode), `detector/run_scan.py` (resolution capture at archive/`valid_to` + first-declining; anchor on new episodes only; resurrection-collision skip; naive-`as_of` refusal), `detector/__init__.py`, `detector/lifecycle.py` (lifetime-semantics docstring), plan docs (pinned semantics).

## Acceptance Criteria walk
- **R1 — PASS.** Same store API through a persist→load roundtrip (parametrized contract test); repository-layer tenancy proven non-tautological across restart (`test_repository_layer_tenancy_no_unfiltered_read_path`).
- **R2 — PASS.** Bidirectional, episode-faithful identity index; `first_detected_at` = injected `as_of` @00:00 UTC (past-date test anchor so wall-clock drift can't pass coincidentally), immutable on re-detection (a real bug caught by the test and fixed); restart idempotency incl. shifted-`start_day` across genuine new-object roundtrips.
- **R3 — PASS.** Origin-labelled, public-only, per-signal-deduped samples; per-(platform, origin) pools independently gated at 20 (both sides tested); closing bases pinned (declining → scan day; archive → `valid_to`, deliberate upper bound — exact-duration test); persistence-with-data + dedupe-across-restart proven.
- **R4 — PASS.** Archived history immutable through `add` and `refresh` (tests); atomic tmp+`os.replace` writes; episodes never overwritten by a resurgence.
- **R5 — PASS.** Corrupt file (malformed JSON *and* valid-JSON-non-object) raises `StateCorrupted`; absent file = legitimate first run (tests).
- **R6 — PASS.** Registry admissions (with `kind`/origin) and ledger records (`go_accuracy` 0.5 preserved) survive restart (tests) — the amnesia fix.

## Reviewer gates
Two rounds each. Boundaries: NEEDS CHANGES → **PASS (A)**; measurement: NEEDS CHANGES → NEEDS CHANGES (3 narrowing residuals) → fixed same day with the pinning test green in the final 315/315 run (post-round-2 closure with evidence on disk, same discipline as Phase 3). Both gates' advisory notes swept (drift guard extended to identity rows; naive-`as_of` + non-dict-JSON regression tests; ordering-invariant docstring).

## Definition of Done audit
Entry gate green; both mapped gates' findings closed; five guard tests green; tests ship with behaviour (two genuinely caught bugs: the anchor overwrite, the wrong pinned duration constant); invariant semantics that moved were pinned docs-first (Phase 4 R3, Phase 6 R2, lifecycle docstring).

**Verdict: READY** (proof of completion for Phase 5's dependency gate).
