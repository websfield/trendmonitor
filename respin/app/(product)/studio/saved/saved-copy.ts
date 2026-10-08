// THE SAVED RECORDING PACK'S WORDS (launch L4, R-153). Directive-free, so the
// page, the pure view, the client controls and the tests read one copy.
//
// WHAT THESE SENTENCES MAY NOT SAY: that reopening, copying or exporting costs
// anything (it never does — the read takes no provider and writes nothing);
// that a draft will do well; that a revision is "better". A revision is a new
// version of the same draft, priced as a revision, and every version stays
// saved — that is what the copy says.

import { FREE_CLAIM_REFUSAL } from "../run-copy";

/** A stored timestamp, as one fixed, locale-free line: `2026-10-04 14:03 UTC`. */
export function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "an unknown time";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export const SAVED_HEADING = "Recording pack";

export function savedSubtitle(modeLabel: string, createdAt: string): string {
  return `${modeLabel}, saved ${formatSavedAt(createdAt)}`;
}

// THE THREE "AS SAVED" SENTENCES (here, the page's check legend and the
// export's footer) say only what is true (R-153 amendment A4): the draft's
// WORDS are as saved; the disclosure guidance and the [check] marks on the
// filming plan and shot list are this product's, and the export joins line
// breaks inside one line.
export const SAVED_READ_FREE =
  "Reopening, copying and exporting this pack costs nothing and calls no model. The draft's words are shown as they were saved; the disclosure guidance and the [check] marks on the filming plan and shot list are added by this product.";

/** The page's legend under the checks — the second "as saved" sentence. */
export const CHECK_LEGEND =
  "[check] is this product's marker for \"not confirmed yet\". The draft's own words are as they were saved; the [check] marks on the filming plan and shot list, and the disclosure guidance, come from this product.";

/** The export's footer — the third "as saved" sentence. */
export const EXPORT_FOOTER =
  "Exported from Respin. [check] marks a detail nobody has confirmed yet. The draft's words above are as they were saved, with line breaks inside a line joined; the [check] marks on the shooting plan and the disclosure guidance are this product's.";

export const SCRIPT_HEADING = "Script";
export const SHOOTING_PLAN_HEADING = "Shooting plan";
export const CHECKS_HEADING = "Checks and rationale";
export const DISCLOSURE_HEADING = "Disclosure";
export const LINEAGE_HEADING = "Where this version came from";

export const NO_SHOOTING_PLAN =
  "This draft has no shooting plan: the kind of draft it is does not produce one.";
export const SHOT_CHECKLIST_NOTE =
  "Tick shots off as you film. The ticks stay on this page in this browser only and are not saved.";
export const CHECKS_UNREADABLE =
  "The checks stored with this draft could not be read, so none are listed. Before you film, check every name, number, date and event in it yourself.";
export const ORIGINAL_NOTE = "Not a revision of another version.";

export function revisedFromSentence(modeLabel: string): string {
  return `A revision of an earlier ${modeLabel} draft.`;
}
export const OPEN_PARENT_LABEL = "Open the version it revised";

export function sourceSentence(ideaIndex: number): string {
  return `Developed from concept ${ideaIndex + 1} of a concept batch.`;
}
export const OPEN_SOURCE_LABEL = "Open that concept batch";

// --- the piece and its versions -------------------------------------------

export const VERSIONS_HEADING = "Versions of this piece";
export const SELECTED_BADGE = "Selected";
export const THIS_VERSION_BADGE = "This version";
export const REFUSED_VERSION_BADGE = "Honest refusal, no draft";
export const PIECE_SELECTED_SENTENCE = "This is the version your piece uses.";
export const PIECE_OTHER_SELECTED_SENTENCE =
  "Your piece uses a different version. Every version stays saved.";
export const OPEN_SELECTED_LABEL = "Open the selected version";
export const USE_THIS_VERSION_LABEL = "Use this version";
export const USE_THIS_VERSION_PENDING = "Choosing…";
export const USE_THIS_VERSION_HELP =
  "Choosing a version costs nothing and changes no draft: it only records which version your piece uses.";
export const SELECTED_STATUS =
  "This version is now the one your piece uses. Nothing was charged.";
export const NOT_A_PIECE_NOTE =
  "This draft was not developed from a chosen concept or idea, so there is no piece version to choose. It stays saved at this address.";
export const VERSIONS_TRUNCATED_NOTE =
  "Only the oldest versions are listed here. Each version stays saved at its own address.";

/** A version link's name: its position in the list and when it was saved (C3). */
export function versionLinkLabel(ordinal: number, createdAt: string): string {
  return `Version ${ordinal}, saved ${formatSavedAt(createdAt)}`;
}

// --- the creator's rules --------------------------------------------------

/**
 * A creator-rule verdict's line on the saved surface: the CREATOR's own rule,
 * quoted — never the scoring model's note (R-153 amendment A1).
 */
export function savedRuleLine(ruleText: string | null): string {
  return ruleText === null
    ? "one of your rules (its wording could not be read back from the rules this draft was checked against)"
    : `your rule "${ruleText}"`;
}

