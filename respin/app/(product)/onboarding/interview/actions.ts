"use server";

// The structured-interview screen's TWO server actions (slice 3b, Stage B1).
//
// SAME THIN-WRAPPER DISCIPLINE as `../actions.ts`: the gate, the scope, the
// packaged operation, the answer — nothing decided here. Every real rule
// (the answer shapes, the "already submitted" refusal, the atomic write of
// the two brain documents) lives in `@respin/db`'s `interview-ops.ts` and is
// tested there.
//
// THE GATE IS ABOVE THE TRY, in both actions, for the reason `../actions.ts`'s
// own header gives and `tests/action-gate.test.ts` scans for: `requireUser()`
// signals "no session" by THROWING a `redirect()`, and catching it inside a
// try would turn an expired session into `?e=unknown` instead of `/sign-in`.
//
// TWO DESTINATIONS FROM ONE SAVE, not two actions with different logic — the
// edit form's two submit buttons point at two THIN wrappers around the same
// core so "save and stay" and "save and review" cannot drift into two
// different save behaviours.
import { redirect } from "next/navigation";
import { requireUser } from "@respin/auth";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { logRefusal } from "../../safe-log";
import { scopeForUser } from "../../workspace-scope";
import { buildInterviewPatch } from "./copy";

const INTERVIEW_PATH = "/onboarding/interview";
const REVIEW_PATH = "/onboarding/interview?step=review";

/** `?e=`/`&field=` — a CODE and a closed field key, never a message (see `../../billing-errors.ts`'s header). */
function failHref(base: string, err: unknown): string {
  const code = logRefusal("[interview-action] refused", err);
  return `${base}${base.includes("?") ? "&" : "?"}e=${encodeURIComponent(code)}`;
}

/**
 * Save the whole interview draft and redirect to `to` (R2/R11).
 *
 * VALIDATES BEFORE IT SAVES: `buildInterviewPatch` finds a too-long answer or
 * an over-size list and reports the exact FIELD (R2) — the package's own
 * `InterviewAnswerError`, reached only if this pre-check ever disagrees with
 * `saveInterviewDraft`'s own zod schema, carries no structured field, so that
 * path degrades to the screen's generic `interview_answer` copy rather than a
 * silent failure (`./copy.ts`'s `interviewErrorFor`).
 */
async function saveInterviewCore(
  profileId: string,
  to: string,
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  let href = to;
  try {
    const scope = await scopeForUser(user);
    const result = buildInterviewPatch(formData);
    if (!result.ok) {
      href = `${INTERVIEW_PATH}?e=interview_answer&field=${encodeURIComponent(result.field)}`;
    } else {
      await respinDb.saveInterviewDraft(scope, profileId, result.patch);
    }
  } catch (err) {
    rethrowNextControlFlow(err);
    href = failHref(INTERVIEW_PATH, err);
  }
  redirect(href);
}

/** The "Save progress" button — stays on the edit screen. */
export async function saveInterviewStayAction(
  profileId: string,
  formData: FormData
): Promise<void> {
  return saveInterviewCore(profileId, INTERVIEW_PATH, formData);
}

/** The "Save and review my answers" button — moves to the review screen. */
export async function saveInterviewReviewAction(
  profileId: string,
  formData: FormData
): Promise<void> {
  return saveInterviewCore(profileId, REVIEW_PATH, formData);
}

/**
 * Submit the interview: turn every decided answer into an immutable
 * `creator_authored` record and (Stage A's own atomic write) the `strategy`
 * and `killtest` brain-document drafts.
 *
 * REDIRECTS TO `/brain` ON SUCCESS — the honest B04 handoff this slice owns
 * (R13): the confirm-and-activate surface for what was just drafted, not a
 * fabricated "ideas created" claim. `/brain` is slice-3b's own confirm
 * screen (Stage B2's surface); this file does not import anything from it.
 */
export async function submitInterviewAction(
  profileId: string,
  formData: FormData
): Promise<void> {
  // The submit button carries no field of its own — `respinDb.submitInterview`
  // reads the ALREADY-SAVED draft, never the form's contents — but the
  // parameter stays: binding `profileId` on a one-argument function would
  // strip the `(formData: FormData) => …` shape `<form action={...}>` needs.
  void formData;
  const user = await requireUser();
  let href = "/brain";
  try {
    const scope = await scopeForUser(user);
    await respinDb.submitInterview(scope, profileId);
  } catch (err) {
    rethrowNextControlFlow(err);
    href = failHref(REVIEW_PATH, err);
  }
  redirect(href);
}
