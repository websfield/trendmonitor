# Plan review — respin-auth-swap

**Readiness: Almost · Grade: C · The swap is well-specified and every tenancy-round fix landed, but one pre-mortem cause (the reset-link stub logging a live credential in production) has no receiving guard, and three small mechanical gaps remain — all four are one-line fixes.**

## Execution simulation

Walked all 10 tasks as `respin-engineer` with only the phase-plan text, against the real M0 tree.

- ✅ Task 1 — executable. `better-auth@1.6.28` exists; the CLI's instance-discovery/`--config` wrinkle is named in the plan with a resolution path (dedicated CLI config entry, golden-rule-9 verification). Lockfile confirmed Clerk-only today, regenerates on install.
- ⚠️ Task 2 — executable, one underspecified seam (Medium severity): the plan never says how the CLI-generated auth tables become visible to `drizzleAdapter`. The adapter resolves models from the db's drizzle schema map (or an explicit `schema` option); both `client.ts` and `testing.ts` pass only `* as schema from "./schema"`, so unless `schema.ts` re-exports `auth-schema.ts` or `createAuth` passes `schema` to the adapter explicitly, the first real sign-up fails with the adapter's model-not-found error. AC-1 will catch this — but pinning the wiring saves a guaranteed debugging loop.
- ✅ Task 3 — executable; regenerate-0000 verified legitimate; `drizzle.config.ts` glob fix present. File-list omission noted below.
- ✅ Task 4 — executable; `authHandlers` re-export design lint-passes; lazy-instance constraint pins the implementation (M0 `app-server.ts` pattern).
- ✅ Tasks 5–10 — executable (studio/admin pages confirmed to carry no gate helper today, so per-page checks are real work AC-9/AC-10 force; gate-completeness derivation has its defining set; grep-scope hole noted below).

**Least-confident probe:** honest and mostly held. Verified against the live 1.6.x API: `betterAuth`, `drizzleAdapter(db,{provider:"pg"})`, `toNextJsHandler`, `auth.api.getSession({headers})`, `getSessionCookie`, `revokeSessionsOnPasswordReset`, CLI `generate` with `--config`/`--output`; default table names are the singular set AC-7 names (no collision with plural domain tables); generated file is plain pg-core Drizzle the PGlite migrator handles. The one under-stated seam is the adapter-schema wiring above.

## Pre-mortem

All brief pre-mortem causes and plan risks map to tasks/ACs — except one: **the reset link logged is a credential logged** (Medium, High confidence). The `sendResetPassword` stub logs the reset URL — a bearer token for account takeover — and golden rule 2 forbids secrets in logs. Fine locally; but nothing prevents the stub surviving into the first Lightsail deploy. Fix: never log the URL outside development; SHORTCUT marker names the guard; failure-mode row added.

## Mechanical consistency

- Closure: `lib/routes.ts` (docstring names `ADMIN_CLERK_USER_IDS`) and `packages/db/src/index.ts` (exports `DEV_CLERK_USER_ID`) were in no task's file list (Low; grep self-heals, lists should still name them).
- AC-6 proof scope: the Clerk-zero grep's include filters skipped `README.md`/`env.example`, so "zero references anywhere" outran its proof (Low).
- Everything else checks: coverage parity, owner agent exists, PASS/FAIL ACs with evidence forms, requirement IDs reconcile, deferral receivers resolvable, M1 handoff pinned, $0 recurring-cost row, regenerate-0000 legitimate (verified against git state: zero tracked files under respin/).

## Consolidated reviewer findings

1. respin-tenancy-reviewer (plan round): NEEDS CHANGES → all 3 CHANGE + 4 NOTEs verified applied; architecture judged sound (gate relocation, identity model, package boundary, migration strategy) — concurred after independent probing.
2. This review: reset-stub credential logging (Medium) · adapter-schema wiring unpinned (Medium/Low) · file-list closure ×2 (Low) · AC-6 grep scope (Low).

## Verdict

**NOT READY** as drafted — one small round from Ready: (1) reset stub never logs the URL outside development; (2) state where auth tables join the adapter's schema view; (3) add the two files to task lists; (4) widen the AC-6 grep. No finding touches the architecture. **Fix the four lines and this is Ready.**

---

*Post-review disposition (coordinator): all four fixes applied to the plan documents in the same session — see the master plan's Plan Review Log. The code-time tenancy gate re-verifies the built result regardless.*
