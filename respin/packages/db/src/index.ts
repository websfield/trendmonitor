// @respin/db public surface. Audience split (phase-2 handoff contract):
// - app/** may import ONLY: respinDb, WorkspaceAccessError, and types
//   (default-deny lint in respin/eslint.config.mjs enforces this).
// - createDb/schema/seed/testing are for packages/** and tests only.
export * as schema from "./schema";
export {
  AUTH_PASSWORD_MAX_LENGTH,
  beginIdentityCancellationRecoverySession,
  CANCELLATION_FACTOR_MAX_ATTEMPTS,
  CANCELLATION_RECOVERY_SESSION_TTL_MS,
  createIdentityCancellationProofWithPassword,
  ordinaryLoginAllowed,
  reauthenticateSessionWithPassword,
  assertReauthenticatedWorkspaceScopeInTx,
  // R-164: the Google reauthentication challenge's server side, and the
  // billing reauthentication arms it adds a member to.
  BILLING_REAUTHENTICATION_ARMS,
  consumeGoogleReauthentication,
  GOOGLE_REAUTH_ATTEMPT_WINDOW_MS,
  GOOGLE_REAUTH_DB_REFUSAL_CODES,
  GOOGLE_REAUTH_MAX_ATTEMPTS,
  GOOGLE_REAUTH_MAX_OUTSTANDING,
  GOOGLE_REAUTH_STATE_PREFIX,
  googleReauthDbRefusalCode,
  recordedGoogleReauthentication,
  reserveGoogleReauthentication,
  stampGoogleReauthentication,
  type BillingReauthenticationArm,
  type GoogleReauthDbRefusalCode,
  type GoogleReauthState,
  type ReauthenticatedSessionRef,
} from "./auth-lifecycle";
export {
  deletionCancellationProofs,
  deletionExternalCommandKind,
  deletionExternalCommandPhase,
  deletionExternalCommands,
  deletionExternalCommandStatus,
  deletionMembershipSnapshots,
  deletionOperations,
  activationCohortDaily,
  activationContributionState,
  deletionOperationTransitions,
  deletionRecoverySessions,
  deletionOperationState,
  deletionScope,
  membershipRecoveryOutcome,
  recoveryDeliveryStatus,
  type DeletionExternalCommand,
  type DeletionExternalCommandKind,
  type DeletionExternalCommandPhase,
  type DeletionExternalCommandStatus,
  type DeletionMembershipSnapshot,
  type DeletionCancellationProof,
  type DeletionOperation,
  type DeletionOperationState,
  type DeletionOperationTransition,
  type DeletionRecoverySession,
  type DeletionScope,
  type MembershipRecoveryOutcome,
  type RecoveryDeliveryStatus,
} from "./lifecycle-schema";
export {
  authMailDeliveryStatus,
  authMailOutbox,
  authMailPurpose,
  type AuthMailDeliveryStatus,
  type AuthMailOutboxRow,
  type AuthMailPurpose,
} from "./auth-mail-schema";
export {
  admitAuthMail,
  AUTH_MAIL_COMPILED_CEILINGS,
  AUTH_MAIL_OUTCOME_RETENTION_MS,
  AUTH_MAIL_PURPOSES,
  AUTH_MAIL_SECURITY_RESERVE,
  AUTH_MAIL_TTL_MS,
  AuthMailDeliveryError,
  AuthMailRefusedError,
  createAuthMailRecoveryDelivery,
  deliverAuthMail,
  recordAuthMailOutcome,
  renderAuthMail,
  resolveAuthMailCeilings,
  sendAdmittedAuthMail,
  sweepExpiredAuthMail,
  type AuthMailAdmission,
  type AuthMailAdmissionParams,
  type AuthMailCeilings,
  type AuthMailMessage,
  type AuthMailPort,
  type AuthMailSendResult,
} from "./auth-mail";
export {
  advanceDeletionOperations,
  DELETION_EXECUTOR_LEASE_MS,
  DELETION_EXECUTOR_MAX_COMMAND_ATTEMPTS,
  DELETION_EXECUTOR_MAX_ERASURE_FAILURES,
  ERASURE_DISABLED,
  eraseOperation,
  erasedWorkspaceOperationIdInTx,
  erasureHold,
  stripeMoneyAmount,
  FINANCIAL_CHAIN_TABLES,
  STRIPE_PAYLOAD_RECEIVER_WIRED,
  unretainedFinancialChainTables,
  type DeletionExecutorOptions,
  type DeletionExecutorPorts,
  type DeletionLifecycleTickSummary,
  type DeletionTickOutcome,
  type ErasureEnablementPort,
  type ErasureResult,
} from "./deletion-executor";
export {
  assertRetentionClockClosure,
  isReceiverExecutor,
  measureKey,
  RETENTION_CLOCKS,
  RETENTION_MEASURES,
  retentionMeasureFor,
  retentionSweepSpecs,
  type RetentionClock,
  type RetentionEffect,
  type RetentionMeasure,
  type RetentionMeasureKey,
  type RetentionPrecondition,
  type RetentionSweepSpec,
} from "./retention-clocks";
export {
  ACTIVATION_EXCLUDED_USER_IDS_ENV,
  ACTIVATION_FULL_SCRIPT_MODES,
  ACTIVATION_METRIC_VERSION,
  ACTIVATION_WINDOW_MS,
  ADMIN_USER_IDS_ENV,
  applyActivationContributionInTx,
  captureActivationContributionInTx,
  classifyActivation,
  deriveActivationCohorts,
  loadActivationSignals,
  NO_ACTIVATION_EXCLUSIONS,
  queryActivation,
  resolveActivationExclusions,
  type ActivationCohort,
  type ActivationContribution,
  type ActivationExclusions,
  type ActivationSignals,
} from "./activation";
export {
  composeDeletionJournal,
  DELETION_JOURNAL_ENV,
  JOURNAL_UNAVAILABLE_CODE,
  parseDeletionJournalEnv,
  resolveAppDeletionJournal,
  unavailableDeletionJournal,
  type DeletionJournalEnv,
  type JournalTransportFactory,
} from "./deletion-journal-compose";
export {
  assertDeletionRequestsEnabled,
  DELETION_REQUEST_SCOPES_ENV,
  DELETION_SCOPES,
  parseDeletionScopeList,
  REQUESTS_DISABLED_CODE,
  resolveDeletionRequestEnablement,
  type DeletionRequestEnablement,
} from "./deletion-request-enablement";
export {
  assertLifecycleRegistration,
  REGISTRATION_SUBJECTS,
  type LifecycleRegistrationInput,
} from "./lifecycle-registration";
export {
  pseudonymousWorkspaceKey,
  runRetentionTick,
  RETENTION_BATCH_SIZE,
  RETENTION_MAX_BATCHES,
  type RetentionTableOutcome,
  type RetentionTickSummary,
} from "./retention-receiver";
export {
  extractFinanceFacts,
  persistFinanceExtractsInTx,
  EXTRACTABLE_OBJECT_TYPES,
  FINANCE_EXTRACTION_VERSION,
  type FinanceExtractInput,
  type FinanceExtractRow,
  type IncompleteReason,
} from "./finance-extract";
export {
  runGenerationRecoveryTick,
  ABANDONED_BEFORE_VENDOR,
  CLAIMED_ABANDON_MS,
  GENERATION_RECOVERY_BATCH,
  UNSETTLED_CANDIDATE_ALERT_MS,
  VENDOR_COMPLETE_HARD_CLEAR_MS,
  VENDOR_COMPLETE_SETTLE_MS,
  VENDOR_STARTED_GRACE_MS,
  isPastVendorCompleteHardClear,
  locateGenerationAttemptForOperator,
  type OperatorAttemptLocation,
  type GenerationRecoveryOptions,
  type GenerationRecoveryOutcome,
} from "./generation-recovery";
export { FORBIDDEN_CLAIM_RULE, refusalIsClaimOnly } from "./generation-refusal";
export {
  createSqlLifecycleMutationPort,
  createSqlResidueProbePort,
  loadTableMetaInTx,
  orderTargetsForExecution,
  PG_BOSS_PHYSICAL_SCHEMA,
  type ErasureReceipt,
} from "./lifecycle-sql-port";
export {
  captureLifecycleSubjectsInTx,
  captureSourceIdsInTx,
  captureVerificationRowsInTx,
  SENTINEL_AUTH_USER_ID,
  SENTINEL_UUID,
  targetAppliesToOperation,
} from "./lifecycle-subjects";
export {
  assertNoUnknownExternalCommands,
  AUTO_TOPUP_DISARMED_FIELDS,
  autoTopupChargeAuthorityArmed,
  dispatchExternalCommands,
  enqueueExternalCommandInTx,
  EXTERNAL_COMMAND_KINDS,
  EXTERNAL_COMMAND_MAX_ATTEMPTS,
  EXTERNAL_COMMAND_PHASE_BY_KIND,
  externalCommandSummary,
  latestExternalCommandInTx,
  recordExternalCommandOutcome,
  retryFailedExternalCommandInTx,
  type AutoTopupChargeAuthority,
  type ExternalCommandPort,
  type ExternalCommandResult,
  type ExternalCommandSummary,
} from "./deletion-external-commands";
export {
  abandonJournalPlan,
  assertDeletionTransition,
  DELETION_GRACE_MS,
  DELETION_JOURNAL_RETAIN_MS,
  DELETION_REAUTH_MAX_AGE_MS,
  // R-162: the caller the five resume seams never had — the worker tick.
  DELETION_WEDGE_RESUME_AFTER_MS,
  IDENTITY_CASCADE_KEY_PREFIX,
  resumeReservedScopedDeletionRequest,
  resumeWedgedDeletionOperations,
  type DeletionWedgeOutcome,
  type DeletionWedgeSeam,
} from "./deletion-lifecycle";
export { NO_SEAT_CAP_RESTORE_POLICY } from "./deletion-ports";
export type {
  DeletionJournalPort,
  JournalTransitionRequest,
  JournalTransitionResult,
  MembershipRestoreCandidate,
  MembershipRestoreDecision,
  HeldMoneyReplayPort,
  HeldMoneyReplaySummary,
  MembershipRestorePolicyPort,
  RecoveryDeliveryPort,
  RecoveryDeliveryRequest,
  RecoveryDeliveryResult,
} from "./deletion-ports";
export {
  canonicalJournalPayload,
  journalReceiptDigest,
  journalRequestChecksum,
} from "./deletion-ports";
// Task 5 — the external deletion journal (R-124). The S3 SDK adapter is
// exported separately (`deletion-journal-s3`) so only the worker composition
// pulls the AWS client in.
export {
  assertJournalConfig,
  createDeletionJournalStore,
  journalObjectBody,
  journalObjectKey,
  journalOperationPrefix,
  journalRetentionRefusal,
  journalVersionSegment,
  parseJournalObjectKey,
  // `DeletionJournalConfigError` is deliberately NOT exported here. It is a
  // deployment-misconfiguration error thrown by `assertJournalConfig`, which
  // only the worker and operator scripts may call — app/** cannot reach it, so
  // it is not part of the app-facing facade and has no billing copy. Exporting
  // it put it on the surface `billing-ui.test.tsx` enumerates, which correctly
  // demanded copy for an error no screen can ever receive.
  JOURNAL_CONFLICT_RETENTION,
  JOURNAL_CONFLICT_SCHEMA,
  JOURNAL_CONFLICT_VERSION_EXISTS,
  JOURNAL_KEY_INFIX,
  JOURNAL_MAX_VERSION,
  JOURNAL_VERSION_PAD,
  type DeletionJournalConfig,
  type DeletionJournalStore,
  type JournalDeleteResult,
  type JournalListedVersion,
  type JournalPurgeTransport,
  type JournalPutRequest,
  type JournalPutResult,
  type JournalReadResult,
  type JournalVerifierTransport,
  type JournalWriterTransport,
} from "./deletion-journal";
export {
  IRREVERSIBLE_STATES,
  compareRestoredState,
  journalPurgeCandidates,
  journalReplayAction,
  listJournalOperations,
  loadJournalChain,
  parseJournalRecord,
  planJournalRestore,
  verifyJournalChain,
  JOURNAL_CONFLICT_CODES,
  JOURNAL_REPLAY_ACTIONS,
  type JournalConflict,
  type JournalConflictCode,
  type JournalOperationChain,
  type JournalOperationListing,
  type JournalReplayAction,
  type JournalReplayStep,
  type JournalRestorePlan,
  type VerifiedJournalRecord,
} from "./deletion-journal-restore";
export {
  describeForecast,
  forecastDeletionJournalCost,
  journalEnablementDecision,
  parseUsdToNano,
  validatePriceSnapshot,
  JOURNAL_FORECAST_ALERT_CENTS,
  JOURNAL_FORECAST_CEILING_CENTS,
  JOURNAL_FORECAST_WITHHELD_CODES,
  JOURNAL_PRICE_SNAPSHOT_MAX_AGE_DAYS,
  R124_LAUNCH_ENVELOPE,
  type DeletionJournalForecast,
  type ForecastInput,
  type JournalEnablementDecision,
  type JournalForecastWithheldCode,
  type JournalUsageBasis,
  type S3PriceSnapshot,
  type SnapshotValidation,
} from "./deletion-journal-cost";
export {
  assertIdentityAcceptsMembership,
  assertFreshProfileAuthority,
  assertFreshWorkspaceAuthority,
  assertProfileLifecycleAccess,
  assertProfileLifecycleTransactionAccess,
  assertWorkspaceAcceptsMembership,
  assertWorkspaceLifecycleAccess,
  assertWorkspaceLifecycleTransactionAccess,
  lockIdentityMembershipGraph,
  lockWorkspaceMembershipGraph,
  workspaceAcceptsMembership,
  sortedWorkspaceIds,
  withMembershipGraphLocks,
  // Audit Phase 8 (R-177): the two lock forms and the lock-order guard.
  BILLING_LOCK_HELD_SETTING,
  LockOrderError,
  MEMBERSHIP_KEYS_SETTING,
  type MembershipLockMode,
} from "./membership-lifecycle";
export {
  // Audit Phase 8 (P8-R1, R-177): the render budget.
  LOCK_NOT_AVAILABLE_SQLSTATE,
  RENDER_LOCK_TIMEOUT_MS,
  RenderLockTimeoutError,
  RenderTransactionNestingError,
  boundedReadOrJoin,
  isOpenTransaction,
  sqlStateOf,
  withBoundedReadTransaction,
  withRenderTransaction,
} from "./render-transaction";
export {
  // R-163: the read grade's lifecycle siblings and its window.
  assertProfileReadAccess,
  assertProfileReadTransactionAccess,
  assertWorkspaceReadAccess,
  assertWorkspaceReadTransactionAccess,
  newestWorkspaceDeletionAdmitsRead,
  READ_GRADE_BLOCKED_EXCLUDED_RESUME_STATES,
  READ_GRADE_DELETION_STATES,
} from "./read-grade-lifecycle";
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
  autoTopupProtocolRollouts,
  configVersions,
  creditKind,
  creditLedger,
  pausePeriods,
  stripeEvents,
  subscriptions,
  tierCheckoutProtocolRollouts,
  type AutoTopupProtocolRollout,
  type ConfigVersionRow,
  type CreditKind,
  type CreditLedgerRow,
  type PausePeriod,
  type StripeEventRow,
  type Subscription,
  type TierCheckoutProtocolRollout,
} from "./billing-schema";
export {
  createDb,
  createSystemWorkerDb,
  closeSystemWorkerDb,
  SYSTEM_WORKER_QUERY_POOL_CODE_CEILING,
  // Phase 6 billing gate (R-175): the public pages' own small pool.
  createMarketingReadDb,
  MARKETING_READ_POOL_MAX,
  MARKETING_READ_STATEMENT_TIMEOUT_MS,
  MARKETING_READ_CONNECT_TIMEOUT_MS,
  type Db,
} from "./client";
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
  assertFreshProfileScopeInTx,
  assertFreshWorkspaceScopeInTx,
  WorkspaceAccessError,
  // R-163: the write grade's refusal for a pending-deletion-only identity,
  // naming /settings/account (billing-errors gives it copy).
  WorkspacePendingDeletionError,
  trustWorkspaceId,
  assertScoped,
  // R-163: the readers' assertion (never a widening of `assertScoped`), the
  // grade check, and the reader-side profile mint for either grade.
  assertReadScoped,
  isReadGradeScope,
  mintReadableProfileScope,
  ReadGradeProfileScope,
  ReadGradeWorkspaceScope,
  type ReadGradeProfileAccessors,
  type ReadGradeWorkspaceAccessors,
  type ReadGradeWorkspaceId,
  type WorkspaceGradeOptions,
  writeCapabilities,
  workspaceWriteCapabilities,
  normaliseDisplayName,
  DISPLAY_NAME_MAX,
  GUARDED_WRITE_FIELDS,
  CALLER_SUPPLIABLE_PROFILE_FIELDS,
  LEDGER_PAGE_MAX,
  ONBOARDING_PAGE_MAX,
  HELD_GENERATION_ATTEMPTS_MAX,
  // Launch L3 (R-152): the plan's count bounds on recent context, and the
  // shapes of the one composition accessor that reads it.
  RECENT_DRAFTS_MAX,
  RECENT_NOTES_MAX,
  type RecentContextCandidates,
  type RecentContextNote,
  type RecentContextQuery,
  type VerifiedWorkspaceId,
  type VerifiedProfileId,
  type WorkspaceCtx,
  type LedgerPage,
  type WorkspaceAccessors,
  type ProfileAccessors,
  type ProfileWriteCapabilities,
  type WorkspaceWriteCapabilities,
  type SourceEvidenceEntry,
  type AppendOnboardingInputParams,
  type RecordModelUsageParams,
  type WriteBrainDocParams,
  type ConfirmBrainDocParams,
  type ActivateBrainDocParams,
  // Slice 6 (R14/R14b/R14c) — the generation claim's write surface. The
  // ERROR CLASS is exported as a VALUE, not a type: `@respin/credits` catches
  // it to tell a lost claim race apart from a genuine failure, and a class it
  // cannot `instanceof` is a refusal that degrades to "something went wrong".
  GenerationAttemptStateError,
  type ClaimGenerationAttemptParams,
  type ClaimGenerationAttemptResult,
  type AdvanceGenerationAttemptParams,
  type SettleGenerationParams,
  type SettleGenerationResult,
  // Slice 9a. The caller-suppliable half of one logged result — the type the
  // `/results` form's action builds and `respinDb.recordResult` takes. The
  // capability itself is NOT exported here and never will be: `app/**` cannot
  // import `writeCapabilities` at all.
  type RecordResultParams,
  type PerformanceLearningEntitlement,
  // Slice 9a, the truncated-population fix: the bound one comparison may be
  // computed over. Exported so a caller can name the number in copy without
  // re-typing it - the `ComparableResults` return carries it too, for a caller
  // that would rather not import at all.
  COMPARISON_POPULATION_MAX,
  type VerifiedUserId,
  CALLER_SUPPLIABLE_BRAIN_FIELDS,
  monthlySpend,
  type MonthlySpendResult,
  // Slice 6, R17a: credit burn by the mode each debit's attempt settled into.
  burnByMode,
  type BurnByModeBucket,
  type BurnByModeResult,
  type BurnByModeRow,
  usageRunwayDebits,
  type UsageRunwayDebits,
  brainAssetSummary,
  hasGenerationForProfile,
  type BrainAssetSummary,
} from "./with-workspace";
// Slice 2b's spend-record surface — the month truncation the rollup upsert
// uses (composed into `recordModelUsage` already, inside `with-workspace.ts`),
// the deletion executor's pseudonymisation obligation (R-30.5/R-54), and the
// operator reconciliation query (R-30.9/R-41). Exported here for the same
// reason `creator-data-registry.ts` is: the package's own suites and the
// `respinDb` facade both need to reach it, and the `exports` map has only ".".
export {
  periodMonthUtc,
  pseudonymiseWorkspaceSpend,
  reconcileSpend,
  type IncludedBuildPurposesFor,
  type SpendReconciliationClass,
  type SpendReconciliationResult,
  type SpendReconciliationRow,
  type UnbilledAttempt,
} from "./spend-rollup";
// THE SCOPES ARE EXPORTED AS TYPES ONLY (plan A-2b), and the distinction is
// load-bearing rather than stylistic. `export type` makes a value import of
// either name TS1362 and `extends` TS1362 — which is what actually stops
// app/** from reaching a class it may hold. ESLint cannot do this job:
// `allowImportNames` makes NO type/value distinction, and four fixtures run
// through the installed engine showed a value import and an `extends` both
// ALLOWED under the allowlist. So the evidence for AC-15 is `tsc`, not lint,
// and the lint denies below cover the separate surface (writeCapabilities,
// VerifiedProfileId) that IS a value.
export type { HeldGenerationAttempt, ProfileScope, WorkspaceScope } from "./with-workspace";
export {
  BrainEditEmptyError,
  // Slice 5 gate round 1, G3. The no-op edit refusal, split off
  // `ProvenanceError` so `/brain` stops telling a creator who submitted an
  // unchanged form that their page went stale. Exported for the same reason
  // every typed refusal in this block is: the completeness scan in
  // `tests/billing-ui.test.tsx` enumerates the WHOLE root export, so a class
  // reachable from `editBrainDocument` without copy here would render
  // "Something went wrong".
  BrainEditUnchangedError,
  BrainEditBusyError,
  BrainEditLimitError,
  BrainDocumentLimitError,
  BrainRoleError,
  BrainVersionLimitError,
  ExportBusyError,
  OnboardingInputLimitError,
  WorkspacePausedError,
  ProfileAccessError,
  ProfileCapError,
  ProfileNameError,
  ProfileRoleError,
  PostContentError,
  PostAttestationError,
  ProvenanceError,
  ReferenceEchoError,
  ScopeForgeryError,
  UsageRawError,
  // Slice 3b (Stage B1). The interview draft's two typed refusals — see their
  // docblocks in ./errors.ts. Exported here for the same reason every other
  // typed refusal in this block is: the completeness scan in
  // `tests/billing-ui.test.tsx` enumerates the WHOLE root export, so a class
  // reachable from `saveInterviewDraft`/`submitInterview` without copy here
  // would render "Something went wrong" the moment the interview UI called it.
  InterviewAnswerError,
  InterviewDraftSubmittedError,
} from "./errors";
// ---------------------------------------------------------------------------
// SLICE 7's TEN TYPED REFUSALS — EXPORTED HERE BY STAGE D, WITH THEIR COPY.
//
// STAGE A WROTE THEM AND DELIBERATELY WITHHELD THE ROOT EXPORT, for a real
// coupling rather than caution: `tests/billing-ui.test.tsx` enumerates every
// `Error` subclass this root exports and fails unless
// `app/(product)/billing-errors.ts` carries copy for it — by design, so that a
// refusal can never degrade to "Something went wrong" — and that file is the
// app surface, which stage A did not own. Exporting first would have left the
// suite red on a contract nobody had broken.
//
// THIS IS THE DISCHARGE. Verified in the same action that records it: each of
// the ten below has a `HANDLERS` entry and a `BILLING_ERROR_COPY` entry in
// `app/(product)/billing-errors.ts`, and each is named in the `@respin/db`
// `allowImportNames` block in `eslint.config.mjs` — all three in one change,
// which is what stage A's obligation asked for.
//
//   GenerationLineageError     — the revision's parent is not this creator's,
//                                does not exist, or is not older than it.
//   FeedbackReactionError      — an unknown reaction code (a stale page or a
//                                tampered form; reloading is the remedy).
//   FeedbackNoteError          — a blank-but-present or oversized note.
//   FeedbackDuplicateError     — that reaction is already recorded here, and
//                                the note just typed was NOT kept.
//   FeedbackTargetError        — the output the feedback is about is not this
//                                creator's (byte-identical for foreign,
//                                missing and malformed ids).
//   FeedbackExclusionTargetError — "Leave this out of future drafts" named a
//                                reaction that is not this creator's (audit
//                                P6-A1, R-174; byte-identical likewise).
//   FrameworkAccessError       — not this profile's framework (byte-identical
//                                for foreign, missing and shared-row ids).
//   FrameworkStaleError        — edited against a superseded version; reload.
//   FrameworkContentError      — REQ-D04: a handle, link, metric or named
//                                person in framework content.
//   FrameworkLimitError        — a framework size/count ceiling.
//   PrivateFrameworkTierError  — REQ-D05: the plan does not include private
//                                frameworks (copy must NOT sell an upgrade —
//                                the `profile_cap`/`ModeNotInPlanError` rule).
//
// TEN, not the seven the sentence above this list first claimed when stage A
// wrote it — the list is the authority, and it grew twice while that stage was
// written (once when the framework limits and the tier refusal were split out,
// once when the author's adversarial re-read found `FeedbackTargetError`'s two
// live defects). Count the entries, never the adjective. ELEVEN since audit
// P6-A1 added `FeedbackExclusionTargetError`.
export {
  GenerationLineageError,
  FeedbackReactionError,
  FeedbackNoteError,
  FeedbackDuplicateError,
  FeedbackTargetError,
  FeedbackExclusionTargetError,
  FrameworkAccessError,
  FrameworkStaleError,
  FrameworkContentError,
  FrameworkLimitError,
  PrivateFrameworkTierError,
} from "./errors";
// Launch L2 (R-151): the creative piece's one typed refusal, with a closed
// `reason`. Exported with its copy and its instance branch in
// `app/(product)/billing-errors.ts` in the same change.
export {
  CreativePieceError,
  CREATIVE_PIECE_REFUSALS,
  type CreativePieceRefusal,
} from "./errors";
export {
  OWN_IDEA_MAX,
  type CreateCreativePieceParams,
  type CreativePieceMoveParams,
  type CreativePieceRead,
  type RenewCreativePieceOperationParams,
  // Launch L4 (R-153): the saved recording pack's context read and its
  // zero-cost "use this version" move.
  PIECE_VERSIONS_MAX,
  type PieceVersionRow,
  type SavedGenerationContext,
  type SelectCreativePieceVersionParams,
} from "./creative-work-ops";
// Slice 9a's four refusals. THEIR OBLIGATION IS NOT YET DISCHARGED, and this
// is the record rather than a silent export: the ten above each have a
// `HANDLERS` entry and a `BILLING_ERROR_COPY` entry in
// `app/(product)/billing-errors.ts` and a name in the `@respin/db`
// `allowImportNames` block of `eslint.config.mjs`. These four have NEITHER
// yet, because 9a's `/results` route and the import-boundary allowlist are
// owned by the builders shipping alongside this one. Until both land, a
// `recordResult` refusal reaching a screen renders as "Something went wrong" —
// the exact outcome each typed refusal exists to prevent — so the route slice
// owes all three edits in one change, the way stage A's obligation was
// discharged above.
//
//   TreatmentKeyError   — what a result tested could not be identified from
//                         the generation it names (C4). Nothing stored.
//   ResultInputError    — the numbers, labels, window or note on the form do
//                         not describe a storable observation (R6-R9), or the
//                         profile has declared no usable north-star metric to
//                         measure against (R8).
//   ResultTargetError   — the output the result is about is not this
//                         creator's (byte-identical for foreign, missing and
//                         malformed ids).
//   ResultDuplicateError— that output, metric and window is already logged;
//                         the numbers just typed were NOT kept.
//   ComparisonStratumError - the population a comparison was asked for over
//                         is not one this product can describe. RAISED BY A
//                         SCOPED READ, not by a write, and it is the fifth
//                         because splitting it OUT of `WorkspaceAccessError`
//                         is what stopped a creator being told to "sign in
//                         with the account that owns it" for our own malformed
//                         argument (2026-09-04). 9a NEVER RAISES IT - the
//                         screen passes no stratum - so its copy is owed by
//                         the slice that adds the first stratum-passing
//                         caller, which is 9b.
export {
  TreatmentKeyError,
  ResultInputError,
  ResultTargetError,
  ResultDuplicateError,
  ComparisonStratumError,
  PerformanceLearningEntitlementError,
  PromotionAccessError,
  PromotionPayloadError,
  PromotionFreshnessError,
  PromotionDecisionError,
} from "./errors";
// ---------------------------------------------------------------------------
// The creator-data registry is a SOURCE module so M2b's export and deletion
// paths can read it — which requires it to be reachable, and it was not: the
// package `exports` map has only ".", and `CROSS_PACKAGE_DENY` denies
// `@respin/db/src/*`, so only the root test could reach it, by relative path
// (tenancy gate 2026-08-23). Exported here, which is the door it was always
// meant to arrive through.
export {
  APP_TABLES,
  ROW_CLASSES_BY_TABLE,
  LIFECYCLE_REGISTRY,
  LIFECYCLE_WRITER_INVENTORY,
  EXTERNAL_WRITER_AUTHORITIES,
  SUPPORTING_LIFECYCLE_STORES,
  PG_BOSS_JOB_FIELDS,
  PG_BOSS_JOB_JSON_PATHS,
  PG_BOSS_QUEUE_STATS_FIELDS,
  SPLIT_TABLE_FIELD_SETS,
  ROW_CLASS_INVENTORY,
  JSON_PATH_INVENTORY,
  JSON_COLUMN_INVENTORY,
  validateLifecycleClosure,
  CREATOR_DATA_REGISTRY,
  creatorDataEntry,
  type AppTable,
  type DataScope,
  type DataRowClass,
  type RowClassFor,
  type LifecycleAction,
  type LifecycleClassEntry,
  type LifecycleFieldSet,
  type LifecycleFieldSetFor,
  type LifecycleFieldSetName,
  type SplitTable,
  type SplitFieldFor,
  type RetentionRule,
  type ExecutorId,
  type ProbeId,
  type ExternalWriterAuthority,
  type SupportingLifecycleStoreEntry,
  type CreatorDataEntry,
  type ExportDecision,
  type DeletionDecision,
} from "./creator-data-registry";
export {
  migrationInventory,
  inventoryTable,
  validateLifecycleSourceInventory,
  type MigrationSource,
  type MigrationTable,
  type MigrationForeignKey,
  type MigrationInventory,
  type LifecycleWriterInventoryEntry,
  type RowClassInventoryEntry,
  type JsonPathInventoryEntry,
  type JsonColumnInventoryEntry,
} from "./lifecycle-inventory";
export {
  LIFECYCLE_EXECUTORS,
  compileLifecycleExecutionTargets,
  lifecycleTargetMatchesRow,
  type LifecycleExecutionTarget,
  type LifecycleRowSelector,
  type IdentityLifecycleSubject,
  type BetterAuthVerificationSnapshot,
  type LifecycleSourceIdSnapshot,
  type ProfileLifecycleSubject,
  type WorkspaceLifecycleSubject,
  type SystemLifecycleSubject,
  type RelatedLifecycleSubject,
  type LifecycleSubject,
  type LifecycleRuntimeSubjects,
  type LifecycleSubjectField,
  type LifecycleSubjectMatch,
  type LifecycleSnapshotSet,
  type LifecycleSnapshotLocation,
  type LifecycleSnapshotMatch,
  type LifecycleSubjectPredicate,
  type LifecycleMutationPort,
  type LifecycleExecutorImplementation,
  type LifecycleExecutorImplementations,
} from "./lifecycle-executors";
export {
  LIFECYCLE_PROBES,
  deriveExpectedResidueProbes,
  residueProbeMatchesRow,
  assertProbeClosure,
  assertExecutorProbeAgreement,
  type ExpectedResidueProbe,
  type ResidueProbePort,
  type ResidueProbeImplementation,
  type ResidueProbeImplementations,
} from "./lifecycle-probes";
export { hasOpenPause } from "./pause";
export {
  brainKind,
  brainDocStatus,
  brainDocs,
  creatorProfiles,
  creatorProfileState,
  frameworks,
  membershipProfileSelections,
  type BrainDoc,
  type BrainDocStatus,
  type BrainKind,
  type CreatorProfile,
  type CreatorProfileState,
  type Framework,
  type FrameworkVisibility,
  type MembershipProfileSelection,
  type NewMembershipProfileSelection,
} from "./brain-schema";
// Slice 6 — the generation substrate. Exported through the root for the same
// reason every other schema module is: the `exports` map has only ".", so this
// is the door `packages/**` and the package's own suites arrive through. The
// WRITE surface is not here and never will be: it lives on
// `writeCapabilities`, which `app/**` cannot import at all.
export {
  generationAttempts,
  generationAttemptState,
  generationOutcome,
  generations,
  type Generation,
  type GenerationAttempt,
  type GenerationAttemptState,
  type GenerationOutcome,
  type NewGeneration,
  type NewGenerationAttempt,
  // Slice 7 (R10). The feedback table and its CLOSED reaction vocabulary. The
  // table object is denied to `app/**` by the same default-deny that denies
  // every other one; the reaction list is inert data the feedback UI renders
  // its buttons from, so it is allowlisted there rather than hand-copied —
  // the `INTERVIEW_FIELDS` precedent.
  GENERATION_FEEDBACK_REACTIONS,
  generationFeedback,
  generationFeedbackReaction,
  type GenerationFeedbackReaction,
  type GenerationFeedbackRow,
  type NewGenerationFeedback,
  // Launch L2 (R-151): the creative piece. Writes are capabilities on
  // `writeCapabilities` only; the table object is denied to `app/**` like
  // every other one.
  creativePieces,
  creativePieceState,
  type CreativePiece,
  type CreativePieceState,
} from "./generation-schema";
// Slice 9a — the logged result. Exported through the root for the same reason
// every other schema module is: the `exports` map has only ".", so this is the
// door `packages/**` (including `@respin/brain`'s comparison builder, which
// takes `ResultRow[]`) and the package's own suites arrive through. The WRITE
// surface is not here: it is `recordResult` on `writeCapabilities`, which
// `app/**` cannot import at all.
//
// The three VOCABULARIES are inert data the results UI renders its controls
// from, allowlisted to `app/**` for the reason `GENERATION_FEEDBACK_REACTIONS`
// is — the alternative is a hand-copied second list, which is how two
// vocabularies drift. `treatmentKeyFor` and `declaredMetricOf` are exported
// because they are the ONE producer and the ONE reader of their respective
// facts (C3/C4), and a second copy of either is a second answer.
// THE COMPARISON'S OWN REFUSAL, RE-EXPORTED FROM `@respin/brain` THROUGH THIS
// FACADE. `app/**` may not import `@respin/brain` — that boundary is deliberate
// (the comparison builder trusts its caller to have scoped the rows, so the
// code that fetches and the code that compares must not be separated by a
// boundary a screen can reach across) — and `app/(product)/billing-errors.ts`
// needs the CLASS to map it to copy with `instanceof`.
//
// A RE-EXPORT RATHER THAN WIDENING THE BOUNDARY, which is the whole point: the
// screen gets the one inert value it needs to render a readable refusal, and
// gains no access to the builder, the vocabulary or anything else in that
// package. Without this, all NINE of its throw sites render "Something went
// wrong" — registered open finding `8c-R15`'s exact shape, in the slice whose
// subject is honesty.
export { ComparisonInputError } from "@respin/brain";
export {
  RESULT_AUDIENCE_CLASSES,
  RESULT_CONFOUNDER_CODES,
  RESULT_EVIDENCE_STATES,
  RESULT_LEVERS,
  declaredMetricOf,
  resultAudienceClass,
  resultEvidenceState,
  results,
  treatmentKeyFor,
  type ComparableResultRow,
  type ComparableResults,
  type ComparableResultsStratum,
  type DeclaredMetric,
  type NewResult,
  type ResultAudienceClass,
  type ResultConfounderCode,
  type ResultEvidenceState,
  type ResultLever,
  type ResultRow,
} from "./results-schema";
// Slice 8 non-tenant worker accounting. These operations deliberately accept a
// raw DB handle; they cannot take a WorkspaceScope because no sessionless
// product-overhead spend may acquire a creator or workspace identity.
// The one wall-clock family (lease, per-stage deadline ceiling, job expiry)
// and its refusal — the worker derives its bounds from these, never a literal.
// The refusal's error CLASS stays package-private on purpose: only the
// sessionless worker resolves `llm.overallDeadlineMs`, so no facade can hand
// it to `app/**`, and exporting it would oblige `billing-errors.ts` to carry
// copy for a screen that can never receive it.
export {
  AUTOPSY_ATTEMPT_WALL_CLOCK_CODE_CEILING_MS,
  AUTOPSY_CLAIM_LEASE_MS,
  AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS,
  assertAutopsyDeadlineWithinLease,
} from "./autopsy-policy";
export {
  AUTOPSY_ATTEMPT_CODE_CEILING,
  AUTOPSY_VENDOR_CALLS_PER_ATTEMPT,
  SYSTEM_AUTOPSY_DAILY_CODE_CEILING_MICRO_USD,
  SYSTEM_SPEND_PURPOSES,
  PUBLIC_SAMPLE_SPIN_DAILY_CODE_CEILING_MICRO_USD,
  PUBLIC_SAMPLE_SPIN_MAX_CONCURRENT,
  PUBLIC_SAMPLE_SPIN_VENDOR_CALLS_MAX,
  PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS,
  PUBLIC_SAMPLE_SPIN_DEADLINE_CODE_CEILING_MS,
  PUBLIC_SAMPLE_SPIN_FINALISE_MARGIN_MS,
  reconcileSystemModelUsage,
  claimSystemSpend,
  claimSystemSpendInTx,
  recordSystemModelUsage,
  publicSampleSpinInFlightCount,
  recoverStalePublicSampleSpinAttempts,
  type SystemSpendPurpose,
  type SystemSpendAttribution,
  type SystemSpendClaim,
  type SystemSpendClaimResult,
  type RecordSystemModelUsage,
  SYSTEM_AUTOPSY_DISPATCH_BATCH_CODE_CEILING,
  recordSystemWorkerHealth,
  createSystemAutopsyAttemptStore,
  recoverStaleSystemAutopsyAttempts,
  systemAutopsyQueueCandidates,
  systemWorkerOperationalState,
  type SystemWorkerHealthSnapshot,
  type SystemWorkerOperationalState,
  type SystemAutopsyQueueCandidate,
  type SystemAutopsyAttemptStore,
  type SystemAutopsyAttemptClaim,
  type SystemAutopsyAttemptRecord,
} from "./system-spend";
export {
  createTrendSource,
  recordSharedTrendItem,
  recordPrivateTrendItem,
  recordPrivateTrendTranscript,
  recordSharedTrendTranscript,
  digestTranscriptContent,
  claimSharedAutopsyForSystem,
  claimPrivateAutopsyForSystem,
  trackNicheForProfile,
  trackedNichesForProfile,
  systemRefreshNiches,
  SYSTEM_REFRESH_NICHE_BATCH_CODE_CEILING,
  untrackNicheForProfile,
  feedItemsForProfile,
  trendFeedProjection,
  reusableAutopsyForProfile,
  spinReferenceForProfile,
  // Launch L4 (R-153 amendment A2): a saved Spin's reference, for display.
  spinReferenceSummaryForProfile,
  // Slice 8c (R-96): the paste intake `@respin/credits` composes its R-98
  // debit around, its owner-only readers, and the URL rule they key on.
  intakePastedReference,
  pastedReferencesForProfile,
  pastedReferenceForProfile,
  // Fix round 1: the money's own population — EVERY parked private claim, not
  // the newest one per item the display projection returns.
  parkedAutopsyClaimsForProfile,
  normalisePastedReferenceUrl,
  AUTOPSY_ANALYSIS_VERSION,
  PASTED_REFERENCE_TITLE_MAX,
  type SharedTrendItemInput,
  type PrivateTrendItemInput,
  type UnavailableBaselineTrendItemInput,
  type SharedTrendTranscriptInput,
  type PrivateTrendTranscriptInput,
  type CreatorPasteProvenance,
  type SharedSystemAutopsyClaimResult,
  type PrivateSystemAutopsyClaimResult,
  type SystemAutopsyClaimResult,
  type ScopedSpinReference,
  type SpinReferenceSummary,
  type TrackedNicheEntitlement,
  type TrendFeedItem,
  type CanonicalAutopsyAnalysis,
  type PastedReferenceIntakeInput,
  type PastedReferenceIntakeResult,
  type PastedReference,
  type PastedReferenceClaim,
  type PastedReferenceClaimStatus,
  parseCanonicalAutopsyAnalysis,
} from "./trends-storage";
export {
  autopsies,
  autopsyCacheClaims,
  trendItems,
  trendSources,
  trendTranscripts,
  trackedNiches,
  trendRightsScope,
  transcriptState,
  trendSaturation,
  trendBaselineState,
  systemModelUsage,
  systemModelUsageReconciliations,
  systemSpendClaims,
  systemSpendDaily,
  systemWorkerHealth,
  systemCostState,
  systemUsageOutcome,
  type Autopsy,
  type AutopsyCacheClaim,
  type TrendItem,
  type TrendTranscript,
  type TrackedNiche,
  type SystemModelUsage,
  type SystemModelUsageReconciliation,
  type SystemWorkerHealth,
} from "./schema";
// Slice 7 (R5a-R5c). The shared library, the mechanism-level content scan and
// the private-framework operations. The WRITE surface here takes a
// `WorkspaceScope` and a `db` handle, so — like `appendOwnPost` and the
// interview trio — `app/**` reaches it only through `respinDb`, never by
// importing these functions; the default-deny allowlist is what enforces that.
export {
  approvePrivateFramework,
  assertMechanismLevel,
  createPrivateFramework,
  deriveFrameworkConfidence,
  editPrivateFramework,
  eligibleFrameworks,
  frameworkContentSchema,
  frameworkSlug,
  listPrivateFrameworks,
  retirePrivateFramework,
  proposeSharedFramework,
  assertAutopsyFrameworkCandidate,
  assertAutopsyMechanismContent,
  resolveAutopsyFramework,
  seedSharedFrameworks,
  sharedFrameworkLibrary,
  FRAMEWORK_GOALS,
  FRAMEWORK_NICHES,
  FRAMEWORK_SOURCE_KINDS,
  FRAMEWORK_CONFIDENCE_RUNGS,
  MECHANISM_CONTENT_RULES,
  SATURATION_NOTICE,
  SHARED_FRAMEWORK_SEED,
  type EligibleFramework,
  type FrameworkConfidence,
  type FrameworkContent,
  type FrameworkGoal,
  type FrameworkNiche,
  type FrameworkSourceKind,
  type PrivateFrameworkEntitlement,
  type AutopsyFrameworkResolution,
  // The bounds the framework UI states. Inert numbers re-exported from
  // `storage-limits.ts` through `frameworks.ts`, for the reason
  // `POST_CONTENT_MAX` is exported through `onboarding-ops.ts`: one source, so
  // a form attribute and the copy beside it cannot drift from the refusal.
  FRAMEWORK_LIST_MAX,
  FRAMEWORK_NAME_MAX,
  FRAMEWORK_TEXT_MAX,
  FRAMEWORK_VERSION_MAX,
  PRIVATE_FRAMEWORK_COUNT_MAX,
} from "./frameworks";
// Slice 7 (R10/R11). The two feedback operations. Like every other module-level
// operation in this package they take a `db` handle, so `app/**` reaches them
// through `respinDb.recordFeedback` / `.listFeedback` only — the allowlist
// denies the functions themselves, the same rule `appendOwnPost` follows.
export {
  listFeedback,
  recordFeedback,
  // Audit P6-A1 (R-174): "Leave this out of future drafts".
  excludeFeedbackFromHistory,
  // Launch L3 (R-152): the explicit, reviewable preference edit.
  REMEMBERED_PREFERENCE_KIND,
  rememberForFutureDrafts,
} from "./feedback-ops";
export {
  selectActiveProfile,
  selectActiveProfileInTx,
  selectedProfileForMember,
} from "./profile-selection";
export {
  // Slice 6: the coherent-activation table. Exported so `latestBrainActivation`
  // and the generation path's provenance can be asserted against the rows
  // themselves; the only WRITER remains `activateBrainDocCoherent`, which
  // `tests/table-writers.test.ts` pins.
  brainActivationSnapshots,
  costState,
  // R-80: the durable per-(profile, purpose) claim on the included build.
  // Exported so tests can read the row the database decided on, and so the
  // migration-shape and table-writer scans can name the table.
  firstBillableAttempts,
  inputClass,
  modelUsage,
  onboardingInputs,
  resolvedTier,
  workspaceSpendMonthly,
  // Slice 2a: the outcome enum and its billability classification. Exported so
  // `@respin/credits` can assert that ITS duplicate of the five values (which
  // it must duplicate — a provider adapter cannot depend on the database) is
  // still the same set, rather than trusting a comment that says it is.
  usageOutcome,
  USAGE_OUTCOME_BILLABLE,
  BILLABLE_USAGE_OUTCOMES,
  type CostState,
  type FirstBillableAttempt,
  type InputClass,
  type StoredInputClass,
  type ModelUsageRow,
  type OnboardingInput,
  type ResolvedTier,
  type UsageOutcome,
  type WorkspaceSpendMonthlyRow,
  // Slice 3b (Stage B1). The interview draft ROW type — `respinDb.getInterviewDraft`
  // returns one, and the onboarding UI reads `.answers` (cast to `InterviewAnswers`,
  // below) and `.submittedAt` off it directly.
  type OnboardingInterviewDraft,
  type BrainActivationSnapshot,
} from "./onboarding-schema";
export {
  promotionProposalSource,
  promotionProposalStatus,
  promotionProposalStrength,
  promotionProposals,
  proposalEvidenceFeedback,
  proposalEvidenceResultRole,
  proposalEvidenceResults,
  type NewPromotionProposal,
  type PromotionProposal,
  type PromotionDecisionRole,
  type PromotionProposalSource,
  type PromotionProposalStatus,
  type PromotionProposalStrength,
  type PromotionTargetKind,
  type ProposalEvidenceFeedback,
  type ProposalEvidenceResult,
  type ProposalEvidenceResultRole,
} from "./promotion-schema";
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
  // Slice 3b (Stage B1). The declared north-star metric's closed direction
  // vocabulary — the interview UI's `metricDirection` select renders exactly
  // these two options, one source shared with `brain-content.ts`'s own schema
  // rather than a hand-copied pair.
  METRIC_DIRECTIONS,
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
// Slice 1's intake operations. Exported here as well as bound on `respinDb`
// because the package's own suites drive them against a test handle — the
// facade's copies can only reach a real `DATABASE_URL`.
export {
  appendOwnPost,
  appendReferencePost,
  listOnboardingInputs,
  mintProfileScope,
  POST_CONTENT_MAX,
  POST_COUNT_MAX,
  REFERENCE_COUNT_MAX,
} from "./onboarding-ops";
// Slice 3's brain surface — read the versions, record the confirmation,
// activate. Exported here for the same reason as slice 1's trio above: the
// package's own suites drive them against a test handle.
// Slice 3b (Stage B2) extends the trio to `strategy`/`killtest`, and adds ONE
// coherent activation entrypoint used by all three kinds (R8) — see
// `brain-ops.ts`'s own docblocks for why activation is not split per kind the
// way confirmation is.
export {
  readVoiceBrain,
  readStrategyBrain,
  readKillTestBrain,
  readBrainHistory,
  claimsForHistory,
  replacementVersionFor,
  editBrainDocument,
  editDeclaredMetric,
  withBrainEditSlot,
  BRAIN_EDIT_MAX_FIELDS,
  BRAIN_EDIT_LIST_MAX,
  BRAIN_EDIT_POINTER_MAX,
  BRAIN_EDIT_VALUE_MAX,
  BRAIN_EDIT_TOTAL_MAX,
  claimsFor,
  confirmVoiceFields,
  confirmStrategyFields,
  confirmKillTestFields,
  // `activateVoice` is deliberately absent: slice 3's single-document
  // activation was deleted in the 2026-09-01 tenancy gate round because it
  // wrote no `brain_activation_snapshots` row and had no `app/**` caller —
  // see the note in `brain-ops.ts`. `activateBrainCoherent` is the whole
  // activation surface.
  activateBrainCoherent,
  EvidenceUnreadableError,
  type BrainDocsView,
  type BrainVersionView,
  type BrainClaimView,
  type BrainClaimEdit,
  type DeclaredMetricEdit,
} from "./brain-ops";
export {
  carriesUnverifiedEvidence,
  type DecidePromotionProposalParams,
  type LearningEligibility,
  type PromotionDecisionResult,
  type PromotionProposalReview,
  type PromotionReviewClaim,
} from "./promotion-ops";
// Phase 10a plan C1 (R-115): the pre-deploy result-proposal audit.
export {
  auditResultProposals,
  renderProposalAudit,
  supersedeUnverifiedResultProposals,
  type ProposalAuditReport,
} from "./promotion-audit";
// ONE exporter (slice 5 gate round 1). `exportBrain`/`exportBrainFile` and
// their materialising helpers had zero `app/**` callers while carrying every
// export witness, so they are gone and `openBrainExport` is the whole surface.
//
// The label maps, the two absence sentences and `quoteIntro` are exported for
// `app/(product)/brain/copy.ts` to RE-EXPORT rather than redeclare: the screen
// and the downloaded file must say the same thing about the same field, and
// `packages/db` is the only side both can import.
export {
  openBrainExport,
  exportPlan,
  ExportClassificationError,
  EXPORT_EVIDENCE_UNVERIFIED,
  NO_RULES_RECORDED,
  PLACEHOLDER_ABSENCE,
  INTERVIEW_PLACEHOLDER_ABSENCE,
  exportAbsenceSentence,
  // The SCREEN's half of the same two-dimensional (kind, reason) selection —
  // `/brain` re-exports this rather than composing the sentence itself, so a
  // creator's own `[check]` cannot be described one way in the file and
  // another way on the page (compliance gate round 2).
  screenAbsenceSentence,
  EXPORT_STREAM_DEADLINE_MS,
  EXPORT_DB_STATEMENT_TIMEOUT_MS,
  VOICE_FIELD_LABELS,
  STRATEGY_FIELD_LABELS,
  STRATEGY_METRIC_FIELD_LABELS,
  KILLTEST_FIELD_LABELS,
  METRIC_DIRECTION_LABELS,
  BRAIN_KIND_LABELS,
  BRAIN_STATUS_LABELS,
  claimLabel,
  strategyClaimLabel,
  killtestClaimLabel,
  claimLabelForKind,
  isMetricPointer,
  exportClaimHeading,
  exportClaimValue,
  quoteIntro,
  type BrainExportAnnotation,
  type BrainExportFormat,
} from "./export";
export {
  BRAIN_VERSION_MAX,
  BRAIN_CLAIM_POSITION_MAX,
  BRAIN_EVIDENCE_ENTRY_MAX,
  BRAIN_DOCUMENT_TEXT_MAX,
  // Slice 7 (R10): the ceiling the feedback note's textarea states.
  FEEDBACK_NOTE_MAX,
  // Slice 9a: the same, for the RESULT note's textarea. Exported because
  // `app/(product)/results/log-panel.tsx` states the ceiling beside the box
  // and `recordResult` refuses at 2,001 — a form that silently takes a note
  // it will refuse, then points at "the limit shown beside it" when there is
  // none, is the defect builder C found and deleted the false comment for.
  // The number must NOT be typed into the screen: a second copy of a ceiling
  // drifts the day it moves. `eslint.config.mjs`'s `allowImportNames` for
  // `@respin/db` needs it too — that half is builder B's file.
  RESULT_NOTE_MAX,
} from "./storage-limits";
// Slice 2a's concurrency bound (tech-spec §6). `RunSlots` is the PORT and
// `pgRunSlots` the real implementation; the server's singleton is
// `getServerRunSlots` on the facade below. Exported as a trio because
// `@respin/credits` holds the operation, this package holds the connection, and
// the tests need to hand `runInference` an implementation that refuses.
export {
  pgRunSlots,
  runSlotKeyName,
  isRunSlotCapacityError,
  RUN_SLOT_KEY_PREFIX,
  CONTROL_SLOT_KEY_PREFIX,
  type RunSlots,
  type RunSlotLease,
  type RunSlotOutcome,
  type RunSlotRefusal,
  type RunSlotNamespace,
} from "./run-slot";
export {
  createRunSlotPool,
  DEFAULT_RUN_SLOT_POOL_MAX,
  RUN_SLOT_CONNECT_TIMEOUT_MS,
} from "./client";
// Slice 3b (Stage B1). The interview surface's SHAPES only — the registry
// every field question is drawn from, and the answer types the UI builds a
// patch out of. The three OPERATIONS (`saveInterviewDraft`, `getInterviewDraft`,
// `submitInterview`) deliberately stay OFF this export: `app/**` reaches them
// only through `respinDb` below, the same rule every other profile-grained
// write in this package already follows (they take a bare `db` handle, and
// the facade is what supplies the pooled one).
export {
  INTERVIEW_FIELDS,
  INTERVIEW_ANSWER_MAX,
  type InterviewAnswers,
  type InterviewFieldKey,
  type TextAnswer,
  type ListAnswer,
  type DirectionAnswer,
  type SubmitInterviewResult,
} from "./interview-ops";
export {
  respinDb,
  getServerDb,
  getServerRunSlots,
  getMarketingReadDb,
} from "./app-server";
// `MarketingReadPoolBusyError` is deliberately NOT exported here: it never
// reaches a screen's refusal copy. `getActiveConfigForPublicPage` raises it
// into `landingPricing`, which renders the number-free page for any failure.
// Test harness (packages/*/tests only — the app allowlist denies these).
export {
  createTestDb,
  createDockerTestDb,
  seedAuthUser,
  DOCKER_TEST_DB_NAME_PATTERN,
  type TestDb,
} from "./testing";
export {
  createFakeS3,
  type FakeS3,
  type FakeS3Failure,
  type FakeS3Options,
  type FakeS3Tamper,
} from "./testing-s3";

