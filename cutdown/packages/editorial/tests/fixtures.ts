/**
 * Schema-valid fixture builders for the editorial tests.
 *
 * Several suites validate against the real contract schemas (creative-brief-v1,
 * master-story-plan-v1, platform-edl-v1), so these builders produce fully valid
 * artefacts — a fixture that quietly drifts from the schema would make a passing
 * test meaningless.
 */

import { skillEnvelope } from '@cutdown/skill-runtime';
import type { CreativeBriefV1, JobBriefV1, MasterStoryPlanV1, MomentV1, PlatformEdlV1 } from '@cutdown/contracts/generated';

/** A pool of valid 26-char Crockford-base32 ULIDs (excludes I, L, O, U). */
export const ULIDS = [
  '01HQZX3F5G7K9M2N4P6R8S0T2V',
  '01HQZX3F5G7K9M2N4P6R8S0T30',
  '01HQZX3F5G7K9M2N4P6R8S0T31',
  '01HQZX3F5G7K9M2N4P6R8S0T32',
  '01HQZX3F5G7K9M2N4P6R8S0T33',
  '01HQZX3F5G7K9M2N4P6R8S0T34',
  '01HQZX3F5G7K9M2N4P6R8S0T35',
  '01HQZX3F5G7K9M2N4P6R8S0T36',
] as const;

export const ASSET_ID = ULIDS[7];

export function ulid(i: number): string {
  const value = ULIDS[i];
  if (!value) throw new Error(`fixtures: no ULID at index ${i}`);
  return value;
}

export function makeJobBrief(overrides: Partial<JobBriefV1.JobBrief> = {}): JobBriefV1.JobBrief {
  return {
    briefId: ulid(0),
    envelope: skillEnvelope('test', '1.0.0'),
    accountId: 'acct-1',
    audience: 'small-business owners evaluating the product',
    objective: 'education_utility',
    platforms: ['tiktok'],
    distributionMode: 'organic',
    durationRange: { minSeconds: 20, maxSeconds: 45 },
    locale: 'en-AU',
    brandOrCampaign: 'launch',
    contentPromise: 'a clear before/after of the pricing change',
    cta: { kind: 'none' },
    variantCount: 2,
    ...overrides,
  };
}

export function makeEmbedding(dimensions = 4, seed = 1): MomentV1.MomentEmbedding {
  return {
    model: 'BAAI/bge-small-en-v1.5',
    modelVersion: '1.5',
    dimensions,
    vector: Array.from({ length: dimensions }, (_, i) => Math.sin(seed + i)),
  };
}

export function makeMoment(overrides: Partial<MomentV1.Moment> = {}): MomentV1.Moment {
  return {
    momentId: ulid(1),
    envelope: skillEnvelope('index', '1.0.0'),
    jobId: 'job-1',
    assetId: ASSET_ID,
    sourceIndexId: ulid(2),
    sourceRange: { assetId: ASSET_ID, startTicks: 0, endTicks: 300, timebase: { num: 1, den: 30 } },
    durationSeconds: 10,
    segmentation: {
      method: 'speaker_turn_x_shot_boundary',
      speakerTurnIds: ['t1'],
      shotIds: ['s1'],
      indexerVersion: '1.0.0',
      granularityBounds: { minSeconds: 3, maxSeconds: 30 },
    },
    transcript: { verbatimText: 'we cut the price in half', displayText: 'We cut the price in half.', wordCount: 6, segmentIds: ['seg1'], lowConfidenceWordCount: 0 },
    visualSummary: { value: null, absentReason: 'VLM sub-stage skipped (no spend ceiling)' },
    speakers: [{ turnId: 't1', label: 'Founder', isCorrected: true, lowConfidence: false }],
    entities: [],
    keywords: ['price'],
    energyCues: [],
    technicalQuality: { flagKinds: [], worstSeverity: 'none', usable: true },
    rights: { state: 'cleared', concerns: [] },
    candidateNarrativeFunctions: [{ function: 'proof', confidence: 0.8, rationale: 'shows the change', source: 'heuristic' }],
    sourceDependencies: [],
    embedding: makeEmbedding(),
    ...overrides,
  };
}

