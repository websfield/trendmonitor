"use server";

// The decision actions: record the creator's per-field confirmation on each
// of the three brain kinds, and activate the WHOLE coherent brain (R8). These
// are the acts REQ-B02 puts a human in front of.
//
// THIN WRAPPERS, like every other action in this app. The role gate
// (`assertMayDecide`), the pause gate, the pointer/placeholder validation, the
// all-positions-confirmed check, the confirmation sha over `(content,
// source_evidence)` and the echo bar all live in `@respin/db` and are tested
// there. Nothing is decided in this file.
//
// THE GATE IS ABOVE THE TRY IN EVERY ONE, and every catch re-throws Next's
// control flow as its FIRST statement — the rule `tests/action-gate.test.ts`
// scans `app/**` for. `requireUser()` signals "no session" by THROWING a
// `redirect()`, so calling it inside a try turns an expired session into
// `?e=unknown` instead of `/sign-in`.
//
// THEY REDIRECT rather than return, unlike `/onboarding`'s metered run, and the
// split is the same one that file documents: a returning action exists to carry
// numbers about MONEY that exist exactly once on the operation's return value.
// None of these spends anything, so the page can simply re-read and re-render
// — and a redirect is what makes the confirmed/activated state survive a
// refresh, which for a decision about oneself is the behaviour a person expects.
//
// ONE ACTIVATE ACTION FOR ALL THREE KINDS (slice 3b, R8) — `activateBrainAction`
// replaces the slice-3 `activateVoiceAction`. Activating from this screen is a
// whole-coherent-brain act regardless of which document's button was pressed:
// `respinDb.activateBrainCoherent` runs `activateBrainDoc`'s own gates for the
// document named, then records the current active id of every OTHER kind
// alongside it in the same transaction. A per-kind activate function here would
// have nowhere honest to say that — the button the creator pressed still names
// one document, but what it PUTS IN FORCE is the coherent set (see
// `brain-view.tsx`'s activation-meaning copy).
import { redirect } from "next/navigation";
import { requireUser } from "@respin/auth";
import {
  BRAIN_EDIT_MAX_FIELDS,
  BRAIN_EDIT_POINTER_MAX,
  BRAIN_EDIT_TOTAL_MAX,
  BRAIN_EDIT_VALUE_MAX,
  BrainEditLimitError,
  ReferenceEchoError,
  respinDb,
} from "@respin/db";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { logRefusal } from "../safe-log";
import { scopeForUser } from "../workspace-scope";
// A DIRECTIVE-FREE module, because a `"use server"` file may export ONLY async
// functions — `readConfirmations` is synchronous, and exporting it from here
// made `/brain` a 500 on first load (browser walk, 2026-08-29). Same rule and
// same shape as `../onboarding/run-state.ts`.
import { readConfirmations } from "./confirmations";
import type { BrainEditRefusalState } from "./edit-state";

const BRAIN_PATH = "/brain";
const REFERENCE_MATCH_PREVIEW_MAX = 240;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/**
 * `value: null` DECLINES a position — see `DeclaredMetricEdit`'s docblock in
 * `@respin/db`. Only the metric form produces one (its two optional inputs);
 * `readBrainEdits` reads form fields, which are always strings.
 */
type BrainClaimEdit = { pointer: string; value: string | null };
type MetricDirection = "higher_is_better" | "lower_is_better";

function normalizedEditText(value: string): string {
  return value.normalize("NFC").replace(/\r\n/g, "\n");
}

function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * Reject an oversized browser request before obtaining a workspace scope or
 * opening a database transaction. The package repeats these checks and remains
 * the authority; importing its constants keeps this courtesy bound identical.
 */
