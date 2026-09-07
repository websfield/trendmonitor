// The framework screen's sentences, as PURE values with NO imports at all.
//
// SAME RULE AS `../run-copy.ts` and for the same measured reason: this copy is
// rendered by a `"use client"` module, and `./copy.ts` reaches
// `../../billing-errors` → `@respin/credits/app-server` → `pg`. A file with no
// imports cannot put a Postgres driver in the client bundle, and
// `tests/client-bundle-boundary.test.ts` walks the graph to prove it.

/**
 * What a framework IS, said before a creator writes one.
 *
 * IT LEADS WITH THE CONSTRAINT, not with the feature, because the constraint is
 * what makes the field usable: REQ-D04 says library content is mechanism-level
 * — no person, no account, no number somebody hit — and a creator who learns
 * that from a refusal has already typed the thing that was refused.
 */
export const FRAMEWORK_INTRO =
  "A framework is a MECHANISM: the move a piece of content makes, described so that anyone could run it. It is not an example, not a person, and not a number. Nothing here may name an account, a handle, a link, or how a post did — a framework that carries any of those is refused before it is stored, because the whole point of the library is that a shape works apart from whoever first used it.";

/**
 * What the shared library IS, said where a creator might mistake it for theirs.
 *
 * TWO FACTS: it is the same set for everybody, and it is curated rather than
 * editable. A creator who thought the shared rows were theirs to change would
 * read the missing controls as a bug.
 */
export const SHARED_LIBRARY_NOTE =
  "These are the product's own frameworks. They are the same for every creator, they are not edited from here, and only frameworks a curator has approved appear at all — a proposed or retired one is not shown and is not used to build anything.";

/**
 * REQ-D02's saturation warning, stated as a PROPERTY OF THE SCREEN as well.
 *
 * The per-row sentence is `SATURATION_NOTICE`, which travels ON the row from
 * `@respin/db` (see `EligibleFramework` — "a warning that every consumer has to
 * reimplement is a warning one of them will omit"). This is the heading that
 * tells a reader what the badge beside a row means, and it deliberately does
 * not repeat the notice's words.
 */
export const SATURATION_HEADING = "Curator/library tag";

/** What a creator's own framework is FOR, and what it is not. */
export const PRIVATE_LIBRARY_NOTE =
  "These are yours. They belong to this creator profile, nobody else's workspace can see them, and they travel in your export. A framework you write becomes available to your drafts once you approve it — writing one is not the same act as putting it into use, which is why the two are separate buttons.";

/**
 * WHY APPROVING IS A SECOND ACT (REQ-D02), said where the button is.
 *
 * A creator would reasonably expect a framework they wrote to be in use the
 * moment they saved it. It is not, and the reason is not bureaucracy: nothing
 * becomes recommendable without an approval, and for a private framework the
 * curator is its owner. Saying so is what stops "approve" reading as a
 * redundant confirmation dialog.
 */
export const APPROVE_NOTE =
  "Writing a framework stores it; approving it is what makes your drafts allowed to use it. They are separate on purpose — nothing in this library, yours or the product's, is used to build anything until somebody has said it is ready.";

/** What retiring does, and what it does not. */
export const RETIRE_NOTE =
  "Retiring takes a framework out of use. It does not delete anything: every version of the text stays exactly where it is and stays in your export, and the drafts that were built with it still say so.";

/**
 * The evidence ladder, in the creator's own terms.
 *
 * IT NAMES THE CEILING THIS FORM HAS. Three slots reach `repeated`; the top
 * rung needs five and is not offered here. Stating that is the difference
 * between a limit and a mystery — and it is the same discipline the rest of
 * this product applies to a number it cannot produce.
 */
export const EVIDENCE_NOTE =
  "Each example you add is one time you watched this mechanism work. The count is what decides how the framework is labelled — none is 'unsupported', one is 'a single case', two or more is 'repeated'. The top rung needs five examples and this form has room for three, so it is not reachable from here. Nothing about the count is a claim that the mechanism will work again.";

/** The name field's rule, stated where it binds. */
export function nameLimitNote(max: number): string {
  return `Up to ${max} characters. The name is how you will recognise it, and it is what a draft says when it names the framework it used.`;
}

