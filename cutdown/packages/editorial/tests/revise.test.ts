import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONSTRAINT_KINDS,
  MAX_INSTRUCTION_LENGTH,
  applyEdlConstraints,
  selectTarget,
  validateInterpretation,
  type ConstraintKind,
  type ReviseConstraint,
} from '../src/revise.js';
import type { PlatformEdlV1 } from '@cutdown/contracts/generated';

/**
 * Target selection — the deterministic decision REQ-039 turns on.
 *
 * The model interprets prose; it does NOT choose the target. That split exists
 * because choosing the target decides how much approved work is discarded, and a
 * sampler would occasionally answer `creative-brief` for a typo fix — producing a
 * pipeline that still looked valid while having thrown away the story plan, the
 * EDL, the approved cut and every review decision attached to them.
 */

const constraint = (kind: ConstraintKind, subject = 'clip-1'): ReviseConstraint => ({
  kind,
  subject,
  instruction: `do the ${kind} thing`,
  sourceText: 'the note',
});

describe('every constraint kind maps to a target', () => {
  it('leaves no kind unmapped — an unmapped kind would silently widen or crash', () => {
    for (const kind of CONSTRAINT_KINDS) {
      const selection = selectTarget([constraint(kind)]);
      ok(selection !== null, `${kind} resolved to no target`);
      ok(
        ['platform-edl', 'master-story-plan', 'creative-brief'].includes(selection.target),
        `${kind} resolved to ${selection.target}`,
      );
    }
  });

  it('returns null for an empty constraint list rather than defaulting to a target', () => {
    strictEqual(selectTarget([]), null);
  });
});

describe('the WIDEST constraint decides, and narrower ones ride along', () => {
  it('a caption note stays at the EDL', () => {
    strictEqual(selectTarget([constraint('caption_text')])?.target, 'platform-edl');
  });

  it('a pacing note widens to the story plan', () => {
    strictEqual(selectTarget([constraint('pacing', 'output')])?.target, 'master-story-plan');
  });

  it('an angle note widens to the creative brief', () => {
    strictEqual(selectTarget([constraint('angle', 'output')])?.target, 'creative-brief');
  });

  it('a caption note MIXED with an angle note widens — and says which constraint forced it', () => {
    const selection = selectTarget([constraint('caption_text'), constraint('angle', 'output')]);
    strictEqual(selection?.target, 'creative-brief');
    strictEqual(selection.decidedBy.kind, 'angle');
    ok(selection.rationale.includes('angle'), 'the rationale names the deciding constraint');
    ok(
      selection.rationale.includes('caption_text'),
      'and names the narrower constraints carried into the same revision rather than spawning a second one',
    );
  });

  it('is order-independent — the widest wins whichever way round the list is', () => {
    const a = selectTarget([constraint('angle', 'output'), constraint('caption_text')]);
    const b = selectTarget([constraint('caption_text'), constraint('angle', 'output')]);
    strictEqual(a?.target, b?.target);
    strictEqual(a?.decidedBy.kind, b?.decidedBy.kind);
  });

  it('a list of only narrow constraints says no wider object is regenerated', () => {
    const selection = selectTarget([constraint('caption_text'), constraint('clip_remove', 'clip-2')]);
    strictEqual(selection?.target, 'platform-edl');
    ok(selection.rationale.includes('No wider object is regenerated'));
  });
});

describe('the constraint vocabulary is ordered narrowest-first', () => {
  it('keeps caption_text first and the brief-level kinds last', () => {
    // The ORDER of CONSTRAINT_KINDS is documentation that a reader relies on, and
    // `selectTarget` does not read it — so this asserts the two agree. A kind added
    // in the wrong place would mislead every future reader about how wide it is.
    strictEqual(CONSTRAINT_KINDS[0], 'caption_text');
    strictEqual(CONSTRAINT_KINDS[CONSTRAINT_KINDS.length - 1], 'cta');
    const widths = CONSTRAINT_KINDS.map((kind) => {
      const target = selectTarget([constraint(kind, 'output')])?.target;
      return target === 'platform-edl' ? 0 : target === 'master-story-plan' ? 1 : 2;
    });
    deepStrictEqual(
      widths,
      [...widths].sort((a, b) => a - b),
      'the declared order must be non-decreasing in target width, or the list lies about itself',
    );
  });
});

/** A minimal EDL, enough for `validateInterpretation` and `applyEdlConstraints`. */
const edlFor = (): PlatformEdlV1.PlatformEDL =>
  ({
    edlId: '01J9ED2B3C4D5E6F7G8H9K0M6T',
    envelope: {
      schemaVersion: '1.0.0',
      createdAt: '2026-07-01T00:00:00.000Z',
      createdBy: { kind: 'skill', skill: 'plan', skillVersion: '1.0.0' },
    },
    parentEdlId: null,
    aspectTreatment: { mode: 'letterbox', rationale: 'landscape source' },
    modelProvenance: {
      provider: 'anthropic',
      modelId: 'fixture-plan-model',
      promptTemplateId: 'plan-edl',
      promptTemplateVersion: '1.0.0',
    },
    clips: [
      {
        clipId: 'clip-1',
        order: 0,
        momentId: '01J9MN2B3C4D5E6F7G8H9K0M1A',
        assetId: '01KY2C5WZM38M23VRGB7H7WFV3',
        sourceRange: { assetId: '01KY2C5WZM38M23VRGB7H7WFV3', startTicks: 0, endTicks: 15360, timebase: { num: 1, den: 15360 } },
        narrativeFunction: 'promise',
        rationale: 'opening',
        caption: { kind: 'text', displayText: 'before' },
      },
    ],
  }) as unknown as PlatformEdlV1.PlatformEDL;

