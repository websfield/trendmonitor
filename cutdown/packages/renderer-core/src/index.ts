/**
 * `@cutdown/renderer-core` — the RendererAdapter surface and the single
 * sanctioned FFmpeg entrypoint (tech-spec §11).
 *
 * Everything media-related passes through here. No editorial package, skill, or
 * CLI command spawns `ffmpeg`/`ffprobe` on its own — that is the hard rule §11
 * states, and this barrel is the only door.
 */

export {
  // Errors and the §6.2 contract
  FfmpegError,
  RENDERER_CORE_IDENTITY,
  EXIT_INPUT_VALIDATION,
  EXIT_RUNTIME,
  type SkillErrorPayload,
  type SkillIdentity,
  // Path safety
  MEDIA_BINARIES,
  PROTOCOL_WHITELIST,
  assertSafeInputPath,
  assertSafeArgv,
  inputArgs,
  // Filtergraph escaping
  escapeFiltergraphText,
  escapeFilterPath,
  // Spawning
  runFfmpeg,
  runFfmpegAllowFailure,
  runFfprobe,
  type RunOptions,
  type RunResult,
  // Version and capabilities
  ffmpegVersion,
  probeCapabilities,
  assertLibass,
  resetCapabilityCache,
  type FfmpegCapabilities,
  // Determinism (tech-spec §12 tier 1, D-33)
  DETERMINISM_TIER,
  DETERMINISTIC_THREADS,
  determinismArgs,
  assertDeterministicArgv,
} from './ffmpeg.js';

export type {
  RendererAdapter,
  RenderPlan,
  RenderCommand,
  PlannedFile,
  PlanContext,
  ExecuteOptions,
  RenderManifest,
  Render,
} from './adapter.js';

export {
  buildRenderManifest,
  withFfmpegVersion,
  assertFinalMatchesApprovedDraft,
  loadFontRegistry,
  resolveFonts,
  libassFontsDir,
  RENDERER_VERSION,
  DEFAULT_TARGET_LOUDNESS_LUFS,
  DEFAULT_MAX_TRUE_PEAK_DBTP,
  DRAFT_CRF,
  FINAL_CRF,
  type FontRegistry,
  type FontRegistryEntry,
  type ResolvedFont,
  type FontReference,
  type BuildManifestInput,
  type ManifestComparison,
} from './manifest.js';

export {
  preflight,
  probeRaw,
  probeCorruption,
  parseRational,
  normaliseRotation,
  detectHdr,
  classifyFrameRate,
  type PreflightOptions,
  type PreflightReport,
  type VideoStreamInfo,
  type AudioStreamInfo,
  type CorruptionReport,
  type CorruptionStatus,
  type ContainerInfo,
  type ColorInfo,
  type HdrInfo,
  type FrameRateMode,
  type MediaTime,
  type Timebase,
  type RawProbe,
} from './probe.js';

export {
  generateProxy,
  fitShortEdge,
  chooseConstantFrameRate,
  PROXY_PROFILE_VERSION,
  PROXY_SHORT_EDGE,
  PROXY_CRF,
  PROXY_VIDEO_CODEC,
  PROXY_AUDIO_CODEC,
  PROXY_AUDIO_BITRATE_KBPS,
  type ProxyRecord,
  type ProxyRecipe,
  type GenerateProxyOptions,
  type GenerateProxyResult,
  type ContentHash,
} from './proxy.js';

export { probeAlpha, isAlphaCapable, type AlphaProbe } from './alpha.js';
export { extractStillFrame, type StillFrame } from './stills.js';
