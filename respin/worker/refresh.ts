export interface ExternalEvidenceBlocker {
  readonly status: "blocked_external_evidence";
  readonly blockerCode: string;
  readonly externalSystem: "youtube_data_api" | "resend";
  readonly evidenceNeeded: string;
}

export const YOUTUBE_DISCOVERY_EVIDENCE_BLOCKER: ExternalEvidenceBlocker = Object.freeze({
  status: "blocked_external_evidence",
  blockerCode: "youtube_live_discovery_unverified",
  externalSystem: "youtube_data_api",
  evidenceNeeded: "provisioned credentials, measured quota, and a live metadata discovery run",
});

export interface RefreshCommand {
  readonly runId: string;
  readonly nicheId: string;
  readonly scheduledAt: string;
}

export type DiscoveryResult =
  | ExternalEvidenceBlocker
  | {
      readonly status: "completed";
      readonly discoveredCount: number;
      readonly metadataStoredCount: number;
      readonly transcriptReadyCount: number;
    };

export interface YouTubeDiscoveryPort {
  discover(command: RefreshCommand): Promise<DiscoveryResult>;
}

function validate(command: RefreshCommand): void {
  if (command.runId.trim().length === 0) throw new Error("runId is required");
  if (command.nicheId.trim().length === 0) throw new Error("nicheId is required");
  if (!Number.isFinite(Date.parse(command.scheduledAt))) {
    throw new Error("scheduledAt must be an ISO timestamp");
  }
}

export async function runRefresh(
  command: RefreshCommand,
  discovery: YouTubeDiscoveryPort,
): Promise<DiscoveryResult> {
  validate(command);
  const result = await discovery.discover(command);
  if (result.status === "blocked_external_evidence") {
    if (result.externalSystem !== "youtube_data_api"
      || !/\S/.test(result.blockerCode)
      || !/\S/.test(result.evidenceNeeded)) {
      throw new Error("refresh returned an invalid external-evidence blocker");
    }
    return result;
  }
  for (const [field, value] of Object.entries({
    discoveredCount: result.discoveredCount,
    metadataStoredCount: result.metadataStoredCount,
    transcriptReadyCount: result.transcriptReadyCount,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`refresh ${field} must be a non-negative safe integer`);
    }
  }
  if (result.metadataStoredCount > result.discoveredCount
    || result.transcriptReadyCount > result.metadataStoredCount) {
    throw new Error("refresh result counts do not describe nested populations");
  }
  return result;
}

export const unavailableYouTubeDiscovery: YouTubeDiscoveryPort = Object.freeze({
  async discover(): Promise<ExternalEvidenceBlocker> {
    return YOUTUBE_DISCOVERY_EVIDENCE_BLOCKER;
  },
});
