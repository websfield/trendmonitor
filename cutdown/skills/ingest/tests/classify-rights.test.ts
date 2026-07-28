import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { classifyAsset, UnsupportedAssetError } from '../src/classify.js';
import {
  assertManifestMatchesInventory,
  resolveRights,
  RightsManifestError,
  unknownRecord,
} from '../src/rights.js';

const NOW = new Date('2026-07-21T00:00:00Z');

describe('asset classification (REQ-001, D-40)', () => {
  const at = (relativePath: string) => ({ relativePath, absolutePath: `/tmp/${relativePath}` });

  test('classifies each of the six REQ-001 classes by extension', () => {
    assert.equal(classifyAsset(at('a.mp4')).kind, 'video');
    assert.equal(classifyAsset(at('a.m4a')).kind, 'audio');
    assert.equal(classifyAsset(at('a.srt')).kind, 'subtitle');
    assert.equal(classifyAsset(at('a.md')).kind, 'brand_reference');
    assert.equal(classifyAsset({ ...at('a.jpg'), pixelFormat: 'yuvj420p' }).kind, 'image');
  });

  test('a declared assetKind beats every inference', () => {
    const result = classifyAsset({ ...at('a.jpg'), declaredKind: 'logo' });
    assert.equal(result.kind, 'logo');
    assert.equal(result.basis, 'declared');
  });

  test('a declaration rescues an otherwise-unsupported extension', () => {
    // This is the escape hatch that makes the imperfect alpha heuristic tolerable.
    const result = classifyAsset({ ...at('brandbook.sketch'), declaredKind: 'brand_reference' });
    assert.equal(result.kind, 'brand_reference');
  });

  test('a raster with real transparency is a logo', () => {
    const result = classifyAsset({ ...at('logo.png'), pixelFormat: 'rgba', hasNonOpaquePixel: true });
    assert.equal(result.kind, 'logo');
    assert.equal(result.basis, 'alpha');
  });

  test('an alpha-CAPABLE but fully opaque raster is an image, with a warning', () => {
    const result = classifyAsset({ ...at('screenshot.png'), pixelFormat: 'rgba', hasNonOpaquePixel: false });
    assert.equal(result.kind, 'image');
    assert.equal(result.warnings.length, 1, 'The ambiguity must be surfaced, not swallowed.');
  });

  test('an unclassifiable member throws, naming the relative path', () => {
    assert.throws(
      () => classifyAsset(at('notes.xyz')),
      (err: unknown) => {
        assert.ok(err instanceof UnsupportedAssetError);
        assert.equal(err.relativePath, 'notes.xyz');
        assert.match(err.message, /notes\.xyz/);
        return true;
      },
    );
  });
});

describe('rights resolution (REQ-003)', () => {
  test('an absent record resolves to unknown, never cleared', () => {
    const resolved = resolveRights(undefined, 'absent', 'hero-still.jpg', NOW);
    assert.equal(resolved.record.state, 'unknown');
    assert.equal(resolved.record.owner, null);
    assert.equal(resolved.record.editingPermitted, null);
    assert.equal(resolved.warnings.length, 1);
  });

  test('unknownRecord() nulls every detail', () => {
    const record = unknownRecord('because');
    assert.equal(record.state, 'unknown');
    assert.equal(record.talentReleaseStatus, 'unknown');
    assert.equal(record.musicStatus, 'unknown');
    assert.equal(record.paidAmplificationPermitted, null);
  });

  test('a valid cleared record resolves to cleared', () => {
    const resolved = resolveRights(
      {
        state: 'cleared',
        owner: 'Fixture corpus',
        expiryDate: null,
        evidenceUri: 'file:./LICENSE-FIXTURES.md',
        editingPermitted: true,
        paidAmplificationPermitted: true,
      },
      'sidecar',
      'clean.mp4',
      NOW,
    );
    assert.equal(resolved.record.state, 'cleared');
    assert.deepEqual(resolved.warnings, []);
  });

  test('a past expiryDate overrides a declared `cleared`', () => {
    // The declared state is an INPUT to resolution, never the output — a sidecar
    // cannot assert its way past its own expiry.
    const resolved = resolveRights(
      { state: 'cleared', owner: 'X', expiryDate: '2026-01-01', evidenceUri: 'file:./x' },
      'sidecar',
      'old.mp4',
      NOW,
    );
    assert.equal(resolved.record.state, 'expired');
    assert.match(resolved.warnings.join(' '), /expired on 2026-01-01/);
  });

  test('a past campaignEnd also expires the record', () => {
    const resolved = resolveRights(
      { state: 'cleared', owner: 'X', campaignEnd: '2026-02-01', evidenceUri: 'file:./x' },
      'sidecar',
      'old.mp4',
      NOW,
    );
    assert.equal(resolved.record.state, 'expired');
  });

  test('a future expiryDate does NOT expire the record', () => {
    const resolved = resolveRights(
      { state: 'cleared', owner: 'X', expiryDate: '2027-01-01', evidenceUri: 'file:./x' },
      'sidecar',
      'fresh.mp4',
      NOW,
    );
    assert.equal(resolved.record.state, 'cleared');
  });

  test('`cleared` without evidenceUri is recorded but flagged', () => {
    const resolved = resolveRights({ state: 'cleared', owner: 'X' }, 'sidecar', 'x.mp4', NOW);
    assert.equal(resolved.record.state, 'cleared');
    assert.match(resolved.warnings.join(' '), /unevidenced/);
  });

  test('an unrecognised state falls back to unknown, not cleared', () => {
    const resolved = resolveRights(
      { state: 'probably fine' as never, owner: 'X' },
      'sidecar',
      'x.mp4',
      NOW,
    );
    assert.equal(resolved.record.state, 'unknown');
  });

  test('a manifest entry naming a non-existent path is an error', () => {
    const manifest = new Map([['typo.mp4', { state: 'cleared' as const }]]);
    assert.throws(
      () => assertManifestMatchesInventory(manifest, ['clean.mp4']),
      (err: unknown) => {
        assert.ok(err instanceof RightsManifestError);
        assert.match(err.message, /typo\.mp4/);
        return true;
      },
    );
  });

  test('a manifest missing an entry is allowed — that asset lands unknown', () => {
    const manifest = new Map([['clean.mp4', { state: 'cleared' as const }]]);
    assert.doesNotThrow(() => assertManifestMatchesInventory(manifest, ['clean.mp4', 'other.mp4']));
  });
});