describe('a caption_text constraint on a non-text caption is refused for the RIGHT reason', () => {
  const captionEdl = (caption: Record<string, unknown>): PlatformEdlV1.PlatformEDL => {
    const edl = edlFor() as unknown as { clips: { caption: unknown }[] };
    return { ...edl, clips: [{ ...edl.clips[0], caption }] } as unknown as PlatformEdlV1.PlatformEDL;
  };

  const refusalFor = (caption: Record<string, unknown>): string => {
    const result = applyEdlConstraints(
      captionEdl(caption),
      [{ kind: 'caption_text', subject: 'clip-1', instruction: 'new words', sourceText: 'x' }],
      '01J9ED2B3C4D5E6F7G8H9K0MN3',
      {
        envelope: {
          schemaVersion: '1.0.0',
          createdAt: '2026-08-06T00:00:00.000Z',
          createdBy: { kind: 'skill', skill: 'revise', skillVersion: '1.0.0' },
        },
        modelProvenance: {
          provider: 'anthropic',
          modelId: 'fixture-revise-model',
          promptTemplateId: 'revise-interpret',
          promptTemplateVersion: '1.0.0',
        },
      },
    );
    strictEqual(result.applied.length, 0);
    return result.unapplied[0]?.reason ?? '';
  };

  it('names the D-37 quote-fidelity binding for a QUOTE caption', () => {
    // The message this replaced said a quote caption "carries no display text to
    // rewrite" — false: `QuoteCaption` requires `displayText` like `TextCaption`.
    // The real reason is that the text is bound to `verbatimSourceText`, so an
    // operator sent looking for a missing field was being sent to the wrong place.
    const reason = refusalFor({
      kind: 'quote',
      displayText: 'what they said',
      verbatimSourceText: 'what they actually said',
      speakerLabel: 'SPEAKER_00',
    });
    ok(reason.includes('D-37'), `must cite the gate that binds it: ${reason}`);
    ok(reason.includes('verbatimSourceText'));
    ok(!reason.includes('no display text'), 'the false reason must be gone');
    ok(reason.includes('cutdown plan'), 'and it names the command that CAN change the words');
  });

  it('still says "no caption" for a NONE caption, where that is true', () => {
    const reason = refusalFor({ kind: 'none' });
    ok(reason.includes('no caption'), reason);
    ok(!reason.includes('D-37'), 'a missing caption has nothing to do with quote fidelity');
  });
});

describe('the instruction cap (a caption_text instruction is written VERBATIM)', () => {
  const NOTE = 'the caption is too long';

  it('accepts an instruction at the cap', () => {
    const result = validateInterpretation(
      {
        constraints: [
          { kind: 'caption_text', subject: 'clip-1', instruction: 'x'.repeat(MAX_INSTRUCTION_LENGTH), sourceText: NOTE },
        ],
        unresolved: [],
      },
      NOTE,
      edlFor(),
    );
    strictEqual(result.kind, 'interpreted');
  });

  it('REJECTS one character over — an unbounded instruction is an unbounded caption', () => {
    const result = validateInterpretation(
      {
        constraints: [
          { kind: 'caption_text', subject: 'clip-1', instruction: 'x'.repeat(MAX_INSTRUCTION_LENGTH + 1), sourceText: NOTE },
        ],
        unresolved: [],
      },
      NOTE,
      edlFor(),
    );
    strictEqual(result.kind, 'invalid');
    if (result.kind === 'invalid') {
      ok(result.violations[0]?.problem.includes('VERBATIM'), 'the reason says why the cap exists');
    }
  });
});

describe('a revision mints its OWN envelope and provenance (REQ-113, PRD §10.6)', () => {
  it('does not inherit the parent plan call as its own', () => {
    // Spreading `...edl` carried the parent's envelope and `modelProvenance` onto the
    // child, so a revision claimed it was created by `plan` at the parent's timestamp —
    // and `package` copies `modelProvenance` straight into the delivered package.
    const parent = edlFor();
    const revised = applyEdlConstraints(
      parent,
      [{ kind: 'caption_text', subject: 'clip-1', instruction: 'after', sourceText: 'x' }],
      '01J9ED2B3C4D5E6F7G8H9K0MN2',
      {
        envelope: {
          schemaVersion: '1.0.0',
          createdAt: '2026-07-30T12:00:00.000Z',
          createdBy: { kind: 'skill', skill: 'revise', skillVersion: '1.0.0' },
        },
        modelProvenance: {
          provider: 'anthropic',
          modelId: 'fixture-revise-model',
          promptTemplateId: 'revise-interpret',
          promptTemplateVersion: '1.0.0',
        },
      },
    );

    strictEqual(revised.edl.parentEdlId, parent.edlId, 'REQ-113: the child links its parent');
    strictEqual(revised.edl.edlId, '01J9ED2B3C4D5E6F7G8H9K0MN2');
    strictEqual(
      (revised.edl.envelope.createdBy as { skill?: string }).skill,
      'revise',
      'the child was created by revise, not by plan',
    );
    ok(revised.edl.envelope.createdAt !== parent.envelope.createdAt, 'and not at the parent’s timestamp');
    strictEqual(revised.edl.modelProvenance.modelId, 'fixture-revise-model');
    strictEqual(revised.edl.modelProvenance.promptTemplateId, 'revise-interpret');
    // And the parent object is untouched — the caller writes a NEW file.
    strictEqual(parent.modelProvenance.modelId, 'fixture-plan-model');
    const parentCaption = parent.clips[0]?.caption;
    ok(parentCaption?.kind === 'text' && parentCaption.displayText === 'before', 'the parent still says what it said');
  });
});
