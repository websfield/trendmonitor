// Phase 10b-1 Task 7 / R-121 — the activation classifier and the cohort
// contribution an erased account leaves behind.
import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { ensureUserWorkspace } from "../src/bootstrap";
import { users } from "../src/schema";
import { activationCohortDaily, deletionOperations } from "../src/lifecycle-schema";
import {
  ACTIVATION_WINDOW_MS,
  activationPayloadHash,
  applyActivationContributionInTx,
  ActivationContributionRefusal,
  captureActivationContributionInTx,
  classifyActivation,
  deriveActivationCohorts,
  NO_ACTIVATION_EXCLUSIONS,
  resolveActivationExclusions,
  type ActivationExclusions,
  type ActivationSignals,
} from "../src/activation";

const signup = new Date("2026-09-01T10:00:00.000Z");
const later = (ms: number) => new Date(signup.getTime() + ms);
const H = 60 * 60 * 1000;

const signals = (over: Partial<ActivationSignals> = {}): ActivationSignals => ({
  signupAt: signup,
  emailVerified: true,
  brainActivatedAt: later(2 * H),
  firstFullScriptAt: later(5 * H),
  ...over,
});

const excluding = (adminIds: string[] = [], excludedIds: string[] = []): ActivationExclusions => ({
  adminUserIds: new Set(adminIds),
  excludedUserIds: new Set(excludedIds),
});

describe("classifyActivation — pure", () => {
  it("counts an ordinary account that did all three steps inside 24 h as (false, 1, 1)", () => {
    expect(classifyActivation("u1", signals(), NO_ACTIVATION_EXCLUSIONS)).toMatchObject({
      cohortDate: "2026-09-01", excluded: false, denominator: 1, numerator: 1,
    });
  });

  it("a step one millisecond past the window is a non-activation, still in the denominator", () => {
    const edge = signals({ firstFullScriptAt: later(ACTIVATION_WINDOW_MS + 1) });
    expect(classifyActivation("u1", edge, NO_ACTIVATION_EXCLUSIONS)).toMatchObject({ denominator: 1, numerator: 0 });
    const inside = signals({ firstFullScriptAt: later(ACTIVATION_WINDOW_MS) });
    expect(classifyActivation("u1", inside, NO_ACTIVATION_EXCLUSIONS)).toMatchObject({ denominator: 1, numerator: 1 });
  });

  it("each missing step alone denies the numerator", () => {
    for (const over of [{ emailVerified: false }, { brainActivatedAt: null }, { firstFullScriptAt: null }] as const) {
      expect(classifyActivation("u1", signals(over), NO_ACTIVATION_EXCLUSIONS)).toMatchObject({ denominator: 1, numerator: 0 });
    }
  });

  it("membership in EITHER audited set yields exactly (true, 0, 0), even for a fully activated account", () => {
    expect(classifyActivation("admin", signals(), excluding(["admin"]))).toMatchObject({
      excluded: true, exclusionSource: "admin_user_ids", denominator: 0, numerator: 0,
    });
    expect(classifyActivation("qa", signals(), excluding([], ["qa"]))).toMatchObject({
      excluded: true, exclusionSource: "activation_excluded_user_ids", denominator: 0, numerator: 0,
    });
  });

  it("the cohort is the UTC signup day", () => {
    const late = signals({ signupAt: new Date("2026-09-01T23:59:59.000Z") });
    expect(classifyActivation("u1", late, NO_ACTIVATION_EXCLUSIONS).cohortDate).toBe("2026-09-01");
  });

  it("resolves the two sets from the environment and nothing else", () => {
    const ex = resolveActivationExclusions({ ADMIN_USER_IDS: " a , b ", ACTIVATION_EXCLUDED_USER_IDS: "c" });
    expect([...ex.adminUserIds]).toEqual(["a", "b"]);
    expect([...ex.excludedUserIds]).toEqual(["c"]);
    expect(resolveActivationExclusions({})).toEqual({ adminUserIds: new Set(), excludedUserIds: new Set() });
  });
});

