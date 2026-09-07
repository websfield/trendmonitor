import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TrendAccessError,
  TrendTranscriptRequiredError,
  assertAccessibleFor,
  assertReadyForAnalysis,
  createCandidate,
  markStale,
} from "../src/access";
import { autopsy, AutopsyAnalysisError, cacheKeyFor, type AutopsyModelPort, type AutopsyStageResult, type AutopsyStorePort } from "../src/autopsy";
import { BASELINE_RECENT_OBSERVATIONS, medianRecentViews, OutlierInputError, scoreOutlier, selectBaseline } from "../src/outlier";
import { measureSaturation, SaturationMeasurementError } from "../src/saturation";
import { submitted, TREND_SOURCE_ADAPTERS, YouTubeMetadataError, youtube, YOUTUBE_DATA_API_ORIGIN } from "../src/sources";
import { assertExactlyCompliantAdapters } from "../src/trend-source";

describe("R1: the source registry is exactly the compliant source set", () => {
  it("derives its two adapters from one source registry", () => {
    expect(Object.keys(TREND_SOURCE_ADAPTERS)).toEqual(["youtube", "submitted"]);
    expect(TREND_SOURCE_ADAPTERS.youtube).toBe(youtube);
    expect(TREND_SOURCE_ADAPTERS.submitted).toBe(submitted);
  });

  it("NON-VACUITY: rejects a planted third adapter", () => {
    expect(() =>
      assertExactlyCompliantAdapters({ ...TREND_SOURCE_ADAPTERS, planted: youtube })
    ).toThrow(/exactly youtube and submitted/);
  });
});

describe("R3/R3a: discovery is metadata only until transcript rights exist", () => {
  it("uses the pinned official Data API origin and only discovery metadata endpoints", async () => {
    const calls: URL[] = [];
    const item = await youtube.discover({
      apiKey: "fixture-key",
      query: "camera setup",
      http: async (url) => {
        calls.push(url);
        return url.pathname.endsWith("/search")
          ? { items: [{ id: { videoId: "v1" } }] }
          : { items: [{ id: "v1", snippet: { channelId: "c1", publishedAt: "2026-01-02T03:04:05Z" }, statistics: { viewCount: "42" } }] };
      },
    });
    expect(calls.map((url) => url.origin)).toEqual([YOUTUBE_DATA_API_ORIGIN, YOUTUBE_DATA_API_ORIGIN]);
    expect(calls.map((url) => url.pathname)).toEqual(["/youtube/v3/search", "/youtube/v3/videos"]);
    expect(item.metadata).toEqual({ provider: "youtube_data_api_v3", videoId: "v1", channelId: "c1", publishedAt: "2026-01-02T03:04:05Z", viewCount: 42 });
    expect(item.transcriptState).toBe("transcript_required");
    expect(() => assertReadyForAnalysis(item, "autopsy")).toThrow(TrendTranscriptRequiredError);
    expect(() => assertReadyForAnalysis(item, "feed")).toThrow(TrendTranscriptRequiredError);
    expect(() => assertReadyForAnalysis(item, "spin")).toThrow(TrendTranscriptRequiredError);
    expect(() => assertReadyForAnalysis(createCandidate({ id: "unavailable", source: "youtube", transcriptState: "transcript_unavailable" }), "feed")).toThrow(TrendTranscriptRequiredError);
  });

  it.each([
    { id: "v1", snippet: { channelId: "c1", publishedAt: "not-a-time" }, statistics: { viewCount: "42" } },
    { id: "v1", snippet: { channelId: "c1", publishedAt: "2026-02-30T03:04:05Z" }, statistics: { viewCount: "42" } },
    { id: "v1", snippet: { channelId: "c1", publishedAt: "2026-01-02T03:04:05Z" }, statistics: { viewCount: "9007199254740992" } },
    { id: "v1", snippet: { channelId: "c1", publishedAt: "2026-01-02T03:04:05Z" }, statistics: { viewCount: "4.2" } },
  ])("fails closed on malformed or unsafe Data API metadata", async (video) => {
    await expect(youtube.discover({
      apiKey: "fixture-key",
      query: "camera setup",
      http: async (url) => url.pathname.endsWith("/search") ? { items: [{ id: { videoId: "v1" } }] } : { items: [video] },
    })).rejects.toThrow(YouTubeMetadataError);
  });

  it.each([
    { apiKey: "", query: "camera setup" },
    { apiKey: "fixture-key", query: "   " },
  ])("refuses missing discovery authority or query before outbound HTTP", async (input) => {
    let calls = 0;
    await expect(youtube.discover({
      ...input,
      http: async () => {
        calls += 1;
        return {};
      },
    })).rejects.toThrow(YouTubeMetadataError);
    expect(calls).toBe(0);
  });

  it("does not widen private transcripts and requires affirmative shared-analysis rights", () => {
    const privateItem = createCandidate({
      id: "private",
      source: "submitted",
      transcript: "creator pasted this",
      rightsScope: "profile_private",
      profileId: "p1",
    });
    expect(() => assertAccessibleFor(privateItem, "p2")).toThrow(TrendAccessError);
    expect(() => assertAccessibleFor(privateItem, "p1")).not.toThrow();
    const sharedItem = createCandidate({
      id: "shared",
      source: "submitted",
      transcript: "creator opted into analysis sharing",
      rightsScope: "shared_analysis",
      profileId: "p1",
    });
    expect(() => assertAccessibleFor(sharedItem, "p2")).not.toThrow();
  });
});

