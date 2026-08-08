/**
 * Exact source→output timeline arithmetic (PRD REQ-082: frame-accurate edits,
 * timebase conversions recorded).
 *
 * Every number in this module is derived with `BigInt` rationals, never floats.
 * That is not defensive style — it is the same rule `range-check.ts` states and
 * for the same reason: a source range in a 1/48000 audio timebase, an asset
 * duration in a 1/15360 container timebase, and an output frame grid at
 * 30000/1001 fps have no common float representation, and a conversion that is
 * wrong by one tick is precisely the class of defect the "zero invalid source
 * ranges" exit criterion exists to catch.
 *
 * ## The one place a float would appear, and what is done instead
 *
 * FFmpeg's `trim` filter takes its boundaries as a *decimal seconds* string. The
 * exact rational is therefore rendered to a fixed 9 decimal places
 * (`exactSecondsString`) with the remainder truncated, so:
 *
 *   - the conversion is **deterministic** — the same range always produces the
 *     same string, on every machine, with no float rounding mode involved;
 *   - the residual error is bounded at 1 ns, i.e. ~3×10⁻⁸ of a frame at 30 fps,
 *     so it can never move a cut across a frame boundary;
 *   - exact values stay exact — a cut at frame 30 of 30000/1001 fps is
 *     `1.001000000`, not `1.0009999999999`.
 *
 * The conversion is recorded on every `PlannedClip` (REQ-082 "timebase
 * conversions recorded") rather than being an invisible step inside argv
 * assembly.
 */

export interface Timebase {
  readonly num: number;
  readonly den: number;
}

/**
 * A clip placed on the output timeline.
 *
 * Output positions are counted in FRAMES: the manifest's `output.frameRate` is a
 * seconds-per-tick rational whose tick *is* one frame, so an output tick index
 * and a frame index are the same integer. That identity is what makes "frame
 * accurate" checkable rather than aspirational — there is no rounding step
 * between the timeline model and the frame grid.
 */
export interface PlannedClip {
  readonly clipId: string;
  readonly assetId: string;
  readonly order: number;
  /** Absolute path to the media this clip reads (tier already resolved). */
  readonly mediaPath: string;
  readonly sourceStartTicks: number;
  readonly sourceEndTicks: number;
  readonly sourceTimebase: Timebase;
  /** The recorded REQ-082 conversion: exact source ticks → decimal seconds. */
  readonly sourceStartSeconds: string;
  readonly sourceEndSeconds: string;
  /** Inclusive start frame on the output timeline. */
  readonly outputStartFrame: number;
  /** Exclusive end frame on the output timeline. */
  readonly outputEndFrame: number;
}

const bigAbs = (v: bigint): bigint => (v < 0n ? -v : v);

/** `ticks` in `timebase`, as an exact rational number of seconds. */
export function ticksToSecondsRational(ticks: number, timebase: Timebase): {
  readonly numerator: bigint;
  readonly denominator: bigint;
} {
  assertPositiveRational(timebase);
  return {
    numerator: BigInt(ticks) * BigInt(timebase.num),
    denominator: BigInt(timebase.den),
  };
}

function assertPositiveRational(timebase: Timebase): void {
  if (
    !Number.isInteger(timebase.num) ||
    !Number.isInteger(timebase.den) ||
    timebase.num < 1 ||
    timebase.den < 1
  ) {
    throw new Error(
      `Timebase must be a positive integer rational; received {num: ${String(timebase.num)}, den: ${String(timebase.den)}}.`,
    );
  }
}

/** Decimal places used for every FFmpeg time argument. */
export const SECONDS_PRECISION = 9;

/**
 * Render an exact rational number of seconds as a fixed-precision decimal
 * string, truncating rather than rounding.
 *
 * Truncation, not rounding, because a truncated start can only ever move a cut
 * *earlier* by under a nanosecond, and `trim` selects frames with
 * `pts >= start`. Rounding up could push a boundary past a frame whose
 * timestamp is exactly the cut point — which is the common case, not the
 * exotic one, since editorial ranges land on frame boundaries by construction.
 */
