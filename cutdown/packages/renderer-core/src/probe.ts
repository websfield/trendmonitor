import {
  inputArgs,
  runFfmpegAllowFailure,
  runFfprobe,
  assertSafeInputPath,
  FfmpegError,
  EXIT_RUNTIME,
  type RunOptions,
} from './ffmpeg.js';

/**
 * ffprobe → the REQ-004 preflight surface (`source-asset-v1.json`).
 *
 * REQ-004 names twelve things preflight must establish before indexing:
 * container, codec, frame rate, VFR behaviour, timebase, rotation, colour
 * space, HDR, audio tracks, sample rate, corruption, and duration. This module
 * produces all twelve, shaped exactly as the schema's `PreflightReport`,
 * `VideoStreamInfo`, `AudioStreamInfo` and `CorruptionReport` require.
 *
 * The types below are declared locally rather than imported from
 * `@cutdown/contracts`. That is a deliberate, narrow duplication: this package
 * has no dependencies (not even a workspace one), and adding a project
 * reference would mean editing `package.json` and two `tsconfig.json` files
 * that this change is not scoped to touch. They are structurally identical to
 * `generated/typescript/source-asset-v1.ts` and are checked against real
 * fixtures; see the report note recommending the reference be added.
 */

// ---------------------------------------------------------------------------
// Contract shapes (mirror of source-asset-v1.json — see note above)
// ---------------------------------------------------------------------------

export interface Timebase {
  num: number;
  den: number;
}
export interface MediaTime {
  ticks: number;
  timebase: Timebase;
}
export interface ContainerInfo {
  formatName: string;
  formatLongName: string;
}
export type FrameRateMode = 'cfr' | 'vfr' | 'unknown';
export type CorruptionStatus = 'clean' | 'suspect' | 'corrupt';

export interface ColorInfo {
  space: string | null;
  primaries: string | null;
  transfer: string | null;
  range: string | null;
}
export interface HdrInfo {
  isHdr: boolean;
  detectedFormat: string | null;
}
export interface VideoStreamInfo {
  codecName: string;
  profile: string | null;
  pixelFormat: string;
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  rotationDegrees: 0 | 90 | 180 | 270;
  averageFrameRate: Timebase;
  realFrameRate: Timebase;
  frameRateMode: FrameRateMode;
  timebase: Timebase;
  frameCount: number | null;
  color: ColorInfo;
  hdr: HdrInfo;
}
export interface AudioStreamInfo {
  streamIndex: number;
  codecName: string;
  sampleRate: number;
  channels: number;
  channelLayout: string | null;
  timebase: Timebase;
  durationTicks: number;
}
export interface CorruptionReport {
  status: CorruptionStatus;
  detail: string | null;
  decodeErrorCount: number;
}
export interface PreflightReport {
  inspected: boolean;
  container: ContainerInfo | null;
  duration: MediaTime | null;
  video: VideoStreamInfo | null;
  audioTracks: AudioStreamInfo[];
  corruption: CorruptionReport | null;
}

// ---------------------------------------------------------------------------
// Raw ffprobe JSON
// ---------------------------------------------------------------------------

interface RawSideData {
  side_data_type?: string;
  rotation?: number;
}
interface RawStream {
  index?: number;
  codec_name?: string;
  codec_type?: string;
  profile?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  coded_width?: number;
  coded_height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  time_base?: string;
  duration_ts?: number;
  nb_frames?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  color_space?: string;
  color_primaries?: string;
  color_transfer?: string;
  color_range?: string;
  side_data_list?: RawSideData[];
  disposition?: Record<string, number>;
  tags?: Record<string, string>;
}
interface RawFormat {
  format_name?: string;
  format_long_name?: string;
  duration?: string;
}
export interface RawProbe {
  streams?: RawStream[];
  format?: RawFormat;
}

/**
 * The ffprobe invocation, and a correction to the obvious one.
 *
 * `-show_side_data` **does not exist in ffprobe 8** — passing it fails with
 * `Option not found` and exit 1. Side data (which is where rotation actually
 * lives, per D-41) is included in `-show_streams` output as `side_data_list`
 * with no extra flag. Anyone reintroducing `-show_side_data` from an older
 * recipe will break every probe in the pipeline, hence this note.
 */
