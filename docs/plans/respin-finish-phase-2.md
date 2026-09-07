# Slice 2: One metered model call

## A creator can…
**Press a button, cause a real Anthropic call, and see the credits and the usage row it produced.**

That sentence is the acceptance test. The output can be throwaway text — this slice proves the **money and metering spine**, not the intelligence.

## Why this shape
This is M2b-2's core, and it is the riskiest slice in the plan: the repo's **first outbound HTTP client in `packages/**`**. It is kept deliberately separate from inference-into-a-brain (slice 3) so that when something breaks, it is obvious which half broke.

## Open items closing here
G-14 · G-17 · B-4 · B-10 · R-30.1 · R-30.4 · R-30.8 · brain-surface tasks 10, 33.
Claims and evidence: [`../progress/respin-finish-open-items.md`](../progress/respin-finish-open-items.md) — do not restate them here.

## Prerequisites
- [ ] Slice 1 shipped (a profile exists, reachable)
- [ ] **Owner decision: `creditCosts.onboardingBrainRebuild`.** A config-data precondition — settle it before the config step, not during the UI
- [ ] **Owner decision: model tiers per operation** (generation Sonnet-class, classification Haiku-class)
- [ ] `ANTHROPIC_API_KEY` available server-side

---

## Requirements

**This card carries 19 requirements against the ~12 budget, and the split was taken where one
existed.** `workspace_spend_monthly`'s first writer — its idempotency key, its reconciliation query
and its pseudonymisation decision (R-30 constraints 5 and 9) — moved out to **slice 2b**, because it
changes no creator-visible behaviour in this slice. What remains does not decompose further: R8–R17
are a single invariant ("nothing reaches the vendor until the workspace is known to be able to pay,
and no failure destroys the spend record") expressed as an **order**, and every line of that order
traces to a named round-1 gate BLOCK. Collapsing them into fewer, larger requirements would read
tidier and would lose a control — which is this milestone's recurring failure, not its fix.

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
- [ ] **R12:** The debit composes **after**, and **at most one debit exists per `attempt_id`** — settled in the schema, not in application code, so two concurrent attempts cannot both debit. Proved on two connections. *(`respin-m2b2-metered-inference-scope.md` verified a partial unique index on `(ref_type, ref_id)` against three existing precedents and notes `ref_type` is `text`, so no `ALTER TYPE` is needed. Take it or beat it.)*
- [ ] **R13:** `model_usage` is written on **failure as well as success**; the five-value outcome enum is classified with **exhaustiveness asserted over `usageOutcome.enumValues`**. M2b-1 added ~seven post-call brain-write refusals the current five do not cover — extend the enum in this slice or record why not.
- [ ] **R14:** Only a **billable vendor response** consumes the free attempt. A 429, a 5xx or a pre-response transport failure consumes nothing.
- [ ] **R15:** `resolved_tier` and `cost_state` are **inexpressible by the caller** — built field by field, never spread.
- [ ] **R16:** Clock is `getDbNow(tx)`, never `new Date()`.
- [ ] **R17:** `runInference` has a **role gate** (a viewer cannot generate, REQ-A02) and refuses an **archived profile** by reading its state **at operation time**, never from a snapshot carried on the scope. **Precondition: `creator_profiles.state` does not exist today** — `packages/db/src/brain-schema.ts:87-110` has no such column and no migration adds one, so slice 1's migration lands it (owner decision queue). If the decision goes the other way, this half of R17 is struck and the reason recorded.

### Register items that become reachable here
- [ ] **G-14:** a test that **races two `writeBrainDoc` calls** — deleting the advisory lock currently leaves the whole suite green
- [ ] **G-17:** record the **lock ordering** — workspace key before brain key, always. M2b-2 takes both in one transaction

### Config, because a defaulted document must not price a debit
- [ ] **R19:** A debit is never stamped with a `config_version` whose **stored** document lacks the keys that priced it. `getActiveConfig` returns the stored row's version with *defaulted* content, so the window between deploy and `migrate-config` is real; fail closed on the raw stored document rather than spending. Assert the **stored** document after `migrate-config` runs too — the migrator moves top-level keys only, so `creditCosts.onboardingBrainRebuild` lands only as a side effect of re-parsing.

### Honesty
- [ ] **R18:** The button says what it will spend before it spends it. The refusal copy names an action the reader can take.

---

## Left to the developer

Named so the flexibility is real rather than accidental. None of these is a plan decision:

- **The adapter's injection shape** — a parameter, a factory, a small interface. The scope note only
  requires that a stub can be handed to `runInference` without `vi.mock`, so the stub's refusal to be
  invoked is itself the proof.
- **Where the retry lives** — inside the adapter or in `runInference`. R5's invariant is the shared
  `attempt_id`, not the layer.
- **The price table's representation** in config (map, array of rows, per-tier nesting), as long as
  the lookup fails closed and the unit is nano-USD per token.
- **The `/onboarding` button's placement and copy shape** — R18 constrains what it must say, not how.
- **Whether the outcome enum is extended or the post-call refusals are mapped onto the existing five**
  — R13 asks for a recorded answer with exhaustiveness asserted, not for a particular one.
- **Test file layout**, and which Docker suite the two races live in.

---

## Tasks
1. [ ] `packages/llm`: adapter, pinned baseURL, timeout/retry, no-text-in-logs assertion
2. [ ] Config: `llm.model`, model-id price table, model tiers, `onboardingBrainRebuild` — with the fail-closed price lookup
3. [ ] `runInference`: pause → balance/top-up → call → `model_usage` (own tx) → debit; role and archived-state gates
4. [ ] Migration: the one-debit-per-`attempt_id` constraint; outcome enum extension if taken
5. [ ] Config-version fail-closed on the raw stored document (R19)
6. [ ] A trivial `/onboarding` button that runs it and shows the result, the cost and the new balance
7. [ ] Tests incl. the two Docker races (G-14, and the free-attempt count)
8. [ ] Walk it: press the button, watch a real call, check `/usage`

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
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

**Population note — read before reporting "N of N".** All seven perturb code that exists. Every one
of the six survivors reviewers found in M2b-1 was a control **nobody had written**, which no mutation
can reach (CLAUDE.md, 2026-08-26). Before claiming a matrix result, state in the ledger which
requirements above have **no** control at all yet, and have someone other than the author plant at
least three mutations of their own. That is where the last two gate rounds found everything.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] The "A creator can…" line walked in a browser against the real vendor
- [ ] **Billing and learning** Critical-Path gates PASS on this slice, reviewers in **isolated worktrees**
- [ ] The open items above closed and the disposition register updated
- [ ] Ledger entry recording the real cost of one call and what the vendor actually returned
