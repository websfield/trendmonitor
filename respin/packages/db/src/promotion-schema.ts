// Slice 9b proposal persistence substrate (contract C4).
//
// This module stores proposals minted and validated by the higher-level
// promotion path. It does not construct proposals or infer evidence:
// membership is relational in the two evidence tables below. Every tenant
// edge carries (profile_id, workspace_id), so a proposal cannot borrow a
// document, activation, result, or feedback row from a sibling profile.
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { brainDocs, creatorProfiles } from "./brain-schema";
import { generationFeedback } from "./generation-schema";
import { brainActivationSnapshots } from "./onboarding-schema";
import { results } from "./results-schema";
import { users } from "./schema";

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

export const promotionProposalSource = pgEnum("promotion_proposal_source", [
  "results",
  "feedback",
]);

export const promotionProposalStatus = pgEnum("promotion_proposal_status", [
  "proposed",
  "accepted",
  "rejected",
  "stale",
  "superseded",
]);

export const promotionProposalStrength = pgEnum(
  "promotion_proposal_strength",
  ["early", "repeated", "corroborated"]
);

export const proposalEvidenceResultRole = pgEnum(
  "proposal_evidence_result_role",
  ["treatment", "baseline"]
);

export type PromotionTargetKind = "voice" | "performance_meta" | "killtest";
export type PromotionDecisionRole = "owner" | "editor";

