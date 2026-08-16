# Phase 4 — UI (usage, billing settings, admin config), accessor extension, runbook, engineering-vs-evidence report

**Feature:** respin-m1 · **Master plan:** `docs/plans/respin-m1-master-plan.md` · **Depends on:** 3

## Project Conventions Pinned (READ FIRST)

**Golden rules (CLAUDE.md, verbatim):**
1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.**
6. **Report honestly.** "Done" is a claim the checks have to back — engineering and evidence completion are separate claims.
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.**

**Respin non-negotiables that bind this phase (verbatim):**
- **2. The ledger is the balance.** The usage page renders the derived balance — never a stored counter, never its own derivation (single authority, Phase 2).
- **5. No leakage.** Every page reads through `withWorkspace`; the admin surface is `requireAdmin`-gated.
- **6. No invented specifics, no guarantees.** The usage page shows only real numbers; empty states say *why* they're empty (burn-by-mode names M3), never fabricate.

**Billing skill rules (verbatim headlines):** B4 — the cancel flow **always offers pause first** (REQ-G08). B5 — config editable from admin without deploy; every change a new version. B6 — tier gates/prices from config; only owners touch billing. B7 — money paths were integration-tested in Phases 2–3 **before** this UI phase (the ordering is the rule).

**Lessons:** 2026-07-30 (a claimed property is asserted in a test or deleted); 2026-08-02 (know which config produced green); 2026-08-10 (present-and-verified vs present-and-unrun — the gate-completeness test must actually see the new pages).

