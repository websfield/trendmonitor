import { stat } from 'node:fs/promises';
import { inputArgs, probeCorruption, runFfmpeg, runFfprobe, type RunOptions } from '@cutdown/renderer-core';
import type { LoudnessMeasurement, QaRuleset, RenderMeasurements, TimeRun } from './model.js';

/**
 * FFmpeg-driven measurement of a produced render.
 *
 * Makes no judgements — every function here returns numbers, and `checks.ts`
 * decides what they mean. A measurement that cannot be taken returns `null`
 * rather than a plausible default, because the ledger downstream distinguishes
 * "measured and fine" from "never measured", and a default would erase that
 * distinction at the only point where it is still visible.
 *
 * Every FFmpeg invocation goes through `renderer-core`'s sanctioned entrypoint
 * (tech-spec §11). This module spawns nothing itself.
 */

const secondsToMs = (seconds: number): number => Math.round(seconds * 1000);

/** `black_start:1.5 black_end:2.3 black_duration:0.8` */
export function parseBlackRuns(stderr: string): TimeRun[] {
  const runs: TimeRun[] = [];
  const pattern = /black_start:(\d+(?:\.\d+)?)\s+black_end:(\d+(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stderr)) !== null) {
    runs.push({ startMs: secondsToMs(Number(match[1])), endMs: secondsToMs(Number(match[2])) });
  }
  return runs;
}

/**
 * `lavfi.freezedetect.freeze_start: 1.2` … `freeze_end: 3.4`
 *
 * Starts and ends are emitted as separate log lines and are paired here in
 * order. A trailing `freeze_start` with no `freeze_end` means the freeze ran to
 * the end of the file — that is a real freeze, and dropping it because its
 * closing line never arrived would hide the worst case.
 */
export function parseFreezeRuns(stderr: string, durationMs: number | null): TimeRun[] {
  const events: { kind: 'start' | 'end'; ms: number }[] = [];
  const pattern = /freeze_(start|end):\s*(\d+(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stderr)) !== null) {
    events.push({ kind: match[1] === 'start' ? 'start' : 'end', ms: secondsToMs(Number(match[2])) });
  }
  const runs: TimeRun[] = [];
  let openStart: number | null = null;
  for (const event of events) {
    if (event.kind === 'start') {
      openStart = event.ms;
    } else if (openStart !== null) {
      runs.push({ startMs: openStart, endMs: event.ms });
      openStart = null;
    }
  }
  if (openStart !== null && durationMs !== null) {
    runs.push({ startMs: openStart, endMs: durationMs });
  }
  return runs;
}

/** `silence_start: 1.5` … `silence_end: 3.0 | silence_duration: 1.5` */
export function parseSilenceRuns(stderr: string, durationMs: number | null): TimeRun[] {
  const events: { kind: 'start' | 'end'; ms: number }[] = [];
  const pattern = /silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stderr)) !== null) {
    events.push({ kind: match[1] === 'start' ? 'start' : 'end', ms: secondsToMs(Math.max(0, Number(match[2]))) });
  }
  const runs: TimeRun[] = [];
  let openStart: number | null = null;
  for (const event of events) {
    if (event.kind === 'start') {
      openStart = event.ms;
    } else if (openStart !== null) {
      runs.push({ startMs: openStart, endMs: event.ms });
      openStart = null;
    }
  }
  if (openStart !== null && durationMs !== null) {
    runs.push({ startMs: openStart, endMs: durationMs });
  }
  return runs;
}

/** astats overall `Peak level dB: -2.9`. `-inf` on a silent track. */
export function parsePeakDbfs(stderr: string): number | null {
  const matches = [...stderr.matchAll(/Peak level dB:\s*(-?\d+(?:\.\d+)?|-inf)/g)];
  const values = matches
    .map((m) => (m[1] === '-inf' ? Number.NEGATIVE_INFINITY : Number(m[1])))
    .filter((v) => !Number.isNaN(v));
  return values.length === 0 ? null : Math.max(...values);
}

/** cropdetect `crop=720:1280:0:0` — the last report wins (it is cumulative). */
export function parseContentRect(stderr: string): { width: number; height: number } | null {
  const matches = [...stderr.matchAll(/crop=(\d+):(\d+):(-?\d+):(-?\d+)/g)];
  const last = matches[matches.length - 1];
  if (last === undefined) return null;
  return { width: Number(last[1]), height: Number(last[2]) };
}

