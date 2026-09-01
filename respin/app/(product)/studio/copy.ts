// The decisions `/studio` makes, as PURE functions, plus the closed set of
// refusals this surface may render.
//
// The rule this file obeys is `../onboarding/copy.ts`'s: "decisions live in
// pure functions, not in page bodies". A page needs a session and a database
// and no test in this repo executes one, so an inline ternary in a server
// component is a decision nothing can assert.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE DELIBERATELY DOES NOT CONTAIN: A SECOND TIER→MODE DERIVATION.
//
// R18's authority is `TIER_MODES` / `assertModeAllowed` in
// `packages/credits/src/mode-access.ts`, and it stays there. This screen offers
// the ONE mode that has a pipeline (`hooks`), submits its id, and renders the
// refusal if the server says the plan does not include it. It does not know
// which modes any tier includes, does not enumerate the other six, and must not
// start to: a screen-side copy of that map is a second answer that goes stale
// the day slice 7 changes the first. `tests/studio-ui.test.tsx` asserts the
// absence by scanning this directory's source for the other mode ids.
import {
  BILLING_ERROR_COPY,
  type BillingErrorCode,
  type BillingErrorCopy,
} from "../billing-errors";

// THE MODE ID, THE MODE NOTE AND THE PLATFORM LIST LIVE IN `./run-copy.ts`,
// not here, and the reason is a real build failure this repo has already had
// once: this module imports `../billing-errors` for its refusal table, which
// imports `@respin/credits/app-server`, which reaches `pg`. The client panel
// needs all three values, so importing them from here would put a Postgres
// driver in the client bundle — `next build` then fails naming `dns` rather
// than the import. `tests/client-bundle-boundary.test.ts` caught exactly that
// on the first draft of this screen; `run-copy.ts` has no imports at all and
// therefore cannot cross the boundary.

/**
 * Whether the generate control may be offered at all.
 *
 * A COURTESY, NEVER THE ENFORCEMENT — the same relationship `capReached` has to
 * `ProfileCapError`. A server action is a POST endpoint reachable without this
 * page ever rendering, so the real gates are `InferenceRoleError`,
 * `WorkspacePausedError`, `ProfileArchivedError` and `BrainNotActivatedError`
 * inside `respinCredits.generate`. If this function and those gates ever
 * disagree, the gates are right.
 */
export function generateBlock(params: {
  isViewer: boolean;
  paused: boolean;
  brainActivated: boolean;
}): { reason: string } | null {
  if (params.isViewer) {
    return {
      reason:
        "You have viewer access to this workspace. Generating spends the workspace's credits, so it needs at least editor access. Ask a workspace owner.",
    };
  }
  if (params.paused) {
    return {
      reason:
        "This workspace's subscription is paused, so credits are frozen and nothing that would spend them runs. Everything already saved is untouched. Resume on the billing page.",
    };
  }
  if (!params.brainActivated) {
    return {
      reason:
        "This creator has no activated brain yet, so there is nothing to write in their voice. Confirm a version on the brain page and activate it, then come back.",
    };
  }
  return null;
}

// ------------------------------------------------- the refusals THIS screen
//
// A CLOSED SET, for the reason `../onboarding/copy.ts` records: the page feeds
// a `?e=` code from the URL, and `billingErrorFromCode` maps ANY of the shared
// codes to copy — so an arbitrary `?e=` would render another surface's product
// copy here. A code outside this set falls back to `unknown`'s neutral words,
// never to nothing and never to a stranger's sentence.
//
// AND IT IS DERIVED, NOT REMEMBERED. `tests/studio-ui.test.tsx` reads the
// classes constructed by every file on this screen's spend path — the
// population is stated there as a LIST, and adding a file to it is what a new
// spend path costs (CLAUDE.md, 2026-08-29). The list below is what that scan
// demands plus the four classes named in `ALSO_REACHABLE` beside it.

