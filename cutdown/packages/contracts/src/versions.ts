/**
 * Contract schema versions, as constants producers stamp into envelopes.
 *
 * One constant per contract whose version has moved past 1.0.0. A producer
 * importing the constant cannot silently stamp a stale version when the schema
 * bumps — `tests/versions.test.ts` asserts each constant equals the
 * `schemaVersion` in the schema file itself, so a bump that misses this file
 * fails the suite rather than shipping a false envelope claim. (D-52 found the
 * inverse failure: the version was bumped and ONE of the two PlatformEDL
 * producers kept stamping 1.0.0.)
 */

/** platform-edl-v1: 1.1.0 since the D-52 `clips[].transition` addition. */
export const PLATFORM_EDL_SCHEMA_VERSION = '1.1.0';
