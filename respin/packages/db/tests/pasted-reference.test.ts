// Slice 8c stage A (R-96 / R1–R7): the creator paste-transcript intake, its
// owner-only reader, the unavailable baseline, and the transcript's reference
// input — every requirement's witness, at the storage layer, with the three
// planted mutations the card names (M3, M7, M8) each reddening one case here.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import { pausePeriods } from "../src/billing-schema";
import { creatorProfiles } from "../src/brain-schema";
import { PostContentError, ProfileAccessError, ProfileRoleError, WorkspacePausedError } from "../src/errors";
import { appendOwnPost, appendReferencePost } from "../src/onboarding-ops";
import { onboardingInputs } from "../src/onboarding-schema";
import { AUTOPSY_ATTEMPT_CODE_CEILING } from "../src/autopsy-policy";
import { memberships, users } from "../src/schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { autopsies, autopsyCacheClaims, trendItems, trendSources, trendTranscripts } from "../src/trends-schema";
import {
  AUTOPSY_ANALYSIS_VERSION,
  PASTED_REFERENCE_TITLE_MAX,
  createPrivateSubmittedTrendSource,
  createTrendSource,
  digestTranscriptContent,
  feedItemsForProfile,
  claimPrivateAutopsyForSystem,
  intakePastedReference,
  normalisePastedReferenceUrl,
  parkedAutopsyClaimsForProfile,
  pastedReferenceForProfile,
  pastedReferencesForProfile,
  recordPrivateTrendItem,
  recordPrivateTrendTranscript,
  recordSharedTrendItem,
  recordSharedTrendTranscript,
  spinReferenceForProfile,
  trackNicheForProfile,
  trendFeedProjection,
  type SharedTrendItemInput,
} from "../src/trends-storage";
import { normaliseContent, ProfileScope, withWorkspace } from "../src/with-workspace";

const PASTED_URL = "HTTPS://WWW.YouTube.com/watch?utm_source=newsletter&v=abc123&si=Trk&feature=share#t=42";
const CANONICAL_URL = "https://www.youtube.com/watch?v=abc123";
const TRANSCRIPT = "Open on the tradeoff.\r\nShow the pan.\r\nReturn to the tradeoff.";

const CANONICAL_ANALYSIS = {
  hookMechanic: "open on a visible tradeoff",
  beats: ["show the setup", "turn on the constraint"],
  ending: "return to the opening tradeoff",
  followTrigger: "name the next mechanism to test",
  subjectTerms: ["batch cooking", "weeknight meals"],
  hook: "The pan I stopped using on weeknights",
  structure: { beatCount: 2, turnBeat: 1 },
} as const;

const MEASURED: Omit<SharedTrendItemInput, "sourceId" | "externalVideoId" | "niche" | "title" | "channelId"> = {
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
};

async function fixture() {
  const db = await createTestDb();
  await seedAuthUser(db, "paste_owner");
  const { workspace } = await ensureUserWorkspace(db, { authUserId: "paste_owner", name: "Paste" });
  const scope = await withWorkspace(db, { authUserId: "paste_owner" });
  const [a, b] = await db.insert(creatorProfiles).values([
    { workspaceId: workspace.id, displayName: "Profile A" },
    { workspaceId: workspace.id, displayName: "Profile B" },
  ]).returning();
  return { db, workspace, scope, a, b };
}

/** Row counts across the five tables one paste writes — the idempotency oracle. */
async function counts(db: TestDb) {
  return {
    inputs: (await db.select().from(onboardingInputs)).length,
    sources: (await db.select().from(trendSources)).length,
    items: (await db.select().from(trendItems)).length,
    transcripts: (await db.select().from(trendTranscripts)).length,
    claims: (await db.select().from(autopsyCacheClaims)).length,
  };
}

const NOTHING = { inputs: 0, sources: 0, items: 0, transcripts: 0, claims: 0 };

/** A second seat in the SAME workspace with the given role (trends-storage.test.ts precedent). */
async function seatScope(db: TestDb, workspaceId: string, role: "viewer" | "editor") {
  const authUserId = `paste_${role}`;
  await seedAuthUser(db, authUserId);
  const [user] = await db.insert(users).values({ authUserId }).returning();
  await db.insert(memberships).values({ userId: user.id, workspaceId, role });
  return withWorkspace(db, { authUserId, workspaceId });
}

/** Complete a claim the way the worker does: an autopsy row, then the claim transition. */
async function completeClaim(db: TestDb, claimId: string, analysis: Record<string, unknown> = CANONICAL_ANALYSIS) {
  const [claim] = await db.select().from(autopsyCacheClaims).where(eq(autopsyCacheClaims.id, claimId));
  const [autopsy] = await db.insert(autopsies).values({
    trendItemId: claim.trendItemId, contentDigest: claim.contentDigest, analysisVersion: claim.analysisVersion,
    rightsScope: "profile_private", profileId: claim.profileId, workspaceId: claim.workspaceId,
    rightsBasis: "profile_private",
    status: "completed", analysis,
  }).returning();
  await db.update(autopsyCacheClaims).set({ status: "completed", autopsyId: autopsy.id }).where(eq(autopsyCacheClaims.id, claimId));
  return autopsy;
}

/**
 * The NAME of the constraint that refused a write. Drizzle wraps the driver's
 * error ("Failed query: …") and keeps the Postgres message — `violates check
 * constraint "x"` / `violates unique constraint "x"` — on `cause`, so a
 * `.toThrow(/x/)` on the wrapper never sees it. Returning the joined text lets
 * every CHECK assertion below name WHICH constraint fired rather than settle
 * for "something threw".
 */
async function refusedBy(write: Promise<unknown>): Promise<string> {
  try {
    await write;
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return `${(error as Error).message}\n${cause?.message ?? ""}`;
  }
  throw new Error("expected the write to be refused, and it landed");
}

