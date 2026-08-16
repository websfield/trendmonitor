# Codebase review — respin-m1 (Billing and the Credit Ledger)

Date: 2026-08-14. Author: /create-plan Step 3. Brief: `docs/plans/respin-m1-brief.md`.

## Requirement IDs satisfied

- **REQ-G01** — four tiers via Stripe, self-serve via Customer Portal (`docs/initial/PRD.md` §4G)
- **REQ-G02** — credit system, monthly reset on billing anniversary, 1-month rollover via grant expiry
- **REQ-G03** — overage packs ($10/1,000, 12-month validity, consumed after monthly), auto-top-up with monthly cap, blocked-at-zero prompt
- **REQ-G04** — append-only `credit_ledger`, derived balance
- **REQ-G05** — costs/allowances in versioned config, editable without deploy (margin *dashboard rollup UI* is M6; M1 ships config + the recording that feeds it)
- **REQ-G06** — webhook-driven billing state, idempotent on Stripe event ids, 7-day grace then downgrade
- **REQ-G07 [Should]** — usage page (balance, burn, invoices; brain-as-asset view deferred to M2+ since brains don't exist)
- **REQ-G08** — pause instead of cancel (pause_collection, credits frozen, expiry clocks suspended, cancel offers pause first; win-back email deferred — no email provider until M6, same SHORTCUT as password reset)
- Partial: **REQ-A02** (only owners touch billing — role check on billing actions), **REQ-J01** (config editor slice of admin only)

## Roadmap fit and shipped dependencies

M1 per `docs/initial/build-plan.md` (after M0 as amended by R-18/R-19). Dependencies, each proven shipped:

| Dependency | Proof |
|---|---|
| M0 skeleton, CI, entry gate | `docs/progress/respin-m0/ledger.md` (M0 complete 2026-08-14; entry gate PASS full repo) |
| Auth swap (Better Auth, own Postgres) | ledger 2026-08-14 "auth swap code gate FINAL … PASS (Ready, A)"; Exit Demonstration executed live same day |
| `users`/`workspaces`/`memberships` schema + migration 0000 | `respin/packages/db/migrations/0000_sparkling_maddog.sql`; 7 tables verified in Docker DB |
| `withWorkspace` verify-then-scope helper + enumerable accessor map | `respin/packages/db/src/with-workspace.ts` (AC-7 completeness suite) |
| `ensureUserWorkspace` transactional bootstrap | `respin/packages/db/src/bootstrap.ts` |
| Local Docker Postgres (dev + concurrency-test target) | `respin/docker-compose.yml`; `respin-postgres` healthy on 5435 |
| PGlite test harness (R-17) | `respin/packages/db/src/testing.ts`, 55/55 tests green |

**Not shipped, not depended on:** generations (M3 — debits get synthetic refs in tests), brains (M2), Inngest/any job runner (R-18 left the runner open; M1 avoids needing one — see plan decision D-M1-4), email provider (M6).

## Modules touched and entity ownership

| New entity | Owner |
|---|---|
| `subscriptions` (workspace 1:1 Stripe mirror + pause state) | `packages/db` schema; written only by `packages/credits` webhook/billing ops |
| `credit_ledger` | `packages/db` schema; **sole writer: `packages/credits`** |
| `stripe_events` (processed-event idempotency) | `packages/db` schema; sole writer: webhook handler via `packages/credits` |
| `config_versions` (append-only runtime config) | `packages/db` schema; read via `packages/config`; written by admin route via `packages/config` |
| `packages/credits` (new) | ledger ops, balance derivation (single authority), Stripe adapter + webhook dispatch |
| `packages/config` (new) | versioned config read/write API, Zod-validated shape |
| `app/api/stripe/webhook` (new) | thin route → `packages/credits` handler |
| `app/(product)/usage`, `app/(product)/settings/billing` (new) | usage + billing UI |
| `app/(admin)/admin/config` (new) | config editor |

## Cross-boundary reach

- `app/` routes reach the ledger/subscription **only through `withWorkspace` accessors** *(resolved in planning as: accessors `subscription` + `ledger` with breach validators; balance/state flow through `packages/credits` functions taking the `VerifiedWorkspaceId` brand, via wired app-server facades — Phase 3 task 8b)* — the AC-7 completeness suite forces a breach validator per new accessor.
- The webhook route is the one **unauthenticated-by-session** entry: it authenticates by Stripe signature instead and never goes through `withWorkspace` (no session exists). *(Superseded during planning: D-M1-6 makes the stored customer→workspace mapping the SOLE resolution authority — metadata is a cross-check only, mismatch ⇒ refusal.)* It must live behind the `packages/credits` API, not raw table access.
- `packages/credits` → `packages/db` (schema + client): follows the `packages/auth` precedent (packages may hold the connection; `app/` may not).
- No reach into `src/` or `cutdown/`. No FK from domain tables into Better Auth tables **except** the M1-entry obligation: `users.auth_user_id` → FK to auth `user.id` (auth-swap Deferral Ledger; the auth `user` table is adapter-owned but schema-mirrored in `packages/db/src/auth-schema.ts`, so the FK is expressible in our migration).

## Critical-Path triggers (CLAUDE.md table)

| Path | Trigger | Reviewer |
|---|---|---|
| **Respin billing & credits** | the entire milestone | `respin-billing-reviewer` |
| **Respin brain tenancy** | new workspace-scoped tables + accessor-map extension; `users.auth_user_id` FK; bootstrap email guard; admin surface extension; workspace resolution from Stripe metadata (a non-session identity path) | `respin-tenancy-reviewer` |
| Respin spin compliance / learning honesty | not touched (no trends, no results) | — |
| UGC (4) / Cutdown (2) | not touched | — |

## Inherited stopgaps (grep evidence)

`grep -rn "TODO\|FIXME\|SHORTCUT\|placeholder\|demo" respin --exclude-dir=node_modules --exclude-dir=.next`:

| Hit | Verdict |
|---|---|
| `packages/auth/src/create-auth.ts:47` — SHORTCUT: no email provider until M6 (reset link logged) | **Keep** — receiver M6 unchanged; M1's win-back email joins the same receiver |
| `packages/db/tests/bootstrap.test.ts:7` — SHORTCUT: PGlite single-session, conflict tests are serialized approximations | **Retire here** — M1-entry obligation: real-Postgres (Docker) concurrency test (Phase 1) |
| `packages/auth/better-auth.cli.ts:15` — "generation-placeholder" Google creds | **Keep** — CLI-generation-only file, never runtime; owner-credential-bound (auth-swap Deferral Ledger) |
| `app/(marketing)/page.tsx:2` — placeholder landing page | **Keep** — receiver M6 (REQ-H02) |
| `app/(auth)/auth-form.tsx` — HTML input `placeholder=` attributes | Not a stopgap (UI attribute) |

Also verified: the M0-deferred `email: ""` fallback in `app/(product)/layout.tsx` **no longer exists** (auth swap passes `user.email` from the Better Auth session). The master plan's D-M1-5 then resolves the whole class structurally: `users.email` is **dropped** (Better Auth `user.email` is the sole truth), so no email flows into domain `users` at all and the guard obligation is retired by removal — recorded in the master plan's inherited-obligations table, not skipped. *(This paragraph originally proposed a bootstrap-side guard; superseded by D-M1-5 during Step 4 — kept honest here rather than silently rewritten.)*

## Exact file paths

**New:** `packages/db/src/billing-schema.ts` · `packages/db/migrations/0001_*.sql` (+meta) · `packages/credits/{package.json,tsconfig.json,src/{index.ts,ledger.ts,balance.ts,stripe/{adapter.ts,webhooks.ts,setup.ts},pause.ts},tests/*}` · `packages/config/{package.json,tsconfig.json,src/{index.ts,schema.ts},tests/*}` · `app/api/stripe/webhook/route.ts` · `app/(product)/usage/page.tsx` · `app/(product)/settings/billing/page.tsx` (+ server actions) · `app/(admin)/admin/config/page.tsx` (+ action) · `packages/db/tests/concurrency.docker.test.ts` · `scripts` entry for Stripe setup.

**Modified:** `packages/db/src/schema.ts` (re-export billing schema; `users.auth_user_id` FK; `users.email` dropped per D-M1-5 — the email guard is retired by removal) · `packages/db/src/with-workspace.ts` (accessor extension) · `packages/db/src/seed.ts` (config seed + dev subscription state) · `packages/db/tests/with-workspace.test.ts` (breach validators) · `respin/package.json` + lockfile (deps: `stripe`) · `respin/README.md` (Stripe owner runbook) · `.github/workflows/respin.yml` only if a new command joins the gate · `docs/initial/decisions.md` (append R-20+) · `CLAUDE.md` Commands only if commands change.

## Existing patterns to follow verbatim

- **Package shape:** `packages/auth` (factory `createAuth(db)` + lazy env-wired instance + split entrypoints) → `packages/credits` mirrors it (`createCredits(db)`-style factory, testable on PGlite; lazy Stripe client behind env).
- **Schema style:** `schema.ts` (uuid v7 `$defaultFn`, `createdAt/updatedAt` helpers, uniqueIndex tuples, pgEnum).
- **Migration discipline:** append `0001_*.sql` via `db:generate`; never touch 0000 (it is now the published baseline — the auth-swap's regenerate-0000 allowance was pre-first-commit and is spent).
- **Test harness:** `packages/db/src/testing.ts` PGlite + committed migrations; bootstrap forced-failure rollback pattern for transactional atomicity proofs.
- **Accessor discipline:** `with-workspace.ts` enumerable accessor map + AC-7 completeness suite.
- **Runbook style:** `respin/README.md` per-step success checks (M0 phase 4).

## Risks (shared things this could break)

1. Migration 0001 must apply cleanly on both PGlite (tests) and Docker Postgres (dev) — the FK to auth `user` crosses into adapter-owned tables; if Better Auth's CLI regenerates its schema later, the FK must survive.
2. `withWorkspace` accessor-map extension touches the tenancy suite's completeness assertion — every new accessor without a breach validator fails AC-7 (by design; plan for it).
3. Seed changes must stay dev-guarded and idempotent (M0 phase 2 contract).
4. The webhook route joins the middleware matcher surface — it must be excluded from the auth cookie redirect and from any session gate (signature is its auth), without widening the gate-completeness test's blast radius.
5. New deps (`stripe`) join the keyless build — build must stay green with no `STRIPE_*` env set (lazy client, M0 keyless-build discipline).
