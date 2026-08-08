import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { TechnicalQaReportV1 } from '@cutdown/contracts/generated';

/**
 * Types and data loading for the technical QA gate (PRD REQ-100/084/104/106,
 * tech-spec §12.1, decisions.md D-35).
 *
 * The gate is split in three deliberately:
 *
 *   - **`measure.ts`** runs FFmpeg and returns numbers. It makes no judgements.
 *   - **`checks.ts`** turns numbers plus a ruleset into findings. It is pure —
 *     no filesystem, no subprocess — which is what makes the acceptance
 *     criterion ("every promised check has a positive AND a negative fixture")
 *     achievable at all: a table-driven suite can drive 23 checks through both
 *     outcomes in milliseconds, where a media-fixture-per-check suite would need
 *     46 rendered videos and would still be slower than anyone would run it.
 *   - **`gate.ts`** computes `gateStatus` from findings and waivers.
 *
 * The split also removes the temptation to let a check "just probe one more
 * thing" mid-judgement, which is how a deterministic gate acquires a dependency
 * on the machine it runs on.
 */

export type QaCheckId = TechnicalQaReportV1.QaCheckId;
export type TechnicalQaFinding = TechnicalQaReportV1.TechnicalQaFinding;
export type QaCheckRecord = TechnicalQaReportV1.QaCheckRecord;
export type TechnicalQaReport = TechnicalQaReportV1.TechnicalQaReport;
export type QaGateStatus = TechnicalQaReport['gateStatus'];

/**
 * Every check, in report order. Exported as a closed list so the coverage test
 * can assert that the implementation and the contract enum agree — a check in
 * the enum with no implementation would otherwise be reported as `ran` forever.
 */
export const ALL_CHECK_IDS = [
  'missing_media',
  'container_corruption',
  'source_range_validity',
  'output_dimensions',
  'output_duration',
  'codec_profile',
  'black_frames',
  'frozen_frames',
  'duplicate_frames',
  'crop_failure',
  'unexpected_silence',
  'audio_clipping',
  'loudness_target',
  'true_peak',
  'av_sync_drift',
  'caption_file_present',
  'caption_overflow',
  'caption_readability',
  'caption_timing',
  'caption_safe_zone',
  'caption_spelling',
  'caption_name_flag',
  'non_speech_cue_review',
] as const satisfies readonly QaCheckId[];

/**
 * The checks D-35 fixes as **non-waivable**, in code, as a floor the ruleset
 * cannot lower.
 *
 * The distinction this encodes: tech-spec §12.1 makes *thresholds* data, because
 * the numbers are guesses until real footage calibrates them. It does not make
 * *policy* data. D-35 names "source/timebase, corrupt/missing media, rights,
 * required captions/disclosures, and invalid output" as things nobody may
 * accept, and a non-waivable set that the ruleset file can move into `warning:`
 * is a policy overridable from the file it governs — which is a comment, not a
 * control. `parseQaRuleset` therefore refuses a ruleset that demotes any of
 * these; tightening (adding more blockers) stays free.
 */
export const D35_NON_WAIVABLE = [
  'missing_media',
  'container_corruption',
  'source_range_validity',
  'output_dimensions',
  'codec_profile',
  'caption_file_present',
] as const satisfies readonly QaCheckId[];

