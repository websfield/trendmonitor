// Typed refusals owned by @respin/db.
//
// `WorkspacePausedError` MOVED here from @respin/credits on 2026-08-21 (plan
// A-7). The reason is a dependency fact, not a preference: `writeBrainDoc`
// lives in packages/db and must refuse under an open pause, `pause_periods` is
// defined in packages/db (`billing-schema.ts`), and @respin/credits depends on
// @respin/db — so a credits-owned error class would have made the refusal
// either impossible or duplicated. A duplicate class is worse than either: two
// `WorkspacePausedError`s fail `instanceof` against each other, and the app's
// error map matches on `instanceof`, so the pause refusal would have rendered
// as "Something went wrong" — the exact outcome the move exists to prevent.
//
// @respin/credits re-exports it, so every existing import site is unchanged.

export class WorkspacePausedError extends Error {
  constructor() {
    super(
      "Workspace subscription is paused: credits are frozen and debits are refused until resume (REQ-G08)."
    );
    this.name = "WorkspacePausedError";
  }
}

/**
 * The profile equivalent of WorkspaceAccessError.
 *
 * ITS MESSAGE CARRIES NO IDENTIFIER, deliberately and permanently. A message
 * that distinguished "this profile is not yours" from "this profile does not
 * exist" would be an enumeration oracle over every workspace's profile ids —
 * so foreign, nonexistent and malformed ids all raise this one message,
 * byte-identical, and a test asserts it with `toBe` rather than `toMatch`.
 */
export class ProfileAccessError extends Error {
  constructor() {
    super(
      "That creator profile is not available in this workspace (REQ-A03). If you believe it should be, ask the workspace owner to check the profile list."
    );
    this.name = "ProfileAccessError";
  }
}

/**
 * The per-tier creator-profile cap, refused (REQ-A03 / PRD §4G).
 *
 * IT NAMES THE TIER AND THE CAP, unlike `ProfileAccessError` one class up, and
 * the asymmetry is deliberate rather than sloppy. That error must be
 * byte-identical for foreign, nonexistent and malformed ids because a
 * distinguishable refusal there enumerates other workspaces' profiles. This one
 * discloses two facts about the reader's OWN workspace that their own billing
 * page already shows them — which plan they are on, and how many profiles it
 * includes — and withholding them would leave "not available" as the entire
 * explanation for a limit they can actually do something about.
 *
 * The numbers reach a creator through `app/(product)/billing-errors.ts` copy
 * plus the cap the onboarding page renders from config, NOT by interpolating
 * this message into a page: the `?e=<code>` failure channel carries a code and
 * never a message, so that nobody can hand a creator a link that renders
 * arbitrary text as though the product said it.
 */
export class ProfileCapError extends Error {
  constructor(
    readonly tier: string,
    readonly cap: number,
    readonly existing: number
  ) {
    super(
      `Creator-profile cap reached: the ${tier} tier includes ${cap} profile${cap === 1 ? "" : "s"} and this workspace already has ${existing} active. Archive a profile or move to a plan with a higher cap (PRD §4G).`
    );
    this.name = "ProfileCapError";
  }
}

/**
 * A role refusal on a PROFILE-GRAINED WRITE: creating a creator profile, or
 * appending to a creator's onboarding corpus.
 *
 * SEPARATE from `BrainRoleError`, which refuses `viewer` on confirming and
 * activating — those two decide what the product BELIEVES about a creator, and
 * their copy says so. These refuse a viewer on writes that either consume a
 * per-tier entitlement or land permanently in an immutable record.
 *
 * IT CARRIES AN `act` BECAUSE THE TENANCY GATE BLOCKED ON THE MISSING ONE
 * (2026-08-27, register item G-13). Slice 1 gave `createProfile` a role gate
 * and left `appendOnboardingInput` — the write the new paste form actually
 * makes reachable from a browser — with none, while `onboarding_inputs` is
 * immutable, has no delete path, is export-included, and is the corpus every
 * `source_evidence` offset indexes into. A viewer's paste was not reversible by
 * the owner. One class with an act keeps the copy honest for both.
 *
 * Leaks nothing: it tells a caller about their own role, which they know.
 */
