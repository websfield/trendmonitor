// What the generation action hands back to its button.
//
// A DIRECTIVE-FREE MODULE, for the reason `../onboarding/run-state.ts` gives: a
// `"use server"` file may export only async functions, and a `"use client"`
// file is the wrong home for a contract the server owns.
//
// WHY THIS ACTION RETURNS A STATE RATHER THAN REDIRECTING. Three things exist
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
// nothing would notice. So `./actions.ts` projects, and this file is the
// projection's contract.
//
// TYPE-ONLY, and it must stay type-only. `../billing-errors` imports
// `@respin/credits/app-server` for its instanceof table, which reaches `pg`; a
// VALUE import here would put a Postgres driver in the client bundle.
import type { BillingErrorCode } from "../billing-errors";

/** One hook as the model wrote it, with the mechanic it says it is using. */
export type HookLine = { text: string; mechanic: string };

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

export type StudioRunState =
  | { status: "idle" }
  | {
      status: "usable";
      generationId: string;
      hooks: HookLine[];
      whyThisPerforms: { reasoning: string; weakestPoint: string };
      disclosure: { platform: string; guidance: string };
      killTest: KillTestSummary;
      charge: GenerationCharge;
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
      headline: string;
      why: string[];
      sharperAngle: string;
      killTest: KillTestSummary;
      charge: GenerationCharge;
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
      outcome: string;
      weakestPoint: string | null;
      refusalReason: string | null;
      balanceAfter: number;
    }
  | { status: "refused"; code: BillingErrorCode };

export const IDLE_STUDIO_STATE: StudioRunState = { status: "idle" };
