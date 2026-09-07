"use server";

// The sole `/results` write endpoint (slice 9a, R5-R8).
//
// IT CARRIES ITS OWN GATE, above its own try, because a `"use server"` module
// is a POST endpoint in its own right — invocable by its stable action id
// without `page.tsx` ever rendering. `tests/gate-completeness.test.ts` names
// this file and demands `requireUser()` here rather than trusting the page.
//
// IT DECIDES NOTHING ABOUT THE RESULT, the `pasteReferenceAction` shape.
// `recordResult` derives FIVE of the row's columns with no parameter at all —
// the evidence state (from whether numbers arrived), the three connector
// columns, the metric key and its declaring document, and the treatment key —
// and validates the rest. So this module reads the form, converts what is a
// pure wire-to-domain conversion (a date string to a `Date`), passes the two
// levers as PAIRS because the parameter type will not accept half of one, and
// forwards everything else untouched.
//
// WHAT IS DELIBERATELY NOT SENT: no evidence state, no metric key, no declared-
// metric document id, no treatment key, no workspace id. A form that could name
// any of them would be a form that could claim a result was verified, or was
// measured under a declaration it was not.
//
// WHAT IS LOGGED: ids only. The note is the creator's own words and the levers
// are numbers about their own account; neither belongs in stdout
// (`safe-log.ts`), and `logRefusal`'s `LogContext` type will not carry them.
//
// ---------------------------------------------------------------------------
// RECONCILE (slice 9a, builder C → builder A). TWO PARAMETERS OF
// `RecordResultParams` CANNOT BE SUPPLIED FROM A WIRE VALUE WITHOUT A CAST,
// and this module will not cast one.
//
//   `audienceClass: ResultAudienceClass` and `confounders?: readonly
//   ResultConfounderCode[]`
//
// Both arrive as arbitrary strings on a POST — a server action is an endpoint,
// so "the browser only offers the closed set" is a statement about the browser.
// Narrowing them HERE would either be a blind cast (CLAUDE.md 2026-08-26: the
// trusted `input_class` label, a finding that survived a whole mutation
// matrix) or a second copy of a vocabulary `@respin/db` owns and the database
// CHECKs — and an unrecognised value that reaches a CHECK is a raw 23514,
// which renders as "Something went wrong" (the registered `8c-R15` finding).
//
// So these two want `string` / `readonly string[]` in `RecordResultParams`,
// refused inside `recordResult` with `ResultInputError` naming the field —
// exactly what that capability already does for the observation window and the
// lever pairs. Until then this file does not typecheck, which is the honest
// state of a contract seam rather than a cast that hides it.
// ---------------------------------------------------------------------------
import { revalidatePath } from "next/cache";
import { requireUser } from "@respin/auth";
import { PromotionDecisionError, respinDb } from "@respin/db";
import { respinCredits } from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import {
  BILLING_ERROR_COPY,
  isBillingErrorCode,
  type BillingErrorCode,
} from "../billing-errors";
import { logRefusal } from "../safe-log";
import { scopeForUser } from "../workspace-scope";
import {
  RESULT_FIELD,
  leverField,
  type LogResultState,
} from "./log-state";
import { PROMOTION_FIELD, type PromotionActionState } from "./promotion-state";

/** A form field as a trimmed string, or `undefined` when it was left blank. */
function optional(formData: FormData, name: string): string | undefined {
  const raw = String(formData.get(name) ?? "").trim();
  return raw.length > 0 ? raw : undefined;
}

/**
 * One lever as `RecordResultParams` takes it: a PAIR or nothing.
 *
 * BOTH BLANK IS NOTHING; a half pair is forwarded to the capability with an
 * empty string for the missing half. `recordResult` remains the one authority
 * that refuses the incomplete measurement. Dropping a half pair here would
 * turn a creator's incomplete quantified result into a successful
 * unquantified result, which is a silent data change rather than a refusal.
 */
function leverPair(
  formData: FormData,
  lever: string
): { value: string; denominator: string } | undefined {
  const value = optional(formData, leverField(lever, "value"));
  const denominator = optional(formData, leverField(lever, "denominator"));
  if (value === undefined && denominator === undefined) return undefined;
  return { value: value ?? "", denominator: denominator ?? "" };
}

/**
 * An ISO day from a `<input type="date">` as a `Date`.
 *
 * A CONVERSION, NOT A VALIDATION, and the distinction is why this is allowed
 * to live here: an unparseable string becomes an Invalid Date and stays one,
 * so `recordResult` still decides what a bad window means. Doing the check
 * here as well would be the second answer this module exists to avoid.
 */
function asDate(formData: FormData, name: string): Date {
  return new Date(String(formData.get(name) ?? ""));
}

