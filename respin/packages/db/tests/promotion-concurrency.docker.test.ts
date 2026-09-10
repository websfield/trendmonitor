import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ensureUserWorkspace } from "../src/bootstrap";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { generationAttempts, generations } from "../src/generation-schema";
import { brainActivationSnapshots, onboardingInputs } from "../src/onboarding-schema";
import { promotionProposalReviewInScope } from "../src/promotion-ops";
import { promotionProposals, proposalEvidenceResults } from "../src/promotion-schema";
import { results, treatmentKeyFor } from "../src/results-schema";
import { createDockerTestDb, seedAuthUser } from "../src/testing";
import { ProfileScope, withWorkspace, writeCapabilities } from "../src/with-workspace";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[promotion-concurrency.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: simultaneous proposal refresh produces exactly one proposal/evidence set, " +
      "and simultaneous acceptance produces exactly one summary, brain version, activation, and terminal decision while the loser observes that result."
  );
}

describe.skipIf(!MAINTENANCE_URL)("promotion decisions on real Postgres", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;

  beforeAll(async () => {
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_promotionrace"
    );
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  async function seed(suffix: string) {
    const { db } = harness;
    const authUserId = `promotion-race-${suffix}`;
    await seedAuthUser(db, authUserId);
    const workspaceId = (
      await ensureUserWorkspace(db, { authUserId, name: `Promotion race ${suffix}` })
    ).workspace.id;
    const [profile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: `Race profile ${suffix}` })
      .returning();
    const [strategy] = await db
      .insert(brainDocs)
      .values({
        profileId: profile.id,
        workspaceId,
        kind: "strategy",
        version: 1,
        content: {
          metric: {
            label: "New followers",
            unit: "followers per 1k views",
            direction: "higher_is_better",
          },
        },
        reason: "fixture",
        sourceEvidence: [{ field: "/metric/label" }],
        status: "active",
        confirmedAt: new Date("2026-09-01T00:00:00.000Z"),
        confirmedContentSha256: "a".repeat(64),
        activatedAt: new Date("2026-09-01T00:00:00.000Z"),
      })
      .returning();
    const [activation] = await db
      .insert(brainActivationSnapshots)
      .values({ profileId: profile.id, workspaceId, strategyDocId: strategy.id })
      .returning();
    const generationIds: string[] = [];
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      const attemptId = `promotion-race-${suffix}-${ordinal}`;
      await db.insert(generationAttempts).values({
        profileId: profile.id,
        workspaceId,
        attemptId,
        purpose: "generation",
        mode: "hookSet",
        payloadSha256: ordinal.toString(16).padStart(64, "0"),
      });
      const [generation] = await db
        .insert(generations)
        .values({
          profileId: profile.id,
          workspaceId,
          attemptId,
          mode: "hookSet",
          brainActivationId: activation.id,
          request: { idea: `idea ${ordinal}` },
          model: "fixture-model",
          promptBundleVersion: "fixture-bundle",
          configVersion: 1,
          outcome: "usable",
          output: { hooks: [`hook ${ordinal}`] },
          weakestPoint: "fixture",
          killTest: { rulesFired: [], rewritten: false },
        })
        .returning();
      generationIds.push(generation.id);
    }
    const [generation] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, generationIds[0]!));
    const treatmentKey = treatmentKeyFor({ generation, metricKey: "new-followers" });
    const common = {
      profileId: profile.id,
      workspaceId,
      platform: "shorts",
      audienceClass: "organic" as const,
      metricKey: "new-followers",
      metricDeclaredByDocId: strategy.id,
      observedFrom: new Date("2026-08-01T00:00:00.000Z"),
      observedTo: new Date("2026-08-31T00:00:00.000Z"),
      // VERIFIED (R-115): the only evidence state a proposal is built from.
      evidenceState: "connector_verified" as const,
      connectorSource: "fixture-connector",
      connectorObservedAt: new Date("2026-09-01T00:00:00.000Z"),
      reachDenominator: "1000",
      confounders: [] as ("topic_overlap")[],
    };
    await db.insert(results).values([
      ...generationIds.map((generationId, index) => ({
        ...common,
        generationId,
        treatmentKey,
        connectorEventId: `evt-t-${profile.id}-${index}`,
        reachValue: String(2000 + index * 100),
      })),
      ...[0, 1, 2].map((index) => ({
        ...common,
        generationId: null,
        treatmentKey: null,
        connectorEventId: `evt-b-${profile.id}-${index}`,
        reachValue: String(1000 + index * 100),
      })),
    ]);
    const scope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId, workspaceId }),
      profile.id
    );
    return { workspaceId, profileId: profile.id, scope, caps: writeCapabilities(scope) };
  }

  it(
    "simultaneous refreshes converge on one proposal with one exact evidence set",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const scenario = await seed("refresh");
      const calls = await Promise.all(
        Array.from({ length: 6 }, () =>
          db.transaction((tx) =>
            scenario.caps.refreshPromotionProposals("full", tx)
          )
        )
      );
      expect(calls.every((rows) => rows.length === 1)).toBe(true);
      expect(new Set(calls.flatMap((rows) => rows.map((row) => row.id)))).toHaveLength(1);
      const stored = await db
        .select()
        .from(promotionProposals)
        .where(
          and(
            eq(promotionProposals.profileId, scenario.profileId),
            eq(promotionProposals.workspaceId, scenario.workspaceId)
          )
        );
      expect(stored).toHaveLength(1);
      const evidence = await db
        .select()
        .from(proposalEvidenceResults)
        .where(eq(proposalEvidenceResults.proposalId, stored[0]!.id));
      expect(evidence).toHaveLength(6);
      expect(new Set(evidence.map((row) => row.resultId))).toHaveLength(6);
      expect(evidence.filter((row) => row.role === "treatment")).toHaveLength(3);
      expect(evidence.filter((row) => row.role === "baseline")).toHaveLength(3);
    }
  );

  it(
    "simultaneous accepts write once and the loser observes the same terminal result",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const scenario = await seed("accept");
      await db.transaction((tx) =>
        scenario.caps.refreshPromotionProposals("full", tx)
      );
      const [proposal] = await scenario.scope.accessors.promotionProposalHistory();
      const proposalReview = await db.transaction((tx) =>
        promotionProposalReviewInScope(scenario.scope, proposal.id, tx)
      );
      const confirmedFields = proposalReview.claims.map((claim) => ({
        pointer: claim.pointer,
        asPlaceholder: claim.displayedValue === "[check]",
      }));
      const beforeDocs = (
        await db
          .select({ value: count() })
          .from(brainDocs)
          .where(eq(brainDocs.profileId, scenario.profileId))
      )[0]!.value;
      const beforeActivations = (
        await db
          .select({ value: count() })
          .from(brainActivationSnapshots)
          .where(eq(brainActivationSnapshots.profileId, scenario.profileId))
      )[0]!.value;

      const decisions = await Promise.all(
        Array.from({ length: 2 }, () =>
          db.transaction((tx) =>
            scenario.caps.decidePromotionProposal(
              {
                proposalId: proposal.id,
                decision: "accept",
                freshnessToken: proposalReview.freshnessToken,
                confirmedFields,
              },
              "full",
              tx
            )
          )
        )
      );
      expect(decisions.map((result) => result.status)).toEqual([
        "accepted",
        "accepted",
      ]);
      expect(new Set(decisions.map((result) => result.proposal.id))).toHaveLength(1);
      expect(
        new Set(decisions.map((result) => result.proposal.acceptedBrainDocId))
      ).toHaveLength(1);
      expect(
        new Set(decisions.map((result) => result.proposal.acceptedActivationId))
      ).toHaveLength(1);

      expect(
        await db
          .select()
          .from(onboardingInputs)
          .where(
            and(
              eq(onboardingInputs.profileId, scenario.profileId),
              eq(onboardingInputs.inputClass, "result_summary")
            )
          )
      ).toHaveLength(1);
      expect(
        (
          await db
            .select({ value: count() })
            .from(brainDocs)
            .where(eq(brainDocs.profileId, scenario.profileId))
        )[0]!.value
      ).toBe(beforeDocs + 1);
      expect(
        (
          await db
            .select({ value: count() })
            .from(brainActivationSnapshots)
            .where(eq(brainActivationSnapshots.profileId, scenario.profileId))
        )[0]!.value
      ).toBe(beforeActivations + 1);
      const [terminal] = await db
        .select()
        .from(promotionProposals)
        .where(eq(promotionProposals.id, proposal.id));
      expect(terminal).toMatchObject({
        status: "accepted",
        acceptedBrainDocId: decisions[0]!.proposal.acceptedBrainDocId,
        acceptedActivationId: decisions[0]!.proposal.acceptedActivationId,
      });
      expect(
        await db
          .select()
          .from(proposalEvidenceResults)
          .where(eq(proposalEvidenceResults.proposalId, proposal.id))
      ).toHaveLength(6);
    }
  );
});
