import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PlatformEdlV1 } from '@cutdown/contracts/generated';
import {
  buildCaptionPlan,
  CaptionError,
  detectProperNouns,
  formatAssTime,
  formatSrtTime,
  formatVttTime,
  normaliseCaptionText,
  renderAss,
  renderSrt,
  renderVtt,
  toAssColour,
  wrapCaptionText,
  type CaptionPlan,
  type CaptionStyle,
} from '../src/captions.js';
import type { PlannedClip } from '../src/timeline.js';

const FRAME_RATE = { num: 1, den: 30 };
const STYLE: CaptionStyle = {
  fontFamily: 'Inter SemiBold',
  fontSizePx: 49,
  primaryColourHex: '#FFFFFF',
  outlineColourHex: '#000000',
  outlinePx: 3,
  marginVerticalPx: 307,
  marginHorizontalPx: 130,
};
const RULES = { maxCharsPerLine: 18, maxLines: 2 };

const clip = (clipId: string, start: number, end: number): PlannedClip => ({
  clipId,
  assetId: '01KY2C5WZM38M23VRGB7H7WFV3',
  order: Number(clipId.split('-')[1]) - 1,
  mediaPath: 'C:/media.mp4',
  sourceStartTicks: 0,
  sourceEndTicks: 30720,
  sourceTimebase: { num: 1, den: 15360 },
  sourceStartSeconds: '0.000000000',
  sourceEndSeconds: '2.000000000',
  outputStartFrame: start,
  outputEndFrame: end,
});

const edlClip = (clipId: string, caption: PlatformEdlV1.ClipCaption): PlatformEdlV1.EdlClip =>
  ({
    clipId,
    order: Number(clipId.split('-')[1]) - 1,
    momentId: '01J9MN2B3C4D5E6F7G8H9K0M1A',
    assetId: '01KY2C5WZM38M23VRGB7H7WFV3',
    sourceRange: {
      assetId: '01KY2C5WZM38M23VRGB7H7WFV3',
      startTicks: 0,
      endTicks: 30720,
      timebase: { num: 1, den: 15360 },
    },
    narrativeFunction: 'promise',
    rationale: 'test',
    caption,
  }) as PlatformEdlV1.EdlClip;

function plan(captions: PlatformEdlV1.ClipCaption[]): CaptionPlan {
  return buildCaptionPlan({
    clips: captions.map((_, i) => clip(`clip-${String(i + 1)}`, i * 60, (i + 1) * 60)),
    edlClips: captions.map((caption, i) => edlClip(`clip-${String(i + 1)}`, caption)),
    frameRate: FRAME_RATE,
    canvas: { width: 720, height: 1280 },
    style: STYLE,
    rules: RULES,
  });
}

describe('wrapping', () => {
  it('wraps greedily at the line width', () => {
    deepStrictEqual(wrapCaptionText('one two three four five', 10), ['one two', 'three four', 'five']);
  });

  it('gives an over-long word its own line rather than splitting it', () => {
    deepStrictEqual(wrapCaptionText('go supercalifragilistic now', 10), ['go', 'supercalifragilistic', 'now']);
  });

  it('NEVER truncates past the line budget — the overflow is reported, not hidden', () => {
    const lines = wrapCaptionText('a b c d e f g h i j k l', 3);
    strictEqual(lines.join(' ').replace(/\s+/g, ' '), 'a b c d e f g h i j k l');
  });

  it('collapses every whitespace run so a newline cannot break SRT cue framing', () => {
    strictEqual(normaliseCaptionText('a\n\n b\tc\r\nd'), 'a b c d');
  });
});

describe('representability — refuse, never mangle', () => {
  it('rejects a backslash, which libass would silently swallow', () => {
    throws(() => plan([{ kind: 'text', displayText: '50\\50 chance' }]), (error: unknown) => {
      ok(error instanceof CaptionError);
      strictEqual(error.code, 'BACKSLASH_IN_CAPTION');
      return true;
    });
  });

  it('rejects a control character', () => {
    throws(
      () => plan([{ kind: 'text', displayText: `bell${String.fromCharCode(7)}here` }]),
      (error: unknown) => {
        ok(error instanceof CaptionError);
        strictEqual(error.code, 'CONTROL_CHAR_IN_CAPTION');
        return true;
      },
    );
  });

  it('escapes braces so an override block cannot be injected from caption text', () => {
    // No backslash here on purpose: a caption carrying one is refused outright
    // by the test above, so the brace escaping has to be provable on its own.
    const ass = renderAss(plan([{ kind: 'text', displayText: '{an8}hijack' }]));
    ok(ass.includes('\\{an8\\}hijack'), 'both braces must be escaped so libass renders them as text');
    ok(!/,,\{an8\}/.test(ass), 'an unescaped brace would open an override block');
  });

  it('rejects an empty caption rather than emitting a blank cue', () => {
    throws(() => plan([{ kind: 'text', displayText: '   ' }]), (error: unknown) => {
      ok(error instanceof CaptionError);
      strictEqual(error.code, 'EMPTY_CAPTION_TEXT');
      return true;
    });
  });
});

