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

export class WorkspacePausedError extends Error {
  constructor() {
    super(
      "Workspace subscription is paused: credits are frozen and debits are refused until resume (REQ-G08)."
    );
    this.name = "WorkspacePausedError";
  }
}

export class ClockSkewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClockSkewError";
  }
}
