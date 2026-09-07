# Slice 9b — Turn evidence into an approved brain update

**Supersedes the unbuilt half of [`respin-finish-phase-9.md`](respin-finish-phase-9.md).** Slice 9a already shipped the Results table, entry screen, treatment/baseline comparison, and `packages/brain` comparison builder. This card contains only the remaining M5 work, re-read against that code.

**Codebase review:** [`../progress/respin-finish/9b-codebase-review.md`](../progress/respin-finish/9b-codebase-review.md)

**Depends on:** slice 9a's engineering outputs in [`../progress/respin-finish/respin-finish-slice-9a-card.md`](../progress/respin-finish/respin-finish-slice-9a-card.md): the Results schema/writer, comparison builder, and `/results` route exist and their focused checks pass. The user has explicitly accepted continuing while 9a remains `ALMOST`; its managed-browser policy block and `9a-G1` harness exit stay open and are not relabelled as complete by this dependency proof.

## A creator can…

**Log enough comparable outcomes or repeat the same structured feedback, review the exact evidence behind a proposed brain change, reject it without changing their brain, or confirm and activate the full updated brain document; then see the proposal, evidence, brain version, and conservative credit runway in their asset/history views.**

**Reachability:** `/results` is the in-phase caller. A paid owner/editor logs or refreshes evidence, reviews result and feedback proposals, and submits Accept/Reject. Accept calls one scoped DB transaction that reuses the existing write → confirm → coherent-activate capabilities. `/brain` and `/usage` read the resulting immutable attribution. Free and viewer seats reach the same reads but no write control.

## Least confident

The repeated-feedback mapping is intentionally narrow because the product may not parse a creator’s free-text note for meaning. The first implementation proposes only fixed Voice/Kill Test additions from closed reaction codes; browser acceptance must judge whether the resulting rule is understandable and useful without implying that the product inferred why the creator reacted.

## Scope and non-goals

This slice owns phase-9 R2/R4/R14–R19e/R21–R22; PRD REQ-F03, REQ-G07, REQ-I04; R-104/R-105/R-108–R-113; 9a residuals R-112, R-113, 9a-C1, 9a-U2, 9a-D3; and 8c-W2.

It does **not** add analytics connectors, parse feedback notes, rank creators, pool data across profiles, create a shared-library proposal, schedule background proposal jobs, call a model, or claim PRD §5 metric 2. It does not close 9a-G1 or manufacture replacement browser evidence for 9a.

## Pinned contract

### C1 — exact metric-declaration identity (R-113)

Extend `DeclaredMetric` to `{key, label, unit, direction}`. In `@respin/brain`, export one `metricDeclarationKey` over that exact tuple. `buildComparisonGroups` groups by that key, not `metricDeclaredByDocId`; each group still returns the sorted, non-empty set of declaring Strategy doc ids represented by its rows.

`ComparableResultsStratum` replaces its one `metricDeclaredByDocId` predicate with a required non-empty `metricDeclaredByDocIds`. The DB composition resolves those ids only from the scoped profile’s `strategyMetricVersions()` and queries with `IN (...)`. A result keeps its original `metricDeclaredByDocId`; no row is updated and no unit/direction is copied onto `results`.

Exact tuple equality is the whole pooling rule. A changed label, key, unit, or direction splits the metric population. Treatment keys remain unchanged and continue to distinguish brain activations.

### C2 — tier and pause contract (R-112)

Add this defaulted, strict runtime-config key and explicit seed value:

```ts
performanceLearning: {
  free: "view_only",
  creator: "full",
  pro: "full",
  studio: "full"
}
```

`@respin/credits` owns `performanceLearningEntitlementFor(db, workspaceId, at)` and calls the sole billing authority, `getWorkspaceBillingState`; neither DB operations nor UI may read `subscriptions`, Stripe price ids, or a caller-supplied tier. Its exhaustive matrix is:

| Authoritative billing state | Config lookup | Result |
|---|---|---|
| mapped `active`, unexpired `grace`, or mapped `paused` paid tier | exact `performanceLearning[tier]` | configured `"view_only" | "full"` |
| no subscription, dead/cancelled subscription, expired grace, or `incomplete` | `performanceLearning.free` | configured Free access (seed: `view_only`) |
| `reason: "unmapped_price"`, missing/invalid active config, or a tier absent from the strict map | none may be guessed | named operational refusal saying configuration is unavailable, never “your plan is view only” |

