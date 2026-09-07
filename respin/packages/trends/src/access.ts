import type { TrendSourceName } from "./trend-source";

export const RIGHTS_SCOPES = ["profile_private", "shared_analysis"] as const;
export type RightsScope = (typeof RIGHTS_SCOPES)[number];
export type TranscriptState = "transcript_required" | "transcript_unavailable" | "available";
export type AnalysisPurpose = "autopsy" | "feed" | "spin";

export type TrendCandidate = Readonly<{
  id: string;
  source: TrendSourceName;
  transcriptState: TranscriptState;
  transcript?: string;
  rightsScope?: RightsScope;
  profileId?: string;
  staleness: "current" | "stale";
}>;

export class TrendTranscriptRequiredError extends Error {
  constructor(public readonly purpose: AnalysisPurpose, public readonly state: TranscriptState) {
    super(`A compliant transcript is required before ${purpose} (${state})`);
  }
}

export class TrendAccessError extends Error {}

export function createCandidate(input: {
  id: string;
  source: TrendSourceName;
  transcript?: string;
  rightsScope?: RightsScope;
  profileId?: string;
  transcriptState?: Exclude<TranscriptState, "available">;
}): TrendCandidate {
  const transcript = input.transcript?.trim();
  if (transcript) {
    if (!input.rightsScope || !input.profileId) {
      throw new TrendAccessError("Transcript-bearing candidates require rights scope and profile identity");
    }
    return { id: input.id, source: input.source, transcript, transcriptState: "available", rightsScope: input.rightsScope, profileId: input.profileId, staleness: "current" };
  }
  return { id: input.id, source: input.source, transcriptState: input.transcriptState ?? "transcript_required", staleness: "current" };
}

export function assertReadyForAnalysis(item: TrendCandidate, purpose: AnalysisPurpose): asserts item is TrendCandidate & { transcript: string; rightsScope: RightsScope; profileId: string } {
  if (item.transcriptState !== "available" || !item.transcript || !item.rightsScope || !item.profileId) {
    throw new TrendTranscriptRequiredError(purpose, item.transcriptState);
  }
}

export function assertAccessibleFor(item: TrendCandidate, profileId: string): void {
  assertReadyForAnalysis(item, "feed");
  if (item.rightsScope === "profile_private" && item.profileId !== profileId) {
    throw new TrendAccessError("Private transcript cannot cross profiles");
  }
}

/** Staleness is retained state: callers update the label, never remove the item. */
export function markStale(item: TrendCandidate): TrendCandidate {
  return { ...item, staleness: "stale" };
}
