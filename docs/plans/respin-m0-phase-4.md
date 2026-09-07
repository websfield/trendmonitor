# Phase 4 — Deploy config, env inventory, runbook, wrap-up

**Feature:** Respin M0 · **Depends on:** 3 · **Owner agent:** `respin-engineer`

## Project Conventions Pinned (READ FIRST)

- **Golden rules (CLAUDE.md, binding):** (2) no secrets — `.env.example` carries names and where-to-get-them, never values; (6) **report honestly** — engineering completion and evidence completion are separate claims (build-plan, verbatim); (8) scale caution to blast radius — nothing here pushes, deploys, or creates external resources; it prepares and documents them for the owner; (9) verify Vercel config schema (`vercel.json`, root-directory behavior for subdirectories, ignored-build-step) against current official docs, not memory.
- **R-15 (verbatim consequence):** "CI path-scopes to `respin/**`; Vercel's root-directory setting points at `respin/`."
- **Lesson 2026-08-10:** a diagnostic/report must distinguish present-and-verified from present-and-unrun — the M0 report card must never show a green for the credential-bound criteria.
- **Operability bar (operability-critic's lens, applied early):** a competent stranger — or the founder six months from now — must be able to stand up Neon/Clerk/Vercel from the runbook alone.
- **Available agents:** `respin-engineer` only. **Git:** commit only when asked.

## Requirements Checklist (functional)

- [ ] Vercel deploy config: `respin/vercel.json` (or documented dashboard settings where file config can't express them — verify which settings are file-expressible in current docs), including install/build commands for pnpm and an ignored-build-step so only `respin/**` changes deploy.
- [ ] `respin/.env.example`: exactly the Phase 3 env inventory (`DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ADMIN_CLERK_USER_IDS`) — count parity with Phase 3's handoff contract; each with a one-line "get it from…" pointer.
- [ ] `respin/README.md` owner runbook: Neon project + `DATABASE_URL`; Clerk app (email + Google) + keys; Vercel project (root dir `respin/`, env vars, preview deploys on PR); local dev (`pnpm install`, `db:migrate`, `db:seed` — **explicitly scoped to a local/dev database; the seed refuses non-local hosts without `RESPIN_SEED_FORCE=1`**, `dev`); how to run the M0 evidence checks (sign-up flow, preview deploy) and where to record them. Honest wording on Clerk-outage behavior per Phase 3's failure-modes row (no "fully fail closed" claim).
- [ ] CLAUDE.md Commands block gains the Respin entry-gate line(s) (`pnpm -C respin typecheck && lint && test && build`, `db:check`).
- [ ] M0 report: `docs/progress/respin-m0/ledger.md` closes with the engineering-vs-evidence table (master plan Exit Demonstration), evidence rows marked **pending owner execution**.

## Requirements Checklist (technical)

- [ ] No secret values in any committed file (grep for `sk_`, `pk_live`, `postgres://` with credentials — guardrails `secret-stripe-live-or-test-key`/`secret-anthropic-api-key` also watch).
- [ ] `vercel.json` schema-valid per current docs; ignored-build-step command is exact and tested locally as a shell expression.
- [ ] README claims nothing the code doesn't do (outbound-truth discipline — it's an internal doc but the same trace rule applies).

## Edge Cases & Failure Paths

- **Inverse events:** none (docs/config only). Removing the Vercel project later is an owner dashboard action, documented in the runbook's teardown note.
- **Double failure:** runbook step wrong AND owner blocked → every runbook step names its verification ("you should now see…"), so the failing step is identifiable; report card lists a contact point (re-run `/go` with the error).
- **Degraded mode:** owner defers account setup → M0 stays honestly split: engineering ✅ / evidence ⏳; nothing downstream (M1) is blocked from *planning*, but the build-plan's "accept when" for M0 stays open and is reported so.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Proof |
|---|---|---|---|---|
| Vercel docs vs config | config key invalid/renamed | schema-verify against current docs before writing; where uncertain, dashboard-setting documented instead of guessed file config | golden rule 9 | AC-2 |
| Owner execution | evidence steps not run | report card shows pending, never green | owner runs runbook; next `/go` verifies | AC-5 |

## Handoff Contracts

- **To M1:** the runbook + `.env.example` are M1's starting environment contract; the ledger's engineering-vs-evidence table is the ground truth the next session's `/go` reads to decide whether M0 evidence must be closed first.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | Vercel config + ignored-build-step (verified against current docs) | respin-engineer | `respin/vercel.json` |
| 2 | `.env.example` (count-parity with Phase 3 inventory) | respin-engineer | `respin/.env.example` |
| 3 | Owner runbook README | respin-engineer | `respin/README.md` |
| 4 | CLAUDE.md Commands update | respin-engineer | `CLAUDE.md` |
| 5 | Close the ledger with the engineering-vs-evidence table | respin-engineer | `docs/progress/respin-m0/ledger.md` |

## Files to Create / Modify

New: `respin/vercel.json`, `respin/.env.example`, `respin/README.md`. Modified: `CLAUDE.md` (Commands block only), `docs/progress/respin-m0/ledger.md` (append).

## Migration Steps

None.

## Verification Steps (command · state · established by)

1. `pnpm -C respin typecheck && pnpm -C respin lint && pnpm -C respin test && pnpm -C respin build` · Phases 1–3 green · dependency gate.
2. Secret grep across `respin/` and the diff (`sk_live|sk_test|pk_live|whsec|postgres(ql)?://[^/]*:[^@]*@`) → no hits · tasks 1–3.
3. Env count parity: names in `.env.example` == Phase 3 handoff inventory (4/4) · task 2.
4. Paper-walk the runbook as a stranger: every step names its own success check · task 3.
5. Repo entry gate incl. the new CLAUDE.md commands: respin commands pass; UGC/Cutdown suites show no new failures · task 4.

## Acceptance Criteria (PASS/FAIL, evidence)

- AC-1: All four respin commands + `db:check` green (output).
- AC-2: `vercel.json` keys each traceable to current Vercel docs (citation list in the PR/ledger note).
- AC-3: Secret grep clean (command + empty output).
- AC-4: `.env.example` has exactly the 4 Phase-3 vars with source pointers (file).
- AC-5: Ledger closes with the split table; every credential-bound criterion marked pending (file).
- AC-6: CLAUDE.md Commands block updated; schemas-parse entry gate still listed and green (diff + run).

## Least confident (one line)

Whether Vercel's monorepo subdirectory deploy (root directory `respin/` + pnpm workspace + ignored-build-step) is fully expressible in committed config versus needing documented dashboard settings — resolve from current Vercel docs at build time and write down whichever is true, not the hoped-for version.

## Out of Scope (Surgical)

No deploys, no external account creation, no pushes/commits without explicit consent. No marketing copy (M6). No edits beyond the five listed files.

## Completion Criteria (Definition of Done)

Entry gate clean; tenancy gate PASS on the M0 surface (run at review); docs consistent (CLAUDE.md + runbook match reality); all ACs pass; the M0 report card presents engineering vs evidence separately.
