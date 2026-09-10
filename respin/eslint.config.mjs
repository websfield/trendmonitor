// Respin's own ESLint config, pinned inside respin/ deliberately: a nested
// self-rooted project with "no config" silently inherits the enclosing repo's
// (CLAUDE.md lesson 2026-08-02). Nothing here references anything above respin/.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * The app-side default-deny rule value, built by ONE function so every
 * override cannot drift from the base (M1 phase 3 task 8b).
 * `adminSurface: true` additionally admits @respin/config/admin-server —
 * the global config WRITE entrypoint, admin routes only (tenancy round 2).
 * `webhookSurface: true` additionally admits @respin/credits/webhook-server —
 * the Stripe event dispatcher, `app/api/stripe/webhook/route.ts` EXACTLY
 * (narrowed from the subtree in phase-4 round 3: a nested helper could
 * otherwise re-export the SDK and a sibling could import the helper),
 * because dispatching an event is only legitimate BEHIND the signature check.
 */
const STRIPE_SDK_DENY =
  "app/** never constructs a Stripe client — every Stripe call goes through @respin/credits/app-server, which owns the lazy adapter, the pinned API version and the keyless refusal (AC-9). The ONE exception is app/api/stripe/webhook/route.ts EXACTLY, which needs the static Stripe.webhooks.constructEvent signature check (no API key, keyless-build safe); the grant is that single file, not the subtree, so a helper beside it cannot re-export the SDK.";