describe("R4: submitted transcripts use the reference-intake port", () => {
  it("passes the transcript and URL to the injected reference path", async () => {
    const calls: unknown[] = [];
    await submitted.submit({
      profileId: "p1",
      url: "https://www.youtube.com/watch?v=abc",
      transcript: "quoted third-party transcript",
      referenceIntake: {
        async intakeReferenceTranscript(input) {
          calls.push(input);
          return { accepted: true, referenceInputId: "ref1" };
        },
      },
    });
    expect(calls).toEqual([
      { profileId: "p1", sourceUrl: "https://www.youtube.com/watch?v=abc", transcript: "quoted third-party transcript" },
    ]);
  });

  it("propagates a quote-budget refusal without creating a bypass", async () => {
    await expect(
      submitted.submit({
        profileId: "p1",
        url: "https://youtu.be/abc",
        transcript: "too much quotation",
        referenceIntake: { async intakeReferenceTranscript() { return { accepted: false, reason: "quote_budget_exceeded" }; } },
      })
    ).rejects.toMatchObject({ code: "quote_budget_exceeded" });
  });

  it("HAS A PRODUCTION CALLER (slice 8c, R-96/R-98): `@respin/credits` implements the port over the metered paste", () => {
    // This package depends on nothing and must not import `@respin/credits`
    // (the edge runs `credits -> db`), so the production adapter's SHAPE is
    // asserted against `ReferenceIntakePort` where the adapter lives
    // (`packages/credits/tests/pasted-reference.test.ts`, `const port:
    // ReferenceIntakePort = pastedReferenceIntakePort(...)`, driven end to
    // end through `submitted.submit`). What THIS package can witness is that
    // the adapter exists and composes the metered writer — read from the file,
    // in the same action that claims it, so the R4 row on the slice card is
    // no longer "port defined, never implemented".
    const adapter = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "..", "credits", "src", "pasted-reference.ts"),
      "utf8"
    );
    expect(adapter).toMatch(/export function pastedReferenceIntakePort\(/);
    expect(adapter).toMatch(/async intakeReferenceTranscript\(input\)/);
    expect(adapter).toMatch(/await submitPastedReference\(/);
    expect(adapter).toMatch(/accepted: true, referenceInputId/);
    // ...and it never fabricates the port's one refusal reason: the only place
    // the literal appears in that file is the TYPE of the port it implements.
    const fabricated = adapter.match(/reason: "quote_budget_exceeded"/g) ?? [];
    expect(fabricated, "the production port must not relabel a refusal as a quote-budget one").toHaveLength(1);
  });
});

