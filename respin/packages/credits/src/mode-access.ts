// WHICH MODES A PLAN INCLUDES (slice 6, R18) — the first feature gate by tier
// in this codebase.
//
// There were exactly three tier-keyed decisions before this file: the profile
// cap, the concurrency limit and the monthly allowance. All three are NUMBERS
// in config. A mode is not a number, and PRD §4G's pricing table gives Free
// "Hooks, Captions, Ideas" against "All 7" everywhere else — so this slice adds
// the first tier-keyed SET.
//
// IT IS A MAP, NOT AN `if`, and that is the requirement rather than a
// preference. Slice 7 adds six more modes; a chain of `if (mode === "hooks")`
// is how a mode ships ungated, because nothing fails when a branch is missing.
// `Record<Tier, readonly ModeId[]>` makes a tier with no entry a compile error
// and — with `MODE_IDS` as the population — makes "which modes did we forget to
// classify?" a question a test can answer by set difference rather than by
// reading seven branches. The honest limit is stated rather than hidden: with
// one implemented mode, a map with the right shape and an `if` are
// behaviourally indistinguishable today, and slice 7 is where the difference
// shows. `tests/mode-access.test.ts` therefore drives the map against ALL SEVEN
// mode ids, not only the one that is built.
//
// THE TIER AUTHORITY STAYS `getWorkspaceBillingState` (R-30 constraint 2).
// Nothing here reads `subscriptions`, `stripePriceMap` or config: it is handed
// a resolved tier and answers a question about it. A second derivation of the
// tier is the defect class behind two M1 round-6 findings.
import { IMPLEMENTED_MODES, MODE_IDS, type ModeId } from "@respin/modes";
import type { BillingState } from "./state";

/** The tier vocabulary `BillingState.tier` uses — paid tiers plus `free`. */
export type EntitlementTier = BillingState["tier"];

/**
 * PRD §4G's "Modes" row, as a value.
 *
 * FREE IS THE ONLY SHORT LIST, and its three entries are the PRD's three words
 * ("Hooks, Captions, Ideas") mapped onto this repo's mode ids: `hooks`,
 * `caption`, `ideation`. The three paid tiers all read "All 7", so they are
 * spread from `MODE_IDS` rather than retyped — a hand-copied list of seven
 * would be a second population that can silently disagree with the first the
 * day slice 7 adds a mode.
 */
export const TIER_MODES: Record<EntitlementTier, readonly ModeId[]> = {
  free: ["hooks", "caption", "ideation"],
  creator: MODE_IDS,
  pro: MODE_IDS,
  studio: MODE_IDS,
};

/**
 * This mode is not in this plan (R18).
 *
 * IT DOES NOT NAME AN UPGRADE AS THE REMEDY, deliberately, and the precedent is
 * `profile_cap` in `app/(product)/billing-errors.ts`: telling a creator to
 * "move to a plan that includes this" is taking money for a route the product
 * may not have finished building, and it reads as a sales prompt on a refusal
 * screen. What the copy does is state what happened, that nothing was spent,
 * and which modes this plan does include — which is a fact the creator can act
 * on without being sold to.
 */
export class ModeNotInPlanError extends Error {
  constructor(
    readonly mode: string,
    readonly tier: EntitlementTier,
    readonly included: readonly ModeId[]
  ) {
    super(
      `This plan does not include that mode. Nothing was spent and no model was called. The modes it includes are: ${included.join(", ")}.`
    );
    this.name = "ModeNotInPlanError";
  }
}

/**
 * The mode is in the plan and does not exist yet.
 *
 * A SEPARATE CLASS FROM `ModeNotInPlanError`, because the two say opposite
 * things to the person reading them: one is "your plan does not include this",
 * which is about money, and this one is "we have not built it", which is about
 * us. Telling a paying creator their plan excludes a mode we simply have not
 * shipped would be a false statement about what they bought.
 *
 * IT EXISTS BECAUSE THE TIER MAP ALONE IS NOT ENOUGH. PRD §4G gives Free three
 * modes; slice 6 builds ONE. A tier-only gate would offer a Free creator two
 * modes with no pipeline behind them, which is why `IMPLEMENTED_MODES` has a
 * reader from the day the gate exists rather than from the day slice 7 lands.
 */
export class ModeNotBuiltYetError extends Error {
  constructor(readonly mode: string) {
    super(
      `That mode is not built yet, so nothing ran and nothing was spent. This is about what we have shipped, not about your plan.`
    );
    this.name = "ModeNotBuiltYetError";
  }
}

/** Whether a tier's plan includes a mode. Pure — no config, no database. */
export function planIncludesMode(
  tier: EntitlementTier,
  mode: ModeId
): boolean {
  return TIER_MODES[tier].includes(mode);
}

/**
 * Refuse a mode this workspace may not run, BEFORE anything is spent.
 *
 * THE PLAN GATE FIRST, THEN THE BUILT GATE, and the order is a statement about
 * what the creator is told: someone on Free asking for `fullScript` is told
 * their plan does not include it (true, and stable), not that it is unbuilt
 * (also true today, and misleading tomorrow).
 */
export function assertModeAllowed(
  tier: EntitlementTier,
  mode: ModeId
): void {
  if (!planIncludesMode(tier, mode)) {
    throw new ModeNotInPlanError(mode, tier, TIER_MODES[tier]);
  }
  if (!IMPLEMENTED_MODES.includes(mode)) {
    throw new ModeNotBuiltYetError(mode);
  }
}
