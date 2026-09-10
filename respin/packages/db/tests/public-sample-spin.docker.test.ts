// The public limiter under REAL concurrency (Phase 10a plan C4; billing gate
// round 1 CHANGE 2). PGlite is one in-process connection where the advisory
// lock can never contend, so the atomicity the limiter promises — one window
// per address, two slots product-wide, one window across a key rotation —
// is only proven here. Loud skip without TEST_DATABASE_URL (CI provides it).
//
// EXECUTED MUTATION (2026-09-09, live Postgres): with the `LIMITER_LOCK`
// execute replaced by `void LIMITER_LOCK`, all three cases went red — six of
// six racing addresses were admitted against two slots, and the one-address
// races died on the unique index as a failed INSERT instead of a clean
// `bucket_exhausted`. Restored, all three are green. The lock is what carries
// the property; the index is only the last line.
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PUBLIC_SAMPLE_SPIN_DAILY_CODE_CEILING_MICRO_USD, type SystemSpendClaim } from "../src/system-spend";
import { systemSpendClaims } from "../src/system-spend-schema";
import { admitPublicSampleSpin, parsePublicSampleSpinKeyring } from "../src/public-sample-spin";
import { publicSampleSpinBuckets } from "../src/public-sample-spin-schema";
import { createDockerTestDb } from "../src/testing";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[public-sample-spin.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: the public limiter under real concurrency (one window per address across " +
      "eight racing admissions; at most two admitted across six racing addresses; one window across a " +
      "key rotation with racing old/new keyrings).",
  );
}

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

function claim(id: string): SystemSpendClaim {
  return {
    jobAttemptId: `sample:${id}`,
    businessDate: new Date().toISOString().slice(0, 10),
    capMicroUsd: 100_000_000n,
    reserveMicroUsd: 618_560n,
    attribution: { purpose: "public_sample_spin", jobId: id, model: "m" },
    purposeCapMicroUsd: PUBLIC_SAMPLE_SPIN_DAILY_CODE_CEILING_MICRO_USD,
  };
}

describe.skipIf(!MAINTENANCE_URL)("the public limiter under REAL concurrency", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;

  beforeAll(async () => {
    harness = await createDockerTestDb(MAINTENANCE_URL as string, "respin_test_samplespin");
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  /** Pre-warm the pool so every racer holds a connection BEFORE the race (the credits suite's lesson). */
  async function prewarm(n: number): Promise<void> {
    const clients = await Promise.all(Array.from({ length: n }, () => harness.pool.connect()));
    for (const client of clients) client.release();
  }

  async function reset(): Promise<void> {
    await harness.db.delete(publicSampleSpinBuckets);
    await harness.db.delete(systemSpendClaims);
  }

  it("eight racing admissions for ONE address open exactly one window and reserve exactly one claim", async () => {
    await reset();
    await prewarm(8);
    const keyring = parsePublicSampleSpinKeyring(`v1=${KEY_A}`)!;
    const now = new Date();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => admitPublicSampleSpin(harness.db, { canonicalIp: "203.0.113.10", keyring, now, claim: claim(`one-${i}`) })),
    );
    expect(results.filter((r) => r.status === "admitted")).toHaveLength(1);
    expect(results.filter((r) => r.status === "bucket_exhausted")).toHaveLength(7);
    const [buckets] = await harness.db.select({ n: count() }).from(publicSampleSpinBuckets);
    expect(buckets!.n).toBe(1);
    const [reserved] = await harness.db.select({ n: count() }).from(systemSpendClaims).where(eq(systemSpendClaims.status, "reserved"));
    expect(reserved!.n).toBe(1);
  }, 30_000);

  it("six racing admissions from six addresses admit at most the two product-wide slots", async () => {
    await reset();
    await prewarm(6);
    const keyring = parsePublicSampleSpinKeyring(`v1=${KEY_A}`)!;
    const now = new Date();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => admitPublicSampleSpin(harness.db, { canonicalIp: `203.0.113.${20 + i}`, keyring, now, claim: claim(`six-${i}`) })),
    );
    expect(results.filter((r) => r.status === "admitted")).toHaveLength(2);
    expect(results.filter((r) => r.status === "concurrency_exhausted")).toHaveLength(4);
    const [reserved] = await harness.db.select({ n: count() }).from(systemSpendClaims).where(eq(systemSpendClaims.status, "reserved"));
    expect(reserved!.n).toBe(2);
    // A refused slot consumed no window.
    const [buckets] = await harness.db.select({ n: count() }).from(publicSampleSpinBuckets);
    expect(buckets!.n).toBe(2);
  }, 30_000);

  it("a key rotation under load: a window open under the PRIOR key is found by eight racing rotated admissions, and a fresh address still opens exactly one", async () => {
    await reset();
    await prewarm(8);
    const before = parsePublicSampleSpinKeyring(`v1=${KEY_A}`)!;
    const rotated = parsePublicSampleSpinKeyring(`v2=${KEY_B};v1=${KEY_A}`)!;
    const now = new Date();
    // Before the rotation: one window under v1, its attempt finished (so no slot is held).
    const opened = await admitPublicSampleSpin(harness.db, { canonicalIp: "203.0.113.40", keyring: before, now, claim: claim("rot-before") });
    expect(opened.status).toBe("admitted");
    await harness.db.update(systemSpendClaims).set({ createdAt: new Date(Date.now() - 400_000) });
    const results = await Promise.all([
      ...Array.from({ length: 8 }, (_, i) => admitPublicSampleSpin(harness.db, { canonicalIp: "203.0.113.40", keyring: rotated, now, claim: claim(`rot-${i}`) })),
      ...Array.from({ length: 4 }, (_, i) => admitPublicSampleSpin(harness.db, { canonicalIp: "203.0.113.41", keyring: rotated, now, claim: claim(`new-${i}`) })),
    ]);
    expect(results.slice(0, 8).filter((r) => r.status === "bucket_exhausted")).toHaveLength(8);
    expect(results.slice(8).filter((r) => r.status === "admitted")).toHaveLength(1);
    const [buckets] = await harness.db.select({ n: count() }).from(publicSampleSpinBuckets);
    expect(buckets!.n).toBe(2);
    // LIMITATION (recorded, 10a-R6): a process still running the PRE-rotation
    // keyring during a deploy overlap cannot see a window opened under v2, so
    // one extra admission per address is possible for the overlap's minutes.
  }, 30_000);
});
