# Respin remediation — planning evidence, 30 September 2026

## Behaviour contract and scope

Preserve the existing scoped, credit-metered Studio and reference journeys. A creator should be able to arrive without a concept, select a stored idea, commission a script at its disclosed price, revise it, choose a version and reopen/export its recording pack without another model call or debit. Approved context, references, generated history and measured results retain separate authority. Changes to financial, creative or source policy require their recorded decisions before implementation.

This is a **planning-only baseline**, not a production audit or release acceptance. Input: `C:/Users/FredWang/Downloads/Respin-Phased-Remediation-Plan-2026-09-30.md`, version 1.0. Local HEAD inspected: `3533dbfcf40a19924d5665e772f5a7411017817f`; initial `git status --short` returned no changes. No live services, customer admission or paid calls were exercised.

Execution plan: inspect source and unfinished masters; map each RP requirement to one implementation owner; write three linked masters in `docs/plans`; validate paths/coverage and obtain one independent plan review. The requested master-level documents contain work-package contracts inline. Existing phase plans remain the detailed contracts for inherited work; no duplicate phase-file tree is created.

## Verified code and entry points

| Area | Inspected implementation | Consequence for the plans |
|---|---|---|
| Studio commission | `respin/app/(product)/studio/actions.ts`: `generateAction` calls `requireUser`, `scopeForUser`, creates `randomUUID()` per submission and calls `respinCredits.generate` | L2 must distinguish transport replay from a new commission at the existing authority. |
| Revision boundary | `respin/packages/credits/src/generate.ts`: `GenerateParams.revisionOfAttemptId`, scoped parent resolution, `GenerationRequest`/`hashRequest`; `packages/credits/tests/revision.test.ts` | Selecting an ideation item for a full script is a new operation with separate source lineage, never a discounted cross-mode revision. |
| Scoped stored reads | `respin/packages/db/src/with-workspace.ts`: `readGenerationForAttempt`, `readGenerationAttempt` query through `both(...)` scope predicates | Extend existing scoped capabilities and facades; UI must not access tables or implement a competing ownership check. |
| Creative contract | `respin/packages/modes/src/assemble.ts`: ideation requires an arguable claim and an offered framework; `output.ts`: strict ideas/beats, nonblank `vo`, exactly one `isTurn` | L1 needs a versioned prompt/parser/check/render change. Silent video is outside launch scope. |
| Current generation context | `respin/packages/credits/src/generate.ts`: frameworks bounded by config; voice/strategy/KillTest, current input, revision parent and reference mechanism | L3 adds bounded, explicitly classified recent-work context; existing text is not automatically verified biography. |
| Stored output presentation | `respin/app/(product)/studio/generation-outcome.tsx`: `replayed` branch reports storage/refusal but does not render the document | L4 adds a read-only, version-aware presentation path. |
| Disclosure presentation | `respin/packages/credits/src/presented-output.ts`: `presentedDisclosure` and `presentedTextUnits` remove model-authored disclosure prose | Saved views and export must reuse this presentation policy, not expose raw generated policy advice. |
| Data lineage | `respin/packages/db/src/generation-schema.ts`: attempts have a payload hash/candidate/state; generations store request, brain/framework/context versions, outcome and `parentId` | Extend the existing storage; preserve immutable generation and accounting history. |
| Feedback | `respin/packages/db/src/feedback-ops.ts`: scoped capture/read; `respin/packages/brain/src/proposal.ts`: fixed reaction mappings and minimum distinct-generation evidence | Explicit preferences belong in L3; inference from exact edits and positive examples belongs in J2, with `packages/brain` remaining proposal authority. |
| Offer | `respin/app/(marketing)/pricing-copy.ts`: current tiers and conditional capabilities; `docs/initial/gtm.md`: YouTube wedge | L5 reconciles the enabled offer and records a TikTok/Instagram targeting amendment; no new price or entitlement is assumed. |
| Lifecycle | `respin/packages/db/REGISTERING-A-TABLE.md`: schema, migrations, registries, column census, physical writers, export, retention and populated erasure witnesses | Each new field/table lands with its full lifecycle in its owning package, never a later clean-up phase. |

Entry traces to preserve: `/studio` → server action → credits facade → scoped database capabilities → modes pipeline → settlement; `/trends` → reference breakdown → separately commissioned Spin; `/brain` → explicit approval; `/results` → scoped reads → brain proposals; `/settings/account` and `/api/export` → existing lifecycle/export authority. New saved-record route is proposed as `/studio/saved/[attemptId]?profile=<id>` and is not claimed to exist.

## Requirements and decisions