The entitlement is a required, no-default DB input. `recordResult` requires `full`, but remains pause-exempt under A-7 because it preserves creator-submitted past observations; this slice updates that existing `WRITE_PAUSE_POLICY` warrant rather than contradicting it. Proposal refresh/persistence, summary construction, Accept, and Reject require `full` **and** independently refuse an open authoritative `pause_periods` row. Raw feedback keeps its existing A-7 exemption. Reads require neither entitlement nor an unpaused workspace. Owner/editor role is checked independently; a viewer never writes. No credits move and no model is called. A custom-config inversion test (`free: full`, one paid tier `view_only`) proves the config, rather than tier-shaped code, decides access.

The UI mirrors but does not replace those server gates: seeded Free sees history with the exact view-only reason; an unmapped price/config outage gets the operational refusal; viewer and pause have their distinct existing remedies. Deployment is three ordered steps: (1) apply additive DB migration `0033` while old code is live, (2) deploy code that reads both pre-materialisation defaults and the new stored keys, (3) run `pnpm -C respin config:migrate` last. Old-code rollback is safe only before step 3. Once a config version containing either new strict key exists, rollback must use a forward-compatible release that retains parsers for those keys (or roll forward); an old strict parser is not safe. Exercise 0032→0033, fresh install, the pre-step-3 rollback window, and the post-step-3 forward-compatible rollback path against real Postgres, and record the admin editor copy.

### C3 — proposal constructor types (`packages/brain` only)

Keep `MIN_COMPARABLE_RESULTS = 3` as the sole minimum-n reader. Add pure constructors and exported closed types:

```ts
type EvidenceStrength = "early" | "repeated" | "corroborated";
type PromotionSource = "results" | "feedback";
type PromotionTarget = "voice" | "performance_meta" | "killtest";

type ResultProposalDraft = {
  source: "results";
  familyKey: string;              // exact stable fields pinned below
  target: { kind: "performance_meta"; pointer: "/rules/-" };
  rule: PerformanceRule;
  evidence: { resultId: string; role: "treatment" | "baseline" }[];
  evidenceDigest: string;         // canonical, sorted membership + complete rule inputs
};

type FeedbackProposalDraft = {
  source: "feedback";
  familyKey: string;              // exact stable fields pinned below
  target:
    | { kind: "voice"; pointer: "/avoid/-" }
    | { kind: "killtest"; pointer: "/rules/-" };
  value: string;                  // from the fixed mapping below, never note prose
  basisBrainDocId: string;
  evidence: { feedbackId: string; generationId: string; reaction: FeedbackReaction }[];
  evidenceDigest: string;
};
```

Use a stable canonical serialization with sorted ids before SHA-256. A result `familyKey` encodes, in this exact order, `{source:"results", targetKind:"performance_meta", targetPointer:"/rules/-", metricDeclarationKey, lever, platform, audienceClass, treatmentKey}`. A feedback key encodes `{source:"feedback", targetKind, targetPointer, reaction, basisBrainDocId}`. Result ids, feedback ids, declaring doc ids, observation envelope, cohort membership, n, medians, effects, evidence states/counts, and confounders are excluded from family identity and included in `evidenceDigest`; thus new evidence supersedes one stable family instead of minting a new family. The package writes no database row and imports no DB runtime.

The returned draft is a real authority boundary: `proposal.ts` owns an unexported unique-symbol brand plus a module-private `WeakSet` mint, returns frozen drafts, and exports a runtime `isPromotionProposalDraft` check. No public DB or app API accepts a draft, payload, family key, digest, strength, or evidence membership. The scoped refresh API accepts only the verified scope/profile and server-derived entitlement, invokes the brain constructors itself, asserts the mint, and persists the returned value. Source/boundary tests plant inline objects, casts, and a differently named `deriveCandidate()` outside `packages/brain`; every bypass must fail even when no identifier contains “proposal”.

Result rules are created only for a complete treatment and external baseline where `improvement` is `better` or `worse`; `unchanged`, absent, short, or truncated groups create no proposal. Reach and conversion remain separate drafts. The rule records metric label/key/unit/direction, lever, platform, paid/organic class, observation envelope, treatment key, treatment/baseline n and medians, signed effect, past-outcome verdict, evidence counts, evidence strength, and the union of structured confounders.

