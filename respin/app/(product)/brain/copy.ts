// The words `/brain` uses, and the decisions it makes, as PURE functions.
//
// Same rule as `../onboarding/copy.ts`: a decision made inline in a server
// component is a decision nothing can assert, because no test in this repo
// executes a page. Every branch worth being right about is here.
//
// THE HONESTY RULE FOR THIS SCREEN, stated once. `/onboarding` may not promise
// what it does not do; `/brain` has a harder job, because everything on it is a
// STATEMENT ABOUT A PERSON that a model produced. So:
//
//   - a rule is never rendered without the quote behind it, or without saying
//     plainly that there is no quote (R10/R11);
//   - the count of ungrounded fields is a count of OUR evidence and is never
//     rendered as a ratio, a percentage or a score of the creator (task 20);
//   - nothing here says the rules are right, that the product learned them, or
//     that they will improve. They are a draft the creator confirms.
import {
  BILLING_ERROR_COPY,
  type BillingErrorCode,
  type BillingErrorCopy,
} from "../billing-errors";
export { PLACEHOLDER_ABSENCE } from "@respin/db";

/**
 * The human name for each claim-bearing field of the `voice` document.
 *
 * KEYED BY THE TOP-LEVEL SCHEMA KEY, and closed. `tests/brain-ui.test.tsx`
 * pins these keys to `BRAIN_CONTENT_SCHEMAS.voice`'s claim-bearing keys
 * exactly — the same instrument `voice-fields.test.ts` uses one layer down —
 * so widening the schema without widening this map is a red test rather than a
 * field that renders as its own variable name to a paying customer.
 *
 * The words describe WHAT THE FIELD IS ABOUT, not what the model concluded.
 * "How formal you are" is a question; "Your register" is jargon; "Your formal,
 * confident register" would be the claim itself, which belongs in the value.
 */
export const VOICE_FIELD_LABELS: Record<string, string> = {
  register: "How formal you are, and who you sound like you are talking to",
  sentenceRhythm: "How your sentences are paced",
  signatureMoves: "Things you do that another writer would not",
  avoid: "Things you visibly never do",
};

/**
 * The label for one claim position, from its RFC-6901 pointer.
 *
 * `/register` → the field's name. `/signatureMoves/0` → the field's name with a
 * 1-BASED position, because the creator is looking at a list and "0" is not
 * where a list starts for anyone who does not write code.
 *
 * AN UNKNOWN KEY RETURNS NULL rather than the raw pointer. Rendering
 * `/newField/0` to a creator is not a degradation, it is a leak of an internal
 * name onto a screen making claims about them — and it would also be silent.
 * The caller refuses instead; see `brain-view.tsx`.
 */
export function claimLabel(pointer: string): string | null {
  const parts = pointer.split("/").filter((p) => p.length > 0);
  const key = parts[0];
  if (key === undefined) return null;
  const base = VOICE_FIELD_LABELS[key];
  if (base === undefined) return null;
  if (parts.length === 1) return base;
  const index = Number(parts[1]);
  if (!Number.isInteger(index) || index < 0) return null;
  return `${base} (${index + 1})`;
}

/**
 * The human name for each claim-bearing field of the `strategy` document,
 * EXCLUDING `/metric/...` (slice 3b, R7/R9).
 *
 * `metric` is a nested object, not a top-level scalar/array claim, and R7
 * requires it to have its OWN display rather than sit in this list — see
 * `STRATEGY_METRIC_FIELD_LABELS` and `strategyClaimLabel` below. `pillars` is
 * always written as `[]` by the interview builder (nothing decides it this
 * slice) but stays in this map so a schema/builder that starts populating it
 * renders a real label rather than throwing.
 */
export const STRATEGY_FIELD_LABELS: Record<string, string> = {
  audience: "Who you're making this for",
  positioning: "How you position yourself, compared to alternatives",
  pillars: "Your content pillars",
  goals: "Your goals with this content",
  ambitions: "Where you want this to go",
};

/**
 * The human name for each declared north-star metric sub-field (R7).
 *
 * `key` is ABSENT — it is `serverOwned` in `brain-content.ts` (a slug the
 * server derives, never a claim), so it carries no evidence and is never a
 * confirmable position; `enumerateClaimFields` never yields `/metric/key`.
 */
export const STRATEGY_METRIC_FIELD_LABELS: Record<string, string> = {
  label: "What you're calling this metric",
  unit: "Unit",
  direction: "Which direction is better",
  platform: "Platform (if you named one)",
  window: "Measurement window (if you named one)",
};

