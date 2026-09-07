import { and, count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import { ensureUserWorkspace } from "../src/bootstrap";
import { CHECK, enumerateClaimFields } from "../src/brain-content";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { pausePeriods } from "../src/billing-schema";
import {
  PerformanceLearningEntitlementError,
  ProfileRoleError,
  PromotionAccessError,
  PromotionDecisionError,
  PromotionFreshnessError,
  PromotionPayloadError,
  WorkspacePausedError,
} from "../src/errors";
import {
  generationAttempts,
  generationFeedback,
  generations,
} from "../src/generation-schema";
import {
  brainActivationSnapshots,
  onboardingInputs,
} from "../src/onboarding-schema";
import {
  decidePromotionProposalInScope,
  promotionProposalHistoryInScope,
  promotionProposalReviewInScope,
  refreshPromotionProposalsInScope,
  type DecidePromotionProposalParams,
} from "../src/promotion-ops";
import {
  promotionProposals,
  proposalEvidenceFeedback,
  proposalEvidenceResults,
} from "../src/promotion-schema";
import { results, treatmentKeyFor } from "../src/results-schema";
import { memberships, users } from "../src/schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
  type ProfileWriteCapabilities,
  type SourceEvidenceEntry,
} from "../src/with-workspace";
import { respinDb } from "../src/app-server";

const ACTIVE_STAMPS = {
  status: "active" as const,
  confirmedAt: new Date("2026-09-01T00:00:00.000Z"),
  confirmedContentSha256: "a".repeat(64),
  activatedAt: new Date("2026-09-01T00:00:00.000Z"),
};

type Scenario = Awaited<ReturnType<typeof seedScenario>>;
type ResultPayloadFixture = {
  unexpected?: unknown;
  rule: {
    metric: {
      key: string;
      label: string;
      unit: string;
      direction: "higher_is_better" | "lower_is_better";
    };
    lever: "reach" | "conversion";
    platform: string;
    audienceClass: "organic" | "paid";
    observationEnvelope: { observedFrom: string; observedTo: string };
    treatmentKey: string;
    treatment: { n: number; medianPer1k: number };
    baseline: { n: number; medianPer1k: number };
    effectPer1k: number;
    pastOutcome: "better" | "worse";
    evidenceCounts: {
      quantifiedSelfReported: number;
      connectorVerified: number;
    };
    evidenceStates: unknown[];
    evidenceStrength: "early" | "repeated" | "corroborated";
    confounders: string[];
  };
};

async function seedScenario(
  db: TestDb,
  suffix = "main",
  metric = {
    label: "New followers",
    unit: "followers per 1k views",
    direction: "higher_is_better" as const,
  }
) {
  const authUserId = `promotion-adversarial-${suffix}`;
  await seedAuthUser(db, authUserId);
  const workspaceId = (
    await ensureUserWorkspace(db, {
      authUserId,
      name: `Promotion ${suffix}`,
    })
  ).workspace.id;
  const [profile] = await db
    .insert(creatorProfiles)
    .values({ workspaceId, displayName: `Profile ${suffix}` })
    .returning();
  const profileId = profile.id;
  const [strategy] = await db
    .insert(brainDocs)
    .values({
      profileId,
      workspaceId,
      kind: "strategy",
      version: 1,
      content: { metric },
      reason: "fixture",
      sourceEvidence: [{ field: "/metric/label" }],
      ...ACTIVE_STAMPS,
    })
    .returning();
  const [activation] = await db
    .insert(brainActivationSnapshots)
    .values({ profileId, workspaceId, strategyDocId: strategy.id })
    .returning();

  const generationIds: string[] = [];
  for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
    const attemptId = `promotion-adversarial-${suffix}-${ordinal}`;
    await db.insert(generationAttempts).values({
      profileId,
      workspaceId,
      attemptId,
      purpose: "generation",
      mode: "hookSet",
      payloadSha256: ordinal.toString(16).padStart(64, "0"),
    });
    const [generation] = await db
      .insert(generations)
      .values({
        profileId,
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
        weakestPoint: "fixture output has no outcome evidence",
        killTest: { rulesFired: [], rewritten: false },
      })
      .returning();
    generationIds.push(generation.id);
  }
  const [generation] = await db
    .select()
    .from(generations)
    .where(eq(generations.id, generationIds[0]!));
  const metricKey = metric.label
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const treatmentKey = treatmentKeyFor({ generation, metricKey });
  const common = {
    profileId,
    workspaceId,
    platform: "shorts",
    audienceClass: "organic" as const,
    metricKey,
    metricDeclaredByDocId: strategy.id,
    observedFrom: new Date("2026-08-01T00:00:00.000Z"),
    observedTo: new Date("2026-08-31T00:00:00.000Z"),
    evidenceState: "quantified_self_reported" as const,
    reachDenominator: "1000",
    confounders: [] as ("topic_overlap")[],
  };
  await db.insert(results).values([
    ...generationIds.map((generationId, index) => ({
      ...common,
      generationId,
      treatmentKey,
      reachValue: String(2000 + index * 100),
    })),
    ...[0, 1, 2].map((index) => ({
      ...common,
      generationId: null,
      treatmentKey: null,
      reachValue: String(1000 + index * 100),
    })),
  ]);
  const workspaceScope = await withWorkspace(db, { authUserId, workspaceId });
  const scope = await ProfileScope.mint(db, workspaceScope, profileId);
  const caps = writeCapabilities(scope);
  return {
    authUserId,
    workspaceId,
    profileId,
    strategy,
    activation,
    generationIds,
    metric,
    metricKey,
    treatmentKey,
    workspaceScope,
    scope,
    caps,
  };
}

async function refresh(db: TestDb, scenario: Scenario) {
  return db.transaction((tx) =>
    scenario.caps.refreshPromotionProposals("full", tx)
  );
}

