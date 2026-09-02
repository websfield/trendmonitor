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
export type IdeaLine = { hook: string; thesis: string; framework: string };

/** One timestamped VO beat, with the turn marked (PRD §46). */
export type BeatLine = { atSeconds: number; vo: string; isTurn: boolean };

/** One shot against the beat it covers. */
export type ShotLine = { beatIndex: number; shot: string; note: string };

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
 */
export type TraceabilityFlag = {
  kind: string;
  enforcement: "hard" | "flag";
  token: string;
  field: string;
  unit: string;
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
  unit: string;
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
   * ones surface through the refusal's `why`, and the flag-level ones — a
   * concealment sentence in the disclosure guidance among them — reached
   * nobody. A capability nothing can reach is not done, it is inventory.
   */
  claims: ClaimFlag[];
};

/** The money facts, from the operation's own return value. Never re-derived. */
export type GenerationCharge = {
  creditsChargedNow: number;
  balanceAfter: number;
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
  thesis?: { statement: string; why: string };
  framework?: { name: string; why: string };
  hooks?: HookLine[];
  ideas?: IdeaLine[];
  beats?: BeatLine[];
  shotMap?: ShotLine[];
  onScreenText?: OnScreenLine[];
  caption?: { text: string; hashtags: string[] };
  whyThisPerforms: { reasoning: string; weakestPoint: string };
  disclosure: { platform: string; guidance: string };
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
       * slice card's question-4 table) and it carries no draft, because the
       * draft that died is not shown.
       */
      status: "honest_refusal";
      generationId: string;
      modeId: string;
      modeLabel: string;
      headline: string;
      why: string[];
      sharperAngle: string;
      killTest: KillTestSummary;
      charge: GenerationCharge;
      /**
       * CARRIED ON A REFUSAL TOO, and that is not symmetry for its own sake: an
       * honest refusal is CHARGED, so the creator paid for a prompt that was
       * missing frameworks they wrote. Omitting it here would surface the fact
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
      modeId: string;
      modeLabel: string;
      outcome: string;
      weakestPoint: string | null;
      refusalReason: string | null;
      balanceAfter: number;
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
  | { status: "recorded"; generationId: string; reaction: string; noteKept: boolean }
  | { status: "refused"; code: BillingErrorCode };

export const IDLE_FEEDBACK_STATE: FeedbackState = { status: "idle" };
