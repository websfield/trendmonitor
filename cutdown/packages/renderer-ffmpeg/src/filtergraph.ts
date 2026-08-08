import { escapeFiltergraphText, escapeFilterPath, FfmpegError, EXIT_INPUT_VALIDATION } from '@cutdown/renderer-core';
import type { PlannedClip, Timebase } from './timeline.js';

/**
 * Filtergraph assembly — the one place a clip list becomes an FFmpeg command.
 *
 * Every value that originates outside this codebase (caption text, font paths,
 * background colours drawn from a StyleProfile) passes through
 * `escapeFiltergraphText()` / `escapeFilterPath()` on its way in. Nothing is
 * interpolated raw, including values that "obviously" cannot contain a
 * metacharacter — a hex colour is validated *and* escaped, because the cost is
 * a function call and the failure mode is filter injection.
 */

export type AspectTreatmentMode =
  | 'subject_reframe'
  | 'letterbox'
  | 'blurred_background'
  | 'branded_background'
  | 'split_screen';

export interface CanvasSpec {
  readonly width: number;
  readonly height: number;
  readonly frameRate: Timebase;
}

export interface VideoTreatment {
  readonly mode: AspectTreatmentMode;
  /** `#RRGGBB` background for `branded_background`; ignored otherwise. */
  readonly backgroundColourHex?: string;
}

const inputError = (code: string, message: string, details?: Record<string, unknown>): FfmpegError =>
  new FfmpegError(
    details === undefined
      ? { code, message, exitCode: EXIT_INPUT_VALIDATION }
      : { code, message, exitCode: EXIT_INPUT_VALIDATION, details },
  );

/** `#RRGGBB` → FFmpeg's `0xRRGGBB`. Rejects anything else outright. */
export function toFfmpegColour(hex: string): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (match === null) {
    throw inputError('INVALID_COLOUR', `Background colour must be #RRGGBB; received "${hex}".`, { hex });
  }
  return `0x${(match[1] as string).toUpperCase()}`;
}

const fpsExpression = (frameRate: Timebase): string => `${String(frameRate.den)}/${String(frameRate.num)}`;

/**
 * The per-clip video chain, ending at label `[v<i>]`.
 *
 * ## Why two treatments are refused rather than approximated
 *
 * `subject_reframe` and `split_screen` are legal EDL values that Phase 0 cannot
 * honestly execute:
 *
 *   - **`subject_reframe`** needs subject tracks — REQ-016, deferred to product
 *     Phase 1. Without them the only available behaviour is a centre crop, and
 *     REQ-052 forbids blind centre-cropping so firmly that the enum has no
 *     `centre_crop` member at all. Silently performing the prohibited treatment
 *     under an approved name would be worse than performing it openly.
 *   - **`split_screen`** composes multiple sources into one frame, which is a
 *     different timeline model than the one clip-per-slot EDL Phase 0 resolves.
 *
 * Both therefore raise a structured error naming the requirement, so `plan()`
 * refuses before any encode cost is spent.
 */
