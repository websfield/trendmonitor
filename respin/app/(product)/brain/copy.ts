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
  billingErrorCopy,
  type BillingErrorCode,
  type BillingErrorCopy,
} from "../billing-errors";
// R-176 (plan label R-159): the support address and the sentence that names it.
import { supportContact } from "../../support-contact";
import { withContact } from "../../support-copy";
// THE SHARED DISPLAY VOCABULARY IS RE-EXPORTED, NEVER REDECLARED (slice 5
// stage 2, G0 — closing stage 1's handoff).
//
// Every name below used to be a SECOND copy of a value `packages/db` also
// held, and the two drifted in exactly the way a second copy always can: the
// markdown export printed the VOICE absence sentence ("we could not point to a
// quote from your posts") for `strategy` and `killtest` documents, where
// nobody searched anything and the creator simply left an interview field
// undecided — a false reason for an absence, in the artefact of record
// (REQ-I03). Stage 1 moved the sentences and the label maps down into
// `packages/db/src/export.ts`, because `packages/db` cannot import from
// `app/**` (the tech-spec §1 layout rule) and so the ONLY way for the screen
// and the downloaded file to say the same thing is for the words to live
// there and this file to re-export them.
//
// STAGE 1 VERIFIED BYTE-IDENTITY BY HAND. That is not a guard, and the tenancy
// gate said so: `tests/shared-copy-identity.test.ts` is the durable one. It
// proves each name below arrives from `@respin/db` (a source scan, so a
// re-introduced literal fails even though two equal STRINGS are `toBe`-equal)
// and that its value still equals the package's — the class, not the instance.
//
// Documentation for each of them lives with the value, in `export.ts`.
//
// `screenAbsenceSentence` (round 2) is the (kind, reason) SELECTOR the two
// absence constants are two answers of. The screen calls it rather than
// picking a constant per kind: a VOICE version the creator EDITED must not be
// told "we could not point to a quote from your posts" about a `[check]` the
// creator typed themselves — see `ABSENCE_CREATOR_EDIT` in `export.ts`.
//
// NO COMMENTS INSIDE THE BRACES BELOW. `tests/shared-copy-identity.test.ts`
// parses this block by splitting on commas, so a comment between two names
// becomes a garbage "name" and the identity guard reports nonsense.
export {
  PLACEHOLDER_ABSENCE,
  INTERVIEW_PLACEHOLDER_ABSENCE,
  screenAbsenceSentence,
  VOICE_FIELD_LABELS,
  STRATEGY_FIELD_LABELS,
  STRATEGY_METRIC_FIELD_LABELS,
  KILLTEST_FIELD_LABELS,
  claimLabel,
  strategyClaimLabel,
  killtestClaimLabel,
  isMetricPointer,
  quoteIntro,
} from "@respin/db";

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

/**
 * What leaving an OPTIONAL declared-metric field blank does (slice 5 gate
 * round 1, G1).
 *
 * NOT `[check]`, and the difference is the whole finding. `[check]` is "we are
 * not stating this yet" — an open question. A blank platform or measurement
 * window is an ANSWER: you are not naming one. The interview stores that
 * answer by omitting the position entirely rather than writing `[check]` into
 * it (`brain-content.ts`'s own comment on those two fields), and the edit path
 * now says the same thing — which is also what makes the metric editable at
 * all for a creator who declined the question in the interview.
 */
export const OPTIONAL_METRIC_BLANK_MEANING =
  "Leave blank if you are not naming one. That is recorded as your answer — the field is left unstated, not marked [check].";

/** The three kinds this screen renders a proposed draft for. */
type ProposedKind = "voice" | "strategy" | "killtest";

/**
 * The line above a proposed draft, per kind — ORIGIN-NEUTRAL (slice 5 gate
 * round 1, G4).
 *
 * WHAT WAS WRONG. These sentences named where the draft CAME FROM — "from the
 * posts you saved and told us you wrote", "built directly from what you told
 * us in the interview — nothing here is inferred" — and were rendered for
 * EVERY proposed version, including one whose stored reason is `creator_edit`.
 * A version the creator typed themselves was introduced as though a model had
 * read their posts, or as though the interview had produced it. On the screen
 * whose whole job is provenance, that is the provenance being wrong.
 *
 * THE ORIGIN IS STILL ON THE PAGE — twice, and both times DERIVED rather than
 * assumed, which is why removing it from here loses nothing:
 *   - the version's own `reason`, rendered directly beneath this line, is a
 *     sentence the SERVER composed from the stored reason code
 *     (`renderBrainReason`: "inferred from 3 of your onboarding inputs" /
 *     "you edited this document") — a closed code set with no caller prose;
 *   - every claim carries `quoteIntro(claim.source.inputClass, …)`, which says
 *     "From a post you saved on <date>" or "Your own answer, from <date>" per
 *     claim, from the input row's own class.
 * Deriving THIS line from `reason` instead would mean matching on a rendered
 * English sentence, which is a fragile way to ask a question the two derived
 * surfaces already answer exactly.
 */
