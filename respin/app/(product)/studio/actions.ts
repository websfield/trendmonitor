"use server";

// `/studio`'s server actions — the generation press, the feedback press, the
// launch-L2 entry/selection presses and (launch L3) "Remember this".
//
// THIN WRAPPERS, AND THEY DECIDE NOTHING. The cage, the role gate, the archived
// gate, the pause gate, the tier→mode map, the revision's parent resolution and
// its price, the config and price fail-closed, the uncharged-attempt bound, the
// balance check, the run slot, the durable claim, the vendor sequence, the kill
// test, the traceability scan and the one atomic debit all live in
// `respinCredits.generate`; the closed reaction set, the note's blank/length
// rules and the composite same-tenant foreign key all live in
// `respinDb.recordFeedback`. Every one of them is tested there, without HTTP,
// before this UI existed (skill B7).
//
// What these functions do: gate the session, mint the scope, mint the attempt
// id, call the operation, and hand its result to `./projection.ts`.
//
// THE GATE IS ABOVE THE TRY and the catch re-throws Next's control flow as its
// FIRST statement. Neither is optional and neither is style: `requireUser()`
// signals "no session" by THROWING a `redirect()`, so calling it inside a try
// turns an expired session into a refusal banner instead of `/sign-in`, and
// `tests/action-gate.test.ts` scans app/** for the second rule.
//
// THEY RETURN RATHER THAN REDIRECT, for the reason `./run-state.ts` gives: the
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
import { redirect } from "next/navigation";
import { requireUser } from "@respin/auth";
import {
  modeLabel,
  respinCredits,
  type GenerateParams,
} from "@respin/credits/app-server";
import { BRAIN_EDIT_VALUE_MAX, respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { logRefusal, logSpend, wireId, wireLabel } from "../safe-log";
import type { BillingErrorCode } from "../billing-errors";
import { scopeForUser } from "../workspace-scope";
import { studioActionStateFor } from "./projection";
import type {
  ExcludeState,
  FeedbackState,
  RememberState,
  StudioActionState,
} from "./run-state";

/**
 * Generate for a creator profile — an original, or a revision of an earlier
 * output of theirs (slice 7, R1/R6/R8).
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
 *
 * THE REVISION TARGET COMES OFF THE FORM AND IS NOT TRUSTED. It is an ATTEMPT
 * id, which `resolveRevisionParent` reads through the profile's own scoped
 * write capability — so a foreign, deleted or invented one comes back
 * `undefined` and is refused with `RevisionParentError` BEFORE the vendor is
 * contacted, and the id that reaches `generations.parent_id` is the row's own.
 * Nothing here checks it, and nothing here may: a membership test in `app/**`
 * over the lineage the browser carried back would be a second answer to a
 * question the cage already owns.
 */
export async function generateAction(
  profileId: string,
  prev: StudioActionState,
  formData: FormData
): Promise<StudioActionState> {
  // Above the try: `requireUser()` refuses by THROWING a `redirect()`, and a
  // returning action must let that throw escape rather than turn an expired
  // session into a refusal banner.
  const user = await requireUser();
  const attemptId = randomUUID();
  // Read once, for both paths. THIS IS WIRE INPUT, not a mode id: the browser
  // sends the id of an option the server rendered, but a server action is a
  // POST endpoint and what arrives is an arbitrary unbounded string. It is
  // passed to the operation as-is (the cast below explains why) and CLAMPED
  // before it reaches a log line — see `logRefusal`'s call below.
  const mode = String(formData.get("mode") ?? "");
  const input = String(formData.get("input") ?? "");
  // EMPTY MEANS "AN ORIGINAL", and the coercion is deliberate: `<select>` and a
  // hidden field both submit `""` for "no parent", and `GenerateParams` uses
  // `undefined` for it. Passing `""` through would name an attempt id that
  // cannot exist and turn every original into a `RevisionParentError`.
  const revisionOf = String(formData.get("revisionOf") ?? "");
  // R-148: THE CREATIVE FORM CONTROL, read only when the form sent one. ABSENT
  // MEANS "no creative request" (a mode without the control, or a revision that
  // keeps its parent's form); PRESENT IS WIRE INPUT, passed through as-is for
  // `parseCreativeRequest` to refuse — no membership test here, for the reason
  // the mode is not tested here: the closed set lives in the package that owns
  // it, and a second copy in `app/**` is a second vocabulary.
  const formChoice = formData.get("formChoice");
  const creative =
    formChoice === null ? undefined : creativeFromForm(String(formChoice), formData);
  // LAUNCH L3 (R-152 item c): THE SEQUEL REQUEST IS THE CHECKBOX AND NOTHING
  // ELSE — exactly the value the box submits, never inferred from the input.
  // Absent or anything else means "not a sequel"; `generate` refuses a sequel
  // on a mode that reads no history.
  const sequel = formData.get("sequel") === "1";
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
      input,
      platform: String(formData.get("platform") ?? ""),
      ...(revisionOf === "" ? {} : { revisionOfAttemptId: revisionOf }),
      ...(creative === undefined ? {} : { creative }),
      ...(sequel ? { sequel: true } : {}),
    };
    const result = await respinCredits.generate(scope, profileId, params);
    // METERING FACTS ONLY — no input, no draft, no hook text, no refusal prose.
    // The creator's idea is the input to this call and the draft is the output;
    // neither belongs in a log line (see `../safe-log.ts`).
    logSpend("[studio-action] generation completed", {
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
      // R6/R9: whether this press produced a revision, and of which stored row.
      // A server-derived id off the settled row, never the posted attempt id —
      // the two are equal only when the parent resolved.
      isRevision: String(result.generation.parentId !== null),
    });
    // THE LABEL IS RESOLVED FROM THE STORED ROW'S MODE, never from `mode` above:
    // that string is what the browser posted and may be anything at all, and
    // `modeLabel` falls back to the raw id — so labelling from it would print an
    // attacker's bytes on the creator's own screen.
    return studioActionStateFor(
      prev,
      result,
      modeLabel(result.generation.mode),
      input
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      // THE CHAIN SURVIVES THE REFUSAL. A creator whose fourth press was
      // refused for want of credits must not also lose the three drafts they
      // already have on screen — the refusal is about this press, not about
      // the work before it.
      lineage: prev.lineage,
      latest: {
        status: "refused",
        code: logRefusal("[studio-action] generation refused", err, {
          ...(scope ? { workspaceId: scope.workspaceId } : {}),
          profileId: wireId(profileId),
          attemptId: wireId(attemptId),
          // CLAMPED, because this is the one value here that did NOT come from
          // the server. `LogContext`'s contract is server-derived identifiers
          // only, and the `UnknownModeError` branch fires precisely BECAUSE the
          // string is not a mode — so the unclamped version logged the
          // attacker's exact bytes on the path most likely to receive them.
          // `wireLabel` keeps a plausible typo (`hookss`) readable and turns
          // anything else into a fixed sentinel; the operation still gets the
          // raw value, because `modeSpec` is what has to refuse it.
          mode: wireLabel(mode),
          // R-148: the form choice is wire input on the same footing, and a
          // `CreativeRequestError` fires precisely because it was not one the
          // server offered — so it is clamped like the mode. The filming
          // limits are the creator's own words and are never logged at all.
          ...(formChoice === null ? {} : { formChoice: wireLabel(String(formChoice)) }),
        }) as BillingErrorCode,
      },
    };
  }
}

