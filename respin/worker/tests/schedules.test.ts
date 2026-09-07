import { describe, expect, it } from "vitest";

import {
  YOUTUBE_DISCOVERY_EVIDENCE_BLOCKER,
  runRefresh,
} from "../refresh";
import {
  RESEND_DELIVERY_EVIDENCE_BLOCKER,
  composeWeeklyDigest,
  runWeeklyDigest,
  unavailableDigestDelivery,
} from "../weekly-digest";

describe("scheduler-neutral refresh", () => {
  it("names the live YouTube discovery blocker instead of returning fake success", async () => {
    const result = await runRefresh(
      { runId: "refresh-1", nicheId: "niche-1", scheduledAt: "2026-09-02T00:00:00.000Z" },
      {
        async discover() {
          return YOUTUBE_DISCOVERY_EVIDENCE_BLOCKER;
        },
      },
    );
    expect(result).toEqual(YOUTUBE_DISCOVERY_EVIDENCE_BLOCKER);
  });

  it("accepts only non-negative nested refresh populations", async () => {
    await expect(runRefresh(
      { runId: "refresh-2", nicheId: "niche-1", scheduledAt: "2026-09-02T00:00:00.000Z" },
      { async discover() {
        return {
          status: "completed",
          discoveredCount: 3,
          metadataStoredCount: 2,
          transcriptReadyCount: 1,
        };
      } },
    )).resolves.toMatchObject({ discoveredCount: 3, metadataStoredCount: 2 });
    await expect(runRefresh(
      { runId: "refresh-3", nicheId: "niche-1", scheduledAt: "2026-09-02T00:00:00.000Z" },
      { async discover() {
        return {
          status: "completed",
          discoveredCount: 1,
          metadataStoredCount: 2,
          transcriptReadyCount: 0,
        };
      } },
    )).rejects.toThrow(/nested populations/i);
  });
});

describe("weekly digest composition and delivery honesty", () => {
  it("composes a deterministic digest without sending it", () => {
    const digest = composeWeeklyDigest({
      digestId: "digest-1",
      weekStart: "2026-08-31",
      nicheLabel: "Home cooking",
      items: [
        {
          title: "Three-pan weeknight prep",
          url: "https://example.test/a",
          outlier: {
            ratio: 2.4,
            baseline: 1_200,
            baselineSampleSize: 12,
            window: {
              startsAt: "2026-08-01T00:00:00.000Z",
              endsAt: "2026-08-31T00:00:00.000Z",
            },
          },
        },
      ],
    });
    expect(digest.subject).toContain("Home cooking");
    expect(digest.text).toContain("2.4x");
    expect(digest.text).toContain("baseline 1200 from 12 recent items");
    expect(digest.text).toContain("2026-08-01T00:00:00.000Z through 2026-08-31T00:00:00.000Z");
    expect(digest.text).toContain("https://example.test/a");
  });

  it("refuses a ratio whose denominator evidence is missing", () => {
    expect(() => composeWeeklyDigest({
      digestId: "digest-partial",
      weekStart: "2026-08-31",
      nicheLabel: "Home cooking",
      items: [{
        title: "Partial measurement",
        url: "https://example.test/partial",
        outlier: { ratio: 2.4 },
      } as never],
    })).toThrow(/baseline/i);
  });

  it("refuses an impossible digest weekStart calendar date", () => {
    expect(() =>
      composeWeeklyDigest({
        digestId: "digest-1",
        weekStart: "2025-02-29",
        nicheLabel: "Home cooking",
        items: [],
      }),
    ).toThrow(/calendar date/i);
  });

  it("returns the named Resend evidence blocker when delivery is unavailable", async () => {
    const result = await unavailableDigestDelivery.deliver({
      digestId: "digest-1",
      subject: "subject",
      text: "body",
    });
    expect(result).toEqual(RESEND_DELIVERY_EVIDENCE_BLOCKER);
  });

  it("composes through the sender port and rejects a false sender success", async () => {
    const input = {
      digestId: "digest-2",
      weekStart: "2026-08-31",
      nicheLabel: "Home cooking",
      items: [],
    } as const;
    await expect(runWeeklyDigest(input, {
      async deliver(digest) {
        expect(digest.subject).toContain("Home cooking");
        return { status: "delivered", deliveryId: "delivery-1" };
      },
    })).resolves.toEqual({ status: "delivered", deliveryId: "delivery-1" });
    await expect(runWeeklyDigest(input, {
      async deliver() {
        return { status: "delivered", deliveryId: "  " };
      },
    })).rejects.toThrow(/deliveryId is required/i);
  });
});
