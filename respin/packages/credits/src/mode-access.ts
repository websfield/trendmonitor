// WHICH MODES A PLAN INCLUDES, AND WHICH PRIVATE-FRAMEWORK RIGHT IT CARRIES
// (slice 6 R18; slice 7 R13/R14/R15) — the tier-keyed FEATURE gates.
//
// There were exactly three tier-keyed decisions before this file: the profile
// cap, the concurrency limit and the monthly allowance. All three are NUMBERS
// in config. A mode is not a number, and PRD §4G's pricing table gives Free
// "Hooks, Captions, Ideas" against "All 7" everywhere else — so slice 6 added
// the first tier-keyed SET and slice 7 fills it in.
//
// THE MODE MAP IS KEYED BY MODE, NOT BY TIER, AND THAT IS R14 (slice 7). Slice
// 6 wrote it the other way — `Record<EntitlementTier, readonly ModeId[]>`, with
// the three paid rows spread from `MODE_IDS` — and that shape answers "which
// modes does this tier include?" while being SILENT on the question R14
// actually asks: what happens to a mode nobody classified. Under the tier-keyed
// map an eighth mode added to `MODE_IDS` was included on every paid tier the
// moment it existed, because the paid rows WERE `MODE_IDS`. That is
// default-ALLOW for an unclassified mode, which is the R-36 defect one layer
// over (the import boundary defaulted to ALLOW for any package that did not yet
// exist). Keyed by mode, `Record<ModeId, …>` makes an unclassified mode a
// COMPILE error, `modeTiers` makes a cast-in one a runtime refusal, and
// `tests/mode-access.test.ts` makes the key space a red test. Three doors, and
// none of them is "the type would have caught it".
//
// THE TIER AUTHORITY STAYS `getWorkspaceBillingState` (R-30 constraint 2).
// Nothing here reads `subscriptions`, `stripePriceMap` or config: it is handed
// a resolved tier and answers a question about it. A second derivation of the
// tier is the defect class behind two M1 round-6 findings.
import {
  IMPLEMENTED_MODES,
  MODE_IDS,
  UnknownModeError,
  type ModeId,
} from "@respin/modes";
import type { PrivateFrameworkEntitlement } from "@respin/db";
// The ONE route in this package from a mode id to what a creator calls it —
// see `mode-label.ts`'s own header for why the label does not live in a view.
import { modeLabel } from "./mode-label";
import type { BillingState } from "./state";

/** The tier vocabulary `BillingState.tier` uses — paid tiers plus `free`. */
export type EntitlementTier = BillingState["tier"];

/**
 * THE TIER VOCABULARY AS A VALUE, so the two maps below can be written as TIER
 * SETS rather than as four hand-copied rows.
 *
 * It is checked against the TYPE in `mode-access.test.ts` — a tier added to
 * `BillingState` and forgotten here is a red test, not a mode silently excluded
 * from every plan.
 */
export const ENTITLEMENT_TIERS = ["free", "creator", "pro", "studio"] as const;

/** Every tier — PRD §4G's "All 7" rows, written once. */
const ALL_TIERS: readonly EntitlementTier[] = ENTITLEMENT_TIERS;

/** Everything above Free. PRD §4G gives Free three modes and the rest all 7. */
const PAID_TIERS: readonly EntitlementTier[] = ["creator", "pro", "studio"];

/**
 * PRD §4G's "Modes" row, as a value — WHICH TIERS INCLUDE EACH MODE.
 *
 * READ IT AS THE PRD'S TABLE TRANSPOSED. The PRD writes a row per tier; this
 * writes a column per mode, because the population that GROWS is `MODE_IDS`
 * (slice 7 added six; slice 8 makes `analyseAndSpin` real) and the population
 * that does not is the tier list. A `Record` is only complete-by-construction
 * over the axis it is KEYED on, so it is keyed on the one that moves.
 *
 * FREE'S THREE ARE THE PRD'S THREE WORDS ("Hooks, Captions, Ideas") mapped onto
 * this repo's mode ids: `hooks`, `caption`, `ideation`. Every other mode is
 * paid-only.
 */
export const MODE_TIERS: Record<ModeId, readonly EntitlementTier[]> = {
  footageToThesis: PAID_TIERS,
  ideaToScript: PAID_TIERS,
  sourceToReel: PAID_TIERS,
  analyseAndSpin: PAID_TIERS,
  hooks: ALL_TIERS,
  caption: ALL_TIERS,
  ideation: ALL_TIERS,
};

/**
 * Which tiers include this mode — the RUNTIME half of R14.
 *
 * IT THROWS RATHER THAN RETURNING `[]` OR `undefined`, and the direction
 * matters both ways. `undefined` would make `.includes(tier)` a TypeError at a
 * random call site instead of a named refusal; `[]` would be default-DENY,
 * which is safe for money and wrong for diagnosis — a mode nobody classified is
 * a build mistake, not a plan fact, and telling a paying creator their plan
 * excludes a mode we forgot to classify would be a false statement about what
 * they bought. `UnknownModeError` is `@respin/modes`' own class, the one
 * `modeSpec` already raises for a string that is not a mode, so a screen has
 * one refusal to write copy for rather than two.
 *
 * CLAUDE.md 2026-08-21: proving a field cannot be TYPED is not proving it
 * cannot be CAST. `mode-access.test.ts` drives this branch with an eighth mode
 * id cast in, which is what "actually add one" means here.
 */
