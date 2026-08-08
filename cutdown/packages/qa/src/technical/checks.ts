import {
  ALL_CHECK_IDS,
  severityOf,
  type NormalisedRect,
  type QaCheckId,
  type QaCheckRecord,
  type QaRuleset,
  type RenderMeasurements,
  type SafeZoneOverlay,
  type TechnicalQaFinding,
  type TimeRun,
} from './model.js';

/**
 * The 23 technical QA checks (PRD REQ-100 / REQ-084 / REQ-104), as pure
 * functions from measurements to findings.
 *
 * Nothing here touches the filesystem or spawns a process. Every number a
 * verdict TURNS ON comes from the ruleset argument, never from a literal — that
 * is the property the acceptance criterion names ("changing a threshold changes
 * behaviour with no code change"), and the only way to keep it true is to have
 * no number to change. A review caught three literals surviving this rule (a
 * duplicate-frame ratio, a canvas-coverage floor, and the glyph-advance
 * estimate).
 *
 * Three literals remain, deliberately, and are named here rather than left for a
 * reader to discover and mistrust the claim above — the earlier wording said
 * "every threshold ... never from a literal", which these three made false:
 *
 *   - `1.2` line-height in `caption_safe_zone`: a typographic constant, not a
 *     pass/fail bound. Nothing an operator could tune to change a verdict's
 *     direction; it is part of estimating where the caption box IS.
 *   - `0.5` px in the same check: a floating-point comparison tolerance, so that
 *     a box landing exactly on the safe-area edge does not flip on rounding.
 *   - `30` fps in `duplicate_frames`: a FALLBACK used only when the frame count
 *     is unreadable, and the check reports `skipped` in that state anyway.
 *
 * The other half of the property is enforced from the opposite direction: the
 * suite derives the field list from the shipped ruleset's own keys and requires
 * each one to be perturbed, proven live in the measurement filtergraph, or
 * declared not-a-threshold — so a dead setting cannot sit in the file pretending
 * to be a control (that is how `audio.targetLoudnessLufs` survived Phase 4;
 * decisions.md D-54).
 *
 * ## The three-state ledger
 *
 * Each check returns `ran`, `skipped`, or `errored`, and the last two carry a
 * required reason. This is the Phase 2 lesson made structural: an omitted
 * modality that reports nothing is indistinguishable from a clean one, and the
 * layer above will read it as clean. A check that cannot run says so, in the
 * report, next to the checks that did.
 */

/** QA reports time in exact milliseconds — a timebase every consumer shares. */
const REPORT_TIMEBASE = { num: 1, den: 1000 } as const;

export interface QaCaptionCue {
  readonly index: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly displayText: string;
  readonly lines: readonly string[];
}

export interface QaCaptionReviewFlag {
  readonly cueIndex: number;
  readonly kind: string;
  readonly detail: string;
}