// Plan C4's external-copy registry: the holders of a subject's data outside
// this database. `/settings/account` derives its "what survives erasure"
// sentence from this list, so a new processor cannot be added without the
// public copy changing in the same change.
export {
  EXTERNAL_COPIES,
  BACKUP_MAX_RETENTION_DAYS,
  COHORT_RETENTION_YEARS,
  lastCapableCopyDay,
  type ExternalCopy,
  type ExternalCopyClass,
} from "./external-copies";

// Phase 10a plan C4: the public Sample Spin's abuse buckets and the DB-atomic
// limiter that composes them with the system-spend reservation.
export { publicSampleSpinBuckets, type PublicSampleSpinBucket } from "./public-sample-spin-schema";
export {
  PUBLIC_SAMPLE_SPIN_HMAC_KEYS_ENV,
  PUBLIC_SAMPLE_SPIN_BUCKET_MS,
  NO_TRUSTED_IP,
  PublicSampleSpinKeyringError,
  admitPublicSampleSpin,
  ipBucketDigest,
  parsePublicSampleSpinKeyring,
  priorKeyVersionRetired,
  recordPublicSampleSpinOutcome,
  type PublicSampleSpinAdmission,
  type PublicSampleSpinAdmissionInput,
  type PublicSampleSpinKey,
  type PublicSampleSpinKeyring,
} from "./public-sample-spin";

