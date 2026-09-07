// Phase 10b-1 Task 5.2 — the AWS SDK v3 adapter for the deletion journal.
//
// This is the ONLY file in the tree that imports `@aws-sdk/client-s3` (R-124
// pins the SDK; the version is pinned in the lockfile). Everything else talks
// to the three narrow transports in `deletion-journal.ts`, so swapping the
// object store is a new adapter plus a decision, not a rewrite.
//
// THE PRINCIPAL SPLIT IS THE POINT. R-124 gives the journal three IAM
// principals — a create-only writer, a read-only restore/verifier, and a purge
// role that may delete an exact version only after Object Lock expires. Each
// factory below returns an object exposing ONLY that principal's verb, built
// over its OWN client and credentials. A caller holding the writer cannot
// reach a delete: the method does not exist to call. That is the code-side
// mirror of the IAM policies in `infra/s3-deletion-journal/`, and it is what
// makes "the writer cannot delete" checkable without an AWS account.
//
// Field-verified against @aws-sdk/client-s3 3.1127.0's own type definitions
// (`PutObjectRequest.IfNoneMatch / ObjectLockMode / ObjectLockRetainUntilDate /
// ServerSideEncryption / ChecksumSHA256`, `PutObjectOutput.VersionId /
// ChecksumSHA256`, `ListObjectVersionsOutput.Versions / DeleteMarkers`), not
// from recall.
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

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

export type S3JournalClientOptions = Readonly<{
  region: string;
  /** Local S3-compatible endpoint for contract tests. Never set in production. */
  endpoint?: string;
  forcePathStyle?: boolean;
  /**
   * Omitted in production so the SDK resolves the instance role. Present only
   * for a local S3-compatible harness.
   */
  credentials?: Readonly<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }>;
  maxAttempts?: number;
}>;

export function createS3JournalClient(options: S3JournalClientOptions): S3Client {
  const config: S3ClientConfig = {
    region: options.region,
    // TLS is not optional: R-124's bucket policy denies non-TLS access, and an
    // http endpoint here would fail at the bucket rather than silently
    // downgrade — but refusing locally is clearer than a policy denial.
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
    ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
    // ONE attempt by default. The SDK's standard retry would re-send a PUT
    // whose 200 was lost, S3 would answer 412 against OUR OWN object, and
    // `classifyS3Error` would report a definitive `precondition` — a conflict
    // for a write that succeeded, which is worse than an honest `unknown`.
    //
    // NOTE: this raises how often `unknown` is reported, and the worker cannot
    // yet reconcile one — the writer transport has no read verb and
    // `deletion-lifecycle.ts` discards the `reconciliationKey`. That gap is the
    // journal-PUT/Postgres-COMMIT orphan window recorded in the plan's Deferral
    // ledger and in respin-finish-open-items.md; do not read this comment as a
    // claim that a reconciliation path exists (round-2 billing CHANGE).
    maxAttempts: options.maxAttempts ?? 1,
  };
  if (options.endpoint !== undefined && !/^https:\/\//.test(options.endpoint) && !isLoopback(options.endpoint)) {
    throw new Error(
      `deletion journal endpoint "${options.endpoint}" is not https and is not loopback; the journal refuses plaintext transport`
    );
  }
  return new S3Client(config);
}

