// Phase 10a plan C1 (R-115): the PRE-DEPLOY proposal audit and its one
// idempotent migration operation.
//
// The verified-only rule changes what a `results` proposal may be built from,
// so every existing result proposal is classified by its JOINED evidence
// before the rule ships:
//   - still `proposed` with any non-verified row → superseded, once, by
//     `supersedeUnverifiedResultProposals` (idempotent: a second run finds
//     none);
//   - `rejected` / `stale` / `superseded` → immutable history, left alone,
//     read as "legacy unverified" by the review;
//   - `accepted` with any non-verified row → a DEPLOYMENT BLOCK. Named by
//     proposal, profile and workspace id and NOTHING else — no content, no
//     metric label — and never silently detached from an active brain.
// The zero / non-zero result is recorded in the slice card by the operator
// who ran it; `pnpm proposals:audit` (`proposal-audit-cli.ts`) prints exactly
// this shape.
import { and, eq, exists, sql } from "drizzle-orm";
import type { DbLike } from "./db-like";
import { promotionProposals, proposalEvidenceResults } from "./promotion-schema";
import { results } from "./results-schema";

export type ProposalAuditReport = Readonly<{
  /** Every `results` proposal, by status, that carries at least one non-verified evidence row. */
  unverified: Readonly<{
    proposed: readonly string[];
    accepted: readonly Readonly<{ proposalId: string; profileId: string; workspaceId: string }>[];
    terminal: number;
  }>;
  /** `results` proposals whose every evidence row is connector verified. */
  verified: number;
  /** `feedback` proposals — out of the rule's scope, counted so the total reconciles. */
  feedback: number;
  /** True exactly when `unverified.accepted` is non-empty. */
  deploymentBlocked: boolean;
}>;

const unverifiedEvidence = (proposalId: typeof promotionProposals.id) =>
  exists(
    sql`(SELECT 1 FROM ${proposalEvidenceResults}
          JOIN ${results} ON ${results.id} = ${proposalEvidenceResults.resultId}
         WHERE ${proposalEvidenceResults.proposalId} = ${proposalId}
           AND ${results.evidenceState} <> 'connector_verified')`,
  );

export async function auditResultProposals(db: DbLike): Promise<ProposalAuditReport> {
  const rows = await db
    .select({
      id: promotionProposals.id,
      profileId: promotionProposals.profileId,
      workspaceId: promotionProposals.workspaceId,
      source: promotionProposals.source,
      status: promotionProposals.status,
      unverified: sql<boolean>`${unverifiedEvidence(promotionProposals.id)}`,
    })
    .from(promotionProposals);
  const proposed: string[] = [];
  const accepted: { proposalId: string; profileId: string; workspaceId: string }[] = [];
  let terminal = 0;
  let verified = 0;
  let feedback = 0;
  for (const row of rows) {
    if (row.source === "feedback") { feedback += 1; continue; }
    if (!row.unverified) { verified += 1; continue; }
    if (row.status === "proposed") proposed.push(row.id);
    else if (row.status === "accepted") accepted.push({ proposalId: row.id, profileId: row.profileId, workspaceId: row.workspaceId });
    else terminal += 1;
  }
  return {
    unverified: { proposed: proposed.sort(), accepted: accepted.sort((a, b) => a.proposalId.localeCompare(b.proposalId)), terminal },
    verified,
    feedback,
    deploymentBlocked: accepted.length > 0,
  };
}

/**
 * The one reviewed migration operation: every still-`proposed` result
 * proposal with a non-verified evidence row becomes `superseded`. The
 * `promotion_proposals_decision_shape` CHECK keeps a superseded row free of
 * any decision column, and `updated_at` moves so the change is visible.
 * Idempotent by its own predicate.
 */
export async function supersedeUnverifiedResultProposals(db: DbLike): Promise<{ superseded: readonly string[] }> {
  const superseded = await db
    .update(promotionProposals)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(and(
      eq(promotionProposals.source, "results"),
      eq(promotionProposals.status, "proposed"),
      unverifiedEvidence(promotionProposals.id),
    ))
    .returning({ id: promotionProposals.id });
  return { superseded: superseded.map((row) => row.id).sort() };
}

/** Ids only, for a log line or a report card: never content. */
export function renderProposalAudit(report: ProposalAuditReport): string {
  const lines = [
    `result proposals: ${report.verified} fully verified; ${report.unverified.proposed.length} proposed unverified; ${report.unverified.accepted.length} accepted unverified; ${report.unverified.terminal} terminal unverified (history); ${report.feedback} feedback proposals (out of scope)`,
  ];
  if (report.unverified.proposed.length > 0) lines.push(`proposed unverified (to supersede): ${report.unverified.proposed.join(", ")}`);
  if (report.deploymentBlocked) {
    lines.push("DEPLOYMENT BLOCKED: accepted result proposals carry non-verified evidence; an owner must remediate each one:");
    for (const row of report.unverified.accepted) {
      lines.push(`  proposal ${row.proposalId} profile ${row.profileId} workspace ${row.workspaceId}`);
    }
  }
  return lines.join("\n");
}

