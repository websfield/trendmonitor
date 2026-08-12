import { inputArgs, runFfmpeg, type RunOptions } from '@cutdown/renderer-core';
import type { RenderV2 } from '@cutdown/contracts/generated';

/**
 * Loudness and true-peak MEASUREMENT of a produced render (PRD REQ-085).
 *
 * Measured from the encoded output, never predicted from the mix plan. The
 * manifest states a target; this states what came out. If those two were allowed
 * to be the same number, a render whose normalisation silently failed would
 * report as compliant — which is the one thing a loudness report exists to rule
 * out.
 */

export type LoudnessReport = RenderV2.LoudnessMeasured | RenderV2.LoudnessUnavailable;

/**
 * `ebur128`'s end-of-run summary, e.g.
 *
 * ```
 * [Parsed_ebur128_0 @ 000001] Summary:
 *
 *   Integrated loudness:
 *     I:         -14.2 LUFS
 *     Threshold: -24.6 LUFS
 *
 *   Loudness range:
 *     LRA:         5.1 LU
 *     ...
 *
 *   True peak:
 *     Peak:       -1.6 dBFS
 * ```
 *
 * Parsed by labelled line rather than by position: the block's line ordering has
 * changed between FFmpeg releases, and a positional parse would read a threshold
 * as an integrated loudness without failing.
 */
export function parseEbur128Summary(stderr: string): LoudnessReport {
  const summaryIndex = stderr.lastIndexOf('Summary:');
  if (summaryIndex < 0) {
    return {
      kind: 'unavailable',
      reason: 'ffmpeg ebur128 produced no Summary block; loudness could not be measured.',
    };
  }
  const summary = stderr.slice(summaryIndex);
  const number = (label: string): number | null => {
    const match = new RegExp(`^\\s*${label}:\\s*(-?\\d+(?:\\.\\d+)?)\\s`, 'm').exec(summary);
    if (match === null) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  };

  const integrated = number('I');
  const lra = number('LRA');
  const peak = number('Peak');

  if (integrated === null || lra === null || peak === null) {
    const missing = [
      integrated === null ? 'I' : undefined,
      lra === null ? 'LRA' : undefined,
      peak === null ? 'Peak' : undefined,
    ].filter((v): v is string => v !== undefined);
    return {
      kind: 'unavailable',
      reason: `ffmpeg ebur128 Summary omitted ${missing.join(', ')}; a partial measurement is not reported as a measurement.`,
    };
  }

  // A silent track measures as -inf LUFS, which ebur128 prints as a large
  // negative sentinel. Reporting it as a number would let a fully silent render
  // present as "measured, just quiet"; the silence check should be the thing
  // that speaks about it.
  if (integrated <= -70) {
    return {
      kind: 'unavailable',
      reason: `Integrated loudness measured ${String(integrated)} LUFS, at or below the -70 LUFS gate: the audio track is effectively silent, so there is no loudness to report.`,
    };
  }

  return {
    kind: 'measured',
    integratedLufs: integrated,
    truePeakDbtp: peak,
    loudnessRangeLu: Math.max(0, lra),
  };
}

/** Measure the first audio stream of an encoded file. */
export async function measureLoudness(
  mediaPath: string,
  options: RunOptions = {},
): Promise<LoudnessReport> {
  const result = await runFfmpeg(
    [
      '-nostdin',
      '-hide_banner',
      ...inputArgs(mediaPath),
      '-map',
      '0:a:0?',
      '-af',
      'ebur128=peak=true',
      '-f',
      'null',
      '-',
    ],
    options,
  );
  return parseEbur128Summary(result.stderr);
}
