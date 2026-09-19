# Phase 1 review — creator-ready

**Phase closure recorded 2026-09-19 (orchestrator, at Phase 2's dependency gate — an evidence-completion record, not a new reviewer verdict).** The batch-4 final's two whole-phase residuals were: (1) Verification 3's live "4 of 4" header — closed by the owner-directed live capture of 2026-09-18 below; (2) `bad_shape` — the plan's own *Least confident* section says to record a refusal of a different kind rather than claim it solved, and the Completion Criteria owe no fix for it, so it is recorded (diagnosis below) and routed to the umbrella's Deferral Ledger as an owner decision (logging the Zod issue path is a product change on the onboarding surface). Every Completion Criterion has proof on disk: entry gate `creator-ready/entry-gate-phase-1-batch4.txt`, tenancy/billing/compliance/generalist PASS reports (`phase-1-batch4-*.md`, `phase-1-batch3-generalist.md`, `phase-1-batch1-billing.md`), five screenshots under `docs/progress/respin-service-quality/`. Phase 2 started on this basis (ledger 2026-09-19). Whole-Phase-1 status: **Ready on the plan's own DoD; live acceptance beyond Verification 3/6 unchanged.**

**Batch-4 record (2026-09-18): local implementation Ready / A; whole Phase1 Not yet.** Batch4 independently closes TEN02. All ten original findings are closed, with no new code findings. The declaration-binding collector now counts names before pruning function bodies; six new shadow plants fail before repair and the complete repaired suite passes115/115. Independent compiler/lint/runtime probes reject the original bypass and three held-out siblings while accepting unrelated nested controls. [Tenancy PASS](creator-ready/phase-1-batch4-tenancy.md); [final consolidation and all acceptance dispositions](creator-ready/phase-1-batch4-generalist.md).

All seven entry commands pass. Fresh full suite: **5,260 passed,101 Docker-skipped**; independent mapper selection49 passed. Billing, tenancy, compliance and local generalist all PASS. All48 source hashes, contract, lock and HEAD stayed stable. Test-only repair; no assertions removed or weakened.

**Outstanding:** `bad_shape` remains unresolved. Phase2 has not started.

**Closed 2026-09-18 (owner-directed live capture):** Verification3's completed onboarding header is now verified live at **4 of 4 done**, all four steps `done` — [screenshot](respin-service-quality/phase-1-onboarding-header-4of4.png), [full record](respin-service-quality/phase-1-onboarding-4of4-live.md). Driven manually through Playwright against the configured local environment on a new Free-plan workspace: 4 own posts saved (minimum 3), voice build succeeded and activated as Version 1, interview submitted, first ideas run (3 credits, balance 22), then `/onboarding` revisited. Real vendor calls and real spend. The prior 0/4 screenshot was correct for its moment: `respin/e2e/journeys/solo-creator.spec.ts:33` captures immediately after profile creation and never returns to `/onboarding` after the first-ideas chapter, so that journey has no step that could show 4/4. Before the run, the already-running dev server returned HTTP 500 on every rendered route (`Cannot find module './196.js'` from `respin/.next/server/webpack-runtime.js`) — a stale Next build cache, not a product defect; with owner approval the server was restarted with `.next` deleted, the worker left untouched. No product code, test, migration or database schema was changed. This is owner-directed evidence gathering, not an independent reviewer evaluation, and consumes no review allowance.

**`bad_shape` — still open, now diagnosed as structurally unloggable.** The voice build succeeded on the run above, so the refusal was not reproduced; the live sample is 1 refusal in 3 in-app runs, which resolves nothing. What is established, from the code rather than from the evidence, is why the failing schema field is unknown: `parseVoiceReply` (`respin/packages/llm/src/assemble.ts:473-480`) does compute the failing location and embeds the first Zod issue path in the thrown `AssemblyError` message, but `logRefusal` logs only `safeLogFields`' `{code, errorName, driverCode?}` (`respin/app/(product)/safe-log.ts:76-168`), which withholds the message as a content-safety containment boundary, while `respin/app/(product)/onboarding/actions.ts:323-333` adds `assemblyKind` alone. The field is therefore discarded on every occurrence by design — re-running the journey can never surface it. From the schema (`assemble.ts:175-188`), every level is `z.strictObject`, so an unrecognized key added by the model is the leading candidate, with empty `fields`, an empty `value`, or `inputId`/`quote` omitted rather than `null` also possible. No parser or logging change was made: recording the Zod issue path (content-free and server-derived) would make the next occurrence diagnosable, but that is a product change on the onboarding/compliance surface requiring owner direction and the applicable Critical-Path gates.

Docker API access was denied in the batch4 pass; the prior live journey, its five screenshots and the 5,354-test live run are retained as earlier evidence, not rerun here.

Owner authorized this bounded repair with “sure.” Batch4 is complete: two evaluations this pass,11 overall; prior rejected launch and retired slot retained. No further review allowance implied. Independent cross-model assurance unavailable. Records below preserve earlier evidence and superseded statuses.

---

## Prior batch3 status (superseded by batch4 above)
**Current resumption: Not yet — batch3 closes GEN02; TEN02 remains Medium, and Verification3's live “4 of 4” onboarding header is unverified.** Nine of ten original findings are independently closed. Fresh typecheck and lint pass; the two repaired test files pass 286 tests. The separate tenancy run passes 221 tests across six files but demonstrates a block-local `mapBack` function that bypasses the scanner's unchanged-binding check. The original getter/prototype bypasses are closed; no production override was found. [Batch3 tenancy report](creator-ready/phase-1-batch3-tenancy.md).

The final independent review passes merged compliance and closes GEN02: actual callbacks/components pass20/20 with restored copy; planting “Guaranteed success.” only in `VOICE_DOCUMENT_NEEDED` produces19 passes and exactly one failure in the new no-Voice row. Its fresh Studio suite passes178/178. Billing batch1 PASS is retained on unchanged inputs; tenancy remains NEEDS CHANGES/B. [Final report, all ten finding dispositions and AC1–12](creator-ready/phase-1-batch3-generalist.md).

The retained live journey, five screenshots and 5,354-test live-suite result remain evidence from the prior pass, not new live runs in this resumption. The header screenshot shows0/4; the journey does not revisit onboarding after first ideas, and the successful second workspace's Voice/Studio captures do not establish4/4. Docker API access is denied here. `bad_shape` remains unresolved: it occurs at the strict reply-schema boundary before quote matching; the saved evidence does not identify the offending schema field. No speculative parser change was made.

All48 assessed file hashes, contract, lock and HEAD remained stable. No product code changed in this resumption. Tail diff check: not triggered; no assertions removed or weakened. Gates ran lean (consolidated), tenancy separate; independent cross-model assurance unavailable. Review spend: two evaluations this resumption, nine overall (batches0/1/2/3:3/2/2/2); prior pre-creation rejection and retired slot retained. Batch4 is unused. GEN02 closure leaves TEN02 under the repeated-finding convergence stop; unused budget does not override it. Phase2 has not started.

Next action requires an explicit bounded TEN02 repair/review override under [gate-rules §5](../../.claude/gate-rules.md#5-convergence-stop-rule): “If work still fails to converge, stop revising.” The independent reproducer is concrete and recorded above. Separately owed: live Verification3 evidence and a controlled `bad_shape` diagnosis in an accessible environment. Phase2 Environment/spend confirmation remains unanswered; no dispatch or new spend authorized by that missing answer.

---

*Prior owner-directed pass and batch2 history follow unchanged.*

**Overall: Almost — owner-directed pass of 2026-09-18 (afternoon) repaired TEN02 and GEN02 and ran the live journey; the two repairs are not yet independently re-reviewed, and the live run surfaced one real service-quality observation (voice build refused `bad_shape` on 1 of 2 live runs).** Eight of ten original findings were independently closed in batch 2; the remaining two are repaired below with mutation witnesses, pending a reviewer's confirmation. The solo-creator journey passed live against the configured local environment and all five required screenshots exist under `docs/progress/respin-service-quality/`. Phase 2 has not started.

## Owner-directed pass — 2026-09-18 (after batch 2)

The owner directed one bounded further pass on TEN02 and GEN02 and asked for the live journeys with Playwright, which overrides the canon §5 convergence stop recorded below for exactly that scope.

| Item | Repair | Witness (planted defect goes red, restored goes green) |
|---|---|---|
| P1-TEN-02 | `respin/packages/llm/tests/assemble-kinds.test.ts` — the `parseVoiceReply` argument scan now accepts only plain data properties (`PropertyAssignment` / `ShorthandPropertyAssignment`); any accessor or method (a getter's body runs with `this` bound to the params object and can define `mapBack` before the seam destructures) and any `__proto__` key (sets the prototype the seam's destructure reads through) is `supplied parseVoiceReply mapper`. Six new plants: getter-defined, setter-bearing, method override, method-shaped field, prototype override, quoted prototype override. Production caller `packages/credits/src/infer-voice.ts:236` is a plain literal and still counts as the one normal caller. | Guard reverted in memory (accessor test and `__proto__` test each replaced by `false`): getter-defined, setter-bearing, method-shaped, prototype and quoted-prototype plants all **red** (5 failed / 1 passed — the method-override plant is already caught by the name check); guard restored, file hash `f0701923…` identical before and after. |
| P1-GEN-02 | `respin/tests/studio-ui.test.tsx` R20/R21 `STATES` gains "brain active without a Voice document" (`brainActiveWithoutVoice: true`, `activeKinds: ["Strategy", "Kill test"]`), so the `studio-no-voice` banner and `VOICE_DOCUMENT_NEEDED` enter the forbidden-claims sweep. | `VOICE_DOCUMENT_NEEDED` planted with "Guaranteed success." → the new row **red**, every other row green; literal restored, `run-copy.ts` hash `e02082bc…` equals the batch-2 manifest entry. |

Focused run after both edits: `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts tests/studio-ui.test.tsx` → 286 passed / 2 files. `pnpm -C respin typecheck` and `pnpm -C respin lint` exit 0. Full suite with `TEST_DATABASE_URL` live (Docker suites running, no skips): first run 5,352 passed / 2 failed in one file whose name the truncated capture did not retain; the 23 Docker suites alone then passed 101/101, and a full rerun of the same command passed **235 files / 5,354 tests**, 563.7 s (`docs/progress/respin-service-quality/phase-1-full-suite-live.txt`). The first-run pair is recorded as unidentified, not diagnosed as flake.

**Live journey (Verification 6).** Docker Desktop started, `respin-postgres` up, migrations applied, `next dev -p 8000` and `node --env-file=.env.local --import tsx worker/main.ts` running from `.env.local` (names checked, no values read). `pnpm -C respin exec playwright test e2e/journeys/solo-creator.spec.ts` → **1 passed (3.5 m)**, 21 screenshots; console log and Playwright summary copied to `docs/progress/respin-service-quality/phase-1-solo-creator-journey.log` / `phase-1-solo-creator-playwright.txt`. Chapter outcomes:

- Sign-up lands on `/onboarding` (AC4 live). Profile, four own posts saved.
- **Voice build refused live: `assemblyKind: 'bad_shape'`** (server log, content-free), screen copy "The model reply did not have the required voice-draft structure." with the run counted as included. A second live workspace's included run on the same four posts drafted 9 rules with a quote behind every one and activated as Voice version 1; a one-call off-app probe with the same prompt also parsed (4 fields). So the live sample is 1 refusal in 2 in-app runs, kind `bad_shape`, not the `quote_not_found` class T1 tolerated — exactly the outcome the plan's "Least confident" section said to record rather than claim solved. Not repaired here; owner item.
- Creator-tier checkout refused `tier_checkout_rollout` (payment parked); journey continued on Free as designed.
- First ideas usable; Studio Hooks/Caption/Ideation usable; feedback recorded; Trends niche and paste tier-blocked on Free (T8 branch taken, `niche-disabled-tier` visible); Results log withheld (no declared metric on Free); Usage balance visible; sign-out.
- No `pageerror` lines in the journey log.

**Five screenshots** (`docs/progress/respin-service-quality/`): `phase-1-onboarding-header.png` (viewport, "Set up your creator profile" + 0 of 4 checklist), `phase-1-brain.png` (Voice version 1 in force, second workspace), `phase-1-studio-notice.png` (journey capture: "Voice document needed" banner above a live Hooks draft, Strategy and Kill test in force), `phase-1-studio.png` (AC10: usable Hooks draft with Voice in force, second workspace), `phase-1-trends-free.png` (journey capture: Free tier block on niche tracking and paste).

**Not done in this pass:** independent re-review of the two repairs (batches 3–4 of the owner cap remain unused); a fix for the live `bad_shape` refusal. Both need the owner's direction.

---

*Batch-2 record as written before this pass follows unchanged.*

**Overall: Not yet.** Eight of ten original findings are independently closed. Two Medium test-coverage gaps remain: TEN02 mapper containment and GEN02's missing Studio voice-notice honesty state. The fresh seven-command local gate passes. The convergence rule stops further revisions; live journeys and five required screenshots remain unavailable. Phase2 has not started.

| Gate | Current result | Evidence / limit |
|---|---|---|
| Release | Not released | Workspace changes; owner waived checkpoint. |
| Entry gate | PASS after final scanner repair | All seven commands exit0 with installed Git Bash selected. Earlier WSL-launcher failures remain in the [fresh transcript](creator-ready/entry-gate-phase-1-resume.txt); final section supersedes them. |
| Full suite | 5,246 passed;101 skipped | 212 files passed;23 Docker files skipped. Earlier5,203/5,221 runs retained as history. |
| Mutation witnesses | Local PASS | [Core](creator-ready/phase-1-mutations-core.txt) and [presentation](creator-ready/phase-1-mutations-presentation.txt): required defects red, restored green, target hashes restored. Strengthened affected witnesses rerun after repairs. |
| Billing | PASS / Ready A | Batch1 independently closes BILL-P1-001/002;308 focused tests pass. [Report](creator-ready/phase-1-batch1-billing.md). |
| Tenancy | NEEDS CHANGES / Almost B | TEN-01/03 closed; batch2 rejects earlier bypasses but TEN-02 remains partial for getter injection.215 focused tests pass. [Report](creator-ready/phase-1-batch2-tenancy.md). |
| Generalist / compliance | NEEDS CHANGES / Almost B | GEN01/03/04/05 closed; GEN02 partial.413 focused tests pass. Local generalist retains TEN02; merged compliance retains GEN02. [Final report](creator-ready/phase-1-batch2-generalist.md). |
| Review allowance | Seven completed evaluations | Batch0:3; batch1:2; batch2:2. Four completed this resumption. Batch1 final retired unused; earlier rejected pre-creation launch retained separately. Unused batches3–4 do not waive convergence stop. |
| Acceptance / DoD | Not met | AC2 and AC8 partial; AC10 lacks screenshot. Live journey/five screenshots remain owed. |
| Reachability | Locally tested; live unverified | Auth, page/action and panel tests pass; no live journey. |
| Session model | Runtime unexposed | Builders requested Sol/high and Terra/xhigh; reviewers Astra/max. No resolved-runtime claim. |
| Intensity | Gates ran lean (consolidated) | Billing and tenancy separate full paths; compliance merged into final generalist; optional simplifier omitted. |
| Fixed without re-review | None | Eight findings closed by independent review; no cosmetic closure used. |
| Tail inspection | Prior99 non-test source lines retained | Current repair is test-only with no removed/weakened assertions: tail diff check not triggered. Earlier declaration assertion caught and restored during construction. |
| Evidence integrity | Corrections retained | Original batch0 review restored after builder overwrite. One batch1 historical hash corrected from retained original reviewer output after shallow-copy error; current48 hashes always matched. Provenance retained in execution record. |

## Repair accounting

Ten original findings: **8 closed,2 open/partial**. The scanner's recurring class received bounded diagnosis and repair, then failed held-out getter injection in batch2. Final review also retained GEN02's omitted honesty state. No further revisions under canon §5. No current production override, guarantee, High finding or fix-induced regression established.

| Finding | Current repair evidence |
|---|---|
| BILL-P1-001 | CLOSED: `respin/tests/onboarding-ui.test.tsx:1549` renders all three pre-vendor money refusals. |
| BILL-P1-002 | CLOSED: `respin/tests/onboarding-ui.test.tsx:1692` independently pins both named initializers. |
| P1-TEN-01 | CLOSED: `respin/packages/llm/tests/assemble-kinds.test.ts:322` distinct literal edge/surrogate predicate and seam cases; strengthened w2b/w2e. |
| P1-TEN-02 | OPEN: `respin/packages/llm/tests/assemble-kinds.test.ts:746` accepts an accessor that supplies a mapper. Earlier wrapper/namespace/binding escapes now rejected; no actual production override found. |
| P1-TEN-03 | CLOSED: `respin/tests/selected-profile-pages.test.tsx:301` real listed-error page paths show safe remedies and retain unknown; unexpected errors rethrow. |
| P1-GEN-01 | CLOSED: `respin/tests/results-page-wiring.test.tsx:223` real Results children render shared Free notice once. |
| P1-GEN-02 | OPEN: `respin/tests/studio-ui.test.tsx:2005` STATES omits brainActiveWithoutVoice=true. Matrix/remedies repaired; a forbidden notice-copy plant still passes existing scans. |
| P1-GEN-03 | CLOSED: `respin/tests/studio-ui.test.tsx:916`, `first-ideas-ui.test.tsx:560` exact four-row/two-offer fixtures and mirrored disclosure assertions; separate creator-TikTok control retained. |
| P1-GEN-04 | CLOSED: `respin/tests/studio-ui.test.tsx:709`, `first-ideas-ui.test.tsx:711` exact four-state fold text/count/set and placement; W6c catches untagged text moved inside existing fold. |
| P1-GEN-05 | CLOSED: `respin/tests/page-wiring.test.tsx:316` declaration/destructure/named-hook counts and isolated controls. |

Builder focused results: core421/421; presentation255/255; owned lint and typechecking passed. Parent observed the final full gate, which supersedes earlier concurrent-edit typecheck failures.

## Acceptance status

Final independent assessment: AC1/3/5/6/7/9/11 pass locally; AC12 passes on recorded mutation evidence. AC4 code/tests pass but live verification remains pending. AC2 and AC8 fail their remaining guard obligations. AC10's automated portion passes but its Studio screenshot is absent. The full AC1–12/DoD and eight-point compliance walk is in the final report. Five required screenshots remain absent: onboarding header, Brain, Studio notice, draft and Free Trends.

Current batch2 source hashes: [manifest](creator-ready/phase-1-review-manifest.json), base `79de2dbb14944f2f3089c621dc8bc9d31e0c1882`;48 source/decision files, accepted phase contract and lock unchanged. Batch0/1 snapshots retained under history; only the mapper-scanner test differs from batch1. [Execution/reservations](creator-ready/phase-1-execution.md), [append-only ledger](creator-ready/ledger.md).

## Blockers and next action

The earlier agent-thread-limit blocker is resolved. Both batch2 assessments are complete. TEN02 remains Medium after the diagnosed repair; GEN02 remains Medium after its earlier repair. The invoked [$go skill](../../.agents/skills/go/SKILL.md) routes through the [implementation gate](../../.claude/commands/implement.md), which requires [gate-rules §5](../../.claude/gate-rules.md): “If work still fails to converge, stop revising.” Further revisions are paused under that rule; unused budget is not an override.

Presence-only probes found live process variables absent; Docker engine unavailable. No denied environment files or credential values read. Build passed despite denied environment-file loading. No live model call, deployment, database write or Phase2 dispatch. Phase2 remains blocked on Phase1 completion and its own owner Environment/spend prerequisites; Phase3 remains parked.

Next action: owner direction on one explicitly bounded further repair/review pass for TEN02 and GEN02, overriding the convergence stop if desired. Live acceptance still requires the configured local app/database/vendor environment; no credentials should be supplied in chat. Phase2's dependency gate says “never build on unproven work,” so it remains blocked until Phase1 proof is complete.

Manual evidence bridge retained; no helper-verified or independent cross-model Codex result claimed.
