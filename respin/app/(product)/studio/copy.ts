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
// `packages/credits/src/mode-access.ts`, and slice 7 did NOT move it here. The
// screen now offers six modes rather than one, and the list it offers is
// `modeOffers(tier)` — the same two authorities `assertModeAllowed` reads,
// resolved server-side in the package that owns them and handed to the view as
// data. This directory still does not know which modes any tier includes, still
// names no mode id in code, and must not start to: a screen-side copy of that
// map is a second answer that goes stale the day the first one changes.
// `tests/studio-ui.test.tsx` asserts the absence by scanning this directory's
// source for EVERY mode id — a strictly wider ban than slice 6's, which
// exempted `hooks` because the screen submitted it as a hidden field. The
// picker's options are server-resolved, so no file here needs to name one.
import {
  billingErrorCopy,
  withSupportContactFor,
  type BillingErrorCode,
  type BillingErrorCopy,
} from "../billing-errors";
import {
  CREATIVE_FORM_OPTIONS,
  type CreativePieceView,
} from "@respin/credits/app-server";
import type { PieceView } from "./piece-confirmation";

/**
 * The confirmation's plain projection of a piece (launch L2). Field by field —
 * never a spread of the facade's value — and the form id becomes a LABEL from
 * the facade's own list, so this directory holds no form vocabulary. The quote
 * carries only what the screen states: the configured price, its config
 * version, and whether the plan includes the script.
 */
export function pieceViewFor(view: CreativePieceView): PieceView {
  const source = view.origin;
  let origin: PieceView["origin"];
  if (source.kind === "concept") {
    const formId = source.formId;
    origin = {
      kind: "concept",
      hook: source.hook,
      thesis: source.thesis,
      framework: source.framework,
      formId,
      formLabel:
        formId === null
          ? null
          : (CREATIVE_FORM_OPTIONS.find((o) => o.id === formId)?.label ?? formId),
      premise:
        source.premise === null
          ? null
          : {
              whatHappens: source.premise.whatHappens,
              interest: source.premise.interest,
              payoff: source.premise.payoff,
            },
    };
  } else {
    origin = { kind: "own_idea", idea: source.idea };
  }
  return {
    pieceId: view.pieceId,
    version: view.version,
    state: view.state,
    operationAttemptId: view.operationAttemptId,
    origin,
    quote: {
      credits: view.quote.credits,
      configVersion: view.quote.configVersion,
      planIncludesScript: view.quote.planIncludesScript,
    },
  };
}

