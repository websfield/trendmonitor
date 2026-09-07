// Slice 1 — `createProfile`, the creator-profile ENTITLEMENT decision.
//
// Everything here is a REFUSAL or an invariant, because that is what this
// function is: the insert it ends with is four lines, and the other ninety are
// the four gates in front of it. Each gate gets both directions — it refuses
// what it must, and it does NOT refuse what it must not — because a gate that
// refuses everything passes every one-directional test ever written about it.
import { describe, expect, it } from "vitest";
import {
  CONFIG_V1_SEED,
  ProfileCapError,
  ProfileNameError,
  ProfileRoleError,
  ScopeForgeryError,
  WorkspacePausedError,
  createTestDb,
  creatorProfiles,
  ensureUserWorkspace,
  membershipProfileSelections,
  schema,
  seedAuthUser,
  seedDb,
  selectedProfileForMember,
  withWorkspace,
  type TestDb,
  type WorkspaceScope,
} from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import { eq } from "drizzle-orm";
import { createProfile } from "../src/profiles";
import { recordPauseStart } from "../src/pause";
import { ClockSkewError } from "../src/errors";

/**
 * A LIVE clock, not a literal.
 *
 * `createProfile` runs `assertWriteClock`, which refuses an `at` more than 60s
 * from the database's own clock — so a fixed instant makes every test in this
 * file start failing on its own the next day. The pause case below already used
 * a live clock for exactly this reason; the billing gate predicted the rest
 * would need it the moment the guard landed (2026-08-27).
 */
const now = () => new Date();

/**
 * A workspace on FREE with the seeded config, and an owner scope over it.
 *
 * Free rather than a paid tier because Free's `profileCaps` is 1 — the cap that
 * actually bites, and the one a creator hits first.
 */
async function setup(
  db: TestDb,
  opts: { role?: "owner" | "editor" | "viewer" } = {}
): Promise<WorkspaceScope> {
  await seedAuthUser(db, "cp_user");
  await seedDb(db);
  const { workspace } = await ensureUserWorkspace(db, {
    authUserId: "cp_user",
    name: "W",
  });
  if (opts.role && opts.role !== "owner") {
    await db
      .update(schema.memberships)
      .set({ role: opts.role })
      .where(eq(schema.memberships.workspaceId, workspace.id));
  }
  return withWorkspace(db, { authUserId: "cp_user" });
}