export interface MeasureInput {
  /** Absolute path to the encoded render. */
  readonly outputPath: string;
  readonly ruleset: QaRuleset;
  readonly hasAudio: boolean;
  /** Taken from the Render record — QA never re-measures what the renderer already measured. */
  readonly loudness: LoudnessMeasurement;
  readonly captionFiles: { readonly ass: string; readonly srt: string; readonly vtt: string };
  readonly runOptions?: RunOptions;
}

const fileIsPresent = async (path: string): Promise<boolean> => {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
};

export async function measureRender(input: MeasureInput): Promise<RenderMeasurements> {
  const runOptions = input.runOptions ?? {};
  const captionFiles = {
    ass: await fileIsPresent(input.captionFiles.ass),
    srt: await fileIsPresent(input.captionFiles.srt),
    vtt: await fileIsPresent(input.captionFiles.vtt),
  };

  let sizeBytes = 0;
  let filePresent = false;
  try {
    const info = await stat(input.outputPath);
    filePresent = info.isFile();
    sizeBytes = info.size;
  } catch {
    filePresent = false;
  }

  // Nothing downstream can be measured from a file that is not there, and the
  // probes would each fail separately with a confusing error. One honest
  // "everything unknown" record is clearer than nine spurious failures.
  if (!filePresent || sizeBytes === 0) {
    return {
      filePresent,
      sizeBytes,
      corruption: 'unknown',
      width: null,
      height: null,
      durationMs: null,
      container: null,
      videoCodec: null,
      audioCodec: null,
      blackRuns: null,
      frozenRuns: null,
      duplicateFrameCount: null,
      frameCount: null,
      silenceRuns: null,
      peakDbfs: null,
      loudness: input.loudness,
      avStartOffsetMs: null,
      contentRect: null,
      captionFiles,
    };
  }

  const probe = await probeStreams(input.outputPath, runOptions);
  // The declared frame count comes from the probe rather than the plan: a
  // decode that yields fewer frames than the container advertises is one of the
  // ways truncation shows up, and comparing against a planned number would
  // instead report a legitimate re-time as corruption.
  const corruptionReport = await probeCorruption(input.outputPath, probe.frameCount, runOptions);

  const detection = await runDetectionPass(input, probe.durationMs);
  const duplicates = await countDuplicateFrames(input.outputPath, runOptions);

  return {
    filePresent: true,
    sizeBytes,
    corruption: corruptionReport.status === 'clean' ? 'clean' : corruptionReport.status === 'corrupt' ? 'corrupt' : 'unknown',
    width: probe.width,
    height: probe.height,
    durationMs: probe.durationMs,
    container: probe.container,
    videoCodec: probe.videoCodec,
    audioCodec: probe.audioCodec,
    blackRuns: detection.blackRuns,
    frozenRuns: detection.frozenRuns,
    duplicateFrameCount: duplicates,
    frameCount: probe.frameCount,
    silenceRuns: detection.silenceRuns,
    peakDbfs: detection.peakDbfs,
    loudness: input.loudness,
    avStartOffsetMs: probe.avStartOffsetMs,
    contentRect: detection.contentRect,
    captionFiles,
  };
}

interface StreamProbe {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  frameCount: number | null;
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  avStartOffsetMs: number | null;
}

async function probeStreams(path: string, runOptions: RunOptions): Promise<StreamProbe> {
  const { stdout } = await runFfprobe(
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,codec_name,width,height,nb_frames,start_time:format=format_name,duration',
      '-of',
      'json',
      ...inputArgs(path),
    ],
    runOptions,
  );
  const parsed = JSON.parse(stdout) as {
    streams?: {
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      nb_frames?: string;
      start_time?: string;
    }[];
    format?: { format_name?: string; duration?: string };
  };
  const video = parsed.streams?.find((s) => s.codec_type === 'video');
  const audio = parsed.streams?.find((s) => s.codec_type === 'audio');
  const duration = Number(parsed.format?.duration);
  const videoStart = Number(video?.start_time);
  const audioStart = Number(audio?.start_time);
  const frames = Number(video?.nb_frames);

  // `format_name` for an MP4 is the comma-joined list `mov,mp4,m4a,3gp,3g2,mj2`.
  // Reduced to `mp4` when present, because the accepted-container list names one
  // format, not a muxer family.
  const formatNames = (parsed.format?.format_name ?? '').split(',').filter((n) => n.length > 0);
  const container = formatNames.includes('mp4') ? 'mp4' : (formatNames[0] ?? null);

  return {
    width: video?.width ?? null,
    height: video?.height ?? null,
    durationMs: Number.isFinite(duration) ? secondsToMs(duration) : null,
    frameCount: Number.isFinite(frames) ? frames : null,
    container,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    avStartOffsetMs:
      Number.isFinite(videoStart) && Number.isFinite(audioStart)
        ? secondsToMs(audioStart - videoStart)
        : null,
  };
}