export function modeTiers(mode: ModeId): readonly EntitlementTier[] {
  const tiers = MODE_TIERS[mode];
  if (!tiers) throw new UnknownModeError(String(mode));
  return tiers;
}

/**
 * The same table read the other way — which modes a tier includes.
 *
 * DERIVED FROM `MODE_TIERS`, never written out a second time. A hand-copied
 * per-tier list is a SECOND population that can silently disagree with the
 * first the day a mode is added, which is exactly what this file's header says
 * went wrong. Its only readers are the refusal message below and the tests.
 *
 * ORDERED BY `MODE_IDS`, so the sentence a creator reads lists the modes in the
 * product's own order rather than in object-key order.
 */
export function modesIncludedIn(tier: EntitlementTier): readonly ModeId[] {
  return MODE_IDS.filter((mode) => modeTiers(mode).includes(tier));
}

/**
 * PRD §4G's "Modes" row per tier, as a value — the slice-6 export, now DERIVED.
 *
 * Kept because the studio copy and the tests read it, and because deleting a
 * public name to change its provenance is a bigger change than keeping it.
 */
export const TIER_MODES: Record<EntitlementTier, readonly ModeId[]> = {
  free: modesIncludedIn("free"),
  creator: modesIncludedIn("creator"),
  pro: modesIncludedIn("pro"),
  studio: modesIncludedIn("studio"),
};

/**
 * PRD §4G's "Private frameworks" right, per tier (slice 7, R5c / REQ-D05).
 *
 * PRO AND STUDIO ONLY. `@respin/db` cannot resolve a tier — its sole authority
 * is `getWorkspaceBillingState`, which lives in THIS package and depends on it
 * — so every private-framework write in `packages/db/src/frameworks.ts` takes
 * an `entitlement` argument with NO DEFAULT and refuses `not_included` by name
 * (`PrivateFrameworkTierError`). This map is the seam that argument was built
 * for, and it is the only place in the product that decides it.
 *
 * A `Record<EntitlementTier, …>` OF A TWO-VALUE UNION, so both halves of R14's
 * property hold here too: a tier with no entry is a compile error, and
 * `privateFrameworkEntitlement` below refuses a cast-in one rather than
 * returning `undefined` — which `assertEntitled` would treat as "not included"
 * by accident rather than by decision.
 */
export const TIER_PRIVATE_FRAMEWORKS: Record<
  EntitlementTier,
  PrivateFrameworkEntitlement
> = {
  free: "not_included",
  creator: "not_included",
  pro: "included",
  studio: "included",
};

/**
 * A tier this build has no entitlement answer for.
 *
 * IT EXISTS BECAUSE `undefined` IS NOT AN ANSWER. `assertEntitled` in
 * `@respin/db` refuses anything that is not the string `"included"`, so a
 * missing map entry would fail CLOSED — and would do it silently, telling a
 * creator "your plan does not include private frameworks" when the truth is
 * that this build failed to classify their plan. Fail-closed is right;
 * fail-closed while claiming to know why is not.
 */
export class UnknownEntitlementTierError extends Error {
  constructor(readonly tier: string) {
    super(
      `This build has no entitlement answer for the plan '${tier}', so nothing was changed. This is about our configuration, not about your plan.`
    );
    this.name = "UnknownEntitlementTierError";
  }
}

/**
 * Whether this workspace's plan includes private frameworks (REQ-D05).
 *
 * THE ONE PRODUCER of the argument `createPrivateFramework`,
 * `editPrivateFramework`, `approvePrivateFramework` and
 * `retirePrivateFramework` all require. Callers pass the RESOLVED tier from
 * `getWorkspaceBillingState`; nothing here reads a row.
 */
export function privateFrameworkEntitlement(
  tier: EntitlementTier
): PrivateFrameworkEntitlement {
  const entitlement = TIER_PRIVATE_FRAMEWORKS[tier];
  if (entitlement !== "included" && entitlement !== "not_included") {
    throw new UnknownEntitlementTierError(String(tier));
  }
  return entitlement;
}