/**
 * "FINISH THIS DRAFT" (audit P3-A4, R-157) — settle one HELD draft by its
 * attempt id.
 *
 * NOT A RESUBMISSION OF GENERATE PARAMS. Every surface but a commission mints
 * a fresh attempt id per press, so pressing "Make a draft" again can never
 * reach a held draft; and a same-id `generate` must reproduce the original
 * intent, which this page does not hold. This posts the held attempt's id and
 * nothing else, and `respinCredits.settleHeldAttempt` reads the claim through
 * the profile's own scope (a foreign or unknown id is refused, one message for
 * both), then settles through the one settlement path: one debit, the 24-hour
 * bound under the claim row's lock, and a pause or short balance that holds it
 * again rather than destroying it.
 *
 * The attempt id is WIRE INPUT: logged only through `wireId`.
 */
export async function resumeHeldDraftAction(
  profileId: string,
  prev: StudioActionState,
  formData: FormData
): Promise<StudioActionState> {
  const user = await requireUser();
  const attemptId = String(formData.get("heldAttemptId") ?? "");
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const result = await respinCredits.settleHeldAttempt(scope, profileId, attemptId);
    logSpend("[studio-action] held draft finished", {
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
    });
    // No note: the held draft's request is the stored row's, not this press's.
    return studioActionStateFor(prev, result, modeLabel(result.generation.mode), "");
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      lineage: prev.lineage,
      latest: {
        status: "refused",
        code: logRefusal("[studio-action] held draft not finished", err, {
          ...(scope ? { workspaceId: scope.workspaceId } : {}),
          profileId: wireId(profileId),
          attemptId: wireId(attemptId),
        }) as BillingErrorCode,
      },
    };
  }
}

