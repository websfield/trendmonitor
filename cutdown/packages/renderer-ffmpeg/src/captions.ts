import type { PlatformEdlV1 } from '@cutdown/contracts/generated';
import { frameToMilliseconds, type PlannedClip, type Timebase } from './timeline.js';

/**
 * The caption pipeline (PRD REQ-083/084/104, Phase 4 task 5).
 *
 * One caption plan produces **three** files from one source of truth: an ASS for
 * libass burn-in, and SRT + WebVTT sidecars. REQ-104 makes the sidecar
 * non-optional — a burned-in caption is not accessible text, and a viewer using
 * a screen reader or a platform's own caption UI gets nothing from pixels.
 *
 * ## Verbatim and display are never merged
 *
 * `EdlClip.caption` is a tagged union in which a `quote` carries BOTH the shown
 * `displayText` and the `verbatimSourceText` it was drawn from. This module
 * renders `displayText` and carries `verbatimSourceText` through untouched into
 * the review payload. It never falls back from one to the other: a caption that
 * silently displayed the verbatim text would defeat the shortening the editor
 * chose, and one that shipped `displayText` as the quotation record would launder
 * the D-37 quote gate's evidence.
 *
 * ## Why unrepresentable text is refused rather than cleaned
 *
 * ASS gives `{` and `}` override-block meaning and treats `\` as an escape
 * introducer. `\{` and `\}` are honoured by libass, so braces round-trip. A lone
 * backslash does not: libass consumes it and emits the following character, so a
 * caption reading `50\50` would render as `5050` — a *changed caption*, shipped
 * silently, in the one artefact whose whole job is to state what was said. This
 * module therefore refuses it, in the same spirit as
 * `escapeFiltergraphText()`'s control-character rejection.
 */

export interface CaptionStyle {
  /** libass family name — the value that goes in the ASS `Fontname` field. */
  readonly fontFamily: string;
  readonly fontSizePx: number;
  /** `#RRGGBB`. */
  readonly primaryColourHex: string;
  readonly outlineColourHex: string;
  readonly outlinePx: number;
  readonly marginVerticalPx: number;
  readonly marginHorizontalPx: number;
}

export interface CaptionLayoutRules {
  readonly maxCharsPerLine: number;
  readonly maxLines: number;
}

export interface CaptionCue {
  /** 1-based, in play order. Referenced by QA findings and waivers. */
  readonly index: number;
  readonly clipId: string;
  readonly kind: 'text' | 'quote';
  /** Inclusive start frame on the output timeline. */
  readonly startFrame: number;
  /** Exclusive end frame on the output timeline. */
  readonly endFrame: number;
  /** The shown text, whitespace-normalised, unwrapped. */
  readonly displayText: string;
  /** The shown text after wrapping. May exceed `maxLines` — QA reports that; this module never truncates. */
  readonly lines: readonly string[];
  /** Present only for a `quote` caption. Never rendered; carried for review. */
  readonly verbatimSourceText: string | null;
  readonly speakerLabel: string | null;
}

export type CaptionReviewFlagKind =
  /** The ASR confidence behind this caption's Moment was below the D-28 threshold. */
  | 'low_confidence_asr'
  /** A capitalised token that is probably a name — REQ-104's "name flag". */
  | 'proper_noun'
  /** The wrapped caption needs more lines than the ruleset allows. */
  | 'exceeds_line_budget';

export interface CaptionReviewFlag {
  readonly cueIndex: number;
  readonly kind: CaptionReviewFlagKind;
  readonly detail: string;
}

export interface CaptionPlan {
  readonly cues: readonly CaptionCue[];
  readonly reviewFlags: readonly CaptionReviewFlag[];
  readonly frameRate: Timebase;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly style: CaptionStyle;
  readonly rules: CaptionLayoutRules;
}

/** Per-Moment marks the index produced that a reviewer needs to see (D-28). */
export interface MomentCaptionMarks {
  readonly lowConfidence: boolean;
  readonly reason?: string;
}

export class CaptionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CaptionError';
    this.code = code;
  }
}

/**
 * Checked AFTER whitespace normalisation, so tab/newline/CR are already gone
 * and the whole C0 range can be rejected without a carve-out.
 */
// eslint-disable-next-line no-control-regex
const C0_CONTROL = /[\u0000-\u001F\u007F]/u;

/** Collapse every whitespace run to a single space and trim. */
export function normaliseCaptionText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/**
 * Greedy word wrap at `maxCharsPerLine`.
 *
 * A word longer than the limit gets its own line rather than being hyphenated or
 * split: breaking a word changes what is read, and a URL or a product name split
 * across lines is worse than an over-long line the QA report will flag.
 *
 * Never truncates and never drops a line, even past `maxLines`. Silently
 * dropping the tail would produce a caption that reads as complete while
 * omitting words — the failure mode captions exist to prevent.
 */