async function proposed(db: TestDb, scenario: Scenario) {
  await refresh(db, scenario);
  const proposal = (await scenario.scope.accessors.promotionProposalHistory()).find(
    (row) => row.source === "results" && row.status === "proposed"
  );
  expect(proposal).toBeDefined();
  return proposal!;
}

async function review(db: TestDb, scenario: Scenario, proposalId: string) {
  return db.transaction((tx) =>
    promotionProposalReviewInScope(scenario.scope, proposalId, tx)
  );
}

function exactConfirmations(
  proposalReview: Awaited<ReturnType<typeof review>>
): DecidePromotionProposalParams["confirmedFields"] {
  return proposalReview.claims.map((claim) => ({
    pointer: claim.pointer,
    asPlaceholder: claim.displayedValue === CHECK,
  }));
}

async function replaceActiveStrategy(
  db: TestDb,
  scenario: Scenario,
  metric: { label: string; unit: string; direction: "higher_is_better" | "lower_is_better" }
) {
  await db
    .update(brainDocs)
    .set({ status: "superseded" })
    .where(eq(brainDocs.id, scenario.strategy.id));
  const [next] = await db
    .insert(brainDocs)
    .values({
      profileId: scenario.profileId,
      workspaceId: scenario.workspaceId,
      kind: "strategy",
      version: 2,
      content: { metric },
      reason: "fixture replacement",
      sourceEvidence: [{ field: "/metric/label" }],
      ...ACTIVE_STAMPS,
    })
    .returning();
  return next;
}

function storedRuleFromPayload(payload: unknown) {
  const rule = (payload as ResultPayloadFixture).rule;
  return {
    metricLabel: rule.metric.label,
    metricKey: rule.metric.key,
    metricUnit: rule.metric.unit,
    metricDirection: rule.metric.direction,
    lever: rule.lever,
    platform: rule.platform,
    audienceClass: rule.audienceClass,
    observedFrom: rule.observationEnvelope.observedFrom,
    observedTo: rule.observationEnvelope.observedTo,
    treatmentN: rule.treatment.n,
    baselineN: rule.baseline.n,
    treatmentMedianPer1k: rule.treatment.medianPer1k,
    baselineMedianPer1k: rule.baseline.medianPer1k,
    effectPer1k: rule.effectPer1k,
    pastOutcome: rule.pastOutcome,
    evidenceStrength: rule.evidenceStrength,
    selfReportedN: rule.evidenceCounts.quantifiedSelfReported,
    connectorVerifiedN: rule.evidenceCounts.connectorVerified,
    confounders: [...rule.confounders],
  };
}

async function insertActivePerformanceBase(
  db: TestDb,
  scenario: Scenario,
  rules: unknown[] = [],
  sourceEvidence: unknown[] = [{ field: "/fixture" }]
) {
  return (
    await db
      .insert(brainDocs)
      .values({
        profileId: scenario.profileId,
        workspaceId: scenario.workspaceId,
        kind: "performance_meta",
        version: 1,
        content: { rules },
        reason: "fixture",
        sourceEvidence,
        ...ACTIVE_STAMPS,
      })
      .returning()
  )[0]!;
}

async function addNewBaselineResult(db: TestDb, scenario: Scenario, value = "900") {
  await db.insert(results).values({
    profileId: scenario.profileId,
    workspaceId: scenario.workspaceId,
    platform: "shorts",
    audienceClass: "organic",
    metricKey: scenario.metricKey,
    metricDeclaredByDocId: scenario.strategy.id,
    observedFrom: new Date("2026-08-01T00:00:00.000Z"),
    observedTo: new Date("2026-08-30T00:00:00.000Z"),
    evidenceState: "quantified_self_reported",
    reachValue: value,
    reachDenominator: "1000",
    treatmentKey: null,
  });
}

