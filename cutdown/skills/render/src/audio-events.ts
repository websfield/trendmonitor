/**
 * `--audio-events` shape handling for the render skill (REQ-104).
 *
 * Two shapes are accepted, because two producers exist:
 *
 *  - `{ events: [{kind, startMs, endMs}] }` — already OUTPUT-relative, the shape
 *    `non_speech_cue_review` consumes directly. Documented for hand-authored or
 *    pre-projected inputs.
 *  - `{ audioEvents: [...] }` — the `index` skill's committed artefact, whose
 *    events are SOURCE-relative ticks in the sub-stage's own timebase (16 kHz for
 *    the VAD/PANNs track). These must be projected through the EDL's clips onto
 *    the output timeline before a cue-overlap comparison means anything: the
 *    Phase 6 proving run found the option dead end-to-end because the loader
 *    demanded the first shape while the pipeline only ever produces the second.
 *
 * Pure functions, no filesystem — the skill's `loadAudioEvents` owns the read and
 * wraps any thrown message in its structured error without echoing file content.
 */

export interface OutputSpanEvent {
  readonly kind: string;
  readonly startMs: number;
  readonly endMs: number;
}

interface Timebase {
  readonly num: number;
  readonly den: number;
}

export interface IndexAudioEvent {
  readonly kind: string;
  readonly startTicks: number;
  readonly endTicks: number;
  readonly timebase: Timebase;
}

/** One EDL clip's source range, in EDL order — the output timeline is their concatenation. */
export interface ClipSourceSpan {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly timebase: Timebase;
}

/**
 * Kinds with nothing for a caption reviewer to add: speech is what the captions
 * already carry, and silence has no content to caption. Everything else (music,
 * sfx, laughter, applause, energy changes…) is a REQ-104 "meaningful non-speech
 * moment" and is surfaced.
 */
const NON_MEANINGFUL_KINDS = new Set(['speech', 'silence']);