function appRestrictedImports({
  adminSurface = false,
  webhookSurface = false,
  systemWorkerSurface = false,
  operatorScriptSurface = false,
} = {}) {
  return [
    "error",
    {
      paths: [
        {
          name: "@respin/db",
          allowImportNames: [
            "respinDb",
            // Phase 10b-1 Task 8: the account copy quotes the executor's grace period.
            "DELETION_GRACE_MS",
            "WorkspaceAccessError",
            // Phase 10a (G-15, C5): the startup preflight `instrumentation.ts`
            // runs at register(), and the PURE telemetry sink builders
            // `lib/telemetry.ts` composes with safe-log's allowlist. None of
            // them opens a connection or reads a table.
            "runStartupPreflight",
            "PreflightRefusedError",
            // ...and the keyring parse refusal the demo facade can surface,
            // so billing-errors can give it copy.
            "PublicSampleSpinKeyringError",
            "MonthlyEventBudget",
            "SENTRY_MONTHLY_EVENT_BUDGET",
            "parseSentryDsn",
            "sendOutbound",
            "sentryEnvelope",
            "tightenOnlySampleRate",
            "sentryEnvironmentTag",
            "SafeErrorEvent",
            // Phase 10a C5: /admin/activation renders the activation seam's row type.
            "ActivationCohort",
            // Phase 10b-1 Task 5: operator scripts (scripts/**) get the PURE
            // projections and nothing else — the cost forecast, the enablement
            // decision derived from it, and the restore/purge verifier. Not one
            // of these can open a connection, mutate a row, or touch a deletion
            // operation, which is exactly why an operator CLI may hold them and
            // a route may not.
            ...(operatorScriptSurface
              ? [
                  "describeForecast",
                  "forecastDeletionJournalCost",
                  "journalEnablementDecision",
                  "validatePriceSnapshot",
                  "journalPurgeCandidates",
                  "listJournalOperationIds",
                  "loadJournalChain",
                  "planJournalRestore",
                  "compareRestoredState",
                  "assertJournalConfig",
                  "JOURNAL_FORECAST_ALERT_CENTS",
                  "JOURNAL_FORECAST_CEILING_CENTS",
                  "R124_LAUNCH_ENVELOPE",
                  "DeletionJournalConfig",
                  "DeletionJournalForecast",
                  "JournalEnablementDecision",
                  "JournalOperationChain",
                  "JournalRestorePlan",
                  "JournalUsageBasis",
                  "S3PriceSnapshot",
                  "VerifiedJournalRecord",
                ]
              : []),
            // Slice 8's dedicated, sessionless worker gets only the inert code
            // ceilings, its DB type, and the one system-spend adapter. The
            // app-facing rule calls this builder without `systemWorkerSurface`,
            // so none of these names become reachable from a route or page.
            ...(systemWorkerSurface
              ? [
                  "AUTOPSY_ATTEMPT_CODE_CEILING",
                  "AUTOPSY_VENDOR_CALLS_PER_ATTEMPT",
                  // The wall-clock family: the worker derives its job expiry
                  // from the claim lease and refuses a config deadline that
                  // would outrun it (slice 8 fix pass, 2026-09-03).
                  "AUTOPSY_CLAIM_LEASE_MS",
                  "assertAutopsyDeadlineWithinLease",
                  "SYSTEM_AUTOPSY_DAILY_CODE_CEILING_MICRO_USD",
                  // BOTH HALVES OF THE PREFLIGHT (R-99; round 2, CHANGE B):
                  // shared-library candidacy, and the content scan that runs on
                  // a private claim instead. Neither takes a scope, a profile
                  // or a workspace — they are pure functions over the analysis
                  // the worker already holds.
                  "assertAutopsyFrameworkCandidate",
                  "assertAutopsyMechanismContent",
                  "createSystemWorkerDb",
                  "closeSystemWorkerDb",
                  "createSystemAutopsyAttemptStore",
                  "recordSystemWorkerHealth",
                  "recoverStaleSystemAutopsyAttempts",
                  "systemAutopsyQueueCandidates",
                  "systemWorkerOperationalState",
                  "systemRefreshNiches",
                  "SYSTEM_AUTOPSY_DISPATCH_BATCH_CODE_CEILING",
                  "SYSTEM_REFRESH_NICHE_BATCH_CODE_CEILING",
                  "SYSTEM_WORKER_QUERY_POOL_CODE_CEILING",
                  "SystemAutopsyQueueCandidate",
                  "SystemWorkerOperationalState",
                  // Phase 10b-1 Task 4: the deletion lifecycle executor runs
                  // ONLY in this worker. One tick function, the fail-closed
                  // enablement default, the migration-inventory reader the
                  // registry needs at runtime, and the port/summary types.
                  "advanceDeletionOperations",
                  "ERASURE_DISABLED",
                  "migrationInventory",
                  "erasureHold",
                  "DeletionExecutorPorts",
                  "DeletionJournalPort",
                  "DeletionLifecycleTickSummary",
                  "DeletionScope",
                  "ErasureEnablementPort",
                  "MigrationInventory",
                  // Phase 10b-1 Task 5: the worker composes the R-124 external
                  // journal. Config validation and the store factory only — the
                  // restore verifier, the purge transport and the cost forecast
                  // are operator-script surface, not worker surface, and stay out
                  // deliberately so a tick can never purge or price anything.
                  "assertJournalConfig",
                  "createDeletionJournalStore",
                  "DeletionJournalConfig",
                  // Phase 10b-1 Task 8: the env parsing moved into the package
                  // so the app's request path composes the SAME journal.
                  "composeDeletionJournal",
                  "parseDeletionJournalEnv",
                  "parseDeletionScopeList",
                  "DELETION_JOURNAL_ENV",
                  "JOURNAL_UNAVAILABLE_CODE",
                  "unavailableDeletionJournal",
                  // Phase 10b-1 Task 6: the retention receiver and the
                  // generation-attempt boundaries run ONLY in this worker, for
                  // the reason the deletion executor does (plan C2: never
                  // inside an HTTP request). Two tick functions and their
                  // summary types. The clock authority, the finance extractor
                  // and `pseudonymousWorkspaceKey` stay OUT deliberately: they
                  // are the receiver's internals, and a worker that could call
                  // the extractor directly could redact a payload without one.
                  // Phase 10b-1 Task 7: the worker resolves the two audited id
                  // sets once per process and hands them to the executor.
                  "resolveActivationExclusions",
                  "runRetentionTick",
                  "runGenerationRecoveryTick",
                  "recoverStalePublicSampleSpinAttempts",
                  // Phase 10a C5: the daily aggregate activation emitter
                  // consumes the ONE activation seam and the pure PostHog
                  // builders; the worker's main runs the same preflight.
                  "deriveActivationCohorts",
                  "ACTIVATION_WINDOW_MS",
                  "ACTIVATION_SMALL_CELL_DENOMINATOR",
                  "POSTHOG_MONTHLY_EVENT_BUDGET",
                  "MonthlyEventBudget",
                  "parsePosthogSink",
                  "posthogActivationCapture",
                  "activationCohortEventUuid",
                  "ACTIVATION_COHORT_EVENT",
                  "sendOutbound",
                  "ActivationCohort",
                  "ActivationExclusions",
                  "PosthogSink",
                  "runStartupPreflight",
                  "RetentionTickSummary",
                  "RetentionTableOutcome",
                  "GenerationRecoveryOutcome",
                  "GenerationRecoveryOptions",
                ]
              : []),
            // types only below
            "Db",
            "DbLike",
            "User",
            "Workspace",
            "Membership",
            "MembershipRole",
            "BootstrapParams",
            "BootstrapResult",
            "WorkspaceCtx",
            "WorkspaceScope",
            "VerifiedWorkspaceId",
            // M2a. The scope TYPES are importable; the VALUES are not, and
            // that is enforced by `export type` in @respin/db's index rather
            // than here — `allowImportNames` makes no type/value distinction,
            // measured (see AC-15). Deliberately ABSENT, so the default-deny
            // refuses them: writeCapabilities, assertScoped, VerifiedProfileId,
            // and every table object.
            "ProfileScope",
            // Error classes app/(product)/billing-errors.ts maps to copy. They
            // are inert values — catching a refusal is not reaching a query —
            // and the completeness suite enumerates this surface, so one added
            // to @respin/db without copy fails a test rather than degrading to
            // "Something went wrong".
            "WorkspacePausedError",
            "ProfileAccessError",
            "PerformanceLearningEntitlementError",
            "PromotionAccessError",
            "PromotionPayloadError",
            "PromotionFreshnessError",
            "PromotionDecisionError",
            "ProvenanceError",
            "BrainEditEmptyError",
            // SLICE 5, STAGE 2 (G3). The no-op edit refusal, split off
            // `ProvenanceError` so an unchanged-form submission stops
            // rendering the stale-page sentence. Another inert refusal
            // value `billing-errors.ts` maps to copy — the brain WRITE
            // surface stays absent and therefore still denied.
            "BrainEditUnchangedError",
            "BrainEditBusyError",
            "BrainEditLimitError",
            "BrainDocumentLimitError",
            "BrainVersionLimitError",
            "ExportBusyError",
            // Phase 10b-1 Task 4: the closed auth-delivery refusals, so the
            // billing copy map can name them (never thrown by a page today —
            // Better Auth maps them to an APIError — but the copy rule is mechanical).
            "AuthMailDeliveryError",
            "AuthMailRefusedError",
            "OnboardingInputLimitError",
            "BRAIN_EDIT_MAX_FIELDS",
            "BRAIN_EDIT_POINTER_MAX",
            "BRAIN_EDIT_VALUE_MAX",
            "BRAIN_EDIT_TOTAL_MAX",
            "ExportClassificationError",
            "ScopeForgeryError",
            "UsageRawError",
            // M2b-1. Same rule as the five above: inert refusal values that
            // billing-errors.ts maps to copy. The brain WRITE surface
            // (writeBrainDoc, parseBrainContent, the schemas) stays absent, so
            // the default-deny still refuses it.
            "ContentSchemaError",
            "KindNotYetWritableError",
            "SchemaShapeError",
            "ClaimWalkError",
            "ContentWalkError",
            "BrainReasonError",
            "BrainRoleError",
            "SegmenterUnavailableError",
            // Slice 1. The four profile/intake refusals, same rule again:
            // inert values that `billing-errors.ts` maps to copy. The WRITE
            // surface stays absent, so the default-deny still refuses
            // `workspaceWriteCapabilities`, `writeCapabilities`, `assertScoped`
            // and every table object.
            "ProfileCapError",
            "ProfileNameError",
            "ProfileRoleError",
            "PostContentError",
            // Row TYPES the onboarding page renders. Type-only exports in
            // @respin/db's index, so a value import of either is TS1362 —
            // `allowImportNames` makes no type/value distinction, which is why
            // the distinction is enforced by `export type` there and not here
            // (AC-15, measured).
            "CreatorProfile",
            "OnboardingInput",
            // The two product LIMITS the onboarding copy states. Inert
            // numbers, not a write surface — and allowlisting them is the
            // point: the limit was hand-copied into four places (two form
            // attributes and two copy strings) with nothing binding them, so
            // moving a constant silently made the copy wrong (billing +
            // tenancy gate NOTEs, 2026-08-27). One source, asserted by
            // `tests/onboarding-ui.test.tsx`.
            "DISPLAY_NAME_MAX",
            "POST_CONTENT_MAX",
            "ONBOARDING_PAGE_MAX",
            // Slice 4. The reference-post ceiling, stated on the reference
            // panel the same way `POST_CONTENT_MAX` is stated on the paste
            // form — one source, never a hand-copied number.
            "REFERENCE_COUNT_MAX",
            // Slice 8c. The pasted-reference TITLE ceiling, stated on the
            // paste panel the same way `POST_CONTENT_MAX` is stated on the
            // transcript box (R13: no number is typed in a screen file).
            "PASTED_REFERENCE_TITLE_MAX",
            // Slice 3. Two more inert refusal values that `billing-errors.ts`
            // maps to copy, added ONE BY ONE rather than by widening the rule:
            // `PostAttestationError` (R8's "you did not say you wrote this")
            // and `EvidenceUnreadableError` (a recorded quote that does not
            // read back from the post it names). The brain WRITE surface stays
            // absent — `writeCapabilities`, `confirmBrainDocFields` and
            // `activateBrainDoc` are still denied here, and the three brain
            // operations reach app/** only through `respinDb`.
            "PostAttestationError",
            "EvidenceUnreadableError",
            // Slice 4. The R-3 echo bar / quote-budget refusal — its own class,
            // separate from `ProvenanceError`, so `billing-errors.ts` can give
            // it copy that says a reference post was echoed rather than that a
            // quote didn't match the creator's own words (see the class's
            // docblock in @respin/db's errors.ts).
            "ReferenceEchoError",
            // The view TYPES the /brain screens render. Type-only, same rule
            // and same reason as `CreatorProfile` / `OnboardingInput` above: a
            // value import is TS1362 at the export, not here. RENAMED off
            // `Voice*` in slice 3b (Stage B2) — the same three types now
            // render `strategy` and `killtest` too, not only `voice`; see
            // `brain-ops.ts`'s docblock on `BrainClaimView`.
            "BrainDocsView",
            "BrainVersionView",
            "BrainClaimView",
            "PLACEHOLDER_ABSENCE",
            // Slice 2b (renamed /admin/margin -> /admin/model-spend in
            // slice 2b-c). The reconciliation view types, and the
            // `MonthlySpendResult` shape `/usage` renders — all type-only
            // (AC-15's `export type` rule again), so a value import is
            // TS1362 at the export, not here. The WRITE/query surface stays
            // absent: `monthlySpend`, `reconcileSpend`, `periodMonthUtc` and
            // `pseudonymiseWorkspaceSpend` reach app/** only through
            // `respinDb` (`monthlySpend`/`reconcileSpend` are its methods;
            // the other two are package-internal, never exported to app/**
            // at all).
            "SpendReconciliationResult",
            "SpendReconciliationRow",
            "SpendReconciliationClass",
            "UnbilledAttempt",
            "MonthlySpendResult",
            // Slice 3b, Stage B1. The interview surface's two typed refusals —
            // inert values `billing-errors.ts` maps to copy, the same rule as
            // every refusal class above. The two-plus write CAPABILITY reaches
            // app/** only through `respinDb.saveInterviewDraft` /
            // `.getInterviewDraft` / `.submitInterview`; the raw operations,
            // like `writeCapabilities` and `appendOwnPost`, stay denied here.
            "InterviewAnswerError",
            "InterviewDraftSubmittedError",
            // The interview field REGISTRY and its answer-shape TYPES — one
            // source the interview UI renders every question from, rather
            // than a hand-copied field list that could drift from
            // `interview-ops.ts`'s own vocabulary (the same reason
            // `POST_CONTENT_MAX` is allowlisted above). `INTERVIEW_FIELDS` is
            // a plain array of descriptors (key/kind/target/pointer/declinable)
            // — inert data, not a write surface.
            "INTERVIEW_FIELDS",
            "INTERVIEW_ANSWER_MAX",
            "InterviewAnswers",
            "InterviewFieldKey",
            "TextAnswer",
            "ListAnswer",
            "DirectionAnswer",
            "SubmitInterviewResult",
            // The row TYPE `respinDb.getInterviewDraft` returns — type-only,
            // same `export type` rule as `CreatorProfile`/`OnboardingInput`
            // above, so a value import is TS1362 at the export, not here.
            "OnboardingInterviewDraft",
            // The declared north-star metric's closed direction vocabulary —
            // the `metricDirection` field's two options, one source shared
            // with `brain-content.ts`'s own schema.
            "METRIC_DIRECTIONS",
            // SLICE 5, STAGE 2 (G0). The SHARED DISPLAY VOCABULARY the screen
            // and the downloaded file must both use — moved down into
            // `packages/db/src/export.ts` by stage 1 so `/brain` and
            // `openBrainExport` cannot say two different things about the same
            // field, and re-exported (never redeclared) by
            // `app/(product)/brain/copy.ts` and
            // `app/(product)/onboarding/interview/copy.ts`.
            //
            // ALL INERT: four `Record<string, string>` label maps, two absence
            // SENTENCES, four pure pointer->label functions, one pure
            // pointer predicate and one pure sentence builder. None of them
            // reads, writes or reaches a connection, which is why they can be
            // on this list at all — the brain WRITE surface
            // (`writeCapabilities`, `writeBrainDoc`, the tables) stays absent
            // and therefore still denied. `tests/shared-copy-identity.test.ts`
            // is what makes the re-export durable: it proves each name arrives
            // from @respin/db rather than as a second literal that can drift.
            "INTERVIEW_PLACEHOLDER_ABSENCE",
            // ROUND 2 (compliance CHANGE): the pure (kind, storedReason)
            // SELECTOR the two absence constants are two answers of. Inert
            // like the rest — it reads a closed table and returns a sentence,
            // reaching no connection — and it is what stops `/brain` telling a
            // creator "we could not point to a quote from your posts" about a
            // `[check]` they typed into their own edit.
            "screenAbsenceSentence",
            "VOICE_FIELD_LABELS",
            "STRATEGY_FIELD_LABELS",
            "STRATEGY_METRIC_FIELD_LABELS",
            "KILLTEST_FIELD_LABELS",
            "METRIC_DIRECTION_LABELS",
            "claimLabel",
            "strategyClaimLabel",
            "killtestClaimLabel",
            "isMetricPointer",
            "quoteIntro",
            // SLICE 7 (stage A). Inert VALUES and TYPES only — the framework
            // and feedback WRITE surfaces stay absent and therefore denied:
            // `createPrivateFramework`, `editPrivateFramework`,
            // `retirePrivateFramework`, `approvePrivateFramework`,
            // `recordFeedback`, `listFeedback`, `seedSharedFrameworks`,
            // `sharedFrameworkLibrary`, `eligibleFrameworks` and every table
            // object reach `app/**` through `respinDb` alone.
            //
            // `GENERATION_FEEDBACK_REACTIONS` is the closed reaction list the
            // feedback UI renders its buttons from — one source rather than a
            // hand-copied list that can drift from the pgEnum, exactly the
            // reason `INTERVIEW_FIELDS` and `POST_CONTENT_MAX` are here.
            // `SATURATION_NOTICE` is the single sentence a saturated framework
            // carries (R5b), for the `INTERVIEW_PLACEHOLDER_ABSENCE` reason:
            // the screen and the artefact must not say two different things.
            // `FEEDBACK_NOTE_MAX` is the ceiling the note textarea states.
            "GENERATION_FEEDBACK_REACTIONS",
            "SATURATION_NOTICE",
            "FEEDBACK_NOTE_MAX",
            "FRAMEWORK_NAME_MAX",
            "FRAMEWORK_TEXT_MAX",
            "FRAMEWORK_LIST_MAX",
            "PRIVATE_FRAMEWORK_COUNT_MAX",
            "FRAMEWORK_GOALS",
            "FRAMEWORK_NICHES",
            // Type-only exports (a value import of either is TS1362 at the
            // export, not here — the AC-15 rule).
            "GenerationFeedbackReaction",
            "GenerationFeedbackRow",
            "EligibleFramework",
            "FrameworkContent",
            "FrameworkGoal",
            "FrameworkNiche",
            "PrivateFrameworkEntitlement",
            "Framework",
            // SLICE 7 (stage D). Stage A's TEN typed refusals, landed here in
            // the SAME change as their copy in `app/(product)/billing-errors.ts`
            // and their root export in `packages/db/src/index.ts` — the
            // obligation that file's header names, discharged whole rather than
            // in three commits that each look fine alone. Same rule as every
            // refusal class above: inert values that `billing-errors.ts` maps to
            // copy, so a typed refusal cannot degrade to "Something went wrong"
            // on the screens that generate, revise, react and curate. The
            // framework and feedback WRITE surfaces stay absent and therefore
            // still denied — `createPrivateFramework`, `recordFeedback` and
            // their siblings reach `app/**` through `respinDb` alone.
            "GenerationLineageError",
            "FeedbackReactionError",
            "FeedbackNoteError",
            "FeedbackDuplicateError",
            "FeedbackTargetError",
            "FrameworkAccessError",
            "FrameworkStaleError",
            "FrameworkContentError",
            "FrameworkLimitError",
            "PrivateFrameworkTierError",
            // SLICE 9A (results). NO COUNT IS STATED HERE, DELIBERATELY —
            // and that absence is the third version of this comment, which is
            // why it is worth a sentence. It said EIGHT, then NINE, then TEN,
            // and was corrected each time; the second correction was very
            // nearly shipped as a comment CLAIMING the first had happened. A
            // number that must be edited in lockstep with a list, in the file
            // whose whole job is being the boundary's truth, is a stale claim
            // waiting to happen — and `git diff` shows the list changing, so
            // the count added nothing a reader could not see.
            //
            // WHAT THE COMMENT IS ACTUALLY FOR, and what does not go stale:
            // EVERY name below was added only after an ACTUAL `eslint app lib`
            // denial named it, never for symmetry with a sibling. The original
            // eight were measured together — exactly eight violations at two
            // import sites — and each later one was measured on its own.
            //
            // `ComparisonStratumError` and `ComparisonInputError` were each
            // added later and each measured the same way — neither appeared in
            // the original run of eight because `billing-errors.ts` did not yet
            // import it, and each became the single remaining `app`+`lib` lint
            // error the moment its import landed. It was
            // measured the same way and separately: it did not appear in that
            // run of eight because `billing-errors.ts` did not yet import it,
            // and it became the single remaining `app`+`lib` lint error the
            // moment that import landed. It is sequenced INTO the same change
            // as its copy so the tree is never lint-red between turns.
            //
            // THE FOUR REFUSALS, on the slice-7 rule above: inert values
            // `app/(product)/billing-errors.ts` maps to copy. Without them a
            // `recordResult` refusal renders as "Something went wrong", which
            // is open finding 8c-R15's exact shape — a second instance of a
            // defect class already in the register, added by the slice whose
            // subject is honesty. `tests/billing-ui.test.tsx` DERIVES the
            // population ("every Error class app/** can receive from a facade
            // has copy here"), so this list is checked against the facade
            // rather than against memory.
            "TreatmentKeyError",
            "ResultInputError",
            "ResultTargetError",
            "ResultDuplicateError",
            // The fifth refusal, from `comparableResults`' stratum validation.
            // A DISTINCT CLASS rather than the `WorkspaceAccessError` it would
            // otherwise have reused: that class IS handled, so this was never
            // the "Something went wrong" hole it was first reported as — its
            // copy says "sign in with the account that owns it", which is a
            // confident WRONG remedy for a malformed-input defect, and a
            // wrong instruction is worse than a generic one. 9a raises this on
            // no path (the screen passes no stratum); it is owed because 9b's
            // first stratum-passing caller is the one that hits it.
            "ComparisonStratumError",
            // The TENTH name, and the count above was corrected again with
            // it rather than left saying nine. It is `@respin/brain`'s
            // refusal, re-exported through `@respin/db`'s facade — the screen
            // needs the class for `instanceof`, and re-exporting is what lets
            // it have that WITHOUT `@respin/brain` joining the sanctioned
            // surface. Nine throw sites rendered "Something went wrong"
            // without it.
            "ComparisonInputError",
            // The note ceiling. `recordResult` refuses at 2,001 code points
            // with `ResultInputError`, and the form could not STATE the limit
            // without either importing this or typing `2000` into the screen —
            // a second copy of a ceiling the screen cannot read, which is the
            // drift these constants exist to prevent. Builder C refused the
            // hard-coded number and reported the gap instead; this is the half
            // that closes it. There is no database ceiling on `results.note`
            // (the column is unbounded `text`; its CHECK enforces
            // non-blankness only), so this constant IS the limit.
            "RESULT_NOTE_MAX",
            // THE FOUR CLOSED VOCABULARIES the log form renders as controls
            // (`app/(product)/results/page.tsx` passes each to the panel).
            // The alternative is four app-side literal copies of four closed
            // sets — the drift this slice's own pinned contract exists to
            // prevent — so the import is the narrower option, not the wider
            // one. They are `as const` string arrays: no capability, no
            // connection, no table.
            //
            // `RESULT_LEVERS` WAS THE ONE WORTH ARGUING ABOUT, and it is here
            // deliberately. `results/projection.ts` already holds `ROW_LEVERS`
            // as a local literal (a row's lever columns cannot be reached from
            // a string without an index signature that would make a typo
            // compile), and the form could have been handed THAT instead,
            // saving a widening. It is not, because then the form's options
            // would be an app-side list kept true by a test, where this makes
            // them the package's vocabulary by construction.
            //
            // WHAT STAYS DENIED, and it is the half that matters: `results`
            // (the table object — a raw insert needs the table),
            // `treatmentKeyFor` (C4's server-computed key; a screen that could
            // compute one could fabricate one), `declaredMetricOf`, the
            // pgEnums, and every row type — `results/projection.ts` reaches
            // those by INDEXED ACCESS off what `respinDb` returns. Fixtures
            // for both halves are in tests/import-boundary.test.ts.
            "RESULT_EVIDENCE_STATES",
            "RESULT_AUDIENCE_CLASSES",
            "RESULT_CONFOUNDER_CODES",
            "RESULT_LEVERS",
            // Plan C4's external-copy registry and its two derived constants.
            // Read-only data and a pure function — no query, no write
            // capability — and the account page's "what survives erasure"
            // sentence is DERIVED from them, so a new processor cannot be added
            // without the public copy changing in the same commit.
            "EXTERNAL_COPIES",
            "BACKUP_MAX_RETENTION_DAYS",
            "COHORT_RETENTION_YEARS",
            "lastCapableCopyDay",
            // Phase 10b-1 rollout: the request-flag refusal prefix, so the account
            // page can map `deletion_refused:requests_disabled:<scope>` to copy.
            "REQUESTS_DISABLED_CODE",
            "ExternalCopy",
            "ExternalCopyClass",
          ],
          message:
            "app/** may import only the sanctioned @respin/db surface (respinDb, WorkspaceAccessError, the typed refusals, types) — every query goes through withWorkspace, and the write capabilities are package-only (tenancy T1, M2a A-2b)",
        },
        {
          // Phase 10b-1 Task 5, round-1 tenancy C4 / code CHANGE 10. The S3
          // adapter exposes THREE principals and operator scripts need only two.
          // `s3JournalWriter` is the credential that can APPEND a journal
          // version, and a forged `cancelled` version is exactly the input the
          // restore verifier's new cancellation-after-erasure check exists to
          // refuse — so the writer stays worker-only, by name, and an operator
          // script that reaches for it is a lint error rather than a review note.
          name: "@respin/db/deletion-journal-s3",
          allowImportNames: operatorScriptSurface
            ? ["createS3JournalClient", "s3JournalVerifier", "s3JournalPurger"]
            : ["createS3JournalClient", "s3JournalWriter", "s3JournalVerifier", "s3JournalPurger"],
          message:
            "scripts/** may hold the verifier and purge principals only — s3JournalWriter is the worker's, because it is the credential that can append a journal version (tenancy T1, R-124)",
        },
        {
          name: "@respin/auth",
          allowImportNames: [
            "getSessionUser",
            "reauthenticateCurrentSessionWithPassword",
            // Phase 10b-1 Task 8: the account page composes the recovery mail port,
            // and the public recovery page exchanges the emailed secret for a
            // bounded session and a fresh password proof.
            "resendMailPortFromEnv",
            "beginIdentityCancellationRecoverySession",
            "createIdentityCancellationProofWithPassword",
            // Phase 10a: the proxy-ATTESTED client address, for the sessionless
            // public Sample Spin route's HMAC bucket (null = the shared bucket).
            "proxyAttestedClientIp",
            "requireUser",
            "requireAdmin",
            "authHandlers",
            "isGoogleConfigured",
            "adminAllowed",
            "parseAdminAllowlist",
            // types
            "SessionUser",
          ],
          message:
            "app/** may import only the sanctioned @respin/auth surface — createAuth/getAuth (the raw instance) stay package-only; client components use @respin/auth/client",
        },
        {
          name: "@respin/credits",
          message:
            "app/** never imports the raw @respin/credits root — use the wired facade @respin/credits/app-server (tenancy T1, M1 phase 3 task 8b)",
        },
        ...(systemWorkerSurface
          ? [
              {
                name: "@respin/config",
                allowImportNames: [
                  "getActiveConfig",
                  "getActiveConfigRequiringStored",
                  "ActiveConfig",
                ],
                message:
                  "worker/** may read only the active validated config and its type; config writes and app facades remain denied",
              },
              {
                name: "@respin/llm",
                allowImportNames: [
                  "createAnthropicProvider",
                  "costMicroUsd",
                  "priceFor",
                  "stripFence",
                  "LlmError",
                  "LlmTruncatedError",
                  "ModelPriceUnknownError",
                  "LlmProvider",
                  "ModelPrice",
                ],
                message:
                  "worker/** may use only the neutral provider adapter, pricing helpers and closed error/type surface",
              },
            ]
          : [
              {
                name: "@respin/config",
                message:
                  "app/** never imports the raw @respin/config root — use @respin/config/app-server (reads) or, from app/(admin) only, @respin/config/admin-server (writes)",
              },
            ]),
        // The cage denied every DOMAIN route to Stripe and left the SDK itself
        // wide open (round-2 CHANGE 5). `stripe` is a direct dependency of the
        // app package, so `new Stripe(process.env.STRIPE_SECRET_KEY!)` in a
        // server action lint-passed, bypassed the adapter's pinned API version
        // and `isStripeConfigured()`'s keyless refusal, read the secret at the
        // page layer, and was invisible to the AC-9 "only getStripe constructs
        // a client" scan, which walks packages/credits/src only.
        //
        // `webhookSurface` re-admits it for the ONE file that needs the static
        // `Stripe.webhooks.constructEvent` signature check — that helper needs
        // no API key and is what makes the route trustworthy in the first place.
        ...(webhookSurface
          ? []
          : [
              {
                name: "stripe",
                message: STRIPE_SDK_DENY,
              },
            ]),
      ],
      patterns: [
        {
          // THE SPECIFIER-SHAPE HOLE (tenancy round 4 CHANGE). Every rule
          // above is anchored to a `@respin/…` package name, so all of them
          // were bypassable by spelling the same module as a path:
          //   import { createDb } from "@/packages/db/src/client"
          //   import { trustWorkspaceId } from "../../packages/db/src/with-workspace"
          // Both resolve (tsconfig maps `@/*` → `./*`), and neither is a
          // `@respin/*` specifier, so no rule fired. That reached the raw
          // connection, the non-session workspace-id mint, the raw tables, the
          // Stripe dispatcher and the admin config write — i.e. the whole cage.
          //
          // This is the 2026-08-02/07-30 lesson in one line: round 3 fixed the
          // FIELD (dynamic import of @respin names) and not the CLASS
          // (specifier shape). app/ and lib/ have no legitimate reason to
          // reach a package by path, so the deny is blanket.
          group: [
            "packages/*",
            "packages/**",
            "@/packages/*",
            "@/packages/**",
            "**/packages/*",
            "**/packages/**",
          ],
          message:
            "app/** and lib/** reach packages ONLY through their @respin/* package names, so the sanctioned-surface rules apply — a relative or @/-aliased path into packages/ bypasses every one of them (tenancy T1)",
        },
        {
          // Deep spellings of the same SDK (`stripe/lib/...`), denied even in
          // the webhook route: the sanctioned surface there is the package
          // root's static webhook helper, not its internals.
          group: ["stripe/*"],
          message: STRIPE_SDK_DENY,
        },
        {
          // Phase 10b-1 Task 5: the dedicated worker's ONE door into @respin/db's
          // internals — the AWS SDK adapter for the R-124 deletion journal. It is
          // a separate entrypoint precisely so the SDK never enters the app
          // bundle; app/** and lib/** still get the package root and nothing else.
          group:
            systemWorkerSurface || operatorScriptSurface
              ? ["@respin/db/*", "!@respin/db/deletion-journal-s3"]
              : ["@respin/db/*"],
          message:
            systemWorkerSurface || operatorScriptSurface
              ? "worker/** and scripts/** may import only @respin/db/deletion-journal-s3 (the R-124 S3 journal adapter) beyond the package root; the worker holds the WRITER, an operator script holds the verifier/purge principals (tenancy T1)"
              : "no deep imports into @respin/db from app/** — the package root's sanctioned surface is the only door (tenancy T1)",
        },
        {
          group: ["@respin/auth/*", "!@respin/auth/client"],
          message:
            "the only sanctioned deep import into @respin/auth is ./client (the browser entrypoint)",
        },
        {
          group: webhookSurface
            ? [
                "@respin/credits/*",
                "!@respin/credits/app-server",
                "!@respin/credits/webhook-server",
              ]
            : systemWorkerSurface
              ? // The dedicated worker's ONE door into credits: the Stripe-backed
                // deletion command adapter (Phase 10b-1 Task 4). The app facade
                // is a session-shaped surface the sessionless worker never uses.
                ["@respin/credits/*", "!@respin/credits/deletion-server"]
              : ["@respin/credits/*", "!@respin/credits/app-server"],
          message: webhookSurface
            ? "sanctioned @respin/credits entrypoints here: ./app-server (the wired facade) and ./webhook-server (the Stripe dispatcher, behind the signature check)"
            : systemWorkerSurface
              ? "worker/** may import only @respin/credits/deletion-server (the deletion command adapter); the app facade and the webhook dispatcher are app-only"
              : "the only sanctioned deep import into @respin/credits is ./app-server (the wired facade) — ./webhook-server dispatches Stripe events and is app/api/stripe/** only",
        },
        {
          group: adminSurface
            ? [
                "@respin/config/*",
                "!@respin/config/app-server",
                "!@respin/config/admin-server",
              ]
            : ["@respin/config/*", "!@respin/config/app-server"],
          message: adminSurface
            ? "sanctioned @respin/config entrypoints here: ./app-server (reads) and ./admin-server (admin writes)"
            : "the only sanctioned @respin/config entrypoint outside app/(admin) is ./app-server — the WRITE surface (./admin-server) is admin-only",
        },
        {
          // THE NEGATION-FORM CATCH-ALL (brain-surface task 25).
          //
          // Every rule above is anchored to a package that EXISTS TODAY —
          // `paths` names @respin/db, /auth, /credits, /config one by one — so
          // the boundary was default-ALLOW for any package added later. The
          // finish plan creates four (`llm` in slice 2a, then `modes`,
          // `trends`, `brain`), and each would have landed outside the cage
          // silently with every fixture in `tests/import-boundary.test.ts`
          // still green: a guard that passes because it found no candidates is
          // the fail-open shape CLAUDE.md's 2026-08-21 lesson names.
          //
          // Inverted, so joining the boundary is a deliberate edit to THIS list
          // rather than something a new package inherits by omission.
          //
          // THE PATTERN LIST'S SHAPE IS MEASURED, NOT GUESSED, and the measurement
          // is the reason the package roots are negated here even though two of
          // them are denied one block up. `no-restricted-imports` matches with
          // the `ignore` package, i.e. GITIGNORE semantics — and gitignore
          // cannot re-include a child of an excluded parent. So
          // `["@respin/*", "!@respin/credits/app-server"]` excludes
          // `@respin/credits` as a "directory" and the negation is INERT: the
          // wired facade every product page imports goes dark. That was not a
          // hypothesis; it was six lint errors across billing-errors.ts, the
          // billing action, two pages and the webhook route on the first run of
          // this rule, and a probe against the installed engine is what
          // explained them.
          //
          // Hence: negate each package ROOT so it is not an excluded parent,
          // then negate each sanctioned deep entrypoint. The catch-all
          // therefore permits `@respin/credits` and `@respin/config` roots —
          // which stay denied by their NAMED `paths` entries above, where the
          // message can say what to import instead. This entry's job is the
          // class those entries cannot cover: a package nobody has written yet,
          // and a deep entrypoint nobody has sanctioned yet.
          //
          // ---- THE DECISIONS THIS LIST RECORDS BY OMISSION, WRITTEN DOWN.
          //
          // A package is "considered and denied" or "never looked at", and a
          // list that only names the ADMITTED cannot tell those apart. So each
          // package that arrives and STAYS DENIED says so here, once:
          //
          //   `@respin/llm`   (slice 2a) — denied. A server action that could
          //     build a prompt is a server action that can reach a model with
          //     arbitrary text; app/** reaches it through `inferVoice` on
          //     @respin/credits/app-server.
          //   `@respin/modes` (slice 6, stage B) — DENIED, deliberately, and
          //     it stays denied. It holds the generation pipeline, so the same
          //     argument applies with money attached: `runGeneration` takes the
          //     vendor call as a callback, and the caller that supplies one is
          //     the caller that meters and debits. app/** reaches a generation
          //     through @respin/credits/app-server, where the money path
          //     already is. The TYPES a screen needs are reachable WITHOUT
          //     naming @respin/modes, but NOT by re-export: the facade's
          //     `export type` block names no `@respin/modes` type, and this
          //     comment claimed it did until slice 6 stage D read it back
          //     (2026-09-01). What is true is INDEXED ACCESS through the
          //     facade's own result type — `NonNullable<GenerateResult["run"]>`
          //     and its members — which is what `app/(product)/studio/
          //     projection.ts` does and documents. A screen therefore names the
          //     shape without importing the package, which is the property the
          //     denial needs; re-export would have been a second, wider way to
          //     the same place. `app/(product)/billing-errors.ts` records the
          //     precedent, that widening a package boundary so a screen or a
          //     test can name a class is "loosening a tenancy boundary for a
          //     convenience".
          //   `@respin/brain` (slice 9a, R3) — DENIED, deliberately, and the
          //     reason is NOT that a median is dangerous. It is that
          //     `buildLeverComparisons` takes rows its docblock says are
          //     "ALREADY profile-scoped by the caller": the whole tenancy
          //     property of a comparison lives in the code that FETCHED the
          //     rows, and that code goes through `withWorkspace`. Granting the
          //     package root to app/** would put the fetch and the comparison
          //     on opposite sides of a package boundary and make a screen the
          //     thing responsible for scoping a cohort (REQ-A03, R-9). The
          //     TYPES are denied with it, for `billing-errors.ts`'s recorded
          //     precedent: widening a package boundary so a screen can name a
          //     class is "loosening a tenancy boundary for a convenience".
          //     WHAT THIS COSTS, stated because it is a live obligation and
          //     not a theory: 9a's comparison screen therefore needs a facade
          //     — a scoped accessor that fetches AND compares — or the
          //     comparison is unreachable from a browser, which is the
          //     "inventory, not done" shape the finish plan exists to stop.
          //
          // Fixtures for each of these live in tests/import-boundary.test.ts,
          // and slice 6 adds the packages/**-direction half: `@respin/modes`
          // ROOT is reachable from packages/credits (stage C composes it)
          // while `@respin/modes/src/...` is not. Slice 9a repeats that half
          // for `@respin/brain`, whose caller is a package.
          group: [
            "@respin/*",
            "@respin/*/**",
            // The roots — negated so they are not excluded PARENTS.
            "!@respin/db",
            "!@respin/auth",
            "!@respin/credits",
            "!@respin/config",
            ...(systemWorkerSurface ? ["!@respin/trends", "!@respin/llm"] : []),
            // The sanctioned deep entrypoints.
            "!@respin/auth/client",
            ...(systemWorkerSurface
              ? ["!@respin/credits/deletion-server"]
              : operatorScriptSurface
                ? []
                : ["!@respin/credits/app-server"]),
            // Phase 10b-1 Task 5 — the R-124 S3 journal adapter. The worker
            // (writer principal) and operator scripts (verifier/purge
            // principals) only, so the AWS SDK never enters the app bundle.
            // Denied for app/** and lib/** by the fixtures in
            // tests/import-boundary.test.ts.
            ...(systemWorkerSurface || operatorScriptSurface
              ? ["!@respin/db/deletion-journal-s3"]
              : []),
            "!@respin/config/app-server",
            ...(adminSurface ? ["!@respin/config/admin-server"] : []),
            ...(webhookSurface ? ["!@respin/credits/webhook-server"] : []),
          ],
          message:
            "app/** and lib/** may import only the SANCTIONED @respin/* entrypoints — @respin/db, @respin/auth (+ /client), @respin/credits/app-server, @respin/config/app-server (plus /admin-server in app/(admin) and /credits/webhook-server in the Stripe webhook route). A NEW @respin/* package, or a NEW deep entrypoint into an existing one, is denied by default: add it to this negation list deliberately, with a deny fixture in tests/import-boundary.test.ts, rather than inheriting the boundary by omission (brain-surface task 25)",
        },
      ],
    },
  ];
}

