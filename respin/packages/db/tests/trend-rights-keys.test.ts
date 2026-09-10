// Phase 10b-1 fix round 2 (tenancy gate CHANGE 2): the two composite keys that
// tie a transcript, cache claim and autopsy to its trend item's RIGHTS SCOPE
// (migration 0056) and, for the private class, to its item's PROFILE
// (migration 0057). The producers in trends-storage.ts always selected the
// item by scope and profile; these keys make the database refuse the
// disagreement, and this suite is the refused-insert witness the register
// claimed and did not have.
import { beforeEach, describe, expect, it } from "vitest";

import { ensureUserWorkspace } from "../src/bootstrap";
import { creatorProfiles } from "../src/brain-schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { autopsies, autopsyCacheClaims, trendItems, trendSources, trendTranscripts } from "../src/trends-schema";

const item = (workspace: string | null, profileId: string | null, sourceId: string, marker: string) => ({
  sourceId,
  externalVideoId: `${marker}-VIDEO`,
  niche: `${marker}-NICHE`,
  title: `${marker}-TREND`,
  channelId: `${marker}-CHANNEL`,
  videoViews: 200n,
  channelMedianRecentViews: "100",
  baselineSampleSize: 1,
  baselineObservationIds: [`${marker}-BASELINE`],
  baselineWindowStartsAt: new Date("2026-08-01T00:00:00.000Z"),
  baselineWindowEndsAt: new Date("2026-09-01T00:00:00.000Z"),
  sourcePublishedAt: new Date("2026-08-31T00:00:00.000Z"),
  outlierRatio: "2",
  rightsScope: (workspace ? "profile_private" : "shared_analysis") as "profile_private" | "shared_analysis",
  profileId,
  workspaceId: workspace,
  transcriptState: "transcript_available" as const,
  saturation: "unmeasured" as const,
  saturationUnmeasuredReason: "incomplete_provenance" as const,
});

async function refusal(run: () => Promise<unknown>): Promise<{ code?: string; constraint?: string } | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? (error as { code?: string; constraint?: string });
    return { code: cause.code, constraint: cause.constraint };
  }
}

