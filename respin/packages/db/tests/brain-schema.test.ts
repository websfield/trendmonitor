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
import {
  brainDocs,
  creatorProfiles,
  frameworks,
  membershipProfileSelections,
} from "../src/brain-schema";
import {
  brainActivationSnapshots,
  firstBillableAttempts,
  modelUsage,
  onboardingInputs,
  onboardingInterviewDrafts,
  workspaceSpendMonthly,
} from "../src/onboarding-schema";
import {
  generationAttempts,
  generationFeedback,
  generations,
} from "../src/generation-schema";
import { CREATOR_DATA_REGISTRY } from "../src/creator-data-registry";

const NIL = "00000000-0000-0000-0000-000000000000";

describe("AC-10: the composite FKs and CHECKs refuse what they exist to refuse", () => {
  let db: TestDb;
  let wsA: string;
  let wsB: string;
  let userA: string;
  let profileA: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "sch_a");
    await seedAuthUser(db, "sch_b");
    const bootA = await ensureUserWorkspace(db, {
      authUserId: "sch_a",
      name: "A",
    });
    wsA = bootA.workspace.id;
    userA = bootA.membership.userId;
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
    // TWO SLICE-7 CONSTRAINTS CORRECTED THIS FIXTURE, and both corrections are
    // the constraints doing their job on the day they landed (the same thing
    // B-5's widened CHECK did to twenty-one fixtures in slice 3):
    //   `applicability: {}` was an OBJECT, which `jsonb` accepts and no reader
    //   can iterate — `frameworks_json_columns_are_arrays` now refuses it.
    //   `confidence: "low"` was a rung nothing supported — R-29's
    //   `frameworks_confidence_matches_evidence` ties the value to
    //   `jsonb_array_length(evidence_entries)`, and zero entries is
    //   `unsupported`.
    const base = {
      slug: "f",
      name: "F",
      beats: [],
      whyItConverts: "w",
      applicability: [],
      sourceReferences: [],
      evidenceEntries: [],
      testedCaveats: [],
      confidence: "unsupported",
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

  /**
   * THE POPULATION OF THE DELETE TEST, DERIVED FROM THE REGISTRY.
   *
   * Until the 2026-09-01 tenancy gate round the delete assertion below named
   * four tables by hand — `creator_profiles`, `brain_docs`,
   * `onboarding_inputs`, `model_usage` — and that list had not grown since
   * M2a, while `onboarding_interview_drafts`, `brain_activation_snapshots`,
   * `generations` and `generation_attempts` joined `CREATOR_DATA_REGISTRY`.
   * Nothing else consumes `deletion.behaviour` (the export reads
   * `export.included` only), so the deletion HALF of REQ-A04 had no witness
   * for any table added after M2a. The cascades are genuinely present in the
   * migrations; what was missing was anything that would notice if one were
   * not.
   *
   * So the list is the registry filtered to `cascade`, and this map is what a
   * new entry costs: a fixture. That is CLAUDE.md's 2026-08-29 rule — state
   * the population as a LIST that grows with the code — applied to the one
   * assertion a creator's deletion right rests on.
   *
   * ORDERED, because two of the rows have parents inside the set:
   * `generations` needs its `generation_attempts` row (four-column FK) and
   * `membership_profile_selections` needs the membership bootstrap created.
   * `frameworks` deliberately gets a PRIVATE row — a shared row has no owner
   * to cascade from and would (correctly) survive, which is R-9 and is
   * asserted in its own test above.
   */
  const cascadeFixtures = (): { table: string; drizzle: unknown; row: unknown }[] => {
    const shared = children({});
    const ATTEMPT = "att-cascade";
    const SHA = "a".repeat(64);
    // A FIXED id for the generation, so slice 7's `generation_feedback` row
    // can name it in the same declarative map rather than being built by a
    // second pass that reads back what the first inserted.
    const GENERATION_ID = "01a00000-0000-7000-8000-00000000cade";
    return [
      {
        table: "creator_profiles",
        drizzle: creatorProfiles,
        row: { workspaceId: wsA, displayName: "cascade" },
      },
      {
        table: "membership_profile_selections",
        drizzle: membershipProfileSelections,
        row: { userId: userA, workspaceId: wsA, profileId: profileA },
      },
      {
        table: "brain_docs",
        drizzle: shared.brain_docs.table,
        row: shared.brain_docs.row,
      },
      {
        table: "onboarding_inputs",
        drizzle: shared.onboarding_inputs.table,
        row: shared.onboarding_inputs.row,
      },
      {
        table: "onboarding_interview_drafts",
        drizzle: onboardingInterviewDrafts,
        row: { profileId: profileA, workspaceId: wsA },
      },
      {
        table: "brain_activation_snapshots",
        drizzle: brainActivationSnapshots,
        row: { profileId: profileA, workspaceId: wsA },
      },
      {
        table: "model_usage",
        drizzle: shared.model_usage.table,
        row: shared.model_usage.row,
      },
      // R-80. The included-build claim cascades with the profile, and it MUST:
      // a claim outliving the `model_usage` rows it ranks would price a
      // re-created profile off a build nobody can see any more.
      {
        table: "first_billable_attempts",
        drizzle: firstBillableAttempts,
        row: {
          profileId: profileA,
          workspaceId: wsA,
          purpose: "onboarding_brain",
          attemptId: ATTEMPT,
        },
      },
      {
        table: "generation_attempts",
        drizzle: generationAttempts,
        row: {
          profileId: profileA,
          workspaceId: wsA,
          attemptId: ATTEMPT,
          purpose: "generation",
          mode: "hook_set",
          payloadSha256: SHA,
        },
      },
      {
        table: "generations",
        drizzle: generations,
        row: {
          id: GENERATION_ID,
          profileId: profileA,
          workspaceId: wsA,
          attemptId: ATTEMPT,
          mode: "hook_set",
          brainActivationId: NIL,
          request: {},
          model: "m",
          promptBundleVersion: "pb",
          configVersion: 1,
          outcome: "usable",
          output: { hooks: [] },
          weakestPoint: "the fixture is a fixture",
          killTest: {},
        },
      },
      // Slice 7 (R10). ORDERED AFTER `generations`, because its three-column
      // FK names that row — which is what the ordering note above this map is
      // about, and the second entry in the set to have a parent inside it.
      {
        table: "generation_feedback",
        drizzle: generationFeedback,
        row: {
          profileId: profileA,
          workspaceId: wsA,
          generationId: GENERATION_ID,
          reaction: "used_as_is",
        },
      },
      {
        table: "frameworks",
        drizzle: frameworks,
        row: {
          slug: "cascade-private",
          name: "F",
          beats: [],
          whyItConverts: "w",
          applicability: [],
          sourceReferences: [],
          evidenceEntries: [],
          testedCaveats: [],
          confidence: "unsupported",
          saturation: "observed",
          visibility: "private",
          ownerProfileId: profileA,
          workspaceId: wsA,
        },
      },
    ];
  };

  it("the delete test's population IS the registry's cascade set, not a hand-written list", () => {
    // THE GUARD ON THE GUARD. Adding a table to `CREATOR_DATA_REGISTRY` with
    // `deletion.behaviour: "cascade"` and no fixture here fails RIGHT HERE,
    // naming the table — rather than silently leaving its cascade unwitnessed,
    // which is what happened to four tables between M2a and slice 6.
    const registry = CREATOR_DATA_REGISTRY.filter(
      (e) => e.deletion.behaviour === "cascade"
    ).map((e) => e.table);
    expect([...cascadeFixtures().map((f) => f.table)].sort()).toEqual(
      [...registry].sort()
    );
    // NON-VACUITY: the registry really does hold non-cascade entries, so the
    // filter is doing work rather than returning everything.
    expect(registry.length).toBeLessThan(CREATOR_DATA_REGISTRY.length);
  });

  it("deleting the workspace cascades EVERY registry-cascade table away — REQ-A04 is POSSIBLE", async () => {
    for (const f of cascadeFixtures()) {
      await expect(insert(f.drizzle, f.row), f.table).resolves.toBeDefined();
    }
    // NON-VACUITY: every one of those tables really holds a row before the
    // delete, so "empty afterwards" is a cascade rather than a fixture that
    // never landed.
    for (const f of cascadeFixtures()) {
      expect(
        (await db.select().from(f.drizzle as never)).length,
        f.table + ": the fixture did not land, so its cascade is untested"
      ).toBeGreaterThan(0);
    }
    // The assertion `restrict` made impossible: with a usage row present, the
    // workspace delete must still succeed. A-5 first specified `restrict` on
    // model_usage, which combined with both-columns-NOT-NULL made `set null`
    // unrepresentable — so a profile with one usage row could never be deleted,
    // and since profiles cascade from workspaces, this delete would have failed.
    // `ON DELETE no action` on ANY of these tables reproduces exactly that
    // outage, which is why `migration-shape.test.ts`'s "some ON DELETE clause
    // exists" scan is not a substitute for this.
    await expect(
      db.delete(workspaces).where(eq(workspaces.id, wsA))
    ).resolves.toBeDefined();
    for (const f of cascadeFixtures()) {
      expect(
        await db.select().from(f.drizzle as never),
        f.table + " survived the workspace delete"
      ).toHaveLength(0);
    }
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