export interface QaRuleset {
  readonly rulesetVersion: string;
  readonly effectiveFrom: string;
  readonly audio: {
    /**
     * The delivery POLICY ceiling for true peak — a limit no render may exceed,
     * so it lives here.
     *
     * Note the deliberate asymmetry with the loudness TARGET, which does not
     * live here (decisions.md D-54): a target is what one render promised, and
     * the manifest is where that promise is recorded, so `loudness_target`
     * measures against `expected.targetLoudnessLufs` from the manifest. A second
     * copy in the ruleset was read by nothing for the whole of Phase 4 — a dead
     * control an operator could edit forever with no effect.
     */
    readonly maxTruePeakDbtp: number;
    readonly loudnessToleranceLu: number;
    readonly clippingSampleThresholdDbfs: number;
    readonly silenceThresholdDbfs: number;
    readonly maxUnexpectedSilenceSeconds: number;
  };
  readonly video: {
    readonly maxBlackFrameRun: number;
    readonly maxFrozenFrameRun: number;
    readonly maxDuplicateFrameRatio: number;
    readonly minCanvasCoverage: number;
    readonly blackLumaThreshold: number;
    readonly blackPixelRatio: number;
    readonly freezeNoiseDb: number;
  };
  readonly sync: { readonly maxDriftMilliseconds: number };
  readonly captions: {
    readonly maxLines: number;
    readonly maxCharsPerLine: number;
    readonly minCueDurationSeconds: number;
    readonly maxCharactersPerSecond: number;
    readonly minInterCueGapSeconds: number;
    readonly averageGlyphAdvanceEm: number;
  };
  readonly output: {
    readonly minWidth: number;
    readonly minHeight: number;
    readonly acceptedContainers: readonly string[];
    readonly acceptedVideoCodecs: readonly string[];
    readonly acceptedAudioCodecs: readonly string[];
    readonly durationToleranceMilliseconds: number;
  };
  readonly severities: {
    readonly blocker: readonly QaCheckId[];
    readonly warning: readonly QaCheckId[];
    readonly info: readonly QaCheckId[];
  };
}

export class QaConfigError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'QaConfigError';
    this.code = code;
  }
}

/**
 * Load and validate `technical-qa-v1.yaml`.
 *
 * Validation is structural and total, and an unparseable or incomplete ruleset
 * **throws** rather than falling back to built-in defaults. A silent default
 * would be the worst possible failure here: QA would keep reporting `pass` while
 * measuring against numbers nobody chose, and the gate's whole claim is that the
 * numbers are the ones in the file.
 */
export function parseQaRuleset(yamlText: string, sourceLabel: string): QaRuleset {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (error) {
    throw new QaConfigError(
      'QA_RULESET_UNPARSEABLE',
      `${sourceLabel} is not valid YAML: ${(error as Error).message}. QA fails closed rather than falling back to built-in thresholds.`,
    );
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new QaConfigError('QA_RULESET_UNPARSEABLE', `${sourceLabel} did not parse to a mapping.`);
  }

  const missing: string[] = [];
  const record = raw as Record<string, unknown>;
  const requireSection = (name: string, keys: readonly string[]): void => {
    const section = record[name];
    if (section === null || typeof section !== 'object' || Array.isArray(section)) {
      missing.push(name);
      return;
    }
    for (const key of keys) {
      if ((section as Record<string, unknown>)[key] === undefined) missing.push(`${name}.${key}`);
    }
  };

  if (typeof record['rulesetVersion'] !== 'string') missing.push('rulesetVersion');
  if (typeof record['effectiveFrom'] !== 'string') missing.push('effectiveFrom');
  requireSection('audio', [
    'maxTruePeakDbtp',
    'loudnessToleranceLu',
    'clippingSampleThresholdDbfs',
    'silenceThresholdDbfs',
    'maxUnexpectedSilenceSeconds',
  ]);
  requireSection('video', [
    'maxBlackFrameRun',
    'maxFrozenFrameRun',
    'maxDuplicateFrameRatio',
    'minCanvasCoverage',
    'blackLumaThreshold',
    'blackPixelRatio',
    'freezeNoiseDb',
  ]);
  requireSection('sync', ['maxDriftMilliseconds']);
  requireSection('captions', [
    'maxLines',
    'maxCharsPerLine',
    'minCueDurationSeconds',
    'maxCharactersPerSecond',
    'minInterCueGapSeconds',
    'averageGlyphAdvanceEm',
  ]);
  requireSection('output', [
    'minWidth',
    'minHeight',
    'acceptedContainers',
    'acceptedVideoCodecs',
    'acceptedAudioCodecs',
    'durationToleranceMilliseconds',
  ]);
  requireSection('severities', ['blocker', 'warning', 'info']);

  if (missing.length > 0) {
    throw new QaConfigError(
      'QA_RULESET_INCOMPLETE',
      `${sourceLabel} is missing required setting(s): ${missing.join(', ')}. QA fails closed; a partial ruleset is not silently completed from defaults.`,
    );
  }

  const ruleset = raw as QaRuleset;
  const classified = new Set<string>([
    ...ruleset.severities.blocker,
    ...ruleset.severities.warning,
    ...ruleset.severities.info,
  ]);
  const unclassified = ALL_CHECK_IDS.filter((id) => !classified.has(id));
  if (unclassified.length > 0) {
    throw new QaConfigError(
      'QA_RULESET_UNCLASSIFIED_CHECK',
      `${sourceLabel} assigns no severity to: ${unclassified.join(', ')}. Every check must be classified — an unclassified check would silently never affect the gate.`,
    );
  }

  const demoted = D35_NON_WAIVABLE.filter((id) => !ruleset.severities.blocker.includes(id));
  if (demoted.length > 0) {
    throw new QaConfigError(
      'QA_RULESET_DEMOTES_NON_WAIVABLE_CHECK',
      `${sourceLabel} moves ${demoted.join(', ')} out of \`blocker\`. decisions.md D-35 fixes these as non-waivable, so demoting them here would make a settled policy overridable from the file it governs — and would let, for example, an out-of-bounds source range be waived through while \`status --phase0\` still computed "zero invalid source ranges". The ruleset may add blockers; it may not remove these.`,
      );
  }
  return ruleset;
}

