// M0 schema subset (tech-spec §2): users ─< memberships >─ workspaces.
// All tables: uuid v7 id (app-side uuidv7 per R-17 — Neon pg has no native v7),
// created_at, updated_at. Roles per REQ-A02.
import {
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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_auth_user_id_uq").on(t.authUserId)]
);

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("memberships_user_workspace_uq").on(t.userId, t.workspaceId),
  ]
);

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type MembershipRole = (typeof membershipRole.enumValues)[number];

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
