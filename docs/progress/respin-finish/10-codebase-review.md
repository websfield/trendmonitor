# Respin Phase 10 current-code review (2026-09-05)

**Purpose:** dependency proof and implementation map for the repaired Phase 10 plan. This is a code review, not completion evidence. Slices 8, 8c, 9a, and 9b remain `ALMOST`; Phase 10 may reuse only the exact interfaces named below and inherits none of their missing browser, vendor, pilot, or clean-entry-gate evidence.

## Current truth

| Area | Existing authority that must be reused | Gap Phase 10 must close |
|---|---|---|
| Result learning | `packages/brain/src/comparison.ts`, `proposal.ts`; `MIN_COMPARABLE_RESULTS = 3`; DB-scoped proposal persistence and explicit confirmation/activation | `quantified_self_reported` currently enters numerical comparisons and proposals, contradicting `CLAUDE.md`'s verified-only rule. No production writer can mint `connector_verified`. |
| Spin | `packages/modes/src/pipeline.ts`, `similarity.ts`, `modes.ts`; the real `analyseAndSpin` path owns one rewrite, terminal refusal, and the hard three-axis similarity gate | The landing page is a hard-coded mockup. A generic no-brain generation has no equivalent Spin gate and must not be called Spin. |
| Tenant generation money | `@respin/credits` generation service, attempt/idempotency state machine, `model_usage`, ledger settlement, tier/concurrency checks | API callers need a distinct machine principal but must enter this exact service. No duplicate settlement path is permitted. |
| Sessionless spend | `packages/db/src/system-spend.ts` and schema: atomic claims, durable usage, one `system_spend_daily` row, conservative unknown finalisation | Types and attribution are autopsy-only. Generalise the existing authority to a closed purpose union including `public_sample_spin`; do not add a second daily budget or unmetered demo path. |
| Credits/admin | `adjustCredits`, `refundCredits`, append-only ledger, `ADMIN_USER_IDS` platform-admin gate | Positive adjustments can be never-expiring; pause/deletion policy and business idempotency are absent. Refund capacity can be bypassed by alternate reference spellings because the original debit has no dedicated identity. No admin UI may call these functions first. |
| Stripe | Signature-verified webhook; handler and `stripe_events` completion share one transaction and event-id idempotency | No authoritative revenue writer, refund/credit-note recognition, immutable business-object identity, or incomplete-cost margin state. |
| Human tenancy | Session-minted `WorkspaceScope` / `ProfileScope`, membership roles, scattered capability factories | There is no compile-closed capability registry, seat/invite authority, ownership-transfer/last-owner rule, or owner-only workspace administration contract. |
| Machine tenancy | None | Workspace-owned Studio API keys need one verifier/mint returning a branded, least-privilege API scope. A fake session `userId` is forbidden. |
| Retention/deletion | `creator-data-registry.ts` drives descriptions/export; backup and restore scripts exist | The registry is not executable, new tables can escape it, workspace sessions are user-global, and deletion tombstones do not survive an independent database restore. |
| Platform policy | Free-form platform strings and model-authored `output.disclosure` | A closed platform registry and deterministic, dated disclosure presenter must replace the model as policy authority. |
| Observability | `app/(product)/safe-log.ts` allows product-authored codes/fields and refuses raw exception messages | No collector/funnel integration. Any collector must disable bodies, headers, cookies, query strings, replay, attachments, prompts, completions, brain text, and raw identifiers. |

## Dependency proof: exact reusable interfaces

- **From 8/8c:** `runGeneration`, `analyseAndSpin`, `assertTrustedReference`, `evaluateSpinSimilarity`, `outputTextUnits`, the metered tenant generation orchestrator, system-spend claim/finalise, and worker scheduling/health. Phase 10 must re-run relevant checks and does not inherit the missing real browser/latency/pilot evidence recorded in the open-items register.
- **From 9a/9b:** result rows, exact metric-declaration grouping, proposal lifecycle, feedback-proposal construction, explicit accept/reject, and coherent activation. Phase 10 deliberately changes only result-derived eligibility to verified-only; repeated categorical feedback proposals remain permitted because they are creator-reviewed feedback rules, not performance inference from unverified numbers.
- **From auth/billing:** membership roles, session scope mint, authoritative subscription/tier lookup, Stripe event transaction, ledger fold, and pause authority. Phase 10 adds callers only after closed capability, lifecycle, idempotency, and money contracts exist.