const PROBE_ARGS = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams'];

// ---------------------------------------------------------------------------
// Rational parsing
// ---------------------------------------------------------------------------

/**
 * Parse an ffprobe rational ("1/30000", "30/1", "0/0").
 *
 * Returns null for the degenerate forms rather than coercing them. ffprobe
 * emits `0/0` routinely — every audio stream reports `r_frame_rate=0/0` — and
 * the schema's `Timebase` requires `num >= 1` and `den >= 1`, so `0/0` is not
 * representable and must not be silently rounded into something that is.
 */
export function parseRational(value: string | undefined): Timebase | null {
  if (value === undefined) return null;
  const match = /^(-?\d+)\/(-?\d+)$/.exec(value);
  if (match === null) return null;
  const num = Number(match[1]);
  const den = Number(match[2]);
  if (!Number.isInteger(num) || !Number.isInteger(den) || num <= 0 || den <= 0) return null;
  return { num, den };
}

/** Exact equality of two rationals by cross-multiplication — no float compare. */
const rationalsEqual = (a: Timebase, b: Timebase): boolean => a.num * b.den === b.num * a.den;

// ---------------------------------------------------------------------------
// Rotation (decisions.md D-41)
// ---------------------------------------------------------------------------

/**
 * Normalise a rotation into the schema's `{0, 90, 180, 270}` enum.
 *
 * **Direction, stated once so nothing downstream has to guess.** The value
 * recorded in `rotationDegrees` is ffprobe's own Display-Matrix convention,
 * which is **counter-clockwise**-positive. Verified empirically against a
 * half-red / half-blue fixture: a clip carrying `rotation: 90` autorotates so
 * that the *left* edge of the coded frame lands at the *bottom* of the
 * displayed frame — a 90° counter-clockwise turn.
 *
 * This matters because `source-asset-v1.json` currently describes the field as
 * "normalized **clockwise** rotation", which is the opposite sense. The value
 * chosen here is the one D-41, the golden-set README, and the `ugly.mp4`
 * fixture all assert (`rotationDegrees: 90` for a clip ffprobe reports as
 * `rotation: 90`); the schema's wording is what needs correcting. Nothing at
 * Phase 0 can observe the difference — only the display-dimension swap is
 * consumed, and 90 and 270 swap identically — but the renderer that applies
 * rotation in Phase 6 would be exactly 180° wrong if it read the schema's word
 * instead of this one.
 *
 * The legacy `rotate` container tag uses the OPPOSITE (clockwise) convention —
 * an iPhone clip historically carried `TAG:rotate=90` alongside
 * `displaymatrix rotation=-90` — so the fallback path negates it to land in the
 * same convention as the side data.
 */
export function normaliseRotation(degrees: number): 0 | 90 | 180 | 270 {
  const rounded = Math.round(degrees / 90) * 90;
  const wrapped = ((rounded % 360) + 360) % 360;
  return wrapped === 90 || wrapped === 180 || wrapped === 270 ? wrapped : 0;
}

/**
 * Read rotation from Display Matrix side data first, legacy tag second.
 *
 * D-41 is emphatic about the order because FFmpeg 8 **silently ignores** the
 * `rotate` stream tag: a probe written against `stream_tags.rotate` reads 0° on
 * every modern rotated clip and produces a sideways crop with no error
 * anywhere. Side data is the only field that carries the truth now; the tag is
 * read solely so older files still in a client's archive are not misread.
 */
