import { eq, getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../src/schema";
import {
  autopsies,
  autopsyCacheClaims,
  creatorProfiles,
  frameworks,
  systemModelUsage,
  systemSpendDaily,
  trendItems,
  trendSources,
} from "../src/schema";
import { NOT_CREATOR_DATA } from "../src/creator-data-registry";
import {
  claimSystemSpend,
  createSystemAutopsyAttemptStore,
  reconcileSystemModelUsage,
  recordSystemModelUsage,
  recordSystemWorkerHealth,
  systemAutopsyQueueCandidates,
  recoverStaleSystemAutopsyAttempts,
  systemWorkerOperationalState,
} from "../src/system-spend";
import {
  claimPrivateAutopsyForSystem,
  claimSharedAutopsyForSystem,
  createPrivateSubmittedTrendSource,
  createTrendSource,
  recordPrivateTrendItem,
  recordPrivateTrendTranscript,
  recordSharedTrendItem,
  recordSharedTrendTranscript,
} from "../src/trends-storage";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser } from "../src/testing";
import { appendReferencePost } from "../src/onboarding-ops";
import { withWorkspace } from "../src/with-workspace";

const CANONICAL_ANALYSIS = {
  hookMechanic: "open on a visible tradeoff",
  beats: ["show the setup", "turn on the constraint"],
  ending: "return to the opening tradeoff",
  followTrigger: "name the next mechanism to test",
  subjectTerms: ["batch cooking", "weeknight meals"],
  hook: "The pan I stopped using on weeknights",
  structure: { beatCount: 2, turnBeat: 1 },
} as const;

function lowLevelClaim(
  jobAttemptId: string,
  businessDate: string,
  capMicroUsd: bigint,
  reserveMicroUsd: bigint,
  attribution: {
    jobId: string;
    trendItemId: string;
    model: string;
  } = {
    jobId: `job-${jobAttemptId}`,
    trendItemId: "00000000-0000-0000-0000-000000000099",
    model: "classification-model",
  },
) {
  return {
    jobAttemptId,
    businessDate,
    capMicroUsd,
    reserveMicroUsd,
    attribution: {
      ...attribution,
      autopsyCacheClaimId: "00000000-0000-0000-0000-000000000098",
      purpose: "trend_autopsy" as const,
    },
  };
}

async function pendingSystemAutopsyFixture(db: Awaited<ReturnType<typeof createTestDb>>, suffix: string) {
  const authUserId = `system_rights_${suffix}`;
  await seedAuthUser(db, authUserId);
  const { user: rightsSubject } = await ensureUserWorkspace(db, {
    authUserId,
    name: `Rights ${suffix}`,
  });
  const source = await createTrendSource(db, {
    kind: "youtube",
    externalId: `system-source-${suffix}`,
    sourceUrl: `https://example.test/${suffix}`,
  });
  const item = await recordSharedTrendItem(db, {
    sourceId: source.id,
    externalVideoId: `system-video-${suffix}`,
    niche: "business",
    title: "A bounded system autopsy",
    channelId: "channel",
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
  });
  const transcript = await recordSharedTrendTranscript(db, {
    trendItemId: item.id,
    content: `Rights-backed transcript for ${suffix}.`,
    rightsSubjectUserId: rightsSubject.id,
    provenance: {
      provider: "youtube_creator_owned_oauth",
      sourceReference: `https://www.youtube.com/watch?v=system-video-${suffix}`,
      sharedAnalysisRightsBasis: "creator_owned_caption_consent",
      consentEvidenceId: `consent-fixture-${suffix}`,
    },
  });
  const prepared = await claimSharedAutopsyForSystem(db, {
    trendItemId: item.id,
    contentDigest: transcript.contentDigest,
    analysisVersion: "v1",
  });
  const [cacheClaim] = await db.select().from(autopsyCacheClaims)
    .where(eq(autopsyCacheClaims.id, prepared.cacheClaimId)).limit(1);
  if (!cacheClaim) throw new Error("fixture did not create an autopsy cache claim");
  return { item, transcript, cacheClaim };
}

async function pendingPrivateSystemAutopsyFixture(
  db: Awaited<ReturnType<typeof createTestDb>>,
  suffix: string,
) {
  const authUserId = `private_autopsy_${suffix}`;
  await seedAuthUser(db, authUserId);
  const { workspace } = await ensureUserWorkspace(db, {
    authUserId,
    name: `Private ${suffix}`,
  });
  const scope = await withWorkspace(db, { authUserId });
  const [profile, otherProfile] = await db.insert(creatorProfiles).values([
    { workspaceId: workspace.id, displayName: `Private ${suffix}` },
    { workspaceId: workspace.id, displayName: `Other ${suffix}` },
  ]).returning();
  const source = await createPrivateSubmittedTrendSource(db, scope, profile.id, {
    externalId: `submitted-source-${suffix}`,
    sourceUrl: `https://example.test/submitted/${suffix}`,
  });
  const item = await recordPrivateTrendItem(db, scope, profile.id, {
    sourceId: source.id,
    externalVideoId: `submitted-item-${suffix}`,
    niche: "home cooking",
    title: "A creator-pasted private reference",
    channelId: "submitted-reference",
    videoViews: 200n,
    channelMedianRecentViews: "100.00000000",
    baselineSampleSize: 2,
    baselineObservationIds: ["private-baseline-a", "private-baseline-b"],
    baselineWindowStartsAt: new Date("2026-08-01T00:00:00Z"),
    baselineWindowEndsAt: new Date("2026-09-01T00:00:00Z"),
    sourcePublishedAt: new Date("2026-08-31T00:00:00Z"),
    transcriptState: "transcript_required",
    saturation: "unmeasured",
    saturationUnmeasuredReason: "incomplete_provenance",
  });
  // Slice 8c (R2): a private transcript IS a reference-class onboarding input,
  // so the fixture stores one first and binds the transcript to it.
  const reference = await appendReferencePost(
    db, scope, profile.id, `Creator-pasted private transcript for ${suffix}.`, `https://example.test/submitted/${suffix}`,
  );
  const transcript = await recordPrivateTrendTranscript(db, scope, profile.id, {
    trendItemId: item.id,
    content: reference.content,
    referenceInputId: reference.id,
    sourceUrl: `https://example.test/submitted/${suffix}`,
  });
  const prepared = await claimPrivateAutopsyForSystem(db, scope, profile.id, {
    trendItemId: item.id,
    contentDigest: transcript.contentDigest,
    analysisVersion: "v1",
  });
  const [cacheClaim] = await db.select().from(autopsyCacheClaims)
    .where(eq(autopsyCacheClaims.id, prepared.cacheClaimId)).limit(1);
  if (!cacheClaim) throw new Error("fixture did not create a private cache claim");
  return { scope, profile, otherProfile, item, transcript, cacheClaim };
}

