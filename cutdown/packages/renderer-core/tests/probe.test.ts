import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  preflight,
  probeCorruption,
  parseRational,
  normaliseRotation,
  detectHdr,
  classifyFrameRate,
} from '../src/index.js';

/**
 * Real probes against the committed ingest golden set
 * (`cutdown/data/golden-sets/ingest/`). These fixtures exist precisely to catch
 * the mistakes a hand-written unit test cannot: the rotation-tag trap (D-41),
 * the empty-vs-null audio conflation, and VFR that only a real packet stream
 * exhibits. Mocking ffprobe here would test the mock.
 */
const HERE = fileURLToPath(new URL('.', import.meta.url));
// tests run from dist/tests/, so climb to the package root and out to cutdown/.
const GOLDEN = resolve(HERE, '..', '..', '..', '..', 'data', 'golden-sets', 'ingest');
const fixture = (name: string): string => join(GOLDEN, name);

describe('pure helpers', () => {
  test('parseRational refuses the degenerate forms rather than coercing them', () => {
    assert.deepEqual(parseRational('30/1'), { num: 30, den: 1 });
    assert.deepEqual(parseRational('1/30000'), { num: 1, den: 30000 });
    assert.deepEqual(parseRational('400/19'), { num: 400, den: 19 });
    // ffprobe emits 0/0 for every audio stream's frame rate; the schema's
    // Timebase cannot represent it, so it must come back null.
    assert.equal(parseRational('0/0'), null);
    assert.equal(parseRational('30/0'), null);
    assert.equal(parseRational(undefined), null);
    assert.equal(parseRational('nonsense'), null);
  });

  test('normaliseRotation lands in the schema enum, including negative values', () => {
    assert.equal(normaliseRotation(0), 0);
    assert.equal(normaliseRotation(90), 90);
    assert.equal(normaliseRotation(180), 180);
    assert.equal(normaliseRotation(270), 270);
    // The Display Matrix commonly reports negatives (an iPhone portrait clip
    // is -90); they must wrap, not clamp.
    assert.equal(normaliseRotation(-90), 270);
    assert.equal(normaliseRotation(-180), 180);
    assert.equal(normaliseRotation(-270), 90);
    assert.equal(normaliseRotation(360), 0);
    assert.equal(normaliseRotation(450), 90);
    // Near-integer matrix values round to the nearest quadrant.
    assert.equal(normaliseRotation(89.9), 90);
  });

  test('detectHdr maps transfer characteristics to the two Phase 0 formats', () => {
    assert.deepEqual(detectHdr('smpte2084'), { isHdr: true, detectedFormat: 'pq' });
    assert.deepEqual(detectHdr('arib-std-b67'), { isHdr: true, detectedFormat: 'hlg' });
    assert.deepEqual(detectHdr('bt709'), { isHdr: false, detectedFormat: null });
    assert.deepEqual(detectHdr(null), { isHdr: false, detectedFormat: null });
  });

  test('classifyFrameRate treats an unreadable rate as unknown, never as cfr', () => {
    assert.equal(classifyFrameRate({ num: 30, den: 1 }, { num: 30, den: 1 }), 'cfr');
    // Exact rational equality, not float: 30/1 and 60/2 are the same rate.
    assert.equal(classifyFrameRate({ num: 30, den: 1 }, { num: 60, den: 2 }), 'cfr');
    assert.equal(classifyFrameRate({ num: 30, den: 1 }, { num: 400, den: 19 }), 'vfr');
    assert.equal(classifyFrameRate(null, { num: 30, den: 1 }), 'unknown');
    assert.equal(classifyFrameRate({ num: 30, den: 1 }, null), 'unknown');
  });
});

describe('clean.mp4 — the control fixture', () => {
  test('CFR 30/1, one 48 kHz audio track, no rotation, not HDR', async () => {
    const report = await preflight(fixture('clean.mp4'));

    assert.equal(report.inspected, true);
    assert.equal(report.container?.formatName, 'mov,mp4,m4a,3gp,3g2,mj2');

    const video = report.video;
    assert.ok(video !== null, 'clean.mp4 must have a video stream');
    assert.equal(video.codecName, 'h264');
    assert.equal(video.frameRateMode, 'cfr');
    assert.deepEqual(video.realFrameRate, { num: 30, den: 1 });
    assert.deepEqual(video.averageFrameRate, { num: 30, den: 1 });
    assert.equal(video.rotationDegrees, 0);
    assert.equal(video.hdr.isHdr, false);
    assert.equal(video.hdr.detectedFormat, null);
    // No rotation, so display and coded dimensions coincide.
    assert.equal(video.codedWidth, 640);
    assert.equal(video.codedHeight, 360);
    assert.equal(video.displayWidth, 640);
    assert.equal(video.displayHeight, 360);
    assert.equal(video.frameCount, 150);
    assert.deepEqual(video.timebase, { num: 1, den: 15360 });

    assert.equal(report.audioTracks.length, 1, 'exactly one audio track');
    const audio = report.audioTracks[0];
    assert.ok(audio !== undefined);
    assert.equal(audio.codecName, 'aac');
    assert.equal(audio.sampleRate, 48000);
    // The schema requires ticks to BE sample counts.
    assert.deepEqual(audio.timebase, { num: 1, den: 48000 });
    assert.equal(audio.durationTicks, 240000);
    // 240000 samples / 48000 Hz = the 5 s the fixture declares.
    assert.equal(audio.durationTicks / audio.sampleRate, 5);

    // Duration is exact rational ticks, never float seconds.
    assert.ok(report.duration !== null);
    assert.equal(Number.isInteger(report.duration.ticks), true);
    assert.deepEqual(report.duration, { ticks: 76800, timebase: { num: 1, den: 15360 } });
    assert.equal((report.duration.ticks * report.duration.timebase.num) / report.duration.timebase.den, 5);

    assert.equal(report.corruption?.status, 'clean');
    assert.equal(report.corruption?.decodeErrorCount, 0);
  });
});