## Repair decisions applied to the plan

1. Store and display self-reported results, but exclude them from numerical comparison, baselines, effects, and result-derived proposals. Result-based learning is visibly unavailable until a real connector can write `connector_verified`; connectors remain post-pilot.
2. The public proof is one real, zero-credit **Sample Spin**: a visitor supplies an idea, the product adapts a checked-in fictional reference through a checked-in fictional sample brain, and displays the synthetic original beside only a gate-passed Spin. There is no generic-generation control.
3. Keep two money domains, each with one authority: tenant credits/usage for authenticated generation, and one global system-spend authority for every sessionless vendor call. Public demo spend generalises the latter; it does not create a third ledger.
4. Workspace administration is owner-only. Platform curation and money operations remain separately gated by `ADMIN_USER_IDS`. API keys are workspace-owned and can mint only the closed Studio generation capability.
5. Executable lifecycle coverage precedes new invite/revenue/audit/key/counter tables. Every later table must register export, deletion, retention, executor action, and an independent residue probe in the same change.
6. Exact margin is withheld whenever revenue or cost is unresolved, unknown, or cross-currency. Known revenue, known tenant cost, unknown counts/amount, and system overhead remain separately visible; unknown is never zero.
7. The current backup script deliberately leaves storage undefined. R-124 now gives implementation one reversible target: Amazon S3 Standard behind `DeletionJournalStore`, with conditional create, Versioning + Compliance Object Lock, SSE-S3, checksum/digest verification, split principals, day-28 purge, and no assumed Free Tier. Provisioning/purchase and a real restore remain external evidence.

## Sequence and handoff contracts

| Slice | Must exist before it starts | It hands to the next slice |
|---|---|---|
| 10b-1 (executes first) | Current inspected schema/writer inventory | Executable per-row-class lifecycle registry; deletion state machines; independent journal before tombstone acknowledgement; restore replay; receiver/probe contract that later tables must satisfy |
| 10a (executes second) | 10b-1 executable lifecycle gate plus inspected 8/9 interfaces | Verified-only learning correction; real metered Sample Spin; generalised system-spend authority; short-lived demo limiter registered/probed in the creating change; content-safe observability and exact activation aggregate |
| 10b-2 | 10b-1 lifecycle contract and 10a system-spend/demo interfaces | Closed human capability registry; owner/seat/invite flows; contained credit/refund callers; authoritative revenue recognition and withheld-margin states; curation authority, with every new table registered |
| 10c | 10a real Spin/system-spend/observability contracts, 10b-2 human authority, and 10b-1 lifecycle contract | Workspace-owned API principal; exact tenant-generation parity; Free/API abuse controls; closed platform-policy registry; truthful launch pages, with every new table registered |

## Source files to open before editing

- Learning: `packages/brain/src/comparison.ts`, `packages/brain/src/proposal.ts`, `packages/db/src/promotion-ops.ts`, result/promotion UI and tests.
- Demo/spend: `packages/modes/src/pipeline.ts`, `similarity.ts`, `modes.ts`, `output.ts`, `packages/db/src/system-spend.ts`, `system-spend-schema.ts`, `packages/credits/src/generate.ts`, marketing page and worker.
- Authority/deletion: `packages/db/src/with-workspace.ts`, `packages/db/src/creator-data-registry.ts`, auth schema, backup/restore scripts.
- Billing: `packages/credits/src/ledger.ts`, refund/adjustment code, Stripe webhook handler/schema, spend rollups.
- API/disclosure: server actions/routes, run-copy platform list, output schema/presenter, config and package-isolation tests.

## Known evidence residuals that remain open

- Slices 8/8c/9a/9b remain `ALMOST`; exact residuals stay in `docs/progress/respin-finish-open-items.md` and their report cards.
- There is no connector-verified result writer in M6. Therefore no fixture, manual entry, or sampled demo may be reported as verified performance learning or as closing the pilot metric.
- The generation path is buffered and exceeds the documented latency target. Phase 10 uses a terminal `checking` response and states no latency figure; it does not claim streaming.
- Vendor provisioning, legal review, production deployment, live email delivery, and real pilot evidence remain separate acceptance evidence and cannot be manufactured by unit tests.

## Least confident

The independent deletion journal/backup expiry mechanism is the largest operational change and the one least proven by current code. Phase 10b-1 must prototype its restore-before-traffic ordering and residue verifier before any later retained table is allowed to rely on it.
