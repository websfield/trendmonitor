# Phase 5 — Package, Approve, Revise, Skills Sync + Mirror, Phase-0 Status

**Feature:** cutdown · **Depends on:** 4 · **Owner agent:** general-purpose

## Project Conventions Pinned (READ FIRST)

*(Identical block to `cutdown-phase-1.md` §Project Conventions Pinned — paste verbatim into the implementing agent's prompt; normative here.)*

Phase-5 additions:
- The `.claude/skills/cutdown-*` mirror is **generated only** — `cutdown skills sync` output is never hand-edited, and mirror names are prefixed to avoid colliding with the pack's installed `review`/`plan`/`validate` skills (tech-spec §2/§6.3).
- Approval is a human act recorded with a name — `cutdown approve` never runs inside an automated flow; the runner's `review` state exits only on a ReviewDecision file (D-9).
- Approval references the reviewed draft render, EDL revision, and RenderManifest. It cannot reference a future package. The resulting final package references the approval (D-35/D-36).

## Requirements Checklist (functional)

- [ ] REQ-088 *Phase-0 subset* (final-tier master, captions, cover/first frame, rights/disclosure, final QA, EDL, provenance + D-36 contract set); REQ-103 record-level; REQ-163 and REQ-164 record-level; REQ-105 Phase-0 release states; REQ-039; REQ-110 data-level; REQ-113; REQ-152 Phase-0 approval → final-render → packaging transition
- [ ] tech-spec §15 steps 8–9 *Done when* + `cutdown status --phase0` (step 10 tooling)

## Requirements Checklist (technical)

- [ ] `content-package-v1.json`, `review-decision-v1.json`, `qa-waiver-v1.json` schemas (+ committed regen). ReviewDecision has `subjectDraftRenderId`, `subjectEdlId`, and `subjectRenderManifestId`, never a package reference
- [ ] `skills/meta-schema.json` strict (D-15); `registry.json` generated; sync fails on dangling `contractsUsed`
- [ ] Mirror wrapper per tech-spec §6.3: 4-step body (author request valid against input schema → write to `requests/` → `skills run` → report/surface structured error), prefixed name, real description, CLI tool permission
- [ ] `status --phase0` uses D-36 evidence only: stable `accountId`, `sourceClassification`, package `contractSet`, approval, final range validation, QA/waivers, rights. It reports implementation and product-exit milestones separately

## Implementation Tasks

| # | Task | File(s) |
|---|---|---|
| 1 | `approve` skill + CLI: ReviewDecision references the reviewed draft/EDL/manifest, records approver/timestamp/decision/notes, and is immutable. Approval advances `review → final-rendering`; rejection advances only to `revise`. Duplicate/conflicting decisions preserve history; explicit latest-decision selection is deterministic | `cutdown/skills/approve/**`, `cutdown/packages/contracts/schemas/review-decision-v1.json`, `cutdown/workflows/local/src/gates.ts` |
| 2 | `package` skill: accept a **final** render only after an approval referencing its ancestor draft and final QA `pass` or `pass_with_waivers`; verify final/draft `editorialPlanHash` equality and permitted manifest differences; assemble ContentPackage with approval ID, contract set, range-validation ID, captions, rights/disclosure, QA/waivers, EDL, cover, and provenance. Refuse draft, unapproved, editorially divergent, failed-QA, blocker-waived, expired/unknown-rights, or evidence-incomplete inputs | `cutdown/skills/package/**`, `cutdown/packages/contracts/schemas/content-package-v1.json` |
| 3 | `revise` skill: interpret notes → structured constraints (LLM, recorded-fixture tested) → regenerate **narrowest** object (caption fix ≠ new brief); parent IDs on every new revision; no re-index (cache proof) | `cutdown/skills/revise/**`, `cutdown/packages/editorial/src/revise.ts` |
| 4 | `skills sync`: meta-schema validation, registry generation, mirror generation with the 4-step body; idempotent (re-sync = no diff when nothing changed) | `cutdown/apps/cli/src/commands/skills-sync.ts`, `cutdown/skills/meta-schema.json` |
| 5 | `status --phase0`: count approved packages with `sourceClassification=real`, group by stable `accountId`, require each package's final range validation, compare the last ten approved-real packages' ordered `contractSet` values against the contract-change timeline, and require rights + final QA evidence. Show fixture counts, warning-waived counts, missing evidence, `PIPELINE_IMPLEMENTATION_COMPLETE`, and `PHASE_0_EXIT_EARNED` separately | `cutdown/apps/cli/src/commands/status.ts` |
| 6 | Review payload assembler (variant, angle, hook hypothesis, moments, rights status, rationale — REQ-110's data without the UI) written into `reviews/pending/` | `cutdown/packages/editorial/src/review-payload.ts` |

## Edge Cases & Failure Paths

- Package attempted before approval, from a draft, after final-QA failure, with an attempted blocker waiver, or with missing evidence → refused with cited IDs. Warning waiver is included and counted separately. Rights expiry blocks. Conflicting decisions remain immutable and deterministic. Approval never names a package that does not exist. Ambiguous revision notes require structured confirmation. Mirror/registry failures remain fail-closed.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Proof |
|---|---|---|---|
| LLM (revise interpretation) | schema-invalid ×2 | structured error; original artefacts untouched | fixture |
| Filesystem (package assembly) | partial bundle crash | atomic directory build (staging + rename); no half-package ever in `packages/` | kill test |
| Claude Code mirror invocation | malformed conversational input | wrapper's step 1 asks for missing required fields; never invents brief values | manual round-trip script |

## Handoff Contracts (consumed by Phase 6)

- ContentPackage directory layout + release states; ReviewDecision format; `status --phase0` output shape; the working `/cutdown-*` mirror.

## Verification Steps

1. Phase 4 evidence on disk (QA-passed draft render).
2. `cutdown approve <draft-render-id> --by "Fred"` → ReviewDecision referencing draft/EDL/manifest lands; runner produces final render and runs final QA.
3. `cutdown package <final-render-id>` → complete bundle referencing the approval and D-36 evidence. Before step 2, the same command fails; a draft render also fails.
4. `cutdown revise <draft-render-id> --notes "tighten the opening"` → new EDL revision, parent linked, **no re-index**; rejection path exercises the same flow.
5. `cutdown skills sync` twice → second run no-diff; then `/cutdown-propose` conversational round-trip produces a valid request + result (requires task 4's sync; independent of verification steps 2–4).
6. `cutdown status --phase0` against a seeded history: fixture packages excluded from real counts; account display-name change does not split `accountId`; schema-major bump inside the last ten keeps criterion 3 red; warning waiver is visible; missing evidence keeps the relevant criterion red.
7. Full entry gate: `validate:contracts`, `build:contracts`, `test:skills` green.

## Acceptance Criteria (PASS/FAIL)

- tech-spec §15 steps 8–9 flow proven in order: draft approval → final render → final QA → package; lineage resolves in both directions without a cycle.
- Fail-closed proofs: pre-approval, draft, draft/final editorial-hash mismatch, failed-QA, blocker-waiver, expired-rights, and missing-evidence packages are refused.
- Revise narrowness: caption-level note does not spawn a new CreativeBrief (lineage evidence).
- `status --phase0` matches the hand-computed 20-output scenario, including stable account IDs, fixture exclusion, contract bump, final-range evidence, waivers, and missing records.

## Out of Scope

`review-web`, `evaluate`/analytics, OTIO export, publishing anything, post-copy/hashtag generation (REQ-054 — product Phase 1), `skills serve` (D-13 stretch, not a task).

## Completion Criteria (Definition of Done)

Draft-approval → final-render/QA → package flow and D-36 status scenario green; Cutdown entry gate green; `code-reviewer` PASS; honest report; decisions appended.
