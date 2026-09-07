// The state returned by the Trends paste-a-reference server action (slice 8c,
// R13; R-96/R-98).  Directive-free, like `spin-state.ts`, and it carries only
// settled facts: an opaque claim id, what this press charged, the balance that
// resulted, and — on a refusal — a code and at most the NAME of the field that
// was refused.  It never carries the transcript, the URL, a price, or a
// workspace id: the transcript is another creator's text and stays in the row
// it was stored in; the URL is re-rendered from the scoped reader, never
// echoed back from the form.
import type { BillingErrorCode, BillingErrorCopy } from "../billing-errors";

/**
 * The four fields the paste form has, as a CLOSED set — the same names as
 * `@respin/credits`' `PASTED_REFERENCE_INPUT_FIELDS` and the form controls'
 * `name` attributes. A refusal names one of these so the panel can point
 * `aria-describedby` at the field and move focus to it; anything else the
 * server might say about a field is clamped to "no field" rather than
 * rendered.
 */
export const PASTE_REFUSED_FIELDS = ["sourceUrl", "title", "transcript", "niche"] as const;

export type PasteRefusedField = (typeof PASTE_REFUSED_FIELDS)[number];

export function pasteRefusedField(value: unknown): PasteRefusedField | undefined {
  return typeof value === "string" &&
    (PASTE_REFUSED_FIELDS as readonly string[]).includes(value)
    ? (value as PasteRefusedField)
    : undefined;
}

/**
 * The status of the claim a paste landed on, as `@respin/db`'s intake reports
 * it (`PastedReferenceIntakeResult["claimStatus"]`).
 *
 * WRITTEN OUT RATHER THAN IMPORTED, for the same reason `copy` travels in the
 * state below: this module is imported by a `"use client"` panel, and every
 * `@respin/*` specifier a client module reaches drags `pg` into the browser
 * bundle (`tests/client-bundle-boundary.test.ts`). The set is not remembered,
 * though — `actions.ts` assigns the facade's own field into this union, so a
 * status added upstream is a RED TYPECHECK at that assignment rather than a
 * silent widening, and `PasteOutcome`'s switch is exhaustive over it.
 */
export type PasteClaimStatus = "pending" | "completed" | "failed" | "parked";

export type PasteActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "saved";
      claimId: string;
      /**
       * What THIS press charged: the active config document's
       * `creditCosts.autopsy` when this press wrote the claim's debit, and `0`
       * when it did not — because the ledger already held that debit (R-98
       * idempotency, `replayed` below) or because the document priced the paste
       * at 0.
       */
      creditsChargedNow: number;
      balanceAfter: number;
      /**
       * `true` exactly when the ledger ALREADY HELD THIS CLAIM'S
       * `autopsy_claim` DEBIT when this press ran.
       *
       * IT IS THE DEBIT'S EXISTENCE, NOT THE INTAKE'S IDEMPOTENCY, and this
       * docblock said the second thing until round 2 measured it false (billing
       * CHANGE 2). "The paste landed on an existing claim and charged nothing"
       * is wrong in both directions: a FIRST paste under a document pricing the
       * autopsy at 0 lands on no existing claim and charges nothing
       * (`replayed: false`), and a paste onto an existing claim that carries no
       * debit — minted while the price was 0 — IS charged (`replayed: false` at
       * `creditsChargedNow > 0`, same claim id). Both are witnessed in
       * `packages/credits/tests/pasted-reference.test.ts`, the layer that
       * computes it; the credits-side docblock on
       * `SubmitPastedReferenceResult.replayed` is the same sentence as this one.
       *
       * ONE CONSUMER: `paste-panel.tsx`'s `pending | failed` branch, where
       * `true` prints "Already queued — nothing charged." A `parked` or
       * `completed` claim never reads it (C6).
       */
      replayed: boolean;
      /**
       * WHAT THE CLAIM IS, because "saved" is not "queued" (code review round
       * 1, C6). A re-paste of the same link and transcript lands on the SAME
       * claim, and `parked` is terminal — `startAttempt` refuses it and the
       * system queue reader excludes it — so a panel that printed "Already
       * queued — nothing charged" was describing work that will never run, on
       * the one path a creator would repeat looking for progress. The status
       * travels so the copy can say which of the four it landed on.
       */
      claimStatus: PasteClaimStatus;
    }>
  | Readonly<{
      status: "refused";
      code: BillingErrorCode;
      /**
       * THE WORDS, RESOLVED ON THE SERVER — because the panel that renders them
       * is a client module and `BILLING_ERROR_COPY` lives in `../billing-errors`,
       * which imports `@respin/credits/app-server` and therefore `pg`. Importing
       * the map from the panel compiled and tested green and broke `next build`
       * with "Module not found: Can't resolve 'tls'" — the exact failure
       * `onboarding/run-copy.ts`'s header already records, recurring here.
       *
       * RESOLVED, NOT ENUMERATED. The alternative the repo also has a precedent
       * for (`studioRefusalCopy()`, a hand-written closed set passed as a prop)
       * is the shape CLAUDE.md's 2026-08-29 population lesson is about: this
       * action can return any `BillingErrorCode` its `catch` classifies, so a
       * remembered list would be short by one the first time a new error class
       * reaches it. The action resolves whatever code it produced through the
       * one map, so the set cannot drift and only ONE refusal's words cross the
       * wire instead of all 108.
       */
      copy: BillingErrorCopy;
      field?: PasteRefusedField;
    }>;

export const IDLE_PASTE_STATE: PasteActionState = { status: "idle" };
