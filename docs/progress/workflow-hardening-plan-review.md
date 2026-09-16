# Workflow hardening — plan review record

Readiness: Ready. Final verdict: READY/A. Cutdown PASS/A; security PASS/A and generalist READY/A after focused confirmation of T5's metadata-only single-link validation and synthetic alias witnesses. No unresolved plan findings remain. User accepted the 53-file single-phase size risk on 2026-09-10. This current verdict supersedes historical pending-approval and NOT READY statements below.

Final-round accounting: three Astra/max contexts ran in round 3; security and generalist then each performed one additional focused confirmation of the hard-link correction (an additional round, not part of the original verdict). Five reviewer invocations this continuation; no independent cross-model review or implementation assurance claimed.

Implementation checkpoint: `git stash push --include-untracked -m "claude-jig checkpoint: workflow-hardening phase 1"` exited 1 with `Unable to create .../.git/index.lock: Permission denied` and `could not write index`. No stash apply was attempted because no snapshot was created. Source implementation has not started; user disposition is required by implement.md's checkpoint rule. Existing work remains in place.
Date: 2026-09-10. This is a plan review, not evidence that workflow fixes have shipped.

## Review execution and limits

The create-plan workflow started three independent reviewer contexts in round 1:

- Security reviewer (Sol/max): completed, BLOCK on the original draft.
- Cutdown boundary reviewer (Sol/max): completed, NEEDS CHANGES on the original draft; all 13 checklist rows classified.
- Plan-integrity reviewer (Sol/max): started last, supplied two additional execution findings, then was paused before its final verdict because an external routing-policy change needs user direction.

Those dispatches used the previously observed policy. AGENTS.md subsequently observed on disk requires Astra/max for new reviewer dispatches. The 2026-09-10 implementation request resolved the wider routing scope in favor of migrating every affected project, native and generated route.

Round 2 then ran separate Astra/max security and Cutdown boundary contexts, followed by an Astra/max plan-integrity context last. Security returned NEEDS CHANGES with one Medium and one Low finding. Cutdown returned NEEDS CHANGES with one CHANGE and two NOTE findings after classifying all 13 checklist rows. The plan-integrity reviewer consolidated them as NOT READY, Grade D, with six findings. No code-review PASS or independent cross-model assurance is claimed.

## Consolidated findings and disposition

Locations below point to the revised phase contract. “Incorporated” means the draft now specifies the correction; it does not mean code exists or a reviewer has approved the revision.

| ID | Severity / confidence | Finding | Draft disposition / evidence |
|---|---|---|---|
| S1 | High as originally raised; runtime-exploit claim narrowed | Noncanonical Windows forms lacked an explicit contract | Incorporated: T2/G5 rejects unsupported forms before matching and adds lib.js/guardrails.js to the manifest. Phase 1:105. Lexical misses were observed, but real Node stat returned ENOENT for trailing-dot/space examples; no successful alias write was demonstrated. |
| S2 | Medium / high | Generated names/collisions lacked Windows-equivalence rules | Incorporated: portable lowercase grammar, reserved-name rejection and case-insensitive destination keys; T5/S3, Phase 1:145. |
| S3 | Medium / high | An unclassified new writer silently inherited ordinary-model defaults | Incorporated structurally: explicit five-writer classification and fail-closed population parity; T6/R1. The exact wider routing migration now covers `.codex/config.toml`, all three native routes, `.codex/codex-overlay.md`, and all 30 marked generated agent projections. |
| S4 + P2 | Medium / high | Doctor hashing and sync source/marker/custom/native reads lacked a complete pre-open boundary | Incorporated: one shared pre-open policy, explicit permitted inputs, no-follow/reparse checks and open-spy cases for both scripts; T5/S3/S5, Phase 1:151. Arbitrary Claude-tree hashing is removed from the plan. |
| S5 | Low / medium | Timeouts lacked a real child/grandchild cleanup witness | Incorporated: actual owned-tree termination/reaping witnesses and bounded cleanup failure reporting; T1/H2 and T3/H5, Phase 1:99,123. |
| S6 | Low/info / low | Containment did not address a concurrent reparse swap | Incorporated: recheck immediately before writes, fixture witness, single-writer requirement and explicit exclusion of hostile concurrent workspace mutation; T5/S4, Phase 1:155. |
| C1 | Medium / high | Cutdown checks could implicitly sync/install Python dependencies | Incorporated: exact generator/validator preflights and child-inherited offline/no-sync/frozen/no-Python-download controls; Verification Steps 9-10, Phase 1:257. |
| C2 | Low/medium / high | Fatal orphan status lacked writer census and explicit non-destructive recovery | Incorporated: repository writer inventory, upstream source-restoration remedy first, optional separately authorized marked-projection cleanup only; T5/S4, Phase 1:153. |
| P1 | Medium / high | The proposed focused C4 route did not compile the C4 Host | Incorporated: full solution build before Architecture tests, real solution membership assertion and healthy/broken-host fixture; T3/H6, Phase 1:119,127. |
| A1 | Parent execution check | A generic Node entry guard could disable hooks.json's require-based bootstrap | Incorporated: PowerShell-only dot-source guard, preserved configured Node entrypoint and H7 bootstrap witness; T0, Phase 1:93. |

