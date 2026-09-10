// Phase 10a plan C4: the DB-atomic public limiter, composed with C3's spend
// reservation in ONE transaction (R-117, R-123).
//
// What one admission decides, in order, under one advisory lock:
//   1. global concurrency — at most PUBLIC_SAMPLE_SPIN_MAX_CONCURRENT reserved
//      public claims still in flight (no usage row, younger than the lease);
//   2. the visitor's bucket — the unexpired row for EITHER the current or the
//      immediately prior key version, locked together so a rotation cannot
//      mint two windows for one address;
//   3. the money — `claimSystemSpendInTx` reserves the R-123 worst case
//      against the purpose sub-cap and the global cap.
// Only a CLAIMED reservation consumes the bucket. A refusal for the product's
// own reasons (concurrency, budget) leaves the window untouched, so the
// visitor's one admission is not spent by our load; a bucket already spent is
// `bucket_exhausted` before any money moves.
//
// The raw IP never reaches this module: the caller resolves it through the
// proxy-ATTESTED authority (`@respin/auth`'s `proxyAttestedClientIp`, `null`
// with no trusted proxy configured) and this module keys the row by HMAC only.
import { createHmac } from "node:crypto";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import type { DbLike, TxLike } from "./db-like";
import { publicSampleSpinBuckets } from "./public-sample-spin-schema";
import {
  claimSystemSpendInTx,
  publicSampleSpinInFlightCount,
  PUBLIC_SAMPLE_SPIN_MAX_CONCURRENT,
  type SystemSpendClaim,
} from "./system-spend";
import { systemSpendClaims } from "./system-spend-schema";

export const PUBLIC_SAMPLE_SPIN_HMAC_KEYS_ENV = "RESPIN_PUBLIC_SAMPLE_SPIN_HMAC_KEYS";
/** R-117: a bucket lives at most 24 hours from the request that opened it. */
export const PUBLIC_SAMPLE_SPIN_BUCKET_MS = 24 * 60 * 60_000;
/** A key is at least 32 bytes of hex; anything shorter is refused at parse. */
const KEY_MIN_HEX = 64;
const KEY_VERSION = /^v[0-9]{1,4}$/;
/** The bucket every request shares when no trusted proxy resolved an address (fail-closed, R-26). */
export const NO_TRUSTED_IP = "no-trusted-ip";

export type PublicSampleSpinKey = Readonly<{ version: string; key: string }>;
export type PublicSampleSpinKeyring = Readonly<{
  current: PublicSampleSpinKey;
  /**
   * The immediately prior version, kept only until the last bucket opened
   * under it expires (at most 24 hours after rotation); `priorKeyVersionRetired`
   * is the independent probe that says when it may be erased. Never older.
   */
  prior: PublicSampleSpinKey | null;
}>;

export class PublicSampleSpinKeyringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicSampleSpinKeyringError";
  }
}

/**
 * `RESPIN_PUBLIC_SAMPLE_SPIN_HMAC_KEYS="v2=<hex>;v1=<hex>"` — the CURRENT key
 * first, an optional single prior key second. Unset or blank = the public
 * Sample Spin cannot admit anyone (the caller refuses `disabled`).
 */
export function parsePublicSampleSpinKeyring(raw: string | undefined): PublicSampleSpinKeyring | null {
  const text = (raw ?? "").trim();
  if (text.length === 0) return null;
  const entries = text.split(";").map((part) => part.trim()).filter((part) => part.length > 0);
  if (entries.length < 1 || entries.length > 2) {
    throw new PublicSampleSpinKeyringError(`${PUBLIC_SAMPLE_SPIN_HMAC_KEYS_ENV} names one current key and at most one prior key`);
  }
  const keys = entries.map((entry) => {
    const at = entry.indexOf("=");
    const version = at < 0 ? "" : entry.slice(0, at).trim();
    const key = at < 0 ? "" : entry.slice(at + 1).trim();
    if (!KEY_VERSION.test(version)) throw new PublicSampleSpinKeyringError(`${PUBLIC_SAMPLE_SPIN_HMAC_KEYS_ENV} key version must match ${KEY_VERSION}`);
    if (!/^[0-9a-f]+$/i.test(key) || key.length < KEY_MIN_HEX) {
      throw new PublicSampleSpinKeyringError(`${PUBLIC_SAMPLE_SPIN_HMAC_KEYS_ENV} key ${version} must be at least ${KEY_MIN_HEX} hex characters`);
    }
    return { version, key: key.toLowerCase() };
  });
  if (keys.length === 2 && keys[0]!.version === keys[1]!.version) {
    throw new PublicSampleSpinKeyringError(`${PUBLIC_SAMPLE_SPIN_HMAC_KEYS_ENV} current and prior key versions must differ`);
  }
  return { current: keys[0]!, prior: keys[1] ?? null };
}

/** HMAC-SHA256 over the version-labelled canonical address; the only thing stored. */
export function ipBucketDigest(key: PublicSampleSpinKey, canonicalIp: string | null): string {
  return createHmac("sha256", Buffer.from(key.key, "hex"))
    .update(`public-sample-spin:${key.version}\0${canonicalIp ?? NO_TRUSTED_IP}`, "utf8")
    .digest("hex");
}

export type PublicSampleSpinAdmission =
  | { status: "admitted"; bucketId: string }
  /** The attempt id was claimed before; `claimStatus` says whether that claim ever reserved money. */
  | { status: "duplicate"; bucketId: string | null; claimStatus: "reserved" | "cap_exhausted" }
  | { status: "bucket_exhausted" }
  | { status: "concurrency_exhausted" }
  | { status: "budget_exhausted" };