describe("contribution capture, apply, receipt", () => {
  let db: TestDb;
  let userId: string;
  const OP = "019b0d7a-86df-7000-8000-00000000a001";

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "act_user");
    userId = (await ensureUserWorkspace(db, { authUserId: "act_user", name: "A" })).user.id;
  });

  const seedOperation = async (exclusions: ActivationExclusions = NO_ACTIVATION_EXCLUSIONS) =>
    db.transaction(async (tx) => {
      const columns = await captureActivationContributionInTx(tx, OP, userId, exclusions);
      const [op] = await tx
        .insert(deletionOperations)
        .values({
          id: OP,
          ...columns,
          scope: "identity",
          targetKey: `identity:${userId}`,
          userId,
          requesterUserId: userId,
          requesterDigest: "a".repeat(64),
          idempotencyKey: "k1",
          payloadHash: "b".repeat(64),
          state: "erasing",
          // The identity shape the row CHECKs demand; none of it is under test.
          recoveryDeliveryStatus: "pending",
          recoveryDeliveryAttempt: 1,
          recoveryDeliveryCommandId: randomUUID(),
          recoveryDeliveryRecipientDigest: "c".repeat(64),
          recoveryDeliveryAttemptedAt: new Date(),
          recoveryExpiresAt: new Date(Date.now() + 7 * 24 * H),
          recoverySecretDigest: "d".repeat(64),
          recoverySecretPrefix: "dddddddd",
          requestSessionDigest: "e".repeat(64),
        })
        .returning();
      return op!;
    });

  const cohort = async () => (await db.select().from(activationCohortDaily))[0];

  it("captures a keyed contribution as pending, and applies it EXACTLY once", async () => {
    const op = await seedOperation();
    expect(op.activationContributionState).toBe("pending");
    expect(op.activationDenominator).toBe(1);
    expect(op.activationPayloadHash).toHaveLength(64);

    const now = new Date();
    const first = await db.transaction((tx) => applyActivationContributionInTx(tx, op, NO_ACTIVATION_EXCLUSIONS, now));
    expect(first.applied).toBe(true);
    expect(await cohort()).toMatchObject({ signups: 1, activated: 0, excluded: 0 });

    // Replay under the SAME operation: nothing increments.
    const [reloaded] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, OP));
    const second = await db.transaction((tx) => applyActivationContributionInTx(tx, reloaded!, NO_ACTIVATION_EXCLUSIONS, now));
    expect(second.applied).toBe(false);
    expect(await cohort()).toMatchObject({ signups: 1 });
    expect(reloaded!.activationReceiptDigest).toHaveLength(64);
    // The receipt names no user: a known-id dictionary cannot relink it.
    expect(reloaded!.activationReceiptDigest).not.toContain(userId.slice(0, 8));
  });

  it("a hash-mismatched contribution BLOCKS erasure rather than being recomputed", async () => {
    const op = await seedOperation();
    const forged = { ...op, activationNumerator: 1 };
    await expect(
      db.transaction((tx) => applyActivationContributionInTx(tx, forged, NO_ACTIVATION_EXCLUSIONS, new Date())),
    ).rejects.toMatchObject({ code: "activation_contribution_mismatch" });
    expect(await cohort()).toBeUndefined();
  });

  it("a MISSING contribution blocks erasure", async () => {
    const op = await seedOperation();
    const stripped = { ...op, activationCohortDate: null };
    await expect(
      db.transaction((tx) => applyActivationContributionInTx(tx, stripped, NO_ACTIVATION_EXCLUSIONS, new Date())),
    ).rejects.toBeInstanceOf(ActivationContributionRefusal);
  });

  it("refuses while the id is still in a deployment set — operator_config_removal_required", async () => {
    const op = await seedOperation(excluding([userId]));
    expect(op.activationExcluded).toBe(true);
    await expect(
      db.transaction((tx) => applyActivationContributionInTx(tx, op, excluding([userId]), new Date())),
    ).rejects.toMatchObject({ code: "operator_config_removal_required" });
    // Once the operator has removed it, the CAPTURED exclusion still applies:
    // removal cannot reclassify the signup as eligible.
    const done = await db.transaction((tx) => applyActivationContributionInTx(tx, op, NO_ACTIVATION_EXCLUSIONS, new Date()));
    expect(done.applied).toBe(true);
    expect(await cohort()).toMatchObject({ signups: 0, activated: 0, excluded: 1 });
  });

  it("the payload hash is keyed to the operation AND the user", () => {
    const c = classifyActivation("u", signals(), NO_ACTIVATION_EXCLUSIONS);
    expect(activationPayloadHash("op1", "u", c)).not.toBe(activationPayloadHash("op2", "u", c));
    expect(activationPayloadHash("op1", "u", c)).not.toBe(activationPayloadHash("op1", "v", c));
  });

  it("live + aggregate counts each account once", async () => {
    // Backdate the signup so its cohort is mature.
    await db.update(users).set({ createdAt: new Date(Date.now() - 3 * ACTIVATION_WINDOW_MS) }).where(eq(users.id, userId));
    const before = await deriveActivationCohorts(db, NO_ACTIVATION_EXCLUSIONS, new Date());
    expect(before.reduce((n, c) => n + c.signups, 0)).toBe(1);

    const op = await seedOperation();
    await db.transaction((tx) => applyActivationContributionInTx(tx, op, NO_ACTIVATION_EXCLUSIONS, new Date()));
    // Applied to the aggregate but the users row still exists (erasure has not
    // run): the live pass must skip it, or the account is counted twice.
    const after = await deriveActivationCohorts(db, NO_ACTIVATION_EXCLUSIONS, new Date());
    expect(after.reduce((n, c) => n + c.signups, 0)).toBe(1);
    expect(after[0]!.smallCell).toBe(true);
  });
});