export function videoChain(
  inputIndex: number,
  canvas: CanvasSpec,
  treatment: VideoTreatment,
  fade?: ClipFade,
): string {
  const fadeSteps = videoFadeSteps(fade);
  const w = String(canvas.width);
  const h = String(canvas.height);
  const label = `v${String(inputIndex)}`;
  const src = `[${String(inputIndex)}:v]`;

  // Fit inside the canvas without distorting, on an even-pixel grid. `decrease`
  // never upscales past the canvas; the pad below fills whatever is left.
  const fit = `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=bicubic`;
  // Every chain ends with the same normalisation triple. `fps` re-times to the
  // output grid, `setsar=1` kills any non-square pixel aspect the source
  // carried (a 4:3 anamorphic clip would otherwise land stretched), and
  // `format` pins the pixel format the encoder will see rather than letting the
  // filter chain negotiate one — negotiation is a source of run-to-run drift.
  // `setpts=PTS-STARTPTS` first, mirroring the audio chain's `asetpts`. With
  // input-level `-ss`, each segment arrives carrying its own PTS origin; concat
  // expects segments that start at zero. Normalising only the audio side left an
  // asymmetry that could show up as exactly the drift the +/-40 ms A/V sync
  // budget exists to absorb.
  const normalise = `setpts=PTS-STARTPTS,fps=${fpsExpression(canvas.frameRate)},setsar=1,format=yuv420p`;

  switch (treatment.mode) {
    case 'letterbox': {
      return `${src}${fit},pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x000000,${normalise}${fadeSteps}[${label}]`;
    }
    case 'branded_background': {
      const colour = toFfmpegColour(treatment.backgroundColourHex ?? '#000000');
      return `${src}${fit},pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${escapeFiltergraphText(colour)},${normalise}${fadeSteps}[${label}]`;
    }
    case 'blurred_background': {
      // The background is the SAME frame scaled to cover and blurred, so the
      // margins carry the clip's own colour and motion instead of a flat bar.
      // `increase` + `crop` is cover-fit; the crop is of the *background* only,
      // so REQ-052's no-blind-crop rule is untouched — nothing of the subject is
      // lost, the full frame is still composited on top.
      const bg = `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=bicubic,crop=${w}:${h},gblur=sigma=24`;
      return (
        `${src}split=2[bg${String(inputIndex)}][fg${String(inputIndex)}];` +
        `[bg${String(inputIndex)}]${bg}[bgb${String(inputIndex)}];` +
        `[fg${String(inputIndex)}]${fit}[fgf${String(inputIndex)}];` +
        `[bgb${String(inputIndex)}][fgf${String(inputIndex)}]overlay=(W-w)/2:(H-h)/2,${normalise}${fadeSteps}[${label}]`
      );
    }
    case 'subject_reframe':
      throw inputError(
        'ASPECT_TREATMENT_UNSUPPORTED',
        'aspectTreatment `subject_reframe` needs subject tracking (REQ-016), which is deferred to product Phase 1. ' +
          'Phase 0 refuses rather than falling back to a centre crop: REQ-052 forbids blind centre-cropping, and the ' +
          'AspectTreatment enum omits `centre_crop` precisely so it cannot be performed under another name. ' +
          'Choose `letterbox`, `blurred_background`, or `branded_background` in the EDL.',
        { mode: treatment.mode, requirement: 'REQ-016' },
      );
    case 'split_screen':
      throw inputError(
        'ASPECT_TREATMENT_UNSUPPORTED',
        'aspectTreatment `split_screen` composes multiple sources into one frame, which the Phase 0 one-clip-per-slot ' +
          'timeline does not model. Deferred with the multi-source composition work.',
        { mode: treatment.mode },
      );
    default: {
      const exhaustive: never = treatment.mode;
      throw inputError('ASPECT_TREATMENT_UNKNOWN', `Unknown aspect treatment: ${String(exhaustive)}.`);
    }
  }
}

/** Boundary fade length. Long enough to kill a click, short enough not to be heard as a fade. */
export const BOUNDARY_FADE_SECONDS = 0.02;

/**
 * An editorial fade for one clip (D-52), already converted to the exact decimal
 * seconds strings FFmpeg receives. Duration-preserving by construction: fades
 * happen INSIDE the clip's own frames, so output length and caption cue times
 * are identical with or without them. (A fade still changes the EDL and its
 * hashes like any other edit decision — what stays invariant is the
 * draft→final chain, since both tiers render the same faded EDL.)
 */
export interface ClipFade {
  /** Fade-in duration in seconds, or null for a hard head. */
  readonly inSeconds: string | null;
  /** Fade-out start offset within the clip, null when outSeconds is null. */
  readonly outStartSeconds: string | null;
  /** Fade-out duration in seconds, or null for a hard tail. */
  readonly outSeconds: string | null;
}

/** The video-side fade filter steps for a clip, empty when there is no fade. */
function videoFadeSteps(fade: ClipFade | undefined): string {
  if (fade === undefined) return '';
  const steps: string[] = [];
  if (fade.inSeconds !== null) steps.push(`fade=t=in:st=0:d=${fade.inSeconds}`);
  if (fade.outSeconds !== null && fade.outStartSeconds !== null) {
    steps.push(`fade=t=out:st=${fade.outStartSeconds}:d=${fade.outSeconds}`);
  }
  return steps.length === 0 ? '' : `,${steps.join(',')}`;
}

/**
 * The per-clip audio chain, ending at `[a<i>]`.
 *
 * `aformat` first, and identically for every clip: `concat` refuses to join
 * segments whose sample rate, sample format, or channel layout differ, and a
 * mixed-format EDL (a 44.1 kHz mono voice memo beside 48 kHz stereo camera
 * audio) is the normal case rather than the exotic one.
 *
 * Ambience is preserved — there is no gate, no noise suppression, and no
 * ducking. D-2 forbids added music, so there is nothing to duck against, and a
 * gate applied blind to unknown footage removes room tone that the cut depends
 * on for continuity.
 */