function assertBrainEditBounds(edits: readonly BrainClaimEdit[]): void {
  if (edits.length > BRAIN_EDIT_MAX_FIELDS) {
    throw new BrainEditLimitError(
      `it changes ${edits.length} fields and the per-submission limit is ${BRAIN_EDIT_MAX_FIELDS}`
    );
  }
  let aggregate = 0;
  for (const edit of edits) {
    const pointerLength = codePointLength(edit.pointer.normalize("NFC"));
    // A DECLINE carries no text, so it costs the pointer alone — the same
    // arithmetic `editBrainDocument` performs, which is what "keeps this
    // courtesy bound identical" means.
    const valueLength =
      edit.value === null ? 0 : codePointLength(normalizedEditText(edit.value));
    if (pointerLength > BRAIN_EDIT_POINTER_MAX) {
      throw new BrainEditLimitError(
        `a field pointer is ${pointerLength} characters and the limit is ${BRAIN_EDIT_POINTER_MAX}`
      );
    }
    if (valueLength > BRAIN_EDIT_VALUE_MAX) {
      throw new BrainEditLimitError(
        `a field value is ${valueLength} characters and the per-field limit is ${BRAIN_EDIT_VALUE_MAX}`
      );
    }
    aggregate += pointerLength + 1 + valueLength + (aggregate === 0 ? 0 : 2);
    if (aggregate > BRAIN_EDIT_TOTAL_MAX) {
      throw new BrainEditLimitError(
        `the normalized submission is over the ${BRAIN_EDIT_TOTAL_MAX}-character total limit`
      );
    }
  }
}

function readBrainEdits(formData: FormData): BrainClaimEdit[] {
  const edits: BrainClaimEdit[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("edit:") || typeof value !== "string") continue;
    if (edits.length >= BRAIN_EDIT_MAX_FIELDS) {
      throw new BrainEditLimitError(
        `it changes more than the per-submission limit of ${BRAIN_EDIT_MAX_FIELDS} fields`
      );
    }
    edits.push({ pointer: key.slice("edit:".length), value });
  }
  assertBrainEditBounds(edits);
  return edits;
}

