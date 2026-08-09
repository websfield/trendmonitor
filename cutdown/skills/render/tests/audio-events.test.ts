import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  interpretAudioEventsDocument,
  parseIndexAudioEvent,
  projectIndexAudioEvents,
  type ClipSourceSpan,
} from '../src/audio-events.js';

/** `cutdown/` — four levels up from `skills/render/dist/tests/`. */
const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const GOLDEN_INDEX_DIR = join(WORKSPACE_ROOT, 'data', 'golden-sets', 'e2e', 'job', 'index');

function readGoldenSourceIndex(name: string): { assetId: string; audioEvents: unknown[] } {
  return JSON.parse(readFileSync(join(GOLDEN_INDEX_DIR, name), 'utf8')) as {
    assetId: string;
    audioEvents: unknown[];
  };
}

// The container timebase the EDL clips carry (1/15360) deliberately differs from
// the audio track's (1/16000): the Phase 2 timebase lesson is that comparing the
// two raw is a silent misplacement, so these tests cross them on purpose.
const VIDEO_TB = { num: 1, den: 15360 };
const AUDIO_TB = { num: 1, den: 16000 };

const ASSET_A = '01KZ8AAAAAAAAAAAAAAAAAAAAA';
const ASSET_B = '01KZ8BBBBBBBBBBBBBBBBBBBBB';

/**
 * Two clips from ONE asset: source 0–2 s and source 10–13 s → output 0–2 s and 2–5 s.
 * Single-asset on purpose — these cases predate the multi-asset filter and must keep
 * passing without an `assetId` in the document, which is the compatibility promise
 * `resolveEventsAssetId` makes to every existing single-asset caller.
 */
const CLIPS: ClipSourceSpan[] = [
  { assetId: ASSET_A, startTicks: 0, endTicks: 2 * 15360, timebase: VIDEO_TB },
  { assetId: ASSET_A, startTicks: 10 * 15360, endTicks: 13 * 15360, timebase: VIDEO_TB },
];

/**
 * The same two ranges, but the FIRST clip belongs to a different asset — the
 * shape the first real-footage run actually produced (six creator assets, seven
 * clips). Output layout is identical, so any span that moves between CLIPS and
 * MIXED_CLIPS moved because of the asset filter and nothing else.
 */
const MIXED_CLIPS: ClipSourceSpan[] = [
  { assetId: ASSET_B, startTicks: 0, endTicks: 2 * 15360, timebase: VIDEO_TB },
  { assetId: ASSET_A, startTicks: 10 * 15360, endTicks: 13 * 15360, timebase: VIDEO_TB },
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
    ASSET_A,
  );
  assert.equal(spans.length, 2);
  assert.equal(spans[0]?.kind, 'music');
  assert.equal(spans[1]?.kind, 'sfx');
});

// ---------------------------------------------------------------------------
// Multi-asset projection (D-51's remaining half).
//
// The first real-footage run recorded `--audio-events` as deliberately omitted
// because "the D-51 projection does not yet filter events by asset in a
// multi-asset EDL". These are that gap, as tests.
// ---------------------------------------------------------------------------

test('multi-asset EDL: events project ONLY onto clips of their own asset', () => {
  // Source 0–1 s of asset A. Clip 1 covers source 0–2 s but belongs to asset B,
  // so it must NOT receive this event; asset A's clip covers source 10–13 s and
  // does not overlap it. Correct answer: nothing.
  //
  // Before the fix this returned a span at output 0–1000 ms — asset A's audio
  // described as happening over asset B's footage, handed to the cue-review gate
  // as fact.
  const spans = interpretAudioEventsDocument(
    {
      assetId: ASSET_A,
      audioEvents: [{ kind: 'music', startTicks: 0, endTicks: 16000, timebase: AUDIO_TB }],
    },
    MIXED_CLIPS,
  );
  assert.deepEqual(spans, []);
});

test('multi-asset EDL: a matching clip still receives its events, at the right output offset', () => {
  // Source 11–12 s of asset A → 1 s into asset A's clip, which starts at output 2 s.
  // The preceding asset-B clip still advances the offset by its full 2 s.
  const spans = interpretAudioEventsDocument(
    {
      assetId: ASSET_A,
      audioEvents: [{ kind: 'applause', startTicks: 11 * 16000, endTicks: 12 * 16000, timebase: AUDIO_TB }],
    },
    MIXED_CLIPS,
  );
  assert.equal(spans.length, 1);
  assert.ok(Math.abs((spans[0]?.startMs ?? 0) - 3000) < 1, `startMs ${String(spans[0]?.startMs)} ≠ 3000`);
  assert.ok(Math.abs((spans[0]?.endMs ?? 0) - 4000) < 1, `endMs ${String(spans[0]?.endMs)} ≠ 4000`);
});