describe("promotion operations adversarial contract", () => {
  let db: TestDb;
  let scenario: Scenario;

  beforeEach(async () => {
    db = await createTestDb();
    scenario = await seedScenario(db);
  });

  it("derives a proposal envelope only from its exact evidence when an earlier unquantified row exists", async () => {
    const [equivalentStrategy] = await db.insert(brainDocs).values({
      profileId: scenario.profileId,
      workspaceId: scenario.workspaceId,
      kind: "strategy",
      version: 2,
      content: { metric: scenario.metric },
      reason: "equivalent fixture",
      sourceEvidence: [{ field: "/metric/label" }],
    }).returning();
    await db.insert(results).values({
      profileId: scenario.profileId,
      workspaceId: scenario.workspaceId,
      platform: "shorts",
      audienceClass: "organic",
      metricKey: scenario.metricKey,
      metricDeclaredByDocId: equivalentStrategy.id,
      observedFrom: new Date("2025-01-01T00:00:00.000Z"),
      observedTo: new Date("2025-01-02T00:00:00.000Z"),
      evidenceState: "unquantified",
      treatmentKey: null,
      confounders: [],
    });

    const proposal = await proposed(db, scenario);
    const payload = proposal.payload as ResultPayloadFixture;
    expect(payload.rule.observationEnvelope).toEqual({
      observedFrom: "2026-08-01T00:00:00.000Z",
      observedTo: "2026-08-31T00:00:00.000Z",
    });
    const initialReview = await review(db, scenario, proposal.id);
    expect(initialReview.resultEvidence).toHaveLength(6);

    await refresh(db, scenario);
    const stillCurrent = (await scenario.scope.accessors.promotionProposalHistory())
      .find((row) => row.id === proposal.id);
    expect(stillCurrent).toMatchObject({
      status: "proposed",
      evidenceDigest: proposal.evidenceDigest,
    });
    expect((await review(db, scenario, proposal.id)).freshnessToken)
      .toBe(initialReview.freshnessToken);
  });

  it("refuses view-only and viewer writes independently while proposal reads remain available", async () => {
    const proposal = await proposed(db, scenario);
    const proposalReview = await review(db, scenario, proposal.id);
    const resultParams = {
      platform: "shorts",
      audienceClass: "organic" as const,
      observedFrom: new Date("2026-09-01T00:00:00.000Z"),
      observedTo: new Date("2026-09-02T00:00:00.000Z"),
      reach: { value: "1", denominator: "1" },
    };

    await expect(
      db.transaction((tx) => scenario.caps.recordResult(resultParams, "view_only", tx))
    ).rejects.toBeInstanceOf(PerformanceLearningEntitlementError);
    await expect(
      db.transaction((tx) =>
        scenario.caps.refreshPromotionProposals("view_only", tx)
      )
    ).rejects.toBeInstanceOf(PerformanceLearningEntitlementError);
    await expect(
      db.transaction((tx) =>
        scenario.caps.decidePromotionProposal(
          {
            proposalId: proposal.id,
            decision: "accept",
            freshnessToken: proposalReview.freshnessToken,
            confirmedFields: exactConfirmations(proposalReview),
          },
          "view_only",
          tx
        )
      )
    ).rejects.toBeInstanceOf(PerformanceLearningEntitlementError);
    await expect(promotionProposalHistoryInScope(scenario.scope)).resolves.toHaveLength(1);
    await expect(review(db, scenario, proposal.id)).resolves.toMatchObject({
      proposal: { id: proposal.id },
    });

    await seedAuthUser(db, "promotion-adversarial-viewer");
    const viewerHome = await ensureUserWorkspace(db, {
      authUserId: "promotion-adversarial-viewer",
      name: "Viewer home",
    });
    await db.insert(memberships).values({
      userId: viewerHome.user.id,
      workspaceId: scenario.workspaceId,
      role: "viewer",
    });
    const viewerWorkspace = await withWorkspace(db, {
      authUserId: "promotion-adversarial-viewer",
      workspaceId: scenario.workspaceId,
    });
    const viewerScope = await ProfileScope.mint(
      db,
      viewerWorkspace,
      scenario.profileId
    );
    const viewerCaps = writeCapabilities(viewerScope);
    await expect(
      db.transaction((tx) => viewerCaps.recordResult(resultParams, "full", tx))
    ).rejects.toBeInstanceOf(ProfileRoleError);
    await expect(
      db.transaction((tx) => viewerCaps.refreshPromotionProposals("full", tx))
    ).rejects.toBeInstanceOf(ProfileRoleError);
    await expect(
      db.transaction((tx) =>
        viewerCaps.decidePromotionProposal(
          {
            proposalId: proposal.id,
            decision: "reject",
            freshnessToken: proposalReview.freshnessToken,
            confirmedFields: [],
          },
          "full",
          tx
        )
      )
    ).rejects.toBeInstanceOf(ProfileRoleError);

    expect(await promotionProposalHistoryInScope(viewerScope)).toHaveLength(1);
    await expect(
      db.transaction((tx) =>
        promotionProposalReviewInScope(viewerScope, proposal.id, tx)
      )
    ).resolves.toMatchObject({ proposal: { id: proposal.id } });
  });

  it("refuses refresh and decision on an authoritative open pause but keeps history and review readable", async () => {
    const proposal = await proposed(db, scenario);
    const proposalReview = await review(db, scenario, proposal.id);
    await db.insert(pausePeriods).values({
      workspaceId: scenario.workspaceId,
      startedAt: new Date("2026-09-02T00:00:00.000Z"),
    });
    await expect(
      db.transaction((tx) => scenario.caps.refreshPromotionProposals("full", tx))
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    await expect(
      db.transaction((tx) =>
        scenario.caps.decidePromotionProposal(
          {
            proposalId: proposal.id,
            decision: "reject",
            freshnessToken: proposalReview.freshnessToken,
            confirmedFields: [],
          },
          "full",
          tx
        )
      )
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    await expect(
      db.transaction((tx) =>
        scenario.caps.recordResult(
          {
            platform: "shorts",
            audienceClass: "organic",
            observedFrom: new Date("2026-09-01T00:00:00.000Z"),
            observedTo: new Date("2026-09-02T00:00:00.000Z"),
            reach: { value: "2", denominator: "1" },
          },
          "full",
          tx
        )
      )
    ).resolves.toMatchObject({ evidenceState: "quantified_self_reported" });
    await expect(promotionProposalHistoryInScope(scenario.scope)).resolves.toHaveLength(1);
    await expect(review(db, scenario, proposal.id)).resolves.toMatchObject({
      proposal: { id: proposal.id, status: "proposed" },
    });
  });

  it("keeps a result proposal current across an identical active Strategy declaration", async () => {
    const proposal = await proposed(db, scenario);
    await replaceActiveStrategy(db, scenario, scenario.metric);
    await refresh(db, scenario);
    expect(
      (await scenario.scope.accessors.promotionProposalHistory()).filter(
        (row) => row.id === proposal.id
      )
    ).toEqual([expect.objectContaining({ status: "proposed" })]);
  });

  it.each([
    ["label", { label: "New followers!", unit: "followers per 1k views", direction: "higher_is_better" as const }],
    ["unit", { label: "New followers", unit: "followers per post", direction: "higher_is_better" as const }],
    ["direction", { label: "New followers", unit: "followers per 1k views", direction: "lower_is_better" as const }],
  ])("stales when the active Strategy semantic tuple changes at %s", async (_member, metric) => {
    const proposal = await proposed(db, scenario);
    await replaceActiveStrategy(db, scenario, metric);
    await refresh(db, scenario);
    expect(
      (await scenario.scope.accessors.promotionProposalHistory()).find(
        (row) => row.id === proposal.id
      )?.status
    ).toBe("stale");
  });

  it("refuses independent stored metric-key drift while label, unit, and direction stay unchanged", async () => {
    const proposal = await proposed(db, scenario);
    await db
      .update(results)
      .set({ metricKey: "smuggled-metric-key" })
      .where(eq(results.profileId, scenario.profileId));
    await expect(refresh(db, scenario)).rejects.toThrow(
      /declares new-followers/
    );
    await expect(review(db, scenario, proposal.id)).rejects.toThrow(
      /declares new-followers/
    );
    expect(
      (await scenario.scope.accessors.promotionProposalHistory()).find(
        (row) => row.id === proposal.id
      )?.status
    ).toBe("proposed");
  });

  it("marks an older valid family digest superseded and never rewrites terminal decisions", async () => {
    const first = await proposed(db, scenario);
    await addNewBaselineResult(db, scenario);
    await refresh(db, scenario);
    let history = await scenario.scope.accessors.promotionProposalHistory();
    expect(history.find((row) => row.id === first.id)?.status).toBe("superseded");
    const current = history.find((row) => row.status === "proposed")!;
    const currentReview = await review(db, scenario, current.id);
    await db.transaction((tx) =>
      scenario.caps.decidePromotionProposal(
        {
          proposalId: current.id,
          decision: "reject",
          freshnessToken: currentReview.freshnessToken,
          confirmedFields: [],
        },
        "full",
        tx
      )
    );
    await addNewBaselineResult(db, scenario, "800");
    await refresh(db, scenario);
    history = await scenario.scope.accessors.promotionProposalHistory();
    expect(history.find((row) => row.id === current.id)?.status).toBe("rejected");
  });

  it("marks a proposed result family stale when referenced relational evidence no longer validates", async () => {
    const proposal = await proposed(db, scenario);
    const [join] = await db
      .select()
      .from(proposalEvidenceResults)
      .where(eq(proposalEvidenceResults.proposalId, proposal.id));
    await db.delete(results).where(eq(results.id, join.resultId));
    await refresh(db, scenario);
    expect(
      (await scenario.scope.accessors.promotionProposalHistory()).find(
        (row) => row.id === proposal.id
      )?.status
    ).toBe("stale");
  });

  it("does not infer stale or reconcile result proposals from a truncated population", async () => {
    const proposal = await proposed(db, scenario);
    const real = scenario.scope.accessors;
    const clippedScope = new Proxy(scenario.scope, {
      get(target, property, receiver) {
        if (property !== "accessors") return Reflect.get(target, property, receiver);
        return {
          ...real,
          promotionResultInputs: async (tx?: Parameters<typeof real.promotionResultInputs>[0]) => {
            const input = await real.promotionResultInputs(tx);
            return { ...input, population: { ...input.population, truncated: true } };
          },
        };
      },
    });
    await db.transaction((tx) =>
      refreshPromotionProposalsInScope(clippedScope, "full", tx)
    );
    const history = await scenario.scope.accessors.promotionProposalHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: proposal.id, status: "proposed" });
  });

  it.each(["missing", "duplicate", "placeholder", "extra"])(
    "refuses a %s confirmation-set mutation without any partial write",
    async (mutation) => {
      const proposal = await proposed(db, scenario);
      const proposalReview = await review(db, scenario, proposal.id);
      const exact = exactConfirmations(proposalReview);
      const confirmedFields =
        mutation === "missing"
          ? exact.slice(1)
          : mutation === "duplicate"
            ? [...exact, exact[0]!]
            : mutation === "placeholder"
              ? [{ ...exact[0]!, asPlaceholder: !exact[0]!.asPlaceholder }, ...exact.slice(1)]
              : [...exact, { pointer: "/not-reviewed", asPlaceholder: false }];
      await expect(
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
      ).rejects.toBeInstanceOf(PromotionDecisionError);
      expect(
        await db
          .select()
          .from(onboardingInputs)
          .where(eq(onboardingInputs.inputClass, "result_summary"))
      ).toEqual([]);
      expect(
        (await scenario.scope.accessors.promotionProposalHistory())[0]!.status
      ).toBe("proposed");
    }
  );

  it.each(["base-id", "base-content"])(
    "invalidates an old token after editable %s changes",
    async (mutation) => {
      const proposal = await proposed(db, scenario);
      const oldReview = await review(db, scenario, proposal.id);
      const base = await insertActivePerformanceBase(db, scenario);
      const currentReview = await review(db, scenario, proposal.id);
      if (mutation === "base-content") {
        const rule = storedRuleFromPayload(proposal.payload);
        await db
          .update(brainDocs)
          .set({ content: { rules: [rule] } })
          .where(eq(brainDocs.id, base.id));
      }
      const token = mutation === "base-id" ? oldReview.freshnessToken : currentReview.freshnessToken;
      const fields = mutation === "base-id" ? exactConfirmations(oldReview) : exactConfirmations(currentReview);
      await expect(
        db.transaction((tx) =>
          scenario.caps.decidePromotionProposal(
            {
              proposalId: proposal.id,
              decision: "accept",
              freshnessToken: token,
              confirmedFields: fields,
            },
            "full",
            tx
          )
        )
      ).rejects.toBeInstanceOf(PromotionFreshnessError);
    }
  );

  it.each(["after-summary", "after-confirmation"])(
    "rolls back summary, brain, activation, and proposal after a forced %s failure",
    async (seam) => {
      const proposal = await proposed(db, scenario);
      const proposalReview = await review(db, scenario, proposal.id);
      const beforeDocs = (
        await db.select({ value: count() }).from(brainDocs)
      )[0]!.value;
      const beforeActivations = (
        await db.select({ value: count() }).from(brainActivationSnapshots)
      )[0]!.value;
      const realCaps = scenario.caps;
      const injected = new Proxy(realCaps, {
        get(target, property, receiver) {
          if (seam === "after-summary" && property === "appendPromotionSummaryForProposal") {
            return async (...args: Parameters<ProfileWriteCapabilities["appendPromotionSummaryForProposal"]>) => {
              await target.appendPromotionSummaryForProposal(...args);
              throw new Error("forced after summary");
            };
          }
          if (seam === "after-confirmation" && property === "activateBrainDocCoherent") {
            return async () => {
              throw new Error("forced after brain write and confirmation");
            };
          }
          return Reflect.get(target, property, receiver);
        },
      });
      await expect(
        db.transaction((tx) =>
          decidePromotionProposalInScope(
            scenario.scope,
            injected,
            {
              proposalId: proposal.id,
              decision: "accept",
              freshnessToken: proposalReview.freshnessToken,
              confirmedFields: exactConfirmations(proposalReview),
            },
            "full",
            tx
          )
        )
      ).rejects.toThrow(`forced ${seam === "after-summary" ? "after summary" : "after brain write and confirmation"}`);
      expect(
        await db
          .select()
          .from(onboardingInputs)
          .where(eq(onboardingInputs.inputClass, "result_summary"))
      ).toEqual([]);
      expect((await db.select({ value: count() }).from(brainDocs))[0]!.value).toBe(beforeDocs);
      expect(
        (await db.select({ value: count() }).from(brainActivationSnapshots))[0]!.value
      ).toBe(beforeActivations);
      expect(
        (await scenario.scope.accessors.promotionProposalHistory())[0]!.status
      ).toBe("proposed");
    }
  );

  it.each([
    ["extra membership", "extra"],
    ["treatment/baseline role drift", "role"],
    ["candidate-key baseline drift", "baseline-key"],
  ])("rejects relational evidence tampering: %s", async (_label, mutation) => {
    const proposal = await proposed(db, scenario);
    if (mutation === "extra") {
      const [extra] = await db
        .insert(results)
        .values({
          profileId: scenario.profileId,
          workspaceId: scenario.workspaceId,
          platform: "shorts",
          audienceClass: "organic",
          metricKey: scenario.metricKey,
          metricDeclaredByDocId: scenario.strategy.id,
          observedFrom: new Date("2026-08-01T00:00:00.000Z"),
          observedTo: new Date("2026-08-29T00:00:00.000Z"),
          evidenceState: "quantified_self_reported",
          reachValue: "700",
          reachDenominator: "1000",
        })
        .returning();
      await db.insert(proposalEvidenceResults).values({
        proposalId: proposal.id,
        profileId: scenario.profileId,
        workspaceId: scenario.workspaceId,
        resultId: extra.id,
        role: "baseline",
      });
    } else if (mutation === "role") {
      const [join] = await db
        .select()
        .from(proposalEvidenceResults)
        .where(and(eq(proposalEvidenceResults.proposalId, proposal.id), eq(proposalEvidenceResults.role, "treatment")));
      await db
        .update(proposalEvidenceResults)
        .set({ role: "baseline" })
        .where(and(eq(proposalEvidenceResults.proposalId, proposal.id), eq(proposalEvidenceResults.resultId, join.resultId)));
    } else if (mutation === "baseline-key") {
      const [join] = await db
        .select()
        .from(proposalEvidenceResults)
        .where(and(eq(proposalEvidenceResults.proposalId, proposal.id), eq(proposalEvidenceResults.role, "baseline")));
      await db
        .update(results)
        .set({
          generationId: scenario.generationIds[0],
          treatmentKey: scenario.treatmentKey,
          observedTo: new Date("2026-08-30T00:00:00.000Z"),
        })
        .where(eq(results.id, join.resultId));
    }
    await expect(review(db, scenario, proposal.id)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof PromotionFreshnessError || error instanceof PromotionPayloadError
    );
  });

  it("makes treatment/baseline overlap unrepresentable in the evidence relation", async () => {
    const proposal = await proposed(db, scenario);
    const [treatment] = await db
      .select()
      .from(proposalEvidenceResults)
      .where(
        and(
          eq(proposalEvidenceResults.proposalId, proposal.id),
          eq(proposalEvidenceResults.role, "treatment")
        )
      );
    await expect(
      db.insert(proposalEvidenceResults).values({
        proposalId: proposal.id,
        profileId: scenario.profileId,
        workspaceId: scenario.workspaceId,
        resultId: treatment.resultId,
        role: "baseline",
      })
    ).rejects.toThrow();
    await expect(review(db, scenario, proposal.id)).resolves.toMatchObject({
      proposal: { id: proposal.id },
    });
  });

  it.each([
    ["unexpected root member", (payload: ResultPayloadFixture) => { payload.unexpected = true; }],
    ["metric key", (payload: ResultPayloadFixture) => { payload.rule.metric.key = "smuggled-key"; }],
    ["population count", (payload: ResultPayloadFixture) => { payload.rule.treatment.n += 1; }],
    ["evidence-state membership", (payload: ResultPayloadFixture) => { payload.rule.evidenceStates = payload.rule.evidenceStates.slice(1); }],
  ])("rejects a strict stored payload mutation at %s", async (_label, mutate) => {
    const proposal = await proposed(db, scenario);
    const payload = structuredClone(proposal.payload as ResultPayloadFixture);
    mutate(payload);
    await db
      .update(promotionProposals)
      .set({ payload })
      .where(eq(promotionProposals.id, proposal.id));
    await expect(review(db, scenario, proposal.id)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof PromotionFreshnessError || error instanceof PromotionPayloadError
    );
  });

  it("rejects a result proposal with feedback-source relational evidence", async () => {
    const proposal = await proposed(db, scenario);
    const feedbackScenario = await seedFeedbackEvidence(db, scenario, "off_voice");
    await db.insert(proposalEvidenceFeedback).values({
      proposalId: proposal.id,
      profileId: scenario.profileId,
      workspaceId: scenario.workspaceId,
      feedbackId: feedbackScenario.feedbackIds[0]!,
    });
    await expect(review(db, scenario, proposal.id)).rejects.toBeInstanceOf(
      PromotionFreshnessError
    );
  });

  it("makes cross-profile, cross-workspace, and nonexistent proposal reads/writes indistinguishable", async () => {
    const proposal = await proposed(db, scenario);
    const otherProfile = (
      await db
        .insert(creatorProfiles)
        .values({ workspaceId: scenario.workspaceId, displayName: "Other profile" })
        .returning()
    )[0]!;
    const sameWorkspaceOtherProfile = await ProfileScope.mint(
      db,
      scenario.workspaceScope,
      otherProfile.id
    );
    const foreign = await seedScenario(db, "foreign");
    const nonexistent = "00000000-0000-4000-8000-000000000099";
    const scopes = [sameWorkspaceOtherProfile, foreign.scope];
    const readErrors: Error[] = [];
    const writeErrors: Error[] = [];
    for (const scoped of scopes) {
      await promotionProposalReviewInScope(scoped, proposal.id, db as never).catch((error) => readErrors.push(error));
      await db
        .transaction((tx) =>
          writeCapabilities(scoped).decidePromotionProposal(
            {
              proposalId: proposal.id,
              decision: "reject",
              freshnessToken: "0".repeat(64),
              confirmedFields: [],
            },
            "full",
            tx
          )
        )
        .catch((error) => writeErrors.push(error));
    }
    await promotionProposalReviewInScope(scenario.scope, nonexistent, db as never).catch((error) => readErrors.push(error));
    await db
      .transaction((tx) =>
        scenario.caps.decidePromotionProposal(
          {
            proposalId: nonexistent,
            decision: "reject",
            freshnessToken: "0".repeat(64),
            confirmedFields: [],
          },
          "full",
          tx
        )
      )
      .catch((error) => writeErrors.push(error));
    expect(readErrors).toHaveLength(3);
    expect(writeErrors).toHaveLength(3);
    for (const errors of [readErrors, writeErrors]) {
      expect(errors.every((error) => error instanceof PromotionAccessError)).toBe(true);
      expect(new Set(errors.map((error) => error.message))).toHaveLength(1);
    }
  });

  it("derives terminal actor id and role from scope despite cast-smuggled fields", async () => {
    const proposal = await proposed(db, scenario);
    const proposalReview = await review(db, scenario, proposal.id);
    const params = {
      proposalId: proposal.id,
      decision: "reject" as const,
      freshnessToken: proposalReview.freshnessToken,
      confirmedFields: [],
      decisionUserId: "00000000-0000-4000-8000-000000000099",
      decisionRole: "editor",
      profileId: "00000000-0000-4000-8000-000000000098",
      workspaceId: "00000000-0000-4000-8000-000000000097",
    } as unknown as DecidePromotionProposalParams;
    const decided = await db.transaction((tx) =>
      scenario.caps.decidePromotionProposal(params, "full", tx)
    );
    const [actor] = await db
      .select()
      .from(users)
      .where(eq(users.authUserId, scenario.authUserId));
    expect(decided.proposal).toMatchObject({
      decisionUserId: actor.id,
      decisionRole: "owner",
      profileId: scenario.profileId,
      workspaceId: scenario.workspaceId,
    });
  });

  it("carries old Performance Meta rules/evidence and records exact UTF-16 spans for astral summary text", async () => {
    db = await createTestDb();
    scenario = await seedScenario(db, "astral", {
      label: "Growth 🚀",
      unit: "followers per 1k views",
      direction: "higher_is_better",
    });
    const proposal = await proposed(db, scenario);
    const oldRule = storedRuleFromPayload(proposal.payload);
    oldRule.metricLabel = "Prior rule";
    const pointers = enumerateClaimFields("performance_meta", { rules: [oldRule] });
    const oldContent = pointers.map((pointer) => `🚀 evidence for ${pointer}`).join("\n");
    const oldInput = await scenario.caps.appendOnboardingInput({
      inputClass: "creator_authored",
      fieldKey: "performance_meta",
      content: oldContent,
    });
    const oldEvidence = pointers.map((field) => {
      const quote = `🚀 evidence for ${field}`;
      const startUtf16 = oldInput.content.indexOf(quote);
      return {
        field,
        quote,
        inputId: oldInput.id,
        startUtf16,
        endUtf16: startUtf16 + quote.length,
      };
    });
    await insertActivePerformanceBase(db, scenario, [oldRule], oldEvidence);
    const proposalReview = await review(db, scenario, proposal.id);
    const accepted = await db.transaction((tx) =>
      scenario.caps.decidePromotionProposal(
        {
          proposalId: proposal.id,
          decision: "accept",
          freshnessToken: proposalReview.freshnessToken,
          confirmedFields: exactConfirmations(proposalReview),
        },
        "full",
        tx
      )
    );
    const [doc] = await db
      .select()
      .from(brainDocs)
      .where(eq(brainDocs.id, accepted.proposal.acceptedBrainDocId!));
    expect((doc.content as { rules: unknown[] }).rules[0]).toEqual(oldRule);
    expect((doc.sourceEvidence as Array<{ inputId?: string }>).filter((entry) => entry.inputId === oldInput.id)).toEqual(oldEvidence);
    const [summary] = await db
      .select()
      .from(onboardingInputs)
      .where(eq(onboardingInputs.inputClass, "result_summary"));
    const newEvidence = (doc.sourceEvidence as Array<{
      inputId?: string;
      quote?: string;
      startUtf16?: number;
      endUtf16?: number;
    }>).filter((entry) => entry.inputId === summary.id);
    expect(newEvidence.some((entry) => entry.quote?.includes("🚀"))).toBe(true);
    for (const entry of newEvidence) {
      expect(summary.content.slice(entry.startUtf16, entry.endUtf16)).toBe(entry.quote);
    }
  });

  it("keeps an accepted review pinned to its immutable accepted content, activation, and evidence after a newer target becomes active", async () => {
    const proposal = await proposed(db, scenario);
    const proposalReview = await review(db, scenario, proposal.id);
    const accepted = await db.transaction((tx) =>
      scenario.caps.decidePromotionProposal(
        {
          proposalId: proposal.id,
          decision: "accept",
          freshnessToken: proposalReview.freshnessToken,
          confirmedFields: exactConfirmations(proposalReview),
        },
        "full",
        tx
      )
    );
    const [acceptedDoc] = await db
      .select()
      .from(brainDocs)
      .where(eq(brainDocs.id, accepted.proposal.acceptedBrainDocId!));
    const [acceptedActivation] = await db
      .select()
      .from(brainActivationSnapshots)
      .where(eq(brainActivationSnapshots.id, accepted.proposal.acceptedActivationId!));
    const immutableMembership = proposalReview.resultEvidence
      .map((row) => `${row.role}:${row.id}`)
      .sort();

    await addNewBaselineResult(db, scenario);
    await refresh(db, scenario);
    expect(
      (await scenario.scope.accessors.promotionProposalHistory()).find(
        (row) => row.id === proposal.id
      )?.status
    ).toBe("accepted");

    const laterRule = {
      ...storedRuleFromPayload(proposal.payload),
      metricLabel: "Later independently activated rule",
    };
    const newerContent = {
      rules: [
        ...(acceptedDoc.content as { rules: unknown[] }).rules,
        laterRule,
      ],
    };
    const laterPointers = enumerateClaimFields("performance_meta", newerContent).filter(
      (pointer) => pointer.startsWith("/rules/1/")
    );
    const laterInputContent = laterPointers
      .map((pointer) => `later evidence for ${pointer}`)
      .join("\n");
    const laterInput = await scenario.caps.appendOnboardingInput({
      inputClass: "creator_authored",
      fieldKey: "performance_meta",
      content: laterInputContent,
    });
    const laterEvidence = laterPointers.map((field) => {
      const quote = `later evidence for ${field}`;
      const startUtf16 = laterInput.content.indexOf(quote);
      return {
        field,
        quote,
        inputId: laterInput.id,
        startUtf16,
        endUtf16: startUtf16 + quote.length,
      };
    });
    const newer = await db.transaction((tx) =>
      scenario.caps.writeBrainDoc(
        {
          kind: "performance_meta",
          content: newerContent,
          sourceEvidence: [
            ...(acceptedDoc.sourceEvidence as SourceEvidenceEntry[]),
            ...laterEvidence,
          ],
          reason: { code: "brain_promotion" },
        },
        tx,
        acceptedDoc.id
      )
    );
    await db.transaction((tx) =>
      scenario.caps.confirmBrainDocFields(
        {
          brainDocId: newer.id,
          confirmedFields: enumerateClaimFields("performance_meta", newerContent).map(
            (pointer) => ({ pointer, asPlaceholder: false })
          ),
        },
        tx
      )
    );
    await db.transaction((tx) =>
      scenario.caps.activateBrainDocCoherent({ brainDocId: newer.id }, tx)
    );

    const terminal = await review(db, scenario, proposal.id);
    expect(terminal.proposal).toMatchObject({
      id: proposal.id,
      status: "accepted",
      acceptedBrainDocId: acceptedDoc.id,
      acceptedActivationId: acceptedActivation.id,
    });
    expect(terminal.baseBrainDocId).toBe(acceptedDoc.id);
    expect(terminal.mergedContent).toEqual(acceptedDoc.content);
    expect(
      terminal.resultEvidence.map((row) => `${row.role}:${row.id}`).sort()
    ).toEqual(immutableMembership);
    expect((terminal.mergedContent as { rules: unknown[] }).rules).toHaveLength(1);
  });

  it("public recordResult cannot make connector_verified reachable through cast-smuggled fields", async () => {
    const row = await db.transaction((tx) =>
      scenario.caps.recordResult(
        {
          platform: "shorts",
          audienceClass: "organic",
          observedFrom: new Date("2026-09-01T00:00:00.000Z"),
          observedTo: new Date("2026-09-02T00:00:00.000Z"),
          reach: { value: "5", denominator: "10" },
          evidenceState: "connector_verified",
          connectorSource: "smuggled",
          connectorEventId: "smuggled",
          connectorObservedAt: new Date(),
        } as never,
        "full",
        tx
      )
    );
    expect(row).toMatchObject({
      evidenceState: "quantified_self_reported",
      connectorSource: null,
      connectorEventId: null,
      connectorObservedAt: null,
    });
  });

  it("public facades expose no caller-built proposal identity, payload, or evidence membership", () => {
    type RefreshArgs = Parameters<typeof respinDb.refreshPromotionProposals>;
    type DecideArgs = Parameters<typeof respinDb.decidePromotionProposal>;
    type DecisionKeys = keyof DecideArgs[2];
    type RecordKeys = keyof Parameters<typeof respinDb.recordResult>[2];
    expectTypeOf<RefreshArgs>().toEqualTypeOf<[
      typeof scenario.workspaceScope,
      string,
      "view_only" | "full",
    ]>();
    expectTypeOf<DecisionKeys>().toEqualTypeOf<
      "proposalId" | "decision" | "freshnessToken" | "confirmedFields"
    >();
    expectTypeOf<Extract<
      RecordKeys | DecisionKeys,
      "draft" | "payload" | "familyKey" | "evidenceDigest" | "strength" | "evidence"
    >>().toEqualTypeOf<never>();
  });
});