export async function logResultAction(
  profileId: string,
  _previous: LogResultState,
  formData: FormData
): Promise<LogResultState> {
  // Above the try: an unauthenticated POST is Next control flow, not a refusal
  // this form can render.
  const user = await requireUser();
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  let recorded: Awaited<ReturnType<typeof respinDb.recordResult>>;
  try {
    scope = await scopeForUser(user);
    const generationId = optional(formData, RESULT_FIELD.generationId);
    const note = optional(formData, RESULT_FIELD.note);
    // THE TWO LEVER NAMES ARE `RecordResultParams`' OWN FIELD NAMES, which is
    // what keeps them from being a third free-floating copy of the vocabulary:
    // a third lever cannot be silently omitted here, because it would arrive as
    // a new required-shaped field on that parameter type and this object would
    // stop compiling. The wire names are still built by `leverField`.
    const reach = leverPair(formData, "reach");
    const conversion = leverPair(formData, "conversion");
    // The entitlement is resolved on every POST, after authentication and
    // scope minting. It is deliberately neither a form field nor a value the
    // page cached: billing/config remain the authority when the write occurs.
    const entitlement = await respinCredits.performanceLearningEntitlementFor(
      scope.workspaceId,
      new Date()
    );
    recorded = await respinDb.recordResult(scope, profileId, {
      // OMITTED rather than sent blank when no draft was chosen: contract C4's
      // "a result with no generationId has no derivable treatment key" is a
      // real state, and `""` is not an id — it is a value something else would
      // have to interpret.
      ...(generationId !== undefined ? { generationId } : {}),
      platform: String(formData.get(RESULT_FIELD.platform) ?? ""),
      audienceClass: String(formData.get(RESULT_FIELD.audienceClass) ?? ""),
      observedFrom: asDate(formData, RESULT_FIELD.observedFrom),
      observedTo: asDate(formData, RESULT_FIELD.observedTo),
      ...(reach !== undefined ? { reach } : {}),
      ...(conversion !== undefined ? { conversion } : {}),
      // EVERY TICKED BOX, UNFILTERED. The closed set is the database's
      // (`results_confounders_closed_set`) and `recordResult`'s, so a code this
      // screen has never heard of is refused there rather than dropped here —
      // dropping it would silently narrow what a creator said about their own
      // result, and silence is the one thing a confounder flag may not be.
      confounders: formData.getAll(RESULT_FIELD.confounders).map((v) => String(v)),
      ...(note !== undefined ? { note } : {}),
    }, entitlement);
  } catch (err) {
    rethrowNextControlFlow(err);
    const logged = logRefusal("[results] result refused", err, {
      ...(scope ? { workspaceId: scope.workspaceId } : {}),
      profileId,
    });
    // THE CLAMP, NOT A CAST (the `pasteReferenceAction` precedent):
    // `logRefusal` is typed `string` and its fallback is a plain literal, so
    // `as BillingErrorCode` would erase the one check that matters and
    // `BILLING_ERROR_COPY[code]` could hand the panel `undefined` — which
    // throws on `copy.title`, on the client, on the refusal path.
    const code: BillingErrorCode = isBillingErrorCode(logged) ? logged : "unknown";
    return { status: "refused", code, copy: BILLING_ERROR_COPY[code] };
  }
  // Cache invalidation is not the mutation (the `trackNicheAction` precedent):
  // the row has committed by here, so a revalidation failure must not tell the
  // creator their result was refused.
  revalidatePath("/results");
  return {
    status: "recorded",
    resultId: recorded.id,
    // READ BACK OFF THE WRITE, never echoed from the form (see `log-state.ts`).
    // This is the sentence R6 is about: the creator finds out what label their
    // numbers really carry, and the label came from the row.
    evidenceState: recorded.evidenceState,
    joinsTreatmentGroup: recorded.treatmentKey !== null,
  };
}

async function promotionScope() {
  const user = await requireUser();
  return scopeForUser(user);
}

async function currentLearningEntitlement(scope: Awaited<ReturnType<typeof scopeForUser>>) {
  return respinCredits.performanceLearningEntitlementFor(scope.workspaceId, new Date());
}

function promotionRefusal(err: unknown): PromotionActionState {
  const logged = logRefusal("[results] proposal action refused", err);
  const code: BillingErrorCode = isBillingErrorCode(logged) ? logged : "unknown";
  return { status: "refused", code, copy: BILLING_ERROR_COPY[code] };
}

export async function refreshPromotionAction(
  profileId: string,
  previous: PromotionActionState,
  formData: FormData
): Promise<PromotionActionState> {
  void previous;
  void formData;
  try {
    const scope = await promotionScope();
    const entitlement = await currentLearningEntitlement(scope);
    const proposals = await respinDb.refreshPromotionProposals(scope, profileId, entitlement);
    revalidatePath("/results");
    return { status: "refreshed", count: proposals.length };
  } catch (err) {
    rethrowNextControlFlow(err);
    return promotionRefusal(err);
  }
}

export async function reviewPromotionAction(
  profileId: string,
  _previous: PromotionActionState,
  formData: FormData
): Promise<PromotionActionState> {
  try {
    const scope = await promotionScope();
    const review = await respinDb.promotionProposalReview(
      scope,
      profileId,
      String(formData.get(PROMOTION_FIELD.proposalId) ?? "")
    );
    return { status: "reviewed", review };
  } catch (err) {
    rethrowNextControlFlow(err);
    return promotionRefusal(err);
  }
}

export async function decidePromotionAction(
  profileId: string,
  _previous: PromotionActionState,
  formData: FormData
): Promise<PromotionActionState> {
  try {
    const scope = await promotionScope();
    const entitlement = await currentLearningEntitlement(scope);
    const decision = String(formData.get(PROMOTION_FIELD.decision) ?? "");
    if (decision !== "accept" && decision !== "reject") {
      throw new PromotionDecisionError("the decision was not one of the offered actions");
    }
    const result = await respinDb.decidePromotionProposal(scope, profileId, {
      proposalId: String(formData.get(PROMOTION_FIELD.proposalId) ?? ""),
      decision,
      freshnessToken: String(formData.get(PROMOTION_FIELD.freshnessToken) ?? ""),
      confirmedFields: JSON.parse(String(formData.get(
        decision === "accept"
          ? PROMOTION_FIELD.acceptConfirmedFields
          : PROMOTION_FIELD.rejectConfirmedFields
      ) ?? "[]")),
    }, entitlement);
    revalidatePath("/results");
    return { status: "decided", decision: result.status };
  } catch (err) {
    rethrowNextControlFlow(err);
    return promotionRefusal(err);
  }
}
