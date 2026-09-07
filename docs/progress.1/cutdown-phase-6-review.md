# Phase 6 review — cutdown (end-to-end proving run + implementation-complete handover)

**Date:** 2026-08-02 · **Mode:** single-driver `/implement` under `/go` full automation · **Verdict: Ready** · **`PIPELINE_IMPLEMENTATION_COMPLETE` EARNED**

Primary evidence: `cutdown/docs/proving-run-placeholder.md` (the full chain record, kill-resume evidence, cost table, verbatim before/after `status --phase0`), `cutdown/docs/proving-run-real.md` (BLOCKED-ON-D-27/D-36), `cutdown/data/golden-sets/e2e/` (the standing e2e fixture), `docs/progress/cutdown/ledger.md` (2026-08-02 entries).

## Acceptance criteria (phase plan, row by row)

| Criterion | Verdict | Evidence |
|---|---|---|
| A complete ContentPackage through the skills-only public surface and runner-owned QA, acyclic approval/package lineage | **PASS** | Package `01KZ0A62WTAXFAYS9M1WK6PRKM`: `releaseState: rights_approved`, `sourceClassification: fixture`, QA `pass_with_waivers` / 0 blockers, rights weakest `cleared`, range validation `ran` (3 ranges), approval decision `01KZ09V3Q9DSQD80VTYXMCVJ1J` named. Every stage driven via request-file + `cutdown skills run` per the generated mirrors; QA ran inside `render` and was enforced by the runner's transition gate (never a `/cutdown-qa` skill). Promoted copy: `cutdown/data/golden-sets/e2e/job/packages/…` |
| Kill-resume at job level proven twice with no LLM-stage re-execution | **PASS** | Kill 1: index killed mid-OCR; resume served transcript/shots/scenes from checkpoint (`cacheHit=true`, 0/14/32 ms). Kill 2: final render killed mid-encode (structured `FfmpegError`, no result file); `cutdown run` resumed **advanced 0** with the gate refusing the orphaned render fail-closed (`QA_REPORT_UNREADABLE`); recovery re-render, then the runner advanced exactly one step (package). Run log (promoted with the golden set) shows no propose/plan/validate invocation after any kill |
| Cost table with per-stage numbers and a ceiling comparison | **PASS** | Proving-run doc §3: per-stage wall-clock from run-log `durationMs`; **AUD 0.00 live spend** (recorded replay + local models) vs the unset D-21 ceiling; CPU ASR throughput noted for D-17 (not approached) |
| `status --phase0` pasted with the two D-38 milestones independently correct | **PASS** | Proving-run doc §6, verbatim before/after: `PIPELINE_IMPLEMENTATION_COMPLETE` not-earned → **EARNED**; `PHASE_0_EXIT_EARNED` red in both; fixture package excluded from real counts; warning-waived counted separately |
| Real-footage task done or explicitly BLOCKED-ON-D-27 — no third state | **PASS** | `cutdown/docs/proving-run-real.md`: **BLOCKED-ON-D-27/D-36**, with the exact command sequence for when inputs arrive |

Functional/technical checklist rows: PRD §15 machinery demonstrated end to end (above); REQ-034/REQ-106 spot-checked on the fixture package (proving-run doc §7) with the real-footage repeat recorded as blocked; developer-guide §4 cadence exercised (this review + ledger + master-plan row are the status report); pipeline drivable from Claude Code via `/cutdown-*` alone (tech-spec §1 Stage A claim proven, including a conversational mirror round-trip in Phase 5 and request-file driving here); cost accounting visible (run-log `durationMs` + status counts).

## Gates

