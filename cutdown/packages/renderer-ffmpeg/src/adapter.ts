import { createHash } from 'node:crypto';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { ulid } from 'ulid';
import { ArtefactPathError, RENDER_SCHEMA_VERSION, checkSourceRange, resolveArtefactPath } from '@cutdown/contracts';
import type { PlatformEdlV1, RenderV2 } from '@cutdown/contracts/generated';
import {
  EXIT_INPUT_VALIDATION,
  EXIT_RUNTIME,
  FfmpegError,
  assertLibass,
  determinismArgs,
  ffmpegVersion,
  inputArgs,
  runFfmpeg,
  runFfprobe,
  RENDERER_VERSION,
  type ExecuteOptions,
  type PlanContext,
  type PlannedFile,
  type Render,
  type RenderCommand,
  type RenderManifest,
  type RenderPlan,
  type RendererAdapter,
} from '@cutdown/renderer-core';
import {
  buildCaptionPlan,
  renderAss,
  renderSrt,
  renderVtt,
  type CaptionLayoutRules,
  type CaptionPlan,
  type CaptionStyle,
  type MomentCaptionMarks,
} from './captions.js';
import { buildFilterGraph, type ClipFade, type GraphInput, type VideoTreatment } from './filtergraph.js';
import { measureLoudness } from './loudness.js';
import { durationToFrames, msToSecondsString, secondsStringMinusMs, ticksToSecondsString, type PlannedClip, type Timebase } from './timeline.js';

/**
 * `renderer-ffmpeg` — the Phase 0 RendererAdapter (decisions.md D-16).
 *
 * The division of labour, restated because it is the whole design:
 * **`plan()` decides, `execute()` does.** Every refusal — an out-of-bounds
 * source range, an unrenderable aspect treatment, a caption that cannot survive
 * ASS, a tier/approval mismatch — happens in `plan()`, which spawns nothing and
 * writes nothing. By the time `execute()` runs there is no decision left to make,
 * only I/O to perform and faults to report.
 */

export interface RendererOptions {
  /**
   * Absolute directory libass searches for fonts — `data/fonts/ttf`, which holds
   * font FILES only. libass loads every entry in this directory and logs an
   * error for anything it cannot parse as a font, so the registry JSON and the
   * licence text deliberately live one level up.
   */
  readonly fontsDir: string;
  /** libass family name for the caption style. */
  readonly captionFontFamily: string;
  /** Absolute path to the font file `drawtext` renders the draft badge with. */
  readonly badgeFontFile: string;
  readonly captionStyle?: Partial<CaptionStyle>;
  readonly captionRules?: CaptionLayoutRules;
  readonly marksByMomentId?: ReadonlyMap<string, MomentCaptionMarks>;
}

const DEFAULT_CAPTION_RULES: CaptionLayoutRules = { maxCharsPerLine: 42, maxLines: 2 };

const inputError = (code: string, message: string, details?: Record<string, unknown>): FfmpegError =>
  new FfmpegError(
    details === undefined
      ? { code, message, exitCode: EXIT_INPUT_VALIDATION }
      : { code, message, exitCode: EXIT_INPUT_VALIDATION, details },
  );

const runtimeError = (code: string, message: string, details?: Record<string, unknown>): FfmpegError =>
  new FfmpegError(
    details === undefined
      ? { code, message, exitCode: EXIT_RUNTIME }
      : { code, message, exitCode: EXIT_RUNTIME, details },
  );

/**
 * Default caption geometry, scaled so a 720 draft and a 1080 final read alike.
 *
 * Both margins are set from the TikTok 9:16 overlay fixture rather than picked
 * for looks, and each of the three numbers below is one the QA safe-zone check
 * caught being wrong on the first run:
 *
 *   - **Horizontal margin from WIDTH, not height.** Deriving a horizontal margin
 *     from the canvas height happens to be nearly right at 9:16 and is silently
 *     wrong at every other aspect ratio.
 *   - **0.18 of width.** TikTok's action rail occupies the right 18% of the
 *     frame, and an ASS bottom-CENTRE alignment means the usable width is
 *     symmetric about the middle — so the rail's intrusion has to be mirrored on
 *     the left, even though nothing obstructs there.
 *   - **0.24 of height.** The handle, post caption and tab bar start at 0.78 of
 *     the height. The previous 0.14 put every caption underneath them.
 */
