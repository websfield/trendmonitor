// Slice 7 stage A — THE SHARED FRAMEWORK LIBRARY AND PRIVATE FRAMEWORKS
// (R5a, R5b, R5c; PRD §4D REQ-D01/D02/D04/D05).
//
// Run against the committed migrations in PGlite, so every constraint claim
// here is a statement about SQL rather than about a comment: the confidence
// ladder, the retirement equality, the four partial uniques and the two
// visibility CHECKs are all attempted, not read.
//
// WHAT THE MUTATION MATRIX REACHES AND WHAT IT DOES NOT, stated up front
// because the card's population note asks for exactly this. M8 ("a reader that
// returns proposed or retired frameworks") is a REAL check here — the reader
// is driven against a table holding one row of every status. The content scan
// (R5a) has a real check for the four STRUCTURALLY DETECTABLE classes and NO
// check at all for an arbitrary personal name in ordinary prose; that limit is
// stated in `FrameworkContentError`'s docblock and is repeated in the case
// below rather than papered over, because a scan reported as covering "personal
// names" would be a proxy sold as coverage.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { creatorProfiles, frameworks } from "../src/brain-schema";
import { autopsies, trendItems, trendSources } from "../src/trends-schema";
import { onboardingInputs } from "../src/onboarding-schema";
import { pausePeriods } from "../src/billing-schema";
import {
  FrameworkAccessError,
  FrameworkContentError,
  FrameworkLimitError,
  FrameworkStaleError,
  PrivateFrameworkTierError,
  ProfileRoleError,
  WorkspacePausedError,
} from "../src/errors";
import {
  approvePrivateFramework,
  assertAutopsyFrameworkCandidate,
  assertAutopsyMechanismContent,
  assertMechanismLevel,
  createPrivateFramework,
  deriveFrameworkConfidence,
  editPrivateFramework,
  eligibleFrameworks,
  frameworkSlug,
  listPrivateFrameworks,
  proposeSharedFramework,
  resolveAutopsyFramework,
  retirePrivateFramework,
  seedSharedFrameworks,
  sharedFrameworkLibrary,
  MECHANISM_CONTENT_RULES,
  METRIC_NOUNS,
  SATURATION_NOTICE,
  SHARED_FRAMEWORK_SEED,
  type FrameworkContent,
} from "../src/frameworks";
import { FRAMEWORK_LIST_MAX, FRAMEWORK_NAME_MAX, FRAMEWORK_TEXT_MAX, PRIVATE_FRAMEWORK_COUNT_MAX } from "../src/storage-limits";
import { ProfileScope, withWorkspace, WRITE_PAUSE_POLICY } from "../src/with-workspace";
import { schema } from "../src/index";
import { users } from "../src/schema";

/** A clean, mechanism-level framework: the baseline every plant deviates from. */
const clean = (over: Partial<FrameworkContent> = {}): FrameworkContent => ({
  name: "The Reversal",
  beats: ["Open on the claim.", "Show the receipts.", "Invert the claim."],
  whyItConverts: "The turn arrives after the claim has been proven, so it lands.",
  applicability: [
    { goal: "follows", niche: "any", note: "Needs a claim the creator is inside." },
  ],
  sourceReferences: [{ kind: "internal_autopsy", ref: "corpus-batch-0" }],
  evidenceEntries: [
    {
      kind: "internal_autopsy",
      ref: "corpus-batch-0",
      observation: "One piece built this way held its audience to the turn.",
    },
  ],
  testedCaveats: ["Inverting before the proof reads as a rationalisation."],
  saturation: "observed",
  ...over,
});

const LICENSED_RIGHTS = {
  basis: "independently_licensed",
  evidenceId: "test-license:frameworks",
} as const;

/**
 * The message a rejected drizzle query ACTUALLY carries, causes included.
 *
 * THE SAME HELPER `lineage-feedback.test.ts` carries, and for the same measured
 * reason: drizzle wraps a driver error in its own `Failed query: …` and puts
 * the database's message on `cause`, so `rejects.toThrow(/immutable/i)` matches
 * the WRAPPER and passes on ANY failure — a NOT NULL violation in a broken
 * fixture included. Reproduced here on the first run of the ownership case
 * below: it reported the trigger missing while the trigger had fired.
 *
 * Copied rather than shared because both files are self-contained suites and a
 * `tests/support` helper for six lines would be the only thing either imports
 * from the other's tree; the duplication is named here so the next reader knows
 * there are two.
 */
async function refusalMessage(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    const parts: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    }
    return parts.join(" | ");
  }
  throw new Error("the statement was NOT refused");
}

