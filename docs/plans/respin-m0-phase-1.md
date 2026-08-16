# Phase 1 — Self-rooted scaffold + CI

**Feature:** Respin M0 · **Depends on:** none · **Owner agent:** `respin-engineer`

## Project Conventions Pinned (READ FIRST)

- **Golden rules (CLAUDE.md, binding):** (1) Read before you write — never state a code "fact" unverified. (2) No secrets in code/commits/logs. (3) Never destroy what you didn't create without explicit confirmation. (5) Match the codebase — a new dependency needs a reason the standard library can't answer. (6) Report honestly — "done" is a claim the checks back. (7) Small verifiable steps. (9) **Current facts beat trained memory** — verify Next.js 15 / Drizzle / Clerk / pnpm APIs and config schemas against the installed versions (lockfile, type definitions, official docs) before use.
- **Lesson 2026-08-02 (verbatim):** for a tool that resolves config by walking UP the directory tree (ruff, eslint, git attributes…), a nested self-rooted project having "no config file" means "the enclosing repo's config, silently" — pin the subproject's own config explicitly, and treat a green lint claim as vacuous until you know *which* config produced it.
- **Lesson 2026-07-21 (verbatim, adapted):** a dependency install is proven by importing each package, never by the installer's exit code.
- **Stack (R-5, settled — don't re-litigate):** Next.js 15 App Router + TypeScript; pnpm (this plan's R-16); Zod at boundaries. Layout per tech-spec §1 *inside `respin/`*: `app/` (route groups `(marketing)`, `(product)`, `(admin)`, plus `api/`) and `packages/*`. **Rule: `app/` imports from `packages/`; packages never import from `app/`** (guardrail `respin-package-imports-app` warns on violation).
- **R-15 (settled):** `respin/` is self-rooted — no file in it references anything above `respin/`; CI path-scopes to `respin/**`; extraction stays a directory copy.
- **Available agents:** `respin-engineer` (builder). Do NOT request `ugc-*`, `cutdown-*`, or `control-plane-*` agents for this work.
- **Git policy:** commit only when the person asks; Checkpoints are on — the orchestrator announces a snapshot before the phase.

## Requirements Checklist (functional)

- [ ] tech-spec §1 layout exists inside `respin/`: `app/(marketing)`, `app/(product)`, `app/(admin)`, `app/api`, `packages/` (db lands in Phase 2 — create the dir with a `.gitkeep`-free placeholder only if pnpm workspace globs require it; otherwise Phase 2 creates it).
- [ ] `(marketing)` renders a minimal landing placeholder at `/` (no design work — M6 owns the real page).
- [ ] build-plan M0: typecheck, lint, and test commands exist and pass; CI workflow runs them path-scoped.

## Requirements Checklist (technical)

