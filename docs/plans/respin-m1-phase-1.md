# Phase 1 — Billing schema, migration 0001, M1-entry debts

**Feature:** respin-m1 · **Master plan:** `docs/plans/respin-m1-master-plan.md` · **Depends on:** none

## Project Conventions Pinned (READ FIRST)

**Golden rules (CLAUDE.md, verbatim):**
1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.** Existing conventions beat your preferences; a new dependency needs a reason the standard library can't answer.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that.
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.** Pushing, publishing, deleting what you didn't create wait for explicit confirmation.
9. **Current facts beat trained memory.** Verify library APIs against the installed version (lockfile, type definitions, official docs) before use.

**Respin non-negotiables that bind this phase (CLAUDE.md, verbatim):**
- **2. The ledger is the balance.** `credit_ledger` is append-only, balance derived; webhooks idempotent on Stripe event id; debit in the generation's transaction (REQ-G04/G06, R-6).
- **5. No leakage.** Nothing crosses profiles or workspaces (REQ-A03/D04, R-9).
- **6. No invented specifics, no guarantees.**

**Billing skill rules (`.claude/skills/respin-billing-credits`) B1, B4, B5 govern the schema:** append-only ledger, no `balance` column ever; grants expire `period_end + 1 month`, packs 12 months, oldest-first; costs/allowances in versioned DB config, never code.

**Lessons that touch this ground (CLAUDE.md, verbatim dates):** 2026-07-21 (prove installs by importing, not exit codes); 2026-07-30 (guard the **class**, not the field — validate at the boundary every consumer passes; a comment claiming a property must be asserted in a test or deleted); 2026-08-02 (nested workspace: pin configs, know which config produced a green run); 2026-08-10 (a diagnostic/suite must distinguish present-and-verified from present-and-unrun).

**Stack & boundaries:** pnpm workspace at `respin/` (R-16); Drizzle + self-hosted Postgres (R-18), PGlite test harness (R-17), uuid v7 app-side; `app/` imports `packages/`, never the reverse; Better Auth owns `user`/`session`/`account`/`verification` (schema-mirrored at `packages/db/src/auth-schema.ts`, domain code never queries them — except the FK added here). Migration 0000 is the **published baseline** — never regenerate it; this phase appends 0001.

**Agents:** implementer is `respin-engineer`. Do NOT request `frontend-engineer`, `control-plane-engineer`, `intelligence-plane-engineer` (other product lines) or any agent not in `.claude/agents/`.

## Requirements Checklist (functional)

- REQ-G04: `credit_ledger` append-only shape (kinds `grant|pack|debit|refund|adjust|expiry`, per-row source/target refs, `stripe_event_id` unique nullable, `expires_at` nullable).
- REQ-G06 (schema half): `stripe_events` idempotency table (D-M1-1).
- REQ-G05 (schema half): `config_versions` append-only (D-M1-2), seeded with PRD §4G launch defaults.
- REQ-G08 (schema half): `pause_periods` — one row per pause period, close-on-resume (D-M1-3) — + pause mirror fields on `subscriptions`.
- REQ-G01 (schema half): `subscriptions` 1:1 workspace Stripe mirror (tech-spec §2).
- M1-entry obligations: FK `users.auth_user_id` → auth `user.id`; drop `users.email` (D-M1-5); real-Postgres concurrency test retiring the PGlite SHORTCUT.

## Requirements Checklist (technical)

- New tables follow tech-spec §2 (uuid v7 `id` via the existing `$defaultFn` helper, `created_at`/`updated_at`) with five **named, deliberate exceptions** (the fifth added at code review round 1): `stripe_events` also carries `received_at`/`processed_at` in place of the timestamp pair — rows commit once under D-M1-1, recorded in R-20; the original four: `stripe_events` (natural PK = Stripe event id, text), `config_versions` (PK = integer identity `version`; append-only ⇒ no `updated_at`), `credit_ledger` (**no `updated_at`** — rows are never updated; append-only made structural), `pause_periods` (**has** `updated_at`: closing the open row by setting `ended_at` on resume is its one sanctioned update — it is one-row-per-period, NOT append-only, and no other column may ever be rewritten).
- No `balance` column anywhere (B1). No mutable counter of any kind.
- Migration + seed update in the same commit (build-plan working agreement).
- Seed remains dev-guarded and idempotent (M0 phase-2 contract, AC-8 guard test stays green).

## Schema (exact shape — Phase 2/3 build on this verbatim)

