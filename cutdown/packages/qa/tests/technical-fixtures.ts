import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseQaRuleset, type QaRuleset, type RenderMeasurements } from '../src/technical/model.js';
import type { QaContext } from '../src/technical/checks.js';

const here = dirname(fileURLToPath(import.meta.url));
/** `packages/qa/dist/tests` → `cutdown/`. */
export const WORKSPACE_ROOT = join(here, '..', '..', '..', '..');

export const SHIPPED_RULESET: QaRuleset = parseQaRuleset(
  readFileSync(join(WORKSPACE_ROOT, 'data', 'rulesets', 'technical-qa-v1.yaml'), 'utf8'),
  'data/rulesets/technical-qa-v1.yaml',
);

export const OVERLAY = JSON.parse(
  readFileSync(
    join(WORKSPACE_ROOT, 'data', 'platform-capabilities', 'overlays', 'tiktok', 'organic-video', '2026-07.json'),
    'utf8',
  ),
) as QaContext['overlay'];

/**
 * A render that passes every check.
 *
 * This is the NEGATIVE CONTROL the acceptance criterion requires: each check's
 * positive fixture is this object with exactly one field disturbed, so a check
 * that fires on the clean baseline is caught by the very first assertion rather
 * than by the reader noticing an odd result three checks later.
 */
export function cleanMeasurements(): RenderMeasurements {
  return {
    filePresent: true,
    sizeBytes: 1_234_567,
    corruption: 'clean',
    width: 720,
    height: 1280,
    durationMs: 4000,
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    blackRuns: [],
    frozenRuns: [],
    duplicateFrameCount: 2,
    frameCount: 120,
    silenceRuns: [],
    peakDbfs: -3.2,
    loudness: { kind: 'measured', integratedLufs: -14.1, truePeakDbtp: -1.8, loudnessRangeLu: 4.2 },
    avStartOffsetMs: 0,
    contentRect: { width: 720, height: 1280 },
    captionFiles: { ass: true, srt: true, vtt: true },
  };
}

export function cleanContext(): QaContext {
  return {
    ruleset: SHIPPED_RULESET,
    overlay: OVERLAY,
    expected: {
      width: 720,
      height: 1280,
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      hasAudio: true,
      targetLoudnessLufs: -14,
      maxTruePeakDbtp: -1,
      normalise: true,
    },
    plannedDurationMs: 4000,
    aspectTreatmentMode: 'blurred_background',
    captions: [
      { index: 1, startMs: 0, endMs: 2000, displayText: 'a short caption', lines: ['a short caption'] },
      { index: 2, startMs: 2000, endMs: 4000, displayText: 'the second caption', lines: ['the second caption'] },
    ],
    captionReviewFlags: [],
    // The renderer's real defaults for a 720x1280 canvas: 0.038 of height for the
    // font, 0.24 of height and 0.18 of width for the margins. Hard-coded rather
    // than imported so a change to the renderer's geometry shows up here as a
    // failing safe-zone test instead of silently moving the baseline with it.
    captionStyle: { fontSizePx: 49, marginVerticalPx: 307, marginHorizontalPx: 130 },
    sourceRangeViolations: [],
    nonSpeechEvents: [],
    minResolution: { width: 720, height: 1280 },
  };
}