export class ProfileRoleError extends Error {
  constructor(
    readonly act: string,
    role: string
  ) {
    super(
      `A ${role} cannot ${act}. That write is drawn from the workspace's paid per-tier allowance or lands permanently in a creator's record, so it needs at least editor access (REQ-A02). Ask a workspace owner.`
    );
    this.name = "ProfileRoleError";
  }
}

/**
 * A display name that is empty, over length, or carries control characters.
 *
 * A TYPED REFUSAL RATHER THAN A DATABASE ERROR, for the reason the plan's R2
 * gives about the cap: `display_name` is `text NOT NULL` with no length or
 * shape constraint, so an empty submission would store successfully and every
 * later screen would render a profile with no name — and a name carrying a
 * newline renders as two lines in a list whose rows are one line. Neither is a
 * database violation; both are refusals a person can act on in one edit.
 */
export class ProfileNameError extends Error {
  constructor(detail: string) {
    super(
      `That profile name cannot be used: ${detail}. A creator profile name is what every later screen calls this creator, so it has to be one line of visible text.`
    );
    this.name = "ProfileNameError";
  }
}

/**
 * A `source_evidence` entry that does not survive validation against the input
 * it cites — offsets outside the stored content, or a quote that is not
 * verbatim at those offsets.
 *
 * SEPARATE from ProfileAccessError on purpose, and safe to name precisely: by
 * the time this fires the input has already been proven to belong to THIS
 * profile, so the message reveals nothing about what else exists. Collapsing
 * the two would have made a fabricated quote indistinguishable from an
 * unauthorised one in the log — and REQ-B02's whole subject is provenance, so
 * the one refusal that means "this warrant is invented" gets its own name.
 */
export class ProvenanceError extends Error {
  constructor(detail: string) {
    super(
      `Source evidence rejected: ${detail}. Every quote must be verbatim at its recorded UTF-16 offsets into the stored, normalised onboarding input (REQ-B02) — an invented quote carries a fabricated warrant, so it is refused rather than stored.`
    );
    this.name = "ProvenanceError";
  }
}

/**
 * A creator edit tried to replace every claim in one brain version with the
 * named `[check]` absence.
 *
 * This is deliberately narrower than `ProvenanceError`. That class also means
 * a stale pointer, an unreadable quote, or an invalid offset; the browser must
 * not guess which of those happened from the submitted fields. An edit may
 * clear any individual assertion, but a document containing no assertion and
 * no warrant is not a brain version the creator can later confirm.
 */
export class BrainEditEmptyError extends Error {
  constructor() {
    super(
      "You cannot blank every rule in a brain document. Keep at least one stated, cited rule; use [check] only for individual claims you do not want the product to assert."
    );
    this.name = "BrainEditEmptyError";
  }
}

/**
 * A creator edit submission changed nothing in the version it was submitted
 * against (slice 5 gate round 1, G3).
 *
 * A SIBLING OF `BrainEditEmptyError`, NOT OF `ProvenanceError`, and the split
 * is the whole finding. `editBrainDocument` used to raise a bare
 * `ProvenanceError` here, which `/brain` renders with the copy written for the
 * STALE-BASE refusal: "what this page showed you and what the server holds no
 * longer agree ... reload the page". Nothing of the sort happened. Nothing is
 * stale, nothing disagrees, and reloading changes nothing — the creator
 * pressed Save on a form they had not altered. `editDeclaredMetricAction` is
 * what makes that easy to do: it posts all five metric positions on every
 * press whether or not any of them moved, so the form itself never notices,
 * and this refusal is the first thing that tells the creator anything. A
 * refusal that names the wrong event sends the reader to fix something that is
 * not broken.
 *
 * It is not a `ProvenanceError` because it is not about evidence at all: no
 * quote was submitted, so no quote failed to verify. Nothing in the product
 * catches `ProvenanceError` polymorphically — only `billing-errors.ts`'s
 * ordered class walk, which reads the exact class — so this costs no caller.
 */
export class BrainEditUnchangedError extends Error {
  constructor() {
    super(
      "The submitted edit does not change this brain version, so no replacement draft was created. Change at least one field before submitting."
    );
    this.name = "BrainEditUnchangedError";
  }
}

/** A creator-edit request exceeded one of the closed request/storage bounds. */
export class BrainEditLimitError extends Error {
  constructor(detail: string) {
    super(
      `That brain edit was not stored: ${detail}. Edit fewer fields at once or shorten the changed text, then submit again.`
    );
    this.name = "BrainEditLimitError";
  }
}

