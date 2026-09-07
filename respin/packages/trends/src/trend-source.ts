export const TREND_SOURCE_NAMES = ["youtube", "submitted"] as const;
export type TrendSourceName = (typeof TREND_SOURCE_NAMES)[number];

export type TrendSource = Readonly<{ name: TrendSourceName }>;

/** A fail-closed registry guard: compliant sources are a closed set, not a prefix. */
export function assertExactlyCompliantAdapters(registry: Record<string, TrendSource>): void {
  const names = Object.keys(registry).sort();
  if (names.length !== 2 || names[0] !== "submitted" || names[1] !== "youtube") {
    throw new Error("Trend adapters must be exactly youtube and submitted");
  }
}