Evidence strength is a mutually exclusive precedence table:

- `early`: either population is 3–4; or both are at least 5 and every included result is `quantified_self_reported`.
- `repeated`: both populations are at least 5 and the exact joined evidence contains both `quantified_self_reported` and `connector_verified` rows.
- `corroborated`: both populations are at least 5 and every included row is `connector_verified`.

Test the full population-size × evidence-composition cross-product so no fixture can match two labels.

`unquantified` never enters either population. R-109/R-110 govern the apparent conflict with the older reviewer shorthand “unverified never learns”: quantified self-reported rows may produce a proposal, visibly capped by the rules above; they are never called verified. `connector_verified` remains unreachable from the v1 writer.

Before the implementation gate, append a dated decision that explicitly supersedes R-10's “verified results” shorthand: quantified self-reported rows are eligible only for a creator-reviewed proposal, all-self-reported evidence remains `early` at every n, and nothing activates without explicit confirmation. The same decision records that connector verification is unreachable in v1. R-109/R-110 remain the implementation detail; this new entry is the canon-level resolution rather than an inference from them.

Feedback construction requires at least three distinct generation ids with the same profile, reaction, normalized target, and source brain-doc version. For each evidence row, the source version is resolved through that generation's immutable `brainActivationId`: `off_voice` names the snapshot's Voice document, while `too_generic`, `wrong_angle`, and `not_filmable` name its Kill Test document. All members must resolve to the same non-null target-kind document id. It ignores `note`. The only proposal-bearing mapping is:

| Reaction | Target | Fixed addition |
|---|---|---|
| `off_voice` | Voice `/avoid/-` | `Drafts that do not sound like my established voice.` |
| `too_generic` | Kill Test `/rules/-` | `Reject a draft that could be true of anyone.` |
| `wrong_angle` | Kill Test `/rules/-` | `Reject a draft whose thesis is not the point I intended.` |
| `not_filmable` | Kill Test `/rules/-` | `Reject a draft I cannot actually film.` |

`used_as_is`, `used_with_edits`, and `discarded` create no rule: the first two do not identify a defect and the last identifies no reason. Duplicate feedback about one generation cannot advance n.

The result constructor's exact evidence sets are also its persistence contract: treatment joins equal `comparison.treatment.resultIds` and baseline joins equal `comparison.baseline.resultIds`, with no omissions or extras. Assert both that the two sets do not overlap **and** that every baseline row's normalized treatment key differs from the candidate key, even if a same-key row was absent from the historical treatment cohort. All n, median, effect, counts, strength, confounders, and digest values are recomputed from exactly these joined rows at Accept.

### C4 — persistence and relational evidence

Migration `0033_*` adds:

- `promotion_proposal_source`: `results | feedback`.
- `promotion_proposal_status`: `proposed | accepted | rejected | stale | superseded`.
- `promotion_proposal_strength`: `early | repeated | corroborated`.
- `promotion_proposals`: `(id, profile_id, workspace_id)` table-level unique; source, target kind/pointer, closed validated payload jsonb, `family_key`, `evidence_digest`, nullable `basis_brain_doc_id`, status, nullable accepted brain doc/activation, nullable decision user id, decision-role snapshot/time, timestamps. It has `(profile_id, workspace_id) → creator_profiles(id, workspace_id) ON DELETE CASCADE`; each non-null basis/accepted document uses `(doc_id, profile_id, workspace_id) → brain_docs(id, profile_id, workspace_id) ON DELETE CASCADE ON UPDATE RESTRICT`; accepted activation uses the analogous composite FK below. Result proposals require no basis doc; feedback proposals require one. Accepted rows require decision time/role plus accepted doc/activation; rejected rows require decision time/role and no accepted references; proposed/stale/superseded rows require all decision/accepted fields null.
- `brain_activation_snapshots` gains table-level `(id, profile_id, workspace_id)` uniqueness solely as the composite target for `promotion_proposals.accepted_activation_id`; the new FK is `ON DELETE CASCADE ON UPDATE RESTRICT`. This does not add an activation-snapshot→brain-doc FK or weaken that table's existing writer-validated design.
- The decision user id is derived only from the verified scope and references `users.id ON DELETE SET NULL`; callers cannot submit it or the role. The operation snapshots the verified membership role (`owner | editor`) in a non-null terminal column. After account deletion history renders “Deleted member” plus the role-at-decision; deletion neither destroys the proposal nor falsely attributes it. Tests cover spoof attempts and user/profile/workspace deletion.
- `proposal_evidence_results`: proposal/profile/workspace/result/role, primary key `(proposal_id, result_id)`, composite FKs to both same-tenant parents, `ON DELETE CASCADE ON UPDATE RESTRICT`.
- `proposal_evidence_feedback`: proposal/profile/workspace/feedback only, primary key `(proposal_id, feedback_id)`, composite FKs to both same-tenant parents, `ON DELETE CASCADE ON UPDATE RESTRICT`. Add table-level `(id, profile_id, workspace_id)` uniqueness to `generation_feedback`. Do **not** duplicate generation id, reaction, or normalized target: joined reads derive them from the immutable feedback row, generation, activation snapshot, and fixed reaction map.
- `result_summary` and `feedback_summary` enum values. `field_key` remains non-null iff class is `creator_authored`; both summary classes require `field_key IS NULL` and `source_url IS NULL`. Generic `appendOnboardingInput` keeps its pre-9b public input-class union and rejects cast-smuggled summary classes. A package-internal `appendPromotionSummaryForProposal(proposalId, tx)` accepts only a locked same-tenant proposal id, derives locked evidence itself, fixes the summary class, constructs normalized content, and inserts it; it accepts no caller content, class, URL, or field key.

