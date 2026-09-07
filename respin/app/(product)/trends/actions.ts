"use server";

// The sole Trends write endpoint.  It accepts creator draft inputs plus an
// opaque autopsy id; @respin/credits resolves the id through the scoped DB
// reader before it prices, calls a vendor, or exposes any candidate.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@respin/auth";
import {
  respinCredits,
  type GenerateResult,
} from "@respin/credits/app-server";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { logRefusal, logSpend } from "../safe-log";
import { BILLING_ERROR_COPY, isBillingErrorCode, type BillingErrorCode } from "../billing-errors";
import { scopeForUser } from "../workspace-scope";
import { pasteRefusedField, type PasteActionState } from "./paste-state";
import { spinWithheldLocator, type SpinActionState } from "./spin-state";
import type { TrackNicheActionState } from "./track-state";

type SpinRun = NonNullable<GenerateResult["run"]>;
type UsableSpinRun = Extract<SpinRun, { status: "usable" }>;
type RefusedSpinRun = Extract<SpinRun, { status: "refused" }>;
type DisplayableSpin = Extract<SpinActionState, { status: "result" }>;

function displayableSpin(
  result: UsableSpinRun["output"]
): Pick<DisplayableSpin, "spinResult" | "weakestPoint" | "disclosureGuidance"> | null {
  // This is a projection of the parsed, similarity-gated output, not a render
  // of a reference.  It deliberately omits the model's performance rationale
  // (`whyThisPerforms.reasoning`) and carries the two honesty sections REQ-I04
  // and REQ-I05 require on every output: the weakest point and the
  // platform-specific disclosure guidance.  Every field below is one the
  // similarity gate compared against the reference (`outputTextUnits`).
  const lines = [
    result.thesis?.statement,
    ...(result.hooks?.map((hook) => hook.text) ?? []),
    ...(result.ideas?.map((idea) => idea.hook) ?? []),
    ...(result.beats?.map((beat) => beat.vo) ?? []),
    result.caption?.text,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (lines.length === 0) return null;
  return {
    spinResult: lines.join("\n"),
    weakestPoint: result.whyThisPerforms.weakestPoint,
    disclosureGuidance: result.disclosure.guidance,
  };
}

function isNearCopyRefusal(result: GenerateResult): boolean {
  return result.run?.status === "refused" && result.run.killTest.finalAttempt.hardRules.some(
    (finding) => finding.rule === "similarity"
  );
}

function withheldState(
  run: RefusedSpinRun,
  chargedCredits: number
): Extract<SpinActionState, { status: "withheld" }> {
  // WHY AND A WAY FORWARD, NEVER THE CANDIDATE (compliance gate round 1,
  // 2026-09-03).  A finding's `excerpt` and the refusal's `why` lines quote the
  // refused draft, so neither crosses to the client; the rule id, its STATIC
  // remedy (hard-rules.ts `REMEDIES`) and a REDACTED LOCATOR built from the
  // finding's `shape` and the SECTION of its `field` do.  One entry per rule,
  // in the order the pipeline reported them, carrying every distinct place that
  // rule fired — a rule that fires twice in one section says so once.
  //
  // THE LOCATOR IS WHY A WITHHELD REFUSAL IS ACTIONABLE (round 2, compliance
  // CHANGE 4).  The draft is not shown, so "this specific is in neither your
  // brain nor what you gave this generation" named a token the creator could
  // not see; "a date in a hook" names the shape and the place without quoting
  // anything.  `spinWithheldLocator` takes no excerpt, so this cannot leak one.
  const byRule = new Map<string, { rule: string; remedy: string; locators: string[] }>();
  for (const finding of run.killTest.finalAttempt.hardRules) {
    let entry = byRule.get(finding.rule);
    if (entry === undefined) {
      entry = { rule: finding.rule, remedy: finding.remedy, locators: [] };
      byRule.set(finding.rule, entry);
    }
    const locator = spinWithheldLocator(finding.shape, finding.field);
    if (locator !== null && !entry.locators.includes(locator)) entry.locators.push(locator);
  }
  const why = [...byRule.values()];
  return { status: "withheld", chargedCredits, why, sharperAngle: run.refusal.sharperAngle };
}

export async function trackNicheAction(
  profileId: string,
  _previous: TrackNicheActionState,
  formData: FormData
): Promise<TrackNicheActionState> {
  const user = await requireUser();
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    // The allowance is the ACTIVE CONFIG DOCUMENT's row for the resolved tier
    // (R-95), read by the credits facade; this screen never names a number.
    const entitlement = await respinCredits.trackedNicheEntitlementFor(
      scope.workspaceId,
      new Date()
    );
    await respinDb.trackNiche(
      scope,
      profileId,
      String(formData.get("niche") ?? ""),
      entitlement
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      status: "refused",
      code: logRefusal("[trends-track] niche refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId,
      }) as BillingErrorCode,
    };
  }
  // Cache invalidation is not the mutation. If Next rejects it, do not tell
  // the creator the already-committed niche write was refused.
  revalidatePath("/trends");
  return { status: "saved" };
}

export async function untrackNicheAction(
  profileId: string,
  _previous: TrackNicheActionState,
  formData: FormData
): Promise<TrackNicheActionState> {
  const user = await requireUser();
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    await respinDb.untrackNiche(
      scope,
      profileId,
      String(formData.get("trackedNicheId") ?? "")
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      status: "refused",
      code: logRefusal("[trends-track] removal refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId,
      }) as BillingErrorCode,
    };
  }
  revalidatePath("/trends");
  return { status: "removed" };
}