In new `packages/db/src/billing-schema.ts`, re-exported from `schema.ts` (Free is **absence of a row** — skill B6):
- `subscriptions`: `id`, `workspaceId` uuid FK → workspaces (cascade) **unique**, `stripeCustomerId` text notNull **unique**, `stripeSubscriptionId` text unique nullable, `stripePriceId` text nullable, `status` text notNull default `'none'` (Stripe status mirror), `currentPeriodStart`/`currentPeriodEnd` timestamptz nullable, `graceExpiresAt` timestamptz nullable, `pausedAt` timestamptz nullable, `resumesAt` timestamptz nullable, `cancelAtPeriodEnd` boolean notNull default false, `autoTopupEnabled` boolean notNull default false, `autoTopupMonthlyCapCents` integer nullable, timestamps. (Mutable **mirror** — allowed; it is not the ledger.) **No `tier` column**: tier is derived at read time from `stripePriceId` × the active config's `stripePriceMap` (Phase 2 state machine) so a config fix self-heals without event replay; an unmapped price fails closed to `free` entitlements with a named reason. The `subscriptionTier` enum therefore exists only as a TS union in `packages/config`, not as a pgEnum.
- `creditKind` pgEnum: `grant | pack | debit | refund | adjust | expiry`.
- `credit_ledger`: `id`, `workspaceId` uuid FK → workspaces (cascade), `delta` integer notNull (≠ 0, CHECK), `kind` creditKind notNull, `refType` text nullable, `refId` text nullable, `reasonCode` text nullable (required for `adjust` — CHECK `kind <> 'adjust' OR reason_code IS NOT NULL`), `expiresAt` timestamptz nullable (consumable lots: `grant`/`pack`/`refund` always set — refund expiry computed per D-M1-7; nullable only for positive `adjust`), `amountCents` integer nullable (money attribution for **purchased** lots — packs and auto-top-ups; feeds the auto-top-up monthly-cap check in real cents and the M6 margin rollup), `configVersion` integer nullable (the config version that priced a config-priced row — grants and auto-top-ups; attribution per billing round-1 note), `stripeEventId` text nullable **unique**, `createdAt`. **No `updatedAt`** — rows are never updated (append-only made structural). Sign discipline via CHECK: `kind IN ('grant','pack','refund') ⇒ delta > 0`; `kind IN ('debit','expiry') ⇒ delta < 0`. Partial unique index `(kind, ref_id) WHERE kind = 'expiry'` (D-M1-7 idempotent materialization).
- `stripe_events`: `id` text PK (Stripe event id), `type` text notNull, `payload` jsonb notNull, `workspaceId` uuid nullable FK → workspaces (**cascade** — workspace deletion removes its attributed event payloads, the REQ-A04 path; receipt-time resolution sets `workspace_id` **whenever the customer maps, regardless of outcome** — `ignored` rows for a resolvable customer join the cascade; only genuinely unattributable rows stay null-workspace and fall to the M6 retention sweep, Deferral Ledger), `stripeCustomerId` text nullable (resolved at receipt), `outcome` text notNull (`processed | refused_unknown_customer | refused_identity_mismatch | ignored`), `receivedAt`, `processedAt` nullable. Written only inside the D-M1-1 single-transaction dispatch — a failed handler rolls the event row back, so an existing row always means its outcome is final.
- `config_versions`: `version` integer PK generated always as identity, `content` jsonb notNull, `createdBy` text notNull (`'seed'` or auth user id), `createdAt`.
- `pause_periods`: `id`, `workspaceId` uuid FK → workspaces (cascade), `startedAt` timestamptz notNull, `endedAt` timestamptz nullable, `createdAt`, `updatedAt`. Partial unique index `(workspace_id) WHERE ended_at IS NULL` (one open pause). One row per pause period; resume closes the open row by setting `ended_at` — that close is the table's only sanctioned update (see the technical checklist).

**`users` changes (in `schema.ts`):** drop `email`; `authUserId` gains `.references(() => user.id, { onDelete: "restrict" })` (restrict = fail closed: the M6 deletion flow must delete both sides explicitly — T4 recording, ledger 2026-08-14). `bootstrapInTx`/`ensureUserWorkspace` lose the `email` param (D-M1-5); update `BootstrapParams`, the `(product)` layout call site, seed, and every test that passes `email`.

