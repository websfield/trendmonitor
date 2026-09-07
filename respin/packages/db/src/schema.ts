// M0 schema subset (tech-spec §2): users ─< memberships >─ workspaces.
// All tables: uuid v7 id (app-side uuidv7 per R-17 — Neon pg has no native v7),
// created_at, updated_at. Roles per REQ-A02.
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { user } from "./auth-schema";

export const membershipRole = pgEnum("membership_role", [
  "owner",
  "editor",
  "viewer",
]);

export const identityLifecycleState = pgEnum("identity_lifecycle_state", [
  "active",
  "tombstoned",
]);

export const workspaceLifecycleState = pgEnum("workspace_lifecycle_state", [
  "active",
  "tombstoned",
]);

export const membershipLifecycleState = pgEnum("membership_lifecycle_state", [
  "active",
  "deletion_suspended",
]);

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

// D-M1-5: no email column — Better Auth `user.email` is the sole email truth
// (domain code reads it from the SESSION, never by joining auth tables).
// FK onDelete RESTRICT (fail closed): deleting an auth user with a domain row
// must go through the explicit M6 deletion flow that removes BOTH sides.
export const users = pgTable(
  "users",
  {
    id: id(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    lifecycleState: identityLifecycleState("lifecycle_state")
      .default("active")
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_auth_user_id_uq").on(t.authUserId)]
);

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  lifecycleState: workspaceLifecycleState("lifecycle_state")
    .default("active")
    .notNull(),
  lifecycleVersion: integer("lifecycle_version").default(1).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [check("workspaces_lifecycle_version_positive", sql`${t.lifecycleVersion} >= 1`)]);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    lifecycleState: membershipLifecycleState("lifecycle_state")
      .default("active")
      .notNull(),
    version: integer("version").default(1).notNull(),
    suspendedRole: membershipRole("suspended_role"),
    suspendedVersion: integer("suspended_version"),
    suspensionOperationId: uuid("suspension_operation_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("memberships_user_workspace_uq").on(t.userId, t.workspaceId),
    check("memberships_version_positive", sql`${t.version} >= 1`),
    check(
      "memberships_suspension_shape",
      sql`(${t.lifecycleState} = 'active' AND ${t.suspendedRole} IS NULL AND ${t.suspendedVersion} IS NULL AND ${t.suspensionOperationId} IS NULL)
          OR (${t.lifecycleState} = 'deletion_suspended' AND ${t.suspendedRole} IS NOT NULL AND ${t.suspendedVersion} IS NOT NULL AND ${t.suspendedVersion} >= 1 AND ${t.suspensionOperationId} IS NOT NULL)`
    ),
  ]
);

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type MembershipRole = (typeof membershipRole.enumValues)[number];
export type IdentityLifecycleState =
  (typeof identityLifecycleState.enumValues)[number];
export type WorkspaceLifecycleState =
  (typeof workspaceLifecycleState.enumValues)[number];
export type MembershipLifecycleState =
  (typeof membershipLifecycleState.enumValues)[number];

// Better Auth's adapter-owned tables (user/session/account/verification) join
// the single drizzle schema map here, so BOTH createDb and createTestDb carry
// them (auth-swap plan, adapter-wiring pin). Domain code never queries them —
// the users.auth_user_id FK is a constraint, not a licence to join (D-M1-5).
export * from "./auth-schema";

// M1 billing tables (subscriptions, credit_ledger, stripe_events,
// config_versions, pause_periods). Intended sole writer: packages/credits —
// enforced by the Phase 2 lint/allowlist when that package lands (until then
// this line is a forward reference, not a claimed property).
export * from "./billing-schema";

// M2a brain + onboarding tables (creator_profiles, brain_docs, frameworks,
// onboarding_inputs, model_usage, workspace_spend_monthly). Intended sole
// writers: the ProfileScope capabilities in with-workspace.ts — enforced by the
// repo-wide writer enumeration in respin/tests/import-boundary.test.ts, not by
// this comment.
export * from "./brain-schema";
export * from "./onboarding-schema";

// Slice 6 + 7 generation tables (generation_attempts, generations, and slice
// 7's generation_feedback). Sole writers: the settlement path and
// `recordGenerationFeedback`, both `writeCapabilities` closures — enforced by
// the repo-wide writer enumeration in `respin/tests/table-writers.test.ts`,
// which NAMES them per table and per verb.
//
// THIS COMMENT SAID "an EMPTY expectation for both today" until slice 7, and
// that had been false since slice 6's stage C filled them in — the same shape
// `generation-schema.ts`'s own header records correcting for itself
// ("this header used to say there were none"). Corrected here rather than
// deleted, because the list is the thing a reader of this line actually needs.
export * from "./generation-schema";

// Slice 9a's logged results (`results`). Sole writer: `recordResult`, a
// `writeCapabilities` closure — enforced by the repo-wide writer enumeration in
// `respin/tests/table-writers.test.ts`, which names it per table and per verb,
// not by this comment. It is re-exported HERE as well as from `index.ts`
// because `drizzle.config.ts` reads this module: a schema file this line does
// not name is invisible to `drizzle-kit generate`, which would emit no
// migration and report success.
export * from "./results-schema";

// Slice 9b's proposal record and immutable relational evidence joins. This
// export is also the drizzle-kit discovery edge; omitting it would make the
// schema typecheck while db:generate silently emitted no 0033 migration.
export * from "./promotion-schema";

// Slice 8 shared/private trend material and non-tenant product-overhead spend.
export * from "./trends-schema";
export * from "./system-spend-schema";
export * from "./system-spend";

// Phase 10b-1 Task 3 deletion operation and immutable transition receipts are
// listed directly in drizzle.config.ts and exported from index.ts. Keeping that
// module out of this foundational tenancy schema avoids a runtime import cycle:
// lifecycle-schema references users, workspaces, and membershipRole above.