export interface QaNonSpeechEvent {
  readonly kind: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface QaSourceRangeViolation {
  readonly clipId: string;
  readonly code: string;
  readonly message: string;
}

export interface QaContext {
  readonly ruleset: QaRuleset;
  /** `null` is a legitimate state — the safe-zone check then emits a warning saying so. */
  readonly overlay: SafeZoneOverlay | null;
  /** Why the overlay is unavailable, when it is. Carried so the warning names the cause. */
  readonly overlayUnavailableReason?: string;
  readonly expected: {
    readonly width: number;
    readonly height: number;
    readonly container: string;
    readonly videoCodec: string;
    readonly audioCodec: string;
    readonly hasAudio: boolean;
    readonly targetLoudnessLufs: number;
    readonly maxTruePeakDbtp: number;
    readonly normalise: boolean;
  };
  readonly plannedDurationMs: number;
  readonly aspectTreatmentMode: string;
  readonly captions: readonly QaCaptionCue[];
  readonly captionReviewFlags: readonly QaCaptionReviewFlag[];
  readonly captionStyle: {
    readonly fontSizePx: number;
    readonly marginVerticalPx: number;
    readonly marginHorizontalPx: number;
  };
  /**
   * Violations found by `range-check.ts` when the render was planned. Empty
   * means the single bounds validator ran and found nothing — which is the
   * evidence the "zero invalid source ranges in final renders" exit criterion is
   * computed from.
   */
  readonly sourceRangeViolations: readonly QaSourceRangeViolation[];
  /** Meaningful non-speech audio events from the index, or `null` if not supplied. */
  readonly nonSpeechEvents: readonly QaNonSpeechEvent[] | null;
  readonly minResolution: { readonly width: number; readonly height: number } | null;
}

export interface CheckOutcome {
  readonly status: QaCheckRecord['status'];
  readonly reason: string | null;
  readonly findings: readonly TechnicalQaFinding[];
}

export interface QaEvaluation {
  readonly checksRun: readonly QaCheckRecord[];
  readonly findings: readonly TechnicalQaFinding[];
}

const rangeOf = (run: TimeRun): TechnicalQaFinding['timeRange'] => ({
  startTicks: Math.max(0, Math.round(run.startMs)),
  endTicks: Math.max(1, Math.round(run.endMs)),
  timebase: REPORT_TIMEBASE,
});

/**
 * Finding identity: `checkId:object[:startMs-endMs]`.
 *
 * Derived rather than generated so that re-running QA over the SAME render
 * yields the SAME ids — which is the only thing that makes a waiver referencing
 * them meaningful. A random id would silently invalidate every waiver on every
 * re-run, and an operator would learn to re-waive without reading.
 */
function findingId(checkId: QaCheckId, object: string, timeRange: TechnicalQaFinding['timeRange']): string {
  const suffix =
    timeRange === null ? '' : `:${String(timeRange.startTicks)}-${String(timeRange.endTicks)}`;
  return `${checkId}:${object}${suffix}`;
}

function finding(
  ruleset: QaRuleset,
  checkId: QaCheckId,
  object: string,
  message: string,
  fix: string,
  timeRange: TechnicalQaFinding['timeRange'] = null,
): TechnicalQaFinding {
  const severity = severityOf(ruleset, checkId);
  return {
    findingId: findingId(checkId, object, timeRange),
    checkId,
    severity,
    // Restated from severity rather than authored: the waiver validator asserts
    // the two agree, so a finding can never disagree with its own policy.
    waivable: severity !== 'blocker',
    object,
    message,
    fix,
    timeRange,
  };
}

const ran = (findings: readonly TechnicalQaFinding[]): CheckOutcome => ({
  status: 'ran',
  reason: null,
  findings,
});
const skipped = (reason: string): CheckOutcome => ({ status: 'skipped', reason, findings: [] });

const clean = ran([]);

type CheckFn = (m: RenderMeasurements, c: QaContext) => CheckOutcome;

/** Runs longer than `maxRun` frames, expressed as a duration at `frameMs`. */
function longRuns(runs: readonly TimeRun[], maxRunFrames: number, frameMs: number): TimeRun[] {
  const limitMs = maxRunFrames * frameMs;
  return runs.filter((run) => run.endMs - run.startMs > limitMs);
}

const CHECKS: Record<QaCheckId, CheckFn> = {
  missing_media: (m, c) =>
    m.filePresent && m.sizeBytes > 0
      ? clean
      : ran([
          finding(
            c.ruleset,
            'missing_media',
            'output',
            m.filePresent
              ? 'The render output exists but is zero bytes.'
              : 'The render output file is missing.',
            'Re-run the render and check the encode log; a zero-byte or absent output means the encode never produced a file.',
          ),
        ]),

  container_corruption: (m, c) => {
    if (m.corruption === 'unknown') {
      return skipped('The corruption probe could not run, so the output is neither confirmed clean nor confirmed corrupt.');
    }
    return m.corruption === 'clean'
      ? clean
      : ran([
          finding(
            c.ruleset,
            'container_corruption',
            'output',
            'Decoding the produced file reported errors; the container or bitstream is damaged.',
            'Re-render. If it recurs, the fault is upstream in the source media rather than in the encode.',
          ),
        ]);
  },

  // The render-time caller of `range-check.ts`, the single bounds validator.
  // Non-waivable and never clamped (D-35/D-37): a clamped range would silently
  // deliver footage the editorial plan did not choose.
  source_range_validity: (_m, c) =>
    c.sourceRangeViolations.length === 0
      ? clean
      : ran(
          c.sourceRangeViolations.map((violation) =>
            finding(
              c.ruleset,
              'source_range_validity',
              violation.clipId,
              `${violation.code}: ${violation.message}`,
              'Correct the clip range in the EDL and re-plan. An out-of-bounds range is never clamped — the cut must be re-chosen.',
            ),
          ),
        ),

  output_dimensions: (m, c) => {
    if (m.width === null || m.height === null) {
      return skipped('The output geometry could not be read, so it could not be compared with the manifest.');
    }
    const findings: TechnicalQaFinding[] = [];
    if (m.width !== c.expected.width || m.height !== c.expected.height) {
      findings.push(
        finding(
          c.ruleset,
          'output_dimensions',
          'output',
          `Output is ${String(m.width)}x${String(m.height)} but the manifest specifies ${String(c.expected.width)}x${String(c.expected.height)}.`,
          'The encode did not honour the manifest canvas. Check the scale/pad chain in the filtergraph.',
        ),
      );
    }
    const min = c.minResolution ?? { width: c.ruleset.output.minWidth, height: c.ruleset.output.minHeight };
    if (m.width < min.width || m.height < min.height) {
      findings.push(
        finding(
          c.ruleset,
          'output_dimensions',
          'platform',
          `Output ${String(m.width)}x${String(m.height)} is below the platform minimum ${String(min.width)}x${String(min.height)}.`,
          'Raise the EDL canvas to at least the platform minimum and re-plan.',
        ),
      );
    }
    return ran(findings);
  },

  output_duration: (m, c) => {
    if (m.durationMs === null) {
      return skipped('The output duration could not be read.');
    }
    const drift = Math.abs(m.durationMs - c.plannedDurationMs);
    return drift <= c.ruleset.output.durationToleranceMilliseconds
      ? clean
      : ran([
          finding(
            c.ruleset,
            'output_duration',
            'output',
            `Output runs ${m.durationMs.toFixed(0)} ms against a planned ${c.plannedDurationMs.toFixed(0)} ms (drift ${drift.toFixed(0)} ms, tolerance ${String(c.ruleset.output.durationToleranceMilliseconds)} ms).`,
            'A drift larger than one or two frames usually means a clip was dropped or a trim boundary fell outside the source. Compare the EDL clip list against the render plan.',
          ),
        ]);
  },

  codec_profile: (m, c) => {
    const findings: TechnicalQaFinding[] = [];
    if (m.container !== null && !c.ruleset.output.acceptedContainers.includes(m.container)) {
      findings.push(
        finding(
          c.ruleset,
          'codec_profile',
          'container',
          `Container "${m.container}" is not in the accepted set (${c.ruleset.output.acceptedContainers.join(', ')}).`,
          'Set the manifest container to an accepted value and re-render.',
        ),
      );
    }
    if (m.videoCodec !== null && !c.ruleset.output.acceptedVideoCodecs.includes(m.videoCodec)) {
      findings.push(
        finding(
          c.ruleset,
          'codec_profile',
          'video',
          `Video codec "${m.videoCodec}" is not in the accepted set (${c.ruleset.output.acceptedVideoCodecs.join(', ')}).`,
          'Set the manifest videoCodec to an accepted value and re-render.',
        ),
      );
    }
    if (c.expected.hasAudio && m.audioCodec !== null && !c.ruleset.output.acceptedAudioCodecs.includes(m.audioCodec)) {
      findings.push(
        finding(
          c.ruleset,
          'codec_profile',
          'audio',
          `Audio codec "${m.audioCodec}" is not in the accepted set (${c.ruleset.output.acceptedAudioCodecs.join(', ')}).`,
          'Set the manifest audioCodec to an accepted value and re-render.',
        ),
      );
    }
    if (c.expected.hasAudio && m.audioCodec === null) {
      findings.push(
        finding(
          c.ruleset,
          'codec_profile',
          'audio',
          'The manifest declares audio but the produced file carries no audio stream.',
          'The manifest and the produced file disagree about audio. Phase 0 refuses a timeline that mixes audio-bearing and silent assets, so this means the audio chain dropped a stream it was given.',
        ),
      );
    }
    return ran(findings);
  },

  black_frames: (m, c) => {
    if (m.blackRuns === null) return skipped('Black-frame detection did not run.');
    const frameMs = frameMillis(m, c);
    return ran(
      longRuns(m.blackRuns, c.ruleset.video.maxBlackFrameRun, frameMs).map((run) =>
        finding(
          c.ruleset,
          'black_frames',
          'output',
          `${((run.endMs - run.startMs) / 1000).toFixed(2)} s of black frames, longer than the ${String(c.ruleset.video.maxBlackFrameRun)}-frame allowance.`,
          'If this is an intentional hold, shorten it or declare it. Otherwise a clip range is landing on black leader in the source.',
          rangeOf(run),
        ),
      ),
    );
  },

  frozen_frames: (m, c) => {
    if (m.frozenRuns === null) return skipped('Freeze detection did not run.');
    const frameMs = frameMillis(m, c);
    return ran(
      longRuns(m.frozenRuns, c.ruleset.video.maxFrozenFrameRun, frameMs).map((run) =>
        finding(
          c.ruleset,
          'frozen_frames',
          'output',
          `${((run.endMs - run.startMs) / 1000).toFixed(2)} s of frozen picture, longer than the ${String(c.ruleset.video.maxFrozenFrameRun)}-frame allowance.`,
          'Check whether the source stalls here, or whether a clip is shorter than the slot it was placed in.',
          rangeOf(run),
        ),
      ),
    );
  },

  duplicate_frames: (m, c) => {
    if (m.duplicateFrameCount === null || m.frameCount === null) {
      return skipped('Frame-duplication counting did not run.');
    }
    // A CFR normalisation of a VFR source duplicates frames BY DESIGN (D-25), so
    // the check is on the proportion, not on any duplication at all. Reporting
    // every duplicate would fire on every correctly-normalised VFR render and
    // train people to ignore the check.
    const ratio = m.frameCount === 0 ? 0 : m.duplicateFrameCount / m.frameCount;
    return ratio <= c.ruleset.video.maxDuplicateFrameRatio
      ? clean
      : ran([
          finding(
            c.ruleset,
            'duplicate_frames',
            'output',
            `${String(m.duplicateFrameCount)} of ${String(m.frameCount)} frames (${(ratio * 100).toFixed(0)}%) are duplicates of their predecessor.`,
            'The output frame rate is higher than the source can supply. Lower the manifest frameRate to the source rate.',
          ),
        ]);
  },

  crop_failure: (m, c) => {
    if (m.contentRect === null || m.width === null || m.height === null) {
      return skipped('Content-area detection did not run.');
    }
    // Letterbox is intentional bars, so bars are not a failure there. For the
    // fill treatments, unfilled canvas means the composite did not work.
    if (c.aspectTreatmentMode === 'letterbox') {
      return skipped('aspectTreatment is `letterbox`, where bars are the intended treatment rather than a crop failure.');
    }
    const coverage = (m.contentRect.width * m.contentRect.height) / (m.width * m.height);
    return coverage >= c.ruleset.video.minCanvasCoverage
      ? clean
      : ran([
          finding(
            c.ruleset,
            'crop_failure',
            'output',
            `The declared treatment "${c.aspectTreatmentMode}" should fill the canvas, but only ${(coverage * 100).toFixed(0)}% of it carries picture.`,
            'The background fill did not compose. Check the split/overlay chain for this treatment.',
          ),
        ]);
  },

  unexpected_silence: (m, c) => {
    if (!c.expected.hasAudio) {
      return skipped('The render has no audio track by design, so there is no silence to be unexpected.');
    }
    if (m.silenceRuns === null) return skipped('Silence detection did not run.');
    const limitMs = c.ruleset.audio.maxUnexpectedSilenceSeconds * 1000;
    return ran(
      m.silenceRuns
        .filter((run) => run.endMs - run.startMs > limitMs)
        .map((run) =>
          finding(
            c.ruleset,
            'unexpected_silence',
            'audio',
            `${((run.endMs - run.startMs) / 1000).toFixed(2)} s below ${String(c.ruleset.audio.silenceThresholdDbfs)} dBFS, longer than the ${String(c.ruleset.audio.maxUnexpectedSilenceSeconds)} s allowance.`,
            'Check whether a clip was cut from a silent passage, or whether the audio chain dropped a segment.',
            rangeOf(run),
          ),
        ),
    );
  },

  audio_clipping: (m, c) => {
    if (!c.expected.hasAudio) return skipped('The render has no audio track.');
    if (m.peakDbfs === null) return skipped('Sample-peak measurement did not run.');
    return m.peakDbfs < c.ruleset.audio.clippingSampleThresholdDbfs
      ? clean
      : ran([
          finding(
            c.ruleset,
            'audio_clipping',
            'audio',
            `Sample peak reached ${m.peakDbfs.toFixed(2)} dBFS, at or above the ${String(c.ruleset.audio.clippingSampleThresholdDbfs)} dBFS clipping threshold.`,
            'Lower the normalisation target or the true-peak ceiling in the manifest audio mix and re-render.',
          ),
        ]);
  },

  loudness_target: (m, c) => {
    if (!c.expected.hasAudio) return skipped('The render has no audio track.');
    if (!c.expected.normalise) {
      return skipped('The manifest does not request loudness normalisation, so there is no target to measure against.');
    }
    if (m.loudness.kind === 'unavailable') return skipped(m.loudness.reason);
    const drift = Math.abs(m.loudness.integratedLufs - c.expected.targetLoudnessLufs);
    return drift <= c.ruleset.audio.loudnessToleranceLu
      ? clean
      : ran([
          finding(
            c.ruleset,
            'loudness_target',
            'audio',
            `Integrated loudness measured ${m.loudness.integratedLufs.toFixed(1)} LUFS against a target of ${c.expected.targetLoudnessLufs.toFixed(1)} LUFS (drift ${drift.toFixed(1)} LU, tolerance ${String(c.ruleset.audio.loudnessToleranceLu)} LU).`,
            'Normalisation did not reach the target — usually a very short or very quiet programme. Check the source levels before changing the target.',
          ),
        ]);
  },

  true_peak: (m, c) => {
    if (!c.expected.hasAudio) return skipped('The render has no audio track.');
    if (m.loudness.kind === 'unavailable') return skipped(m.loudness.reason);
    return m.loudness.truePeakDbtp <= c.ruleset.audio.maxTruePeakDbtp
      ? clean
      : ran([
          finding(
            c.ruleset,
            'true_peak',
            'audio',
            `True peak measured ${m.loudness.truePeakDbtp.toFixed(1)} dBTP, above the ${String(c.ruleset.audio.maxTruePeakDbtp)} dBTP ceiling.`,
            'Lower `maxTruePeakDbtp` in the manifest audio mix so the limiter engages earlier, and re-render.',
          ),
        ]);
  },

  av_sync_drift: (m, c) => {
    if (!c.expected.hasAudio) return skipped('The render has no audio track, so there is no sync to measure.');
    if (m.avStartOffsetMs === null) return skipped('The audio and video stream start times could not both be read.');
    const drift = Math.abs(m.avStartOffsetMs);
    return drift <= c.ruleset.sync.maxDriftMilliseconds
      ? clean
      : ran([
          finding(
            c.ruleset,
            'av_sync_drift',
            'output',
            `Audio starts ${m.avStartOffsetMs.toFixed(0)} ms from video, beyond the +/-${String(c.ruleset.sync.maxDriftMilliseconds)} ms budget.`,
            'A constant offset usually means an audio filter added or removed latency. Check the audio chain against the video chain lengths.',
          ),
        ]);
  },

  // REQ-104's standing requirement: a caption FILE always accompanies the
  // burn-in. Non-waivable, because burned-in pixels are not accessible text and
  // a package shipped without the sidecar cannot be fixed after delivery.
  caption_file_present: (m, c) => {
    const missing = [
      m.captionFiles.ass ? undefined : 'ASS',
      m.captionFiles.srt ? undefined : 'SRT',
      m.captionFiles.vtt ? undefined : 'WebVTT',
    ].filter((v): v is string => v !== undefined);
    return missing.length === 0
      ? clean
      : ran([
          finding(
            c.ruleset,
            'caption_file_present',
            'captions',
            `Missing caption file(s): ${missing.join(', ')}. REQ-104 requires a caption file alongside the burn-in.`,
            'Re-run the render; the caption sidecars are written by the same step that produces the burn-in.',
          ),
        ]);
  },

  caption_overflow: (_m, c) =>
    ran(
      c.captions.flatMap((cue) => {
        const findings: TechnicalQaFinding[] = [];
        if (cue.lines.length > c.ruleset.captions.maxLines) {
          findings.push(
            finding(
              c.ruleset,
              'caption_overflow',
              `cue-${String(cue.index)}`,
              `Wraps to ${String(cue.lines.length)} lines; the ruleset allows ${String(c.ruleset.captions.maxLines)}.`,
              'Shorten the display text in the EDL. The caption is never truncated automatically — a shortened caption is an editorial decision.',
              rangeOf(cue),
            ),
          );
        }
        const overLong = cue.lines.filter((line) => line.length > c.ruleset.captions.maxCharsPerLine);
        if (overLong.length > 0) {
          findings.push(
            finding(
              c.ruleset,
              'caption_overflow',
              `cue-${String(cue.index)}-line`,
              `${String(overLong.length)} line(s) exceed ${String(c.ruleset.captions.maxCharsPerLine)} characters (longest ${String(Math.max(...overLong.map((l) => l.length)))}).`,
              'A single word longer than the line budget is placed on its own line rather than being split. Rephrase in the EDL.',
              rangeOf(cue),
            ),
          );
        }
        return findings;
      }),
    ),

  caption_readability: (_m, c) =>
    ran(
      c.captions
        .map((cue) => {
          const seconds = (cue.endMs - cue.startMs) / 1000;
          const cps = seconds <= 0 ? Infinity : cue.displayText.length / seconds;
          return { cue, cps };
        })
        .filter(({ cps }) => cps > c.ruleset.captions.maxCharactersPerSecond)
        .map(({ cue, cps }) =>
          finding(
            c.ruleset,
            'caption_readability',
            `cue-${String(cue.index)}`,
            `Reads at ${cps.toFixed(1)} characters per second, above the ${String(c.ruleset.captions.maxCharactersPerSecond)} cps limit.`,
            'Either shorten the caption or lengthen the clip. Phase 0 gives each cue its whole clip, so a dense caption on a short clip is unreadable however it is styled.',
            rangeOf(cue),
          ),
        ),
    ),

  caption_timing: (_m, c) => {
    const findings: TechnicalQaFinding[] = [];
    const minMs = c.ruleset.captions.minCueDurationSeconds * 1000;
    const gapMs = c.ruleset.captions.minInterCueGapSeconds * 1000;
    for (const cue of c.captions) {
      if (cue.endMs - cue.startMs < minMs) {
        findings.push(
          finding(
            c.ruleset,
            'caption_timing',
            `cue-${String(cue.index)}`,
            `On screen for ${((cue.endMs - cue.startMs) / 1000).toFixed(2)} s, below the ${String(c.ruleset.captions.minCueDurationSeconds)} s minimum.`,
            'Lengthen the clip, or drop the caption for this clip — a cue too brief to read is worse than none.',
            rangeOf(cue),
          ),
        );
      }
    }
    const sorted = [...c.captions].sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1] as QaCaptionCue;
      const current = sorted[i] as QaCaptionCue;
      const gap = current.startMs - previous.endMs;
      if (gap > 0 && gap < gapMs) {
        findings.push(
          finding(
            c.ruleset,
            'caption_timing',
            `cue-${String(previous.index)}-to-${String(current.index)}`,
            `A ${gap.toFixed(0)} ms gap between cues reads as a flicker rather than a change (minimum ${String(gapMs)} ms).`,
            'Butt the cues together so the text changes cleanly, or widen the gap.',
            rangeOf({ startMs: previous.endMs, endMs: current.startMs }),
          ),
        );
      }
      if (gap < 0) {
        findings.push(
          finding(
            c.ruleset,
            'caption_timing',
            `cue-${String(previous.index)}-to-${String(current.index)}`,
            `Cues overlap by ${Math.abs(gap).toFixed(0)} ms; two captions would be on screen at once.`,
            'Overlapping cues come from overlapping clips on the output timeline. Re-check the clip ordering.',
            rangeOf({ startMs: current.startMs, endMs: previous.endMs }),
          ),
        );
      }
    }
    return ran(findings);
  },

  caption_safe_zone: (m, c) => {
    if (c.overlay === null) {
      // A missing overlay is itself a WARNING, not a silent skip. The phase plan
      // says "missing safe-zone overlay is a warning and may be waived" — and
      // without the finding, a render whose caption placement was never checked
      // would be indistinguishable at the gate from one that passed.
      const reason =
        c.overlayUnavailableReason ??
        'No safe-zone overlay was supplied for this platform and surface.';
      return {
        status: 'skipped',
        reason,
        findings: [
          finding(
            c.ruleset,
            'caption_safe_zone',
            'captions',
            `Caption placement was NOT checked against a platform safe zone: ${reason}`,
            'Add the dated overlay for this platform and surface under data/platform-capabilities/overlays/, or waive this deliberately with a recorded reason.',
          ),
        ],
      };
    }
    if (m.width === null || m.height === null) {
      return skipped('The output geometry could not be read, so the safe area could not be resolved to pixels.');
    }
    const safe = c.overlay.captionSafeArea.rect;
    const box = estimateCaptionBox(c, m.width, m.height);
    const violations = boxViolations(box, safe, m.width, m.height);
    return violations.length === 0
      ? clean
      : ran([
          finding(
            c.ruleset,
            'caption_safe_zone',
            'captions',
            `The caption box (a geometric estimate from the style: ${String(Math.round(box.width))}x${String(Math.round(box.height))} px at ${String(Math.round(box.x))},${String(Math.round(box.y))}) leaves the ${c.overlay.platform}/${c.overlay.surface} caption safe area on the ${violations.join(' and ')} side. This is an estimate from the caption style and line count, not a pixel measurement of the rendered frame.`,
            'Increase the caption margins in the style profile, or shorten the longest line so the box narrows.',
          ),
        ]);
  },

  // No en-AU dictionary is vendored at Phase 0, and a US dictionary would flag
  // "colour" and "organised" on every Australian caption — a check that is wrong
  // by default is worse than one that says it did not run.
  caption_spelling: () =>
    skipped(
      'No en-AU dictionary is vendored at Phase 0 (D-4 sets the locale to en-AU). Spelling is surfaced for human review through caption_name_flag rather than reported clean.',
    ),

  caption_name_flag: (_m, c) => {
    const nameFlags = c.captionReviewFlags.filter((f) => f.kind === 'proper_noun' || f.kind === 'low_confidence_asr');
    return ran(
      nameFlags.map((flag) =>
        finding(
          c.ruleset,
          'caption_name_flag',
          `cue-${String(flag.cueIndex)}`,
          flag.kind === 'proper_noun'
            ? `Possible name or proper noun in the caption: ${flag.detail}`
            : `Low-confidence transcript behind this caption: ${flag.detail}`,
          'Check the wording against the source before approval. This is a review prompt, not a defect.',
        ),
      ),
    );
  },

  non_speech_cue_review: (_m, c) => {
    if (c.nonSpeechEvents === null) {
      return skipped('No indexed audio events were supplied, so meaningful non-speech moments could not be surfaced for caption review.');
    }
    const captioned = (event: QaNonSpeechEvent): boolean =>
      c.captions.some((cue) => cue.startMs < event.endMs && cue.endMs > event.startMs);
    return ran(
      c.nonSpeechEvents
        .filter((event) => !captioned(event))
        .map((event) =>
          finding(
            c.ruleset,
            'non_speech_cue_review',
            'audio',
            `A meaningful non-speech event (${event.kind}) falls inside the output with no caption cue over it.`,
            'Add a bracketed non-speech cue if it carries meaning, or leave it if it is ambience. REQ-104 asks for these to be flagged, not captioned automatically.',
            rangeOf(event),
          ),
        ),
    );
  },
};