Evidence joins are immutable. Proposal lifecycle is the only sanctioned update. A unique constraint over `(profile_id, source, family_key, evidence_digest)` makes concurrent refresh idempotent.

Pin these exact `ProfileScope` reads: `promotionResultInputs()` (declared metrics plus comparable result projections), `promotionFeedbackInputs()` (feedback→generation→activation target-doc projection), `promotionProposalReview(proposalId)`, and `promotionProposalHistory()`. Each predicates both profile and workspace and has explicit cross-profile and cross-workspace witnesses. Pin these profile write capabilities: `refreshPromotionProposals(entitlement, tx)`, `appendPromotionSummaryForProposal(proposalId, tx)`, and `decidePromotionProposal(params, entitlement, tx)`. The server façade exposes refresh/review/history/decision for the active profile; no direct writer is exposed. Register all three writes in `WRITE_PAUSE_POLICY` as gated and keep `recordResult`'s updated exemption.

Refresh runs in one scoped transaction under the existing brain/profile advisory lock. It fetches only those scoped inputs, calls the `packages/brain` constructors, validates their private mint, inserts missing proposals plus all joins, and reconciles only still-`proposed` rows:

- result metric tuple no longer exactly equals the current active Strategy declaration, or a referenced evidence/basis row no longer validates -> `stale`;
- same family and still-valid semantic/historical basis but a newer evidence digest exists -> `superseded`;
- exact digest already exists -> no duplicate;
- `accepted` and `rejected` are historical terminal decisions and never rewritten.

An unrelated Strategy version with the exact same `{key,label,unit,direction}` does not stale a result proposal. Feedback `basisBrainDocId` is historical evidence attribution from the generating activation and need not still be active; review freshness separately binds the current editable target document. The DB layer stores minted drafts but does not construct them. Replace the name-based pre-registration scanner with the structural writer/API/mint enforcement above.

Update the tech-spec package charter in the same change: `@respin/brain` is the only deterministic comparison/proposal constructor and imports no DB runtime; `@respin/db` owns scoped persistence and the approval ceremony but receives no caller-built proposal; `@respin/credits` alone resolves billing-backed access and the ledger-only runway composition.

### C5 — writable Performance Meta and honest summaries

`performance_meta` becomes:

```ts
{ rules: Array<{
  metricLabel: claim(string);
  metricKey: claim(string);
  metricUnit: claim(string);
  metricDirection: claim(enum);
  lever: claim("reach" | "conversion");
  platform: claim(string);
  audienceClass: claim("organic" | "paid");
  observedFrom: claim(string); observedTo: claim(string);
  treatmentN: claim(number); baselineN: claim(number);
  treatmentMedianPer1k: claim(number); baselineMedianPer1k: claim(number);
  effectPer1k: claim(number);
  pastOutcome: claim("better" | "worse");
  evidenceStrength: claim("early" | "repeated" | "corroborated");
  selfReportedN: claim(number); connectorVerifiedN: claim(number);
  confounders: Array<claim(ConfounderCode)>;
}> }
```