Accounting before round 2: nine unique reviewer findings (P2 merged into S4) plus one parent refinement = ten incorporated contract refinements. Round 2 confirmed those closures and raised three substantive coverage gaps plus three documentation/decision gaps, listed below.

Withdrawn finding: the proposed extra start-teams adapter write. Its existing marked wrapper dynamically reads the canonical command; the planned body-only edit leaves frontmatter and generated bytes unchanged. D1 now pins this read dependency. No unnecessary adapter rewrite is planned.

## Partial execution simulation / pre-mortem

The generalist established C4 Host command-scope and sync-read boundary failures. The parent also traced the configured Node hook bootstrap. The known Windows-path, process-lifecycle, unsafe-read, model-classification, orphan-recovery and offline-dependency failure modes have receiving tasks/tests in the revision.

The round-1 generalist did not return a completed phase-by-phase simulation or final consolidated verdict. Round 2 supplied the missing full simulation: T0-T4 and T7 were executable; T5 and T6 were not executable without the structural ownership/orphan-read definitions and exact-manifest widening witness below.

## Mechanical checks and evidence

Initial draft checks passed: 8/8 requirement presence, 19/19 file/task closure, one phase, four unique invariant IDs and verbatim golden rules. Before round 2, the scope-pinned audit passed 8/8 requirement presence, 53/53 file/task closure, 30/30 generated target parity, four unique invariant IDs and `git diff --check`. The post-finding mechanical audit must be rerun before any authorized final review; mechanical success alone is not READY.

Only plan documents were edited by this task. The external AGENTS.md edit is preserved. Product builds/tests, migration/concurrency checks and implementation reviewer gates were not run. Installed uv help verified offline/no-sync/frozen/no-Python-download controls; node help verified the test-name filter; dotnet reported 10.0.302. pnpm --help failed EPERM, so toolchain readiness is not claimed.

## Round-2 findings and disposition

| ID | Severity / confidence | Finding | Post-review disposition |
|---|---|---|---|
| R2-1 | Medium / high | Marker substring matching can misclassify and overwrite a custom adapter that merely quotes the generated marker | Incorporated in T5/S2-S4: generated ownership now requires a kind-specific exact marker at its canonical structural position; quoted/embedded/misplaced marker fixtures must remain custom and byte-identical |
| R2-2 | Medium / high | Exact migration scope had no planted otherwise-valid source that widens outputs before writes | Incorporated in T6/R3: independent plan-manifest comparison plus added valid read-only-agent, skill and command fixtures, each refusing before the first write |
| R2-3 | Low / medium | Source-less orphan candidates were not clearly part of the safe marker-read population | Incorporated in T5/S2-S5: fixed-depth candidate enumeration, metadata-only discovery, pre-open validation and fail-before-read handling are explicit |
| R2-4 | Low / high | “Atomic” migration wording contradicted the permitted partial-write/idempotent-retry path | Corrected to one coherent inventory/generator invocation with truthful partial-write recovery |
| R2-5 | Low / high | Prior review/handoff text still described routing scope as unresolved | Corrected across the phase, master plan, codebase review and this record |
| R2-6 | Low / high | The >25-row size signal lacked explicit user acceptance | Still pending; the proposed one-phase disposition is documented but not attributed to the user |

Round 2 is exhausted under the plan's own budget. R2-1 through R2-5 change or clarify what will be built and therefore need another independent confirmation; that next review requires explicit user authorization. R2-6 also requires the user's explicit acceptance.

## Resolved scope and continuation gate

AGENTS.md now specifies Astra for orchestration/reviews, higher effort for ordinary Terra and verifier Luna routes, while generated/native/config files still reflect the earlier policy. The implementation request resolves the scope by including that full migration while preserving AGENTS.md as user-owned input.

The phase contains 53 exact file rows. This exceeds the 25-row size signal. The proposed disposition keeps one phase because one generator invocation computes the complete marked projection population and splitting documents would not shrink the real write surface. The implementation request authorizes complete WF-08 scope, but it does not by itself accept this review-risk trade-off.

Rounds 1 and 2 did not produce READY. A final confirmation round is not authorized yet. Claude-owned T1 also remains an external owner handoff; this plan never authorizes Codex writes under .claude/**.

## Verdict

NOT READY — round-2 findings R2-1 through R2-5 are incorporated but not independently confirmed; R2-6 and one final review round need explicit user approval.

Ask $go to explain a finding in plain words.
