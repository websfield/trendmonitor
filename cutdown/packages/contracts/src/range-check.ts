/**
 * Source-bounds validation — the SINGLE implementation (Phase 2 task 10).
 *
 * PRD REQ-019: *no generated EDL may reference media outside the source range.*
 * tech-spec §12 names the property test over this module as the mechanism behind
 * the Phase 0 exit criterion **"zero invalid source ranges in final renders"**.
 *
 * There is deliberately **one** implementation, in TypeScript, with three callers:
 *   - `cutdown index`   — a deterministic post-step over every generated Moment (Phase 2)
 *   - `validate`        — EDL ranges (Phase 3)
 *   - render preflight  — (Phase 4)
 *
 * The Python indexer does **not** reimplement this; its test suite drives this
 * code through the CLI (`workers/indexer-python/tests/test_bounds.py`). A second
 * implementation in a second language is a second set of rounding rules, and the
 * two would drift silently — the exit criterion would then measure whichever
 * validator happened to run.
 *
 * ## Why BigInt and not numbers
 *
 * A range and the asset duration need not share a timebase (a 48 kHz audio range
 * against a 30 fps video duration is routine, per timecode-v1). Comparing them
 * means cross-multiplying, which overflows `Number`'s exact-integer range
 * (2^53) for long assets at fine timebases — and a float comparison that is
 * wrong by one tick is exactly the defect this module exists to catch. All
 * arithmetic here is exact.
 *
 * ## Why it never throws
 *
 * It runs over *generated* output — model-proposed EDL ranges included. A
 * validator that throws on malformed input cannot be run over untrusted data;
 * it would turn a finding into a crash. Every failure is a reported violation.
 */

/** A `{num, den}` seconds-per-tick rational (timecode-v1 `Timebase`). */
export interface Timebase {
  num: number;
  den: number;
}

/** `ticks` counted in `timebase` (timecode-v1 `MediaTime`). */
export interface MediaTime {
  ticks: number;
  timebase: Timebase;
}

/** A half-open `[startTicks, endTicks)` range into one asset (timecode-v1 `SourceRange`). */
export interface SourceRange {
  assetId: string;
  startTicks: number;
  endTicks: number;
  timebase: Timebase;
}

/**
 * The bound to validate against: the asset's identity and its **preflighted**
 * duration (`source-asset-v1` → `preflight.duration`). `null` duration means
 * preflight could not establish one.
 */
export interface AssetBounds {
  assetId: string;
  duration: MediaTime | null;
}

export type RangeViolationCode =
  /** The value is not a structurally valid SourceRange at all. */
  | 'MALFORMED_RANGE'
  /** The range indexes into a different asset than the one supplying the bound. */
  | 'ASSET_ID_MISMATCH'
  /** Ticks are counts; a fraction or NaN is a category error. */
  | 'NON_INTEGER_TICKS'
  | 'NEGATIVE_TICKS'
  /** A timebase must be a positive rational — `den: 0` would be a divide-by-zero. */
  | 'INVALID_TIMEBASE'
  /** `endTicks <= startTicks`. JSON Schema cannot express this (tech-spec §3 forbids if/then/else). */
  | 'EMPTY_OR_INVERTED_RANGE'
  /** The range reads past the asset's preflighted duration. */
  | 'EXCEEDS_SOURCE_DURATION'
  /** The bound is unknown, so in-bounds cannot be proven. Fail closed. */
  | 'UNKNOWN_SOURCE_DURATION';

export interface RangeViolation {
  code: RangeViolationCode;
  message: string;
}

export interface RangeCheckResult {
  ok: boolean;
  violations: RangeViolation[];
}

export interface IndexedRangeViolation extends RangeViolation {
  /** Position in the checked array, so a failure names *which* Moment. */
  index: number;
}