function assertFiniteNonNegative(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${what} must be a non-negative finite number.`);
  }
  return value;
}

function toSeconds(ticks: number, timebase: Timebase): number {
  return (ticks * timebase.num) / timebase.den;
}

function assertTimebase(value: unknown, what: string): Timebase {
  const tb = value as Partial<Timebase> | null;
  if (
    tb === null ||
    typeof tb !== 'object' ||
    typeof tb.num !== 'number' ||
    typeof tb.den !== 'number' ||
    !Number.isInteger(tb.num) ||
    !Number.isInteger(tb.den) ||
    tb.num < 1 ||
    tb.den < 1
  ) {
    throw new Error(`${what} must carry a positive integer {num, den} timebase.`);
  }
  return { num: tb.num, den: tb.den };
}

/** Validate one raw index-artefact event record. Throws naming the entry, never echoing it. */
export function parseIndexAudioEvent(record: unknown, index: number): IndexAudioEvent {
  const what = `audioEvents[${String(index)}]`;
  const r = record as Partial<IndexAudioEvent> | null;
  if (r === null || typeof r !== 'object') throw new Error(`${what} is not an object.`);
  if (typeof r.kind !== 'string' || r.kind.length === 0) throw new Error(`${what}.kind must be a non-empty string.`);
  const timebase = assertTimebase(r.timebase, `${what}.timebase`);
  const startTicks = assertFiniteNonNegative(r.startTicks, `${what}.startTicks`);
  const endTicks = assertFiniteNonNegative(r.endTicks, `${what}.endTicks`);
  if (endTicks < startTicks) throw new Error(`${what} ends before it starts.`);
  return { kind: r.kind, startTicks, endTicks, timebase };
}

/**
 * Project source-relative index events onto the output timeline defined by the
 * EDL's clips (in clip order). An event overlapping several clips yields one
 * span per clip — the output timeline is a concatenation, so a single source
 * event genuinely appears as separate output spans. Non-meaningful kinds
 * (speech, silence) are dropped before projection.
 *
 * Millisecond floats are sufficient here: the consumer is a cue-overlap review
 * prompt, not a sync measurement, and sub-millisecond error cannot flip an
 * overlap that matters at reading speed.
 */
export function projectIndexAudioEvents(
  events: readonly IndexAudioEvent[],
  clips: readonly ClipSourceSpan[],
): OutputSpanEvent[] {
  const spans: OutputSpanEvent[] = [];
  let outputOffsetSec = 0;
  for (const clip of clips) {
    const clipStartSec = toSeconds(clip.startTicks, clip.timebase);
    const clipEndSec = toSeconds(clip.endTicks, clip.timebase);
    const clipLenSec = clipEndSec - clipStartSec;
    for (const event of events) {
      if (NON_MEANINGFUL_KINDS.has(event.kind)) continue;
      const eventStartSec = toSeconds(event.startTicks, event.timebase);
      const eventEndSec = toSeconds(event.endTicks, event.timebase);
      const overlapStart = Math.max(eventStartSec, clipStartSec);
      const overlapEnd = Math.min(eventEndSec, clipEndSec);
      if (overlapEnd <= overlapStart) continue;
      spans.push({
        kind: event.kind,
        startMs: (outputOffsetSec + (overlapStart - clipStartSec)) * 1000,
        endMs: (outputOffsetSec + (overlapEnd - clipStartSec)) * 1000,
      });
    }
    outputOffsetSec += clipLenSec;
  }
  return spans.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

/**
 * Interpret a parsed `--audio-events` document against the EDL's clips.
 * Exactly one of the two documented shapes must be present — ENFORCED: a file
 * carrying both keys, or either key with a non-array value, is refused outright
 * rather than half-read (a gate input silently losing half its content is a gate
 * under-checking). A file carrying neither is invalid, and a half-valid entry
 * fails the whole load — the same rule as the loader's absent-vs-unreadable split.
 *
 * Deliberate asymmetry: the `{events}` pass-through is taken LITERALLY, kinds
 * included — it is a hand-authored, already-output-relative document, and second-
 * guessing its author would make "supply exactly what you mean" impossible. Only
 * the `{audioEvents}` index-artefact path filters non-meaningful kinds, because
 * that file is machine-produced for a different purpose.
 */
export function interpretAudioEventsDocument(
  parsed: unknown,
  clips: readonly ClipSourceSpan[],
): OutputSpanEvent[] {
  const doc = parsed as { events?: unknown; audioEvents?: unknown } | null;
  if (doc === null || typeof doc !== 'object') {
    throw new Error('the document is not a JSON object.');
  }
  if ('events' in doc && 'audioEvents' in doc) {
    throw new Error('it carries BOTH `events` and `audioEvents`; supply exactly one shape.');
  }
  if ('events' in doc && !Array.isArray(doc.events)) {
    throw new Error('its `events` key is not an array.');
  }
  if ('audioEvents' in doc && !Array.isArray(doc.audioEvents)) {
    throw new Error('its `audioEvents` key is not an array.');
  }
  if (Array.isArray(doc.events)) {
    return doc.events.map((record, i) => {
      const what = `events[${String(i)}]`;
      const r = record as Partial<OutputSpanEvent> | null;
      if (r === null || typeof r !== 'object') throw new Error(`${what} is not an object.`);
      if (typeof r.kind !== 'string' || r.kind.length === 0) throw new Error(`${what}.kind must be a non-empty string.`);
      const startMs = assertFiniteNonNegative(r.startMs, `${what}.startMs`);
      const endMs = assertFiniteNonNegative(r.endMs, `${what}.endMs`);
      if (endMs < startMs) throw new Error(`${what} ends before it starts.`);
      return { kind: r.kind, startMs, endMs };
    });
  }
  if (Array.isArray(doc.audioEvents)) {
    const events = doc.audioEvents.map((record, i) => parseIndexAudioEvent(record, i));
    return projectIndexAudioEvents(events, clips);
  }
  throw new Error('it carries neither an `events` array (output-relative) nor an `audioEvents` array (an index artefact).');
}