describe("R4: the URL normalisation rule, stated in the writer and tested here", () => {
  it("lowercases scheme and host, keeps the path, strips utm_*/si/feature, sorts the rest, drops the fragment and userinfo", () => {
    expect(normalisePastedReferenceUrl(PASTED_URL)).toBe(CANONICAL_URL);
    expect(normalisePastedReferenceUrl("https://youtu.be/AbC-DeF?si=1")).toBe("https://youtu.be/AbC-DeF");
    expect(normalisePastedReferenceUrl("https://Example.test/Path/Case?z=1&UTM_Campaign=c&a=2")).toBe("https://example.test/Path/Case?a=2&z=1");
    expect(normalisePastedReferenceUrl("https://user:secret@example.test/p")).toBe("https://example.test/p");
    expect(normalisePastedReferenceUrl("  http://example.test/p  ")).toBe("http://example.test/p");
    // A key that is NOT on the list survives: it may be what names the video.
    expect(normalisePastedReferenceUrl("https://example.test/p?v=1&t=10")).toBe("https://example.test/p?t=10&v=1");
  });

  it("refuses anything that is not an absolute http(s) URL with a host", () => {
    for (const bad of ["", "   ", "ftp://example.test/x", "javascript:alert(1)", "not a url", "//example.test/x", "http://", "mailto:a@b.c"]) {
      expect(() => normalisePastedReferenceUrl(bad), JSON.stringify(bad)).toThrow(/http\(s\) URL|required/);
    }
  });
});

describe("R4: intakePastedReference writes the five rows in one transaction", () => {
  it("stores the reference input, the submitted source, an unavailable-baseline item, the bound transcript and a pending claim", async () => {
    const { db, scope, a } = await fixture();
    expect(await counts(db)).toEqual(NOTHING);
    const result = await intakePastedReference(db, scope, a.id, { sourceUrl: PASTED_URL, transcript: TRANSCRIPT });
    expect(await counts(db)).toEqual({ inputs: 1, sources: 1, items: 1, transcripts: 1, claims: 1 });

    const [input] = await db.select().from(onboardingInputs);
    expect(input).toMatchObject({ id: result.referenceInputId, inputClass: "reference", sourceUrl: CANONICAL_URL, profileId: a.id });
    expect(input.content).toBe(normaliseContent(TRANSCRIPT));
    expect(input.content).not.toContain("\r");

    const [source] = await db.select().from(trendSources);
    expect(source).toMatchObject({ kind: "submitted", externalId: CANONICAL_URL, sourceUrl: CANONICAL_URL, profileId: a.id });

    const [item] = await db.select().from(trendItems);
    const digest = digestTranscriptContent(input.content);
    expect(item).toMatchObject({
      id: result.itemId, sourceId: source.id, externalVideoId: digest, rightsScope: "profile_private", profileId: a.id,
      baselineState: "unavailable", transcriptState: "transcript_available", title: "", niche: "",
      // C11 fix: the reason names the CAUSE — a paste's provenance is
      // complete; it has no POPULATION (migration 0028 ties the two).
      saturation: "unmeasured", saturationUnmeasuredReason: "no_population",
      // THE EIGHT, all NULL: no channel, no views, no window, no ratio (R1).
      channelId: null, videoViews: null, channelMedianRecentViews: null, baselineSampleSize: null,
      baselineObservationIds: null, baselineWindowStartsAt: null, baselineWindowEndsAt: null, outlierRatio: null,
    });

    const [transcript] = await db.select().from(trendTranscripts);
    expect(transcript).toMatchObject({
      trendItemId: item.id, referenceInputId: input.id, contentDigest: digest, rightsScope: "profile_private", profileId: a.id,
      provenance: { kind: "creator_paste", sourceUrl: CANONICAL_URL, referenceInputId: input.id },
    });
    // The transcript IS the onboarding input: same bytes, same digest.
    expect(transcript.content).toBe(input.content);
    expect(transcript.contentDigest).toBe(input.contentSha256);

    const [claim] = await db.select().from(autopsyCacheClaims);
    expect(claim).toMatchObject({
      id: result.claimId, trendItemId: item.id, contentDigest: digest, analysisVersion: AUTOPSY_ANALYSIS_VERSION,
      rightsScope: "profile_private", profileId: a.id, cacheScopeKey: a.id, status: "pending", attemptCount: 1, autopsyId: null,
    });
    expect(result).toEqual({
      referenceInputId: input.id, itemId: item.id, claimId: claim.id, claimStatus: "pending", autopsyId: null,
    });
  });

  it("is IDEMPOTENT: the same URL (spelled differently) and the same text (CRLF vs LF) returns the same rows and inserts nothing", async () => {
    const { db, scope, a } = await fixture();
    const first = await intakePastedReference(db, scope, a.id, { sourceUrl: PASTED_URL, transcript: TRANSCRIPT });
    const before = await counts(db);
    const second = await intakePastedReference(db, scope, a.id, {
      sourceUrl: "https://www.youtube.com/watch?v=abc123&utm_medium=email", transcript: TRANSCRIPT.replace(/\r\n/g, "\n"),
    });
    expect(second).toEqual(first);
    expect(await counts(db)).toEqual(before);
    expect(before).toEqual({ inputs: 1, sources: 1, items: 1, transcripts: 1, claims: 1 });
  });

  it("a DIFFERENT transcript for the same URL is a second item under the SAME source", async () => {
    const { db, scope, a } = await fixture();
    const first = await intakePastedReference(db, scope, a.id, { sourceUrl: PASTED_URL, transcript: TRANSCRIPT });
    const second = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: `${TRANSCRIPT}\nA corrected last line.` });
    expect(second.itemId).not.toBe(first.itemId);
    expect(second.referenceInputId).not.toBe(first.referenceInputId);
    expect(second.claimId).not.toBe(first.claimId);
    expect(await counts(db)).toEqual({ inputs: 2, sources: 1, items: 2, transcripts: 2, claims: 2 });
    const items = await db.select().from(trendItems);
    expect(new Set(items.map((row) => row.sourceId)).size).toBe(1);
  });

  it("title: optional, trimmed, at most PASTED_REFERENCE_TITLE_MAX code points — refused above it with no row written", async () => {
    const { db, scope, a } = await fixture();
    await expect(intakePastedReference(db, scope, a.id, {
      sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT, title: "a".repeat(PASTED_REFERENCE_TITLE_MAX + 1),
    })).rejects.toThrow(new RegExp(`at most ${PASTED_REFERENCE_TITLE_MAX} characters`));
    expect(await counts(db)).toEqual(NOTHING);
    // Code points, not UTF-16 units: 120 emoji are 240 units and still fit.
    const emoji = "😀".repeat(PASTED_REFERENCE_TITLE_MAX);
    const result = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT, title: `  ${emoji}  ` });
    const [item] = await db.select().from(trendItems).where(eq(trendItems.id, result.itemId));
    expect(item.title).toBe(emoji);
    const [row] = await pastedReferencesForProfile(db, scope, a.id);
    expect(row.title).toBe(emoji);
  });

  it("niche: optional, must be one of the profile's TRACKED niches — refused BY NAME otherwise, canonicalised when accepted", async () => {
    const { db, scope, a } = await fixture();
    await expect(intakePastedReference(db, scope, a.id, {
      sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT, niche: "  Home   Cooking ",
    })).rejects.toThrow(/niche "home cooking" is not one of this profile's tracked niches/);
    expect(await counts(db)).toEqual(NOTHING);
    await trackNicheForProfile(db, scope, a.id, "home cooking", { maxTrackedNiches: 3 });
    const result = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT, niche: "  Home   Cooking " });
    const [item] = await db.select().from(trendItems).where(eq(trendItems.id, result.itemId));
    expect(item.niche).toBe("home cooking");
    const [row] = await pastedReferencesForProfile(db, scope, a.id);
    expect(row.niche).toBe("home cooking");
  });

  it("refuses a viewer, an open pause, a blank transcript and a bad URL BEFORE any row is written", async () => {
    const { db, workspace, scope, a } = await fixture();
    const viewer = await seatScope(db, workspace.id, "viewer");
    await expect(intakePastedReference(db, viewer, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT }))
      .rejects.toBeInstanceOf(ProfileRoleError);
    await expect(intakePastedReference(db, viewer, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT }))
      .rejects.toMatchObject({ act: expect.stringMatching(/paste a reference/i) });
    expect(await counts(db)).toEqual(NOTHING);

    await expect(intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "  \n " }))
      .rejects.toBeInstanceOf(PostContentError);
    await expect(intakePastedReference(db, scope, a.id, { sourceUrl: "ftp://example.test/x", transcript: TRANSCRIPT }))
      .rejects.toThrow(/http\(s\) URL/);
    expect(await counts(db)).toEqual(NOTHING);

    const startedAt = new Date(Date.now() - 60_000);
    await db.insert(pausePeriods).values({ workspaceId: workspace.id, startedAt, startedKnownAt: startedAt });
    await expect(intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT }))
      .rejects.toBeInstanceOf(WorkspacePausedError);
    expect(await counts(db)).toEqual(NOTHING);

    // R-118's owner-only half: an OWNER seat pastes.
    await db.update(pausePeriods).set({ endedAt: new Date(), endedKnownAt: new Date() });
    await expect(intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT }))
      .resolves.toMatchObject({ claimStatus: "pending" });
  });

  it("a paste whose transcript row was cascaded away (input deleted) is stored again under a fresh input and the same item", async () => {
    const { db, scope, a } = await fixture();
    const first = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT });
    await db.delete(onboardingInputs).where(eq(onboardingInputs.id, first.referenceInputId));
    expect(await counts(db)).toEqual({ inputs: 0, sources: 1, items: 1, transcripts: 0, claims: 1 });
    const [gone] = await pastedReferencesForProfile(db, scope, a.id);
    expect(gone).toMatchObject({ itemId: first.itemId, transcriptState: "transcript_unavailable" });
    const again = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT });
    expect(again.itemId).toBe(first.itemId);
    expect(again.claimId).toBe(first.claimId);
    expect(again.referenceInputId).not.toBe(first.referenceInputId);
    expect(await counts(db)).toEqual({ inputs: 1, sources: 1, items: 1, transcripts: 1, claims: 1 });
    const [back] = await pastedReferencesForProfile(db, scope, a.id);
    expect(back.transcriptState).toBe("transcript_available");
  });
});

