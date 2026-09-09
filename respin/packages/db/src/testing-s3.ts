// Phase 10b-1 Task 5.6 — an ENFORCING in-memory S3 for the journal contract.
//
// The point of this file is the word "enforcing". A fake that merely RECORDS
// the arguments it was called with proves nothing: every assertion becomes a
// restatement of the call the test just made, and the whole suite stays green
// through a store that would have accepted an overwrite, a shortened lock, or
// an unencrypted object. (CLAUDE.md, 2026-08-26: a verifier that reports
// success is not verified until something OUTSIDE it tries to break it.)
//
// So this fake REFUSES, exactly where a correctly configured bucket refuses:
//
//   * `If-None-Match: *` against an existing key      -> PreconditionFailed
//   * a missing/incorrect SHA-256 checksum            -> BadDigest
//   * a missing or non-AES256 encryption header       -> AccessDenied (policy)
//   * a missing COMPLIANCE lock or retain-until       -> AccessDenied (policy)
//   * a delete of a version still under Object Lock   -> AccessDenied
//   * any verb the calling principal does not hold    -> AccessDenied
//
// `tamper` is the adversary. It is the ONLY way to produce the states a correct
// writer cannot produce — a second object version on one logical key, a delete
// marker, a gap, a shortened retention, an unreadable object — and it exists so
// the restore verifier is tested against damage it did not itself create.
import { createHash } from "node:crypto";

import type {
  JournalDeleteResult,
  JournalListedVersion,
  JournalPurgeTransport,
  JournalPutRequest,
  JournalPutResult,
  JournalReadResult,
  JournalVerifierTransport,
  JournalWriterTransport,
} from "./deletion-journal";

type StoredVersion = {
  key: string;
  versionId: string;
  isDeleteMarker: boolean;
  body: string;
  checksumSha256: string | null;
  serverSideEncryption: string | null;
  objectLockMode: string | null;
  objectLockRetainUntil: Date | null;
  lastModified: Date;
  /** Set by `tamper.corrupt` — a version S3 can list but not hand back. */
  unreadable: string | null;
};

export type FakeS3Options = Readonly<{
  bucket: string;
  /** Bucket-level Object Lock. Off means every write is refused, as R-124 requires. */
  objectLockEnabled?: boolean;
  /** Bucket-level Versioning. Off means every write is refused. */
  versioningEnabled?: boolean;
  now?: () => Date;
}>;

export type FakeS3Failure = Readonly<{
  /** Match by key suffix; every put/delete whose key ends with this fails. */
  keySuffix: string;
  /**
   * `wrong_checksum_echo` stores the object and reports success while echoing a
   * checksum that does not match the bytes — the one shape a correct store
   * never produces, and the only way to reach the store's echo guard (round-1
   * code CHANGE 9: that branch was provably unreachable by the suite).
   */
  as: "unknown" | "refused" | "wrong_checksum_echo";
  code: string;
  /** Fail only this many times, then behave normally. Default: forever. */
  times?: number;
}>;

/**
 * The adversary surface. Nothing a real writer, verifier or purge principal can
 * do reaches these — they model an out-of-band actor (a misconfigured bucket, a
 * second writer, bit rot) so the restore verifier is proved against damage from
 * outside itself.
 */
export type FakeS3Tamper = Readonly<{
  /** A SECOND object version under one logical key — split authority. */
  addSecondVersion(key: string, body: string): void;
  /** A delete marker on top of a live object. */
  addDeleteMarker(key: string): void;
  /** Remove a version outright, leaving a gap in the chain. */
  removeVersion(key: string): void;
  /** Listable but not gettable. */
  corrupt(key: string, code?: string): void;
  /** Rewrite the stored bytes without touching the recorded checksum. */
  rewriteBody(key: string, body: string): void;
  /** Shorten (or lengthen) a stored retain-until. */
  setRetainUntil(key: string, retainUntil: Date | null): void;
  /** Overwrite the recorded encryption header. */
  setEncryption(key: string, sse: string | null): void;
  /** Weaken or remove the Object Lock mode (round-1: `lock_mode_mismatch` had
   *  no verb here at all, so the verifier's check had no planted violation). */
  setLockMode(key: string, mode: string | null): void;
}>;

export type FakeS3 = Readonly<{
  bucket: string;
  /** Create-only principal. */
  writer: JournalWriterTransport;
  /** List/get principal. */
  verifier: JournalVerifierTransport;
  /** Delete-exact-version principal. */
  purger: JournalPurgeTransport;
  tamper: FakeS3Tamper;
  /** Every put the writer attempted, in order, INCLUDING refused ones. */
  puts: readonly JournalPutRequest[];
  keys(): readonly string[];
  versionCount(key: string): number;
  failNext(failure: FakeS3Failure): void;
  setClock(now: () => Date): void;
}>;

