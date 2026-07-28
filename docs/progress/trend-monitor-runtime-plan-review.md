# Plan review — trend-monitor-runtime

**Readiness: Ready · Grade: A- · All fifteen round-3 findings (N1-N15) verified closed in the plan text against the code; four low-severity build-time residuals remain (V1-V4 below), none blocking.**

*Reviewed 2026-07-16 by the plan-reviewer (integrity + consolidation), the final gate after boundary-, measurement-, and security-reviewer rounds 1-2. Every `file:line` citation in the plan was spot-checked against the code; all checked citations are accurate.*

## Reviewer roster and rounds

| Reviewer | Round 1 | Round 2 | Status |
|---|---|---|---|
| boundary-reviewer | NEEDS CHANGES (3 CHANGE + 6 notes) | verified closed; 2 second-order CHANGE + 2 notes | all fixed in plan text |
| measurement-reviewer | NEEDS CHANGES (4 CHANGE + 3 notes) | verified closed; 2 second-order CHANGE + 3 notes | all fixed in plan text |
| security-reviewer | NEEDS CHANGES (5 MEDIUM + lows) | verified closed; 1 MEDIUM + 2 LOW | all fixed in plan text |
| plan-reviewer (this review) | - | - | NOT READY: 3 blocking findings below |

## Prior finding -> fix table (consolidated, verified present in current plan text)

| # | Reviewer/round | Finding | Fix location (verified) |
|---|---|---|---|
| B1 | boundary r1 | Phase 6 supplier could grow a ClientHub read path | phase-6 R1 "config/artefact-only — forever"; echoed in phase-1 R2 |
| B2 | boundary r1 | internal-signal x tenant cross-product leak | phase-6 R2/R3 exact-case test |
| B3 | boundary r1 | D5 legal gate could be unblocked by allowlist work | phase-7 R4 + phase-8 R2 (`LiveIngestionBlocked` tests unchanged) |
| B4 | boundary r2 | Phase 8 coupling must consume public-scope verdicts only | phase-8 R1 (resolve signal, refuse internal scope, test) |
| B5 | boundary r2 | repository-layer tenant/scope-aware `feed`/`query` | phase-4 R1 |
| B6 | boundary r2 notes | submission-born scope rule; ledger scoping | phase-9 R1; phase-6 R2 |
| M1 | measurement r1 | signal-id stability under live-source jitter | phase-2 R2 (`first_seen` caller-resolved, persisted) |
| M2 | measurement r1 | coverage honesty pinned, not config-dependent | phase-3 R5 + phase-5 R5 (default tracked set incl. blind platforms) |
| M3 | measurement r1 | submitter-scoring anchoring | phase-9 R1 (anchor + sandbagging gate) |
| M4 | measurement r1 | submission-born signal semantics | phase-9 R1 (`observed_class`, never `forecast`) |
| M5 | measurement r2 | persistence home for identity index + shifted-start_day restart test | phase-4 R2 |
| M6 | measurement r2 | Phase 9 anchor = persisted `first_detected_at`, never data-derived | phase-9 R1 |
| M7 | measurement r2 notes | origin label independent of confidence rung; new-episode; primary-series jitter logging | phase-9 R3; phase-2 R2/R2b |
| S1-S5 | security r1 | host-pinned allowlist; redirects; term encoding; XML hardening; size caps | phase-7 R3/R4/R5 |
| S6 | security r2 | structurally disjoint `trend_sources:` schema + acquire-refusal test | phase-7 R4 (verified against `extraction/acquire.py:62-76`, which reads `sources:`) |
| S7-S8 | security r2 | `quote(term, safe="")` + path-slot assertion; redirect re-validation vs originating pinned host | phase-7 R5/R3 |
| S9 | security r2 | Phase 9 plain-text / no-XSS rule | phase-9 R5 |

## Execution simulation (walked task-by-task as the implementer)

