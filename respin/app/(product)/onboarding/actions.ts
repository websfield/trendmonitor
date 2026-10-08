"use server";

// The THREE onboarding server actions — two from slice 1, one from slice 3.
//
// SLICE 2a's `runOnboardingInferenceAction` WAS RETIRED HERE (owner decision,
// 2026-08-29). It sent a fixed connectivity ping so a creator could watch a
// real metered call end to end; that purpose is discharged and evidenced, and
// `runVoiceInferenceAction` below takes the same control on the same screen
// and does strictly more. Keeping it would have left an action with no
// rendered caller — the M2b-1 shape the finish plan exists to stop — and put a
// developer diagnostic that spends credits on a customer's first screen.
//
// Each is a THIN wrapper: gate → scope → the packaged operation → answer.
// Nothing is decided here — the cap, the tier, the role, the pause, the price,
// the balance check and the `own_post` class all live in packages and are
// tested there, before this UI existed (skill B7).
//
// THE GATE IS ABOVE THE TRY IN ALL THREE, and every catch re-throws Next's
// control flow as its FIRST statement. Neither is optional and neither is
// style: `requireUser()` signals "no session" by THROWING a `redirect()`, so
// calling it inside a try turns an expired session into `?e=unknown` instead of
// `/sign-in` (billing round-2 CHANGE 1), and `tests/action-gate.test.ts` scans
// app/** for the second rule so that a new action cannot quietly swallow one.
//
// TWO FAILURE CHANNELS, and the split is deliberate rather than drift:
//
//   - the two slice-1 writes REDIRECT with a short CODE, because a redirecting
//     action's only way back to a server-rendered page is the URL;
//   - `runVoiceInferenceAction` RETURNS its outcome to a `useActionState`
//     button, because it spends money and R18 requires the screen to show the
//     charge and the resulting balance — two numbers that exist exactly once,
//     on the value the operation returned. The reasoning is in `./run-state.ts`,
//     and the precedent is `app/(admin)/admin/config/actions.ts`.
//
// In BOTH channels the page owns the words and the action hands over a CODE
// — never a message — so that nobody can hand a creator a link, or a reply,
// that renders arbitrary text as though the product said it
// (../billing-errors.ts).
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireUser } from "@respin/auth";
import { respinDb } from "@respin/db";
import { AssemblyError, respinCredits } from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { logRefusal, logSpend, schemaIssueFields, wireId } from "../safe-log";
import type { BillingErrorCode } from "../billing-errors";
import type { VoiceInferenceState } from "./run-state";
import type { CandidateSafetyState } from "./candidate-safety-state";
import { scopeForUser } from "../workspace-scope";

const ONBOARDING_PATH = "/onboarding";
const SAFETY_FIELD_LIMIT = 120;
const SAFETY_SPAN_LIMIT = 240;

function bounded(value: string, limit: number): {
  value: string;
  truncated: boolean;
} {
  const codePoints = [...value];
  return {
    value: codePoints.slice(0, limit).join(""),
    truncated: codePoints.length > limit,
  };
}

function failHref(err: unknown): string {
  // `logRefusal`, never a raw error object in a log call. Logging the error
  // itself prints a `DrizzleQueryError`'s bound parameters — the creator's post
  // text — on any transient database failure. Enforced by the source scan in
  // `tests/safe-log.test.ts`; see `../safe-log.ts` for the rule.
  const code = logRefusal("[onboarding-action] refused", err);
  return `${ONBOARDING_PATH}?e=${encodeURIComponent(code)}`;
}

/**
 * Create the workspace's creator profile.
 *
 * `displayName` is the ONLY field a caller supplies. `workspace_id` is derived
 * from the scope inside the capability and `state` is server-derived, so
 * neither is expressible from here — which is the requirement (R1), not a
 * property of this file: a smuggled value is stripped by `stripGuarded` in
 * `packages/db`, and `packages/db/tests/profile-scope.test.ts` proves it by
 * casting one in rather than by trusting the type.
 */
