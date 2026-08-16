// @respin/db public surface. Audience split (phase-2 handoff contract):
// - app/** may import ONLY: respinDb, WorkspaceAccessError, and types
//   (default-deny lint in respin/eslint.config.mjs enforces this).
// - createDb/schema/seed/testing are for packages/** and tests only.
export * as schema from "./schema";
export {
  membershipRole,
  memberships,
  users,
  workspaces,
  type Membership,
  type MembershipRole,
  type User,
  type Workspace,
} from "./schema";
export {
  configVersions,
  creditKind,
  creditLedger,
  pausePeriods,
  stripeEvents,
  subscriptions,
  type ConfigVersionRow,
  type CreditKind,
  type CreditLedgerRow,
  type PausePeriod,
  type StripeEventRow,
  type Subscription,
} from "./billing-schema";
export { createDb, type Db } from "./client";
export { type DbLike, type TxLike } from "./db-like";
export {
  assertSeedAllowed,
  seedDb,
  CONFIG_V1_SEED,
  DEV_AUTH_USER_ID,
} from "./seed";
export {
  bootstrapInTx,
  ensureUserWorkspace,
  type BootstrapParams,
  type BootstrapResult,
} from "./bootstrap";
export {
  withWorkspace,
  WorkspaceAccessError,
  trustWorkspaceId,
  type VerifiedWorkspaceId,
  type WorkspaceCtx,
  type WorkspaceScope,
} from "./with-workspace";
export { respinDb, getServerDb } from "./app-server";
// Test harness (packages/*/tests only — the app allowlist denies these).
export {
  createTestDb,
  createDockerTestDb,
  seedAuthUser,
  DOCKER_TEST_DB_NAME_PATTERN,
  type TestDb,
} from "./testing";