- **Entry gate (final whole-workspace run): GREEN.** `build:contracts --check` PASS; `validate:contracts` PASS (40 cases, 0 lint, 0 cross-validator disagreements); `skills sync --check` PASS (10 skills); `pnpm -r test` exit 0 — **822 TS tests / 0 fail** (2 documented Windows skips; Phase 5 baseline 811); Python **644 passed / 0 fail**; ruff clean under cutdown's own config; UGC schemas parse; boundary confined to `cutdown/`, `docs/`, `.claude/skills/cutdown-*`.
- **Reviewer gate: `code-reviewer`, two rounds.** Round 1: **NEEDS CHANGES** — 3 must-fix (an exclusivity docstring the code didn't enforce — the project's own "a comment claiming a property is not the property" lesson; the master-plan row citing this then-unwritten review file; a doc citation to status outputs not yet pasted) + 5 optional. All three fixed: exclusivity now enforced and tested (both-keys and non-array-values refused; 12/12 tests incl. empty-array semantics), the verbatim before/after `status --phase0` blocks pasted, this file written. Round 2: verification of the three fixes — see Review Log in the master plan/ledger.
- **Critical-Path table:** cutdown touches none of the four UGC paths (tech-spec §14); the generic reviewer applied — never zero reviewers.

## What phase 6 changed (beyond artefacts and docs)

One code change, found by the proving run and fixed at the cause (**D-51**): `render --audio-events` demanded an output-relative `{events}` file while the only producer in the pipeline (`index`) writes `{audioEvents}` in source ticks — REQ-104 was dead end-to-end. New pure module `skills/render/src/audio-events.ts` accepts both shapes (exclusively — a document carrying both is refused), filters non-meaningful kinds (speech, silence) on the artefact path only (asymmetry documented), and projects source ticks through the EDL clips onto the output timeline; 12 unit tests. Plus: `cutdown/ruff.toml` (stops the repo-root UGC lint config leaking into the self-rooted workspace; the one real finding it surfaced — an unused import — fixed), and the new e2e golden set (27 s `promo-take.mp4` + 140 promoted job artefacts, 2.3 MB).

## What the run taught (recorded in ledger / decisions / developer-guide §7)

The D-37 and QA gates blocked four authoring mistakes of this session's own making (platform duration floor; a Moment-graph `requires_setup` dependency created by the ASR's anaphoric "Then…"; two caption overflows against the D-48 geometric wrap) — the gates verified live, on the happy path, against their author. QA warning semantics confirmed: an unwaived warning fails the gate; waivers are plan-scoped, so draft and final tiers need separate named records. Engine facts: whisper transcribes flite imperfectly ("take"→"tape") and quote fidelity correctly binds captions to the ASR verbatim; the silence-gap heuristic gives each utterance its own low-confidence speaker; 5 s single-utterance fixtures sit below the REQ-036 footage floor (hence the new e2e fixture).

## Deviations & residuals (none silent)

1. **The fixture approval is delegated.** The ReviewDecision and both waivers name "Fred Wang (owner; … recorded under the /go full-automation instruction, 2026-08-02)" — recorded by this session under the owner's standing instruction, on fixture footage only, and saying so on their face. The real-footage job requires a human who actually watched the cut (D-9); that path is BLOCKED-ON-D-27 and untouched.
2. **`PHASE_3_ACCEPTED_LIVE` remains BLOCKED-ON-D-21/D-27** (owner: ceiling, API key, real footage). Unchanged by this phase; reported independently.
3. **Prior phases' "ruff clean" claims were vacuous for cutdown Python** — no cutdown ruff config existed, and the repo root's UGC config governed silently (185 style findings under a foreign standard, 0 defects). Now pinned explicitly in `cutdown/ruff.toml`; widening the selection is a deliberate later decision.
4. **Kill drills note:** the index kill landed mid-OCR as planned; the render kill landed on the *waived final* attempt (renders are ~8 s, so the first two kill attempts lost the race and those invocations completed normally). The drill's substance — a crash mid-render, an orphaned render directory, fail-closed refusal, recovery without LLM re-execution — is fully evidenced.
5. Reviewer round-1 optional notes not taken: `Number.isInteger` tightening on tick fields (nitpick; producer writes integers) and the one vanity request-id containing a non-Crockford character in the promoted historical record (renaming would falsify the run record).

## Definition of Done

Entry gate green (above) · reviewer gate run to verification · `PIPELINE_IMPLEMENTATION_COMPLETE` earned and reported separately from the honestly-red `PHASE_0_EXIT_EARNED` · proving-run docs written · decisions D-51 appended · developer-guide §7 addendum · master-plan row 6 updated · ledger appended throughout. Docs consistency: D-51 ↔ `audio-events.ts` ↔ developer-guide §7 ↔ this review agree on the one behavior change.