// ------------------------------------------------------------------------
// LAUNCH L2 (R-151): ENTRY, SELECTION AND OPERATION IDENTITY.
//
// Five more thin wrappers, and they decide nothing either: the concept's
// validity (the stored output parsed under its own version), the piece's scope
// and version token, the server-minted operation id, the quote, the plan gate,
// the same-id claim lookup and the one debit all live in `@respin/credits`.
// Three of them REDIRECT to the piece's own URL (`/studio?piece=<id>`), which is
// what makes the selection, its operation id and its quote survive a reload: the
// page re-reads them from the database rather than from client state.

/** The piece's own page. The id is server-minted; encoded anyway. */
function piecePath(pieceId: string): string {
  return `/studio?piece=${encodeURIComponent(pieceId)}`;
}

/** A refusal code on the Studio page's `?e=` channel (a CODE, never prose). */
function refusedPath(code: string): string {
  return `/studio?e=${encodeURIComponent(code)}`;
}

/** Wire input that should be a non-negative integer, else `NaN` to be refused. */
function intField(formData: FormData, name: string): number {
  const raw = String(formData.get(name) ?? "").trim();
  return /^\d{1,6}$/.test(raw) ? Number(raw) : Number.NaN;
}

/**
 * "FIND MY NEXT CONCEPT" — an ideation with no starting concept (launch L2).
 *
 * A generation like `generateAction`'s and through the same one door, so every
 * gate runs: the plan, the pause, the cap, the balance, the slot, the claim.
 * The creator's optional hint is `input`; with none, the approved brain is the
 * only material, and an unready brain is one short question
 * (`ConceptContextInsufficientError`) with no model call. The attempt id is
 * minted per press, as `generateAction` mints it (its stated residual).
 */
export async function findConceptAction(
  profileId: string,
  prev: StudioActionState,
  formData: FormData
): Promise<StudioActionState> {
  const user = await requireUser();
  const attemptId = randomUUID();
  const hint = String(formData.get("hint") ?? "");
  const formChoice = formData.get("formChoice");
  const creative =
    formChoice === null ? undefined : creativeFromForm(String(formChoice), formData);
  // LAUNCH L4 (the L3 card's BN-2): the sequel request, exactly as
  // `generateAction` reads it — the checkbox's own value and nothing else.
  const sequel = formData.get("sequel") === "1";
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const result = await respinCredits.findConcept(scope, profileId, {
      attemptId,
      hint,
      platform: String(formData.get("platform") ?? ""),
      ...(creative === undefined ? {} : { creative }),
      ...(sequel ? { sequel: true } : {}),
    });
    logSpend("[studio-action] find-concept completed", {
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
      isRevision: "false",
    });
    return studioActionStateFor(prev, result, modeLabel(result.generation.mode), hint);
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      lineage: prev.lineage,
      latest: {
        status: "refused",
        code: logRefusal("[studio-action] find-concept refused", err, {
          ...(scope ? { workspaceId: scope.workspaceId } : {}),
          profileId: wireId(profileId),
          attemptId: wireId(attemptId),
          ...(formChoice === null ? {} : { formChoice: wireLabel(String(formChoice)) }),
        }) as BillingErrorCode,
      },
    };
  }
}

