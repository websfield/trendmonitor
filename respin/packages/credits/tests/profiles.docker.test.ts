// R3 on REAL POSTGRES — the one property PGlite cannot prove about the cap.
//
// The per-tier profile cap is a READ-THEN-WRITE with no unique index behind it,
// and there cannot be one: "at most N per workspace" has no expressible
// constraint when N lives in a config document and moves. So the only thing
// standing between two simultaneous creates at the cap boundary is the
// transaction-scoped advisory lock `createProfile` takes, and a single-session
// driver cannot tell a lock that works from a lock that was never taken.
//
// Without TEST_DATABASE_URL this suite SKIPS LOUDLY, naming what went unproven.
// Its own database name is required by the harness and must be unique per
// suite: vitest runs FILES in parallel and each suite starts by dropping schema
// public, so a shared name is a suite being reset mid-run by its neighbour.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  CONFIG_V1_SEED,
  ProfileCapError,
  createDockerTestDb,
  creatorProfiles,
  ensureUserWorkspace,
  membershipProfileSelections,
  schema,
  seedAuthUser,
  seedDb,
  selectActiveProfile,
  selectedProfileForMember,
  withWorkspace,
  type WorkspaceScope,
} from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import { createProfile } from "../src/profiles";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

/** Racers per wave. Also the number of connections `warmPool` opens. */
const RACERS = 8;