- [ ] Every config pinned inside `respin/`: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json` (strict), `eslint.config.mjs` (flat, with `root`-equivalent isolation), `vitest.config.ts`, `next.config.ts`, `.gitignore` (covers `.env*`, `.next`, `node_modules`).
- [ ] An eslint rule (e.g. `no-restricted-imports` / import-x boundary) enforcing "packages never import from app/" — the import-direction rule as lint, not convention.
- [ ] `engines.node: ">=22"` and CI pins Node 22.
- [ ] No file under `respin/` references a path above `respin/` (R-15).

## Edge Cases & Failure Paths

- **Inverse events:** none (no runtime state yet). Teardown = `rm respin/` remains a clean directory delete; nothing outside it depends on it except the three root files this plan owns.
- **Double failure:** CI fails AND local passes → the workflow must print tool versions (node, pnpm) so environment drift is diagnosable (lesson 2026-08-10: present-and-verified vs present-and-unrun).
- **Degraded mode:** `pnpm install` partially failing must not yield a green build — acceptance runs typecheck (which imports every package) after install, never trusting exit codes alone.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Proof |
|---|---|---|---|---|
| GitHub Actions | workflow syntax/paths wrong | CI silently never runs on respin changes | `paths:` copied from cutdown.yml pattern; verification step 6 dry-checks trigger paths | VS-6 |
| Root repo tooling | enclosing config leaks in | vacuous green lint | eslint flat config in `respin/` + acceptance AC-4 names which config ran | AC-4 |

## Handoff Contracts

- **To Phase 2:** pnpm workspace resolving `packages/*` as `@respin/<name>`; `pnpm -C respin test` runs vitest across root + packages; CI workflow file at `.github/workflows/respin.yml` accepting added steps.
- **To Phase 3 — URL topology (pinned, master plan "Decisions baked in"):** route groups are **URL-invisible**, so pages must not collide on `/`. `(marketing)/page.tsx` owns `/`; the product shell lands at `/studio` (`(product)/studio/page.tsx`), admin at `/admin` (`(admin)/admin/page.tsx`), auth public at `/sign-in` + `/sign-up` — all created in Phase 3. `(product)`/`(admin)` stay empty dirs in Phase 1.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | Init pnpm workspace + Next.js 15 TS scaffold (verify current create-next-app/manual layout against installed versions) | respin-engineer | `respin/package.json`, `respin/pnpm-workspace.yaml`, `respin/next.config.ts`, `respin/tsconfig.json`, `respin/app/layout.tsx`, `respin/app/(marketing)/page.tsx`, `respin/.gitignore` |
| 2 | Pin eslint flat config incl. import-direction boundary rule; pin vitest + one smoke test | respin-engineer | `respin/eslint.config.mjs`, `respin/vitest.config.ts`, `respin/tests/smoke.test.ts` |
| 3 | Scripts: `dev`, `build`, `typecheck`, `lint`, `test` | respin-engineer | `respin/package.json` |
| 4 | Path-scoped CI workflow (Node 22, pnpm cache, typecheck+lint+test+build; prints tool versions) | respin-engineer | `.github/workflows/respin.yml` |
| 5 | Replace note-only respin entry with blocking check (typecheck+lint+test), ordered before broad patterns | respin-engineer | `.claude/workspaces.json` |
| 6 | Append R-16 (pnpm; lazy workspace-bootstrap default) to the decision log | respin-engineer | `docs/initial/decisions.md` |

## Files to Create / Modify

All task files above: **new** except `.claude/workspaces.json` and `docs/initial/decisions.md` (**modified**; decisions.md is append-only — never edit an existing entry).

## Verification Steps (paper-dry-run: command · required state · established by)

1. `pnpm -C respin install` · repo checked out · task 1.
2. `pnpm -C respin typecheck` · step 1 done · tasks 1–3.
3. `pnpm -C respin lint` · step 1 done · task 2. Then prove config provenance: `pnpm -C respin exec eslint --inspect-config app/layout.tsx` (or the installed equivalent) shows `respin/eslint.config.mjs`.
4. `pnpm -C respin test` · step 1 done · task 2.
5. `pnpm -C respin build` · steps 2–4 green · tasks 1–3.
6. `node -e "JSON.parse(require('fs').readFileSync('.claude/workspaces.json','utf8'))"` + read the diff: respin entry is above broader patterns · task 5.
7. Grep `respin/` for `\.\./\.\.` style escapes above root and absolute repo paths → none (R-15) · tasks 1–2.
8. Repo entry gate unaffected: run the CLAUDE.md Commands block; no new failures vs current green.

## Acceptance Criteria (PASS/FAIL, with evidence)

- AC-1: Steps 1–5 all exit 0 (command output).
- AC-2: `/` renders the marketing placeholder in `next build` output (route listed).
- AC-3: A deliberate `app/`-import inside a file under `packages/` (temp fixture in the lint test) fails lint — the boundary rule is alive (test name).
- AC-4: Lint provenance shown: the config that ran is `respin/eslint.config.mjs` (step-3 output).
- AC-5: `.github/workflows/respin.yml` triggers only on `respin/**` (+ its own path) (file:line).
- AC-6: R-16 appended, numbered after the highest existing entry, append-only (diff).

## Least confident (one line)

That Next.js 15 + pnpm workspace `transpilePackages`/workspace-protocol resolution works cleanly with `packages/*` on the first pass — verify against installed Next docs before task 1, not after a failing build.

## Out of Scope (Surgical)

No DB, no auth, no Vercel files (Phases 2–4). No edits to `src/`, `cutdown/`, `docs/initial.past/`, or any existing decisions.md entry. No design work on the landing page.

## Completion Criteria (Definition of Done)

Entry gate clean (no new failures repo-wide); tenancy gate not applicable this phase (no queries/auth yet) but runs at M0 review; docs consistent (R-16 appended); all ACs pass.