async function seedFeedbackEvidence(
  db: TestDb,
  scenario: Scenario,
  reaction: "off_voice" | "too_generic" | "wrong_angle" | "not_filmable",
  options: { generations?: number; mixedReaction?: boolean; mixedBasis?: boolean } = {}
) {
  const source = await scenario.caps.appendOnboardingInput({
    inputClass: "creator_authored",
    fieldKey: "voice",
    content: "Direct voice.",
  });
  const [voice] = await db
    .insert(brainDocs)
    .values({
      profileId: scenario.profileId,
      workspaceId: scenario.workspaceId,
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
    })
    .returning();
  const [secondVoice] = options.mixedBasis
    ? await db
        .insert(brainDocs)
        .values({
          profileId: scenario.profileId,
          workspaceId: scenario.workspaceId,
          kind: "voice",
          version: 2,
          content: {
            register: "Direct",
            sentenceRhythm: CHECK,
            signatureMoves: [CHECK],
            avoid: [CHECK],
          },
          reason: "fixture",
          sourceEvidence: [{ field: "/register" }],
        })
        .returning()
    : [voice];
  const [strategy] = await db
    .select()
    .from(brainDocs)
    .where(eq(brainDocs.id, scenario.strategy.id));
  const countGenerations = options.generations ?? 3;
  const feedbackIds: string[] = [];
  for (let index = 0; index < countGenerations; index += 1) {
    const basis = options.mixedBasis && index === countGenerations - 1 ? secondVoice : voice;
    const [activation] = await db
      .insert(brainActivationSnapshots)
      .values({
        profileId: scenario.profileId,
        workspaceId: scenario.workspaceId,
        voiceDocId: basis.id,
        strategyDocId: strategy.id,
      })
      .returning();
    const ordinal = 200 + index;
    const attemptId = `promotion-feedback-${scenario.profileId}-${ordinal}`;
    await db.insert(generationAttempts).values({
      profileId: scenario.profileId,
      workspaceId: scenario.workspaceId,
      attemptId,
      purpose: "generation",
      mode: "hookSet",
      payloadSha256: ordinal.toString(16).padStart(64, "0"),
    });
    const [generation] = await db
      .insert(generations)
      .values({
        profileId: scenario.profileId,
        workspaceId: scenario.workspaceId,
        attemptId,
        mode: "hookSet",
        brainActivationId: activation.id,
        request: { idea: `feedback ${index}` },
        model: "fixture-model",
        promptBundleVersion: "fixture-bundle",
        configVersion: 1,
        outcome: "usable",
        output: { hooks: [`hook ${index}`] },
        weakestPoint: "fixture",
        killTest: { rulesFired: [], rewritten: false },
      })
      .returning();
    const actualReaction = options.mixedReaction && index === countGenerations - 1
      ? "too_generic"
      : reaction;
    const [feedback] = await db
      .insert(generationFeedback)
      .values({
        profileId: scenario.profileId,
        workspaceId: scenario.workspaceId,
        generationId: generation.id,
        reaction: actualReaction,
        note: `PRIVATE NOTE ${index}`,
      })
      .returning();
    feedbackIds.push(feedback.id);
  }
  return { voice, secondVoice, feedbackIds };
}

