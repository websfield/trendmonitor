# Phase R6 — Doc currency (closing step)

**Depends on:** R1, R2, R3, R4a, R4b, R5 (docs must reflect final code). **Executed by:** the orchestrator running the `/sync-docs` command (not a spawned agent). **Gate:** consistency self-check; `boundary-reviewer` if any invariant wording changed.

## Project Conventions Pinned (READ FIRST — verbatim from CLAUDE.md)

- **Docs-first / DoD:** an edit that touches an invariant updates its ADR, `integration-contract.md`, and the schema JSONs together. Docs must match reality; never invent capabilities.
- **Golden rule 6:** Report honestly. **Golden rule 1:** Read before you write.
- `sync-docs` only ever makes docs match reality — mechanical drift auto-fixed; subjective rewrites asked before applied.

## Requirements Checklist (functional)

1. **#6 (HIGH):** correct the false "design docs only / no source code / nothing deploys" claims in `RUNBOOK.md:3,7`, `CLAUDE.md` opening paragraph, `NORTH_STAR.md:59`, `.claude/project-context.md:7` — the repo now has a built, tested C#/Python/React codebase.
2. **#6:** regenerate RUNBOOK Deploy/Config/Observability from the ledger + on-disk evidence — fix `events-v1.json` "contract 1.1.0" → the on-disk version (now **1.3.0** after R0), the breaker endpoint label (hosts now exist post-R4a), add C4 + the React frontend, and the Configuration section ("None found" → `config/source-allowlist.yaml` which `exemplar.py`/`acquire.py` read).
3. **#22-27 (LOW, docs):** retire/annotate the second stale doc `docs/progress/ugc-intelligence-codebase-review.md`; surface phase-9's environment-blocked residuals (vitest, quarantine dirs, no lockfile) in RUNBOOK Observability; note the account/external-dependency inventory gap (or a pointer to ClientHub's).

## Requirements Checklist (technical)

- Every corrected claim is backed by an on-disk fact (a file that exists, a test that ran) — no optimistic rewrite.
- If R0..R5 changed any invariant wording, the ADR + integration-contract + schema stay consistent (they were changed in-phase; R6 only verifies).
- The "docs-only" correction is a statement of current fact, not a claim that everything deploys (no host is production-deployed yet; #7's RUNBOOK section from R4a states the real, limited deploy story).

## Edge Cases & Failure Paths

- **Over-correction:** don't claim the system is production-deployed. It is *built and tested*; deploy is R4a's documented-but-not-run path. State exactly that.
- **Subjective rewrite:** anything beyond mechanical drift (paths, counts, version strings, trees) is proposed to the user before applying (sync-docs rule).

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| R6-T1 | Correct "docs-only" claims (state: built + tested, not deployed) | sync-docs | `RUNBOOK.md`, `CLAUDE.md`, `NORTH_STAR.md`, `.claude/project-context.md` |
| R6-T2 | Regenerate RUNBOOK Deploy/Config/Observability from ledger + disk; fix version string to 1.3.0; add C4 + frontend; fix Configuration section | sync-docs | `RUNBOOK.md` |
| R6-T3 | Retire/annotate the second stale codebase-review doc; surface phase-9 residuals; note the DR6 unbuilt seams (Hangfire, `ArtefactStore` edge-caching) as known-seam entries so the doc set records them | sync-docs | `docs/progress/ugc-intelligence-codebase-review.md`, `RUNBOOK.md` |

## Files to Create / Modify

`RUNBOOK.md`, `CLAUDE.md` (opening paragraph only), `NORTH_STAR.md`, `.claude/project-context.md`, `docs/progress/ugc-intelligence-codebase-review.md`.

## Verification Steps

1. Grep the four docs for "docs only"/"no source code"/"nothing deploys" → zero stale matches after R6-T1.
2. Grep RUNBOOK for `1.1.0` near events-v1 → replaced with `1.3.0`; C4 and frontend now mentioned.
3. Entry gate: schemas parse (unchanged); no code touched, so build/tests unaffected.

## Acceptance Criteria (verifiable PASS/FAIL)

- **A-R6-1:** no doc claims the repo is "design docs only / no source code". (evidence: grep result)
- **A-R6-2:** RUNBOOK names the events-v1 version as 1.3.0, mentions C4 + the frontend, and points Config at `source-allowlist.yaml`. (evidence: RUNBOOK lines)
- **A-R6-3:** the second stale codebase-review doc is retired or annotated as superseded. (evidence: file header)
- **A-R6-4:** CLAUDE.md opening paragraph states the current built-and-tested reality without overclaiming deployment.

## Out of Scope

No code. No invention of capabilities. No claim of production deployment. Do not edit `docs/initial.backup/`.

## Completion Criteria (DoD)

Docs match on-disk reality; grep checks clean; if any invariant wording moved, ADR + contract + schema remain consistent.
