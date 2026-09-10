import { beforeEach, describe, expect, it } from "vitest";
import { and, count, eq } from "drizzle-orm";

import { ensureUserWorkspace } from "../src/bootstrap";
import { CHECK } from "../src/brain-content";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { generationAttempts, generationFeedback, generations } from "../src/generation-schema";
import {
  PerformanceLearningEntitlementError,
  PromotionAccessError,
  PromotionDecisionError,
  PromotionFreshnessError,
} from "../src/errors";
import { brainActivationSnapshots, onboardingInputs } from "../src/onboarding-schema";
import {
  promotionProposalReviewInScope,
} from "../src/promotion-ops";
import { proposalEvidenceResults } from "../src/promotion-schema";
import { results, treatmentKeyFor } from "../src/results-schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
} from "../src/with-workspace";

const ACTIVE_STAMPS = {
  status: "active" as const,
  confirmedAt: new Date("2026-09-01T00:00:00.000Z"),
  confirmedContentSha256: "a".repeat(64),
  activatedAt: new Date("2026-09-01T00:00:00.000Z"),
};

describe("promotion operations", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;
  let scope: ProfileScope;

  async function makeGeneration(activationId: string, ordinal: number): Promise<string> {
    const attemptId = `promotion-result-${ordinal}`;
    await db.insert(generationAttempts).values({
      profileId,
      workspaceId,
      attemptId,
      purpose: "generation",
      mode: "hookSet",
      payloadSha256: String(ordinal).padStart(64, "0"),
    });
    const [generation] = await db.insert(generations).values({
      profileId,
      workspaceId,
      attemptId,
      mode: "hookSet",
      brainActivationId: activationId,
      request: { idea: `idea ${ordinal}` },
      model: "fixture-model",
      promptBundleVersion: "fixture-bundle",
      configVersion: 1,
      outcome: "usable",
      output: { hooks: [`hook ${ordinal}`] },
      weakestPoint: "fixture output has no outcome evidence",
      killTest: { rulesFired: [], rewritten: false },
    }).returning();
    return generation.id;
  }

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "promotion-owner");
    workspaceId = (await ensureUserWorkspace(db, {
      authUserId: "promotion-owner",
      name: "Promotion",
    })).workspace.id;
    [profileId] = (await db.insert(creatorProfiles).values({
      workspaceId,
      displayName: "Promotion profile",
    }).returning()).map((row) => row.id);
    const [strategy] = await db.insert(brainDocs).values({
      profileId,
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
      ...ACTIVE_STAMPS,
    }).returning();
    const [activation] = await db.insert(brainActivationSnapshots).values({
      profileId,
      workspaceId,
      strategyDocId: strategy.id,
    }).returning();
    const generationIds = await Promise.all([1, 2, 3].map((n) => makeGeneration(activation.id, n)));
    const [generation] = await db.select().from(generations).where(eq(generations.id, generationIds[0]!));
    const treatmentKey = treatmentKeyFor({ generation, metricKey: "new-followers" });
    const common = {
      profileId,
      workspaceId,
      platform: "shorts",
      audienceClass: "organic" as const,
      metricKey: "new-followers",
      metricDeclaredByDocId: strategy.id,
      observedFrom: new Date("2026-08-01T00:00:00.000Z"),
      observedTo: new Date("2026-08-31T00:00:00.000Z"),
      // VERIFIED (R-115): the only evidence state a result proposal may be
      // built from. Direct inserts, because no production writer can mint it.
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
        connectorEventId: `evt-t-${index}`,
        reachValue: String(2000 + index * 100),
      })),
      ...[0, 1, 2].map((index) => ({
        ...common,
        generationId: null,
        treatmentKey: null,
        connectorEventId: `evt-b-${index}`,
        reachValue: String(1000 + index * 100),
      })),
    ]);
    scope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "promotion-owner" }),
      profileId
    );
  });

  async function refresh() {
    return db.transaction((tx) => writeCapabilities(scope).refreshPromotionProposals("full", tx));
  }

  async function proposedId(): Promise<string> {
    await refresh();
    const [proposal] = await scope.accessors.promotionProposalHistory();
    expect(proposal.status).toBe("proposed");
    return proposal.id;
  }

  it("requires full entitlement and refreshes idempotently with exact evidence membership", async () => {
    await expect(writeCapabilities(scope).appendOnboardingInput({
      inputClass: "result_summary",
      content: "cast-smuggled product content",
    } as never)).rejects.toThrow("not a public onboarding input class");
    await expect(writeCapabilities(scope).appendOnboardingInput({
      inputClass: "feedback_summary",
      content: "cast-smuggled product content",
    } as never)).rejects.toThrow("not a public onboarding input class");
    await expect(
      db.transaction((tx) => writeCapabilities(scope).refreshPromotionProposals("view_only", tx))
    ).rejects.toBeInstanceOf(PerformanceLearningEntitlementError);

    await refresh();
    await refresh();
    const proposals = await scope.accessors.promotionProposalHistory();
    expect(proposals).toHaveLength(1);
    const joins = await db.select().from(proposalEvidenceResults).where(
      eq(proposalEvidenceResults.proposalId, proposals[0]!.id)
    );
    expect(joins).toHaveLength(6);
    expect(joins.filter((row) => row.role === "treatment")).toHaveLength(3);
    expect(joins.filter((row) => row.role === "baseline")).toHaveLength(3);
  });

  it("accepts atomically, stores a result_summary, and duplicate terminal submit writes nothing twice", async () => {
    const id = await proposedId();
    await expect(
      db.transaction((tx) => promotionProposalReviewInScope(scope, "not-a-uuid" as never, tx))
    ).rejects.toBeInstanceOf(PromotionAccessError);
    const review = await db.transaction((tx) => promotionProposalReviewInScope(scope, id, tx));
    expect(review.baseBrainDocId).toBeNull();
    expect(review.claims.length).toBeGreaterThan(0);
    expect(review.claims.every((claim) =>
      "quote" in claim.sourceEvidence && claim.sourceEvidence.inputClass === "result_summary"
    )).toBe(true);
    const confirmedFields = review.claims.map((claim) => ({
      pointer: claim.pointer,
      asPlaceholder: claim.displayedValue === "[check]",
    }));
    await expect(db.transaction((tx) => writeCapabilities(scope).decidePromotionProposal({
      proposalId: id,
      decision: "approve",
      freshnessToken: review.freshnessToken,
      confirmedFields,
    } as never, "full", tx))).rejects.toBeInstanceOf(PromotionDecisionError);
    expect(await db.select().from(onboardingInputs).where(eq(onboardingInputs.inputClass, "result_summary"))).toEqual([]);
    const decide = () => db.transaction((tx) => writeCapabilities(scope).decidePromotionProposal({
      proposalId: id,
      decision: "accept",
      freshnessToken: review.freshnessToken,
      confirmedFields,
    }, "full", tx));
    const accepted = await decide();
    expect(accepted.status).toBe("accepted");

    const summaries = await db.select().from(onboardingInputs).where(and(
      eq(onboardingInputs.profileId, profileId),
      eq(onboardingInputs.inputClass, "result_summary")
    ));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.sourceUrl).toBeNull();
    expect(summaries[0]!.fieldKey).toBeNull();
    expect(summaries[0]!.content).toContain("Population treatment n=3; baseline n=3");
    expect(summaries[0]!.content).not.toContain("fixture note");

    const before = await db.select({ value: count() }).from(brainDocs).where(eq(brainDocs.profileId, profileId));
    await expect(decide()).resolves.toMatchObject({ status: "accepted" });
    const after = await db.select({ value: count() }).from(brainDocs).where(eq(brainDocs.profileId, profileId));
    expect(after[0]!.value).toBe(before[0]!.value);
    expect(await db.select().from(onboardingInputs).where(eq(onboardingInputs.inputClass, "result_summary"))).toHaveLength(1);
  });

  it("reject writes no summary or brain version and is terminal-idempotent", async () => {
    const id = await proposedId();
    const review = await db.transaction((tx) => promotionProposalReviewInScope(scope, id, tx));
    const beforeDocs = (await db.select({ value: count() }).from(brainDocs))[0]!.value;
    const reject = () => db.transaction((tx) => writeCapabilities(scope).decidePromotionProposal({
      proposalId: id,
      decision: "reject",
      freshnessToken: review.freshnessToken,
      confirmedFields: [],
    }, "full", tx));
    await expect(reject()).resolves.toMatchObject({ status: "rejected" });
    await expect(reject()).resolves.toMatchObject({ status: "rejected" });
    expect((await db.select({ value: count() }).from(brainDocs))[0]!.value).toBe(beforeDocs);
    expect(await db.select().from(onboardingInputs).where(eq(onboardingInputs.inputClass, "result_summary"))).toEqual([]);
  });

  it("rolls back a stale-token acceptance and refuses a broken evidence bijection", async () => {
    const id = await proposedId();
    const review = await db.transaction((tx) => promotionProposalReviewInScope(scope, id, tx));
    await expect(db.transaction((tx) => writeCapabilities(scope).decidePromotionProposal({
      proposalId: id,
      decision: "accept",
      freshnessToken: "0".repeat(64),
      confirmedFields: review.claims.map((claim) => ({ pointer: claim.pointer, asPlaceholder: false })),
    }, "full", tx))).rejects.toBeInstanceOf(PromotionFreshnessError);
    expect(await db.select().from(onboardingInputs).where(eq(onboardingInputs.inputClass, "result_summary"))).toEqual([]);
    expect((await scope.accessors.promotionProposalHistory())[0]!.status).toBe("proposed");

    const [join] = await db.select().from(proposalEvidenceResults).where(eq(proposalEvidenceResults.proposalId, id));
    await db.delete(proposalEvidenceResults).where(and(
      eq(proposalEvidenceResults.proposalId, id),
      eq(proposalEvidenceResults.resultId, join.resultId)
    ));
    await expect(
      db.transaction((tx) => promotionProposalReviewInScope(scope, id, tx))
    ).rejects.toBeInstanceOf(PromotionFreshnessError);
  });

  it("keeps terminal review readable after newer family evidence arrives", async () => {
    const id = await proposedId();
    const review = await db.transaction((tx) => promotionProposalReviewInScope(scope, id, tx));
    await db.transaction((tx) => writeCapabilities(scope).decidePromotionProposal({
      proposalId: id,
      decision: "reject",
      freshnessToken: review.freshnessToken,
      confirmedFields: [],
    }, "full", tx));
    const [strategy] = await db.select().from(brainDocs).where(and(
      eq(brainDocs.profileId, profileId),
      eq(brainDocs.kind, "strategy")
    ));
    await db.insert(results).values({
      profileId,
      workspaceId,
      platform: "shorts",
      audienceClass: "organic",
      metricKey: "new-followers",
      metricDeclaredByDocId: strategy.id,
      observedFrom: new Date("2026-08-01T00:00:00.000Z"),
      observedTo: new Date("2026-08-31T00:00:00.000Z"),
      evidenceState: "connector_verified",
      connectorSource: "fixture-connector",
      connectorEventId: "evt-newer",
      connectorObservedAt: new Date("2026-09-01T00:00:00.000Z"),
      reachValue: "900",
      reachDenominator: "1000",
    });
    await expect(
      db.transaction((tx) => promotionProposalReviewInScope(scope, id, tx))
    ).resolves.toMatchObject({ proposal: { id, status: "rejected" }, learningEligibility: { kind: "verified_results", treatmentN: 3, baselineN: 3 } });
  });

  it("builds feedback only from fixed reactions and summarizes the distinct-generation population without notes", async () => {
    const source = await writeCapabilities(scope).appendOnboardingInput({
      inputClass: "creator_authored",
      fieldKey: "voice",
      content: "Direct voice.",
    });
    const [voice] = await db.insert(brainDocs).values({
      profileId,
      workspaceId,
      kind: "voice",
      version: 1,
      content: {
        register: "Direct",
        sentenceRhythm: CHECK,
        signatureMoves: [CHECK],
        avoid: [CHECK],
      },
      reason: "fixture",
      sourceEvidence: [{
        field: "/register",
        quote: "Direct",
        inputId: source.id,
        startUtf16: 0,
        endUtf16: 6,
      }],
      ...ACTIVE_STAMPS,
    }).returning();
    const [strategy] = await db.select().from(brainDocs).where(and(
      eq(brainDocs.profileId, profileId),
      eq(brainDocs.kind, "strategy")
    ));
    const [activation] = await db.insert(brainActivationSnapshots).values({
      profileId,
      workspaceId,
      voiceDocId: voice.id,
      strategyDocId: strategy.id,
    }).returning();
    const generationIds = await Promise.all([101, 102, 103].map((n) => makeGeneration(activation.id, n)));
    await db.insert(generationFeedback).values(generationIds.map((generationId, index) => ({
      profileId,
      workspaceId,
      generationId,
      reaction: "off_voice" as const,
      note: `PRIVATE NOTE ${index}`,
    })));

    await refresh();
    const proposal = (await scope.accessors.promotionProposalHistory())
      .find((row) => row.source === "feedback")!;
    const review = await db.transaction((tx) => promotionProposalReviewInScope(scope, proposal.id, tx));
    expect(review.claims.some((claim) =>
      "quote" in claim.sourceEvidence && claim.sourceEvidence.inputClass === "feedback_summary"
    )).toBe(true);
    const confirmedFields = review.claims.map((claim) => ({
      pointer: claim.pointer,
      asPlaceholder: claim.displayedValue === CHECK,
    }));
    await db.transaction((tx) => writeCapabilities(scope).decidePromotionProposal({
      proposalId: proposal.id,
      decision: "accept",
      freshnessToken: review.freshnessToken,
      confirmedFields,
    }, "full", tx));
    const [summary] = await db.select().from(onboardingInputs).where(
      eq(onboardingInputs.inputClass, "feedback_summary")
    );
    expect(summary.content).toContain("Population distinct generations n=3");
    expect(summary.content).toContain("fixed reaction code was repeated");
    expect(summary.content).not.toContain("PRIVATE NOTE");
  });
});