export async function createProfileAction(formData: FormData): Promise<void> {
  // THE GATE, above the try. Its refusal is a redirect, i.e. a throw.
  const user = await requireUser();
  let href = ONBOARDING_PATH;
  try {
    // Same reason as the page: an action is a POST endpoint in its own right,
    // reachable by its stable id without the page ever having rendered, so it
    // cannot assume a bootstrap that only the layout performs.
    const scope = await scopeForUser(user);
    await respinCredits.createProfile(
      scope,
      String(formData.get("displayName") ?? "")
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    href = failHref(err);
  }
  redirect(href);
}

export async function selectProfileAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  let href = ONBOARDING_PATH;
  try {
    const scope = await scopeForUser(user);
    await respinDb.selectActiveProfile(
      scope,
      String(formData.get("profileId") ?? ""),
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    href = failHref(err);
  }
  redirect(href);
}

export async function checkCandidateSafetyAction(
  displayedProfileId: string,
  _state: CandidateSafetyState,
  formData: FormData,
): Promise<CandidateSafetyState> {
  const user = await requireUser();
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    if (!displayedProfileId) return { status: "choose_profile" };

    // Pin the check to the profile the server rendered, just like every write
    // form on this page. Re-reading the mutable selection here lets another
    // tab switch A -> B between render and submit, so a draft shown beside A
    // would be checked against B. The bound id is still untrusted on the wire;
    // the scoped DB operation verifies it belongs to this workspace and
    // exposes no foreign-profile oracle. Active-only selection was already
    // enforced when the page resolved the profile it bound here.
    const result = await respinDb.checkCandidateReferenceSafety(
      scope,
      displayedProfileId,
      String(formData.get("candidate") ?? ""),
    );
    if (result.decision === "accept") return { status: "safe" };
    if (result.reason === "reference_quote_budget") {
      return {
        status: "refused",
        reason: result.reason,
        referenceInputId: null,
        field: "",
        matchedSpan: "",
        matchedSpanTruncated: false,
      };
    }
    if (!result.match) throw new Error("Invalid safety refusal shape");
    const field = bounded(result.match.pointer, SAFETY_FIELD_LIMIT);
    const span = bounded(result.match.span, SAFETY_SPAN_LIMIT);
    return {
      status: "refused",
      reason: result.reason,
      referenceInputId: bounded(result.match.inputId, 64).value,
      field: field.value,
      matchedSpan: span.value,
      matchedSpanTruncated: span.truncated,
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[onboarding-action] candidate safety check refused", err, {
      ...(scope ? { workspaceId: scope.workspaceId } : {}),
    });
    return { status: "error" };
  }
}

/**
 * Store one of the creator's own posts.
 *
 * `profileId` is a BOUND argument, not a form field. The page binds it with
 * `.bind(null, id)`, so there is no hidden input for a browser to edit — and
 * that is a convenience, never the control: a bound argument is encoded in the
 * request like any other, so the id is still untrusted input. What makes it
 * safe is `ProfileScope.mint`, which verifies the profile belongs to THIS
 * scope's workspace and refuses foreign, nonexistent and malformed ids with one
 * byte-identical message.
 *
 * There is no `input_class` field on the form and no parameter for it on the
 * operation — `own_post` is the only class this path can produce (R11).
 */