if (!MAINTENANCE_URL) {
  console.warn(
    "[credits profiles.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: that the per-tier creator-profile cap holds " +
      "under TRUE concurrency. The cap is a read-then-write with no unique " +
      "index behind it (N lives in a config document and moves), so the " +
      "advisory lock in createProfile is the ONLY thing that stops two " +
      "simultaneous creates at the boundary from both counting cap-1 and both " +
      "inserting. PGlite is single-session, so deleting that lock leaves its " +
      "whole suite green. Start the docker-compose DB and set " +
      "TEST_DATABASE_URL to postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

describe.skipIf(!MAINTENANCE_URL)("createProfile under real concurrency", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  let scope: WorkspaceScope;

  beforeAll(async () => {
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_profiles"
    );
    await seedAuthUser(harness.db, "race_user", "race_user@test.dev");
    await seedDb(harness.db);
    await ensureUserWorkspace(harness.db, {
      authUserId: "race_user",
      name: "Race",
    });
    scope = await withWorkspace(harness.db, { authUserId: "race_user" });
    await warmPool();
  }, 60_000);

  /**
   * Open RACERS connections before racing, and hold them open together.
   *
   * MEASURED, NOT PRECAUTIONARY. With a cold `pg.Pool` the first version of the
   * race below passed with the advisory lock DELETED: the eight `createProfile`
   * calls each need a connection, and establishing eight of them takes longer
   * than the first transaction takes to finish — so the racers arrived one at a
   * time, each read a count that already included its predecessor, and seven of
   * them were correctly refused by a cap that was never actually contended.
   * The suite reported the lock as proven while proving nothing about it.
   *
   * That is the "a scan that finds nothing is indistinguishable from a scan
   * that is broken" shape (CLAUDE.md 2026-08-21) wearing a concurrency
   * costume, and it is why the mutation matrix runs against this file rather
   * than the matrix being inferred from a green run.
   */
  async function warmPool(): Promise<void> {
    const clients = await Promise.all(
      Array.from({ length: RACERS }, () => harness.pool.connect())
    );
    await Promise.all(clients.map((c) => c.query("SELECT 1")));
    for (const c of clients) c.release();
  }

  /**
   * The precondition, asserted where it is RELIED ON rather than where it is
   * arranged (billing gate round 2, 2026-08-27).
   *
   * `warmPool()` is a comment plus eight `connect()` calls. If the harness pool
   * config changes (`packages/db/src/testing.ts`, `max: 20`, pg's default 10s
   * idle eviction) or the gap between `beforeAll` and the race grows past that
   * timeout, the pool goes cold again, the racers serialise on connection
   * setup, and this suite silently returns to proving nothing while reporting
   * green — the exact false pass it was written to repair.
   */
  function assertPoolIsWarm(): void {
    expect(
      harness.pool.totalCount,
      "the pool went cold — these racers will serialise on connection setup and this suite proves nothing about the lock"
    ).toBeGreaterThanOrEqual(RACERS);
  }

  afterAll(async () => {
    await harness?.pool.end();
  });

  it(
    "real Postgres keeps per-member selections isolated and rejects a foreign-workspace profile",
    { timeout: 60_000 },
    async () => {
      await seedAuthUser(harness.db, "selection_owner_pg");
      await seedAuthUser(harness.db, "selection_editor_pg");
      await seedAuthUser(harness.db, "selection_foreign_pg");
      const { workspace: selectionWorkspace } = await ensureUserWorkspace(
        harness.db,
        { authUserId: "selection_owner_pg", name: "Selection PG" }
      );
      const [editor] = await harness.db
        .insert(schema.users)
        .values({ authUserId: "selection_editor_pg" })
        .returning();
      await harness.db.insert(schema.memberships).values({
        userId: editor.id,
        workspaceId: selectionWorkspace.id,
        role: "editor",
      });
      const [profileA, profileB] = await harness.db
        .insert(creatorProfiles)
        .values([
          { workspaceId: selectionWorkspace.id, displayName: "PG A" },
          { workspaceId: selectionWorkspace.id, displayName: "PG B" },
        ])
        .returning();
      const { workspace: foreignWorkspace } = await ensureUserWorkspace(
        harness.db,
        { authUserId: "selection_foreign_pg", name: "Foreign PG" }
      );
      const [foreignProfile] = await harness.db
        .insert(creatorProfiles)
        .values({ workspaceId: foreignWorkspace.id, displayName: "Foreign PG" })
        .returning();
      const owner = await withWorkspace(harness.db, {
        authUserId: "selection_owner_pg",
      });
      const editorScope = await withWorkspace(harness.db, {
        authUserId: "selection_editor_pg",
      });

      await selectActiveProfile(harness.db, owner, profileA.id);
      await selectActiveProfile(harness.db, editorScope, profileB.id);
      expect((await selectedProfileForMember(harness.db, owner))?.id).toBe(
        profileA.id
      );
      expect((await selectedProfileForMember(harness.db, editorScope))?.id).toBe(
        profileB.id
      );

      await expect(
        harness.db
          .update(membershipProfileSelections)
          .set({ profileId: foreignProfile.id })
          .where(eq(membershipProfileSelections.userId, owner.userId as string))
      ).rejects.toThrow();
      await expect(
        harness.db.insert(membershipProfileSelections).values({
          userId: owner.userId as string,
          workspaceId: foreignWorkspace.id,
          profileId: foreignProfile.id,
        })
      ).rejects.toThrow();
      expect((await selectedProfileForMember(harness.db, owner))?.id).toBe(
        profileA.id
      );
      // The deliberate FK violation may retire a pool connection on some pg
      // driver/server combinations. Re-establish the race precondition after
      // this independent constraint witness so the next test still contends
      // on already-open connections rather than connection setup.
      await warmPool();
    }
  );

  it(
    "eight PARALLEL creates at a cap of 1 leave exactly one profile",
    { timeout: 60_000 },
    async () => {
      assertPoolIsWarm();
      const at = new Date();
      const results = await Promise.allSettled(
        Array.from({ length: RACERS }, (_, i) =>
          createProfile(harness.db, scope, `Racer ${i}`, at)
        )
      );
      const ok = results.filter((r) => r.status === "fulfilled");
      const rows = await harness.db
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.workspaceId, scope.workspaceId as string));

      expect(
        rows,
        "the cap was crossed — two creates both counted cap-1 and both inserted"
      ).toHaveLength(1);
      expect(ok).toHaveLength(1);
      const selected = await selectedProfileForMember(harness.db, scope);
      expect(selected?.id).toBe(rows[0].id);
      // EVERY loser was refused BY NAME. A racer that failed with a raw
      // Postgres error would mean the cap was being enforced by luck rather
      // than by the check — and would render to a creator as "Something went
      // wrong" instead of as their plan's limit.
      for (const r of results.filter((x) => x.status === "rejected")) {
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(
          ProfileCapError
        );
      }
    }
  );

  it(
    "NON-VACUITY: raising the cap lets exactly that many through, concurrently",
    { timeout: 60_000 },
    async () => {
      // The direction that separates "the lock works" from "the lock serialises
      // everything into one". With a cap of 4 and one profile already present,
      // three more must land — not one, and not eight.
      await appendConfigVersion(
        harness.db,
        {
          ...CONFIG_V1_SEED,
          profileCaps: { free: 4, creator: 1, pro: 1, studio: 5 },
        },
        "race-test"
      );
      assertPoolIsWarm();
      const at = new Date();
      const results = await Promise.allSettled(
        Array.from({ length: RACERS }, (_, i) =>
          createProfile(harness.db, scope, `Second wave ${i}`, at)
        )
      );
      const rows = await harness.db
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.workspaceId, scope.workspaceId as string));
      expect(rows).toHaveLength(4);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      const selected = await selectedProfileForMember(harness.db, scope);
      expect(rows.some((row) => row.id === selected?.id)).toBe(true);
      const [selection] = await harness.db
        .select()
        .from(membershipProfileSelections)
        .where(eq(membershipProfileSelections.userId, scope.userId as string));
      expect(selection.profileId).toBe(selected?.id);
    }
  );
});