function defaultCaptionStyle(
  canvasWidth: number,
  canvasHeight: number,
  fontFamily: string,
  overrides: Partial<CaptionStyle> | undefined,
): CaptionStyle {
  const base: CaptionStyle = {
    fontFamily,
    fontSizePx: Math.round(canvasHeight * 0.038),
    primaryColourHex: '#FFFFFF',
    outlineColourHex: '#000000',
    outlinePx: Math.max(2, Math.round(canvasHeight * 0.0025)),
    marginVerticalPx: Math.round(canvasHeight * 0.24),
    marginHorizontalPx: Math.round(canvasWidth * 0.18),
  };
  return { ...base, ...overrides };
}

/** Average glyph advance as a fraction of the em, for Inter at caption sizes. */
export const AVERAGE_ADVANCE_EM = 0.52;

/**
 * How many characters actually fit on one line, and why it is not simply the
 * ruleset's number.
 *
 * tech-spec §12.1 ships `caption <= 2 lines x 42 chars` as a **readability**
 * default — how much text a viewer can absorb — and it says nothing about
 * whether that text physically fits. On a 720-wide 9:16 canvas with a 3.8%-height
 * font and the safe-area margins above, 42 characters is roughly 1045 px of
 * glyphs inside 460 px of usable width: not tight, impossible.
 *
 * So the wrap width is the SMALLER of the two constraints. The ruleset stays
 * authoritative as a ceiling — lowering 42 lowers this too — while the geometry
 * supplies the bound the ruleset cannot know. Wrapping at 42 regardless would
 * produce captions that overflow the safe zone on every render, and a warning
 * that fires every time is one people learn to skip.
 */
export function fittedCharsPerLine(style: CaptionStyle, canvasWidth: number, ruleCap: number): number {
  const usableWidth = canvasWidth - 2 * style.marginHorizontalPx;
  const fitted = Math.floor(usableWidth / (style.fontSizePx * AVERAGE_ADVANCE_EM));
  return Math.max(1, Math.min(ruleCap, fitted));
}

const sha256File = async (path: string): Promise<string> =>
  await new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => {
        resolve(hash.digest('hex'));
      });
  });

/** Job-relative, POSIX-separated — an artefact path must not encode the host OS. */
const jobRelative = (jobDir: string, absolute: string): string =>
  relative(jobDir, absolute).split(sep).join('/');

export interface FfmpegPlanExtras {
  readonly clips: readonly PlannedClip[];
  readonly captionPlan: CaptionPlan;
}

/** `plan()` output plus the renderer-private detail QA and the skill both need. */
export interface FfmpegRenderPlan extends RenderPlan {
  readonly extras: FfmpegPlanExtras;
}

export class FfmpegRendererAdapter implements RendererAdapter {
  readonly name = 'renderer-ffmpeg';
  readonly rendererVersion = RENDERER_VERSION;

  constructor(private readonly options: RendererOptions) {}

