// What the Studio's two actions hand back to their buttons.
//
// A DIRECTIVE-FREE MODULE, for the reason `../onboarding/run-state.ts` gives: a
// `"use server"` file may export only async functions, and a `"use client"`
// file is the wrong home for a contract the server owns.
//
// WHY THESE ACTIONS RETURN A STATE RATHER THAN REDIRECTING. Three things exist
// exactly once, on the value `respinCredits.generate` returned: the draft, the
// charge, and the balance that resulted. The `?e=` channel is deliberately a
// CODE and not a message (see `../billing-errors.ts`), so it cannot carry a
// document; and re-reading the generation afterwards would be a second answer
// to "what did this say" that could disagree with the first.
//
// EVERY FIELD BELOW IS A PLAIN VALUE, and none of them is a type imported from
// `@respin/credits/app-server` — deliberately, and not only for the client
// bundle. `GenerateResult` carries a `Generation` row (jsonb columns typed
// `unknown`, ids, a `request` holding the creator's own input) and the whole
// `GenerationRun`. Handing that object to a client component would ship far
// more of a creator's record to the browser than the screen renders, and
// nothing would notice. So `./projection.ts` projects, and this file is the
// projection's contract.
//
// TYPE-ONLY, and it must stay type-only. `../billing-errors` imports
// `@respin/credits/app-server` for its instanceof table, which reaches `pg`; a
// VALUE import here would put a Postgres driver in the client bundle.
//
// ONE FACADE TYPE IS NAMED, and it is the exception the paragraph above
// allows rather than breaks: `PresentedDisclosure` is a one-member plain value
// (`{ kind }`), not a row or a run, and naming it is the control — the
// disclosure a screen may present has no text member, so no projection can
// put the model's disclosure prose on it (R-121, audit P1-R1).
import type { PresentedDisclosure } from "@respin/credits/app-server";
import type { BillingErrorCode } from "../billing-errors";

/** One hook as the model wrote it, with the mechanic it says it is using. */
export type HookLine = { text: string; mechanic: string };

/**
 * One idea (REQ-C01 mode 7): hook + thesis + framework, NEVER a topic.
 *
 * THE THREE FIELDS ARE THE REQUIREMENT, not a presentation choice — "ideas are
 * delivered as hook + thesis + framework, never as topics" is what makes
 * Ideation a mode rather than a brainstorm — so the projection carries all
 * three and the screen renders all three. A view that showed only the hook
 * would turn the output back into a list of topics on its way to the page.
 */
export type IdeaLine = {
  hook: string;
  thesis: string;
  framework: string;
  /**
   * A version-2 concept's form, premise and filming plan (R-148), or ABSENT
   * for a legacy idea — never an empty object. Absence is the legacy reading,
   * so a v1 idea renders exactly as it did before L1.
   */
  creative?: CreativeLine;
};

/** What a premise rests on, as stored (R-148 point 4). */
export type BasisLine =
  | { kind: "material"; excerpt: string }
  | { kind: "unconfirmed" }
  | { kind: "none" };

/** A v2 premise: what happens, why it is interesting, the payoff, its basis. */
export type PremiseLine = {
  whatHappens: string;
  interest: string;
  payoff: string;
  basis: BasisLine;
};

/** A v2 filming plan. `people` and `minutes` are closed values, not prose. */
export type FilmingLine = {
  location: FilmingItemLine;
  equipment: FilmingItemLine[];
  people: "solo" | "with_help";
  minutes: number;
};

/**
 * One place or piece of kit as the facade's `presentedFilming` presents it —
 * the model's text with `[check]` appended where the server's stored decision
 * says the creator did not list it — and whether it is unconfirmed. Never
 * re-derived here (R-148 point 3; R-150 point 2).
 */
export type FilmingItemLine = { text: string; unconfirmed: boolean };

/**
 * One v2 concept's (or a v2 script's) creative half, PROJECTED.
 *
 * `formLabel` IS RESOLVED SERVER-SIDE from the facade's `CREATIVE_FORM_OPTIONS`,
 * so the screen renders a label rather than holding a form vocabulary of its
 * own; `frameworkProvenance` travels so a custom structure is never presented
 * as a library framework.
 */
export type CreativeLine = {
  formLabel: string;
  frameworkProvenance: "offered" | "custom" | null;
  premise: PremiseLine;
  filming: FilmingLine;
};

