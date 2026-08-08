import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  inputArgs,
  runFfmpeg,
  assertSafeInputPath,
  assertDeterministicArgv,
  determinismArgs,
  FfmpegError,
  EXIT_INPUT_VALIDATION,
  type RunOptions,
} from './ffmpeg.js';
import { preflight, probeRaw, parseRational, type PreflightReport, type Timebase } from './probe.js';

/**
 * Proxy generation — decisions.md D-25.
 *
 * D-25 in full: *"Proxy only, no mezzanine tier: 720p-fit H.264 CRF 23 + AAC
 * 128 kbps, constant frame rate (VFR normalized per REQ-019), original
 * untouched. Recorded as `proxyProfileVersion` in the SourceIndex."*
 *
 * Three readings D-25 leaves to the implementation, decided here and flagged
 * for a decisions.md row:
 *
 *   1. **"720p-fit" is a bound on the SHORT edge, not on height.** Reading it
 *      as "height ≤ 720" would be actively wrong for this product: Cutdown's
 *      entire Phase 0 output is TikTok 9:16, and a 1080×1920 portrait source
 *      capped at 720 *height* becomes 405×720 — barely a third of the pixels a
 *      draft reviewer needs to judge a caption. Capping the short edge gives
 *      720×1280 for portrait and 1280×720 for landscape, which is what "720p"
 *      means in both orientations.
 *   2. **Never upscale.** A 320×240 source stays 320×240. A proxy exists to be
 *      cheaper than the original; interpolating one larger is pure cost.
 *   3. **Dimensions are computed here, not by an ffmpeg `scale` expression.**
 *      An expression makes the output size a function of a build's rounding
 *      behaviour; computing integers in TypeScript makes the proxy recipe
 *      reproducible and inspectable, which is what `proxyProfileVersion`
 *      caching assumes.
 *
 * The original is opened read-only and never written to. That is REQ-004's
 * standing requirement and the reason `storedPath` and `proxy.storedPath` are
 * separate fields in the first place.
 */

/**
 * Bump on ANY change to the recipe below — dimensions, codec, CRF, bitrate,
 * frame-rate handling, or flags.
 *
 * D-25 requires this to be recorded so a recipe change *invalidates the cache*
 * rather than silently mixing proxy generations within one job. A job holding
 * proxies from two recipes is not a cosmetic problem: draft renders would be
 * cut against media with different scaling, and the resulting review decision
 * would not describe the final render.
 */
export const PROXY_PROFILE_VERSION = '1.0.0';

/** The 720p bound applied to the SHORT edge (see reading 1 above). */
export const PROXY_SHORT_EDGE = 720;
export const PROXY_CRF = 23;
export const PROXY_VIDEO_CODEC = 'h264';
export const PROXY_AUDIO_CODEC = 'aac';
export const PROXY_AUDIO_BITRATE_KBPS = 128;

export interface ProxyRecipe {
  shortEdgeMaxPixels: number;
  videoCodec: string;
  crf: number;
  audioCodec: string | null;
  audioBitrateKbps: number | null;
  constantFrameRate: Timebase;
}

export interface ContentHash {
  algorithm: 'sha256';
  value: string;
}

export interface ProxyRecord {
  storedPath: string;
  contentHash: ContentHash;
  proxyProfileVersion: string;
  recipe: ProxyRecipe;
  timebase: Timebase;
}

export interface GenerateProxyResult {
  readonly record: ProxyRecord;
  /** The preflight used to plan the encode, returned so a caller need not re-probe. */
  readonly sourcePreflight: PreflightReport;
  readonly width: number;
  readonly height: number;
}

/**
 * Scale display dimensions so the short edge fits within `bound`, never
 * upscaling, and round both to even numbers.
 *
 * Evenness is not cosmetic: `yuv420p` subsamples chroma 2×2, and libx264
 * rejects odd dimensions outright. Rounding down rather than up keeps the
 * result inside the bound.
 */
