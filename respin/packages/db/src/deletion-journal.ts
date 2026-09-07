// Phase 10b-1 Task 5.1 — the append-only external deletion journal (R-124).
//
// Task 3 declared `DeletionJournalPort` and refused to supply an implementation:
// the journal must live OUTSIDE the restorable database, or a restore of the
// database restores the journal that was supposed to prove what the database no
// longer says. This file is that implementation, expressed against a narrow
// transport so the AWS SDK adapter (5.2) and the enforcing fake (5.6) satisfy
// the same contract and the tests are not proving the fake to itself.
//
// The five properties this file exists to make structural:
//
//   1. CREATE-ONLY. Every append is a conditional create (`If-None-Match: *`).
//      A key that already exists is a CONFLICT, never an overwrite. There is no
//      code path here that can overwrite, copy over, or delete an object — the
//      writer transport type has no such method to reach for.
//   2. IMMUTABLE FOR 28 DAYS. Every object carries COMPLIANCE-mode Object Lock
//      with the request's fixed day-28 retain-until. Compliance mode cannot be
//      shortened or bypassed by any principal, the account root included.
//   3. ENCRYPTED AND CHECKSUMMED. SSE-S3 (AES256) at rest, plus a SHA-256
//      checksum S3 verifies on write, so a corrupted upload is refused by the
//      store rather than discovered by a restore three weeks later.
//   4. CHAINED. Each version carries the prior version's receipt digest, so a
//      gap or a substituted version is detectable without trusting the store.
//   5. HONEST ABOUT UNKNOWNS. A timeout or 5xx is `unknown`, never `confirmed`
//      and never `conflict`: the object may or may not exist, and the difference
//      decides whether an irreversible erasure may proceed.
import { createHash } from "node:crypto";

import { DELETION_JOURNAL_RETAIN_MS } from "./deletion-lifecycle";
import {
  canonicalJournalPayload,
  journalReceiptDigest,
  type DeletionJournalPort,
  type JournalTransitionRequest,
  type JournalTransitionResult,
} from "./deletion-ports";

/** Zero-padded so lexicographic S3 listing order IS monotonic version order. */
export const JOURNAL_VERSION_PAD = 6;
export const JOURNAL_MAX_VERSION = 10 ** JOURNAL_VERSION_PAD - 1;

/**
 * R-124 writes `{environment}/deletion-journal/{requestId}/{version}.json`.
 *
 * NAMING NOTE, because the decision and this tree use different words for the
 * same thing: R-124's `{requestId}` is this tree's deletion OPERATION id. The
 * monotonic version series and the prior-digest chain belong to one operation
 * (`prepareJournalPlan(db, operationId, ...)`), so keying by anything coarser
 * would interleave two chains under one prefix and make a gap undetectable.
 */
export const JOURNAL_KEY_INFIX = "deletion-journal";

const ENVIRONMENT_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const REGION_PATTERN = /^[a-z0-9-]{1,32}$/;
// The lifecycle mints ids with uuidv7; the id becomes a key path segment, so
// anything that could traverse or collide is refused before a key is built.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type DeletionJournalConfig = Readonly<{
  environment: string;
  bucket: string;
  region: string;
}>;

export class DeletionJournalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeletionJournalConfigError";
  }
}

export function assertJournalConfig(config: DeletionJournalConfig): DeletionJournalConfig {
  if (!ENVIRONMENT_PATTERN.test(config.environment)) {
    throw new DeletionJournalConfigError(
      `deletion journal environment "${config.environment}" is not a safe key segment (lowercase letters, digits and hyphens, 1-32 chars)`
    );
  }
  if (!BUCKET_PATTERN.test(config.bucket)) {
    throw new DeletionJournalConfigError(
      `deletion journal bucket "${config.bucket}" is not a valid S3 bucket name`
    );
  }
  if (!REGION_PATTERN.test(config.region)) {
    throw new DeletionJournalConfigError(
      `deletion journal region "${config.region}" is not a valid AWS region`
    );
  }
  return config;
}

export function journalVersionSegment(version: number): string {
  if (!Number.isInteger(version) || version < 1 || version > JOURNAL_MAX_VERSION) {
    throw new DeletionJournalConfigError(
      `journal version ${version} is out of range 1..${JOURNAL_MAX_VERSION}`
    );
  }
  return String(version).padStart(JOURNAL_VERSION_PAD, "0");
}