- ✅ Phase 1 — all 4 tasks executable. ADR 0009 verified free (`docs/initial/adr/` ends at 0008); `integration-contract.md`, `RUNBOOK.md` exist.
- ❌ Phase 1, R4/Task 4 — the plan says the Hangfire pointer lives in "the trend tech spec"; the only Hangfire text is `tech-spec-ugc-intelligence.md:23` and `RUNBOOK.md:44` — `tech-spec-trend-subsystem.md` has none. The acceptance criterion (no contradictory text remains) still lets the implementer recover. Fix: name the two real locations. (LOW, high confidence)
- ❌ Phase 2, R1 — `assemble_signal(..., kind, ...)`: **no phase supplies `kind`.** `TrendSignal.kind` is a required Literal (`signals.py:31,49`), but `TrackedTerm` (`registry/terms.py:59-67`) has no kind field, `TrendSubmission` (`submissions/submit.py:64-83`) has no kind field, and no task adds one or states a default/derivation rule. The Phase 3 orchestrator and Phase 9 merge both hit this wall. Fix: add `kind` to `TrackedTerm`/`TrendSubmission` (or pin a default + rule) in Phase 2/3. (MEDIUM, high confidence)
- ✅ Phase 2, R2/R2b/R3-R6 — executable; new-episode semantics, primary-series rule, and the tenant/scope invariant all pinned with named tests.
- ❌ Phase 3, R6 — the orchestrator "resolves each candidate's `first_seen` against the store", but `TrendSignalStore` is id-keyed only (`archive.py:27-33`) and `TrendSignal` carries no `term` — an identity lookup is impossible against the store as it exists, and the identity index only arrives in Phase 4 R2. Phase 3's Files list (run_scan.py, `__init__`, tests) contains no home for the in-memory identity index the shifted-start_day acceptance test requires. Fix: state that Phase 3 introduces the (in-memory) identity index — on the store or a ScanContext — which Phase 4 R2 then makes durable; add the owning file to Phase 3's Files list. (MEDIUM, high confidence)
- ❌ Phase 3, R5 — **the signal's `platform` derivation is unpinned.** R5's source-to-platform map governs live-source evidence only. If a signal's platform comes from the `TrackedTerm` bucket, a tiktok-bucketed term detected on `google_trends` mints a `platform="tiktok"` automated signal — `coverage_report` then shows tiktok as covered (`coverage.py:64`: gap requires no live signal AND no source), defeating the pinned coverage honesty through the signal path the map does not reach. Fix: pin the rule — an open-web-proxy detection never yields a signal on a closed platform (signal platform = the source-mapped platform, or closed-platform-bucketed terms are excluded from automated assembly). (MEDIUM, medium-high confidence)
- ✅ Phase 4 — R1/R2/R4/R5 executable; store API verified (`add/refresh/archive_due/get/feed/query`, `archive.py:31-82`).
- ❌ Phase 4, R3 — "resolved trend durations" is never defined: which event closes a sample (archive at `valid_to`? first declining classification?) and what the duration measures (first_seen to what?). A measurement-bearing definition left to the implementer. Fix: one sentence pinning the resolution event + the duration measure per origin class. (LOW-MEDIUM, high confidence)
- ✅ Phase 5 — R1-R6 executable given a term source; but see pre-mortem P1: `TermRegistry` is in-memory, `run.py` is a fresh process per cron invocation, and the "term source" config named in Task 3 is never specified.
- ❌ Phase 6, R2 — **unexecutable as written**: "call `compute_verdict(...)` and record via `VerdictLedger.record(...)`" — `record(verdict, *, trend_survived: bool)` (`verdict.py:132`) requires an outcome unknowable at render time. No task in any phase defines when/how verdict outcomes are resolved, so the implementer must invent a resolution process or fake the argument. Fix: split rendering from outcome recording; defer ledger recording to a defined resolution moment (e.g. at the signal's archive/decline event) or drop `record` from Phase 6 with a deferral row. (MEDIUM-HIGH, high confidence)
- ❌ Phase 6, R2 — the source of `band`/`days_remaining_est` (required `compute_verdict` inputs) is never named; it must be `lifecycle.days_remaining(stage, resolved_samples)` fed by Phase 4 R3's origin-scoped pools, including which origin class a verdict consumes. Derivable from the codebase review, but the plan text does not wire it. Fix: one sentence in Phase 6 R2. (LOW, high confidence)
- ✅ Phase 7 — all 5 tasks executable; the hardest security surface is the best-specified part of the plan. Per-source parse detail is appropriately delegated (each fetcher documents unit/denominator; failure -> `AdapterDark`). The 6-fetcher list vs the 7-name `SOURCE_NAMES` set is deliberate parity (tiktok excluded with an explicit no-fetcher test). Verified `acquire.py:62-76` reads the `sources:` key — the structural-disjointness fix is real.
- ❌ Phase 8, R1 — the coupling needs the **term** to admit, but `TrendVerdict` carries only `trend_id` and `TrendSignal` carries no `term`; Phase 4 R2's index is forward-keyed (identity to dates). No pinned id-to-identity/term reverse lookup exists. Fix: pin the reverse lookup (store the identity beside the signal id in Phase 4's index). (LOW-MEDIUM, high confidence)
- ❌ Phase 8, R1 — `AdmissionOrigin.TREND_DETECTED`'s **priority weight value is unstated** ("the trend-derived priority weight" — `_ORIGIN_WEIGHT` is a deterministic table, `terms.py:49-55`; SCHEDULED_SCAN=0.5, MECHANISM_OCCASION=0.7). Number-provenance rule: a new number needs a stated value + rationale. Fix: state the weight (and why) in Phase 8 R1. (LOW, high confidence)
- ✅ Phase 8, R2-R5 — executable; the standing no-import test correctly closes the name-scan blind spot (verified `test_trends.py:388-395` scans file names only).
- ❌ Phase 9, R1 — a **submission-born signal's `first_seen`** (the uuid5 id input, Phase 2 R2) is unstated — `submitted_at.date()`? `resolved_at`? Fix: one sentence. (LOW, medium confidence)
- ❌ Phase 9, R3 — **closure violation**: R3 changes the coverage split to key on a detection-origin label (today `coverage.py:53-56` keys on confidence), and R1's label may ride the signal or the wiring — but neither `detector/coverage.py` nor `detector/signals.py` appears in Phase 9's Files to Create/Modify. Fix: add the owning file(s). (MEDIUM-LOW, high confidence)
- ✅ Phase 9, R2/R4/R5 — executable; anchoring verified against `SubmissionBook.resolve(corroboration_date=...)` (`submit.py:172-237`) and the ln(1+0)=0 sandbagging guard (`scoring.py:74-77`).