function sha256Base64(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("base64");
}

export function createFakeS3(options: FakeS3Options): FakeS3 {
  const versions: StoredVersion[] = [];
  const puts: JournalPutRequest[] = [];
  const failures: (FakeS3Failure & { remaining: number })[] = [];
  const objectLockEnabled = options.objectLockEnabled ?? true;
  const versioningEnabled = options.versioningEnabled ?? true;
  let now = options.now ?? (() => new Date());
  let versionSeq = 0;

  const nextVersionId = (): string => `v${String(++versionSeq).padStart(4, "0")}`;

  const live = (key: string): StoredVersion[] =>
    versions.filter((v) => v.key === key && !v.isDeleteMarker);

  const takeFailure = (key: string): FakeS3Failure | null => {
    const hit = failures.find((f) => key.endsWith(f.keySuffix) && f.remaining > 0);
    if (!hit) return null;
    hit.remaining -= 1;
    return hit;
  };

  const writer: JournalWriterTransport = {
    async putObject(request: JournalPutRequest): Promise<JournalPutResult> {
      puts.push(request);

      if (request.bucket !== options.bucket) {
        return { outcome: "refused", code: "NoSuchBucket" };
      }

      const injected = takeFailure(request.key);
      if (injected && injected.as !== "wrong_checksum_echo") {
        return injected.as === "unknown"
          ? { outcome: "unknown", code: injected.code }
          : { outcome: "refused", code: injected.code };
      }

      // Bucket-level guarantees. A bucket without Versioning or Object Lock
      // cannot make the promise the journal is for, so it refuses rather than
      // storing an object that only LOOKS immutable.
      if (!versioningEnabled) return { outcome: "refused", code: "VersioningNotEnabled" };
      if (!objectLockEnabled) return { outcome: "refused", code: "ObjectLockNotEnabled" };

      // The bucket policy, enforced. Each of these is a `Deny` statement in
      // infra/s3-deletion-journal/bucket-policy.template.json, whose statement
      // inventory is asserted by tests/s3-journal-policy.test.ts.
      if (request.ifNoneMatch !== "*") {
        return { outcome: "refused", code: "AccessDenied:ConditionalCreateRequired" };
      }
      if (request.serverSideEncryption !== "AES256") {
        return { outcome: "refused", code: "AccessDenied:EncryptionRequired" };
      }
      if (request.objectLockMode !== "COMPLIANCE") {
        return { outcome: "refused", code: "AccessDenied:ComplianceLockRequired" };
      }
      if (!(request.objectLockRetainUntil instanceof Date)) {
        return { outcome: "refused", code: "AccessDenied:RetainUntilRequired" };
      }
      if (request.objectLockRetainUntil.getTime() <= now().getTime()) {
        return { outcome: "refused", code: "InvalidArgument:RetainUntilInThePast" };
      }

      // S3 verifies ChecksumSHA256 itself and rejects a mismatch.
      const actual = sha256Base64(request.body);
      if (!request.checksumSha256) return { outcome: "refused", code: "InvalidRequest:ChecksumRequired" };
      if (request.checksumSha256 !== actual) return { outcome: "refused", code: "BadDigest" };

      // The conditional create. This is the whole append-only guarantee.
      if (live(request.key).length > 0) return { outcome: "precondition_failed" };

      const versionId = nextVersionId();
      if (injected?.as === "wrong_checksum_echo") {
        versions.push({
          key: request.key,
          versionId,
          isDeleteMarker: false,
          body: request.body,
          checksumSha256: request.checksumSha256,
          serverSideEncryption: request.serverSideEncryption,
          objectLockMode: request.objectLockMode,
          objectLockRetainUntil: request.objectLockRetainUntil,
          lastModified: now(),
          unreadable: null,
        });
        return { outcome: "created", versionId, checksumSha256: injected.code };
      }
      versions.push({
        key: request.key,
        versionId,
        isDeleteMarker: false,
        body: request.body,
        checksumSha256: request.checksumSha256,
        serverSideEncryption: request.serverSideEncryption,
        objectLockMode: request.objectLockMode,
        objectLockRetainUntil: request.objectLockRetainUntil,
        lastModified: now(),
        unreadable: null,
      });
      return { outcome: "created", versionId, checksumSha256: actual };
    },
  };

  const verifier: JournalVerifierTransport = {
    async listVersions(bucket: string, prefix: string): Promise<readonly JournalListedVersion[]> {
      if (bucket !== options.bucket) return [];
      return versions
        .filter((v) => v.key.startsWith(prefix))
        .map((v) => ({
          key: v.key,
          versionId: v.versionId,
          isDeleteMarker: v.isDeleteMarker,
          size: Buffer.byteLength(v.body, "utf8"),
          lastModified: v.lastModified,
        }))
        .sort((a, b) => (a.key === b.key ? a.versionId.localeCompare(b.versionId) : a.key.localeCompare(b.key)));
    },

    async getObjectVersion(bucket: string, key: string, versionId: string): Promise<JournalReadResult> {
      if (bucket !== options.bucket) return { outcome: "unreadable", code: "NoSuchBucket" };
      const found = versions.find((v) => v.key === key && v.versionId === versionId);
      if (!found) return { outcome: "unreadable", code: "NoSuchVersion" };
      if (found.isDeleteMarker) return { outcome: "unreadable", code: "MethodNotAllowed:DeleteMarker" };
      if (found.unreadable) return { outcome: "unreadable", code: found.unreadable };
      return {
        outcome: "read",
        body: found.body,
        checksumSha256: found.checksumSha256,
        serverSideEncryption: found.serverSideEncryption,
        objectLockMode: found.objectLockMode,
        objectLockRetainUntil: found.objectLockRetainUntil,
      };
    },
  };

  const purger: JournalPurgeTransport = {
    async deleteObjectVersion(
      bucket: string,
      key: string,
      versionId: string
    ): Promise<JournalDeleteResult> {
      if (bucket !== options.bucket) return { outcome: "refused", code: "NoSuchBucket" };

      const injected = takeFailure(key);
      if (injected) {
        return injected.as === "unknown"
          ? { outcome: "unknown", code: injected.code }
          : { outcome: "refused", code: injected.code };
      }

      const index = versions.findIndex((v) => v.key === key && v.versionId === versionId);
      if (index === -1) return { outcome: "deleted" }; // S3 delete is idempotent.
      const target = versions[index] as StoredVersion;

      // COMPLIANCE mode. No principal — not the purge role, not the account
      // root — can delete a version before its retain-until has passed.
      if (
        target.objectLockMode === "COMPLIANCE" &&
        target.objectLockRetainUntil !== null &&
        target.objectLockRetainUntil.getTime() > now().getTime()
      ) {
        return { outcome: "refused", code: "AccessDenied:ObjectLockRetention" };
      }

      versions.splice(index, 1);
      return { outcome: "deleted" };
    },
  };

  const requireVersion = (key: string): StoredVersion => {
    const found = live(key)[0];
    if (!found) throw new Error(`fake S3 tamper: no live version at ${key}`);
    return found;
  };

  const tamper: FakeS3Tamper = {
    addSecondVersion(key, body) {
      const base = requireVersion(key);
      versions.push({
        ...base,
        versionId: nextVersionId(),
        body,
        checksumSha256: sha256Base64(body),
        lastModified: now(),
      });
    },
    addDeleteMarker(key) {
      versions.push({
        key,
        versionId: nextVersionId(),
        isDeleteMarker: true,
        body: "",
        checksumSha256: null,
        serverSideEncryption: null,
        objectLockMode: null,
        objectLockRetainUntil: null,
        lastModified: now(),
        unreadable: null,
      });
    },
    removeVersion(key) {
      const index = versions.findIndex((v) => v.key === key && !v.isDeleteMarker);
      if (index === -1) throw new Error(`fake S3 tamper: no live version at ${key}`);
      versions.splice(index, 1);
    },
    corrupt(key, code = "InternalError") {
      requireVersion(key).unreadable = code;
    },
    rewriteBody(key, body) {
      requireVersion(key).body = body;
    },
    setRetainUntil(key, retainUntil) {
      requireVersion(key).objectLockRetainUntil = retainUntil;
    },
    setEncryption(key, sse) {
      requireVersion(key).serverSideEncryption = sse;
    },
    setLockMode(key, mode) {
      requireVersion(key).objectLockMode = mode;
    },
  };

  return Object.freeze({
    bucket: options.bucket,
    writer,
    verifier,
    purger,
    tamper,
    get puts() {
      return puts;
    },
    keys: () => [...new Set(versions.filter((v) => !v.isDeleteMarker).map((v) => v.key))].sort(),
    versionCount: (key: string) => versions.filter((v) => v.key === key).length,
    failNext: (failure: FakeS3Failure) =>
      failures.push({ ...failure, remaining: failure.times ?? Number.POSITIVE_INFINITY }),
    setClock: (clock: () => Date) => {
      now = clock;
    },
  });
}