/** An honest refusal whose disclosure-only reasons are withheld (R-153 amendment A6). */
export const DISCLOSURE_ADVICE_WITHHELD =
  "The draft's own disclosure advice broke one of the hard rules. That advice is not shown here; use the product's disclosure guidance instead.";

// --- what a Spin or a source reel was made from ----------------------------

export const REFERENCE_HEADING = "What this was made from";
export const ORIGINAL_REFERENCE_HEADING = "Original reference";
export const THIS_DRAFT_HEADING = "This draft";
export const SPIN_GATE_PASSED =
  "This draft passed the similarity check against this reference before it was saved.";
export const REFERENCE_UNAVAILABLE =
  "The reference this was made from is not available here, so it cannot be shown beside the draft.";
export const SOURCE_HEADING = "Your source material";
export const SOURCE_CHECKED_SOURCE =
  "Before it was saved, this draft was checked for runs of words copied straight from this source.";
export const SOURCE_CHECKED_REVISED =
  "This version is a revision. Its copy check read the revision note and the draft it revised, not the source shown here.";
export const SOURCE_UNAVAILABLE = "The source material this was made from is not available here.";
export const SOURCE_TRUNCATED_NOTE = "Only the start of your source is shown here.";

/** The export's attribution line for a Spin with a readable reference. */
export function referenceAttribution(summary: {
  source: string;
  title: string;
  mechanismSummary: string;
}): string {
  return `Spun from a reference (${summary.source}): ${summary.title}. The mechanism it adapts: ${summary.mechanismSummary}`;
}
export const SOURCE_ATTRIBUTION =
  "Made from source material you provided. The source is not reproduced in this file.";

// --- revisions already made -------------------------------------------------

export const REVISIONS_HEADING = "Revisions of this version";

/** Said ABOVE the presses when this version already has a revision (R-153 amendment, M2). */
export function alreadyRevisedSentence(createdAt: string): string {
  return `You already made a revision of this version, saved ${formatSavedAt(createdAt)}. Open it before you make another: each press makes and charges a new one.`;
}
export const OPEN_LATEST_REVISION_LABEL = "Open your latest revision";
export const REVISIONS_TRUNCATED_NOTE =
  "Only the most recent revisions are listed here. Each stays saved at its own address.";

// --- the three revisions --------------------------------------------------

export const REVISE_HEADING = "Make a new version";

/**
 * WHAT A REVISION COSTS AND WHAT IT REVISES, before the press — the configured
 * price (`creditCosts.revision`, read through the facade) and the parent,
 * named. Never a literal number. "CURRENTLY": the price is the one active when
 * the page was read, and the press is refused — nothing spent — if the price
 * under the active config differs by then (R-153 amendment, billing M1).
 */
export function reviseCostSentence(credits: number | null, createdAt: string): string {
  if (credits === null) {
    return "The price of a revision could not be read just now, so no revision is offered on this page. Reload it to try again.";
  }
  const parent = `It revises this version (saved ${formatSavedAt(createdAt)}), keeps its form, and leaves this version saved as it is.`;
  return `A revision currently costs ${credits} ${credits === 1 ? "credit" : "credits"}. If that price changes before you press, nothing is made and nothing is charged. ${parent}`;
}

/** A press refused because the price moved after the page was read. */
export const SAVED_QUOTE_CHANGED = {
  title: "The price of a revision changed since this page was opened",
  detail:
    "The revision price shown here is no longer the current one, so the revision was not started — you are never charged a price you were not shown. Nothing was spent and no model was called. Reload this page to see the current price.",
} as const;

export const REVISE_PLAN_BLOCK =
  "Your plan does not include this kind of draft, so revising it is not offered here. Reading, copying and exporting this pack stay free.";
export const REVISE_REFUSED_ONLY =
  "An honest refusal stored no draft, so there is nothing to revise. Start a new draft on the Studio page instead.";
export const REVISE_REFERENCE_UNAVAILABLE =
  "The reference this Spin was made from is not available here, so a revision is not offered: the similarity check would have nothing to compare it with. Reading, copying and exporting stay free.";
export const REVISE_SOURCE_TO_REEL =
  "A revision of a Source to reel draft is not offered here. Its copy check reads the draft it revises as the source, so a revision that keeps eight words of this version in a row ends in an honest refusal, which is charged. To make a new version, start a new Source to reel draft from your source on the Studio page.";
export const REVISE_PRICE_UNREADABLE =
  "The price of a revision could not be read just now, so the revision is not offered. Reload this page to try again. Reading, copying and exporting stay free.";
export const REVISE_PENDING = "Making the new version…";

export const VIEWER_BLOCK =
  "You have viewer access to this workspace, so you can read, copy and export this pack but not change it. Ask a workspace owner for editor access.";
export const PAUSED_BLOCK =
  "This workspace is paused, so nothing new can be made or chosen until it resumes. Reading, copying and exporting this pack stay available.";

/**
 * WHY A PRESS IS NOT OFFERED, as courtesies over the server's own gates (the
 * piece capability's role and pause gates; every gate `generate` runs). A
 * reason replaces the press; `null` offers it. Reading, copying and exporting
 * are never blocked by any of these.
 */
