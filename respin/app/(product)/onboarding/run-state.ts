// What the metered-run action hands back to its button.
//
// A DIRECTIVE-FREE MODULE, for the reason `config-form-state.ts` gives: a
// `"use server"` file may export only async functions, and a `"use client"`
// file is the wrong home for a contract the server owns.
//
// WHY THIS ACTION RETURNS A STATE WHERE ITS TWO SIBLINGS REDIRECT. The other
// onboarding actions have nothing to say beyond "it worked"; this one spends
// money, and R18 requires the screen to show what was actually charged and the
// balance that resulted. Those two numbers exist exactly once, on the value
// `runInference` returns — the operation that produced them. The alternatives
// are both worse:
//
//   - put them in the URL — the `?e=` channel is deliberately a CODE, not a
//     message, precisely so nobody can hand a creator a link that renders
//     arbitrary text as though the product said it (see ./copy.ts). A balance
//     is a stronger claim than an error string, not a weaker one.
//   - re-read them afterwards — a second read of the same authority, whose
//     disagreement with the first would be invisible. Worse, "no debit row on
//     the newest page" would have to be rendered as "it was free", which is
//     absence read as a zero.
//
// So the result travels back as a value. It is one-shot by construction: a
// refresh clears it, which is correct — the durable record is the `model_usage`
// row and the ledger entry.
//
// `/usage` RENDERS THE LEDGER ONLY. `model_usage` has no reader in `app/**` at
// all, so for the included run — which writes no ledger row — there is
// currently nothing for a creator to look at. That is a gap this slice owns
// and does not paper over; the outcome panel says what it can support.
// TYPE-ONLY, and it must stay type-only. `../billing-errors` imports
// `@respin/credits/app-server` for its instanceof table, which reaches `pg`;
// a VALUE import here would put a Postgres driver in the client bundle. A
// `import type` is erased before bundling, so it costs nothing.
import type { BillingErrorCode } from "../billing-errors";

/**
 * What the VOICE inference action hands back (slice 3).
 *
 * IT REPLACED SLICE 2a's `RunInferenceState`, which is now deleted along with
 * the connectivity ping it described (owner decision, 2026-08-29). 2a's panel
 * existed to show that money moved and rendered the vendor's reply as an
 * attributed quotation; its purpose — prove the money spine end to end — is
 * discharged and evidenced, and leaving a caller-less action behind is the
 * M2b-1 shape the finish plan exists to stop.
 *
 * WHAT THIS TYPE CARRIES IS DIFFERENT, and the difference is the reason it is
 * not a widened version of the old one: it hands the creator to the confirm
 * screen, so it carries the document's id and the size of the job in front of
 * them — and it deliberately carries NO model text at all. An inferred voice
 * rule is never rendered outside the confirm screen, where the quote that
 * grounds it is rendered beside it. A rule shown here would be a claim about a
 * person with its evidence one page away.
 *
 * `placeholders` is a COUNT OF OUR EVIDENCE, never a score of the creator. The
 * screen must render it as "N fields we could not ground", never as a ratio and
 * never as a percentage of them (task 20).
 */
export type VoiceInferenceState =
  | { status: "idle" }
  | {
      status: "ok";
      brainDocId: string;
      /** How many claim positions the creator now has to confirm. */
      claimPositions: number;
      /** How many of those hold the placeholder rather than a stated value. */
      placeholders: number;
      /** What this attempt actually cost. 0 is a real answer, not a default. */
      creditsCharged: number;
      balanceAfter: number;
      /**
       * How many of the creator's posts the inference actually read, and how
       * many they have saved — BOTH numbers, off the operation's own return
       * value, so the screen can say "read your 50 most recent; you have 200"
       * instead of implying the whole corpus was used. They were computed,
       * tested, and then DROPPED by this action before the round-2 compliance
       * residual was closed (2026-08-29) — the screen kept promising "the
       * posts you saved above" while the read was bounded.
       */
      postsUsed: number;
      postsAvailable: number;
    }
  | { status: "refused"; code: BillingErrorCode };

export const IDLE_VOICE_STATE: VoiceInferenceState = { status: "idle" };