  async plan(manifest: RenderManifest, context: PlanContext): Promise<FfmpegRenderPlan> {
    // libass is asserted at ingest (developer-guide §1), and again here: a job
    // can be indexed on one machine and rendered on another, and discovering at
    // encode time that captions are impossible wastes the whole editorial spend.
    await assertLibass();

    const edl = context.edl as PlatformEdlV1.PlatformEDL;
    if (edl.edlId !== manifest.edlId) {
      throw inputError(
        'EDL_MANIFEST_MISMATCH',
        `The manifest renders EDL ${manifest.edlId} but was given EDL ${edl.edlId}.`,
        { manifestEdlId: manifest.edlId, providedEdlId: edl.edlId },
      );
    }

    const orderedClips = [...edl.clips].sort((a, b) => a.order - b.order);
    const frameRate: Timebase = manifest.output.frameRate;
    const treatment: VideoTreatment = {
      mode: edl.aspectTreatment.mode,
      ...(edl.aspectTreatment.mode === 'branded_background' ? { backgroundColourHex: '#000000' } : {}),
    };

    const planned: PlannedClip[] = [];
    let cursorFrame = 0;
    for (const clip of orderedClips) {
      const mediaPath = context.mediaByAssetId.get(clip.assetId);
      if (mediaPath === undefined) {
        throw inputError(
          'MEDIA_NOT_RESOLVED',
          `Clip ${clip.clipId} references asset ${clip.assetId}, for which no ${manifest.media.source} media path was supplied.`,
          { clipId: clip.clipId, assetId: clip.assetId, tier: manifest.tier },
        );
      }
      const duration = context.durationByAssetId.get(clip.assetId);

      // The SINGLE bounds validator (`range-check.ts`), reused exactly as
      // `index` and `validate` use it. This is the render-preflight caller the
      // module's own header names, and it is the last gate before an out-of-
      // bounds range could reach a *final* render — the artefact the "zero
      // invalid source ranges" exit criterion is measured on.
      const check = checkSourceRange(clip.sourceRange, {
        assetId: clip.assetId,
        duration: duration ?? null,
      });
      if (!check.ok) {
        throw inputError(
          'SOURCE_RANGE_INVALID',
          `Clip ${clip.clipId} has an invalid source range and is NEVER clamped (D-35 non-waivable): ` +
            check.violations.map((v) => `${v.code}: ${v.message}`).join('; '),
          { clipId: clip.clipId, violations: check.violations },
        );
      }

      const frames = durationToFrames(
        clip.sourceRange.startTicks,
        clip.sourceRange.endTicks,
        clip.sourceRange.timebase,
        frameRate,
      );
      planned.push({
        clipId: clip.clipId,
        assetId: clip.assetId,
        order: clip.order,
        mediaPath,
        sourceStartTicks: clip.sourceRange.startTicks,
        sourceEndTicks: clip.sourceRange.endTicks,
        sourceTimebase: clip.sourceRange.timebase,
        sourceStartSeconds: ticksToSecondsString(clip.sourceRange.startTicks, clip.sourceRange.timebase),
        sourceEndSeconds: ticksToSecondsString(clip.sourceRange.endTicks, clip.sourceRange.timebase),
        outputStartFrame: cursorFrame,
        outputEndFrame: cursorFrame + frames,
      });
      cursorFrame += frames;
    }

    const style = defaultCaptionStyle(
      manifest.output.width,
      manifest.output.height,
      this.options.captionFontFamily,
      this.options.captionStyle,
    );
    const configuredRules = this.options.captionRules ?? DEFAULT_CAPTION_RULES;
    const rules: CaptionLayoutRules = {
      maxLines: configuredRules.maxLines,
      maxCharsPerLine: fittedCharsPerLine(style, manifest.output.width, configuredRules.maxCharsPerLine),
    };
    const captionPlan = buildCaptionPlan({
      clips: planned,
      edlClips: orderedClips,
      frameRate,
      canvas: { width: manifest.output.width, height: manifest.output.height },
      style,
      rules,
      ...(this.options.marksByMomentId === undefined ? {} : { marksByMomentId: this.options.marksByMomentId }),
    });

    // Contained through the shared guard rather than a bare `join`. These three are
    // WRITE targets and the ASS file is then handed to FFmpeg as a subtitles filter
    // input, so a traversing value in a stored manifest wrote caption files outside
    // the job and burned them into a master. The guard lives in `@cutdown/contracts`
    // precisely so this package can reach it — it does not depend on skill-runtime,
    // which is why these six sites were missed by three rounds of review.
    // Wrapped, because this package has no `skill-runtime` to map the error for it:
    // a raw `ArtefactPathError` reaching `runSkillMain` fails `instanceof SkillError`
    // and is reported as `UNEXPECTED_ERROR` exit 3, where the identical guard inside
    // the render skill yields `UNSAFE_ARTEFACT_PATH` exit 2 — the caller-error
    // semantics tech-spec §6.2 requires, and which `render.test.ts` asserts.
    const containedCaptionPath = (value: string, what: string): string => {
      try {
        return resolveArtefactPath(context.jobDir, value, what);
      } catch (error) {
        // `inputError`, so the exit code is the INPUT-validation one: a traversing
        // path in a stored manifest is a bad input, not a runtime failure.
        if (error instanceof ArtefactPathError) throw inputError(error.code, error.message);
        throw error;
      }
    };
    const assPath = containedCaptionPath(manifest.captions.assPath, "The manifest's ASS caption path");
    const srtPath = containedCaptionPath(manifest.captions.srtPath, "The manifest's SRT caption path");
    const vttPath = containedCaptionPath(manifest.captions.vttPath, "The manifest's WebVTT caption path");
    const renderDir = dirname(assPath);
    const outputPath = join(renderDir, 'output.mp4');

    const files: PlannedFile[] = [
      { path: assPath, contents: renderAss(captionPlan), purpose: 'burn-in captions (ASS)' },
      { path: srtPath, contents: renderSrt(captionPlan), purpose: 'caption sidecar (SRT)' },
      { path: vttPath, contents: renderVtt(captionPlan), purpose: 'caption sidecar (WebVTT)' },
    ];

    const withAudio = manifest.audioMix.hasAudio;
    const graphInputs: GraphInput[] = planned.map((clip, i) => {
      const durationSeconds = exactDuration(clip);
      // `planned` is built by iterating `orderedClips`, so index i pairs the
      // PlannedClip with the EDL clip that produced it — the same pairing the
      // caption planner relies on.
      const transition = orderedClips[i]?.transition ?? null;
      let fade: ClipFade | undefined;
      if (transition !== null && transition !== undefined) {
        const fadeInMs = transition.fadeInMs ?? null;
        const fadeOutMs = transition.fadeOutMs ?? null;
        if ((fadeInMs ?? 0) + (fadeOutMs ?? 0) > 0) {
          // Duration-preserving means the fades live INSIDE the clip; a pair
          // that does not fit is refused, never layered over itself (D-52).
          const durationMatch = /^([0-9]+)\.([0-9]{9})$/.exec(durationSeconds);
          if (durationMatch === null) {
            throw inputError('FADE_DURATION_UNPARSEABLE', `Clip ${clip.clipId} has a malformed duration string "${durationSeconds}".`);
          }
          const durationNanos =
            BigInt(durationMatch[1] as string) * 1_000_000_000n + BigInt(durationMatch[2] as string);
          const fadeNanos = BigInt((fadeInMs ?? 0) + (fadeOutMs ?? 0)) * 1_000_000n;
          if (fadeNanos > durationNanos) {
            throw inputError(
              'FADE_LONGER_THAN_CLIP',
              `Clip ${clip.clipId} is ${durationSeconds}s but its transition asks for ` +
                `${String(fadeInMs ?? 0)}ms in + ${String(fadeOutMs ?? 0)}ms out; the fades must fit inside the clip.`,
              { clipId: clip.clipId, fadeInMs, fadeOutMs, durationSeconds },
            );
          }
          fade = {
            inSeconds: fadeInMs === null ? null : msToSecondsString(fadeInMs),
            outStartSeconds: fadeOutMs === null ? null : secondsStringMinusMs(durationSeconds, fadeOutMs),
            outSeconds: fadeOutMs === null ? null : msToSecondsString(fadeOutMs),
          };
        }
      }
      return { clip, treatment, durationSeconds, ...(fade === undefined ? {} : { fade }) };
    });

    const graph = buildFilterGraph({
      canvas: { width: manifest.output.width, height: manifest.output.height, frameRate },
      inputs: graphInputs,
      withAudio,
      burnIn: { assPath, fontsDir: this.options.fontsDir },
      badge:
        manifest.tier === 'draft'
          ? {
              text: draftBadgeText(manifest),
              fontFile: this.options.badgeFontFile,
              fontSizePx: Math.round(manifest.output.height * 0.028),
            }
          : null,
      loudness: manifest.audioMix.normalize
        ? {
            targetLufs: manifest.audioMix.targetLoudnessLufs,
            maxTruePeakDbtp: manifest.audioMix.maxTruePeakDbtp,
          }
        : null,
    });

    const encodeArgv = this.buildEncodeArgv(manifest, planned, graph, withAudio, outputPath);
    const commands: RenderCommand[] = [
      { purpose: 'encode', binary: 'ffmpeg', argv: encodeArgv },
    ];

    return {
      manifest,
      rendererName: this.name,
      renderDir,
      outputPath,
      files,
      commands,
      planHash: planHashOf(manifest, planned, files),
      extras: { clips: planned, captionPlan },
    };
  }