/**
 * Paste a third-party reference for a background autopsy (slice 8c, R13;
 * R-96/R-98). The credits facade owns the whole order — mint, tier, pause,
 * lock, balance, the one intake transaction, the debit — and this action hands
 * it exactly the four form fields and nothing else: no price, no workspace id,
 * no niche list. The optional two are OMITTED when blank rather than sent as
 * empty strings, because the intake's contract is `title?` / `niche?` and an
 * empty niche is not "one of the profile's tracked niches".
 *
 * WHAT IS LOGGED: ids and numbers only. The transcript is another creator's
 * text and the URL is the creator's own input; neither belongs in stdout
 * (`safe-log.ts`), and `logSpend`'s `LogContext` type will not carry them.
 */
export async function pasteReferenceAction(
  profileId: string,
  _prev: PasteActionState,
  formData: FormData
): Promise<PasteActionState> {
  const user = await requireUser();
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  let saved: Extract<PasteActionState, { status: "saved" }>;
  try {
    scope = await scopeForUser(user);
    const title = String(formData.get("title") ?? "").trim();
    const niche = String(formData.get("niche") ?? "").trim();
    const result = await respinCredits.submitPastedReference(scope, profileId, {
      sourceUrl: String(formData.get("sourceUrl") ?? ""),
      transcript: String(formData.get("transcript") ?? ""),
      ...(title.length > 0 ? { title } : {}),
      ...(niche.length > 0 ? { niche } : {}),
    });
    logSpend("[trends-paste] reference queued", {
      workspaceId: scope.workspaceId,
      profileId,
      referenceInputId: result.referenceInputId,
      itemId: result.itemId,
      claimId: result.claimId,
      claimStatus: result.claimStatus,
      creditsChargedNow: result.creditsChargedNow,
      balanceAfter: result.balanceAfter,
      configVersion: result.configVersion,
    });
    saved = {
      status: "saved",
      claimId: result.claimId,
      creditsChargedNow: result.creditsChargedNow,
      balanceAfter: result.balanceAfter,
      // R-98 IDEMPOTENCY, READ FROM THE WRITER RATHER THAN INFERRED FROM THE
      // PRICE. This was `result.creditsChargedNow === 0`, which is the same
      // boolean only while `creditCosts.autopsy` is non-zero: under a document
      // pricing it at 0 a creator's FIRST paste charges nothing and would have
      // been told "Already queued". The facade now reports whether the intake
      // landed on existing rows, which is the fact the copy claims.
      replayed: result.replayed,
      // THE COMPILE-TIME WITNESS for `PasteClaimStatus` (C6). The union is
      // written out in `paste-state.ts` because a client module may not reach
      // `@respin/db`; this assignment is what keeps it from being a REMEMBERED
      // list — a status added to `PastedReferenceIntakeResult` fails to
      // narrow here, and `PasteOutcome`'s switch fails to be exhaustive.
      claimStatus: result.claimStatus,
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    // The field NAME travels (clamped to the form's closed set); the detail,
    // which can quote the refused value, does not.
    const field = pasteRefusedField((err as { field?: unknown } | null)?.field);
    const logged = logRefusal("[trends-paste] reference refused", err, {
      ...(scope ? { workspaceId: scope.workspaceId } : {}),
      profileId,
      ...(field ? { field } : {}),
    });
    // THE CLAMP, NOT A CAST (code review round 1, C8). `logRefusal` is typed
    // `string` and its `unknown` fallback is a plain literal, so `as
    // BillingErrorCode` erased the one check that matters and
    // `BILLING_ERROR_COPY[code]` could hand the panel `undefined` — which
    // throws on `copy.title`, on the client, on the refusal path, i.e. exactly
    // when something has already gone wrong. `isBillingErrorCode` is the same
    // clamp `billingErrorFromCode` applies to a `?e=` code from the URL, and
    // it makes the copy lookup total.
    const code: BillingErrorCode = isBillingErrorCode(logged) ? logged : "unknown";
    // The WORDS are resolved here, on the server, and travel with the code —
    // see `paste-state.ts`'s `copy` docblock for why the panel cannot look
    // them up itself.
    return {
      status: "refused",
      code,
      copy: BILLING_ERROR_COPY[code],
      ...(field ? { field } : {}),
    };
  }
  // Cache invalidation is not the mutation (the `trackNicheAction` precedent):
  // the intake and its debit have committed by here, so a revalidation failure
  // must not tell the creator the paste was refused.
  revalidatePath("/trends");
  return saved;
}

export async function spinAction(
  profileId: string,
  _prev: SpinActionState,
  formData: FormData
): Promise<SpinActionState> {
  const user = await requireUser();
  const attemptId = randomUUID();
  const autopsyId = String(formData.get("autopsyId") ?? "");
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const result = await respinCredits.generate(scope, profileId, {
      mode: "analyseAndSpin",
      spinAutopsyId: autopsyId,
      attemptId,
      input: String(formData.get("input") ?? ""),
      platform: String(formData.get("platform") ?? ""),
    });
    logSpend("[trends-spin] generation completed", {
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
      rewriteCount: result.generation.rewriteCount,
    });
    if (isNearCopyRefusal(result)) {
      return { status: "near_copy_refused", chargedCredits: result.creditsChargedNow };
    }
    if (result.replayed || result.run === null) {
      return { status: "replayed", balanceAfter: result.balanceAfter };
    }
    if (result.run.status === "refused") {
      return withheldState(result.run, result.creditsChargedNow);
    }
    const spin = displayableSpin(result.run.output);
    return spin === null
      ? { status: "withheld", chargedCredits: result.creditsChargedNow, why: [], sharperAngle: null }
      : { status: "result", ...spin, chargedCredits: result.creditsChargedNow };
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      status: "refused",
      code: logRefusal("[trends-spin] generation refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId,
        attemptId,
      }) as BillingErrorCode,
    };
  }
}