export const PROPOSED_INTRO: Record<ProposedKind, (profileName: string) => string> = {
  voice: (profileName) =>
    `These are rules this draft states about how ${profileName} writes. Nothing here is in force. Read each one next to the quote it rests on — or next to the plain statement that there is no quote — and confirm it, or leave it unconfirmed and it stays out.`,
  strategy: (profileName) =>
    `This is the strategy this draft states for ${profileName}. Nothing here is in force. Read each one next to the words it rests on, and confirm it — or leave it unconfirmed and it stays out.`,
  killtest: (profileName) =>
    `These are the words and vibes this draft says ${profileName} never wants used. Nothing here is in force. Read each one next to the words it rests on, and confirm it — or leave it unconfirmed and it stays out.`,
};

/**
 * R-163: the decide block `/brain` renders under the READ grade — the
 * workspace is tombstoned by a pending deletion. It names the page that can
 * act on it, and only what is true during grace: history readable, export
 * available, nothing editable.
 */
export const BRAIN_PENDING_DELETION_REASON =
  "This workspace is scheduled for deletion, so brain edits, confirmations and activation are closed. You can still read this history and export your data. Cancel the deletion on /settings/account to make changes again.";

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
 * ProfileAccessError), `assertOwner` (ProfileRoleError), `hasOpenPause`
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
 * echo/content walkers, the fixed reason renderer and `BrainEditUnchangedError`
 * (a submission identical to the stored version — easy to reach from the metric
 * form, which posts all five positions on every press whether or not any moved,
 * so nothing before the server notices that nothing changed). Their legacy/defect-only
 * typed refusals remain in this closed set too: a typed server refusal must not
 * turn into `unknown` merely because the usual stored data cannot trigger it.
 */
export const BRAIN_ERROR_CODES = [
  "brain_role",
  "profile_role",
  "brain_edit_busy",
  "brain-edit-all-check",
  "brain_edit_unchanged",
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
      "One or more edited values do not fit the fixed fields for this Brain document, so no replacement draft was created and the version already in force is unchanged. Review the field formats shown here and try again. If the same values are refused again, the refusal is recorded so an operator can check the document shape.",
  },
  brain_kind_not_writable: {
    title: "That brain document cannot be edited here",
    detail:
      "This screen edits Voice, Strategy and Kill Test documents only. The requested stored document is not one of those editable kinds, so nothing was changed. Reload the page and try the current version.",
  },
  brain_claim_walk: {
    title: "This brain document needs support",
    detail:
      "The server could not match the stored document to the claim fields this screen must show, so it refused the edit before creating a replacement. The version already in force is unchanged. Reload once; the refusal is recorded.",
  },
  brain_reason: {
    title: "The replacement draft could not be recorded",
    detail:
      "The server could not assign the replacement one of the fixed reasons a Brain version is allowed to carry, so nothing was created and the version already in force is unchanged. Try once more; the refusal is recorded.",
  },
  onboarding_input_limit: {
    title: "That replacement cannot fit this creator's record",
    detail:
      "A Brain edit records its changed rules as creator-authored evidence, and that input is too large or this creator's retained-input record is full. Nothing was changed. Shorten the edited text and try again; if the profile is full, it cannot take more revisions.",
  },
};

/**
 * THE `/brain` OVERRIDES WHOSE REMEDY ENDS WITH A PERSON (audit P6-R6
 * amendment, R-176). Each sent the creator to support with no channel (measured
 * 2026-10-05: 5 lines in this file); the text above keeps only the remedy the
 * creator can act on, and `brainErrorFor` appends the contact line when
 * `RESPIN_SUPPORT_EMAIL` is set. A list, pinned by
 * `tests/support-contact.test.tsx`.
 */
export const BRAIN_SUPPORT_CONTACT_CODES: readonly BillingErrorCode[] = [
  "brain_content_schema",
  "brain_kind_not_writable",
  "brain_claim_walk",
  "brain_reason",
  "onboarding_input_limit",
];

/**
 * The copy `/brain` renders for a `?e=` code — closed set, overrides applied.
 * `support` defaults to the server read (this module imports
 * `../billing-errors`, so it is server-only); a test passes it explicitly.
 */
export function brainErrorFor(
  raw: string | undefined,
  support: string | null = supportContact()
): BillingErrorCopy | null {
  if (!raw) return null;
  // An unrecognised code falls back to `unknown`, never to nothing — the
  // silent-nothing failure mode `onboardingErrorFor` was already corrected for.
  const known = (BRAIN_ERROR_CODES as readonly string[]).includes(raw);
  const code = (known ? raw : "unknown") as BillingErrorCode;
  const override = BRAIN_OVERRIDES[code];
  if (override === undefined) return billingErrorCopy(code, support);
  return BRAIN_SUPPORT_CONTACT_CODES.includes(code)
    ? { title: override.title, detail: withContact(override.detail, support) }
    : override;
}