  private buildEncodeArgv(
    manifest: RenderManifest,
    clips: readonly PlannedClip[],
    graph: { filterComplex: string; videoLabel: string; audioLabel: string | null },
    withAudio: boolean,
    outputPath: string,
  ): readonly string[] {
    const argv: string[] = ['-nostdin', '-hide_banner', '-y'];

    for (const clip of clips) {
      // Input-level `-ss`/`-t` rather than a filtergraph `trim`. FFmpeg seeks to
      // the keyframe before the target and DECODES-AND-DISCARDS up to it when
      // transcoding, so the cut is frame accurate, and it avoids decoding the
      // whole source once per clip — which a filtergraph trim would do, and
      // which is unaffordable on real footage.
      //
      // `-ss` and `-t` must precede this input's `-i`, and `assertSafeArgv`
      // requires `-protocol_whitelist` in the two slots immediately before it,
      // so the ordering here is load-bearing, not stylistic.
      argv.push('-ss', clip.sourceStartSeconds, '-t', exactDuration(clip), ...inputArgs(clip.mediaPath));
    }

    argv.push('-filter_complex', graph.filterComplex, '-map', graph.videoLabel);
    if (withAudio && graph.audioLabel !== null) argv.push('-map', graph.audioLabel);

    argv.push(
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      String(manifest.encoderSettings.crf),
      '-pix_fmt',
      manifest.encoderSettings.pixelFormat,
      '-r',
      `${String(manifest.output.frameRate.den)}/${String(manifest.output.frameRate.num)}`,
      '-fps_mode',
      'cfr',
    );

    if (withAudio) {
      argv.push('-c:a', 'aac', '-b:a', `${String(manifest.encoderSettings.audioBitrateKbps)}k`, '-ar', '48000', '-ac', '2');
    } else {
      argv.push('-an');
    }

    argv.push(
      ...determinismArgs(manifest.encoderSettings.threads),
      '-movflags',
      '+faststart',
      // The container is named EXPLICITLY rather than inferred from the output
      // filename. FFmpeg's muxer selection is extension-driven, so `execute()`'s
      // temp-file rename would otherwise change the format: `output.mp4.partial`
      // has no recognised extension and FFmpeg refuses with "Unable to choose an
      // output format" (observed on 8.0.1). Pinning `-f` makes the encode
      // independent of what the file is called at any moment.
      '-f',
      manifest.output.container,
      outputPath,
    );
    return argv;
  }