describe("slice 8 system spend", () => {
  it("allows only a rights-checked transcript writer to mark an item available", async () => {
    const db = await createTestDb();
    await expect(recordSharedTrendItem(db, {
      sourceId: "00000000-0000-0000-0000-000000000001",
      externalVideoId: "availability-bypass",
      niche: "business",
      title: "Metadata alone has no transcript rights",
      channelId: "channel",
      videoViews: 200n,
      channelMedianRecentViews: "100.00000000",
      baselineSampleSize: 1,
      baselineObservationIds: ["baseline-a"],
      baselineWindowStartsAt: new Date("2026-08-01T00:00:00Z"),
      baselineWindowEndsAt: new Date("2026-09-01T00:00:00Z"),
      sourcePublishedAt: new Date("2026-08-31T00:00:00Z"),
      transcriptState: "transcript_available",
      saturation: "unmeasured",
      saturationUnmeasuredReason: "incomplete_provenance",
    } as never)).rejects.toThrow(/metadata cannot assert transcript availability/i);
  });

  it("refreshes one shared video idempotently without erasing transcript availability", async () => {
    const db = await createTestDb();
    const { item } = await pendingSystemAutopsyFixture(db, "refresh-idempotency");
    const refreshed = await recordSharedTrendItem(db, {
      sourceId: item.sourceId,
      externalVideoId: item.externalVideoId,
      niche: item.niche,
      title: "A refreshed bounded system autopsy",
      // Nullable at the column since 0026 (an `unavailable` baseline stores
      // NULL); this fixture's item is measured, so the value is present.
      channelId: item.channelId!,
      videoViews: 300n,
      channelMedianRecentViews: "100.00000000",
      baselineSampleSize: 2,
      baselineObservationIds: ["refresh-baseline-a", "refresh-baseline-b"],
      baselineWindowStartsAt: new Date("2026-08-02T00:00:00Z"),
      baselineWindowEndsAt: new Date("2026-09-02T00:00:00Z"),
      sourcePublishedAt: item.sourcePublishedAt,
      transcriptState: "transcript_required",
      saturation: "unmeasured",
      saturationUnmeasuredReason: "incomplete_provenance",
    });
    expect(refreshed.id).toBe(item.id);
    expect(refreshed.title).toBe("A refreshed bounded system autopsy");
    expect(refreshed.outlierRatio).toBe("3.00000000");
    expect(refreshed.transcriptState).toBe("transcript_available");
  });

  // R21's "no creator/workspace/profile id on any retained system table",
  // REWRITTEN 2026-09-03 after BOTH the billing and the tenancy gate measured
  // the old witness fail-open: `not.toEqual(arrayContaining([three names]))`
  // only reddened when all THREE columns were present at once, and a single
  // planted `workspaceId` stayed green. It also listed four tables by hand and
  // omitted `system_worker_health`, the fifth.
  //
  // THE IDENTITY NAMES, as a list, checked PER NAME and on BOTH the drizzle
  // property and the SQL column name — a column declared `owner: uuid(
  // "workspace_id")` is the same leak spelled differently.
  const IDENTITY_COLUMNS = [
    ["creatorId", "creator_id"],
    ["workspaceId", "workspace_id"],
    ["profileId", "profile_id"],
  ] as const;
  const identityColumnFindings = (table: PgTable): string[] => {
    const found: string[] = [];
    for (const [property, column] of Object.entries(getTableColumns(table))) {
      for (const [prop, sqlName] of IDENTITY_COLUMNS) {
        if (property === prop || column.name === sqlName) found.push(`${property}(${column.name})`);
      }
    }
    return found;
  };
  /**
   * THE POPULATION IS DERIVED FROM THE REGISTRY, then pinned as a list: every
   * `NOT_CREATOR_DATA` key that names a `system_*` table, resolved to its
   * drizzle object through the schema module's own exports. Adding a sixth
   * system table to the registry enters this check without an edit here; the
   * pinned list is what makes "five" a stated fact rather than an accident.
   */
  const SYSTEM_TABLES = [
    "system_model_usage",
    "system_spend_daily",
    "system_spend_claims",
    "system_worker_health",
    "system_model_usage_reconciliations",
  ];
  const registrySystemTables = () =>
    Object.keys(NOT_CREATOR_DATA).filter((name) => name.startsWith("system_"));
  const drizzleTableNamed = (name: string): PgTable => {
    const match = (Object.values(schema) as unknown[]).find(
      (value): value is PgTable => is(value, PgTable) && getTableName(value) === name,
    );
    if (!match) throw new Error(`no drizzle table exported from schema.ts is named ${name}`);
    return match;
  };

  it("R21: no creator/workspace/profile identity column on ANY retained system table (population = registry, per-name)", () => {
    expect([...registrySystemTables()].sort()).toEqual([...SYSTEM_TABLES].sort());
    for (const name of registrySystemTables()) {
      const table = drizzleTableNamed(name);
      // NON-VACUITY per table: it really has columns to scan.
      expect(Object.keys(getTableColumns(table)).length, name).toBeGreaterThan(2);
      expect(identityColumnFindings(table), `${name} carries a tenant identity column`).toEqual([]);
      for (const [prop, sqlName] of IDENTITY_COLUMNS) {
        expect(Object.keys(getTableColumns(table)), name).not.toContain(prop);
        expect(Object.values(getTableColumns(table)).map((c) => c.name), name).not.toContain(sqlName);
      }
    }
  });

  it("R21 NON-VACUITY: a SINGLE planted identity column is caught, by property name AND by SQL name", () => {
    // The exact shape both reviewers planted and the old witness missed.
    const oneProperty = pgTable("planted_system_a", {
      jobAttemptId: text("job_attempt_id"),
      workspaceId: uuid("workspace_id"),
    });
    expect(identityColumnFindings(oneProperty)).toEqual(["workspaceId(workspace_id)"]);
    // ...spelled as a differently-named property over the same SQL column.
    const renamed = pgTable("planted_system_b", {
      jobAttemptId: text("job_attempt_id"),
      owner: uuid("profile_id"),
    });
    expect(identityColumnFindings(renamed)).toEqual(["owner(profile_id)"]);
    // ...and a clean table reports nothing, so the empty result above means
    // "scanned and clean" rather than "matched nothing".
    const clean = pgTable("planted_system_c", { jobAttemptId: text("job_attempt_id"), model: text("model") });
    expect(identityColumnFindings(clean)).toEqual([]);
    // The registry lookup really resolves through schema.ts exports.
    expect(() => drizzleTableNamed("system_nonexistent")).toThrow(/no drizzle table/);
  });

  it("atomically refuses a zero emergency cap without a vendor reservation", async () => {
    const db = await createTestDb();
    await expect(claimSystemSpend(
      db,
      lowLevelClaim("disabled", "2026-09-01", 0n, 1n),
    )).resolves.toEqual({ status: "cap_exhausted" });
  });
  it("refuses a successful usage fact that skipped a fixed-order autopsy stage", async () => {
    const db = await createTestDb();
    await expect(recordSystemModelUsage(db, {
      jobAttemptId: "short-success",
      jobId: "short-job",
      trendItemId: "00000000-0000-0000-0000-000000000099",
      purpose: "trend_autopsy",
      model: "classification-model",
      tokensIn: 1,
      tokensOut: 1,
      costMicroUsd: 1n,
      costState: "measured",
      outcome: "succeeded",
      callCount: 3,
      unknownCallCount: 0,
      businessDate: "2026-09-02",
    })).rejects.toThrow(/every fixed-order stage/i);
  });
  it("refuses negative cost and non-zero no-call budget facts before persistence", async () => {
    const db = await createTestDb();
    const base = {
      jobAttemptId: "invalid-usage",
      jobId: "invalid-job",
      trendItemId: "00000000-0000-0000-0000-000000000099",
      purpose: "trend_autopsy" as const,
      model: "classification-model",
      tokensIn: 1,
      tokensOut: 1,
      costMicroUsd: -1n,
      costState: "measured" as const,
      outcome: "vendor_failed" as const,
      callCount: 1,
      unknownCallCount: 0,
      errorCode: "vendor_invalid_usage",
      businessDate: "2026-09-02",
    };
    await expect(recordSystemModelUsage(db, base)).rejects.toThrow(/cost must be null or nonnegative/i);
    await expect(recordSystemModelUsage(db, {
      ...base,
      tokensIn: 0,
      tokensOut: 0,
      costMicroUsd: 1n,
      outcome: "budget_exhausted",
      callCount: 0,
    })).rejects.toThrow(/zero usage and measured zero cost/i);
    await expect(recordSystemModelUsage(db, {
      ...base,
      costMicroUsd: 1n,
      errorCode: "the planted transcript must not become an operational code",
    })).rejects.toThrow(/content-safe token/i);
  });
  it("refuses a caller-supplied cap above the code ceiling", async () => {
    const db = await createTestDb();
    await expect(claimSystemSpend(
      db,
      lowLevelClaim("oversized", "2026-09-01", 999_999_999_999n, 100_000_001n),
    )).resolves.toEqual({ status: "cap_exhausted" });
  });
  it("atomically refuses beyond the captured cap and is idempotent by job attempt", async () => {
    const db = await createTestDb();
    const first = await claimSystemSpend(db, lowLevelClaim("job-1", "2026-09-02", 100n, 60n));
    expect(first).toEqual({ status: "claimed" });
    await expect(
      claimSystemSpend(db, lowLevelClaim("job-2", "2026-09-02", 100n, 50n))
    ).resolves.toEqual({ status: "cap_exhausted" });
    await expect(claimSystemSpend(
      db,
      lowLevelClaim("job-1", "2026-09-02", 999n, 60n),
    )).resolves.toEqual({ status: "duplicate" });
    await expect(claimSystemSpend(db, {
      ...lowLevelClaim("job-1", "2026-09-02", 999n, 60n),
      attribution: {
        ...lowLevelClaim("job-1", "2026-09-02", 999n, 60n).attribution,
        jobId: "different-job",
      },
    })).rejects.toThrow(/different work/i);
  });

  it("closes admission when a tighter cap falls below prior reservations and never reopens", async () => {
    const db = await createTestDb();
    await claimSystemSpend(db, lowLevelClaim("first", "2026-09-03", 100n, 60n));
    await expect(claimSystemSpend(
      db,
      lowLevelClaim("tight", "2026-09-03", 50n, 1n),
    )).resolves.toEqual({ status: "cap_exhausted" });
    // The retained cap cannot be rewritten below already-reserved spend, but
    // it closes admission at that irreversible amount. A later wider document
    // cannot restore the original headroom.
    await expect(claimSystemSpend(
      db,
      lowLevelClaim("loose", "2026-09-03", 100n, 1n),
    )).resolves.toEqual({ status: "cap_exhausted" });
    const [daily] = await db.select().from(systemSpendDaily).where(eq(systemSpendDaily.businessDate, "2026-09-03"));
    expect(daily.capMicroUsd).toBe(60n);
  });

  it("rolls usage into retained daily totals once and preserves unknown calls", async () => {
    const db = await createTestDb();
    await expect(recordSystemModelUsage(db, {
      jobAttemptId: "uncapped", jobId: "job-uncapped", trendItemId: "00000000-0000-0000-0000-000000000003",
      purpose: "trend_autopsy", model: "haiku", tokensIn: 1, tokensOut: 1,
      costMicroUsd: 1n, costState: "measured", outcome: "succeeded", callCount: 4, unknownCallCount: 0, businessDate: "2026-09-02",
    })).rejects.toThrow(/claim/i);
    for (const jobAttemptId of ["known", "unknown"]) {
      await claimSystemSpend(db, lowLevelClaim(
        jobAttemptId,
        "2026-09-02",
        100n,
        10n,
        {
          jobId: `job-${jobAttemptId}`,
          trendItemId: jobAttemptId === "known"
            ? "00000000-0000-0000-0000-000000000001"
            : "00000000-0000-0000-0000-000000000002",
          model: "haiku",
        },
      ));
    }
    await expect(recordSystemModelUsage(db, {
      jobAttemptId: "known", jobId: "different-job", trendItemId: "00000000-0000-0000-0000-000000000001",
      purpose: "trend_autopsy", model: "haiku", tokensIn: 4, tokensOut: 5,
      costMicroUsd: 7n, costState: "measured", outcome: "succeeded", callCount: 4, unknownCallCount: 0, businessDate: "2026-09-02",
    })).rejects.toThrow(/attribution does not match/i);
    expect(await recordSystemModelUsage(db, {
      jobAttemptId: "known", jobId: "job-known", trendItemId: "00000000-0000-0000-0000-000000000001",
      purpose: "trend_autopsy", model: "haiku", tokensIn: 4, tokensOut: 5,
      costMicroUsd: 7n, costState: "measured", outcome: "succeeded", callCount: 4, unknownCallCount: 0, businessDate: "2026-09-02",
    })).toEqual({ inserted: true });
    await expect(recordSystemModelUsage(db, {
      jobAttemptId: "known", jobId: "job-known", trendItemId: "00000000-0000-0000-0000-000000000001",
      purpose: "trend_autopsy", model: "haiku", tokensIn: 4, tokensOut: 5,
      costMicroUsd: 7n, costState: "measured", outcome: "succeeded", callCount: 4, unknownCallCount: 0, businessDate: "2026-09-02",
    })).resolves.toEqual({ inserted: false });
    await expect(recordSystemModelUsage(db, {
      jobAttemptId: "known", jobId: "job-known", trendItemId: "00000000-0000-0000-0000-000000000001",
      purpose: "trend_autopsy", model: "haiku", tokensIn: 4, tokensOut: 5,
      costMicroUsd: 8n, costState: "measured", outcome: "succeeded", callCount: 4, unknownCallCount: 0, businessDate: "2026-09-02",
    })).rejects.toThrow(/different fact/i);
    await recordSystemModelUsage(db, {
      jobAttemptId: "unknown", jobId: "job-unknown", trendItemId: "00000000-0000-0000-0000-000000000002",
      purpose: "trend_autopsy", model: "haiku", tokensIn: null, tokensOut: null,
      costMicroUsd: null, costState: "unknown", outcome: "vendor_failed", callCount: 1, unknownCallCount: 1,
      errorCode: "vendor_usage_unknown", businessDate: "2026-09-02",
    });
    const [daily] = await db.select().from(systemSpendDaily).where(eq(systemSpendDaily.businessDate, "2026-09-02"));
    expect(daily).toMatchObject({ knownCostMicroUsd: 7n, callCount: 5, unknownCallCount: 1 });
  });

  it("reconciles an unknown usage through one append-only adjustment", async () => {
    const db = await createTestDb();
    await claimSystemSpend(db, lowLevelClaim(
      "reconcile",
      "2026-09-04",
      100n,
      10n,
      {
        jobId: "job-reconcile",
        trendItemId: "00000000-0000-0000-0000-000000000004",
        model: "haiku",
      },
    ));
    await recordSystemModelUsage(db, {
      jobAttemptId: "reconcile", jobId: "job-reconcile", trendItemId: "00000000-0000-0000-0000-000000000004",
      purpose: "trend_autopsy", model: "haiku", tokensIn: 1, tokensOut: 1, costMicroUsd: null,
      costState: "unknown", outcome: "vendor_failed", callCount: 1, unknownCallCount: 1,
      errorCode: "vendor_usage_unknown", businessDate: "2026-09-04",
    });
    await expect(reconcileSystemModelUsage(db, {
      jobAttemptId: "reconcile", businessDate: "2026-09-04", actualCostMicroUsd: 7n,
    })).resolves.toEqual({ inserted: true });
    await expect(reconcileSystemModelUsage(db, {
      jobAttemptId: "reconcile", businessDate: "2026-09-04", actualCostMicroUsd: 7n,
    })).resolves.toEqual({ inserted: false });
    const [daily] = await db.select().from(systemSpendDaily).where(eq(systemSpendDaily.businessDate, "2026-09-04"));
    expect(daily).toMatchObject({ knownCostMicroUsd: 7n, callCount: 1, unknownCallCount: 0 });
    await expect(reconcileSystemModelUsage(db, {
      jobAttemptId: "reconcile", businessDate: "2026-09-04", actualCostMicroUsd: 11n,
    })).rejects.toThrow(/different actual cost/i);
  });

  it("retains stale trend rows and makes shared autopsy cache identity unique", async () => {
    const db = await createTestDb();
    const [source] = await db.insert(trendSources).values({ kind: "youtube", externalId: "source", sourceUrl: "https://example.test" }).returning();
    const [item] = await db.insert(trendItems).values({
      sourceId: source.id, externalVideoId: "video", niche: "business", title: "title", channelId: "channel",
      videoViews: 200n, channelMedianRecentViews: "100.00000000", baselineSampleSize: 2, baselineObservationIds: ["a", "b"], baselineWindowStartsAt: new Date("2026-08-01"), baselineWindowEndsAt: new Date("2026-09-01"), sourcePublishedAt: new Date("2026-08-31"),
      outlierRatio: "2.00000000", rightsScope: "shared_analysis", transcriptState: "transcript_available",
      saturation: "unmeasured", saturationUnmeasuredReason: "incomplete_provenance", staleAt: new Date(),
    }).returning();
    expect((await db.select().from(trendItems).where(eq(trendItems.id, item.id))).length).toBe(1);
    const [autopsy] = await db.insert(autopsies).values({ trendItemId: item.id, contentDigest: "digest", analysisVersion: "v1", rightsScope: "shared_analysis", rightsBasis: "independently_licensed", rightsEvidenceId: "test-license:system-spend", status: "completed", analysis: {} }).returning();
    const { autopsyCacheClaims } = await import("../src/schema");
    await db.insert(autopsyCacheClaims).values({ trendItemId: item.id, contentDigest: "digest", analysisVersion: "v1", rightsScope: "shared_analysis", rightsBasis: "independently_licensed", rightsEvidenceId: "test-license:system-spend", cacheScopeKey: "shared", status: "completed", autopsyId: autopsy.id });
    await expect(db.insert(autopsyCacheClaims).values({ trendItemId: item.id, contentDigest: "digest", analysisVersion: "v1", rightsScope: "shared_analysis", rightsBasis: "independently_licensed", rightsEvidenceId: "test-license:system-spend", cacheScopeKey: "shared", status: "pending" })).rejects.toThrow();
  });
});