/** Another brain edit in the same workspace is already occupying its slot. */
export class BrainEditBusyError extends Error {
  constructor() {
    super(
      "Another brain edit in this workspace is already being saved. Wait for it to finish, then review the current version before trying again."
    );
    this.name = "BrainEditBusyError";
  }
}

/** The immutable onboarding-input boundary refused an oversized or full profile. */
export class OnboardingInputLimitError extends Error {
  constructor(detail: string) {
    super(
      `That creator-authored input was not stored: ${detail}. Shorten the input or remove an older intake item before trying again.`
    );
    this.name = "OnboardingInputLimitError";
  }
}

/** The append-only brain-history ceiling has been reached for this profile. */
export class BrainVersionLimitError extends Error {
  constructor(limit: number) {
    super(
      `This creator profile already has ${limit} retained brain versions, so another immutable version was not stored. Export the history and contact support before making more revisions.`
    );
    this.name = "BrainVersionLimitError";
  }
}

/** One proposed brain version exceeded the bounded claim/evidence envelope. */
export class BrainDocumentLimitError extends Error {
  constructor(detail: string) {
    super(
      `That brain version was not stored: ${detail}. Reduce the number or length of its claims and evidence, then rebuild it.`
    );
    this.name = "BrainDocumentLimitError";
  }
}

/** A second complete export in the same workspace is already being prepared. */
export class ExportBusyError extends Error {
  constructor() {
    super(
      "A complete creator-data export in this workspace is already being prepared. Wait for that download to finish, then try again."
    );
    this.name = "ExportBusyError";
  }
}

/**
 * R-3's echo bar or quote budget refused a brain-document write (slice 4,
 * R12).
 *
 * ITS OWN CLASS, SEPARATE FROM `ProvenanceError`, and the split matters for
 * the reader rather than for the code. `ProvenanceError` means a cited quote
 * does not match what a creator's OWN post says — an evidence bug, fixed by
 * reloading or rebuilding. This means the OPPOSITE kind of thing: some part of
 * what is about to be written repeats a REFERENCE post too closely, or has
 * quoted more of one reference post than the 600-character budget allows.
 * Collapsing the two under one code would tell a creator whose draft echoes a
 * reference post that "a quote didn't match your own words", which is not
 * what happened and is not fixable the way that message implies.
 *
 * The detail may still carry operator context in-process, but safe logging
 * serializes none of an exception's message. The optional structured match is
 * the only browser-reachable detail: the edit action validates its pointer and
 * UUID, bounds its excerpt, and returns it as in-place action state. Browser
 * redirects still carry only a stable code, never reference text.
 */
export type ReferenceEchoMatch = {
  pointer: string;
  inputId: string;
  span: string;
};

export class ReferenceEchoError extends Error {
  constructor(
    detail: string,
    readonly match: ReferenceEchoMatch | null = null
  ) {
    super(
      `Reference-echo bar refused: ${detail}. A reference post is kept only so a mechanism can be noted from it, never to be repeated (R-3) — write the field in your own words rather than the reference post's, or cite less of it.`
    );
    this.name = "ReferenceEchoError";
  }
}

/**
 * A `usage_raw` value that could carry text.
 *
 * `model_usage.usage_raw` is excluded from the REQ-A04 export on the ground
 * that it holds metering fields only — so that ground has to be enforced, not
 * asserted. This is the refusal that enforces it.
 */
export class UsageRawError extends Error {
  constructor(found: string) {
    super(
      `usage_raw rejected: it contains ${found}. This column records METERING ONLY — never prompt or completion text — because the REQ-A04 export excludes it on exactly that basis. Record token counts and flags; if a provider returns a field this refuses, give it its own column.`
    );
    this.name = "UsageRawError";
  }
}

/**
 * A value shaped like a scope that this module did not mint.
 *
 * This is never a user's mistake and never something a user can trigger: a
 * scope reaches a capability only by being minted, so this class means a
 * forgery attempt or a genuine programming error. Its copy says so instead of
 * offering the reader a button that cannot help them.
 */
export class ScopeForgeryError extends Error {
  constructor(what: string) {
    super(
      `${what} was not minted by @respin/db. Scopes are minted only by withWorkspace / ProfileScope.mint; a spread, a cast, an Object.assign, a Proxy, a subclass or a Reflect.construct is not a scope (REQ-A03).`
    );
    this.name = "ScopeForgeryError";
  }
}

