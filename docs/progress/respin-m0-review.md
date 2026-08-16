# M0 Review — Respin Skeleton · Report Card

> **Addendum 2026-08-14 (same day, post-review): stack pivot R-18/R-19 shipped.** Owner dropped Neon/Clerk/Vercel for Lightsail + self-hosted Postgres; Better Auth replaced Clerk end-to-end. Local Postgres runs in Docker (`respin/docker-compose.yml`, port 5435) with migration + seed applied and verified. The swap went through its own full gate cycle: plan gate (tenancy NEEDS CHANGES → fixed; generalist plan-reviewer's 4-fix Ready-list applied) and code gate (three rounds → **PASS, Ready A**). Post-swap evidence: **59/59 tests** including a REAL sign-up→session flow on PGlite and deployed-middleware tests with the genuine session cookie (incl. the `__Secure-` HTTPS variant); keyless build green with sign-in/up static; **Clerk-zero** grep repo-wide; 7 tables verified in the Docker DB. The M0 sign-up evidence run is now **locally provable with zero third-party accounts** (email/password). Remaining evidence rows: the local sign-up run itself, and the first Lightsail deploy (shape decided at deploy planning). The Vercel rows below are superseded by R-18.

**Date:** 2026-08-14 · **Plan:** `docs/plans/respin-m0-master-plan.md` (4 phases, all complete) · **Ledger:** `docs/progress/respin-m0/ledger.md`

## Overall readiness: **Ready (engineering) / Pending (evidence)**

Build-plan M0's own rule applies: engineering completion and evidence completion are separate claims. Everything provable inside this repo is green; the three criteria requiring the owner's Clerk/Neon/Vercel accounts are honestly **pending**, with an exact runbook at `respin/README.md`.

## Gates

| Gate | Result | Evidence |
|---|---|---|
| Plan review (2 tenancy rounds + generalist) | READY | `docs/progress/respin-m0-plan-review.md`; 10 findings fixed pre-build |
| Entry gate — Respin | PASS | typecheck, lint, 41/41 tests (×2 runs), `db:check` "Everything's fine", keyless `next build` |
| Entry gate — rest of repo (no new failures) | PASS | schemas parse; dotnet 0 errors + 454/454; pytest green; ruff clean; frontend typecheck + 86/86 |
| Critical Path: Respin brain tenancy (code) | **PASS** (round 2, "Ready, A") | round 1 NEEDS CHANGES → 3 CHANGE + 5 NOTEs fixed; fixes verified by execution incl. live lint-scope probes |
| Least-confident probe (Clerk middleware wiring) | Held after fix | reviewer probed it first; found the deprecated-API + matcher-divergence pair; now the tested functions ARE the deployed matcher |
| Definition of Done | PASS | docs updated in-change (CLAUDE.md Commands, decisions R-16/R-17, build-plan M6 deletion receiver, workspaces.json); deferrals all ledgered |

## What got built

- `respin/` self-rooted pnpm workspace: Next.js 15 app (`/` marketing, `/sign-in` `/sign-up`, `/studio` shell, `/admin` placeholder) + `@respin/db`.
- Clerk auth: middleware boundary in URL terms (tested functions = deployed matcher), admin allowlist **fail closed**, resource-side layout checks.
- `users`/`workspaces`/`memberships` schema (uuid v7, roles per REQ-A02), committed migration + dev-guarded idempotent seed.
- Tenancy core: transactional `ensureUserWorkspace` (resolve-existing-on-conflict, repair path, rollback-proven), `withWorkspace` verify-membership-then-scope with an enumerable accessor map, default-deny lint making the raw connection unreachable outside `packages/**`.
- CI (`.github/workflows/respin.yml`, path-scoped) + Vercel config (`vercel.json`, doc-verified) + owner runbook (`respin/README.md`).

## Pending owner evidence (from `respin/README.md`)

1. Clerk live sign-up → `/studio` shell → sign-out.
2. Vercel project (Root Directory `respin/`) + PR preview deploy.
3. Push to GitHub so CI proves "fresh clone passes" (git policy: push only on your ask).

## Residuals (all ledgered, none blocking)

- Neon-based bootstrap concurrency test → M1 entry (SHORTCUT-marked; PGlite is single-session).
- Empty-string email guard at the bootstrap call site → M1, before billing reads the row (agreed with reviewer).
- Deviations recorded: env template is `respin/env.example` (pack guardrail denies `.env.*` writes); sign-in/up pages live under the URL-invisible `(auth)` group.
