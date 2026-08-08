import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  interpretAudioEventsDocument,
  parseIndexAudioEvent,
  projectIndexAudioEvents,
  type ClipSourceSpan,
} from '../src/audio-events.js';

// The container timebase the EDL clips carry (1/15360) deliberately differs from
// the audio track's (1/16000): the Phase 2 timebase lesson is that comparing the
// two raw is a silent misplacement, so these tests cross them on purpose.
const VIDEO_TB = { num: 1, den: 15360 };
const AUDIO_TB = { num: 1, den: 16000 };

/** Two clips: source 0–2 s and source 10–13 s → output 0–2 s and 2–5 s. */
const CLIPS: ClipSourceSpan[] = [
  { startTicks: 0, endTicks: 2 * 15360, timebase: VIDEO_TB },
  { startTicks: 10 * 15360, endTicks: 13 * 15360, timebase: VIDEO_TB },
];

test('index artefact: a music event inside clip 2 lands output-relative', () => {
  // Source 11–12 s, i.e. 1 s into clip 2, which starts at output 2 s.
  const spans = interpretAudioEventsDocument(
    { audioEvents: [{ kind: 'music', startTicks: 11 * 16000, endTicks: 12 * 16000, timebase: AUDIO_TB }] },
    CLIPS,
  );
  assert.equal(spans.length, 1);
  assert.equal(spans[0]?.kind, 'music');
  assert.ok(Math.abs((spans[0]?.startMs ?? 0) - 3000) < 1, `startMs ${String(spans[0]?.startMs)} ≠ 3000`);
  assert.ok(Math.abs((spans[0]?.endMs ?? 0) - 4000) < 1, `endMs ${String(spans[0]?.endMs)} ≠ 4000`);
});

test('index artefact: speech and silence are dropped, not projected', () => {
  const spans = interpretAudioEventsDocument(
    {
      audioEvents: [
        { kind: 'speech', startTicks: 0, endTicks: 16000, timebase: AUDIO_TB },
        { kind: 'silence', startTicks: 16000, endTicks: 32000, timebase: AUDIO_TB },
      ],
    },
    CLIPS,
  );
  assert.deepEqual(spans, []);
});

test('index artefact: an event outside every clip yields nothing', () => {
  const spans = interpretAudioEventsDocument(
    { audioEvents: [{ kind: 'sfx', startTicks: 5 * 16000, endTicks: 6 * 16000, timebase: AUDIO_TB }] },
    CLIPS,
  );
  assert.deepEqual(spans, []);
});

test('index artefact: an event spanning both clips splits into one span per clip', () => {
  // Source 1–11 s: overlaps clip 1 at 1–2 s (output 1–2 s) and clip 2 at 10–11 s (output 2–3 s).
  const spans = interpretAudioEventsDocument(
    { audioEvents: [{ kind: 'applause', startTicks: 1 * 16000, endTicks: 11 * 16000, timebase: AUDIO_TB }] },
    CLIPS,
  );
  assert.equal(spans.length, 2);
  assert.ok(Math.abs((spans[0]?.startMs ?? 0) - 1000) < 1);
  assert.ok(Math.abs((spans[0]?.endMs ?? 0) - 2000) < 1);
  assert.ok(Math.abs((spans[1]?.startMs ?? 0) - 2000) < 1);
  assert.ok(Math.abs((spans[1]?.endMs ?? 0) - 3000) < 1);
});

test('output-relative {events} shape passes through unchanged', () => {
  const spans = interpretAudioEventsDocument(
    { events: [{ kind: 'music', startMs: 250, endMs: 1250 }] },
    CLIPS,
  );
  assert.deepEqual(spans, [{ kind: 'music', startMs: 250, endMs: 1250 }]);
});

test('a document with neither shape is rejected, naming both accepted shapes', () => {
  assert.throws(
    () => interpretAudioEventsDocument({ something: [] }, CLIPS),
    /neither an `events` array .* nor an `audioEvents` array/,
  );
});

test('a document carrying BOTH shapes is refused, never half-read', () => {
  // Silently preferring one key would drop the other half of a supplied gate
  // input — the exclusivity the docstring claims is enforced, not assumed.
  assert.throws(
    () =>
      interpretAudioEventsDocument(
        {
          events: [{ kind: 'music', startMs: 0, endMs: 100 }],
          audioEvents: [{ kind: 'sfx', startTicks: 0, endTicks: 16000, timebase: AUDIO_TB }],
        },
        CLIPS,
      ),
    /BOTH `events` and `audioEvents`/,
  );
});

test('a non-array value under either key is refused, even beside nothing else', () => {
  assert.throws(() => interpretAudioEventsDocument({ events: 'nope' }, CLIPS), /`events` key is not an array/);
  assert.throws(
    () => interpretAudioEventsDocument({ audioEvents: { kind: 'music' } }, CLIPS),
    /`audioEvents` key is not an array/,
  );
});

test('empty arrays yield an empty list — the check RUNS clean rather than skipping', () => {
  // [] is not null: null means "not supplied" (check skipped with a reason);
  // [] means "supplied, and nothing in it" (check ran and found nothing).
  assert.deepEqual(interpretAudioEventsDocument({ events: [] }, CLIPS), []);
  assert.deepEqual(interpretAudioEventsDocument({ audioEvents: [] }, CLIPS), []);
});

test('a half-valid index entry fails the whole load, citing the entry index and field', () => {
  assert.throws(
    () =>
      interpretAudioEventsDocument(
        { audioEvents: [{ kind: 'music', startTicks: 0, endTicks: 16000, timebase: { num: 1, den: 0 } }] },
        CLIPS,
      ),
    /audioEvents\[0\]\.timebase/,
  );
  assert.throws(
    () => interpretAudioEventsDocument({ events: [{ kind: 'music', startMs: 100, endMs: 50 }] }, CLIPS),
    /events\[0\] ends before it starts/,
  );
});

test('parseIndexAudioEvent refuses an event that ends before it starts', () => {
  assert.throws(
    () => parseIndexAudioEvent({ kind: 'sfx', startTicks: 200, endTicks: 100, timebase: AUDIO_TB }, 3),
    /audioEvents\[3\] ends before it starts/,
  );
});

test('projection output is sorted by start even when clips see events out of order', () => {
  const spans = projectIndexAudioEvents(
    [
      { kind: 'sfx', startTicks: 11 * 16000, endTicks: 12 * 16000, timebase: AUDIO_TB },
      { kind: 'music', startTicks: 0, endTicks: 16000, timebase: AUDIO_TB },
    ],
    CLIPS,
  );
  assert.equal(spans.length, 2);
  assert.equal(spans[0]?.kind, 'music');
  assert.equal(spans[1]?.kind, 'sfx');
});
