# Slice 9b codebase review — proposals, promotion, and the brain asset

**Reviewed:** 2026-09-05  
**Plan receiver:** [`respin-finish-phase-9b.md`](../../plans/respin-finish-phase-9b.md)  
**Dependency:** Slice 9a is engineering-complete but remains `ALMOST`; its unrun browser evidence and `9a-G1` test-harness timeout do not block this code dependency.

## Current reachable path

`/results` is already protected, navigation-linked, and backed by one scoped composition:

```text
ProductNav
  -> app/(product)/results/page.tsx
  -> respinDb.resultComparisons(scope, profile.id)
  -> ProfileScope.accessors.comparableResults(...)
  -> @respin/brain.buildComparisonGroups(...)
  -> ResultsView / ComparisonView
```

Logging follows `LogPanel -> logResultAction -> respinDb.recordResult`. The page renders raw result history and honest comparison states, but it has no proposal reader, proposal decision action, or Performance Meta write.

## What 9a deliberately left for 9b

- `packages/brain` contains comparison construction only. `src/index.ts` and `comparison.ts` explicitly reserve proposal construction for 9b.
- `performanceMetaContent` is an empty strict object; `performance_meta` is absent from `WRITABLE_BRAIN_KINDS`; `KindNotYetWritableError` still says the path does not exist.
- `onboarding_input_class` contains `own_post | reference | creator_authored`; there is no honest class for product-built result or feedback summaries.
- No `promotion_proposals`, `proposal_evidence_results`, or `proposal_evidence_feedback` table exists.
- `feedback-ops.ts` exposes raw capture/list only. The sole raw reader is `ProfileScope.accessors.generationFeedback`; `tests/feedback-readers.test.ts` pre-registers `packages/brain` as the only future proposal-constructor package.
- `/brain` reads Voice, Strategy, and Kill Test history only. `/usage` shows a named absence for days-to-empty and has no brain-asset summary.
- `docs/initial/tech-spec.md` still describes `packages/brain` as “promotion construction only”, while R-105 widened the real charter to cohort and proposal construction.

## Existing seams to extend

| Concern | Existing authority / seam | 9b extension |
|---|---|---|
| Cohorts | `packages/brain/src/comparison.ts` (`MIN_COMPARABLE_RESULTS`, `buildComparisonGroups`, `improvement`) | Construct result proposals from complete comparison groups; never reimplement grouping, median, direction, or minimum n |
| Scoped result population | `ProfileScope.accessors.comparableResults(stratum?)` | Allow a semantic metric declaration to resolve to several historical Strategy doc ids after R-113 |
| Raw feedback | `generationFeedback` accessor and shared `feedbackPage` query | Add one narrow joined evidence projection; raw access remains single-site |
| Brain ceremony | `writeBrainDoc`, `confirmBrainDocFields`, `activateBrainDocCoherent` capabilities under one profile advisory lock | Compose all three inside one proposal-accept transaction; do not add direct `brain_docs` inserts |
| Brain reads | `readBrainHistory` and `BrainVersionView` | Add Performance Meta plus immutable proposal/evidence attribution |
| Tier authority | `getWorkspaceBillingState` in `@respin/credits`; active runtime config in `@respin/config` | Resolve a required `view_only | full` performance-learning entitlement before any gated DB write |
| Usage | `deriveBalance`, `burnPeriod`, `monthlySpend`, `burnByMode` | Add a scoped ledger-debit window and pure projection; never read `workspace_spend_monthly` |
| Export/deletion | `CREATOR_DATA_REGISTRY`, `exportPage`, schema-registration tests | Register proposals and both evidence joins in the same change |

## Decisions required by current code

### R-112 — Free is view-only

PRD §4G says Free receives “View only” for Performance log + learning. The existing 9a form is ungated. 9b is the registered trigger, so the plan must make the split structural: all tiers can read preserved results, comparisons, proposals, and brain history; only `creator | pro | studio` can log results, refresh proposals, or decide them. Raw feedback remains creator-submitted input and is still recordable, but a Free workspace cannot turn it into a proposal.