describe("feedback proposal exclusions", () => {
  let db: TestDb;
  let scenario: Scenario;

  beforeEach(async () => {
    db = await createTestDb();
    scenario = await seedScenario(db, "feedback");
  });

  it.each([
    ["only two distinct generations", { generations: 2 }],
    ["mixed reactions", { mixedReaction: true }],
    ["mixed historical basis documents", { mixedBasis: true }],
  ])("forms no feedback proposal from %s", async (_label, options) => {
    await seedFeedbackEvidence(db, scenario, "off_voice", options);
    await refresh(db, scenario);
    expect(
      (await scenario.scope.accessors.promotionProposalHistory()).filter(
        (row) => row.source === "feedback"
      )
    ).toEqual([]);
  });

  it("uses the fixed reaction mapping and ignores free-form notes", async () => {
    await seedFeedbackEvidence(db, scenario, "off_voice");
    await refresh(db, scenario);
    const before = (await scenario.scope.accessors.promotionProposalHistory()).find(
      (row) => row.source === "feedback"
    )!;
    await db
      .update(generationFeedback)
      .set({ note: "A completely different private note 🚀" })
      .where(eq(generationFeedback.profileId, scenario.profileId));
    await refresh(db, scenario);
    const feedback = (await scenario.scope.accessors.promotionProposalHistory()).filter(
      (row) => row.source === "feedback"
    );
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).toMatchObject({
      id: before.id,
      evidenceDigest: before.evidenceDigest,
      payload: {
        value: "Drafts that do not sound like my established voice.",
      },
    });
    expect(JSON.stringify(feedback[0]!.payload)).not.toContain("private note");
  });

  it("rejects omitted feedback evidence rather than reconstructing from remaining rows", async () => {
    await seedFeedbackEvidence(db, scenario, "off_voice");
    await refresh(db, scenario);
    const proposal = (await scenario.scope.accessors.promotionProposalHistory()).find(
      (row) => row.source === "feedback"
    )!;
    const [join] = await db
      .select()
      .from(proposalEvidenceFeedback)
      .where(eq(proposalEvidenceFeedback.proposalId, proposal.id));
    await db
      .delete(proposalEvidenceFeedback)
      .where(
        and(
          eq(proposalEvidenceFeedback.proposalId, proposal.id),
          eq(proposalEvidenceFeedback.feedbackId, join.feedbackId)
        )
      );
    await expect(review(db, scenario, proposal.id)).rejects.toBeInstanceOf(
      PromotionFreshnessError
    );
  });
});
