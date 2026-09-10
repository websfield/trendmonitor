// Phase 10a plan C1 (R-115): the pre-deploy audit classifies every result
// proposal by its JOINED evidence, supersedes the still-proposed unverified
// ones exactly once, blocks on an accepted one by ids only, and leaves
// terminal history alone.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { brainActivationSnapshots } from "../src/onboarding-schema";
import { auditResultProposals, renderProposalAudit, supersedeUnverifiedResultProposals } from "../src/promotion-audit";
import { promotionProposals, proposalEvidenceResults } from "../src/promotion-schema";
import { results } from "../src/results-schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";

async function scenario(db: TestDb) {
  await seedAuthUser(db, "audit-owner");
  const { user, workspace } = await ensureUserWorkspace(db, { authUserId: "audit-owner", name: "Audit" });
  const [profile] = await db.insert(creatorProfiles).values({ workspaceId: workspace.id, displayName: "Audited" }).returning();
  const [strategy] = await db.insert(brainDocs).values({
    profileId: profile!.id, workspaceId: workspace.id, kind: "strategy", version: 1,
    content: { metric: { label: "Followers", unit: "per 1k", direction: "higher_is_better" } }, reason: "fixture", sourceEvidence: [{ field: "/metric/label" }],
  }).returning();
  const resultRow = async (state: "connector_verified" | "quantified_self_reported", tag: string) => {
    const [row] = await db.insert(results).values({
      profileId: profile!.id, workspaceId: workspace.id, platform: "shorts", audienceClass: "organic",
      metricKey: "followers", metricDeclaredByDocId: strategy!.id,
      observedFrom: new Date("2026-08-01T00:00:00Z"), observedTo: new Date("2026-08-08T00:00:00Z"),
      evidenceState: state, reachValue: "10", reachDenominator: "1000", confounders: [],
      ...(state === "connector_verified" ? { connectorSource: "fixture", connectorEventId: `evt-${tag}`, connectorObservedAt: new Date("2026-09-01T00:00:00Z") } : {}),
    }).returning();
    return row!;
  };
  const proposal = async (status: "proposed" | "accepted" | "rejected" | "superseded", states: readonly ("connector_verified" | "quantified_self_reported")[], tag: string) => {
    let accepted: Record<string, unknown> = {};
    if (status === "accepted") {
      const [doc] = await db.insert(brainDocs).values({
        profileId: profile!.id, workspaceId: workspace.id, kind: "performance_meta", version: 1,
        content: { rules: [] }, reason: "fixture", sourceEvidence: [{ field: "/rules" }],
      }).returning();
      const [snapshot] = await db.insert(brainActivationSnapshots).values({ profileId: profile!.id, workspaceId: workspace.id, performanceMetaDocId: doc!.id }).returning();
      accepted = { acceptedBrainDocId: doc!.id, acceptedActivationId: snapshot!.id, decisionUserId: user.id, decisionRole: "owner", decisionAt: new Date() };
    } else if (status === "rejected") {
      accepted = { decisionUserId: user.id, decisionRole: "owner", decisionAt: new Date() };
    }
    const [row] = await db.insert(promotionProposals).values({
      profileId: profile!.id, workspaceId: workspace.id, source: "results", targetKind: "performance_meta", targetPointer: "/rules/-",
      payload: { rule: {} }, familyKey: `family-${tag}`, evidenceDigest: createHash("sha256").update(`digest-${tag}`).digest("hex"), strength: "corroborated", status,
      ...accepted,
    } as never).returning();
    for (const [index, state] of states.entries()) {
      const r = await resultRow(state, `${tag}-${index}`);
      await db.insert(proposalEvidenceResults).values({ proposalId: row!.id, profileId: profile!.id, workspaceId: workspace.id, resultId: r.id, role: index === 0 ? "treatment" : "baseline" });
    }
    return row!;
  };
  return { profile: profile!, workspace, proposal };
}

describe("auditResultProposals", () => {
  it("classifies by joined evidence, blocks on an accepted unverified proposal by ids only, and supersedes proposed ones exactly once", async () => {
    const db = await createTestDb();
    const s = await scenario(db);
    const proposedMixed = await s.proposal("proposed", ["connector_verified", "quantified_self_reported"], "pm");
    const proposedVerified = await s.proposal("proposed", ["connector_verified", "connector_verified"], "pv");
    const rejectedMixed = await s.proposal("rejected", ["quantified_self_reported"], "rm");
    const acceptedMixed = await s.proposal("accepted", ["quantified_self_reported", "connector_verified"], "am");

    const before = await auditResultProposals(db);
    expect(before).toEqual({
      unverified: { proposed: [proposedMixed.id], accepted: [{ proposalId: acceptedMixed.id, profileId: s.profile.id, workspaceId: s.workspace.id }], terminal: 1 },
      verified: 1,
      feedback: 0,
      deploymentBlocked: true,
    });
    const rendered = renderProposalAudit(before);
    expect(rendered).toContain("DEPLOYMENT BLOCKED");
    expect(rendered).toContain(acceptedMixed.id);
    expect(rendered).not.toContain("followers");
    expect(rendered).not.toContain("family-");

    await expect(supersedeUnverifiedResultProposals(db)).resolves.toEqual({ superseded: [proposedMixed.id] });
    await expect(supersedeUnverifiedResultProposals(db)).resolves.toEqual({ superseded: [] });
    const [pm] = await db.select().from(promotionProposals).where(eq(promotionProposals.id, proposedMixed.id));
    expect(pm).toMatchObject({ status: "superseded", decisionUserId: null, decisionAt: null, acceptedBrainDocId: null });
    const [pv] = await db.select().from(promotionProposals).where(eq(promotionProposals.id, proposedVerified.id));
    expect(pv!.status).toBe("proposed");
    const [rm] = await db.select().from(promotionProposals).where(eq(promotionProposals.id, rejectedMixed.id));
    expect(rm!.status).toBe("rejected");
    const [am] = await db.select().from(promotionProposals).where(eq(promotionProposals.id, acceptedMixed.id));
    expect(am!.status).toBe("accepted");

    const after = await auditResultProposals(db);
    expect(after.unverified.proposed).toEqual([]);
    expect(after.unverified.terminal).toBe(2);
    expect(after.deploymentBlocked).toBe(true);
  });

  it("an empty database is zero everywhere and not blocked", async () => {
    const db = await createTestDb();
    expect(await auditResultProposals(db)).toEqual({ unverified: { proposed: [], accepted: [], terminal: 0 }, verified: 0, feedback: 0, deploymentBlocked: false });
  });
});
