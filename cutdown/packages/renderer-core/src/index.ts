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
} from './ffmpeg.js';

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
