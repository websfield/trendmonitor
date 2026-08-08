import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assembleReviewPayload, type AssembleReviewPayloadInput } from '../src/review-payload.js';
import type { CreativeBriefV1, JobBriefV1, MomentV1, PlatformEdlV1, RenderV1, TechnicalQaReportV1 } from '@cutdown/contracts/generated';

/**
 * The review payload (REQ-110's data, no UI).
 *
 * The behaviour under test is not "does it copy fields" but "does it ever
 * fabricate". Every case below is about an ABSENT input: the payload must record
 * null with a reason, and — for rights especially — must never let a summary line
 * look better than the material it describes. REQ-003's rule is that unknown
 * material is flagged rather than assumed cleared, and a review screen is the
 * exact moment a human would act on a quiet omission.
 */

const ASSET_A = '01KY2C5WZM38M23VRGB7H7WFV3';
const ASSET_B = '01KY2C5WZM38M23VRGB7H7WFV4';
const MOMENT_A = '01J9MN2B3C4D5E6F7G8H9K0M1A';
const MOMENT_B = '01J9MN2B3C4D5E6F7G8H9K0M2B';

const envelope = {
  schemaVersion: '1.0.0',
  createdAt: '2026-07-30T00:00:00.000Z',
  createdBy: { kind: 'skill' as const, skill: 'plan', skillVersion: '1.0.0' },
};

const jobBrief = {
  briefId: '01J9JB2B3C4D5E6F7G8H9K0M1A',
  envelope,
  accountId: 'acct-social-soup-001',
  audience: 'AU parents 30-45',
  objective: 'discovery',
  platforms: ['tiktok'],
  distributionMode: 'organic',
  durationRange: { minSeconds: 5, maxSeconds: 60 },
  locale: 'en-AU',
  brandOrCampaign: 'Test brand',
  contentPromise: 'A quick honest look',
  cta: { kind: 'none', rationale: 'awareness only' },
  variantCount: 3,
} as unknown as JobBriefV1.JobBrief;

const creativeBrief = {
  creativeBriefId: '01J9CB2B3C4D5E6F7G8H9K0M1A',
  envelope,
  jobId: 'job-1',
  sourceBriefId: jobBrief.briefId,
  parentCreativeBriefId: null,
  audiencePromise: 'You will know in 5 seconds whether this is for you',
  creativeThesis: 'Lead with the objection, answer it on camera',
  hookFamily: 'curiosity_first',
  narrativeArchetype: 'objection-first',
  value: 'reassurance',
  proofPoints: [{ claim: 'It takes 5 minutes', evidenceMomentIds: [MOMENT_A], basis: 'on_screen_demonstration' }],
  selectedMoments: [{ momentId: MOMENT_A, role: 'hook' }],
  cta: { kind: 'none', rationale: 'awareness only' },
  distinctness: { peerBriefLabels: ['angle-2'], sharedMomentFraction: 0.25, semanticAngleLabel: 'objection-first' },
  knownLimitations: ['No on-camera price mention available in the footage'],
  modelProvenance: { provider: 'anthropic', modelId: 'fixture', promptTemplateId: 'plan-edl', promptTemplateVersion: '1.0.0' },
} as unknown as CreativeBriefV1.CreativeBrief;

const clip = (order: number, clipId: string, momentId: string, assetId: string) => ({
  clipId,
  order,
  momentId,
  assetId,
  sourceRange: { assetId, startTicks: 0, endTicks: 15360, timebase: { num: 1, den: 15360 } },
  narrativeFunction: order === 0 ? 'promise' : 'payoff',
  rationale: `chosen for slot ${String(order)}`,
  caption: { kind: 'text', displayText: 'caption' },
});

const edl = {
  edlId: '01J9ED2B3C4D5E6F7G8H9K0M6T',
  envelope,
  jobId: 'job-1',
  storyPlanId: '01J9SP2B3C4D5E6F7G8H9K0M5S',
  parentEdlId: null,
  platform: 'tiktok',
  objective: 'discovery',
  distributionMode: 'organic',
  locale: 'en-AU',
  targetDurationRange: { minSeconds: 5, maxSeconds: 60 },
  canvas: { width: 720, height: 1280, aspectRatio: '9:16' },
  aspectTreatment: { mode: 'letterbox', rationale: 'landscape source' },
  hookFamily: 'curiosity_first',
  // Deliberately out of order in the array, so the payload's ordering is proven
  // to come from `order` rather than from insertion order.
  clips: [clip(1, 'clip-2', MOMENT_B, ASSET_B), clip(0, 'clip-1', MOMENT_A, ASSET_A)],
  audioMode: 'native_audio_plan',
  disclosures: { paidPartnership: false, aiGeneratedOrAltered: false, ownedBusinessPromotion: true },
  metadata: { title: 'Test', description: null },
  coverFrame: { kind: 'none' },
  modelProvenance: { provider: 'anthropic', modelId: 'fixture', promptTemplateId: 'plan-edl', promptTemplateVersion: '1.0.0' },
} as unknown as PlatformEdlV1.PlatformEDL;