export function wrapCaptionText(text: string, maxCharsPerLine: number): string[] {
  if (maxCharsPerLine < 1) throw new CaptionError('INVALID_LINE_WIDTH', 'maxCharsPerLine must be >= 1.');
  const words = normaliseCaptionText(text).split(' ').filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Capitalised tokens that are probably names (REQ-104 name flags).
 *
 * Deliberately a *flag*, never a correction. The rule — a capitalised token that
 * is not the first word of a sentence — over-reports (it catches "I", brand
 * styling, and the start of a quoted clause) and that is the right direction to
 * be wrong in: a reviewer dismisses a false flag in a second, while a
 * misspelled client name reaches the client.
 */
export function detectProperNouns(text: string): string[] {
  const tokens = normaliseCaptionText(text).split(' ');
  const found: string[] = [];
  let startsSentence = true;
  for (const raw of tokens) {
    const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (word.length > 1 && !startsSentence && /^\p{Lu}/u.test(word) && !found.includes(word)) {
      found.push(word);
    }
    startsSentence = /[.!?]["')\]]?$/u.test(raw);
  }
  return found;
}

export interface BuildCaptionPlanInput {
  readonly clips: readonly PlannedClip[];
  readonly edlClips: readonly PlatformEdlV1.EdlClip[];
  readonly frameRate: Timebase;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly style: CaptionStyle;
  readonly rules: CaptionLayoutRules;
  /** D-28 marks keyed by `momentId`; a clip whose Moment is absent contributes no flag. */
  readonly marksByMomentId?: ReadonlyMap<string, MomentCaptionMarks>;
}

/**
 * Build the caption plan for one render.
 *
 * A cue spans exactly its clip. Phase 0 does not re-time captions inside a clip
 * (word-level karaoke timing is Phase 1); the honest consequence is that a long
 * clip yields a long cue, which the readability check then measures in
 * characters-per-second and reports if it is unreadable. Producing a
 * plausible-looking sub-timing we cannot justify from the transcript would be
 * worse than a reported violation.
 */
export function buildCaptionPlan(input: BuildCaptionPlanInput): CaptionPlan {
  const byClipId = new Map(input.edlClips.map((clip) => [clip.clipId, clip]));
  const cues: CaptionCue[] = [];
  const reviewFlags: CaptionReviewFlag[] = [];

  for (const planned of input.clips) {
    const edlClip = byClipId.get(planned.clipId);
    if (edlClip === undefined) {
      throw new CaptionError(
        'CLIP_NOT_IN_EDL',
        `Planned clip ${planned.clipId} has no matching EDL clip; the caption plan cannot be built from an incomplete timeline.`,
      );
    }
    const caption = edlClip.caption;
    if (caption.kind === 'none') continue;

    const displayText = normaliseCaptionText(caption.displayText);
    if (displayText.length === 0) {
      throw new CaptionError(
        'EMPTY_CAPTION_TEXT',
        `Clip ${planned.clipId} declares a ${caption.kind} caption whose display text is empty after whitespace normalisation.`,
      );
    }
    assertRepresentable(displayText, planned.clipId);

    const index = cues.length + 1;
    const lines = wrapCaptionText(displayText, input.rules.maxCharsPerLine);
    cues.push({
      index,
      clipId: planned.clipId,
      kind: caption.kind,
      startFrame: planned.outputStartFrame,
      endFrame: planned.outputEndFrame,
      displayText,
      lines,
      verbatimSourceText: caption.kind === 'quote' ? caption.verbatimSourceText : null,
      speakerLabel: caption.kind === 'quote' ? caption.speakerLabel : null,
    });

    if (lines.length > input.rules.maxLines) {
      reviewFlags.push({
        cueIndex: index,
        kind: 'exceeds_line_budget',
        detail: `Wraps to ${String(lines.length)} lines at ${String(input.rules.maxCharsPerLine)} chars; the ruleset allows ${String(input.rules.maxLines)}.`,
      });
    }
    for (const name of detectProperNouns(displayText)) {
      reviewFlags.push({
        cueIndex: index,
        kind: 'proper_noun',
        detail: `Check the spelling of "${name}".`,
      });
    }
    const marks = input.marksByMomentId?.get(edlClip.momentId);
    if (marks?.lowConfidence === true) {
      reviewFlags.push({
        cueIndex: index,
        kind: 'low_confidence_asr',
        detail:
          marks.reason ??
          'The transcript behind this caption is marked low-confidence (decisions.md D-28); verify the wording against the source.',
      });
    }
  }

  return {
    cues,
    reviewFlags,
    frameRate: input.frameRate,
    canvas: input.canvas,
    style: input.style,
    rules: input.rules,
  };
}

function assertRepresentable(text: string, clipId: string): void {
  const control = C0_CONTROL.exec(text);
  if (control !== null) {
    const codePoint = control[0].codePointAt(0) ?? 0;
    throw new CaptionError(
      'CONTROL_CHAR_IN_CAPTION',
      `Caption for clip ${clipId} contains control character U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}, which no caption format can represent.`,
    );
  }
  if (text.includes('\\')) {
    throw new CaptionError(
      'BACKSLASH_IN_CAPTION',
      `Caption for clip ${clipId} contains a backslash. libass consumes a lone backslash and renders the following character, so the burned-in caption would differ from the text under review. Remove or replace it in the EDL rather than letting the render alter the wording.`,
    );
  }
}

// ---------------------------------------------------------------------------
// ASS (burn-in)
// ---------------------------------------------------------------------------

/** ASS colours are `&HAABBGGRR` — alpha first, then BGR, not RGB. */
export function toAssColour(hex: string, alpha = 0): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (match === null) {
    throw new CaptionError('INVALID_COLOUR', `Colour must be #RRGGBB; received "${hex}".`);
  }
  const rgb = match[1] as string;
  const r = rgb.slice(0, 2);
  const g = rgb.slice(2, 4);
  const b = rgb.slice(4, 6);
  const a = alpha.toString(16).padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

/** ASS time is `H:MM:SS.cc` — CENTIseconds, the format's real resolution. */
export function formatAssTime(milliseconds: number): string {
  const totalCs = Math.round(milliseconds / 10);
  const cs = totalCs % 100;
  const totalSeconds = (totalCs - cs) / 100;
  const s = totalSeconds % 60;
  const totalMinutes = (totalSeconds - s) / 60;
  const m = totalMinutes % 60;
  const h = (totalMinutes - m) / 60;
  return `${String(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const escapeAss = (text: string): string => text.replace(/\{/g, '\\{').replace(/\}/g, '\\}');

/**
 * The ASS file libass burns in.
 *
 * `PlayResX`/`PlayResY` are set to the actual canvas so every px value in the
 * style means output pixels. Without them libass assumes 384×288 and scales
 * everything, which is how a 48 px caption silently becomes 160 px on a 1080-wide
 * render — and why the safe-zone check would then measure a box that is not the
 * one on screen.
 */
export function renderAss(plan: CaptionPlan): string {
  const { style, canvas } = plan;
  const header = [
    '[Script Info]',
    '; Generated by @cutdown/renderer-ffmpeg. Do not edit by hand — regenerate from the EDL.',
    'ScriptType: v4.00+',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    `PlayResX: ${String(canvas.width)}`,
    `PlayResY: ${String(canvas.height)}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    [
      'Style: Caption',
      style.fontFamily,
      String(style.fontSizePx),
      toAssColour(style.primaryColourHex),
      toAssColour(style.primaryColourHex),
      toAssColour(style.outlineColourHex),
      toAssColour(style.outlineColourHex),
      '0',
      '0',
      '0',
      '0',
      '100',
      '100',
      '0',
      '0',
      '1',
      String(style.outlinePx),
      '0',
      // 2 = bottom-centre. Captions sit above the platform's own bottom-edge UI.
      '2',
      String(style.marginHorizontalPx),
      String(style.marginHorizontalPx),
      String(style.marginVerticalPx),
      '1',
    ].join(','),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events = plan.cues.map((cue) => {
    const start = formatAssTime(frameToMilliseconds(cue.startFrame, plan.frameRate));
    const end = formatAssTime(frameToMilliseconds(cue.endFrame, plan.frameRate));
    const text = cue.lines.map(escapeAss).join('\\N');
    return `Dialogue: 0,${start},${end},Caption,,0,0,0,,${text}`;
  });

  // A trailing newline, and `\n` not `\r\n`: the ASS file is an input to a
  // content hash, so its bytes must not depend on the platform writing it.
  return `${[...header, ...events].join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// SRT and WebVTT sidecars
// ---------------------------------------------------------------------------

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

function splitMilliseconds(milliseconds: number): {
  h: number;
  m: number;
  s: number;
  ms: number;
} {
  const ms = milliseconds % 1000;
  const totalSeconds = (milliseconds - ms) / 1000;
  const s = totalSeconds % 60;
  const totalMinutes = (totalSeconds - s) / 60;
  const m = totalMinutes % 60;
  const h = (totalMinutes - m) / 60;
  return { h, m, s, ms };
}

export function formatSrtTime(milliseconds: number): string {
  const { h, m, s, ms } = splitMilliseconds(milliseconds);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

export function formatVttTime(milliseconds: number): string {
  const { h, m, s, ms } = splitMilliseconds(milliseconds);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

export function renderSrt(plan: CaptionPlan): string {
  const blocks = plan.cues.map((cue) => {
    const start = formatSrtTime(frameToMilliseconds(cue.startFrame, plan.frameRate));
    const end = formatSrtTime(frameToMilliseconds(cue.endFrame, plan.frameRate));
    return `${String(cue.index)}\n${start} --> ${end}\n${cue.lines.join('\n')}\n`;
  });
  return blocks.join('\n');
}

/** WebVTT is served as HTML-ish text; `&`, `<` and `>` are markup there. */
const escapeVtt = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderVtt(plan: CaptionPlan): string {
  const blocks = plan.cues.map((cue) => {
    const start = formatVttTime(frameToMilliseconds(cue.startFrame, plan.frameRate));
    const end = formatVttTime(frameToMilliseconds(cue.endFrame, plan.frameRate));
    return `${String(cue.index)}\n${start} --> ${end}\n${cue.lines.map(escapeVtt).join('\n')}\n`;
  });
  return `WEBVTT\n\n${blocks.join('\n')}`;
}