describe("R5-R7: honest outlier score and retained stale state", () => {
  it.each([
    [[1, 9, 5], 5],
    [[1, 9, 5, 7], 6],
  ] as const)("uses the median for %j", (views, expected) => {
    expect(medianRecentViews(views)).toBe(expected);
  });

  const CURRENT = { videoId: "current", channelId: "c1", viewCount: 200, publishedAt: "2026-03-01T12:00:00.000Z" };
  const prior = (videoId: string, viewCount: number, publishedAt: string, channelId = "c1") => ({ videoId, channelId, viewCount, publishedAt });

  it("derives ratio, denominator AND the window from the observations actually used (REQ-E02)", () => {
    expect(scoreOutlier({
      current: CURRENT,
      history: [
        prior("a", 20, "2026-02-10T00:00:00.000Z"),
        prior("b", 100, "2026-01-20T00:00:00.000Z"),
        prior("c", 80, "2026-02-25T00:00:00.000Z"),
      ],
    })).toEqual({
      ratio: 2.5,
      baseline: 80,
      // startsAt = the EARLIEST selected baseline instant; endsAt = the current
      // video's own instant. Neither is caller-supplied. `videoIds` are in
      // SELECTION order (most recent first), not the order the caller passed.
      window: { channelId: "c1", sampleSize: 3, videoIds: ["c", "a", "b"], startsAt: "2026-01-20T00:00:00.000Z", endsAt: "2026-03-01T12:00:00.000Z" },
    });
    expect(scoreOutlier({ current: CURRENT, history: [] })).toEqual({
      ratio: null, baseline: null,
      window: { channelId: "c1", sampleSize: 0, videoIds: [], startsAt: "2026-03-01T12:00:00.000Z", endsAt: "2026-03-01T12:00:00.000Z" },
    });
  });

  it("names its selection rule as a constant, SELECTS by it, and REFUSES what is not the channel's prior output (BASELINE_RECENT_OBSERVATIONS)", () => {
    expect(BASELINE_RECENT_OBSERVATIONS).toEqual({ maxSampleSize: 10, maxSpanDays: 90 });
    expect(Object.isFrozen(BASELINE_RECENT_OBSERVATIONS)).toBe(true);
    // Published AFTER the current video: not the channel's prior output.
    expect(() => scoreOutlier({ current: CURRENT, history: [prior("later", 50, "2026-03-02T00:00:00.000Z")] }))
      .toThrow(/published before the current video/);
    // The SAME instant is not "before" either (and would collapse the window).
    expect(() => scoreOutlier({ current: CURRENT, history: [prior("same", 50, CURRENT.publishedAt)] }))
      .toThrow(/published before the current video/);
    // Older than the span: a different era of the channel — NOT SELECTED (the
    // span is the rule's own policy), so a lone old video yields no baseline.
    expect(scoreOutlier({ current: CURRENT, history: [prior("old", 50, "2025-11-30T00:00:00.000Z")] }))
      .toMatchObject({ ratio: null, baseline: null, window: { sampleSize: 0, videoIds: [] } });
    // Exactly at the span boundary is admitted (the rule is inclusive there).
    expect(scoreOutlier({ current: CURRENT, history: [prior("edge", 50, "2025-12-01T12:00:00.000Z")] }).window.startsAt)
      .toBe("2025-12-01T12:00:00.000Z");
    // More than maxSampleSize: the TEN MOST RECENT are selected, whatever
    // order the caller passed them in; the eleventh (the oldest) is not.
    const eleven = Array.from({ length: 11 }, (_, i) => prior(`v${i}`, 50, `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`));
    const selected = scoreOutlier({ current: CURRENT, history: eleven });
    expect(selected.window.sampleSize).toBe(10);
    expect(selected.window.videoIds).toEqual(["v10", "v9", "v8", "v7", "v6", "v5", "v4", "v3", "v2", "v1"]);
    expect(selected.window.startsAt).toBe("2026-02-02T00:00:00.000Z");
    expect(scoreOutlier({ current: CURRENT, history: [...eleven].reverse() }).window).toEqual(selected.window);
    // Same-instant ties are broken by videoId ascending, deterministically.
    const tied = [prior("b", 1, "2026-02-20T00:00:00.000Z"), prior("a", 2, "2026-02-20T00:00:00.000Z")];
    expect(selectBaseline({ current: CURRENT, history: tied }).map((o) => o.videoId)).toEqual(["a", "b"]);
    expect(selectBaseline({ current: CURRENT, history: [...tied].reverse() }).map((o) => o.videoId)).toEqual(["a", "b"]);
  });

  it("membership is the scorer's, not the caller's: thirty admissible priors score the SAME ratio in any order (learning gate round 2)", () => {
    // The probe from the review: one channel, thirty admissible priors, the
    // ten most recent scoring 1.82 and the ten highest-view scoring 0.39 —
    // both accepted under the old cap, because WHICH ten was caller-chosen.
    // Most recent ten (i 0..9): views with median 110 -> 200/110 = 1.82.
    // Older twenty (i 10..29): the ten highest have median 512.5 -> 0.39.
    const recentViews = [140, 80, 110, 130, 90, 110, 120, 100, 105, 115];
    const olderViews = [300, 310, 320, 330, 340, 350, 360, 370, 380, 390, 490, 495, 500, 505, 510, 515, 520, 525, 530, 535];
    const thirty = Array.from({ length: 30 }, (_, i) => prior(
      `h${String(i).padStart(2, "0")}`,
      i < 10 ? recentViews[i]! : olderViews[i - 10]!,
      new Date(Date.parse(CURRENT.publishedAt) - (i + 1) * 86_400_000).toISOString(),
    ));
    const fromAll = scoreOutlier({ current: CURRENT, history: thirty });
    expect(fromAll.ratio).toBeCloseTo(1.82, 2);
    expect(fromAll.baseline).toBe(110);
    expect(fromAll.window.sampleSize).toBe(10);
    expect(fromAll.window.videoIds).toEqual(Array.from({ length: 10 }, (_, i) => `h${String(i).padStart(2, "0")}`));
    // Caller order is irrelevant: highest-view-first, reversed, shuffled by id
    // — the SAME ten, the same window, the same ratio.
    const byViewsDesc = [...thirty].sort((a, b) => b.viewCount - a.viewCount);
    expect(scoreOutlier({ current: CURRENT, history: byViewsDesc })).toEqual(fromAll);
    expect(scoreOutlier({ current: CURRENT, history: [...thirty].reverse() })).toEqual(fromAll);
    // ...and no order of the full history reaches the 0.39 the old code
    // accepted from a hand-picked ten.
    expect(fromAll.ratio).not.toBeCloseTo(0.39, 2);
    // THE BOUNDARY THE SCORER CANNOT SEE, stated rather than hidden: a caller
    // that OMITS the recent videos and passes only the ten highest still gets
    // 0.39, because those ten are admissible and the scorer has no way to know
    // twenty more exist. That is the producer's contract (outlier.ts docblock).
    expect(scoreOutlier({ current: CURRENT, history: byViewsDesc.slice(0, 10) }).ratio).toBeCloseTo(0.39, 2);
  });

  it("has no minimum n: a one-video baseline is scored and its sampleSize says so (a stated position, not a floor)", () => {
    expect(scoreOutlier({ current: CURRENT, history: [prior("only", 50, "2026-02-01T00:00:00.000Z")] }))
      .toMatchObject({ ratio: 4, baseline: 50, window: { sampleSize: 1, videoIds: ["only"] } });
  });

  it.each([
    { current: CURRENT, history: [prior("current", 50, "2026-02-01T00:00:00.000Z")] },
    { current: CURRENT, history: [prior("a", 50, "2026-02-01T00:00:00.000Z", "other")] },
    { current: CURRENT, history: [prior("a", Number.NaN, "2026-02-01T00:00:00.000Z")] },
    { current: CURRENT, history: [prior("a", 50, "2026-02-01T00:00:00")] },
    { current: CURRENT, history: [prior("dup", 50, "2026-02-01T00:00:00.000Z"), prior("dup", 60, "2026-02-02T00:00:00.000Z")] },
    { current: { ...CURRENT, publishedAt: "not an instant" }, history: [] },
  ])("fails closed rather than filtering an invalid baseline observation", (input) => {
    expect(() => scoreOutlier(input)).toThrow(OutlierInputError);
  });

  it("marks stale rather than deleting the item", () => {
    const item = createCandidate({ id: "keep", source: "youtube" });
    expect(markStale(item)).toMatchObject({ id: "keep", staleness: "stale" });
  });

  it("reports saturation as measured prevalence with its exact population and method", () => {
    expect(measureSaturation({
      matchingItems: 2,
      populationSize: 8,
      window: { startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-01-08T00:00:00Z" },
      methodVersion: "saturation-v1",
    })).toEqual({
      status: "measured",
      matchingItems: 2,
      populationSize: 8,
      prevalence: 0.25,
      window: { startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-01-08T00:00:00Z" },
      methodVersion: "saturation-v1",
    });
  });

  it("returns unmeasured when provenance is incomplete and refuses invalid denominator arithmetic", () => {
    expect(measureSaturation({ matchingItems: 1 } as never)).toEqual({ status: "unmeasured", reason: "incomplete_provenance" });
    expect(() => measureSaturation({
      matchingItems: 9,
      populationSize: 8,
      window: { startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-01-08T00:00:00Z" },
      methodVersion: "saturation-v1",
    })).toThrow(SaturationMeasurementError);
  });
});

describe("R8: autopsy order and scope-safe cache identity", () => {
  const validStageResult = (stage: Parameters<AutopsyModelPort["analyse"]>[0]): AutopsyStageResult => {
    switch (stage) {
      case "hook_mechanic":
        return { stage, hookMechanic: "Pattern interrupt", subjectTerms: ["camera", "setup"], hook: "Your camera setup is wasting time" };
      case "beats":
        return { stage, beats: ["show the friction", "reveal the fix"], beatCount: 2, turnBeat: 1 };
      case "ending":
        return { stage, ending: "End with the before-and-after contrast" };
      case "follow_trigger":
        return { stage, followTrigger: "Ask viewers to compare their setup" };
    }
  };

  it("runs hook mechanic, beats, ending, follow trigger in order and caches only an authorized identity", async () => {
    const order: string[] = [];
    let previousCompleted = true;
    const model: AutopsyModelPort = { async analyse(stage) {
      expect(previousCompleted, `started ${stage} before the prior stage completed`).toBe(true);
      previousCompleted = false;
      await Promise.resolve();
      previousCompleted = true;
      order.push(stage);
      return validStageResult(stage);
    } };
    const values = new Map<string, Promise<Awaited<ReturnType<typeof autopsy>>>>();
    const store: AutopsyStorePort = { async getOrCreate(key, create) {
      const existing = values.get(key);
      if (existing) return existing;
      const created = create();
      values.set(key, created);
      return created;
    } };
    const input = { transcript: "same source", contentDigest: "digest", analysisVersion: "v1" as const, rightsScope: "profile_private" as const, profileId: "p1" };
    const [first, second] = await Promise.all([autopsy(input, model, store), autopsy(input, model, store)]);
    expect(order).toEqual(["hook_mechanic", "beats", "ending", "follow_trigger"]);
    expect(second).toEqual(first);
    expect(cacheKeyFor(input)).not.toEqual(cacheKeyFor({ ...input, profileId: "p2" }));
    expect(cacheKeyFor({ ...input, rightsScope: "shared_analysis", profileId: "p1" })).toEqual(cacheKeyFor({ ...input, rightsScope: "shared_analysis", profileId: "p2" }));
  });

  it.each([
    { stage: "hook_mechanic" as const, result: { stage: "hook_mechanic" as const, hookMechanic: "Pattern", subjectTerms: [], hook: "A hook" } },
    { stage: "hook_mechanic" as const, result: { stage: "hook_mechanic" as const, hookMechanic: "Pattern", subjectTerms: ["camera"], hook: "x".repeat(801) } },
    { stage: "beats" as const, result: { stage: "beats" as const, beats: ["one"], beatCount: 1, turnBeat: 1 } },
  ])("refuses malformed or oversized stage analysis before caching", async ({ stage: invalidStage, result }) => {
    const model: AutopsyModelPort = {
      async analyse(stage) {
        return stage === invalidStage ? result : validStageResult(stage);
      },
    };
    const store: AutopsyStorePort = { async getOrCreate(_key, create) { return create(); } };
    await expect(autopsy({ transcript: "source", contentDigest: "digest", analysisVersion: "v1", rightsScope: "profile_private", profileId: "p1" }, model, store)).rejects.toThrow(AutopsyAnalysisError);
  });

  it("refuses a malformed cached analysis instead of passing it to persistence or Spin", async () => {
    const store: AutopsyStorePort = { async getOrCreate() { return {} as Awaited<ReturnType<typeof autopsy>>; } };
    const model: AutopsyModelPort = { async analyse(stage) { return validStageResult(stage); } };
    await expect(autopsy({ transcript: "source", contentDigest: "digest", analysisVersion: "v1", rightsScope: "profile_private", profileId: "p1" }, model, store)).rejects.toThrow(AutopsyAnalysisError);
  });
});

describe("R9/R10: this package carries no framework-proposal authority of its own", () => {
  // THE DB ADAPTER IS THE AUTHORITY (compliance + learning gates, 2026-09-03).
  // `proposeFramework`/`sanitizeMechanismText` used to live here with no
  // production caller — a second sanitizer waiting to drift from the real
  // REQ-D04 control, `packages/db/src/frameworks.ts` `resolveAutopsyFramework`
  // -> `prepareContent` -> `assertMechanismLevel`, which the finalize
  // transaction runs (`system-spend.ts`) and `packages/db/tests/frameworks.test.ts`
  // witnesses with a planted "40,000 views for @alice" refused before
  // persistence. This block now guards the ABSENCE: no file under this
  // package's src declares a mechanism sanitizer or proposal writer.
  const SECOND_AUTHORITY = /\b(?:sanitiz\w*Mechanism\w*|proposeFramework|prepareContent|assertMechanismLevel|handoffProposedMechanism)\b/;
  const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const srcFiles = readdirSync(srcDir).filter((name) => name.endsWith(".ts"));

  it("NON-VACUITY: the scan finds a planted sanitizer declaration", () => {
    expect(SECOND_AUTHORITY.test("export function sanitizeMechanismText(value: string) {")).toBe(true);
    expect(SECOND_AUTHORITY.test("export async function proposeFramework(input: {")).toBe(true);
  });

  it("declares no mechanism sanitizer or framework-proposal writer in src", () => {
    expect(srcFiles.length).toBeGreaterThanOrEqual(6);
    expect(srcFiles).not.toContain("framework-proposal.ts");
    const offenders = srcFiles.filter((name) => SECOND_AUTHORITY.test(readFileSync(join(srcDir, name), "utf8")));
    expect(offenders).toEqual([]);
  });
});