export interface BatchRangeCheckResult {
  ok: boolean;
  /** How many ranges were examined — the evidence the check actually ran, not that it found nothing. */
  checked: number;
  violations: IndexedRangeViolation[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `typeof null` is `'object'`, which is the least useful thing to tell a reader. */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

/**
 * A tick count must be a finite, **safe**, whole number.
 *
 * `Number.isSafeInteger`, not `Number.isInteger`: the BigInt arithmetic below is
 * exact, but the `Number` it converts FROM is not. Above 2^53 the value has
 * already been destroyed by `JSON.parse` before any comparison runs — a request
 * carrying `endTicks: 9007199254740993` arrives as `...992`, and a range one
 * tick past the end is then reported clean. That is precisely the defect this
 * module exists to catch, so an unrepresentable tick is rejected rather than
 * silently rounded. 2^53 ticks is ~5.9 years at 48 kHz but only ~104 days at a
 * nanosecond timebase, so this is a reachable input, not a theoretical one.
 */
function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isValidTimebase(value: unknown): value is Timebase {
  return (
    isPlainObject(value) &&
    isWholeNumber(value['num']) &&
    isWholeNumber(value['den']) &&
    (value['num'] as number) >= 1 &&
    (value['den'] as number) >= 1
  );
}

/**
 * Exact comparison of two rational instants, with no division and no floats.
 *
 *   a.ticks * a.num / a.den  ?  b.ticks * b.num / b.den
 *
 * Both denominators are positive (asserted before this is called), so
 * cross-multiplying preserves the inequality.
 *
 * @returns negative if a < b, 0 if equal, positive if a > b.
 */
function compareMediaTime(a: MediaTime, b: MediaTime): number {
  const left = BigInt(a.ticks) * BigInt(a.timebase.num) * BigInt(b.timebase.den);
  const right = BigInt(b.ticks) * BigInt(b.timebase.num) * BigInt(a.timebase.den);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Validate one range against one asset's bounds.
 *
 * Checks run in stages and **stop at the first failing stage**: a structurally
 * broken range is reported as broken rather than also being compared against a
 * duration, because the comparison would be meaningless and the extra violation
 * would bury the real cause.
 */
export function checkSourceRange(candidate: SourceRange, bounds: AssetBounds): RangeCheckResult {
  const fail = (code: RangeViolationCode, message: string): RangeCheckResult => ({
    ok: false,
    violations: [{ code, message }],
  });

  // --- Stage 0: the bound itself ------------------------------------------
  // Validated before the candidate: the named future callers (Phase 3 `validate`,
  // Phase 4 render preflight) look an asset up in a map, and a miss hands us
  // `undefined`. Reading `.assetId` off that would throw — breaking the
  // never-throws promise in the exact place it matters most.
  if (!isPlainObject(bounds)) {
    return fail(
      'MALFORMED_RANGE',
      `Expected AssetBounds with an assetId and a duration, received ${describe(bounds)}.`,
    );
  }

  // --- Stage 1: structure -------------------------------------------------
  if (!isPlainObject(candidate)) {
    return fail('MALFORMED_RANGE', `Expected a SourceRange object, received ${describe(candidate)}.`);
  }

  const structural: RangeViolation[] = [];
  const { assetId, startTicks, endTicks, timebase } = candidate as unknown as Record<string, unknown>;

  if (typeof assetId !== 'string' || assetId.length === 0) {
    structural.push({ code: 'MALFORMED_RANGE', message: 'SourceRange.assetId must be a non-empty string.' });
  }
  // A tick that is absent or not a number at all is a STRUCTURAL defect, not a
  // fractional one. Reporting `NON_INTEGER_TICKS` for `undefined` sends whoever
  // reads it looking for float arithmetic that was never there.
  if (typeof startTicks !== 'number' || typeof endTicks !== 'number') {
    structural.push({
      code: 'MALFORMED_RANGE',
      message: `SourceRange.startTicks and .endTicks must be numbers (received startTicks=${describe(startTicks)}, endTicks=${describe(endTicks)}).`,
    });
  } else if (!isWholeNumber(startTicks) || !isWholeNumber(endTicks)) {
    structural.push({
      code: 'NON_INTEGER_TICKS',
      message:
        `Ticks must be whole, safely-representable integers (received startTicks=${String(startTicks)}, endTicks=${String(endTicks)}). ` +
        'Ticks are counts, not measurements, and a value above 2^53 has already lost precision before it reached here.',
    });
  } else {
    if (startTicks < 0 || endTicks < 0) {
      structural.push({
        code: 'NEGATIVE_TICKS',
        message: `Ticks must be >= 0 (received startTicks=${startTicks}, endTicks=${endTicks}).`,
      });
    }
  }
  if (!isValidTimebase(timebase)) {
    structural.push({
      code: 'INVALID_TIMEBASE',
      message: 'SourceRange.timebase must be {num >= 1, den >= 1} integers.',
    });
  }

  if (structural.length > 0) return { ok: false, violations: structural };

  // Past this point every field is known-good.
  const range = candidate as SourceRange;

  // --- Stage 2: identity --------------------------------------------------
  if (range.assetId !== bounds.assetId) {
    return fail(
      'ASSET_ID_MISMATCH',
      `Range indexes asset ${range.assetId} but was checked against ${bounds.assetId}. A range is only meaningful against its own asset.`,
    );
  }

  // --- Stage 3: the inequality JSON Schema cannot express -----------------
  if (range.endTicks <= range.startTicks) {
    return fail(
      'EMPTY_OR_INVERTED_RANGE',
      `endTicks (${range.endTicks}) must be strictly greater than startTicks (${range.startTicks}); the range is half-open and must be non-empty.`,
    );
  }

  // --- Stage 4: source bounds --------------------------------------------
  const { duration } = bounds;
  if (duration === null || duration === undefined) {
    return fail(
      'UNKNOWN_SOURCE_DURATION',
      `Asset ${bounds.assetId} has no preflighted duration, so this range cannot be proven in bounds. Failing closed.`,
    );
  }
  if (!isWholeNumber(duration.ticks) || !isValidTimebase(duration.timebase)) {
    return fail('UNKNOWN_SOURCE_DURATION', `Asset ${bounds.assetId} has a malformed duration; failing closed.`);
  }

  const end: MediaTime = { ticks: range.endTicks, timebase: range.timebase };
  if (compareMediaTime(end, duration) > 0) {
    return fail(
      'EXCEEDS_SOURCE_DURATION',
      `Range ends at ${range.endTicks} tick(s) @ ${range.timebase.num}/${range.timebase.den}s, past the asset duration of ${duration.ticks} tick(s) @ ${duration.timebase.num}/${duration.timebase.den}s.`,
    );
  }

  return { ok: true, violations: [] };
}

/**
 * Validate a whole set — every Moment of a job, or every range of an EDL.
 *
 * Every range is checked (no short-circuit on first failure): a report that
 * names one bad Moment out of five sends the operator round the loop five times.
 */
export function checkSourceRanges(candidates: readonly SourceRange[], bounds: AssetBounds): BatchRangeCheckResult {
  const violations: IndexedRangeViolation[] = [];

  // Same reasoning as the bounds guard: a caller that resolved its range list
  // from a lookup can hand us `undefined`, and `.forEach` on that throws.
  if (!Array.isArray(candidates)) {
    return {
      ok: false,
      checked: 0,
      violations: [
        {
          index: 0,
          code: 'MALFORMED_RANGE',
          message: `Expected an array of SourceRange, received ${describe(candidates)}.`,
        },
      ],
    };
  }

  candidates.forEach((candidate, index) => {
    for (const violation of checkSourceRange(candidate, bounds).violations) {
      violations.push({ ...violation, index });
    }
  });

  return { ok: violations.length === 0, checked: candidates.length, violations };
}
