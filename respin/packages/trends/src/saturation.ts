export type SaturationWindow = Readonly<{ startsAt: string; endsAt: string }>;
export type SaturationMeasurement =
  | Readonly<{
      status: "measured";
      matchingItems: number;
      populationSize: number;
      prevalence: number;
      window: SaturationWindow;
      methodVersion: string;
    }>
  | Readonly<{ status: "unmeasured"; reason: "incomplete_provenance" }>;

export class SaturationMeasurementError extends Error {}

type SaturationInput = Readonly<{
  matchingItems: number;
  populationSize: number;
  window: SaturationWindow;
  methodVersion: string;
}>;

function isUtcInstant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.+Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Construct the only R7 display/storage shape. There are intentionally no
 * low/medium/high labels: a label without a population and threshold evidence
 * is a claim, whereas this value carries its measured prevalence and provenance.
 *
 * V1 HAS NO SATURATION METHOD (learning gate CHANGE 5, 2026-09-03). This
 * function VALIDATES caller-supplied counts; nothing in the product counts a
 * population over stored rows, and no `methodVersion` string exists anywhere
 * in production code — so the `measured` branch below is reachable only from
 * a fixture, and every `trend_items` row the product can write today is
 * `unmeasured: incomplete_provenance`. That is the honest default the storage
 * CHECK and the UI already enforce (R-91); the counting query, its named
 * method constant and its population definition are future work and are not
 * claimed. See `packages/trends/README.md` §Saturation.
 */
export function measureSaturation(input: SaturationInput | undefined): SaturationMeasurement {
  if (
    !input ||
    !Number.isSafeInteger(input.matchingItems) ||
    !Number.isSafeInteger(input.populationSize) ||
    !input.window ||
    !isUtcInstant(input.window.startsAt) ||
    !isUtcInstant(input.window.endsAt) ||
    typeof input.methodVersion !== "string" ||
    input.methodVersion.trim().length === 0
  ) {
    return { status: "unmeasured", reason: "incomplete_provenance" };
  }
  if (input.populationSize <= 0 || input.matchingItems < 0 || input.matchingItems > input.populationSize) {
    throw new SaturationMeasurementError("Saturation matching count must be within its non-zero population");
  }
  if (Date.parse(input.window.startsAt) >= Date.parse(input.window.endsAt)) {
    throw new SaturationMeasurementError("Saturation window must be bounded in increasing time order");
  }
  return {
    status: "measured",
    matchingItems: input.matchingItems,
    populationSize: input.populationSize,
    prevalence: input.matchingItems / input.populationSize,
    window: input.window,
    methodVersion: input.methodVersion,
  };
}