/**
 * One timestamped VO beat, with the turn marked (PRD §46). `pivot` names the
 * pivot beat's kind on a version-2 script — a turn or a reveal (R-148) — and
 * is absent on every legacy beat.
 */
export type BeatLine = {
  atSeconds: number;
  vo: string;
  isTurn: boolean;
  pivot?: "turn" | "reveal";
};

/**
 * One shot against the beat it covers. `unconfirmed` is present on a version-2
 * line only — the server's decision that the line names kit the creator did
 * not list, read through the facade's `presentedShotMap` (R-150 point 2).
 */
export type ShotLine = { beatIndex: number; shot: string; note: string; unconfirmed?: boolean };

/** One on-screen text cue. */
export type OnScreenLine = { atSeconds: number; text: string };

/**
 * One untraceable specific, projected for display (R19).
 *
 * `enforcement` travels because R-64 split the two and the screen must not read
 * them the same way: a `hard` finding is what can refuse a draft, a `flag` is a
 * known-false-positive prompt to look. Collapsing them on screen would tell a
 * creator that their friend's first name broke a rule.
 *
 * `token` and `unit` are MODEL OUTPUT, never the creator's brain content: the
 * finding names the specific as it appears in the draft and the sentence around
 * it, which is the draft the reader is already looking at.
 *
 * `unit` IS NULL ON A REFUSED DRAFT (billing verification, 2026-10-07): that
 * draft is not shown, so its sentences are not projected either — only the
 * token and the field reach the client (`summariseKillTest`).
 */
export type TraceabilityFlag = {
  kind: string;
  enforcement: "hard" | "flag";
  token: string;
  field: string;
  unit: string | null;
};

/**
 * One claim the model made in its OWN text, projected for display
 * (REQ-I04/REQ-I05, the kill test's fifth deterministic rule).
 *
 * `family` and `enforcement` both travel, for the same reason they do on a
 * traceability flag: a `hard` finding is why a draft was refused, and a `flag`
 * is a line the creator may keep — the screen must not read them the same way.
 *
 * `token` and `unit` are MODEL OUTPUT. A flag-level claim sits in text the
 * creator is already reading, because the only hard-enforced section is
 * `whyThisPerforms` and a hard finding refuses the draft outright.
 */
export type ClaimFlag = {
  family: string;
  enforcement: "hard" | "flag";
  token: string;
  field: string;
  /** Null on a refused draft, as on `TraceabilityFlag`. */
  unit: string | null;
};

/** One verdict on a criterion the CREATOR wrote. Advisory, and labelled so. */
export type CreatorRuleVerdictLine = {
  ruleId: string;
  passed: boolean;
  note: string;
};

/** The kill test's own result, projected (REQ-C03, R7). */
export type KillTestSummary = {
  outcome: string;
  attempts: number;
  rewritten: boolean;
  creatorRulesScored: boolean;
  verdicts: CreatorRuleVerdictLine[];
  /**
   * REQ-I03's stated limit, CARRIED FROM THE OPERATION rather than written on
   * the screen. `TRACEABILITY_LIMIT_NOTE` lives in `@respin/modes` beside the
   * scan it describes and is stored on every `generations.kill_test`; a second
   * copy in `app/**` would be a sentence about a control, maintained apart from
   * the control, free to go stale the day the scan changes.
   */
  limitNote: string;
  traceability: TraceabilityFlag[];
  /**
   * REQ-I04/REQ-I05's findings, PROJECTED so they can be rendered.
   *
   * They were stored and unreachable: `runKillTest` records every performance,
   * certainty and concealment claim it finds in the model's own text, the hard
   * ones surface through the refusal's `why`, and the flag-level ones reached
   * nobody. A capability nothing can reach is not done, it is inventory.
   *
   * EXCEPT THE DISCLOSURE SECTION'S. A finding in `/disclosure/*` stays stored
   * on `generations.kill_test` and is dropped by `summariseKillTest` before it
   * reaches this list: its `unit` is the model's disclosure prose, which no
   * surface presents (R-121, audit P1-R1).
   */
  claims: ClaimFlag[];
};

/** The money facts, from the operation's own return value. Never re-derived. */
export type GenerationCharge = {
  creditsChargedNow: number;
  balanceAfter: number;
  /** R-173: `GenerateResult.freeClaimRefusal`, carried as the operation returned it. */
  freeClaimRefusal: boolean;
};