describe("a transcript, claim or autopsy cannot disagree with its trend item", () => {
  let db: TestDb;
  let workspaceId: string;
  let p1: string;
  let p2: string;
  let privateItem: string;
  let sharedItem: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "keys-auth", "keys@example.test");
    const { workspace } = await ensureUserWorkspace(db, { authUserId: "keys-auth", name: "Keys" });
    workspaceId = workspace.id;
    const [a] = await db.insert(creatorProfiles).values({ workspaceId, displayName: "P1" }).returning();
    const [b] = await db.insert(creatorProfiles).values({ workspaceId, displayName: "P2" }).returning();
    p1 = a!.id;
    p2 = b!.id;
    const [privateSource] = await db.insert(trendSources).values({ kind: "submitted", externalId: "PRIV", sourceUrl: "https://example.test/p", profileId: p1, workspaceId }).returning();
    const [sharedSource] = await db.insert(trendSources).values({ kind: "youtube", externalId: "SHARED", sourceUrl: "https://example.test/s" }).returning();
    privateItem = (await db.insert(trendItems).values(item(workspaceId, p1, privateSource!.id, "PRIV")).returning())[0]!.id;
    sharedItem = (await db.insert(trendItems).values(item(null, null, sharedSource!.id, "SHARED")).returning())[0]!.id;
  });

  const privateTranscript = (trendItemId: string, profileId: string) => ({
    trendItemId, rightsScope: "profile_private" as const, rightsBasis: "profile_private" as const, profileId, workspaceId,
    content: "t", contentDigest: `d_${trendItemId}_${profileId}`, provenance: { provider: "creator_paste" },
  });
  const privateAutopsy = (trendItemId: string, profileId: string) => ({
    trendItemId, contentDigest: `a_${profileId}`, analysisVersion: "v1", rightsScope: "profile_private" as const, rightsBasis: "profile_private" as const,
    profileId, workspaceId, status: "completed" as const, analysis: {},
  });
  const privateClaim = (trendItemId: string, profileId: string) => ({
    trendItemId, contentDigest: `c_${profileId}`, analysisVersion: "v1", rightsScope: "profile_private" as const, rightsBasis: "profile_private" as const,
    profileId, workspaceId, cacheScopeKey: profileId, status: "pending" as const,
  });

  it("the agreeing rows insert (the keys are not over-tight)", async () => {
    await db.insert(trendTranscripts).values(privateTranscript(privateItem, p1));
    await db.insert(autopsies).values(privateAutopsy(privateItem, p1));
    await db.insert(autopsyCacheClaims).values(privateClaim(privateItem, p1));
    await db.insert(trendTranscripts).values({
      trendItemId: sharedItem, rightsScope: "shared_analysis", rightsBasis: "independently_licensed", rightsEvidenceId: "lic-1",
      content: "s", contentDigest: "d_shared", provenance: { sourceReference: "lic-1" },
    });
    await db.insert(autopsies).values({ trendItemId: sharedItem, contentDigest: "a_shared", analysisVersion: "v1", rightsScope: "shared_analysis", rightsBasis: "independently_licensed", rightsEvidenceId: "lic-1", status: "completed", analysis: {} });
    await db.insert(autopsyCacheClaims).values({ trendItemId: sharedItem, contentDigest: "c_shared", analysisVersion: "v1", rightsScope: "shared_analysis", rightsBasis: "independently_licensed", rightsEvidenceId: "lic-1", cacheScopeKey: "shared", status: "pending" });
  });

  it("SCOPE: a private row on a SHARED item is refused by the rights-scope key, on all three tables (migration 0056)", async () => {
    // A private row needs a profile; the shared item has none, so the profile
    // key is inert here (NULL parent side does not exist -> the scope key is
    // what refuses, or the profile key on the private item below).
    expect(await refusal(() => db.insert(trendTranscripts).values(privateTranscript(sharedItem, p1)))).toMatchObject({ code: "23503" });
    expect(await refusal(() => db.insert(autopsies).values(privateAutopsy(sharedItem, p1)))).toMatchObject({ code: "23503" });
    expect(await refusal(() => db.insert(autopsyCacheClaims).values(privateClaim(sharedItem, p1)))).toMatchObject({ code: "23503" });
    // And a shared row on a PRIVATE item, by the scope key by name.
    expect(
      await refusal(() =>
        db.insert(trendTranscripts).values({
          trendItemId: privateItem, rightsScope: "shared_analysis", rightsBasis: "independently_licensed", rightsEvidenceId: "lic-x",
          content: "x", contentDigest: "d_x", provenance: { sourceReference: "lic-x" },
        })
      )
    ).toEqual({ code: "23503", constraint: "trend_transcripts_trend_item_rights_scope_fk" });
    expect(
      await refusal(() => db.insert(autopsies).values({ trendItemId: privateItem, contentDigest: "a_x", analysisVersion: "v1", rightsScope: "shared_analysis", rightsBasis: "independently_licensed", rightsEvidenceId: "lic-x", status: "completed", analysis: {} }))
    ).toEqual({ code: "23503", constraint: "autopsies_trend_item_rights_scope_fk" });
    expect(
      await refusal(() => db.insert(autopsyCacheClaims).values({ trendItemId: privateItem, contentDigest: "c_x", analysisVersion: "v1", rightsScope: "shared_analysis", rightsBasis: "independently_licensed", rightsEvidenceId: "lic-x", cacheScopeKey: "shared", status: "pending" }))
    ).toEqual({ code: "23503", constraint: "autopsy_cache_claims_trend_item_rights_scope_fk" });
  });

  it("PROFILE: P2's private row on P1's private item is refused by the profile key, on all three tables (migration 0057)", async () => {
    expect(await refusal(() => db.insert(trendTranscripts).values(privateTranscript(privateItem, p2)))).toEqual({ code: "23503", constraint: "trend_transcripts_trend_item_profile_fk" });
    expect(await refusal(() => db.insert(autopsies).values(privateAutopsy(privateItem, p2)))).toEqual({ code: "23503", constraint: "autopsies_trend_item_profile_fk" });
    expect(await refusal(() => db.insert(autopsyCacheClaims).values(privateClaim(privateItem, p2)))).toEqual({ code: "23503", constraint: "autopsy_cache_claims_trend_item_profile_fk" });
  });
});
