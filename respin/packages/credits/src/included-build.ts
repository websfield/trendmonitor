// WHICH PURPOSES PRICE THEIR FIRST BILLABLE ATTEMPT AT ZERO — DERIVED FROM
// THE ACTIVE CONFIG DOCUMENT, AT RECONCILIATION TIME (R-82).
//
// THE DEFECT THIS CLOSES (billing gate round 2, 2026-09-02). R-81 answered
// this question with `INCLUDED_BUILD_PURPOSES`, a frozen source constant
// derived from a total `Record<purpose, boolean>` — a static answer to a fact
// the ADMIN FORM CAN CHANGE. `/admin/config` accepts a whole configuration
// document from any admin (`app/(admin)/admin/config/actions.ts` validates it
// with `validateConfigContent` and appends it with `appendConfigVersionServer`)
// and the schema constrains the included build's price only as
// `onboardingBrainBuild: z.number().int().min(0)` (`packages/config/src/
// schema.ts`). So an operator setting it to 25 makes `priceOf` charge the
// claim holder — correctly; the stored document is the authority — while a
// frozen list kept `reconcileSpend` exempting every `onboarding_brain` claim
// holder, re-opening the blind spot R-81 had just closed from the other side:
// one lost debit per profile, invisible to the only reconciliation reader
// there is. R-81 recorded this as its own eventual fix and named the trigger.
//
// SO THE LIST IS A FUNCTION OF THE DOCUMENT, and the caller that has already
// read the ACTIVE document passes it in. Pure — no query, no config read of
// its own — for the same reason `priceOf` and `generationOp` are: a second
// config read inside here could disagree with the one the caller reconciled
// against.
import type { RespinConfigV1 } from "@respin/config";
import { MODE_IDS } from "@respin/modes";
import {
  GENERATION_PURPOSE,
  ONBOARDING_BRAIN_PURPOSE,
  priceOf,
  type PricedOperation,
} from "./inference";
import { generationOp } from "./generate";

/**
 * The attempt id both halves of the onboarding probe carry.
 *
 * `includedBuildHolder === attemptId` is exactly the state "I hold this
 * profile's claim", which is the state `reconcileSpend` exempts. It is a
 * PROBE, never stored: this module writes nothing and reads no database.
 */
const CLAIM_HOLDER_PROBE_ATTEMPT_ID = "included-build-probe";

/**
 * EVERY PRICED OPERATION OF A PURPOSE, in the state its CLAIM HOLDER is in.
 *
 * A TOTAL `Record`, so a third purpose has to ANSWER this rather than inherit
 * somebody's answer (CLAUDE.md 2026-08-29 — a population written as one path
 * narrows silently the day a second appears).
 *
 * A LIST PER PURPOSE, NOT ONE REPRESENTATIVE OPERATION, and that is the whole
 * difference for `generation`: a generation is priced by its MODE, so "is a
 * generation's claim holder free" has one answer per mode plus one for a
 * revision. Probing a single arbitrary mode would answer the question for
 * `hookSet` and state it about the purpose. The operations are built by
 * `generationOp` — the same function `generate` prices its debit from — so
 * they cannot drift from the real mode->key map.
 */
export const CLAIM_HOLDER_OPERATIONS: Record<
  PricedOperation["purpose"],
  () => PricedOperation[]
> = {
  [ONBOARDING_BRAIN_PURPOSE]: () => [
    {
      purpose: ONBOARDING_BRAIN_PURPOSE,
      includedBuildHolder: CLAIM_HOLDER_PROBE_ATTEMPT_ID,
      attemptId: CLAIM_HOLDER_PROBE_ATTEMPT_ID,
    },
  ],
  [GENERATION_PURPOSE]: () =>
    MODE_IDS.flatMap((mode) => [
      generationOp(mode, false),
      generationOp(mode, true),
    ]),
};

/**
 * EVERY `creditCosts` KEY A PROBED OPERATION ACTUALLY PRICES.
 *
 * Derived from the operations above rather than listed, so it cannot drift
 * from what `includedBuildPurposes` really asks `priceOf`.
 */