Add `performance_meta` to `WRITABLE_BRAIN_KINDS`; remove the obsolete not-yet-writable copy; add `brain_promotion` to the closed reason vocabulary. Existing active Performance Meta rules and their source evidence are carried forward before the new rule is appended.

`result_summary` and `feedback_summary` content is deterministic, line-oriented, and human-readable. It names ids, population, n, period, effect/reaction, and evidence limitation. Every new claim’s source entry points to the exact UTF-16 span in that server-derived summary. Old claims retain their existing source entries. Free prose from a result note or feedback note never enters a summary or brain rule. Result freshness compares the current Strategy's semantic tuple, never its doc id; the separately reviewed target base for a result proposal is the current Performance Meta document (or explicit absence). Feedback freshness retains its historical basis document and separately reviews the current Voice/Kill Test target base.

### C6 — review, accept, reject

`promotionProposalReview(scope, profileId, proposalId)` returns the proposal plus the **full merged target document**, all enumerated claim pointers, displayed values, source quote/absence, evidence membership, and a freshness token. The token is SHA-256 over the proposal id/digest, target kind, the exact editable active base doc id **or explicit null**, canonical merged-content hash, and sorted `{pointer, displayedValue, sourceEvidence}` claim set. The page renders every field before the decision control.

Accept submits proposal id, freshness token, and the exact `{pointer, asPlaceholder}` set the creator checked. In one DB transaction:

1. require `full` entitlement and owner/editor role; refuse pause;
2. lock profile and proposal, require `proposed`, reconstruct the proposal from the exact joins, and revalidate digest, semantic metric freshness or historical feedback basis, and evidence bijection;
3. resolve the current target document under the same lock, rebuild merged content/evidence and the complete claim set, recompute the review token, and require the exact base id/null the creator reviewed;
4. append the correct product-summary input through the locked server-derived capability;
5. call the existing `writeBrainDoc` capability with the merged content/evidence only after that exact-base CAS; the profile lock is held through activation, so no intervening edit can replace the base;
6. call existing `confirmBrainDocFields` with the submitted set;
7. call existing `activateBrainDocCoherent`;
8. update proposal to `accepted` with server-derived decision actor/role, brain doc, and activation.

Any failure rolls back every step. Accepting does not infer confirmation: missing, duplicate, stale, or mismatched pointers refuse. Reject locks and revalidates the same proposal, records actor/time/status, and writes no input, brain doc, or activation. Duplicate submits return the existing terminal outcome without a second write.

### C7 — browser surfaces and honesty

- `/results`: show metric **label** plus key; close 9a-C1 by testing truncated card copy as one rendered unit; show proposal cards with source, exact populations/evidence ids, n, medians/effect, evidence-state counts, evidence-strength definition, confounders, freshness/status, and full-document review. Controls use pending guards, 44 px targets, focusable/announced refusals, and no colour-only state.
- `/brain`: add Performance Meta current/history, proposal history, immutable result/feedback evidence membership, accepted activation, and counts of brain versions/tested rules/logged results/feedback.
- `/usage`: add a compact brain-asset summary linked to `/brain`; it is a read, available during pause and on Free.

Every product-built proposal card, full-review state, Performance Meta current/history state, and export rendering is scanned against the shared `FORBIDDEN_CLAIMS ∪ PERFORMANCE_CLAIMS` canon with planted forecast and efficacy specimens; a local short word list is not the control. Creator-authored metric labels are escaped and visually attributed as creator-authored data, not scanned or rewritten as product claims. Adjacent to every product-built outcome summary, render: “This describes past observations, does not establish cause, and is not a forecast.” Use the concrete past-tense sentence “This treatment was higher/lower than this baseline in these observations.” `early/repeated/corroborated` is evidence strength, not confidence or probability. The PRD §5 pilot metric remains unearned.

### C8 — days to empty and 8c-W2

Add defaulted, strict config:

```ts
daysToEmpty: { trailingWindowDays: 30, minimumDebitDays: 3 }
```

Both values are positive integers and schema refinement requires `minimumDebitDays <= trailingWindowDays`; invalid, missing/coherence, and custom-config cases are tested. The 30-day window follows REQ-G07’s monthly-burn context. Three non-zero debit days is an explicit product minimum for repeated-use evidence: one or two days are too sensitive to a single session/retry pattern. It is not a statistical-confidence claim. Record both choices and that rationale in `docs/initial/decisions.md`; config owns the numbers and `/admin/config` can change them.

