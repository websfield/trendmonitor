import { createCandidate, type TrendCandidate } from "./access";
import { assertExactlyCompliantAdapters, type TrendSource, type TrendSourceName } from "./trend-source";

export const YOUTUBE_DATA_API_ORIGIN = "https://www.googleapis.com";

export type YouTubeHttpPort = (url: URL) => Promise<unknown>;
export type YouTubeDiscoveryMetadata = Readonly<{
  provider: "youtube_data_api_v3";
  videoId: string;
  channelId: string;
  publishedAt: string;
  viewCount: number;
}>;
export type YouTubeDiscoveryCandidate = TrendCandidate & { metadata: YouTubeDiscoveryMetadata };

export class YouTubeMetadataError extends Error {}

function pinnedDataApiUrl(path: "/youtube/v3/search" | "/youtube/v3/videos", params: Record<string, string>): URL {
  const url = new URL(path, YOUTUBE_DATA_API_ORIGIN);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (url.origin !== YOUTUBE_DATA_API_ORIGIN) throw new Error("YouTube Data API origin pin failed");
  return url;
}

function videoIds(response: unknown): string[] {
  if (!response || typeof response !== "object" || !("items" in response) || !Array.isArray(response.items)) return [];
  return response.items.flatMap((item) => {
    if (!item || typeof item !== "object" || !("id" in item)) return [];
    const id = item.id;
    if (typeof id === "string") return [id];
    if (id && typeof id === "object" && "videoId" in id && typeof id.videoId === "string") return [id.videoId];
    return [];
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringField(recordValue: Record<string, unknown>, field: string): string {
  const value = recordValue[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new YouTubeMetadataError(`YouTube metadata ${field} is missing`);
  }
  return value.trim();
}

function safeViewCount(value: unknown): number {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new YouTubeMetadataError("YouTube viewCount is not a non-negative integer string");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new YouTubeMetadataError("YouTube viewCount exceeds a safe integer");
  return parsed;
}

function isExactUtcInstant(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/.exec(value);
  if (!match) return false;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return false;
  const instant = new Date(epoch);
  return instant.getUTCFullYear() === Number(match[1])
    && instant.getUTCMonth() + 1 === Number(match[2])
    && instant.getUTCDate() === Number(match[3])
    && instant.getUTCHours() === Number(match[4])
    && instant.getUTCMinutes() === Number(match[5])
    && instant.getUTCSeconds() === Number(match[6]);
}

function parseVideoMetadata(response: unknown, expectedVideoId: string): YouTubeDiscoveryMetadata {
  const root = record(response);
  const items = root?.items;
  if (!Array.isArray(items)) throw new YouTubeMetadataError("YouTube videos response has no items array");
  const item = items.map(record).find((candidate) => candidate?.id === expectedVideoId);
  if (!item) throw new YouTubeMetadataError("YouTube videos response has no selected video");
  const snippet = record(item.snippet);
  const statistics = record(item.statistics);
  if (!snippet || !statistics) throw new YouTubeMetadataError("YouTube videos response lacks snippet or statistics");
  const publishedAt = stringField(snippet, "publishedAt");
  if (!isExactUtcInstant(publishedAt)) {
    throw new YouTubeMetadataError("YouTube publishedAt is not a UTC instant");
  }
  return {
    provider: "youtube_data_api_v3",
    videoId: expectedVideoId,
    channelId: stringField(snippet, "channelId"),
    publishedAt,
    viewCount: safeViewCount(statistics.viewCount),
  };
}

export const youtube: TrendSource & {
  discover(input: { apiKey: string; query: string; http: YouTubeHttpPort }): Promise<YouTubeDiscoveryCandidate>;
} = {
  name: "youtube",
  async discover({ apiKey, query, http }) {
    const cleanApiKey = apiKey.trim();
    const cleanQuery = query.trim();
    if (!cleanApiKey) throw new YouTubeMetadataError("YouTube API key is required");
    if (!cleanQuery) throw new YouTubeMetadataError("YouTube discovery query is required");
    const search = pinnedDataApiUrl("/youtube/v3/search", { part: "id", type: "video", q: cleanQuery, key: cleanApiKey });
    const searchResponse = await http(search);
    const id = videoIds(searchResponse)[0]?.trim();
    if (!id) throw new YouTubeMetadataError("YouTube discovery returned no video id");
    const videoResponse = await http(pinnedDataApiUrl("/youtube/v3/videos", { part: "snippet,statistics", id, key: cleanApiKey }));
    const metadata = parseVideoMetadata(videoResponse, id);
    return { ...createCandidate({ id, source: "youtube", transcriptState: "transcript_required" }), metadata };
  },
};

/**
 * The seam the `submitted` adapter stores a third-party transcript through.
 *
 * PRODUCTION IMPLEMENTATION (slice 8c, R-96/R-98): `pastedReferenceIntakePort`
 * in `@respin/credits` (`packages/credits/src/pasted-reference.ts`), which
 * composes the metered `submitPastedReference` — tier gate, workspace lock,
 * `creditCosts.autopsy` debited with the private claim — over stage A's
 * `intakePastedReference`. This package does not import it (the dependency
 * edge runs `credits -> db`, and `trends` depends on nothing), so the shape
 * is asserted against THIS type where the adapter lives, and the R4 block in
 * `tests/trends.test.ts` reads that file to witness the production caller
 * exists. The production port never returns `accepted: false`: no quote
 * budget is enforced at intake (R-3's is enforced at grounding), and every
 * refusal it has is a typed error thrown through rather than a reason
 * relabelled.
 */
export type ReferenceIntakePort = {
  intakeReferenceTranscript(input: { profileId: string; sourceUrl: string; transcript: string }): Promise<
    | { accepted: true; referenceInputId: string }
    | { accepted: false; reason: "quote_budget_exceeded" }
  >;
};

export class SubmittedTranscriptRefusedError extends Error {
  constructor(public readonly code: "quote_budget_exceeded") {
    super(code);
  }
}

export const submitted: TrendSource & {
  submit(input: { profileId: string; url: string; transcript: string; referenceIntake: ReferenceIntakePort }): Promise<{ referenceInputId: string }>;
} = {
  name: "submitted",
  async submit({ profileId, url, transcript, referenceIntake }) {
    const result = await referenceIntake.intakeReferenceTranscript({ profileId, sourceUrl: url, transcript });
    if (!result.accepted) throw new SubmittedTranscriptRefusedError(result.reason);
    return { referenceInputId: result.referenceInputId };
  },
};

/** The source registry is built from the concrete adapters, never duplicated by name. */
export const TREND_SOURCE_ADAPTERS: Readonly<Record<TrendSourceName, TrendSource>> = {
  youtube,
  submitted,
};

assertExactlyCompliantAdapters(TREND_SOURCE_ADAPTERS);