**Config v1 seed content (launch defaults, PRD §4G — Phase 2's Zod schema must accept exactly this):**
```json
{
  "creditCosts": { "hookSet": 2, "caption": 1, "ideationBatch": 3, "fullScript": 5, "autopsy": 4, "spin": 5, "revision": 2, "onboardingBrainBuild": 0, "trendBrowse": 0 },
  "allowances": { "free": 25, "creator": 250, "pro": 2000, "studio": 8000 },
  "pack": { "credits": 1000, "priceUsd": 10, "validityMonths": 12 },
  "graceDays": 7,
  "pauseMonths": { "min": 1, "max": 3 },
  "stripePriceMap": {}
}
```
(`pauseMonths` from REQ-G08's 1–3 bound, in config per R-12's own revisit trigger — billing round-1 note.)

## Edge Cases & Failure Paths

- **Inverse events:** every table added here has its teardown story, enumerated 1:1 against the Schema section — workspace delete cascades `credit_ledger`, `subscriptions`, `pause_periods`, **and workspace-attributed `stripe_events`** (all tested); null-workspace `stripe_events` rows are the named exception, falling to the M6 retention sweep (master-plan Deferral Ledger); `config_versions` is workspace-independent by design (global config, no teardown); auth-user delete is **restricted** while a domain user exists (tested; the M6 deletion flow is the sanctioned path).
- **Double failure:** migration applies to fresh DB in tests; if `db:check` reports drift after generation, the phase is not done (no hand-edited SQL without regenerating meta).
- **Degraded mode:** concurrency suite without `TEST_DATABASE_URL` **skips loudly** (named skip message stating what was not proven — Lesson 2026-08-10); CI always provides the service container so the skip never happens there.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Proof |
|---|---|---|---|---|
| Docker/CI Postgres (concurrency suite) | DB absent locally | loud named skip, never silent green | CI service container always runs it | test output + CI yaml |
| PGlite migrate | 0001 fails on fresh DB | suite red | fix migration before merge | migration test |
| Drizzle generate | cross-file FK to `auth-schema` emitted wrong | `db:check` drift / FK test red | regenerate | FK enforcement test |

## Handoff Contracts

- **To Phase 2:** the exact table/column names above; the config v1 JSON shape (Zod must parse the seeded row); `VerifiedWorkspaceId` does not exist yet (Phase 2 introduces it in `with-workspace.ts`).
- **To Phase 3:** `stripe_events` outcome vocabulary; `subscriptions` column set; ledger CHECK constraints (handlers must satisfy sign discipline).
- **To M6:** deletion covers domain **and** auth tables explicitly (restrict FK makes forgetting loud) **and the four billing tables** — `credit_ledger`/`subscriptions`/`pause_periods` by cascade verification, `stripe_events` by cascade for attributed rows plus the retention sweep for null-workspace rows (master-plan Deferral Ledger rows are the tripwire).

## Implementation Tasks

| # | Task | Owner agent | File(s) |
|---|---|---|---|
| 1 | Write `billing-schema.ts` exactly as specified; re-export from `schema.ts` | respin-engineer | `packages/db/src/billing-schema.ts`, `schema.ts` |
| 2 | `users`: drop `email`, add FK (restrict); update `bootstrap.ts` (`BootstrapParams` loses `email`), `app/(product)/layout.tsx` call site, `seed.ts`, affected tests | respin-engineer | `packages/db/src/{schema,bootstrap,seed}.ts`, `app/(product)/layout.tsx`, `packages/db/tests/{db,bootstrap,with-workspace}.test.ts`, `packages/auth/tests/auth.test.ts` (only if it passes `email` — read it first) |
| 3 | `pnpm db:generate` → migration 0001; prove on fresh PGlite (migration test) and on Docker dev DB (`db:migrate`); `db:check` clean | respin-engineer | `packages/db/migrations/0001_*.sql`, meta |
| 4 | Seed: config v1 row (idempotent — insert only when `config_versions` empty); keep dev guard; extend seed test | respin-engineer | `packages/db/src/seed.ts`, `packages/db/tests/db.test.ts` |
| 5 | New-table tests: uniques (workspace 1:1, `stripe_customer_id`, `stripe_subscription_id`, `stripe_event_id`, open-pause partial index, expiry partial index), CHECKs (`delta ≠ 0`, delta sign per kind, adjust-requires-reason), cascades, FK enforcement + restrict behavior | respin-engineer | `packages/db/tests/db.test.ts` |
| 6 | Docker concurrency harness: `TEST_DATABASE_URL` points at the **maintenance** db (`…5435/respin`); the harness connects there, creates database `respin_test` if absent (check `pg_database` first — CREATE DATABASE has no IF NOT EXISTS), reconnects to `respin_test`, `DROP SCHEMA public CASCADE; CREATE SCHEMA public`, migrates — it must therefore **never** run destructive statements on the maintenance connection (guard: refuse if the connected database is not `respin_test`). + N-parallel `ensureUserWorkspace` race test (exactly 1 workspace); loud skip w/o env | respin-engineer | `packages/db/tests/concurrency.docker.test.ts`, `packages/db/src/testing.ts`, `packages/db/package.json` (`test:concurrency`) |
| 7 | CI: add Postgres service container + `test:concurrency` step to the respin workflow | respin-engineer | `.github/workflows/respin.yml` |
| 8 | Retire the PGlite SHORTCUT marker in `bootstrap.test.ts` (point to the Docker suite as the real prover) | respin-engineer | `packages/db/tests/bootstrap.test.ts` |
| 9 | Append R-20 (D-M1-1…**8** consolidated, with revisit triggers — including pause_periods' resolved not-append-only shape and the D-M1-8 order that Phase 4's tech-spec sync cites) to `docs/initial/decisions.md` | respin-engineer | `docs/initial/decisions.md` |
| 10 | Ledger entry: phase start/complete | respin-engineer | `docs/progress/respin-m1/ledger.md` |

## Files to Create / Modify

Create: `packages/db/src/billing-schema.ts` · `packages/db/migrations/0001_*.sql` (+ meta) · `packages/db/tests/concurrency.docker.test.ts` · `docs/progress/respin-m1/ledger.md`.
Modify: `packages/db/src/{schema,bootstrap,seed,testing}.ts` · `packages/db/tests/{db,bootstrap,with-workspace}.test.ts` (email-param fallout) · `packages/auth/tests/auth.test.ts` (only if it passes `email` into bootstrap — verify by reading it first) · `app/(product)/layout.tsx` · `packages/db/package.json` · `.github/workflows/respin.yml` · `docs/initial/decisions.md`.
Out of scope for this phase: `with-workspace.ts` accessors (Phase 2/4), anything under `packages/credits|config` (Phase 2), any Stripe code (Phase 3).

## Migration Steps

1. `pnpm db:generate` (never hand-write 0001).
2. Migration test: fresh PGlite → apply 0000+0001 → assert tables/constraints.
3. Docker dev DB: `pnpm db:migrate` (additive — `users.email` drop is destructive **to dev data only**; dev DB is throwaway, but still run against the live container to prove it applies to a DB with existing rows).
4. `pnpm db:seed` twice → idempotent, config v1 present once.
5. `pnpm db:check` → clean.

## Verification Steps (paper-dry-run)

1. `pnpm -C respin install` (adds nothing this phase; lockfile only if needed) — state: clean tree.
2. `pnpm -C respin typecheck` — requires task 1–2 complete (email fallout compiles).
3. `pnpm -C respin test` — requires tasks 3–5, 8 (PGlite suites green, concurrency suite loud-skips locally without env).
4. `TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm -C respin --filter @respin/db test:concurrency` — requires task 6 + Docker DB up (the harness itself creates and resets `respin_test`; the URL names the maintenance db, and the harness's not-`respin_test` guard keeps destructive statements off it).
5. `pnpm -C respin db:check` + `db:seed` (twice) against Docker — requires step 3–4 of Migration Steps.
6. `pnpm -C respin lint && pnpm -C respin build` — keyless, requires all tasks.

## Acceptance Criteria (PASS/FAIL, with evidence)

- AC-1: migration 0000+0001 applies to a fresh PGlite DB (test name in `db.test.ts`).
- AC-2: `users.email` is gone; repo-wide grep for `users.email`/`\.email` on the domain user type finds no live consumer; typecheck green.
- AC-3: inserting a `users` row with an unknown `auth_user_id` fails (FK test); deleting an auth `user` row that has a domain `users` row fails (restrict test).
- AC-4: every CHECK/unique constraint in the Schema section proven by an attempted-violation test, enumerated 1:1 against that section: `delta ≠ 0`, delta sign per kind, adjust-requires-reason, one open pause, expiry idempotency index, `stripe_event_id` unique, `stripe_customer_id` unique, `stripe_subscription_id` unique, workspace 1:1 — plus the cascade set from the Edge-Cases enumeration (including workspace-attributed `stripe_events` cascade and null-workspace survival).
- AC-5: N≥8 parallel `ensureUserWorkspace` calls on real Postgres yield exactly 1 workspace/membership (Docker test, run locally this session AND wired in CI yaml).
- AC-6: seed idempotent incl. config v1 (run-twice test); dev guard test still green.
- AC-7: `db:check` clean; keyless build green.
- AC-8: R-20 appended (read back, not just claimed — Lesson from T4 recording: an append promised is verified by reading the file).
- AC-9: concurrency suite without env produces a **named skip** naming what wasn't proven (assert via vitest reporter output).

## Least confident (one line)

That drizzle-kit generates the cross-file FK (`users.auth_user_id` → `auth-schema`'s `user.id`, uuid-vs-text: auth ids are **text**, so the column types must already agree — verify `authUserId` is text and the FK is legal) cleanly in 0001 without disturbing the adapter-owned table definitions.

## Out of Scope (Surgical Changes)

No edits to `packages/auth` runtime code, `middleware.ts`, `lib/routes.ts`, any `(marketing)`/`(admin)` page, `src/`, `cutdown/`, or migration 0000.

## Completion Criteria (Definition of Done)

Entry gate clean (or no new failures vs baseline); this phase's ACs green; cross-referenced docs consistent (decisions.md R-20 lands here); reviewer gates run at phase review, not skipped because "it's schema".