/**
 * CHOOSE A STORED CONCEPT — zero cost (launch L2). The source is the ATTEMPT
 * id of a concept batch this creator produced and the concept's position in it;
 * both are wire input, and `selectConcept` resolves the attempt through the
 * profile's own scope and validates the position against the stored, versioned,
 * parsed output. No text from the browser stands in for the concept.
 */
export async function selectConceptAction(
  profileId: string,
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  let target: string;
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const view = await respinCredits.selectConcept(scope, profileId, {
      sourceAttemptId: String(formData.get("sourceAttemptId") ?? ""),
      ideaIndex: intField(formData, "ideaIndex"),
    });
    target = piecePath(view.pieceId);
  } catch (err) {
    rethrowNextControlFlow(err);
    target = refusedPath(
      logRefusal("[studio-action] concept selection refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId: wireId(profileId),
      })
    );
  }
  redirect(target);
}

/** DEVELOP AN IDEA I ALREADY HAVE — the creator's words, stored verbatim. Zero cost. */
export async function startOwnIdeaAction(
  profileId: string,
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  let target: string;
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const view = await respinCredits.startOwnIdea(scope, profileId, {
      idea: String(formData.get("idea") ?? ""),
    });
    target = piecePath(view.pieceId);
  } catch (err) {
    rethrowNextControlFlow(err);
    target = refusedPath(
      logRefusal("[studio-action] own idea refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId: wireId(profileId),
      })
    );
  }
  redirect(target);
}

/**
 * COMMISSION THE PIECE'S SCRIPT — the confirmation's one paid press (launch L2).
 *
 * THE OPERATION ID COMES OFF THE FORM, AND IT IS THE SERVER'S: the
 * confirmation renders the id the piece holds (minted by the database), so a
 * duplicate submit, a refresh and a resubmit after a lost response all send the
 * SAME id. `generate` looks that id's claim up FIRST — a settled one replays
 * with no gate, no debit and no provider call — and refuses a new operation
 * under any id the piece does not currently offer (`CreativePieceError`,
 * `stale`). "New generation" is the only way to another id.
 */
export async function commissionPieceAction(
  profileId: string,
  pieceId: string,
  prev: StudioActionState,
  formData: FormData
): Promise<StudioActionState> {
  const user = await requireUser();
  const attemptId = String(formData.get("operationId") ?? "");
  const note = String(formData.get("input") ?? "");
  const formChoice = formData.get("formChoice");
  const creative =
    formChoice === null ? undefined : creativeFromForm(String(formChoice), formData);
  // LAUNCH L4 (BN-2): the sequel request, as `generateAction` reads it — part
  // of the operation's client intent when true (R-152 item c).
  const sequel = formData.get("sequel") === "1";
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const result = await respinCredits.commissionPiece(scope, profileId, {
      attemptId,
      pieceId,
      note,
      platform: String(formData.get("platform") ?? ""),
      ...(creative === undefined ? {} : { creative }),
      ...(sequel ? { sequel: true } : {}),
    });
    logSpend("[studio-action] piece commission completed", {
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
      isRevision: "false",
    });
    return studioActionStateFor(prev, result, modeLabel(result.generation.mode), note);
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      lineage: prev.lineage,
      latest: {
        status: "refused",
        code: logRefusal("[studio-action] piece commission refused", err, {
          ...(scope ? { workspaceId: scope.workspaceId } : {}),
          profileId: wireId(profileId),
          // The posted id is wire input, clamped to an ID shape (`wireId`):
          // `wireLabel` needs a letter first and would erase every uuidv7.
          attemptId: wireId(attemptId),
          ...(formChoice === null ? {} : { formChoice: wireLabel(String(formChoice)) }),
        }) as BillingErrorCode,
      },
    };
  }
}