/**
 * The label for one `strategy` claim position, from its RFC-6901 pointer —
 * same rule as `claimLabel`, plus the `/metric/<subfield>` branch R7 needs.
 *
 * `/metric` itself, and any pointer more than two segments deep under it,
 * return null: the schema has no claim position at `/metric` (it is a
 * container, not a leaf) and no metric sub-field is a list, so a third
 * segment names a shape this screen does not know how to render.
 */
export function strategyClaimLabel(pointer: string): string | null {
  const parts = pointer.split("/").filter((p) => p.length > 0);
  const key = parts[0];
  if (key === undefined) return null;
  if (key === "metric") {
    if (parts.length !== 2) return null;
    return STRATEGY_METRIC_FIELD_LABELS[parts[1]] ?? null;
  }
  const base = STRATEGY_FIELD_LABELS[key];
  if (base === undefined) return null;
  if (parts.length === 1) return base;
  const index = Number(parts[1]);
  if (!Number.isInteger(index) || index < 0) return null;
  return `${base} (${index + 1})`;
}

/** True for a claim position that belongs in the metric panel, not the general list (R7). */
export function isMetricPointer(pointer: string): boolean {
  return pointer.startsWith("/metric/");
}

/** The human name for each claim-bearing field of the `killtest` document. */
export const KILLTEST_FIELD_LABELS: Record<string, string> = {
  rules: "Your kill rules",
  bannedWords: "Words you never want used",
  bannedVibes: "Vibes or tones you never want",
};

/** The label for one `killtest` claim position — same rule as `claimLabel`. */
export function killtestClaimLabel(pointer: string): string | null {
  const parts = pointer.split("/").filter((p) => p.length > 0);
  const key = parts[0];
  if (key === undefined) return null;
  const base = KILLTEST_FIELD_LABELS[key];
  if (base === undefined) return null;
  if (parts.length === 1) return base;
  const index = Number(parts[1]);
  if (!Number.isInteger(index) || index < 0) return null;
  return `${base} (${index + 1})`;
}

/**
 * The sentence introducing a claim's quote, keyed by WHICH KIND of input row
 * it came from (R4/R10) — `own_post` (voice) reads differently from
 * `creator_authored` (strategy/killtest, an interview answer), and one
 * sentence pretending to fit both would misdescribe one of them.
 *
 * Takes the already-formatted day string rather than a `Date`, so this stays
 * a pure string function with no `Intl`/timezone decision of its own — `day()`
 * in `brain-view.tsx` is the one place that decision is made, matching every
 * other screen's precedent (`usage-view.tsx`, `onboarding-view.tsx`).
 */
export function quoteIntro(inputClass: string, dayStr: string): string {
  return inputClass === "creator_authored"
    ? `Your own answer, from ${dayStr}:`
    : `From a post you saved on ${dayStr}:`;
}

/**
 * What the screen says for an UNDECIDED interview field (R1/R11) — the
 * `strategy`/`killtest` sibling of `PLACEHOLDER_ABSENCE`.
 *
 * A DIFFERENT SENTENCE, deliberately, not a reuse: `PLACEHOLDER_ABSENCE` says
 * OUR evidence search came up empty ("we could not point to a quote from your
 * posts"), which is true for `voice` and false here — nobody searched
 * anything; the creator was asked and left it undecided. Saying "we could not
 * find it" about a question nobody answered would misattribute an absence
 * that is squarely the creator's own choice to leave open, on the one screen
 * bound hardest against inventing what is not there.
 */
export const INTERVIEW_PLACEHOLDER_ABSENCE =
  "You left this undecided in the interview, so we are not stating it. Confirm it as still undecided, or answer it in the interview and build a new version.";

/**
 * The empty-state sentence for a target (Strategy/Kill Test) the creator
 * SUBMITTED an interview about but decided has nothing to state — a real,
 * deliberate answer (e.g. "no banned words"), not silence (tenancy gate
 * finding, 2026-08-30). Named separately from the generic "you haven't
 * started" copy below so the two are never confused: a creator who gave a
 * real answer must never be told to go do something they already did.
 */
export const INTERVIEW_ANSWERED_NOTHING_TO_STATE =
  "You answered this part of the interview and told us there was nothing to add — so no draft was built, because there was nothing for it to say. That's recorded as your answer, not lost.";

