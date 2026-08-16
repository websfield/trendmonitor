# Master Plan — Respin M0 (Skeleton)

**Objective:** Stand up the deployable Respin skeleton in `respin/` — Next.js 15 app with marketing/product/admin route groups, Clerk auth with workspace bootstrap on first login, Neon+Drizzle with the initial users/workspaces/memberships migration, path-scoped CI, and Vercel deploy config — per `docs/initial/build-plan.md` M0, with no scope beyond it.

**Requirement IDs:** REQ-A01 (partial — signup + personal workspace; per-tier profile limits are M2), tech-spec §1/§2 (subset)/§6, build-plan M0, R-5, R-15.
**Brief:** `docs/plans/respin-m0-brief.md` · **Codebase review:** `docs/progress/respin-m0-codebase-review.md`

## Non-Goals (this plan)

- Anything M1+: Stripe, credit ledger, config table, brain docs, generation, trends, results.
- `creator_profiles` table and per-tier profile limits (M2 — receiving milestone in build-plan).
- Clerk Organizations / Studio seats and full RBAC (M6; M0 ships the `role` enum and admin allowlist only).
- Real product pages — `(product)` is an authenticated empty shell per M0's acceptance line.
- Any edit to `src/` or `cutdown/`.

## Critical Paths touched

| Path | Touched | Reviewer |
|---|---|---|
| Respin brain tenancy | **Yes** (schema, bootstrap, `withWorkspace`, roles, admin gate) | `respin-tenancy-reviewer` |
| Respin billing & credits / spin compliance / learning honesty | No | — |
| UGC (4 paths) / Cutdown (2 paths) | No | — |

## Project Conventions Pinned

Pinned verbatim into every phase plan (see each phase's *READ FIRST* block): golden rules 1–9; Respin non-negotiables 5 (no leakage) and 6 (no invented specifics); Lessons 2026-08-02 (nested project inherits enclosing config silently — pin configs; a green lint is vacuous until you know which config produced it) and 2026-08-10 (a diagnostic must distinguish present-and-verified from present-and-unrun); stack per R-5 (don't re-litigate); `app/` imports `packages/`, never the reverse; golden rule 9 (verify library APIs against installed versions, not memory).

## Decisions baked in (defaults the doc set doesn't settle)

| Decision | Default chosen | Why / revisit | Recorded |
|---|---|---|---|
| Package manager | **pnpm** (workspace: `respin/` root + `packages/*`) | Matches the proven `cutdown/` precedent; Vercel supports it natively. Revisit: never on principle. | Append as R-16 in `docs/initial/decisions.md` (Phase 1 task 6) |
| Hermetic test DB | **PGlite** (in-process Postgres) for migration + tenancy tests | Zero-setup locally and in CI; drizzle ships a pglite driver. Verify against installed versions at build time (golden rule 9). Revisit: if PGlite diverges from Neon behavior on anything M0 tests. | Append as R-17 (Phase 2 task 6) |
| uuid v7 generation | App-side `uuidv7` package via drizzle `$defaultFn` | Neon Postgres has no native v7 generator; tech-spec §2 mandates v7. Revisit: pg 18 native `uuidv7()`. | Noted in R-17 entry |
| Workspace bootstrap trigger | Lazy `ensureUserWorkspace()` on first authenticated `(product)` request, idempotent | Most reversible (no Clerk webhook infra needed at M0); webhook path can replace it later without schema change. | Noted in R-16 entry |
| URL topology | `/` marketing · `/studio` product shell (future `/trends` `/results` `/brain` `/settings` `/usage` per tech-spec §1) · `/admin/**` admin · `/sign-in` `/sign-up` public | **Route groups are URL-invisible** — `(marketing)`, `(product)`, `(admin)` do not appear in URLs, so the auth boundary must be pinned in URL terms or three pages collide on `/` (plan-review finding 1). | This table + phase plans |

## Dependencies

None shipped-code dependencies (greenfield; proof: `respin/**` empty, codebase review). External accounts (Clerk, Neon, Vercel) are **evidence dependencies**, not build blockers — see Exit Demonstration.

## Deferral Ledger