describe("R5: pastedReferencesForProfile — the owner's pastes, newest first, with an honest claim status", () => {
  it("maps claim rows to pending / retrying / completed / parked, names the ceiling from R-93, and never carries the transcript", async () => {
    const { db, scope, a } = await fixture();
    const pending = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "first transcript" });
    const retryingFailed = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "second transcript" });
    const retryingPending = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "third transcript" });
    const parked = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "fourth transcript" });
    const completed = await intakePastedReference(db, scope, a.id, { sourceUrl: "https://example.test/other", transcript: "fifth transcript", title: "The fifth" });
    await db.update(autopsyCacheClaims).set({ status: "failed", attemptCount: 2 }).where(eq(autopsyCacheClaims.id, retryingFailed.claimId));
    await db.update(autopsyCacheClaims).set({ status: "pending", attemptCount: 3 }).where(eq(autopsyCacheClaims.id, retryingPending.claimId));
    await db.update(autopsyCacheClaims).set({ status: "parked", attemptCount: AUTOPSY_ATTEMPT_CODE_CEILING }).where(eq(autopsyCacheClaims.id, parked.claimId));
    const autopsy = await completeClaim(db, completed.claimId);

    const rows = await pastedReferencesForProfile(db, scope, a.id);
    // NEWEST FIRST.
    expect(rows.map((row) => row.itemId)).toEqual([completed.itemId, parked.itemId, retryingPending.itemId, retryingFailed.itemId, pending.itemId]);
    expect(rows[4].claim).toEqual({ status: "pending", attemptCount: 1, attemptCeiling: AUTOPSY_ATTEMPT_CODE_CEILING, claimId: pending.claimId, autopsyId: null });
    expect(rows[3].claim).toMatchObject({ status: "retrying", attemptCount: 2, attemptCeiling: 5 });
    expect(rows[2].claim).toMatchObject({ status: "retrying", attemptCount: 3 });
    expect(rows[1].claim).toMatchObject({ status: "parked", attemptCount: AUTOPSY_ATTEMPT_CODE_CEILING });
    expect(rows[0]).toMatchObject({
      title: "The fifth", sourceUrl: "https://example.test/other", niche: null, transcriptState: "transcript_available",
      claim: { status: "completed", claimId: completed.claimId, autopsyId: autopsy.id },
      autopsy: { ...CANONICAL_ANALYSIS, autopsyId: autopsy.id, analysisVersion: AUTOPSY_ANALYSIS_VERSION },
    });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    for (const row of rows.slice(1)) expect(row).not.toHaveProperty("autopsy");
    // NO transcript body, NO provenance, on any row.
    const serialised = JSON.stringify(rows);
    for (const text of ["first transcript", "fifth transcript", "creator_paste", "provenance", "content"]) {
      expect(serialised, text).not.toContain(text);
    }
    // The pasted projection is the SAME shape the feed builds for a measured
    // item's autopsy — same keys, no more.
    expect(Object.keys(rows[0].autopsy!).sort()).toEqual([...Object.keys(CANONICAL_ANALYSIS), "autopsyId", "analysisVersion"].sort());
  });

  it("a completed claim whose stored analysis does not parse is reported completed WITHOUT an autopsy, never with an unbounded one", async () => {
    const { db, scope, a } = await fixture();
    const paste = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT });
    await completeClaim(db, paste.claimId, { hookMechanic: "only one field" });
    const [row] = await pastedReferencesForProfile(db, scope, a.id);
    expect(row.claim?.status).toBe("completed");
    expect(row).not.toHaveProperty("autopsy");
  });

  it("CROSS-PROFILE (M8): a sibling's pastes are invisible, and a sibling's claim id is refused by the per-claim read", async () => {
    const { db, scope, a, b } = await fixture();
    const A = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "A's transcript" });
    const B = await intakePastedReference(db, scope, b.id, { sourceUrl: CANONICAL_URL, transcript: "B's transcript" });
    expect((await pastedReferencesForProfile(db, scope, a.id)).map((row) => row.itemId)).toEqual([A.itemId]);
    expect((await pastedReferencesForProfile(db, scope, b.id)).map((row) => row.itemId)).toEqual([B.itemId]);
    await expect(pastedReferenceForProfile(db, scope, a.id, B.claimId)).rejects.toThrow(/not accessible to this profile/);
    await expect(pastedReferenceForProfile(db, scope, b.id, A.claimId)).rejects.toThrow(/not accessible to this profile/);
    await expect(pastedReferenceForProfile(db, scope, a.id, A.claimId)).resolves.toMatchObject({ itemId: A.itemId, claim: { claimId: A.claimId } });
    // ...and the same URL pasted by two profiles is two SOURCES, one each.
    expect((await db.select().from(trendSources)).map((row) => row.profileId).sort()).toEqual([a.id, b.id].sort());
  });

  it("M7: a pasted item NEVER enters the ranked feed, even tracked, transcript-ready and autopsied — it is in its own reader", async () => {
    const { db, scope, workspace, a } = await fixture();
    await trackNicheForProfile(db, scope, a.id, "home cooking", { maxTrackedNiches: 3 });
    const paste = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT, niche: "home cooking" });
    await completeClaim(db, paste.claimId);
    // NON-VACUITY: a MEASURED private item in the same niche with a completed
    // autopsy is what the feed is for, and it is there.
    const source = await createPrivateSubmittedTrendSource(db, scope, a.id, { externalId: "measured-source", sourceUrl: "https://example.test/measured" });
    const measured = await recordPrivateTrendItem(db, scope, a.id, {
      ...MEASURED, sourceId: source.id, externalVideoId: "measured-video", niche: "home cooking", title: "Measured", channelId: "channel",
    });
    const reference = await appendReferencePost(db, scope, a.id, "Measured transcript.", "https://example.test/measured");
    const transcript = await recordPrivateTrendTranscript(db, scope, a.id, {
      trendItemId: measured.id, content: reference.content, referenceInputId: reference.id, sourceUrl: "https://example.test/measured",
    });
    await db.insert(autopsies).values({
      trendItemId: measured.id, contentDigest: transcript.contentDigest, analysisVersion: "v1", rightsScope: "profile_private",
      rightsBasis: "profile_private",
      profileId: a.id, workspaceId: workspace.id, status: "completed", analysis: CANONICAL_ANALYSIS,
    });
    const feed = (await feedItemsForProfile(db, scope, a.id)).map((row) => row.id);
    expect(feed).toEqual([measured.id]);
    expect(feed).not.toContain(paste.itemId);
    expect((await trendFeedProjection(db, scope, a.id)).map((row) => row.id)).toEqual([measured.id]);
    const pasted = await pastedReferencesForProfile(db, scope, a.id);
    // toEqual, NOT toContain (learning gate CHANGE 2, fix round 1): `toContain`
    // is why this witness could not see the extra row. The two readers
    // PARTITION the profile's private items — the measured one is in the feed
    // and NOT here, the pasted one is here and not in the feed — and only an
    // exact-set assertion says the second half.
    expect(pasted.map((row) => row.itemId)).toEqual([paste.itemId]);
    expect(pasted.map((row) => row.baselineState)).toEqual(["unavailable"]);
  });
});

