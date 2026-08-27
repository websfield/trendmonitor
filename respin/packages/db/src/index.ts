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
  assertScoped,
  writeCapabilities,
  GUARDED_WRITE_FIELDS,
  LEDGER_PAGE_MAX,
  type VerifiedWorkspaceId,
  type VerifiedProfileId,
  type WorkspaceCtx,
  type LedgerPage,
  type WorkspaceAccessors,
  type ProfileAccessors,
  type ProfileWriteCapabilities,
  type SourceEvidenceEntry,
  type AppendOnboardingInputParams,
  type RecordModelUsageParams,
  type WriteBrainDocParams,
  type ConfirmBrainDocParams,
  type ActivateBrainDocParams,
  type VerifiedUserId,
  CALLER_SUPPLIABLE_BRAIN_FIELDS,
} from "./with-workspace";
// THE SCOPES ARE EXPORTED AS TYPES ONLY (plan A-2b), and the distinction is
// load-bearing rather than stylistic. `export type` makes a value import of
// either name TS1362 and `extends` TS1362 — which is what actually stops
// app/** from reaching a class it may hold. ESLint cannot do this job:
// `allowImportNames` makes NO type/value distinction, and four fixtures run
// through the installed engine showed a value import and an `extends` both
// ALLOWED under the allowlist. So the evidence for AC-15 is `tsc`, not lint,
// and the lint denies below cover the separate surface (writeCapabilities,
// VerifiedProfileId) that IS a value.
export type { ProfileScope, WorkspaceScope } from "./with-workspace";
export {
  BrainRoleError,
  WorkspacePausedError,
  ProfileAccessError,
  ProvenanceError,
  ScopeForgeryError,
  UsageRawError,
} from "./errors";
// The creator-data registry is a SOURCE module so M2b's export and deletion
// paths can read it — which requires it to be reachable, and it was not: the
// package `exports` map has only ".", and `CROSS_PACKAGE_DENY` denies
// `@respin/db/src/*`, so only the root test could reach it, by relative path
// (tenancy gate 2026-08-23). Exported here, which is the door it was always
// meant to arrive through.
export {
  CREATOR_DATA_REGISTRY,
  creatorDataEntry,
  type CreatorDataEntry,
  type ExportDecision,
  type DeletionDecision,
} from "./creator-data-registry";
export { hasOpenPause } from "./pause";
export {
  brainKind,
  brainDocStatus,
  brainDocs,
  creatorProfiles,
  frameworks,
  type BrainDoc,
  type BrainDocStatus,
  type BrainKind,
  type CreatorProfile,
  type Framework,
  type FrameworkVisibility,
} from "./brain-schema";
export {
  costState,
  inputClass,
  modelUsage,
  onboardingInputs,
  resolvedTier,
  workspaceSpendMonthly,
  type CostState,
  type InputClass,
  type ModelUsageRow,
  type OnboardingInput,
  type ResolvedTier,
  type WorkspaceSpendMonthlyRow,
} from "./onboarding-schema";
// THE BRAIN CONTENT AND ECHO MODULES REACH A DEPLOYED PROCESS THROUGH HERE.
//
// Until this block existed, NOTHING in `respin/**` imported `brain-content.ts`
// or `echo.ts` outside their own tests. `assertRegistryClosed()` is called at
// module load and a source scan proves the call site exists — but a module no
// deployed process imports never loads, so the guarantee was structurally
// closed and factually dormant: a reviewer planted a bad schema, imported
// `@respin/db`, and measured that nothing threw. A guard that runs only where
// the test runner reaches it is a test, not a guard. `brain-content.test.ts`
// now measures the load through THIS index, so the reachability is asserted
// rather than assumed.
//
// The `exports` map has only ".", so this file is the only door — the same
// reason `creator-data-registry.ts` was exported here.
export {
  CHECK,
  BRAIN_CONTENT_SCHEMAS,
  WRITABLE_BRAIN_KINDS,
  claim,
  serverOwned,
  assertClosedSchema,
  assertRegistryClosed,
  parseBrainContent,
  enumerateClaimFields,
  placeholderFields,
  readPointer,
  SchemaShapeError,
  KindNotYetWritableError,
  ClaimWalkError,
  ContentSchemaError,
} from "./brain-content";
export {
  ECHO_MIN_SEGMENTS,
  REFERENCE_QUOTE_MAX_CHARS,
  REFERENCE_QUOTE_TOTAL_MAX_CHARS,
  assertNoReferenceEcho,
  findReferenceEchoes,
  assertReferenceQuoteBudget,
  echoComparisonForm,
  ContentWalkError,
  SegmenterUnavailableError,
  type ReferenceInput,
  type ReferenceQuoteSpan,
} from "./echo";
export {
  BRAIN_DOC_REASON_CODES,
  renderBrainReason,
  BrainReasonError,
  type BrainDocReason,
  type BrainDocReasonCode,
} from "./brain-reason";
export { respinDb, getServerDb } from "./app-server";
// Test harness (packages/*/tests only — the app allowlist denies these).
export {
  createTestDb,
  createDockerTestDb,
  seedAuthUser,
  DOCKER_TEST_DB_NAME_PATTERN,
  type TestDb,
} from "./testing";