  async execute(plan: RenderPlan, options: ExecuteOptions): Promise<Render> {
    const manifest = plan.manifest;
    await mkdir(plan.renderDir, { recursive: true });

    for (const file of plan.files) {
      await writeFile(file.path, file.contents, 'utf8');
    }

    // Encode to a temp name and rename into place. A killed render then leaves a
    // removable partial rather than a truncated file at the artefact path —
    // "presence is trusted only with a run-log entry" is the rule, and a
    // half-written output that LOOKS complete is what defeats it.
    // `.partial.mp4`, not `.mp4.partial`: the extension still has to name the
    // container for every tool that reads it, and a temp file FFmpeg cannot
    // classify is one an operator inspecting a failed render cannot play either.
    const temporaryPath = plan.outputPath.replace(/\.([^.]+)$/, '.partial.$1');
    const encodeCommand = plan.commands.find((c) => c.purpose === 'encode');
    if (encodeCommand === undefined) {
      throw runtimeError('NO_ENCODE_COMMAND', 'The render plan carries no encode command.');
    }
    const argv = encodeCommand.argv.map((arg) => (arg === plan.outputPath ? temporaryPath : arg));

    try {
      const runOptions = options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };
      await runFfmpeg(argv, runOptions);
      await rename(temporaryPath, plan.outputPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }

    const measured = await probeOutput(plan.outputPath);
    const loudness = manifest.audioMix.hasAudio
      ? await measureLoudness(plan.outputPath)
      : ({
          kind: 'unavailable',
          reason: 'The EDL sources carry no audio stream, so the render has no audio track to measure.',
        } satisfies RenderV2.LoudnessUnavailable);

    return {
      renderId: ulid(),
      envelope: {
        // The shared constant, never a literal: this adapter is the sole producer
        // of render records, it cannot import `skill-runtime`, and D-52's lesson is
        // that a bump which relies on producers remembering misses one. The drift
        // test in `contracts/tests/versions.test.ts` pins the constant to the
        // current render schema file.
        schemaVersion: RENDER_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        createdBy: { kind: 'skill', skill: 'render', skillVersion: this.rendererVersion },
      },
      jobId: manifest.jobId,
      edlId: manifest.edlId,
      renderManifestId: manifest.renderManifestId,
      tier: manifest.tier,
      // Never `editorially_approved` from here — see manifest.ts. A renderer that
      // could approve its own output would make the release state meaningless.
      releaseState: 'draft',
      outputPath: jobRelative(options.jobDir, plan.outputPath),
      contentHash: { algorithm: 'sha256', value: await sha256File(plan.outputPath) },
      duration: measured.duration,
      dimensions: { width: measured.width, height: measured.height },
      loudness,
      captions: {
        assPath: manifest.captions.assPath,
        srtPath: manifest.captions.srtPath,
        vttPath: manifest.captions.vttPath,
        cueCount: (plan as FfmpegRenderPlan).extras?.captionPlan.cues.length ?? 0,
      },
      renderer: {
        name: 'renderer-ffmpeg',
        rendererVersion: this.rendererVersion,
        ffmpegVersion: await ffmpegVersion(),
      },
      determinismTier: 1,
      visibleVersionIdentifier: manifest.tier === 'draft' ? draftBadgeText(manifest) : null,
    };
  }
}