export const STUDIO_ERROR_CODES = [
  // --- the generation path's own refusals (slice 6).
  "brain_not_activated",
  "mode_not_in_plan",
  "mode_not_built_yet",
  "unknown_mode",
  "generation_assembly",
  "generation_unusable",
  "kill_test_failed",
  "no_creator_rules",
  "generation_in_flight",
  "generation_already_refused",
  "generation_payload_mismatch",
  "generation_recovery_required",
  "generation_attempt_state",
  "generation_uncharged_attempt_cap",
  // --- the money and gate order this operation shares with `runInference`.
  "inference_role",
  "profile_archived",
  "workspace_paused",
  "insufficient_credits",
  "topup_in_flight",
  "autotopup_shortfall",
  "debit_refused_after_call",
  "unpriced_operation",
  "config_not_migrated",
  "config_unavailable",
  "ledger_integrity",
  "clock_skew",
  "run_slot_busy",
  "server_at_capacity",
  // --- the vendor's three faces. All three are reachable and they say
  // different things about money: one where nothing was billed, one where the
  // vendor billed us and the creator is not charged, and one that is an
  // operator's dial rather than anybody's remedy.
  "llm_unavailable",
  "llm_attempt_recorded",
  "llm_truncated",
  // OVER-CAPTURE, KEPT DELIBERATELY. `inference.ts` is in the derived
  // population as a whole file (it holds `priceOf`, `recordUsage`,
  // `withDeadline` and the gate order this operation reuses), so its
  // `UnchargedAttemptCapError` is demanded here even though `generate` raises
  // the generation-specific `GenerationUnchargedAttemptCapError` instead. The
  // over-capture direction is the safe one — it asks for MORE copy, never less
  // — and narrowing the population to dodge it is how a real refusal goes
  // missing.
  "uncharged_attempt_cap",
  // --- the cage, and the scope read this page performs before anything else.
  "scope_forgery",
  "workspace_access",
  "profile_access",
  "unknown",
] as const satisfies readonly BillingErrorCode[];

/**
 * Copy whose SHARED wording is honest on `/onboarding` and false here.
 *
 * THE FALSE CLAUSE THEY MOSTLY SHARE IS "your included build/run". D-M2-2 gives
 * one free brain build per profile; `priceOf` prices a GENERATION by its mode
 * every time (`packages/credits/src/inference.ts`), so there is no included
 * generation to use up or to have left. Telling a creator on this screen that
 * "your included run is still there" is a promise of a free draft that does not
 * exist.
 *
 * THE SECOND FALSE CLAUSE IS SHARPER AND IT IS ABOUT PRIVACY, NOT MONEY. The
 * two vendor-failure copies say "this attempt sends a fixed message of ours,
 * never anything you wrote". That was written for slice 2a's connectivity ping
 * and it is TRUE there. On this screen the request carries the creator's own
 * input and their activated brain — so the shared sentence would tell someone
 * whose writing had just been sent to a model provider that nothing of theirs
 * had been sent at all.
 *
 * ---------------------------------------------------------------------------
 * THIS SET WAS BUILT BY HAND AND MISSED TWO (learning honesty gate, 2026-09-01).
 *
 * `run_slot_busy` and `server_at_capacity` are both in `STUDIO_ERROR_CODES`,
 * both reachable — `generate.ts` raises `RunSlotBusyError` — and both shared
 * details said "your included build was not used", which is the exact false
 * free-draft promise this block exists to remove. They survived because the
 * test that keeps this block honest iterated a HAND-WRITTEN LIST of six codes
 * and could not see a seventh: CLAUDE.md's 2026-08-29 population lesson
 * recurring inside the fix for that lesson.
 *
 * SO THE SCAN IS NOW DERIVED FROM `STUDIO_ERROR_CODES` ITSELF, in
 * `tests/studio-ui.test.tsx` — every code this screen can render is checked for
 * every false-on-this-screen clause, and adding a code to the closed set is
 * what forces the audit. A list that has to be remembered is a list that will
 * be short by one.
 */
