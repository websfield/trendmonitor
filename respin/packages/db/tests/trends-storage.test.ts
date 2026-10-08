import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import { pausePeriods } from "../src/billing-schema";
import { creatorProfiles } from "../src/brain-schema";
import type { DbLike } from "../src/db-like";
import { ProfileRoleError, ScopeForgeryError, WorkspacePausedError } from "../src/errors";
import { memberships, users } from "../src/schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { appendReferencePost } from "../src/onboarding-ops";
import { autopsies, autopsyCacheClaims, trackedNiches, trendItems, trendTranscripts } from "../src/trends-schema";
import {
  createPrivateSubmittedTrendSource,
  claimSharedAutopsyForSystem,
  createTrendSource,
  feedItemsForProfile,
  recordPrivateTrendItem,
  recordPrivateTrendTranscript,
  recordSharedTrendItem,
  recordSharedTrendTranscript,
  reusableAutopsyForProfile,
  spinReferenceForProfile,
  trackedNichesForProfile,
  trendFeedProjection,
  systemRefreshNiches,
  trackNicheForProfile,
  untrackNicheForProfile,
} from "../src/trends-storage";
import { ProfileScope, withWorkspace } from "../src/with-workspace";

const HERE = dirname(fileURLToPath(import.meta.url));

async function fixture() {
  const db = await createTestDb();
  await seedAuthUser(db, "tracked_niche_owner");
  const { workspace } = await ensureUserWorkspace(db, {
    authUserId: "tracked_niche_owner",
    name: "Tracked niche",
  });
  const scope = await withWorkspace(db, { authUserId: "tracked_niche_owner" });
  const [profile] = await db.insert(creatorProfiles).values({
    workspaceId: workspace.id,
    displayName: "Tracked niche profile",
  }).returning();
  return { db, workspace, scope, profile };
}

describe("tracked niche storage", () => {
  it("canonicalizes duplicates and enforces the injected plan limit", async () => {
    const { db, scope, profile } = await fixture();
    const first = await trackNicheForProfile(
      db,
      scope,
      profile.id,
      "  Home   COOKING  ",
      { maxTrackedNiches: 1 },
    );
    const duplicate = await trackNicheForProfile(
      db,
      scope,
      profile.id,
      "home cooking",
      { maxTrackedNiches: 1 },
    );
    expect(duplicate.id).toBe(first.id);
    expect(await db.select().from(trackedNiches)).toHaveLength(1);
    expect((await db.select().from(trackedNiches))[0].niche).toBe("home cooking");

    await expect(trackNicheForProfile(
      db,
      scope,
      profile.id,
      "creator systems",
      { maxTrackedNiches: 1 },
    )).rejects.toThrow(/entitlement exhausted/i);
    await expect(trackNicheForProfile(
      db,
      scope,
      profile.id,
      "a".repeat(81),
      { maxTrackedNiches: 10 },
    )).rejects.toThrow(/at most 80 characters/i);

    await expect(trackedNichesForProfile(db, scope, profile.id)).resolves.toEqual([
      { id: first.id, niche: "home cooking" },
    ]);
    await expect(untrackNicheForProfile(db, scope, profile.id, first.id)).resolves.toEqual({
      id: first.id,
    });
    await expect(trackNicheForProfile(
      db,
      scope,
      profile.id,
      "creator systems",
      { maxTrackedNiches: 1 },
    )).resolves.toMatchObject({ niche: "creator systems" });
  });

  it("reduces scheduler input to sorted distinct niche labels with no owner ids", async () => {
    const { db, scope, profile } = await fixture();
    await trackNicheForProfile(db, scope, profile.id, "Video Editing", { maxTrackedNiches: 10 });
    await trackNicheForProfile(db, scope, profile.id, "business", { maxTrackedNiches: 10 });
    await expect(systemRefreshNiches(db)).resolves.toEqual(["business", "video editing"]);
    await expect(systemRefreshNiches(db, 1)).rejects.toThrow(/exceeds the admitted ceiling/i);
  });

  it("refuses the entitlement write while paused and resumes after the pause closes", async () => {
    const { db, workspace, scope, profile } = await fixture();
    const startedAt = new Date(Date.now() - 60_000);
    const [pause] = await db.insert(pausePeriods).values({
      workspaceId: workspace.id,
      startedAt,
      startedKnownAt: startedAt,
    }).returning();
    await expect(trackNicheForProfile(
      db,
      scope,
      profile.id,
      "home cooking",
      { maxTrackedNiches: 1 },
    )).rejects.toBeInstanceOf(WorkspacePausedError);
    expect(await db.select().from(trackedNiches)).toEqual([]);

    await db.update(pausePeriods).set({
      endedAt: new Date(),
      endedKnownAt: new Date(),
    }).where(eq(pausePeriods.id, pause.id));
    await expect(trackNicheForProfile(
      db,
      scope,
      profile.id,
      "home cooking",
      { maxTrackedNiches: 1 },
    )).resolves.toMatchObject({ id: expect.any(String) });
  });
});