describe("slice 7 stage A: frameworks", () => {
  let db: TestDb;
  let wsA: string;
  let wsB: string;
  let pA1: string;
  let pA2: string;
  let pB: string;
  let uA: string;
  let uB: string;

  const scopeFor = (authUserId: string) => withWorkspace(db, { authUserId });

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "fw_a");
    await seedAuthUser(db, "fw_b");
    const bootA = await ensureUserWorkspace(db, { authUserId: "fw_a", name: "A" });
    const bootB = await ensureUserWorkspace(db, { authUserId: "fw_b", name: "B" });
    wsA = bootA.workspace.id;
    wsB = bootB.workspace.id;
    uA = bootA.user.id;
    uB = bootB.user.id;
    const profiles = await db
      .insert(creatorProfiles)
      .values([
        { workspaceId: wsA, displayName: "A-one" },
        { workspaceId: wsA, displayName: "A-two" },
        { workspaceId: wsB, displayName: "B-one" },
      ])
      .returning();
    pA1 = profiles[0].id;
    pA2 = profiles[1].id;
    pB = profiles[2].id;
  });

  // ------------------------------------------------------------------ R5a

  it("R5a: the seed lands F1-F9, approved, shared, owned by NOBODY", async () => {
    await seedSharedFrameworks(db);
    const rows = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.visibility, "shared"));
    expect(rows).toHaveLength(9);
    expect(SHARED_FRAMEWORK_SEED).toHaveLength(9);
    for (const row of rows) {
      // R5a's three explicit requirements, per row.
      expect(row.ownerProfileId, row.slug).toBeNull();
      expect(row.workspaceId, row.slug).toBeNull();
      expect(row.curatorStatus, row.slug).toBe("approved");
      // ...and the curator is NAMED (REQ-D02), not merely a status.
      expect(row.curatedBy, row.slug).toBeTruthy();
      expect(row.version, row.slug).toBe(1);
      expect(row.retiredAt, row.slug).toBeNull();
      expect(row.supersededAt, row.slug).toBeNull();
      expect(row.rightsBasis, row.slug).toBe("product_seed");
      expect(row.rightsSubjectUserId, row.slug).toBeNull();
      expect(row.rightsEvidenceId, row.slug).toBeNull();
    }
    // Nine DISTINCT slugs, so a copy-paste in the seed array is a red test
    // rather than eight frameworks and a silent conflict-do-nothing.
    expect(new Set(rows.map((r) => r.slug)).size).toBe(9);
    await db.delete(users).where(eq(users.authUserId, "fw_a"));
    expect(await db.select().from(frameworks)).toHaveLength(9);
  });

  it("R9: a trend proposal is forced shared/proposed and is never readable before curation", async () => {
    const proposed = await proposeSharedFramework(db, clean({ name: "Trend proposal" }), LICENSED_RIGHTS);
    expect(proposed).toMatchObject({ visibility: "shared", curatorStatus: "proposed", ownerProfileId: null, workspaceId: null });
    expect(await sharedFrameworkLibrary(db)).toEqual([]);
    await expect(proposeSharedFramework(db, clean({ name: "Number proposal", whyItConverts: "It reached 40,000 views." }), LICENSED_RIGHTS)).rejects.toBeInstanceOf(FrameworkContentError);
    await expect(proposeSharedFramework(db, clean({ name: "Performance proposal", whyItConverts: "It converts at a higher rate." }), LICENSED_RIGHTS)).rejects.toBeInstanceOf(FrameworkContentError);
  });

  it("R-94: every safe unmatched canonical mechanism creates or reuses one proposed-only row", async () => {
    const analysis = {
      hookMechanic: "Open on a visible tradeoff",
      beats: ["Show the setup", "Turn on the constraint"],
      ending: "Return to the opening tradeoff",
      followTrigger: "Name the next mechanism to test",
    } as const;
    const firstItem = "00000000-0000-7000-8000-000000000001";
    const secondItem = "00000000-0000-7000-8000-000000000002";

    expect(() =>
      assertAutopsyFrameworkCandidate({ trendItemId: firstItem, analysis })
    ).not.toThrow();
    const first = await db.transaction((tx) =>
      resolveAutopsyFramework(tx, { trendItemId: firstItem, analysis, rights: LICENSED_RIGHTS })
    );
    const replay = await db.transaction((tx) =>
      resolveAutopsyFramework(tx, { trendItemId: secondItem, analysis, rights: LICENSED_RIGHTS })
    );

    expect(first).toMatchObject({ kind: "proposed", created: true });
    expect(replay).toMatchObject({
      kind: "proposed",
      created: false,
      framework: { id: first.framework.id },
    });
    const rows = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.slug, first.framework.slug));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      curatorStatus: "proposed",
      visibility: "shared",
      version: 1,
      confidence: "single_case",
    });
    expect(await sharedFrameworkLibrary(db)).toEqual([]);
    const serialized = JSON.stringify(rows[0]);
    expect(serialized).not.toContain(firstItem);
    expect(serialized).not.toContain(secondItem);
    expect(serialized).toContain("trend-item-alpha-");
  });

  it("R-94: approved live identity matches; rejected and retired identities are re-proposed as history-preserving versions", async () => {
    const analysis = {
      hookMechanic: "Delay the label until the turn",
      beats: ["Show the symptom", "Reveal the label"],
      ending: "Return to the symptom with its new label",
      followTrigger: "Invite the next symptom to inspect",
    } as const;
    const item = "00000000-0000-7000-8000-000000000003";
    const first = await db.transaction((tx) =>
      resolveAutopsyFramework(tx, { trendItemId: item, analysis, rights: LICENSED_RIGHTS })
    );
    await db
      .update(frameworks)
      .set({ curatorStatus: "approved", curatedBy: "operator:fixture" })
      .where(eq(frameworks.id, first.framework.id));

    const matched = await db.transaction((tx) =>
      resolveAutopsyFramework(tx, { trendItemId: item, analysis, rights: LICENSED_RIGHTS })
    );
    expect(matched).toMatchObject({
      kind: "matched",
      created: false,
      framework: { id: first.framework.id },
    });

    await db
      .update(frameworks)
      .set({
        saturation: "retired",
        retiredAt: new Date("2026-09-02T00:00:00.000Z"),
      })
      .where(eq(frameworks.id, first.framework.id));
    const afterRetirement = await db.transaction((tx) =>
      resolveAutopsyFramework(tx, { trendItemId: item, analysis, rights: LICENSED_RIGHTS })
    );
    expect(afterRetirement).toMatchObject({
      kind: "proposed",
      created: true,
      framework: { version: 2, curatorStatus: "proposed" },
    });

    await db
      .update(frameworks)
      .set({ curatorStatus: "rejected" })
      .where(eq(frameworks.id, afterRetirement.framework.id));
    const afterRejection = await db.transaction((tx) =>
      resolveAutopsyFramework(tx, { trendItemId: item, analysis, rights: LICENSED_RIGHTS })
    );
    expect(afterRejection).toMatchObject({
      kind: "proposed",
      created: true,
      framework: { version: 3, curatorStatus: "proposed" },
    });

    const history = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.slug, first.framework.slug))
      .orderBy(frameworks.version);
    expect(history.map((row) => [row.version, row.curatorStatus, Boolean(row.supersededAt)])).toEqual([
      [1, "approved", true],
      [2, "rejected", true],
      [3, "proposed", false],
    ]);
    expect(await sharedFrameworkLibrary(db)).toEqual([]);
  });

  it("R-94: identical mechanisms reuse only an exact rights identity", async () => {
    const analysis = {
      hookMechanic: "Open on the boundary before naming the choice",
      beats: ["Show the boundary", "Name the choice"],
      ending: "Return to the boundary with the choice visible",
      followTrigger: "Ask which boundary should be inspected next",
    } as const;
    const rightsA = {
      basis: "creator_consent" as const,
      subjectUserId: uA,
      evidenceId: "consent:framework-a",
    };
    const first = await db.transaction((tx) => resolveAutopsyFramework(tx, {
      trendItemId: "00000000-0000-7000-8000-000000000091",
      analysis,
      rights: rightsA,
    }));
    await db.update(frameworks)
      .set({ curatorStatus: "approved", curatedBy: "operator:rights-test" })
      .where(eq(frameworks.id, first.framework.id));
    const same = await db.transaction((tx) => resolveAutopsyFramework(tx, {
      trendItemId: "00000000-0000-7000-8000-000000000092",
      analysis,
      rights: rightsA,
    }));
    expect(same).toMatchObject({ kind: "matched", framework: { id: first.framework.id } });

    const otherEvidence = await db.transaction((tx) => resolveAutopsyFramework(tx, {
      trendItemId: "00000000-0000-7000-8000-000000000096",
      analysis,
      rights: {
        ...rightsA,
        evidenceId: "consent:framework-a-renewed",
      },
    }));
    expect(otherEvidence).toMatchObject({ kind: "proposed", created: true });
    expect(otherEvidence.framework.id).not.toBe(first.framework.id);

    const otherSubject = await db.transaction((tx) => resolveAutopsyFramework(tx, {
      trendItemId: "00000000-0000-7000-8000-000000000093",
      analysis,
      rights: {
        basis: "creator_consent",
        subjectUserId: uB,
        evidenceId: "consent:framework-b",
      },
    }));
    expect(otherSubject).toMatchObject({ kind: "proposed", created: true });
    expect(otherSubject.framework.id).not.toBe(first.framework.id);

    await db.insert(frameworks).values({
      slug: "seed-same-rights-mechanism",
      name: first.framework.name,
      beats: first.framework.beats,
      whyItConverts: first.framework.whyItConverts,
      applicability: first.framework.applicability,
      sourceReferences: first.framework.sourceReferences,
      evidenceEntries: first.framework.evidenceEntries,
      testedCaveats: first.framework.testedCaveats,
      confidence: first.framework.confidence,
      saturation: first.framework.saturation,
      visibility: "shared",
      rightsBasis: "product_seed",
      curatorStatus: "approved",
      curatedBy: "seed:respin-library-v1",
    });
    const licensed = await db.transaction((tx) => resolveAutopsyFramework(tx, {
      trendItemId: "00000000-0000-7000-8000-000000000094",
      analysis,
      rights: {
        basis: "independently_licensed",
        evidenceId: "licence:framework-c",
      },
    }));
    expect(licensed).toMatchObject({ kind: "proposed", created: true });
    expect(licensed.framework.id).not.toBe(first.framework.id);

    await db.delete(users).where(eq(users.id, uA));
    const survivors = await db.select().from(frameworks);
    expect(survivors.some((row) => row.id === first.framework.id)).toBe(false);
    expect(survivors.some((row) => row.id === otherEvidence.framework.id)).toBe(false);
    expect(survivors.some((row) => row.id === otherSubject.framework.id)).toBe(true);
    expect(survivors.some((row) => row.id === licensed.framework.id)).toBe(true);
    expect(survivors.some((row) => row.rightsBasis === "product_seed")).toBe(true);
  });

  it("a foreign-rights autopsy link cannot block consent-subject deletion", async () => {
    const framework = await db.transaction((tx) => resolveAutopsyFramework(tx, {
      trendItemId: "00000000-0000-7000-8000-000000000095",
      analysis: {
        hookMechanic: "Open on a visible constraint",
        beats: ["Show the constraint", "Resolve the tradeoff"],
        ending: "Return to the constraint",
        followTrigger: "Ask for the next constraint",
      },
      rights: {
        basis: "creator_consent",
        subjectUserId: uA,
        evidenceId: "consent:deletion-link",
      },
    }));
    const [source] = await db.insert(trendSources).values({
      kind: "youtube",
      externalId: "framework-link-source",
      sourceUrl: "https://example.test/framework-link-source",
    }).returning();
    const [item] = await db.insert(trendItems).values({
      sourceId: source.id,
      externalVideoId: "framework-link-video",
      niche: "rights",
      title: "Framework link",
      channelId: "rights-channel",
      videoViews: 200n,
      channelMedianRecentViews: "100",
      baselineSampleSize: 1,
      baselineObservationIds: ["framework-link-baseline"],
      baselineWindowStartsAt: new Date("2026-01-01T00:00:00.000Z"),
      baselineWindowEndsAt: new Date("2026-01-31T00:00:00.000Z"),
      sourcePublishedAt: new Date("2026-01-15T00:00:00.000Z"),
      outlierRatio: "2",
      rightsScope: "shared_analysis",
      transcriptState: "transcript_unavailable",
      saturation: "unmeasured",
      saturationUnmeasuredReason: "incomplete_provenance",
    }).returning();
    const [licensedAutopsy] = await db.insert(autopsies).values({
      trendItemId: item.id,
      contentDigest: "licensed-framework-link",
      analysisVersion: "rights-v1",
      rightsScope: "shared_analysis",
      rightsBasis: "independently_licensed",
      rightsEvidenceId: "licence:foreign-link",
      status: "completed",
      analysis: {},
      matchedFrameworkId: framework.framework.id,
    }).returning();

    await expect(db.delete(users).where(eq(users.id, uA))).resolves.toBeDefined();
    expect(await db.select().from(frameworks).where(eq(frameworks.id, framework.framework.id))).toEqual([]);
    const [survivor] = await db.select().from(autopsies).where(eq(autopsies.id, licensedAutopsy.id));
    expect(survivor).toMatchObject({
      rightsBasis: "independently_licensed",
      rightsEvidenceId: "licence:foreign-link",
      matchedFrameworkId: null,
    });
  });

  it("R10: a canonical mechanism that fails the DB content authority never reaches proposed curation", () => {
    expect(() =>
      assertAutopsyFrameworkCandidate({
        trendItemId: "00000000-0000-7000-8000-000000000004",
        analysis: {
          hookMechanic: "It reached 40,000 views for @alice",
          beats: ["Open with Alice's result"],
          ending: "Credit the result to Alice",
          followTrigger: "Promise another result",
        },
      })
    ).toThrow(FrameworkContentError);
  });

  // ------------------------------------------------------------------ R-99
  // CHANGE B: the CONTENT question and the CANDIDACY question, separated.
  //
  // THE FIXTURE IS THE POPULATION. It is annotated with the parameter type, so
  // a field added to the analysis is a COMPILE error here until it is added
  // below — and `Object.keys` then plants a violation in it automatically. A
  // hand-written field list is the shape CLAUDE.md's 2026-08-29 lesson is
  // about: it narrows silently the day the analysis grows.
  const CLEAN_ANALYSIS: Parameters<typeof assertAutopsyMechanismContent>[0] = {
    hookMechanic: "Open on a visible tradeoff",
    beats: ["Show the setup", "Turn on the constraint"],
    ending: "Return to the opening tradeoff",
    followTrigger: "Name the next mechanism to test",
  };
  const ITEM = "00000000-0000-7000-8000-00000000000a";
  const plant = (field: string, value: string) => ({
    ...CLEAN_ANALYSIS,
    [field]: field === "beats" ? [value] : value,
  });

  it.each(Object.keys(CLEAN_ANALYSIS))(
    "CHANGE B: the content scan refuses a planted violation in %s, and refuses it with the SAME rule the candidacy check does",
    (field) => {
      const analysis = plant(field, "It reached 40,000 views for @alice");
      let fromContent: FrameworkContentError | null = null;
      let fromCandidate: FrameworkContentError | null = null;
      try { assertAutopsyMechanismContent(analysis); } catch (error) { fromContent = error as FrameworkContentError; }
      try { assertAutopsyFrameworkCandidate({ trendItemId: ITEM, analysis }); } catch (error) { fromCandidate = error as FrameworkContentError; }

      expect(fromContent, field).toBeInstanceOf(FrameworkContentError);
      expect(fromCandidate, field).toBeInstanceOf(FrameworkContentError);
      // The same RULE and the same FIELD: the private path is not a lookalike
      // scan with its own vocabulary, it is `assertMechanismLevel` over the
      // same mapping. A second, weaker copy would show up right here.
      expect(fromContent!.ruleId, field).toBe(fromCandidate!.ruleId);
      expect(fromContent!.ruleId, field).not.toBeNull();
      expect(fromContent!.field, field).toBe(fromCandidate!.field);
    },
  );

  it("CHANGE B: NON-VACUITY — the clean analysis passes both, so the refusals above are the planted text and not the fixture", () => {
    expect(() => assertAutopsyMechanismContent(CLEAN_ANALYSIS)).not.toThrow();
    expect(() => assertAutopsyFrameworkCandidate({ trendItemId: ITEM, analysis: CLEAN_ANALYSIS })).not.toThrow();
    // ...which also says the constant ref the content scan stands its citations
    // on is itself mechanism-level: it is scanned like every other string, so a
    // ref that tripped a rule would make EVERY private analysis fail here.
  });

  it("CHANGE B: the shared library's own BOUNDS are candidacy, not content — a long mechanic and a long beat list pass the content scan and are still refused as a library row", () => {
    const longName = { ...CLEAN_ANALYSIS, hookMechanic: `Open on a visible tradeoff ${"and hold it ".repeat(20)}` };
    expect([...longName.hookMechanic].length).toBeGreaterThan(FRAMEWORK_NAME_MAX);
    expect(() => assertAutopsyMechanismContent(longName)).not.toThrow();
    expect(() => assertAutopsyFrameworkCandidate({ trendItemId: ITEM, analysis: longName })).toThrow(FrameworkLimitError);

    const manyBeats = {
      ...CLEAN_ANALYSIS,
      beats: Array.from({ length: FRAMEWORK_LIST_MAX + 1 }, (_, i) => `Show the setup once more, take ${"x".repeat(i + 1)}`),
    };
    expect(() => assertAutopsyMechanismContent(manyBeats)).not.toThrow();
    expect(() => assertAutopsyFrameworkCandidate({ trendItemId: ITEM, analysis: manyBeats })).toThrow(FrameworkLimitError);

    // And the trend item ref is not even a PARAMETER of the content question:
    // an id no library citation could be built from refuses the candidate and
    // has nothing to say about the creator's text.
    expect(() => assertAutopsyFrameworkCandidate({ trendItemId: "not-a-uuid", analysis: CLEAN_ANALYSIS }))
      .toThrow(FrameworkContentError);
  });

  it("R5a: seeding is IDEMPOTENT and never overwrites a curator's decision", async () => {
    await seedSharedFrameworks(db);
    // An operator retires one, and edits nothing else.
    const [first] = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.visibility, "shared"))
      .limit(1);
    await db
      .update(frameworks)
      .set({ retiredAt: new Date(), saturation: "retired" })
      .where(eq(frameworks.id, first.id));

    await seedSharedFrameworks(db);
    const rows = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.visibility, "shared"));
    expect(rows, "the re-run duplicated the library").toHaveLength(9);
    const [after] = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.id, first.id));
    expect(
      after.retiredAt,
      "the re-run un-retired a framework a curator retired"
    ).not.toBeNull();
  });

  it("R5a: the SEED ITSELF passes the mechanism-level scan", () => {
    // The library is checked-in text anybody can edit, and it is the one place
    // REQ-D04 most needs the scan. `seedSharedFrameworks` runs it; this asserts
    // the same thing without a database so a failure names the framework.
    for (const content of SHARED_FRAMEWORK_SEED) {
      expect(() => assertMechanismLevel(content), content.name).not.toThrow();
    }
  });

  it("R5a: the content scan REJECTS each detectable class — planted, one per rule", () => {
    // PLANTED VIOLATIONS, one per rule, because a scan reporting zero findings
    // is indistinguishable from a scan that is broken (CLAUDE.md 2026-08-21).
    // Each plant is the CLEAN content with exactly one field poisoned, so the
    // negative case is the baseline minus the property.
    const PLANTS: [string, FrameworkContent][] = [
      ["handle in prose", clean({ whyItConverts: "Works the way @liahansenn does it." })],
      ["handle in a beat", clean({ beats: ["Open like @somebody opens."] })],
      ["url", clean({ whyItConverts: "See https://tiktok.com/@x/video/1 for the shape." })],
      ["bare domain", clean({ testedCaveats: ["Compare against instagram.com posts."] })],
      ["personal-account url in a source ref", clean({
        sourceReferences: [{ kind: "trend_item", ref: "https://www.tiktok.com/@creator" }],
      })],
      ["follower count", clean({ whyItConverts: "It added 200 followers in a day." })],
      ["view count", clean({ testedCaveats: ["It took 40000 views to find out."] })],
      ["k-suffixed metric", clean({ whyItConverts: "Reach of 75k on the first try." })],
      ["ratio metric", clean({ whyItConverts: "It runs at 5.00 follows per 1k." })],
      ["percentage", clean({ whyItConverts: "Retention sits at 62% through the turn." })],
      ["multiplier", clean({ whyItConverts: "It converts 3.75x the next best shape." })],
      ["currency", clean({ beats: ["Say you made $4,000 last month."] })],
      ["figures phrase", clean({ whyItConverts: "The six-figure month is the proof." })],
      ["viral claim", clean({ testedCaveats: ["It went viral twice."] })],
      ["converts-at claim", clean({ whyItConverts: "It converts at baseline otherwise." })],
      ["attributed person", clean({ whyItConverts: "Invented by Marcus, refined since." })],
      ["possessive person", clean({ beats: ["Run Vivian's version of the open."] })],
      ["metric in an observation", clean({
        evidenceEntries: [
          { kind: "internal_autopsy", ref: "corpus-batch-0", observation: "It took 12k views." },
        ],
      })],
      ["handle in an applicability note", clean({
        applicability: [{ goal: "saves", niche: "any", note: "Like @someone's saves." }],
      })],
    ];
    for (const [label, content] of PLANTS) {
      let thrown: unknown;
      try {
        assertMechanismLevel(content);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `the plant "${label}" was ACCEPTED — the rule is not firing`).
        toBeInstanceOf(FrameworkContentError);
    }
    // NON-VACUITY THE OTHER WAY: the clean baseline is accepted, so the scan is
    // not simply refusing everything. Small bare integers survive, which is the
    // property that keeps "three beats" and "the first two seconds" writable.
    expect(() =>
      assertMechanismLevel(
        clean({ beats: ["Hold the first 2 seconds.", "Give it 3 beats."] })
      )
    ).not.toThrow();
  });

  it("R5a: EVERY metric noun is refused by all three number rules, per NOUN", () => {
    // THE COVERAGE CHECK THAT MAKES "the nouns are derived from the goals" A
    // FACT (tenancy gate, 2026-09-02). `reach` is a first-class member of
    // `FRAMEWORK_GOALS` and appeared in NONE of the three rules, so
    // `It did 40,000 reach in the first week.` and `It pulled four hundred
    // thousand reach.` were MEASURED ACCEPTED into shared library content
    // while `40000 views` was refused — a hand-copied noun list, drifting from
    // the vocabulary it was copied from.
    //
    // DRIVEN OVER `METRIC_NOUNS`, so adding a goal to `FRAMEWORK_GOALS` turns
    // this RED until the three regexp literals learn the word. The patterns
    // stay literals (never assembled from this array) for the doubled-backslash
    // reason CLAUDE.md's 2026-08-21 lesson gives; the list is the POPULATION and
    // this case is what keeps the two agreeing.
    expect(METRIC_NOUNS.length, "the noun list was not read").toBeGreaterThan(4);
    for (const noun of METRIC_NOUNS) {
      for (const text of [
        "It did 40 " + noun + ".",
        "It did 40,000 " + noun + " in the first week.",
        "It pulled four hundred thousand " + noun + ".",
        "It doubled the " + noun + " on the second run.",
      ]) {
        expect(
          () => assertMechanismLevel(clean({ whyItConverts: text })),
          '"' + text + '" is storable as shared library content'
        ).toThrow(FrameworkContentError);
      }
    }
  });

  it("R5a: a MULTIPLIER with no metric beside it is ACCEPTED — the refusal named no cause", () => {
    // MEASURED REFUSED before this pass, each as "states a performance
    // multiple", none of them containing a metric: the rule fired on the bare
    // stem `doubl|tripl|quadrupl`. A refusal naming a cause that did not happen
    // is the class this file has now recorded three times.
    for (const text of [
      "Double the confession: admit the flaw, then admit the flaw behind it.",
      "The cut lands on a double-take.",
      "Escalate by tripling the stakes.",
      "Run it at twice the length.",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        text
      ).not.toThrow();
    }
    // ...and the multiple that IS a performance claim still refuses, in both
    // orders and in the word form — so this widened nothing.
    for (const text of [
      "it more than doubled her usual numbers",
      "saves doubled on the second run",
      "twice as many saves",
      "ten times the reach",
      "half again as many saves",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        text
      ).toThrow(FrameworkContentError);
    }
  });

  it("R5a: a ccTLD URL WITH A PATH refuses; a bare ccTLD host is the STATED residue", () => {
    // The docblock claimed the URL rule covered personal-account URLs "a
    // fortiori". `See respin.studio.uk/f1` was MEASURED ACCEPTED: `.uk` is in
    // no TLD list. The path alternative closes the shape that carries a handle;
    // the bare host is named in the residue rather than patched with a fourth
    // alternative, and this case is what keeps that admission honest.
    expect(() =>
      assertMechanismLevel(
        clean({ whyItConverts: "See respin.studio.uk/f1 for the shape." })
      )
    ).toThrow(FrameworkContentError);
    expect(() =>
      assertMechanismLevel(
        clean({ whyItConverts: "See respin.studio.uk for the shape." })
      )
    ).not.toThrow();
  });

  it("R5a: a SCALE-WORD audience size is refused, and that cost is recorded not hidden", () => {
    // `metric_word_quantity`'s comment used to claim its scale-word
    // discriminator "keeps a population size sayable". It does not: it keeps a
    // SMALL COUNTING WORD sayable. An REQ-D01 applicability note stating an
    // account size in scale words is REFUSED, measured — and the refusal is
    // KEPT, because the lexical difference between a count a piece GOT and a
    // count an account HAS is the verb, which no pattern here can read.
    //
    // ASSERTED SO THE COMMENT CANNOT DRIFT BACK. If somebody carves out the
    // audience-size case, this fails and they change the comment with it.
    expect(() =>
      assertMechanismLevel(
        clean({
          applicability: [
            {
              goal: "follows",
              niche: "any",
              note: "A creator with three thousand followers can run this shape.",
            },
          ],
        })
      )
    ).toThrow(FrameworkContentError);
    // The sayable form of the same note is the qualitative one, which is also
    // the mechanism-level way to say it under REQ-D04.
    expect(() =>
      assertMechanismLevel(
        clean({
          applicability: [
            {
              goal: "follows",
              niche: "any",
              note: "A creator with a small following can run this shape.",
            },
          ],
        })
      )
    ).not.toThrow();
    // ...and a small counting word over the CORPUS is still sayable, which is
    // what every rewritten seed observation is built on.
    expect(() =>
      assertMechanismLevel(
        clean({ whyItConverts: "Two pieces in the corpus drew saves and no follows." })
      )
    ).not.toThrow();
  });

  it("R5a: every rule the honesty suite does NOT own has a plant here", () => {
    // THE POPULATION IS THE RULE LIST, not a hand-written label list (the
    // hand-written one is above and stays, because it also exercises every
    // FIELD of the walker). The fourteen `claim:` rules are driven per id in
    // `tests/framework-content-honesty.test.ts` against `CLAIM_SPECIMENS`,
    // which is the canon's own non-vacuity witness; every other rule is driven
    // here. A rule added to either half with no plant is a red test.
    const PLANTED_BY_ID: Readonly<Record<string, string>> = {
      handle: "Works the way @liahansenn does it.",
      url: "See https://tiktok.com/@x/video/1 for the shape.",
      metric_unit: "Reach of 75k on the first try.",
      metric_noun: "It added 200 followers in a day.",
      metric_phrase: "The six-figure month is the proof.",
      metric_word_quantity: "It did four hundred thousand views.",
      metric_multiplier: "It more than doubled her usual numbers.",
      metric_multiplier_words: "It drew twice as many saves.",
      email: "Questions to sarah.mitchell@mailbox.example.",
      phone: "Text 07700 900123 for the template.",
      attributed_person: "Invented by Marcus, refined since.",
    };
    const ownedElsewhere = (id: string) => id.startsWith("claim:");
    for (const rule of MECHANISM_CONTENT_RULES) {
      if (ownedElsewhere(rule.id)) continue;
      const specimen = PLANTED_BY_ID[rule.id];
      expect(
        specimen,
        rule.id + " has no planted violation — the rule is unproven"
      ).toBeDefined();
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: specimen })),
        "the plant for " + rule.id + " was ACCEPTED"
      ).toThrow(FrameworkContentError);
    }
    // NON-VACUITY OF THE SPLIT ITSELF: the half claimed to be owned elsewhere
    // is not empty, so `continue` is skipping real rules rather than none.
    expect(MECHANISM_CONTENT_RULES.filter((r) => ownedElsewhere(r.id)).length).toBe(14);
  });

  it("R5a: the scan's LIMIT is stated, not hidden — a bare personal name passes", () => {
    // THIS TEST ASSERTS A WEAKNESS ON PURPOSE. `FrameworkContentError`'s
    // docblock says the scan cannot detect an arbitrary personal name in
    // ordinary prose, and `brain-reason.ts`'s header records why every
    // detector proposed for that class is "a list of counterexamples wearing
    // the word class". Writing the limit as a test means a future reader
    // cannot mistake the scan for something wider — and if somebody ever DOES
    // build a real name detector, this case fails and they delete it
    // deliberately.
    expect(() =>
      assertMechanismLevel(
        clean({ whyItConverts: "The shape a devout Catholic mother in Leeds would use." })
      )
    ).not.toThrow();
  });

  it("R5a: the content scan runs on the WRITE path, not only as a helper", async () => {
    const scope = await scopeFor("fw_a");
    await expect(
      createPrivateFramework(db, scope, pA1, {
        content: clean({ whyItConverts: "Works the way @someone does it." }),
        entitlement: "included",
      })
    ).rejects.toBeInstanceOf(FrameworkContentError);
    expect(await db.select().from(frameworks)).toHaveLength(0);
  });

  // ------------------------------------------------------------------ R5b

  /** One shared row of each disposition, so the reader has something to exclude. */
  async function seedEveryDisposition() {
    const base = {
      beats: [],
      whyItConverts: "Fixture",
      applicability: [],
      sourceReferences: [],
      evidenceEntries: [],
      testedCaveats: [],
      confidence: "unsupported",
      visibility: "shared" as const,
      rightsBasis: "independently_licensed" as const,
      rightsEvidenceId: "test-license:dispositions",
    };
    await db.insert(frameworks).values([
      { ...base, slug: "approved-one", name: "Approved", saturation: "observed", curatorStatus: "approved" },
      { ...base, slug: "proposed-one", name: "Proposed", saturation: "observed", curatorStatus: "proposed" },
      { ...base, slug: "rejected-one", name: "Rejected", saturation: "observed", curatorStatus: "rejected" },
      {
        ...base,
        slug: "retired-one",
        name: "Retired",
        saturation: "retired",
        retiredAt: new Date(),
        curatorStatus: "approved",
      },
      {
        ...base,
        slug: "saturated-one",
        name: "Saturated",
        saturation: "saturated",
        curatorStatus: "approved",
      },
      {
        ...base,
        slug: "superseded-one",
        name: "Superseded v1",
        saturation: "observed",
        curatorStatus: "approved",
        supersededAt: new Date(),
      },
    ]);
  }

  it("R5b (M8, verification 12): proposed / rejected / retired / superseded NEVER appear; approved does", async () => {
    await seedEveryDisposition();
    const library = await sharedFrameworkLibrary(db);
    const slugs = library.map((f) => f.slug).sort();
    // M8 reddens here: a reader that dropped any one of the three predicates
    // returns a slug this list does not carry.
    expect(slugs).toEqual(["approved-one", "saturated-one"]);
    // NON-VACUITY: every excluded row really is in the table.
    expect((await db.select().from(frameworks)).length).toBe(6);
  });

  it("R5b: a SATURATED framework is LABELLED, and nothing else is", async () => {
    await seedEveryDisposition();
    const library = await sharedFrameworkLibrary(db);
    const saturated = library.find((f) => f.slug === "saturated-one");
    const ordinary = library.find((f) => f.slug === "approved-one");
    expect(saturated?.saturationNotice).toBe(SATURATION_NOTICE);
    expect(ordinary?.saturationNotice).toBe(SATURATION_NOTICE);
    // The notice DEMANDS A FRESH INTERPRETATION (REQ-D02) rather than merely
    // flagging a status, and it makes no promise: the words this repo's own
    // canon bans on a creator-facing surface are absent.
    expect(SATURATION_NOTICE.toLowerCase()).toContain("re-interpret");
    for (const banned of [/\bguarantee/i, /\bconfiden/i, /\blearn/i, /\bimprov/i, /\btrain(s|ed|ing)?\b/i]) {
      expect(SATURATION_NOTICE, String(banned)).not.toMatch(banned);
    }
  });

  it("R5b: retirement is ONE fact with two spellings — the CHECK refuses either half alone", async () => {
    const base = {
      slug: "half-retired",
      name: "Half retired",
      beats: [],
      whyItConverts: "Fixture",
      applicability: [],
      sourceReferences: [],
      evidenceEntries: [],
      testedCaveats: [],
      confidence: "unsupported",
      visibility: "shared" as const,
      rightsBasis: "independently_licensed" as const,
      rightsEvidenceId: "test-license:retirement",
    };
    // A stamp with an un-retired saturation...
    await expect(
      db.insert(frameworks).values({ ...base, saturation: "observed", retiredAt: new Date() })
    ).rejects.toThrow();
    // ...and a retired saturation with no stamp, which is the DANGEROUS half:
    // R5b's reader filters on `retired_at IS NULL`, so that row would come
    // back as recommendable while claiming to be retired.
    await expect(
      db.insert(frameworks).values({ ...base, saturation: "retired" })
    ).rejects.toThrow();
    // Both together land.
    await expect(
      db.insert(frameworks).values({ ...base, saturation: "retired", retiredAt: new Date() })
    ).resolves.toBeDefined();
  });

  it("R-29: the confidence ladder in code and the CHECK in SQL agree, generatively", async () => {
    // A property that depends on TWO THINGS AGREEING is proved against the real
    // producer across a range, never with a list of hand-picked strings
    // (CLAUDE.md 2026-08-18). Here the two are `deriveFrameworkConfidence` and
    // `frameworks_confidence_matches_evidence`.
    for (let n = 0; n <= 6; n += 1) {
      const entries = Array.from({ length: n }, (_, i) => ({
        kind: "internal_autopsy" as const,
        ref: "corpus-batch-0",
        observation: `observation ${i}`,
      }));
      const derived = deriveFrameworkConfidence(entries);
      const row = {
        slug: `ladder-${n}`,
        name: `Ladder ${n}`,
        beats: [],
        whyItConverts: "Fixture",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: entries,
        testedCaveats: [],
        saturation: "observed" as const,
        visibility: "shared" as const,
        rightsBasis: "independently_licensed" as const,
        rightsEvidenceId: "test-license:confidence-ladder",
      };
      // The derived rung is storable...
      await expect(
        db.insert(frameworks).values({ ...row, confidence: derived }),
        `n=${n} derived ${derived}`
      ).resolves.toBeDefined();
      // ...and EVERY OTHER RUNG IS NOT, which is the half that makes the CHECK
      // an agreement rather than a coincidence.
      for (const other of ["unsupported", "single_case", "repeated", "contrasted"]) {
        if (other === derived) continue;
        await expect(
          db.insert(frameworks).values({
            ...row,
            slug: `ladder-${n}-${other}`,
            confidence: other,
          }),
          `n=${n} accepted the wrong rung ${other}`
        ).rejects.toThrow();
      }
    }
  });

  it("the jsonb columns must be ARRAYS — a scalar satisfies NOT NULL and carries nothing", async () => {
    // The same hole `generation_attempts_candidate_is_object` closes one table
    // over: `jsonb` accepts `'null'` and `'"x"'`, both of which pass NOT NULL.
    await expect(
      db.insert(frameworks).values({
        slug: "scalar-beats",
        name: "Scalar",
        beats: sql`'"not an array"'::jsonb`,
        whyItConverts: "Fixture",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "unsupported",
        saturation: "observed",
        visibility: "shared",
        rightsBasis: "independently_licensed",
        rightsEvidenceId: "test-license:json-shape",
      })
    ).rejects.toThrow();
  });

  // ------------------------------------------------------------------ R5c

  it("R5c: Pro+ create -> read -> version -> approve -> retire, all scoped", async () => {
    const scope = await scopeFor("fw_a");
    const created = await createPrivateFramework(db, scope, pA1, {
      content: clean(),
      entitlement: "included",
    });
    expect(created.visibility).toBe("private");
    expect(created.ownerProfileId).toBe(pA1);
    expect(created.workspaceId).toBe(wsA);
    expect(created.version).toBe(1);
    // A creator's own framework starts PROPOSED — REQ-D02 draws no exception
    // for private ones, so it is not yet recommendable.
    expect(created.curatorStatus).toBe("proposed");
    expect(created.confidence).toBe("single_case");
    expect(created.slug).toBe(frameworkSlug("The Reversal"));

    // READ: the creator's own live list.
    expect((await listPrivateFrameworks(db, scope, pA1)).map((f) => f.id)).toEqual([
      created.id,
    ]);
    // ...and it is NOT eligible for generation until approved.
    expect(await eligibleFrameworks(db, scope, pA1)).toEqual([]);

    const approved = await approvePrivateFramework(db, scope, pA1, created.id, "included");
    expect(approved.curatorStatus).toBe("approved");
    expect(approved.curatedBy).toContain(pA1);
    expect((await eligibleFrameworks(db, scope, pA1)).map((f) => f.id)).toEqual([
      created.id,
    ]);

    // VERSION: a NEW ROW, the old one superseded, the slug carried forward.
    const v2 = await editPrivateFramework(db, scope, pA1, {
      baseFrameworkId: created.id,
      content: clean({ name: "The Reversal, renamed", whyItConverts: "Sharper turn." }),
      entitlement: "included",
    });
    expect(v2.id).not.toBe(created.id);
    expect(v2.version).toBe(2);
    expect(v2.slug, "the slug moved — the recorded {id, version} pairs are orphaned").toBe(
      created.slug
    );
    expect(v2.curatorStatus).toBe("approved");
    const [old] = await db.select().from(frameworks).where(eq(frameworks.id, created.id));
    expect(old.supersededAt).not.toBeNull();
    // Only the LIVE version is listed; both are still stored.
    expect((await listPrivateFrameworks(db, scope, pA1)).map((f) => f.id)).toEqual([v2.id]);
    expect(
      (await db.select().from(frameworks).where(eq(frameworks.ownerProfileId, pA1))).length
    ).toBe(2);

    // RETIRE: both spellings move together, and the row leaves both readers.
    const retired = await retirePrivateFramework(db, scope, pA1, v2.id, "included");
    expect(retired.retiredAt).not.toBeNull();
    expect(retired.saturation).toBe("retired");
    expect(await listPrivateFrameworks(db, scope, pA1)).toEqual([]);
    expect(await eligibleFrameworks(db, scope, pA1)).toEqual([]);
  });

  it("R5c: the ENTITLEMENT argument's FALSE branch refuses every write", async () => {
    // CLAUDE.md 2026-08-29: a required parameter with no default reads exactly
    // like a guard and is not one until a test drives its false branch. All
    // four writes, because a gate applied only where today's caller happens to
    // be is the 2026-07-30 shape.
    const scope = await scopeFor("fw_a");
    const seeded = await createPrivateFramework(db, scope, pA1, {
      content: clean(),
      entitlement: "included",
    });
    await expect(
      createPrivateFramework(db, scope, pA1, {
        content: clean({ name: "Another" }),
        entitlement: "not_included",
      })
    ).rejects.toBeInstanceOf(PrivateFrameworkTierError);
    await expect(
      editPrivateFramework(db, scope, pA1, {
        baseFrameworkId: seeded.id,
        content: clean(),
        entitlement: "not_included",
      })
    ).rejects.toBeInstanceOf(PrivateFrameworkTierError);
    await expect(
      approvePrivateFramework(db, scope, pA1, seeded.id, "not_included")
    ).rejects.toBeInstanceOf(PrivateFrameworkTierError);
    await expect(
      retirePrivateFramework(db, scope, pA1, seeded.id, "not_included")
    ).rejects.toBeInstanceOf(PrivateFrameworkTierError);
    // Nothing moved.
    const rows = await db.select().from(frameworks);
    expect(rows).toHaveLength(1);
    expect(rows[0].retiredAt).toBeNull();
    expect(rows[0].curatorStatus).toBe("proposed");
    // ...and the refusal does NOT sell an upgrade (the `profile_cap` /
    // `ModeNotInPlanError` rule).
    const message = new PrivateFrameworkTierError().message;
    expect(message).not.toMatch(/upgrade|move to a plan|buy|subscribe/i);
    expect(message).toContain("nothing was stored");
  });

  it("R5c: a VIEWER cannot mutate, and the role gate runs BEFORE the tier gate", async () => {
    const owner = await scopeFor("fw_a");
    const seeded = await createPrivateFramework(db, owner, pA1, {
      content: clean(),
      entitlement: "included",
    });
    await seedAuthUser(db, "fw_viewer");
    const [viewerUser] = await db
      .insert(schema.users)
      .values({ authUserId: "fw_viewer" })
      .returning();
    await db
      .insert(schema.memberships)
      .values({ userId: viewerUser.id, workspaceId: wsA, role: "viewer" });
    const viewer = await withWorkspace(db, {
      authUserId: "fw_viewer",
      workspaceId: wsA,
    });
    for (const [label, run] of [
      [
        "create",
        () =>
          createPrivateFramework(db, viewer, pA1, {
            content: clean({ name: "Viewer's" }),
            entitlement: "included",
          }),
      ],
      [
        "edit",
        () =>
          editPrivateFramework(db, viewer, pA1, {
            baseFrameworkId: seeded.id,
            content: clean(),
            entitlement: "included",
          }),
      ],
      ["approve", () => approvePrivateFramework(db, viewer, pA1, seeded.id, "included")],
      ["retire", () => retirePrivateFramework(db, viewer, pA1, seeded.id, "included")],
    ] as [string, () => Promise<unknown>][]) {
      await expect(run(), label).rejects.toBeInstanceOf(ProfileRoleError);
    }
    // ...but a viewer MAY read, like every other profile read in this package.
    await expect(listPrivateFrameworks(db, viewer, pA1)).resolves.toHaveLength(1);
  });

  it("R5c: a private framework CANNOT masquerade as a shared/curated row", async () => {
    const scope = await scopeFor("fw_a");
    // THE SMUGGLE, THROUGH A CAST rather than only a type error (CLAUDE.md
    // 2026-08-21: proving a field cannot be TYPED is not proving it cannot be
    // CAST). Every server-derived column at once, and the two that matter most
    // are `visibility: "shared"` and `curatorStatus: "approved"` — together
    // they would turn a creator's private row into approved library content
    // that every other workspace generates from.
    await expect(
      createPrivateFramework(db, scope, pA1, {
        content: {
          ...clean(),
          visibility: "shared",
          ownerProfileId: null,
          workspaceId: null,
          curatorStatus: "approved",
          curatedBy: "seed:respin-library-v1",
          version: 99,
          confidence: "contrasted",
          retiredAt: null,
          supersededAt: null,
        } as unknown as FrameworkContent,
        entitlement: "included",
      })
    ).rejects.toBeInstanceOf(FrameworkContentError);
    // REFUSED, NOT STRIPPED, and that is the stronger of the two: the closed
    // funnel (`strictObject`) means the values never reach the insert at all,
    // so there is no strip to get wrong. Nothing was written.
    expect(await db.select().from(frameworks)).toHaveLength(0);
    // ...and the refusal is a TYPED one, not a raw ZodError — a ZodError
    // reaching `app/**` renders as "Something went wrong".

    // The same content WITHOUT the smuggled keys lands, with every one of
    // those columns decided by the server.
    const created = await createPrivateFramework(db, scope, pA1, {
      content: clean(),
      entitlement: "included",
    });
    expect(created.visibility).toBe("private");
    expect(created.ownerProfileId).toBe(pA1);
    expect(created.curatorStatus).toBe("proposed");
    expect(created.curatedBy).toBeNull();
    expect(created.version).toBe(1);
    // The rung is DERIVED from the one evidence entry — `contrasted` needs
    // five, and no caller can claim it.
    expect(created.confidence).toBe("single_case");
    // ...and it never enters the shared library.
    expect(await sharedFrameworkLibrary(db)).toEqual([]);
  });

  it("R5c: the CHECKs make 'private row loses its owner and becomes library content' unrepresentable", async () => {
    const scope = await scopeFor("fw_a");
    const created = await createPrivateFramework(db, scope, pA1, {
      content: clean(),
      entitlement: "included",
    });
    // R-9's constraint, attempted: clearing the owner of a private row.
    await expect(
      db
        .update(frameworks)
        .set({ ownerProfileId: null, workspaceId: null })
        .where(eq(frameworks.id, created.id))
    ).rejects.toThrow();
    // ...and the mirror: giving a shared row an owner.
    await seedSharedFrameworks(db);
    const [shared] = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.visibility, "shared"))
      .limit(1);
    await expect(
      db
        .update(frameworks)
        .set({ ownerProfileId: pA1, workspaceId: wsA })
        .where(eq(frameworks.id, shared.id))
    ).rejects.toThrow();
  });

  it("R5c: ...and the OWNERSHIP COLUMNS ARE IMMUTABLE, which the two CHECKs alone are not", async () => {
    // WHAT THE CHECKS ACTUALLY REFUSE, AND WHAT THEY DO NOT (tenancy gate,
    // 2026-09-01). The test above proves each HALF of the move is refused:
    // nulling the owner alone breaks `frameworks_private_has_owner`, and
    // setting `visibility='shared'` alone breaks
    // `frameworks_shared_has_no_owner`. Doing BOTH IN ONE UPDATE was MEASURED
    // ACCEPTED — a creator's private framework becomes shared library content,
    // readable by every workspace, in one statement. The registry's sentence
    // ("the `shared implies both NULL` CHECK is what stops a private row
    // BECOMING library content by losing its owner") is true of the move it
    // names and was false of the property it was offered as evidence for.
    //
    // THE ASYMMETRY IS THE FINDING. Slice 7 built a plpgsql BEFORE UPDATE
    // trigger for `generations.parent_id` on exactly this threat model, whose
    // own migration comment says "that is a scan over our own source, not a
    // property of the database, and an incident-time hand-run UPDATE is
    // exactly the path this closes" — and the column left unguarded was the
    // one whose flip is CROSS-TENANT.
    //
    // THE GUARD IS THE WHOLE OWNERSHIP TRIPLE, not `visibility` alone: moving
    // a private row from one profile to another is the same threat in a
    // different spelling, and the composite FK does not forbid it (the target
    // only has to be a real profile). Fixing the class, not the field.
    const scope = await scopeFor("fw_a");
    const mine = await createPrivateFramework(db, scope, pA1, {
      content: clean(),
      entitlement: "included",
    });
    expect(
      await refusalMessage(
        db.execute(sql`
          UPDATE frameworks
          SET visibility = 'shared', owner_profile_id = NULL, workspace_id = NULL
          WHERE id = ${mine.id}
        `)
      ),
      "a private framework became SHARED LIBRARY CONTENT in one UPDATE"
    ).toMatch(/visibility, owner_profile_id and workspace_id are immutable/i);
    // RE-PARENTING to the sibling profile in the same workspace.
    expect(
      await refusalMessage(
        db.execute(sql`
          UPDATE frameworks SET owner_profile_id = ${pA2} WHERE id = ${mine.id}
        `)
      ),
      "a private framework was handed to another creator profile"
    ).toMatch(/visibility, owner_profile_id and workspace_id are immutable/i);
    // ...and the reverse move, a library row acquiring an owner in one UPDATE.
    await seedSharedFrameworks(db);
    const [lib] = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.visibility, "shared"))
      .limit(1);
    expect(
      await refusalMessage(
        db.execute(sql`
          UPDATE frameworks
          SET visibility = 'private', owner_profile_id = ${pA1}, workspace_id = ${wsA}
          WHERE id = ${lib.id}
        `)
      ),
      "curated library content became one creator's private row in one UPDATE"
    ).toMatch(/visibility, owner_profile_id and workspace_id are immutable/i);

    // NON-VACUITY, AND THE NARROWNESS THAT MAKES THIS NOT AN OUTAGE. The
    // `parent_id` trigger was written narrow on purpose so it could not become
    // an outage for R-54's deletion/pseudonymisation executor; this one holds
    // to the same shape. Every legitimate write on this table still passes:
    // supersede, approve, retire, and a bare column touch that changes none of
    // the three.
    const edited = await editPrivateFramework(db, scope, pA1, {
      baseFrameworkId: mine.id,
      content: clean({ whyItConverts: "The turn arrives later, and it lands." }),
      entitlement: "included",
    });
    const approved = await approvePrivateFramework(db, scope, pA1, edited.id, "included");
    expect(approved.curatorStatus).toBe("approved");
    const retired = await retirePrivateFramework(db, scope, pA1, edited.id, "included");
    expect(retired.retiredAt).not.toBeNull();
    // A no-op self-assignment of all three columns is NOT a change, so
    // `IS DISTINCT FROM` must let it through — the property `<>` would break
    // the moment any of the three is NULL.
    await db.execute(sql`
      UPDATE frameworks
      SET visibility = visibility,
          owner_profile_id = owner_profile_id,
          workspace_id = workspace_id,
          name = 'Renamed by an operator'
      WHERE id = ${lib.id}
    `);
    const [after] = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.id, lib.id));
    expect(after.name).toBe("Renamed by an operator");
  });

  it("R5c: another profile's framework id is refused, byte-identically to a missing one", async () => {
    const scopeA = await scopeFor("fw_a");
    const scopeB = await scopeFor("fw_b");
    const theirs = await createPrivateFramework(db, scopeB, pB, {
      content: clean(),
      entitlement: "included",
    });
    const siblings = await createPrivateFramework(db, scopeA, pA2, {
      content: clean(),
      entitlement: "included",
    });
    const cases: Record<string, string> = {
      foreignWorkspace: theirs.id,
      siblingProfile: siblings.id,
      missing: "00000000-0000-4000-8000-000000000001",
      malformed: "not-a-uuid",
    };
    const messages: string[] = [];
    for (const [label, id] of Object.entries(cases)) {
      const error = await retirePrivateFramework(db, scopeA, pA1, id, "included").catch(
        (e: Error) => e
      );
      expect(error, label).toBeInstanceOf(FrameworkAccessError);
      messages.push((error as Error).message);
    }
    // ONE MESSAGE FOR ALL FOUR: a distinguishable refusal is an oracle over
    // every other creator's framework ids.
    expect(new Set(messages).size).toBe(1);
    // A SHARED library row addressed as a private one is refused the same way.
    await seedSharedFrameworks(db);
    const [shared] = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.visibility, "shared"))
      .limit(1);
    await expect(
      retirePrivateFramework(db, scopeA, pA1, shared.id, "included")
    ).rejects.toBeInstanceOf(FrameworkAccessError);
  });

  it("R5c: an edit against a SUPERSEDED version refuses rather than losing the newer one", async () => {
    const scope = await scopeFor("fw_a");
    const v1 = await createPrivateFramework(db, scope, pA1, {
      content: clean(),
      entitlement: "included",
    });
    await editPrivateFramework(db, scope, pA1, {
      baseFrameworkId: v1.id,
      content: clean({ whyItConverts: "Version two." }),
      entitlement: "included",
    });
    // The second tab, still holding v1.
    await expect(
      editPrivateFramework(db, scope, pA1, {
        baseFrameworkId: v1.id,
        content: clean({ whyItConverts: "Version two, from the stale tab." }),
        entitlement: "included",
      })
    ).rejects.toBeInstanceOf(FrameworkStaleError);
    // ...and version two survived.
    const live = await listPrivateFrameworks(db, scope, pA1);
    expect(live).toHaveLength(1);
    expect(live[0].whyItConverts).toBe("Version two.");
  });

  it("R5c: `eligibleFrameworks` merges the SHARED library with this profile's own rows only", async () => {
    await seedSharedFrameworks(db);
    const scopeA = await scopeFor("fw_a");
    const scopeB = await scopeFor("fw_b");
    const mine = await createPrivateFramework(db, scopeA, pA1, {
      content: clean({ name: "Mine" }),
      entitlement: "included",
    });
    await approvePrivateFramework(db, scopeA, pA1, mine.id, "included");
    const siblings = await createPrivateFramework(db, scopeA, pA2, {
      content: clean({ name: "The sibling's" }),
      entitlement: "included",
    });
    await approvePrivateFramework(db, scopeA, pA2, siblings.id, "included");
    const theirs = await createPrivateFramework(db, scopeB, pB, {
      content: clean({ name: "Another workspace's" }),
      entitlement: "included",
    });
    await approvePrivateFramework(db, scopeB, pB, theirs.id, "included");

    const eligible = await eligibleFrameworks(db, scopeA, pA1);
    expect(eligible).toHaveLength(10); // nine shared + one private
    const privateIds = eligible.filter((f) => f.visibility === "private").map((f) => f.id);
    expect(privateIds).toEqual([mine.id]);
    // NON-VACUITY: the excluded rows exist and ARE approved and live, so the
    // exclusion is the scope predicate rather than the recommendability one.
    expect(
      (
        await db
          .select()
          .from(frameworks)
          .where(
            and(eq(frameworks.visibility, "private"), eq(frameworks.curatorStatus, "approved"))
          )
      ).length
    ).toBe(3);
  });

  it("R5c: the private-framework COUNT and SIZE ceilings refuse by name", async () => {
    const scope = await scopeFor("fw_a");
    await expect(
      createPrivateFramework(db, scope, pA1, {
        content: clean({ whyItConverts: "x".repeat(FRAMEWORK_TEXT_MAX + 1) }),
        entitlement: "included",
      })
    ).rejects.toBeInstanceOf(FrameworkLimitError);
    // The count ceiling. Driven at the boundary rather than by writing fifty
    // rows through the writer: the rows are seeded directly and the writer is
    // asked for the one that must not fit.
    const base = {
      beats: [],
      whyItConverts: "Fixture",
      applicability: [],
      sourceReferences: [],
      evidenceEntries: [],
      testedCaveats: [],
      confidence: "unsupported",
      saturation: "observed" as const,
      visibility: "private" as const,
      rightsBasis: "profile_private" as const,
      ownerProfileId: pA1,
      workspaceId: wsA,
    };
    await db.insert(frameworks).values(
      Array.from({ length: PRIVATE_FRAMEWORK_COUNT_MAX }, (_, i) => ({
        ...base,
        slug: `filler-${i}`,
        name: `Filler ${i}`,
      }))
    );
    await expect(
      createPrivateFramework(db, scope, pA1, {
        content: clean({ name: "One too many" }),
        entitlement: "included",
      })
    ).rejects.toBeInstanceOf(FrameworkLimitError);
  });

  it("R5c: two creators may use the SAME slug — the old global unique forbade it", async () => {
    await seedSharedFrameworks(db);
    const scopeA = await scopeFor("fw_a");
    const scopeB = await scopeFor("fw_b");
    // The same name the LIBRARY uses, and the same name as another creator's.
    const name = SHARED_FRAMEWORK_SEED[0].name;
    await expect(
      createPrivateFramework(db, scopeA, pA1, {
        content: clean({ name }),
        entitlement: "included",
      })
    ).resolves.toBeDefined();
    await expect(
      createPrivateFramework(db, scopeB, pB, {
        content: clean({ name }),
        entitlement: "included",
      })
    ).resolves.toBeDefined();
    // ...and ONE LIVE VERSION PER IDENTITY still holds, per scope.
    await expect(
      db.insert(frameworks).values({
        slug: frameworkSlug(name),
        name,
        beats: [],
        whyItConverts: "Fixture",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "unsupported",
        saturation: "observed",
        visibility: "private",
        rightsBasis: "profile_private",
        ownerProfileId: pA1,
        workspaceId: wsA,
        version: 7,
      }),
      "a second LIVE version of one creator's framework was accepted"
    ).rejects.toThrow();
  });

  it("R5c: every private version is EXPORT-included, superseded and retired ones too", async () => {
    const scope = await scopeFor("fw_a");
    const v1 = await createPrivateFramework(db, scope, pA1, {
      content: clean(),
      entitlement: "included",
    });
    const v2 = await editPrivateFramework(db, scope, pA1, {
      baseFrameworkId: v1.id,
      content: clean({ whyItConverts: "Version two." }),
      entitlement: "included",
    });
    await retirePrivateFramework(db, scope, pA1, v2.id, "included");
    await seedSharedFrameworks(db);
    const profileScope = await ProfileScope.mint(db, scope, pA1);
    const page = (await profileScope.accessors.exportPage("frameworks", 0)) as {
      id: string;
      visibility: string;
    }[];
    // History is the creator's too — both versions, and the retired one.
    expect(page.map((r) => r.id).sort()).toEqual([v1.id, v2.id].sort());
    // ...and the nine LIBRARY rows are not the creator's data.
    for (const row of page) expect(row.visibility).toBe("private");
  });

  // ------------------------------------------------------ REQ-G08, the pause

  it("REQ-G08: a PAUSED workspace may read its frameworks and may not write one", async () => {
    // MEASURED BEFORE THE FIX, against a live database with an open
    // `pause_periods` row: a brain-doc write was refused with
    // `WorkspacePausedError`, and CREATE, EDIT, APPROVE and RETIRE of a private
    // framework were all ALLOWED. Private frameworks are a Pro-and-Studio
    // entitlement (REQ-D05) — `assertEntitled` is this repo's own proof that it
    // treats them as one — and REQ-G08 says entitlements are frozen and
    // read-only while paused. The rationale for leaving them out ("curating a
    // framework spends nothing") is not the criterion `writeBrainDoc` states,
    // because a brain-doc write spends nothing either.
    //
    // FOUR WRITES, NOT ONE. Gating `createPrivateFramework` alone would leave a
    // paused creator editing, approving and retiring — the same class fixed at
    // one instance, which is what this file's own header warns about.
    await seedSharedFrameworks(db);
    const scope = await scopeFor("fw_a");
    const first = await createPrivateFramework(db, scope, pA1, {
      content: clean(),
      entitlement: "included",
    });
    await db.insert(pausePeriods).values({
      workspaceId: wsA,
      startedAt: new Date(Date.now() - 60_000),
      startedKnownAt: new Date(Date.now() - 60_000),
    });

    await expect(
      createPrivateFramework(db, scope, pA1, {
        content: clean({ name: "Written while paused" }),
        entitlement: "included",
      })
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    await expect(
      editPrivateFramework(db, scope, pA1, {
        baseFrameworkId: first.id,
        content: clean({ whyItConverts: "Edited while paused." }),
        entitlement: "included",
      })
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    await expect(
      approvePrivateFramework(db, scope, pA1, first.id, "included")
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    await expect(
      retirePrivateFramework(db, scope, pA1, first.id, "included")
    ).rejects.toBeInstanceOf(WorkspacePausedError);

    // READ-ONLY MEANS READS STILL WORK. A pause that hid a creator's own
    // frameworks would be a different product decision, and REQ-G08 does not
    // make it: "frozen and read-only".
    expect(await listPrivateFrameworks(db, scope, pA1)).toHaveLength(1);
    expect(await eligibleFrameworks(db, scope, pA1)).toHaveLength(9);
    expect(await sharedFrameworkLibrary(db)).toHaveLength(9);

    // NON-VACUITY: with the pause closed, all four writes proceed. Without
    // this the four assertions above would pass on a workspace that refuses
    // everything for some unrelated reason.
    await db.update(pausePeriods).set({ endedAt: new Date() });
    const edited = await editPrivateFramework(db, scope, pA1, {
      baseFrameworkId: first.id,
      content: clean({ whyItConverts: "Edited after the pause ended." }),
      entitlement: "included",
    });
    const approved = await approvePrivateFramework(db, scope, pA1, edited.id, "included");
    expect(approved.curatorStatus).toBe("approved");
    expect(
      (await retirePrivateFramework(db, scope, pA1, edited.id, "included")).retiredAt
    ).not.toBeNull();
    await createPrivateFramework(db, scope, pA1, {
      content: clean({ name: "Written after the pause ended" }),
      entitlement: "included",
    });
  });

  it("REQ-G08: feedback capture is deliberately NOT pause-gated (A-7's input-capture exemption)", () => {
    // A RECORDED NON-COVERAGE, asserted so it cannot be mistaken for the same
    // oversight. `recordGenerationFeedback` stores a closed reaction code plus
    // the creator's own words about their own output — A-7's first exemption is
    // "storing input the creator submitted", because refusing it silently
    // discards their work.
    //
    // THE DECISION IS NOW IN CODE, NOT ONLY IN PROSE (billing gate,
    // 2026-09-02). `writeBrainDoc`'s comment named two exemptions and this
    // third write was added without touching it — so the record is
    // `WRITE_PAUSE_POLICY`, whose population is DERIVED from the capability
    // object itself in `packages/db/tests/with-workspace.test.ts`. This case
    // asserts the entry exists and carries a warrant, which is the half that
    // makes "decided" different from "defensible".
    const policy = WRITE_PAUSE_POLICY.recordGenerationFeedback;
    expect(typeof policy === "object" && policy.exempt.length > 80).toBe(true);
    // THE TWO FILES BOTH, because a gate could be added in either. The
    // capability lives in `with-workspace.ts` (which is where a pause gate
    // would go) and the composer in `feedback-ops.ts`; the previous version of
    // this case read ONLY the composer, so a gate added at the real write site
    // would have left it green.
    const src = (file: string) =>
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", file),
        "utf8"
      );
    expect(src("feedback-ops.ts")).not.toContain("hasOpenPause");
    expect(src("feedback-ops.ts")).not.toContain("WorkspacePausedError");
    // ...and the capability's own body, sliced from its declaration to the
    // next one, so the file's OTHER gated writes are not what satisfies this.
    const ws = src("with-workspace.ts");
    const start = ws.indexOf("    recordGenerationFeedback: async (params, tx) => {");
    expect(start, "the capability was renamed — this probe reads nothing").toBeGreaterThan(
      0
    );
    const body = ws.slice(start, ws.indexOf("\n    },", start));
    expect(body.length, "the body slice is empty").toBeGreaterThan(200);
    expect(body).not.toContain("hasOpenPause");
  });

  // -------------------------------------------- the offer ORDER (R17's half)

  it("R17: the CURATED library is offered FIRST, so a private row cannot evict it", async () => {
    // MEASURED BEFORE THE FIX. `eligibleFrameworks` ordered by `slug ASC,
    // version DESC` alone, and every one of the nine seeded slugs begins
    // `the-`. `frameworksForContext` in `@respin/credits` fills a character
    // budget in the order it receives and drops whole rows once it is spent, so
    // a creator with enough private frameworks silently loses the product's
    // curated library from their own prompts: at 25 private rows one curated
    // framework was evicted, and at 40 all nine were. Nothing tells them — a
    // dropped framework is simply not offered.
    //
    // THE ORDER IS THE HALF THIS PACKAGE OWNS. The budget and the metric that
    // reports a drop are `@respin/credits`'; this asserts the property that
    // makes eviction of a curated row impossible whatever the budget is.
    await seedSharedFrameworks(db);
    const scope = await scopeFor("fw_a");
    // Slugs chosen to sort BEFORE every `the-…` library slug, which is what
    // made the old order dangerous rather than merely arbitrary.
    for (let i = 0; i < 25; i += 1) {
      const row = await createPrivateFramework(db, scope, pA1, {
        content: clean({ name: `Alpha mechanism ${String(i).padStart(2, "0")}` }),
        entitlement: "included",
      });
      await approvePrivateFramework(db, scope, pA1, row.id, "included");
    }
    const offered = await eligibleFrameworks(db, scope, pA1);
    expect(offered).toHaveLength(34);
    // NON-VACUITY: the private rows really do sort before the library ones by
    // slug, so this is measuring the visibility key rather than an accident.
    const privateSlugs = offered.filter((f) => f.visibility === "private").map((f) => f.slug);
    const sharedSlugs = offered.filter((f) => f.visibility === "shared").map((f) => f.slug);
    expect(privateSlugs.every((s) => s < sharedSlugs[0])).toBe(true);

    const firstPrivate = offered.findIndex((f) => f.visibility === "private");
    const lastShared = offered.map((f) => f.visibility).lastIndexOf("shared");
    expect(
      lastShared,
      "a private framework is offered ahead of a curated one — under a bounded prompt budget that evicts the library"
    ).toBeLessThan(firstPrivate);
    expect(offered.slice(0, 9).every((f) => f.visibility === "shared")).toBe(true);

    // THE MEASURED TABLE, GOING TO ZERO — under a MODEL of the consumer's rule
    // (whole rows only, in order, until the budget is spent) rather than the
    // real `frameworksForContext`, which lives in a package this one may not
    // import. Asserting the model here and the real function there is the
    // handoff; what this proves is that NO budget can drop a curated row
    // before every private row has been dropped.
    const takeUntilSpent = (rows: typeof offered, budget: number) => {
      let used = 0;
      return rows.filter((r) => {
        const size = r.name.length + r.whyItConverts.length;
        if (used + size > budget) return false;
        used += size;
        return true;
      });
    };
    // THE PROPERTY, RESTATED SO IT IS TRUE AT EVERY BUDGET (2026-09-02). This
    // loop used to assert "if any private row survived, no curated row was
    // dropped", and that is NOT a property of the product — it was a property
    // of the fixture. The real consumer SKIPS AND CONTINUES
    // (`frameworksForContext`, `packages/credits/src/generate.ts`: a row that
    // does not fit is pushed to `dropped` and the loop goes on), so a curated
    // row LARGER than the whole budget is skipped and a smaller private row
    // after it is still kept. Rewriting one seeded `whyItConverts` to be
    // honest made the largest curated row cross a 200-character budget and the
    // old assertion went red — on a sentence rewrite, with the ordering
    // untouched, which is what a fixture-shaped assertion does.
    //
    // WHAT IS TRUE AT EVERY BUDGET AND EVERY SIZE: the curated rows kept
    // alongside 25 private ones are EXACTLY the curated rows kept when the
    // private ones are not there at all. Curated rows are offered first, so a
    // private row can never take budget from one. That is R17's claim, and it
    // is now asserted as an equality rather than inferred from a count.
    let sawARealTrade = false;
    for (const budget of [200, 1_000, 5_000, 20_000]) {
      const kept = takeUntilSpent(offered, budget);
      const curatedKept = kept
        .filter((f) => f.visibility === "shared")
        .map((f) => f.slug);
      const curatedAlone = takeUntilSpent(
        offered.filter((f) => f.visibility === "shared"),
        budget
      ).map((f) => f.slug);
      expect(
        curatedKept,
        `budget ${budget}: a private framework took budget from a curated one`
      ).toEqual(curatedAlone);
      if (curatedKept.length > 0 && kept.some((f) => f.visibility === "private")) {
        sawARealTrade = true;
      }
    }
    // NON-VACUITY: at least one budget actually kept curated rows AND private
    // rows together, so the equality above is not four comparisons of two
    // empty lists.
    expect(
      sawARealTrade,
      "no budget in the list exercised the contested case — the equality is vacuous"
    ).toBe(true);
    // ...and the equality FAILS under the mutation it exists to catch: with
    // private rows offered first, the curated set kept is no longer the same.
    // THE BUDGET IS DERIVED, not a round number: exactly the library's own
    // total, which is the tightest budget at which every curated row still
    // fits. A hand-picked 5,000 made this vacuous — everything fitted, both
    // orders kept all nine, and the mutation probe proved nothing.
    const libraryBudget = offered
      .filter((f) => f.visibility === "shared")
      .reduce((n, f) => n + f.name.length + f.whyItConverts.length, 0);
    const privateFirst = [...offered].sort(
      (a, b) =>
        (a.visibility === "private" ? 0 : 1) - (b.visibility === "private" ? 0 : 1)
    );
    expect(
      takeUntilSpent(privateFirst, libraryBudget)
        .filter((f) => f.visibility === "shared")
        .map((f) => f.slug)
    ).not.toEqual(
      takeUntilSpent(
        offered.filter((f) => f.visibility === "shared"),
        libraryBudget
      ).map((f) => f.slug)
    );
    // ...and the strongest form: at a budget that fits exactly the library,
    // every curated row survives and every private one is dropped.
    const libraryOnly = takeUntilSpent(
      offered,
      offered
        .filter((f) => f.visibility === "shared")
        .reduce((n, f) => n + f.name.length + f.whyItConverts.length, 0)
    );
    expect(libraryOnly.filter((f) => f.visibility === "shared")).toHaveLength(9);
  });

  // -------------------------------------- the ownership trigger's OWN residue

  it("R5c: a private-to-shared COPY is refused by persisted rights shape", async () => {
    // A RECORDED NON-COVERAGE (tenancy gate NOTE, 2026-09-02), asserted for the
    // reason the personal-name limit above is asserted: a reader who checks
    // whether the admitted weakness is real must find a case, not a paragraph.
    //
    // `INSERT INTO frameworks (…) SELECT … FROM frameworks WHERE id = <private>`
    // does not fire a BEFORE UPDATE trigger, so the row's WORDS can be copied
    // into a new shared row. What actually stops it is the WRITER ENUMERATION
    // — `frameworks.ts` is the only file that inserts into this table
    // (`tests/table-writers.test.ts` polices that) and of its three inserts
    // only `seedSharedFrameworks` writes `visibility = 'shared'` — plus
    // REQ-D02's curator, who approves what enters the library.
    //
    // IT IS A DIFFERENT THREAT FROM THE ONE 0023 CLOSES, and the difference is
    // worth naming: an UPDATE re-labels the creator's OWN ROW, which their
    // export and their deletion still point at; a COPY creates a second row
    // that their deletion will not reach. The first is a tenancy break in one
    // statement; the second needs a writer nobody has.
    //
    // If somebody adds a BEFORE INSERT guard, this case fails and they delete
    // it deliberately.
    const scope = await scopeFor("fw_a");
    const mine = await createPrivateFramework(db, scope, pA1, {
      content: clean({ name: "A private mechanism" }),
      entitlement: "included",
    });
    // The UPDATE the trigger DOES refuse, first, so this case measures the
    // difference rather than a database that refuses nothing.
    expect(
      await refusalMessage(
        db.execute(sql`
          UPDATE frameworks
          SET visibility = 'shared', owner_profile_id = NULL, workspace_id = NULL
          WHERE id = ${mine.id}
        `)
      ),
      "the UPDATE half is not refused either — this case is measuring nothing"
    ).toMatch(/visibility, owner_profile_id and workspace_id are immutable/i);
    // The INSERT path cannot silently relabel private content as permanent
    // shared analysis either: copying its private rights basis is structurally
    // incompatible with shared visibility.
    expect(await refusalMessage(db.execute(
      sql.raw(
        `INSERT INTO frameworks (id, slug, name, beats, why_it_converts, applicability, source_references, evidence_entries, tested_caveats, confidence, saturation, visibility, rights_basis, curator_status)
         SELECT '11111111-1111-7111-8111-111111111111', slug || '-copy', name, beats, why_it_converts, applicability, source_references, evidence_entries, tested_caveats, confidence, saturation, 'shared', rights_basis, 'proposed'
         FROM frameworks WHERE id = '${mine.id}'`
      )
    ))).toMatch(/frameworks_rights_shape/i);
    expect(await db.select().from(frameworks).where(eq(frameworks.slug, `${mine.slug}-copy`))).toEqual([]);
  });

  it("R5c: WHICH tables carry ownership immutability, measured from pg_trigger", async () => {
    // THE CLASS QUESTION, ANSWERED AS AN INVENTORY RATHER THAN AS A CLAIM
    // (tenancy gate NOTE, 2026-09-02). Ownership immutability exists on
    // `generations.parent_id` (0022) and on `frameworks`' ownership triple
    // (0023) and on NOTHING ELSE: `UPDATE onboarding_inputs SET profile_id=…,
    // workspace_id=…` and `UPDATE creator_profiles SET workspace_id=…` are both
    // ACCEPTED by the database today. No application path issues either, and
    // that is the whole of what keeps them still.
    //
    // NOT CLOSED BY A BLANKET MIGRATION, and the reason is a counterexample
    // rather than a preference: `pseudonymiseWorkspaceSpend` in
    // `packages/db/src/spend-rollup.ts` RE-PARENTS `workspace_spend_monthly.
    // workspace_id` on purpose — it is R-54's deletion obligation — so a
    // trigger swept across every creator-data table would turn the deletion
    // executor into the outage CLAUDE.md's 2026-07-30 lesson is about. The
    // per-table decision belongs to whoever writes that executor.
    //
    // SO THE RESIDUAL IS MEASURED INSTEAD OF ASSERTED: this reads the live
    // catalogue, and adding or removing an ownership trigger anywhere turns it
    // RED. See R-79 in `docs/initial/decisions.md` for the owner and the
    // revisit trigger.
    const found = await db.execute(
      sql.raw(
        "SELECT c.relname AS table_name, t.tgname AS trigger_name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal ORDER BY 1, 2"
      )
    );
    const rows = (found.rows as { table_name: string; trigger_name: string }[])
      .filter((row) => row.trigger_name.endsWith("_immutable"));
    expect(
      rows.map((r) => `${r.table_name}.${r.trigger_name}`),
      "the set of immutability triggers changed — if a table gained one, record the decision in the registry and here; if one was LOST, that is a tenancy control removed"
    ).toEqual([
      "autopsies.autopsies_rights_immutable",
      "autopsy_cache_claims.autopsy_cache_claims_rights_immutable",
      "frameworks.frameworks_ownership_immutable",
      "frameworks.frameworks_rights_immutable",
      "generations.generations_parent_id_immutable",
      "stripe_events.stripe_events_receipt_attribution_immutable",
      "trend_transcripts.trend_transcripts_rights_immutable",
    ]);
    // ...and the table the NOTE names carries none, said explicitly rather than
    // left to be inferred from the absence of a line above.
    expect(rows.filter((r) => r.table_name === "onboarding_inputs")).toEqual([]);
    // ...and the residue itself, ATTEMPTED rather than described: re-parenting
    // a creator's own onboarding rows onto a SECOND profile is accepted by the
    // database. This is the measurement the NOTE rests on.
    await db.insert(onboardingInputs).values({
      profileId: pA1,
      workspaceId: wsA,
      inputClass: "own_post",
      content: "A post the creator wrote.",
      contentSha256: "a".repeat(64),
    });
    const moved = await db.execute(
      sql.raw(
        `UPDATE onboarding_inputs SET profile_id = '${pA2}' WHERE profile_id = '${pA1}' RETURNING id`
      )
    );
    expect(
      moved.rows.length,
      "the residue probe moved no rows — it is proving nothing, and the fixture is empty rather than the database strict"
    ).toBe(1);
  });
});