function isLoopback(endpoint: string): boolean {
  try {
    const { hostname } = new URL(endpoint);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Error classification — the honesty boundary
// ---------------------------------------------------------------------------

type ClassifiedError = Readonly<{ kind: "precondition" | "refused" | "unknown"; code: string }>;

function statusOf(error: unknown): number | null {
  const meta = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata;
  return typeof meta?.httpStatusCode === "number" ? meta.httpStatusCode : null;
}

function nameOf(error: unknown): string {
  const named = error as { name?: unknown; Code?: unknown } | null;
  if (typeof named?.name === "string" && named.name.length > 0) return named.name;
  if (typeof named?.Code === "string" && named.Code.length > 0) return named.Code;
  return "UnknownError";
}

/**
 * The classification that decides whether an irreversible erasure may proceed,
 * so it errs toward `unknown` — the outcome that forces reconciliation — and
 * never toward `refused`, which the caller reads as a definitive answer.
 *
 * `409 ConditionalRequestConflict` is `unknown` on purpose: S3 returns it when
 * a concurrent conditional write is in flight against the same key, so we do
 * not know whether our object or the other one won, and therefore do not know
 * which version id the receipt should name.
 */
export function classifyS3Error(error: unknown): ClassifiedError {
  const name = nameOf(error);
  const status = statusOf(error);

  if (name === "PreconditionFailed" || status === 412) {
    return { kind: "precondition", code: "PreconditionFailed" };
  }
  if (name === "ConditionalRequestConflict" || status === 409) {
    return { kind: "unknown", code: "ConditionalRequestConflict" };
  }
  if (
    name === "TimeoutError" ||
    name === "RequestTimeout" ||
    name === "AbortError" ||
    name === "NetworkingError" ||
    (typeof status === "number" && status >= 500)
  ) {
    return { kind: "unknown", code: name };
  }
  if (typeof status === "number" && status >= 400 && status < 500) {
    return { kind: "refused", code: name };
  }
  // No status at all means the request may never have left this process — or
  // may have been answered and lost. Unknown, not refused.
  return { kind: "unknown", code: name };
}

// ---------------------------------------------------------------------------
// Writer principal — create only
// ---------------------------------------------------------------------------

export function s3JournalWriter(client: S3Client): JournalWriterTransport {
  return Object.freeze({
    async putObject(request: JournalPutRequest): Promise<JournalPutResult> {
      try {
        const response = await client.send(
          new PutObjectCommand({
            Bucket: request.bucket,
            Key: request.key,
            Body: request.body,
            ContentType: request.contentType,
            ChecksumAlgorithm: "SHA256",
            ChecksumSHA256: request.checksumSha256,
            ServerSideEncryption: request.serverSideEncryption,
            ObjectLockMode: request.objectLockMode,
            ObjectLockRetainUntilDate: request.objectLockRetainUntil,
            IfNoneMatch: request.ifNoneMatch,
          })
        );
        const versionId = response.VersionId;
        if (typeof versionId !== "string" || versionId.length === 0 || versionId === "null") {
          // No version id means Versioning is not enabled on this bucket, so
          // the object is overwritable and the append-only promise is void.
          return { outcome: "refused", code: "VersioningNotEnabled" };
        }
        return {
          outcome: "created",
          versionId,
          checksumSha256: response.ChecksumSHA256 ?? "",
        };
      } catch (error) {
        const classified = classifyS3Error(error);
        if (classified.kind === "precondition") return { outcome: "precondition_failed" };
        return classified.kind === "refused"
          ? { outcome: "refused", code: classified.code }
          : { outcome: "unknown", code: classified.code };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Verifier principal — list and get only
// ---------------------------------------------------------------------------

export function s3JournalVerifier(client: S3Client): JournalVerifierTransport {
  return Object.freeze({
    async listVersions(bucket: string, prefix: string): Promise<readonly JournalListedVersion[]> {
      const collected: JournalListedVersion[] = [];
      let keyMarker: string | undefined;
      let versionIdMarker: string | undefined;

      // Paginated on purpose: a truncated listing that silently stops would
      // hide exactly the extra version or delete marker the verifier exists to
      // find, and would report a clean chain over a damaged one.
      for (;;) {
        const response = await client.send(
          new ListObjectVersionsCommand({
            Bucket: bucket,
            Prefix: prefix,
            ...(keyMarker === undefined ? {} : { KeyMarker: keyMarker }),
            ...(versionIdMarker === undefined ? {} : { VersionIdMarker: versionIdMarker }),
          })
        );
        for (const version of response.Versions ?? []) {
          if (typeof version.Key !== "string" || typeof version.VersionId !== "string") continue;
          collected.push({
            key: version.Key,
            versionId: version.VersionId,
            isDeleteMarker: false,
            size: version.Size ?? 0,
            lastModified: version.LastModified ?? new Date(0),
          });
        }
        for (const marker of response.DeleteMarkers ?? []) {
          if (typeof marker.Key !== "string" || typeof marker.VersionId !== "string") continue;
          collected.push({
            key: marker.Key,
            versionId: marker.VersionId,
            isDeleteMarker: true,
            size: 0,
            lastModified: marker.LastModified ?? new Date(0),
          });
        }
        if (response.IsTruncated !== true) break;
        keyMarker = response.NextKeyMarker;
        versionIdMarker = response.NextVersionIdMarker;
        if (keyMarker === undefined && versionIdMarker === undefined) break;
      }
      return collected;
    },

    async getObjectVersion(
      bucket: string,
      key: string,
      versionId: string
    ): Promise<JournalReadResult> {
      try {
        const response = await client.send(
          // `ChecksumMode: "ENABLED"` is REQUIRED to get the checksum back. The
          // installed SDK's own type documentation says so
          // (@aws-sdk/client-s3 3.1127.0, GetObjectRequest.ChecksumMode: "To
          // retrieve the checksum, this mode must be enabled."). Without it
          // `ChecksumSHA256` is undefined, the verifier compares null against a
          // real digest, and EVERY object on a healthy journal reports
          // `checksum_mismatch` — restore refuses and day-28 purge never runs
          // (Task 5 round-1 security H1 / billing BLOCK 2).
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            VersionId: versionId,
            ChecksumMode: "ENABLED",
          })
        );
        if (!response.Body) return { outcome: "unreadable", code: "EmptyBody" };
        return {
          outcome: "read",
          body: await response.Body.transformToString("utf8"),
          checksumSha256: response.ChecksumSHA256 ?? null,
          serverSideEncryption: response.ServerSideEncryption ?? null,
          objectLockMode: response.ObjectLockMode ?? null,
          objectLockRetainUntil: response.ObjectLockRetainUntilDate ?? null,
        };
      } catch (error) {
        return { outcome: "unreadable", code: classifyS3Error(error).code };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Purge principal — delete an exact version, only after the lock expires
// ---------------------------------------------------------------------------

export function s3JournalPurger(client: S3Client): JournalPurgeTransport {
  return Object.freeze({
    async deleteObjectVersion(
      bucket: string,
      key: string,
      versionId: string
    ): Promise<JournalDeleteResult> {
      try {
        // VersionId is REQUIRED. A DeleteObject without it writes a delete
        // marker instead of removing anything, which is the one outcome the
        // purge role must never produce: a marker hides a journal version the
        // restore verifier then reports as damage.
        if (typeof versionId !== "string" || versionId.length === 0) {
          return { outcome: "refused", code: "VersionIdRequired" };
        }
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId })
        );
        return { outcome: "deleted" };
      } catch (error) {
        const classified = classifyS3Error(error);
        return classified.kind === "unknown"
          ? { outcome: "unknown", code: classified.code }
          : { outcome: "refused", code: classified.code };
      }
    },
  });
}