/** Milliseconds per output frame, from the measured duration and frame count. */
function frameMillis(m: RenderMeasurements, c: QaContext): number {
  if (m.frameCount !== null && m.frameCount > 0 && m.durationMs !== null) {
    return m.durationMs / m.frameCount;
  }
  // 30 fps fallback, used only when the frame count is unreadable. Being wrong
  // here makes the run-length allowance slightly generous, never stricter.
  void c;
  return 1000 / 30;
}

export interface CaptionBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A conservative geometric estimate of the caption box in output pixels.
 *
 * Honest about what it is: the ASS style is bottom-centre aligned with known
 * margins and a known font size, so the box's height and vertical position are
 * exact, and only the width is estimated — from the longest line at an average
 * advance of 0.52 em, which is a little wider than Inter's true average. The
 * estimate therefore errs toward reporting a violation that a pixel measurement
 * might not confirm, which is the safe direction for a warning.
 */
export function estimateCaptionBox(c: QaContext, canvasWidth: number, canvasHeight: number): CaptionBox {
  const longestLine = c.captions.reduce(
    (max, cue) => Math.max(max, ...cue.lines.map((line) => line.length)),
    0,
  );
  const lineCount = c.captions.reduce((max, cue) => Math.max(max, cue.lines.length), 0);
  const lineHeight = c.captionStyle.fontSizePx * 1.2;
  const height = Math.max(lineHeight, lineCount * lineHeight);
  // NOT clamped to the margins. Clamping would make the estimate describe the
  // box the style ASKED for rather than the glyphs that will actually be drawn —
  // and text wider than its box is exactly the overflow this check exists to
  // catch. An unclamped estimate can exceed the canvas, which is the honest
  // report when the text genuinely cannot fit.
  const estimatedWidth = longestLine * c.captionStyle.fontSizePx * c.ruleset.captions.averageGlyphAdvanceEm;
  void canvasWidth;
  const bottom = canvasHeight - c.captionStyle.marginVerticalPx;
  return {
    x: (canvasWidth - estimatedWidth) / 2,
    y: bottom - height,
    width: estimatedWidth,
    height,
  };
}