describe('ugly.mp4 — VFR + rotation + HDR, all at once', () => {
  test('vfr, rotation 90, HDR pq, and display dimensions swapped', async () => {
    const report = await preflight(fixture('ugly.mp4'));
    const video = report.video;
    assert.ok(video !== null);

    // VFR: r_frame_rate 30/1 vs avg_frame_rate 400/19.
    assert.equal(video.frameRateMode, 'vfr');
    assert.deepEqual(video.realFrameRate, { num: 30, den: 1 });
    assert.deepEqual(video.averageFrameRate, { num: 400, den: 19 });

    // Rotation read from Display Matrix side data, NOT stream_tags.rotate —
    // FFmpeg 8 ignores the tag entirely (D-41). A probe written against the tag
    // reads 0 here, which is exactly what this fixture exists to catch.
    assert.equal(video.rotationDegrees, 90);

    // The load-bearing consequence: display dimensions are SWAPPED relative to
    // coded. Editorial code reads display only; using coded on a rotated clip
    // silently produces a sideways crop.
    assert.equal(video.codedWidth, 640);
    assert.equal(video.codedHeight, 360);
    assert.equal(video.displayWidth, 360);
    assert.equal(video.displayHeight, 640);
    assert.notEqual(video.displayWidth, video.codedWidth);

    // HDR detected from the transfer characteristic, recorded not converted.
    assert.equal(video.hdr.isHdr, true);
    assert.equal(video.hdr.detectedFormat, 'pq');
    assert.equal(video.color.transfer, 'smpte2084');
    assert.equal(video.color.primaries, 'bt2020');
    assert.equal(video.color.space, 'bt2020nc');

    // No audio: an empty array, never null.
    assert.deepEqual(report.audioTracks, []);
    assert.equal(report.corruption?.status, 'clean');
  });
});

describe('broll-silent.mp4 — the empty-vs-null distinction', () => {
  test('audioTracks is an empty array, specifically NOT null', async () => {
    const report = await preflight(fixture('broll-silent.mp4'));
    assert.notEqual(report.audioTracks, null);
    assert.equal(Array.isArray(report.audioTracks), true);
    assert.equal(report.audioTracks.length, 0);
    assert.deepEqual(report.audioTracks, []);
    // The positive finding is only meaningful because preflight actually ran.
    assert.equal(report.inspected, true);
    assert.ok(report.video !== null);
    assert.equal(report.video.frameRateMode, 'cfr');
  });
});

describe('corruption detection', () => {
  let scratch: string;
  before(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'cutdown-corrupt-'));
  });
  after(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  test('a truncated copy of a fixture reports corrupt', async () => {
    // Built in the OS temp dir and never committed — a corrupt file in the
    // golden set would be indistinguishable from a corrupted golden set.
    const source = await readFile(fixture('clean.mp4'));
    const truncated = join(scratch, 'truncated.mp4');
    await writeFile(truncated, source.subarray(0, Math.floor(source.length * 0.4)));

    const report = await probeCorruption(truncated, 150);
    assert.equal(report.status, 'corrupt');
    assert.ok(report.decodeErrorCount > 0, 'decode errors should have been counted');
    assert.ok(report.detail !== null);
    // The discriminator is the short decode, not the exit code: FFmpeg 8 exits
    // 0 on this file (measured), so an exit-code-based check would call it
    // clean.
    assert.match(report.detail, /declared frames/);
  });

  test('an intact fixture reports clean with zero decode errors', async () => {
    const report = await probeCorruption(fixture('clean.mp4'), 150);
    assert.equal(report.status, 'clean');
    assert.equal(report.decodeErrorCount, 0);
    assert.equal(report.detail, null);
  });
});

describe('non-video assets', () => {
  test('an audio-only container yields a null video and a populated audio track', async () => {
    const report = await preflight(join(GOLDEN, 'mixed-job-valid', 'voiceover-bed.m4a'));
    assert.equal(report.video, null);
    assert.equal(report.audioTracks.length, 1);
    const audio = report.audioTracks[0];
    assert.ok(audio !== undefined);
    assert.equal(audio.sampleRate, 48000);
    assert.deepEqual(audio.timebase, { num: 1, den: audio.sampleRate });
    assert.ok(report.duration !== null);
  });

  test('a still image probes as a one-frame video stream with no audio', async () => {
    // The schema states this explicitly: "Present for image assets (a still is
    // a one-frame video stream to ffprobe)".
    const report = await preflight(join(GOLDEN, 'mixed-job-valid', 'hero-still.jpg'), {
      skipCorruptionCheck: true,
    });
    assert.ok(report.video !== null);
    assert.equal(report.video.codecName, 'mjpeg');
    assert.equal(report.video.displayWidth, 1280);
    assert.equal(report.video.displayHeight, 720);
    assert.deepEqual(report.audioTracks, []);
    // skipCorruptionCheck leaves corruption null — distinguishable from clean.
    assert.equal(report.corruption, null);
  });

  test('a filename with a space and non-ASCII characters probes correctly', async () => {
    // argv-spawning with shell: false is what makes this a non-event; a shell
    // invocation would need quoting here and would break on the space.
    const report = await preflight(join(GOLDEN, 'mixed-job-valid', 'café shot.mp4'), {
      skipCorruptionCheck: true,
    });
    assert.ok(report.video !== null);
    assert.equal(report.audioTracks.length, 1);
  });
});
