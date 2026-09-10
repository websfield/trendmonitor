// Plan C1 (R-115): what a result proposal minted BEFORE the verified-only
// rule reads as now. A still-proposed one refuses review (the audit
// supersedes it); a terminal one is legacy history with no draft and cannot
// be decided; an accepted one is the deployment block.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { brainActivationSnapshots } from "../src/onboarding-schema";
import { PromotionFreshnessError, PromotionPayloadError } from "../src/errors";
import { decidePromotionProposalInScope, promotionProposalReviewInScope } from "../src/promotion-ops";
import { promotionProposals, proposalEvidenceResults } from "../src/promotion-schema";
import { results } from "../src/results-schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { ProfileScope, withWorkspace, writeCapabilities } from "../src/with-workspace";

async function scenario(db: TestDb) {
  await seedAuthUser(db, "legacy-owner");
  const { user, workspace } = await ensureUserWorkspace(db, { authUserId: "legacy-owner", name: "Legacy" });
  const [profile] = await db.insert(creatorProfiles).values({ workspaceId: workspace.id, displayName: "Legacy" }).returning();
  const [strategy] = await db.insert(brainDocs).values({
    profileId: profile!.id, workspaceId: workspace.id, kind: "strategy", version: 1,
    content: { metric: { label: "Followers", unit: "per 1k", direction: "higher_is_better" } }, reason: "fixture", sourceEvidence: [{ field: "/metric/label" }],
  }).returning();
  const scope = await ProfileScope.mint(db, await withWorkspace(db, { authUserId: "legacy-owner", workspaceId: workspace.id }), profile!.id);
  const proposal = async (status: "proposed" | "rejected" | "accepted", tag: string) => {
    let decided: Record<string, unknown> = {};
    if (status === "accepted") {
      const [doc] = await db.insert(brainDocs).values({ profileId: profile!.id, workspaceId: workspace.id, kind: "performance_meta", version: 1, content: { rules: [] }, reason: "fixture", sourceEvidence: [{ field: "/rules" }] }).returning();
      const [snapshot] = await db.insert(brainActivationSnapshots).values({ profileId: profile!.id, workspaceId: workspace.id, performanceMetaDocId: doc!.id }).returning();
      decided = { acceptedBrainDocId: doc!.id, acceptedActivationId: snapshot!.id, decisionUserId: user.id, decisionRole: "owner", decisionAt: new Date() };
    } else if (status === "rejected") {
      decided = { decisionUserId: user.id, decisionRole: "owner", decisionAt: new Date() };
    }
    const [row] = await db.insert(promotionProposals).values({
      profileId: profile!.id, workspaceId: workspace.id, source: "results", targetKind: "performance_meta", targetPointer: "/rules/-",
      payload: { rule: { treatment: { n: 3 }, baseline: { n: 3 } } }, familyKey: `family-${tag}`, evidenceDigest: createHash("sha256").update(tag).digest("hex"), strength: "early", status, ...decided,
    } as never).returning();
    for (const [index, state] of (["connector_verified", "quantified_self_reported"] as const).entries()) {
      const [r] = await db.insert(results).values({
        profileId: profile!.id, workspaceId: workspace.id, platform: "shorts", audienceClass: "organic", metricKey: "followers", metricDeclaredByDocId: strategy!.id,
        observedFrom: new Date("2026-08-01T00:00:00Z"), observedTo: new Date("2026-08-08T00:00:00Z"), evidenceState: state, reachValue: "10", reachDenominator: "1000", confounders: [],
        ...(state === "connector_verified" ? { connectorSource: "fixture", connectorEventId: `evt-${tag}-${index}`, connectorObservedAt: new Date("2026-09-01T00:00:00Z") } : {}),
      }).returning();
      await db.insert(proposalEvidenceResults).values({ proposalId: row!.id, profileId: profile!.id, workspaceId: workspace.id, resultId: r!.id, role: index === 0 ? "treatment" : "baseline" });
    }
    return row!;
  };
  return { db, scope, proposal };
}

describe("legacy unverified result proposals under R-115", () => {
  it("a still-proposed one refuses review by name; a rejected one reads as legacy history with no draft; an accepted one is the deployment block", async () => {
    const db = await createTestDb();
    const s = await scenario(db);
    const proposed = await s.proposal("proposed", "p");
    const rejected = await s.proposal("rejected", "r");
    const accepted = await s.proposal("accepted", "a");

    await expect(db.transaction((tx) => promotionProposalReviewInScope(s.scope, proposed.id, tx))).rejects.toThrow(PromotionFreshnessError);
    await expect(db.transaction((tx) => promotionProposalReviewInScope(s.scope, proposed.id, tx))).rejects.toThrow(/proposal audit/);

    const review = await db.transaction((tx) => promotionProposalReviewInScope(s.scope, rejected.id, tx));
    expect(review.learningEligibility).toEqual({ kind: "legacy_unverified" });
    expect(review.claims).toEqual([]);
    expect(review.mergedContent).toBeNull();

    await expect(db.transaction((tx) => promotionProposalReviewInScope(s.scope, accepted.id, tx))).rejects.toThrow(PromotionPayloadError);
    await expect(db.transaction((tx) => promotionProposalReviewInScope(s.scope, accepted.id, tx))).rejects.toThrow(/blocks deployment/);
  });

  it("a legacy proposal cannot be decided: a terminal one is refused as terminal, a proposed one is refused before any token", async () => {
    const db = await createTestDb();
    const s = await scenario(db);
    const rejected = await s.proposal("rejected", "r2");
    const proposed = await s.proposal("proposed", "p2");
    const caps = writeCapabilities(s.scope);
    const terminal = await db.transaction((tx) => decidePromotionProposalInScope(s.scope, caps, { proposalId: rejected.id, decision: "accept", freshnessToken: "x", confirmedFields: [] }, "full", tx));
    expect(terminal.status).toBe("rejected");
    await expect(
      db.transaction((tx) => decidePromotionProposalInScope(s.scope, caps, { proposalId: proposed.id, decision: "accept", freshnessToken: "x", confirmedFields: [] }, "full", tx)),
    ).rejects.toThrow(PromotionFreshnessError);
    const [row] = await db.select().from(promotionProposals).where(eq(promotionProposals.id, proposed.id));
    expect(row!.status).toBe("proposed");
  });
});
// Non-vacuity for the shapes above lives in promotion-ops.test.ts, whose
// fixtures are all connector-verified and review / decide normally.