| Deferral | Genuine ocean? | Receiving task |
|---|---|---|
| Per-tier profile limits (rest of REQ-A01) | Yes — needs `creator_profiles` + tiers (M1/M2 scope) | build-plan M2 |
| Studio seats/roles beyond enum + allowlist (REQ-A02) | Yes — needs Clerk Organizations (M6 scope) | build-plan M6 |
| REQ-A04 brain **export** | Yes — needs `brain_docs` (M2 scope) | build-plan M2 (explicit: "brain export (REQ-A04)") |
| REQ-A04 account **deletion** (30-day full removal) | Yes — needs the full data surface to exist | build-plan M6 (launch hardening; receiver line **and an M6 accept-when deletion criterion** added to build-plan in this change — Phase 2's tested cascade FKs keep it structurally possible from M0). **Post-auth-swap:** the surface now includes the four Better Auth tables (`user`/`session`/`account`/`verification`, with session IP/UA and account password-hash/OAuth-token columns); domain↔auth has no FK until M1, so deletion must cover BOTH sides explicitly (ledger 2026-08-14) |
| Neon-based bootstrap **concurrency test** (true interleaving; PGlite is single-session) | Credential-bound now (needs a real Neon branch) | **M1 entry**: before any money path lands on `ensureUserWorkspace` — carried by the `SHORTCUT:` marker (phase-3 AC-2) *and* this row; M1's plan must show the receiving task |
| Empty-string email guard in the bootstrap call site (`app/(product)/layout.tsx` falls back to `""`; both M0 auth strategies always supply an email) | Deferred by agreement with the code reviewer (round 2) | **M1**: before the users row feeds billing — add the guard + a test |
| Blocking CI check for `respin/**` in `.claude/workspaces.json` | No — completable here | **Phase 1 task 5 (done in-plan)** |
| Real Vercel project creation + live preview deploy | Owner-credential-bound | Phase 4 delivers config + exact setup runbook; owner executes (Exit Demonstration) |
| Clerk production instance / live sign-up proof | Owner-credential-bound | Same as above |

## Derived Budgets (numbers with provenance)

| Number | Value | Provenance |
|---|---|---|
| Node version | 22 LTS | Vercel default runtime for Next.js 15; pinned in `engines` + CI |
| Membership roles | `owner` / `editor` / `viewer` | REQ-A02 verbatim |
| CI jobs | typecheck, lint, test, migration check (build-plan M0 verbatim) **+ build** (added: a Next.js app that typechecks but doesn't build is not deployable; build is the Vercel-parity check) | build-plan M0 + this plan |
| Library versions (Next 15, Drizzle, Clerk SDK, Zod, vitest, pnpm) | resolved at install, then pinned by lockfile | golden rule 9 — installed versions are the fact source, not this plan |

**Recurring-cost rows (new external services):**

| Service | M0 cost | Free-tier ceiling it outgrows |
|---|---|---|
| Neon | $0 (Free) | 0.5 GB storage / compute hours — fine until pilot data |
| Clerk | $0 (Free) | 10k MAU (R-5 revisit trigger: cost at >5k MAU) |
| Vercel | $0 Hobby for dev previews; **Pro $20/mo required before commercial launch** (Hobby ToS is non-commercial) | Flagged for M6/launch, not M0 |
| GitHub Actions | $0 within included minutes (private repo 2,000 min/mo) | CI runtime growth |

## Risk Assessment (seeded from the brief's pre-mortem)

1. **Dishonest evidence reporting** — Clerk/Neon/Vercel criteria can't be fully proven without owner credentials. Mitigation: Phase 4 reports engineering vs evidence completion separately with an exact owner runbook; nothing credential-bound is claimed "accepted".
2. **Config inheritance from the enclosing repo** (lesson 2026-08-02). Mitigation: every config pinned inside `respin/`; Phase 1 acceptance includes proving which eslint/tsconfig produced the green run.
3. **Skeleton drift from tech-spec §1** forcing an M1 restructure. Mitigation: layout tasks cite §1; the import-direction rule gets a lint/test guard in Phase 1.
4. **Tenancy helper that exists but isn't load-bearing** — a helper nobody is forced to use is a comment (T1: guard the class, not the field). Mitigation: Phase 3 ships the cross-workspace read suite + a lint forbidding raw table imports from route handlers, same change.
5. **Dependency install trusted from exit code** (lesson 2026-07-21). Mitigation: Phase 1 acceptance imports each key package (typecheck run counts), not just `pnpm install` exit 0.

## Phase Plans

| Phase | Description | Depends on | Primary agent | Plan file |
|---|---|---|---|---|
| 1 | Self-rooted scaffold: pnpm workspace, Next.js 15 app + route groups, pinned TS/eslint/vitest, path-scoped CI, workspaces.json wiring, R-16 decision entry | none | `respin-engineer` | `docs/plans/respin-m0-phase-1.md` |
| 2 | `packages/db`: Drizzle schema (users/workspaces/memberships), initial migration + seed, migration-drift check in CI, PGlite test harness, R-17 decision entry | 1 | `respin-engineer` | `docs/plans/respin-m0-phase-2.md` |
| 3 | Clerk auth + middleware, idempotent workspace bootstrap, `withWorkspace(ctx)` helper, cross-workspace read suite + raw-access lint, product shell + admin gate | 2 | `respin-engineer` | `docs/plans/respin-m0-phase-3.md` |
| 4 | Vercel deploy config, `.env.example`, setup runbook (Neon/Clerk/Vercel owner steps), CLAUDE.md Commands update, engineering-vs-evidence report | 3 | `respin-engineer` | `docs/plans/respin-m0-phase-4.md` |

## Progress Tracking

| Phase | Status | Evidence |
|---|---|---|
| 1 | Complete (2026-08-14) | ledger + `respin/` on disk; install/typecheck/lint/test/build green; boundary-lint fixtures pass |
| 2 | Complete (2026-08-14) | migration `0000_serious_kylun.sql` + seed; 14 db tests; `db:check` clean; R-17 |
| 3 | Complete (2026-08-14) | 41/41 tests (breach suite, bootstrap atomicity, fail-closed admin); keyless build green; tenancy code gate PASS round 2 |
| 4 | Complete (2026-08-14) | vercel.json (doc-verified keys), env.example, README runbook, CLAUDE.md Commands; evidence rows pending owner (ledger table) |

Ledger: `docs/progress/respin-m0/ledger.md` (append-only, created at build start).

## Plan Review Log

| Round | Reviewer | Verdict | Notes |
|---|---|---|---|
| 1 | respin-tenancy-reviewer | NEEDS CHANGES | 5 CHANGE (URL topology, admin gate placement, REQ-A04 record, race-test honesty, sanctioned-export bypass) + 5 NOTEs — all applied |
| 2 | respin-tenancy-reviewer (same agent, re-read) | NEEDS CHANGES → conditions met | Verified all round-1 fixes applied; 2 one-line residuals + 4 NOTEs, all fixed; reviewer: "passes on re-read without further debate" |
| final | plan-reviewer (generalist, consolidating) | **READY** | `docs/progress/respin-m0-plan-review.md`; 26/26 tasks simulate clean, 10/10 pre-mortem causes have receivers; 2 LOW findings folded into this plan (Neon-concurrency ledger row, CI-jobs provenance), notes carried to build start |

## Exit Demonstration (M0 acceptance, engineering vs evidence)

**Engineering completion (provable in this repo, no external accounts):**
- `pnpm -C respin typecheck && pnpm -C respin lint && pnpm -C respin test && pnpm -C respin build` all green.
- Migration applies to a fresh PGlite DB in tests; `db:check` reports no drift.
- Cross-workspace read suite green; raw-table-access lint green.
- `.github/workflows/respin.yml` exists, path-scoped, running those same commands.
- Repo-wide entry gate (CLAUDE.md Commands) still green — no new failures in UGC/Cutdown suites.

**Evidence completion (owner-credential-bound, reported as pending until executed):**
- A new user signs up (email or Google) on a live Clerk instance, lands in an empty product shell showing their personal workspace, and signs out. (build-plan M0)
- A PR produces a working Vercel preview deploy with root directory `respin/`. (build-plan M0, R-15)
- Fresh clone passes CI on GitHub. (Provable once pushed — pushing waits for explicit owner consent per golden rule 8.)