/**
 * This mode is not in this plan (R18 / R15).
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
 * IT EXISTS BECAUSE THE TIER MAP ALONE IS NOT ENOUGH. Slice 7 builds six of the
 * seven modes; `analyseAndSpin` is the seventh and is slice 8's, because it is
 * the one `similarityGated` mode and the gate does not exist yet
 * (`@respin/modes`' `IMPLEMENTED_MODES` states the relation, and its
 * `output.test.ts` enforces it). A tier-only gate would offer a Creator-tier
 * creator a mode with no pipeline behind it.
 *
 * WHEN SLICE 8 LANDS, THIS CLASS'S ONLY WITNESS DISAPPEARS, and that has to be
 * a RED TEST rather than a silent skip — see `mode-access.test.ts`'s
 * `UNBUILT_MODES` population guard. Slice 6's version of that test wrote
 * `if (IMPLEMENTED_MODES.includes(mode)) continue;`, which went vacuous the
 * moment stage B shipped the three Free modes: the loop asserted nothing and
 * nothing went red (CLAUDE.md 2026-08-29 — a derived guard is only as wide as
 * its population).
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
  return modeTiers(mode).includes(tier);
}

/**
 * Refuse a mode this workspace may not run, BEFORE anything is spent.
 *
 * THE PLAN GATE FIRST, THEN THE BUILT GATE, and the order is a statement about
 * what the creator is told: someone on Free asking for `analyseAndSpin` is told
 * their plan does not include it (true, and stable), not that it is unbuilt
 * (also true today, and misleading tomorrow).
 */
export function assertModeAllowed(
  tier: EntitlementTier,
  mode: ModeId
): void {
  if (!planIncludesMode(tier, mode)) {
    throw new ModeNotInPlanError(mode, tier, modesIncludedIn(tier));
  }
  if (!IMPLEMENTED_MODES.includes(mode)) {
    throw new ModeNotBuiltYetError(mode);
  }
}

/**
 * WHAT A SCREEN MAY OFFER, AND WHY EACH OTHER MODE IS NOT OFFERED (slice 7).
 *
 * ADDED BY STAGE D, IN THIS PACKAGE RATHER THAN IN `app/**`, and the reason is
 * R18's and this file's own: `assertModeAllowed` is a conjunction of two
 * authorities (the plan map here, `IMPLEMENTED_MODES` in `@respin/modes`), and
 * a mode PICKER is that conjunction read forwards. Computed on the screen it
 * would be a second derivation of both — the defect this file's header
 * describes — and `app/**` cannot even name `IMPLEMENTED_MODES`, because
 * `@respin/modes` is denied to it (R-64). `tests/studio-ui.test.tsx` enforces
 * the same thing from the other side: no file under `app/(product)/studio/`
 * may contain a mode id at all.
 *
 * IT IS TOTAL OVER `MODE_IDS`, not a filtered list, and that is what makes it
 * honest rather than merely convenient. A picker built from an "available"
 * list can only ever say what a creator MAY press; this says what the product
 * has and which of the two different reasons applies to each mode it will not
 * run — the same distinction `ModeNotInPlanError` and `ModeNotBuiltYetError`
 * exist to keep, offered before the press instead of after it.
 *
 * PURE, like everything else here: a resolved tier in, three fields out, no
 * config, no subscription row, no query. The label comes from `./mode-label`,
 * which is this package's one route to `MODE_SPECS[…].label`.
 */
export type ModeOffer = {
  id: ModeId;
  /** What a creator calls it — `MODE_SPECS[id].label`, never a second copy. */
  label: string;
  /**
   * `available` is exactly "`assertModeAllowed` would not throw", and the two
   * refusals are exactly its two branches, IN ITS ORDER: the plan gate first,
   * so a Free creator asking for `analyseAndSpin` is told their plan does not
   * include it (true, and stable) rather than that it is unbuilt (also true
   * today, and misleading tomorrow).
   */
  status: "available" | "not_in_plan" | "not_built_yet";
};

/**
 * The mode PRD B04's onboarding handoff runs (slice 7, R5).
 *
 * B04 is "onboarding ends by generating the creator's first three ideas through
 * their new brain", and REQ-C01 mode 7 is the mode that returns ideas as hook +
 * thesis + framework rather than as topics — so this is not a preference, it is
 * the requirement's own mode.
 *
 * IT IS A NAMED CONSTANT IN THIS PACKAGE RATHER THAN A STRING IN `app/**`, for
 * the reason every other seam here exists: `@respin/modes` is denied to
 * `app/**` (R-64), so a screen naming `"ideation"` would be an unchecked
 * literal — typed as `string`, invisible to a rename, and free to name a mode
 * this build does not have. Typed as `ModeId`, a rename in `MODE_IDS` is a
 * compile error here and nowhere else.
 *
 * IT IS NOT AN ENTITLEMENT. Whether a workspace may RUN it is still
 * `assertModeAllowed`'s answer, and the B04 screen offers the control only when
 * `modeOffers(tier)` reports it `available` — PRD §4G puts Ideas on every plan,
 * including Free, which is what makes B04 reachable in a first session at all.
 */
export const ONBOARDING_FIRST_IDEAS_MODE: ModeId = "ideation";

export function modeOffers(tier: EntitlementTier): readonly ModeOffer[] {
  return MODE_IDS.map((id) => ({
    id,
    label: modeLabel(id),
    status: !planIncludesMode(tier, id)
      ? ("not_in_plan" as const)
      : !IMPLEMENTED_MODES.includes(id)
        ? ("not_built_yet" as const)
        : ("available" as const),
  }));
}
