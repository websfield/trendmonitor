// REQ-E02: `outlier_ratio = video_views / channel_median_recent_views`, against
// the CHANNEL'S OWN baseline, never absolute views — with the baseline's
// comparability rule COMPUTED here rather than supplied by the caller
// (learning gate CHANGE 3, 2026-09-03: the window was caller-written and
// "recent" was undefined — no n, no day span, no citation; learning gate round
// 2: the cap fixed n and span but not MEMBERSHIP — which ten of thirty
// admissible priors was still the caller's choice, and the ten highest-view
// priors scored 0.39 where the ten most recent scored 1.82).

/** An ISO-8601 UTC instant (`...Z`), the same shape `saturation.ts` accepts. */
function isUtcInstant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.+Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

export type ChannelViewObservation = Readonly<{
  videoId: string;
  channelId: string;
  viewCount: number;
  /** When the video was published (UTC instant). The window is derived from these. */
  publishedAt: string;
}>;

/**
 * WHAT "RECENT" MEANS, as one named rule (REQ-E02 "channel_median_recent_views").
 *
 * THE SELECTION: the baseline is the `maxSampleSize` most recently published
 * admissible prior videos of the channel — ordered by `publishedAt`
 * descending, ties broken by `videoId` ascending so the choice is
 * deterministic — where "admissible" means published strictly BEFORE the
 * current video and no more than `maxSpanDays` before it. `scoreOutlier`
 * performs this selection ITSELF over the whole history it is handed: a
 * caller passes every prior observation it holds and cannot choose which ten
 * are used, in which order, or how many. An older-than-span observation is
 * simply not selected (the span is this rule's own policy); a LATER-published
 * observation, another channel's, the current video itself, a duplicate or a
 * malformed one is REFUSED, because those are not "the channel's prior
 * output" at all and a history containing them is the wrong population, not a
 * wide one.
 *
 * WHAT THE SCORER CANNOT SEE: an observation the caller never passed. The
 * selection defends against a chosen SUBSET of a history the scorer is
 * given; it cannot detect an OMITTED recent video. That half of the rule is
 * the producer's contract — when a producer exists (T-15), its test must show
 * it passes the channel's whole prior history, not a filtered one.
 *
 * MINIMUM n — THERE IS NO FLOOR, stated as a position rather than an
 * oversight: a channel with one admissible prior video gets a ratio over that
 * one video, `sampleSize` is stored (`baselineSampleSize`) and the feed
 * displays it ("from 1 recent items"), so the reader sees exactly how thin
 * the denominator is. A floor is not added because no data exists to choose
 * one, and hiding the ratio would hide the number the UI is built to label.
 * The revisit trigger below is where that position is re-examined.
 *
 * AN UNMEASURED LAUNCH CHOICE, stated as such: neither PRD §4E nor tech-spec §4
 * gives n or a span, and no live channel data exists yet (T-15) to calibrate
 * one. Ten prior videos within ninety days is the smallest rule that (a) caps
 * the median at a handful the reader can reason about and (b) does not compare
 * a video with a channel's output from a different era. Revisit trigger: the
 * first T-15 refresh with real channel histories, or the first item whose
 * channel has fewer than three admissible prior videos — whichever comes
 * first.
 */
export const BASELINE_RECENT_OBSERVATIONS = Object.freeze({
  maxSampleSize: 10,
  maxSpanDays: 90,
});

/**
 * The data window, DERIVED from the observations actually used: `startsAt` is
 * the earliest selected baseline publish instant, `endsAt` is the current
 * video's own publish instant (every selected observation precedes it). With
 * no baseline the window collapses to the current instant and the ratio is
 * `null` — never zero, never absolute views. `videoIds` are in selection
 * order (most recent first).
 */
export type OutlierWindow = Readonly<{
  channelId: string;
  sampleSize: number;
  videoIds: readonly string[];
  startsAt: string;
  endsAt: string;
}>;
export type OutlierScore = Readonly<{ ratio: number | null; baseline: number | null; window: OutlierWindow }>;

export class OutlierInputError extends Error {}

const DAY_MS = 86_400_000;

function assertSafeObservation(observation: ChannelViewObservation): void {
  if (!observation.videoId || !observation.channelId) throw new OutlierInputError("Video and channel ids are required");
  if (!Number.isSafeInteger(observation.viewCount) || observation.viewCount < 0) {
    throw new OutlierInputError("View count must be a non-negative safe integer");
  }
  if (!isUtcInstant(observation.publishedAt)) {
    throw new OutlierInputError("Observation publishedAt must be a UTC instant");
  }
}

export function medianRecentViews(views: readonly number[]): number | null {
  if (views.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new OutlierInputError("Baseline observations must be non-negative safe integers");
  }
  const values = [...views].sort((a, b) => a - b);
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
}

/**
 * The selection, as its own function so a test can name it: refuses what is
 * not the channel's prior output, drops what is older than the span, and
 * takes the `maxSampleSize` most recent of the rest.
 */
export function selectBaseline(input: {
  current: ChannelViewObservation;
  history: readonly ChannelViewObservation[];
}): ChannelViewObservation[] {
  const currentAt = Date.parse(input.current.publishedAt);
  const earliestAdmissible = currentAt - BASELINE_RECENT_OBSERVATIONS.maxSpanDays * DAY_MS;
  const ids = new Set<string>();
  const admissible: { observation: ChannelViewObservation; at: number }[] = [];
  for (const observation of input.history) {
    assertSafeObservation(observation);
    if (observation.channelId !== input.current.channelId) throw new OutlierInputError("Baseline must be from the current video's channel");
    if (observation.videoId === input.current.videoId) throw new OutlierInputError("Current video cannot be in its own baseline");
    if (ids.has(observation.videoId)) throw new OutlierInputError("Baseline video ids must be unique");
    ids.add(observation.videoId);
    const at = Date.parse(observation.publishedAt);
    if (!(at < currentAt)) throw new OutlierInputError("Baseline observations must be published before the current video (BASELINE_RECENT_OBSERVATIONS)");
    if (at < earliestAdmissible) continue;
    admissible.push({ observation, at });
  }
  admissible.sort((a, b) => b.at - a.at || (a.observation.videoId < b.observation.videoId ? -1 : a.observation.videoId > b.observation.videoId ? 1 : 0));
  return admissible.slice(0, BASELINE_RECENT_OBSERVATIONS.maxSampleSize).map((entry) => entry.observation);
}

export function scoreOutlier(input: { current: ChannelViewObservation; history: readonly ChannelViewObservation[] }): OutlierScore {
  assertSafeObservation(input.current);
  const selected = selectBaseline(input);
  const currentAt = Date.parse(input.current.publishedAt);
  const startsAt = selected.reduce((earliest, observation) => Math.min(earliest, Date.parse(observation.publishedAt)), currentAt);
  const baseline = medianRecentViews(selected.map((observation) => observation.viewCount));
  return {
    ratio: baseline && baseline > 0 ? input.current.viewCount / baseline : null,
    baseline,
    window: {
      channelId: input.current.channelId,
      sampleSize: selected.length,
      videoIds: selected.map((observation) => observation.videoId),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(currentAt).toISOString(),
    },
  };
}