export function makeCreativeBrief(overrides: Partial<CreativeBriefV1.CreativeBrief> = {}): CreativeBriefV1.CreativeBrief {
  return {
    creativeBriefId: ulid(3),
    envelope: skillEnvelope('propose', '1.0.0'),
    jobId: 'job-1',
    sourceBriefId: ulid(0),
    parentCreativeBriefId: null,
    audiencePromise: 'You will see exactly what changed and why.',
    creativeThesis: 'Transparency about the price cut builds trust.',
    hookFamily: 'proof_first',
    narrativeArchetype: 'reveal',
    value: 'reassurance',
    proofPoints: [
      {
        claim: 'The price was cut in half.',
        evidenceMomentIds: [ulid(1)],
        basis: { kind: 'observed_fact', observed: 'Founder says "we cut the price in half".' },
      },
    ],
    selectedMoments: [{ momentId: ulid(1), candidateFunction: 'proof', rationale: 'the core evidence' }],
    cta: { kind: 'none' },
    distinctness: { peerBriefLabels: ['angle-2'], sharedMomentFraction: 0, semanticAngleLabel: 'transparency' },
    knownLimitations: [],
    modelProvenance: { provider: 'anthropic', modelId: 'claude-sonnet-5', promptTemplateId: 'propose-angles', promptTemplateVersion: '1.0.0' },
    ...overrides,
  };
}

export function makeStoryPlan(overrides: Partial<MasterStoryPlanV1.MasterStoryPlan> = {}): MasterStoryPlanV1.MasterStoryPlan {
  return {
    storyPlanId: ulid(4),
    envelope: skillEnvelope('plan', '1.0.0'),
    jobId: 'job-1',
    creativeBriefId: ulid(3),
    parentStoryPlanId: null,
    beats: [
      {
        beatId: 'beat-1',
        order: 0,
        function: 'proof',
        momentId: ulid(1),
        rationale: 'open on the evidence',
        basis: { kind: 'observed_fact', observed: 'Founder states the cut.' },
        optional: false,
        alternateMomentIds: [],
      },
    ],
    dependencies: [],
    alternateHooks: [],
    modelProvenance: { provider: 'anthropic', modelId: 'claude-sonnet-5', promptTemplateId: 'plan-story', promptTemplateVersion: '1.0.0' },
    ...overrides,
  };
}

export function makePlatformEdl(overrides: Partial<PlatformEdlV1.PlatformEDL> = {}): PlatformEdlV1.PlatformEDL {
  return {
    edlId: ulid(5),
    envelope: skillEnvelope('plan', '1.0.0'),
    jobId: 'job-1',
    storyPlanId: ulid(4),
    parentEdlId: null,
    platform: 'tiktok',
    objective: 'education_utility',
    distributionMode: 'organic',
    locale: 'en-AU',
    targetDurationRange: { minSeconds: 5, maxSeconds: 60 },
    canvas: { width: 720, height: 1280, aspectRatio: '9:16' },
    aspectTreatment: { mode: 'subject_reframe', rationale: 'keep the speaker centred' },
    hookFamily: 'proof_first',
    clips: [
      {
        clipId: 'clip-1',
        order: 0,
        momentId: ulid(1),
        assetId: ASSET_ID,
        sourceRange: { assetId: ASSET_ID, startTicks: 0, endTicks: 300, timebase: { num: 1, den: 30 } },
        narrativeFunction: 'proof',
        rationale: 'the evidence clip',
        caption: { kind: 'none' },
      },
    ],
    audioMode: 'native_audio_plan',
    disclosures: { paidPartnership: false, aiGeneratedOrAltered: false, ownedBusinessPromotion: false },
    metadata: { title: 'The price cut, explained', description: null },
    coverFrame: { kind: 'none' },
    modelProvenance: { provider: 'anthropic', modelId: 'claude-sonnet-5', promptTemplateId: 'plan-edl', promptTemplateVersion: '1.0.0' },
    ...overrides,
  };
}