/** "NEW GENERATION": another operation id for this piece, even for identical text. */
export async function newGenerationAction(
  profileId: string,
  pieceId: string,
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  let target: string;
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    await respinCredits.renewCreativeOperation(scope, profileId, {
      pieceId,
      expectedVersion: intField(formData, "version"),
    });
    target = piecePath(pieceId);
  } catch (err) {
    rethrowNextControlFlow(err);
    target = refusedPath(
      logRefusal("[studio-action] new generation refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId: wireId(profileId),
      })
    );
  }
  redirect(target);
}

/** BACK OUT of a piece with no script yet. Zero cost. */
export async function cancelPieceAction(
  profileId: string,
  pieceId: string,
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  let target: string;
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    await respinCredits.cancelCreativeWork(scope, profileId, {
      pieceId,
      expectedVersion: intField(formData, "version"),
    });
    // `?cancelled=1` renders a status line that takes focus (WCAG 2.4.3):
    // without it the cancel press leaves focus on `<body>`.
    target = "/studio?cancelled=1";
  } catch (err) {
    rethrowNextControlFlow(err);
    target = refusedPath(
      logRefusal("[studio-action] piece cancel refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId: wireId(profileId),
      })
    );
  }
  redirect(target);
}

/**
 * The creative half as the browser sent it — SHAPED, NEVER JUDGED.
 *
 * THE ONLY DECISIONS HERE ARE ABOUT THE FORM'S OWN WIDGETS: an empty box means
 * "not declared", and a comma-separated box is a list. Whether a value is
 * acceptable — a known form, a whole number of minutes in range, an item short
 * enough — is `parseCreativeRequest`'s answer inside the operation, before any
 * spend, and a number that does not parse is passed on as `NaN` precisely so
 * that it is REFUSED there rather than quietly dropped here.
 */
function creativeFromForm(
  formChoice: string,
  formData: FormData
): NonNullable<GenerateParams["creative"]> {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  // SPLIT ONLY: trimming each entry and dropping the blank ones is
  // `parseCreativeRequest`'s normalisation, in one place, so "a, , b" means the
  // same thing however it arrives. An empty box splits to `[""]`, which the
  // parse reads as no entries.
  const list = (name: string) => text(name).split(/[,\n]/);
  const people = text("people");
  const minutes = text("maxMinutes");
  const footage = text("footage");
  return {
    // CAST, for the reason the mode is cast above.
    formChoice: formChoice as NonNullable<GenerateParams["creative"]>["formChoice"],
    constraints: {
      people:
        people === ""
          ? null
          : (people as NonNullable<
              NonNullable<GenerateParams["creative"]>["constraints"]
            >["people"]),
      // DIGITS ONLY become a number. `Number()` alone would read "0x10" as 16
      // and "1e2" as 100 — values the number field never sends — so anything
      // that is not plain digits becomes `NaN` and the operation refuses it.
      maxMinutes: minutes === "" ? null : /^\d{1,6}$/.test(minutes) ? Number(minutes) : NaN,
      locations: list("locations"),
      equipment: list("equipment"),
      footage: footage === "" ? null : footage,
    },
  };
}

