# Slice 6: First generation

## A creator can…
**Generate a set of hooks from their own coherent brain, see them kill-tested, and see one atomically settled credit debit.**

That sentence is the acceptance test and it is walked in a browser **on the Free tier**, which is why hooks is the mode: PRD §4G gives Free "Hooks, Captions, Ideas" only, and a walk that requires a paid subscription proves the product works for nobody who has not paid yet.

## Why this shape

Slice 3 sent a creator's words to a model and wrote a belief about them. **This slice is the first time the product writes something for a creator to publish**, and three things are true of it that were not true before:

1. **There is no free-tier credit.** Verified: the only `grantCredits` call site is `webhooks.ts:1140-1149`, guarded at `:1096-1103` to throw for any tier that is not `creator`/`pro`/`studio`. `allowances.free = 25` exists in the schema and the seed and **is read by nothing**. A Free workspace has a permanent balance of zero unless it buys a pack. Until that changes, this slice's acceptance walk is unwalkable.
2. **Nothing stores a generation.** No `generations` table, no output column, no lineage, no feedback. `model_usage` stores metering and **may never store output text** — `assertMeteringOnly` enforces it (`with-workspace.ts:2006`).
3. **The metered-call door was deliberately deleted.** Slice 2a removed `runInference` from the app facade (`app-server.ts:230-238`) so `app/**` cannot reach a model with an arbitrary prompt. That is correct and stays. **Slice 6 adds its own composed operation with its own cage**, exactly the way `inferVoice` did — it does not re-open a general door.

## Open items closing here
Free-tier credit minting (**DL-2 / R-21**) · **REQ-I03 at the generation surface**.
Claims and evidence: [`../progress/respin-finish-open-items.md`](../progress/respin-finish-open-items.md).

## Prerequisites
- [ ] Slices 3b, 4 and 5 shipped — the generation records one coherent active-brain snapshot, inherits the live reference controls, and slice 5 lets a creator fix a wrong brain
- [x] **Free requires no card — decided, R-55 (2026-08-29, delegated).** PRD §7 open decision 4 taken as written (decide after observing abuse); §"question 1" names the abuse surface this opens so slice 10c's full Free-tier abuse pass has something concrete to close, and R-55 carries the revisit trigger
- [ ] The mode's credit cost is already in config (`creditCosts.hookSet`) and already seeded — **no owner decision is outstanding on price**, unlike slice 2a

---

## The four questions the stub left open, answered

### 1. Free-tier minting — where do 25 credits a month come from?

**Lazily, at balance-derivation time, exactly the way expiry already works. No runner, no signup grant, no job.**

`deriveBalanceInTx` (`balance.ts:39-99`) already takes the workspace advisory lock, folds the ledger, **lazily appends `expiry` rows for crossed lots via `onConflictDoNothing`, and re-folds**. That is already a read path that writes, already idempotent, already under the right lock, and already the mechanism R-20 chose so that "the ledger is the balance" stays literally true with no cron. A Free monthly grant is the same shape pointing the other way.

**The three details that make it correct:**

- **Idempotency is settled in the schema, not in application code** — the rule `billing-schema.ts:200-216` already states for the inference debit. A partial unique index on `(workspace_id, ref_id) WHERE ref_type = 'free_allowance'`, joining the five that already exist, with `ref_id` the period key. An application-level "have we granted this month?" read is a read-then-write on a table with no constraint behind it, and two connections both read no.
- **The period is the calendar month in UTC**, because Free has no subscription and therefore no billing anniversary. The `yyyy-MM` convention already exists in `auto-topup.ts:252-266`'s idempotency key.
- **`expires_at` is the end of that calendar month**, because PRD §4G gives Free **no rollover**. That falls out of the lot-allocation fold with no special case: an unconsumed Free lot simply crosses its expiry and the fold materialises its `expiry` row, which is the machinery already built.

**What this costs, stated rather than discovered.** Every balance read on a Free workspace can now write a row — including reads inside the Stripe webhook's transaction, which already calls `getActiveConfig` five times and whose failure earns a redelivery. So the mint must be **cheap, idempotent, and unable to throw for any reason other than a genuine database failure**, and R4 below makes the webhook path a test rather than a hope.