describe("persisted shared-analysis rights", () => {
  async function sharedItem(db: TestDb, suffix: string) {
    const source = await createTrendSource(db, {
      kind: "youtube",
      externalId: `rights-${suffix}`,
      sourceUrl: `https://example.test/rights-${suffix}`,
    });
    return recordSharedTrendItem(db, {
      ...ITEM_OBSERVATION,
      sourceId: source.id,
      externalVideoId: `rights-video-${suffix}`,
      niche: "rights",
      title: `Rights ${suffix}`,
      channelId: "rights-channel",
    });
  }

  it("requires a consent subject and evidence, propagates both to the claim, and cascades on identity deletion", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "rights_consent_owner");
    const { user } = await ensureUserWorkspace(db, {
      authUserId: "rights_consent_owner",
      name: "Rights consent",
    });
    const item = await sharedItem(db, "consent");
    const base = {
      trendItemId: item.id,
      rightsScope: "shared_analysis" as const,
      rightsBasis: "creator_consent" as const,
      content: "Consent-backed transcript.",
      contentDigest: "consent-digest",
      provenance: {},
    };
    await expect(db.insert(trendTranscripts).values({
      ...base,
      rightsEvidenceId: "consent:missing-subject",
    })).rejects.toThrow();
    await expect(db.insert(trendTranscripts).values({
      ...base,
      rightsSubjectUserId: user.id,
      rightsEvidenceId: "   ",
    })).rejects.toThrow();

    const transcript = await recordSharedTrendTranscript(db, {
      trendItemId: item.id,
      content: "Consent-backed transcript.",
      rightsSubjectUserId: user.id,
      provenance: {
        provider: "youtube_creator_owned_oauth",
        sourceReference: "https://www.youtube.com/watch?v=rights-video-consent",
        sharedAnalysisRightsBasis: "creator_owned_caption_consent",
        consentEvidenceId: "consent:rights-owner",
      },
    });
    const claim = await claimSharedAutopsyForSystem(db, {
      trendItemId: item.id,
      contentDigest: transcript.contentDigest,
      analysisVersion: "rights-v1",
    });
    const [storedClaim] = await db.select().from(autopsyCacheClaims)
      .where(eq(autopsyCacheClaims.id, claim.cacheClaimId));
    expect(storedClaim).toMatchObject({
      rightsBasis: "creator_consent",
      rightsSubjectUserId: user.id,
      rightsEvidenceId: "consent:rights-owner",
    });
    await expect(db.update(trendTranscripts)
      .set({ rightsBasis: "independently_licensed", rightsSubjectUserId: null })
      .where(eq(trendTranscripts.id, transcript.id))).rejects.toThrow();

    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.select().from(trendTranscripts)).toHaveLength(0);
    expect(await db.select().from(autopsyCacheClaims)).toHaveLength(0);
  });

  it("keeps independently licensed shared analysis when an unrelated identity is deleted", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "rights_unrelated");
    const { user } = await ensureUserWorkspace(db, {
      authUserId: "rights_unrelated",
      name: "Unrelated",
    });
    const item = await sharedItem(db, "licensed");
    const [transcript] = await db.insert(trendTranscripts).values({
      trendItemId: item.id,
      rightsScope: "shared_analysis",
      rightsBasis: "independently_licensed",
      rightsEvidenceId: "licence:fixture-42",
      content: "Licensed transcript.",
      contentDigest: "licensed-digest",
      provenance: { provider: "licensed_fixture" },
    }).returning();
    await db.update(trendItems)
      .set({ transcriptState: "transcript_available" })
      .where(eq(trendItems.id, item.id));
    const claim = await claimSharedAutopsyForSystem(db, {
      trendItemId: item.id,
      contentDigest: transcript.contentDigest,
      analysisVersion: "rights-v1",
    });
    const [storedClaim] = await db.select().from(autopsyCacheClaims)
      .where(eq(autopsyCacheClaims.id, claim.cacheClaimId));
    const [autopsy] = await db.insert(autopsies).values({
      trendItemId: item.id,
      contentDigest: transcript.contentDigest,
      analysisVersion: "rights-v1",
      rightsScope: "shared_analysis",
      rightsBasis: storedClaim.rightsBasis,
      rightsSubjectUserId: storedClaim.rightsSubjectUserId,
      rightsEvidenceId: storedClaim.rightsEvidenceId,
      status: "completed",
      analysis: CANONICAL_ANALYSIS,
    }).returning();

    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.select().from(trendTranscripts)).toHaveLength(1);
    expect(await db.select().from(autopsyCacheClaims)).toHaveLength(1);
    expect(await db.select().from(autopsies)).toEqual([autopsy]);
  });
});