/**
 * A role refusal on the two acts that decide what the product BELIEVES about a
 * creator: confirming a brain document's fields, and activating a version.
 *
 * SEPARATE from `ProfileAccessError`, deliberately. That error is one fixed
 * message for foreign, nonexistent and malformed profile ids alike, because a
 * distinguishable refusal there is an enumeration oracle (P2). This one leaks
 * nothing: it tells a caller about their OWN role, which they already know, and
 * saying so is the difference between a usable refusal and "not available".
 */
export class BrainRoleError extends Error {
  constructor(act: string, role: string) {
    super(
      `A ${role} cannot ${act} a brain document. Confirming and activating decide what the product believes about this creator and act on it, so they need at least editor access (REQ-A02). Ask a workspace owner.`
    );
    this.name = "BrainRoleError";
  }
}

/**
 * A pasted onboarding post that is blank or over the length ceiling.
 *
 * `onboarding_inputs.content` is `text` with no constraint, and slice 1 is the
 * first slice on which a browser reaches it — so the ceiling and the blank
 * check are refusals rather than database errors, for the reason
 * `ProfileNameError` states: neither is a constraint violation, and both are
 * things the person can fix in one edit if they are told which one happened.
 * The limit itself is `POST_CONTENT_MAX` in `onboarding-ops.ts`, beside the
 * check that applies it.
 */
export class PostContentError extends Error {
  constructor(detail: string) {
    super(
      // COMPLIANCE GATE CHANGE (slice 4 round 2, 2026-08-29): the previous
      // wording ended "…and nothing else reads it yet" — the same stale
      // data-handling claim the onboarding UI's own header records fixing
      // once already (2026-08-29, "false the moment a real inference or echo
      // check reads a stored post"). This class's message stays in-process:
      // `safe-log.ts` withholds exception messages entirely and records only
      // stable refusal identity plus server context.
      `That post was not stored: ${detail}. Paste the text of one post at a time — it is kept exactly as you typed it.`
    );
    this.name = "PostContentError";
  }
}

/**
 * A post was submitted for the `own_post` class without the creator attesting
 * that they wrote it (R8, register item G-12's creator half).
 *
 * WHY THIS EXISTS AT ALL, stated plainly because it is easy to read as theatre.
 * `input_class` decides whether two R-3 controls run: `validateSourceEvidence`
 * refuses a `reference` input as the provenance of a `voice` document, and
 * `referenceCorpusAsOf` builds the echo corpus from `reference` rows. An
 * `own_post` label switches both off. Until slice 3 the ONLY warrant for that
 * label was a sentence above a textarea — "Paste the text of posts you wrote
 * yourself" — and slice 3 is where the label starts deciding what the product
 * believes about a person's voice.
 *
 * WHAT IT IS AND IS NOT. It makes the attestation an ACT the caller has to
 * perform, at every call site, rather than a sentence the creator may not have
 * read; and it makes "who asserted this" a question with a code answer instead
 * of no answer. It does **not** verify authorship, and nothing in this product
 * does — that is recorded as out of scope in the slice-3 card rather than left
 * to be discovered. An unverified label the product KNOWS is unverified is a
 * different risk from one it presents as verified, and this is the line
 * between them.
 *
 * IT LIVES IN THE PACKAGE, not in the server action, because a server action is
 * a POST endpoint reachable by its own id and `@respin/credits` reaches
 * `appendOwnPost`'s neighbours directly. A guard placed only where today's
 * caller happens to be is the shape CLAUDE.md's 2026-07-30 lesson is about.
 */
export class PostAttestationError extends Error {
  constructor() {
    super(
      "That post was not stored because it was submitted without confirming that you wrote it. Posts kept as your own are what a voice brain is inferred from, so the product only labels one that way when you say so. Tick the confirmation and submit it again."
    );
    this.name = "PostAttestationError";
  }
}

/**
 * `appendOnboardingInput` was given a `field_key` that disagrees with
 * `input_class` — present for a NON-`creator_authored` row, or absent for a
 * `creator_authored` one.
 *
 * `onboarding_inputs_field_key_iff_creator_authored` (the migration 0018
 * CHECK) already refuses this at the database, but a raw 23514 is not a
 * refusal anyone can act on (the same reasoning `WriteBrainDocParams`'s
 * non-empty-`sourceEvidence` check gives for naming its own constraint). This
 * class names the SAME rule in application code, before the insert, so the
 * caller — `interview-ops.ts`'s `submitInterview`, today the only caller that
 * can reach `creator_authored` at all — gets a typed refusal rather than a
 * constraint-violation stack trace.
 */