test('a skipped clip still advances the output offset — a filtered clip is not a deleted clip', () => {
  // The inversion the filter could plausibly introduce: skipping a foreign clip
  // without advancing the offset would slide every later span 2 s earlier.
  // Asserted against the single-asset layout, which must place it identically.
  const mixed = interpretAudioEventsDocument(
    { assetId: ASSET_A, audioEvents: [{ kind: 'sfx', startTicks: 10 * 16000, endTicks: 11 * 16000, timebase: AUDIO_TB }] },
    MIXED_CLIPS,
  );
  const single = interpretAudioEventsDocument(
    { assetId: ASSET_A, audioEvents: [{ kind: 'sfx', startTicks: 10 * 16000, endTicks: 11 * 16000, timebase: AUDIO_TB }] },
    CLIPS,
  );
  assert.equal(mixed.length, 1);
  assert.deepEqual(mixed, single);
  assert.ok(Math.abs((mixed[0]?.startMs ?? 0) - 2000) < 1, `startMs ${String(mixed[0]?.startMs)} ≠ 2000`);
});

test('multi-asset EDL with no document assetId is REFUSED, naming the way forward', () => {
  // Fail closed: without an assetId the events cannot be placed, and the old
  // behaviour (project onto everything) is the defect. The remedy names the
  // artefact to supply — it does not ask anyone to delete anything.
  assert.throws(
    () =>
      interpretAudioEventsDocument(
        { audioEvents: [{ kind: 'music', startTicks: 0, endTicks: 16000, timebase: AUDIO_TB }] },
        MIXED_CLIPS,
      ),
    /no document-level `assetId`.*draws on 2 assets.*source-index artefact/s,
  );
});

test('single-asset EDL with no document assetId still works — one asset is unambiguous', () => {
  // The compatibility promise. Every pre-existing single-asset caller keeps working.
  const spans = interpretAudioEventsDocument(
    { audioEvents: [{ kind: 'music', startTicks: 11 * 16000, endTicks: 12 * 16000, timebase: AUDIO_TB }] },
    CLIPS,
  );
  assert.equal(spans.length, 1);
});

test('an assetId naming no clip in this EDL is REFUSED, not silently projected as nothing', () => {
  // The wrong-file case. Returning [] would let `non_speech_cue_review` report a
  // clean pass over an EDL whose events were never actually examined — the
  // vacuous-green failure this whole fix exists to remove.
  assert.throws(
    () =>
      interpretAudioEventsDocument(
        {
          assetId: '01KZ8CCCCCCCCCCCCCCCCCCCCC',
          audioEvents: [{ kind: 'music', startTicks: 0, endTicks: 16000, timebase: AUDIO_TB }],
        },
        MIXED_CLIPS,
      ),
    /names no clip in this EDL/,
  );
});

// ---------------------------------------------------------------------------
// Driven from the REAL producer's artefact (CLAUDE.md Lessons, 2026-08-02:
// "a cross-skill option is only alive when a test drives it from its real
// producer's artefact"). The two committed source indexes below are genuine
// pipeline output from the e2e proving job.
//
// Two things these tests found that hand-built fixtures had hidden:
//
//  1. The `index` sub-stage checkpoint (`audio_events-*.json`) is a bare
//     `{audioEvents: […]}` with NO `assetId`. A fix that required one would
//     have refused every multi-asset EDL — leaving `--audio-events` exactly as
//     unusable as D-51 found it, for a new reason. The ASSEMBLED source index
//     is the artefact that carries `assetId`, and it is what the refusal
//     message names.
//  2. Every event in both real indexes is `speech` or `silence`, so real data
//     cannot produce a non-empty projection. Stated here rather than papered
//     over: these tests prove the real shape is ACCEPTED and the real asset
//     ids RESOLVE; the placement arithmetic is proven by the synthetic cases
//     above, and by the one clearly-marked injected event below.
// ---------------------------------------------------------------------------

const REAL_A = readGoldenSourceIndex('source-index-DB5DNV6SAMNX9JMCRGSCGEB7PQ.json');
const REAL_B = readGoldenSourceIndex('source-index-RPZ2S8F58Q10Y02T8E6VBBWDTB.json');

/** A multi-asset EDL built from the two REAL asset ids. */
const REAL_MIXED_CLIPS: ClipSourceSpan[] = [
  { assetId: REAL_A.assetId, startTicks: 0, endTicks: 2 * 15360, timebase: VIDEO_TB },
  { assetId: REAL_B.assetId, startTicks: 0, endTicks: 3 * 15360, timebase: VIDEO_TB },
];

test('real source index: the assembled artefact is accepted and its assetId resolves', () => {
  // The D-51 shape check. Before this fix the loader took the whole document and
  // projected it onto every clip; the assertion that matters is that the real
  // artefact is neither refused nor silently mis-assigned.
  const spans = interpretAudioEventsDocument(REAL_B, REAL_MIXED_CLIPS);
  assert.deepEqual(
    spans,
    [],
    'every event in this real index is speech/silence, which projection drops by design',
  );
});

