import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { runDeterministicGates, assembleGateResult, type CriticFinding } from '../src/editorial-gates.js';
import type { EditorialFinding, EditorialRuleId } from '../src/editorial-checks.js';
import type { PlatformEdlV1 } from '@cutdown/contracts/generated';
import {
  ASSET_ID,
  TIKTOK_CAPABILITY,
  boundsMap,
  makeCreativeBrief,
  makeJobBrief,
  makeMoment,
  makePlatformEdl,
  makeStyleProfile,
  ulid,
} from './fixtures.js';

/**
 * The deterministic editorial gate is the sole owner of every blocking decision
 * (decisions.md D-37). Each test below deliberately BREAKS one blocker and asserts
 * it blocks with the right rule id, then a coherence/style ADVISORY is shown to
 * stay advisory. The LLM critic can never turn a finding into a blocker.
 */

const CAPABILITY = TIKTOK_CAPABILITY;

function gate(edl: PlatformEdlV1.PlatformEDL, opts: {
  moments?: ReturnType<typeof makeMoment>[];
  jobBrief?: ReturnType<typeof makeJobBrief>;
  styleProfile?: ReturnType<typeof makeStyleProfile>;
  creativeBrief?: ReturnType<typeof makeCreativeBrief>;
  audioRightsEvidencePresent?: boolean;
  materialAlteration?: boolean;
} = {}) {
  return runDeterministicGates(edl, {
    moments: opts.moments ?? [makeMoment()],
    jobBrief: opts.jobBrief ?? makeJobBrief(),
    ...(opts.styleProfile ? { styleProfile: opts.styleProfile } : {}),
    ...(opts.creativeBrief ? { creativeBrief: opts.creativeBrief } : {}),
    capability: CAPABILITY,
    boundsByAsset: boundsMap(),
    ...(opts.audioRightsEvidencePresent !== undefined ? { audioRightsEvidencePresent: opts.audioRightsEvidencePresent } : {}),
    ...(opts.materialAlteration !== undefined ? { materialAlteration: opts.materialAlteration } : {}),
  });
}

function blockCodes(blockers: EditorialFinding[]): string[] {
  return blockers.map((b) => b.code);
}

function hasBlock(blockers: EditorialFinding[], rule: EditorialRuleId, code: string): boolean {
  return blockers.some((b) => b.rule === rule && b.code === code && b.severity === 'block' && b.source === 'deterministic');
}

/** A clip whose caption is a quote, overriding the base valid clip. */
function quoteEdl(caption: PlatformEdlV1.ClipCaption, momentOverride = {}): PlatformEdlV1.PlatformEDL {
  return makePlatformEdl({
    clips: [
      {
        clipId: 'clip-1',
        order: 0,
        momentId: ulid(1),
        assetId: ASSET_ID,
        sourceRange: { assetId: ASSET_ID, startTicks: 0, endTicks: 300, timebase: { num: 1, den: 30 } },
        narrativeFunction: 'proof',
        rationale: 'the evidence clip',
        caption,
      },
    ],
    ...momentOverride,
  });
}

describe('a clean EDL passes and its advisory does not fail the gate', () => {
  test('the baseline resolves to gateStatus pass with no blockers', () => {
    const result = gate(makePlatformEdl());
    assert.equal(result.gateStatus, 'pass', JSON.stringify(result.blockers, null, 2));
    assert.deepEqual(result.blockers, []);
    assert.equal(result.checked.clips, 1);
  });

  test('the AI-media disclosure with no alteration signal is advisory, never a block', () => {
    const result = gate(makePlatformEdl());
    assert.ok(result.advisories.some((a) => a.code === 'AI_MEDIA_DISCLOSURE_UNASSERTED'));
    assert.equal(result.gateStatus, 'pass');
  });
});