describe("R-98 fix round 1: parkedAutopsyClaimsForProfile — EVERY parked claim, not the newest per item", () => {
  /** Park a claim the way five failed attempts do, without driving the worker. */
  const park = (db: TestDb, claimId: string) =>
    db.update(autopsyCacheClaims)
      .set({ status: "parked", attemptCount: AUTOPSY_ATTEMPT_CODE_CEILING })
      .where(eq(autopsyCacheClaims.id, claimId));

  it("returns BOTH claims on one item — the exact case the display projection loses", async () => {
    const { db, scope, a } = await fixture();
    const paste = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT });
    // The second claim is what an AUTOPSY_ANALYSIS_VERSION bump mints: same
    // item, same digest, a new analysis contract. `trends-storage.ts` plans for
    // it in two docblocks, and the claim identity index includes the version.
    const second = await claimPrivateAutopsyForSystem(db, scope, a.id, {
      trendItemId: paste.itemId,
      contentDigest: digestTranscriptContent(normaliseContent(TRANSCRIPT)),
      analysisVersion: "v2",
    });
    expect(second.cacheClaimId).not.toBe(paste.claimId);
    await park(db, paste.claimId);
    await park(db, second.cacheClaimId);

    // THE DISPLAY PROJECTION SEES ONE — this is not a hypothetical narrowing.
    const displayed = await pastedReferencesForProfile(db, scope, a.id);
    expect(displayed.map((row) => row.claim?.claimId)).toEqual([second.cacheClaimId]);
    // THE MONEY'S READER SEES BOTH, oldest first.
    await expect(parkedAutopsyClaimsForProfile(db, scope, a.id)).resolves.toEqual([
      { claimId: paste.claimId },
      { claimId: second.cacheClaimId },
    ]);
  });

  it("selects PARKED only, and orders by (created_at, id) rather than by whatever the planner returns", async () => {
    const { db, scope, a } = await fixture();
    const first = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "first transcript" });
    const second = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "second transcript" });
    const pending = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "third transcript" });
    const completed = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "fourth transcript" });
    const failed = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "fifth transcript" });
    await park(db, first.claimId);
    await park(db, second.claimId);
    await completeClaim(db, completed.claimId);
    await db.update(autopsyCacheClaims).set({ status: "failed", attemptCount: 2 }).where(eq(autopsyCacheClaims.id, failed.claimId));

    const rows = await parkedAutopsyClaimsForProfile(db, scope, a.id);
    // Oldest first: the paste order, not the display's newest-first order.
    expect(rows.map((row) => row.claimId)).toEqual([first.claimId, second.claimId]);
    expect(rows.map((row) => row.claimId)).not.toContain(pending.claimId);
    expect(rows.map((row) => row.claimId)).not.toContain(completed.claimId);
    expect(rows.map((row) => row.claimId)).not.toContain(failed.claimId);
  });

  it("CROSS-PROFILE and CROSS-WORKSPACE: the scoping property is identical to the display reader's", async () => {
    const { db, scope, a, b } = await fixture();
    const mine = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "A's transcript" });
    const sibling = await intakePastedReference(db, scope, b.id, { sourceUrl: CANONICAL_URL, transcript: "B's transcript" });
    await park(db, mine.claimId);
    await park(db, sibling.claimId);
    // A sibling profile in the SAME workspace: parked, and invisible.
    await expect(parkedAutopsyClaimsForProfile(db, scope, a.id))
      .resolves.toEqual([{ claimId: mine.claimId }]);
    await expect(parkedAutopsyClaimsForProfile(db, scope, b.id))
      .resolves.toEqual([{ claimId: sibling.claimId }]);

    // ANOTHER WORKSPACE'S PROFILE: refused at the mint, before any predicate.
    await seedAuthUser(db, "paste_other_ws");
    const { workspace: other } = await ensureUserWorkspace(db, { authUserId: "paste_other_ws", name: "Other" });
    const otherScope = await withWorkspace(db, { authUserId: "paste_other_ws" });
    const [otherProfile] = await db.insert(creatorProfiles).values({ workspaceId: other.id, displayName: "Profile C" }).returning();
    const theirs = await intakePastedReference(db, otherScope, otherProfile.id, { sourceUrl: CANONICAL_URL, transcript: "C's transcript" });
    await park(db, theirs.claimId);
    await expect(parkedAutopsyClaimsForProfile(db, scope, otherProfile.id)).rejects.toBeInstanceOf(ProfileAccessError);
    await expect(parkedAutopsyClaimsForProfile(db, otherScope, a.id)).rejects.toBeInstanceOf(ProfileAccessError);
    // ...and each workspace still reads its own, so the refusal above is the
    // scope and not an empty database.
    await expect(parkedAutopsyClaimsForProfile(db, otherScope, otherProfile.id))
      .resolves.toEqual([{ claimId: theirs.claimId }]);
  });

  it("CHANGE A: the money's population is deliberately NOT item-scoped — and the mis-parented claim it once had to tolerate is now REFUSED by the schema", async () => {
    const { db, scope, a, b } = await fixture();
    const mine = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: "A's transcript" });
    const sibling = await intakePastedReference(db, scope, b.id, { sourceUrl: CANONICAL_URL, transcript: "B's transcript" });
    // THE SHAPE THE SCHEMA USED TO ACCEPT AND NO WRITER BUILT (tenancy round 2,
    // CHANGE A — the reviewer forged this on real Postgres): a claim carrying
    // A's `(profile_id, workspace_id)` pair and B's `trend_item_id`. Since
    // migration 0057 (Phase 10b-1 fix round 2) the composite
    // `(trend_item_id, profile_id)` key refuses it outright, so the money
    // population's item-independence is no longer what keeps a mis-parented,
    // debited claim refundable — the row cannot exist. The refusal is pinned
    // by constraint name so the guard cannot quietly lapse.
    let refusal: { code?: string; constraint?: string } | null = null;
    try {
      await db.update(autopsyCacheClaims).set({ trendItemId: sibling.itemId }).where(eq(autopsyCacheClaims.id, mine.claimId));
    } catch (error) {
      const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? (error as { code?: string; constraint?: string });
      refusal = { code: cause.code, constraint: cause.constraint };
    }
    expect(refusal).toEqual({ code: "23503", constraint: "autopsy_cache_claims_trend_item_profile_fk" });
    await park(db, mine.claimId);

    // THE CLAIM IS SETTLED under its own pair, and the read returns the claim
    // id ALONE: the refund follows the CLAIM's pair, which is the pair the
    // debit was taken under, and re-selecting the `trend_item_id` out stays
    // red here rather than merely unreviewed.
    const rows = await parkedAutopsyClaimsForProfile(db, scope, a.id);
    expect(rows).toEqual([{ claimId: mine.claimId }]);
    // ...and the row carries the claim id ALONE, so re-selecting the unscoped
    // `trend_item_id` out is red here too, not merely unreviewed.
    expect(rows.map((row) => Object.keys(row))).toEqual([["claimId"]]);
    // NON-VACUITY: B's own claim is untouched and invisible from A's read
    // (B's claim is not parked, so B sees nothing either).
    await expect(parkedAutopsyClaimsForProfile(db, scope, b.id)).resolves.toEqual([]);
  });
});