/**
 * Record one structured reaction to one of this creator's outputs (R10/R12).
 *
 * NOT A SPEND. No credit moves, no model is called, and the copy this action's
 * states resolve to says so — a reaction is a stored fact about a draft the
 * creator already paid for.
 *
 * NOTHING IS DERIVED FROM IT, HERE OR ANYWHERE IN THIS SLICE (R11). This
 * function writes one row and returns what it wrote; it does not count, group,
 * summarise or propose, and `tests/feedback-readers.test.ts` is the scan that
 * keeps that true across the repo — `packages/brain` is the sole construction
 * site for a promotion proposal (R-10/R-44) and it does not exist yet.
 *
 * `generationId` COMES OFF THE FORM AND IS UNTRUSTED, exactly like the revision
 * target above. The composite foreign key `(generation_id, profile_id,
 * workspace_id) → generations(id, profile_id, workspace_id)` is what proves the
 * output is this creator's, and `FeedbackTargetError` is the byte-identical
 * refusal for a foreign, missing or malformed one — so this function performs
 * no ownership test of its own and must not grow one.
 *
 * THE REACTION IS PASSED THROUGH AS A STRING. The closed set lives in the
 * database (`generation_feedback_reaction`) and its application-code half is
 * `GENERATION_FEEDBACK_REACTIONS`, which the page renders its buttons from; the
 * capability refuses an unknown code by name (`FeedbackReactionError`) rather
 * than letting a raw enum 22P02 surface. A membership test here would be a
 * third copy of that set.
 */
export async function recordFeedbackAction(
  profileId: string,
  prev: FeedbackState,
  formData: FormData
): Promise<FeedbackState> {
  void prev;
  const user = await requireUser();
  const generationId = String(formData.get("generationId") ?? "");
  const reaction = String(formData.get("reaction") ?? "");
  // A NOTE THAT IS ONLY WHITESPACE IS "NO NOTE", NOT AN EMPTY NOTE, and this is
  // the one place the difference can be handled without lying to anybody. The
  // capability refuses a blank-but-present note (`FeedbackNoteError`) because
  // `generation_feedback_note_says_something` refuses one at the database, and
  // a textarea a creator tabbed through returns `"\n"` — so sending it would
  // refuse the whole reaction over a note they did not think they wrote. What
  // this must NOT do is trim a note that has content: the column stores the
  // creator's words with only `normaliseContent`'s line-ending and Unicode-form
  // normalisation, and `feedbackNoteLimit` tells them so.
  const rawNote = String(formData.get("note") ?? "");
  const note = rawNote.trim().length === 0 ? undefined : rawNote;
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const row = await respinDb.recordFeedback(scope, profileId, {
      generationId,
      // CAST FOR THE SAME REASON THE MODE IS CAST: the closed set is the
      // database's and the capability is what refuses a value outside it.
      reaction: reaction as Parameters<
        typeof respinDb.recordFeedback
      >[2]["reaction"],
      ...(note === undefined ? {} : { note }),
    });
    // NO CREATOR CONTENT. The reaction is a closed code and the ids are
    // server-derived; the note is the creator's own words and never leaves the
    // database (see `../safe-log.ts`).
    logSpend("[studio-action] feedback recorded", {
      workspaceId: scope.workspaceId,
      profileId: wireId(profileId),
      generationId: row.generationId,
      feedbackId: row.id,
      reaction: row.reaction,
      // THE ROW'S OWN COLUMN decides this, not the parameter: the creator is
      // told whether their words were STORED, and the stored value is the only
      // thing that can answer that.
      noteKept: String(row.note !== null),
    });
    return {
      status: "recorded",
      generationId: row.generationId,
      reaction: row.reaction,
      noteKept: row.note !== null,
      feedbackId: row.id,
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      status: "refused",
      code: logRefusal("[studio-action] feedback refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId: wireId(profileId),
        // CLAMPED, like the mode above and for the same reason: both of these
        // are wire input on a path whose refusals fire precisely BECAUSE the
        // value was not one the server offered.
        reaction: wireLabel(reaction),
      }) as BillingErrorCode,
    };
  }
}

