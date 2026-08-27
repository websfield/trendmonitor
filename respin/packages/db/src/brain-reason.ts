// Why a brain version exists — as a CLOSED CODE the server renders, never as a
// sentence a caller writes (C-42, superseding C-30's `reason` half).
//
// THE FINDING THIS MODULE EXISTS TO CLOSE. `brain_docs.reason` is `text NOT
// NULL`, was model-written, is drawn from the same reference inputs as
// `content`, and is EXPORTED WHOLE. REQ-I03 binds "any output". C-28 made
// `content` structural — every enumerated claim position must be cited or hold
// `[check]`, so the model no longer decides which of its claims are
// placeholders. C-30 then gave `reason` an echo check and a length cap and
// stopped there. Neither of those is an invented-specifics rule: "a devout
// Catholic mother in Leeds, 42000 followers" echoes nothing, fits any cap, and
// exports verbatim. The instance was closed and the class was open one field
// over — the shape this milestone has reproduced in every round.
//
// WHY NOT EXTEND C-28's RULE TO `reason` INSTEAD. C-28 works because `content`
// has ENUMERABLE positions: the schema says where the claims are, so each one
// can be required to carry evidence or `[check]`. A free-text sentence has no
// positions. Every detector proposed for it — digit runs, capitalised tokens,
// proper-noun heuristics — is a list of counterexamples wearing the word
// "class", and 2026-08-18 is in CLAUDE.md's Lessons precisely because that
// shape has already failed here three gate rounds running. "42000" is
// catchable; "in Leeds" is not; and a rule that catches one and not the other
// reports coverage it does not have.
//
// SO THE CHANNEL IS REMOVED RATHER THAN FILTERED. The caller supplies a code
// from a closed set and nothing else. Every number in the rendered sentence is
// computed by the server from facts it already verified — the distinct
// `inputId`s in the evidence `validateSourceEvidence` just proved verbatim, and
// the version number `writeBrainDoc` derives as max+1. A personal specific
// cannot appear in `reason` because no caller prose reaches the column. That is
// C-1's own thesis ("the model must not decide what is walked") applied one
// field over, and it is the only form of the fix that is a class rather than a
// list.
//
// R-8's "never silent" is preserved and arguably strengthened: every version
// still carries why it exists, and the sentence is now guaranteed to describe
// something that actually happened.

/**
 * The closed set of reasons a brain version can exist for.
 *
 * Deliberately SMALL, and deliberately grounded in what actually writes a brain
 * document in M2b-1 rather than in what might one day. A code is added when a
 * write path that needs it is built — an unused code is an invented specific
 * with a schema around it. Adding one is a two-line change plus copy, and the
 * exhaustiveness check below makes forgetting the copy a type error.
 */
export const BRAIN_DOC_REASON_CODES = [
  "onboarding_inference",
  "creator_edit",
  "correction",
] as const;

export type BrainDocReasonCode = (typeof BRAIN_DOC_REASON_CODES)[number];

/**
 * What a caller may say about why a version exists: a code, and nothing else.
 *
 * There is no free-text member and there is deliberately no `detail` escape
 * hatch. An optional free-text field would reopen the whole channel while
 * looking like a narrowing — which is exactly how `serverOwned` became "an
 * unguarded exemption with no production site" one round earlier.
 */
export type BrainDocReason = { code: BrainDocReasonCode };

export class BrainReasonError extends Error {
  constructor(received: unknown) {
    super(
      `'${String(received)}' is not a reason a brain version can carry. A version's reason is chosen from a fixed set (${BRAIN_DOC_REASON_CODES.join(", ")}) and the sentence is written by the server, so that a stored reason can never contain a detail nobody verified (REQ-I03, R-8)`
    );
    this.name = "BrainReasonError";
  }
}

/**
 * Server-known facts the sentence may mention. Every one is derived, never
 * passed through: `citedInputCount` is counted from the evidence entries
 * `validateSourceEvidence` has already proved verbatim and in-bounds, and
 * `version` is the max+1 `writeBrainDoc` computes for itself.
 */
export type BrainReasonFacts = {
  citedInputCount: number;
  version: number;
};

/**
 * Render the stored sentence.
 *
 * The ONLY producer of `brain_docs.reason`. Note that every interpolation is a
 * number from `facts` — there is no string parameter in this function, which is
 * the property that makes "no caller prose reaches the column" checkable by
 * reading the signature rather than by trusting the caller.
 */
export function renderBrainReason(
  reason: BrainDocReason,
  facts: BrainReasonFacts
): string {
  const code = (reason as { code?: unknown } | null | undefined)?.code;
  // Runtime validation, not just the type. `writeBrainDoc`'s params are an
  // `unknown`-bearing surface reachable through a cast, and 2026-08-21 is in
  // Lessons because a field guarded only at the type level was smuggled through
  // with `as unknown as` and stayed green. Anything that is not exactly a known
  // code is refused — an object carrying an extra `detail` key still renders
  // from its code alone, because only `code` is ever read.
  if (
    typeof code !== "string" ||
    !(BRAIN_DOC_REASON_CODES as readonly string[]).includes(code)
  ) {
    throw new BrainReasonError(code);
  }
  const plural = facts.citedInputCount === 1 ? "" : "s";
  switch (code as BrainDocReasonCode) {
    case "onboarding_inference":
      return `Version ${facts.version}: inferred from ${facts.citedInputCount} of your onboarding input${plural}.`;
    case "creator_edit":
      return `Version ${facts.version}: you edited this document.`;
    case "correction":
      return `Version ${facts.version}: corrects an earlier version.`;
  }
}
