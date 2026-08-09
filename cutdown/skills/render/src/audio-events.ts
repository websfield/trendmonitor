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

/**
 * One EDL clip's source range, in EDL order — the output timeline is their concatenation.
 *
 * `assetId` is load-bearing, not decorative. A source index is per-asset (its
 * `assetId` is document-level), so the events in one `--audio-events` file all
 * belong to ONE asset — while a multi-asset EDL's clips do not. Projecting
 * without it maps asset A's events onto asset B's ranges and hands the
 * `non_speech_cue_review` gate confident, wrong spans.
 */
export interface ClipSourceSpan {
  readonly assetId: string;
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
 * `eventsAssetId` names the asset the events describe (the source index's
 * document-level `assetId`). Only clips drawn from THAT asset receive them;
 * every clip still advances the output offset, because the output timeline is
 * the concatenation of all of them regardless of which asset each came from.
 * Without this filter a multi-asset EDL silently mapped one asset's events onto
 * another's ranges — D-51's remaining half, found by the first real-footage run
 * and recorded there as a deliberate `--audio-events` omission.
 *
 * Millisecond floats are sufficient here: the consumer is a cue-overlap review
 * prompt, not a sync measurement, and sub-millisecond error cannot flip an
 * overlap that matters at reading speed.
 */
export function projectIndexAudioEvents(
  events: readonly IndexAudioEvent[],
  clips: readonly ClipSourceSpan[],
  eventsAssetId: string,
): OutputSpanEvent[] {
  const spans: OutputSpanEvent[] = [];
  let outputOffsetSec = 0;
  for (const clip of clips) {
    const clipStartSec = toSeconds(clip.startTicks, clip.timebase);
    const clipEndSec = toSeconds(clip.endTicks, clip.timebase);
    const clipLenSec = clipEndSec - clipStartSec;
    if (clip.assetId !== eventsAssetId) {
      // Not this asset's clip. It still occupies output time, so the offset must
      // advance — skipping the advance would slide every later span earlier.
      outputOffsetSec += clipLenSec;
      continue;
    }
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
 * Decide which asset an `{audioEvents}` document describes.
 *
 * A source index carries its `assetId` at the document level, so the honest
 * answer is normally just "that one". The refusals exist because guessing is how
 * the original defect produced a confidently wrong gate report:
 *
 *  - **A present `assetId` that is not a non-empty string** — refused. Guarding
 *    only `typeof declared === 'string'` and letting everything else fall through
 *    would send a malformed declaration into the no-`assetId` path below, where a
 *    single-asset EDL silently accepts it and a multi-asset EDL reports "carries
 *    no document-level `assetId`" about a document that carries one. That is this
 *    project's signature defect — guard the class, not the field — so the shape
 *    is checked before the value is used.
 *  - **No `assetId`, and the EDL draws on more than one asset** — unanswerable.
 *    Refusing beats projecting onto everything (the old behaviour, which mapped
 *    one asset's events onto another's ranges).
 *  - **An `assetId` naming no clip in this EDL** — the caller passed the wrong
 *    file. Rendering with zero events would let `non_speech_cue_review` pass
 *    vacuously, which is precisely the failure this fix exists to remove.
 *
 * **The single-asset exemption trusts the caller, and that is a real residual
 * limit — stated rather than papered over.** "There is exactly one asset it could
 * mean" is a property of the *EDL*, not of the *document*: a document describes
 * whichever asset it was indexed from, and the job may hold many. So handing a
 * single-asset EDL the wrong asset's events still projects silently. The
 * exemption is kept anyway because the artefact that would otherwise break is
 * real and common — `index`'s per-sub-stage `audio_events-*.json` checkpoints
 * carry no `assetId` at all (verified on both committed golden-set indexes) — and
 * refusing them would make the documented option unusable for the single-asset
 * case, which is the D-51 failure in the opposite direction. The multi-asset case,
 * which is where a wrong mapping is silent AND likely, is refused. A test pins
 * this exemption so it is a decision on the record rather than an oversight.
 *
 * Every message names the way forward, and none asks anyone to delete evidence.
 */
function resolveEventsAssetId(declared: unknown, clips: readonly ClipSourceSpan[]): string {
  const edlAssetIds = [...new Set(clips.map((clip) => clip.assetId))];
  if (declared !== undefined && declared !== null && (typeof declared !== 'string' || declared.length === 0)) {
    throw new Error(
      `its \`assetId\` is present but is not a non-empty string (${JSON.stringify(declared)}). ` +
        'Supply the `index` skill\'s source-index artefact, whose `assetId` is a document-level string.',
    );
  }
  if (typeof declared === 'string' && declared.length > 0) {
    if (!edlAssetIds.includes(declared)) {
      throw new Error(
        `its \`assetId\` (${declared}) names no clip in this EDL, whose clips draw on ${String(edlAssetIds.length)} asset(s): ` +
          `${edlAssetIds.join(', ')}. Supply the source index for one of those assets.`,
      );
    }
    return declared;
  }
  if (edlAssetIds.length === 1) return edlAssetIds[0] as string;
  throw new Error(
    'it carries an `audioEvents` array but no document-level `assetId`, and this EDL draws on ' +
      `${String(edlAssetIds.length)} assets (${edlAssetIds.join(', ')}). ` +
      'Source-relative events cannot be placed without knowing which asset they describe. ' +
      'Supply the `index` skill\'s source-index artefact, which carries `assetId`.',
  );
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
  const doc = parsed as { events?: unknown; audioEvents?: unknown; assetId?: unknown } | null;
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
    return projectIndexAudioEvents(events, clips, resolveEventsAssetId(doc.assetId, clips));
  }
  throw new Error('it carries neither an `events` array (output-relative) nor an `audioEvents` array (an index artefact).');
}
