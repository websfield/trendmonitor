import { createHash } from 'node:crypto';

/**
 * Content hashing for contract objects (tech-spec §3, PRD REQ-005).
 *
 * The rule this module exists to enforce, in one place:
 *
 *   `envelope.createdAt` and `envelope.createdBy` are envelope metadata and are
 *   EXCLUDED from the content hash. Everything else — including
 *   `envelope.schemaVersion`, which is semantic — is included.
 *
 * Without the exclusion, two byte-identical re-runs of the same skill over the
 * same input would hash differently (they ran at different instants), the
 * REQ-005 cache would never hit, and every re-ingest would repeat every
 * expensive index and proxy pass. The cache is the single cheapest lever on
 * both cost and latency (tech-spec §13), so this is not a micro-optimisation.
 */

/** Keys removed from `envelope` before hashing. */
export const HASH_EXCLUDED_ENVELOPE_KEYS = ['createdAt', 'createdBy'] as const;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/**
 * RFC 8785-style canonicalisation, narrowed to what contract objects contain:
 * object keys sorted by code unit, no insignificant whitespace, arrays keeping
 * their order (order is meaningful in every contract array we define).
 *
 * `undefined` properties are dropped rather than serialised, so an optional
 * field that was never set hashes the same as one explicitly absent.
 */
function canonicalise(value: Json): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Cannot hash a non-finite number; contract numbers are always finite.');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).join(',')}]`;
  }
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalise(value[k] as Json)}`).join(',')}}`;
}

/** The exact byte string that gets hashed. Exported so a test can assert the exclusion. */
export function contentHashPayload(object: unknown): string {
  const clone = JSON.parse(JSON.stringify(object)) as Json;
  if (clone !== null && typeof clone === 'object' && !Array.isArray(clone)) {
    const envelope = clone['envelope'];
    if (envelope !== null && typeof envelope === 'object' && !Array.isArray(envelope)) {
      for (const key of HASH_EXCLUDED_ENVELOPE_KEYS) {
        delete (envelope as Record<string, Json>)[key];
      }
    }
  }
  return canonicalise(clone);
}

/** sha256 of the canonicalised object, envelope timestamps excluded. */
export function hashContent(object: unknown): { algorithm: 'sha256'; value: string } {
  return {
    algorithm: 'sha256',
    value: createHash('sha256').update(contentHashPayload(object), 'utf8').digest('hex'),
  };
}

/** sha256 of raw bytes — used for source media, where the file IS the content. */
export function hashBytes(bytes: Buffer): { algorithm: 'sha256'; value: string } {
  return { algorithm: 'sha256', value: createHash('sha256').update(bytes).digest('hex') };
}
