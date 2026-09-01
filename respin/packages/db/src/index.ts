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
  workspaceWriteCapabilities,
  normaliseDisplayName,
  DISPLAY_NAME_MAX,
  GUARDED_WRITE_FIELDS,
  CALLER_SUPPLIABLE_PROFILE_FIELDS,
  LEDGER_PAGE_MAX,
  ONBOARDING_PAGE_MAX,
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
  type VerifiedUserId,
  CALLER_SUPPLIABLE_BRAIN_FIELDS,
  monthlySpend,
  type MonthlySpendResult,
  // Slice 6, R17a: credit burn by the mode each debit's attempt settled into.
  burnByMode,
  type BurnByModeBucket,
  type BurnByModeResult,
  type BurnByModeRow,
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
export type { ProfileScope, WorkspaceScope } from "./with-workspace";
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
} from "./generation-schema";
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
  type InputClass,
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
export { respinDb, getServerDb, getServerRunSlots } from "./app-server";
// Test harness (packages/*/tests only — the app allowlist denies these).
export {
  createTestDb,
  createDockerTestDb,
  seedAuthUser,
  DOCKER_TEST_DB_NAME_PATTERN,
  type TestDb,
} from "./testing";