Add one workspace-scoped DB aggregate over rows where `kind = 'debit'` and `created_at` is in the half-open interval `(asOf - trailingWindowDays, asOf]`, returning positive `sum(-delta)` and distinct UTC debit dates. `@respin/credits` owns one `usageRunwayFor` transaction: take one authoritative DB `asOf`, read the active config, authoritative open-pause state, `deriveBalanceInTx`, and the aggregate in that same transaction/snapshot. No reader may mix separate wall clocks or connections. When unpaused, compute:

```text
daily rate = total debits / trailingWindowDays
days to empty = ceil(current derived balance / daily rate)
```

Only return an estimate when all reads succeeded, total debit is positive, and distinct debit days meet config. Otherwise return a named union state: `paused` (not applicable because debits are prohibited and expiry clocks are frozen), `no_spend`, `too_few_debit_days`, or `read_unavailable` with component `config | pause | balance | ledger`. Boundary, zero-spend, too-few-days, pause, and each failed-read branch are distinct tests. The panel names the configured window, debit-day count, current balance/authoritative as-of time, and calls the number an estimate. It never derives from the visible ledger page, `model_usage`, or `workspace_spend_monthly`.

Editing `/usage` fires 8c-W2: re-audit every usage refusal/absence string against the real readers and close the residual only with a rendered test.

## Implementation tasks and ownership waves

No two write-capable agents own the same file in one wave. Shared facade/schema barrels are integrated by the parent after their producers land.

### Wave 1 — contracts and schema (Sol/high; money, tenancy, migration)

1. **DB/config contract owner:** `packages/config/**`, `packages/db/src/{promotion-schema,onboarding-schema,generation-schema,schema,creator-data-registry,export}.ts`, migration `0033_*`, snapshots, schema/export/migration tests. Land C2/C4 registrations and deploy-order proof.
2. **Brain pure-logic owner:** `packages/brain/src/{vocabulary,comparison,proposal,index}.ts`, `packages/brain/tests/**`. Land C1/C3 and mutation-focused pure tests; no DB/app writes.

Parent integration after Wave 1: reconcile generated migration metadata, bind exact shared types, run brain/db/config typechecks and focused tests before Wave 2.

### Wave 2 — scoped operations (Sol/high; tenancy and lifecycle)

3. **Proposal operation owner:** `packages/db/src/{promotion-ops,brain-content,brain-reason,brain-ops,results-comparison-ops,results-ops,with-workspace,app-server,index,errors}.ts` and focused DB tests. Land C1/C4/C5/C6, entitlement-required writers, atomic acceptance, freshness/idempotency/concurrency/cross-tenant tests.
4. **Credits/usage owner:** `packages/credits/src/{mode-access,app-server,days-to-empty,errors}.ts` and focused credits tests. Land entitlement resolver and pure days-to-empty projection against the Wave-1 config contract; no UI files.

Parent integration after Wave 2: bind facades, run migrations against real Postgres, then focused tenancy/billing/learning tests. Do not begin UI on a drifting server contract.

### Wave 3 — reachable UI and instruments (Terra/high)

5. **Results UI owner:** `app/(product)/results/**`, Results tests, and Results refusal copy entries in `app/(product)/billing-errors.ts`. Land proposal refresh/review/accept/reject, Free/viewer/pause states, 9a-C1 and 9a-U2.
6. **Brain/usage UI owner:** `app/(product)/brain/**`, `app/(product)/usage/**`, their UI tests. Land Performance Meta/history, asset summary, days-to-empty, and 8c-W2 copy audit.
7. **Boundary/instrument owner:** `tests/{feedback-readers,table-writers,profile-cage,gate-completeness,import-boundary,results-honesty}.test.*`, `docs/initial/{tech-spec,decisions}.md`, master/open-items/card updates. Flip the proposal-site guard, register all new writers/readers, close only named residuals, and state the engineering/evidence split.

Parent integration after Wave 3: inspect every diff, resolve overlapping barrel/copy changes itself, and run the complete verification manifest.

## Files to create