describe('verbatim and display stay separate', () => {
  it('renders displayText and carries verbatimSourceText untouched', () => {
    const built = plan([
      {
        kind: 'quote',
        displayText: 'the short version',
        verbatimSourceText: 'the short version of what was actually said',
        speakerLabel: 'SPEAKER_00',
      },
    ]);
    const cue = built.cues[0];
    ok(cue !== undefined);
    strictEqual(cue.displayText, 'the short version');
    strictEqual(cue.verbatimSourceText, 'the short version of what was actually said');
    strictEqual(cue.speakerLabel, 'SPEAKER_00');

    for (const rendered of [renderAss(built), renderSrt(built), renderVtt(built)]) {
      ok(rendered.includes('the short version'));
      ok(
        !rendered.includes('of what was actually said'),
        'the verbatim text is evidence for the quote gate and must never be rendered',
      );
    }
  });

  it('a `none` caption produces no cue at all', () => {
    strictEqual(plan([{ kind: 'none' }]).cues.length, 0);
  });
});

describe('review flags', () => {
  it('flags a capitalised token that does not start a sentence', () => {
    deepStrictEqual(detectProperNouns('we met Kaia at the shop. Sydney was warm.'), ['Kaia']);
  });

  it('does not flag the first word of a sentence', () => {
    deepStrictEqual(detectProperNouns('Sydney was warm. Rain came later.'), []);
  });

  it('flags a caption that needs more lines than the ruleset allows', () => {
    const built = plan([{ kind: 'text', displayText: 'one two three four five six seven eight nine ten' }]);
    ok(built.reviewFlags.some((f) => f.kind === 'exceeds_line_budget'));
  });

  it('carries a D-28 low-confidence mark into the review payload', () => {
    const built = buildCaptionPlan({
      clips: [clip('clip-1', 0, 60)],
      edlClips: [edlClip('clip-1', { kind: 'text', displayText: 'hello there' })],
      frameRate: FRAME_RATE,
      canvas: { width: 720, height: 1280 },
      style: STYLE,
      rules: RULES,
      marksByMomentId: new Map([['01J9MN2B3C4D5E6F7G8H9K0M1A', { lowConfidence: true, reason: 'ASR 0.41' }]]),
    });
    const flag = built.reviewFlags.find((f) => f.kind === 'low_confidence_asr');
    ok(flag !== undefined);
    strictEqual(flag.detail, 'ASR 0.41');
  });
});

describe('time formatting', () => {
  it('ASS uses centiseconds, its real resolution', () => {
    strictEqual(formatAssTime(3_723_450), '1:02:03.45');
  });
  it('SRT uses a comma and milliseconds', () => {
    strictEqual(formatSrtTime(3_723_450), '01:02:03,450');
  });
  it('WebVTT uses a dot and milliseconds', () => {
    strictEqual(formatVttTime(3_723_450), '01:02:03.450');
  });
  it('ASS colours are &HAABBGGRR, not RGB', () => {
    strictEqual(toAssColour('#E23B2E'), '&H002E3BE2');
  });
});

describe('the three files agree', () => {
  const built = plan([
    { kind: 'text', displayText: 'first caption' },
    { kind: 'text', displayText: 'second caption' },
  ]);

  it('emits the same number of cues in all three formats', () => {
    strictEqual(built.cues.length, 2);
    strictEqual((renderSrt(built).match(/-->/g) ?? []).length, 2);
    strictEqual((renderVtt(built).match(/-->/g) ?? []).length, 2);
    strictEqual((renderAss(built).match(/^Dialogue:/gm) ?? []).length, 2);
  });

  it('sets PlayRes to the real canvas so px values mean output pixels', () => {
    const ass = renderAss(built);
    ok(ass.includes('PlayResX: 720'));
    ok(ass.includes('PlayResY: 1280'));
  });

  it('writes LF only, so the caption files hash the same on every platform', () => {
    for (const rendered of [renderAss(built), renderSrt(built), renderVtt(built)]) {
      ok(!rendered.includes('\r'), 'a CRLF would make the content hash platform-dependent');
    }
  });

  it('escapes WebVTT markup characters', () => {
    const vtt = renderVtt(plan([{ kind: 'text', displayText: 'a < b & c' }]));
    ok(vtt.includes('a &lt; b &amp; c'));
  });

  it('starts WebVTT with its required signature', () => {
    ok(renderVtt(built).startsWith('WEBVTT\n\n'));
  });
});