export function fitShortEdge(
  width: number,
  height: number,
  bound: number = PROXY_SHORT_EDGE,
): { width: number; height: number } {
  const shortEdge = Math.min(width, height);
  const scale = shortEdge <= bound ? 1 : bound / shortEdge;
  const even = (value: number): number => Math.max(2, Math.floor((value * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/**
 * The constant frame rate the proxy is normalised to.
 *
 * `r_frame_rate` is used rather than `avg_frame_rate` because on a VFR source
 * the average is an artefact of where the gaps happened to fall — `ugly.mp4`
 * averages 400/19 (≈21.05 fps) purely because two thirds of its frames were
 * dropped after the 2 s mark. Encoding a proxy at 21.05 fps would bake that
 * accident in. `r_frame_rate` is the base rate the timestamps are drawn from
 * (30/1 for that fixture), so normalising to it duplicates frames across the
 * sparse region instead of resampling the whole clip to a fictional rate —
 * which is what REQ-019's "VFR normalized" has to mean if the proxy is to stay
 * a faithful, mappable stand-in for the source.
 */
export function chooseConstantFrameRate(preflightReport: PreflightReport): Timebase {
  const video = preflightReport.video;
  if (video === null) return { num: 30, den: 1 };
  return video.frameRateMode === 'vfr' ? video.realFrameRate : video.averageFrameRate;
}

const sha256File = async (path: string): Promise<ContentHash> =>
  await new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => {
        resolve({ algorithm: 'sha256', value: hash.digest('hex') });
      });
  });

export interface GenerateProxyOptions extends RunOptions {
  /** A preflight already taken of this source, to avoid probing twice. */
  readonly sourcePreflight?: PreflightReport;
}

/**
 * Encode the D-25 proxy for one video asset and return its `ProxyRecord`.
 *
 * `outputPath` must be absolute and must not be the source — the read-only
 * guarantee on originals is enforced here rather than assumed of callers.
 */
export async function generateProxy(
  sourcePath: string,
  outputPath: string,
  options: GenerateProxyOptions = {},
): Promise<GenerateProxyResult> {
  assertSafeInputPath(sourcePath);
  assertSafeInputPath(outputPath);
  if (sourcePath === outputPath) {
    throw new FfmpegError({
      code: 'PROXY_WOULD_OVERWRITE_SOURCE',
      message: `Proxy output path is the source itself; the original is never modified (REQ-004): ${sourcePath}`,
      exitCode: EXIT_INPUT_VALIDATION,
      details: { sourcePath },
    });
  }

  const sourcePreflight =
    options.sourcePreflight ??
    (await preflight(sourcePath, { ...options, skipCorruptionCheck: true }));

  const video = sourcePreflight.video;
  if (video === null) {
    throw new FfmpegError({
      code: 'PROXY_REQUIRES_VIDEO',
      message: `Cannot build a proxy for an asset with no video stream: ${sourcePath}`,
      exitCode: EXIT_INPUT_VALIDATION,
      details: { sourcePath },
    });
  }

  // Display dimensions, not coded — ffmpeg autorotates on decode by default, so
  // the frames arriving at the scaler are already upright. Scaling the coded
  // dimensions of a rotated clip would set a sideways target size.
  const { width, height } = fitShortEdge(video.displayWidth, video.displayHeight);
  const rate = chooseConstantFrameRate(sourcePreflight);
  const hasAudio = sourcePreflight.audioTracks.length > 0;

  await mkdir(dirname(outputPath), { recursive: true });

  const audioArgs = hasAudio
    ? ['-c:a', PROXY_AUDIO_CODEC, '-b:a', `${String(PROXY_AUDIO_BITRATE_KBPS)}k`]
    : // No audio stream in, no silent track fabricated out. A fabricated track
      // would make "does this asset have audio?" unanswerable from the proxy.
      ['-an'];

  const encodeArgv = [
      '-nostdin',
      '-y',
      ...inputArgs(sourcePath),
      '-map',
      '0:v:0',
      ...(hasAudio ? ['-map', '0:a:0'] : []),
      '-vf',
      `scale=${String(width)}:${String(height)}`,
      // `-fps_mode cfr` with an explicit `-r` is what actually normalises a VFR
      // source: frames are duplicated or dropped to land on a fixed grid, so
      // every proxy timestamp is `n / rate` exactly and the source-to-proxy
      // mapping REQ-019 demands is a pure rational, not a lookup table.
      '-fps_mode',
      'cfr',
      '-r',
      `${String(rate.num)}/${String(rate.den)}`,
      '-c:v',
      'libx264',
      '-crf',
      String(PROXY_CRF),
      '-pix_fmt',
      'yuv420p',
      ...audioArgs,
      // Determinism hygiene for a content-addressed artefact (tech-spec §12
      // tier 1): without these the encoder stamps `creation_time` and build
      // metadata, so two identical re-runs produce different bytes, different
      // hashes, and a REQ-005 cache that never hits.
      //
      // Taken from `determinismArgs()` rather than spelled out here. The
      // hand-written copy that used to sit in this spot carried `-fflags`,
      // `-flags` and `-map_metadata` but NOT `-flags:a +bitexact` or `-threads`
      // — and this encode emits AAC whenever the source has audio, so the AAC
      // encoder's build identifier went into a hash the whole REQ-005 cache is
      // keyed on. It is the same defect that was just fixed one layer up, in the
      // shared helper, surviving in a hand-rolled duplicate: exactly the
      // "guard the class, not the field" failure this project has logged before.
      ...determinismArgs(),
      '-movflags',
      '+faststart',
      outputPath,
  ];
  // The proxy is content-addressed, so its pins are load-bearing in the same way
  // a render's are — assert them rather than trusting the list above stays right.
  assertDeterministicArgv(encodeArgv);

  await runFfmpeg(encodeArgv, options);

  // The proxy's own timebase is read back from the encoded file rather than
  // predicted. The muxer chooses it (MP4 defaults to 1/15360, not 1/rate), and
  // a recorded value that disagrees with the file would corrupt every range
  // mapped through it.
  const proxyProbe = await probeRaw(outputPath, options);
  const proxyVideoStream = proxyProbe.streams?.find((s) => s.codec_type === 'video');
  const timebase = parseRational(proxyVideoStream?.time_base) ?? { num: rate.den, den: rate.num };

  return {
    record: {
      storedPath: outputPath,
      contentHash: await sha256File(outputPath),
      proxyProfileVersion: PROXY_PROFILE_VERSION,
      recipe: {
        // The schema field is `shortEdgeMaxPixels` and the value is the
        // short-edge bound (reading 1 above). For landscape they coincide; for
        // portrait they do not. Flagged for a schema description fix.
        shortEdgeMaxPixels: PROXY_SHORT_EDGE,
        videoCodec: PROXY_VIDEO_CODEC,
        crf: PROXY_CRF,
        audioCodec: hasAudio ? PROXY_AUDIO_CODEC : null,
        audioBitrateKbps: hasAudio ? PROXY_AUDIO_BITRATE_KBPS : null,
        constantFrameRate: rate,
      },
      timebase,
    },
    sourcePreflight,
    width,
    height,
  };
}
