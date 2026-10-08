"use server";

// THE SAVED RECORDING PACK'S TWO PRESSES (launch L4, R-153).
//
// THIN WRAPPERS, AND THEY DECIDE NOTHING — the `../actions.ts` rule. "Use this
// version" is `respinCredits.selectSavedVersion` (scope, role, pause, the
// piece's version token, and whether the generation is a usable version of
// THAT piece all live there); a revision is `respinCredits.reviseSaved`, which
// maps the preset to its note, reads the parent's mode and platform through
// the profile's scope and hands the rest to `generate` — every gate, the claim
// and the one debit at the configured revision price.
//
// THE GATE IS ABOVE THE TRY and the catch re-throws Next's control flow first
// (`tests/action-gate.test.ts`). Reopening the page is NOT an action at all:
// it is a read, and it never reaches the paid generation gate.
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireUser } from "@respin/auth";
import { respinCredits } from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import type { BillingErrorCode } from "../../billing-errors";
import { logRefusal, logSpend, wireId, wireLabel } from "../../safe-log";
import { scopeForUser } from "../../workspace-scope";
import { savedPackHref } from "../run-copy";
import type { SavedReviseState } from "../run-state";

/** Wire input that should be a positive integer, else `NaN` to be refused. */
function intField(formData: FormData, name: string): number {
  const raw = String(formData.get(name) ?? "").trim();
  return /^\d{1,6}$/.test(raw) ? Number(raw) : Number.NaN;
}

/**
 * "USE THIS VERSION" — zero cost. `attemptId` and `pieceId` are bound by the
 * page and still untrusted: the package resolves the attempt through the
 * profile's scope and refuses a generation that is not a usable version of
 * that piece, and a stale version token, with `CreativePieceError`.
 */
export async function selectSavedVersionAction(
  profileId: string,
  attemptId: string,
  pieceId: string,
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  const back = savedPackHref(attemptId);
  let target: string;
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const piece = await respinCredits.selectSavedVersion(scope, profileId, {
      attemptId,
      pieceId,
      expectedVersion: intField(formData, "version"),
    });
    logSpend("[saved-action] version selected", {
      workspaceId: scope.workspaceId,
      profileId: wireId(profileId),
      pieceId: piece.pieceId,
      pieceVersion: piece.version,
    });
    target = `${back}?selected=1`;
  } catch (err) {
    rethrowNextControlFlow(err);
    const code = logRefusal("[saved-action] version selection refused", err, {
      ...(scope ? { workspaceId: scope.workspaceId } : {}),
      profileId: wireId(profileId),
    });
    target = `${back}?e=${encodeURIComponent(code)}`;
  }
  redirect(target);
}

/**
 * ONE OF THE THREE FIXED REVISIONS of this saved version — a paid press,
 * priced as a revision and disclosed beside the buttons before it is pressed.
 *
 * `attemptId` IS MINTED HERE, PER PRESS, exactly as Studio's revise control
 * mints it (R-151 item 1's residual; R-153 and its amendment record why L4
 * keeps it): two tabs, or a second press after a lost response, are two
 * revisions, each charged once — the saved page lists this version's
 * revisions above the presses so the second press is a choice, not a blind
 * retry. The parent is the attempt id the page bound; the preset and the
 * quote's config version (`quote`) are wire input the package checks.
 */
export async function reviseSavedAction(
  profileId: string,
  parentAttemptId: string,
  prev: SavedReviseState,
  formData: FormData
): Promise<SavedReviseState> {
  void prev;
  const user = await requireUser();
  const attemptId = randomUUID();
  const preset = String(formData.get("preset") ?? "");
  // THE QUOTE'S CONFIG VERSION, a closed format: anything else is NaN, which
  // the package refuses — never "use the active price" (R-153 amendment, M1).
  const quotedConfigVersion = intField(formData, "quote");
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const result = await respinCredits.reviseSaved(scope, profileId, {
      attemptId,
      parentAttemptId,
      preset,
      quotedConfigVersion,
    });
    // METERING FACTS ONLY — no note, no draft (see `../../safe-log.ts`).
    logSpend("[saved-action] revision completed", {
      workspaceId: scope.workspaceId,
      profileId: wireId(profileId),
      attemptId: wireId(attemptId),
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
      isRevision: String(result.generation.parentId !== null),
    });
    return {
      status: "done",
      attemptId: result.attemptId,
      // "replayed" IS NOT REACHED FROM THIS PAGE while the id above is fresh
      // per press: `replayed: true` comes only from `generate`'s same-id path,
      // for an attempt id that already has a claim. The branch maps the result
      // type totally rather than assume that — on `replayed` ALONE (audit
      // P3-A2): a `run: null` with `replayed: false` is a settled held draft,
      // charged now, and is reported by the stored row's own outcome.
      outcome: result.replayed
        ? "replayed"
        : result.generation.outcome === "usable"
          ? "usable"
          : "honest_refusal",
      creditsChargedNow: result.creditsChargedNow,
      balanceAfter: result.balanceAfter,
      freeClaimRefusal: result.freeClaimRefusal,
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      status: "refused",
      code: logRefusal("[saved-action] revision refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId: wireId(profileId),
        attemptId: wireId(attemptId),
        // Wire input on the path whose refusal fires BECAUSE it was not one
        // the page offered: clamped, like Studio's mode.
        preset: wireLabel(preset),
      }) as BillingErrorCode,
    };
  }
}