/** D-34's visible identifier: short enough to read, unique enough to trace. */
export function draftBadgeText(manifest: RenderManifest): string {
  return `DRAFT ${manifest.renderManifestId.slice(0, 8)}`;
}

function exactDuration(clip: PlannedClip): string {
  const ticks = clip.sourceEndTicks - clip.sourceStartTicks;
  return ticksToSecondsString(ticks, clip.sourceTimebase);
}

/**
 * A path-independent identity for the plan.
 *
 * Absolute paths are deliberately excluded: two machines rendering the same job
 * from different directories are executing the same plan, and a hash that said
 * otherwise would be useless for the one comparison it exists to serve.
 */
function planHashOf(
  manifest: RenderManifest,
  clips: readonly PlannedClip[],
  files: readonly PlannedFile[],
): { algorithm: 'sha256'; value: string } {
  const payload = JSON.stringify({
    editorialPlanHash: manifest.editorialPlanHash.value,
    tier: manifest.tier,
    media: manifest.media,
    output: manifest.output,
    encoderSettings: manifest.encoderSettings,
    audioMix: manifest.audioMix,
    fonts: manifest.fonts,
    clips: clips.map((c) => ({
      clipId: c.clipId,
      assetId: c.assetId,
      order: c.order,
      sourceStartTicks: c.sourceStartTicks,
      sourceEndTicks: c.sourceEndTicks,
      sourceTimebase: c.sourceTimebase,
      outputStartFrame: c.outputStartFrame,
      outputEndFrame: c.outputEndFrame,
    })),
    files: files.map((f) => ({ purpose: f.purpose, contents: f.contents })),
  });
  return { algorithm: 'sha256', value: createHash('sha256').update(payload, 'utf8').digest('hex') };
}

interface ProbedOutput {
  readonly width: number;
  readonly height: number;
  readonly duration: { ticks: number; timebase: Timebase };
}

/**
 * Read the produced file's real geometry and duration.
 *
 * Read back rather than carried forward from the plan: the plan says what was
 * asked for, and the whole point of a QA gate is that those two can differ.
 */
async function probeOutput(path: string): Promise<ProbedOutput> {
  const fileStat = await stat(path);
  if (fileStat.size === 0) {
    throw runtimeError('EMPTY_RENDER_OUTPUT', `ffmpeg exited 0 but produced a zero-byte file at ${path}.`);
  }
  const { stdout } = await runFfprobe([
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,duration_ts,time_base',
    '-of',
    'json',
    ...inputArgs(path),
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: { width?: number; height?: number; duration_ts?: number; time_base?: string }[];
  };
  const stream = parsed.streams?.[0];
  if (stream?.width === undefined || stream.height === undefined) {
    throw runtimeError('RENDER_OUTPUT_UNREADABLE', `ffprobe could not read a video stream from ${path}.`);
  }
  const timeBase = /^(\d+)\/(\d+)$/.exec(stream.time_base ?? '');
  const timebase: Timebase =
    timeBase === null
      ? { num: 1, den: 15360 }
      : { num: Number(timeBase[1]), den: Number(timeBase[2]) };
  return {
    width: stream.width,
    height: stream.height,
    duration: { ticks: stream.duration_ts ?? 0, timebase },
  };
}