## Pre-mortem (shipped, then failed in production)

- ❌ **P1 — the nightly loop has amnesia (the biggest gap).** Cron runs `python -m ...detector.run`; the process exits after one scan (Phase 5 R2, by design). `TermRegistry` (`terms.py:88-96`), `SubmissionBook` (`submit.py:126-132`), and `VerdictLedger` (`verdict.py:129`) are all in-memory — so a Phase 8 go-verdict term admission, a Phase 9 submission merge/term admission/reputation credit, and every ledger record **evaporate at process exit**. Next night the registry is empty (or re-seeded from an unspecified config), and the product's core loop — trend detected tonight, corpus points at it tomorrow — silently never closes. Phase 4 makes exactly one store durable (signals + resolved samples + identity index); no phase persists or hydrates the registry/book, and Phase 5 Task 3's "term source" config is never specified. **No receiving task anywhere.** Fix: extend Phase 4 (or a Phase 5 requirement) to persist the registry (and the submission book, or state its ingestion path), define hydration order in `run.py`, and specify the term-source config; or add an explicit deferral row with the consequence stated. (HIGH, high confidence)
- ❌ **P2 — verdict accuracy is never measurable.** REQ-005f says the coupling must earn its keep via `go_accuracy`, but no task ever resolves `trend_survived` (see the Phase 6 finding) and the ledger is volatile (P1). The eval gate the brief cites (ADR-0006) has no data path. Fix: same as the Phase 6 fix + ledger persistence or a deferral row. (MEDIUM, high confidence)
- ✅ P3 — Google Trends renormalizes its index per window, causing id churn/duplicates: absorbed at Phase 2 R2, Phase 3 R6, Phase 4 R2 (shifted-start_day tests incl. across restart).
- ✅ P4 — a source goes dark / rate-limits under 250-terms-per-bucket nightly load: absorbed at `AdapterDark` semantics, Phase 7 R3 (retry/backoff/rate-limit), Phase 5 R4 (fail-closed), Phase 3 R5 (coverage). Residual note: no pacing/volume budget is stated for 250 terms x 6 sources — chronic rate-limiting degrades honestly (coverage gap), so this is operational, not a breach. (NOTE)
- ✅ P5 — SSRF / open redirect / XXE / gzip bomb / hostile submitted term: absorbed at Phase 7 R3-R5 (host-pinned final-URL check, redirect re-validation vs originating host, strict term encoding + path-slot assertion, defusedxml/entity guard, size cap; all with named tests).
- ✅ P6 — coverage lies about TikTok/Reels: absorbed at Phase 3 R5 + Phase 5 R5 (pinned default tracked set, source-to-platform map, tests) — except the signal-platform loophole (simulation finding N5).
- ✅ P7 — cross-tenant leak (internal signal into shared registry/corpus/ledger/pool): absorbed at Phase 4 R1 (repository-layer tenancy), Phase 4 R3a (public-only pool), Phase 6 R2/R3, Phase 8 R1 (internal-go refusal test).
- ✅ P8 — trend-to-score leak via the new runtime: absorbed at the five enumerated guard tests (all verified to exist at the cited lines) + Phase 8 R4's standing no-import test.
- ✅ P9 — nightly re-run duplicates / restart duplicates: absorbed at Phase 2 R2, Phase 3 R6, Phase 4 R2, Phase 5 R3.
- ✅ P10 — corrupt or partially-written store after a mid-run crash: absorbed at Phase 4 R5 (fail-closed corrupt read) + Phase 5 R4 (abort-without-partial-commit, fault-injection tests). Atomic-write mechanism is implementation freedom; the tests pin the behaviour. (NOTE)
- ✅ P11 — D5 legal gate silently unblocked by the allowlist rework: absorbed at Phase 7 R4 (structural disjointness + acquire-refusal test against the real reconciled file) + Phase 8 R2.
- ❌ **P12 — clock discipline.** `first_detected_at` is "the store-add event timestamp" (Phase 4 R2) but Phase 5 R6 bans hidden `date.today()`; whether it is wall-clock or derived from injected `as_of` (and its timezone; Phase 9 compares it to `submitted_at`) is unstated. A naive/aware datetime mismatch or a wall-clock anchor breaks both reproducibility and the anti-gaming anchor. Fix: derive `first_detected_at` from the injected `as_of` (or an injectable clock), UTC, and say so in Phase 4 R2. (LOW, medium confidence)