export class OnboardingInputFieldKeyError extends Error {
  constructor(inputClass: string, fieldKey: unknown) {
    super(
      fieldKey === undefined
        ? `A 'creator_authored' onboarding input must carry the interview field it answers (field_key), and none was given.`
        : `field_key ('${String(fieldKey)}') was given for an input classed '${inputClass}', not 'creator_authored'. field_key names which interview question a creator_authored row answers, and no other class has one.`
    );
    this.name = "OnboardingInputFieldKeyError";
  }
}

/**
 * A revision named a parent this creator cannot revise from (slice 7, R6).
 *
 * ONE CLASS AND ONE MESSAGE for foreign, nonexistent and not-yet-existing
 * parents alike, for the enumeration reason `ProfileAccessError` and
 * `GenerationAttemptStateError` both state: a refusal that distinguished
 * "another creator's output" from "no such output" would be an oracle over
 * every workspace's generation ids, and generation ids are uuidv7 — they leak
 * creation TIME as well as existence.
 *
 * IT ALSO COVERS "NOT EARLIER", which is not the same thing as "nonexistent"
 * and is the case a reader would not predict. `generations.created_at` is
 * `now()`, i.e. TRANSACTION START, so a long transaction that began before a
 * sibling committed can insert a row whose stamp PRECEDES the parent it names
 * — a lineage that reads backwards on every screen that renders it, with no
 * constraint able to see it (Postgres cannot compare two rows in a CHECK).
 * `settleGeneration` therefore requires the parent to be strictly earlier than
 * this transaction's clock, and this is what that refusal is called.
 */
export class GenerationLineageError extends Error {
  constructor() {
    super(
      "That revision could not be linked to the output it revises. Either that output is not this creator's, or it no longer exists, or it is not older than this one. Nothing was generated and nothing was spent — reopen the output you want to revise and try from there."
    );
    this.name = "GenerationLineageError";
  }
}

/**
 * Feedback carried a reaction that is not one of the closed set (slice 7, R10).
 *
 * NOT A CREATOR'S MISTAKE, and the copy says so rather than asking them to fix
 * something they did not type. The reaction set is rendered by the server as a
 * fixed list of buttons, so an unknown code means the page is older than the
 * server or the form was tampered with — reloading is the only thing a person
 * can usefully do.
 *
 * IT EXISTS SO THE ENUM'S OWN 22P02 NEVER REACHES A SCREEN. `reaction` is a
 * pgEnum; an unknown value raises `invalid input value for enum`, which
 * `billing-errors.ts` has no case for and which would therefore render as
 * "Something went wrong" — the outcome every typed refusal in this file exists
 * to prevent.
 */
export class FeedbackReactionError extends Error {
  constructor(readonly received: unknown) {
    super(
      "That feedback was not recorded because it named a reaction this product does not have. The reactions are a fixed list the page renders — reload the page and choose one of them."
    );
    this.name = "FeedbackReactionError";
  }
}

/**
 * Feedback named an output that is not this creator's (slice 7, R10).
 *
 * ADDED IN THE AUTHOR'S OWN ADVERSARIAL RE-READ, and the defect it closes had
 * TWO halves that were both live. A malformed `generation_id` was raising
 * `FeedbackReactionError`, whose copy says the page named a reaction the
 * product does not have — a refusal that sends the reader to fix something
 * that is not broken, which is exactly the split `BrainEditUnchangedError`
 * exists for one class up. And a well-formed id belonging to another profile
 * reached the composite FK and came back as a raw 23503, which
 * `billing-errors.ts` has no case for and which therefore renders as
 * "Something went wrong".
 *
 * ONE BYTE-IDENTICAL MESSAGE for foreign, nonexistent and malformed ids, the
 * `ProfileAccessError` rule — sharpened here for the reason
 * `GenerationLineageError` states: a generation id is a uuidv7, so a
 * distinguishable refusal leaks creation TIME as well as existence.
 */