describe("R6: spinReferenceForProfile carries the mechanism projection beside the unchanged gate fields", () => {
  it("returns { hookMechanic, beats, ending, followTrigger } from the canonical analysis; hook/subjectTerms/structure as before", async () => {
    const { db, scope, a } = await fixture();
    const paste = await intakePastedReference(db, scope, a.id, { sourceUrl: CANONICAL_URL, transcript: TRANSCRIPT });
    const autopsy = await completeClaim(db, paste.claimId);
    const minted = await ProfileScope.mint(db, scope, a.id);
    await expect(spinReferenceForProfile(db, minted, autopsy.id)).resolves.toEqual({
      autopsyId: autopsy.id, analysisVersion: AUTOPSY_ANALYSIS_VERSION,
      subjectTerms: [...CANONICAL_ANALYSIS.subjectTerms], hook: CANONICAL_ANALYSIS.hook, structure: { ...CANONICAL_ANALYSIS.structure },
      mechanism: {
        hookMechanic: CANONICAL_ANALYSIS.hookMechanic, beats: [...CANONICAL_ANALYSIS.beats],
        ending: CANONICAL_ANALYSIS.ending, followTrigger: CANONICAL_ANALYSIS.followTrigger,
      },
    });
  });
});

describe("R1/R3: the unavailable baseline is private-only — at the writer AND at the CHECK (M3)", () => {
  it("recordSharedTrendItem refuses an unavailable baseline cast past its type", async () => {
    const { db } = await fixture();
    const source = await createTrendSource(db, { kind: "youtube", externalId: "yt", sourceUrl: "https://www.youtube.com/watch?v=yt" });
    await expect(recordSharedTrendItem(db, {
      sourceId: source.id, externalVideoId: "yt", niche: "n", title: "t", baseline: { state: "unavailable" },
      sourcePublishedAt: new Date(), transcriptState: "transcript_required",
    } as never)).rejects.toThrow(/measured channel baseline/);
    expect(await db.select().from(trendItems)).toEqual([]);
  });

  it("the CHECK refuses a shared row with an unavailable baseline, an unavailable row with any of the eight filled, and a measured row with any of the eight NULL", async () => {
    const { db, scope, workspace, a } = await fixture();
    const shared = await createTrendSource(db, { kind: "youtube", externalId: "yt", sourceUrl: "https://www.youtube.com/watch?v=yt" });
    const own = await createPrivateSubmittedTrendSource(db, scope, a.id, { externalId: "own", sourceUrl: "https://example.test/own" });
    const nulls = {
      channelId: null, videoViews: null, channelMedianRecentViews: null, baselineSampleSize: null,
      baselineObservationIds: null, baselineWindowStartsAt: null, baselineWindowEndsAt: null, outlierRatio: null,
    };
    const base = {
      niche: "n", title: "t", sourcePublishedAt: new Date(), transcriptState: "transcript_required" as const,
      saturation: "unmeasured" as const, saturationUnmeasuredReason: "incomplete_provenance",
    };
    // C11 (0028): the unmeasured REASON is tied to the baseline state, so an
    // `unavailable` row carries `no_population` here. Splitting the two bases
    // keeps each refusal below violating exactly ONE constraint, which is what
    // lets these assertions name it — a row failing two CHECKs reports
    // whichever Postgres evaluates first.
    const unavailableBase = { ...base, saturationUnmeasuredReason: "no_population" };
    // Shared + unavailable: refused (M3's CHECK half).
    await expect(refusedBy(db.insert(trendItems).values({
      ...unavailableBase, ...nulls, sourceId: shared.id, externalVideoId: "shared-unavailable", rightsScope: "shared_analysis", baselineState: "unavailable",
    }))).resolves.toContain("trend_items_baseline_state_shape");
    // Private + unavailable + ONE of the eight filled: refused, once per column.
    const filled: Record<string, unknown> = {
      channelId: "c", videoViews: 1n, channelMedianRecentViews: "1", baselineSampleSize: 1, baselineObservationIds: ["x"],
      baselineWindowStartsAt: new Date("2026-08-01"), baselineWindowEndsAt: new Date("2026-09-01"), outlierRatio: "1",
    };
    for (const [column, value] of Object.entries(filled)) {
      await expect(refusedBy(db.insert(trendItems).values({
        ...unavailableBase, ...nulls, [column]: value, sourceId: own.id, externalVideoId: `unavailable-${column}`, rightsScope: "profile_private",
        profileId: a.id, workspaceId: workspace.id, baselineState: "unavailable",
      } as never)), column).resolves.toContain("trend_items_baseline_state_shape");
    }
    // Measured + ONE of the eight NULL: refused, once per column (the NOT NULL
    // that moved from the column into the CHECK).
    const measuredRow = {
      ...base, sourceId: own.id, rightsScope: "profile_private" as const, profileId: a.id, workspaceId: workspace.id,
      baselineState: "measured" as const, channelId: "c", videoViews: 200n, channelMedianRecentViews: "100.00000000", baselineSampleSize: 1,
      baselineObservationIds: ["x"], baselineWindowStartsAt: new Date("2026-08-01"), baselineWindowEndsAt: new Date("2026-09-01"),
      sourcePublishedAt: new Date("2026-08-15"), outlierRatio: "2.00000000",
    };
    for (const column of Object.keys(nulls)) {
      await expect(refusedBy(db.insert(trendItems).values({ ...measuredRow, [column]: null, externalVideoId: `measured-${column}` } as never)), column)
        .resolves.toContain("trend_items_baseline_state_shape");
    }
    // NON-VACUITY: the two honest shapes land, and the measured one is still
    // held to the arithmetic (a wrong ratio is refused exactly as before).
    await expect(db.insert(trendItems).values({ ...measuredRow, externalVideoId: "measured-ok" })).resolves.toBeDefined();
    await expect(refusedBy(db.insert(trendItems).values({ ...measuredRow, externalVideoId: "measured-wrong-ratio", outlierRatio: "3.00000000" })))
      .resolves.toContain("trend_items_outlier_ratio_matches_inputs");
    await expect(db.insert(trendItems).values({
      ...unavailableBase, ...nulls, sourceId: own.id, externalVideoId: "unavailable-ok", rightsScope: "profile_private",
      profileId: a.id, workspaceId: workspace.id, baselineState: "unavailable",
    })).resolves.toBeDefined();
  });

  it("C11 (0028): the unmeasured REASON is tied to its cause in BOTH directions — no_population iff the baseline is unavailable", async () => {
    const { db, scope, workspace, a } = await fixture();
    const own = await createPrivateSubmittedTrendSource(db, scope, a.id, { externalId: "own", sourceUrl: "https://example.test/own" });
    const nulls = {
      channelId: null, videoViews: null, channelMedianRecentViews: null, baselineSampleSize: null,
      baselineObservationIds: null, baselineWindowStartsAt: null, baselineWindowEndsAt: null, outlierRatio: null,
    };
    const owned = { sourceId: own.id, rightsScope: "profile_private" as const, profileId: a.id, workspaceId: workspace.id };
    const shape = { niche: "n", title: "t", transcriptState: "transcript_required" as const, saturation: "unmeasured" as const };
    const measured = {
      ...owned, ...shape, baselineState: "measured" as const, channelId: "c", videoViews: 200n,
      channelMedianRecentViews: "100.00000000", baselineSampleSize: 1, baselineObservationIds: ["x"],
      baselineWindowStartsAt: new Date("2026-08-01"), baselineWindowEndsAt: new Date("2026-09-01"),
      sourcePublishedAt: new Date("2026-08-15"), outlierRatio: "2.00000000",
    };
    // AN UNAVAILABLE ROW CANNOT SAY `incomplete_provenance`. This is the wrong
    // reason that shipped in a creator's export before 0028 — its provenance is
    // complete; it has no population — and the database now refuses it.
    await expect(refusedBy(db.insert(trendItems).values({
      ...owned, ...shape, ...nulls, externalVideoId: "unavailable-wrong-reason", baselineState: "unavailable",
      sourcePublishedAt: new Date("2026-08-15"), saturationUnmeasuredReason: "incomplete_provenance",
    } as never))).resolves.toContain("trend_items_saturation_measurement_nonempty");
    // ...AND A MEASURED ROW CANNOT SAY `no_population`: the new word is not a
    // second general-purpose reason, it is this one state's reason.
    await expect(refusedBy(db.insert(trendItems).values({
      ...measured, externalVideoId: "measured-wrong-reason", saturationUnmeasuredReason: "no_population",
    } as never))).resolves.toContain("trend_items_saturation_measurement_nonempty");
    // ...and an unlisted word is refused on either state (the vocabulary did
    // not become open when it gained a second member).
    await expect(refusedBy(db.insert(trendItems).values({
      ...owned, ...shape, ...nulls, externalVideoId: "unavailable-invented-reason", baselineState: "unavailable",
      sourcePublishedAt: new Date("2026-08-15"), saturationUnmeasuredReason: "no_channel",
    } as never))).resolves.toContain("trend_items_saturation_measurement_nonempty");
    // NON-VACUITY: each state's own reason lands.
    await expect(db.insert(trendItems).values({
      ...owned, ...shape, ...nulls, externalVideoId: "unavailable-right-reason", baselineState: "unavailable",
      sourcePublishedAt: new Date("2026-08-15"), saturationUnmeasuredReason: "no_population",
    })).resolves.toBeDefined();
    await expect(db.insert(trendItems).values({
      ...measured, externalVideoId: "measured-right-reason", saturationUnmeasuredReason: "incomplete_provenance",
    })).resolves.toBeDefined();
  });

  it("recordPrivateTrendItem refuses a measured field smuggled beside an unavailable baseline, and refuses erasing a measured baseline", async () => {
    const { db, scope, a } = await fixture();
    const source = await createPrivateSubmittedTrendSource(db, scope, a.id, { externalId: "own", sourceUrl: "https://example.test/own" });
    await expect(recordPrivateTrendItem(db, scope, a.id, {
      sourceId: source.id, externalVideoId: "v", niche: "n", title: "t", baseline: { state: "unavailable" },
      sourcePublishedAt: new Date(), transcriptState: "transcript_required", videoViews: 5n,
    } as never)).rejects.toThrow(/cannot carry videoViews/);
    await expect(recordPrivateTrendItem(db, scope, a.id, {
      sourceId: source.id, externalVideoId: "v", niche: "n", title: "t", baseline: { state: "unavailable" },
      sourcePublishedAt: new Date(), transcriptState: "transcript_available",
    } as never)).rejects.toThrow(/cannot assert transcript availability/);
    expect(await db.select().from(trendItems)).toEqual([]);
    const measured = await recordPrivateTrendItem(db, scope, a.id, {
      ...MEASURED, sourceId: source.id, externalVideoId: "v", niche: "n", title: "t", channelId: "c",
    });
    expect(measured.baselineState).toBe("measured");
    await expect(recordPrivateTrendItem(db, scope, a.id, {
      sourceId: source.id, externalVideoId: "v", niche: "n", title: "t", baseline: { state: "unavailable" },
      sourcePublishedAt: new Date(), transcriptState: "transcript_required",
    })).rejects.toThrow(/cannot erase a measured channel baseline/);
    // The other direction — metadata arriving for a pasted item — is allowed.
    const unavailable = await recordPrivateTrendItem(db, scope, a.id, {
      sourceId: source.id, externalVideoId: "w", niche: "n", title: "t", baseline: { state: "unavailable" },
      sourcePublishedAt: new Date(), transcriptState: "transcript_required",
    });
    expect(unavailable.baselineState).toBe("unavailable");
    const lifted = await recordPrivateTrendItem(db, scope, a.id, {
      ...MEASURED, sourceId: source.id, externalVideoId: "w", niche: "n", title: "t", channelId: "c",
    });
    expect(lifted).toMatchObject({ id: unavailable.id, baselineState: "measured", outlierRatio: "2.00000000" });
  });
});

