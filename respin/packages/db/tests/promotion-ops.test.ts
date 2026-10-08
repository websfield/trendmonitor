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
import { promotionProposals, proposalEvidenceResults } from "../src/promotion-schema";
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
    // R-169 property 3: a reaction is not a result — its strength is the
    // fixed "repeated", never a measured one.
    expect(proposal.strength).toBe("repeated");
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

  // ------------------------------------------------------------------
  // P2-R10 (AC11): the digest index arbitrates among proposed / accepted /
  // rejected rows only; stale and superseded rows are immutable history.
  // ------------------------------------------------------------------
  describe("the digest is unique among ARBITRATING rows only (audit Phase 2, P2-R10)", () => {
    const history = () => scope.accessors.promotionProposalHistory();
    const rowById = async (id: string) =>
      (await db.select().from(promotionProposals).where(eq(promotionProposals.id, id)))[0]!;

    it("a staled digest re-derived inserts a FRESH proposed row; the stale row is byte-identical; history shows both", async () => {
      const id = await proposedId();
      await db.update(promotionProposals).set({ status: "stale" }).where(eq(promotionProposals.id, id));
      const before = await rowById(id);
      await refresh();
      const after = await history();
      expect(after.map((r) => r.status).sort()).toEqual(["proposed", "stale"]);
      const fresh = after.find((r) => r.status === "proposed")!;
      expect(fresh.id).not.toBe(id);
      expect(fresh.evidenceDigest).toBe(before.evidenceDigest);
      expect(await rowById(id)).toEqual(before);
      // ...and a second refresh is a do-nothing conflict against the LIVE row: the
      // fallback read returns it, never the stale one, and nothing is added.
      await refresh();
      expect((await history()).map((r) => r.id).sort()).toEqual([id, fresh.id].sort());
    });

    it("a REJECTED digest re-derived gains no sibling while its evidence stands", async () => {
      const id = await proposedId();
      const review = await db.transaction((tx) => promotionProposalReviewInScope(scope, id, tx));
      await db.transaction((tx) => writeCapabilities(scope).decidePromotionProposal({
        proposalId: id, decision: "reject", freshnessToken: review.freshnessToken, confirmedFields: [],
      }, "full", tx));
      const before = await rowById(id);
      await refresh();
      await refresh();
      const after = await history();
      expect(after.map((r) => [r.id, r.status])).toEqual([[id, "rejected"]]);
      expect(await rowById(id)).toEqual(before);
    });

    it("an ACCEPTED digest re-derived gains no sibling", async () => {
      const id = await proposedId();
      const review = await db.transaction((tx) => promotionProposalReviewInScope(scope, id, tx));
      await db.transaction((tx) => writeCapabilities(scope).decidePromotionProposal({
        proposalId: id, decision: "accept", freshnessToken: review.freshnessToken,
        confirmedFields: review.claims.map((c) => ({ pointer: c.pointer, asPlaceholder: c.displayedValue === CHECK })),
      }, "full", tx));
      await refresh();
      expect((await history()).map((r) => [r.id, r.status])).toEqual([[id, "accepted"]]);
    });

    it("the INDEX itself: a second arbitrating row with one digest is refused; a history row is not", async () => {
      // Proven at the database, not through the refresh's guards.
      const id = await proposedId();
      const row = await rowById(id);
      const copy = {
        profileId: row.profileId, workspaceId: row.workspaceId, source: row.source,
        targetKind: row.targetKind, targetPointer: row.targetPointer, payload: row.payload,
        familyKey: row.familyKey, evidenceDigest: row.evidenceDigest, strength: row.strength,
        basisBrainDocId: row.basisBrainDocId,
      };
      await expect(db.insert(promotionProposals).values(copy)).rejects.toThrow();
      await expect(db.insert(promotionProposals).values({ ...copy, status: "stale" })).resolves.toBeDefined();
      await expect(db.insert(promotionProposals).values({ ...copy, status: "superseded" })).resolves.toBeDefined();
    });

    it("a terminal row that carries UNVERIFIED evidence is never reopened; the review reads the fresh row", async () => {
      const id = await proposedId();
      await db.update(promotionProposals).set({ status: "stale" }).where(eq(promotionProposals.id, id));
      // A pre-R-115 row: the same digest, joined to a self-reported result.
      const [strategy] = await db.select().from(brainDocs).where(and(eq(brainDocs.profileId, profileId), eq(brainDocs.kind, "strategy")));
      const [selfReported] = await db.insert(results).values({
        profileId, workspaceId, platform: "shorts", audienceClass: "organic", metricKey: "new-followers",
        metricDeclaredByDocId: strategy.id, observedFrom: new Date("2026-08-01T00:00:00.000Z"),
        observedTo: new Date("2026-08-31T00:00:00.000Z"), evidenceState: "quantified_self_reported",
        reachValue: "5000", reachDenominator: "1000",
      }).returning();
      await db.insert(proposalEvidenceResults).values({ proposalId: id, profileId, workspaceId, resultId: selfReported.id, role: "baseline" });
      const before = await rowById(id);
      await refresh();
      const after = await history();
      expect(after.find((r) => r.id === id)!.status).toBe("stale");
      expect(await rowById(id)).toEqual(before);
      const fresh = after.find((r) => r.status === "proposed")!;
      expect(fresh.evidenceDigest).toBe(before.evidenceDigest);
      await expect(db.transaction((tx) => promotionProposalReviewInScope(scope, id, tx)))
        .resolves.toMatchObject({ learningEligibility: { kind: "legacy_unverified" } });
      await expect(db.transaction((tx) => promotionProposalReviewInScope(scope, fresh.id, tx)))
        .resolves.toMatchObject({ learningEligibility: { kind: "verified_results", treatmentN: 3, baselineN: 3 } });
    });
  });

  // ------------------------------------------------------------------
  // P2-A2 (AC17, R-171): the family guard above the digest index, and a
  // duplicate accept that writes nothing.
  // ------------------------------------------------------------------
  describe("re-proposal semantics (audit Phase 2, P2-A2, R-171)", () => {
    const VALUE = "Drafts that do not sound like my established voice.";
    let ordinal = 500;

    async function voiceDoc(version: number, avoid: string[]) {
      const source = await writeCapabilities(scope).appendOnboardingInput({
        inputClass: "creator_authored", fieldKey: "voice", content: `Direct voice ${version}.`,
      });
      const [doc] = await db.insert(brainDocs).values({
        profileId, workspaceId, kind: "voice", version,
        content: { register: "Direct", sentenceRhythm: CHECK, signatureMoves: [CHECK], avoid },
        reason: "fixture",
        sourceEvidence: [{ field: "/register", quote: "Direct", inputId: source.id, startUtf16: 0, endUtf16: 6 }],
        ...ACTIVE_STAMPS,
      }).returning();
      const [strategy] = await db.select().from(brainDocs).where(and(eq(brainDocs.profileId, profileId), eq(brainDocs.kind, "strategy")));
      const [activation] = await db.insert(brainActivationSnapshots).values({
        profileId, workspaceId, voiceDocId: doc.id, strategyDocId: strategy.id,
      }).returning();
      return { doc, activation };
    }

    async function flag(activationId: string, n: number) {
      const ids = await Promise.all(Array.from({ length: n }, () => makeGeneration(activationId, ordinal++)));
      await db.insert(generationFeedback).values(ids.map((generationId) => ({
        profileId, workspaceId, generationId, reaction: "off_voice" as const,
      })));
    }

    const feedbackRows = async () =>
      (await scope.accessors.promotionProposalHistory()).filter((r) => r.source === "feedback");
    const voiceDocs = () => db.select().from(brainDocs).where(and(eq(brainDocs.profileId, profileId), eq(brainDocs.kind, "voice")));
    const activeAvoid = async () =>
      ((await voiceDocs()).find((d) => d.status === "active")!.content as { avoid: string[] }).avoid;

    async function decide(id: string, decision: "accept" | "reject") {
      const review = await db.transaction((tx) => promotionProposalReviewInScope(scope, id, tx));
      return db.transaction((tx) => writeCapabilities(scope).decidePromotionProposal({
        proposalId: id, decision, freshnessToken: review.freshnessToken,
        confirmedFields: decision === "reject" ? [] : review.claims.map((c) => ({ pointer: c.pointer, asPlaceholder: c.displayedValue === CHECK })),
      }, "full", tx));
    }

    async function supersedeActiveVoiceWith(avoid: string[]) {
      const active = (await voiceDocs()).find((d) => d.status === "active")!;
      await db.update(brainDocs).set({ status: "superseded", supersededAt: new Date() }).where(eq(brainDocs.id, active.id));
      return voiceDoc(Math.max(...(await voiceDocs()).map((d) => d.version)) + 1, avoid);
    }

    it("(i) after an accept, one more flag proposes NOTHING while the value stands — and proposes again once the creator removes it", async () => {
      const { activation } = await voiceDoc(1, [CHECK]);
      await flag(activation.id, 3);
      await refresh();
      const [first] = await feedbackRows();
      await expect(decide(first.id, "accept")).resolves.toMatchObject({ status: "accepted", reason: null });
      expect(await activeAvoid()).toContain(VALUE);

      await flag(activation.id, 1);
      await refresh();
      expect((await feedbackRows()).map((r) => r.status)).toEqual(["accepted"]);

      // The creator removes the value: a new active version without it.
      await supersedeActiveVoiceWith([CHECK]);
      await refresh();
      const rows = await feedbackRows();
      expect(rows.map((r) => r.status).sort()).toEqual(["accepted", "proposed"]);
    });

    it("(ii) a rejected family re-proposes ONLY on disjoint evidence that itself reaches n >= 3 distinct generations", async () => {
      const { activation } = await voiceDoc(1, [CHECK]);
      await flag(activation.id, 3);
      await refresh();
      const [rejected] = await feedbackRows();
      await decide(rejected.id, "reject");
      const rejectedEvidence = (await db.transaction((tx) => promotionProposalReviewInScope(scope, rejected.id, tx)))
        .feedbackEvidence.map((e) => e.feedbackId);

      await flag(activation.id, 2);
      await refresh();
      expect((await feedbackRows()).map((r) => r.status)).toEqual(["rejected"]);

      await flag(activation.id, 1);
      await refresh();
      const rows = await feedbackRows();
      expect(rows.map((r) => r.status).sort()).toEqual(["proposed", "rejected"]);
      const fresh = rows.find((r) => r.status === "proposed")!;
      const freshEvidence = (await db.transaction((tx) => promotionProposalReviewInScope(scope, fresh.id, tx))).feedbackEvidence;
      expect(new Set(freshEvidence.map((e) => e.generationId)).size).toBe(3);
      expect(freshEvidence.some((e) => rejectedEvidence.includes(e.feedbackId))).toBe(false);
      // Stable: the disjoint re-proposal is not staled by the next refresh.
      await refresh();
      expect((await feedbackRows()).map((r) => r.status).sort()).toEqual(["proposed", "rejected"]);
    });

    it("(iii) a second accept of an identical value leaves ONE copy, reads `accepted` with `already_present`, and creates no brain version", async () => {
      // Two families proposing the same value: feedback under two different
      // basis documents, both proposed before either is decided.
      const { activation: a1 } = await voiceDoc(1, [CHECK]);
      await flag(a1.id, 3);
      const { activation: a2 } = await supersedeActiveVoiceWith([CHECK]);
      await flag(a2.id, 3);
      await refresh();
      const proposed = await feedbackRows();
      expect(proposed.map((r) => r.status)).toEqual(["proposed", "proposed"]);

      await expect(decide(proposed[0]!.id, "accept")).resolves.toMatchObject({ reason: null });
      const versionsBefore = (await voiceDocs()).length;
      const inputsBefore = (await db.select({ value: count() }).from(onboardingInputs))[0]!.value;
      const secondReview = await db.transaction((tx) => promotionProposalReviewInScope(scope, proposed[1]!.id, tx));
      expect(secondReview.alreadyPresent).toBe(true);
      const second = await decide(proposed[1]!.id, "accept");
      expect(second.status).toBe("accepted");
      expect(second.reason).toBe("already_present");
      expect(second.proposal.decisionReason).toBe("already_present");
      expect((await voiceDocs()).length).toBe(versionsBefore);
      expect((await db.select({ value: count() }).from(onboardingInputs))[0]!.value).toBe(inputsBefore);
      expect((await activeAvoid()).filter((v) => v === VALUE)).toHaveLength(1);
      // The decided row is readable history, naming the document that carries the value.
      await expect(db.transaction((tx) => promotionProposalReviewInScope(scope, proposed[1]!.id, tx)))
        .resolves.toMatchObject({ proposal: { status: "accepted", decisionReason: "already_present" } });
    });

    // THE RESULTS FAMILY (Phase 2 gate, learning): the same three rules on the
    // verified-results path, through the real comparison. Treatment members
    // only are compared (R-171 (ii)); baseline rows are shared by every
    // comparison in a stratum.
    async function verifiedTreatmentRows(n: number, offset: number) {
      const [strategy] = await db.select().from(brainDocs).where(and(eq(brainDocs.profileId, profileId), eq(brainDocs.kind, "strategy")));
      const [existing] = await db.select().from(results).where(and(eq(results.profileId, profileId), eq(results.connectorEventId, "evt-t-0")));
      const [activation] = await db.select().from(brainActivationSnapshots).where(eq(brainActivationSnapshots.profileId, profileId));
      const ids = await Promise.all(Array.from({ length: n }, (_, i) => makeGeneration(activation.id, 900 + offset + i)));
      await db.insert(results).values(ids.map((generationId, i) => ({
        profileId, workspaceId, generationId, platform: "shorts", audienceClass: "organic" as const,
        metricKey: "new-followers", metricDeclaredByDocId: strategy.id,
        observedFrom: new Date("2026-08-01T00:00:00.000Z"), observedTo: new Date("2026-08-31T00:00:00.000Z"),
        treatmentKey: existing.treatmentKey, evidenceState: "connector_verified" as const,
        connectorSource: "fixture-connector", connectorEventId: `evt-new-${offset}-${i}`,
        connectorObservedAt: new Date("2026-09-01T00:00:00.000Z"),
        reachValue: String(3000 + offset * 10 + i * 100), reachDenominator: "1000", confounders: [],
      })));
    }
    const resultRows = async () =>
      (await scope.accessors.promotionProposalHistory()).filter((r) => r.source === "results");
    const treatmentOf = async (id: string) =>
      (await db.transaction((tx) => promotionProposalReviewInScope(scope, id, tx))).resultEvidence
        .filter((e) => e.role === "treatment").map((e) => e.id);

    it("results (i): an ACCEPTED family plus one new verified row proposes nothing while its rule stands", async () => {
      const id = await proposedId();
      await decide(id, "accept");
      await verifiedTreatmentRows(1, 0);
      await refresh();
      expect((await resultRows()).map((r) => r.status)).toEqual(["accepted"]);
    });

    it("results (ii): a REJECTED family plus overlapping evidence proposes nothing; disjoint treatment reaching n >= 3 re-proposes", async () => {
      const id = await proposedId();
      const rejectedTreatment = await treatmentOf(id);
      await decide(id, "reject");
      await verifiedTreatmentRows(2, 0);
      await refresh();
      expect((await resultRows()).map((r) => r.status)).toEqual(["rejected"]);
      await verifiedTreatmentRows(1, 50);
      await refresh();
      const rows = await resultRows();
      expect(rows.map((r) => r.status).sort()).toEqual(["proposed", "rejected"]);
      const fresh = rows.find((r) => r.status === "proposed")!;
      const freshTreatment = await treatmentOf(fresh.id);
      expect(freshTreatment).toHaveLength(3);
      expect(freshTreatment.some((t) => rejectedTreatment.includes(t))).toBe(false);
      // Stable across a second refresh.
      await refresh();
      expect((await resultRows()).map((r) => r.status).sort()).toEqual(["proposed", "rejected"]);
    });

    it("the closed reason is enforced by the database: `already_present` on a non-accepted row is refused", async () => {
      const id = await proposedId();
      await expect(
        db.update(promotionProposals).set({ decisionReason: "already_present" }).where(eq(promotionProposals.id, id))
      ).rejects.toThrow();
      await expect(
        db.update(promotionProposals).set({ decisionReason: "anything_else" as never }).where(eq(promotionProposals.id, id))
      ).rejects.toThrow();
    });
  });
});