The mapping belongs in versioned runtime config because it is a tier gate. `@respin/credits` remains the sole tier resolver and passes a required entitlement value into `@respin/db`; DB never derives a tier.

### R-113 — declaration identity, not Strategy row identity

Today the five-predicate comparison key includes `metricDeclaredByDocId`, so an unrelated Strategy edit splits history even when the metric declaration is unchanged. 9b must preserve the doc id as immutable provenance while comparing by an exact semantic declaration tuple:

```ts
type MetricDeclarationIdentity = {
  key: string;
  label: string;
  unit: string;
  direction: "higher_is_better" | "lower_is_better";
};
```

Only byte-identical tuples pool. A changed label, unit, direction, or derived key starts a new metric population. The scoped query receives the exact set of same-profile Strategy doc ids that declare that tuple. No result row is rewritten and no derived unit/direction copy is added to `results`.

### Proposal acceptance is one attributable decision

Clicking Accept must not silently confirm a document the creator did not see, and separate transactions must not strand a confirmed-but-unactivated proposal. The review surface therefore shows the full merged target document and the evidence behind every field. Its submit carries the confirmed pointer set. The DB operation revalidates the proposal and evidence, then appends the product summary input, writes the new brain version, confirms exactly the displayed fields, coherently activates it, and records the accepted proposal in one transaction under the existing profile lock.

### Feedback cannot borrow `result_summary`

Repeated feedback is structured evidence but it is not a result. Add `feedback_summary` beside the required `result_summary`; both are product-built, immutable inputs with `field_key = NULL`. Feedback free-text notes remain stored/exported but are never parsed into a rule.

## Dependency proof

- R-104 defines 9a as logging/comparison and 9b as the proposal a brain can absorb.
- 9a shipped `results`, the scoped comparison population, treatment keys, historical declared-metric pointers, and the reachable Results route.
- The comparison package already separates reach/conversion, paid/organic, treatment/baseline, and uses one direction-normalized `improvement` authority.
- `brain_docs` and coherent activations already support optional `performance_meta`; no generation contract needs to be redesigned.
- The proposal joins named in tech spec §2 are absent, so 9b is an additive schema receiver rather than a migration of hidden data.

## Inherited residual disposition

| Residual | 9b disposition |
|---|---|
| R-112 Free tier mismatch | Close; 9b is the trigger |
| R-113 Strategy edit splits identical metric | Close; 9b owns the rule |
| 9a-C1 truncated-card confounder contradiction | Close because 9b changes Results comparison/proposal copy |
| 9a-U2 metric slug displayed instead of label | Close because 9b extends the declared metric projection |
| 9a-D3 incomplete table-writer population | Close because 9b adds governed tables to that instrument |
| 9a-G1 harness timeout, 9a-D1 provenance citation, 9a-D2 narrow-read population, 9a-U1 UTF-16 maxlength, R-114 non-Latin slug | Keep open; none is required to build or verify 9b |
| 8c-W2 (`/usage` edit trigger) | Close with the required usage copy/read audit |

## Risks

- A proposal constructor outside `packages/brain` would create two answers to minimum n and evidence strength.
- A JSON-only evidence summary without join rows would make membership unauditable.
- Accepting against changed evidence or a changed target brain could apply a stale conclusion.
- Reusing `creator_authored` or `result_summary` for feedback would falsify provenance.
- A Free or paused workspace could reach a write if the entitlement is only hidden in the UI.
- A days-to-empty estimate over visible ledger rows would turn pagination into a false burn rate; a model-cost rollup would be the wrong unit entirely.
- Self-reported quantified rows are the only reachable v1 numerical evidence. R-109/R-110 permit proposals from them at capped evidence strength; `unquantified` remains excluded and manual data is never relabelled verified.

## No external dependencies or calls

9b adds no package, service, model call, payment, or scheduled job. Proposal construction and usage projection are deterministic over stored rows. Browser acceptance needs no vendor spend.