export async function addOwnPostAction(
  profileId: string,
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  let href = ONBOARDING_PATH;
  try {
    const scope = await scopeForUser(user);
    await respinDb.appendOwnPost(
      scope,
      profileId,
      String(formData.get("content") ?? ""),
      // R8's attestation, read from the form and passed on as a boolean.
      //
      // `=== "on"` IS THE WHOLE TEST, and the strictness is the point: an
      // unticked checkbox is ABSENT from a form submission entirely, so
      // `formData.get` returns `null` and this is `false`. Any truthiness test
      // here — `Boolean(...)`, `!= null` — would turn the absence into an
      // assertion, which is the exact inversion this parameter exists to make
      // impossible. `"on"` is the browser default value for a checkbox with no
      // `value` attribute, and the form deliberately does not set one.
      formData.get("attest") === "on"
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    href = failHref(err);
  }
  redirect(href);
}

/**
 * Store one reference post — someone else's work the creator admires (slice 4).
 *
 * `profileId` is a BOUND argument, exactly like `addOwnPostAction` above, and
 * for the same reason: no hidden input to tamper with, and `ProfileScope.mint`
 * is what actually refuses a foreign id.
 *
 * `sourceUrl` IS OPTIONAL, and an EMPTY submission is normalised to
 * `undefined` rather than passed on as `""` — `respinDb.appendReferencePost`'s
 * parameter is `string | undefined`, and a blank string is not a URL anybody
 * typed, it is a field left alone.
 *
 * NO `attest` FIELD IS READ HERE, unlike its sibling — R2's whole point is
 * that a reference post carries no attestation, because reusing R8's control
 * would ask the creator to confirm something false about their own submission.
 */
export async function addReferencePostAction(
  profileId: string,
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  let href = ONBOARDING_PATH;
  try {
    const scope = await scopeForUser(user);
    const rawUrl = String(formData.get("sourceUrl") ?? "").trim();
    await respinDb.appendReferencePost(
      scope,
      profileId,
      String(formData.get("referenceContent") ?? ""),
      rawUrl === "" ? undefined : rawUrl
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    href = failHref(err);
  }
  redirect(href);
}

/**
 * Slice 3 — infer a voice brain from the creator's own posts.
 *
 * A THIN WRAPPER like its two siblings, and it decides nothing. The post minimum, the
 * `own_post` filter, every money gate, the reply's fail-closed parse and the
 * brain write all live in `respinCredits.inferVoice`; this function gates the
 * session, mints the scope, and turns the outcome into a code or a value.
 *
 * IT RETURNS RATHER THAN REDIRECTS, for R18's reason: the run may cost credits,
 * and the charge and the resulting balance exist exactly once, on the value the
 * operation returned. `./run-state.ts` carries why neither the URL nor a
 * re-read can carry them honestly.
 *
 * IT DOES NOT ACTIVATE ANYTHING. What comes back is a `proposed` version's id.
 * Confirming and activating are the creator's own acts on the confirm screen —
 * a single press that inferred and activated would be the silent brain update
 * R-8 forbids, and REQ-B02 requires per-field confirmation before activation.
 */
export async function runVoiceInferenceAction(
  profileId: string
): Promise<VoiceInferenceState> {
  // Above the try, for the reason both siblings are: `requireUser()`
  // refuses by THROWING a `redirect()`, and a returning action must let that
  // throw escape rather than turn an expired session into `?e=unknown`.
  const user = await requireUser();
  // Hoisted so the refusal path can name it too — this is the id `model_usage`
  // and any debit are keyed on, so it is what answers "I was charged and got
  // nothing".
  const attemptId = randomUUID();
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const result = await respinCredits.inferVoice(scope, profileId, attemptId);
    // NO PROMPT, NO COMPLETION, NO QUOTE in the log line — `logSpend` carries
    // metering facts only, and the creator's posts are the input to this call.
    logSpend("[onboarding-action] voice inference completed", {
      workspaceId: scope.workspaceId,
      profileId: wireId(profileId),
      attemptId: wireId(attemptId),
      brainDocId: result.brainDocId,
      claimPositions: result.claimPositions,
      placeholders: result.placeholders,
      creditsCharged: result.run.creditsCharged,
      balanceAfter: result.run.balanceAfter,
      model: result.run.model,
      tokensIn: result.run.tokensIn,
      tokensOut: result.run.tokensOut,
      configVersion: result.run.configVersion,
      postsUsed: result.postsUsed,
      postsAvailable: result.postsAvailable,
    });
    return {
      status: "ok",
      brainDocId: result.brainDocId,
      claimPositions: result.claimPositions,
      placeholders: result.placeholders,
      creditsCharged: result.run.creditsCharged,
      balanceAfter: result.run.balanceAfter,
      // The corpus bound, PASSED THROUGH rather than dropped (compliance gate
      // round 2, 2026-08-29): the operation computed both numbers precisely so
      // the screen could state the bound, and this action was where they died.
      postsUsed: result.postsUsed,
      postsAvailable: result.postsAvailable,
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    const assemblyKind = err instanceof AssemblyError ? err.kind : undefined;
    return {
      status: "refused",
      code: logRefusal("[onboarding-action] voice inference refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId: wireId(profileId),
        attemptId: wireId(attemptId),
        ...(assemblyKind ? { assemblyKind } : {}),
        // WHERE a `bad_shape` happened, clamped in `schemaIssueFields` (live
        // walk, 2026-09-18). Without it the line said `assemblyKind:
        // 'bad_shape'` and nothing else, which named the class and hid the
        // cause on every occurrence — two review passes recorded the failing
        // field as unknown because this was the only place it could have been
        // written and it was not. Absent for every other kind, which have no
        // location to report.
        ...(err instanceof AssemblyError
          ? schemaIssueFields(err.schemaIssue)
          : {}),
      }) as BillingErrorCode,
      ...(assemblyKind ? { assemblyKind } : {}),
    };
  }
}