describe("slice 8 worker/DB system-autopsy adapter", () => {
  const startInput = (itemId: string, cacheClaimId: string, attemptId: string, cap = 100) => ({
    jobId: "refresh-job-1",
    itemId,
    attemptId,
    autopsyCacheClaimId: cacheClaimId,
    purpose: "trend_autopsy" as const,
    businessDate: "2026-09-02",
    modelCode: "classification-model",
    reserveCostMicroUsd: 10,
    dailyCapMicroUsd: cap,
  });

  it("V12: deleting the profile behind a private-claim attempt leaves the usage row and the daily totals intact", async () => {
    // Phase-8 card verification 12 was ticked with no test deleting a profile
    // and re-reading `system_spend_daily` (billing gate CHANGE 1, 2026-09-03);
    // the property rested on "no FK to a tenant row", a structural claim
    // proven by argument. This is the run.
    const db = await createTestDb();
    const { profile, item, cacheClaim } = await pendingPrivateSystemAutopsyFixture(db, "v12-delete");
    const store = createSystemAutopsyAttemptStore(db);
    const start = startInput(item.id, cacheClaim.id, "v12-delete-attempt");
    await expect(store.startAttempt(start)).resolves.toMatchObject({ status: "granted" });
    await expect(store.finalizeAttempt({
      record: {
        jobId: start.jobId,
        itemId: item.id,
        attemptId: start.attemptId,
        purpose: "trend_autopsy",
        modelCode: start.modelCode,
        businessDate: start.businessDate,
        outcome: "succeeded",
        inputTokens: 120,
        outputTokens: 40,
        costMicroUsd: 7,
        reservedCostMicroUsd: 10,
        reservationOverrunMicroUsd: 0,
        costState: "measured",
        callCount: 4,
        unknownCallCount: 0,
      },
      autopsy: { cacheClaimId: cacheClaim.id, analysis: CANONICAL_ANALYSIS },
    })).resolves.toBe("recorded");
    const [usageBefore] = await db.select().from(systemModelUsage)
      .where(eq(systemModelUsage.jobAttemptId, start.attemptId));
    const [dailyBefore] = await db.select().from(systemSpendDaily)
      .where(eq(systemSpendDaily.businessDate, start.businessDate));
    expect(usageBefore).toMatchObject({ outcome: "succeeded", costMicroUsd: 7n });
    expect(dailyBefore).toBeDefined();

    // THE TENANT DETAIL GOES: the profile, and with it (cascade) the private
    // item, transcript, claim and autopsy.
    await db.delete(creatorProfiles).where(eq(creatorProfiles.id, profile.id));
    expect(await db.select().from(autopsies).where(eq(autopsies.trendItemId, item.id))).toHaveLength(0);
    expect(await db.select().from(trendItems).where(eq(trendItems.id, item.id))).toHaveLength(0);

    // ...and the product-overhead facts do not.
    const [usageAfter] = await db.select().from(systemModelUsage)
      .where(eq(systemModelUsage.jobAttemptId, start.attemptId));
    const [dailyAfter] = await db.select().from(systemSpendDaily)
      .where(eq(systemSpendDaily.businessDate, start.businessDate));
    expect(usageAfter).toEqual(usageBefore);
    expect(dailyAfter).toEqual(dailyBefore);
    expect(usageAfter).not.toHaveProperty("profileId");
    expect(usageAfter).not.toHaveProperty("workspaceId");
  });

  it("parks an in-flight private claim at tombstone and records unavoidable usage without resurrecting an autopsy", async () => {
    const db = await createTestDb();
    const { profile, item, cacheClaim } = await pendingPrivateSystemAutopsyFixture(
      db,
      "tombstone-race",
    );
    const store = createSystemAutopsyAttemptStore(db);
    const start = startInput(item.id, cacheClaim.id, "tombstone-race-attempt");
    await expect(store.startAttempt(start)).resolves.toMatchObject({ status: "granted" });

    await db.transaction(async (tx) => {
      await tx.update(creatorProfiles).set({
        state: "deletion_tombstoned",
        lifecycleVersion: sql`${creatorProfiles.lifecycleVersion} + 1`,
      }).where(eq(creatorProfiles.id, profile.id));
      await tx.update(autopsyCacheClaims).set({
        status: "parked",
        activeSystemAttemptId: null,
        leaseExpiresAt: null,
        lastFailureCode: "profile_tombstoned",
      }).where(eq(autopsyCacheClaims.id, cacheClaim.id));
    });

    await expect(store.finalizeAttempt({
      record: {
        jobId: start.jobId,
        itemId: item.id,
        attemptId: start.attemptId,
        purpose: "trend_autopsy",
        modelCode: start.modelCode,
        businessDate: start.businessDate,
        outcome: "succeeded",
        inputTokens: 120,
        outputTokens: 40,
        costMicroUsd: 7,
        reservedCostMicroUsd: 10,
        reservationOverrunMicroUsd: 0,
        costState: "measured",
        callCount: 4,
        unknownCallCount: 0,
      },
      autopsy: { cacheClaimId: cacheClaim.id, analysis: CANONICAL_ANALYSIS },
    })).resolves.toBe("recorded");

    expect(await db.select().from(autopsies).where(eq(autopsies.trendItemId, item.id)))
      .toHaveLength(0);
    expect(
      await db.select().from(systemModelUsage)
        .where(eq(systemModelUsage.jobAttemptId, start.attemptId)),
    ).toEqual([expect.objectContaining({ outcome: "succeeded", costMicroUsd: 7n })]);
    expect(
      await db.select().from(autopsyCacheClaims)
        .where(eq(autopsyCacheClaims.id, cacheClaim.id)),
    ).toEqual([expect.objectContaining({
      status: "parked",
      activeSystemAttemptId: null,
      lastFailureCode: "profile_tombstoned",
      autopsyId: null,
    })]);
    await expect(
      store.startAttempt(startInput(item.id, cacheClaim.id, "post-tombstone-attempt")),
    ).rejects.toThrow("system autopsy cache claim owner is tombstoned");
  });

  it("lists only content-free dispatch candidates and aggregate operational state", async () => {
    const db = await createTestDb();
    const { item, cacheClaim } = await pendingSystemAutopsyFixture(db, "dispatch-source");
    await expect(systemAutopsyQueueCandidates(db)).resolves.toEqual([{
      cacheClaimId: cacheClaim.id,
      itemId: item.id,
      attemptNumber: 1,
    }]);
    expect(Object.keys((await systemAutopsyQueueCandidates(db))[0])).toEqual([
      "cacheClaimId",
      "itemId",
      "attemptNumber",
    ]);

    const store = createSystemAutopsyAttemptStore(db);
    const start = startInput(item.id, cacheClaim.id, "dispatch-active-attempt");
    await store.startAttempt(start);
    await expect(systemAutopsyQueueCandidates(db)).resolves.toEqual([]);
    await recordSystemWorkerHealth(db, {
      workerName: "worker-test",
      lastHeartbeatAt: new Date("2026-09-02T12:00:00Z"),
      lastSuccessfulScheduleAt: new Date("2026-09-02T11:59:00Z"),
      lastSuccessfulRunAt: new Date("2026-09-02T11:58:00Z"),
      scheduleLagSeconds: 0,
      activeCount: 1,
      parkedCount: 0,
      deadLetterCount: 0,
      poolInUse: 1,
      poolCapacity: 2,
      budgetExhausted: false,
    });
    await expect(systemWorkerOperationalState(db, "worker-test", "2026-09-02"))
      .resolves.toMatchObject({
        parkedJobs: 0,
        budgetSpentMicroUsd: 10,
        budgetCapMicroUsd: 100,
        lastSuccessfulScheduleAt: new Date("2026-09-02T11:59:00Z"),
        lastSuccessfulRunAt: new Date("2026-09-02T11:58:00Z"),
      });
  });

  it("recovers an expired worker lease without refunding or losing unknown spend", async () => {
    const db = await createTestDb();
    const { item, cacheClaim } = await pendingSystemAutopsyFixture(db, "expired-lease");
    const store = createSystemAutopsyAttemptStore(db);
    const first = startInput(item.id, cacheClaim.id, "expired-attempt-1");
    await expect(store.startAttempt(first)).resolves.toMatchObject({ status: "granted" });
    await db.update(autopsyCacheClaims).set({
      leaseExpiresAt: new Date("2026-09-03T01:59:00.000Z"),
    }).where(eq(autopsyCacheClaims.id, cacheClaim.id));

    await expect(recoverStaleSystemAutopsyAttempts(
      db,
      new Date("2026-09-03T02:00:00.000Z"),
    )).resolves.toEqual({ recovered: 1 });
    await expect(recoverStaleSystemAutopsyAttempts(
      db,
      new Date("2026-09-03T02:00:00.000Z"),
    )).resolves.toEqual({ recovered: 0 });

    const [usage] = await db.select().from(systemModelUsage)
      .where(eq(systemModelUsage.jobAttemptId, first.attemptId));
    const [cacheAfter] = await db.select().from(autopsyCacheClaims)
      .where(eq(autopsyCacheClaims.id, cacheClaim.id));
    const [daily] = await db.select().from(systemSpendDaily)
      .where(eq(systemSpendDaily.businessDate, first.businessDate));
    expect(usage).toMatchObject({
      outcome: "vendor_failed",
      costState: "unknown",
      costMicroUsd: null,
      reservedCostMicroUsd: 10n,
      callCount: 4,
      unknownCallCount: 4,
      errorCode: "worker_lease_expired",
    });
    expect(daily).toMatchObject({ reservedMicroUsd: 10n, unknownCallCount: 4 });
    expect(cacheAfter).toMatchObject({
      status: "failed",
      activeSystemAttemptId: null,
      leaseExpiresAt: null,
      attemptCount: 1,
      lastFailureCode: "worker_lease_expired",
    });
    await expect(systemAutopsyQueueCandidates(db)).resolves.toEqual([{
      cacheClaimId: cacheClaim.id,
      itemId: item.id,
      attemptNumber: 1,
    }]);
    await expect(store.startAttempt(startInput(
      item.id,
      cacheClaim.id,
      "expired-attempt-2",
    ))).resolves.toMatchObject({ status: "granted" });
  });

  it("derives the cache digest from stored bytes and refuses creator-paste as shared rights", async () => {
    const db = await createTestDb();
    const { item, transcript } = await pendingSystemAutopsyFixture(db, "rights");
    expect(transcript.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    await expect(recordSharedTrendTranscript(db, {
      trendItemId: item.id,
      content: "A second transcript that must remain private.",
      rightsSubjectUserId: transcript.rightsSubjectUserId!,
      provenance: {
        provider: "creator-paste",
        sourceReference: "https://www.youtube.com/watch?v=system-video-rights",
        sharedAnalysisRightsBasis: "creator-assertion",
        consentEvidenceId: "none",
      } as never,
    })).rejects.toThrow("creator-owned caption consent");
  });

  it("processes an opaque profile-private claim without putting its owner on system usage", async () => {
    const db = await createTestDb();
    const { scope, profile, otherProfile, item, transcript, cacheClaim } =
      await pendingPrivateSystemAutopsyFixture(db, "private-success");
    await expect(claimPrivateAutopsyForSystem(db, scope, otherProfile.id, {
      trendItemId: item.id,
      contentDigest: transcript.contentDigest,
      analysisVersion: "v1",
    })).rejects.toThrow(/this profile's private transcript-ready item/i);

    const store = createSystemAutopsyAttemptStore(db);
    const start = startInput(item.id, cacheClaim.id, "private-success-attempt");
    await expect(store.startAttempt(start)).resolves.toMatchObject({
      status: "granted",
      transcript: expect.stringContaining("Creator-pasted private transcript"),
      // R-99 (round 2, CHANGE B): the grant tells the worker which preflight
      // this attempt is in. It is the SAME `proposesSharedFramework(cacheClaim)`
      // the finalize below applies, so this `false` and the empty `frameworks`
      // table at the end of this test are one decision witnessed twice — the
      // worker can no longer enforce library candidacy on a claim the gate
      // exempts. Deleting the derived field's call site makes this red.
      proposesSharedFramework: false,
    });
    await expect(store.finalizeAttempt({
      record: {
        jobId: start.jobId,
        itemId: item.id,
        attemptId: start.attemptId,
        purpose: "trend_autopsy",
        modelCode: start.modelCode,
        businessDate: start.businessDate,
        outcome: "succeeded",
        inputTokens: 120,
        outputTokens: 40,
        costMicroUsd: 7,
        reservedCostMicroUsd: 10,
        reservationOverrunMicroUsd: 0,
        costState: "measured",
        callCount: 4,
        unknownCallCount: 0,
      },
      autopsy: { cacheClaimId: cacheClaim.id, analysis: CANONICAL_ANALYSIS },
    })).resolves.toBe("recorded");

    const [cacheAfter] = await db.select().from(autopsyCacheClaims)
      .where(eq(autopsyCacheClaims.id, cacheClaim.id));
    const [autopsy] = await db.select().from(autopsies)
      .where(eq(autopsies.id, cacheAfter.autopsyId!));
    const [usage] = await db.select().from(systemModelUsage)
      .where(eq(systemModelUsage.jobAttemptId, start.attemptId));
    expect(autopsy).toMatchObject({
      rightsScope: "profile_private",
      profileId: profile.id,
      workspaceId: scope.workspaceId,
    });
    expect(usage).not.toHaveProperty("profileId");
    expect(usage).not.toHaveProperty("workspaceId");
    // R-99: THE FALSE BRANCH OF THE GATE, counted rather than assumed. A
    // creator-initiated private autopsy proposes NOTHING into the shared
    // framework library — the shared test one screen down counts exactly one
    // row for the identical `CANONICAL_ANALYSIS`, so this zero is the
    // rightsScope condition and nothing else. Deleting the condition at
    // `system-spend.ts` makes this line red (mutation run, fix round 1).
    expect(await db.select().from(frameworks)).toEqual([]);
    expect(autopsy.matchedFrameworkId).toBeNull();
  });

  it("durably finalizes a cap refusal with zero calls and leaves the cache retryable", async () => {
    const db = await createTestDb();
    const { item, cacheClaim } = await pendingSystemAutopsyFixture(db, "cap");
    const store = createSystemAutopsyAttemptStore(db);
    const start = startInput(item.id, cacheClaim.id, "cap-attempt", 0);

    await expect(store.startAttempt(start)).resolves.toMatchObject({
      status: "budget_exhausted",
      reservedCostMicroUsd: 0,
    });
    await expect(store.finalizeAttempt({ record: {
      jobId: start.jobId,
      itemId: item.id,
      attemptId: start.attemptId,
      purpose: "trend_autopsy",
      modelCode: start.modelCode,
      businessDate: start.businessDate,
      outcome: "budget_exhausted",
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      reservedCostMicroUsd: 0,
      reservationOverrunMicroUsd: 0,
      costState: "measured",
      callCount: 0,
      unknownCallCount: 0,
      errorCode: "system_budget_exhausted",
    } })).resolves.toBe("recorded");

    const [daily] = await db.select().from(systemSpendDaily).where(eq(systemSpendDaily.businessDate, start.businessDate));
    const [usage] = await db.select().from(systemModelUsage).where(eq(systemModelUsage.jobAttemptId, start.attemptId));
    const [cacheAfter] = await db.select().from(autopsyCacheClaims).where(eq(autopsyCacheClaims.id, cacheClaim.id));
    expect(daily).toMatchObject({ callCount: 0, unknownCallCount: 0, knownCostMicroUsd: 0n });
    expect(usage).toMatchObject({ outcome: "budget_exhausted", callCount: 0, reservedCostMicroUsd: 0n });
    expect(cacheAfter).toMatchObject({ status: "pending", activeSystemAttemptId: null, attemptCount: 1 });
    await expect(store.startAttempt(start)).resolves.toMatchObject({ status: "already_finalized" });
  });

  it("atomically records usage and completes the canonical cache artefact", async () => {
    const db = await createTestDb();
    const { item, cacheClaim } = await pendingSystemAutopsyFixture(db, "success");
    const store = createSystemAutopsyAttemptStore(db);
    const start = startInput(item.id, cacheClaim.id, "success-attempt");

    await expect(store.startAttempt(start)).resolves.toMatchObject({
      status: "granted",
      reservedCostMicroUsd: 10,
      // R-99: the SHARED half of the pair above — and this test goes on to
      // count the one proposed framework row that answer implies.
      proposesSharedFramework: true,
    });
    await expect(store.finalizeAttempt({
      record: {
        jobId: start.jobId,
        itemId: item.id,
        attemptId: start.attemptId,
        purpose: "trend_autopsy",
        modelCode: start.modelCode,
        businessDate: start.businessDate,
        outcome: "succeeded",
        inputTokens: 120,
        outputTokens: 40,
        costMicroUsd: 7,
        reservedCostMicroUsd: 10,
        reservationOverrunMicroUsd: 0,
        costState: "measured",
        callCount: 4,
        unknownCallCount: 0,
      },
      autopsy: { cacheClaimId: cacheClaim.id, analysis: CANONICAL_ANALYSIS },
    })).resolves.toBe("recorded");

    const [cacheAfter] = await db.select().from(autopsyCacheClaims).where(eq(autopsyCacheClaims.id, cacheClaim.id));
    const [usage] = await db.select().from(systemModelUsage).where(eq(systemModelUsage.jobAttemptId, start.attemptId));
    const [autopsy] = await db.select().from(autopsies).where(eq(autopsies.id, cacheAfter.autopsyId!));
    const proposed = await db.select().from(frameworks);
    const rights = {
      rightsBasis: "creator_consent",
      rightsSubjectUserId: cacheClaim.rightsSubjectUserId,
      rightsEvidenceId: cacheClaim.rightsEvidenceId,
    };
    expect(cacheAfter).toMatchObject({ status: "completed", activeSystemAttemptId: null, ...rights });
    expect(autopsy.analysis).toEqual(CANONICAL_ANALYSIS);
    expect(autopsy).toMatchObject(rights);
    expect(autopsy.matchedFrameworkId).toBeNull();
    expect(proposed).toHaveLength(1);
    expect(proposed[0]).toMatchObject({
      visibility: "shared",
      curatorStatus: "proposed",
      version: 1,
      ...rights,
    });
    expect(usage).toMatchObject({ outcome: "succeeded", callCount: 4, costMicroUsd: 7n });
    await expect(store.startAttempt(start)).resolves.toMatchObject({ status: "already_finalized" });
    await expect(store.startAttempt({
      ...start,
      itemId: "00000000-0000-0000-0000-000000000099",
    })).rejects.toThrow(/different system work/i);
    await expect(store.startAttempt({
      ...start,
      reserveCostMicroUsd: 11,
    })).rejects.toThrow(/different system work/i);
    await expect(store.startAttempt({
      ...start,
      autopsyCacheClaimId: "00000000-0000-0000-0000-000000000099",
    })).rejects.toThrow(/different system work/i);
    await db.delete(schema.users).where(eq(schema.users.id, cacheClaim.rightsSubjectUserId!));
    expect(await db.select().from(schema.trendTranscripts)).toHaveLength(0);
    expect(await db.select().from(autopsyCacheClaims)).toHaveLength(0);
    expect(await db.select().from(autopsies)).toHaveLength(0);
    expect(await db.select().from(frameworks)).toHaveLength(0);
  });

  it("serializes one active paid attempt and increments the shared retry authority after failure", async () => {
    const db = await createTestDb();
    const { item, cacheClaim } = await pendingSystemAutopsyFixture(db, "retry");
    const store = createSystemAutopsyAttemptStore(db);
    const first = startInput(item.id, cacheClaim.id, "retry-attempt-1");
    const racing = startInput(item.id, cacheClaim.id, "retry-attempt-racing");
    const second = startInput(item.id, cacheClaim.id, "retry-attempt-2");

    await expect(store.startAttempt(first)).resolves.toMatchObject({ status: "granted" });
    await expect(store.startAttempt(racing)).resolves.toEqual({ status: "already_in_flight" });
    await expect(store.finalizeAttempt({ record: {
      jobId: first.jobId,
      itemId: item.id,
      attemptId: first.attemptId,
      purpose: "trend_autopsy",
      modelCode: first.modelCode,
      businessDate: first.businessDate,
      outcome: "vendor_failed",
      inputTokens: null,
      outputTokens: null,
      costMicroUsd: null,
      reservedCostMicroUsd: 10,
      reservationOverrunMicroUsd: null,
      costState: "unknown",
      callCount: 1,
      unknownCallCount: 1,
      errorCode: "vendor_unhandled_error",
    } })).resolves.toBe("recorded");

    await expect(store.startAttempt(second)).resolves.toMatchObject({ status: "granted" });
    const [cacheAfter] = await db.select().from(autopsyCacheClaims).where(eq(autopsyCacheClaims.id, cacheClaim.id));
    expect(cacheAfter).toMatchObject({
      status: "pending",
      activeSystemAttemptId: second.attemptId,
      attemptCount: 2,
    });
  });
});
