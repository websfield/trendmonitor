# Phase 3 — Clerk auth, workspace bootstrap, and the tenancy helper

**Feature:** Respin M0 · **Depends on:** 2 · **Owner agent:** `respin-engineer`

## Project Conventions Pinned (READ FIRST)

- **Golden rules (CLAUDE.md, binding):** (1) read before write; (2) **no secrets in code/commits/logs** — Clerk keys and `DATABASE_URL` are env-only; `.env.example` names them without values; (6) report honestly — anything needing live Clerk keys is *evidence-pending*, never "done"; (9) verify the installed `@clerk/nextjs` API (middleware helper names, auth() shape) against its types/docs before writing — Clerk's API surface moves.
- **Respin non-negotiable 5 (CLAUDE.md, verbatim):** "No leakage. Nothing crosses profiles or workspaces" (REQ-A03).
- **Tenancy skill T1 (rule canon, verbatim):** "Every query is workspace-scoped through the single `withWorkspace(ctx)` helper; no raw table access from route handlers. … A new query path that bypasses the helper is a finding even if it happens to filter correctly — the class, not the instance."
- **Lesson 2026-07-30 (verbatim, the class-not-field rule):** "When a review names an unguarded field, fix the class, not the field: guard where the path is built … put the guard in a package every consumer can import, and add a lint."
- **Lesson 2026-07-30 (comments):** "A comment claiming a property is not the property: assert it in a test or delete the claim."
- **tech-spec §6 (binding):** Clerk middleware on all `(product)` and `(admin)` routes; admin gated by an allowlist role; profile isolation enforced by query scoping **plus a test suite that attempts cross-workspace reads**.
- **Layout rule:** `app/` imports `packages/`; never the reverse. **Available agents:** `respin-engineer` only. **Git:** commit only when asked; checkpoint announced first.

## Requirements Checklist (functional)

**URL topology (pinned — route groups are URL-invisible, Phase 1 handoff):** `/` marketing · `/studio` product shell · `/admin` admin · `/sign-in`, `/sign-up` public auth pages.

- [ ] REQ-A01 (M0 slice): sign up with email or Google via Clerk; first authenticated visit to `/studio` creates users row + personal workspace ("<name>'s workspace") + owner membership; shell shows workspace name; sign out works.
- [ ] Clerk middleware protects the URL prefixes `/studio(.*)` and `/admin(.*)`; `/`, `/sign-in(.*)`, `/sign-up(.*)` stay public.
- [ ] **Admin allowlist enforced in middleware** on `/admin(.*)` (env `ADMIN_CLERK_USER_IDS`, comma-separated): non-admin → not-found/redirect; **unset or empty allowlist denies everyone (fail closed), never admits everyone**. A layout is not a security boundary — the page-level check is defense in depth, not the gate. Full RBAC is M6.
- [ ] `/studio` shell: authenticated layout + an empty home ("studio coming soon" honesty copy — no fake features), sign-out control.

## Requirements Checklist (technical)

