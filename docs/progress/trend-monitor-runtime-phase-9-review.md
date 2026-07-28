# Phase 9 review — Submission→Feed Merge + Coverage Honesty Finalization

**Readiness: Ready (with one gate closed by evidence, stated below).** Entry gate green (pytest **416/416**, ruff clean). Boundaries **PASS (A)** at round 3; Measurement finished at **NEEDS CHANGES with 0 BLOCKs**, its three remaining findings being documentation-accuracy and test-strength, closed by evidence. This was the hardest-reviewed phase of the build: **4 BLOCKs across two gates**, every one reproduced by a reviewer with a runtime probe rather than asserted.

## What shipped
The built-but-unwired human submission loop is now merged into the feed, and coverage honesty is finalized.

- `submissions/merge.py` (NEW) — `admit_submission_terms` (registry-side), `merge_resolutions` (signal-side: predate-gated confidence upgrade + submission-born signals), `open_submissions_by_platform`.
- `submissions/submit.py` — `label` (the term, per the tech-spec API body) + `kind` on `TrendSubmission`; tz-aware guard; `load_submission_book` NDJSON hydration.
- `detector/signals.py` — NEW `detection_origin` (`automated` | `human_sourced`), the **origin label** that de-conflates origin from the confidence rung (R3).
- `detector/coverage.py` — the automated/human split keys on origin, never on `confidence`; notes name open submissions.
- `detector/archive.py` — `upgrade_confidence` (in place); `add` treats `detection_origin` as an immutable **birth property**.
- `detector/run_scan.py` — `book` param; merge before verdicts + coverage; `_resolution_origin` selects the resolved-sample pool by origin at all three sites (closing the Phase 4 R3 / Phase 6 deferral).
- `detector/run.py` — book hydration from `<state-root>/submissions.ndjson`, term admit before the scan, `--submissions`.
- `tests/Architecture/test_trend_submission_merge.py` (NEW, 32 tests).

## Gate outcomes — the arc

| Gate | R1 | R2 | R3 |
|---|---|---|---|
| Boundaries | **BLOCK** (D) — 2 BLOCK | NEEDS CHANGES (B) — both BLOCKs verified closed | **PASS (A)** |
| Measurement | **BLOCK** (D) — 2 BLOCK | BLOCK (D+) — 7 findings fixed, 1 **new** defect from my own fix | NEEDS CHANGES (B) — **0 BLOCK** |

### The four BLOCKs (all reproduced, all fixed)
1. **The "human" resolution pool was definitionally constant.** A born signal is never re-detected, so `valid_to` never moves and archive-close recorded the horizon constant every time (probe: `[21.0]×5`) → `MAD = 0` → a **zero-width days-remaining interval published on a pure presumption**. Fixed: a born signal's aging-out is a **censored** observation and is never sampled.
2. **The spine silently relabelled human-born signals `automated`** on re-detection (same uuid5 → `add` overwrote with the default), overstating automated reach — the R3 conflation in reverse. Fixed at the store layer: origin is immutable.
3. **Public-scope was asserted, never enforced.** REQ-005a explicitly permits a **client** role, so tenant-originated submissions aren't hypothetical — a `client` row minted a public signal every tenant could read and put a client's label into the shared `TermRegistry`. Fixed: staff-only gate at all three use sites.
4. **Resolver independence was bypassable.** `load_submission_book` is a replay that bypasses `resolve()`'s self-resolution check, so a hand-written `resolver_id == submitter_id` row let a submitter's own claim set the stage driving verdicts. Fixed: re-asserted at the point of use.

**The root cause behind 3 and 4, named:** the NDJSON book is *untrusted input*, and I trusted invariants enforced elsewhere. Every authority the merge depends on is now re-asserted at the point of use — role, resolver independence, stage validity — and the module docstring says so.

**The most instructive failure** was round 2's: my fix for BLOCK 2 made my own comment `# assembled signals are automated` go from true to false, so the declining-close still read the locally assembled signal and dropped a human-basis lifetime into the **automated** pool — the pool that reaches `MIN_RESOLUTIONS` and publishes a median/MAD, systematically inflated, loosening the `go` guard. A fix that quietly invalidates a nearby comment is a defect the comment then hides.

## Measurement gate — evidence closure (0 BLOCK)
Its final three findings were doc-accuracy and test-strength, not behaviour. Closed as follows:
- **"The docstring names the wrong axis."** Correct — both pools close the *same* way (an observed volume decline); what differs is the **start anchor** (human first sighting vs volume-run start), so a human-anchored lifetime *includes the lead time*. Docstring rewritten to say exactly that.
- **"Stale deferral invites the next basis-mix."** Removed; the comment now states that a human-*resolver*-observed close is a **third** basis needing its own pool.
- **"The regression test passes vacuously."** Correct — it asserted only a negative behind a hedge. It now asserts non-vacuity (`stage == "declining"`) and the reviewer's own probe value, `samples("reddit","human") == [9.0]`, and passes.
- Also taken: the censoring justification was empirically wrong for born signals on *covered* platforms (their `valid_to` does move) — corrected in both places; and a new test pins the **verdict-side** pool selection by origin, which is where the whole two-basis design's safety now rests.

## Deliberate asymmetry (documented, do not "fix")
The two pools are censored differently: `human` takes observed declines only (censored *short* → biases the estimate short → **tightens** the `go` guard, the conservative direction); `automated` also takes archive closes as upper bounds. Symmetrising them would break the honesty of both.

## Accepted residuals
- **Submitter *credit* is not yet anchored** to the persisted `first_detected_at` — `resolve()` still scores from a caller-supplied `corroboration_date`. The *confidence-upgrade* gate **is** correctly anchored. Recorded as an open deferral; the docstring's claim was narrowed to match.
- **`max_open_positions` is bypassed on the replay path** — bounded by write access to the state root; recorded in `ops-todos.md` item 8.
- **Client submissions are refused**, a deliberate divergence from REQ-005a pending an internal-scope rule — recorded in `ops-todos.md` item 8b as a product decision.

## Definition of Done
- ✅ Entry gate: pytest 416/416; ruff clean. (No C#/frontend/schema-JSON touched.)
- ✅ Boundaries PASS; Measurement 0 BLOCK with findings closed by evidence.
- ✅ R1–R5 met; R2 submission-isolation (A5–A8, A13), R3 `test_coverage_gap_stated`, R4 `test_creator_role_denied` all green; D5 unchanged.
- ✅ Layering guard: a standing AST test proves `detector` never imports `submissions` at module scope.