export function journalOperationPrefix(
  config: DeletionJournalConfig,
  operationId: string
): string {
  if (!ID_PATTERN.test(operationId)) {
    throw new DeletionJournalConfigError(
      `operation id "${operationId}" is not a safe key segment`
    );
  }
  return `${config.environment}/${JOURNAL_KEY_INFIX}/${operationId}/`;
}

export function journalObjectKey(
  config: DeletionJournalConfig,
  operationId: string,
  version: number
): string {
  return `${journalOperationPrefix(config, operationId)}${journalVersionSegment(version)}.json`;
}

/** Parse a key back into its parts. `null` = not a journal object of this env. */
export function parseJournalObjectKey(
  config: DeletionJournalConfig,
  key: string
): Readonly<{ operationId: string; version: number }> | null {
  const parts = key.split("/");
  if (parts.length !== 4) return null;
  const [environment, infix, operationId, leaf] = parts as [string, string, string, string];
  if (environment !== config.environment || infix !== JOURNAL_KEY_INFIX) return null;
  if (!ID_PATTERN.test(operationId)) return null;
  if (!leaf.endsWith(".json")) return null;
  const digits = leaf.slice(0, -".json".length);
  if (digits.length !== JOURNAL_VERSION_PAD || !/^[0-9]+$/.test(digits)) return null;
  const version = Number(digits);
  if (version < 1) return null;
  return { operationId, version };
}

/**
 * The bytes S3 stores, and the SAME digest in the TWO encodings this system
 * needs. They are not interchangeable and conflating them is a silent wedge:
 *
 *   * `checksumBase64` is the wire encoding. S3's `ChecksumSHA256` header is
 *     base64 and S3 echoes it back in base64.
 *   * `checksumHex` is the DOMAIN encoding. Task 3's `journalRequestChecksum`
 *     (deletion-ports.ts) is hex, and `appendJournalTransitionInTx` refuses any
 *     receipt whose `checksumSha256` does not equal it.
 *
 * Returning the base64 form in the receipt made every append write its object
 * to S3 successfully and then get refused by the lifecycle, leaving an orphan
 * under a 28-day COMPLIANCE lock that the retry could never overwrite —
 * a permanently wedged operation (Task 5 round-1 billing BLOCK 1).
 */
export function journalObjectBody(request: JournalTransitionRequest): Readonly<{
  body: string;
  checksumBase64: string;
  checksumHex: string;
}> {
  const body = canonicalJournalPayload(request);
  const digest = createHash("sha256").update(body, "utf8");
  return {
    body,
    checksumBase64: digest.copy().digest("base64"),
    checksumHex: digest.digest("hex"),
  };
}

// ---------------------------------------------------------------------------
// The transport seam. THREE interfaces, not one, because R-124's least-privilege
// split is only real if calling the wrong verb is unrepresentable: the writer
// object has no `deleteObjectVersion` to reach for, so "the writer cannot
// delete" is a type error rather than a policy comment.
// ---------------------------------------------------------------------------

export type JournalPutRequest = Readonly<{
  bucket: string;
  key: string;
  body: string;
  contentType: "application/json";
  checksumSha256: string;
  serverSideEncryption: "AES256";
  objectLockMode: "COMPLIANCE";
  objectLockRetainUntil: Date;
  ifNoneMatch: "*";
}>;

export type JournalPutResult =
  /** The object did not exist and now does, durably, at this version id. */
  | Readonly<{ outcome: "created"; versionId: string; checksumSha256: string }>
  /** `If-None-Match: *` lost: the key already exists. */
  | Readonly<{ outcome: "precondition_failed" }>
  /** A definitive refusal (policy, permission, malformed): a retry cannot help. */
  | Readonly<{ outcome: "refused"; code: string }>
  /** Timeout, 5xx, network: the object may or may not exist. Reconcile. */
  | Readonly<{ outcome: "unknown"; code: string }>;

/** Create-only. Deliberately has no read verb and no delete verb. */
export interface JournalWriterTransport {
  putObject(request: JournalPutRequest): Promise<JournalPutResult>;
}

export type JournalListedVersion = Readonly<{
  key: string;
  versionId: string;
  isDeleteMarker: boolean;
  size: number;
  lastModified: Date;
}>;

export type JournalReadResult =
  | Readonly<{
      outcome: "read";
      body: string;
      checksumSha256: string | null;
      serverSideEncryption: string | null;
      objectLockMode: string | null;
      objectLockRetainUntil: Date | null;
    }>
  | Readonly<{ outcome: "unreadable"; code: string }>;