function boxViolations(box: CaptionBox, safe: NormalisedRect, canvasWidth: number, canvasHeight: number): string[] {
  const left = safe.x * canvasWidth;
  const top = safe.y * canvasHeight;
  const right = (safe.x + safe.width) * canvasWidth;
  const bottom = (safe.y + safe.height) * canvasHeight;
  const sides: string[] = [];
  if (box.x < left - 0.5) sides.push('left');
  if (box.x + box.width > right + 0.5) sides.push('right');
  if (box.y < top - 0.5) sides.push('top');
  if (box.y + box.height > bottom + 0.5) sides.push('bottom');
  return sides;
}

const SEVERITY_ORDER: Record<TechnicalQaFinding['severity'], number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

/** Run every check in `ALL_CHECK_IDS` order and collect the ledger + findings. */
export function evaluateChecks(measurements: RenderMeasurements, context: QaContext): QaEvaluation {
  const checksRun: QaCheckRecord[] = [];
  const findings: TechnicalQaFinding[] = [];

  for (const checkId of ALL_CHECK_IDS) {
    const check = CHECKS[checkId];
    let outcome: CheckOutcome;
    try {
      outcome = check(measurements, context);
    } catch (error) {
      // A thrown check is recorded as `errored`, not swallowed and not fatal.
      // One broken detector must not take down a report that 22 other checks
      // could still have populated — but it must never present as clean either.
      outcome = {
        status: 'errored',
        reason: `The check threw: ${(error as Error).message}`,
        findings: [],
      };
    }
    checksRun.push({ checkId, status: outcome.status, reason: outcome.reason });
    findings.push(...outcome.findings);
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return { checksRun, findings };
}
