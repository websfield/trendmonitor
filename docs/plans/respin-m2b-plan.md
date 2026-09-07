# Plan — Respin M2b: the metered brain substrate

**One document, deliberately.** M2's original six-phase plan failed all four Critical-Path gates three rounds running (blocking counts **14 -> 10 -> 18**) from size alone, and M2a converged only once cut to a single document. M2b is the next coherent slice, not the remainder: `packages/llm`, `packages/brain`, `createProfile`, the M2b migration, and the metering caller. No UI.

> **SUPERSEDED — 2026-08-24. Do not implement this document.**
>
> Gate round 1 returned **BLOCK from all four Critical-Path reviewers** (20 BLOCK · 43 CHANGE · 21 NOTE before dedup): [`../progress/respin-m2b-plan-review.md`](../progress/respin-m2b-plan-review.md). Owner decision the same day: **rewrite whole and split in two**, on M2a's precedent that patching reproduces partial application.
>
> - **First half → [`respin-m2b1-brain-surface-plan.md`](respin-m2b1-brain-surface-plan.md)** — the brain-document surface (`packages/db`-local; no model call, no money).
> - **Second half → [`respin-m2b2-metered-inference-scope.md`](respin-m2b2-metered-inference-scope.md)** — a scope contract, planned once M2b-1 is Ready.
>
> **The order is reversed from this document deliberately:** the metering path must land with a real, already-gated consumer, or its pause gate and debit hold trivially — the failure that produced the split.
>
> This file is retained as the round-1 decision record and the provenance of the B-1..B-14 decisions the rewrite carried forward or corrected.

**Depends on:** M2a ([`respin-m2a-cage-plan.md`](respin-m2a-cage-plan.md), READY 2026-08-23, both Critical-Path gates PASS). **Blocks:** M2c (framework seed, onboarding wizard, brain editor UI).
**Primary agent:** `respin-engineer`.
**Brief:** [`respin-m2b-brief.md`](respin-m2b-brief.md) · **Scope contract:** [`respin-m2-master-plan.md`](respin-m2-master-plan.md) (its Non-Goals, Deferral Ledger and Derived Budgets remain authoritative for M2 as a whole).
**Requirement IDs:** REQ-B01, REQ-B02, REQ-B03, REQ-C05 (versioning half), REQ-A01, REQ-A03, REQ-A04 (export half), REQ-G04, REQ-G06, REQ-G08, REQ-I03, REQ-J02.

**Entry-gate baseline, taken 2026-08-24 before any M2b work**, on the CI shape (`TEST_DATABASE_URL` set, Docker Postgres up, all three Docker suites live): typecheck exit 0 · `eslint .` exit 0 · `db:check` clean · **648 passed / 648, 36 files** · no loud-skips.

---

## Project Conventions Pinned (READ FIRST)

### Golden rules (from `CLAUDE.md`)

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.** Credentials live in env/config.
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.** Existing conventions beat your preferences.
6. **Report honestly.** "Done" is a claim the checks have to back.
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.** Verify against the installed version — lockfile, type definitions, `--help`, official docs.

### Non-negotiable rules (Respin) that bind this plan

- **2. The ledger is the balance.** `credit_ledger` is append-only, balance derived; the debit happens **in the generation's transaction** (REQ-G04/G06). M2b is the product's **first credit-debit call site**.
- **3. Brains are context, never weights, never silent.** Versioned docs, per-field provenance, proposal-approval for every update (R-8, REQ-B02/C05).
- **5. No leakage.** Nothing crosses profiles or workspaces (REQ-A03, R-9). M2a built the cage; M2b is its first real consumer.
- **6. No invented specifics, no guarantees.** `[check]` placeholders; every output names its weakest point (REQ-I03).

### Lessons that touch this ground (from `CLAUDE.md`)

- **2026-07-30 — fix the class, not the field.** Guard where the path is *built*, validate the whole artefact at its boundary, put the guard where every consumer can import it, and add a lint. "Grep every sibling" is the form of this rule that already failed. **Five gate rounds have caught this plan's lineage failing it.**
- **2026-07-30 — a comment claiming a property is not the property.** Assert it in a test or delete the claim; label every mutation with the tool that produces the red.
- **2026-08-10 — present-and-verified is not present-and-unrun.**
- **2026-08-18 — prove a parser-dependent guard generatively against the installed parser**, never with a list of counterexamples; and never report a thing recorded until you have re-read the file.
- **2026-08-21 — a guard that SCANS source fails OPEN when its pattern breaks.** Every scanner asserts it finds a PLANTED violation of each shape it claims to cover, and never builds its regex from a string literal.
- **2026-08-21 — proving a field cannot be TYPED is not proving it cannot be CAST.** For every server-derived column, assert the runtime strip by smuggling a value through `as unknown as`.

### Stack and boundaries

Next.js 15 App Router · TypeScript · self-hosted Postgres + Drizzle · pnpm workspace (`packages/*`) · Zod at boundaries. Import direction is `app/** -> packages/**`, never the reverse. `packages/**` reach another package through its `@respin/*` **root or a declared entrypoint**, never into its `src/`. Money is integer-valued; no floats on any cost path.