export function audioChain(inputIndex: number, durationSeconds: string, fade?: ClipFade): string {
  const label = `a${String(inputIndex)}`;
  // An editorial fade (D-52) REPLACES the boundary micro-fade on its side — it
  // is strictly longer (schema floor 40 ms vs the 20 ms click-killer), so the
  // click-killing property is preserved, not layered twice.
  const fadeIn = fade !== undefined && fade.inSeconds !== null ? fade.inSeconds : String(BOUNDARY_FADE_SECONDS);
  const editorialOut = fade !== undefined && fade.outSeconds !== null && fade.outStartSeconds !== null;
  const fadeOutStart = editorialOut
    ? (fade.outStartSeconds as string)
    : Math.max(0, Number(durationSeconds) - BOUNDARY_FADE_SECONDS).toFixed(6);
  const fadeOut = editorialOut ? (fade.outSeconds as string) : String(BOUNDARY_FADE_SECONDS);
  return (
    `[${String(inputIndex)}:a]` +
    'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,' +
    `afade=t=in:st=0:d=${fadeIn},` +
    `afade=t=out:st=${fadeOutStart}:d=${fadeOut},` +
    `asetpts=PTS-STARTPTS[${label}]`
  );
}

export interface GraphInput {
  readonly clip: PlannedClip;
  readonly treatment: VideoTreatment;
  readonly durationSeconds: string;
  /** Editorial fade for this clip (D-52), absent for a hard cut. */
  readonly fade?: ClipFade;
}

export interface BurnInSpec {
  /** Absolute path to the ASS file. */
  readonly assPath: string;
  /** Absolute directory libass searches for fonts. */
  readonly fontsDir: string;
}

export interface DraftBadgeSpec {
  readonly text: string;
  /** Absolute path to the font file drawtext renders with. */
  readonly fontFile: string;
  readonly fontSizePx: number;
}

export interface BuildGraphInput {
  readonly canvas: CanvasSpec;
  readonly inputs: readonly GraphInput[];
  readonly withAudio: boolean;
  readonly burnIn: BurnInSpec;
  readonly badge: DraftBadgeSpec | null;
  readonly loudness: { readonly targetLufs: number; readonly maxTruePeakDbtp: number } | null;
}

export interface BuiltGraph {
  readonly filterComplex: string;
  readonly videoLabel: string;
  readonly audioLabel: string | null;
}

export function buildFilterGraph(input: BuildGraphInput): BuiltGraph {
  if (input.inputs.length === 0) {
    throw inputError('EMPTY_TIMELINE', 'A render needs at least one clip; the EDL resolved to none.');
  }

  const chains: string[] = [];
  const concatLabels: string[] = [];

  input.inputs.forEach((graphInput, i) => {
    chains.push(videoChain(i, input.canvas, graphInput.treatment, graphInput.fade));
    concatLabels.push(`[v${String(i)}]`);
    if (input.withAudio) {
      chains.push(audioChain(i, graphInput.durationSeconds, graphInput.fade));
      concatLabels.push(`[a${String(i)}]`);
    }
  });

  const n = String(input.inputs.length);
  const audioStreams = input.withAudio ? '1' : '0';
  chains.push(
    `${concatLabels.join('')}concat=n=${n}:v=1:a=${audioStreams}[vcat]${input.withAudio ? '[acat]' : ''}`,
  );

  // Captions burn in AFTER the concat, against the output timeline — which is
  // the timeline the ASS cue times are expressed in. Burning per clip would
  // require re-basing every cue and would re-encode the same text N times.
  chains.push(
    `[vcat]subtitles=filename=${escapeFilterPath(input.burnIn.assPath)}:fontsdir=${escapeFilterPath(input.burnIn.fontsDir)}[vsub]`,
  );

  let videoLabel = '[vsub]';
  if (input.badge !== null) {
    // D-34's visible version identifier. Placed top-left with a box behind it:
    // a draft that could be mistaken for a deliverable defeats the tier split,
    // and an unboxed overlay disappears against a light frame.
    chains.push(
      `[vsub]drawtext=fontfile=${escapeFilterPath(input.badge.fontFile)}:` +
        `text=${escapeFiltergraphText(input.badge.text)}:` +
        `fontcolor=white:fontsize=${String(input.badge.fontSizePx)}:` +
        'box=1:boxcolor=black@0.55:boxborderw=12:x=32:y=32[vout]',
    );
    videoLabel = '[vout]';
  }

  let audioLabel: string | null = null;
  if (input.withAudio) {
    if (input.loudness !== null) {
      // Single-pass loudnorm. The two-pass (linear) form needs a measurement
      // run first, and its measured values then enter the second pass as
      // literal arguments — which would make the render command a function of a
      // prior run's output and break the tier-1 claim that a manifest alone
      // determines the bytes. Single-pass is deterministic for a given input.
      chains.push(
        `[acat]loudnorm=I=${String(input.loudness.targetLufs)}:TP=${String(input.loudness.maxTruePeakDbtp)}:LRA=11[aout]`,
      );
      audioLabel = '[aout]';
    } else {
      audioLabel = '[acat]';
    }
  }

  return { filterComplex: chains.join(';'), videoLabel, audioLabel };
}
