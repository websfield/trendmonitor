// AC-10 — the M2a schema constraints, ASSERTED rather than eyeballed.
//
// The schema landed a session before the cage did, and it was verified by
// READING the emitted SQL. That is exactly how migration 0011 first shipped a
// composite FK referencing a unique INDEX that drizzle-kit emits AFTER the FK:
// the constraint was present, and it was present too late. "Verify it is
// emitted" and "verify it is emitted in a working order" are different checks,
// and only running it tells them apart.
//
// So this suite runs the real migration into PGlite and attempts the rows each
// constraint exists to forbid. Its companion assertions about the emitted SQL —
// explicit ON DELETE everywhere, and no FK on the rollup — live in
// migration-shape.test.ts, because no INSERT can demonstrate either.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { workspaces } from "../src/schema";
import { brainDocs, creatorProfiles, frameworks } from "../src/brain-schema";
import {
  modelUsage,
  onboardingInputs,
  workspaceSpendMonthly,
} from "../src/onboarding-schema";

const NIL = "00000000-0000-0000-0000-000000000000";

describe("AC-10: the composite FKs and CHECKs refuse what they exist to refuse", () => {
  let db: TestDb;
  let wsA: string;
  let wsB: string;
  let profileA: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "sch_a");
    await seedAuthUser(db, "sch_b");
    wsA = (await ensureUserWorkspace(db, { authUserId: "sch_a", name: "A" }))
      .workspace.id;
    wsB = (await ensureUserWorkspace(db, { authUserId: "sch_b", name: "B" }))
      .workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: wsA, displayName: "A" })
      .returning();
    profileA = p.id;
  });

  const children = (over: Record<string, unknown>) => ({
    brain_docs: {
      table: brainDocs,
      row: {
        profileId: profileA,
        workspaceId: wsA,
        kind: "voice",
        version: 1,
        content: {},
        reason: "r",
        // Migration 0012 made `source_evidence` NOT NULL with a non-empty
        // CHECK. This suite is about the composite FKs and the framework
        // CHECKs, so the entry is synthetic — validating it against
        // `onboarding_inputs` is `validateSourceEvidence`'s job, not the DB's.
        sourceEvidence: [
          {
            quote: "c",
            inputId: "00000000-0000-4000-8000-000000000001",
            startUtf16: 0,
            endUtf16: 1,
            confidence: "high",
          },
        ],
        ...over,
      },
    },
    onboarding_inputs: {
      table: onboardingInputs,
      row: {
        profileId: profileA,
        workspaceId: wsA,
        inputClass: "own_post",
        content: "c",
        contentSha256: "x",
        ...over,
      },
    },
    model_usage: {
      table: modelUsage,
      row: {
        profileId: profileA,
        workspaceId: wsA,
        attemptId: "a",
        purpose: "p",
        model: "m",
        tokensIn: 1,
        tokensOut: 1,
        costMicroUsd: 1n,
        costState: "estimated",
        resolvedTier: "free",
        promptBundleVersion: "pb",
        configVersion: 1,
        outcome: "succeeded",
        ...over,
      },
    },
  });

  const insert = (t: unknown, row: unknown) =>
    db.insert(t as never).values(row as never);

  it("the fixture is real: the honest row lands in all three child tables", async () => {
    for (const [name, c] of Object.entries(children({}))) {
      await expect(insert(c.table, c.row), name).resolves.toBeDefined();
    }
  });

  it("a CROSS-PARENTED row is refused by every composite FK", async () => {
    // profileA belongs to workspace A. Naming workspace B is the shape the
    // composite FK makes unrepresentable — and the reason every accessor can
    // rely on both of its predicates agreeing.
    for (const [name, c] of Object.entries(children({ workspaceId: wsB }))) {
      await expect(
        insert(c.table, c.row),
        name + " accepted a cross-parented row"
      ).rejects.toThrow();
    }
  });

  it("a row naming a NONEXISTENT profile is refused by every composite FK", async () => {
    for (const [name, c] of Object.entries(children({ profileId: NIL }))) {
      await expect(insert(c.table, c.row), name).rejects.toThrow();
    }
  });

  it("frameworks: shared must have NO owner, private must have one, in both directions", async () => {
    const base = {
      slug: "f",
      name: "F",
      beats: [],
      whyItConverts: "w",
      applicability: {},
      sourceReferences: [],
      evidenceEntries: [],
      testedCaveats: [],
      confidence: "low",
      saturation: "observed" as const,
    };
    // shared WITH an owner: refused. This is R-9 as a constraint rather than a
    // seeder convention — `owner_profile_id IS NULL` is the marker for
    // library-owned, so a private framework that lost its owner would silently
    // BECOME library content.
    await expect(
      db.insert(frameworks).values({
        ...base,
        slug: "f1",
        visibility: "shared",
        ownerProfileId: profileA,
        workspaceId: wsA,
      })
    ).rejects.toThrow();
    // private WITHOUT an owner: refused.
    await expect(
      db.insert(frameworks).values({
        ...base,
        slug: "f2",
        visibility: "private",
        ownerProfileId: null,
        workspaceId: null,
      })
    ).rejects.toThrow();
    // A HALF-filled private row: refused too. The CHECK names both columns,
    // which is what stops the MATCH SIMPLE hole re-opening on the one table
    // carved out of the both-columns-NOT-NULL rule.
    await expect(
      db.insert(frameworks).values({
        ...base,
        slug: "f3",
        visibility: "private",
        ownerProfileId: profileA,
        workspaceId: null,
      })
    ).rejects.toThrow();
    // NON-VACUITY: both legitimate shapes land.
    await expect(
      db
        .insert(frameworks)
        .values({ ...base, slug: "ok-shared", visibility: "shared" })
    ).resolves.toBeDefined();
    await expect(
      db.insert(frameworks).values({
        ...base,
        slug: "ok-private",
        visibility: "private",
        ownerProfileId: profileA,
        workspaceId: wsA,
      })
    ).resolves.toBeDefined();
  });

  it("model_usage: a cost is present exactly when cost_state is not unknown", async () => {
    const c = children({}).model_usage;
    await expect(
      insert(c.table, { ...c.row, costState: "unknown" }),
      "unknown WITH a cost must be refused"
    ).rejects.toThrow();
    await expect(
      insert(c.table, { ...c.row, costMicroUsd: null }),
      "estimated WITHOUT a cost must be refused"
    ).rejects.toThrow();
    await expect(
      insert(c.table, { ...c.row, costState: "unknown", costMicroUsd: null })
    ).resolves.toBeDefined();
  });

  it("deleting the workspace cascades the whole profile tree away — REQ-A04 is POSSIBLE", async () => {
    for (const c of Object.values(children({}))) await insert(c.table, c.row);
    // The assertion `restrict` made impossible: with a usage row present, the
    // workspace delete must still succeed. A-5 first specified `restrict` on
    // model_usage, which combined with both-columns-NOT-NULL made `set null`
    // unrepresentable — so a profile with one usage row could never be deleted,
    // and since profiles cascade from workspaces, this delete would have failed.
    await expect(
      db.delete(workspaces).where(eq(workspaces.id, wsA))
    ).resolves.toBeDefined();
    expect(await db.select().from(creatorProfiles)).toHaveLength(0);
    expect(await db.select().from(brainDocs)).toHaveLength(0);
    expect(await db.select().from(onboardingInputs)).toHaveLength(0);
    expect(await db.select().from(modelUsage)).toHaveLength(0);
  });

  it("workspace_spend_monthly SURVIVES the workspace it names being deleted", async () => {
    await db.insert(workspaceSpendMonthly).values({
      workspaceId: wsA,
      periodMonth: "2026-08-01",
      tier: "free",
      costMicroUsd: 5n,
      callCount: 1,
    });
    await db.delete(workspaces).where(eq(workspaces.id, wsA));
    // The whole reason it carries no FK: model_usage cascades away with the
    // profile, so the margin history is preserved here instead and must outlive
    // the workspace. Its retention decision is in creator-data-registry.ts.
    expect(await db.select().from(workspaceSpendMonthly)).toHaveLength(1);
    expect(wsB).not.toBe(wsA);
  });
});