**Available specialist agents:** `respin-engineer` (owner of every task here). **Do NOT request** agents that do not exist in `.claude/agents/` — there is no "llm-engineer" or "brain-engineer".

---

## Objective

Ship the metered brain substrate: a provider adapter that spends real tokens under a pause gate and a price table, a `packages/brain` that turns a creator's own posts into versioned, per-field-confirmable brain documents with quote-level provenance, and the profile lifecycle (`createProfile`, archive/activate) that the per-tier cap governs.

## Non-Goals (this plan)

| Not building | Receiving milestone | Why not here |
|---|---|---|
| The shared framework library seed (F1-F9, R-29) | **M2c** | R-30 constraint 7 belongs to the first `frameworks` writer; M2b writes none. |
| The onboarding wizard UI, paste-only ingestion, the oEmbed resolver (D-M2-9) | **M2c** | M2b builds the operations the wizard drives, not the wizard. |
| Brain editor pages, version-history UI, export UI | **M2c** | The export **operation** ships here; its screen does not. |
| REQ-B04 first-three-ideas at onboarding end | **M3** | Needs `packages/modes`. |
| The seven Studio modes, streaming UI, the kill test | **M3** | |
| Free-tier credit minting (R-21) | **M3** | M2b does not build it and does not depend on it (D-M2-2). |
| Prompt caching and cost optimisation (DL-7) | **M3** | Pinned constraint carried: any cache key is `(profileId, bundleHash)` or responses are never cached across profiles. |
| Promotion proposals, minimum-n learning | **M5** | `packages/brain` emits no proposals here. |
| Seats/roles beyond `createProfile`'s owner check (REQ-A02) | **M6** | |
| Account **deletion** (REQ-A04's deletion half) | **M6** | Export ships here; deletion does not. |

## Critical Paths touched

| Critical Path | Touched | Reviewer agent | Reviewer skill |
|---|---|---|---|
| Respin brain tenancy | **YES (primary)** | `respin-tenancy-reviewer` | `respin-brain-tenancy` |
| Respin billing & credits | **YES (primary)** | `respin-billing-reviewer` | `respin-billing-credits` |
| Respin spin compliance | **YES (narrow — REQ-I03, the reference-echo bar)** | `respin-compliance-reviewer` | `respin-spin-compliance` |
| Respin learning honesty | **YES (narrow — D-M2-5's countable label; no learning)** | `respin-learning-reviewer` | `respin-learning-honesty` |

Four gates. All four agents exist in `.claude/agents/`.

---

## Decisions (B-1 .. B-14)

| ID | Decision | Why |
|---|---|---|
| **B-1** | **`packages/llm` is a dumb adapter.** It exposes `structured<T>({model, system, messages, schema, maxTokens})` returning `{value, usage: {model, tokensIn, tokensOut}, outcome}`. It does **not** read config, does **not** check pause, does **not** write `model_usage`, and does **not** know what a profile is. The **metered operation** (`runInference`) lives in `packages/brain`. | R-30 constraint 1 requires the pause gate at **operation entry, before the model call**. If the adapter both gates and calls, the ordering claim is unobservable from outside the adapter and untestable — the exact "holds trivially" shape M2a's mint had. Keeping the adapter ignorant makes "the gate ran before the call" provable by handing `runInference` a stub adapter that throws if invoked. Cost: `packages/brain` depends on `@respin/credits` (which depends on `@respin/db`) — acyclic, verified. |
| **B-2** | **The pause gate is the first statement of `runInference`**, before the attempt id is minted and before any adapter call: `if (await hasOpenPause(db, scope.workspaceId)) throw new WorkspacePausedError()`. The app-layer check is a second layer, never the only one. | R-30 constraint 1, and its load-bearing half: `creditCosts.onboardingBrainBuild` is `0`, and `debitCredits` throws on a zero cost (`ledger.ts:339`), so a zero-cost operation **skips `debitCredits` entirely** — and with it the only pause gate on the spend path. A-7's two exemptions (`appendOnboardingInput` and `recordModelUsage` do not refuse under pause) are safe **only because** authorisation is refused here. |
| **B-3** | **The pause fixture used to prove B-2 writes the `pause_periods` row WITHOUT the subscription mirror**, so `hasOpenPause` is true while `isPausedSubscription` is false. | The ordinary pause fixture writes both, so both predicates agree and the test passes under either implementation — the M2a round-2 finding, verbatim. A test that cannot discriminate the authority from the non-authority is not evidence. `state.ts` documents `isPausedSubscription` as "NOT the authority, and deliberately not used to gate money". |
| **B-4** | **One debit per `attempt_id`, enforced by a partial unique index**: `credit_ledger_inference_attempt_uq` on `(ref_type, ref_id) WHERE ref_type = 'inference_attempt'`. `attempt_id` is minted once per `runInference` call and is both `model_usage.attempt_id` and the debit's `ref_id`. | R-30 constraint 4. The repo's precedent is unambiguous — `checkout_session`, `invoice` and `auto_topup` each already have exactly this index (`billing-schema.ts:172,181,194`). A money invariant enforced by application code is a race; this project settles them in the schema. |
| **B-5** | **Attempts are counted as `COUNT(DISTINCT attempt_id)`**, never rows, over `model_usage` for the profile with `purpose='onboarding_brain_build'` and an outcome in the **billable** set. **Only a billable vendor response consumes an attempt** — a success or a schema-invalid 200. A 429, a 5xx, or a pre-response transport failure consumes nothing. | D-M2-2b. Round 2 left 429/5xx unclassified under "any attempt that produced a vendor response consumes it", under which one rate-limit blip permanently cost a creator their brain build and the retry the same table promised was then refused. |
| **B-6** | **`resolved_tier` and `cost_state` are inexpressible by the caller.** `runInference`'s params type does **not** contain them; `runInference` stamps `resolvedTier` from `getWorkspaceBillingState` and `costState` from whether a price row resolved. `recordModelUsage` is called from **exactly one place** in `packages/**`, asserted by a source scan. | R-30 constraint 8. Today both are ordinary caller-supplied parameters and the schema comment claimed otherwise. Making them absent from the input type is "fix the class, not the field": a denylist fails open, an allowlist fails closed. A wrong value understates cost and therefore **overstates margin** — the flattering direction, for the number R-6 tunes pricing against. |
| **B-7** | **Prices are integer micro-USD per token**, keyed by model id, in `respinConfigV1.llm.prices`. Cost is `BigInt(tokensIn) * inMicro + BigInt(tokensOut) * outMicro`. No float touches a cost path. | Anthropic list prices are whole dollars per million tokens, so micro-USD per token is exact and integral (Claude Opus 5: $5/$25 per MTok -> `5` in / `25` out). `cost_micro_usd` is already `bigint` with `mode: "bigint"`. A float would reintroduce the rounding class the ledger's integer discipline exists to exclude. |
| **B-8** | **Price lookup fails closed at operation entry**: before any adapter call, `runInference` resolves `llm.prices[llm.model]` and throws a typed `ModelPriceUnavailableError` if absent. Separately, if the **response's** `model` differs from the requested one and has no price row, the row is written with `cost_state='unknown'` and `cost_micro_usd=null` — never zero. | D-M2-13. Round 1 made `model` and the price scalars independent keys, so an admin changing the model from `/admin/config` — the deploy-free path D-M1-2 exists to enable — would silently make every recorded cost wrong, in the direction that flatters the margin dashboard. The two behaviours are distinct: a misconfigured install must not spend tokens at all; a provider that resolves an alias mid-flight must not be recorded as free. REQ-G05 already excludes `unknown` and reports the excluded share. |
| **B-9** | **The `workspace_spend_monthly` increment runs in the SAME transaction as the `model_usage` insert.** No separate key is needed because the transaction *is* the idempotency: both land or neither does. A `reconcileWorkspaceSpend(db, workspaceId, periodMonth)` query ships **in this change**, comparing the rollup against `model_usage`, with a test that detects a planted drift. | R-30 constraint 9 asks for an idempotency key **or** an equivalent; same-transaction atomicity is strictly stronger than keying a second write, and it is the shape the ledger already uses for debit-with-generation (REQ-G04). The reconciliation query is written **now** because the rollup's only source cascades away on REQ-A04 deletion — after the first deletion the rollup is the sole record and reconciliation becomes impossible. |
| **B-10** | **Two distinct bars, deliberately not the same set.** (a) **Provenance bar** — a `reference`-classed input may not be `source_evidence` for `voice`, `performance_meta`, or `killtest`; **`strategy` is exempt.** (b) **Content-echo bar** — no string leaf of a brain doc's `content`, of **>= 8 words** after NFC/LF normalisation, may appear verbatim in **any** `reference`-classed input of that profile, for **all four kinds**. Implemented as `assertNoReferenceEcho(tx, scope, content)`, called inside `writeBrainDoc` beside `validateSourceEvidence`. | R-30 constraint 10 leaves both sets to M2b. The split is principled: learning a *mechanism* from someone else's post is what the shared library is **for**, so `strategy` legitimately cites a reference; a third party's post is never evidence of the creator's voice, their results, or their kill criteria. The echo bar is broader because it governs *content*, not provenance — R-3 ("spin, never copy") fails through the door where a third party's sentence appears in a field's **value** while grounded by an `own_post` quote, which the round-2 findings named and nothing yet closes. It is a **tripwire against wholesale echo, not a plagiarism detector** — the similarity gate (M4, spin-only per tech-spec §3 step 4) is the real instrument. 8 words is chosen as the shortest span unlikely to be a common collocation; the refusal is recoverable by editing, so a false positive costs an edit while a false negative costs R-3. The threshold is a **code constant with a named reason, never a config key** — `/admin/config` is a deploy-free editor and no config flag may weaken a hard rule (D-M2-9's argument). |
| **B-11** | **`createProfile` lives in `packages/brain`** and gates on three things read from their sole authorities: **role** (owner, from the workspace membership), **tier** (`getWorkspaceBillingState`, `credits/src/state.ts:229`), and **cap** (`respinConfigV1.profileCaps`, already present with a `.default()`). It returns a `ProfileScope`. | R-30 constraint 2 and A-11. `packages/db` cannot see billing state without inverting the dependency graph or creating a **second tier authority** — the defect class that caused two M1 round-6 findings, and which would grant Studio's 5 profiles to an `incomplete` subscription that never collected a cent. The role check closes M2a's gate finding that a viewer could otherwise create profiles. |
| **B-12** | **The `ProfileScope` mint is exposed only as a scoped callback.** `packages/brain` exports `withProfile(db, workspaceScope, profileId, fn)`; `@respin/brain/app-server` exposes **DTO-returning operations only** and never returns a scope or a capability. `writeCapabilities` stays denied to `app/**`. **There is no `trustProfileId`.** | R-30 constraint 11: this is precisely where `trustProfileId` would reappear. The scoped-callback shape mirrors the `withWorkspace` and `@respin/credits/app-server` precedents, so holding an app-layer handle grants an operation, never an instrument. `tests/import-boundary.test.ts` P6 is the standing check and is extended here. |
| **B-13** | **`creator_profiles.state`** is a pg enum `('active','archived')`, default `'active'`. **The cap counts `active` only.** On downgrade nothing is archived automatically: `assertProfileCap` refuses `createProfile` and `runInference` with a typed `ProfileCapExceededError` naming how many profiles must be archived, until the creator archives down to the cap via `archiveProfile`. **Reads and export stay available for archived profiles.** | Owner decision 2026-08-24, discharging R-30 constraint 3. Nothing is destroyed and the entitlement stays honest. **Automatic archiving is deliberately rejected**: it would be a silent, destructive-in-effect state change to creator data driven by a Stripe webhook, which is the class of behaviour-by-absence R-28 exists to stop — and R-8's "never silent" governs the brain the profile owns. The oldest-first default the owner chose is a **one-click affordance in M2c's UI**, not a background job. The column lands in **this** migration, so it is not a second migration on a table M2a just landed. |
| **B-14** | **A creator edit is an `onboarding_inputs` row of class `creator_authored`**, cited by the brain doc it produces — which is what makes `source_evidence NOT NULL` sound for manually written fields. | A-10 schedules `source_evidence NOT NULL` for this migration, and D-M2-10 already defines `creator_authored` as an input class with no writer. Without this the NOT NULL would make M2c's editor unimplementable, and the constraint would be reverted by the milestone after the one that added it. |

## Schema changes — migration `0012`

| Object | Change | Note |
|---|---|---|
| `creator_profiles` | **ADD** `state` pg enum `creator_profile_state ('active','archived')`, `NOT NULL DEFAULT 'active'` | B-13. Existing rows become `active`, which is their current meaning. |
| `brain_docs` | **ADD** `confirmed_fields jsonb NOT NULL DEFAULT '[]'`, `confirmed_at timestamptz`, `confirmed_by uuid` (FK -> `user.id`, `ON DELETE SET NULL`) | R-30 constraint 6 / REQ-B02. `confirmed_by` is `SET NULL` not `CASCADE`: a departed user must not delete the record that a confirmation happened. |
| `brain_docs` | **ALTER** `source_evidence` -> `NOT NULL` | A-10. Sound because of B-14. Backfill: no rows exist outside test databases; the migration asserts `count(*) WHERE source_evidence IS NULL = 0` and fails loudly rather than defaulting. |
| `brain_docs` | **ADD CHECK** `status <> 'active' OR (confirmed_at IS NOT NULL AND activated_at IS NOT NULL)` | D-M2-5b in the schema, not in a comment: a row cannot be `active` without a recorded confirmation. |
| `credit_ledger` | **ADD** partial unique index `credit_ledger_inference_attempt_uq` on `(ref_type, ref_id) WHERE ref_type = 'inference_attempt'` | B-4. Matches the three existing per-ref-type indexes verbatim in shape. |

Emitted SQL is verified for: the enum created before the column that uses it, the `WHERE` predicate present on the new partial index, the CHECK present, and `source_evidence` carrying `NOT NULL`. **A migration-shape test asserts each of these against the emitted file** (`packages/db/tests/migration-shape.test.ts` already exists and is extended, per the 2026-08-21 scanner lesson: each new assertion is proved by planting a violation).

## Dependencies

| Depends on | Proof it shipped |
|---|---|
| M2a cage, schema, capabilities, `assertScoped` | `docs/plans/respin-m2a-cage-plan.md` STATUS READY; `respin/packages/db/src/with-workspace.ts`; 648/648 CI-shape run 2026-08-24 |
| M1 billing + credit ledger | `docs/progress/respin-m1-review.md` (Ready, A/A); `respin/packages/credits/src/ledger.ts:335` |
| `hasOpenPause` reachable from another package | `respin/packages/credits/src/index.ts:29` (root re-export) |
| `profileCaps` config key | `respin/packages/config/src/schema.ts:89` (present with `.default()`) |
| `getWorkspaceBillingState` | `respin/packages/credits/src/state.ts:216` |

**Stop Conditions checked:** (1) every task binds >=1 REQ id — pass. (2) no unshipped dependency — pass, evidenced above. (3) all four reviewer agents exist — pass. (4) **new core dependency `@anthropic-ai/sdk`** — sanctioned by R-5 / tech-spec §1 ("Anthropic behind a `packages/llm` adapter") and its cost posture recorded by D-M2-2; the recurring-cost row below states the spend. (5) North Star — advances **Goal item 1** directly; no Non-goal hit.

## Deferral Ledger

| # | Deferred | Receiving milestone | Resolvable by |
|---|---|---|---|
| DL-10 | Extract the metered-inference wrapper to a shared home when `packages/modes` becomes a second caller | **M3** | M3's dependency check. No abstraction until >=2 callers exist (`keeping-it-lean`); today `packages/brain` is the only one. |
| DL-11 | **`workspace_spend_monthly` pseudonymisation at deletion.** M2b re-takes R-30 constraint 5's decision in writing rather than implementing it: the rollup stores `workspace_id` in clear while the workspace exists, carries **no creator content** (aggregates only), and **M6's deletion path must replace it with a salted one-way hash**. Recorded as a binding constraint on M6 and written into `creator-data-registry.ts`. | **M6** | M6's plan. Constraint 5 sanctions exactly this option ("or this decision is re-taken in writing"); deletion is M6's, so implementing it here would be a writer with no caller. |
| DL-12 | Prompt caching and cost optimisation | **M3** | Carried pinned constraint: any cache key is `(profileId, bundleHash)`, or responses are never cached across profiles. |
| DL-13 | `onboarding_inputs` ingestion surface (paste, the oEmbed metadata resolver, D-M2-9) | **M2c** | M2c's plan. M2b writes inputs only through fixtures, and the export path reads them. |

## Derived Budgets (numbers with provenance)

| Number | Value | Provenance |
|---|---|---|
| Profile caps per tier | 1 / 1 / 1 / 5 | `docs/initial/PRD.md:59` (REQ-A01); already in `respinConfigV1.profileCaps` |
| Onboarding brain build credit cost | 0 | `docs/initial/PRD.md:135` — the authority |
| Onboarding inferences included per profile | 1 | `docs/initial/PRD.md:135`, "(included once per profile)" |
| **Onboarding brain REBUILD credit cost** | **5 — ASSUMPTION, flagged** | **No doc authority exists.** D-M2-2 creates the key and leaves the value open. Anchored to `fullScript` (5) and `spin` (5), the two most expensive entries in the seeded list, because a rebuild reads 5-10 posts and writes four brain documents — the heaviest single operation in the product by token count. **Stated rather than invented silently, and cheap to change**: config is append-only and versioned, so a correction is one `migrate-config` run with no deploy. Owner confirmation wanted before M2c prices it in the UI. |
| Brain doc kinds | 4 | `docs/initial/tech-spec.md:63` (`voice`, `strategy`, `performance_meta`, `killtest`) |
| Own posts collected at onboarding | 5-10 | `docs/initial/PRD.md:66` (REQ-B01) |
| Reference posts | 0-3 (optional) | `docs/initial/PRD.md:66` (REQ-B01) |
| Content-echo bar threshold | 8 words | B-10. A judgment with a stated reason and a recoverable failure mode, not a measured number — labelled as such. |
| Gross margin target | >=70% Creator tier | `docs/initial/PRD.md` §5.4 |
| **Recurring cost — Anthropic API** | Usage-based, **no free tier**. Claude Opus 5 at **$5 / $25 per MTok** (input / output), 1M context. Production spend bounded by (1 inference x profiles onboarded) per D-M2-2. **Test spend is zero** — every suite drives the stub adapter, enforced by a source scan. | Verified against the current model table 2026-08-24, not from memory. The model id and both prices live in `respinConfigV1.llm`, so re-pricing is a config append. **Margin note stated rather than discovered:** at Creator's 250-credit allowance an Opus-5-priced brain build is the single largest cost event in the tier, and the >=70% margin target is the number it moves — which is exactly why B-6, B-7 and B-8 exist. |

No other new external service or paid dependency is introduced.

## Risk Assessment

Carried from the brief's pre-mortem, plus M2a's carry-forwards:

- **R-M2b-1 — the pause gate holds trivially** (brief pre-mortem 1). Mitigated by B-1 (the adapter cannot gate), B-2 (first statement), B-3 (a discriminating fixture), and P-1/P-2/P-3 below. **This is the risk M2a actually shipped once.**
- **R-M2b-2 — provenance theatre** (brief pre-mortem 2). Mitigated by B-10's two bars and P-6/P-7.
- **R-M2b-3 — margin overstated in the flattering direction** (brief pre-mortem 3). Mitigated by B-6 (inexpressible), B-8 (fail closed, never zero), B-9 (atomic rollup plus reconciliation), P-4/P-5/P-8/P-9.
- **R-M2b-4 — first real token spend.** The only live-token spend in M2b is the manual evidence run (task 18), outside the test tree. Every suite drives the stub.
- **R-M2b-5 — two active versions.** Activation is a transaction (deactivate current, insert new) under the partial unique index M2a landed; proved under real concurrency in a Docker suite.
- **R-M2b-6 — a config key breaks every seeded database.** Mitigated by the A-9 deploy order: every new key carries `.default()`, code deploys first, `migrate-config` second, and a test parses a **stored pre-change document**.

---

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | Scaffold `packages/llm` (package.json with `exports: {".": "./src/index.ts"}`, tsconfig, workspace member) | `respin-engineer` | `packages/llm/package.json`, `packages/llm/tsconfig.json` |
| 2 | Install `@anthropic-ai/sdk`; add `ANTHROPIC_API_KEY` to `env.example`; **keyless refusal** mirroring the Stripe adapter so `pnpm build` stays keyless-safe | `respin-engineer` | `packages/llm/package.json`, `env.example`, `packages/llm/src/client.ts` |
| 3 | Provider interface + Anthropic adapter: `structured<T>()` using `output_config: {format}`, `thinking: {type: "adaptive"}`, streaming for large `max_tokens`. **No `budget_tokens`** (400 on Opus 5), **no assistant prefill** (400). Typed error mapping to `outcome` (B-5's billable set) | `respin-engineer` | `packages/llm/src/provider.ts`, `packages/llm/src/anthropic.ts` |
| 4 | The stub adapter + the source scan asserting no test reaches the network | `respin-engineer` | `packages/llm/src/stub.ts`, `packages/llm/tests/no-network.test.ts` |
| 5 | Config: add `llm: {model, prices}` and `creditCosts.onboardingBrainRebuild`, **both with `.default()`**; extend the parity test; **config data step** — append a version via `appendConfigVersion` under `takeConfigLock` (R-30 constraint 12) | `respin-engineer` | `packages/config/src/schema.ts`, `packages/config/src/migrate-config.ts`, `packages/config/tests/migrate-config.test.ts` |
| 6 | Migration `0012` (all five objects above) + extend `migration-shape.test.ts` with a planted violation per assertion | `respin-engineer` | `packages/db/drizzle/0012_*.sql`, `packages/db/src/brain-schema.ts`, `packages/db/src/billing-schema.ts`, `packages/db/tests/migration-shape.test.ts` |
| 7 | Scaffold `packages/brain` + its `./app-server` entrypoint (DTO-only surface, B-12) | `respin-engineer` | `packages/brain/package.json`, `packages/brain/src/index.ts`, `packages/brain/src/app-server.ts` |
| 8 | `withProfile` scoped callback; **no bare mint export** | `respin-engineer` | `packages/brain/src/scope.ts` |
| 9 | `createProfile` (role + tier + cap), `archiveProfile`, `activateProfile`, `assertProfileCap`, `ProfileCapExceededError` | `respin-engineer` | `packages/brain/src/profiles.ts`, `packages/brain/src/errors.ts` |
| 10 | `runInference()`: pause gate first (B-2), cap check, price resolve (B-8), attempt id mint, adapter call, then **one transaction** holding the `model_usage` insert, the rollup increment (B-9) and the debit (B-4) | `respin-engineer` | `packages/brain/src/inference.ts` |
| 11 | `resolvedTier`/`costState` stamped from their authorities; the source scan asserting `recordModelUsage` has exactly one caller in `packages/**` | `respin-engineer` | `packages/brain/src/inference.ts`, `packages/brain/tests/metering-authority.test.ts` |
| 12 | `reconcileWorkspaceSpend()` + its planted-drift test | `respin-engineer` | `packages/brain/src/spend.ts`, `packages/brain/tests/reconcile.test.ts` |
| 13 | `assertNoReferenceEcho` + extend the provenance bar to `voice`/`performance_meta`/`killtest` (B-10) | `respin-engineer` | `packages/db/src/with-workspace.ts`, `packages/db/tests/reference-echo.test.ts` |
| 14 | Brain activation: `confirmFields` + `activateBrainDoc` (deactivate current + insert new, one transaction), **refusing while ANY inferred field is unconfirmed** (D-M2-5b) | `respin-engineer` | `packages/brain/src/activate.ts` |
| 15 | The countable evidence label — **"evidence: N of M posts"**, N = distinct `onboarding_inputs` whose cited quote passes the substring check at its recorded offsets, M = inputs submitted. **The word *confidence* is not used** (D-M2-5) | `respin-engineer` | `packages/brain/src/evidence.ts` |
| 16 | Brain export (REQ-A04 export half) driven by `creator-data-registry.ts`, with a test asserting every registry-included table is covered | `respin-engineer` | `packages/brain/src/export.ts`, `packages/brain/tests/export-coverage.test.ts` |
| 17 | eslint: add `@respin/brain` and `@respin/llm` to `CROSS_PACKAGE_DENY` and the app-direction allowlist (`app/**` -> `@respin/brain/app-server` only); extend `tests/import-boundary.test.ts` P6 | `respin-engineer` | `eslint.config.mjs`, `tests/import-boundary.test.ts` |
| 18 | Record B-1..B-14 as **R-31** including DL-11's M6 constraint; amend `PRD.md` (rebuild pricing, profile state) and `tech-spec.md`; update `creator-data-registry.ts`; append the ledger entry; **run the manual live-token evidence harness once** and record its cost (**this is the only step that spends real money — it needs the owner's explicit go-ahead at build time; every other task in this plan runs on the stub**) | `respin-engineer` | `docs/initial/decisions.md`, `docs/initial/PRD.md`, `docs/initial/tech-spec.md`, `packages/db/src/creator-data-registry.ts`, `docs/progress/respin-m2/ledger.md` |

## Migration Steps

1. Deploy **code first** (every new config key carries `.default()`, so a stored pre-change document still parses) — A-9's order, whose whole reason is that `getActiveConfig` is called five times inside the Stripe webhook's single transaction (`webhooks.ts:588,786,1082,1197,1283`); a throw there rolls back `stripe_events`, Stripe retries for roughly three days and then disables the endpoint, so grants are **lost** rather than delayed.
2. `DATABASE_URL=... pnpm -C respin db:migrate` — applies `0012`.
3. `pnpm -C respin migrate-config` — appends the config version carrying `llm` and `onboardingBrainRebuild`. Re-run to confirm the no-op.
4. `pnpm -C respin db:check` — asserts schema and committed migrations agree.

A rollback between steps 1 and 3 is safe, which is the property `.default()` buys.

## Verification Steps

Each step names the command, the state it needs, and the numbered step that establishes it.

1. `docker compose -f respin/docker-compose.yml up -d` — Postgres on 5435. (State: none.)
2. `DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm -C respin db:migrate` — requires step 1.
3. `pnpm -C respin db:check` — requires step 2. Expect "Everything's fine".
4. `pnpm -C respin typecheck` — requires none.
5. `pnpm -C respin lint` — requires none.
6. `TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm -C respin test` — requires step 2. **The CI shape**; all Docker suites live, no loud-skips. Expect >= 648 plus this plan's new tests.
7. `pnpm -C respin build` — requires none. **Must pass with no `ANTHROPIC_API_KEY` set** (task 2's keyless refusal).
8. `pnpm -C respin migrate-config`, then re-run — requires step 2. The second run is a no-op.

## Acceptance Criteria (PASS/FAIL, each with evidence)

| # | Criterion | Evidence |
|---|---|---|
| AC-1 | `packages/llm` imports nothing from `@respin/credits`, `@respin/config` or `@respin/db` | source scan in `packages/llm/tests/no-network.test.ts` |
| AC-2 | No test in the repo reaches the Anthropic network; every suite drives the stub | `packages/llm/tests/no-network.test.ts` (a planted violation proves the scan) |
| AC-3 | `pnpm build` succeeds with `ANTHROPIC_API_KEY` unset; the adapter refuses at **call** time, not import time | verification step 7 |
| AC-4 | `runInference` refuses with `WorkspacePausedError` under an open pause **and the adapter is never invoked** | `packages/brain/tests/inference.test.ts`; the stub throws if called |
| AC-5 | The pause fixture used by AC-4 makes `hasOpenPause` true while `isPausedSubscription` is false | same test; both predicates asserted explicitly |
| AC-6 | A second onboarding build is debited; `COUNT(DISTINCT attempt_id)` decides, not row count | `packages/brain/tests/attempts.test.ts` |
| AC-7 | A 429, a 5xx and a transport failure each write a `model_usage` row and consume **no** attempt | same test, one case per outcome |
| AC-8 | A duplicate debit for one `attempt_id` is refused by the DB, not by application code | `packages/brain/tests/attempts.test.ts` against real Postgres |
| AC-9 | `runInference`'s params type cannot express `resolvedTier` or `costState` (`@ts-expect-error`) **and** a value smuggled via `as unknown as` does not reach the row | `packages/brain/tests/metering-authority.test.ts` |
| AC-10 | `recordModelUsage` has exactly one caller in `packages/**`; the scan finds a planted second caller | same test |
| AC-11 | A configured model with no price row refuses **before** any adapter call | `packages/brain/tests/pricing.test.ts` |
| AC-12 | A response model with no price row writes `cost_state='unknown'` and `cost_micro_usd IS NULL` — never `0` | same test |
| AC-13 | Cost is computed in `bigint`; no float appears on the cost path | source scan + an arithmetic test at 1M tokens |
| AC-14 | The rollup increment and the `model_usage` insert are in one transaction: a forced failure after the insert leaves **neither** | `packages/brain/tests/spend.docker.test.ts` |
| AC-15 | `reconcileWorkspaceSpend` detects a planted drift and returns clean otherwise | `packages/brain/tests/reconcile.test.ts` |
| AC-16 | A `reference` input is refused as provenance for `voice`, `performance_meta` and `killtest`, and **accepted** for `strategy` | `packages/db/tests/reference-echo.test.ts` |
| AC-17 | An 8-word span copied verbatim from a `reference` input into any of the four kinds' content is refused; a 7-word span and a common collocation are not | same test |
| AC-18 | `activateBrainDoc` refuses while **any** inferred field is unconfirmed (D-M2-5b) | `packages/brain/tests/activate.test.ts` |
| AC-19 | Two concurrent activations for one `(profile, kind)` leave exactly one `active` row | `packages/brain/tests/activate.docker.test.ts` (real two-connection Postgres) |
| AC-20 | The DB CHECK refuses an `active` row with `confirmed_at IS NULL`, even via raw SQL | `packages/db/tests/migration-shape.test.ts` |
| AC-21 | `createProfile` refuses for a non-owner role and for a tier at cap, and counts **active** profiles only | `packages/brain/tests/profiles.test.ts` |
| AC-22 | An over-cap workspace (post-downgrade) is refused on `createProfile` and `runInference` with `ProfileCapExceededError`, while **reads and export still succeed** | same test |
| AC-23 | Nothing archives a profile automatically; no webhook path writes `creator_profiles.state` | source scan over `packages/credits/src/webhooks.ts` with a planted violation |
| AC-24 | The evidence label renders "evidence: N of M posts"; **the word "confidence" appears in no user-facing string** | `packages/brain/tests/evidence.test.ts` + a repo-wide scan of user-facing strings |
| AC-25 | Export covers every table the creator-data registry marks included; a new included table without export coverage fails the test | `packages/brain/tests/export-coverage.test.ts` |
| AC-26 | Export succeeds under an open pause (reading is not writing) and for an archived profile | `packages/brain/tests/export.test.ts` |
| AC-27 | `app/**` cannot import the `@respin/brain` root, `writeCapabilities`, or any scope mint; only `@respin/brain/app-server` resolves | `eslint .` + `tests/import-boundary.test.ts` (a planted forge in both `app/**` and `packages/**`) |
| AC-28 | A stored pre-change config document still parses after the code change; `migrate-config` is idempotent on the second run | `packages/config/tests/migrate-config.test.ts` + verification step 8 |
| AC-29 | Entry gate green on the CI shape with no loud-skips | verification steps 3-7 |
| AC-30 | **R-31 records all fourteen decisions B-1..B-14 and DL-11's M6 constraint**, and `creator-data-registry.ts`'s `workspace_spend_monthly` entry names the M6 pseudonymisation constraint. **Verified by re-reading each file after writing**, per the 2026-08-18 lesson — a claim that something was recorded is not a recording | `docs/initial/decisions.md`, `packages/db/src/creator-data-registry.ts`; the registry claim is asserted by `tests/creator-data-registry.test.ts` so it cannot drift |

## Mutation matrix (each labelled with the tool that produces the red)

| # | Planted mutation | Expected red | Tool |
|---|---|---|---|
| P-1 | Delete the pause check from `runInference` | AC-4 fails | vitest |
| P-2 | Move the pause check to *after* the adapter call | AC-4 fails (the stub was invoked) | vitest |
| P-3 | Swap `hasOpenPause` for `isPausedSubscription` | AC-5 fails | vitest |
| P-4 | Add `resolvedTier` back to `runInference`'s params and pass it through | AC-9 fails | tsc + vitest |
| P-5 | Add a second `recordModelUsage` caller | AC-10 fails | vitest (source scan) |
| P-6 | Remove `assertNoReferenceEcho` from `writeBrainDoc` | AC-17 fails | vitest |
| P-7 | Add `strategy` to the provenance-barred set | AC-16 fails (the exempt case) | vitest |
| P-8 | Return `0n` instead of `null` when no price row resolves | AC-12 fails | vitest |
| P-9 | Move the rollup increment outside the transaction | AC-14 fails | vitest (Docker) |
| P-10 | Drop the `WHERE ref_type = 'inference_attempt'` predicate from the index | AC-8 fails | vitest (Docker) |
| P-11 | Remove the `status <> 'active' OR confirmed_at IS NOT NULL` CHECK | AC-20 fails | vitest (Docker) |
| P-12 | Make the cap count archived profiles too | AC-21 fails | vitest |
| P-13 | Archive a profile from the subscription-downgrade webhook branch | AC-23 fails | vitest (source scan) |
| P-14 | Remove a table from the export while leaving it registry-included | AC-25 fails | vitest |
| P-15 | Break the `no-network` scan's regex (drop a backslash) | the scan's own planted-violation case fails | vitest |
| P-16 | Weaken activation to require only *below-threshold* fields to be confirmed | AC-18 fails | vitest |
| P-17 | Put the word "confidence" into a user-facing string | AC-24 fails | vitest (source scan) |
| P-18 | Remove the M6 pseudonymisation constraint from the registry entry | AC-30 fails | vitest |

P-15 exists because of the 2026-08-21 lesson: a scan reporting zero violations is indistinguishable from a scan that is working.

## Least confident (one line)

**B-10's 8-word content-echo threshold** — it is a judgment, not a measurement, and it is the one decision here whose false-positive rate I cannot predict from the code: a creator whose genuine voice happens to match eight words of a reference post gets a refusal they cannot diagnose, and there is no corpus to calibrate against.

## Out of Scope (surgical changes)

Do not touch: `packages/credits/src/webhooks.ts` (beyond the AC-23 read-only scan), the Stripe dispatcher, `packages/auth`, the `frameworks` table (M2c's), any `app/**` route (M2c builds the UI), or the three UGC contract schemas.

## Completion Criteria (Definition of Done)

- Entry gate clean: every command in `CLAUDE.md`'s Commands block passes on the CI shape, with no new failures vs the 648/648 baseline.
- All four applicable Critical-Path gates report PASS and the report card reads **Ready**.
- Cross-referenced docs stay consistent: `decisions.md` (R-31), `PRD.md`, `tech-spec.md` and `creator-data-registry.ts` updated in the same change.
- Every AC met with its named evidence; every P-mutation verified to produce its red, and the source restored byte-identical afterwards.

## Plan Review Log

| Round | Date | Reviewers | Verdict |
|---|---|---|---|
| 1 | 2026-08-24 | `respin-tenancy-reviewer` · `respin-billing-reviewer` · `respin-compliance-reviewer` · `respin-learning-reviewer` (four in parallel over the frozen draft) | **BLOCK / BLOCK / BLOCK / BLOCK**, grade D across the board. 20 BLOCK · 43 CHANGE · 21 NOTE. Generalist `plan-reviewer` deliberately **not** run — see the review report §7. |
