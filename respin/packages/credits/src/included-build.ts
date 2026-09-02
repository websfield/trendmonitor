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
 * The exemption `reconcileSpend` needs, for THIS configuration document.
 *
 * `@respin/db` cannot import `@respin/credits` (the edge only runs one way),
 * so `reconcileSpend` takes the list as a REQUIRED argument with no default,
 * exactly like the `entitlement` seam on the framework writes. Its false
 * branch is driven in `packages/db/tests/spend-rollup.test.ts`; the call site
 * that derives it from the ACTIVE document is `/admin/model-spend`, executed
 * in `tests/model-spend-page.test.tsx`.
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