test('real source index: the sub-stage checkpoint (no assetId) is refused on a multi-asset EDL', () => {
  // The artefact a caller is most likely to reach for by name, and the reason the
  // refusal message names the assembled index instead.
  const checkpoint = JSON.parse(
    readFileSync(join(GOLDEN_INDEX_DIR, 'audio_events-70ab223d46724501.json'), 'utf8'),
  ) as unknown;
  assert.throws(
    () => interpretAudioEventsDocument(checkpoint, REAL_MIXED_CLIPS),
    /no document-level `assetId`.*source-index artefact/s,
  );
});

test('real source index: one injected non-speech event lands only on its own asset', () => {
  // Real document, real assetId, real sibling events — with a single synthetic
  // `music` event added, because the real corpus contains no non-speech event to
  // project. Everything the filter depends on is real; only the payload is not.
  const withMusic = {
    ...REAL_B,
    audioEvents: [
      ...REAL_B.audioEvents,
      { kind: 'music', startTicks: 0, endTicks: 16000, timebase: { num: 1, den: 16000 } },
    ],
  };
  const spans = interpretAudioEventsDocument(withMusic, REAL_MIXED_CLIPS);
  assert.equal(spans.length, 1);
  // Asset B's clip is second, so it starts at output 2 s — proving the preceding
  // asset-A clip advanced the offset without receiving the event.
  assert.ok(Math.abs((spans[0]?.startMs ?? 0) - 2000) < 1, `startMs ${String(spans[0]?.startMs)} ≠ 2000`);
  assert.equal(spans[0]?.kind, 'music');
});

/**
 * Guard the CLASS, not the field (CLAUDE.md lesson, 2026-07-30). The first cut
 * tested `typeof declared === 'string'` and let every other type fall through to
 * the no-`assetId` path — where a single-asset EDL accepted it silently, and a
 * multi-asset EDL reported "carries no document-level `assetId`" about a document
 * that carries one. A malformed declaration must be refused as malformed.
 */
const TWO_ASSET_CLIPS = [
  { assetId: 'asset-a', startTicks: 0, endTicks: 1000, timebase: { num: 1, den: 1000 } },
  { assetId: 'asset-b', startTicks: 0, endTicks: 1000, timebase: { num: 1, den: 1000 } },
];
const ONE_ASSET_CLIPS = [TWO_ASSET_CLIPS[0]!];
const MALFORMED_ASSET_IDS: readonly unknown[] = [12345, true, {}, [], ''];

for (const bad of MALFORMED_ASSET_IDS) {
  test(`a malformed assetId ${JSON.stringify(bad)} is REFUSED on a multi-asset EDL, with the real reason`, () => {
    assert.throws(
      () => interpretAudioEventsDocument({ assetId: bad, audioEvents: [] }, TWO_ASSET_CLIPS),
      (error: unknown) => {
        const message = (error as Error).message;
        assert.match(message, /present but is not a non-empty string/);
        // The WRONG message would be the no-assetId one, which is false of this
        // document — that misdiagnosis is the defect being pinned.
        assert.ok(!/no document-level `assetId`/.test(message), `misdiagnosed: ${message}`);
        return true;
      },
    );
  });

  test(`a malformed assetId ${JSON.stringify(bad)} is REFUSED on a single-asset EDL too`, () => {
    // Silent acceptance here was the worse half: no message at all.
    assert.throws(
      () => interpretAudioEventsDocument({ assetId: bad, audioEvents: [] }, ONE_ASSET_CLIPS),
      /present but is not a non-empty string/,
    );
  });
}

test('an ABSENT assetId still takes the documented single-asset exemption', () => {
  // `null`/missing is absence, not malformation. `index`'s per-sub-stage
  // `audio_events-*.json` checkpoints genuinely carry no `assetId`, and refusing
  // them would make the documented option unusable for the single-asset case —
  // which is the D-51 dead-option failure in the opposite direction.
  assert.deepEqual(interpretAudioEventsDocument({ audioEvents: [] }, ONE_ASSET_CLIPS), []);
  assert.deepEqual(interpretAudioEventsDocument({ assetId: null, audioEvents: [] }, ONE_ASSET_CLIPS), []);
});

test('the single-asset exemption TRUSTS the caller — pinned as a known limit, not an oversight', () => {
  /**
   * On the record deliberately. "There is exactly one asset it could mean" is a
   * property of the EDL, not of the document: a document describes whichever
   * asset it was indexed from, and a job holds many. So a document with no
   * `assetId` that actually describes asset-b IS projected onto asset-a's ranges
   * without complaint. The multi-asset case — where a wrong mapping is both
   * silent and likely — is refused; this one is accepted with eyes open.
   *
   * If this test ever fails because the exemption was tightened, that is a
   * deliberate improvement: update the test and say so, do not restore it.
   */
  const events = [
    { kind: 'music', startTicks: 100, endTicks: 200, timebase: { num: 1, den: 1000 } },
  ];
  const projected = interpretAudioEventsDocument({ audioEvents: events }, ONE_ASSET_CLIPS);
  assert.equal(projected.length, 1, 'accepted onto the only asset in the EDL, whatever it describes');
});