/** List / get / retention-read only. Deliberately has no write and no delete. */
export interface JournalVerifierTransport {
  listVersions(bucket: string, prefix: string): Promise<readonly JournalListedVersion[]>;
  getObjectVersion(bucket: string, key: string, versionId: string): Promise<JournalReadResult>;
}

export type JournalDeleteResult =
  | Readonly<{ outcome: "deleted" }>
  | Readonly<{ outcome: "refused"; code: string }>
  | Readonly<{ outcome: "unknown"; code: string }>;

/** Delete-exact-version only, and only after Object Lock has expired. */
export interface JournalPurgeTransport {
  deleteObjectVersion(
    bucket: string,
    key: string,
    versionId: string
  ): Promise<JournalDeleteResult>;
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export const JOURNAL_CONFLICT_VERSION_EXISTS = "journal_version_exists";
export const JOURNAL_CONFLICT_RETENTION = "journal_retain_until_not_day_28";
export const JOURNAL_CONFLICT_SCHEMA = "journal_schema_version_unsupported";

/**
 * Refuse a request whose retain-until is not exactly the request's fixed day-28
 * timestamp. R-124 pins it and Object Lock enforces it once written — so this
 * is the one moment at which the retention is still weakenable, and therefore
 * the only place a check can stop a shorter lock from being written at all.
 */
export function journalRetentionRefusal(request: JournalTransitionRequest): string | null {
  if (request.schemaVersion !== 1) return JOURNAL_CONFLICT_SCHEMA;
  const expected = request.requestedAt.getTime() + DELETION_JOURNAL_RETAIN_MS;
  if (request.retainUntil.getTime() !== expected) return JOURNAL_CONFLICT_RETENTION;
  return null;
}

export type DeletionJournalStore = DeletionJournalPort &
  Readonly<{
    config: DeletionJournalConfig;
    keyFor(operationId: string, version: number): string;
  }>;

export function createDeletionJournalStore(input: {
  transport: JournalWriterTransport;
  config: DeletionJournalConfig;
}): DeletionJournalStore {
  const config = assertJournalConfig(input.config);

  return Object.freeze({
    config,
    keyFor: (operationId: string, version: number) =>
      journalObjectKey(config, operationId, version),

    async appendTransition(
      request: JournalTransitionRequest
    ): Promise<JournalTransitionResult> {
      const refusal = journalRetentionRefusal(request);
      if (refusal !== null) return { outcome: "conflict", code: refusal };

      const key = journalObjectKey(config, request.operationId, request.version);
      const { body, checksumBase64, checksumHex } = journalObjectBody(request);

      const result = await input.transport.putObject({
        bucket: config.bucket,
        key,
        body,
        contentType: "application/json",
        checksumSha256: checksumBase64,
        serverSideEncryption: "AES256",
        objectLockMode: "COMPLIANCE",
        objectLockRetainUntil: request.retainUntil,
        ifNoneMatch: "*",
      });

      switch (result.outcome) {
        case "created": {
          // S3 echoes the checksum it computed. If it disagrees with ours the
          // stored object is not the bytes we meant to write, and calling that
          // confirmed would put a corrupt version at the head of the chain.
          // S3 echoes the checksum it computed, in the WIRE encoding.
          if (result.checksumSha256 !== checksumBase64) {
            return { outcome: "unknown", reconciliationKey: key };
          }
          // The receipt carries the DOMAIN encoding, which is what
          // `journalRequestChecksum` and `journalReceiptDigest` are defined in.
          const object = {
            objectKey: key,
            objectVersionId: result.versionId,
            checksumSha256: checksumHex,
          };
          return {
            outcome: "confirmed",
            schemaVersion: request.schemaVersion,
            operationId: request.operationId,
            scope: request.scope,
            target: request.target,
            requesterDigest: request.requesterDigest,
            version: request.version,
            fromState: request.fromState,
            toState: request.toState,
            payloadHash: request.payloadHash,
            priorReceiptDigest: request.priorReceiptDigest,
            requestedAt: request.requestedAt,
            effectiveAt: request.effectiveAt,
            retainUntil: request.retainUntil,
            ...object,
            receiptDigest: journalReceiptDigest(request, object),
          };
        }
        case "precondition_failed":
          return { outcome: "conflict", code: JOURNAL_CONFLICT_VERSION_EXISTS };
        case "refused":
          return { outcome: "conflict", code: result.code };
        case "unknown":
          return { outcome: "unknown", reconciliationKey: key };
      }
    },
  });
}