function readRotation(stream: RawStream): 0 | 90 | 180 | 270 {
  const displayMatrix = stream.side_data_list?.find(
    (entry) => entry.side_data_type === 'Display Matrix' && typeof entry.rotation === 'number',
  );
  if (displayMatrix?.rotation !== undefined) {
    return normaliseRotation(displayMatrix.rotation);
  }
  const legacy = stream.tags?.['rotate'];
  if (legacy !== undefined) {
    const parsed = Number(legacy);
    // Negated: the legacy tag is clockwise-positive, side data is not.
    if (Number.isFinite(parsed)) return normaliseRotation(-parsed);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// HDR
// ---------------------------------------------------------------------------

/**
 * Infer HDR from the transfer characteristic — the only signal available
 * without decoding pixels, and the one the `ugly.mp4` fixture exercises.
 *
 * Detected and recorded, never converted: tone-mapping is REQ-089 and lands in
 * product Phase 1. Recording it now is what lets that work find its inputs
 * without re-ingesting every asset.
 */
export function detectHdr(transfer: string | null): HdrInfo {
  if (transfer === 'smpte2084') return { isHdr: true, detectedFormat: 'pq' };
  if (transfer === 'arib-std-b67') return { isHdr: true, detectedFormat: 'hlg' };
  return { isHdr: false, detectedFormat: null };
}

// ---------------------------------------------------------------------------
// Frame-rate mode
// ---------------------------------------------------------------------------

/**
 * `cfr` when ffprobe's `r_frame_rate` and `avg_frame_rate` agree exactly,
 * `vfr` when they differ, `unknown` when either is unreadable.
 *
 * `unknown` is fail-closed by contract: `frame-rate-mode.json` states range
 * validation treats it as `vfr`, because REQ-019 forbids trusting a transcript
 * timestamp against a timebase we could not verify. So the honest answer when
 * ffprobe gives us `0/0` is `unknown` — never a cheerful default of `cfr`.
 */
export function classifyFrameRate(
  real: Timebase | null,
  average: Timebase | null,
): FrameRateMode {
  if (real === null || average === null) return 'unknown';
  return rationalsEqual(real, average) ? 'cfr' : 'vfr';
}

// ---------------------------------------------------------------------------
// Corruption
// ---------------------------------------------------------------------------

/**
 * Full-decode integrity pass: `ffmpeg -v error -i <f> -f null -`.
 *
 * Two findings from measuring this on FFmpeg 8, both of which shape the design:
 *
 *   1. **ffmpeg exits 0 on a badly truncated file.** A `clean.mp4` cut to 40%
 *      of its bytes emits `partial file`, `Invalid NAL unit size` and
 *      `Decoding error` — and still exits 0. Exit code is therefore useless as
 *      the corrupt/suspect discriminator, and any implementation that used it
 *      would report a truncated asset as clean.
 *   2. **`-progress pipe:1` gives a machine-readable decoded-frame count** on
 *      stdout in the same pass, with no extra decode.
 *
 * So the classification is made from what actually distinguishes the two states
 * the enum defines — "decode emitted recoverable errors" vs "the asset failed
 * to decode": errors plus a short decode (fewer frames came out than the
 * container declares) is `corrupt`; errors with a complete decode is `suspect`.
 * When the container declares no frame count there is nothing to compare
 * against, so errors degrade to `suspect` — the weaker claim, deliberately,
 * since D-35 makes both a non-waivable packaging blocker anyway.
 */
export async function probeCorruption(
  absolutePath: string,
  declaredFrameCount: number | null,
  options: RunOptions = {},
): Promise<CorruptionReport> {
  assertSafeInputPath(absolutePath);
  const result = await runFfmpegAllowFailure(
    ['-v', 'error', '-progress', 'pipe:1', '-nostdin', ...inputArgs(absolutePath), '-f', 'null', '-'],
    options,
  );

  const errorLines = result.stderr
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const decodeErrorCount = errorLines.length;

  if (decodeErrorCount === 0 && result.exitCode === 0) {
    return { status: 'clean', detail: null, decodeErrorCount: 0 };
  }

  const decodedFrames = lastProgressFrameCount(result.stdout);
  const shortDecode =
    declaredFrameCount !== null && decodedFrames !== null && decodedFrames < declaredFrameCount;
  const status: CorruptionStatus =
    result.exitCode !== 0 || shortDecode ? 'corrupt' : 'suspect';

  const detail = [
    errorLines.slice(0, 5).join(' | '),
    shortDecode ? `decoded ${String(decodedFrames)} of ${String(declaredFrameCount)} declared frames` : undefined,
    result.exitCode !== 0 ? `ffmpeg exit ${String(result.exitCode)}` : undefined,
  ]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join('; ');

  return { status, detail: detail.length > 0 ? detail : null, decodeErrorCount };
}

/** Last `frame=N` line of an `-progress pipe:1` stream. */
function lastProgressFrameCount(stdout: string): number | null {
  let last: number | null = null;
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^frame=(\d+)\s*$/.exec(line.trim());
    if (match !== null) last = Number(match[1]);
  }
  return last;
}

// ---------------------------------------------------------------------------
// Stream mapping
// ---------------------------------------------------------------------------

function mapVideoStream(stream: RawStream): VideoStreamInfo {
  const codedWidth = stream.coded_width ?? stream.width ?? 0;
  const codedHeight = stream.coded_height ?? stream.height ?? 0;
  if (codedWidth < 1 || codedHeight < 1) {
    throw new FfmpegError({
      code: 'VIDEO_DIMENSIONS_UNREADABLE',
      message: 'ffprobe reported a video stream with no usable dimensions.',
      exitCode: EXIT_RUNTIME,
    });
  }

  const rotationDegrees = readRotation(stream);
  // 90 and 270 exchange the axes; 0 and 180 preserve them.
  const swapped = rotationDegrees === 90 || rotationDegrees === 270;

  const realFrameRate = parseRational(stream.r_frame_rate);
  const averageFrameRate = parseRational(stream.avg_frame_rate);
  const frameRateMode = classifyFrameRate(realFrameRate, averageFrameRate);
  // The schema requires both rate fields; when one is degenerate we fall back to
  // the other and let `frameRateMode: unknown` carry the uncertainty, rather
  // than inventing a rate.
  const fallbackRate: Timebase = realFrameRate ?? averageFrameRate ?? { num: 1, den: 1 };

  const timebase = parseRational(stream.time_base);
  if (timebase === null) {
    throw new FfmpegError({
      code: 'VIDEO_TIMEBASE_UNREADABLE',
      message:
        'ffprobe reported no usable time_base for the video stream; every SourceRange is expressed in it (REQ-019), so preflight cannot proceed.',
      exitCode: EXIT_RUNTIME,
    });
  }

  const transfer = stream.color_transfer ?? null;

  return {
    codecName: stream.codec_name ?? 'unknown',
    profile: stream.profile ?? null,
    pixelFormat: stream.pix_fmt ?? 'unknown',
    codedWidth,
    codedHeight,
    displayWidth: swapped ? codedHeight : codedWidth,
    displayHeight: swapped ? codedWidth : codedHeight,
    rotationDegrees,
    averageFrameRate: averageFrameRate ?? fallbackRate,
    realFrameRate: realFrameRate ?? fallbackRate,
    frameRateMode,
    timebase,
    frameCount: parseFrameCount(stream.nb_frames),
    color: {
      space: stream.color_space ?? null,
      primaries: stream.color_primaries ?? null,
      transfer,
      range: stream.color_range ?? null,
    },
    hdr: detectHdr(transfer),
  };
}

function parseFrameCount(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Audio timebase is rewritten to `{num: 1, den: sampleRate}`.
 *
 * `timecode-v1.json` requires it, and the requirement earns its keep: with that
 * timebase, ticks ARE sample counts, so a frame range and a sample range are
 * the same arithmetic and no float conversion sits between a transcript
 * timestamp and a cut. In practice FFmpeg already reports `1/48000` for AAC in
 * MP4, but a container that reports something else (`1/1000` is common in
 * Matroska) must be rescaled rather than trusted, or `durationTicks` would not
 * be a sample count.
 */
function mapAudioStream(stream: RawStream): AudioStreamInfo | null {
  const sampleRate = Number(stream.sample_rate ?? '0');
  if (!Number.isInteger(sampleRate) || sampleRate < 1) return null;

  const targetTimebase: Timebase = { num: 1, den: sampleRate };
  const sourceTimebase = parseRational(stream.time_base);
  const rawTicks = stream.duration_ts ?? 0;
  // ticks_target = ticks_source * (source_seconds_per_tick) / (target_seconds_per_tick)
  const durationTicks =
    sourceTimebase === null
      ? 0
      : Math.round((rawTicks * sourceTimebase.num * targetTimebase.den) / (sourceTimebase.den * targetTimebase.num));

  return {
    streamIndex: stream.index ?? 0,
    codecName: stream.codec_name ?? 'unknown',
    sampleRate,
    channels: stream.channels ?? 1,
    channelLayout: stream.channel_layout ?? null,
    timebase: targetTimebase,
    durationTicks: Math.max(0, durationTicks),
  };
}

/**
 * Duration as exact rational ticks, never float seconds.
 *
 * Preferred source is the primary stream's `duration_ts` in its own
 * `time_base` — already integers, already exact, and already the timebase every
 * SourceRange into this asset uses. `format.duration` is a *decimal string*
 * ("5.000000"); parsing it as seconds reintroduces exactly the float that
 * tech-spec §3 fixed the whole timecode convention to avoid, so it is used only
 * when no stream declares `duration_ts`, and then at a millisecond timebase
 * that makes the loss of precision explicit rather than hidden.
 */
function computeDuration(streams: RawStream[], format: RawFormat | undefined): MediaTime | null {
  const primary =
    streams.find((s) => s.codec_type === 'video' && s.duration_ts !== undefined) ??
    streams.find((s) => s.codec_type === 'audio' && s.duration_ts !== undefined);

  if (primary?.duration_ts !== undefined) {
    const timebase = parseRational(primary.time_base);
    if (timebase !== null) {
      return { ticks: Math.max(0, Math.trunc(primary.duration_ts)), timebase };
    }
  }

  const seconds = Number(format?.duration ?? 'NaN');
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return { ticks: Math.round(seconds * 1000), timebase: { num: 1, den: 1000 } };
}

// ---------------------------------------------------------------------------
// Public entrypoints
// ---------------------------------------------------------------------------

/** Raw ffprobe JSON for one file. Exported so a caller can inspect what preflight saw. */
export async function probeRaw(
  absolutePath: string,
  options: RunOptions = {},
): Promise<RawProbe> {
  assertSafeInputPath(absolutePath);
  const { stdout } = await runFfprobe([...PROBE_ARGS, ...inputArgs(absolutePath)], options);
  try {
    return JSON.parse(stdout) as RawProbe;
  } catch (cause) {
    throw new FfmpegError({
      code: 'FFPROBE_JSON_UNPARSEABLE',
      message: `ffprobe produced output that is not JSON: ${(cause as Error).message}`,
      exitCode: EXIT_RUNTIME,
      details: { head: stdout.slice(0, 500) },
    });
  }
}

export interface PreflightOptions extends RunOptions {
  /**
   * Skip the full-decode corruption pass. It is a complete decode — real cost
   * on real footage — and a caller that has already decoded the asset should
   * not pay for it twice. `corruption` comes back null, which the schema
   * distinguishes from a clean result.
   */
  readonly skipCorruptionCheck?: boolean;
}

/**
 * The complete REQ-004 preflight for one media file.
 *
 * `inspected: true` on return is a promise, not a formality — ingest is atomic,
 * and a SourceAsset that never reached this function must never reach the job
 * inventory.
 */
export async function preflight(
  absolutePath: string,
  options: PreflightOptions = {},
): Promise<PreflightReport> {
  assertSafeInputPath(absolutePath);
  const raw = await probeRaw(absolutePath, options);
  const streams = raw.streams ?? [];

  // `attached_pic` is cover art (an MP3's embedded JPEG), which ffprobe reports
  // as a video stream. Treating it as the asset's video would give an audio
  // file a 1-frame "video" and a nonsense duration.
  const rawVideo = streams.find(
    (s) => s.codec_type === 'video' && (s.disposition?.['attached_pic'] ?? 0) === 0,
  );
  const video = rawVideo === undefined ? null : mapVideoStream(rawVideo);

  // An EMPTY array is the positive finding "this asset has no audio" — never
  // null, which the schema reserves for "preflight did not run". broll-silent
  // is the fixture that exists to catch a conflation of the two.
  const audioTracks = streams
    .filter((s) => s.codec_type === 'audio')
    .map(mapAudioStream)
    .filter((track): track is AudioStreamInfo => track !== null);

  const container: ContainerInfo | null =
    raw.format?.format_name === undefined
      ? null
      : {
          formatName: raw.format.format_name,
          formatLongName: raw.format.format_long_name ?? raw.format.format_name,
        };

  const corruption =
    options.skipCorruptionCheck === true
      ? null
      : await probeCorruption(absolutePath, video?.frameCount ?? null, options);

  return {
    inspected: true,
    container,
    duration: computeDuration(streams, raw.format),
    video,
    audioTracks,
    corruption,
  };
}
