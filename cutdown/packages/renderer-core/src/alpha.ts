import { inputArgs, runFfmpegAllowFailure } from './ffmpeg.js';

/**
 * Does this raster asset carry REAL transparency?
 *
 * decisions.md D-40 splits `logo` from `image` on a real alpha channel — an
 * alpha-capable pixel format AND at least one non-opaque pixel. The pixel
 * format alone is not enough: most exported PNGs are RGBA and fully opaque, so
 * trusting `pix_fmt` would classify every PNG screenshot as a logo.
 *
 * Lives in `renderer-core` rather than in the `ingest` skill because tech-spec
 * §11 makes this package the ONLY place that spawns ffmpeg. The rule has teeth
 * precisely because convenient one-off exceptions like this one are where it
 * would otherwise erode.
 */

export interface AlphaProbe {
  /** True when the pixel format can carry alpha at all. */
  alphaCapable: boolean;
  /**
   * True when at least one pixel is non-opaque. `null` when the probe could not
   * run — deliberately distinct from `false`, so a caller can take a
   * conservative branch instead of concluding "fully opaque".
   */
  hasNonOpaquePixel: boolean | null;
  /** Minimum alpha value observed, 0-255. Null when not measured. */
  minAlpha: number | null;
}

/** Pixel formats that can carry transparency. */
const ALPHA_PIXEL_FORMATS = /(^|[^a-z])(rgba|bgra|argb|abgr|ya|yuva|pal8)/i;

export function isAlphaCapable(pixelFormat: string | null | undefined): boolean {
  return typeof pixelFormat === 'string' && ALPHA_PIXEL_FORMATS.test(pixelFormat);
}

/**
 * `alphaextract` lifts the alpha plane into a greyscale video; `signalstats`
 * then reports its minimum. YMIN < 255 means some pixel is not fully opaque.
 *
 * The filtergraph is a CONSTANT authored here — the file path travels via `-i`,
 * through the same whitelisted, option-shape-checked path handling as every
 * other input. Interpolating a user path into the graph string (e.g. via
 * `movie=...`) would reintroduce the injection surface §11 exists to close: a
 * filename containing `,` or `'` would terminate the filter and start another.
 */
export async function probeAlpha(
  path: string,
  pixelFormat: string | null | undefined,
): Promise<AlphaProbe> {
  const alphaCapable = isAlphaCapable(pixelFormat);
  if (!alphaCapable) {
    // Nothing to measure: a format with no alpha channel is opaque by
    // construction, and that IS a determination, not a failure to make one.
    return { alphaCapable: false, hasNonOpaquePixel: false, minAlpha: 255 };
  }

  const result = await runFfmpegAllowFailure([
    '-hide_banner',
    '-v',
    'info',
    ...inputArgs(path),
    '-vf',
    'alphaextract,signalstats,metadata=print:key=lavfi.signalstats.YMIN',
    '-frames:v',
    '1',
    '-f',
    'null',
    '-',
  ]);

  // `metadata=print` writes to stderr as: `lavfi.signalstats.YMIN=0`
  const match = /lavfi\.signalstats\.YMIN=(\d+)/.exec(result.stderr);
  if (!match?.[1]) {
    // Could not measure. Reporting `null` rather than `false` keeps the caller
    // honest: "we did not find out" must not read as "fully opaque".
    return { alphaCapable: true, hasNonOpaquePixel: null, minAlpha: null };
  }

  const minAlpha = Number.parseInt(match[1], 10);
  return {
    alphaCapable: true,
    hasNonOpaquePixel: minAlpha < 255,
    minAlpha,
  };
}