## Mechanical consistency

- **Coverage parity** — Phase 7 fetcher list (6) vs `SOURCE_NAMES` (7): deliberate, with the tiktok no-fetcher test naming the defining set. PASS. Guard-test enumeration (5 names) verified 1:1 against `tests/Architecture/` at the cited lines. PASS.
- **Closure (Files vs Tasks)** — FAIL x3: Phase 9 R3 modifies coverage-split logic but `detector/coverage.py`/`signals.py` are not in its Files table (N6); Phase 3 R6 needs a home for the identity index not in its Files table (N4); Phase 6 Task 2 says "wire into `run_scan`/`run`" but Files lists only `run_scan.py` (minor). All other phases close. Reviewer agents named by the plan all exist in `.claude/agents/` (boundary-reviewer, measurement-reviewer, security-reviewer, plan-reviewer verified).
- **Deferral ledger** — deployment/cron (Non-goal + RUNBOOK task in Phase 5) PASS; tenant-brief artefact-push future PASS (pinned in ADR, Phase 1 R2); tenant-originated submissions PASS (explicitly out of scope with the precondition named). FAIL: registry/book/ledger durability is a silent omission, not a recorded deferral (P1/N1). MINOR: master plan says Phase 9 deps "5,8" while phase-9 says "Phase 8 recommended" — hard vs soft dependency disagree (N14).
- **Handoff contracts** — Phase 2 R2/R2b id + merge rules pinned and cited by Phases 3/4/9 PASS; Phase 4 R2 index pinned and cited by Phase 9 R1 PASS. FAIL: the id-to-term reverse lookup Phase 8 needs is unpinned (N7).
- **Verifiability** — acceptance criteria are PASS/FAIL with named tests throughout. PASS.
- **Number provenance** — BASELINE_DAYS=28, MIN_RESOLUTIONS=20, epsilon-range, cap=250 all trace to code/ADRs. FAIL: `TREND_DETECTED` origin weight has no stated value (N9). `valid_to` horizon is delegated with a documented-rule requirement (acceptable).