- `respin/packages/brain/src/proposal.ts`
- `respin/packages/brain/tests/proposal.test.ts`
- `respin/packages/db/src/promotion-schema.ts`
- `respin/packages/db/src/promotion-ops.ts`
- `respin/packages/db/migrations/0033_*.sql` and `meta/0033_snapshot.json`
- `respin/packages/db/tests/promotion-schema.test.ts`
- `respin/packages/db/tests/promotion-ops.test.ts`
- `respin/packages/db/tests/promotion-concurrency.docker.test.ts`
- `respin/packages/credits/src/days-to-empty.ts`
- `respin/packages/credits/tests/days-to-empty.test.ts`
- `respin/tests/promotion-ui.test.tsx`
- `respin/tests/promotion-actions.test.tsx`
- `docs/progress/respin-finish/respin-finish-slice-9b-card.md`

## Files to modify

- `respin/packages/brain/src/{index,comparison,vocabulary}.ts` and comparison tests
- `respin/packages/config/src/{schema,migrate-config}.ts`, config tests, `respin/packages/db/src/seed.ts`
- `respin/packages/credits/src/{mode-access,app-server,errors}.ts` and tests
- `respin/packages/db/src/{onboarding-schema,generation-schema,brain-content,brain-reason,brain-ops,results-schema,results-comparison-ops,results-ops,with-workspace,app-server,index,schema,creator-data-registry,export,errors}.ts` and focused tests
- `respin/app/(product)/results/**`, `brain/**`, `usage/**`, `billing-errors.ts`
- `respin/tests/{feedback-readers,table-writers,profile-cage,gate-completeness,import-boundary,results-comparison,results-entry,results-honesty,results-page-wiring}.test.*`
- `docs/initial/{tech-spec,decisions}.md`
- `docs/plans/respin-finish-master-plan.md`
- `docs/progress/respin-finish-open-items.md`

Every listed file has a receiving task above. Deviations go in the 9b card with the reason.

## Failure modes and required witnesses

| Failure | Required red witness |
|---|---|
| Constructor or proposal payload moves into app/db | Structural public-API/writer/mint test plus planted inline object, cast, and differently named outside-package constructor |
| Minimum n becomes 2, evidence joins drift, or baseline reuses the candidate key | Pure proposal fixtures plus exact treatment/baseline set equality, no-overlap, different-key, and recomputation integration tests |
| Self-reported becomes “verified” or corroborated | Evidence-strength table tests + rendered copy scan |
| Paid/organic, platform, declaration, treatment, reach/conversion pool | One differing-predicate fixture per axis |
| Identical metric declaration still splits after unrelated Strategy edit | End-to-end comparison/proposal fixture with two Strategy doc ids and one exact tuple |
| Changed declaration pools | Same fixture with one field changed |
| Proposal summary is sole evidence | Delete one join row / cross-tenant FK tests fail; accept revalidation refuses |
| Concurrent refresh duplicates | Real-Postgres race produces one digest row and complete joins |
| Generic intake smuggles a product summary | Direct and cast-smuggled `result_summary`/`feedback_summary` calls refuse; dedicated writer proves server-derived null URL/field key |
| Accept partially writes, loses an intervening base, or double-activates | Forced failure after each ceremony step rolls back; explicit-null/exact-id CAS and concurrent-edit test refuse; duplicate submit is idempotent |
| Stale proposal accepts | Change semantic metric/evidence before submit; proposal becomes stale and no brain/input row is added; an unrelated Strategy doc with the same tuple remains valid |
| Actor is spoofed or erased dishonestly | Caller actor fields are unrepresentable/cast-refused; account deletion nulls the id while retaining the role-at-decision label |
| Tier, pause, and role collapse into one refusal | Full BillingState matrix, custom-config inversion, viewer, seeded Free, paid-paused raw-result success, and paused proposal-write refusal at DB level |
| Feedback note prose reaches a brain rule | Sentinel note absent from draft, summary, brain doc, export projection |
| Product copy implies future efficacy without a banned short word | Shared-canon scan over cards/review/current/history/export with planted forecast specimens and required adjacent non-causal/non-forecast copy |
| Usage rate comes from page or model-cost rollup | Source guard plus fixture where visible page/model cost disagrees with ledger |
| Runway mixes clocks, includes the lower boundary, or appears during pause/below minimum | Same-transaction/as-of test, `(start,end]` boundary fixtures, pause/zero/too-few/failed-component union tests, and rendered named absences |
| Config migration makes an unsafe rollback look safe | Real-Postgres 0032→0033/fresh tests plus pre-materialisation old-code and post-materialisation forward-compatible rollback witnesses |
| 9a truncated copy contradicts itself | Render one truncated comparison with confounders and assert both blocks together |