/**
 * HOW MANY OF THE CREATOR'S OWN FRAMEWORKS THIS DRAFT'S PROMPT COULD NOT CARRY
 * (R17, slice 7 cross-boundary pass 2026-09-01).
 *
 * WHY IT IS ON THE SCREEN AT ALL. `config.generation.frameworkContextCharBudget`
 * bounds how much of one prompt the framework library may occupy, and a row
 * that does not fit is simply NOT OFFERED — the model never sees it, and until
 * this field the only thing that learned about it was a server metric. The
 * curated library can no longer be evicted (the offer sorts shared-first), so
 * what is left is the half a creator can grow: they write frameworks, some do
 * not fit, the draft is charged at full price, and nothing said so.
 *
 * `null` MEANS "THIS CALL DID NOT BUILD AN OFFER", NEVER "NOTHING WAS DROPPED".
 * A replay and a retry settle a stored candidate without assembling a prompt,
 * so they have no answer to give; a zero is an answer and is rendered as one.
 * The two must not collapse, which is why this is `number | null` and not a
 * number defaulting to 0.
 *
 * A COUNT, NEVER NAMES. A private framework's name is the creator's own
 * material; this value is serialised into the browser on every press, and the
 * screen only needs to say how many.
 */
export type PrivateFrameworksNotUsed = number | null;

/**
 * THE DOCUMENT, WHATEVER MODE PRODUCED IT (slice 7, R1/R18).
 *
 * EVERY SECTION IS OPTIONAL HERE FOR THE SAME REASON IT IS OPTIONAL IN THE
 * SCHEMA: one output contract serves six modes, a caption has no shot map and a
 * hook set has no beats, and it is the MODE SPEC — not this type — that decides
 * what a given document must carry. `parseScriptOutput` has already refused
 * anything the mode did not permit before this projection is built, so an
 * absent section here means "this mode does not produce one", never "the check
 * was skipped".
 *
 * `whyThisPerforms` AND `disclosure` ARE NOT OPTIONAL, and that is R18's half
 * of the contract: they are `UNIVERSAL_SECTIONS`, every mode emits them, and
 * `whyThisPerforms.weakestPoint` is what non-negotiable 6 requires of every
 * output. Making them required here means a mode that lost its weakest point on
 * the way to the screen is a TYPE error rather than a quiet omission on the one
 * surface where "why this performs" is displayed.
 */
export type ScriptDocument = {
  /**
   * PRESENT ONLY ON A VERSION-2 DOCUMENT (R-148): what the creator asked for,
   * and — for a script — its own form, premise and filming plan. An absent
   * value is the legacy reading; the projection never invents one for a
   * document that carries no version.
   */
  creative?: {
    requestedFormLabel: string;
    script?: CreativeLine;
    /**
     * R-150 point 3: the server-authored confirmation item. The facade returns
     * it for EVERY version-2 output (the only documents with a `creative`
     * block); `null` is what it returns for a legacy one. Never model text.
     */
    eventConfirmation: string | null;
  };
  thesis?: { statement: string; why: string };
  framework?: { name: string; why: string; provenance?: "offered" | "custom" };
  hooks?: HookLine[];
  ideas?: IdeaLine[];
  beats?: BeatLine[];
  shotMap?: ShotLine[];
  onScreenText?: OnScreenLine[];
  caption?: { text: string; hashtags: string[] };
  whyThisPerforms: { reasoning: string; weakestPoint: string };
  /**
   * A KIND, NEVER PROSE (R-121, audit P1-R1). The model's disclosure section
   * is stored with the draft and is not presented: the screen renders the
   * product sentence `DISCLOSURE_LINE[kind]`. The type has no text member, so
   * a destructure, a bracket read or a pass-through of `output.disclosure`
   * into this field is a compile error rather than a render.
   */
  disclosure: PresentedDisclosure;
};

