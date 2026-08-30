// Typed refusals — the UI turns these into honest prompts (REQ-G03's
// blocked-at-zero message, the paused notice), never generic 500s.
export class InsufficientCreditsError extends Error {
  constructor(
    public readonly balance: number,
    public readonly cost: number
  ) {
    super(
      `Insufficient credits: balance ${balance}, requested ${cost}. Buy an overage pack or enable auto-top-up (REQ-G03).`
    );
    this.name = "InsufficientCreditsError";
  }
}

/**
 * The debit was refused AFTER the vendor had already answered.
 *
 * A DISTINCT CLASS, not a flag on the one above, because the two say opposite
 * things to the person reading the screen. `InsufficientCreditsError` raised
 * before the call means nothing happened: no tokens, no spend record, the
 * included run untouched. Raised inside `runInference`'s step-9 transaction it
 * means the opposite — the model answered, we paid the vendor, and
 * `model_usage` committed (R11's settlement tail) before the charge was
 * attempted and failed.
 *
 * Three reviewers found the same defect independently (2026-08-28): the shared
 * copy told creators on this path that the attempt "was refused BEFORE
 * anything was called, so nothing was spent and your included build was not
 * used" — three false clauses in one sentence, on the product's first money
 * surface. A class the UI can tell apart is the only way that sentence can be
 * right for both paths.
 *
 * It carries the `attemptId` so the recorded spend can be found from the
 * refusal, which is the question a creator on this path actually asks.
 */
export class PostCallDebitError extends Error {
  constructor(
    public readonly attemptId: string,
    public readonly balance: number,
    public readonly cost: number
  ) {
    super(
      `The attempt completed and was recorded, then its debit was refused: balance ${balance}, requested ${cost} (attempt ${attemptId}). The vendor was paid; nothing was taken from the workspace's balance.`
    );
    this.name = "PostCallDebitError";
  }
}

// WorkspacePausedError MOVED to @respin/db on 2026-08-21 (M2a, plan A-7) and is
// re-exported here so every existing import site is unchanged.
//
// It moved because `writeBrainDoc` — in packages/db — must refuse under an open
// pause, `pause_periods` is defined in packages/db, and @respin/credits depends
// on @respin/db, so the class could not stay here without being duplicated.
// TWO classes of this name would be the worse outcome: they fail `instanceof`
// against each other, and `app/(product)/billing-errors.ts` matches on
// `instanceof`, so the pause refusal would render as "Something went wrong".
// ONE class, one `instanceof`, one piece of copy.
export { WorkspacePausedError } from "@respin/db";

export class ClockSkewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClockSkewError";
  }
}

/**
 * The stored document's claim positions and the evidence's pointers disagree.
 *
 * A PROGRAMMING-ERROR CLASS, not a creator-facing one, and it exists because
 * the facade-error walk correctly refused the bare `new Error` it replaces —
 * `app/**` may `instanceof` only what this package exports, so an anonymous
 * throw on a reachable path renders as "Something went wrong".
 *
 * It can only fire if `buildVoiceDocument`'s RFC-6901 convention and
 * `enumerateClaimFieldsOf`'s walk diverge. That divergence is silent and
 * expensive: the document writes, the confirm screen renders, and
 * `activateBrainDoc` then refuses forever because the positions the creator
 * confirmed are not the positions it enumerates. Refusing the WRITE is the
 * fail-closed direction — no row is better than a row nobody can activate.
 */
export class BrainPointerDivergenceError extends Error {
  constructor(public readonly pointers: string[]) {
    super(
      `Evidence names ${pointers.length} position(s) the voice schema does not declare (${pointers.join(", ")}). The pointer convention and the claim enumerator have diverged, so no brain version was written — a version whose confirmed positions do not match its enumerated ones can never activate.`
    );
    this.name = "BrainPointerDivergenceError";
  }
}

/**
 * Too many attempts we PAID FOR and did not charge for, on one profile.
 *
 * THE BOUND THAT THE ENTITLEMENT SPLIT MADE NECESSARY (billing gate round 2,
 * 2026-08-29). Until `LlmError.consumesIncludedBuild` existed, every
 * non-consuming outcome was also a zero-cost one, so nothing had to count
 * these. `LlmTruncatedError` is the first that is billable to us and
 * deliberately free to the creator — correctly, because the cause is our own
 * reply ceiling — and that combination removed the last thing bounding it:
 * `priceOf` returns 0 for a non-consuming attempt, so the balance check is
 * skipped entirely, and truncation is DETERMINISTIC for a given input size.
 * A creator could press the button forever, at a full output ceiling a call,
 * for nothing.
 *
 * Round 1's defect had bounded this by accident — the second press cost 50
 * credits nobody on Free could pay. Fixing that defect reopened it, which is
 * why this class exists in the same change.
 *
 * IT IS A SAFETY BOUND, NOT A PRODUCT LIMIT, and the copy says so: the creator
 * did nothing wrong, they are not out of credits, and there is nothing for
 * them to change. It names an operator because an operator is who can fix it.
 */
export class UnchargedAttemptCapError extends Error {
  constructor(
    readonly attempts: number,
    readonly cap: number
  ) {
    super(
      // NOT "recent" (billing gate round 3, 2026-08-29): the count behind this
      // refusal is a LIFETIME count over an append-only table — there is no
      // time window and no per-profile clearing act. The recorded clearing
      // mechanism is an operator fixing the root cause and raising the global
      // `onboarding.maxUnchargedBillableAttempts` (see R-48's addendum), so
      // the copy must not imply the cap ages out or can be reset per creator.
      `This creator has ${attempts} runs on record that failed in a way that cost us money and cost you nothing, which is the limit (${cap}). Nothing was spent and no model was called this time. This is a fault on our side that repeats until it is fixed rather than anything you can change; please tell us so we can fix it.`
    );
    this.name = "UnchargedAttemptCapError";
  }
}
