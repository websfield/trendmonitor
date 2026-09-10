// Phase 10a plan C2: the public Sample Spin. Reached by app/** only through
// `@respin/credits/app-server`'s `publicSampleSpin` facade.
export {
  SAMPLE_SPIN_FIXTURE_VERSION,
  SAMPLE_SPIN_PLATFORM,
  SAMPLE_SPIN_PROVENANCE,
  SAMPLE_ORIGINAL,
  SAMPLE_FRAMEWORKS,
  SampleSpinFixtureError,
  loadSampleSpinFixture,
  sampleSpinContext,
  type SampleSpinFixture,
} from "./fixture";
export {
  SAMPLE_SPIN_IDEA_MAX_CODE_POINTS,
  SampleSpinIdeaError,
  codePointLength,
  parseSampleSpinIdea,
  type SampleSpinIdea,
  type Untrusted,
} from "./idea";
export {
  PUBLIC_SAMPLE_SPIN_ENV,
  PublicSampleSpinEnablementError,
  PublicSampleSpinNotConfiguredError,
  resolvePublicSampleSpinEnablement,
  type PublicSampleSpinEnablement,
} from "./enablement";
export {
  SAMPLE_SPIN_EVALUATION_RUBRIC,
  SAMPLE_SPIN_EVALUATION_SET,
  type SampleSpinEvaluationIdea,
  type SampleSpinIntentClass,
} from "./evaluation-set";
export {
  SAMPLE_SPIN_DRAFT_CALLS_RESERVED,
  SAMPLE_SPIN_DRAFT_MAX_INPUT_TOKENS,
  SAMPLE_SPIN_DRAFT_MAX_OUTPUT_TOKENS,
  SAMPLE_SPIN_NEXT_ACTION,
  SAMPLE_SPIN_SCORE_MAX_INPUT_TOKENS,
  SAMPLE_SPIN_SCORE_MAX_OUTPUT_TOKENS,
  SampleSpinBoundError,
  SampleSpinInvariantError,
  runPublicSampleSpin,
  sampleSpinDeadlineMs,
  sampleSpinReservationMicroUsd,
  tokenUpperBound,
  type SampleSpinAccepted,
  type SampleSpinDeps,
  type SampleSpinInput,
  type SampleSpinRefusalReason,
  type SampleSpinRefused,
  type SampleSpinResponse,
} from "./run";