/**
 * What "activate" means on THIS screen (slice 3b, R8) — replaces slice 3's
 * per-document sentence everywhere on `/brain`, for all three kinds.
 *
 * STATES THE COHERENCE EXPLICITLY, because the button still names one
 * document (the creator is looking at one Voice/Strategy/Kill Test draft when
 * they press it) while what it puts in force is the WHOLE brain —
 * `activateBrainCoherent` records every other kind's current active id
 * alongside the one just activated, in the same snapshot (R8/R9). A sentence
 * that only described "this version" would understate what the act does.
 */
export const COHERENT_ACTIVATE_MEANING =
  "Activating puts your whole Creator Brain in force: this version, together with whichever Voice, Strategy and Kill Test versions are already active for anything you have not just confirmed here. You can draft a new version of any of them later, which replaces only that one.";

/**
 * What the screen says for a claim position we could not ground (R11).
 *
 * A NAMED ABSENCE, and deliberately not a ratio — and the absence is OURS.
 * The first wording said "there was not enough in the posts you saved", which
 * attributes it to the creator's material on the one screen where that is a
 * claim about a person; `run-copy.ts` had already ruled that exact shape out
 * for its sibling sentence, and the two surfaces now say the same thing
 * (compliance gate round 2, 2026-08-29).
 * "Quoted from 0 of your 12
 * posts" reads as a measurement of the creator rather than of our evidence
 * (task 20), and "we are not confident" invites a confidence number this
 * product does not have — `confidence` was withdrawn from the evidence shape
 * for exactly that reason (C-15).
 */
// "…or write it yourself" was REMOVED (tenancy gate round 3, 2026-08-29): the
// confirm screen offers no edit box — field editing ships in slice 5 — so the
// sentence directed the creator to an act this product cannot host yet. The
// clause returns when the affordance does.
export const BRAIN_EDIT_MEANING =
  "Editing creates a new draft. The version in force stays in force until you confirm the replacement and activate your whole Creator Brain.";

export const BRAIN_EDIT_CHECK_COPY =
  "Use [check] when you do not want the product to state a value yet. At least one rule in the whole document must remain stated.";

export const BRAIN_EXPORT_JSON_COPY =
  "JSON is the complete machine-readable record from the creator-data registry.";

export const BRAIN_EXPORT_MARKDOWN_COPY =
  "Markdown is a human-readable projection for reading, not a round-trip format.";

/**
 * How the screen summarises what is left to do — counts, never a ratio.
 *
 * TWO INDEPENDENT NUMBERS. "3 of 4 confirmed" is fine as a count of the
 * creator's own progress through a list they are working through; what must
 * never appear is a fraction describing how well their posts scored.
 */
export function confirmProgress(total: number, confirmed: number): string {
  if (total === confirmed) {
    return `All ${total} confirmed. Activating puts them in force.`;
  }
  const left = total - confirmed;
  return `${confirmed} of ${total} confirmed. ${left} still ${left === 1 ? "needs" : "need"} your decision before this can be activated.`;
}

/**
 * Every code the `/brain` actions can actually produce.
 *
 * DERIVED FROM THE CALL GRAPH, like `../onboarding/copy.ts`'s list and for the
 * same reason: a code outside this set renders `unknown`'s neutral words rather
 * than another surface's product copy, and a code the actions CAN emit but this
 * list omits degrades to neutral copy rather than to silence.
 *
 * `confirmVoiceFields` reaches `ProfileScope.mint` (ScopeForgeryError,
 * ProfileAccessError), `assertMayDecide` (BrainRoleError), `hasOpenPause`
 * (WorkspacePausedError) and `confirmBrainDocFields`'s validation
 * (ProvenanceError). `activateVoice` adds the echo bar
 * (ContentWalkError, SegmenterUnavailableError). `readBrainHistory` annotates
 * unreadable evidence on the affected version instead of raising a page-level
 * error. `withWorkspace` raises WorkspaceAccessError on every path.
 *
 * SAME SET FOR `strategy`/`killtest`/COHERENT ACTIVATION (slice 3b, Stage B2):
 * `confirmStrategyFields`/`confirmKillTestFields` and `readBrainHistory` call
 * the identical capabilities above with a different `kind`, and
 * `activateBrainCoherent` runs `activateBrainDoc`'s own gates
 * before its one extra step (the snapshot insert, which raises nothing new —
 * a locked, already-scoped write). No new error code was needed.
 *
 * Ordinary edits additionally reach `ProfileRoleError`, the content schema,
 * echo/content walkers and the fixed reason renderer. Their legacy/defect-only
 * typed refusals remain in this closed set too: a typed server refusal must not
 * turn into `unknown` merely because the usual stored data cannot trigger it.
 */