**The abuse surface this opens, named for slice 10c**: with no card required, one email address is 25 credits a month, and nothing bounds the number of email addresses. The bound today is `concurrencyLimits` and `RUN_SLOT_POOL_MAX` — which bound *our vendor concurrency*, not the number of accounts. Slice 10a bounds the anonymous demo; slice 10c closes the full verified-email/account/workspace/global Free-tier abuse contract.

### 2. REQ-I03 at the generation surface — what does the product actually do?

**A deterministic traceability scan, plus a sentence that says what it does not prove.** R-34 already narrowed the honest claim: C-28 enforces *that* a claim is cited, never that the citation supports it, and semantic support "is not computable and is not claimed". That narrowing is right and this slice does not pretend to widen it.

What *is* computable is **traceability**:

> Every specific-shaped token in the output — a number, a date, a proper noun, a place, a named quantity — is checked for membership in the union of (the creator's active brain content, the input they gave this generation). An unmatched token is an **untraceable specific**.

That is deterministic, testable, and honest about which error it makes: it is a **recall control with known false positives** (a generic proper noun will flag). So the product's behaviour is **flag and offer `[check]`, never silently delete** — deleting on a false positive corrupts the creator's script, and `[check]` is already a first-class token in both `brain-content.ts:53` and `packages/llm/src/assemble.ts:47`.

**And the limit is stated to the creator, not buried.** One sentence on the output: the product checked every specific against what they told it, and it cannot check whether a claim is *true*. This is the R-34 pattern — record what is not claimed — applied on the surface where a person reads the output rather than in a decision log.

### 3. Does `packages/modes` land whole, or one mode now and six in slice 7?

**One mode.** The slice rule permits either and the estimate assumes one pipeline plus hooks. Two reasons make it the right call rather than the cautious one:

- **The pipeline is the risk, not the modes.** Assemble → generate → kill test → meter → emit is five new seams, three of which (kill test, the generation store, the per-mode price lookup) have no precedent in the repo. Six more modes on a proven pipeline is slice 7's low-risk volume; six more modes on an unproven one is M2b-1's shape.
- **Hooks is the Free-tier mode**, so the acceptance walk runs on the tier the free-minting work in question 1 exists for. Building `fullScript` first would make the walk require a $10 subscription and leave question 1 untested end to end.

**What lands whole regardless:** the `ScriptOutput` schema's shape is designed for all seven (tech-spec §3 step 6), because retrofitting an output contract after six modes have shipped against a narrower one is the expensive version.

### 4. Which post-call refusals apply, and does a `schema_invalid` reply consume the creator's credits?

**No — and R-48 already contains the reasoning, one case over.**

R-48 split `billable` (did the vendor charge us — decides the REQ-G05 rollup) from `consumesIncludedBuild` (should the creator's entitlement be spent). For a generation there is no "included build"; the question becomes **does the debit happen**, and the answer follows the same principle:

| Outcome | `model_usage` row | Debit |
|---|---|---|
| Success, kill test passes | yes | **yes** |
| Success, kill test fails → one rewrite → passes | yes (per call) | yes, **once** |
| Success, kill test fails after the rewrite → honest refusal | yes | **yes** — the creator got a real answer, and REQ-C03 says the refusal *is* the product working |
| `LlmSchemaInvalidError` — the vendor produced text we could not parse | yes, billable | **no** — our parse failure |
| `LlmTruncatedError` — our `maxOutputTokens` too low | yes, billable | **no** — R-48's exact case, our deterministic outage |
| Rate-limited / unavailable / aborted | yes, non-billable | **no** |

**And the bound R-48 demands comes with it.** R-48's own cost note: splitting the flag removed the only thing bounding a billable non-consuming call, and `onboarding.maxUnchargedBillableAttempts` was the deliberate replacement. Generation needs the same bound, **generalised per purpose** rather than copied — `countUnchargedBillableAttempts({purpose})` already takes a purpose (`with-workspace.ts:512-533`), so the accessor is ready and only the cap's config key and the refusal need widening.

**The kill-test refusal being billable is the one row worth arguing about, so it is argued here rather than later.** REQ-C03 says an honest failure is the product working correctly — "everything died, here is why, here is a sharper angle". A creator who is told that received the thing they paid for. Charging for it is defensible; charging for our parse bug is not. That is the line.

---

## Requirements

### The pipeline (`packages/modes`)
- [ ] **R1:** `packages/modes` is created and **joins the import boundary deliberately** — `eslint.config.mjs`'s negation catch-all (`:267-283`) denies any new `@respin/*` package by default, with the gitignore-semantics trap recorded at `:249-262` (negate the package **root** as well as the entrypoint, or the negation is inert). A deny fixture goes in `tests/import-boundary.test.ts` alongside the pre-registered `@respin/trends` entry at `:862`.
- [ ] **R2:** The pipeline is **callable from tests without HTTP** (tech-spec §1's rule) and its assemble half is **pure**, matching `packages/llm/src/assemble.ts`'s established shape: no db, no network, no clock.
- [ ] **R3:** `ScriptOutput` is a Zod `strictObject`, parsed fail-closed. An unparseable reply writes **no** generation — never a partial one. This is `parseVoiceReply`'s contract (`assemble.ts:284-399`) and it is copied, not reinvented.
- [ ] **R4:** The prompt bundle's hash is recorded as `prompt_bundle_version` (REQ-J02). `RunInferenceParams.promptBundleVersion` is already **required with no default** (`inference.ts:75-83`) — the default was deleted deliberately, so this is a parameter to supply, not a mechanism to build.

### The kill test (REQ-C03)
- [ ] **R5:** **The hard rules are deterministic application code, and only the creator's own rules go to a model.** tech-spec §3 step 3 lists four hard rules — fragment triads, antithesis constructions, invented specifics without `[check]`, hook over 14 words where active. Three are computable from the text alone and the fourth is question 2's scan. The `killtest` brain document holds `rules: claim(string)[]` (`brain-content.ts:308-313`) — *the creator's* criteria — and those are what the cheap model call scores. A hard integrity rule decided by a model is a rule that can be talked out of firing.
- [ ] **R6:** A hard-rule violation triggers **exactly one** automatic rewrite, then surfaces honestly. "Everything died, here is why, here is a sharper angle to try" — never padded with filler, never silently retried until something passes.
- [ ] **R7:** Kill-test results are stored on the generation (REQ-C03), including which rule fired and whether the rewrite happened. A refusal a creator cannot inspect is indistinguishable from a bug.
- [ ] **R8:** **Planted violations are caught.** M3's acceptance criterion names four fixtures — a fragment triad, an antithesis construction, an invented specific, a 16-word hook — each caught and rewritten or honestly failed. That criterion is inherited verbatim, not paraphrased.

### The generation store
- [ ] **R9:** A `generations` table per tech-spec §2, with the composite FK `(profile_id, workspace_id)` → `creator_profiles(id, workspace_id)` and **both columns NOT NULL** — MATCH SIMPLE skips a composite FK when either half is NULL, which is the rule every child table in this schema already follows. Add `UNIQUE (id, profile_id, workspace_id)` for same-tenant lineage/result FKs in slices 7/9.
- [ ] **R9a:** Every generation stores the immutable coherent-brain activation id plus exact Voice, Strategy, Kill Test, framework and creator-input/context versions used. A later brain or metric edit cannot change the historical explanation.
- [ ] **R10:** It is registered in **three** instruments, and two of them will not tell you if you forget:
  - `creator-data-registry.ts` — **auto-detected**; `tests/creator-data-registry.test.ts:151-159` fails on any new `CREATE TABLE` with no export and deletion decision (reasons over 40 characters). It holds creator content, so `export.included` must be `true` and slice 5's exporter must gain its query.
  - `tests/table-writers.test.ts`'s `TABLES` map (`:27-34`) — **manual**; nothing fails if you forget, which is exactly why it is a requirement.
  - `packages/db/tests/profile-scope.test.ts:519-555` — the capability/accessor key agreement, which **does** fail on a new capability.
- [ ] **R11:** Output text lives here and **never** in `model_usage.usage_raw`. `assertMeteringOnly` already refuses it; R11 is the reminder that the temptation exists.

### Metering and money
- [ ] **R12:** A **new purpose constant** for generation. `ONBOARDING_BRAIN_PURPOSE` is the only one today and it is the grain `countBillableAttempts` prices against — a second operation sharing it would price a generation as an onboarding rebuild.
- [ ] **R13:** `priceOf` is **generalised from the hard-coded onboarding pair** (`inference.ts:631-638`) to a per-purpose lookup, and `requiredConfigPaths` (`:244-252`) with it. `creditCosts.hookSet` exists, is seeded, and has no reader — this is its first one. A price on `requiredConfigPaths` fails closed if the stored document lacks it, which is the A-9 rule for anything that bills.
- [ ] **R14:** A durable `generation_attempts` claim is committed **before** outbound HTTP. Its server-derived state is `claimed → vendor_started → vendor_complete → settled|refused|recovery_required`; payload hash, purpose/profile/workspace, timestamps and terminal ids are immutable. Same `attempt_id` + different payload refuses. Duplicate/concurrent submissions observe the same claim and only its winner may execute the vendor sequence.
- [ ] **R14a:** Each actual vendor call writes its append-only `model_usage` row in an independent committed transaction linked to the attempt. A later balance/settlement refusal must not erase vendor spend. Logs and the attempt record never substitute for `model_usage`.
- [ ] **R14b:** After parsing and kill/traceability gates, a **single workspace-locked settlement transaction** re-derives tier/price and balance, then atomically persists the usable generation or billable honest-refusal row **and** its one debit. The debit references the generation and attempt. If the debit/balance check fails, neither usable generation nor debit commits; the attempt records the refusal without exposing output.
- [ ] **R14c:** The debit is protected by a schema unique constraint on the attempt/business reference. A retry of `vendor_complete` settles the stored validated candidate without another vendor call. A crash after outbound HTTP but before the durable response checkpoint becomes `recovery_required`: it is visible to operators and the creator receives a no-charge/refund-safe refusal; the system never guesses by auto-calling the vendor again.
- [ ] **R15:** A zero balance is refused **before** the vendor call, with the top-up prompt (REQ-G03). The pause gate, the role gate, the archived-profile gate and the run slot all apply, in `runInference`'s established order (`inference.ts:15-29`) — this slice reuses that order rather than inventing a second one.
- [ ] **R16:** The uncharged-billable-attempt bound is generalised per purpose (question 4), with its own config key and its own refusal copy.
- [ ] **R17:** Free-tier minting per question 1, with its partial unique index and its **webhook-path test** (R4's cost).
- [ ] **R17a:** Replace slice 2b's named `/usage` "by mode" absence. Debit business references join to terminal generations/attempts, and the creator sees credit burn by mode for the paid subscription period or the Free UTC calendar month. There is no mode inference from the cost rollup.

### Tier gating
- [ ] **R18:** **The first feature gate by tier in the codebase.** There are exactly three tier-keyed decisions today — the profile cap, the concurrency limit, the allowance amount — and no `canUseMode`, no tier→feature map, no UI gate. This slice adds one mode, so the gate is small; **it is built as a map, not an `if`**, because slice 7 adds six more and a chain of `if`s is how a mode ships ungated. The tier authority stays `getWorkspaceBillingState` — no second derivation.

### Honesty
- [ ] **R19:** REQ-I03's traceability scan and its stated limit (question 2).
- [ ] **R20:** "Why this performs" **always names the weakest point** (REQ-I04, REQ-C02). No output claims reach, performance, or virality; `tests/support/forbidden-claims.ts` already bans the vocabulary and the scan runs over this screen's real copy.
- [ ] **R21:** **No performance claim at n = 0.** The creator has logged no results — the product has no evidence about them and must not imply it does. The `NOT_BUILT_YET` ban list (`forbidden-claims.ts:64-69`) currently bans `generat`, `script` and `hook` on screens that do not do the thing; **this slice is where `/studio` leaves that list**, and the removal must be replaced by positive assertions the way R-38 replaced the word "credit" — a word leaving a ban is otherwise indistinguishable from a weakened guard.

---

## Left to the developer

- **Whether generation streams** (tech-spec §3's "show the stream, mark it checking, then finalise"). The kill test runs on the buffered result either way; streaming is a UX improvement this slice may defer and slice 7 may add. If deferred, say so on the screen rather than showing a spinner that implies it.
- **The `ScriptOutput` shape's exact fields**, subject to R3 and tech-spec §3 step 6.
- **Where the traceability scan lives** — `packages/modes` or `packages/llm`. Its invariant is purity and testability, not its address.
- **Test file layout.**

## Tasks
1. [ ] `packages/modes` + the import-boundary edit + its deny fixture (R1)
2. [ ] `ScriptOutput` schema, pure assemble, fail-closed parse (R2–R4)
3. [ ] The deterministic hard rules + the creator's-rules model call + the one rewrite (R5–R8)
4. [ ] `generations` migration; all three instrument registrations; slice 5's exporter gains its query (R9–R11)
5. [ ] The generation purpose, the per-purpose price lookup, `requiredConfigPaths` (R12, R13)
6. [ ] Attempt claim/state machine, independent usage commits, atomic generation/refusal + debit settlement, schema idempotency, crash recovery and gate order (R14–R16)
7. [ ] Free-tier minting + its index + the webhook-path test (R17)
8. [ ] The tier→mode map and its gate (R18)
9. [ ] The traceability scan, the weakest-point requirement, the `/studio` honesty-scan transition (R19–R21)
9a. [ ] Replace `/usage`'s by-mode absence with the generation/debit-backed breakdown and explicit Free/paid period semantics (R17a)
10. [ ] The `/studio` screen and its composed facade operation (its own cage, like `inferVoice`)
11. [ ] Walk it **on Free**: sign up → onboard → activate a brain → generate hooks → read the kill test → see the debit

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
| File | Action | Purpose |
|---|---|---|
| `respin/packages/modes/**` | Create | The pipeline, the hooks mode, `ScriptOutput`, the kill test's hard rules |
| `respin/packages/llm/src/assemble.ts` | Modify | Generation prompt assembly beside the voice one |
| `respin/packages/credits/src/inference.ts` | Modify | Per-purpose `priceOf` and `requiredConfigPaths` (R13) |
| `respin/packages/credits/src/generate.ts` | Create | The composed operation, cage + gates + meter + debit (the `infer-voice.ts` shape) |
| `respin/packages/credits/src/balance.ts` | Modify | R17's lazy Free mint |
| `respin/packages/db/src/generation-schema.ts` | Create | `generation_attempts`, `generations`, coherent provenance and same-tenant keys |
| `respin/packages/db/migrations/0017_*.sql` | Create | Attempt state, generations, composite/partial unique indexes and debit reference |
| `respin/packages/db/src/creator-data-registry.ts` | Modify | R10's export and deletion decisions |
| `respin/packages/db/src/export.ts` | Modify | Slice 5's exporter gains `generations` |
| `respin/app/(product)/studio/**` | Modify | The mode surface, the output document, the refusal, the debit line |
| `respin/app/(product)/usage/**` | Modify | Credit burn by mode from debit/generation references |
| `respin/app/(product)/billing-errors.ts` | Modify | Every new refusal, per the four-step pattern |
| `respin/eslint.config.mjs` | Modify | R1's negation entry |
| `respin/tests/table-writers.test.ts` | Modify | R10's manual registration |
| `respin/tests/support/forbidden-claims.ts` | Modify | R21's transition, with positive assertions replacing the bans |

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **On a Free account with no card: sign up → onboard → activate → generate hooks → see the debit**, in a browser, against the real vendor
3. [ ] A Free workspace's first balance read mints 25 credits; the second read mints nothing (R17)
4. [ ] Two concurrent first reads mint **one** grant (R17's index, on real Postgres)
5. [ ] A balance read inside a Stripe webhook transaction does not fail the webhook (R17's cost)
6. [ ] Each of M3's four planted kill-test violations is caught and rewritten or honestly failed (R8)
7. [ ] A generation whose rewrite also fails → honest refusal on screen, generation stored, credit debited (R6, question 4)
8. [ ] A truncated reply → `model_usage` row written, **no** debit, and the repeat is bounded (R16)
9. [ ] Zero balance → refused before the vendor call, with the top-up prompt (R15)
10. [ ] A Free workspace attempting `fullScript` → refused by the tier map, with copy that does not say "upgrade" as a bare remedy (R18; `billing-errors.ts:696-708` already bans that shape)
11. [ ] An output containing a number that appears in neither the brain nor the input → flagged, `[check]` offered, not silently deleted (R19)
12. [ ] Export a brain after generating → the generation appears (R10, slice 5's registry-driven exporter)
13. [ ] Submit the same attempt concurrently and retry it after completion → one vendor sequence, one terminal row and one debit; changed payload refuses (R14/R14c)
14. [ ] Force a crash/failure between `model_usage` commit and final settlement → spend fact survives, no usable unpaid generation exists, and retry settles only a durable candidate or returns `recovery_required` without another vendor call (R14a–R14c)
15. [ ] Drop balance after vendor completion but before settlement → atomic refusal, no generation/debit split and no output leak (R14b)
16. [ ] `/usage` shows hook burn by mode in the correct Free period and does not query the cost rollup (R17a)

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | Hard kill-test rules routed through the model instead of code | R5's determinism test |
| M2 | The one-rewrite bound becomes a loop | R6's test |
| M3 | Generation commits before or outside the debit transaction | Verification 14/15 |
| M4 | Free mint's partial unique index dropped | Verification 4 (real Postgres) |
| M5 | Free mint runs for paid tiers too | A paid-tier balance test |
| M6 | Generation shares `ONBOARDING_BRAIN_PURPOSE` | R12's pricing test |
| M7 | `ScriptOutput` parse accepts a partial document | R3's fail-closed test |
| M8 | Tier map replaced by an allow-all | Verification 10 |
| M9 | Traceability scan deletes instead of flagging | R19's false-positive test |
| M10 | Output text written into `usage_raw` | `assertMeteringOnly` |
| M11 | Duplicate claim winners both execute the vendor sequence | Verification 13 |
| M12 | Balance is not rechecked inside the settlement lock | Verification 15 |
| M13 | By-mode burn derives from `workspace_spend_monthly` | Verification 16 |

**Population note — read before reporting "N of N".** Ten mutations, all on code that will exist. **Three hazards no mutation can reach, named now:** (a) **R21's honesty transition is a removal** — `/studio` leaves the `NOT_BUILT_YET` ban list, and R-38 records that a word leaving a ban is indistinguishable from a weakened guard unless positive assertions replace it; nothing here fails if those assertions are weak. (b) **R10's `table-writers.test.ts` registration is manual** — the instrument does not auto-detect a new table, so forgetting it produces a green suite and an unpoliced write surface. (c) **R18's tier map is a control whose second, third and fourth cases do not exist yet**; a map with one entry is indistinguishable from an `if`, and slice 7 is where the difference shows. Before claiming a matrix result, state which requirements have no control, and have someone other than the author plant at least three mutations — the 2026-08-26 record is six of ten reviewer-planted mutations surviving a matrix the author scored 24 of 24.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] The "A creator can…" line walked in a browser **on Free**, against the real vendor
- [ ] **All four Critical-Path gates** PASS — reviewers in **isolated worktrees**
- [ ] DL-2/R-21 and REQ-I03-at-the-generation-surface closed in the disposition register
- [ ] `decisions.md` carries: the lazy Free-mint decision **with its webhook-path cost and its named abuse surface**, the deterministic-hard-rules split, the billable-vs-debitable table from question 4, and REQ-I03's traceability-not-verification limit
- [ ] `build-plan.md` M3's engineering criteria are measured; **its evidence criterion (10 real generations logged in `docs/progress/m3-quality.md`) is a separate claim and is not asserted by this slice**