- RP1-01/02/04 bind REQ-B04, C01–C04, C06, D02, G02/G04/G05 and I02–I05.
- RP1-03 binds REQ-A03/A04, B02, C05/C08. RP1-05 binds REQ-G01–G08, H01 and I04.
- RP2 extends those journeys plus REQ-C07, D01–D05, E01–E08 and F01–F05; RP3 integrates them and proposes an amendment to PRD §5's success measures.
- Current REQ-F03/R-115 is stronger than older checklist shorthand: at least three comparable connector-verified treatment observations **and** three eligible verified outside-treatment baseline observations; manual values never establish verification or numerical learning.
- PRD C01/C02's claim/turn contract, D02's framework eligibility, R-11 targeting, current hard taste rules and commercial policies remain current until the named amendment is approved. Planning a replacement does not amend them.
- `NORTH_STAR.md` contains outdated milestone language and older success criteria. The three masters plan an explicit update with preserved historical definitions; this session does not silently change the North Star or Claude-owned policy.

## Verification observed

`pnpm -C respin exec vitest run packages/modes/tests/output.test.ts packages/credits/tests/revision.test.ts packages/brain/tests/proposal.test.ts tests/studio-ui.test.tsx tests/landing-pricing.test.ts`

**PASS: 5 files, 269 tests, exit 0.** This is a narrow implementation baseline, not proof of proposed behaviour, real Postgres concurrency, creative quality, deployed behaviour or the full entry gate.

An earlier invocation using `pnpm -C respin test -- ...` collected tests outside the intended filters. It was interrupted (exit 1); no pass is claimed for that run. The explicit `exec vitest run` invocation above supplied the bounded baseline.

## Risks and negative witnesses

| Risk | Required negative witness / receiving package |
|---|---|
| Selected concept smuggles text or another profile's ID | L2: forged ID/index/payload denied before provider; source read is server-derived. |
| History becomes factual authority | L3: unsupported personal event, number and `[check]` remain unverified across follow-up and revision. |
| Retry rebuilds context after preference/config change | L2/L3: identical operation observes its durable snapshot; incompatible payload reuse refuses. |
| New creative form breaks stored output | L1/L4: pre-change fixtures reopen and export after new writer release and rollback. |
| Saved view spends or is blocked by low balance | L4: zero provider calls/debits on reads, including zero-credit and paused accounts with continuing read rights. |
| New data survives deletion/restoration | Every writer's lifecycle tests; L6 intended-environment restore/delayed-job witness. |
| New master erases an old finding or restriction | Launch carry-forward matrix preserves owner, evidence, parked status and review limits. |
| Small-cohort proxy becomes a growth claim | L6/J5/R3: frozen denominators, failures/dropouts retained, preparation/filming labels separated from connector metrics. |

## Deferred work and inherited evidence

The cross-plan disposition and exact receiving packages are in [the launch master](../plans/respin-launch-remediation-master-plan.md#existing-plan-disposition). Existing evidence stays at its original paths; future programme updates use `docs/progress/creator-ready/ledger.md`. Historical plan verdicts and consumed review rounds are not reset by this amendment.

Discovery command: `rg -n '^## Deferred|activates with:' docs/progress -g 'progress-and-log.md'` returned no matches in this checkout. This does not mean no deferrals exist: the older masters' Deferral Ledgers, `docs/progress/respin-finish-open-items.md`, `todos.md`, and programme ledgers are the actual carry-forward sources.

## Planning boundaries

No new core dependency is selected. Existing providers, storage, pnpm/Vitest/Playwright and lifecycle machinery remain the implementation foundation. Unshipped dependencies are explicit entry gates in the masters; their downstream packages cannot start until the prerequisite is proven. New providers, paid research runs, policy amendments, parked money work and release operations remain decision-gated. Those gates do not prevent completing the planning documents.

## Independent plan review

Round 0: launch and creator-journey masters NOT READY / Grade C; recurring-workflow master READY / Grade A. Two build-changing gaps: L1 omitted creator-selected versus automatic form choice; J2 omitted the amendment/evidence contract for richer inference beyond the inherited closed-static feedback rule. Both were repaired together. L1 output-version ownership was clarified in the same batch.

Round 1: all three masters **READY / Grade A**, with both findings closed and no dependency regression in the scoped execution simulation. The reviewer rechecked all three frozen hashes. Gate ran: **2 runs, including 1 re-run**. Verdicts and reviewed hashes are in each master's Plan Review Log. Required product/policy/parked-work approvals, implementation checks, external witnesses and cohort evidence remain separate prerequisites.

Documentation checks: local Markdown links/anchors and all 22 RP IDs passed; 122 root-relative paths were expanded during author validation, with missing paths explicitly identified as proposed additions or outputs of prerequisite packages. Two mistaken existing-path references were corrected before the first gate. `git diff --check` passed. This session changed planning documents only; the narrow 269-test baseline above is the only completed product-test run, not the full entry gate.
