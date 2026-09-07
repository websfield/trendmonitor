# Codebase Review — Respin M0 (Skeleton)

**Date:** 2026-08-14 · **Workflow:** Feature Development (greenfield) · **Brief:** `docs/plans/respin-m0-brief.md`

## Requirement IDs satisfied

| ID / source | What M0 delivers of it |
|---|---|
| REQ-A01 (PRD §4A) | *Partial:* sign up with email or Google (Clerk), land in a personal workspace. Profile-count-per-tier limits are M2 scope (creator_profiles table does not exist yet). |
| tech-spec §1 | Repo layout inside `respin/` (`app/` route groups marketing/product/admin + api; `packages/db`); stack per R-5; `app/` imports `packages/`, never the reverse. |
| tech-spec §2 | Subset: `users`, `workspaces`, `memberships` tables (uuid v7 ids, created_at/updated_at) with initial migration + seed. |
| tech-spec §6 | Clerk middleware on `(product)`/`(admin)`; the single `withWorkspace(ctx)` scoping helper; cross-tenant read test suite; secrets in env only. |
| build-plan M0 | Scaffold, auth, DB + migration, CI (typecheck/lint/test/migration check), Vercel deploy config with previews. CI/deploy is platform plumbing, justified by M0's own acceptance criteria. |
| R-15 (decisions.md) | Build home `respin/`, self-rooted; CI path-scoped to `respin/**`; Vercel root directory = `respin/`. |

## Roadmap fit and dependencies

M0 is the first Respin build session; **nothing must already have shipped**. Proof of greenfield: `respin/**` glob returns no files (2026-08-14). The two sibling product lines (`src/`, `cutdown/`) are untouched.

## Modules touched / ownership

All new, under `respin/` (owner: `respin-engineer`), plus three pack/infra files at repo root:
- `.github/workflows/respin.yml` — new, path-scoped, patterned on `.github/workflows/cutdown.yml` (the proven precedent per D-57).
- `.claude/workspaces.json` — replace the note-only `respin/.*\.(ts|tsx)$` entry with a blocking check once `respin/package.json` exists (the entry itself says to do this; specific-before-broad ordering).
- `CLAUDE.md` Commands block — add the Respin entry-gate commands (Definition of Done: docs updated when config changes).
- `docs/initial/decisions.md` — append-only entries for defaults the doc set doesn't settle (package manager; test-database strategy).

## Cross-boundary reach

None. Respin reads nothing from `src/` or `cutdown/`. The only shared surfaces are repo-root CI directory and the pack config files listed above.

## Critical-Path triggers

| Path | Triggered? | Why |
|---|---|---|
| Respin brain tenancy | **Yes** | Workspace/membership schema, workspace bootstrap on first login, the `withWorkspace` helper, role enum, admin allowlist gate (T1, T5 of the skill). |
| Respin billing & credits | No | No Stripe, no ledger, no config table in M0 (M1). |
| Respin spin compliance | No | No trends/ingest/generation code. |
| Respin learning honesty | No | No results/proposals code. |
| UGC / Cutdown paths | No | Their trees are untouched. |

## Inherited stopgaps

**None found — greenfield.** Evidence: `Glob respin/**` → no files. The flows this feature extends do not exist yet. The one pre-existing marker is deliberate: `.claude/workspaces.json`'s note-only respin entry, retired by this plan (Phase 1 task).

## Exact file surface

See master plan → per-phase *Files to Create/Modify* tables. Summary: everything under `respin/` (new), the three root files above (modified/new), `docs/initial/decisions.md` (append).

## Existing patterns to follow verbatim

- **Self-rooted subproject:** `cutdown/` — own package.json/lockfile/tsconfig/lint config referencing nothing above itself (R-15; lesson 2026-08-02 — pin every config inside `respin/` explicitly or the enclosing repo's config applies silently).
- **Path-scoped CI:** `.github/workflows/cutdown.yml` (trigger `paths: [cutdown/**]`, jobs run with the subdir as working directory).

## Risks (shared things this could break)

1. Root-config inheritance (eslint/tsconfig walking up) — mitigated by pinning configs in `respin/` and verifying which config produced a green lint (lesson 2026-08-02).
2. `.claude/workspaces.json` edits are order-sensitive (first command-bearing match wins) — the new respin entry must sit before broader patterns; the post-edit hook's parse check covers JSON validity.
3. A CI workflow that isn't path-scoped would run Respin jobs on UGC/Cutdown pushes (and vice versa) — copy cutdown.yml's `paths:` discipline.
4. Committing secrets while wiring Clerk/Neon — env vars only, `.env*` is deny-listed from reads and gitignored; `.env.example` carries names, never values.