interface DetectionPass {
  blackRuns: TimeRun[] | null;
  frozenRuns: TimeRun[] | null;
  silenceRuns: TimeRun[] | null;
  peakDbfs: number | null;
  contentRect: { width: number; height: number } | null;
}

/**
 * The detector filtergraphs, as a pure function of the ruleset.
 *
 * One decode, five detectors: black, freeze and crop are chained on the video
 * path; silence and peak on the audio path. Running them separately would decode
 * the render four more times for no additional information — and a QA gate slow
 * enough to skip is a QA gate that gets skipped.
 *
 * Extracted and exported so the "no dead settings" test can PROVE the four
 * measurement-only thresholds are live. They are the settings a checks-level
 * perturbation can never reach: `blackPixelRatio`, `blackLumaThreshold`,
 * `freezeNoiseDb` and `silenceThresholdDbfs` do not judge anything, they tell
 * FFmpeg what counts as black, frozen or silent in the first place. Before this
 * split the only way to test them was to run FFmpeg on media crafted to sit
 * between two threshold values — which is why they went untested, and why the
 * test's hand-written field list quietly omitted them.
 */
export function buildDetectionFilters(ruleset: QaRuleset): { readonly video: string; readonly audio: string } {
  return {
    video: [
      `blackdetect=d=0:pic_th=${String(ruleset.video.blackPixelRatio)}:pix_th=${String(ruleset.video.blackLumaThreshold)}`,
      `freezedetect=n=${String(ruleset.video.freezeNoiseDb)}dB:d=0.5`,
      'cropdetect=limit=0.02:round=2:reset=0',
    ].join(','),
    audio: [
      `silencedetect=n=${String(ruleset.audio.silenceThresholdDbfs)}dB:d=0.2`,
      'astats=measure_perchannel=none:measure_overall=Peak_level',
    ].join(','),
  };
}

/** Run the one decode described by `buildDetectionFilters` and parse its stderr. */
async function runDetectionPass(input: MeasureInput, durationMs: number | null): Promise<DetectionPass> {
  const { video: videoFilters, audio: audioFilters } = buildDetectionFilters(input.ruleset);

  const argv = [
    '-nostdin',
    '-hide_banner',
    ...inputArgs(input.outputPath),
    '-vf',
    videoFilters,
    ...(input.hasAudio ? ['-af', audioFilters] : []),
    '-f',
    'null',
    '-',
  ];

  try {
    const result = await runFfmpeg(argv, input.runOptions ?? {});
    return {
      blackRuns: parseBlackRuns(result.stderr),
      frozenRuns: parseFreezeRuns(result.stderr, durationMs),
      silenceRuns: input.hasAudio ? parseSilenceRuns(result.stderr, durationMs) : null,
      peakDbfs: input.hasAudio ? parsePeakDbfs(result.stderr) : null,
      contentRect: parseContentRect(result.stderr),
    };
  } catch {
    // A failed detection pass yields nulls, which surface downstream as
    // `skipped` checks with reasons — never as clean results.
    return { blackRuns: null, frozenRuns: null, silenceRuns: null, peakDbfs: null, contentRect: null };
  }
}

/**
 * Frames `mpdecimate` would drop as visually identical to their predecessor.
 *
 * Reported as a raw count, not a verdict: CFR normalisation of a VFR source
 * duplicates frames by design (D-25), so only the *proportion* means anything,
 * and that judgement belongs in `checks.ts` where the threshold lives.
 */
async function countDuplicateFrames(path: string, runOptions: RunOptions): Promise<number | null> {
  try {
    const result = await runFfmpeg(
      ['-nostdin', '-hide_banner', ...inputArgs(path), '-vf', 'mpdecimate', '-an', '-f', 'null', '-'],
      runOptions,
    );
    const match = /drop_count:\s*(\d+)/.exec(result.stderr);
    if (match !== null) return Number(match[1]);
    // Newer builds report only the summary line `... drop=N`.
    const summary = [...result.stderr.matchAll(/drop=\s*(\d+)/g)];
    const last = summary[summary.length - 1];
    return last === undefined ? null : Number(last[1]);
  } catch {
    return null;
  }
}
