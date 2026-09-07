// The state `logResultAction` returns. Directive-free, like `paste-state.ts`,
// and it carries only settled facts: what was stored, under which evidence
// label, and — on a refusal — a stable code plus the words already resolved.
//
// IT NEVER CARRIES THE NUMBERS BACK. A refused submission's values stay in the
// browser's own form fields (the form is uncontrolled), so nothing a creator
// typed makes a second trip through the server, and nothing here can echo a
// value into a log line or a client bundle.
import type { BillingErrorCode, BillingErrorCopy } from "../billing-errors";

/**
 * THE FORM'S WIRE NAMES, as ONE list both sides import.
 *
 * `PASTE_REFUSED_FIELDS`'s precedent, and the reason is sharper here: the
 * panel writes `name="…"` and the action reads `formData.get("…")`, and a
 * rename on either side compiles, lints, renders and silently drops a
 * creator's typed number into a row that stores it as absent. A `FormData` key
 * is a string on both sides, so nothing but a shared constant makes them the
 * same string.
 *
 * IT LIVES HERE because `./actions.ts` is `"use server"` — a module that may
 * export only async functions — and `./log-panel.tsx` is `"use client"`, which
 * may reach no `@respin/*` package. This module has neither constraint and
 * both files already import it.
 */
export const RESULT_FIELD = {
  generationId: "generationId",
  platform: "platform",
  audienceClass: "audienceClass",
  observedFrom: "observedFrom",
  observedTo: "observedTo",
  /**
   * POSTED AND DELIBERATELY UNREAD. It decides which fields the form shows;
   * the stored evidence label is derived by `recordResult` from what actually
   * arrives, and `RecordResultParams` has no parameter for it. Named here so
   * "the action ignores this one" is a recorded decision rather than the same
   * shape as a typo.
   */
  evidenceIntent: "evidenceIntent",
  confounders: "confounders",
  note: "note",
} as const;

/** A lever's two wire names. One function, both readers (C4's discipline). */
export function leverField(lever: string, part: "value" | "denominator"): string {
  return part === "value" ? `${lever}Value` : `${lever}Denominator`;
}

export type LogResultState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "recorded";
      /** The row that was written, so the creator can find it in the list. */
      resultId: string;
      /**
       * THE LABEL THE ROW REALLY CARRIES, as the server stored it — never the
       * radio the browser posted.
       *
       * R6's whole point is that a creator's numbers are `quantified_self_
       * reported` and not verified, and the one place that claim is worth
       * making is the confirmation the creator reads immediately after
       * submitting. Reading it back off the write means the sentence describes
       * the row rather than the request.
       */
      evidenceState: string;
      /**
       * Whether this result can ever join a treatment group (contract C4).
       *
       * `false` for a result about no generation: there is no derivable
       * treatment key, so it is baseline-eligible and nothing else. The screen
       * says so at the moment it is stored, because that is when a creator is
       * deciding whether to log the next one the same way.
       */
      joinsTreatmentGroup: boolean;
    }>
  | Readonly<{
      status: "refused";
      code: BillingErrorCode;
      /**
       * THE WORDS, RESOLVED ON THE SERVER — `paste-state.ts`'s reason, which
       * applies here unchanged: the panel is a client module and
       * `BILLING_ERROR_COPY` lives in `../billing-errors`, which imports
       * `@respin/credits/app-server` and therefore `pg`.
       *
       * RESOLVED, NOT ENUMERATED, for the 2026-08-29 population reason: this
       * action can return any code its `catch` classifies, so a remembered
       * list in this file would be short by one the first time a new refusal
       * class reaches it. `tests/results-entry.test.tsx` states the population
       * as a LIST of modules and asserts every refusal class the result path
       * can raise resolves to copy that is not the "unknown" fallback — the
       * registered `8c-R15` finding is exactly what happens when it does not.
       */
      copy: BillingErrorCopy;
    }>;

export const IDLE_LOG_RESULT_STATE: LogResultState = { status: "idle" };
