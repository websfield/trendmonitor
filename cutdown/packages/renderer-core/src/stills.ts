import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';

import { assertSafeInputPath, inputArgs, runFfmpeg, type RunOptions } from './ffmpeg.js';

/**
 * Still-frame extraction for a delivered package (REQ-088: cover image and
 * first-frame preview; REQ-055: a validated first frame).
 *
 * Lives in `renderer-core` for one reason — it spawns FFmpeg, and tech-spec §11
 * makes this package the only place that may. A `package` skill that shelled out
 * to ffmpeg itself would break the grep-provable invariant Phase 4 established
 * ("no module other than ffmpeg.ts spawns ffmpeg or ffprobe") and it would break
 * it in the module least likely to be re-read.
 *
 * ## Deterministic on purpose
 *
 * PNG at the exact requested instant, `-frames:v 1`, no scaling, no dithering,
 * metadata stripped. The output of packaging the same render twice must be
 * byte-identical for the same reason the render itself must be (tech-spec §12
 * tier 1): a cover image that changed between two packagings of one master would
 * make the delivered bundle's own content hashes unstable, and the exit criteria
 * are computed over those hashes.
 */

/** Written atomically, like every other artefact (tech-spec §6.2). */
export interface StillFrame {
  readonly path: string;
  readonly byteSize: number;
}

/**
 * Extract one frame as a PNG.
 *
 * `atMs` is a position in the OUTPUT timeline. `-ss` before `-i` seeks by
 * keyframe and is fast but imprecise; placed AFTER the input it decodes to the
 * exact frame. Precision wins here: a cover frame that is "about right" is a
 * cover frame nobody chose, and REQ-055 is specifically about a deliberate one.
 */
export async function extractStillFrame(
  sourcePath: string,
  atMs: number,
  outputPath: string,
  options: RunOptions = {},
): Promise<StillFrame> {
  if (!Number.isInteger(atMs) || atMs < 0) {
    throw new Error(`A still-frame position must be a non-negative integer number of milliseconds; received ${String(atMs)}.`);
  }
  assertSafeInputPath(sourcePath);
  await mkdir(dirname(outputPath), { recursive: true });

  // Temp name keeps its extension: FFmpeg infers the muxer from the output
  // filename, and Phase 4's smoke render found that `x.png.partial` makes it
  // fail with "Unable to find a suitable output format". Same trap, same fix.
  const suffix = extname(outputPath) || '.png';
  const temp = join(dirname(outputPath), `.still.${String(process.pid)}.partial${suffix}`);

  try {
    await runFfmpeg(
      [
        '-nostdin',
        '-hide_banner',
        '-y',
        ...inputArgs(sourcePath),
        // After -i: exact-frame seek by decoding, not a keyframe approximation.
        '-ss',
        (atMs / 1000).toFixed(6),
        '-frames:v',
        '1',
        '-map_metadata',
        '-1',
        '-fflags',
        '+bitexact',
        '-f',
        'image2',
        temp,
      ],
      options,
    );
    const info = await stat(temp);
    if (info.size === 0) {
      throw new Error(`FFmpeg produced an empty still frame for ${sourcePath} at ${String(atMs)}ms.`);
    }
    await rename(temp, outputPath);
    return { path: outputPath, byteSize: info.size };
  } catch (error) {
    // A partial still must not be left where a caller would trust it. The unlink
    // is best-effort: failing to clean up must not mask the real error.
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}