describe("createProfile — the cap (R2)", () => {
  it("creates the first profile, stamping the scope's workspace and state=active", async () => {
    const db = await createTestDb();
    const scope = await setup(db);
    const p = await createProfile(db, scope, "Anna", now());
    expect(p.displayName).toBe("Anna");
    expect(p.workspaceId).toBe(scope.workspaceId as string);
    // Server-derived, and the reason `state` is in GUARDED_WRITE_FIELDS: a
    // profile created straight into `archived` would cost nothing against the
    // cap while still owning brain documents.
    expect(p.state).toBe("active");
    expect((await selectedProfileForMember(db, scope))?.id).toBe(p.id);
  });

  it("refuses the second on Free, and the error names the tier and the cap", async () => {
    const db = await createTestDb();
    const scope = await setup(db);
    await createProfile(db, scope, "Anna", now());
    const err = await createProfile(db, scope, "Bea", now()).catch((e) => e);
    expect(err).toBeInstanceOf(ProfileCapError);
    expect((err as ProfileCapError).tier).toBe("free");
    expect((err as ProfileCapError).cap).toBe(1);
    expect((err as ProfileCapError).existing).toBe(1);
    // ...and NOTHING was written. A refusal that leaves a row is not a refusal.
    const rows = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.workspaceId, scope.workspaceId as string));
    expect(rows).toHaveLength(1);
    expect((await selectedProfileForMember(db, scope))?.id).toBe(rows[0].id);
  });

  it("rolls the profile back when selecting it cannot commit", async () => {
    const db = await createTestDb();
    const scope = await setup(db);
    const [membership] = await db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.workspaceId, scope.workspaceId as string));

    await seedAuthUser(db, "collision_owner");
    const { workspace: otherWorkspace } = await ensureUserWorkspace(db, {
      authUserId: "collision_owner",
      name: "Collision",
    });
    const other = await withWorkspace(db, { authUserId: "collision_owner" });
    const [otherProfile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: otherWorkspace.id, displayName: "Other" })
      .returning();
    await db.insert(membershipProfileSelections).values({
      id: membership.id,
      userId: other.userId as string,
      workspaceId: other.workspaceId as string,
      profileId: otherProfile.id,
    });

    await expect(createProfile(db, scope, "Must roll back", now())).rejects.toThrow();
    expect(
      await db
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.workspaceId, scope.workspaceId as string))
    ).toHaveLength(0);
    expect(await selectedProfileForMember(db, scope)).toBeNull();
  });

  it("THE CAP IS THE STORED CONFIG DOCUMENT: changing it moves the cap, with no deploy", async () => {
    // This is R2's actual requirement, and it is the assertion a hardcoded `1`
    // cannot satisfy — mutation M1 in the plan's matrix. The cap is not "1", it
    // is "whatever the active config says for this workspace's resolved tier",
    // and the difference is only visible if the document moves under it.
    const db = await createTestDb();
    const scope = await setup(db);
    await createProfile(db, scope, "Anna", now());
    await expect(createProfile(db, scope, "Bea", now())).rejects.toBeInstanceOf(
      ProfileCapError
    );

    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, profileCaps: { free: 3, creator: 1, pro: 1, studio: 5 } },
      "test-admin"
    );
    // The SAME workspace, the SAME tier, a different document → allowed.
    const second = await createProfile(db, scope, "Bea", now());
    expect(second.displayName).toBe("Bea");
    // ...and the new cap still bites at its own boundary rather than being off.
    await createProfile(db, scope, "Cara", now());
    await expect(createProfile(db, scope, "Dee", now())).rejects.toBeInstanceOf(
      ProfileCapError
    );
  });

  it("reads the tier from the ONE tier authority — a mapped paid price lifts the cap", async () => {
    // Not "a subscriptions row exists, so they're paid": the tier comes from
    // `getWorkspaceBillingState`, which resolves the mirror's price id through
    // the active config's stripePriceMap. An UNMAPPED price is free.
    const db = await createTestDb();
    const scope = await setup(db);
    await db.insert(schema.subscriptions).values({
      workspaceId: scope.workspaceId as string,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      stripePriceId: "price_studio",
      status: "active",
    });
    await createProfile(db, scope, "Anna", now());
    // Unmapped price → still Free → still capped at 1.
    await expect(createProfile(db, scope, "Bea", now())).rejects.toBeInstanceOf(
      ProfileCapError
    );

    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_studio: "studio" } },
      "test-admin"
    );
    // Studio's seeded cap is 5 — the same subscription row, now resolvable.
    const second = await createProfile(db, scope, "Bea", now());
    expect(second.displayName).toBe("Bea");
  });

  it("an INCOMPLETE subscription is Free here too — no cap for a payment never collected", async () => {
    // The failure mode R-30 constraint 2 names by hand: re-deriving the tier
    // from "a subscriptions row exists" grants Studio's five profiles to a
    // subscription that has never collected a cent.
    const db = await createTestDb();
    const scope = await setup(db);
    await db.insert(schema.subscriptions).values({
      workspaceId: scope.workspaceId as string,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      stripePriceId: "price_studio",
      status: "incomplete",
    });
    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_studio: "studio" } },
      "test-admin"
    );
    await createProfile(db, scope, "Anna", now());
    const err = await createProfile(db, scope, "Bea", now()).catch((e) => e);
    expect(err).toBeInstanceOf(ProfileCapError);
    expect((err as ProfileCapError).tier).toBe("free");
  });
});