// THE PLATFORM LIST AND EVERY SENTENCE THE CLIENT PANEL RENDERS LIVE IN
// `./run-copy.ts`, not here — and the mode ids live in NEITHER, because
// `modeOffers(tier)` resolves them on the server (see the block above). The
// reason for the split is a real build failure this repo has already had
// once: this module imports `../billing-errors` for its refusal table, which
// imports `@respin/credits/app-server`, which reaches `pg`. The client panel
// needs all three values, so importing them from here would put a Postgres
// driver in the client bundle — `next build` then fails naming `dns` rather
// than the import. `tests/client-bundle-boundary.test.ts` caught exactly that
// on the first draft of this screen; `run-copy.ts` has no value imports (one
// erased `import type`) and therefore cannot cross the boundary.

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
  brainActivated: boolean | null;
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
  if (params.brainActivated === null) {
    return { reason: "The brain's state could not be read. Reload this page." };
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
  // The money-denominated twin (billing gate, 2026-09-04) — same screen, same
  // spend path, so it needs its own copy here or it renders the neutral
  // fallback on the one screen that spends a creator's credits.
  "generation_uncharged_cost_cap",
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
  "topup_reconciliation_required",
  // A SECOND OVER-CAPTURE, KEPT FOR THE SAME REASON AND FOUND THE SAME WAY
  // (slice 7). `mode-access.ts` is in the derived population as a whole file
  // because it holds the plan gate this operation runs, so its
  // `UnknownEntitlementTierError` is demanded here — even though `generate`
  // never calls `privateFrameworkEntitlement`, which is the only thing that
  // raises it. The over-capture direction asks for MORE copy, never less, and
  // narrowing the population to dodge it is how a real refusal goes missing.
  //
  // ITS OWN SCREEN IS `/studio/frameworks`, whose closed set names it too and
  // where it is genuinely reachable.
  "unknown_entitlement_tier",
  // --- SLICE 7: THE REVISION (R6/R8). Five codes for one class, because
  // `RevisionParentError` carries a closed `reason` and its four values are
  // four different true sentences — see `billing-errors.ts`'s own block. The
  // neutral `revision_parent` is the fallback for a reason this build does not
  // know, and `generation_lineage` is @respin/db's AUTHORITY refusal, raised
  // inside the settlement transaction rather than before the vendor call.
  "revision_parent",
  "revision_parent_not_yours",
  "revision_parent_not_revisable",
  "revision_parent_different_mode",
  "revision_parent_unreadable",
  "generation_lineage",
  // --- R-148 (launch L1): THE CREATIVE FORM CONTROL. `generate` raises
  // `CreativeRequestError` before any claim or provider call; two codes because
  // a revision of a pre-form draft is not a malformed request.
  "creative_request",
  "creative_revision_legacy",
  // --- LAUNCH L2 (R-151): entry, selection and operation identity. Every one
  // is raised before any claim, debit or provider call. The revision-form
  // code is `CreativeRequestError`'s new instance branch; the five piece codes
  // are `CreativePieceError`'s four reasons and its fallback; the transport
  // refusal is reachable from the provider factory every generate press runs.
  "creative_revision_form",
  "creative_piece",
  "creative_piece_not_found",
  "creative_piece_source",
  "creative_piece_stale",
  "creative_piece_not_commissionable",
  "generation_quote_changed",
  "concept_context_needed",
  "llm_transport_refused",
  // --- AUDIT PHASE 3 (R-157, R-158). The input ceiling's refusal, one code per
  // largest part (NOT `input_too_large_posts`: that is the onboarding caller's
  // branch, reached only with no recorded parts, and `meteredCall` always
  // records them); the per-window total; and the held draft — its three
  // reasons and "Finish this draft" naming an attempt this creator cannot
  // finish. Every one is raised before any debit, and a held one charges
  // nothing.
  "input_too_large",
  "input_too_large_voice",
  "input_too_large_strategy",
  "input_too_large_killtest",
  "input_too_large_frameworks",
  "input_too_large_input",
  "generation_window_cost_cap",
  "generation_held_paused",
  "generation_held_balance",
  "generation_held_transient",
  "held_draft_unavailable",
  // --- LAUNCH L4 (R-153): the saved recording pack's revision presses render
  // this screen's copy set; the one refusal of their own is a preset the page
  // never offered (`RevisionPresetError`, before any claim or provider call).
  "revision_preset",
  // --- SLICE 7: THE FEEDBACK EVENT (R10). A DIFFERENT ACTION on the same
  // screen, and its refusals belong to this closed set for exactly the reason
  // the generation's do: `recordFeedbackAction` returns a code, the panel
  // renders `refusalCopy[code]`, and a code with no entry here falls back to
  // `unknown`'s neutral words on a control the creator just pressed.
  //
  // FEEDBACK SPENDS NOTHING, which is why none of these four is in the money
  // group above — and why the copy for them says what was NOT changed rather
  // than what was not charged.
  "feedback_reaction",
  "feedback_target",
  "feedback_note",
  "feedback_duplicate",
  // Audit P6-A1 (R-174): "Leave this out of future drafts", the fourth
  // action on this screen. Spends nothing, like the reaction it narrows.
  "feedback_exclusion_target",
  // --- LAUNCH L3 (R-152): "REMEMBER THIS FOR FUTURE DRAFTS". A third action on
  // this screen, composing the creator-edit path `/brain` uses — so its
  // refusals are that path's, and each needs copy here or the press renders
  // the neutral fallback. The first six are what `tests/studio-ui.test.tsx`
  // derives from `feedback-ops.ts` and `brain-ops.ts`; the last five are the
  // creator-edit write's own capability refusals (its `ALSO_REACHABLE` list).
  // None of them spends anything.
  "brain_edit_unchanged",
  "brain_edit_busy",
  "brain_edit_limit",
  "brain-edit-all-check",
  "provenance",
  "evidence_unreadable",
  "profile_role",
  "reference_echo",
  "brain_version_limit",
  "brain_document_limit",
  "onboarding_input_limit",
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
  // LAUNCH L3 (R-152): on THIS screen these two codes come only from
  // "Remember this for future drafts", and the shared wording is about a brain
  // BUILD ("try the build again") or a whole-form edit — neither of which the
  // creator did here.
  provenance: {
    title: "That rule could not be added here",
    detail:
      "Your Kill Test changed after this page loaded, it has no rule list yet, or it already holds as many rules as one version can. Nothing was saved and no credits were spent. Open the Brain page, check your Kill Test, and add the rule there.",
  },
  brain_edit_unchanged: {
    title: "There was nothing to remember",
    detail:
      "The box was empty or held only [check], so no proposed rule was created and nothing was saved. Write the rule in your own words and try again.",
  },
  insufficient_credits: {
    title: "Not enough credits for this draft",
    detail:
      "This was refused before anything was called, so nothing was spent and nothing of yours was sent anywhere. Every draft is priced every time, whichever mode makes it — there is no included draft. Buy a credit pack from Billing, or turn on auto-top-up so credits are bought automatically next time; the press that triggers it is still refused, so try again once they land.",
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
      "The provider returned something this product could not use, and it charged us for the attempt. Nothing was taken from your credit balance — our parse failure is not your bill. No draft was stored. Try again; rewording your input is unlikely to be the fix.",
  },
  llm_truncated: {
    title: "The model's answer was cut off",
    detail:
      "The answer came back longer than this server's reply-length limit allows, so nothing usable arrived and nothing was stored. Nothing was taken from your credit balance. This is a server setting rather than anything you did, and trying again will hit the same limit until an operator raises it, so retrying will not help; the refusal is recorded for an operator.",
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
      "Runs for this creator have repeatedly failed in a way that cost us money and cost you nothing, so the product has stopped trying rather than keep burning them. Nothing was spent and no model was called this time. There is nothing for you to change: this is a fault on our side, and it is recorded for an operator.",
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
  const override = STUDIO_OVERRIDES[code];
  return override === undefined ? billingErrorCopy(code) : withSupportContactFor(code, override);
}

/** Every code this screen can render, with its words. Resolved server-side. */
export function studioRefusalCopy(): Record<string, BillingErrorCopy> {
  return Object.fromEntries(
    STUDIO_ERROR_CODES.map((code) => [code, studioErrorFor(code)!])
  );
}