describe("R2/R3: a private transcript IS its reference input — the FK, the CHECK, the unique index and both writers", () => {
  it("the CHECK ties provenance.kind = creator_paste to reference_input_id in BOTH directions, including a provenance with no kind at all", async () => {
    const { db, scope, workspace, a } = await fixture();
    const reference = await appendReferencePost(db, scope, a.id, "Somebody else's post.", "https://example.test/x");
    const source = await createPrivateSubmittedTrendSource(db, scope, a.id, { externalId: "own", sourceUrl: "https://example.test/own" });
    const item = await recordPrivateTrendItem(db, scope, a.id, {
      sourceId: source.id, externalVideoId: "v", niche: "n", title: "t", baseline: { state: "unavailable" },
      sourcePublishedAt: new Date(), transcriptState: "transcript_required",
    });
    const row = {
      trendItemId: item.id, rightsScope: "profile_private" as const, profileId: a.id, workspaceId: workspace.id,
      rightsBasis: "profile_private" as const,
      content: "text", contentDigest: "d1",
    };
    // `{}` beside a reference id: the NULL-under-`=` hole, closed.
    await expect(refusedBy(db.insert(trendTranscripts).values({ ...row, provenance: {}, referenceInputId: reference.id })))
      .resolves.toContain("trend_transcripts_creator_paste_has_reference");
    // kind without the id.
    await expect(refusedBy(db.insert(trendTranscripts).values({ ...row, provenance: { kind: "creator_paste" }, referenceInputId: null })))
      .resolves.toContain("trend_transcripts_creator_paste_has_reference");
    // A SHARED transcript can never carry a reference id (no kind → id must be NULL).
    const shared = await createTrendSource(db, { kind: "youtube", externalId: "yt", sourceUrl: "https://www.youtube.com/watch?v=yt" });
    const sharedItem = await recordSharedTrendItem(db, { ...MEASURED, sourceId: shared.id, externalVideoId: "yt", niche: "n", title: "t", channelId: "c" });
    await expect(refusedBy(db.insert(trendTranscripts).values({
      trendItemId: sharedItem.id, rightsScope: "shared_analysis", content: "text", contentDigest: "d2",
      rightsBasis: "independently_licensed", rightsEvidenceId: "test-license:pasted-reference",
      provenance: { provider: "youtube_creator_owned_oauth" }, referenceInputId: reference.id,
    }))).resolves.toContain("trend_transcripts_creator_paste_has_reference");
    // NON-VACUITY: the honest row lands, and a SECOND transcript on the same input is refused by the unique index.
    await expect(db.insert(trendTranscripts).values({
      ...row, provenance: { kind: "creator_paste", sourceUrl: "https://example.test/x", referenceInputId: reference.id }, referenceInputId: reference.id,
    })).resolves.toBeDefined();
    await expect(refusedBy(db.insert(trendTranscripts).values({
      ...row, contentDigest: "d3", provenance: { kind: "creator_paste", sourceUrl: "https://example.test/x", referenceInputId: reference.id }, referenceInputId: reference.id,
    }))).resolves.toContain("trend_transcripts_reference_input_uq");
  });

  it("recordPrivateTrendTranscript refuses a sibling's, a nonexistent and an own_post input with ONE message, and stamps provenance itself", async () => {
    const { db, scope, a, b } = await fixture();
    const source = await createPrivateSubmittedTrendSource(db, scope, a.id, { externalId: "own", sourceUrl: "https://example.test/own" });
    const item = await recordPrivateTrendItem(db, scope, a.id, {
      sourceId: source.id, externalVideoId: "v", niche: "n", title: "t", baseline: { state: "unavailable" },
      sourcePublishedAt: new Date(), transcriptState: "transcript_required",
    });
    const siblings = await appendReferencePost(db, scope, b.id, "B's reference.", "https://example.test/b");
    const ownPost = await appendOwnPost(db, scope, a.id, "A's own post.", true);
    const attempt = (referenceInputId: string) => recordPrivateTrendTranscript(db, scope, a.id, {
      trendItemId: item.id, content: "text", referenceInputId, sourceUrl: "https://example.test/own",
    });
    await expect(attempt(siblings.id)).rejects.toThrow(/reference input is not accessible to this profile/);
    await expect(attempt(ownPost.id)).rejects.toThrow(/reference input is not accessible to this profile/);
    await expect(attempt("00000000-0000-0000-0000-000000000001")).rejects.toThrow(/reference input is not accessible to this profile/);
    expect(await db.select().from(trendTranscripts)).toEqual([]);
    const [before] = await db.select().from(trendItems).where(eq(trendItems.id, item.id));
    expect(before.transcriptState).toBe("transcript_required");
    const mine = await appendReferencePost(db, scope, a.id, "A's reference.", "https://example.test/own");
    const stored = await attempt(mine.id);
    expect(stored).toMatchObject({
      referenceInputId: mine.id, provenance: { kind: "creator_paste", sourceUrl: "https://example.test/own", referenceInputId: mine.id },
    });
    const [after] = await db.select().from(trendItems).where(eq(trendItems.id, item.id));
    expect(after.transcriptState).toBe("transcript_available");
    // The same text under a DIFFERENT input is refused rather than silently rebound.
    const another = await appendReferencePost(db, scope, a.id, "A's second reference.", "https://example.test/own");
    await expect(attempt(another.id)).rejects.toThrow(/already stored under another reference input/);
  });

  it("recordSharedTrendTranscript refuses a creator paste by name, before the key-shape check", async () => {
    const { db } = await fixture();
    const shared = await createTrendSource(db, { kind: "youtube", externalId: "yt", sourceUrl: "https://www.youtube.com/watch?v=yt" });
    const item = await recordSharedTrendItem(db, { ...MEASURED, sourceId: shared.id, externalVideoId: "yt", niche: "n", title: "t", channelId: "c" });
    for (const provenance of [
      { kind: "creator_paste", sourceUrl: "https://www.youtube.com/watch?v=yt", referenceInputId: "x" },
      { provider: "creator_paste", sourceReference: "https://www.youtube.com/watch?v=yt" },
      { provider: "youtube_creator_owned_oauth", sourceReference: "https://www.youtube.com/watch?v=yt", sharedAnalysisRightsBasis: "creator_owned_caption_consent", consentEvidenceId: "c", referenceInputId: "x" },
    ]) {
      await expect(recordSharedTrendTranscript(db, {
        trendItemId: item.id,
        content: "text",
        rightsSubjectUserId: "00000000-0000-0000-0000-000000000001",
        provenance,
      } as never))
        .rejects.toThrow(/cannot be stored as shared analysis/);
    }
    expect(await db.select().from(trendTranscripts)).toEqual([]);
  });
});