## Consolidated reviewer findings (new, this review — ordered by severity)

| # | Severity | Confidence | Location | Finding |
|---|---|---|---|---|
| N1 | HIGH | high | phase-4/5/8/9 (absent) | Nightly-process amnesia: `TermRegistry`/`SubmissionBook`/`VerdictLedger` in-memory, no persistence/hydration task; Phase 8/9 effects do not survive to the next cron run; "term source" config unspecified (pre-mortem P1) |
| N2 | MEDIUM-HIGH | high | phase-6 R2 | `VerdictLedger.record` requires `trend_survived`, unknowable at render time; no verdict-outcome-resolution task exists anywhere (pre-mortem P2) |
| N3 | MEDIUM | high | phase-2 R1 / phase-3 / phase-9 | `kind` (required `TrendSignal` field) has no source: not on `TrackedTerm`, not on `TrendSubmission`, no default rule |
| N4 | MEDIUM | high | phase-3 R6 + Files | Identity-to-`first_seen` resolution has no Phase 3 home (store is id-keyed; signal lacks `term`; index arrives only in Phase 4) |
| N5 | MEDIUM | med-high | phase-3 R5 | Signal-`platform` derivation unpinned — an open-web-proxy detection of a closed-platform-bucketed term can fabricate closed-platform coverage via the signal path |
| N6 | MEDIUM-LOW | high | phase-9 R3 + Files | Coverage-split change owns no file: `detector/coverage.py` (and possibly `signals.py`) missing from Files to Create/Modify |
| N7 | LOW-MEDIUM | high | phase-8 R1 | No pinned id-to-identity/term reverse lookup for term admission |
| N8 | LOW-MEDIUM | high | phase-4 R3 | "Resolved duration" undefined (closing event + measure per origin class) |
| N9 | LOW | high | phase-8 R1 | `TREND_DETECTED` priority-weight value unstated (number provenance) |
| N10 | LOW | high | phase-6 R2 | `band`/`days_remaining_est` supplier (lifecycle.days_remaining + which origin pool) never wired in plan text |
| N11 | LOW | high | phase-1 R4 | Hangfire text actually lives in `tech-spec-ugc-intelligence.md:23` + `RUNBOOK.md:44`, not the trend tech spec |
| N12 | LOW | medium | phase-4 R2 / phase-5 R6 | `first_detected_at` clock derivation vs injectable-`as_of` reproducibility; timezone convention for the Phase 9 comparison |
| N13 | LOW | medium | phase-9 R1 | Submission-born signal's `first_seen` (id input) unstated |
| N14 | LOW | medium | master plan vs phase-9 | Dependency disagreement: master "Deps 5,8" vs phase-9 "Phase 8 recommended" |
| N15 | NOTE | - | phase-7 R3 | No stated pacing budget for 250 terms x 6 sources nightly; degrades honestly, operational only |

## Verdict (round 3 — superseded by the verification pass below)

**NOT READY** *(superseded 2026-07-16: all N1-N15 fixed in plan text; verified in the verification pass below)*