/**
 * ONE LINK IN THE LINEAGE A CREATOR CAN READ (R9).
 *
 * "WHICH OUTPUT CAME FROM WHICH, AND WHAT THE NOTE SAID" — `parentGenerationId`
 * is the first half and `note` is the second, and both are SERVER-DERIVED for
 * the entry this call produced: `parentGenerationId` is `generations.parent_id`
 * off the stored row (the composite, same-tenant, immutable-after-insert column
 * stage A built), and `note` is what the creator typed into this press.
 *
 * ---------------------------------------------------------------------------
 * THE CHAIN IS CARRIED IN THE ACTION STATE, WHICH MEANS IT ROUND-TRIPS THROUGH
 * THE BROWSER, AND THAT IS STATED RATHER THAN IMPLIED.
 *
 * `useActionState` keeps its state in the client and sends the previous value
 * back with the next call, so every entry EXCEPT the newest arrives at the
 * server as untrusted input. Two things make that acceptable and both are
 * properties, not hopes:
 *
 *  - NOTHING BRANCHES ON IT. The action reads the revision target from the
 *    FORM, and `resolveRevisionParent` resolves that attempt id through the
 *    profile's own scoped capability — so a forged entry cannot reach another
 *    creator's generation, cannot change a price, and cannot make a revision of
 *    something this profile does not own. The chain is display data.
 *  - A FORGED ENTRY IS A LIE THE READER TOLD THEMSELVES. The only content it
 *    can carry is text the same browser supplied; there is nothing here that
 *    another workspace's data could reach.
 *
 * `LINEAGE_SCOPE_NOTE` in `./run-copy.ts` is the sentence that tells the
 * creator this view is this session's while the stored `parent_id` is not.
 */
export type LineageEntry = {
  generationId: string;
  /**
   * The idempotency key this output was produced under — and the value a
   * revision of it must name (`GenerateParams.revisionOfAttemptId`).
   *
   * AN ATTEMPT ID RATHER THAN A GENERATION ID, because that is what the
   * operation takes, and it takes one for a tenancy reason worth not
   * re-deriving here: `readGenerationForAttempt` is an existing SCOPED
   * capability, so the row it returns is this creator's by construction and it
   * is the ROW'S OWN id that becomes `parent_id`. A generation id from the
   * caller would have needed a second scoped reader that does not exist.
   */
  attemptId: string;
  modeId: string;
  modeLabel: string;
  /** `null` for an original — the same value the stored row carries. */
  parentGenerationId: string | null;
  /** What the creator typed for THIS output: the idea, or the revision note. */
  note: string;
  outcome: "usable" | "honest_refusal" | "replayed";
  /**
   * Whether the revise control may offer this output as a parent.
   *
   * A COURTESY, NOT THE ENFORCEMENT — the authority is
   * `resolveRevisionParent`, which raises `RevisionParentError` with a closed
   * reason, and `settleGeneration`'s own re-read behind it. What this stops is
   * offering a creator a control whose only outcome is a refusal: an honest
   * refusal stored no draft, so `not_revisable` is certain before they press.
   */
  revisable: boolean;
};

/**
 * The document-bearing half of a finished run, whatever mode produced it.
 *
 * IT KEEPS THE SLICE-6 NAME even though slice 7 wrapped it: `StudioRunState` is
 * what the outcome renderer takes and what every state fixture in
 * `tests/studio-ui.test.tsx` is written against, and renaming it to make room
 * for the chain would have churned a suite for a spelling. The ACTION's return
 * value is `StudioActionState` below — the chain plus the latest of these.
 */