- [ ] `withWorkspace(ctx)` lives in `@respin/db` (a package **every** consumer can import — lesson 2026-07-30) and returns a scoped query surface; server code reads tables **only** through it. **Signature is membership-verifying, not derivation-only:** given the authenticated user and a requested workspace id, it verifies membership then scopes; at M0 the requested workspace defaults to the user's sole personal workspace, but the verify-then-scope shape ships now so M2 multi-profile and M6 seats don't re-plumb every consumer (plan-review note).
- [ ] Bootstrap (`ensureUserWorkspace`) is a single transaction, idempotent under concurrent first requests. **The structural requirement is the post-conflict branch (plan-review finding 4):** on `clerk_user_id` insert conflict, the transaction resolves and returns the *existing* user's membership + workspace in-tx — it never proceeds to workspace creation. The unique constraint alone does not prevent a second workspace; the branch does.
- [ ] Lint guard (plan-review finding 5): **default-deny, not denylist** — `no-restricted-imports` with `allowImportNames` (verify the option exists in the installed ESLint per golden rule 9; if absent, split entrypoints instead: `@respin/db` root exports only the sanctioned surface, internals live under `@respin/db/internal` which is path-forbidden from `app/**`). Sanctioned for `app/**`: `withWorkspace`, `ensureUserWorkspace`, inferred types. Everything else — `createDb`, `schema`, `migrate`, raw-SQL entrypoints, and **any export added later** — is unimportable from `app/**` by default, so an M1 addition can't silently reopen the bypass (a handler holding `createDb` + the `sql` tag bypasses the helper with zero schema imports; the connection itself must be unreachable — the "add a lint" half of the class-not-field rule).
- [ ] Cross-workspace read suite: with two seeded users/workspaces, every scoped accessor attempted against the *other* workspace returns empty/refuses (T1's attempt-the-breach test). **Completeness is mechanical, not memorial (plan-review note):** the suite iterates the exported scoped-accessor map programmatically, so an accessor added in M1 that's absent from the suite fails a completeness assertion rather than escaping review.
- [ ] No Clerk secret referenced in any client component; `NEXT_PUBLIC_` prefix audit (guardrail `respin-public-env-secret`).

## Edge Cases & Failure Paths

- **Inverse events:** sign-out clears session (Clerk-owned); bootstrap has no inverse at M0 — account deletion is REQ-A04, receiving milestone **build-plan M6** (deletion) / M2 (export), both now recorded in the master-plan Deferral Ledger and in build-plan M6's text — and cascade FKs from Phase 2 keep it structurally possible.
- **Double failure:** bootstrap transaction fails mid-flight → transaction rolls back whole; retry on next request is safe (idempotent). Test: forced failure leaves zero partial rows.
- **Degraded mode:** DB unreachable on `/studio` load → named error surface (Next error boundary), never a silently empty shell pretending success; Clerk unreachable → unauthenticated requests are denied (no new session can be established) but sessions with valid cached JWTs may persist until expiry (see failure-modes row — no "fully fail closed" claim); `/` unaffected.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Proof |
|---|---|---|---|---|
| Clerk | no/invalid session | middleware redirects to sign-in; `/studio(.*)`/`/admin(.*)` never render | user signs in | middleware test / route-matcher unit test |
| Clerk | service down | **honest claim only (plan-review note):** unauthenticated requests are denied (no session can be established), but sessions with valid cached JWTs may continue until token expiry — Clerk verifies against cached JWKS. Marketing unaffected. Do not claim "fully fail closed" anywhere; the matcher test proves the public/protected split, not outage behavior | retry; documented in runbook (Phase 4) | matcher test + runbook wording |
| Neon | down during bootstrap | transaction rollback, error boundary, no partial rows | next request retries | forced-failure test |
| Concurrent first login | duplicate bootstrap race | unique conflict → resolve-existing branch → exactly one workspace (the branch, not the constraint alone, is the guarantee) | none needed | serialized-conflict test (AC-2) |

## Handoff Contracts

- **To Phase 4:** the full env-var inventory this phase consumes (`DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ADMIN_CLERK_USER_IDS`) — Phase 4's `.env.example` and runbook must list exactly these (count parity).
- **To M0 review:** the tenancy surface (`withWorkspace`, bootstrap, lint rule, cross-workspace suite) is the object of the `respin-tenancy-reviewer` gate.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | Install + wire `@clerk/nextjs` (verify current API); middleware with URL route matcher (protect `/studio(.*)` + `/admin(.*)`; public `/`, `/sign-in(.*)`, `/sign-up(.*)`) **including the admin allowlist check with empty-allowlist-denies-all** | respin-engineer | `respin/middleware.ts`, `respin/app/layout.tsx`, `respin/package.json` |
| 2 | Sign-in/up routes (Clerk components), public, at `/sign-in` + `/sign-up` (exact file location per installed Clerk docs — outside the protected prefixes, so no redirect loop) | respin-engineer | `respin/app/sign-in/[[...sign-in]]/page.tsx`, sibling sign-up |
| 3 | `ensureUserWorkspace` transactional idempotent bootstrap in `@respin/db` with the post-conflict resolve-existing branch | respin-engineer | `respin/packages/db/src/bootstrap.ts` |
| 4 | `withWorkspace` verify-membership-then-scope query surface | respin-engineer | `respin/packages/db/src/with-workspace.ts`, `src/index.ts` |
| 5 | `/studio` authenticated layout + shell page (workspace name, sign out); `/admin` placeholder with page-level allowlist re-check (defense in depth behind the middleware gate) | respin-engineer | `respin/app/(product)/studio/page.tsx`, `respin/app/(product)/layout.tsx`, `respin/app/(admin)/admin/page.tsx`, `respin/app/(admin)/layout.tsx` |
| 6 | Lint guard: `app/**` restricted to sanctioned `@respin/db` exports by `importNames` (`createDb`/`schema`/`migrate`/raw-SQL forbidden) | respin-engineer | `respin/eslint.config.mjs` |
| 7 | Tests: bootstrap idempotency + serialized-conflict + rollback; cross-workspace read suite with programmatic accessor-map completeness assertion; middleware matcher public/protected; admin allowlist incl. **empty-allowlist-denies-all** | respin-engineer | `respin/packages/db/tests/bootstrap.test.ts`, `tests/with-workspace.test.ts`, `respin/tests/middleware.test.ts`, `respin/tests/admin-gate.test.ts` |

## Files to Create / Modify

New: tasks 2–5, 7 files. Modified: `respin/middleware.ts` (new), `respin/app/layout.tsx`, `respin/eslint.config.mjs`, `respin/package.json`, `respin/packages/db/src/index.ts`.

## Migration Steps

None — no schema change (Phase 2's schema was designed for this; if any schema change proves necessary, it ships with migration + seed in the same commit and re-opens Phase 2's `db:check`).

## Verification Steps (command · state · established by)

1. `pnpm -C respin install` · Phase 1–2 green · handoff.
2. `pnpm -C respin test` · all task-7 suites present · task 7.
3. `pnpm -C respin lint` · guard rule added · task 6; prove the guard: temp fixtures importing `schema` from `app/` AND `createDb` from `app/` both fail (test or documented lint run — matches AC-5).
4. `pnpm -C respin typecheck && pnpm -C respin build` · env vars stubbed for build (no secret required to build; verify against installed Clerk docs) · tasks 1–5.
5. Repo entry gate: no new failures.

## Acceptance Criteria (PASS/FAIL, evidence)

- AC-1: Cross-workspace read suite green — every scoped accessor refuses/returns-empty against the foreign workspace (test names).
- AC-2: Bootstrap: idempotent (2 sequential calls → 1 workspace), conflict-branch-safe (pre-seeded existing user → bootstrap resolves the existing workspace, creates nothing), rollback-clean (forced failure → 0 partial rows) (3 test names). **Honesty limit (plan-review finding 4):** PGlite is single-session, so this is the *serialized*-conflict approximation, not true interleaving — mark the test with a `SHORTCUT:` comment naming its ceiling and the upgrade trigger (a Neon-based concurrency test before M1's money paths land on this bootstrap).
- AC-3: Route matcher in URL terms: `/`, `/sign-in`, `/sign-up` public; `/studio(.*)`, `/admin(.*)` protected (test names).
- AC-4: Admin gate: non-allowlisted authenticated user gets not-found/redirect, **and unset/empty `ADMIN_CLERK_USER_IDS` denies everyone** (2 test names).
- AC-5: Sanctioned-import lint fires on both fixtures: a `schema` import from `app/**` AND a `createDb` import from `app/**` (evidence from VS-3).
- AC-6: No secret value anywhere in the diff; client bundle references only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (grep evidence).
- AC-7: Accessor-map completeness assertion exists and fails when a scoped accessor is removed from the suite's enumeration (test name).
- **Evidence-pending (owner keys required, reported separately):** live sign-up → shell → sign-out on a real Clerk dev instance.

## Least confident (one line)

The post-conflict resolve-existing branch as expressed through Drizzle's transaction + on-conflict API — exact semantics must be verified against installed Drizzle docs, and the serialized-conflict test must exercise the real branch (pre-seeded conflict, no mocks), with its PGlite single-session ceiling honestly marked per AC-2.

## Out of Scope (Surgical)

No Clerk Organizations/seats (M6), no webhooks (M1 Stripe / later Clerk), no creator profiles (M2), no real product features, no design polish. No edits to `src/`, `cutdown/`.

## Completion Criteria (Definition of Done)

Entry gate clean repo-wide; **`respin-tenancy-reviewer` gate PASS required** (this phase is the tenancy surface); docs consistent; all ACs pass with the evidence-pending items reported as exactly that.