export function savedPressBlocks(p: {
  blocked: "honest_refusal" | "reference_unavailable" | "source_to_reel" | null;
  /** The quoted price; `null` (unreadable) offers no paid press. */
  credits: number | null;
  inPlan: boolean | null;
  isViewer: boolean;
  paused: boolean;
}): { select: string | null; revise: string | null } {
  const write = p.isViewer ? VIEWER_BLOCK : p.paused ? PAUSED_BLOCK : null;
  const revise =
    p.blocked === "honest_refusal"
      ? REVISE_REFUSED_ONLY
      : p.blocked === "reference_unavailable"
        ? REVISE_REFERENCE_UNAVAILABLE
        : p.blocked === "source_to_reel"
          ? REVISE_SOURCE_TO_REEL
          : p.inPlan === false
            ? REVISE_PLAN_BLOCK
            : p.credits === null
              ? REVISE_PRICE_UNREADABLE
              : write;
  return { select: write, revise };
}

export function reviseDoneSentence(state: {
  outcome: "usable" | "honest_refusal" | "replayed";
  creditsChargedNow: number;
  balanceAfter: number;
  /** R-173: the operation's `freeClaimRefusal`, as it returned it. */
  freeClaimRefusal: boolean;
}): string {
  const money =
    state.freeClaimRefusal && state.creditsChargedNow === 0
      ? `${FREE_CLAIM_REFUSAL} Your balance is ${state.balanceAfter}.`
      : state.creditsChargedNow === 0
        ? `Nothing was taken from your balance for it. Your balance is ${state.balanceAfter}.`
        : `It cost ${state.creditsChargedNow} ${state.creditsChargedNow === 1 ? "credit" : "credits"}. Your balance is ${state.balanceAfter}.`;
  if (state.outcome === "honest_refusal") {
    return `The new version ended in an honest refusal, which is saved with its reasons. ${money}`;
  }
  if (state.outcome === "replayed") {
    return `That revision had already finished, so nothing ran again. ${money}`;
  }
  return `The new version is saved. ${money}`;
}
export const OPEN_NEW_VERSION_LABEL = "Open the new version";

// --- copy and export ------------------------------------------------------

export const PACK_ACTIONS_HEADING = "Copy or export";
export const COPY_SCRIPT_LABEL = "Copy script";
export const COPY_PACK_LABEL = "Copy Markdown";
export const DOWNLOAD_PACK_LABEL = "Download Markdown (.md)";
export const COPIED_SCRIPT_STATUS = "The script and its open checks were copied.";
export const COPIED_PACK_STATUS = "The Markdown recording pack was copied.";
export const DOWNLOADED_STATUS = "The Markdown recording pack was downloaded.";
export const SCRIPT_TEXT_LABEL = "The script as plain text";
export const PACK_TEXT_LABEL = "The recording pack as Markdown";
// EACH NAMES THE BOX THAT HOLDS WHAT THE PRESS WAS FOR (accessibility C1).
export const COPY_SCRIPT_FAILED_STATUS = `Your browser did not allow copying. Select the text in the box labelled "${SCRIPT_TEXT_LABEL}" below and copy it yourself.`;
export const COPY_PACK_FAILED_STATUS = `Your browser did not allow copying. Select the text in the box labelled "${PACK_TEXT_LABEL}" below and copy it yourself.`;
export const NOTHING_TO_EXPORT =
  "An honest refusal stored no draft, so there is no script to copy or export.";

// --- the honest, non-spending read states ---------------------------------

export type SavedStateCopy = { title: string; detail: string };

export const SAVED_STATE_COPY = {
  missing: {
    title: "There is no saved draft here",
    detail:
      "No saved draft has this address on the creator profile you have open. If you switched creator profile, switch back to the one that made it. Nothing was charged and nothing was started.",
  },
  pending: {
    title: "This draft is still being prepared",
    detail:
      "The draft at this address has not finished yet. Reload this page in a minute. Opening it never starts it again and never charges for it.",
  },
  not_stored_refused: {
    title: "This draft ended without being saved",
    detail:
      "This operation stopped without a saved draft, so there is nothing to reopen and nothing was charged for it. Opening this address starts nothing. Start a new draft on the Studio page if you still want one.",
  },
  not_stored_recovery: {
    title: "This draft could not be completed",
    detail:
      "The operation stopped before its draft could be saved, so no draft was saved and you were not charged for it. Opening this address starts nothing. Start a new draft on the Studio page if you still want one.",
  },
  unreadable_unsupported: {
    title: "This draft was saved in a format this version cannot read",
    detail:
      "It was saved by a newer version of Respin than the one serving this page. It is still stored unchanged; nothing was regenerated and nothing was charged.",
  },
  unreadable_corrupt: {
    title: "This saved draft could not be read",
    detail:
      "Part of what was saved for it does not read back as a draft. It is still stored as it is; nothing was regenerated and nothing was charged.",
  },
} as const satisfies Record<string, SavedStateCopy>;

export const SAVED_NO_PROFILE =
  "There is no creator profile selected for this workspace, so there is no saved draft to open here.";