const render = {
  renderId: '01J9RD2B3C4D5E6F7G8H9K0N2B',
  envelope,
  jobId: 'job-1',
  edlId: edl.edlId,
  renderManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A',
  tier: 'draft',
  releaseState: 'draft',
  outputPath: 'renders/draft/01J9RM2B3C4D5E6F7G8H9K0N1A/output.mp4',
  captions: {
    assPath: 'renders/draft/01J9RM2B3C4D5E6F7G8H9K0N1A/captions.ass',
    srtPath: 'renders/draft/01J9RM2B3C4D5E6F7G8H9K0N1A/captions.srt',
    vttPath: 'renders/draft/01J9RM2B3C4D5E6F7G8H9K0N1A/captions.vtt',
  },
} as unknown as RenderV1.Render;

const moment = (momentId: string, assetId: string, verbatimText: string) =>
  ({
    momentId,
    assetId,
    transcript: { verbatimText, displayText: verbatimText, wordCount: 3, segmentIds: [], lowConfidenceWordCount: 0 },
  }) as unknown as MomentV1.Moment;

const qaReport = {
  qaReportId: '01J9QR2B3C4D5E6F7G8H9K0N1A',
  gateStatus: 'pass_with_waivers',
  findings: [
    { findingId: 'true_peak:audio', checkId: 'true_peak', severity: 'warning' },
    { findingId: 'caption_readability:cue-1', checkId: 'caption_readability', severity: 'info' },
  ],
  waiverIds: ['01J9QW2B3C4D5E6F7G8H9K0P1F'],
  waivedFindingIds: ['true_peak:audio'],
} as unknown as TechnicalQaReportV1.TechnicalQaReport;

function input(overrides: Partial<AssembleReviewPayloadInput> = {}): AssembleReviewPayloadInput {
  return {
    jobBrief,
    creativeBrief,
    edl,
    render,
    momentsById: new Map([
      [MOMENT_A, moment(MOMENT_A, ASSET_A, 'here is the objection')],
      [MOMENT_B, moment(MOMENT_B, ASSET_B, 'and here is the answer')],
    ]),
    rightsByAssetId: new Map([
      [ASSET_A, 'cleared'],
      [ASSET_B, 'cleared'],
    ]),
    qaReport,
    assembledAt: '2026-07-30T06:00:00.000Z',
    ...overrides,
  };
}

describe('the payload carries every field REQ-110 names', () => {
  it('copies the angle, promise, hook hypothesis and rationale from committed objects', () => {
    const payload = assembleReviewPayload(input());
    strictEqual(payload.angle, creativeBrief.creativeThesis);
    strictEqual(payload.audiencePromise, creativeBrief.audiencePromise);
    deepStrictEqual(payload.hookHypothesis, { hookFamily: 'curiosity_first', narrativeArchetype: 'objection-first' });
    strictEqual(payload.creativeBriefId, creativeBrief.creativeBriefId);
    strictEqual(payload.accountId, 'acct-social-soup-001');
    strictEqual(payload.outputPath, render.outputPath);

    // The rationale is assembled from what the pipeline already recorded, so every
    // line is auditable against the decision that produced the cut.
    ok(payload.decisionRationale.some((line) => line.includes('0.25')), 'distinctness is stated as data');
    ok(payload.decisionRationale.some((line) => line.includes('No on-camera price mention')));
    ok(payload.decisionRationale.some((line) => line.includes('It takes 5 minutes')));
  });

  it('orders moments by the EDL clip order, not by array position', () => {
    const payload = assembleReviewPayload(input());
    deepStrictEqual(payload.moments.map((m) => m.clipId), ['clip-1', 'clip-2']);
    strictEqual(payload.moments[0]?.verbatim.value, 'here is the objection');
  });

  it('reports the QA verdict without re-deriving it', () => {
    const payload = assembleReviewPayload(input());
    strictEqual(payload.qa.value?.gateStatus, 'pass_with_waivers');
    strictEqual(payload.qa.value?.blockerCount, 0);
    strictEqual(payload.qa.value?.warningCount, 1, 'the info finding is not counted as a warning');
    deepStrictEqual(payload.qa.value?.waivedFindingIds, ['true_peak:audio']);
  });
});