/** The per-list ceiling, stated once and reused. */
export function listLimitNote(max: number, what: string): string {
  return `One per line, up to ${max} ${what}. Blank lines are ignored.`;
}

/** The long-text ceiling. */
export function textLimitNote(max: number): string {
  return `Up to ${max} characters.`;
}

/** How many frameworks a creator profile may hold at once. */
export function frameworkCountNote(max: number): string {
  return `A creator profile can hold ${max} live frameworks at a time. Retiring one makes room; nothing is lost when you do.`;
}

/**
 * WHAT A CONFIDENCE RUNG MEANS, in words rather than as a bare label.
 *
 * `confidence` is DERIVED from the number of evidence entries — never typed —
 * and it is the one field on a framework that reads like a score. So the screen
 * says what each rung counts rather than showing the word alone: "contrasted"
 * beside a row means five examples, not five stars, and REQ-D01's ladder is
 * explicitly not a prediction.
 */
export function confidenceNote(rung: string): string {
  if (rung === "unsupported") {
    return "no examples recorded — this is a shape somebody wrote down, and nothing more";
  }
  if (rung === "single_case") {
    return "one example recorded";
  }
  if (rung === "repeated") {
    return "several examples recorded";
  }
  if (rung === "contrasted") {
    return "five or more examples recorded, which is as far as this ladder goes — it counts examples and says nothing about what will happen next";
  }
  return "the number of examples recorded decides this label";
}

/** What a saturation value means on a row a creator is reading. */
export function saturationNote(_value: string): string {
  void _value;
  return "Unmeasured";
}

/**
 * WHAT A CREATOR ON A PLAN WITHOUT PRIVATE FRAMEWORKS IS TOLD (R15/REQ-D05).
 *
 * IT DOES NOT SELL AN UPGRADE, and that is the constraint rather than the tone:
 * `billing-errors.ts` bans the shape on `profile_cap`, `run_slot_busy` and
 * `mode_not_in_plan`, and a tier boundary is exactly where "upgrade for this"
 * writes itself. What this says instead is what the reader HAS — the shared
 * library, which every plan gets and which their drafts already use — so the
 * sentence names something true and actionable rather than a price.
 *
 * IT IS THE SAME CLAIM `PrivateFrameworkTierError` MAKES, in the same words'
 * spirit, because the refusal and the pre-emptive note must not disagree: one
 * is what a creator reads before pressing and the other is what the server says
 * if they press anyway.
 */
export const PRIVATE_FRAMEWORKS_NOT_IN_PLAN =
  "Writing your own frameworks is not part of this workspace's plan, so there is no form here. The shared library above is on every plan and is what your drafts are built from — nothing about your drafts changes because of this.";

/**
 * What a PAUSED workspace is told, before the form it would be refused at.
 *
 * REQ-G08, and the sentence has to work harder than the other two because the
 * obvious reason is the wrong one. A pause freezes CREDITS, and curating a
 * framework spends none — so "credits are frozen" would be answering a question
 * nobody asked. What a pause actually does here is stop the workspace's
 * entitlements: private frameworks are a Pro feature, and a paused subscription
 * is not a live one, which is why `@respin/db`'s four write operations refuse.
 * READING is untouched, and saying so is the difference between a pause and an
 * outage.
 *
 * IT SELLS NOTHING (R15). "Resume" is not an upgrade: it is the state the
 * reader was already in, and `tests/framework-ui.test.tsx` scans this sentence
 * with the same pattern it scans every refusal on this screen with.
 */
export const PRIVATE_FRAMEWORKS_PAUSED =
  "This workspace's subscription is paused, so its plan features are on hold and there is no form here. Nothing about your frameworks has changed: every one you have written, and every version of it, is exactly where you left it and still readable on this page. Your drafts still use the shared library above. Resume from the billing page and the form comes back.";

/** What a VIEWER is told. Not a plan boundary; a role one. */
export const VIEWER_CANNOT_CURATE =
  "You have viewer access to this workspace, so you can read every framework here and change none of them. Writing, approving and retiring a framework all land permanently in this creator's record, which needs at least editor access. Ask a workspace owner.";

/** Nothing written yet. A named state, not an empty list. */
export const NO_PRIVATE_FRAMEWORKS =
  "You have not written a framework for this creator yet. Your drafts are built from the shared library above until you do — adding one does not replace it, it adds to what a draft can draw on.";
