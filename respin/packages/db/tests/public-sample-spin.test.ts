// Phase 10a plan C4: the DB-atomic public limiter. Keyring parsing, the HMAC
// that never carries the address, one admission per window, rotation with
// two candidate digests, the non-consuming refusals, the outcome counters,
// the prior-key probe, and the 24-hour sweep through the real receiver.
import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS, PUBLIC_SAMPLE_SPIN_DAILY_CODE_CEILING_MICRO_USD, claimSystemSpend, type SystemSpendClaim } from "../src/system-spend";
import { systemSpendClaims } from "../src/system-spend-schema";
import {
  NO_TRUSTED_IP,
  PUBLIC_SAMPLE_SPIN_BUCKET_MS,
  PublicSampleSpinKeyringError,
  admitPublicSampleSpin,
  ipBucketDigest,
  parsePublicSampleSpinKeyring,
  priorKeyVersionRetired,
  recordPublicSampleSpinOutcome,
} from "../src/public-sample-spin";
import { publicSampleSpinBuckets } from "../src/public-sample-spin-schema";
import { runRetentionTick } from "../src/retention-receiver";
import { createTestDb } from "../src/testing";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
// Real clock: the limiter's in-flight count reads the claims' DATABASE `created_at`.
const NOW = new Date();
const IP = "198.51.100.23";

/** The driver's SQLSTATE and constraint, from the wrapped cause a drizzle failure carries. */
async function refusal(run: () => Promise<unknown>): Promise<{ code?: string; constraint?: string } | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? (error as { code?: string; constraint?: string });
    return { code: cause.code, constraint: cause.constraint };
  }
}

function claim(id: string, purposeCap = PUBLIC_SAMPLE_SPIN_DAILY_CODE_CEILING_MICRO_USD): SystemSpendClaim {
  return {
    jobAttemptId: `sample:${id}`,
    businessDate: NOW.toISOString().slice(0, 10),
    capMicroUsd: 100_000_000n,
    reserveMicroUsd: 618_560n,
    attribution: { purpose: "public_sample_spin", jobId: id, model: "m" },
    purposeCapMicroUsd: purposeCap,
  };
}

describe("the keyring", () => {
  it("parses the current key and an optional prior key, refusing short keys, bad versions and duplicate versions", () => {
    expect(parsePublicSampleSpinKeyring(undefined)).toBeNull();
    expect(parsePublicSampleSpinKeyring("  ")).toBeNull();
    expect(parsePublicSampleSpinKeyring(`v2=${KEY_A};v1=${KEY_B}`)).toEqual({ current: { version: "v2", key: KEY_A }, prior: { version: "v1", key: KEY_B } });
    expect(parsePublicSampleSpinKeyring(`v1=${KEY_A.toUpperCase()}`)).toEqual({ current: { version: "v1", key: KEY_A }, prior: null });
    for (const bad of [`v1=${"a".repeat(63)}`, `one=${KEY_A}`, `v1=${KEY_A};v1=${KEY_B}`, `v1=${KEY_A};v0=${KEY_B};v9=${KEY_A}`, "v1=nothex"]) {
      expect(() => parsePublicSampleSpinKeyring(bad), bad).toThrow(PublicSampleSpinKeyringError);
    }
  });

  it("the digest depends on the version and the address, is 64 hex, and never contains the address", () => {
    const current = { version: "v1", key: KEY_A };
    const a = ipBucketDigest(current, IP);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("198");
    expect(ipBucketDigest({ version: "v2", key: KEY_A }, IP)).not.toBe(a);
    expect(ipBucketDigest(current, "198.51.100.24")).not.toBe(a);
    expect(ipBucketDigest(current, null)).toBe(ipBucketDigest(current, NO_TRUSTED_IP));
  });
});

