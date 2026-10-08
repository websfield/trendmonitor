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
  MODE_IDS,
  MODE_SPECS,
  UnknownModeError,
  takesCreativeForm,
  type ModeId,
} from "@respin/modes";
import type {
  DbLike,
  PrivateFrameworkEntitlement,
  TrackedNicheEntitlement,
  TxLike,
  VerifiedWorkspaceId,
} from "@respin/db";
import {
  ConfigUnavailableError,
  getActiveConfig,
  type RespinConfigV1,
} from "@respin/config";
// The ONE route in this package from a mode id to what a creator calls it —
// see `mode-label.ts`'s own header for why the label does not live in a view.
import { modeLabel } from "./mode-label";
import { getWorkspaceBillingState, type BillingState } from "./state";
import { PerformanceLearningConfigUnavailableError } from "./errors";

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
 * R17's tracked-niche allowances — the ACTIVE CONFIG DOCUMENT's
 * `trackedNiches` row (R-95, config not code; the same row shape as
 * `profileCaps`, which this file's header says is where NUMBERS live). Free
 * receives the digest only: zero means no persisted browsing/tracking
 * entitlement. The DB writer receives the server-derived entitlement and
 * never a form-selected cap.
 */
export type TrackedNicheAllowances = RespinConfigV1["trackedNiches"];

/** The exact two access answers stored in the active config. */
export type PerformanceLearningEntitlement =
  RespinConfigV1["performanceLearning"][EntitlementTier];

export type PerformanceLearningEntitlements =
  RespinConfigV1["performanceLearning"];

/**
 * Pure, exhaustive half of C2's billing-state matrix.
 *
 * `free` and `incomplete` use the configured Free entry. A live paid state
 * uses its exact configured tier. Any state carrying `unmapped_price`, or a
 * malformed/cast state or map with no exact tier entry, is an operational
 * refusal rather than an invented view-only answer.
 */
export function resolvePerformanceLearningEntitlement(
  billing: BillingState,
  entitlements: PerformanceLearningEntitlements
): PerformanceLearningEntitlement {
  if (billing.reason === "unmapped_price") {
    throw new PerformanceLearningConfigUnavailableError("unmapped_price");
  }

  let tier: EntitlementTier;
  switch (billing.state) {
    case "free":
    case "incomplete":
      tier = "free";
      break;
    case "active":
    case "grace":
    case "paused":
      tier = billing.tier;
      if (tier === "free") {
        throw new PerformanceLearningConfigUnavailableError("missing_tier");
      }
      break;
    default: {
      const exhaustive: never = billing.state;
      throw new PerformanceLearningConfigUnavailableError(
        "missing_tier",
        exhaustive
      );
    }
  }

  if (!Object.prototype.hasOwnProperty.call(entitlements, tier)) {
    throw new PerformanceLearningConfigUnavailableError("missing_tier");
  }
  const entitlement = entitlements[tier];
  if (entitlement !== "view_only" && entitlement !== "full") {
    throw new PerformanceLearningConfigUnavailableError("missing_tier");
  }
  return entitlement;
}

/**
 * The one server resolver for performance-learning access (C2 / R-112).
 * Billing state comes only from `getWorkspaceBillingState`; callers cannot
 * supply a tier, Stripe price, or subscription row.
 */
export async function performanceLearningEntitlementFor(
  db: DbLike | TxLike,
  workspaceId: VerifiedWorkspaceId,
  at: Date
): Promise<PerformanceLearningEntitlement> {
  try {
    const billing = await getWorkspaceBillingState(db, workspaceId, at);
    const { content } = await getActiveConfig(db);
    return resolvePerformanceLearningEntitlement(
      billing,
      content.performanceLearning
    );
  } catch (error) {
    if (error instanceof PerformanceLearningConfigUnavailableError) {
      throw error;
    }
    if (error instanceof ConfigUnavailableError) {
      throw new PerformanceLearningConfigUnavailableError(
        "config_unavailable",
        error
      );
    }
    throw error;
  }
}

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
 * Server-owned tracked-niche input for `trackNicheForProfile`, priced from the
 * stored document rather than a code map (R-95). A tier the document does not
 * price is refused by name — never `undefined`, which the writer would read as
 * "no cap" or "cap 0" by accident rather than by decision.
 */
export function trackedNicheEntitlement(
  tier: EntitlementTier,
  allowances: TrackedNicheAllowances
): TrackedNicheEntitlement {
  if (!Object.prototype.hasOwnProperty.call(allowances, tier)) {
    throw new UnknownEntitlementTierError(String(tier));
  }
  return { maxTrackedNiches: allowances[tier] };
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
 * Slice 8 made all seven registry modes reachable. This is now solely the plan
 * gate; `modeTiers` still gives an unclassified mode its distinct build-error
 * answer rather than misreporting it as a plan decision.
 */
export function assertModeAllowed(
  tier: EntitlementTier,
  mode: ModeId
): void {
  if (!planIncludesMode(tier, mode)) {
    throw new ModeNotInPlanError(mode, tier, modesIncludedIn(tier));
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
 * has and which plan-exclusion reason applies to each mode it will not run,
 * offered before the press instead of after it.
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
  status: "available" | "not_in_plan";
  /**
   * Whether this mode takes the creative form control (R-148) — read from
   * `@respin/modes`' `CREATIVE_FORM_MODES` list, so the screen offers the
   * control exactly where `generate` will accept it and holds no mode list of
   * its own. A courtesy, never the gate: `generate` refuses a creative request
   * for any other mode before anything is spent.
   */
  takesCreativeForm: boolean;
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

/**
 * The mode "Find my next concept" runs (launch L2). The facade's `findConcept`
 * sets it and `/studio` reads its offer — price and plan status — by it, so
 * the price stated beside the press is the price of the mode the press runs.
 * Not an entitlement, for the reason the constant above is not.
 */
export const FIND_CONCEPT_MODE: ModeId = "ideation";

export function modeOffers(tier: EntitlementTier): readonly ModeOffer[] {
  return MODE_IDS.map((id) => ({
    id,
    label: modeLabel(id),
    status: !planIncludesMode(tier, id)
      ? ("not_in_plan" as const)
      : ("available" as const),
    takesCreativeForm: takesCreativeForm(id),
  }));
}

/**
 * WHETHER A MODE CAN BE PRESSED FROM STUDIO'S PICKER (Phase 6 compliance
 * gate). A mode whose output goes through the Spin similarity gate
 * (`MODE_SPECS[id].similarityGated`, today `analyseAndSpin` alone) needs an
 * autopsy chosen on `/trends`: from the picker `generate` always refuses it
 * ("analyse-and-spin requires an autopsy selected by its opaque identifier"),
 * so offering it there sold a press that could not work. Derived from the
 * spec, not listed, so a second gated mode leaves the picker by construction.
 */
export function offeredInStudio(id: ModeId): boolean {
  return !MODE_SPECS[id].similarityGated;
}

/**
 * Studio's picker: `modeOffers` minus the modes that run only from `/trends`
 * (`offeredInStudio`). `modeOffers` stays TOTAL for every other reader; this
 * is the one view of it a Studio screen renders.
 */
export function studioModeOffers(tier: EntitlementTier): readonly ModeOffer[] {
  return modeOffers(tier).filter((offer) => offeredInStudio(offer.id));
}