// Phase 10a closes G-15: the explicit startup preflight (see preflight.ts).
export {
  PREFLIGHT_CHECKS,
  PreflightRefusedError,
  runStartupPreflight,
  type PreflightCheck,
  type PreflightReport,
} from "./preflight";
// Launch L2 (E-30): the ONE rule deciding whether the e2e LLM transport fake
// may be selected (startup preflight and the provider factory both apply it).
export {
  LLM_TRANSPORT_FAKE_GLOBAL,
  LLM_TRANSPORT_FAKE_SELECTOR,
  LLM_TRANSPORT_FAKE_SERVED_MODEL,
  LLM_TRANSPORT_SELECTOR_ENV,
  LlmTransportSelectionError,
  TEST_DATABASE_NAME_RE,
  databaseNameOf,
  resolveLlmTransportSelection,
  selectedLlmUnderlyingFetch,
  type LlmTransportEnvironment,
  type LlmTransportRefusal,
  type LlmTransportSelection,
} from "./llm-transport-selection";
// Phase 10a plan C5: content-free telemetry sink builders, SDK-less.
export {
  ACTIVATION_COHORT_EVENT,
  ACTIVATION_SMALL_CELL_DENOMINATOR,
  MonthlyEventBudget,
  POSTHOG_MONTHLY_EVENT_BUDGET,
  SENTRY_MONTHLY_EVENT_BUDGET,
  TELEMETRY_SYSTEM_IDENTITY,
  activationCohortEventUuid,
  assertSafeErrorEvent,
  originPinnedFetch,
  parsePosthogSink,
  parseSentryDsn,
  posthogActivationCapture,
  sendOutbound,
  sentryEnvelope,
  sentryEnvironmentTag,
  tightenOnlySampleRate,
  type ActivationCohortAggregate,
  type OutboundJson,
  type PosthogSink,
  type SafeErrorEvent,
  type SentryDsn,
} from "./telemetry-sinks";
