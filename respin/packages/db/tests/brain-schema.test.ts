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
import { creditLedger, pausePeriods, subscriptions } from "../src/billing-schema";
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
  creativePieces,
  generationAttempts,
  generationFeedback,
  generations,
} from "../src/generation-schema";
import {
  promotionProposals,
  proposalEvidenceFeedback,
  proposalEvidenceResults,
} from "../src/promotion-schema";
import { results } from "../src/results-schema";
import { LIFECYCLE_REGISTRY } from "../src/creator-data-registry";
import {
  autopsies,
  autopsyCacheClaims,
  trackedNiches,
  trendItems,
  trendSources,
  trendTranscripts,
} from "../src/trends-schema";

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
        rightsBasis: "independently_licensed",
        rightsEvidenceId: "test-license:brain-schema",
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
        rightsBasis: "profile_private",
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
        rightsBasis: "profile_private",
        ownerProfileId: profileA,
        workspaceId: null,
      })
    ).rejects.toThrow();
    // NON-VACUITY: both legitimate shapes land.
    await expect(
      db
        .insert(frameworks)
        .values({
          ...base,
          slug: "ok-shared",
          visibility: "shared",
          rightsBasis: "independently_licensed",
          rightsEvidenceId: "test-license:brain-schema",
        })
    ).resolves.toBeDefined();
    await expect(
      db.insert(frameworks).values({
        ...base,
        slug: "ok-private",
        visibility: "private",
        rightsBasis: "profile_private",
        ownerProfileId: profileA,
        workspaceId: wsA,
      })
    ).resolves.toBeDefined();
  });

  it("shared rights evidence NULL is refused for consent and licences on every rights-bearing table", async () => {
    const [source] = await db.insert(trendSources).values({
      kind: "youtube",
      externalId: "rights-null-source",
      sourceUrl: "https://example.test/rights-null-source",
    }).returning();
    const [item] = await db.insert(trendItems).values({
      sourceId: source.id,
      externalVideoId: "rights-null-video",
      niche: "rights",
      title: "Rights evidence NULL",
      channelId: "rights-channel",
      videoViews: 200n,
      channelMedianRecentViews: "100",
      baselineSampleSize: 1,
      baselineObservationIds: ["rights-null-baseline"],
      baselineWindowStartsAt: new Date("2026-01-01T00:00:00.000Z"),
      baselineWindowEndsAt: new Date("2026-01-31T00:00:00.000Z"),
      sourcePublishedAt: new Date("2026-01-15T00:00:00.000Z"),
      outlierRatio: "2",
      rightsScope: "shared_analysis",
      transcriptState: "transcript_available",
      saturation: "unmeasured",
      saturationUnmeasuredReason: "incomplete_provenance",
    }).returning();

    for (const rights of [
      { basis: "creator_consent" as const, subjectUserId: userA },
      { basis: "independently_licensed" as const, subjectUserId: null },
    ]) {
      const suffix = rights.basis;
      await expect(db.insert(trendTranscripts).values({
        trendItemId: item.id,
        rightsScope: "shared_analysis",
        rightsBasis: rights.basis,
        rightsSubjectUserId: rights.subjectUserId,
        rightsEvidenceId: null,
        content: `Transcript ${suffix}`,
        contentDigest: `transcript-${suffix}`,
        provenance: {},
      }), `trend_transcripts ${suffix}`).rejects.toThrow();
      await expect(db.insert(autopsyCacheClaims).values({
        trendItemId: item.id,
        contentDigest: `claim-${suffix}`,
        analysisVersion: "rights-null-v1",
        rightsScope: "shared_analysis",
        rightsBasis: rights.basis,
        rightsSubjectUserId: rights.subjectUserId,
        rightsEvidenceId: null,
        cacheScopeKey: "shared",
        status: "pending",
      }), `autopsy_cache_claims ${suffix}`).rejects.toThrow();
      await expect(db.insert(autopsies).values({
        trendItemId: item.id,
        contentDigest: `autopsy-${suffix}`,
        analysisVersion: "rights-null-v1",
        rightsScope: "shared_analysis",
        rightsBasis: rights.basis,
        rightsSubjectUserId: rights.subjectUserId,
        rightsEvidenceId: null,
        status: "completed",
        analysis: {},
      }), `autopsies ${suffix}`).rejects.toThrow();
      await expect(db.insert(frameworks).values({
        slug: `rights-null-${suffix}`,
        name: `Rights NULL ${suffix}`,
        beats: [],
        whyItConverts: "Fixture",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "unsupported",
        saturation: "observed",
        visibility: "shared",
        rightsBasis: rights.basis,
        rightsSubjectUserId: rights.subjectUserId,
        rightsEvidenceId: null,
      }), `frameworks ${suffix}`).rejects.toThrow();
    }
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
    const TREND_SOURCE_ID = "01a00000-0000-7000-8000-00000000ce01";
    const TREND_ITEM_ID = "01a00000-0000-7000-8000-00000000ce02";
    const AUTOPSY_ID = "01a00000-0000-7000-8000-00000000ce03";
    // Slice 9a: a FIXED id for the brain document, for the same reason
    // `GENERATION_ID` is fixed — `results.metric_declared_by_doc_id` carries a
    // three-column FK to it, so the results row has to be able to NAME it in
    // this declarative map rather than read back what an earlier insert made.
    // The id is added HERE and not to `children()`'s shared row, because that
    // row is inserted by several other cases in this file and a fixed primary
    // key shared between them would collide.
    const BRAIN_DOC_ID = "01a00000-0000-7000-8000-00000000ce04";
    const FEEDBACK_ID = "01a00000-0000-7000-8000-00000000ce05";
    const RESULT_ID = "01a00000-0000-7000-8000-00000000ce06";
    const RESULT_PROPOSAL_ID = "01a00000-0000-7000-8000-00000000ce07";
    const FEEDBACK_PROPOSAL_ID = "01a00000-0000-7000-8000-00000000ce08";
    const CONTENT_DIGEST = "b".repeat(64);
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
        row: { ...(shared.brain_docs.row as object), id: BRAIN_DOC_ID },
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
          id: FEEDBACK_ID,
          profileId: profileA,
          workspaceId: wsA,
          generationId: GENERATION_ID,
          reaction: "used_as_is",
        },
      },
      // Launch L2 (R-151). ORDERED AFTER `generations`: the piece's source
      // names that row through a same-tenant composite FK, and the cascade it
      // witnesses is the registry's — a chosen concept leaves with the profile.
      {
        table: "creative_pieces",
        drizzle: creativePieces,
        row: {
          profileId: profileA,
          workspaceId: wsA,
          sourceGenerationId: GENERATION_ID,
          sourceIdeaIndex: 0,
          quoteConfigVersion: 1,
        },
      },
      // Slice 9a (R5). ORDERED AFTER `generations` AND `brain_docs`, because
      // its THREE composite FKs name both — the third entry in this set with a
      // parent inside it, and the first with two. The cascade it witnesses is
      // the registry's: a logged result leaves with the profile, and REQ-A04
      // deletion is only POSSIBLE if it does.
      {
        table: "results",
        drizzle: results,
        row: {
          id: RESULT_ID,
          profileId: profileA,
          workspaceId: wsA,
          generationId: GENERATION_ID,
          platform: "shorts",
          audienceClass: "organic",
          metricKey: "followers",
          metricDeclaredByDocId: BRAIN_DOC_ID,
          observedFrom: new Date("2026-08-01T00:00:00Z"),
          observedTo: new Date("2026-08-08T00:00:00Z"),
          treatmentKey: "|hook_set|cascade|followers",
          evidenceState: "quantified_self_reported",
          reachValue: "4000",
          reachDenominator: "1000",
        },
      },
      // Slice 9b. Two parents share this registry entry because proposal
      // source is exclusive: the result proposal has no basis document while
      // the feedback proposal must name the exact historical basis document.
      // Keeping them in this one fixture makes the fixture population remain
      // one-to-one with CREATOR_DATA_REGISTRY while exercising both evidence
      // joins below with semantically coherent parents.
      {
        table: "promotion_proposals",
        drizzle: promotionProposals,
        row: [
          {
            id: RESULT_PROPOSAL_ID,
            profileId: profileA,
            workspaceId: wsA,
            source: "results",
            targetKind: "performance_meta",
            targetPointer: "/rules/-",
            payload: { fixture: "result promotion" },
            familyKey: "cascade-result-family",
            evidenceDigest: "c".repeat(64),
            strength: "early",
          },
          {
            id: FEEDBACK_PROPOSAL_ID,
            profileId: profileA,
            workspaceId: wsA,
            source: "feedback",
            targetKind: "voice",
            targetPointer: "/avoid/-",
            payload: { fixture: "feedback promotion" },
            familyKey: "cascade-feedback-family",
            evidenceDigest: "d".repeat(64),
            strength: "repeated",
            basisBrainDocId: BRAIN_DOC_ID,
          },
        ],
      },
      {
        table: "proposal_evidence_results",
        drizzle: proposalEvidenceResults,
        row: {
          proposalId: RESULT_PROPOSAL_ID,
          profileId: profileA,
          workspaceId: wsA,
          resultId: RESULT_ID,
          role: "treatment",
        },
      },
      {
        table: "proposal_evidence_feedback",
        drizzle: proposalEvidenceFeedback,
        row: {
          proposalId: FEEDBACK_PROPOSAL_ID,
          profileId: profileA,
          workspaceId: wsA,
          feedbackId: FEEDBACK_ID,
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
          rightsBasis: "profile_private",
          ownerProfileId: profileA,
          workspaceId: wsA,
        },
      },
      {
        table: "tracked_niches",
        drizzle: trackedNiches,
        row: { profileId: profileA, workspaceId: wsA, niche: "cascade niche" },
      },
      // Slice 8 fix pass (tenancy CHANGE 5, 2026-09-03). A SUBMITTED source,
      // owned by profile A, ORDERED BEFORE `trend_items` because that row's
      // `source_id` names it (RESTRICT) — the same parent-inside-the-set shape
      // `generations` -> `generation_feedback` has. Until this entry existed
      // the test pre-inserted an ownerless YOUTUBE source outside the fixture
      // set, which is exactly the row a creator deletion must NOT remove, and
      // the registry filed the whole table as not-creator-data on its
      // strength. The cascade crosses the RESTRICT edge cleanly because the
      // private item and its source both cascade from the same profile row.
      {
        table: "trend_sources",
        drizzle: trendSources,
        row: {
          id: TREND_SOURCE_ID,
          kind: "submitted",
          externalId: "cascade-source",
          sourceUrl: "https://example.test/cascade-source",
          profileId: profileA,
          workspaceId: wsA,
        },
      },
      {
        table: "trend_items",
        drizzle: trendItems,
        row: {
          id: TREND_ITEM_ID,
          sourceId: TREND_SOURCE_ID,
          externalVideoId: "cascade-video",
          niche: "cascade niche",
          title: "Cascade trend fixture",
          channelId: "cascade-channel",
          videoViews: 2_000n,
          channelMedianRecentViews: "1000",
          baselineSampleSize: 1,
          baselineObservationIds: ["cascade-baseline"],
          baselineWindowStartsAt: new Date("2026-01-01T00:00:00.000Z"),
          baselineWindowEndsAt: new Date("2026-01-31T00:00:00.000Z"),
          sourcePublishedAt: new Date("2026-01-15T00:00:00.000Z"),
          outlierRatio: "2",
          rightsScope: "profile_private",
          profileId: profileA,
          workspaceId: wsA,
          transcriptState: "transcript_available",
          saturation: "unmeasured",
          saturationUnmeasuredReason: "incomplete_provenance",
        },
      },
      {
        table: "trend_transcripts",
        drizzle: trendTranscripts,
        row: {
          trendItemId: TREND_ITEM_ID,
          rightsScope: "profile_private",
          rightsBasis: "profile_private",
          profileId: profileA,
          workspaceId: wsA,
          content: "Cascade transcript fixture.",
          contentDigest: CONTENT_DIGEST,
          provenance: { provider: "creator_paste" },
        },
      },
      {
        table: "autopsies",
        drizzle: autopsies,
        row: {
          id: AUTOPSY_ID,
          trendItemId: TREND_ITEM_ID,
          contentDigest: CONTENT_DIGEST,
          analysisVersion: "cascade-v1",
          rightsScope: "profile_private",
          rightsBasis: "profile_private",
          profileId: profileA,
          workspaceId: wsA,
          status: "completed",
          analysis: {},
        },
      },
      {
        table: "autopsy_cache_claims",
        drizzle: autopsyCacheClaims,
        row: {
          trendItemId: TREND_ITEM_ID,
          contentDigest: `${CONTENT_DIGEST}-claim`,
          analysisVersion: "cascade-v1",
          rightsScope: "profile_private",
          rightsBasis: "profile_private",
          profileId: profileA,
          workspaceId: wsA,
          cacheScopeKey: profileA,
          status: "pending",
        },
      },
    ];
  };

  it("the delete test's population IS the registry's cascade set, not a hand-written list", () => {
    // THE GUARD ON THE GUARD. Adding a profile-owned table to the authoritative
    // lifecycle registry and no fixture here fails RIGHT HERE,
    // naming the table — rather than silently leaving its cascade unwitnessed,
    // which is what happened to four tables between M2a and slice 6.
    // Lifecycle receipt tables are produced by the deletion authority itself;
    // they cannot be pre-request content fixtures and deliberately outlive the
    // target long enough to prove recovery/erasure. Derive that exclusion from
    // the registered writer authority instead of naming the three tables.
    // The external-command outbox (Task 4) is the same kind of receipt: the
    // executor writes it ABOUT an operation, never as profile content.
    const DELETION_AUTHORITY_OWNERS = [
      "packages/db/src/deletion-lifecycle.ts",
      "packages/db/src/deletion-external-commands.ts",
    ];
    const registry = [...new Set(LIFECYCLE_REGISTRY.filter(
      (entry) =>
        entry.scope === "profile" &&
        !DELETION_AUTHORITY_OWNERS.includes(entry.writerOwner)
    ).map((entry) => entry.table))];
    expect([...cascadeFixtures().map((f) => f.table)].sort()).toEqual(
      [...registry].sort()
    );
    // NON-VACUITY: the registry really does hold non-cascade entries, so the
    // filter is doing work rather than returning everything.
    expect(registry.length).toBeLessThan(new Set(LIFECYCLE_REGISTRY.map((entry) => entry.table)).size);
  });

  it("deleting the workspace cascades EVERY registry-cascade table away — REQ-A04 is POSSIBLE", async () => {
    // An ownerless YOUTUBE source beside the fixture set: it is shared library
    // identity, must SURVIVE the workspace delete, and is asserted to below —
    // the other half of the `trend_sources` registry decision.
    await db.insert(trendSources).values({
      id: "01a00000-0000-7000-8000-00000000ce02",
      kind: "youtube",
      externalId: "cascade-shared-source",
      sourceUrl: "https://example.test/cascade-shared-source",
    });
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
    // TASK 6 CHANGED THIS CONTRACT, and both halves are pinned rather than one
    // quietly replacing the other.
    //
    // The original A-5 outage was: `restrict` on `model_usage` plus
    // both-columns-NOT-NULL made `set null` unrepresentable, so a profile with
    // one usage row could never be deleted — and since profiles cascade from
    // workspaces, this delete failed. R-122 needs those money rows to outlive
    // the workspace for seven years, which a CASCADE cannot do, so Task 6 put
    // the key back at `restrict` — and paid for it by making the caller repoint
    // first. The executor does exactly that: `orderTargetsForExecution` ranks
    // `pseudonymise` before every cascade and puts the root tables last, so the
    // links move to a stub before the workspace row goes.
    //
    // HALF ONE — the delete is REFUSED while a retained money row still points
    // at this workspace. Without this the "repoint first" contract would be
    // satisfied vacuously by a schema that never enforced it.
    await expect(
      db.delete(workspaces).where(eq(workspaces.id, wsA))
    ).rejects.toThrow();

    // HALF TWO — REQ-A04 is still POSSIBLE. Repoint the retained chain the way
    // the executor does (here to the other real workspace, since this is a
    // schema test with no executor to mint a stub), and the delete succeeds.
    // `model_usage` is removed rather than repointed here. Its key is
    // COMPOSITE — (profile_id, workspace_id) — so repointing needs a stub
    // PROFILE, and minting one would leave a `creator_profiles` row behind that
    // this test's own cascade assertion would then read as a survivor. What the
    // executor really does (repoint to a "Deleted profile" stub, keeping the
    // seven-year cost facts) is proven end to end in `deletion-executor.test.ts`;
    // this schema test only needs the RESTRICT lifted so the cascade set below
    // is what is being measured.
    await db.delete(modelUsage).where(eq(modelUsage.workspaceId, wsA));
    await db.update(creditLedger).set({ workspaceId: wsB }).where(eq(creditLedger.workspaceId, wsA));
    await db.update(subscriptions).set({ workspaceId: wsB }).where(eq(subscriptions.workspaceId, wsA));
    await db.update(pausePeriods).set({ workspaceId: wsB }).where(eq(pausePeriods.workspaceId, wsA));
    await expect(
      db.delete(workspaces).where(eq(workspaces.id, wsA))
    ).resolves.toBeDefined();
    for (const f of cascadeFixtures()) {
      // `trend_sources` is the one table in this set with a SHARED half: the
      // creator's submitted source must be gone, the youtube one must remain.
      const remaining = await db.select().from(f.drizzle as never);
      if (f.table === "trend_sources") {
        expect(remaining, "the ownerless youtube source was cascaded away").toHaveLength(1);
        expect(remaining[0]).toMatchObject({ kind: "youtube", externalId: "cascade-shared-source", profileId: null });
        continue;
      }
      expect(remaining, f.table + " survived the workspace delete").toHaveLength(0);
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

  it("0026 (R2/R7): deleting the REFERENCE ONBOARDING INPUT cascades its transcript away; the item and its claim STAY", async () => {
    // The second cascade the registry's `trend_transcripts` entry names. A
    // creator-pasted transcript IS a reference-class onboarding input; when
    // that row goes, the third-party text goes with it. The `trend_items` row
    // is deliberately NOT touched (no trigger — the 2026-07-30 rule), so its
    // `transcript_state` column now overstates, which is why
    // `pastedReferencesForProfile` derives the display state from the
    // transcript row's presence (witnessed in pasted-reference.test.ts).
    const [input] = await db.insert(onboardingInputs).values({
      profileId: profileA, workspaceId: wsA, inputClass: "reference", content: "pasted", contentSha256: "p",
      sourceUrl: "https://example.test/pasted",
    }).returning();
    const [source] = await db.insert(trendSources).values({
      kind: "submitted", externalId: "https://example.test/pasted", sourceUrl: "https://example.test/pasted",
      profileId: profileA, workspaceId: wsA,
    }).returning();
    const [item] = await db.insert(trendItems).values({
      sourceId: source.id, externalVideoId: "p", niche: "", title: "", rightsScope: "profile_private",
      profileId: profileA, workspaceId: wsA, transcriptState: "transcript_available", baselineState: "unavailable",
      sourcePublishedAt: new Date(), saturation: "unmeasured", saturationUnmeasuredReason: "no_population",
    }).returning();
    await db.insert(trendTranscripts).values({
      trendItemId: item.id, rightsScope: "profile_private", profileId: profileA, workspaceId: wsA,
      rightsBasis: "profile_private",
      content: "pasted", contentDigest: "p", referenceInputId: input.id,
      provenance: { kind: "creator_paste", sourceUrl: "https://example.test/pasted", referenceInputId: input.id },
    });
    await db.insert(autopsyCacheClaims).values({
      trendItemId: item.id, contentDigest: "p", analysisVersion: "v1", rightsScope: "profile_private",
      rightsBasis: "profile_private",
      profileId: profileA, workspaceId: wsA, cacheScopeKey: profileA, status: "pending",
    });
    // NON-VACUITY: the transcript is there before the delete.
    expect(await db.select().from(trendTranscripts)).toHaveLength(1);
    await db.delete(onboardingInputs).where(eq(onboardingInputs.id, input.id));
    expect(await db.select().from(trendTranscripts), "the transcript survived its input").toHaveLength(0);
    expect(await db.select().from(trendItems), "the item was cascaded away — nothing should cascade from the input to the item").toHaveLength(1);
    expect(await db.select().from(autopsyCacheClaims)).toHaveLength(1);
    expect(await db.select().from(trendSources)).toHaveLength(1);
  });
});
