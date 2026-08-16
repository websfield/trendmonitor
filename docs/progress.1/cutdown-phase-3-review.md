# Phase Review — cutdown Phase 3 (Editorial Skills, QA Gates, Style, Local Runner)

**Feature:** cutdown · **Phase:** 3 · **Date:** 2026-07-28 · **Verdict: Ready** (implementation-complete)

Phase 3 is **implementation-complete and gated**. `PHASE_3_IMPLEMENTATION_COMPLETE` is earned; `PHASE_3_ACCEPTED_LIVE` is explicitly **BLOCKED-ON-D-21/D-27** (owner spend ceiling + real footage), never ambiguously "complete" (D-38).

## Report card

| Gate | Grade | Evidence |
|---|---|---|
| Entry gate | **PASS** | `build:contracts --check` current; `validate:contracts` 23 cases / 0 lint / 0 cross-validator disagreements; whole-graph `pnpm build` EXIT 0; **416 TS tests + 644 Python tests, 0 fail** (Node-24 glob form per D-44; +3 embed_query vs Phase 2's 641) |
| `code-reviewer` (Critical-Path: cutdown all-No table → generic code-reviewer) | **PASS · Grade A** | 0 must-fix; 3 optional notes. Verified D-37 separation airtight, key hygiene + one-repair-retry hold, retrieval + gates fail closed, runner is a provably lossless projection |
| Acceptance criteria | **PASS** | see below |
| Definition of Done | **PASS** | entry gate green · code-reviewer PASS · impl-complete green · accepted-live honestly BLOCKED · decisions appended |

## Acceptance criteria (phase plan)

- **`PHASE_3_IMPLEMENTATION_COMPLETE`** ✅ — recorded model-fixture suites pass (propose 4 / plan 3 / validate 5); REQ-036 weak-footage refusal is a distinct tagged-union output arm (never a fabricated brief); D-37 deterministic blockers proven by the qa suite (21 tests) breaking each rule — reordered quote (`QUOTE_NOT_SUBSEQUENCE_OF_VERBATIM`), quote-not-in-moment, speaker misattribution, prohibited claim, missing proof evidence, `requires_setup` context loss, unknown rights, missing paid-partnership disclosure, out-of-bounds range, capability overrun, schema-invalid fail-closed; the advisory critic never changes `gateStatus` (3 D-37 separation tests); runner recovery passes (advance / resume-without-re-running-completed / delete-index.db-then-rebuild / structured-error→blocked).
- **`PHASE_3_ACCEPTED_LIVE`** ⛔ **BLOCKED-ON-D-21/D-27** — no owner-set spend ceiling (D-21) and no real footage (D-27); the live editorial chain (propose→plan→validate against a real indexed job) cannot be exercised. Reported honestly; `cutdown test:models --live` skips cleanly with no job.
- **Every editorial artefact records model ID + prompt-template version** ✅ — `modelProvenance` is a required field on `creative-brief-v1`, `master-story-plan-v1`, `platform-edl-v1`.
- **Runner survives kill + `index.db` deletion with zero state loss** ✅ — `workflows/local/tests/runner.test.ts`: resume-after-restart + delete-index.db-then-`rebuild-index` reconstruct identically from `run-log.jsonl` (the authoritative record; `index.db` is a pure disposable projection).

## What shipped

- **Contracts:** `creative-brief-v1`, `master-story-plan-v1`, `platform-edl-v1`, `style-profile-v1` + shared `common/model-provenance-v1` + enums `aspect-treatment` (no centre_crop member — REQ-052) / `audio-mode` (REQ-056); valid+invalid fixtures; both generated language trees regenerated & committed.
- **`packages/editorial`:** model gateway (Anthropic over stdlib, key hygiene, D-32 one-retry, D-21 dual-gate), deterministic brief resolver, brute-force cosine retrieval (D-22) + Python `embed_query.py` query entrypoint, angle generator + distinctness, story-plan / platform-adapt / edl-resolve (reuses the single `checkSourceRange`).
- **`packages/qa`:** `editorial-checks.ts` (quote fidelity, prohibited claims, required evidence/context, rights, disclosures) + `editorial-gates.ts` orchestrator (D-37: blockers vs critic-advisories, structurally separated).
- **Skills:** `propose` (briefs | refusal | skipped), `plan` (story plan + platform EDL + deterministic range resolution), `validate` (two persisted outputs — deterministic gate + advisory critic); recorded-model fixtures; CLI `propose`/`plan`/`validate`/`test:skills`/`test:models`.
- **`data/platform-capabilities/tiktok-organic-au-fixture.yaml`** (PRD §11 verbatim + D-3 duration pin).
- **`packages/style`** resolver + 2 committed placeholder profiles (D-26, `approval: null` drafts).
- **`workflows/local`** durable runner (REQ-152 state machine, resume, `blocked` on structured error, `rebuild-index`) + CLI `run`/`rebuild-index`.

## Decisions appended
- **D-44** — Node 24.18.0 drift (past D-39's `<23` pin): the house `node --test dist/tests/` directory script form throws a loader error on Node 24; entry-gate tests run via the glob form; deliberate toolchain-bump follow-up flagged for the owner.
- **D-45** — `better-sqlite3` (D-11) has no Node-24 prebuilt ABI and its node-gyp source build fails; fell back to built-in `node:sqlite` (a toolchain fallback, every D-11 property preserved).

## Optional notes (from code-reviewer — not blockers)
1. **Quote gate is order-preserving-subsequence, not negation-aware** — `"we are happy"` is a valid subsequence of `"we are not happy"`, so a meaning-inverting *omission* passes. Consistent with the documented D-37 rule ("token order"); recorded for the **D-37 promotion backlog** (a negation/antonym-aware rule needs a measured false-positive rate before it can become a deterministic block).
2. **`cutdown run` exits 0 on a `blocked` job** — fine for an operator reading stdout, documented in-code, and `blocked` is recoverable; a wrapper script must parse the printed `status:` line rather than the exit code. Judgement call, left as-is.
3. **Gateway `firstText` throws outside the repair loop** — a degenerate provider envelope with no text block hard-fails without the one D-32 retry; errs fail-closed (a throw, never a coerced result), so safe.

## Residuals
- **DR (live):** `PHASE_3_ACCEPTED_LIVE` awaits D-21 (owner spend ceiling) + D-27 (real footage) — owner action.
- **Env follow-up (D-44):** a deliberate workspace-wide toolchain bump (`.tool-versions`/`engines` + migrate every `package.json` `test` script to a Node-24-native form) — deferred out of this phase to avoid churning Phase 1/2 files.