export type StudioRunState =
  | { status: "idle" }
  | {
      status: "usable";
      generationId: string;
      /**
       * The attempt id this output settled under — the saved recording pack's
       * address (`/studio/saved/<attemptId>`, launch L4). Optional because the
       * screen only LINKS with it; a state without one renders no link.
       */
      attemptId?: string;
      modeId: string;
      modeLabel: string;
      document: ScriptDocument;
      killTest: KillTestSummary;
      charge: GenerationCharge;
      privateFrameworksNotUsed: PrivateFrameworksNotUsed;
    }
  | {
      /**
       * REQ-C03: an honest refusal IS the product working — "everything died,
       * here is why, here is a sharper angle" — so it is a first-class outcome
       * beside `usable`, not a member of `refused` below. It is CHARGED (the
       * slice card's question-4 table) — UNLESS its only cause was the claim
       * scan, which is free (R-173, `charge.freeClaimRefusal`) — and it carries
       * no draft, because the draft that died is not shown.
       */
      status: "honest_refusal";
      generationId: string;
      /** The saved pack's address, as on `usable`. */
      attemptId?: string;
      modeId: string;
      modeLabel: string;
      headline: string;
      why: string[];
      sharperAngle: string;
      killTest: KillTestSummary;
      charge: GenerationCharge;
      /**
       * CARRIED ON A REFUSAL TOO, and that is not symmetry for its own sake: an
       * honest refusal is usually CHARGED (R-173's free claim refusal aside),
       * so the creator paid for a prompt that was missing frameworks they wrote. Omitting it here would surface the fact
       * only when the draft came out well.
       */
      privateFrameworksNotUsed: PrivateFrameworksNotUsed;
    }
  | {
      /**
       * R14c's replay: this attempt id had already settled, so no vendor was
       * called and nothing was charged by THIS press.
       *
       * IT DOES NOT RE-RENDER THE STORED DOCUMENT. `generations.output` is
       * jsonb typed `unknown`, and parsing it here would be a second parser for
       * a contract `parseScriptOutput` already owns — free to disagree with it.
       * What is shown is what the ROW says in its own typed columns: the
       * outcome and, for a usable one, the weakest point.
       */
      status: "replayed";
      generationId: string;
      /**
       * The saved pack's address (launch L4): a replay does not re-render the
       * stored document here, it links to the page that reads it back.
       */
      attemptId?: string;
      modeId: string;
      modeLabel: string;
      outcome: string;
      weakestPoint: string | null;
      refusalReason: string | null;
      balanceAfter: number;
      /** R-173: the stored refusal was a free claim refusal, never paid for. */
      freeClaimRefusal: boolean;
    }
  | {
      /**
       * A HELD DRAFT FINISHED BY THIS PRESS (audit P3-A2, R-157) — the third
       * outcome `GenerateResult` documents: `replayed: false`, `run: null`.
       * No model was called by this press, AND this press took the debit: the
       * draft the model had already written was stored and charged now. It is
       * NOT a replay, which charges nothing, and saying "nothing extra was
       * spent" here was false on every charged settle.
       *
       * Like a replay it shows the stored row's own typed columns, not the
       * jsonb document — and it links to the saved pack.
       */
      status: "settled_held";
      generationId: string;
      attemptId: string;
      modeId: string;
      modeLabel: string;
      outcome: string;
      weakestPoint: string | null;
      refusalReason: string | null;
      charge: GenerationCharge;
    }
  | { status: "refused"; code: BillingErrorCode };

/**
 * The generate action's whole return value: what just happened, plus the chain.
 *
 * THE CHAIN SURVIVES A REFUSAL, deliberately. A creator whose second press was
 * refused for want of credits must not also lose the list of what they already
 * ran — the refusal is about the press, not about the drafts before it.
 */
export type StudioActionState = {
  lineage: LineageEntry[];
  latest: StudioRunState;
};

export const IDLE_STUDIO_STATE: StudioActionState = {
  lineage: [],
  latest: { status: "idle" },
};

/**
 * The feedback action's return value (R10/R12).
 *
 * A SEPARATE `useActionState` FROM THE GENERATION'S, because they are separate
 * acts with separate refusals: a feedback refusal must not clear the draft a
 * creator is reading, and a generation must not clear the record that their
 * last reaction was stored.
 *
 * `noteKept` IS ITS OWN FIELD AND IS NOT DERIVABLE from "was a note sent": the
 * capability refuses a blank-but-present note outright, so the two answers a
 * creator needs are "the reaction landed" and "your words landed with it", and
 * a screen that inferred the second from the first would tell somebody their
 * note was stored when the row's `note` column is NULL.
 */
export type FeedbackState =
  | { status: "idle" }
  | {
      status: "recorded";
      generationId: string;
      reaction: string;
      noteKept: boolean;
      /**
       * The stored row's id (audit P6-A1, R-174): what "Leave this out of
       * future drafts" posts. Optional only so a pre-change fixture still
       * types; the action always sets it, and the control is not offered
       * without it.
       */
      feedbackId?: string;
    }
  | { status: "refused"; code: BillingErrorCode };

/**
 * "LEAVE THIS OUT OF FUTURE DRAFTS" (audit P6-A1, R-174) — what the press left
 * behind. `excluded` names the reaction it stamped; it carries no creator text.
 */
export type ExcludeState =
  | { status: "idle" }
  | { status: "excluded"; feedbackId: string }
  | { status: "refused"; code: BillingErrorCode };

export const IDLE_EXCLUDE_STATE: ExcludeState = { status: "idle" };

export const IDLE_FEEDBACK_STATE: FeedbackState = { status: "idle" };

/**
 * "REMEMBER THIS FOR FUTURE DRAFTS" (launch L3, R-152) — what the one press
 * left behind. `proposed` names the Kill Test VERSION it wrote, which is a
 * proposal and nothing more: the screen says it is not in force until the
 * creator confirms and activates it on the Brain page. `already_held` is the
 * press that wrote NOTHING because that version already holds the same rule
 * (L3 gate, C-L1), and `active` says whether that version is the active one.
 * Neither carries creator text — the words are in the version, where `/brain`
 * shows them.
 *
 * `refused` CARRIES THE TYPED TEXT BACK, and only to the browser that sent it
 * (L3 gate, D-L3): React 19 resets an uncontrolled form after its action, so
 * without it a refusal wiped the rule the creator had just written. `attempt`
 * counts consecutive refusals so the panel can key the form on it and remount
 * the textarea with the text as its default value, even when two refusals in a
 * row carry the same words.
 */