// ---------------------------------------------------------------------------
// Slice 8 fix pass (tenancy gate, 2026-09-03). Three findings, three witnesses
// at the WRITER level rather than the action level, because the action fixes
// `role: "owner"` (`tests/trends-actions.test.ts`) and a gate the action never
// drives is a gate nobody has seen refuse.
// ---------------------------------------------------------------------------

const CANONICAL_ANALYSIS = {
  hookMechanic: "open on a visible tradeoff",
  beats: ["show the setup", "turn on the constraint"],
  ending: "return to the opening tradeoff",
  followTrigger: "name the next mechanism to test",
  subjectTerms: ["batch cooking", "weeknight meals"],
  hook: "The pan I stopped using on weeknights",
  structure: { beatCount: 2, turnBeat: 1 },
} as const;

const ITEM_OBSERVATION = {
  videoViews: 200n,
  channelMedianRecentViews: "100.00000000",
  baselineSampleSize: 2,
  baselineObservationIds: ["baseline-a", "baseline-b"],
  baselineWindowStartsAt: new Date("2026-08-01T00:00:00Z"),
  baselineWindowEndsAt: new Date("2026-09-01T00:00:00Z"),
  sourcePublishedAt: new Date("2026-08-31T00:00:00Z"),
  transcriptState: "transcript_required",
  saturation: "unmeasured",
  saturationUnmeasuredReason: "incomplete_provenance",
} as const;

/** A second seat in the SAME workspace with the given role (frameworks.test.ts precedent). */
async function seatScope(
  db: Awaited<ReturnType<typeof createTestDb>>, workspaceId: string, role: "viewer" | "editor",
) {
  const authUserId = `tracked_niche_${role}`;
  await seedAuthUser(db, authUserId);
  const [user] = await db.insert(users).values({ authUserId }).returning();
  await db.insert(memberships).values({ userId: user.id, workspaceId, role });
  return withWorkspace(db, { authUserId, workspaceId });
}

describe("R-118: only owners can write or delete tracked niches", () => {
  it("refuses viewers and editors without changing rows; the owner succeeds", async () => {
    const { db, workspace, scope, profile } = await fixture();
    const viewer = await seatScope(db, workspace.id, "viewer");
    expect(viewer.role).toBe("viewer");
    const editor = await seatScope(db, workspace.id, "editor");
    expect(editor.role).toBe("editor");

    // Track: refused, and the table stays empty.
    await expect(
      trackNicheForProfile(db, viewer, profile.id, "home cooking", { maxTrackedNiches: 3 })
    ).rejects.toBeInstanceOf(ProfileRoleError);
    expect(await db.select().from(trackedNiches)).toEqual([]);

    // The owner writes the row the viewer could not.
    const owned = await trackNicheForProfile(db, scope, profile.id, "home cooking", { maxTrackedNiches: 3 });

    // Untrack: refused, and the owner-written row is intact.
    await expect(
      untrackNicheForProfile(db, viewer, profile.id, owned.id)
    ).rejects.toBeInstanceOf(ProfileRoleError);
    expect(await db.select().from(trackedNiches)).toHaveLength(1);

    // A viewer may still READ the list: the same rule every other profile
    // read in this package follows.
    await expect(trackedNichesForProfile(db, viewer, profile.id)).resolves.toEqual([
      { id: owned.id, niche: "home cooking" },
    ]);

    // ...and the refusal names the act, so the copy can be honest about it.
    await expect(
      trackNicheForProfile(db, viewer, profile.id, "another", { maxTrackedNiches: 3 })
    ).rejects.toMatchObject({ act: expect.stringMatching(/track a niche/i) });
    await expect(
      untrackNicheForProfile(db, viewer, profile.id, owned.id)
    ).rejects.toMatchObject({ act: expect.stringMatching(/remove a tracked niche/i) });

    // The owner can still remove it.
    await expect(untrackNicheForProfile(db, scope, profile.id, owned.id)).resolves.toEqual({ id: owned.id });

    await expect(
      trackNicheForProfile(db, editor, profile.id, "weeknight meals", { maxTrackedNiches: 3 })
    ).rejects.toBeInstanceOf(ProfileRoleError);
    await expect(
      untrackNicheForProfile(db, editor, profile.id, owned.id)
    ).rejects.toBeInstanceOf(ProfileRoleError);
    expect(await db.select().from(trackedNiches)).toEqual([]);
  });
});