export const BRAIN_ERROR_CODES = [
  "brain_role",
  "profile_role",
  "brain_edit_busy",
  "brain-edit-all-check",
  "brain_edit_limit",
  "brain_document_limit",
  "brain_version_limit",
  "onboarding_input_limit",
  "brain_content_schema",
  "brain_kind_not_writable",
  "brain_claim_walk",
  "brain_reason",
  "provenance",
  "evidence_unreadable",
  "reference_echo",
  "brain_content_walk",
  "segmenter_unavailable",
  "workspace_paused",
  "profile_access",
  "scope_forgery",
  "workspace_access",
  "unknown",
] as const satisfies readonly BillingErrorCode[];

/**
 * Copy for the codes whose SHARED wording is honest elsewhere and wrong here.
 *
 * The shared `provenance` copy is written for a WRITE refusal ("that
 * version was not stored"). On this screen the refusal is a confirmation or an
 * activation, so the shared sentence would tell a creator nothing was stored
 * when what actually happened is that nothing was activated.
 */
const BRAIN_OVERRIDES: Partial<Record<BillingErrorCode, BillingErrorCopy>> = {
  provenance: {
    title: "That was not recorded",
    detail:
      "What this page showed you and what the server holds no longer agree, so nothing was changed — recording a decision about something you did not see is the one thing this page must not do. Reload the page and read the rules again; everything you had already confirmed is still confirmed.",
  },
  workspace_paused: {
    title: "This workspace's subscription is paused",
    detail:
      "While a workspace is paused, brain edits, confirmations and activation are unavailable. Existing versions are unchanged, and you can still read history and export your data. Resume the subscription on the billing page to make changes.",
  },
  brain_role: {
    title: "You do not have access to decide this",
    detail:
      "Editing, confirming and activating decide what the product believes about this creator, so they need at least editor access. Nothing was changed. Ask a workspace owner to make the decision, or to give you editor access.",
  },
  profile_role: {
    title: "You do not have access to edit this brain",
    detail:
      "Creating a replacement Brain version needs at least editor access. Nothing was changed, and the version already in force is untouched. Ask a workspace owner to make the edit, or to give you editor access.",
  },
  brain_content_schema: {
    title: "Those edits do not fit this brain document",
    detail:
      "One or more edited values do not fit the fixed fields for this Brain document, so no replacement draft was created and the version already in force is unchanged. Review the field formats shown here and try again. If the same values are refused again, contact support so the document shape can be checked.",
  },
  brain_kind_not_writable: {
    title: "That brain document cannot be edited here",
    detail:
      "This screen edits Voice, Strategy and Kill Test documents only. The requested stored document is not one of those editable kinds, so nothing was changed. Reload the page and try the current version; contact support if the refusal repeats.",
  },
  brain_claim_walk: {
    title: "This brain document needs support",
    detail:
      "The server could not match the stored document to the claim fields this screen must show, so it refused the edit before creating a replacement. The version already in force is unchanged. Reload once, then contact support if it repeats.",
  },
  brain_reason: {
    title: "The replacement draft could not be recorded",
    detail:
      "The server could not assign the replacement one of the fixed reasons a Brain version is allowed to carry, so nothing was created and the version already in force is unchanged. Try once more, then contact support if it repeats.",
  },
  onboarding_input_limit: {
    title: "That replacement cannot fit this creator's record",
    detail:
      "A Brain edit records its changed rules as creator-authored evidence, and that input is too large or this creator's retained-input record is full. Nothing was changed. Shorten the edited text and try again; if the profile is full, contact support before making more revisions.",
  },
};

/** The copy `/brain` renders for a `?e=` code — closed set, overrides applied. */
export function brainErrorFor(raw: string | undefined): BillingErrorCopy | null {
  if (!raw) return null;
  // An unrecognised code falls back to `unknown`, never to nothing — the
  // silent-nothing failure mode `onboardingErrorFor` was already corrected for.
  const known = (BRAIN_ERROR_CODES as readonly string[]).includes(raw);
  const code = (known ? raw : "unknown") as BillingErrorCode;
  return BRAIN_OVERRIDES[code] ?? BILLING_ERROR_COPY[code];
}