/**
 * THE SPECIFIER-SHAPE DENY, for packages/** — the same class M1 closed for
 * app/** and left open one directory over (M2a A-2b).
 *
 * ONE builder, both blocks, for the reason this file already learned once: a
 * hand-copied second list drifts, and the block that drifts is the one nobody
 * re-reads. Every rule anchored to a `@respin/…` package NAME is bypassable by
 * spelling the same module as a path, and from `packages/credits/src` BOTH
 * `"@respin/db/src/with-workspace"` and `"../../db/src/with-workspace"` were
 * ALLOWED — probe-confirmed against the installed engine — in the milestone
 * that puts the tenancy cage inside that exact module. A package reaches
 * another package through its ROOT, where the sanctioned surface lives.
 *
 * Same-package relatives (`./x`, `../x`) are untouched: they never cross a
 * package boundary, and packages/db's own modules import each other that way.
 */
const CROSS_PACKAGE_DENY = {
  group: [
    // Another package's INTERNALS, by package name.
    "@respin/*/src",
    "@respin/*/src/*",
    "@respin/*/src/**",
    // Any spelling that names a `packages/<pkg>/src` path explicitly.
    "**/packages/*/src",
    "**/packages/*/src/*",
    "**/packages/*/src/**",
    "@/packages/**",
    // Relative paths that climb OUT of one package and into another's src.
    // `../../<pkg>/src/...` from packages/<x>/src or packages/<x>/tests, and a
    // level or two deeper for files under a subdirectory.
    "../../*/src",
    "../../*/src/*",
    "../../*/src/**",
    "../../../*/src",
    "../../../*/src/*",
    "../../../*/src/**",
    "../../../../*/src/*",
    "../../../../*/src/**",
  ],
  message:
    "packages/** reach another package through its @respin/* ROOT or a DECLARED entrypoint (./app-server, ./webhook-server, ./admin-server, ./client) — never into its src/. A deep or relative path into another package's internals bypasses every name-anchored rule, including the M2a scope cage (tenancy T1, M2a A-2b)",
};