export function probedCreditCostKeys(): readonly string[] {
  const keys = new Set<string>();
  for (const ops of Object.values(CLAIM_HOLDER_OPERATIONS)) {
    for (const op of ops()) {
      if ("creditCostKey" in op) keys.add(op.creditCostKey);
    }
  }
  return [...keys].sort();
}

/**
 * THE PRICED KEYS NO PROBED OPERATION REACHES, EACH WITH THE REASON.
 *
 * WHY THIS EXISTS — A TRAP LAID FOR SLICE 8 (billing gate, 2026-09-02). The
 * total `Record` above makes a new PURPOSE a compile error and makes nothing
 * at all of a new OPERATION WITHIN a purpose. Measured against the real seed,
 * `CLAIM_HOLDER_OPERATIONS.generation()` covers six keys — `caption`,
 * `fullScript`, `hookSet`, `ideationBatch`, `revision`, `spin` — while
 * `creditCosts` also carries `autopsy` and `trendBrowse`, both priced, both
 * uncovered, and both slice 8's operations. So the day an autopsy becomes a
 * priced operation of the `generation` purpose, a document with every mode at
 * 0 and `autopsy` at 7 exempts a claim holder that owes 7 credits — the
 * fail-open direction `includedBuildPurposes` names as the one that must never
 * happen (a wrong exemption HIDES a lost debit).
 *
 * SO REGISTERING A NEW PRICED OPERATION COSTS A LINE. The partition —
 * `probedCreditCostKeys()` plus these keys is EXACTLY `Object.keys(
 * content.creditCosts)`, with no overlap — is asserted against the stored
 * document in `tests/included-build-purposes.test.ts`. Adding a `creditCosts`
 * key reddens it until somebody says which side it is on; wiring one of these
 * keys into an operation reddens it until the entry is deleted.
 */
export const UNPROBED_CREDIT_COST_KEYS: Readonly<Record<string, string>> = {
  onboardingBrainBuild:
    "The onboarding purpose is priced by a BRANCH of `priceOf`, not by a `creditCostKey`. It is probed — by the claim-holder operation above, which is what R-82 is about — just not through a key.",
  onboardingBrainRebuild:
    "The price of an onboarding attempt that does NOT hold the claim. A rebuild is by definition not an included build, so no claim holder is ever priced by it.",
  autopsy:
    "THE KEY HAS A READER NOW (slice 8c, R-98): a creator's PASTED REFERENCE debits `creditCosts.autopsy` with its private claim (`packages/credits/src/pasted-reference.ts`, `refType: autopsy_claim`). It is still NOT a probed operation, and deliberately: that debit is not a `PricedOperation` of any purpose — it carries no `first_billable_attempts` claim, no model attempt of its own, and no included build (R-90 keeps `autopsy` out of the included-build purposes), so no claim holder is ever priced by it and there is nothing for `reconcileSpend` to exempt. Scheduled SHARED autopsies remain system overhead under R-89 with their own separately-accounted system spend, outside creator included-build claims. Wiring this key into a PricedOperation is the day this entry must be deleted.",
  trendBrowse:
    "Trend browse is a read entitlement seeded at zero, not a build or debit. It stays outside creator included-build claims even while its price is zero.",
};

/**
 * The exemption `reconcileSpend` needs, for THIS configuration document.
 *
 * `@respin/db` cannot import `@respin/credits` (the edge only runs one way),
 * so `reconcileSpend` takes a REQUIRED resolver with no default, exactly like
 * the `entitlement` seam on the framework writes. Its false branch is driven in
 * `packages/db/tests/spend-rollup.test.ts`; the call site is
 * `/admin/model-spend`, executed in `tests/model-spend-page.test.tsx`.
 *
 * ONE DOCUMENT PER CONFIG VERSION, NOT THE ACTIVE ONE (R-85). This function is
 * still per-document and unchanged; what changed is WHICH documents it is
 * called with. `reconcileSpend` asks which `config_version`s its own rows carry
 * and the page resolves each one, because judging a historical attempt by
 * today's prices hides exactly the lost debit this exemption's direction is
 * chosen to avoid.
 *
 * `every`, NOT `some`, AND THE DIRECTION IS DELIBERATE. Being in this list
 * exempts a claim holder from the report, so a purpose one of whose operations
 * IS charged must not be in it: a wrong exemption HIDES a lost debit, while a
 * missing one at worst reports an attempt that owed nothing — noise a person
 * reads, not silence nobody can.
 */
