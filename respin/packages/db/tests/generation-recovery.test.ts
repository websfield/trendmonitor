// Phase 10b-1 Task 6.5 / C5 — the one-minute generation-attempt receiver.
//
// Every boundary here is about money that may or may not have been spent, so
// the negative property is asserted as hard as the positive one: NO AMBIGUOUS
// OUTBOUND CALL IS EVER RETRIED, and no candidate survives 24 hours.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { ensureUserWorkspace } from "../src/bootstrap";
import { creatorProfiles } from "../src/brain-schema";
import { generationAttempts } from "../src/generation-schema";
import {
  runGenerationRecoveryTick,
  ABANDONED_BEFORE_VENDOR,
  CLAIMED_ABANDON_MS,
  VENDOR_COMPLETE_HARD_CLEAR_MS,
  VENDOR_COMPLETE_SETTLE_MS,
  VENDOR_STARTED_GRACE_MS,
} from "../src/generation-recovery";

const now = new Date("2026-09-08T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const DEADLINE_MS = 120_000;
const SHA = "a".repeat(64);

describe("generation-attempt receiver", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "gr_user");
    workspaceId = (await ensureUserWorkspace(db, { authUserId: "gr_user", name: "GR" })).workspace.id;
    profileId = (
      await db.insert(creatorProfiles).values({ workspaceId, displayName: "P" }).returning()
    )[0]!.id;
  });

  const attempt = async (over: Partial<typeof generationAttempts.$inferInsert>) =>
    (
      await db
        .insert(generationAttempts)
        .values({
          profileId,
          workspaceId,
          attemptId: `att_${Math.random().toString(36).slice(2)}`,
          purpose: "generation",
          mode: "hook",
          payloadSha256: SHA,
          ...over,
        })
        .returning()
    )[0]!;

  const stateOf = async (id: string) =>
    (await db.select().from(generationAttempts).where(eq(generationAttempts.id, id)))[0]!;

  const tick = () => runGenerationRecoveryTick(db, now, { overallDeadlineMs: DEADLINE_MS });

  it("abandons a claim that never reached the vendor, with C5's exact refusal code", async () => {
    const stale = await attempt({ state: "claimed", claimedAt: ago(CLAIMED_ABANDON_MS + 1000) });
    const fresh = await attempt({ state: "claimed", claimedAt: ago(CLAIMED_ABANDON_MS - 1000) });

    const outcome = await tick();

    expect(outcome.abandonedBeforeVendor).toBe(1);
    const moved = await stateOf(stale.id);
    expect(moved.state).toBe("refused");
    // REQUIRED by `generation_attempts_refusal_reason`: a `refused` row without
    // a reason is refused by the schema, so omitting this would throw on every
    // sweep rather than fail quietly.
    expect(moved.refusalCode).toBe(ABANDONED_BEFORE_VENDOR);
    expect(moved.terminalAt).not.toBeNull();
    expect((await stateOf(fresh.id)).state).toBe("claimed");
  });

  it("flags a started attempt past deadline + 5 m as recovery_required and NEVER retries it", async () => {
    const past = await attempt({
      state: "vendor_started",
      vendorStartedAt: ago(DEADLINE_MS + VENDOR_STARTED_GRACE_MS + 1000),
    });
    const inside = await attempt({
      state: "vendor_started",
      vendorStartedAt: ago(DEADLINE_MS + VENDOR_STARTED_GRACE_MS - 1000),
    });

    const outcome = await tick();

    expect(outcome.startedPastDeadline).toBe(1);
    // `recovery_required`, NOT back to `claimed` and not re-dispatched: the
    // provider may have produced (and charged for) a completion this process
    // never saw, so a retry would be a second charge for one build.
    expect((await stateOf(past.id)).state).toBe("recovery_required");
    expect((await stateOf(inside.id)).state).toBe("vendor_started");
  });

  it("counts a settleable candidate but does not settle it — settlement has ONE author", async () => {
    const settleable = await attempt({
      state: "vendor_complete",
      // REQUIRED by `generation_attempts_candidate_iff_vendor_complete`, and
      // the reason the clear below is not decorative.
      candidate: { text: "a draft hook" },
      vendorStartedAt: ago(VENDOR_COMPLETE_SETTLE_MS + 60_000),
      vendorCompletedAt: ago(VENDOR_COMPLETE_SETTLE_MS + 1000),
    });

    const outcome = await tick();

    expect(outcome.settlementAttempted).toBe(1);
    // Untouched. A second writer on the debit path would be a second chance to
    // charge for one build, so this receiver only reports.
    expect((await stateOf(settleable.id)).state).toBe("vendor_complete");
  });

  it("hard-clears an unsettled candidate at 24 h — no candidate survives it", async () => {
    const stuck = await attempt({
      state: "vendor_complete",
      // REQUIRED by `generation_attempts_candidate_iff_vendor_complete`, and
      // the reason the clear below is not decorative.
      candidate: { text: "a draft hook" },
      vendorStartedAt: ago(VENDOR_COMPLETE_HARD_CLEAR_MS + 120_000),
      vendorCompletedAt: ago(VENDOR_COMPLETE_HARD_CLEAR_MS + 1000),
    });

    const outcome = await tick();

    expect(outcome.hardCleared).toBe(1);
    const cleared = await stateOf(stuck.id);
    expect(cleared.state).toBe("recovery_required");
    // "CLEARED atomically" (C5) — and the schema's equality CHECK refuses the
    // row otherwise, so leaving the candidate would abort the whole sweep.
    expect(cleared.candidate).toBeNull();
    // ...and it is NOT also counted as settleable: the clear runs first, so a
    // candidate that has just crossed 24 h is reported cleared, not settleable.
    expect(outcome.settlementAttempted).toBe(0);
  });

  it("is idempotent — a second tick moves nothing", async () => {
    await attempt({ state: "claimed", claimedAt: ago(CLAIMED_ABANDON_MS + 1000) });
    await attempt({
      state: "vendor_complete",
      // REQUIRED by `generation_attempts_candidate_iff_vendor_complete`, and
      // the reason the clear below is not decorative.
      candidate: { text: "a draft hook" },
      vendorStartedAt: ago(VENDOR_COMPLETE_HARD_CLEAR_MS + 120_000),
      vendorCompletedAt: ago(VENDOR_COMPLETE_HARD_CLEAR_MS + 1000),
    });

    const first = await tick();
    const second = await tick();

    expect(first.abandonedBeforeVendor + first.hardCleared).toBe(2);
    expect(second.abandonedBeforeVendor).toBe(0);
    expect(second.hardCleared).toBe(0);
    expect(second.startedPastDeadline).toBe(0);
  });

  it("moves the deadline with the CONFIG value it was given, not a hard-coded one", async () => {
    const started = await attempt({
      state: "vendor_started",
      vendorStartedAt: ago(300_000 + VENDOR_STARTED_GRACE_MS + 1000),
    });

    // Under a 600 s deadline this attempt is still inside its window...
    const generous = await runGenerationRecoveryTick(db, now, { overallDeadlineMs: 600_000 });
    expect(generous.startedPastDeadline).toBe(0);
    expect((await stateOf(started.id)).state).toBe("vendor_started");

    // ...and under a 300 s one it is not. Reading the deadline from anywhere
    // but the argument would make one of these two assertions impossible.
    const strict = await runGenerationRecoveryTick(db, now, { overallDeadlineMs: 300_000 });
    expect(strict.startedPastDeadline).toBe(1);
    expect((await stateOf(started.id)).state).toBe("recovery_required");
  });

  it("leaves an already-terminal attempt entirely alone, however old", async () => {
    // `refused` rather than `settled`: a settled row needs a real `generations`
    // row by `generation_attempts_settled_has_generation`, and what is under
    // test here is "terminal is left alone", which either state proves.
    const settled = await attempt({
      state: "refused",
      refusalCode: "insufficient_balance",
      vendorStartedAt: ago(10 * VENDOR_COMPLETE_HARD_CLEAR_MS),
      vendorCompletedAt: ago(10 * VENDOR_COMPLETE_HARD_CLEAR_MS),
      terminalAt: ago(10 * VENDOR_COMPLETE_HARD_CLEAR_MS),
    });

    const outcome = await tick();

    expect(outcome).toMatchObject({
      abandonedBeforeVendor: 0,
      startedPastDeadline: 0,
      hardCleared: 0,
      settlementAttempted: 0,
      failureCode: null,
    });
    expect((await stateOf(settled.id)).state).toBe("refused");
  });
});