describe("REQ-A03: a forged ProfileScope is refused BEFORE any query (CLAUDE.md 2026-08-21, the cast lesson)", () => {
  it("spinReferenceForProfile throws ScopeForgeryError on a cast object and never touches the database", async () => {
    const { db, workspace, profile } = await fixture();
    const forged = {
      profileId: profile.id,
      workspaceId: workspace.id,
      role: "owner",
      userId: "forged",
    } as unknown as ProfileScope;
    // A database that REFUSES to be queried: if the rights predicate ran
    // before the cage check, this is what would throw instead.
    const untouchable = new Proxy({}, {
      get(_target, property) {
        throw new Error(`the database was reached before the scope was checked (${String(property)})`);
      },
    }) as unknown as DbLike;
    await expect(spinReferenceForProfile(untouchable, forged, "00000000-0000-0000-0000-000000000001"))
      .rejects.toBeInstanceOf(ScopeForgeryError);
    // ...and the same call with a MINTED scope reaches the predicate (the
    // refusal above is the cage, not a coincidence of the fake db).
    const scope = await withWorkspace(db, { authUserId: "tracked_niche_owner" });
    const minted = await ProfileScope.mint(db, scope, profile.id);
    await expect(spinReferenceForProfile(db, minted, "00000000-0000-0000-0000-000000000001"))
      .rejects.toThrow(/inaccessible or unready/i);
  });

  it("the class, not the instance: EVERY exported function taking a `ProfileScope` asserts it first (population stated as a list)", () => {
    const source = readFileSync(join(HERE, "..", "src", "trends-storage.ts"), "utf8");
    const scan = (text: string) => {
      const found: { name: string; asserted: boolean }[] = [];
      const re = /export async function (\w+)\(([^)]*)\)[^{]*\{\s*([^\n]*)/g;
      for (const match of text.matchAll(re)) {
        const [, name, params, firstLine] = match;
        const scoped = /(\w+): ProfileScope\b/.exec(params);
        if (!scoped) continue;
        found.push({ name, asserted: firstLine.trim() === `assertScoped(${scoped[1]});` });
      }
      return found;
    };
    // THE POPULATION, AS A LIST (CLAUDE.md 2026-08-29): adding a second
    // function that receives an already-minted scope costs an entry here.
    const PROFILE_SCOPE_TAKERS = ["spinReferenceForProfile", "spinReferenceSummaryForProfile"];
    const real = scan(source);
    expect(real.map((f) => f.name).sort()).toEqual([...PROFILE_SCOPE_TAKERS].sort());
    for (const f of real) expect(f.asserted, `${f.name} does not call assertScoped as its first statement`).toBe(true);
    // NON-VACUITY: a planted taker WITHOUT the assertion is seen and reported.
    const planted = scan(
      "export async function leaky(\n  db: DbLike, profile: ProfileScope, id: string\n): Promise<void> {\n  const [row] = await db.select();\n}\n"
    );
    expect(planted).toEqual([{ name: "leaky", asserted: false }]);
    // ...and a WorkspaceScope taker is deliberately outside this rule: it
    // mints, and the mint asserts.
    expect(scan("export async function fine(db: DbLike, scope: WorkspaceScope, id: string) {\n  const p = await ProfileScope.mint(db, scope, id);\n}\n")).toEqual([]);
  });
});

async function crossProfileFixture() {
  const db = await createTestDb();
  await seedAuthUser(db, "cross_profile_owner");
  const { user, workspace } = await ensureUserWorkspace(db, { authUserId: "cross_profile_owner", name: "Cross profile" });
  const scope = await withWorkspace(db, { authUserId: "cross_profile_owner" });
  const [a, b] = await db.insert(creatorProfiles).values([
    { workspaceId: workspace.id, displayName: "Profile A" },
    { workspaceId: workspace.id, displayName: "Profile B" },
  ]).returning();

  const seedPrivate = async (profile: { id: string }, label: string) => {
    const source = await createPrivateSubmittedTrendSource(db, scope, profile.id, {
      externalId: `submitted-${label}`, sourceUrl: `https://example.test/submitted/${label}`,
    });
    const item = await recordPrivateTrendItem(db, scope, profile.id, {
      ...ITEM_OBSERVATION, sourceId: source.id, externalVideoId: `video-${label}`, niche: "home cooking",
      title: `${label} private reference`, channelId: `channel-${label}`,
    });
    // Slice 8c (R2): the transcript is bound to a reference-class input.
    const reference = await appendReferencePost(
      db, scope, profile.id, `Private transcript for ${label}.`, `https://example.test/submitted/${label}`,
    );
    const transcript = await recordPrivateTrendTranscript(db, scope, profile.id, {
      trendItemId: item.id, content: reference.content, referenceInputId: reference.id,
      sourceUrl: `https://example.test/submitted/${label}`,
    });
    const [autopsy] = await db.insert(autopsies).values({
      trendItemId: item.id, contentDigest: transcript.contentDigest, analysisVersion: "v1",
      rightsScope: "profile_private", profileId: profile.id, workspaceId: workspace.id,
      rightsBasis: "profile_private",
      status: "completed", analysis: { ...CANONICAL_ANALYSIS, hook: `${label} private hook` },
    }).returning();
    const niche = await trackNicheForProfile(db, scope, profile.id, "home cooking", { maxTrackedNiches: 3 });
    return { source, item, transcript, autopsy, niche };
  };
  const A = await seedPrivate(a, "A");
  const B = await seedPrivate(b, "B");

  const sharedSource = await createTrendSource(db, {
    kind: "youtube", externalId: "shared-source", sourceUrl: "https://example.test/shared",
  });
  const sharedItem = await recordSharedTrendItem(db, {
    ...ITEM_OBSERVATION, sourceId: sharedSource.id, externalVideoId: "shared-video", niche: "home cooking",
    title: "A shared-analysis item", channelId: "shared-channel",
  });
  const sharedTranscript = await recordSharedTrendTranscript(db, {
    trendItemId: sharedItem.id, content: "Rights-backed shared transcript.",
    rightsSubjectUserId: user.id,
    provenance: {
      provider: "youtube_creator_owned_oauth", sourceReference: "https://www.youtube.com/watch?v=shared-video",
      sharedAnalysisRightsBasis: "creator_owned_caption_consent", consentEvidenceId: "consent-shared",
    },
  });
  const [sharedAutopsy] = await db.insert(autopsies).values({
    trendItemId: sharedItem.id, contentDigest: sharedTranscript.contentDigest, analysisVersion: "v1",
    rightsScope: "shared_analysis",
    rightsBasis: sharedTranscript.rightsBasis,
    rightsSubjectUserId: sharedTranscript.rightsSubjectUserId,
    rightsEvidenceId: sharedTranscript.rightsEvidenceId,
    status: "completed", analysis: { ...CANONICAL_ANALYSIS, hook: "shared hook" },
  }).returning();

  return { db, workspace, scope, a, b, A, B, shared: { item: sharedItem, transcript: sharedTranscript, autopsy: sharedAutopsy } };
}

describe("REQ-A03: the `or(shared, and(private, pair))` readers under a cross-profile ATTEMPT (tenancy CHANGE, 2026-09-03)", () => {
  it("a sibling's private items, autopsies, spin references and niches are invisible; the shared row is visible to both", async () => {
    const { db, scope, a, b, A, B, shared } = await crossProfileFixture();

    // The FEED: own private + shared, never the sibling's private.
    const feedA = (await feedItemsForProfile(db, scope, a.id)).map((row) => row.id).sort();
    expect(feedA).toEqual([A.item.id, shared.item.id].sort());
    expect(feedA).not.toContain(B.item.id);
    const feedB = (await feedItemsForProfile(db, scope, b.id)).map((row) => row.id).sort();
    expect(feedB).toEqual([B.item.id, shared.item.id].sort());
    expect(feedB).not.toContain(A.item.id);
    // ...and the app projection agrees (it composes the same reader).
    const projectedA = await trendFeedProjection(db, scope, a.id);
    expect(projectedA.map((row) => row.id).sort()).toEqual(feedA);
    expect(projectedA.map((row) => row.autopsy.hook).sort()).toEqual(["A private hook", "shared hook"]);

    // THE SPIN REFERENCE: the sibling's autopsy id refuses; own and shared resolve.
    const scopeA = await ProfileScope.mint(db, scope, a.id);
    await expect(spinReferenceForProfile(db, scopeA, B.autopsy.id)).rejects.toThrow(/inaccessible or unready/i);
    await expect(spinReferenceForProfile(db, scopeA, A.autopsy.id)).resolves.toMatchObject({ hook: "A private hook" });
    await expect(spinReferenceForProfile(db, scopeA, shared.autopsy.id)).resolves.toMatchObject({ hook: "shared hook" });
    const scopeB = await ProfileScope.mint(db, scope, b.id);
    await expect(spinReferenceForProfile(db, scopeB, A.autopsy.id)).rejects.toThrow(/inaccessible or unready/i);
    await expect(spinReferenceForProfile(db, scopeB, shared.autopsy.id)).resolves.toMatchObject({ hook: "shared hook" });

    // THE CACHE: a sibling's private autopsy is not reusable by digest either.
    await expect(reusableAutopsyForProfile(db, scope, a.id, {
      contentDigest: B.transcript.contentDigest, analysisVersion: "v1",
    })).resolves.toEqual([]);
    await expect(reusableAutopsyForProfile(db, scope, a.id, {
      contentDigest: A.transcript.contentDigest, analysisVersion: "v1",
    })).resolves.toHaveLength(1);
    for (const profile of [a, b]) {
      await expect(reusableAutopsyForProfile(db, scope, profile.id, {
        contentDigest: shared.transcript.contentDigest, analysisVersion: "v1",
      })).resolves.toHaveLength(1);
    }

    // THE NICHE WRITER: the sibling's tracked-niche id refuses and the row survives.
    await expect(untrackNicheForProfile(db, scope, a.id, B.niche.id)).rejects.toThrow(/not accessible to this profile/i);
    expect(await db.select().from(trackedNiches).where(eq(trackedNiches.id, B.niche.id))).toHaveLength(1);
    await expect(trackedNichesForProfile(db, scope, a.id)).resolves.toEqual([{ id: A.niche.id, niche: "home cooking" }]);
  });

  it("an autopsy mis-parented onto a sibling's item is REFUSED by the schema, so the feed's item predicate no longer has to catch it", async () => {
    // MEASURED 2026-09-03: with the profile pair DELETED from the private
    // branch of `feedItemsForProfile`'s item predicate, the test above stayed
    // GREEN, because the autopsy join re-checked the pair and dropped the
    // sibling's item anyway — and `autopsies` then carried no constraint tying
    // its own pair to its item's, so a row whose autopsy said "A" over an
    // item that said "B" was representable. Since migration 0057 (Phase 10b-1
    // fix round 2) the composite `(trend_item_id, profile_id)` key refuses
    // that row at the database, which is the structural form of the witness
    // this case used to be. Pinned by constraint name; the feed is then read
    // with only legitimate rows and must still show exactly A's and the shared item.
    const { db, workspace, scope, a, A, B, shared } = await crossProfileFixture();
    let refusal: { code?: string; constraint?: string } | null = null;
    try {
      await db.insert(autopsies).values({
        trendItemId: B.item.id, contentDigest: `${B.transcript.contentDigest}-misparented`, analysisVersion: "v1",
        rightsScope: "profile_private", profileId: a.id, workspaceId: workspace.id,
        rightsBasis: "profile_private",
        status: "completed", analysis: { ...CANONICAL_ANALYSIS, hook: "mis-parented hook" },
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? (error as { code?: string; constraint?: string });
      refusal = { code: cause.code, constraint: cause.constraint };
    }
    expect(refusal).toEqual({ code: "23503", constraint: "autopsies_trend_item_profile_fk" });
    const feedA = (await feedItemsForProfile(db, scope, a.id)).map((row) => row.id).sort();
    expect(feedA).toEqual([A.item.id, shared.item.id].sort());
    expect(feedA).not.toContain(B.item.id);
  });
});
