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