Ordered fix list (smallest set that flips the verdict):
1. **N1** — Decide and write down the cross-run persistence story for `TermRegistry` (mandatory), `SubmissionBook`, and `VerdictLedger`: either extend Phase 4/5 with persistence + hydration + the term-source config spec, or add explicit deferral rows stating the consequence (Phase 8/9 admissions are single-process until then).
2. **N2** — Rewrite Phase 6 R2: render-time verdict recording cannot use `VerdictLedger.record` (needs `trend_survived`); define the outcome-resolution moment or defer it explicitly.
3. **N3** — Give `kind` a source (field on `TrackedTerm`/`TrendSubmission`, or a pinned default + derivation rule).
4. **N4** — Give Phase 3's identity index a named home + file entry.
5. **N5** — Pin the signal-platform derivation rule so open-web proxies cannot fabricate closed-platform coverage.
6. **N6/N7** — Close the two file/handoff gaps (coverage.py in Phase 9 Files; id-to-term reverse lookup pinned in Phase 4 R2's index).
7. **N8-N14** — One-sentence fixes each; sweep in the same edit pass.

The prior reviewers' 20+ findings are all genuinely closed in the current text — this plan is one focused editing pass away from READY.

---

## Verification pass (2026-07-16, round 4 — same generalist reviewer)

Re-walked the master plan + phases 1–9 after the round-3 fix pass; re-verified every code/doc fact the fixes introduced (`registry/terms.py:49-55` origin weights, `verdict.py:132` + ledger semantics, `coverage.py:53-56,64`, `lifecycle.py:120-129`, `submissions/submit.py:63-105`, `tech-spec-trend-subsystem.md` — `kind` enum `:57`, submissions API naming `kind` `:226`, `/internal/trends/scan → scheduled` `:232` under §Cadence — `RUNBOOK.md:44`, `tech-spec-ugc-intelligence.md:23`). All fifteen findings are genuinely closed in the current plan text.

### N → fix verification

| # | Fix location (verified in current text) | Status |
|---|---|---|
| N1 amnesia | phase-4 objective + R6 (`TermRegistry` + `VerdictLedger` under the one state root, explicitly bound to R4/R5's append/fail-closed discipline, rehydration tests named); phase-5 R1 (hydration order; `config/tracked-terms.yaml`; seed-only-new — persisted `TREND_DETECTED` admissions survive re-seed, with test); phase-9 R1 (SubmissionBook hydrates from NDJSON under the state root; the real POST API recorded as a deferral) | ✅ closed — tenancy stays sound: the state root is server-side, ledger *read* scoping is pinned at phase-6 R2 (per-tenant ledgers or public-only accuracy), the registry is tenant-neutral shared state and phase-8 R1 refuses internal-scope admissions before they reach it |
| N2 record-at-render | phase-6 R2 splits rendering from outcome-recording; outcome resolves at the first declining/archive scan; `trend_survived := non-declining ≥ lead_time_days after issuance`; REQ-005f's data path lands via phase-4 R6's durable ledger | ✅ closed — no ADR-0004 §4 conflict: §4 defines the decision rule (the 1.5× factor is a decision-time safety margin, not an outcome metric), and the plan's survival rule matches `VerdictLedger`'s own docstring ("a go whose trend was already dead when the campaign shipped is a verdict miss") |
| N3 `kind` source | phase-2 R1 + Files (`TrackedTerm.kind`, default `topic`, `registry/terms.py` listed); submission-born `kind` from the submission (the tech-spec API names it, `:226`) | ✅ closed — residual V2 below (the dataclass still needs the field) |
| N4 identity home | phase-3 R6 + Files (`detector/identity.py`, in-memory); phase-4 Files modifies it durable | ✅ closed |
| N5 platform rule | phase-3 R5: signal platform = source-mapped platform of the primary series' source, never the `TrackedTerm` bucket | ✅ closed — interacts correctly with phase-9: submission-born signals have no source series, `TrendSubmission.platform` exists (`submit.py:75`), so a human-sourced tiktok signal stays `platform="tiktok"` and phase-9 R3's "human-only platform is not a gap" test is satisfiable |
| N6 files closure | phase-9 Files now lists `detector/coverage.py` + `detector/signals.py` | ✅ closed |
| N7 reverse lookup | phase-4 R2: index stores both directions, named as phase-8's lookup; phase-8 R1 cites it | ✅ closed |
| N8 resolution def | phase-4 R3: sample closes at the first declining scan (automated origin) or a recorded human resolution (human origin); duration = persisted `first_seen` → closing date; per-origin pools, each gated by `MIN_RESOLUTIONS` | ✅ closed — residual V3 below |
| N9 weight | phase-8 R1: `TREND_DETECTED = 0.8` with rationale; verified against `_ORIGIN_WEIGHT` (1.0 / 0.9 / 0.7 / 0.5 / 0.2 — 0.8 slots coherently between `CLIENT_BRIEF` and `MECHANISM_OCCASION`) | ✅ closed — residual V1 below |
| N10 verdict inputs | phase-6 R2 wires `band`/`days_remaining_est` to `lifecycle.days_remaining(stage, resolved_samples)` fed by the phase-4 R3 pool matching the signal's origin class | ✅ closed |
| N11 Hangfire locations | phase-1 R4 names `RUNBOOK.md:44` + trend tech spec §Cadence/API (`:232`); `tech-spec-ugc-intelligence.md:23` explicitly stays (submission-enqueue path) | ✅ closed — all three locations verified |
| N12 clock | phase-4 R2: `first_detected_at := as_of` @ 00:00 UTC, timezone-aware, never wall-clock; stated conservative for the phase-9 comparison | ✅ closed |
| N13 submission `first_seen` | phase-9 R1: `first_seen := submitted_at.date()` (earliest evidenced human sighting, the id input per phase-2 R2) | ✅ closed |
| N14 deps row | master §Phases Overview: "5 (8 soft — shared coupling patterns)" now matches phase-9's "Phase 8 recommended" | ✅ closed |
| N15 pacing | phase-7 R3 operational note (paces within each source's etiquette; chronic rate-limiting degrades to `AdapterDark` + a coverage gap, never a breach) | ✅ closed |

### Residual findings (new, this pass — none blocking)

| # | Severity | Confidence | Location | Finding |
|---|---|---|---|---|
| V1 | LOW | high | phase-8 Files | Closure: R1 adds `AdmissionOrigin.TREND_DETECTED` + the 0.8 row to `registry/terms.py`, but that file is missing from phase-8's Files table (the task text is explicit, so the task stays executable) |
| V2 | LOW | high | phase-9 Files | Closure: the merge consumes `kind` "from the submission" and the tech-spec API names it (`:226`) — but `TrendSubmission` (`submit.py:63-83`) has no `kind` field and `submissions/submit.py` is not in phase-9's Files table; the implementer must add the field |
| V3 | LOW | medium | phase-4 R3 / phase-6 R2 | The resolved-duration measure (`first_seen` → decline = full lifetime) feeds `days_remaining(stage, resolved_samples)` whose docstring calls samples "observed remaining-days figures"; for a signal well past first detection an un-age-adjusted median can overstate `days_remaining_est`. Band-only until 20 same-origin resolutions blunts it — pin whether the estimate is age-adjusted at consumption when implementing |
| V4 | NOTE | medium | phase-4 R6 / phase-6 R2 / phase-9 R1 | Three one-line build-time ambiguities: (a) phase-4 R6's parenthetical "(term, origin, kind, admitted-at)" omits `vertical`/`platform`/`last_activity_at` — persist the full `TrackedTerm` or eviction recency resets on restart; (b) a verdict whose signal archives *without* declining before `lead_time_days` has elapsed since issuance has no stated outcome; (c) `submitted_at` must be parsed timezone-aware (UTC) in the NDJSON ingestion or the phase-9 comparison with `first_detected_at` raises `TypeError` |

### Verdict (final — supersedes round 3)

**READY**

Every task is now executable from the plan text alone; every pre-mortem cause has a receiving task (P1 → phase-4 R6 / phase-5 R1 / phase-9 R1; P2 → phase-6 R2 + phase-4 R6; P12 → phase-4 R2); coverage parity, handoff contracts, the deferral ledger (incl. the new POST-API deferral), and number provenance (incl. the new 0.8) all reconcile. V1–V4 are one-line touch-ups to sweep when first touching the named files — none changes a contract, an authority, or a measurement basis in a way the plans' named acceptance tests would miss.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
