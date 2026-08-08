/**
 * `@cutdown/renderer-ffmpeg` — the Phase 0 RendererAdapter (decisions.md D-16).
 *
 * FFmpeg + libass: frame-accurate cuts, canvas fitting, a dialogue-first audio
 * mix, and burned-in open captions with the SRT/WebVTT sidecars REQ-104
 * requires. Remotion is an owner escalation and lands behind the same adapter in
 * product Phase 1 — nothing here leaks past `RendererAdapter`.
 */

export {
  FfmpegRendererAdapter,
  draftBadgeText,
  fittedCharsPerLine,
  AVERAGE_ADVANCE_EM,
  type RendererOptions,
  type FfmpegRenderPlan,
  type FfmpegPlanExtras,
} from './adapter.js';

export {
  buildCaptionPlan,
  renderAss,
  renderSrt,
  renderVtt,
  wrapCaptionText,
  normaliseCaptionText,
  detectProperNouns,
  toAssColour,
  formatAssTime,
  formatSrtTime,
  formatVttTime,
  CaptionError,
  type CaptionPlan,
  type CaptionCue,
  type CaptionStyle,
  type CaptionLayoutRules,
  type CaptionReviewFlag,
  type CaptionReviewFlagKind,
  type MomentCaptionMarks,
  type BuildCaptionPlanInput,
} from './captions.js';

export {
  buildFilterGraph,
  videoChain,
  audioChain,
  toFfmpegColour,
  BOUNDARY_FADE_SECONDS,
  type AspectTreatmentMode,
  type VideoTreatment,
  type CanvasSpec,
  type GraphInput,
  type BuildGraphInput,
  type BuiltGraph,
  type BurnInSpec,
  type DraftBadgeSpec,
} from './filtergraph.js';

export { measureLoudness, parseEbur128Summary, type LoudnessReport } from './loudness.js';

export {
  durationToFrames,
  frameToMilliseconds,
  exactSecondsString,
  ticksToSecondsString,
  ticksToSecondsRational,
  framesPerSecond,
  SECONDS_PRECISION,
  type PlannedClip,
  type Timebase,
} from './timeline.js';
