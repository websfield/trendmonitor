import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  ProfileAccessError,
  createTestDb,
  creatorProfiles,
  ensureUserWorkspace,
  membershipProfileSelections,
  schema,
  seedAuthUser,
  selectActiveProfile,
  selectedProfileForMember,
  withWorkspace,
} from "../src";

const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations"
);

const ids = {
  user1: "00000000-0000-7000-8000-000000000001",
  user2: "00000000-0000-7000-8000-000000000002",
  user3: "00000000-0000-7000-8000-000000000003",
  workspaceSingle: "00000000-0000-7000-8000-000000000011",
  workspaceMulti: "00000000-0000-7000-8000-000000000012",
  workspaceEmpty: "00000000-0000-7000-8000-000000000013",
  membership1: "00000000-0000-7000-8000-000000000021",
  membership2: "00000000-0000-7000-8000-000000000022",
  membership3: "00000000-0000-7000-8000-000000000023",
  profileSingle: "00000000-0000-7000-8000-000000000031",
  profileMulti1: "00000000-0000-7000-8000-000000000032",
  profileMulti2: "00000000-0000-7000-8000-000000000033",
} as const;

async function setupTwoMembers() {
  const db = await createTestDb();
  await seedAuthUser(db, "selection_owner");
  await seedAuthUser(db, "selection_editor");
  const { workspace } = await ensureUserWorkspace(db, {
    authUserId: "selection_owner",
    name: "Selection",
  });
  const [editor] = await db
    .insert(schema.users)
    .values({ authUserId: "selection_editor" })
    .returning();
  await db.insert(schema.memberships).values({
    userId: editor.id,
    workspaceId: workspace.id,
    role: "editor",
  });
  const [profileA, profileB] = await db
    .insert(creatorProfiles)
    .values([
      { workspaceId: workspace.id, displayName: "A" },
      { workspaceId: workspace.id, displayName: "B" },
    ])
    .returning();
  return {
    db,
    profileA,
    profileB,
    owner: await withWorkspace(db, { authUserId: "selection_owner" }),
    editor: await withWorkspace(db, { authUserId: "selection_editor" }),
  };
}

describe("membership profile selection", () => {
  it("stores independent selections for two members of the same workspace", async () => {
    const { db, owner, editor, profileA, profileB } = await setupTwoMembers();

    await selectActiveProfile(db, owner, profileA.id);
    await selectActiveProfile(db, editor, profileB.id);

    expect((await selectedProfileForMember(db, owner))?.id).toBe(profileA.id);
    expect((await selectedProfileForMember(db, editor))?.id).toBe(profileB.id);
    expect(await db.select().from(membershipProfileSelections)).toHaveLength(2);
  });

  it("has no first-profile fallback, and an archived selection reads as absent", async () => {
    const { db, owner, profileA } = await setupTwoMembers();
    expect(await selectedProfileForMember(db, owner)).toBeNull();

    await selectActiveProfile(db, owner, profileA.id);
    await db
      .update(creatorProfiles)
      .set({ state: "archived" })
      .where(eq(creatorProfiles.id, profileA.id));

    expect(await selectedProfileForMember(db, owner)).toBeNull();
    await expect(
      selectActiveProfile(db, owner, profileA.id)
    ).rejects.toBeInstanceOf(ProfileAccessError);
  });

  it("the authority and both composite FKs reject cross-workspace pairings", async () => {
    const first = await setupTwoMembers();
    await seedAuthUser(first.db, "selection_foreign_owner");
    const { workspace: foreignWorkspace } = await ensureUserWorkspace(first.db, {
      authUserId: "selection_foreign_owner",
      name: "Foreign",
    });
    const [foreignProfile] = await first.db
      .insert(creatorProfiles)
      .values({ workspaceId: foreignWorkspace.id, displayName: "Foreign" })
      .returning();

    await expect(
      selectActiveProfile(first.db, first.owner, foreignProfile.id)
    ).rejects.toBeInstanceOf(ProfileAccessError);
    expect(await first.db.select().from(membershipProfileSelections)).toHaveLength(0);

    await expect(
      first.db.insert(membershipProfileSelections).values({
        userId: first.owner.userId as string,
        workspaceId: first.owner.workspaceId as string,
        profileId: foreignProfile.id,
      })
    ).rejects.toThrow();

    // Profile/workspace now agree, so only the composite membership FK can
    // reject this row: the acting user has no membership in Foreign.
    await expect(
      first.db.insert(membershipProfileSelections).values({
        userId: first.owner.userId as string,
        workspaceId: foreignWorkspace.id,
        profileId: foreignProfile.id,
      })
    ).rejects.toThrow();
  });
});

describe("migration 0019 profile-selection backfill", () => {
  it("backfills only the unambiguous one-active-profile workspaces", async () => {
    const client = new PGlite();
    const files = readdirSync(MIGRATIONS)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    const selectionMigration = files.find((name) => name.startsWith("0019_"));
    expect(selectionMigration, "profile selection migration 0019 is missing").toBeDefined();

    for (const name of files.filter((file) => file < selectionMigration!)) {
      const sql = readFileSync(join(MIGRATIONS, name), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) await client.exec(statement);
      }
    }

    await client.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ('a1','a1','a1@test.dev',true,now(),now()),
             ('a2','a2','a2@test.dev',true,now(),now()),
             ('a3','a3','a3@test.dev',true,now(),now());
      INSERT INTO users (id, auth_user_id) VALUES
        ('${ids.user1}','a1'), ('${ids.user2}','a2'), ('${ids.user3}','a3');
      INSERT INTO workspaces (id, name) VALUES
        ('${ids.workspaceSingle}','Single'),
        ('${ids.workspaceMulti}','Multi'),
        ('${ids.workspaceEmpty}','Empty');
      INSERT INTO memberships (id, user_id, workspace_id, role) VALUES
        ('${ids.membership1}','${ids.user1}','${ids.workspaceSingle}','owner'),
        ('${ids.membership2}','${ids.user2}','${ids.workspaceMulti}','owner'),
        ('${ids.membership3}','${ids.user3}','${ids.workspaceEmpty}','owner');
      INSERT INTO creator_profiles (id, workspace_id, display_name, state) VALUES
        ('${ids.profileSingle}','${ids.workspaceSingle}','Only','active'),
        ('${ids.profileMulti1}','${ids.workspaceMulti}','One','active'),
        ('${ids.profileMulti2}','${ids.workspaceMulti}','Two','active');
    `);

    const sql = readFileSync(join(MIGRATIONS, selectionMigration!), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }

    const result = await client.query<{
      user_id: string;
      workspace_id: string;
      profile_id: string;
    }>(`SELECT user_id, workspace_id, profile_id
        FROM membership_profile_selections ORDER BY user_id`);
    expect(result.rows).toEqual([
      {
        user_id: ids.user1,
        workspace_id: ids.workspaceSingle,
        profile_id: ids.profileSingle,
      },
    ]);
    await client.close();
  });
});