describe("admitPublicSampleSpin", () => {
  const keyring = parsePublicSampleSpinKeyring(`v1=${KEY_A}`)!;

  it("admits once per address per 24 h: the second request is bucket_exhausted with no money moved, and a new window opens after expiry", async () => {
    const db = await createTestDb();
    const first = await admitPublicSampleSpin(db, { canonicalIp: IP, keyring, now: NOW, claim: claim("one") });
    expect(first.status).toBe("admitted");
    const second = await admitPublicSampleSpin(db, { canonicalIp: IP, keyring, now: new Date(NOW.getTime() + 60_000), claim: claim("two") });
    expect(second).toEqual({ status: "bucket_exhausted" });
    const [claims] = await db.select({ n: count() }).from(systemSpendClaims);
    expect(claims!.n).toBe(1);
    const [bucket] = await db.select().from(publicSampleSpinBuckets);
    expect(bucket).toMatchObject({ admitted: 1, blocked: 1, keyVersion: "v1" });
    // Counters never move the window.
    expect(bucket!.expiresAt.getTime()).toBe(NOW.getTime() + PUBLIC_SAMPLE_SPIN_BUCKET_MS);
    // Another address is its own window.
    const other = await admitPublicSampleSpin(db, { canonicalIp: "198.51.100.99", keyring, now: NOW, claim: claim("three") });
    expect(other.status).toBe("admitted");
    // After expiry, a separately identified new window. The two earlier
    // admissions are still reserved with no usage row: on the DATABASE clock
    // they occupy both slots until the lease passes, so age them first.
    await db.update(systemSpendClaims).set({ createdAt: new Date(Date.now() - PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS - 60_000) });
    const later = new Date(NOW.getTime() + PUBLIC_SAMPLE_SPIN_BUCKET_MS + 1);
    const again = await admitPublicSampleSpin(db, { canonicalIp: IP, keyring, now: later, claim: claim("four") });
    expect(again.status).toBe("admitted");
    const rows = await db.select().from(publicSampleSpinBuckets).where(eq(publicSampleSpinBuckets.ipHmac, ipBucketDigest(keyring.current, IP)));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.bucketStartedAt.getTime()).sort()).toEqual([NOW.getTime(), later.getTime()]);
  });

  it("ROTATION: a window opened under the prior key is found by the new keyring, so one address cannot mint two windows", async () => {
    const db = await createTestDb();
    const before = parsePublicSampleSpinKeyring(`v1=${KEY_A}`)!;
    await admitPublicSampleSpin(db, { canonicalIp: IP, keyring: before, now: NOW, claim: claim("pre") });
    const rotated = parsePublicSampleSpinKeyring(`v2=${KEY_B};v1=${KEY_A}`)!;
    const attempt = await admitPublicSampleSpin(db, { canonicalIp: IP, keyring: rotated, now: new Date(NOW.getTime() + 3_600_000), claim: claim("post") });
    expect(attempt).toEqual({ status: "bucket_exhausted" });
    const [buckets] = await db.select({ n: count() }).from(publicSampleSpinBuckets);
    expect(buckets!.n).toBe(1);
    // The prior key may not be erased while that window lives; afterwards it may.
    expect(await priorKeyVersionRetired(db, "v1", new Date(NOW.getTime() + 3_600_000))).toBe(false);
    expect(await priorKeyVersionRetired(db, "v1", new Date(NOW.getTime() + PUBLIC_SAMPLE_SPIN_BUCKET_MS + 1))).toBe(true);
    // NON-VACUITY: a keyring that DROPPED the prior key would mint a second window.
    const forgetful = parsePublicSampleSpinKeyring(`v2=${KEY_B}`)!;
    const minted = await admitPublicSampleSpin(db, { canonicalIp: IP, keyring: forgetful, now: new Date(NOW.getTime() + 3_600_000), claim: claim("forgot") });
    expect(minted.status).toBe("admitted");
  });

  it("concurrency and budget refusals leave the window untouched; a duplicate attempt id is a duplicate", async () => {
    const db = await createTestDb();
    // Two in-flight claims from other addresses fill the product-wide slots.
    await claimSystemSpend(db, claim("busy-1"));
    await claimSystemSpend(db, claim("busy-2"));
    const blocked = await admitPublicSampleSpin(db, { canonicalIp: IP, keyring, now: NOW, claim: claim("wait") });
    expect(blocked).toEqual({ status: "concurrency_exhausted" });
    let [buckets] = await db.select({ n: count() }).from(publicSampleSpinBuckets);
    expect(buckets!.n).toBe(0);
    // Budget: a $0 purpose cap refuses at the money; no window is opened.
    const fresh = await createTestDb();
    const broke = await admitPublicSampleSpin(fresh, { canonicalIp: IP, keyring, now: NOW, claim: claim("broke", 0n) });
    expect(broke).toEqual({ status: "budget_exhausted" });
    [buckets] = await fresh.select({ n: count() }).from(publicSampleSpinBuckets);
    expect(buckets!.n).toBe(0);
    // Duplicate: the same attempt id twice is a replay, not a second admission.
    const ok = await admitPublicSampleSpin(fresh, { canonicalIp: IP, keyring, now: NOW, claim: claim("dup") });
    expect(ok.status).toBe("admitted");
    const replay = await admitPublicSampleSpin(fresh, { canonicalIp: IP, keyring, now: NOW, claim: claim("dup") });
    expect(replay).toMatchObject({ status: "duplicate" });
    if (ok.status === "admitted") {
      await recordPublicSampleSpinOutcome(fresh, ok.bucketId, "duplicate", NOW);
      await recordPublicSampleSpinOutcome(fresh, ok.bucketId, "refused", NOW);
      const [bucket] = await fresh.select().from(publicSampleSpinBuckets);
      expect(bucket).toMatchObject({ admitted: 1, duplicate: 1, refused: 1, blocked: 0 });
    }
  });

  it("the schema refuses a raw-looking address, a window longer than 24 h and a second admission", async () => {
    const db = await createTestDb();
    const base = { keyVersion: "v1", bucketStartedAt: NOW, expiresAt: new Date(NOW.getTime() + PUBLIC_SAMPLE_SPIN_BUCKET_MS) };
    expect((await refusal(() => db.insert(publicSampleSpinBuckets).values({ ...base, ipHmac: IP })))?.constraint).toBe("public_sample_spin_buckets_digest_shape");
    expect((await refusal(() => db.insert(publicSampleSpinBuckets).values({ ...base, ipHmac: "c".repeat(64), expiresAt: new Date(NOW.getTime() + PUBLIC_SAMPLE_SPIN_BUCKET_MS + 1000) })))?.constraint).toBe("public_sample_spin_buckets_window_shape");
    expect((await refusal(() => db.insert(publicSampleSpinBuckets).values({ ...base, ipHmac: "c".repeat(64), admitted: 2 })))?.constraint).toBe("public_sample_spin_buckets_counts");
  });

  it("the traffic-independent receiver deletes a window 24 h after it opened, and leaves a live one", async () => {
    const db = await createTestDb();
    await admitPublicSampleSpin(db, { canonicalIp: IP, keyring, now: NOW, claim: claim("old") });
    await admitPublicSampleSpin(db, { canonicalIp: "198.51.100.50", keyring, now: new Date(NOW.getTime() + 12 * 3_600_000), claim: claim("new") });
    const tick = await runRetentionTick(db, new Date(NOW.getTime() + PUBLIC_SAMPLE_SPIN_BUCKET_MS + 60_000));
    expect(tick.failures).toEqual([]);
    const rows = await db.select().from(publicSampleSpinBuckets);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ipHmac).toBe(ipBucketDigest(keyring.current, "198.51.100.50"));
  });
});
