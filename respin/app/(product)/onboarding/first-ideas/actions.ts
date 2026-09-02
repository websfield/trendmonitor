"use server";

// PRD B04's ONE server action: run the Ideation mode on the brain the creator
// has just activated (slice 7, R5).
//
// A THIN WRAPPER, AND IT DECIDES NOTHING. It is `../../studio/actions.ts`'s
// `generateAction` with one input fixed and no revision — same operation, same
// gates, same debit, same projection. That is the point rather than a
// convenience: B04 is a real generation on the real pipeline, priced and stored
// like every other, so it must not acquire a second path with its own
// almost-right rules. Everything from the cage to the ledger lives in
// `respinCredits.generate`.
//
// THE MODE IS `ONBOARDING_FIRST_IDEAS_MODE`, A NAMED `ModeId` FROM THE FACADE,
// never the string `"ideation"` typed here. `@respin/modes` is denied to
// `app/**` (R-64), so a literal in this file would be a `string` nothing checks
// — invisible to a rename in `MODE_IDS`, and free to name a mode this build
// does not have. `assertModeAllowed` still refuses it if this plan does not
// include it or if it is not built, before any vendor is contacted.
//
// THE GATE IS ABOVE THE TRY and the catch re-throws Next's control flow first —
// `requireUser()` refuses by THROWING a `redirect()`.
import { randomUUID } from "node:crypto";
import { requireUser } from "@respin/auth";
import {
  ONBOARDING_FIRST_IDEAS_MODE,
  modeLabel,
  respinCredits,
} from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { logRefusal, logSpend } from "../../safe-log";
import type { BillingErrorCode } from "../../billing-errors";
import { scopeForUser } from "../../workspace-scope";
import { studioStateFor } from "../../studio/projection";
import type { StudioRunState } from "../../studio/run-state";

/**
 * Make this creator's first ideas.
 *
 * IT RETURNS THE SAME `StudioRunState` `/studio` RENDERS, and the screen hands
 * it to the SAME `GenerationOutcome` component. One renderer for both surfaces
 * is what makes R18 hold here without a second assertion: "why this performs
 * names the weakest point on every mode" is a property of that component, and a
 * B04 screen with its own result markup would be exactly the second place where
 * a weakest point goes missing.
 *
 * `platform` COMES OFF THE FORM like it does on `/studio`, because the
 * disclosure section is written for a platform and `assembleGenerationPrompt`
 * refuses a blank one. `input` is what the creator typed about themselves for
 * this batch; an empty one is refused there too, before anything is spent.
 *
 * `attemptId` IS MINTED PER PRESS — the idempotency key `model_usage`, the
 * `generation_attempts` claim and `credit_ledger_inference_debit_uq` all join
 * on. One press, one id, one debit.
 */
export async function firstIdeasAction(
  profileId: string,
  _prev: StudioRunState,
  formData: FormData
): Promise<StudioRunState> {
  const user = await requireUser();
  const attemptId = randomUUID();
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const result = await respinCredits.generate(scope, profileId, {
      mode: ONBOARDING_FIRST_IDEAS_MODE,
      attemptId,
      input: String(formData.get("input") ?? ""),
      platform: String(formData.get("platform") ?? ""),
    });
    // METERING FACTS ONLY — no input, no idea text. The creator's own words are
    // the input to this call and the ideas are the output; neither belongs in a
    // log line (see `../../safe-log.ts`).
    logSpend("[first-ideas-action] generation completed", {
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
    // FROM THE STORED ROW'S MODE, not from the constant above: they are equal
    // on every path this action can take, and reading the row is what keeps
    // that true if one day they are not.
    return studioStateFor(result, modeLabel(result.generation.mode));
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      status: "refused",
      code: logRefusal("[first-ideas-action] generation refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId,
        attemptId,
        // NOT CLAMPED, and it does not need to be: unlike `/studio`'s, this
        // mode is a server-side constant rather than wire input, so there is no
        // attacker-supplied string on this path to sanitise.
        mode: ONBOARDING_FIRST_IDEAS_MODE,
      }) as BillingErrorCode,
    };
  }
}