export const promotionProposals = pgTable(
  "promotion_proposals",
  {
    id: id(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    source: promotionProposalSource("source").notNull(),
    targetKind: text("target_kind").$type<PromotionTargetKind>().notNull(),
    targetPointer: text("target_pointer").notNull(),
    /** Strict runtime validation belongs to the sole Wave-2 persistence path. */
    payload: jsonb("payload").notNull(),
    familyKey: text("family_key").notNull(),
    evidenceDigest: text("evidence_digest").notNull(),
    strength: promotionProposalStrength("strength").notNull(),
    basisBrainDocId: uuid("basis_brain_doc_id"),
    status: promotionProposalStatus("status").notNull().default("proposed"),
    acceptedBrainDocId: uuid("accepted_brain_doc_id"),
    acceptedActivationId: uuid("accepted_activation_id"),
    // Nullable after account deletion. The role snapshot and decision time
    // remain, so history says "Deleted member" without false attribution.
    decisionUserId: uuid("decision_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // A terminal snapshot, not a live membership enum lookup. Keeping its
    // closed owner/editor set in the CHECK also makes viewer unrepresentable.
    decisionRole: text("decision_role").$type<PromotionDecisionRole>(),
    decisionAt: timestamp("decision_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.workspaceId],
      foreignColumns: [creatorProfiles.id, creatorProfiles.workspaceId],
      name: "promotion_proposals_profile_workspace_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    foreignKey({
      columns: [t.basisBrainDocId, t.profileId, t.workspaceId],
      foreignColumns: [brainDocs.id, brainDocs.profileId, brainDocs.workspaceId],
      name: "promotion_proposals_basis_doc_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    foreignKey({
      columns: [t.acceptedBrainDocId, t.profileId, t.workspaceId],
      foreignColumns: [brainDocs.id, brainDocs.profileId, brainDocs.workspaceId],
      name: "promotion_proposals_accepted_doc_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    foreignKey({
      columns: [t.acceptedActivationId, t.profileId, t.workspaceId],
      foreignColumns: [
        brainActivationSnapshots.id,
        brainActivationSnapshots.profileId,
        brainActivationSnapshots.workspaceId,
      ],
      name: "promotion_proposals_accepted_activation_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    unique("promotion_proposals_id_profile_workspace_uq").on(
      t.id,
      t.profileId,
      t.workspaceId
    ),
    unique("promotion_proposals_evidence_digest_uq").on(
      t.profileId,
      t.source,
      t.familyKey,
      t.evidenceDigest
    ),
    check(
      "promotion_proposals_payload_is_object",
      sql`jsonb_typeof(${t.payload}) = 'object'`
    ),
    check(
      "promotion_proposals_identity_says_something",
      sql`${t.familyKey} ~ '[^[:space:]]' AND ${t.evidenceDigest} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "promotion_proposals_source_basis",
      sql`(${t.source} = 'results' AND ${t.basisBrainDocId} IS NULL)
          OR (${t.source} = 'feedback' AND ${t.basisBrainDocId} IS NOT NULL)`
    ),
    check(
      "promotion_proposals_source_target",
      sql`(${t.source} = 'results'
            AND ${t.targetKind} = 'performance_meta'
            AND ${t.targetPointer} = '/rules/-')
          OR (${t.source} = 'feedback'
            AND ((${t.targetKind} = 'voice' AND ${t.targetPointer} = '/avoid/-')
              OR (${t.targetKind} = 'killtest' AND ${t.targetPointer} = '/rules/-')))`
    ),
    check(
      "promotion_proposals_decision_shape",
      sql`(${t.status} = 'accepted'
            AND ${t.decisionAt} IS NOT NULL
            AND ${t.decisionRole} IS NOT NULL
            AND ${t.decisionRole} IN ('owner', 'editor')
            AND ${t.acceptedBrainDocId} IS NOT NULL
            AND ${t.acceptedActivationId} IS NOT NULL)
          OR (${t.status} = 'rejected'
            AND ${t.decisionAt} IS NOT NULL
            AND ${t.decisionRole} IS NOT NULL
            AND ${t.decisionRole} IN ('owner', 'editor')
            AND ${t.acceptedBrainDocId} IS NULL
            AND ${t.acceptedActivationId} IS NULL)
          OR (${t.status} IN ('proposed', 'stale', 'superseded')
            AND ${t.decisionUserId} IS NULL
            AND ${t.decisionRole} IS NULL
            AND ${t.decisionAt} IS NULL
            AND ${t.acceptedBrainDocId} IS NULL
            AND ${t.acceptedActivationId} IS NULL)`
    ),
  ]
);

export const proposalEvidenceResults = pgTable(
  "proposal_evidence_results",
  {
    proposalId: uuid("proposal_id").notNull(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    resultId: uuid("result_id").notNull(),
    role: proposalEvidenceResultRole("role").notNull(),
  },
  (t) => [
    primaryKey({
      name: "proposal_evidence_results_pk",
      columns: [t.proposalId, t.resultId],
    }),
    foreignKey({
      columns: [t.proposalId, t.profileId, t.workspaceId],
      foreignColumns: [
        promotionProposals.id,
        promotionProposals.profileId,
        promotionProposals.workspaceId,
      ],
      name: "proposal_evidence_results_proposal_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    foreignKey({
      columns: [t.resultId, t.profileId, t.workspaceId],
      foreignColumns: [results.id, results.profileId, results.workspaceId],
      name: "proposal_evidence_results_result_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  ]
);

export const proposalEvidenceFeedback = pgTable(
  "proposal_evidence_feedback",
  {
    proposalId: uuid("proposal_id").notNull(),
    profileId: uuid("profile_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    feedbackId: uuid("feedback_id").notNull(),
  },
  (t) => [
    primaryKey({
      name: "proposal_evidence_feedback_pk",
      columns: [t.proposalId, t.feedbackId],
    }),
    foreignKey({
      columns: [t.proposalId, t.profileId, t.workspaceId],
      foreignColumns: [
        promotionProposals.id,
        promotionProposals.profileId,
        promotionProposals.workspaceId,
      ],
      name: "proposal_evidence_feedback_proposal_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    foreignKey({
      columns: [t.feedbackId, t.profileId, t.workspaceId],
      foreignColumns: [
        generationFeedback.id,
        generationFeedback.profileId,
        generationFeedback.workspaceId,
      ],
      name: "proposal_evidence_feedback_feedback_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  ]
);

export type PromotionProposal = typeof promotionProposals.$inferSelect;
export type NewPromotionProposal = typeof promotionProposals.$inferInsert;
export type PromotionProposalSource =
  (typeof promotionProposalSource.enumValues)[number];
export type PromotionProposalStatus =
  (typeof promotionProposalStatus.enumValues)[number];
export type PromotionProposalStrength =
  (typeof promotionProposalStrength.enumValues)[number];
export type ProposalEvidenceResultRole =
  (typeof proposalEvidenceResultRole.enumValues)[number];
export type ProposalEvidenceResult = typeof proposalEvidenceResults.$inferSelect;
export type ProposalEvidenceFeedback = typeof proposalEvidenceFeedback.$inferSelect;