const APP_DIRECTION_DENY = {
  group: ["**/app/**", "@/app/**"],
  message:
    "packages/ must never import from app/ (tech-spec §1 import-direction rule)",
};

export default tseslint.config(
  {
    // `.tmp/**` AND THE `__` SCRATCH CONVENTION are here for the same reason
    // as `.next/**`: they hold files nobody wrote as source (code review round
    // 1, C14). `.tmp/` is where `tsx` and node's compile cache land when a
    // script is run from `respin/`, and a reviewer's scratch file there made
    // `pnpm lint` exit 1 with 14 errors from code that is not part of the
    // build — so "lint 0" was not reproducible on an untidy tree. The `__*`
    // patterns are the same population `.gitignore` refuses to commit; a
    // planted probe is a deliberate violation and lint reporting it is noise,
    // not a finding.
    ignores: [
      ".next/**",
      "node_modules/**",
      "**/node_modules/**",
      "next-env.d.ts",
      ".tmp/**",
      "**/__*.ts",
      "**/__*.tsx",
      "**/__scan_probe__/**",
      "**/__stripe_scan_probe__/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // tech-spec §1: app/ imports from packages/; packages never import from app/.
    // PLUS the trustWorkspaceId cage (tenancy plan-gate finding 4): the
    // non-session mint is importable ONLY from the named sanctioned files
    // (Stripe webhook resolution) and tests — an ALLOWLIST of files, not a
    // deny-list of app/**. The sanctioned files get their own block below.
    files: ["packages/**/*.ts", "packages/**/*.tsx"],
    ignores: [
      "packages/credits/src/stripe/webhooks.ts",
      "packages/credits/src/stripe/customers.ts",
      "packages/*/tests/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@respin/db",
              importNames: ["trustWorkspaceId"],
              message:
                "trustWorkspaceId mints a VerifiedWorkspaceId WITHOUT session verification — only the Stripe webhook resolution files (packages/credits/src/stripe/{webhooks,customers}.ts) and tests may import it (tenancy T1)",
            },
          ],
          patterns: [APP_DIRECTION_DENY, CROSS_PACKAGE_DENY],
        },
      ],
    },
  },
  {
    // The sanctioned trustWorkspaceId call sites: the import-direction rule
    // AND the cross-package shape deny still bind; only the trustWorkspaceId
    // name restriction is lifted. A grant for ONE import name is not a grant to
    // reach the module by a different spelling.
    files: [
      "packages/credits/src/stripe/webhooks.ts",
      "packages/credits/src/stripe/customers.ts",
      "packages/*/tests/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [APP_DIRECTION_DENY, CROSS_PACKAGE_DENY],
        },
      ],
    },
  },
  // T1 default-deny (respin-brain-tenancy; plan-review finding 5): app code
  // may import ONLY the sanctioned package surfaces. allowImportNames makes
  // this an allowlist — an export added in M1 stays unimportable from app/**
  // by default. createDb + drizzle's sql tag would bypass withWorkspace with
  // zero schema imports, so the connection is denied here too — by BOTH
  // package name and path spelling. Stated precisely, because a claim is only
  // worth what enforces it: THIS rule sees static `import`/`export … from`
  // only. ESLint's no-restricted-imports registers no ImportExpression
  // handler, so `await import(...)` is invisible to it and is covered instead
  // by the source scan in tests/import-boundary.test.ts. Two mechanisms, both
  // asserted; neither one alone is "unreachable".
  // Scope is EVERYTHING except packages/** and tests/**. The rule value is
  // built by ONE function so the app/(admin) override cannot drift from the
  // base (M1 phase 3 task 8b): `adminSurface` additionally admits the config
  // WRITE entrypoint (@respin/config/admin-server) — admin routes only.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["packages/**", "tests/**"],
    rules: {
      "no-restricted-imports": appRestrictedImports(),
    },
  },
  {
    // Slice 8's dedicated process is neither app code nor a domain package.
    // It may compose the trend validator and the exact system-spend DB adapter,
    // while the same default-deny still blocks raw DB/table/query surfaces.
    files: ["worker/**/*.ts"],
    rules: {
      "no-restricted-imports": appRestrictedImports({ systemWorkerSurface: true }),
    },
  },
  {
    // app/(admin)/** — same rule via the same builder, plus the config WRITE
    // entrypoint. Never widened elsewhere.
    files: ["app/(admin)/**/*.ts", "app/(admin)/**/*.tsx"],
    rules: {
      "no-restricted-imports": appRestrictedImports({ adminSurface: true }),
    },
  },
  {
    // app/api/stripe/webhook/route.ts — THE ONE FILE, not a subtree. Same rule
    // via the same builder, plus the Stripe SDK and the event dispatcher.
    //
    // Round 2 scoped this to `app/api/stripe/**` → `app/api/stripe/webhook/**`,
    // which is still a subtree: a helper module beside the route inherits both
    // grants, and `export * from "stripe"` there would re-export the SDK to any
    // sibling that imports `@/app/api/stripe/webhook/helper` (probe-confirmed
    // ALLOWed, round-3 NOTE). Only `route.ts` exists today and only `route.ts`
    // performs the signature check that makes dispatch legitimate, so the grant
    // is exactly `route.ts`. A future helper must either be gate-free or get
    // its own named entry here — a deliberate act, with a deny fixture at
    // app/api/stripe/webhook/helper.ts proving the default.
    files: ["app/api/stripe/webhook/route.ts"],
    rules: {
      "no-restricted-imports": appRestrictedImports({ webhookSurface: true }),
    },
  },
  {
    // scripts/** — operator CLIs (Phase 10b-1 Task 5). Run by a person at a
    // terminal, never by a request.
    //
    // WHAT THIS SURFACE ACTUALLY ADMITS, corrected after round 1 caught the
    // first version of this comment overclaiming:
    //   * the deletion-journal cost forecast and the enablement decision derived
    //     from it — pure functions with no imports at all;
    //   * the restore verifier and purge-candidate projections;
    //   * the S3 adapter's VERIFIER and PURGE principals (the writer is denied
    //     by name above — journal-purge.ts genuinely deletes S3 object versions,
    //     so "every name here is a total function" was never true);
    //   * `respinDb`, which every surface inherits from the base allowlist and
    //     which DOES open a connection. It is not needed by any script here; it
    //     is listed so the next reader is not misled about the boundary.
    // The default-deny still blocks raw DB construction, table objects, the
    // write capabilities and the scope values.
    files: ["scripts/**/*.ts"],
    rules: {
      "no-restricted-imports": appRestrictedImports({ operatorScriptSurface: true }),
    },
  }
);
