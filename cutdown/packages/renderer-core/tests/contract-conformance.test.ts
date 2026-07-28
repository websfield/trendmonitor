import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import type { SourceAssetV1 } from '@cutdown/contracts/generated';

import type {
  AudioStreamInfo,
  CorruptionReport,
  PreflightReport,
  Timebase,
  VideoStreamInfo,
} from '../src/probe.js';
import type { ProxyRecipe, ProxyRecord } from '../src/proxy.js';

/**
 * Compile-time proof that this package's locally-declared media types still
 * describe the same shapes as the GENERATED contract types.
 *
 * `probe.ts` and `proxy.ts` declare their own interfaces rather than importing
 * the generated ones. That is a deliberate trade — it keeps the media layer
 * readable and free of generated-name noise like `Timebase3` — but it is real
 * duplication, and duplication drifts. The aliases below are the guard: change
 * a field in `source-asset-v1.json`, regenerate, and this FILE STOPS COMPILING.
 * No runtime assertion could catch this; by the time a mismatched object
 * exists, the type information is gone.
 *
 * The direction matters. Each local type is asserted assignable INTO the
 * generated type, which is the claim that counts: "anything this package
 * produces is a valid contract value." The reverse would only prove the
 * contract is no wider than our view of it.
 *
 * These must be TYPE aliases, not values. An earlier version used
 * `declare const` plus `satisfies`, which type-checked but emitted an object
 * literal referencing bindings that do not exist at runtime — the test file
 * compiled and then threw `ReferenceError` on import.
 */

type Generated = SourceAssetV1.SourceAsset;
type GeneratedPreflight = Generated['preflight'];
type GeneratedProxy = NonNullable<Generated['proxy']>;

/** Fails to compile unless `T` is assignable to `U`. Erased entirely at build. */
type AssertAssignable<T extends U, U> = T;

export type _Video = AssertAssignable<VideoStreamInfo, NonNullable<GeneratedPreflight['video']>>;
export type _Audio = AssertAssignable<AudioStreamInfo, GeneratedPreflight['audioTracks'][number]>;
export type _Corruption = AssertAssignable<CorruptionReport, NonNullable<GeneratedPreflight['corruption']>>;
export type _Preflight = AssertAssignable<PreflightReport, GeneratedPreflight>;
export type _Timebase = AssertAssignable<Timebase, SourceAssetV1.Timebase>;
export type _ProxyRecord = AssertAssignable<ProxyRecord, GeneratedProxy>;
export type _ProxyRecipe = AssertAssignable<ProxyRecipe, GeneratedProxy['recipe']>;

describe('contract conformance', () => {
  test('local media types conform to the generated SourceAsset contract', () => {
    // The real assertion is the type aliases above, checked at build time. This
    // case exists so the guarantee appears in test output rather than being
    // invisible machinery someone deletes while tidying unused imports.
    assert.ok(true, 'If this file compiled, the local types match the contract.');
  });
});
