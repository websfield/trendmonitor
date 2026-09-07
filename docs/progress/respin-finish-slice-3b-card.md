# Slice 3b report card — Interview + complete Creator Brain

**Readiness: Ready**
**Date: 2026-08-30**
**Plan: [`respin-finish-master-plan.md`](../plans/respin-finish-master-plan.md) · Card: [`respin-finish-phase-3b.md`](../plans/respin-finish-phase-3b.md)**

## The "A creator can…" line

**Answer a structured interview, review Voice + Strategy + Kill Test + a declared north-star metric, correct them, and activate one coherent Creator Brain.**

Walked live in a browser end to end (no live Anthropic key needed — this slice's Strategy/Kill Test path is fully deterministic, no vendor call): empty profile → 11-field structured interview (goals, positioning, audience, declared metric, banned words/vibes, ambitions) with an explicit "not decided" state per field and, after this slice's own gate found the gap, an explicit "None — I've decided there are none" state for list fields → review screen showing three genuinely distinct states ("Grow to 20k followers, Launch a cohort course" / "Marked as not decided yet." / "None listed.") → submit → all 8 Strategy claims confirmed → coherent activation → "In force now." Verified at the DB level: `brain_activation_snapshots` correctly recorded `strategy_doc_id` populated, `voice_doc_id`/`killtest_doc_id` correctly null. 360px viewport confirmed no horizontal overflow; keyboard Tab navigation reaches form controls with a visible double-ring focus style.

## What got built

- **Structured interview** (R1-R3, R11) — `interview-ops.ts`'s `saveInterviewDraft`/`getInterviewDraft`/`submitInterview`, a mutable per-profile draft table (`onboarding_interview_drafts`) turned atomically into immutable `creator_authored` inputs plus deterministic Strategy/Kill Test brain-document content on submit. Three-state answers throughout (unanswered / not-decided / decided), with list fields carrying a fourth real state (decided-empty) added mid-slice after a live browser walk found the UI couldn't express it.
- **Coherent activation** (R8-R9) — `activateBrainDocCoherent` (new capability in `with-workspace.ts`) activates one document then records one `brain_activation_snapshots` row carrying forward every kind's current active id, all in one workspace-locked transaction. Append-only: changing the metric or any document later creates a new snapshot, never rewrites history.
- **Strategy/Kill Test brain documents** (R6-R7) — `brain-content.ts` widened with optional `goals`/`ambitions`/`metric` (Strategy) and `bannedWords`/`bannedVibes` (Kill Test); `brain-ops.ts` generalized from voice-only to all three kinds (`readStrategyBrain`, `readKillTestBrain`, `confirmStrategyFields`, `confirmKillTestFields`, `activateBrainCoherent`).
- **B04 honest absence** (R13) — the interview's completion screen states plainly that "creating your first three ideas in Studio is not part of this product yet," owned by slice 7, not claimed here.

## Gate summary

| Gate | Round 1 | Round 2 | Final |
|---|---|---|---|
| Respin billing & credits (Full gates, collateral-risk check) | **PASS** (zero findings) | — not needed | **PASS** |
| Respin brain tenancy (Full gates) | NEEDS CHANGES (0 BLOCK · 2 CHANGE) | **PASS** (Ready/A) | **PASS** |
| Respin spin compliance (lean-merged) | **PASS** (1 Info) | — not needed | **PASS** |
| Respin learning honesty (lean-merged) | **PASS** (zero findings) | — not needed | **PASS** |

**Reviewer spend: 4 agent runs** (3 in round 1 — billing, tenancy, one merged compliance+learning-honesty lean run — plus 1 scoped tenancy round 2). One round on tenancy, well within the two-round bound.

**Gate intensity note.** Compliance and learning-honesty, both lean-eligible under `Gate intensity: lean`, merged into one reviewer run this time (unlike slice 4, which had only one lean-eligible path and so ran compliance solo) — each still rendered its own separate verdict against its skill's checklist, pinned verbatim.

## Findings and fixes

Both round-1 tenancy findings were Medium/High-severity CHANGEs, fixed in this build lane, then confirmed by a scoped tenancy round-2 re-run (not a full re-review):

1. **A schema comment overstating referential integrity.** `brainActivationSnapshots`' docblock claimed a bare FK to `brain_docs.id` "is real referential integrity" — no such FK exists in the migration. Adding one was considered and rejected (it would race the table's own profile-scoped cascade: `cascade` would wrongly delete the whole four-kind snapshot row over just one kind's doc going away; `set null` adds an untested second delete path for no benefit this table needs today, since `brain_docs` is never deleted except by the same cascade this table already participates in). Fixed by correcting the comment to state plainly what actually holds — tenancy proved by the writer, no DB-level referential-integrity backstop — rather than by adding a live but hazardous FK.
2. **A real creator-facing dead end, found independently by three reviewers.** A creator whose only answer for a target (e.g., "no banned words," a decided-empty list) got no document — correct, since `writeBrainDoc`'s own REQ-B02 refusal for "nothing at all is cited" would otherwise abort the whole atomic submission — but `/brain` then rendered the identical "Nothing drafted yet… Complete the interview" copy a creator who never started the interview sees, with no way to tell the two apart and no way to resubmit (R11 permanently bars it). Fixed: `/brain` now reads the submitted interview draft as a courtesy (failure never blocks the page) and, when a target was genuinely answered but produced no document, shows a distinct, honest sentence ("You answered this part of the interview and told us there was nothing to add… That's recorded as your answer, not lost.") instead of telling them to go complete something they already did. Four new tests prove the two copies never cross-contaminate between targets or leak into voice's unrelated empty state.

This same vacuous-document interaction also produced a genuine near-miss earlier in the build: an initial "fix" attempt (gate document creation on "was any field touched" rather than "did it produce a citation") was tried, found to make things worse — it would let a fully vacuous document reach `writeBrainDoc`'s refusal from inside the atomic transaction, crashing the whole submission including any real sibling answers — and was reverted with the reasoning permanently documented in `interview-ops.ts`'s header so it isn't tried again.

## Entry gate

Final run, CI shape, Docker live, `TEST_DATABASE_URL` set: typecheck clean, lint clean, `db:check` clean, **1521/1522 passed, 0 skipped**. The one failure is the pre-existing `(marketing)/for/[audience]` gap, confirmed unrelated across every slice this session.

## Self-found defects (not from the reviewer gates)

- **A missing advisory lock**, found by this slice's own independent mutation-planting pass (not the original author): `saveInterviewDraft` was the one brain-affecting write in `interview-ops.ts` with no `pg_advisory_xact_lock` on `brain:{workspace}:{profile}`, while every sibling write takes it first. Fixed and proven on real Postgres (`interview-ops.docker.test.ts`, verified as a genuine witness by reverting the lock and confirming the test reddens with a real unique-constraint race, then restoring it and confirming green).
- **A live-browser-only defect**: the vacuous-document/REQ-B02 interaction above was surfaced first by a real browser walk, not by any of the 1,500+ green tests — this project's recurring pattern (slices 2b/3/4 each found something similar).

## Deferred / residual

| Item | State |
|---|---|
| Mutation matrix M1-M6 | Planted and reverted by an independent agent this session; all six reddened as predicted (M2/M6 adapted to match the real implementation rather than the card's literal wording, with reasoning recorded). |
| B04's real Ideation handoff | Correctly out of scope — owned by slice 7, honestly named as absent here. |
| `getInterviewDraft`'s own cross-workspace test | Not written directly (the mechanism is proven by every sibling accessor's identical pattern and `saveInterviewDraft`/`submitInterview`'s own cross-workspace tests) — noted by the tenancy reviewer as a low-risk coverage gap, not fixed this slice. |

## Definition of Done

- All of phase-3b.md's R1-R13 built and tested; Tasks 1-7 complete.
- All four applicable Critical-Path gates PASS.
- Docs updated in the same change: this card, the ledger, the master plan's progress row.
- Reachability: `/onboarding/interview` and `/brain` are real routes behind `requireUser()`, proven by `gate-completeness.test.ts` and a live browser walk end to end.