## Verification manifest

1. `docker compose -f respin/docker-compose.yml up -d`
2. `pnpm -C respin typecheck`
3. `pnpm -C respin worker:typecheck`
4. `pnpm -C respin lint`
5. `pnpm -C respin db:check`
6. Focused pure and UI suites for brain proposals, the complete evidence-strength cross-product, strict/coherent/custom-inverted config, the exhaustive BillingState/pause/role matrix, promotion schema/ops, usage projection boundaries/failures, Results/Brain/Usage views, shared claim-canon scans, and source/boundary/writer/profile-cage instruments.
7. Real-Postgres migration from 0032 and fresh database, pre/post config-materialisation rollback windows, plus promotion concurrency/exact-base/cross-tenant/deletion/rollback/idempotency suites.
8. `pnpm -C respin test` with zero skips. If the known `9a-G1` reporter timeout recurs after every test passes, record the non-zero exit separately; do not call the gate green and do not make 9b responsible for a harness redesign.
9. `pnpm -C respin build`
10. Browser at 360 px and 1440 px, keyboard-only and reduced motion:
    - paid path: 3 treatment + 3 baseline -> proposal -> full review -> accept -> active Performance Meta + immutable evidence in `/brain`;
    - rejection path: brain unchanged;
    - feedback path: 3 same reaction/source brain -> proposal; mixed/two -> none;
    - Free path: history visible, every 9b write refused with the configured view-only reason;
    - paid-paused path: raw result logging remains accepted, proposal refresh/Accept/Reject refuse with the pause reason;
    - operational path: unmapped price/config unavailable is not presented as a plan restriction;
    - `/usage`: insufficient-history and paused absences, then estimate after configured evidence, asset link/counts.

No browser step requires a vendor call. If the managed browser still blocks localhost by admin policy, record the acceptance as blocked and keep the slice `ALMOST`; do not substitute screenshots or curl for interaction evidence.

## Critical-Path gates

- **Brain tenancy — Full:** same-tenant proposal/evidence FKs, summary provenance, export/deletion, role/pause gates, one atomic ceremony.
- **Billing/credits — Full:** config-driven tier gate, Free/read-only semantics, ledger-only days-to-empty and threshold provenance.
- **Learning honesty:** constructor sole-site, cohort/evidence rules, self-reported cap, separate levers, no efficacy claim.
- **Spin compliance:** no-guarantee copy and feedback-derived Voice/Kill Test claims; no change to ingest/Spin/similarity.
- Final code review after all specialists. Accessibility checks are part of the UI verification even if no separate reviewer is dispatched under lean mode.

## Deferral ledger

| Deferred item | Receiver / trigger |
|---|---|
| Real analytics connectors and reachable `connector_verified` writer | Post-launch connector phase; REQ-F05 |
| PRD §5 metric 2 / product efficacy evidence | Post-M6 pilot with real creators; fixtures never satisfy it |
| Background proposal refresh | First evidence that synchronous refresh latency is harmful; current deterministic refresh has no external call |
| 9a-G1 reporter timeout | Dedicated test-harness lifecycle pass |
| R-114 non-Latin metric slug migration | First cross-profile metric-key reader; must key `(profile_id, metric_key)` |
| 9a-D1, 9a-D2, 9a-U1 | Existing open-items triggers; untouched unless a 9b change directly enters that surface |

## Done when

- Every implementation task and failure witness above passes on the current tree.
- The ordered DB → code → config-materialisation deployment and both rollback windows are documented and exercised; new creator-data tables are export/deletion complete.
- The browser path is walked, or the slice is honestly closed `ALMOST` with the exact external browser-policy block.
- Brain tenancy and billing Full gates pass; learning and compliance pass under the lean review plan; final review passes.
- The 9b card separates engineering completion, browser evidence, review evidence, and PRD §5 pilot evidence.
- Master plan, decisions, tech spec, and open-items reflect 9a `ALMOST`, 9b’s actual status, the R-112/R-113 decisions, and no claim that 9a became 100% complete.
