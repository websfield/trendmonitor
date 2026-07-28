import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

/**
 * Asset classification (PRD REQ-001, decisions.md D-40).
 *
 * REQ-001 names six classes — video, audio, image, logo, subtitle,
 * brand-reference — but no rule for assigning a file to one. D-40 settles it:
 *
 *   1. An explicit `assetKind` in the rights sidecar is AUTHORITATIVE.
 *      Inference never overrides a human statement.
 *   2. Otherwise, classify by extension.
 *   3. A raster splits `logo` vs `image` on a REAL alpha channel — an
 *      alpha-capable pixel format AND at least one non-opaque pixel.
 *   4. Anything unmatched fails the whole atomic ingest, naming its relative
 *      path.
 *
 * Rule 3 is imperfect on purpose and it is worth being honest about how: a logo
 * saved without transparency reads as an `image`, and a photograph saved with
 * an alpha channel reads as a `logo`. That is exactly why rule 1 exists as the
 * escape hatch, and why a low-confidence split emits a warning naming the file
 * rather than proceeding silently.
 */

export type AssetKind = 'video' | 'audio' | 'image' | 'logo' | 'subtitle' | 'brand_reference';

const VIDEO = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);
const AUDIO = new Set(['.m4a', '.wav', '.mp3', '.aac', '.flac', '.ogg']);
const SUBTITLE = new Set(['.srt', '.vtt', '.ass', '.ssa']);
const BRAND_REFERENCE = new Set(['.md', '.pdf', '.docx', '.txt', '.rtf']);
const RASTER = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.tif']);

/** Pixel formats that can carry transparency. */
const ALPHA_PIXEL_FORMATS = /(^|[^a-z])(rgba|bgra|argb|abgr|ya|yuva|pal8)/i;

export interface ClassificationInput {
  relativePath: string;
  absolutePath: string;
  /** From the rights sidecar, when the human declared one. */
  declaredKind?: AssetKind | undefined;
  /** ffprobe's `pix_fmt` for a raster asset; undefined when not probed. */
  pixelFormat?: string | undefined;
  /** Whether any pixel is non-opaque. Undefined when the check was not run. */
  hasNonOpaquePixel?: boolean | undefined;
}

export interface Classification {
  kind: AssetKind;
  /** `declared` wins outright; `extension` and `alpha` are inferences. */
  basis: 'declared' | 'extension' | 'alpha';
  warnings: string[];
}

export class UnsupportedAssetError extends Error {
  readonly relativePath: string;
  readonly extension: string;

  constructor(relativePath: string, extension: string) {
    super(
      `Cannot classify ${JSON.stringify(relativePath)} (extension ${extension || '(none)'}) into any of the six ` +
        `REQ-001 asset classes: video, audio, image, logo, subtitle, brand_reference. ` +
        `Declare \`assetKind\` in its rights sidecar to override, or remove it from the ingest directory.`,
    );
    this.name = 'UnsupportedAssetError';
    this.relativePath = relativePath;
    this.extension = extension;
  }
}

export const SUPPORTED_EXTENSIONS: readonly string[] = [
  ...VIDEO,
  ...AUDIO,
  ...SUBTITLE,
  ...BRAND_REFERENCE,
  ...RASTER,
].sort();

export function classifyAsset(input: ClassificationInput): Classification {
  const warnings: string[] = [];

  // (1) An explicit declaration is authoritative — including for an extension
  // this code would otherwise reject, which is what makes the escape hatch real.
  if (input.declaredKind) {
    return { kind: input.declaredKind, basis: 'declared', warnings };
  }

  const ext = extname(input.relativePath).toLowerCase();

  if (VIDEO.has(ext)) return { kind: 'video', basis: 'extension', warnings };
  if (AUDIO.has(ext)) return { kind: 'audio', basis: 'extension', warnings };
  if (SUBTITLE.has(ext)) return { kind: 'subtitle', basis: 'extension', warnings };
  if (BRAND_REFERENCE.has(ext)) return { kind: 'brand_reference', basis: 'extension', warnings };

  if (RASTER.has(ext)) {
    // (3) Alpha decides logo vs image.
    if (input.pixelFormat === undefined) {
      warnings.push(
        `${input.relativePath}: classified as \`image\` because its pixel format could not be probed, ` +
          `so the logo/image alpha test (D-40) could not run. Declare \`assetKind\` in its sidecar if this is a logo.`,
      );
      return { kind: 'image', basis: 'extension', warnings };
    }

    const alphaCapable = ALPHA_PIXEL_FORMATS.test(input.pixelFormat);
    if (!alphaCapable) {
      return { kind: 'image', basis: 'alpha', warnings };
    }

    if (input.hasNonOpaquePixel === true) {
      return { kind: 'logo', basis: 'alpha', warnings };
    }

    // Alpha-capable but fully opaque: an exported PNG that never used its alpha
    // channel. Calling that a logo on the strength of the format alone would
    // misclassify most PNG screenshots.
    warnings.push(
      `${input.relativePath}: pixel format ${input.pixelFormat} can carry alpha but every pixel is opaque, ` +
        `so it is classified as \`image\` rather than \`logo\` (D-40). Declare \`assetKind: logo\` in its sidecar to override.`,
    );
    return { kind: 'image', basis: 'alpha', warnings };
  }

  throw new UnsupportedAssetError(input.relativePath, ext);
}

/**
 * Does this asset kind carry a time dimension worth probing and proxying?
 *
 * Images are probed (ffprobe reads a still as a one-frame video stream) but not
 * proxied — there is no playback to make cheaper.
 */
export function isMediaKind(kind: AssetKind): boolean {
  return kind === 'video' || kind === 'audio' || kind === 'image' || kind === 'logo';
}

/**
 * Only video gets a proxy (decisions.md D-42).
 *
 * D-25's recipe — "720p-fit H.264 CRF 23 + AAC 128k, constant frame rate" — is
 * a VIDEO recipe; it has no meaning for an asset with no video stream. And the
 * purpose a proxy serves does not apply either: proxies exist so draft renders
 * and scrubbing are cheap, and an audio file is already cheap to decode and
 * seek. Transcoding it would spend time and quality to produce something no
 * faster than the original.
 */
export function needsProxy(kind: AssetKind): boolean {
  return kind === 'video';
}

/**
 * Cheap sanity read for text-shaped assets.
 *
 * A `.srt` that is actually binary, or a subtitle file that contains no cue
 * arrow at all, is a mis-supplied asset — better to say so at ingest than to
 * discover it when the caption pipeline produces nothing in Phase 4.
 */
export function inspectTextAsset(absolutePath: string, kind: AssetKind): string[] {
  const warnings: string[] = [];
  let text: string;
  try {
    text = readFileSync(absolutePath, 'utf8');
  } catch {
    warnings.push(`Could not read as UTF-8 text.`);
    return warnings;
  }
  if (text.includes("\u0000")) {
    warnings.push(`Contains NUL bytes — this does not look like the text asset its extension claims.`);
  }
  if (kind === 'subtitle' && !text.includes('-->')) {
    warnings.push(`No cue timing arrow ("-->") found — this subtitle file may be empty or malformed.`);
  }
  return warnings;
}