export class FeedbackTargetError extends Error {
  constructor() {
    super(
      "That feedback was not recorded because the output it is about is not available on this creator profile. Reopen the output from your own history and leave the feedback from there — nothing was changed."
    );
    this.name = "FeedbackTargetError";
  }
}

/** A feedback note that is blank-but-present, or past its ceiling. */
export class FeedbackNoteError extends Error {
  constructor(detail: string) {
    super(
      `That feedback was not recorded: ${detail}. The note is optional — leave it empty, or shorten what you wrote and send it again.`
    );
    this.name = "FeedbackNoteError";
  }
}

/**
 * The same reaction was already recorded about this output (slice 7, R10).
 *
 * A REFUSAL RATHER THAN A SILENT NO-OP, deliberately. `generation_feedback` is
 * append-only with a unique index on (generation, reaction), so a second press
 * could only ever be swallowed — and swallowing it would discard a note the
 * creator typed the second time while showing them a success state. Telling
 * them the reaction is already recorded is the honest version, and it is the
 * one message that does not imply their words were kept.
 */
export class FeedbackDuplicateError extends Error {
  constructor() {
    super(
      "That reaction is already recorded on this output, so nothing was changed and any note you just typed was not saved. Feedback is kept as a record of what you said the first time; choose a different reaction if you have something to add."
    );
    this.name = "FeedbackDuplicateError";
  }
}

/**
 * A private framework this profile does not own, or that does not exist
 * (slice 7, R5c).
 *
 * BYTE-IDENTICAL FOR BOTH, the `ProfileAccessError` rule again — and it covers
 * a third case for the same reason: a SHARED library row addressed as if it
 * were a private one. A distinguishable refusal there would tell any caller
 * which slugs the curated library holds before it is published.
 */
export class FrameworkAccessError extends Error {
  constructor() {
    super(
      "That framework is not available on this creator profile. Private frameworks belong to one profile, and the shared library is not edited from here."
    );
    this.name = "FrameworkAccessError";
  }
}

/**
 * An edit was submitted against a framework version that is no longer the live
 * one (slice 7, R5c).
 *
 * SEPARATE FROM `FrameworkAccessError`, for the reason `BrainEditUnchangedError`
 * is separate from `ProvenanceError`: the remedy differs. That class means "not
 * yours / not there", and reloading will not produce it; this one means "yours,
 * still there, and somebody (possibly you, in another tab) has already written
 * a newer version", where reloading is exactly the fix.
 */
export class FrameworkStaleError extends Error {
  constructor() {
    super(
      "That framework has a newer version than the one this page was showing, so nothing was written. Reload to see the current version, then make the edit again — every version is kept, so nothing was lost."
    );
    this.name = "FrameworkStaleError";
  }
}

/**
 * Framework content carried something a MECHANISM never carries (REQ-D04,
 * slice 7 R5a).
 *
 * WHAT IT ENFORCES AND WHAT IT CANNOT — stated here rather than left to be
 * assumed, because "the mechanism-level content scan" is a name that promises
 * more than any scan can deliver. It refuses four STRUCTURALLY DETECTABLE
 * classes: an @handle, a URL, a follower count or other metric value, and a
 * phrase attributing the mechanism to a named person. It cannot detect an
 * arbitrary personal name — "a devout Catholic mother in Leeds" is the
 * counterexample `brain-reason.ts`'s header already records, and the lesson
 * there was that a detector for such a thing is "a list of counterexamples
 * wearing the word class". The control for the residue is REQ-D02's HUMAN
 * curator: nothing becomes recommendable without `curator_status = 'approved'`,
 * which no writer here can set.
 */