describe("createProfile — the gates in front of the cap", () => {
  it("R-118: REFUSES viewers and editors before profile creation", async () => {
    const viewerDb = await createTestDb();
    const viewer = await setup(viewerDb, { role: "viewer" });
    const err = await createProfile(viewerDb, viewer, "Anna", now()).catch((e) => e);
    expect(err).toBeInstanceOf(ProfileRoleError);
    expect(await viewerDb.select().from(creatorProfiles)).toHaveLength(0);

    const editorDb = await createTestDb();
    const editor = await setup(editorDb, { role: "editor" });
    const editorErr = await createProfile(editorDb, editor, "Anna", now()).catch((e) => e);
    expect(editorErr).toBeInstanceOf(ProfileRoleError);
    expect(await editorDb.select().from(creatorProfiles)).toHaveLength(0);
  });

  it("REFUSES under an open pause, and creates again once it is closed (REQ-G08)", async () => {
    // The decision recorded as R-35: the per-tier profile allowance is an
    // entitlement, and a pause freezes entitlements. Refusing discards nothing
    // — which is the test that separates this from `appendOnboardingInput`,
    // where refusing WOULD throw away text the person typed.
    const db = await createTestDb();
    const scope = await setup(db);
    // The real clock, not NOW: `recordPauseStart` runs `assertWriteClock`,
    // which refuses an `at` more than 60s from the database's own clock — a
    // fixed literal would make this test start failing on its own tomorrow.
    const pausedAt = new Date();
    await db.transaction((tx) =>
      recordPauseStart(
        tx,
        scope.workspaceId,
        pausedAt,
        new Date(pausedAt.getTime() + 30 * 24 * 3_600_000),
        pausedAt
      )
    );
    await expect(createProfile(db, scope, "Anna", now())).rejects.toBeInstanceOf(
      WorkspacePausedError
    );
    expect(await db.select().from(creatorProfiles)).toHaveLength(0);

    await db
      .update(schema.pausePeriods)
      .set({ endedAt: new Date() })
      .where(eq(schema.pausePeriods.workspaceId, scope.workspaceId as string));
    const ok = await createProfile(db, scope, "Anna", now());
    expect(ok.displayName).toBe("Anna");
  });

  it("REFUSES a forged scope before reading a single field of it (R1)", async () => {
    const db = await createTestDb();
    const scope = await setup(db, { role: "viewer" });
    // The escalation the cage exists for: a plain object carrying the right
    // shape and a better role. It compiles at exit 0.
    const forged = Object.assign({}, scope, {
      role: "owner",
    }) as unknown as WorkspaceScope;
    await expect(createProfile(db, forged, "Anna", now())).rejects.toBeInstanceOf(
      ScopeForgeryError
    );
    expect(await db.select().from(creatorProfiles)).toHaveLength(0);
  });

  it("...and the cage runs BEFORE the role read — a forged VIEWER is a forgery, not a role refusal", async () => {
    // THIS TEST EXISTS BECAUSE THE MUTATION MATRIX FOUND ITS ABSENCE. Deleting
    // `assertScoped` from `createProfile` left the suite GREEN: the forgery was
    // still caught, but by `workspaceWriteCapabilities` at the END — after the
    // role gate had trusted a forged `role`, and after `hasOpenPause`,
    // `getWorkspaceBillingState` and `getActiveConfig` had all run against a
    // caller-chosen `workspaceId`. The docblock says "assertScoped FIRST,
    // before any field of `scope` is read", and nothing checked the ordering.
    //
    // The discriminator is a forged scope whose role would ALSO be refused: if
    // the cage runs first this is a ScopeForgeryError, and if the role gate
    // runs first it is a ProfileRoleError. Only one of those is the ordering
    // the comment claims.
    const db = await createTestDb();
    const scope = await setup(db);
    const forgedViewer = Object.assign({}, scope, {
      role: "viewer",
    }) as unknown as WorkspaceScope;
    const err = await createProfile(db, forgedViewer, "Anna", now()).catch((e) => e);
    expect(err).toBeInstanceOf(ScopeForgeryError);
    expect(
      err,
      "the role gate ran before the cage — a forged scope's role was trusted"
    ).not.toBeInstanceOf(ProfileRoleError);
  });

  it("a display name cannot be blank, over-length, or carry a line break", async () => {
    const db = await createTestDb();
    const scope = await setup(db);
    for (const bad of ["", "   ", "\n", "a\nb", "x".repeat(81)]) {
      await expect(
        createProfile(db, scope, bad, now()),
        JSON.stringify(bad)
      ).rejects.toBeInstanceOf(ProfileNameError);
    }
    expect(await db.select().from(creatorProfiles)).toHaveLength(0);
    // ...and the boundary in the allowed direction, so the ceiling is a
    // ceiling and not an off-by-one refusal of an 80-character name.
    const ok = await createProfile(db, scope, "y".repeat(80), now());
    expect(ok.displayName).toHaveLength(80);
  });

  it("normalises the name (NFC + trim) rather than storing what the textarea sent", async () => {
    const db = await createTestDb();
    const scope = await setup(db);
    // "é" as base + combining acute — visually identical to the composed form,
    // different bytes, and only one of them would ever match a later lookup.
    const decomposed = "  Amélie  ";
    const p = await createProfile(db, scope, decomposed, now());
    expect(p.displayName).toBe("Amélie");
    // Counted in CODE POINTS, so an emoji name is not four characters of budget.
    const db2 = await createTestDb();
    const scope2 = await setup(db2);
    const emoji = await createProfile(db2, scope2, "\u{1F469}‍\u{1F3A4}", now());
    expect(emoji.displayName).toBe("\u{1F469}‍\u{1F3A4}");
  });

  it("REFUSES a stale `at` — the instant decides the TIER, so it is clock-guarded", async () => {
    // THE BILLING GATE'S FINDING (2026-08-27). `at` is not decoration:
    // `getWorkspaceBillingState` compares `graceExpiresAt > at`, so an `at` far
    // enough in the past resolves an EXPIRED grace period back to the paid tier
    // and hands out its higher `profileCaps`. Every sibling allocating write in
    // this package takes `assertWriteClock`; this one did not.
    const db = await createTestDb();
    const scope = await setup(db);
    const stale = new Date(Date.now() - 6 * 60 * 60 * 1000);
    await expect(
      createProfile(db, scope, "Anna", stale)
    ).rejects.toBeInstanceOf(ClockSkewError);
    expect(await db.select().from(creatorProfiles)).toHaveLength(0);

    // ...and the same guard refuses a FUTURE `at`, which is the direction that
    // would buy a not-yet-started grace period.
    await expect(
      createProfile(db, scope, "Anna", new Date(Date.now() + 6 * 60 * 60 * 1000))
    ).rejects.toBeInstanceOf(ClockSkewError);

    // NON-VACUITY: a live clock still creates.
    const ok = await createProfile(db, scope, "Anna", now());
    expect(ok.displayName).toBe("Anna");
  });

  // The RUNTIME STRIP of a smuggled `workspaceId` / `state` is asserted where
  // the object is actually built — `workspaceWriteCapabilities().createProfile`
  // in packages/db, see `profile-scope.test.ts`. Asserting it here would only
  // prove that a non-string display name fails to normalise, which is a
  // different guard wearing this one's name.
});
