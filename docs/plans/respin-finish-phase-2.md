# Slice 2: One metered model call

## A creator can…
**Press a button, cause a real Anthropic call, and see the credits and the usage row it produced.**

That sentence is the acceptance test. The output can be throwaway text — this slice proves the **money and metering spine**, not the intelligence.

## Why this shape
This is M2b-2's core, and it is the riskiest slice in the plan: the repo's **first outbound HTTP client in `packages/**`**. It is kept deliberately separate from inference-into-a-brain (slice 3) so that when something breaks, it is obvious which half broke.

## Prerequisites
- [ ] Slice 1 shipped (a profile exists, reachable)
- [ ] **Owner decision: `creditCosts.onboardingBrainRebuild`.** A config-data precondition — settle it before the config step, not during the UI
- [ ] **Owner decision: model tiers per operation** (generation Sonnet-class, classification Haiku-class)
- [ ] `ANTHROPIC_API_KEY` available server-side

---

## Requirements

### The adapter (`packages/llm`)
- [ ] **R1:** Anthropic behind a provider adapter (R-5, `tech-spec.md:19`) — the vendor is swappable. No Anthropic type crosses the package boundary.
- [ ] **R2:** `baseURL` is **pinned and non-overridable**, proved by a planted `fetch` to a closed platform being refused.
- [ ] **R3:** **No prompt or completion text** in any log line or thrown error. Asserted, not commented.
- [ ] **R4:** Key read server-side only; a missing key is a typed refusal naming the remedy, never a stack trace.
- [ ] **R5:** Explicit timeout and a bounded retry. A retry shares the **same `attempt_id`**.

### Pricing
- [ ] **R6:** Price table **keyed by model id**, in config. An active model with **no price row is a typed refusal, not a silent zero** (D-M2-13).
- [ ] **R7:** Cost computed in **nano-USD per token**, converted to `cost_micro_usd` **rounding up, never truncating**.

### The metering spine — the order is the requirement
- [ ] **R8:** **Pause gate at operation entry, before the model call.** Load-bearing precisely because a zero-cost operation skips `debitCredits` entirely.
- [ ] **R9:** **Balance read and refusal before the call.** Never after tokens are spent.
- [ ] **R10:** `maybeAutoTopup` composes into the pre-call check, **and a triggered top-up does NOT license proceeding.** Refuse this attempt regardless; say the top-up is settling and to retry once it lands. **Do not promise the next attempt will succeed** — an off-session PI can decline, the webhook can lag, the cap can bite. Catch every top-up outcome, **returned or thrown**.
- [ ] **R11:** `model_usage` is written **in its own committed transaction** — the A-7 settlement-tail exemption. The round-1 defect was the adapter call inside the transaction holding `model_usage`, so a refused debit rolled back the spend record.
- [ ] **R12:** The debit composes **after**, one per `attempt_id`, settled by a **partial unique index** on `(ref_type, ref_id) WHERE ref_type='inference_attempt'`.
- [ ] **R13:** `model_usage` is written on **failure as well as success**; the five-value outcome enum is classified with **exhaustiveness asserted over `usageOutcome.enumValues`**. M2b-1 added ~seven post-call brain-write refusals the current five do not cover — extend the enum in this slice or record why not.
- [ ] **R14:** Only a **billable vendor response** consumes the free attempt. A 429, a 5xx or a pre-response transport failure consumes nothing.
- [ ] **R15:** `resolved_tier` and `cost_state` are **inexpressible by the caller** — built field by field, never spread.
- [ ] **R16:** Clock is `getDbNow(tx)`, never `new Date()`.
- [ ] **R17:** `runInference` has a **role gate** (a viewer cannot generate, REQ-A02) and refuses an **archived profile** by reading `creator_profiles.state` **at operation time**.

### Register items that become reachable here
- [ ] **G-14:** a test that **races two `writeBrainDoc` calls** — deleting the advisory lock currently leaves the whole suite green
- [ ] **G-17:** record the **lock ordering** — workspace key before brain key, always. M2b-2 takes both in one transaction

### Honesty
- [ ] **R18:** The button says what it will spend before it spends it. The refusal copy names an action the reader can take.

---

## Tasks
1. [ ] `packages/llm`: adapter, pinned baseURL, timeout/retry, no-text-in-logs assertion
2. [ ] Config: `llm.model`, model-id price table, model tiers, `onboardingBrainRebuild` — with the fail-closed price lookup
3. [ ] `runInference`: pause → balance/top-up → call → `model_usage` (own tx) → debit; role and archived-state gates
4. [ ] Migration: the `(ref_type, ref_id)` partial unique index; outcome enum extension if taken
5. [ ] A trivial `/onboarding` button that runs it and shows the result, the cost and the new balance
6. [ ] Tests incl. the two Docker races (G-14, and the free-attempt count)
7. [ ] Walk it: press the button, watch a real call, check `/usage`

## Files
| File | Action | Purpose |
|---|---|---|
| `respin/packages/llm/**` | Create | Adapter, price table, `assemble.ts` stub |
| `respin/packages/config/src/schema.ts` | Modify | `llm`, price table, tiers, rebuild cost |
| `respin/packages/credits/src/ledger.ts` | Modify | Debit keyed on `attempt_id` |
| `respin/packages/db/src/with-workspace.ts` | Modify | `runInference`, archived-state gate |
| `respin/packages/db/migrations/0013_*.sql` | Create | Partial unique index, enum extension |
| `respin/app/(product)/onboarding/**` | Modify | The button and its honest copy |
| `respin/packages/llm/tests/**` | Create | baseURL pin, no-text-in-logs, price fail-closed |
| `respin/packages/db/tests/inference.docker.test.ts` | Create | G-14 race, free-attempt race |

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **Press the button → a real Anthropic call → `/usage` shows the row and the debit.** In a browser.
3. [ ] Zero balance → refused **before** the call, with the top-up prompt
4. [ ] A triggered auto-top-up still refuses **this** attempt and does not promise the next
5. [ ] Vendor 500 → `model_usage` written with a failure outcome, **no** debit, free attempt **not** consumed
6. [ ] Two concurrent inferences → one debit per `attempt_id`
7. [ ] Planted `fetch` to a closed platform → refused
8. [ ] Deleting the advisory lock → **red** (G-14)

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | `model_usage` moved inside the debit transaction | Vendor-500 test (spend record vanishes) |
| M2 | Balance check moved after the call | Zero-balance test |
| M3 | A triggered top-up licenses proceeding | Auto-top-up test |
| M4 | Price lookup returns 0 for an unknown model | Fail-closed price test |
| M5 | `cost_micro_usd` truncates instead of rounding up | Rounding test |
| M6 | Advisory lock removed | G-14 race |
| M7 | Free attempt consumed on a 429 | Retry test |

**Population note:** all seven perturb code that exists. Before claiming "N of N", state what has **no** control at all yet — that is where the last two gate rounds found everything.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] The "A creator can…" line walked in a browser against the real vendor
- [ ] **Billing and learning** Critical-Path gates PASS on this slice, reviewers in **isolated worktrees**
- [ ] G-14 and G-17 closed; the register updated
- [ ] Ledger entry recording the real cost of one call and what the vendor actually returned