export function exactSecondsString(numerator: bigint, denominator: bigint): string {
  if (denominator <= 0n) throw new Error('Denominator must be positive.');
  const negative = numerator < 0n;
  const n = bigAbs(numerator);
  const scale = 10n ** BigInt(SECONDS_PRECISION);
  const whole = n / denominator;
  const fraction = ((n % denominator) * scale) / denominator;
  const text = `${whole.toString()}.${fraction.toString().padStart(SECONDS_PRECISION, '0')}`;
  return negative ? `-${text}` : text;
}

/** `ticks` in `timebase` as the decimal seconds string FFmpeg receives. */
export function ticksToSecondsString(ticks: number, timebase: Timebase): string {
  const { numerator, denominator } = ticksToSecondsRational(ticks, timebase);
  return exactSecondsString(numerator, denominator);
}

/**
 * Frames per second implied by a seconds-per-tick output `frameRate`.
 * `{num: 1001, den: 30000}` (one frame = 1001/30000 s) is 30000/1001 fps.
 */
export function framesPerSecond(frameRate: Timebase): { readonly num: bigint; readonly den: bigint } {
  assertPositiveRational(frameRate);
  return { num: BigInt(frameRate.den), den: BigInt(frameRate.num) };
}

/**
 * How many output frames a source duration occupies, rounded half-up.
 *
 * Half-up rather than truncation because this is a *duration*, not a boundary:
 * truncating would systematically shorten every clip by up to one frame, and
 * across a ten-clip cut that accumulates into a visible sync error against the
 * captions — the exact drift REQ-084's ±40 ms A/V sync budget has to absorb.
 */
export function durationToFrames(
  startTicks: number,
  endTicks: number,
  sourceTimebase: Timebase,
  frameRate: Timebase,
): number {
  if (endTicks <= startTicks) {
    throw new Error(
      `Clip duration must be positive; received [${String(startTicks)}, ${String(endTicks)}).`,
    );
  }
  const fps = framesPerSecond(frameRate);
  const durationTicks = BigInt(endTicks) - BigInt(startTicks);
  // frames = durationTicks * tbNum/tbDen * fpsNum/fpsDen
  const numerator = durationTicks * BigInt(sourceTimebase.num) * fps.num;
  const denominator = BigInt(sourceTimebase.den) * fps.den;
  const frames = (2n * numerator + denominator) / (2n * denominator);
  return Number(frames < 1n ? 1n : frames);
}

/** Output frame index → exact milliseconds, rounded half-up. */
export function frameToMilliseconds(frame: number, frameRate: Timebase): number {
  assertPositiveRational(frameRate);
  const numerator = BigInt(frame) * BigInt(frameRate.num) * 1000n;
  const denominator = BigInt(frameRate.den);
  return Number((2n * numerator + denominator) / (2n * denominator));
}

/** Milliseconds as the exact fixed-precision seconds string FFmpeg receives. */
export function msToSecondsString(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0) {
    throw new Error(`Milliseconds must be a non-negative integer; received ${String(ms)}.`);
  }
  return exactSecondsString(BigInt(ms), 1000n);
}

/**
 * `seconds - ms`, both exact, as a fixed-precision seconds string.
 *
 * Used for a fade-out's start offset (`clipDuration - fadeOut`). Parsed and
 * subtracted as scaled BigInt integers so the result is deterministic to the
 * last printed digit — the same no-floats rule as every other number here.
 */
export function secondsStringMinusMs(seconds: string, ms: number): string {
  const match = /^([0-9]+)\.([0-9]{9})$/.exec(seconds);
  if (match === null) {
    throw new Error(`Expected a ${String(SECONDS_PRECISION)}-decimal seconds string; received "${seconds}".`);
  }
  const nanos = BigInt(match[1] as string) * 1_000_000_000n + BigInt(match[2] as string);
  const result = nanos - BigInt(ms) * 1_000_000n;
  if (result < 0n) {
    throw new Error(`Subtracting ${String(ms)} ms from ${seconds} s goes negative.`);
  }
  return exactSecondsString(result, 1_000_000_000n);
}
