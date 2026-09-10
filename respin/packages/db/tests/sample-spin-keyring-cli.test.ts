import { describe, expect, it, vi } from "vitest";
import { publicSampleSpinBuckets } from "../src/public-sample-spin-schema";
import { main } from "../src/sample-spin-keyring-cli";
import { createTestDb } from "../src/testing";

const KEYS = `v2=${"b".repeat(64)};v1=${"a".repeat(64)}`;

describe("pnpm sample-spin:keyring", () => {
  it("says the prior key must be KEPT while a bucket under it is live, and MAY be erased once the last one expires", async () => {
    const db = await createTestDb();
    const now = new Date("2026-09-09T12:00:00Z");
    await db.insert(publicSampleSpinBuckets).values({
      ipHmac: "c".repeat(64), keyVersion: "v1", bucketStartedAt: now, expiresAt: new Date(now.getTime() + 3_600_000), admitted: 1,
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const open = () => Object.assign(db, { $client: { end: async () => {} } });
    try {
      expect(await main({ RESPIN_PUBLIC_SAMPLE_SPIN_HMAC_KEYS: KEYS, DATABASE_URL: "postgres://unused" }, open, now)).toBe(3);
      expect(log.mock.calls.at(-1)?.[0]).toContain("keep it");
      expect(await main({ RESPIN_PUBLIC_SAMPLE_SPIN_HMAC_KEYS: KEYS, DATABASE_URL: "postgres://unused" }, open, new Date(now.getTime() + 2 * 3_600_000))).toBe(0);
      expect(log.mock.calls.at(-1)?.[0]).toContain("MAY be erased");
      // Never a key: only versions are printed.
      for (const call of log.mock.calls) expect(String(call[0])).not.toMatch(/[ab]{64}/);
      expect(await main({ RESPIN_PUBLIC_SAMPLE_SPIN_HMAC_KEYS: `v2=${"b".repeat(64)}` }, open, now)).toBe(0);
      expect(await main({}, open, now)).toBe(0);
    } finally {
      log.mockRestore();
    }
  });
});