describe('the payload never fabricates', () => {
  it('records a null-with-reason for a Moment that is not in the graph', () => {
    const payload = assembleReviewPayload(
      input({ momentsById: new Map([[MOMENT_A, moment(MOMENT_A, ASSET_A, 'here is the objection')]]) }),
    );
    const second = payload.moments[1];
    strictEqual(second?.verbatim.value, null);
    ok(second?.verbatim.value === null && second.verbatim.reason.includes(MOMENT_B));
  });

  it('distinguishes "no transcribed speech" from "Moment missing"', () => {
    const payload = assembleReviewPayload(
      input({
        momentsById: new Map([
          [MOMENT_A, moment(MOMENT_A, ASSET_A, '')],
          [MOMENT_B, moment(MOMENT_B, ASSET_B, 'and here is the answer')],
        ]),
      }),
    );
    const first = payload.moments[0];
    strictEqual(first?.verbatim.value, null);
    ok(first?.verbatim.value === null && first.verbatim.reason.includes('no transcribed speech'));
  });

  it('records a null-with-reason when no QA report exists', () => {
    const payload = assembleReviewPayload(input({ qaReport: null }));
    strictEqual(payload.qa.value, null);
    ok(payload.qa.value === null && payload.qa.reason.includes('no technical QA report'));
  });
});

describe('the rights summary can never look better than the material', () => {
  it('reports the WEAKEST state, not the first or the most common', () => {
    const payload = assembleReviewPayload(
      input({ rightsByAssetId: new Map([[ASSET_A, 'cleared'], [ASSET_B, 'expired']]) }),
    );
    strictEqual(payload.rights.weakestState.value, 'expired');
  });

  it('ranks `unknown` BELOW expired and restricted — an absent record is the worst case (REQ-003)', () => {
    const payload = assembleReviewPayload(
      input({ rightsByAssetId: new Map([[ASSET_A, 'restricted'], [ASSET_B, 'unknown']]) }),
    );
    strictEqual(
      payload.rights.weakestState.value,
      'unknown',
      'expired and restricted are known refusals a reviewer can reason about; unknown is the absence of a record',
    );
  });

  it('counts an asset with NO record as unknown, and names it', () => {
    // The failure this prevents: one asset has a `cleared` record and the other has
    // none, and the summary line reads `cleared` off the only record present.
    const payload = assembleReviewPayload(input({ rightsByAssetId: new Map([[ASSET_A, 'cleared']]) }));
    strictEqual(payload.rights.weakestState.value, 'unknown');
    deepStrictEqual(payload.rights.unknownAssetIds, [ASSET_B]);
    deepStrictEqual(payload.rights.assetStates, [{ assetId: ASSET_A, state: 'cleared' }]);
    strictEqual(payload.moments[1]?.rightsState.value, null, 'and the per-moment detail says so too');
  });

  it('refuses to rank an unrecognised rights state rather than defaulting it', () => {
    const payload = assembleReviewPayload(
      input({ rightsByAssetId: new Map([[ASSET_A, 'pending_legal'], [ASSET_B, 'pending_legal']]) }),
    );
    strictEqual(payload.rights.weakestState.value, null);
    ok(
      payload.rights.weakestState.value === null &&
        payload.rights.weakestState.reason.includes('pending_legal'),
      'a rights vocabulary that grew without this function noticing must not resolve to "probably fine"',
    );
  });

  it('carries the disclosures verbatim (REQ-163/164 record-level)', () => {
    const payload = assembleReviewPayload(input());
    deepStrictEqual(payload.rights.disclosures, edl.disclosures);
  });
});

describe('the target metric is honest about what Phase 0 has', () => {
  it('states the objective and says no numeric target exists', () => {
    const payload = assembleReviewPayload(input());
    ok(payload.targetMetric.value?.includes('discovery'));
    ok(
      payload.targetMetric.value?.includes('Phase 1'),
      'a fabricated number would be worse than an honest absence, and a bare null would read as an oversight',
    );
  });
});