describe('quote fidelity (REQ-037)', () => {
  test('a reordered display quote BLOCKS with quote-fidelity', () => {
    // verbatimSourceText is in the Moment; the display quote reorders its tokens.
    const edl = quoteEdl({ kind: 'quote', displayText: 'price the cut', verbatimSourceText: 'we cut the price', speakerLabel: 'Founder' });
    const result = gate(edl);
    assert.equal(result.gateStatus, 'fail');
    assert.ok(hasBlock(result.blockers, 'quote-fidelity', 'QUOTE_NOT_SUBSEQUENCE_OF_VERBATIM'), blockCodes(result.blockers).join(','));
  });

  test('a quote of words the Moment never contained BLOCKS', () => {
    const edl = quoteEdl({ kind: 'quote', displayText: 'we doubled', verbatimSourceText: 'we doubled the price', speakerLabel: 'Founder' });
    const result = gate(edl);
    assert.ok(hasBlock(result.blockers, 'quote-fidelity', 'QUOTE_VERBATIM_NOT_IN_MOMENT'), blockCodes(result.blockers).join(','));
  });

  test('a quote attributed to a non-speaker BLOCKS (misattribution)', () => {
    const edl = quoteEdl({ kind: 'quote', displayText: 'cut the price', verbatimSourceText: 'we cut the price', speakerLabel: 'CEO' });
    const result = gate(edl);
    assert.ok(hasBlock(result.blockers, 'quote-fidelity', 'QUOTE_SPEAKER_MISATTRIBUTED'), blockCodes(result.blockers).join(','));
  });

  test('an in-order shortening with a correct speaker is CLEAN', () => {
    const edl = quoteEdl({ kind: 'quote', displayText: 'cut the price', verbatimSourceText: 'we cut the price in half', speakerLabel: 'Founder' });
    const result = gate(edl);
    assert.equal(result.gateStatus, 'pass', blockCodes(result.blockers).join(','));
  });

  test('a matched but UNCORRECTED speaker is an ADVISORY, not a block (stays advisory)', () => {
    const moment = makeMoment({ speakers: [{ turnId: 't1', label: 'Founder', isCorrected: false, lowConfidence: false }] });
    const edl = quoteEdl({ kind: 'quote', displayText: 'cut the price', verbatimSourceText: 'we cut the price', speakerLabel: 'Founder' });
    const result = gate(edl, { moments: [moment] });
    assert.equal(result.gateStatus, 'pass', blockCodes(result.blockers).join(','));
    assert.ok(result.advisories.some((a) => a.code === 'QUOTE_SPEAKER_UNVERIFIED' && a.severity === 'advisory'));
  });
});

describe('prohibited claims (D-35/D-37, non-waivable)', () => {
  test('a JobBrief prohibited claim in the title BLOCKS', () => {
    const edl = makePlatformEdl({ metadata: { title: 'The one algorithm hack you need', description: null } });
    const result = gate(edl, { jobBrief: makeJobBrief({ prohibitedClaims: ['algorithm hack'] }) });
    assert.ok(hasBlock(result.blockers, 'prohibited-claims', 'PROHIBITED_CLAIM_PRESENT'));
    const finding = result.blockers.find((b) => b.code === 'PROHIBITED_CLAIM_PRESENT');
    assert.equal(finding?.cite.matched, 'algorithm hack');
  });

  test('a StyleProfile prohibited claim in a caption BLOCKS (the union is checked)', () => {
    const edl = makePlatformEdl({
      clips: [
        {
          clipId: 'clip-1', order: 0, momentId: ulid(1), assetId: ASSET_ID,
          sourceRange: { assetId: ASSET_ID, startTicks: 0, endTicks: 300, timebase: { num: 1, den: 30 } },
          narrativeFunction: 'proof', rationale: 'r',
          caption: { kind: 'text', displayText: 'How to GET RICH fast' },
        },
      ],
    });
    const result = gate(edl, { styleProfile: makeStyleProfile({ prohibitedClaims: ['get rich'] }) });
    assert.ok(hasBlock(result.blockers, 'prohibited-claims', 'PROHIBITED_CLAIM_PRESENT'));
  });
});

describe('required evidence & context (REQ-034)', () => {
  test('a proofPoint whose evidence Moment is not in the EDL BLOCKS', () => {
    const cb = makeCreativeBrief({
      proofPoints: [
        { claim: 'The price was cut.', evidenceMomentIds: [ulid(2)], basis: { kind: 'observed_fact', observed: 'x' } },
      ],
    });
    const result = gate(makePlatformEdl(), { creativeBrief: cb });
    assert.ok(hasBlock(result.blockers, 'required-evidence', 'PROOF_EVIDENCE_NOT_IN_EDL'));
  });

  test('a requires_setup dependency on a Moment absent from the EDL BLOCKS (context loss)', () => {
    const moment = makeMoment({ sourceDependencies: [{ momentId: ulid(2), relation: 'requires_setup' }] });
    const result = gate(makePlatformEdl(), { moments: [moment] });
    assert.ok(hasBlock(result.blockers, 'context-dependency', 'CONTEXT_DEPENDENCY_MISSING'));
  });
});

