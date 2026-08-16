# Master Plan — respin-auth-swap (single phase)

**Objective:** Replace Clerk with Better Auth across Respin's M0 surface at feature parity (email/password now, Google when credentials exist), with sessions and auth tables in our own Postgres, identity provider-neutral, and every tenancy guarantee re-proven.

**Requirement IDs:** REQ-A01 (signup email/Google → personal workspace), tech-spec §6 (auth boundary — as amended by R-18/R-19), R-18, R-19. **Brief:** `docs/plans/respin-auth-swap-brief.md`.

## Non-Goals
Organizations/seats (M6, org plugin per R-19); password-reset email delivery (logs the reset link until an email provider exists — honest stub, named in code); rate-limiting sign-in attempts beyond Better Auth defaults (M6 hardening); any M1 scope.

## Critical Paths touched
| Path | Touched | Reviewer |
|---|---|---|
| Respin brain tenancy | **Yes** (auth boundary, bootstrap identity, admin gate, new auth tables) | `respin-tenancy-reviewer` |
| others | No | — |

## Decisions baked in
| Decision | Choice | Why |
|---|---|---|
| Gate location | **Server layer is THE gate** (`getSessionUser`/`requireAdmin` in layouts AND every protected/admin page); middleware does optimistic `getSessionCookie` redirect only (UX fast path) | Better Auth cannot verify sessions in edge middleware (no stateless JWT). This deliberately supersedes the Clerk-era "gate in middleware" finding — that finding was Clerk-specific. Client-nav caches layouts, hence per-page checks too (brief pre-mortem 3). |
| Identity model | Domain `users` keeps its own row, `clerk_user_id` → **`auth_user_id`** (unique, no FK to the adapter-owned auth tables at M0 — decoupling + test simplicity; FK revisit at M1) | Preserves the twice-reviewed bootstrap conflict-branch structure; auth provider stays swappable (R-8 spirit). |
| Migration strategy | **Regenerate migration 0000** (drop the old one) rather than append a rename migration | Nothing is committed to git and no environment beyond today's local Docker exists — 0000 is unpublished, so the never-mutate-published rule doesn't bind; local DB recreated via `docker compose down -v`. First commit ships a Clerk-free history. |
| Auth package | New `packages/auth` (@respin/auth): `createAuth(db)` factory + lazy env-wired `auth` + `getSessionUser()`/`requireAdmin()` server helpers | `lib/` is lint-restricted from `createDb` (correctly); packages may hold the connection. Factory injection lets tests run REAL sign-up/session flows on PGlite. |
| Admin allowlist env | `ADMIN_CLERK_USER_IDS` → **`ADMIN_USER_IDS`** (Better Auth user ids), same fail-closed parser | Provider-neutral naming. |

## Dependencies
M0 complete (proof: `docs/progress/respin-m0-review.md` Ready; ledger). New dep: `better-auth` (+ its CLI for schema generation) — decision record R-19. Recurring cost: $0 (self-hosted).

## Deferral Ledger
| Deferral | Receiver |
|---|---|
| Password-reset email delivery (stub logs link) | M6 (email provider lands with digests, tech-spec §1 Resend row — or its R-18-era replacement) |
| FK from `users.auth_user_id` to the auth user table | M1 (with the empty-email guard already ledgered in the M0 master plan) |
| `email` dual-truth: auth `user.email` is authoritative/mutable, domain `users.email` is a bootstrap-time copy never synced | M1 (same change as the FK row: sync-on-session or drop the domain copy — plan-review note) |
| Google OAuth live proof (needs owner's Google Cloud OAuth client) | Owner runbook step; email/password evidence is sufficient for M0 acceptance |
| Neon-based concurrency test row (M0 ledger) — **retargeted**: now a plain-Postgres (Docker) concurrency test, no longer credential-bound | M1 entry, unchanged trigger |

## Risk Assessment
Seeded from the brief's pre-mortem (gate weakening, dual identity truth, client-nav bypass) plus: (4) Better Auth schema generation drifts from what the adapter expects — mitigated by generating via its own CLI and testing real sign-up against the migrated PGlite; (5) session cookie name/prefix assumptions in middleware — use `getSessionCookie` from the library, never a hard-coded cookie name.

## Phase Plans
| Phase | Description | Depends on | Agent | File |
|---|---|---|---|---|
| 1 | The whole swap (package, schema, routes, pages, middleware, tests, docs) | none | `respin-engineer` | `docs/plans/respin-auth-swap-phase-1.md` |

## Progress Tracking
| Phase | Status | Evidence |
|---|---|---|
| 1 | Complete | Ledger 2026-08-14: built (55/55 tests, CLERK-ZERO grep, keyless build green); code gate FINAL respin-tenancy-reviewer PASS (Ready, A); Exit Demonstration executed live (sign-up → `/studio` shell → sign-out on Docker DB, session revoked, gate re-verified) |

Ledger: `docs/progress/respin-m0/ledger.md` (continues — this is M0 remediation under R-18/R-19, not a new milestone).

## Plan Review Log
| Round | Reviewer | Verdict | Notes |
|---|---|---|---|
| 1 | respin-tenancy-reviewer (plan) | NEEDS CHANGES | 3 CHANGE (gate-completeness mechanism, @respin/auth split entrypoints, drizzle.config glob) + 4 NOTEs — all applied; architecture judged sound |
| final | plan-reviewer (generalist, consolidating) | NOT READY → **Ready-conditions applied** | `docs/progress/respin-auth-swap-plan-review.md`; its ordered 4-fix list ("fix the four lines and this is Ready") applied verbatim same session: reset-URL never logged outside dev + failure-mode row, adapter schema wiring pinned (schema.ts re-export), 2 files added to task lists, AC-6 grep widened |

## Exit Demonstration
**Engineering:** full respin chain green (typecheck, lint, tests incl. a REAL sign-up→session test on PGlite, keyless build); zero `@clerk` references anywhere in `respin/`; fail-closed admin tests pass at the new gate location.
**Evidence (now locally provable — no third-party accounts):** on the Docker DB, `pnpm dev` → sign up with email/password at `/sign-up` → land on `/studio` with the workspace shell → sign out → recorded in the ledger. Google flow remains owner-credential-bound (runbook).
