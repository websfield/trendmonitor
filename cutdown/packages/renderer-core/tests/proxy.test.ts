import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateProxy,
  fitShortEdge,
  chooseConstantFrameRate,
  preflight,
  PROXY_PROFILE_VERSION,
  PROXY_SHORT_EDGE,
  FfmpegError,
  type PreflightReport,
} from '../src/index.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const GOLDEN = resolve(HERE, '..', '..', '..', '..', 'data', 'golden-sets', 'ingest');
const fixture = (name: string): string => join(GOLDEN, name);

describe('fitShortEdge — the D-25 "720p-fit" reading', () => {
  test('landscape caps height, portrait caps width', () => {
    // 1920x1080 landscape: short edge is the height.
    assert.deepEqual(fitShortEdge(1920, 1080), { width: 1280, height: 720 });
    // 1080x1920 portrait: short edge is the WIDTH. Capping height instead would
    // give 405x720 — the reading this function exists to rule out.
    assert.deepEqual(fitShortEdge(1080, 1920), { width: 720, height: 1280 });
  });

  test('never upscales', () => {
    assert.deepEqual(fitShortEdge(640, 360), { width: 640, height: 360 });
    assert.deepEqual(fitShortEdge(320, 240), { width: 320, height: 240 });
  });

  test('always returns even dimensions — libx264 rejects odd ones under yuv420p', () => {
    for (const [w, h] of [
      [1919, 1081],
      [999, 1777],
      [4001, 2251],
      [3, 5],
    ] as const) {
      const fitted = fitShortEdge(w, h);
      assert.equal(fitted.width % 2, 0, `width ${String(fitted.width)} is odd`);
      assert.equal(fitted.height % 2, 0, `height ${String(fitted.height)} is odd`);
      assert.ok(Math.min(fitted.width, fitted.height) <= PROXY_SHORT_EDGE);
    }
  });
});

describe('chooseConstantFrameRate', () => {
  test('a VFR source normalises to its base rate, not its average', () => {
    const vfr = {
      video: {
        frameRateMode: 'vfr',
        realFrameRate: { num: 30, den: 1 },
        averageFrameRate: { num: 400, den: 19 },
      },
    } as unknown as PreflightReport;
    // 400/19 is an artefact of where the dropped frames fell; encoding at
    // ~21.05 fps would bake that accident into the proxy.
    assert.deepEqual(chooseConstantFrameRate(vfr), { num: 30, den: 1 });
  });

  test('a CFR source keeps its declared rate', () => {
    const cfr = {
      video: {
        frameRateMode: 'cfr',
        realFrameRate: { num: 30, den: 1 },
        averageFrameRate: { num: 30, den: 1 },
      },
    } as unknown as PreflightReport;
    assert.deepEqual(chooseConstantFrameRate(cfr), { num: 30, den: 1 });
  });
});

describe('generateProxy against real fixtures', () => {
  let scratch: string;
  before(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'cutdown-proxy-'));
  });
  after(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  test('clean.mp4 → H.264 CRF 23 + AAC 128k, CFR, original untouched', async () => {
    const source = fixture('clean.mp4');
    const before = await stat(source);
    const out = join(scratch, 'clean-proxy.mp4');

    const { record, width, height } = await generateProxy(source, out);

    assert.equal(record.proxyProfileVersion, PROXY_PROFILE_VERSION);
    assert.equal(record.recipe.videoCodec, 'h264');
    assert.equal(record.recipe.crf, 23);
    assert.equal(record.recipe.audioCodec, 'aac');
    assert.equal(record.recipe.audioBitrateKbps, 128);
    assert.deepEqual(record.recipe.constantFrameRate, { num: 30, den: 1 });
    assert.equal(record.recipe.shortEdgeMaxPixels, 720);
    assert.match(record.contentHash.value, /^[0-9a-f]{64}$/);
    assert.equal(record.contentHash.algorithm, 'sha256');
    assert.equal(record.storedPath, out);
    // 640x360 is already inside the 720 bound — no upscale.
    assert.equal(width, 640);
    assert.equal(height, 360);

    // The proxy is genuinely CFR and genuinely has the audio track.
    const proxyReport = await preflight(out, { skipCorruptionCheck: true });
    assert.ok(proxyReport.video !== null);
    assert.equal(proxyReport.video.frameRateMode, 'cfr');
    assert.equal(proxyReport.video.displayWidth, 640);
    assert.equal(proxyReport.video.displayHeight, 360);
    assert.equal(proxyReport.audioTracks.length, 1);
    assert.equal(proxyReport.audioTracks[0]?.codecName, 'aac');
    // The recorded timebase is the proxy's real one, read back from the file.
    assert.deepEqual(proxyReport.video.timebase, record.timebase);

    // REQ-004: the original is never modified.
    const after = await stat(source);
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeMs, before.mtimeMs);
  });

  test('ugly.mp4 → VFR normalised to CFR and rotation baked upright', async () => {
    const out = join(scratch, 'ugly-proxy.mp4');
    const { record, width, height } = await generateProxy(fixture('ugly.mp4'), out);

    // VFR in, CFR out — REQ-019's "VFR normalized".
    assert.deepEqual(record.recipe.constantFrameRate, { num: 30, den: 1 });
    const proxyReport = await preflight(out, { skipCorruptionCheck: true });
    assert.ok(proxyReport.video !== null);
    assert.equal(proxyReport.video.frameRateMode, 'cfr');

    // Planned from DISPLAY dimensions (360x640 portrait), so the proxy comes
    // out upright with no rotation metadata left to interpret.
    assert.equal(width, 360);
    assert.equal(height, 640);
    assert.equal(proxyReport.video.displayWidth, 360);
    assert.equal(proxyReport.video.displayHeight, 640);
    assert.equal(proxyReport.video.rotationDegrees, 0);

    // Source has no audio, so neither does the proxy.
    assert.equal(record.recipe.audioCodec, null);
    assert.equal(record.recipe.audioBitrateKbps, null);
    assert.deepEqual(proxyReport.audioTracks, []);
  });

  test('broll-silent.mp4 → the audio-less case carries null, not a fabricated track', async () => {
    const out = join(scratch, 'silent-proxy.mp4');
    const { record } = await generateProxy(fixture('broll-silent.mp4'), out);

    assert.equal(record.recipe.audioCodec, null);
    assert.equal(record.recipe.audioBitrateKbps, null);

    const proxyReport = await preflight(out, { skipCorruptionCheck: true });
    // A fabricated silent track would make "does this asset have audio?"
    // unanswerable from the proxy.
    assert.deepEqual(proxyReport.audioTracks, []);
    assert.ok(proxyReport.video !== null);
  });

  test('refuses to write the proxy over its own source', async () => {
    await assert.rejects(
      generateProxy(fixture('clean.mp4'), fixture('clean.mp4')),
      (error: unknown) =>
        error instanceof FfmpegError && error.code === 'PROXY_WOULD_OVERWRITE_SOURCE',
    );
  });

  test('refuses an asset with no video stream', async () => {
    await assert.rejects(
      generateProxy(
        join(GOLDEN, 'mixed-job-valid', 'voiceover-bed.m4a'),
        join(scratch, 'audio-proxy.mp4'),
      ),
      (error: unknown) => error instanceof FfmpegError && error.code === 'PROXY_REQUIRES_VIDEO',
    );
  });

  test('rejects an option-shaped or relative output path', async () => {
    await assert.rejects(
      generateProxy(fixture('clean.mp4'), 'relative/out.mp4'),
      (error: unknown) => error instanceof FfmpegError && error.code === 'RELATIVE_INPUT_PATH',
    );
  });
});