**Stack & boundaries:** server components + server actions; `app/` imports `packages/` only; pages under `(product)` are gated by `requireUser` **per page** (gate-completeness test enumerates them — new pages must join it, that's AC-1); `(admin)` by `requireAdmin`. Styling: match the existing minimal inline style of the M0 shell — no UI framework enters at M1.

**Agents:** implementer is `respin-engineer`. Do NOT request agents not in `.claude/agents/`.

## Requirements Checklist (functional)

- REQ-G07 (Should — the M1 slice): usage page shows current balance, ledger history (kind, delta, expiry, ref, date), this-month burn by mode (honest empty state until M3), days-to-empty (honest "not enough data" until burn exists), and invoices **via the Customer Portal link** (the lean slice — full in-page invoice list deferred with the brain-as-asset panel, receiver M2+/M6, named on the page as a slot comment).
- REQ-G01/G03/G08 (UI half): billing settings page — current tier + state (from `getWorkspaceBillingState`); **subscribe buttons render only for workspaces with no live subscription — an already-subscribed workspace gets "manage/upgrade in the Customer Portal" instead** (the UI face of Phase 3's `AlreadySubscribedError`, plan-review F1); pack purchase button, portal link, auto-top-up opt-in + cap form, pause flow (bounds from config `pauseMonths`), resume, and the cancel path that **offers pause first** before linking to portal cancellation.
- REQ-G05/J01 (config slice): `/admin/config` — view active version + content, edit → append new version (Zod-validated server-side), version history list.
- REQ-A02: billing mutations owner-only — UI hides for non-owners AND the underlying actions already throw (Phase 3); both asserted.

## Requirements Checklist (technical)

- New `withWorkspace` accessors: `subscription()`, `ledger(page)` — added with breach validators in the same change (the AC-7 completeness suite fails otherwise, by design). Balance/state come from `packages/credits` functions taking `scope.workspaceId` (the `VerifiedWorkspaceId` brand — no accessor needed).
- Server actions and pages import ONLY the wired facades (`@respin/credits/app-server`, `@respin/config/app-server` — Phase 3 task 8b), the `respinDb` facade, and `@respin/auth`; no Stripe, raw-table, or `getServerDb` access in `app/` (lint-enforced; fixtures already prove it).
- Keyless behavior: pages render without `STRIPE_*` env (buttons degrade to a disabled state naming the missing configuration — dev-honest, never a crash).

## Edge Cases & Failure Paths

- Zero-balance user opens usage page → balance 0, prompt to top up (REQ-G03's "clear prompt" lands here).
- Paused workspace → settings shows paused state + resume; usage shows frozen notice with resume date; (product) pages remain readable (read-only access per REQ-G08 — M1 has no write surfaces beyond billing, so read-only = normal render + debit refusal already enforced in Phase 2).
- Free workspace (no subscriptions row) → settings renders subscribe options, no portal link (no customer yet — portal requires a customer; create-on-checkout only, D-M1-6).
- `stripePriceMap` empty (fresh install, setup script not run) → subscribe buttons disabled with the exact remedy named (run `stripe:setup`, paste ids into admin config) — the refusal's printed remedy must be an action the operator may actually take (Lesson 2026-07-30 fail-closed-with-a-way-forward).
- Config editor submits invalid JSON / valid JSON failing Zod → rejected with field-level error, no version appended.
- Non-owner visits settings → read-only view, no mutation controls; direct action invocation still throws (matrix test exists in Phase 3; UI-level assertion here).
- Admin visits config while `config_versions` empty → shows "no active config" + seed remedy, never a crash.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Proof |
|---|---|---|---|---|
| Stripe (checkout/portal from server action) | API error | typed error rendered inline; no state written | retry | Phase 3 tests + UI error-path render test |
| Config read on pages | unavailable | settings/usage render with disabled billing controls + remedy; never default prices | fix config | component test |
| Balance derivation | throws | page-level error boundary, honest message | investigate | render test |

## Handoff Contracts

**From Phase 3 (consumed verbatim):** the six `actions.ts` functions, `getWorkspaceBillingState`, `deriveBalance`, `getActiveConfig`/`appendConfigVersion`.
**To M2/M3 (pinned):** usage page leaves named slots (code comments citing REQ-G07/M2 brain-as-asset, M3 burn-by-mode); the gate-completeness pattern for adding `(product)` pages is the template the M2 pages follow.

## Implementation Tasks

| # | Task | Owner agent | File(s) |
|---|---|---|---|
| 1 | Extend `withWorkspace` accessors (`subscription`, `ledger`) + breach validators (completeness suite) | respin-engineer | `packages/db/src/with-workspace.ts`, `packages/db/tests/with-workspace.test.ts` |
| 2 | Usage page (server component): balance, ledger table, honest empty states, portal link, top-up prompt at zero | respin-engineer | `app/(product)/usage/page.tsx` |
| 3 | Billing settings page + server actions: tier/state, subscribe buttons, pack button, auto-top-up form, pause/resume, cancel-offers-pause-first interstitial | respin-engineer | `app/(product)/settings/billing/page.tsx`, `app/(product)/settings/billing/actions.ts` |
| 4 | Admin config editor + action (append-version, Zod server-side) + history | respin-engineer | `app/(admin)/admin/config/page.tsx`, `.../actions.ts` |
| 5 | Gate-completeness: new product pages carry `requireUser` and join the completeness fixture; admin page carries `requireAdmin` | respin-engineer | new pages, `respin/tests/gate-completeness.test.ts` |
| 6 | Component/render tests: every edge-case bullet above has a named test (vitest, RSC render or extracted pure helpers — match the M0 testing style) | respin-engineer | `respin/tests/billing-ui.test.ts` (or colocated) |
| 7 | README owner runbook: Stripe test-mode setup (account, keys → `.env.local`, `stripe:setup`, paste price map into `/admin/config`, `stripe listen --forward-to localhost:3000/api/stripe/webhook`), then the evidence checklist mirroring build-plan accept-when (subscribe $10 → 250 credits → pack → ledger → pause → resume), each step with its success check | respin-engineer | `respin/README.md`, `respin/env.example` (STRIPE_* rows) |
| 8 | Engineering-vs-evidence table + least-confident line appended to the M1 ledger; master-plan Progress Tracking updated | respin-engineer | `docs/progress/respin-m1/ledger.md`, master plan |
| 9 | CLAUDE.md Commands: add the concurrency-suite invocation to the Respin entry-gate line (it exists from Phase 1 — this phase makes the contract file honest about it); **mandatory** tech-spec sync: §5's consumption-order wording → D-M1-8, §2's naive-sum wording → D-M1-7 (both cite R-20; plan-review F8 — this is not conditional); consistency pass over README/env.example for anything else this milestone changed | respin-engineer | `CLAUDE.md`, `docs/initial/tech-spec.md` |

## Files to Create / Modify

Create: `app/(product)/usage/page.tsx` · `app/(product)/settings/billing/{page.tsx,actions.ts}` · `app/(admin)/admin/config/{page.tsx,actions.ts}` · `respin/tests/billing-ui.test.ts`.
Modify: `packages/db/src/with-workspace.ts` + its test · `respin/tests/gate-completeness.test.ts` · `respin/README.md` · `respin/env.example` · `docs/progress/respin-m1/ledger.md` · master plan · `CLAUDE.md` · (conditionally) `docs/initial/tech-spec.md`.

## Migration Steps

None.

## Verification Steps (paper-dry-run)

1. `pnpm -C respin typecheck` — tasks 1–5.
2. `pnpm -C respin test` — tasks 1, 5, 6 (all suites incl. completeness; Docker suites loud-skip locally).
3. `pnpm -C respin lint` — default-deny + `trustWorkspaceId` rules still green over the new pages.
4. `pnpm -C respin build` — keyless; new pages compile with no `STRIPE_*` env.
5. Manual keyless dev run: `/usage` and `/settings/billing` render for the seeded dev user with disabled-billing degraded states (screenshot into the ledger).
6. Full entry gate (CLAUDE.md Commands) — no new failures repo-wide.

## Acceptance Criteria (PASS/FAIL, with evidence)

- AC-1: `respin/tests/gate-completeness.test.ts` enumerates `usage` and `settings/billing` under the product gate and `admin/config` under the admin gate (fixture entries named in the test file).
- AC-2: every new accessor has a breach validator (completeness assertion green — the suite fails structurally if not).
- AC-3: every Edge-Case bullet has a named render/component test; the cancel path provably renders the pause offer before any cancel link (test asserts DOM order/flow).
- AC-4: config editor appends (never mutates) — after an edit, version count +1 and the old row is byte-identical (test).
- AC-5: keyless renders of usage + settings show the degraded states with remedies (screenshot or render-test snapshot in ledger).
- AC-6: README runbook steps each carry a success check; env.example gains `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` rows with comments.
- AC-7: engineering-vs-evidence table in the ledger separates every accept-when row into ENGINEERING ✅ (test names) vs EVIDENCE ⏳ (runbook step) — no evidence row claimed from fixtures.
- AC-8: the full respin chain (`typecheck`/`lint`/`test`/`build` + `db:check`) and every CLAUDE.md Commands-block entry pass with no new failures vs the recorded green baseline (command outputs in the ledger's engineering-vs-evidence entry).

## Least confident (one line)

Rendering "read-only while paused" honestly at M1 when the only writable surfaces are billing ones — the risk is a paused workspace whose UI *claims* read-only while some future M2 surface forgets the check; mitigation is asserting the check lives in `getWorkspaceBillingState` consumers by contract (comment + test), but the enforcement point for not-yet-built pages is necessarily a convention, not a test, until M2.

## Out of Scope (Surgical Changes)

No new UI framework/deps; no margin dashboard; no admin lookup/adjustments UI (M6); no email; no `src/`, `cutdown/`; no changes to Stripe handlers beyond what UI wiring strictly requires (none expected).

## Completion Criteria (Definition of Done)

Entry gate clean (or no new failures vs baseline); ACs green; docs consistent (CLAUDE.md Commands, README, env.example, tech-spec citations); billing + tenancy gates run at phase review; report card written.
