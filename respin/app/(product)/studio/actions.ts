"use server";

// `/studio`'s TWO server actions — the generation press, and the feedback press.
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
import { requireUser } from "@respin/auth";
import {
  modeLabel,
  respinCredits,
  type GenerateParams,
} from "@respin/credits/app-server";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { logRefusal, logSpend, wireLabel } from "../safe-log";
import type { BillingErrorCode } from "../billing-errors";
import { scopeForUser } from "../workspace-scope";
import { studioActionStateFor } from "./projection";
import type { FeedbackState, StudioActionState } from "./run-state";

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
          profileId,
          attemptId,
          // CLAMPED, because this is the one value here that did NOT come from
          // the server. `LogContext`'s contract is server-derived identifiers
          // only, and the `UnknownModeError` branch fires precisely BECAUSE the
          // string is not a mode — so the unclamped version logged the
          // attacker's exact bytes on the path most likely to receive them.
          // `wireLabel` keeps a plausible typo (`hookss`) readable and turns
          // anything else into a fixed sentinel; the operation still gets the
          // raw value, because `modeSpec` is what has to refuse it.
          mode: wireLabel(mode),
        }) as BillingErrorCode,
      },
    };
  }
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
  // creator's words as typed, and `feedbackRecordedSentence` tells them so.
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
      profileId,
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
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    return {
      status: "refused",
      code: logRefusal("[studio-action] feedback refused", err, {
        ...(scope ? { workspaceId: scope.workspaceId } : {}),
        profileId,
        // CLAMPED, like the mode above and for the same reason: both of these
        // are wire input on a path whose refusals fire precisely BECAUSE the
        // value was not one the server offered.
        reaction: wireLabel(reaction),
      }) as BillingErrorCode,
    };
  }
}