function optionalMetricValue(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

function failHref(err: unknown): string {
  // `logRefusal`, never a raw error object: logging the error itself prints a
  // `DrizzleQueryError`'s bound parameters — here that is the creator's post
  // text AND the inferred claims about them. Enforced by the source scan in
  // `tests/safe-log.test.ts`.
  const code = logRefusal("[brain-action] refused", err);
  return `${BRAIN_PATH}?e=${encodeURIComponent(code)}`;
}

function referenceEchoState(err: unknown): BrainEditRefusalState | null {
  if (!(err instanceof ReferenceEchoError) || err.match === null) return null;
  const { pointer, inputId, span } = err.match;
  if (
    typeof pointer !== "string" ||
    !pointer.startsWith("/") ||
    codePointLength(pointer) > BRAIN_EDIT_POINTER_MAX ||
    typeof inputId !== "string" ||
    !UUID_RE.test(inputId) ||
    typeof span !== "string" ||
    span.length === 0
  ) {
    return null;
  }
  const codePoints = [...span];
  return {
    kind: "reference_echo",
    pointer,
    referenceInputId: inputId,
    matchedSpan: codePoints.slice(0, REFERENCE_MATCH_PREVIEW_MAX).join(""),
    matchedSpanTruncated: codePoints.length > REFERENCE_MATCH_PREVIEW_MAX,
  };
}

/**
 * Record which inferred fields the creator confirmed on a `voice` document
 * (REQ-B02).
 *
 * `profileId` and `brainDocId` are BOUND arguments, not form fields, so there
 * is no hidden input for a browser to edit — a convenience, never the control.
 * Both are still untrusted input on the wire; `ProfileScope.mint` refuses a
 * foreign profile and `readOwnBrainDoc` refuses a foreign document, each with
 * one byte-identical message so neither is an enumeration oracle.
 */
export async function confirmVoiceAction(
  profileId: string,
  brainDocId: string,
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  let href = BRAIN_PATH;
  try {
    const scope = await scopeForUser(user);
    await respinDb.confirmVoiceFields(
      scope,
      profileId,
      brainDocId,
      readConfirmations(formData)
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    href = failHref(err);
  }
  redirect(href);
}

/**
 * Record which declared fields the creator confirmed on a `strategy`
 * document (slice 3b, R6) — same shape as `confirmVoiceAction`, its own
 * function so the AC-13 completeness scan names each kind's confirm act
 * explicitly (see `confirmStrategyFields`'s own docblock in `@respin/db`).
 */
export async function confirmStrategyAction(
  profileId: string,
  brainDocId: string,
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  let href = BRAIN_PATH;
  try {
    const scope = await scopeForUser(user);
    await respinDb.confirmStrategyFields(
      scope,
      profileId,
      brainDocId,
      readConfirmations(formData)
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    href = failHref(err);
  }
  redirect(href);
}

/**
 * Record which declared fields the creator confirmed on a `killtest`
 * document. Same note as `confirmStrategyAction`.
 */
export async function confirmKillTestAction(
  profileId: string,
  brainDocId: string,
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  let href = BRAIN_PATH;
  try {
    const scope = await scopeForUser(user);
    await respinDb.confirmKillTestFields(
      scope,
      profileId,
      brainDocId,
      readConfirmations(formData)
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    href = failHref(err);
  }
  redirect(href);
}

/**
 * Activate a confirmed version AS ONE COHERENT BRAIN — the second, separate
 * act (R13), and the ONLY activation path this screen offers, for all three
 * kinds (R8).
 *
 * NO FORM DATA AT ALL, deliberately: activation takes no options. Everything
 * that decides whether it may proceed is already on the row, and
 * `activateBrainDocCoherent` is what reads it.
 */
export async function activateBrainAction(
  profileId: string,
  brainDocId: string
): Promise<void> {
  const user = await requireUser();
  let href = BRAIN_PATH;
  try {
    const scope = await scopeForUser(user);
    await respinDb.activateBrainCoherent(scope, profileId, brainDocId);
  } catch (err) {
    rethrowNextControlFlow(err);
    href = failHref(err);
  }
  redirect(href);
}

/**
 * Create a proposed replacement for one Voice, Strategy or Kill Test version.
 *
 * The form posts every editable claim position in the section. The packaged
 * operation compares them with the stored version, carries evidence forward
 * for unchanged positions, and records one creator-authored evidence row for
 * the positions that actually changed. The action does not make either of
 * those decisions.
 */
export async function editBrainDocumentAction(
  profileId: string,
  brainDocId: string,
  _previousState: BrainEditRefusalState | null,
  formData: FormData
): Promise<BrainEditRefusalState | null> {
  const user = await requireUser();
  let href = BRAIN_PATH;
  try {
    const edits = readBrainEdits(formData);
    const scope = await scopeForUser(user);
    await respinDb.editBrainDocument(scope, profileId, brainDocId, edits);
  } catch (err) {
    rethrowNextControlFlow(err);
    const state = referenceEchoState(err);
    if (state) return state;
    href = failHref(err);
  }
  redirect(href);
}

/**
 * Edit Strategy's declared metric through its structured facade operation.
 *
 * A BLANK OPTIONAL INPUT IS AN EXPLICIT DECLINE (`null`), never "keep whatever
 * is stored" and — since slice 5's gate round 1 (G1) — never `[check]` either.
 * The package leaves a declined position UNSTATED, which is exactly the shape
 * the interview writes when a creator declines the same question. Before that,
 * `null` meant `[check]`, a value the position could only receive if the key
 * already existed — so a creator who had declined the question in the
 * interview could not edit their metric at all, and the screen told them the
 * page and the server disagreed.
 */
export async function editDeclaredMetricAction(
  profileId: string,
  brainDocId: string,
  _previousState: BrainEditRefusalState | null,
  formData: FormData
): Promise<BrainEditRefusalState | null> {
  const user = await requireUser();
  let href = BRAIN_PATH;
  try {
    const metric: {
      label: string;
      unit: string;
      direction: MetricDirection;
      platform: string | null;
      window: string | null;
    } = {
      label: String(formData.get("metric:label") ?? ""),
      unit: String(formData.get("metric:unit") ?? ""),
      // This value is untrusted. The cast narrows only TypeScript; the package
      // validates the resulting Strategy content and refuses any other value.
      direction: String(
        formData.get("metric:direction") ?? ""
      ) as MetricDirection,
      platform: optionalMetricValue(formData, "metric:platform"),
      window: optionalMetricValue(formData, "metric:window"),
    };
    assertBrainEditBounds([
      { pointer: "/metric/label", value: metric.label },
      { pointer: "/metric/unit", value: metric.unit },
      { pointer: "/metric/direction", value: metric.direction },
      { pointer: "/metric/platform", value: metric.platform },
      { pointer: "/metric/window", value: metric.window },
    ]);
    const scope = await scopeForUser(user);
    await respinDb.editDeclaredMetric(scope, profileId, brainDocId, metric);
  } catch (err) {
    rethrowNextControlFlow(err);
    const state = referenceEchoState(err);
    if (state) return state;
    href = failHref(err);
  }
  redirect(href);
}