export type RememberState =
  | { status: "idle" }
  | { status: "proposed"; version: number }
  | { status: "already_held"; version: number; active: boolean }
  | { status: "refused"; code: BillingErrorCode; text: string; attempt: number };

export const IDLE_REMEMBER_STATE: RememberState = { status: "idle" };

// ------------------------------------------------------------------------
// LAUNCH L4 (R-153): THE SAVED RECORDING PACK — plain values only.

/** One version of a piece, as the saved page lists it. */
export type SavedVersionLine = {
  attemptId: string;
  createdAt: string;
  outcome: "usable" | "honest_refusal";
  isSelected: boolean;
  isThis: boolean;
  parentAttemptId: string | null;
};

/**
 * ONE STORED VERSION, PROJECTED for the saved page, the copied script and the
 * Markdown export — all three read this value and nothing else, so a phone, a
 * desktop and a pasted script show the same stored version.
 *
 * `document` is `null` for an honest refusal (no draft was stored), and its
 * `disclosure` is a kind, as on every `ScriptDocument`; the PRODUCT's
 * sentence for it travels as `disclosureGuidance`, never the model's. `checks` is `null`
 * when the stored checks could not be read — said on screen, never shown as an
 * empty list.
 */
export type SavedPackView = {
  attemptId: string;
  modeLabel: string;
  createdAt: string;
  platform: string;
  outcome: "usable" | "honest_refusal";
  document: ScriptDocument | null;
  checks: KillTestSummary | null;
  refusal: {
    headline: string | null;
    sharperAngle: string | null;
    hardRules: { rule: string; field: string; excerpt: null; remedy: string }[];
  } | null;
  weakestPoint: string | null;
  disclosureGuidance: string;
  lineage: {
    parent: { attemptId: string; modeLabel: string } | null;
    source: { attemptId: string; ideaIndex: number } | null;
  };
  piece: {
    pieceId: string;
    version: number;
    isSelected: boolean;
    selectable: boolean;
    selectedAttemptId: string | null;
    versions: SavedVersionLine[];
    versionsTruncated: boolean;
  } | null;
  /**
   * What a Spin or a source reel was made from (R-153 amendment A2), or null
   * for every other mode. `spin.summary` is null when the reference is not
   * available here; `source.checkedAgainst` says which text the stored copy
   * check compared this version with.
   */
  reference:
    | {
        kind: "spin";
        summary: { source: "YouTube" | "Submitted"; title: string; mechanismSummary: string } | null;
      }
    | {
        kind: "source";
        text: string | null;
        truncated: boolean;
        checkedAgainst: "source" | "revised_draft";
      }
    | null;
  /** This version's own direct revisions, newest first (R-153 amendment, M2). */
  revisions: { attemptId: string; createdAt: string; outcome: "usable" | "honest_refusal" }[];
  revisionsTruncated: boolean;
  /**
   * A stored HARD-rule finding pointed into the model's disclosure and is not
   * shown (R-153 amendment A6) — the page says so instead of going silent.
   */
  disclosureAdviceWithheld: boolean;
  revision: {
    revisable: boolean;
    blocked: "honest_refusal" | "reference_unavailable" | "source_to_reel" | null;
    credits: number | null;
    /** The config version `credits` was read under; the press sends it back. */
    quoteConfigVersion: number | null;
    inPlan: boolean | null;
  };
};

/**
 * What one saved-page revision press left behind. `done` names the new
 * version's attempt id (its own saved page) and the money facts the operation
 * returned; `refused` is a code, never prose.
 */
export type SavedReviseState =
  | { status: "idle" }
  | {
      status: "done";
      attemptId: string;
      outcome: "usable" | "honest_refusal" | "replayed";
      creditsChargedNow: number;
      balanceAfter: number;
      /** R-173: the operation's `freeClaimRefusal`. */
      freeClaimRefusal: boolean;
    }
  | { status: "refused"; code: BillingErrorCode };

export const IDLE_SAVED_REVISE_STATE: SavedReviseState = { status: "idle" };
