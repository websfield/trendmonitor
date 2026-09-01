"use server";

// `/studio`'s ONE server action — the generation press.
//
// A THIN WRAPPER, and it decides nothing. The cage, the role gate, the archived
// gate, the pause gate, the tier→mode map, the config and price fail-closed,
// the uncharged-attempt bound, the balance check, the run slot, the durable
// claim, the vendor sequence, the kill test, the traceability scan and the one
// atomic debit all live in `respinCredits.generate`, and every one of them is
// tested there, without HTTP, before this UI existed (skill B7).
//
// What this function does: gate the session, mint the scope, mint the attempt
// id, call the operation, and hand its result to `./projection.ts`.
//
// THE GATE IS ABOVE THE TRY and the catch re-throws Next's control flow as its
// FIRST statement. Neither is optional and neither is style: `requireUser()`
// signals "no session" by THROWING a `redirect()`, so calling it inside a try
// turns an expired session into a refusal banner instead of `/sign-in`, and
// `tests/action-gate.test.ts` scans app/** for the second rule.
//
// IT RETURNS RATHER THAN REDIRECTS, for the reason `./run-state.ts` gives: the
// draft, the charge and the balance that resulted exist exactly once, on the
// value the operation returned, and the `?e=` channel is deliberately a CODE
// and not a message.
//
// `@respin/modes` IS NOT IMPORTED HERE AND CANNOT BE (R-64). The mode arrives
// as a string off the form and leaves as a string to the facade; `modeSpec`
// refuses one that is not a mode and `assertModeAllowed` refuses one the plan
// does not include — both before any vendor is contacted, and both in the
// package that owns the map.
import { randomUUID } from "node:crypto";
import { requireUser } from "@respin/auth";
import {
  respinCredits,
  type GenerateParams,
} from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { logRefusal, logSpend, wireLabel } from "../safe-log";
import type { BillingErrorCode } from "../billing-errors";
import { scopeForUser } from "../workspace-scope";
import { studioStateFor } from "./projection";
import type { StudioRunState } from "./run-state";

/**
 * Generate a hook set for a creator profile.
 *
 * `profileId` is a BOUND argument, not a form field — the same shape every
 * other write control on these screens uses. It is a convenience and never the
 * control: a bound argument is encoded in the request like any other, so the id
 * is still untrusted input, and `mintProfileScope` inside the operation is what
 * refuses a foreign, nonexistent or malformed one with a byte-identical message.
 *
 * `attemptId` IS MINTED HERE, PER PRESS, and hoisted above the try so the
 * refusal path can name it in the log. It is the idempotency key three tables
 * join on: `model_usage`, the `generation_attempts` claim, and the ledger's
 * `credit_ledger_inference_debit_uq` debit. One press, one id, one debit.
 *
 * A STATED RESIDUAL, because minting per press is a choice with a cost: two
 * tabs, or a click that beats `SubmitButton`'s narrowing, are two attempt ids
 * and therefore two drafts and two debits. `credit_ledger_inference_debit_uq`
 * makes each of them charged exactly once, which is a different guarantee from
 * "only one of them happens". The alternative — a form-borne id reused across
 * presses — buys deduplication and pays for it by making the SECOND deliberate
 * press of an unchanged form a `GenerationAlreadyRefusedError` instead of a new
 * draft, which is the more surprising failure on a creative tool.
 */
export async function generateHooksAction(
  profileId: string,
  _prev: StudioRunState,
  formData: FormData
): Promise<StudioRunState> {
  // Above the try: `requireUser()` refuses by THROWING a `redirect()`, and a
  // returning action must let that throw escape rather than turn an expired
  // session into a refusal banner.
  const user = await requireUser();
  const attemptId = randomUUID();
  // Read once, for both paths. THIS IS WIRE INPUT, not a mode id: the browser
  // sends a fixed hidden field, but a server action is a POST endpoint and what
  // arrives is an arbitrary unbounded string. It is passed to the operation
  // as-is (the cast below explains why) and CLAMPED before it reaches a log
  // line — see `logRefusal`'s call below.
  const mode = String(formData.get("mode") ?? "");
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const params: GenerateParams = {
      // CAST, NOT VALIDATED HERE, and that is deliberate rather than lazy: the
      // set of modes lives in `@respin/modes` and the set a plan includes lives
      // in `mode-access.ts`. A membership test in `app/**` would be a second
      // copy of one of them — R18 says the authority stays where it is, "no
      // second derivation" — and it would have to be kept in step with a
      // package this tree may not even import. `modeSpec` throws
      // `UnknownModeError` for a string that is not a mode, before the plan
      // gate and long before any vendor call; both refusals have copy.
      mode: mode as GenerateParams["mode"],
      attemptId,
      input: String(formData.get("input") ?? ""),
      platform: String(formData.get("platform") ?? ""),
    };
    const result = await respinCredits.generate(scope, profileId, params);
    // METERING FACTS ONLY — no input, no draft, no hook text, no refusal prose.
    // The creator's idea is the input to this call and the draft is the output;
    // neither belongs in a log line (see `../safe-log.ts`).
    logSpend("[studio-action] generation completed", {
      workspaceId: scope.workspaceId,
      profileId,
      attemptId,
      generationId: result.generation.id,
      mode: result.generation.mode,
      outcome: result.generation.outcome,
      replayed: String(result.replayed),
      creditsChargedNow: result.creditsChargedNow,
      balanceAfter: result.balanceAfter,
      configVersion: result.configVersion,
      resolvedTier: result.resolvedTier,
      promptBundleVersion: result.generation.promptBundleVersion,
      rewriteCount: result.generation.rewriteCount,
    });
    return studioStateFor(result);
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      status: "refused",
      code: logRefusal("[studio-action] generation refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId,
        attemptId,
        // CLAMPED, because this is the one value here that did NOT come from
        // the server. `LogContext`'s contract is server-derived identifiers
        // only, and the `UnknownModeError` branch fires precisely BECAUSE the
        // string is not a mode — so the unclamped version logged the attacker's
        // exact bytes on the path most likely to receive them. `wireLabel`
        // keeps a plausible typo (`hookss`) readable and turns anything else
        // into a fixed sentinel; the operation still gets the raw value,
        // because `modeSpec` is what has to refuse it.
        mode: wireLabel(mode),
      }) as BillingErrorCode,
    };
  }
}
