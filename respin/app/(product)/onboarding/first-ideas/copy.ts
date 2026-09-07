// PRD B04's screen, in words — pure, and with NO imports at all.
//
// SAME RULE AS `../run-copy.ts` and `../../studio/run-copy.ts`, for the same
// measured reason: this copy is rendered by a `"use client"` module, and any
// module that reaches `../../billing-errors` reaches `@respin/credits/app-server`
// and therefore `pg`. `tests/client-bundle-boundary.test.ts` walks the graph.
//
// ---------------------------------------------------------------------------
// WHAT B04 IS AND WHAT IT IS NOT.
//
// "Onboarding ends by generating the creator's first three ideas through their
// new brain, so the aha moment happens inside the first session." That is a
// [Should], it is a REAL generation on the real pipeline, and it is priced and
// debited like any other — so every sentence here has to be as careful about
// money as `/studio`'s, and none of them may imply this one is free because it
// is part of onboarding. It is not: D-M2-2's included run is the BRAIN BUILD,
// not the output.

/** What this step is, said before the button that spends a credit. */
export const FIRST_IDEAS_INTRO =
  "This is the first thing the product makes for this creator. It runs on the brain you confirmed and activated — the same brain every later draft uses — and it comes back as ideas rather than as topics: each one has an opening line, the point it makes, and the framework it is built on.";

/**
 * WHAT THE PRICE SENTENCE SAYS, and what it must never say.
 *
 * NO "this one is included" CLAUSE. The one run this product prices as a
 * creator's FIRST is the onboarding BRAIN BUILD (D-M2-2), which happens on a
 * different screen; an ideation batch is priced by `creditCosts.ideationBatch`
 * every time, exactly like any other output. A first-session screen is
 * precisely where "your first one is on us" would be written by reflex, and it
 * would be false.
 *
 * AND IT NO LONGER SAYS THE BRAIN BUILD IS FREE (billing gate, 2026-09-02).
 * The priced branch used to read "what this product gives away once per creator
 * is the brain build" — a claim about ANOTHER screen's price, stated
 * unconditionally by a file that cannot read it, and false under any document
 * that prices `creditCosts.onboardingBrainBuild` above zero (the schema types
 * it `min(0)`, not `literal(0)`, and `/admin/config` can append one). It now
 * names WHERE that rule lives and leaves the number to the screen that reads
 * it, which is the same correction `runCostSentence` took in this pass.
 */
export function firstIdeasCostSentence(
  cost: number | null,
  balance: number | null
): string {
  const rule =
    cost === null
      ? "The price of this could not be read just now, so it is not shown here. Pressing the button still prices and checks it on the server before anything is spent."
      : cost === 0
        ? "This costs nothing on this server's current settings."
        : `This costs ${cost} ${cost === 1 ? "credit" : "credits"}, like any other output — there is no included draft. The only run this product prices as a creator's first is the brain build, on the brain page, which states its own price; what the brain then writes is priced like this.`;
  if (balance === null) return rule;
  return `${rule} You have ${balance} ${balance === 1 ? "credit" : "credits"}.`;
}

/** The busy label. "Being prepared", never a claim that text is arriving (R16). */
export const FIRST_IDEAS_PENDING_LABEL = "Preparing your first ideas…";

/** The idle label on the control. It names what it does and what it costs. */
export const FIRST_IDEAS_BUTTON = "Make my first ideas";

/**
 * THE HEADING OVER THE RESULT, and it counts what actually came back.
 *
 * B04 SAYS THREE AND THE MODE RETURNS THREE TO FIVE. `MODE_SPECS.ideation`
 * declares `ideaCount: { min: 3, max: 5 }` and `parseScriptOutput` refuses a
 * document outside that range, so "three" is a floor rather than a promise —
 * and a screen that printed "your first three ideas" above five of them would
 * be miscounting the thing in front of the reader. Nothing is hidden to make
 * the number match: a creator paid for every idea that came back and every one
 * of them is rendered.
 */
export function firstIdeasHeading(count: number): string {
  if (count === 0) {
    return "No ideas came back";
  }
  if (count === 1) return "Your first idea";
  if (count === 2) return "Your first two ideas";
  if (count === 3) return "Your first three ideas";
  return `Your first ${count} ideas`;
}

/** Said under the heading when more than B04's three came back. */
export function firstIdeasCountNote(count: number): string {
  if (count <= 3) return "";
  return `The model came back with ${count} rather than three. All of them are below — none is held back, because you paid for the batch and not for a quota.`;
}

/**
 * WHAT HAPPENS NEXT, and it is a signpost rather than a promise.
 *
 * A first-session screen is where a product tells someone what it will do for
 * them, which is exactly where a claim about the future gets written. This says
 * only what exists: the Studio, the other modes, and the fact that a draft is
 * built from the brain and the input and nothing else.
 */
export const FIRST_IDEAS_NEXT =
  "From here on, everything happens in the Studio: the same brain, the other modes, and a revision control on anything you want changed. Nothing about this step is special — it is one output, priced and stored like the rest, and it is in your export.";

/**
 * R21's n = 0 statement, on the screen where it is most tempting to break.
 *
 * This is a creator's FIRST output, in their first session, and the product has
 * logged no result of theirs at all — so any hint that these ideas were shaped
 * by what works for them would be a claim about evidence that does not exist.
 * `/studio` carries the same sentence for the same reason; the shared wording
 * is deliberate, because two screens saying it differently is two claims.
 */
export const FIRST_IDEAS_NO_RESULTS_BASIS =
  "Nothing here is based on how your posts have done. No results of yours have been logged — this product holds none, and it is not measuring you. These are built from the brain you confirmed and from what you type in, and nothing else.";

/** Why the control is not offered, when a brain has not been activated. */
export const FIRST_IDEAS_NEEDS_BRAIN =
  "This creator has no activated brain yet, so there is nothing to write in their voice. Confirm a version on the brain page and activate it, then come back — this step is the first thing that uses it.";

/** Why the control is not offered, when the plan does not include the mode. */
export const FIRST_IDEAS_NOT_IN_PLAN =
  "This workspace's plan does not include the mode this step uses, so there is no control here. Nothing about the brain you built is affected: the modes your plan does include are on the studio page, and they use the same brain.";

/** Why the control is not offered to a viewer. */
export const FIRST_IDEAS_VIEWER =
  "You have viewer access to this workspace. Making something spends the workspace's credits, so it needs at least editor access. Ask a workspace owner.";

/** Why the control is not offered while a workspace is paused. */
export const FIRST_IDEAS_PAUSED =
  "This workspace's subscription is paused, so credits are frozen and nothing that would spend them runs. Everything already saved is untouched. Resume on the billing page.";