describe('rights (REQ-003/056)', () => {
  test('an unknown-rights Moment BLOCKS', () => {
    const moment = makeMoment({ rights: { state: 'unknown', concerns: ['no record'] } });
    const result = gate(makePlatformEdl(), { moments: [moment] });
    assert.ok(hasBlock(result.blockers, 'rights', 'RIGHTS_STATE_NOT_CLEARED'));
  });

  test('a cleared/BYO audioMode with no evidence BLOCKS, and is admitted with recorded evidence', () => {
    const edl = makePlatformEdl({ audioMode: 'cross_platform_cleared' });
    assert.ok(hasBlock(gate(edl).blockers, 'audio-rights', 'AUDIO_RIGHTS_EVIDENCE_MISSING'));
    assert.equal(gate(edl, { audioRightsEvidencePresent: true }).gateStatus, 'pass');
  });
});

describe('disclosures (REQ-058, D-35)', () => {
  test('a paid distribution without a paid-partnership disclosure BLOCKS', () => {
    const edl = makePlatformEdl({ distributionMode: 'paid', disclosures: { paidPartnership: false, aiGeneratedOrAltered: false, ownedBusinessPromotion: false } });
    const result = gate(edl, { jobBrief: makeJobBrief({ distributionMode: 'paid' }) });
    assert.ok(hasBlock(result.blockers, 'disclosures', 'PAID_PARTNERSHIP_DISCLOSURE_MISSING'));
  });

  test('material alteration without an AI-media disclosure BLOCKS', () => {
    const result = gate(makePlatformEdl(), { materialAlteration: true });
    assert.ok(hasBlock(result.blockers, 'disclosures', 'AI_MEDIA_DISCLOSURE_MISSING'));
  });
});

describe('capability & range', () => {
  test('an out-of-bounds source range BLOCKS with edl-resolution, never clamped', () => {
    const edl = makePlatformEdl({
      clips: [
        {
          clipId: 'clip-1', order: 0, momentId: ulid(1), assetId: ASSET_ID,
          sourceRange: { assetId: ASSET_ID, startTicks: 0, endTicks: 2000, timebase: { num: 1, den: 30 } },
          narrativeFunction: 'proof', rationale: 'r', caption: { kind: 'none' },
        },
      ],
    });
    const result = gate(edl);
    assert.ok(hasBlock(result.blockers, 'edl-resolution', 'RANGE_INVALID'));
  });

  test('a duration above the platform max BLOCKS with capability', () => {
    const edl = makePlatformEdl({ targetDurationRange: { minSeconds: 5, maxSeconds: 300 } });
    const result = gate(edl);
    assert.ok(hasBlock(result.blockers, 'capability', 'DURATION_ABOVE_MAX'));
  });

  test('a schema-invalid EDL fails closed with a schema block and skips content checks', () => {
    const result = gate({ edlId: 'not-a-ulid' } as unknown as PlatformEdlV1.PlatformEDL);
    assert.equal(result.gateStatus, 'fail');
    assert.equal(result.checked.schemaBlocked, true);
    assert.ok(result.blockers.every((b) => b.code === 'EDL_SCHEMA_INVALID'));
  });
});

describe('D-37 separation: critic advisories NEVER become blockers', () => {
  const coherenceAdvisory: CriticFinding = { source: 'critic', lens: 'coherence', severity: 'high', note: 'the second beat feels disconnected from the hook', cite: 'clip-1' };

  test('a clean EDL with a coherence/style critic advisory still passes', () => {
    const deterministic = gate(makePlatformEdl());
    const result = assembleGateResult({ deterministic, criticAdvisories: [coherenceAdvisory] });
    assert.equal(result.gateStatus, 'pass');
    assert.deepEqual(result.blockers, []);
    assert.ok(result.advisories.some((a) => 'source' in a && a.source === 'critic' && a.lens === 'coherence'));
  });

  test('a high-severity critic finding does not appear among blockers', () => {
    const deterministic = gate(makePlatformEdl());
    const result = assembleGateResult({ deterministic, criticAdvisories: [coherenceAdvisory] });
    assert.ok(!result.blockers.some((b) => (b as { source?: string }).source === 'critic'));
  });

  test('gateStatus is copied from the deterministic verdict even when a blocker AND a critic finding are present', () => {
    const moment = makeMoment({ rights: { state: 'unknown', concerns: [] } });
    const deterministic = gate(makePlatformEdl(), { moments: [moment] });
    const result = assembleGateResult({ deterministic, criticAdvisories: [coherenceAdvisory] });
    assert.equal(result.gateStatus, 'fail');
    assert.ok(result.blockers.every((b) => (b as { source?: string }).source === 'deterministic'));
    assert.ok(result.advisories.some((a) => 'source' in a && a.source === 'critic'));
  });
});