export function includedBuildPurposes(
  content: RespinConfigV1
): readonly string[] {
  const purposes = Object.keys(
    CLAIM_HOLDER_OPERATIONS
  ) as PricedOperation["purpose"][];
  return purposes
    .filter((purpose) =>
      purposeIsIncluded(content, CLAIM_HOLDER_OPERATIONS[purpose]())
    )
    .sort();
}

/**
 * Is a purpose's claim holder free, given ITS operations and THIS document?
 *
 * A SEPARATE FUNCTION SO THE EMPTY LIST HAS A WITNESS. `[].every(…)` is
 * `true`, so a purpose whose operations nobody filled in would be EXEMPTED —
 * the fail-open direction, which hides a lost debit rather than reporting an
 * attempt that owed nothing. Not reachable today (both lists above are
 * non-empty, asserted in `tests/included-build-purposes.test.ts`) and closed
 * anyway, because "found nothing" and "found nothing wrong" must never be the
 * same answer (CLAUDE.md 2026-08-21). Its false branch is driven directly:
 * `purposeIsIncluded(content, [])` is `false`.
 */
export function purposeIsIncluded(
  content: RespinConfigV1,
  ops: readonly PricedOperation[]
): boolean {
  return ops.length > 0 && ops.every((op) => priceOf(content, op) === 0);
}

/**
 * BOTH PRICES OF AN ONBOARDING BRAIN RUN, FROM `priceOf` — for the screen.
 *
 * WHY A SCREEN NEEDS THIS (billing gate, 2026-09-02). `/onboarding` stated the
 * rule in a sentence — "Your first run for a creator is included. Every run
 * after that costs N credits" — and read ONE number,
 * `creditCosts.onboardingBrainRebuild`. R-82 exists precisely because
 * `onboardingBrainBuild` is `z.number().int().min(0)` and not `literal(0)`, so
 * under the very document R-82's own test appends (`onboardingBrainBuild: 25`)
 * the creator was told their first build was included and then debited 25. The
 * debit was right — `priceOf` reads the document — and the sentence was a
 * frozen assumption. `/admin/model-spend` was moved off that same assumption in
 * that pass; this screen was not.
 *
 * THE TWO PROBES ARE THE TWO BRANCHES OF `priceOf`'s ONBOARDING CASE, so the
 * page cannot index `creditCosts` itself and cannot re-implement the rule:
 * UNCLAIMED (or mine) is the included price, a claim held by ANOTHER attempt is
 * the rebuild price. It is the shape `/onboarding/first-ideas` already uses
 * (`priceOf(content, generationOp(...))`), one purpose over.
 *
 * NOT A PREDICTION OF WHICH BRANCH A PRESS WILL TAKE — that would need a read
 * of this profile's claim, and a prediction that goes stale between the render
 * and the press is a wrong number about money on the screen. It is the two
 * prices the rule is written in, and the operation stays the authority.
 */
export function onboardingBrainPrices(content: RespinConfigV1): {
  included: number;
  rebuild: number;
} {
  return {
    included: priceOf(content, {
      purpose: ONBOARDING_BRAIN_PURPOSE,
      // UNCLAIMED: no attempt holds this profile's included build yet.
      includedBuildHolder: null,
      attemptId: CLAIM_HOLDER_PROBE_ATTEMPT_ID,
    }),
    rebuild: priceOf(content, {
      purpose: ONBOARDING_BRAIN_PURPOSE,
      // HELD BY SOMEBODY ELSE — the third branch, which is every rebuild.
      includedBuildHolder: CLAIM_HOLDER_PROBE_ATTEMPT_ID,
      attemptId: `${CLAIM_HOLDER_PROBE_ATTEMPT_ID}-later`,
    }),
  };
}