export type PublicSampleSpinAdmissionInput = Readonly<{
  canonicalIp: string | null;
  keyring: PublicSampleSpinKeyring;
  now: Date;
  /** The R-123 worst-case reservation, purpose `public_sample_spin`. */
  claim: SystemSpendClaim;
}>;

const LIMITER_LOCK = sql`select pg_advisory_xact_lock(hashtext('public_sample_spin_limiter'))`;

export async function admitPublicSampleSpin(
  db: DbLike,
  input: PublicSampleSpinAdmissionInput,
): Promise<PublicSampleSpinAdmission> {
  if (input.claim.attribution.purpose !== "public_sample_spin") {
    throw new Error("the public limiter admits only public_sample_spin claims");
  }
  return db.transaction(async (tx) => {
    await tx.execute(LIMITER_LOCK);
    // A REPLAY of an attempt id already claimed is answered as a duplicate
    // before the bucket or the slots are judged: the same request must never
    // be blocked by the window its own first delivery consumed.
    const [replayed] = await tx
      .select({ id: systemSpendClaims.id, status: systemSpendClaims.status })
      .from(systemSpendClaims)
      .where(eq(systemSpendClaims.jobAttemptId, input.claim.jobAttemptId))
      .limit(1);
    if (replayed) {
      const existing = await lockCurrentBucket(tx, input);
      return { status: "duplicate", bucketId: existing?.id ?? null, claimStatus: replayed.status };
    }
    if ((await publicSampleSpinInFlightCount(tx)) >= PUBLIC_SAMPLE_SPIN_MAX_CONCURRENT) {
      return { status: "concurrency_exhausted" };
    }
    const bucket = await lockCurrentBucket(tx, input);
    if (bucket && bucket.admitted >= 1) {
      await tx
        .update(publicSampleSpinBuckets)
        .set({ blocked: sql`${publicSampleSpinBuckets.blocked} + 1`, updatedAt: input.now })
        .where(eq(publicSampleSpinBuckets.id, bucket.id));
      return { status: "bucket_exhausted" };
    }
    const claimed = await claimSystemSpendInTx(tx, input.claim);
    if (claimed.status === "duplicate") return { status: "duplicate", bucketId: bucket?.id ?? null, claimStatus: "reserved" };
    if (claimed.status === "cap_exhausted") return { status: "budget_exhausted" };
    // Every window is opened with its one admission spent, and a found window
    // was refused above, so reaching here means: no live window for this
    // address — open one.
    const [opened] = await tx
      .insert(publicSampleSpinBuckets)
      .values({
        ipHmac: ipBucketDigest(input.keyring.current, input.canonicalIp),
        keyVersion: input.keyring.current.version,
        bucketStartedAt: input.now,
        expiresAt: new Date(input.now.getTime() + PUBLIC_SAMPLE_SPIN_BUCKET_MS),
        admitted: 1,
        updatedAt: input.now,
      })
      .returning({ id: publicSampleSpinBuckets.id });
    return { status: "admitted", bucketId: opened!.id };
  });
}

/**
 * Both candidate digests, locked in one statement. If either version has an
 * unexpired row, THAT row is the visitor's one bucket (the earliest-opened if
 * two exist across a rotation edge); otherwise null and the caller creates
 * only the current-version row.
 */
async function lockCurrentBucket(tx: TxLike, input: PublicSampleSpinAdmissionInput) {
  const candidates = [
    { version: input.keyring.current.version, digest: ipBucketDigest(input.keyring.current, input.canonicalIp) },
    ...(input.keyring.prior
      ? [{ version: input.keyring.prior.version, digest: ipBucketDigest(input.keyring.prior, input.canonicalIp) }]
      : []),
  ];
  const match = or(
    ...candidates.map((c) => and(eq(publicSampleSpinBuckets.keyVersion, c.version), eq(publicSampleSpinBuckets.ipHmac, c.digest))),
  );
  const rows = await tx
    .select({ id: publicSampleSpinBuckets.id, admitted: publicSampleSpinBuckets.admitted })
    .from(publicSampleSpinBuckets)
    .where(and(match, gt(publicSampleSpinBuckets.expiresAt, input.now)))
    .orderBy(asc(publicSampleSpinBuckets.bucketStartedAt))
    .for("update");
  return rows[0] ?? null;
}

/** A terminal outcome after admission: counted on the bucket, never extending it. */
export async function recordPublicSampleSpinOutcome(
  db: DbLike,
  bucketId: string,
  outcome: "refused" | "duplicate",
  now: Date,
): Promise<void> {
  await db
    .update(publicSampleSpinBuckets)
    .set(
      outcome === "refused"
        ? { refused: sql`${publicSampleSpinBuckets.refused} + 1`, updatedAt: now }
        : { duplicate: sql`${publicSampleSpinBuckets.duplicate} + 1`, updatedAt: now },
    )
    .where(eq(publicSampleSpinBuckets.id, bucketId));
}

/**
 * The independent probe before a prior key's material is erased: true only
 * when no unexpired bucket was opened under that version. Until then the
 * prior key must stay, or a visitor mid-window could be admitted twice.
 */
export async function priorKeyVersionRetired(db: DbLike, version: string, now: Date): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(publicSampleSpinBuckets)
    .where(and(eq(publicSampleSpinBuckets.keyVersion, version), gt(publicSampleSpinBuckets.expiresAt, now)));
  return (row?.count ?? 0) === 0;
}
