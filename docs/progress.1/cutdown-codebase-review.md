# Codebase Review — cutdown (Phase 0 implementation)

**Date:** 2026-07-21 · **Workflow:** Feature Development (greenfield product inside an existing repo)

## Requirements satisfied

Cutdown Phase 0 binds to the Cutdown PRD (`docs/video-editing/PRD.md`), not the UGC Intelligence REQ set. **Note:** PRD §7's Must/Should labels describe the *first hosted beta* unless a phase is stated — so a Must outside this list is hosted-beta scope, not a Phase 0 omission.

In scope (tech-spec §15): REQ-001, REQ-002, REQ-003, REQ-004, REQ-005; REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, REQ-015; REQ-017 transcript-embedding subset; REQ-018, REQ-019; REQ-030, REQ-031, REQ-033, REQ-034, REQ-036, REQ-037, REQ-038, REQ-039; REQ-050 single-platform; REQ-060 and REQ-061 minimal; REQ-080, REQ-081, REQ-082, REQ-083, REQ-084, REQ-085, REQ-086, REQ-087, REQ-088 subsets pinned in Phases 4–5; REQ-100, REQ-102 advisory subset, REQ-103, REQ-104, REQ-105, REQ-106; REQ-110 review-data subset; REQ-113 lineage; REQ-152 local-state subset; REQ-163 and REQ-164 record-level. D-37 separates deterministic blockers from advisory critic findings; D-35 defines warning-only waivers.

Explicitly deferred to Phase 1+: REQ-006/007, 016, REQ-017's frame/clip/near-duplicate remainder, 020, 032, 035, 040, 051–059, 062–067, 070–077, 089/090, 101/107, REQ-110–116 remainder, 120–130, 140–145, 150/151 and 153–157, REQ-152's hosted/publishing remainder, and 161/162/165/166. REQ-160 remains a standing non-goal.

## Roadmap position & dependencies

- First Cutdown build work; nothing precedes it. The doc set is complete and gap-reviewed as of 2026-07-21 (four-lens review; findings fixed in `tech-spec.md`, `decisions.md`, `developer-guide.md` — this plan's contract).
- **No dependency on any UGC Intelligence component** — tech-spec §14 declares full independence; nothing in `src/` is called, and no artefact from the three in-flight UGC plans is consumed.
- Owner prerequisites are explicit gates: fixtures unblock implementation; D-21/D-27 gate Phase 3 live acceptance; D-27/D-36 gate real proving and `PHASE_0_EXIT_EARNED`. `PIPELINE_IMPLEMENTATION_COMPLETE` is reported separately per D-38.

## Modules touched / ownership

All new, all inside two roots:
- `cutdown/` — the entire product (self-rooted pnpm + uv workspaces; layout is tech-spec §2, which is authoritative).
- `.claude/skills/cutdown-*/` — generated mirror only (never hand-edited; produced by `cutdown skills sync`).

Nothing under `src/`, `tests/`, `config/`, or `docs/initial/` is touched. `docs/video-editing/decisions.md` receives appended rows as the developer logs decisions (by design).

## Cross-boundary reach

None. Cutdown reads/writes only its own `cutdown/project-data/` and its own SQLite file. No call, import, database, or event crosses into the UGC Intelligence planes (tech-spec §14 is the enforcement contract; the plan pins it into every phase).

## Critical-Path triggers

**None of the four UGC Critical Paths apply** (veto/verdict, boundaries/authority, measurement, budget/exploration) — they gate `src/` invariants Cutdown doesn't have (tech-spec §14). Gates for this plan: entry gate = `cutdown validate:contracts` + `build:contracts` + `test:skills` (self-bootstrapped in Phase 1 of this plan); per-phase review = `code-reviewer` (ordinary code review); plan gate = `plan-reviewer`.

## Inherited stopgaps

None found — greenfield: `cutdown/` does not exist yet (verified: repo root listing contains no `cutdown/`), so there are no env-var defaults, TODOs, or placeholder flows to inherit. The UGC planes were not grepped because no flow is extended from them (see Cross-boundary reach).

## Files to create (top level; per-phase plans carry exact paths)

`cutdown/{pnpm-workspace.yaml, package.json, pnpm-lock.yaml, pyproject.toml, uv.lock, .tool-versions, .gitignore}`, committed generated contract trees, `cutdown/packages/{contracts, editorial, renderer-core, renderer-ffmpeg, qa, style}/`, `cutdown/apps/cli/`, public skills, indexer worker, local workflow, and data fixtures. Deferred modules remain `review-web`, Remotion, OTIO, full platform registry/trends, Temporal, evaluation worker/skill.

**Repo-root `.gitignore`:** no change needed — `cutdown/project-data/` is ignored by a `cutdown/.gitignore` created in Phase 1, keeping the parent repo untouched (extractability).

## Existing patterns to follow

- Schema discipline: mirror the `docs/initial/schemas/` convention (versioned files, never mutate published) — pattern only, no imports (tech-spec §3).
- Entry-gate posture: mirror CLAUDE.md's "entry gate clean first" with Cutdown's own commands (developer-guide §4).
- The decision journal pattern (`DECISIONS.md`) is replicated as `docs/video-editing/decisions.md` appends.

## Risks

1. **Toolchain friction on Windows** (FFmpeg-with-libass availability, Python subprocess spawning) — mitigated: preflight capability assertion, argv-array contract (tech-spec §6.2/§11); Phase 1 proves both before anything depends on them.
2. **Contract churn burning the "no breaking change in last 10 outputs" exit criterion** — mitigated: high-blast-radius conventions pre-pinned (tech-spec §3), editorial schemas land in one phase, breaking changes front-loaded.
3. **Model spend without a ceiling** — recorded fixtures may earn Phase 3 implementation-complete, but live acceptance remains explicitly blocked by D-21; the two states cannot be conflated.
4. **Rights-sensitive footage mishandling** — `project-data/` gitignored from Phase 1, minimized model inputs (PRD §10.7), rights records required at ingest.
5. **Parallel UGC work in this repo** — zero file overlap (all-new roots), so no merge risk beyond `.claude/skills/` where the mirror uses the `cutdown-` prefix to avoid name collisions with pack skills.