export async function loadQaRuleset(path: string): Promise<QaRuleset> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new QaConfigError(
      'QA_RULESET_MISSING',
      `Could not read the QA ruleset at ${path}: ${(error as Error).message}. No render may be gated without one.`,
    );
  }
  return parseQaRuleset(text, path);
}

export function severityOf(ruleset: QaRuleset, checkId: QaCheckId): TechnicalQaFinding['severity'] {
  if (ruleset.severities.blocker.includes(checkId)) return 'blocker';
  if (ruleset.severities.info.includes(checkId)) return 'info';
  return 'warning';
}

// ---------------------------------------------------------------------------
// Safe-zone overlay
// ---------------------------------------------------------------------------

export interface NormalisedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SafeZoneOverlay {
  readonly schemaVersion: string;
  readonly platform: string;
  readonly surface: string;
  readonly effectiveFrom: string;
  readonly status: string;
  readonly obstructions: readonly { readonly id: string; readonly description: string; readonly rect: NormalisedRect }[];
  readonly captionSafeArea: { readonly description: string; readonly rect: NormalisedRect };
}

export async function loadSafeZoneOverlay(path: string): Promise<SafeZoneOverlay> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new QaConfigError(
      'SAFE_ZONE_OVERLAY_MISSING',
      `Could not read the safe-zone overlay at ${path}: ${(error as Error).message}.`,
    );
  }
  const parsed = JSON.parse(text) as SafeZoneOverlay;
  if (parsed.captionSafeArea?.rect === undefined) {
    throw new QaConfigError(
      'SAFE_ZONE_OVERLAY_INVALID',
      `${path} declares no captionSafeArea.rect; the safe-zone check has nothing to measure against.`,
    );
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Measurements — what `measure.ts` produces and `checks.ts` consumes
// ---------------------------------------------------------------------------

/** A contiguous run of frames/time in the OUTPUT, in milliseconds. */
export interface TimeRun {
  readonly startMs: number;
  readonly endMs: number;
}

export type LoudnessMeasurement =
  | { readonly kind: 'measured'; readonly integratedLufs: number; readonly truePeakDbtp: number; readonly loudnessRangeLu: number }
  | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * Everything measured from a produced render.
 *
 * A field is `null` ONLY when the measurement genuinely could not be taken, and
 * every null is paired with a `skipped` entry in the checks ledger carrying the
 * reason — so a check that could not run is visible as such rather than
 * disappearing into a clean report.
 */
export interface RenderMeasurements {
  readonly filePresent: boolean;
  readonly sizeBytes: number;
  readonly corruption: 'clean' | 'corrupt' | 'unknown';
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly container: string | null;
  readonly videoCodec: string | null;
  readonly audioCodec: string | null;
  readonly blackRuns: readonly TimeRun[] | null;
  readonly frozenRuns: readonly TimeRun[] | null;
  readonly duplicateFrameCount: number | null;
  readonly frameCount: number | null;
  readonly silenceRuns: readonly TimeRun[] | null;
  readonly peakDbfs: number | null;
  readonly loudness: LoudnessMeasurement;
  readonly avStartOffsetMs: number | null;
  /** Detected non-black content rectangle, in output pixels. */
  readonly contentRect: { readonly width: number; readonly height: number } | null;
  readonly captionFiles: { readonly ass: boolean; readonly srt: boolean; readonly vtt: boolean };
}