export class FrameworkContentError extends Error {
  /**
   * `ruleId` IS THE RULE THAT REFUSED, and it exists because three revisit
   * triggers in `frameworks.ts` named an event nothing could observe
   * (learning gate, 2026-09-02). They said "the first framework refused by
   * `claim:viral`" and "the first refused for an unlisted acronym" while this
   * error carried `field` and `detail` only — so the rule that fired was not
   * merely uncounted, it was unrecorded, and no counter anybody added later
   * could have answered those questions.
   *
   * IT IS NOT A COUNTER, AND THIS DOCBLOCK MUST NOT BE READ AS ONE. Nothing
   * in this workspace logs, counts or stores a framework refusal. GREPPED
   * 2026-09-02: outside tests the name appears in exactly four places — this
   * file, the three throws in `frameworks.ts`, the re-export in
   * `packages/db/src/index.ts`, and `app/(product)/billing-errors.ts`, where
   * the only use is one row of the class-to-code map (`framework_content`).
   * The single `app/(product)/studio/frameworks/actions.ts` occurrence is a
   * COMMENT, not a read. This field is what a counter would need; the
   * triggers that depended on one are rewritten to name events a person can
   * actually see. `null` for the refusals that come from no rule (the shape
   * and bounds checks).
   *
   * IT IS AN ID, NEVER THE VALUE. The rule id is a constant in this repo, so
   * recording it can never carry creator prose — which is why a refusal LOG
   * is not the fix here and this field is.
   */
  constructor(
    readonly field: string,
    detail: string,
    readonly ruleId: string | null = null
  ) {
    super(
      `That framework was not stored: ${field} ${detail}. A framework describes a MECHANISM anyone could apply — never a person, an account, or a number somebody hit (REQ-D04). Describe what the move does and why it works, without naming who did it or how it performed.`
    );
    this.name = "FrameworkContentError";
  }
}

/** A private framework exceeded one of the closed size/count bounds. */
export class FrameworkLimitError extends Error {
  constructor(detail: string) {
    super(
      `That framework was not stored: ${detail}. Shorten it, or retire a framework you no longer use, then try again.`
    );
    this.name = "FrameworkLimitError";
  }
}

/**
 * Private frameworks are not part of this workspace's plan (REQ-D05, PRD §4G
 * "Private frameworks": Pro and Studio only).
 *
 * THE TIER IS NOT DECIDED HERE AND CANNOT BE. `@respin/db` has no access to
 * the resolved tier — its sole authority is `getWorkspaceBillingState` in
 * `@respin/credits`, which depends on this package, and a second derivation is
 * the defect class behind two M1 round-6 findings (R-30 constraint 2). The
 * write capability therefore takes an `entitlement` argument with NO DEFAULT,
 * and this is what it raises when that argument says the plan does not include
 * the feature. The db half fails closed; the tier→entitlement mapping is
 * `@respin/credits`' and is owed by whichever slice wires the screen.
 *
 * ITS COPY DOES NOT SELL AN UPGRADE, following `ModeNotInPlanError` and
 * `profile_cap`: it states what happened and what the creator can do instead.
 */
export class PrivateFrameworkTierError extends Error {
  constructor() {
    super(
      "This plan does not include private frameworks, so nothing was stored and nothing was spent. The shared framework library is available on every plan, and the frameworks it holds are the ones this product generates from."
    );
    this.name = "PrivateFrameworkTierError";
  }
}

/**
 * The interview draft named by `submitInterview` (or a second
 * `saveInterviewDraft`) has already been submitted (slice 3b, R11).
 *
 * R11 is narrow on purpose: "resuming" means picking an UNSUBMITTED draft back
 * up. Once `submitInterview` has turned the decided answers into immutable
 * `creator_authored` onboarding_inputs and brain-document versions, the draft
 * row is a read-only record of what was asked — editing it afterwards would
 * let a later edit silently disagree with the citations already written from
 * it, which is the exact "server-derived is only real in the strong sense"
 * defect `brain-content.ts`'s header describes for a different field.
 * Corrections go through the normal brain-document edit path (a new version),
 * never through rewriting the interview that produced the old one.
 */
export class InterviewDraftSubmittedError extends Error {
  constructor() {
    super(
      "This interview has already been submitted, so its answers are fixed. Resuming only ever applies to an UNSUBMITTED draft (R11) — to change something you already answered, edit the brain document it produced; that keeps a readable history instead of silently rewriting what was asked."
    );
    this.name = "InterviewDraftSubmittedError";
  }
}

/**
 * An interview answer does not fit the shape `INTERVIEW_FIELDS` declares for
 * its field — an unknown field key, a status the field does not support (e.g.
 * `declined` on a field that must be decided or not), or a `decided` answer
 * whose text is blank (R1: blank text is never silently read as a claim).
 */
export class InterviewAnswerError extends Error {
  constructor(detail: string) {
    super(
      `That interview answer was not stored: ${detail}. Every field is answered, explicitly marked not-decided, or (where the question allows it) explicitly declined — there is no fourth, implicit state.`
    );
    this.name = "InterviewAnswerError";
  }
}