/**
 * "LEAVE THIS OUT OF FUTURE DRAFTS" (audit P6-A1, R-174).
 *
 * `feedbackId` COMES OFF THE FORM AND IS UNTRUSTED, like `generationId` in
 * the action above: the capability resolves it through the profile scope and
 * refuses a foreign, missing or malformed id with one byte-identical
 * `FeedbackExclusionTargetError`, so this function performs no ownership test
 * of its own. It writes one timestamp and returns; nothing is derived (R11)
 * and no brain changes (R-8).
 */
export async function excludeFeedbackFromHistoryAction(
  profileId: string,
  prev: ExcludeState,
  formData: FormData
): Promise<ExcludeState> {
  void prev;
  const user = await requireUser();
  const feedbackId = String(formData.get("feedbackId") ?? "");
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const row = await respinDb.excludeFeedbackFromHistory(scope, profileId, feedbackId);
    // NO CREATOR CONTENT: ids and a closed code only (`../safe-log.ts`).
    logSpend("[studio-action] feedback left out of history", {
      workspaceId: scope.workspaceId,
      profileId: wireId(profileId),
      feedbackId: row.id,
      reaction: row.reaction,
    });
    return { status: "excluded", feedbackId: row.id };
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      status: "refused",
      code: logRefusal("[studio-action] feedback exclusion refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId: wireId(profileId),
        feedbackId: wireId(feedbackId),
      }) as BillingErrorCode,
    };
  }
}

/**
 * "REMEMBER THIS FOR FUTURE DRAFTS" (launch L3, R-152 item a).
 *
 * THE CREATOR'S OWN WORDS, PROPOSED — NEVER APPLIED. `rememberForFutureDrafts`
 * appends them as a new Kill Test rule in a PROPOSED version, through the same
 * creator-edit path `/brain` uses (owner only, refused under a pause, the
 * words stored verbatim as `creator_authored` evidence). Nothing a draft uses
 * changes until the creator confirms and activates that version on the Brain
 * page, and this action decides none of it.
 *
 * NOT DERIVED FROM FEEDBACK: the text is what the creator typed in this box,
 * not their reaction or their note (R11).
 *
 * A REPEATED PRESS WRITES NOTHING (L3 gate, C-L1): when the editable version
 * already holds the same rule, the db op returns `written: false` and this
 * returns `already_held` — which version holds it, and whether it is active.
 *
 * A REFUSAL HANDS THE TYPED TEXT BACK (L3 gate, D-L3) — clamped to
 * `BRAIN_EDIT_VALUE_MAX` code points, the per-field ceiling `editBrainDocument`
 * enforces, so a hand-built post cannot make the echo arbitrarily large — and
 * to nobody but the browser that posted it: it is not logged.
 */
export async function rememberForFutureDraftsAction(
  profileId: string,
  prev: RememberState,
  formData: FormData
): Promise<RememberState> {
  const user = await requireUser();
  const text = String(formData.get("preference") ?? "");
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const { doc, pointer, written } = await respinDb.rememberForFutureDrafts(
      scope,
      profileId,
      { text }
    );
    // IDS, A VERSION AND A POINTER ONLY — the preference itself is the
    // creator's words and never leaves the database (see `../safe-log.ts`).
    logSpend(
      written
        ? "[studio-action] preference proposed"
        : "[studio-action] preference already held",
      {
        workspaceId: scope.workspaceId,
        profileId: wireId(profileId),
        brainDocId: doc.id,
        version: doc.version,
        pointer,
      }
    );
    return written
      ? { status: "proposed", version: doc.version }
      : { status: "already_held", version: doc.version, active: doc.status === "active" };
  } catch (err) {
    rethrowNextControlFlow(err);
    const previous =
      prev?.status === "refused" && Number.isSafeInteger(prev.attempt) && prev.attempt > 0
        ? prev.attempt
        : 0;
    return {
      status: "refused",
      code: logRefusal("[studio-action] preference refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId: wireId(profileId),
      }) as BillingErrorCode,
      text: [...text].slice(0, BRAIN_EDIT_VALUE_MAX).join(""),
      attempt: previous + 1,
    };
  }
}
