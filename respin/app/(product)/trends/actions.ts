"use server";

// The sole Trends write endpoint.  It accepts creator draft inputs plus an
// opaque autopsy id; @respin/credits resolves the id through the scoped DB
// reader before it prices, calls a vendor, or exposes any candidate.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@respin/auth";
import {
  presentedDisclosure,
  presentedTextUnits,
  respinCredits,
  type GenerateResult,
} from "@respin/credits/app-server";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { logRefusal, logSpend, wireId } from "../safe-log";
import { billingErrorCopy, isBillingErrorCode, type BillingErrorCode } from "../billing-errors";
import { scopeForUser } from "../workspace-scope";
import { summariseKillTest } from "../studio/projection";
import { pasteRefusedField, type PasteActionState } from "./paste-state";
import {
  SPIN_RESULT_EXCLUDED_FIELDS,
  spinWithheldLocator,
  type SpinActionState,
} from "./spin-state";
import type { TrackNicheActionState } from "./track-state";

type SpinRun = NonNullable<GenerateResult["run"]>;
type UsableSpinRun = Extract<SpinRun, { status: "usable" }>;
type RefusedSpinRun = Extract<SpinRun, { status: "refused" }>;
type DisplayableSpin = Extract<SpinActionState, { status: "result" }>;

function displayableSpin(
  run: UsableSpinRun
): Pick<DisplayableSpin, "spinResult" | "weakestPoint" | "disclosure" | "killTest"> | null {
  const result = run.output;
  // This is a projection of the parsed, similarity-gated output, not a render
  // of a reference, and it carries the two honesty sections REQ-I04 and
  // REQ-I05 require on every output: the weakest point and the disclosure.
  //
  // DERIVED, NOT HAND-LISTED (audit Phase 2, P2-R6). This was a five-of-ten
  // field list, so a paying Spin's framework, shot map, on-screen text,
  // hashtags and hook mechanics were gated but never shown, and a new field
  // was silently undisplayed. It is now the facade's `presentedTextUnits` —
  // `outputTextUnits` minus the model's disclosure section — minus this
  // surface's own commented exclusion (`SPIN_RESULT_EXCLUDED_FIELDS`: the
  // weakest point, which renders on its own — R-172).
  // Every unit is one the similarity gate compared against the reference,
  // because the gate reads the same `outputTextUnits`. `tests/trends-actions
  // .test.ts` asserts the rendered set equals that derivation on a document
  // carrying every section.
  //
  // THE DISCLOSURE IS A KIND, NOT THE MODEL'S SECTION (R-121, audit P1-R1).
  // The model's `disclosure.guidance` is model-authored prose about platform
  // policy; the screen renders the product's sentence for the facade's kind
  // (`DISCLOSURE_LINE`), so nothing is read off `result.disclosure` here.
  const lines = presentedTextUnits(result)
    .filter((unit) => !Object.hasOwn(SPIN_RESULT_EXCLUDED_FIELDS, unit.field))
    .map((unit) => unit.text)
    .filter((text) => text.trim().length > 0);
  if (lines.length === 0) return null;
  return {
    spinResult: lines.join("\n"),
    weakestPoint: result.whyThisPerforms.weakestPoint,
    disclosure: presentedDisclosure(),
    // THE CHECKS' FINDINGS, PROJECTED THE STUDIO WAY (audit Phase 2 gate,
    // R-172): traceability flags, the marker offers beside them, claim flags
    // and the limit note. The Spin screen stated their omission; every flag a
    // claim analysis cannot decide is now visible here too.
    killTest: summariseKillTest(run.killTest),
  };
}

function isNearCopyRefusal(result: GenerateResult): boolean {
  return result.run?.status === "refused" && result.run.killTest.finalAttempt.hardRules.some(
    (finding) => finding.rule === "similarity"
  );
}

function withheldState(
  run: RefusedSpinRun,
  chargedCredits: number,
  freeClaimRefusal: boolean
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
  return { status: "withheld", chargedCredits, freeClaimRefusal, why, sharperAngle: run.refusal.sharperAngle };
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
        profileId: wireId(profileId),
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
        profileId: wireId(profileId),
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
      profileId: wireId(profileId),
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
      profileId: wireId(profileId),
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
      copy: billingErrorCopy(code),
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
      rewriteCount: result.generation.rewriteCount,
    });
    if (isNearCopyRefusal(result)) {
      return { status: "near_copy_refused", chargedCredits: result.creditsChargedNow };
    }
    // THREE OUTCOMES, DECIDED ON `replayed` ALONE (audit P3-A2, the Studio
    // fix applied here). A replay charged nothing; `replayed: false` with
    // `run: null` is a HELD draft this press settled — it charged, and saying
    // "no new charge" over that debit was false.
    if (result.replayed) {
      return { status: "replayed", balanceAfter: result.balanceAfter };
    }
    if (result.run === null) {
      return {
        status: "settled_held",
        chargedCredits: result.creditsChargedNow,
        balanceAfter: result.balanceAfter,
        freeClaimRefusal: result.freeClaimRefusal,
      };
    }
    if (result.run.status === "refused") {
      return withheldState(result.run, result.creditsChargedNow, result.freeClaimRefusal);
    }
    const spin = displayableSpin(result.run);
    return spin === null
      ? { status: "withheld", chargedCredits: result.creditsChargedNow, freeClaimRefusal: false, why: [], sharperAngle: null }
      : { status: "result", ...spin, chargedCredits: result.creditsChargedNow };
  } catch (err) {
    rethrowNextControlFlow(err);
    const logged = logRefusal("[trends-spin] generation refused", err, {
      ...(scope ? { workspaceId: scope.workspaceId } : {}),
      profileId: wireId(profileId),
      attemptId: wireId(attemptId),
    });
    // THE WORDS TRAVEL WITH THE CODE (audit Phase 3 gate, 2026-10-06), as the
    // paste action's do. One fixed sentence ("could not be started") was
    // FALSE for a held Spin: the model answered and the draft is stored,
    // findable under Held drafts on Studio until its hold ends. The clamp is
    // the paste action's, for the same reason.
    const code: BillingErrorCode = isBillingErrorCode(logged) ? logged : "unknown";
    return { status: "refused", code, copy: billingErrorCopy(code) };
  }
}