const STUDIO_OVERRIDES: Partial<Record<BillingErrorCode, BillingErrorCopy>> = {
  insufficient_credits: {
    title: "Not enough credits for this draft",
    detail:
      "This was refused before anything was called, so nothing was spent and nothing of yours was sent anywhere. A hook set is priced every time — there is no included draft. Buy a credit pack from Billing, or turn on auto-top-up so credits are bought automatically next time; the press that triggers it is still refused, so try again once they land.",
  },
  topup_in_flight: {
    title: "Not enough credits yet — a top-up is on its way",
    detail:
      "This was refused before anything was called, so nothing was spent and nothing of yours was sent anywhere. A top-up has been started and credits land when your bank settles it. Try again once your balance updates; if it does not, buy a pack from Billing rather than waiting.",
  },
  llm_unavailable: {
    title: "The model provider did not answer",
    detail:
      "Nothing was taken from your credit balance. This is almost always brief — try again in a minute. Your draft request did leave this server, so if you would rather it had not, there is nothing further to do: no draft was stored and no charge was made.",
  },
  llm_attempt_recorded: {
    title: "The model answered, but not usably",
    detail:
      "The provider returned something this product could not use, and it charged us for the attempt. Nothing was taken from your credit balance — our parse failure is not your bill. No draft was stored. Try again, and tell us if it keeps happening; rewording your input is unlikely to be the fix.",
  },
  llm_truncated: {
    title: "The model's answer was cut off",
    detail:
      "The answer came back longer than this server's reply-length limit allows, so nothing usable arrived and nothing was stored. Nothing was taken from your credit balance. This is a server setting rather than anything you did, and trying again will hit the same limit until an operator raises it — so tell us rather than retrying.",
  },
  workspace_paused: {
    title: "This workspace is paused",
    detail:
      "While a pause is on, credits are frozen and nothing that would spend them runs — including generating. Nothing was charged and nothing was lost: your credits, your brain and every draft you already have are exactly where you left them. Resume from the billing page and this becomes available again.",
  },
  uncharged_attempt_cap: {
    // Its shared copy says "your included build is untouched", which is a
    // sentence about the onboarding brain. This code is over-captured here
    // (see the list above) and its copy must still be true if it ever renders.
    title: "Runs for this creator keep failing on our side",
    detail:
      "Runs for this creator have repeatedly failed in a way that cost us money and cost you nothing, so the product has stopped trying rather than keep burning them. Nothing was spent and no model was called this time. There is nothing for you to change — this is a fault on our side; please tell us so we can fix it.",
  },
  run_slot_busy: {
    // THE TWO THE HAND-WRITTEN LIST MISSED. `generate.ts` raises
    // `RunSlotBusyError` on this screen's spend path, and the shared detail
    // promised "your included build was not used" — a free draft that does not
    // exist here. The rest of the shared copy is kept almost verbatim,
    // INCLUDING its refusal to name an upgrade: `billing-errors.ts` records
    // that `concurrencyLimits` gives Free and Creator the same 2, so "upgrade
    // for more" would take money for something the reader cannot use.
    title: "This creator already has as many drafts running as your plan allows",
    detail:
      "Nothing was spent and no model was called — this was refused before any of that. Your plan allows a set number of model calls at the same time for one creator; wait for one of the drafts already running to finish, then try again.",
  },
  server_at_capacity: {
    title: "We are at capacity right now",
    detail:
      "This is us, not you, and not your plan: the server is already running as many model calls as it allows at once. Nothing was spent and no model was called. Try again in a moment.",
  },
};

/**
 * The copy `/studio` renders for a `?e=` code — closed set, overrides applied.
 *
 * AN UNRECOGNISED CODE FALLS BACK TO `unknown`, it does not vanish: returning
 * `null` made the failure mode silent on `/onboarding` (compliance gate,
 * 2026-08-27), and a refused spend that renders no explanation leaves the
 * creator unable to tell a refusal from a hang.
 */
export function studioErrorFor(raw: string | undefined): BillingErrorCopy | null {
  if (!raw) return null;
  const known = (STUDIO_ERROR_CODES as readonly string[]).includes(raw);
  const code = (known ? raw : "unknown") as BillingErrorCode;
  return STUDIO_OVERRIDES[code] ?? BILLING_ERROR_COPY[code];
}

/** Every code this screen can render, with its words. Resolved server-side. */
export function studioRefusalCopy(): Record<string, BillingErrorCopy> {
  return Object.fromEntries(
    STUDIO_ERROR_CODES.map((code) => [code, studioErrorFor(code)!])
  );
}
