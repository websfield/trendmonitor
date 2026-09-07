import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { generationAttempts, generationFeedback, generations } from "../src/generation-schema";
import {
  brainActivationSnapshots,
  inputClass,
  onboardingInputs,
  PUBLIC_INPUT_CLASSES,
} from "../src/onboarding-schema";
import {
  promotionProposalSource,
  promotionProposalStatus,
  promotionProposalStrength,
  promotionProposals,
  proposalEvidenceFeedback,
  proposalEvidenceResultRole,
  proposalEvidenceResults,
} from "../src/promotion-schema";
import { results } from "../src/results-schema";
import { users, workspaces } from "../src/schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";

describe("slice 9b: promotion persistence schema", () => {
  let db: TestDb;
  let userA: string;
  let wsA: string;
  let wsB: string;
  let pA1: string;
  let pA2: string;
  let pB: string;
  let docA1: string;
  let docA2: string;
  let docB: string;
  let activationA1: string;
  let activationA2: string;
  let resultA1: string;
  let resultA2: string;
  let feedbackA1: string;
  let feedbackA2: string;

  const proposalFor = (
    profileId: string,
    workspaceId: string,
    over: Record<string, unknown> = {}
  ) => ({
    profileId,
    workspaceId,
    source: "results" as const,
    targetKind: "performance_meta" as const,
    targetPointer: "/rules/-" as const,
    payload: { rule: { metricKey: "followers", lever: "reach" } },
    familyKey: "results-family",
    evidenceDigest: "a".repeat(64),
    strength: "early" as const,
    ...over,
  });

  const resultFor = (
    profileId: string,
    workspaceId: string,
    metricDocId: string
  ) => ({
    profileId,
    workspaceId,
    platform: "shorts",
    audienceClass: "organic" as const,
    metricKey: "followers",
    metricDeclaredByDocId: metricDocId,
    observedFrom: new Date("2026-08-01T00:00:00Z"),
    observedTo: new Date("2026-08-08T00:00:00Z"),
    evidenceState: "quantified_self_reported" as const,
    reachValue: "10",
    reachDenominator: "1000",
    confounders: [],
  });

  async function makeGeneration(
    profileId: string,
    workspaceId: string,
    activationId: string,
    suffix: string
  ) {
    const attemptId = `promotion_${suffix}`;
    await db.insert(generationAttempts).values({
      profileId,
      workspaceId,
      attemptId,
      purpose: "generation",
      mode: "hookSet",
      payloadSha256: suffix.padEnd(64, "a").slice(0, 64),
    });
    const [generation] = await db
      .insert(generations)
      .values({
        profileId,
        workspaceId,
        attemptId,
        mode: "hookSet",
        brainActivationId: activationId,
        request: { idea: suffix },
        model: "test-model",
        promptBundleVersion: "test-bundle",
        configVersion: 1,
        outcome: "usable",
        output: { hooks: [suffix] },
        weakestPoint: "fixture evidence is not product evidence",
        killTest: { rulesFired: [], rewritten: false },
      })
      .returning();
    return generation.id;
  }

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "promotion_a");
    await seedAuthUser(db, "promotion_b");
    const a = await ensureUserWorkspace(db, {
      authUserId: "promotion_a",
      name: "A",
    });
    const b = await ensureUserWorkspace(db, {
      authUserId: "promotion_b",
      name: "B",
    });
    userA = a.user.id;
    wsA = a.workspace.id;
    wsB = b.workspace.id;
    const profiles = await db
      .insert(creatorProfiles)
      .values([
        { workspaceId: wsA, displayName: "A-one" },
        { workspaceId: wsA, displayName: "A-two" },
        { workspaceId: wsB, displayName: "B-one" },
      ])
      .returning();
    [pA1, pA2, pB] = profiles.map((row) => row.id);

    const docs = await db
      .insert(brainDocs)
      .values(
        [
          [pA1, wsA],
          [pA2, wsA],
          [pB, wsB],
        ].map(([profileId, workspaceId]) => ({
          profileId,
          workspaceId,
          kind: "strategy" as const,
          version: 1,
          content: {
            metric: {
              label: "New followers",
              unit: "followers per 1k views",
              direction: "higher_is_better",
            },
          },
          sourceEvidence: [{ field: "/metric/label" }],
          reason: "promotion schema fixture",
        }))
      )
      .returning();
    [docA1, docA2, docB] = docs.map((row) => row.id);

    const activations = await db
      .insert(brainActivationSnapshots)
      .values([
        { profileId: pA1, workspaceId: wsA, strategyDocId: docA1 },
        { profileId: pA2, workspaceId: wsA, strategyDocId: docA2 },
        { profileId: pB, workspaceId: wsB, strategyDocId: docB },
      ])
      .returning();
    [activationA1, activationA2] = activations.map((row) => row.id);

    const generationA1 = await makeGeneration(
      pA1,
      wsA,
      activationA1,
      "a1"
    );
    const generationA2 = await makeGeneration(
      pA2,
      wsA,
      activationA2,
      "a2"
    );
    const [feedback1] = await db
      .insert(generationFeedback)
      .values({
        profileId: pA1,
        workspaceId: wsA,
        generationId: generationA1,
        reaction: "off_voice",
      })
      .returning();
    const [feedback2] = await db
      .insert(generationFeedback)
      .values({
        profileId: pA2,
        workspaceId: wsA,
        generationId: generationA2,
        reaction: "off_voice",
      })
      .returning();
    feedbackA1 = feedback1.id;
    feedbackA2 = feedback2.id;

    const insertedResults = await db
      .insert(results)
      .values([
        resultFor(pA1, wsA, docA1),
        resultFor(pA2, wsA, docA2),
      ])
      .returning();
    resultA1 = insertedResults[0].id;
    resultA2 = insertedResults[1].id;
  });

  it("exports the closed enum vocabularies, including the stored-only summary classes", () => {
    expect(PUBLIC_INPUT_CLASSES).toEqual([
      "own_post",
      "reference",
      "creator_authored",
    ]);
    expect(promotionProposalSource.enumValues).toEqual(["results", "feedback"]);
    expect(promotionProposalStatus.enumValues).toEqual([
      "proposed",
      "accepted",
      "rejected",
      "stale",
      "superseded",
    ]);
    expect(promotionProposalStrength.enumValues).toEqual([
      "early",
      "repeated",
      "corroborated",
    ]);
    expect(proposalEvidenceResultRole.enumValues).toEqual([
      "treatment",
      "baseline",
    ]);
    expect(inputClass.enumValues).toEqual([
      "own_post",
      "reference",
      "creator_authored",
      "result_summary",
      "feedback_summary",
    ]);
  });

  it("stores product summaries only without caller attribution fields", async () => {
    await expect(
      db.insert(onboardingInputs).values({
        profileId: pA1,
        workspaceId: wsA,
        inputClass: "result_summary",
        content: "Server-derived result evidence summary.",
        contentSha256: "d".repeat(64),
      })
    ).resolves.toBeDefined();

    for (const bad of [
      { inputClass: "result_summary", sourceUrl: "https://caller.invalid" },
      { inputClass: "feedback_summary", fieldKey: "caller-field" },
    ] as const) {
      await expect(
        db.insert(onboardingInputs).values({
          profileId: pA2,
          workspaceId: wsA,
          content: "This summary shape must be rejected.",
          contentSha256: "e".repeat(64),
          ...bad,
        })
      ).rejects.toThrow();
    }
  });

  it("stores only source-compatible basis/target shapes and object payloads", async () => {
    await expect(
      db.insert(promotionProposals).values(proposalFor(pA1, wsA))
    ).resolves.toBeDefined();
    await expect(
      db.insert(promotionProposals).values(
        proposalFor(pA1, wsA, {
          familyKey: "feedback-family",
          evidenceDigest: "b".repeat(64),
          source: "feedback",
          targetKind: "voice",
          targetPointer: "/avoid/-",
          payload: { value: "Drafts that do not sound like my established voice." },
          basisBrainDocId: docA1,
        })
      )
    ).resolves.toBeDefined();

    for (const bad of [
      { basisBrainDocId: docA1 },
      {
        source: "feedback",
        targetKind: "voice",
        targetPointer: "/avoid/-",
        basisBrainDocId: null,
      },
      { targetKind: "voice", targetPointer: "/avoid/-" },
      { payload: ["not", "an", "object"] },
    ]) {
      await expect(
        db.insert(promotionProposals).values(
          proposalFor(pA2, wsA, {
            familyKey: `bad-${JSON.stringify(bad)}`,
            evidenceDigest: Math.random().toString(16).padEnd(64, "0").slice(0, 64),
            ...bad,
          }) as never
        )
      ).rejects.toThrow();
    }
  });

  it("enforces terminal decision shapes and leaves open states undecided", async () => {
    await expect(
      db.insert(promotionProposals).values(
        proposalFor(pA1, wsA, {
          familyKey: "accepted",
          status: "accepted",
          acceptedBrainDocId: docA1,
          acceptedActivationId: activationA1,
          decisionUserId: userA,
          decisionRole: "owner",
          decisionAt: new Date(),
        })
      )
    ).resolves.toBeDefined();
    await expect(
      db.insert(promotionProposals).values(
        proposalFor(pA1, wsA, {
          familyKey: "rejected",
          evidenceDigest: "b".repeat(64),
          status: "rejected",
          decisionUserId: userA,
          decisionRole: "editor",
          decisionAt: new Date(),
        })
      )
    ).resolves.toBeDefined();

    for (const bad of [
      { status: "accepted", acceptedBrainDocId: docA1 },
      {
        status: "accepted",
        acceptedBrainDocId: docA1,
        acceptedActivationId: activationA1,
        decisionAt: new Date(),
      },
      { status: "rejected", decisionAt: new Date() },
      { status: "rejected", decisionRole: "owner", decisionAt: new Date(), acceptedBrainDocId: docA1 },
      { status: "proposed", decisionRole: "owner", decisionAt: new Date() },
      { status: "stale", acceptedActivationId: activationA1 },
      { status: "superseded", decisionUserId: userA },
      { status: "rejected", decisionRole: "viewer", decisionAt: new Date() },
    ]) {
      await expect(
        db.insert(promotionProposals).values(
          proposalFor(pA2, wsA, {
            familyKey: `bad-status-${JSON.stringify(bad)}`,
            evidenceDigest: Math.random().toString(16).padEnd(64, "f").slice(0, 64),
            ...bad,
          }) as never
        )
      ).rejects.toThrow();
    }
  });

  it("makes every document, activation, result, and feedback edge same-tenant", async () => {
    for (const bad of [
      { basisBrainDocId: docA2 },
      { basisBrainDocId: docB },
    ]) {
      await expect(
        db.insert(promotionProposals).values(
          proposalFor(pA1, wsA, {
            source: "feedback",
            targetKind: "voice",
            targetPointer: "/avoid/-",
            payload: { value: "fixed" },
            familyKey: `foreign-basis-${bad.basisBrainDocId}`,
            ...bad,
          })
        )
      ).rejects.toThrow();
    }
    await expect(
      db.insert(promotionProposals).values(
        proposalFor(pA1, wsA, {
          status: "accepted",
          acceptedBrainDocId: docA2,
          acceptedActivationId: activationA1,
          decisionRole: "owner",
          decisionAt: new Date(),
        })
      )
    ).rejects.toThrow();
    await expect(
      db.insert(promotionProposals).values(
        proposalFor(pA1, wsA, {
          status: "accepted",
          acceptedBrainDocId: docA1,
          acceptedActivationId: activationA2,
          decisionRole: "owner",
          decisionAt: new Date(),
        })
      )
    ).rejects.toThrow();

    const [proposal] = await db
      .insert(promotionProposals)
      .values(proposalFor(pA1, wsA))
      .returning();
    await expect(
      db.insert(proposalEvidenceResults).values({
        proposalId: proposal.id,
        profileId: pA1,
        workspaceId: wsA,
        resultId: resultA1,
        role: "treatment",
      })
    ).resolves.toBeDefined();
    await expect(
      db.insert(proposalEvidenceResults).values({
        proposalId: proposal.id,
        profileId: pA1,
        workspaceId: wsA,
        resultId: resultA2,
        role: "baseline",
      })
    ).rejects.toThrow();

    const [feedbackProposal] = await db
      .insert(promotionProposals)
      .values(
        proposalFor(pA1, wsA, {
          source: "feedback",
          targetKind: "voice",
          targetPointer: "/avoid/-",
          payload: { value: "fixed" },
          basisBrainDocId: docA1,
          familyKey: "feedback-evidence",
          evidenceDigest: "c".repeat(64),
        })
      )
      .returning();
    await expect(
      db.insert(proposalEvidenceFeedback).values({
        proposalId: feedbackProposal.id,
        profileId: pA1,
        workspaceId: wsA,
        feedbackId: feedbackA1,
      })
    ).resolves.toBeDefined();
    await expect(
      db.insert(proposalEvidenceFeedback).values({
        proposalId: feedbackProposal.id,
        profileId: pA1,
        workspaceId: wsA,
        feedbackId: feedbackA2,
      })
    ).rejects.toThrow();
  });

  it("makes refresh idempotency and evidence membership database properties", async () => {
    const [proposal] = await db
      .insert(promotionProposals)
      .values(proposalFor(pA1, wsA))
      .returning();
    await expect(
      db.insert(promotionProposals).values(
        proposalFor(pA1, wsA, {
          payload: { rule: { different: true } },
        })
      )
    ).rejects.toThrow();
    await db.insert(proposalEvidenceResults).values({
      proposalId: proposal.id,
      profileId: pA1,
      workspaceId: wsA,
      resultId: resultA1,
      role: "treatment",
    });
    await expect(
      db.insert(proposalEvidenceResults).values({
        proposalId: proposal.id,
        profileId: pA1,
        workspaceId: wsA,
        resultId: resultA1,
        role: "baseline",
      })
    ).rejects.toThrow();
  });

  it("nulls an erased actor id but retains role-at-decision and proposal history", async () => {
    const [proposal] = await db
      .insert(promotionProposals)
      .values(
        proposalFor(pA1, wsA, {
          status: "accepted",
          acceptedBrainDocId: docA1,
          acceptedActivationId: activationA1,
          decisionUserId: userA,
          decisionRole: "owner",
          decisionAt: new Date(),
        })
      )
      .returning();

    await db.delete(users).where(eq(users.id, userA));
    const [stored] = await db
      .select()
      .from(promotionProposals)
      .where(eq(promotionProposals.id, proposal.id));
    expect(stored).toMatchObject({ decisionUserId: null, decisionRole: "owner" });
  });

  it("cascades the complete proposal/evidence tree on profile and workspace deletion", async () => {
    const [proposal] = await db
      .insert(promotionProposals)
      .values(proposalFor(pA1, wsA))
      .returning();
    await db.insert(proposalEvidenceResults).values({
      proposalId: proposal.id,
      profileId: pA1,
      workspaceId: wsA,
      resultId: resultA1,
      role: "treatment",
    });
    await db.delete(creatorProfiles).where(eq(creatorProfiles.id, pA1));
    expect(
      await db
        .select()
        .from(promotionProposals)
        .where(eq(promotionProposals.id, proposal.id))
    ).toHaveLength(0);
    expect(await db.select().from(proposalEvidenceResults)).toHaveLength(0);

    const [workspaceProposal] = await db
      .insert(promotionProposals)
      .values(proposalFor(pB, wsB))
      .returning();
    await db.delete(workspaces).where(eq(workspaces.id, wsB));
    expect(
      await db
        .select()
        .from(promotionProposals)
        .where(eq(promotionProposals.id, workspaceProposal.id))
    ).toHaveLength(0);
  });
});
