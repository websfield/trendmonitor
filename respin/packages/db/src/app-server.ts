// The SANCTIONED surface for app/** (phase-2 handoff contract, audience split):
// app code gets high-level, always-scoped operations and never the raw
// connection — a handler holding createDb + the sql tag could bypass
// withWorkspace with zero schema imports, so the connection stays in here.
// The lint in respin/eslint.config.mjs enforces this default-deny for STATIC
// imports; the dynamic-import source scan in respin/tests/import-boundary.test.ts
// covers `await import(...)`, which no-restricted-imports does not see.
import {
  cancelIdentityDeletion,
  cancelScopedDeletion,
  pendingDeletionsForScope,
  readIdentityCancellationStatus,
  requestIdentityDeletion,
  requestProfileDeletion,
  requestWorkspaceDeletion,
  type IdentityDeletionRequestResult,
  type ScopedRequestParams,
} from "./deletion-lifecycle";
import type { DeletionOperation, DeletionScope } from "./lifecycle-schema";
import { resolveAppDeletionJournal } from "./deletion-journal-compose";
import {
  assertDeletionRequestsEnabled,
  DELETION_SCOPES,
  resolveDeletionRequestEnablement,
} from "./deletion-request-enablement";
import { createAuthMailRecoveryDelivery, type AuthMailPort } from "./auth-mail";
import { deriveActivationCohorts, resolveActivationExclusions, type ActivationCohort } from "./activation";
import {
  beginIdentityCancellationRecoverySession,
  createIdentityCancellationProofWithPassword,
} from "./auth-lifecycle";
import { NO_SEAT_CAP_RESTORE_POLICY } from "./deletion-ports";

// Moved to deletion-ports.ts (R-162) so the worker composes the same policy;
// re-exported here so the facade's surface is unchanged.
export { NO_SEAT_CAP_RESTORE_POLICY };
import {
  createDb,
  createMarketingReadDb,
  MARKETING_READ_POOL_MAX,
  createRunSlotPool,
  DEFAULT_RUN_SLOT_POOL_MAX,
  type Db,
} from "./client";
import { ensureUserWorkspace, type BootstrapParams } from "./bootstrap";
import {
  withWorkspace,
  monthlySpend,
  burnByMode,
  brainAssetSummary,
  hasGenerationForProfile,
  ProfileScope,
  writeCapabilities,
  type ActivateBrainDocCoherentResult,
  type BurnByModeResult,
  type BrainAssetSummary,
  type LedgerPage,
  type MonthlySpendResult,
  type ReadGradeWorkspaceScope,
  type WorkspaceCtx,
  type WorkspaceScope,
} from "./with-workspace";
import {
  promotionProposalHistoryInScope,
  promotionProposalReviewInScope,
  type DecidePromotionProposalParams,
  type PromotionDecisionResult,
  type PromotionProposalReview,
} from "./promotion-ops";
import type { PromotionProposal } from "./promotion-schema";
import {
  appendOwnPost,
  appendReferencePost,
  checkCandidateReferenceSafety,
  listOnboardingInputs,
} from "./onboarding-ops";
import type { InputClass } from "./onboarding-schema";
import {
  activateBrainCoherent,
  confirmVoiceFields,
  confirmStrategyFields,
  confirmKillTestFields,
  editBrainDocument,
  editDeclaredMetric,
  withBrainEditSlot,
  readBrainHistory,
  readVoiceBrain,
  readStrategyBrain,
  readKillTestBrain,
  type BrainClaimEdit,
  type DeclaredMetricEdit,
} from "./brain-ops";
import {
  openBrainExport,
  type BrainExportFormat,
} from "./export";
import {
  reconcileSpend,
  type IncludedBuildPurposesFor,
  type SpendReconciliationResult,
} from "./spend-rollup";
import { pgRunSlots, type RunSlots } from "./run-slot";
// Slice 3b, Stage B1's binding. Stage A left these three UNBOUND on purpose —
// `tests/profile-cage.test.ts`'s AC-13 pin already named the three
// `interview-ops.ts` entries with the note "not yet bound on app-server.ts
// (Stage A is DB-layer only; the facade bind is a later stage's job)". This is
// that bind, matching the exact positional-`WorkspaceScope` shape every other
// profile-grained trio in this file already uses.
import {
  getInterviewDraft,
  saveInterviewDraft,
  submitInterview,
  type SubmitInterviewResult,
} from "./interview-ops";
// Slice 7 (stage A). The framework surface, bound here for the same reason the
// interview trio is: these functions take a `db` handle, and the facade is what
// supplies the pooled one. Positional `WorkspaceScope` on every one of them,
// which is not a style choice — `tests/profile-cage.test.ts`'s AC-13 scan finds
// scope-taking entries by reading parameter TYPE TEXT, so folding them into an
// options object would hide five new entries from the completeness check whose
// whole job is proving each reaches `assertScoped`.
import {
  approvePrivateFramework,
  createPrivateFramework,
  editPrivateFramework,
  eligibleFrameworks,
  listPrivateFrameworks,
  retirePrivateFramework,
  sharedFrameworkLibrary,
  type EligibleFramework,
  type PrivateFrameworkEntitlement,
} from "./frameworks";
import type { Framework } from "./brain-schema";
// Slice 7 (stage A). The feedback pair. Positional `WorkspaceScope`, AC-13
// reason as above; `listFeedback` returns RAW stored events by requirement
// (R11), so there is deliberately no summary method here to bind.
import {
  excludeFeedbackFromHistory,
  listFeedback,
  recordFeedback,
  rememberForFutureDrafts,
} from "./feedback-ops";
import type { Generation, GenerationFeedbackRow } from "./generation-schema";
// Slice 9a. The results readers, the SAME shape as the feedback pair one line
// up and for the same reasons: positional `WorkspaceScope`, and `listResults`
// returns RAW stored rows by requirement (contract C5 puts every comparison in
// `@respin/brain`).
//
// THE SENTENCE THAT USED TO END THIS COMMENT — "so there is deliberately no
// comparison method here to bind" — WAS TRUE WHEN WRITTEN AND IS NOW FALSE. It
// is corrected rather than deleted, because the distinction it protects still
// holds and is the easy one to lose: there IS a comparison method bound below;
// what there is not, and must never be, is a comparison CONSTRUCTED in
// `@respin/db`. `resultComparisons` scopes, fetches, calls `@respin/brain` and
// returns — see `results-comparison-ops.ts` for why GROUPING went there rather
// than here, which was a corrected mistake and not an obvious choice (R-105).
import {
  countResults,
  declaredMetricForProfile,
  generationsForResultLog,
  listResults,
  recordResult,
} from "./results-ops";
import { resultComparisons } from "./results-comparison-ops";
import type { ComparisonGroup } from "@respin/brain";
import type { DeclaredMetric, ResultRow } from "./results-schema";
import type {
  RecordGenerationFeedbackParams,
  RecordResultParams,
  PerformanceLearningEntitlement,
} from "./with-workspace";
import type { OnboardingInterviewDraft } from "./onboarding-schema";
import {
  selectActiveProfile,
  selectedProfileForMember,
} from "./profile-selection";
import {
  pastedReferencesForProfile,
  trackNicheForProfile,
  trackedNichesForProfile,
  trendFeedProjection,
  untrackNicheForProfile,
  type PastedReference,
  type TrackedNicheEntitlement,
  type TrendFeedItem,
} from "./trends-storage";

let cached: Db | undefined;

/**
 * Lazy, call-time connection (no env read at import time — testability, R-16).
 * Exported for OTHER PACKAGES (e.g. @respin/auth's adapter) — the default-deny
 * lint keeps it unimportable from app/**, same as createDb.
 */
export function getServerDb(): Db {
  cached ??= createDb(process.env.DATABASE_URL);
  return cached;
}

let marketingCached: Db | undefined;

/**
 * THE PUBLIC PAGES' OWN SMALL POOL (Phase 6 billing gate, R-175): a separate
 * `pg.Pool` of `MARKETING_READ_POOL_MAX` connections with a statement timeout,
 * so landing traffic cannot take connections from webhooks, debits or
 * settlements on `getServerDb()`'s pool. Package-facing like `getServerDb`;
 * `app/**` reaches it only through `@respin/config/app-server`'s
 * `getActiveConfigForPublicPage`.
 */
export function getMarketingReadDb(): Db {
  marketingCached ??= createMarketingReadDb(process.env.DATABASE_URL);
  // FAIL FAST WHEN SATURATED (Phase 6 billing re-run): `pg.Pool` has no bound
  // on its wait queue, so a request that would queue is refused here instead.
  // Read from the pool's own counters (`pg-pool`: `totalCount`, `idleCount`,
  // `waitingCount`); the caller turns the refusal into number-free copy.
  const pool = marketingCached.$client as {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  if (
    pool.waitingCount > 0 ||
    (pool.totalCount >= MARKETING_READ_POOL_MAX && pool.idleCount === 0)
  ) {
    throw new MarketingReadPoolBusyError();
  }
  return marketingCached;
}

/** The public pages' pool is saturated; the page renders its number-free copy. */
export class MarketingReadPoolBusyError extends Error {
  constructor() {
    super(
      "The public pages' read pool is saturated, so this read was refused rather than queued. The page renders its number-free copy; nothing else is affected."
    );
    this.name = "MarketingReadPoolBusyError";
  }
}

/**
 * The server's run-slot semaphore (tech-spec §6).
 *
 * ON ITS OWN POOL, NOT `getServerDb().$client`, and `createRunSlotPool`'s
 * docblock carries the whole argument: a slot is a connection held across the
 * vendor call, so taking slots from the query pool lets N runs hold every
 * connection while each waits for one more to commit its debit — a deadlock in
 * which the `finally` that frees the slot sits behind the wait that never ends.
 *
 * Cached for the same reason the db is: a fresh semaphore per call is a fresh
 * pool, and a per-call pool bounds nothing at all.
 *
 * `RUN_SLOT_POOL_MAX` is read at CALL time, not import time (R-16), and an
 * unparseable value is refused rather than silently defaulted — this number is
 * the process-wide ceiling on concurrent vendor calls, so a typo quietly
 * widening it is the failure this whole file exists to prevent.
 *
 * Not on `respinDb`: this is a capability for `@respin/credits`, which owns the
 * metered operation. `app/**` has no business taking a slot, and the
 * default-deny lint that keeps `createDb` out of `app/**` keeps this out too.
 */
let cachedSlots: RunSlots | undefined;
export function getServerRunSlots(): RunSlots {
  cachedSlots ??= pgRunSlots(
    createRunSlotPool(process.env.DATABASE_URL, runSlotPoolMax())
  );
  return cachedSlots;
}

const CONTROL_SLOT_POOL_MAX = 4;
let cachedControlSlots: RunSlots | undefined;
function getServerControlSlots(): RunSlots {
  cachedControlSlots ??= pgRunSlots(
    createRunSlotPool(process.env.DATABASE_URL, CONTROL_SLOT_POOL_MAX)
  );
  return cachedControlSlots;
}

function runSlotPoolMax(): number {
  const raw = process.env.RUN_SLOT_POOL_MAX;
  if (raw === undefined || raw.trim() === "") return DEFAULT_RUN_SLOT_POOL_MAX;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `RUN_SLOT_POOL_MAX must be a positive integer, received ${JSON.stringify(raw)}. Refusing rather than falling back to ${DEFAULT_RUN_SLOT_POOL_MAX} — a silently ignored ceiling is an unbounded vendor spend.`
    );
  }
  return parsed;
}

export const respinDb = {
  /**
   * Phase 10a plan C5 / R-121: the internal activation report, exact daily
   * counts for authorised operators only. The consumer of 10b-1's sole
   * activation seam; it copies no SQL and no rule, and every row carries the
   * verification limitation and the small-cell flag on the returned shape.
   */
  activationReport: (asOf: Date = new Date()): Promise<readonly ActivationCohort[]> =>
    deriveActivationCohorts(getServerDb(), resolveActivationExclusions(process.env), asOf),
  ensureUserWorkspace: (params: BootstrapParams) =>
    ensureUserWorkspace(getServerDb(), params),
  withWorkspace: (ctx: WorkspaceCtx) => withWorkspace(getServerDb(), ctx),
  /**
   * R-163: the READ grade. Exactly three callers (`readScopeForUser`):
   * `/api/export`, `/settings/account`, `/brain`. A tombstoned workspace whose
   * deletion is still undecided yields a `ReadGradeWorkspaceScope`, which no
   * writer below accepts.
   */
  withWorkspaceReadGrade: (ctx: WorkspaceCtx) =>
    withWorkspace(getServerDb(), ctx, { grade: "read" }),
  selectedProfileForMember: (scope: WorkspaceScope | ReadGradeWorkspaceScope) =>
    selectedProfileForMember(getServerDb(), scope),
  selectActiveProfile: (scope: WorkspaceScope, profileId: string) =>
    selectActiveProfile(getServerDb(), scope, profileId),
  trendFeed: (
    scope: WorkspaceScope,
    profileId: string,
    now?: Date
  ): Promise<TrendFeedItem[]> => trendFeedProjection(getServerDb(), scope, profileId, now),
  trackNiche: (
    scope: WorkspaceScope,
    profileId: string,
    niche: string,
    entitlement: TrackedNicheEntitlement
  ) => trackNicheForProfile(getServerDb(), scope, profileId, niche, entitlement),
  trackedNiches: (scope: WorkspaceScope, profileId: string) =>
    trackedNichesForProfile(getServerDb(), scope, profileId),
  untrackNiche: (
    scope: WorkspaceScope,
    profileId: string,
    trackedNicheId: string
  ) => untrackNicheForProfile(getServerDb(), scope, profileId, trackedNicheId),
  // Slice 8c (R-96). The owner-only READ of pasted references is the app's
  // path to the section on `/trends`; it is scoped like `trackedNiches`.
  pastedReferences: (scope: WorkspaceScope, profileId: string): Promise<PastedReference[]> =>
    pastedReferencesForProfile(getServerDb(), scope, profileId),
  // THERE IS DELIBERATELY NO `intakePastedReference` BIND HERE (slice 8c
  // stage B, R-98). The stage-A intake is unmetered by design — the debit
  // rides in `@respin/credits`' `submitPastedReference`, which composes the
  // package-index export on its own transaction handle — so a bind on THIS
  // facade was a door through which a screen could paste for free. Stage A
  // bound it provisionally and asked stage B to delete it if no non-bypass
  // caller appeared; none did (`app/**` builds against `respinCredits`), so
  // it is gone. The READ stays: it spends nothing.
  // Slice 1's intake pair. Both take a WorkspaceScope POSITIONALLY rather than
  // inside an options object, and that is not a style choice: the AC-13
  // completeness scan in `tests/profile-cage.test.ts` finds scope-taking
  // entries by reading parameter TYPE TEXT, so `(params: AppendOwnPostParams)`
  // would hide both from the scan that exists to prove every scope-taking
  // entry reaches `assertScoped`. A cage whose scan cannot see the entry is
  // the fail-open shape CLAUDE.md's 2026-08-21 lesson is about.
  //
  // `profileId` is a plain string on purpose — `ProfileScope.mint` is what
  // turns it into a verified id, and there is no `trustProfileId` for a caller
  // to reach for instead.
  appendOwnPost: (
    scope: WorkspaceScope,
    profileId: string,
    content: string,
    attested: boolean
  ) => appendOwnPost(getServerDb(), scope, profileId, content, attested),
  // Slice 4's sibling. `sourceUrl` is a plain optional string, never a
  // parameterised `input_class` — see `appendReferencePost`'s docblock for why
  // that distinction is the whole point (G-12).
  appendReferencePost: (
    scope: WorkspaceScope,
    profileId: string,
    content: string,
    sourceUrl?: string
  ) => appendReferencePost(getServerDb(), scope, profileId, content, sourceUrl),
  checkCandidateReferenceSafety: (
    scope: WorkspaceScope,
    profileId: string,
    candidate: string
  ) =>
    checkCandidateReferenceSafety(
      getServerDb(),
      scope,
      profileId,
      candidate
    ),
  listOnboardingInputs: (
    scope: WorkspaceScope,
    profileId: string,
    page?: LedgerPage,
    inputClass?: InputClass
  ) => listOnboardingInputs(getServerDb(), scope, profileId, page, inputClass),
  // Slice 3's brain trio. Positional `WorkspaceScope` for the same reason the
  // pair above is positional: the AC-13 completeness scan in
  // `tests/profile-cage.test.ts` finds scope-taking entries by reading
  // parameter TYPE TEXT, so folding these into an options object would hide
  // three new entries from the scan whose whole job is to prove every one of
  // them reaches `assertScoped`.
  //
  // `brainDocId` is a plain string, like `profileId` — `readOwnBrainDoc` is
  // what refuses a foreign, nonexistent or malformed one, with a single
  // byte-identical message so that a foreign id and an absent id are not
  // distinguishable (P2).
  readVoiceBrain: (scope: WorkspaceScope, profileId: string) =>
    readVoiceBrain(getServerDb(), scope, profileId),
  confirmVoiceFields: (
    scope: WorkspaceScope,
    profileId: string,
    brainDocId: string,
    confirmedFields: { pointer: string; asPlaceholder: boolean }[]
  ) =>
    confirmVoiceFields(
      getServerDb(),
      scope,
      profileId,
      brainDocId,
      confirmedFields
    ),
  // `activateVoice` WAS A FACADE ENTRY HERE and is gone (tenancy gate round 2,
  // 2026-09-01). It bound slice 3's single-document activation, which writes
  // no `brain_activation_snapshots` row; slice 3b replaced it on `/brain` with
  // `activateBrainCoherent` and it has had ZERO `app/**` callers ever since —
  // an unreachable scoped write is inventory, not tenancy surface (the same
  // Definition-of-Done rule that deleted four accessors in slice 5). It is not
  // only unused: since R9a the generation path assembles its prompt from the
  // documents its recorded snapshot NAMES, so a single-document activation on
  // a profile that had already activated coherently would have left the
  // product writing in the superseded voice, silently. `brain-ops.ts` carries
  // the full note; `activateBrainCoherent` below is the whole surface.
  //
  // Slice 3b (Stage B2): the confirm trio extended to `strategy`/`killtest`,
  // and ONE coherent activation entrypoint for all three kinds (R8).
  // Positional `WorkspaceScope`, same AC-13 reason as every entry above.
  readStrategyBrain: (scope: WorkspaceScope, profileId: string) =>
    readStrategyBrain(getServerDb(), scope, profileId),
  readKillTestBrain: (scope: WorkspaceScope, profileId: string) =>
    readKillTestBrain(getServerDb(), scope, profileId),
  readBrainHistory: (
    scope: WorkspaceScope | ReadGradeWorkspaceScope,
    profileId: string,
    kind: "voice" | "strategy" | "killtest" | "performance_meta"
  ) => readBrainHistory(getServerDb(), scope, profileId, kind),
  editBrainDocument: (
    scope: WorkspaceScope,
    profileId: string,
    brainDocId: string,
    edits: readonly BrainClaimEdit[]
  ) =>
    withBrainEditSlot(getServerControlSlots(), scope, () =>
      editBrainDocument(getServerDb(), scope, profileId, brainDocId, edits)
    ),
  editDeclaredMetric: (
    scope: WorkspaceScope,
    profileId: string,
    brainDocId: string,
    metric: DeclaredMetricEdit
  ) =>
    withBrainEditSlot(getServerControlSlots(), scope, () =>
      editDeclaredMetric(getServerDb(), scope, profileId, brainDocId, metric)
    ),
  openBrainExport: (
    scope: WorkspaceScope | ReadGradeWorkspaceScope,
    profileId: string,
    format: BrainExportFormat
  ): Promise<AsyncIterable<string>> =>
    openBrainExport(
      getServerDb(),
      scope,
      profileId,
      format,
      getServerControlSlots()
    ),
  confirmStrategyFields: (
    scope: WorkspaceScope,
    profileId: string,
    brainDocId: string,
    confirmedFields: { pointer: string; asPlaceholder: boolean }[]
  ) =>
    confirmStrategyFields(
      getServerDb(),
      scope,
      profileId,
      brainDocId,
      confirmedFields
    ),
  confirmKillTestFields: (
    scope: WorkspaceScope,
    profileId: string,
    brainDocId: string,
    confirmedFields: { pointer: string; asPlaceholder: boolean }[]
  ) =>
    confirmKillTestFields(
      getServerDb(),
      scope,
      profileId,
      brainDocId,
      confirmedFields
    ),
  // ONE ACTIVATION ENTRYPOINT FOR ALL THREE KINDS (R8) — see
  // `activateBrainCoherent`'s own docblock in `brain-ops.ts` for why this is
  // not split per kind the way the confirm trio above is.
  activateBrainCoherent: (
    scope: WorkspaceScope,
    profileId: string,
    brainDocId: string
  ): Promise<ActivateBrainDocCoherentResult> =>
    activateBrainCoherent(getServerDb(), scope, profileId, brainDocId),
  // Slice 2b. `monthlySpend` is positional `WorkspaceScope` for the AC-13 scan,
  // like every entry above; `reconcileSpend` takes no SCOPE, deliberately — it
  // is the cross-workspace operator query `/admin/model-spend` calls behind
  // `requireAdmin()`, the same shape as `@respin/config`'s
  // `getActiveConfigServer` taking no scope.
  //
  // It does take `includedBuildPurposes` (R-81), with no default: which
  // purposes price their first billable attempt at zero is `priceOf`'s answer
  // and `@respin/db` may not import `@respin/credits`, so the caller carries
  // it — the same seam the framework writes' `entitlement` argument opens for
  // the tier. A tier gate, not a tenancy one, so it is not an AC-13 entry.
  monthlySpend: (
    scope: WorkspaceScope,
    periodStart: Date
  ): Promise<MonthlySpendResult> => monthlySpend(getServerDb(), scope, periodStart),
  // Slice 6, R17a: the SAME period, split by the mode each debit's attempt
  // settled into. A second method rather than a field on `MonthlySpendResult`
  // so that a by-mode read failing cannot take the total down with it — the
  // fail-soft shape `/usage` already uses for the pause notice — and
  // positional `WorkspaceScope`, like every entry above, for the AC-13 scan.
  burnByMode: (
    scope: WorkspaceScope,
    periodStart: Date
  ): Promise<BurnByModeResult> => burnByMode(getServerDb(), scope, periodStart),
  // R-85: a RESOLVER, not a list — the exemption is decided per
  // `model_usage.config_version`, so the caller is asked about the versions
  // this data was actually priced under rather than about today's document.
  reconcileSpend: (
    includedBuildPurposesFor: IncludedBuildPurposesFor
  ): Promise<SpendReconciliationResult> =>
    reconcileSpend(getServerDb(), includedBuildPurposesFor),
  // Slice 3b, Stage B1: the structured-interview trio. Positional
  // `WorkspaceScope`, the same AC-13 reason as every entry above — see
  // `tests/profile-cage.test.ts`'s pinned list, which already named these
  // three at `interview-ops.ts` and now also names their bind here.
  //
  // `patch`/no-second-arg are exactly what `interview-ops.ts` takes — `unknown`
  // for the patch because validation is `saveInterviewDraft`'s own job
  // (`parseAnswers`), the same "validate at the boundary" discipline
  // `writeBrainDoc`'s `content: unknown` already uses one entry up.
  saveInterviewDraft: (
    scope: WorkspaceScope,
    profileId: string,
    patch: unknown
  ): Promise<OnboardingInterviewDraft> =>
    saveInterviewDraft(getServerDb(), scope, profileId, patch),
  getInterviewDraft: (
    scope: WorkspaceScope,
    profileId: string
  ): Promise<OnboardingInterviewDraft | null> =>
    getInterviewDraft(getServerDb(), scope, profileId),
  submitInterview: (
    scope: WorkspaceScope,
    profileId: string
  ): Promise<SubmitInterviewResult> =>
    submitInterview(getServerDb(), scope, profileId),
  // ---------------------------------------------------------------- slice 7
  //
  // THE FRAMEWORK SURFACE (R5a-R5c). Six methods, and the `entitlement`
  // argument on the four WRITES is the seam this stage deliberately leaves
  // open: `@respin/db` cannot resolve a tier (R-30 constraint 2), so the
  // caller must state whether this workspace's plan includes private
  // frameworks. It has NO DEFAULT — an omitted answer is a compile error, not
  // a permissive one — and `@respin/credits` owns the mapping from
  // `getWorkspaceBillingState().tier` to `"included" | "not_included"`
  // (PRD §4G: Pro and Studio only).
  //
  // `sharedFrameworkLibrary` takes NO scope, and that is correct rather than
  // an omission: a shared framework has both owner columns NULL by CHECK, so
  // it belongs to nobody and is the same set for every workspace — the same
  // shape `reconcileSpend` above uses for a query with no tenant.
  sharedFrameworkLibrary: (): Promise<EligibleFramework[]> =>
    sharedFrameworkLibrary(getServerDb()),
  eligibleFrameworks: (
    scope: WorkspaceScope,
    profileId: string
  ): Promise<EligibleFramework[]> =>
    eligibleFrameworks(getServerDb(), scope, profileId),
  listPrivateFrameworks: (
    scope: WorkspaceScope,
    profileId: string
  ): Promise<EligibleFramework[]> =>
    listPrivateFrameworks(getServerDb(), scope, profileId),
  createPrivateFramework: (
    scope: WorkspaceScope,
    profileId: string,
    content: unknown,
    entitlement: PrivateFrameworkEntitlement
  ): Promise<Framework> =>
    createPrivateFramework(getServerDb(), scope, profileId, {
      content,
      entitlement,
    }),
  editPrivateFramework: (
    scope: WorkspaceScope,
    profileId: string,
    baseFrameworkId: string,
    content: unknown,
    entitlement: PrivateFrameworkEntitlement
  ): Promise<Framework> =>
    editPrivateFramework(getServerDb(), scope, profileId, {
      baseFrameworkId,
      content,
      entitlement,
    }),
  approvePrivateFramework: (
    scope: WorkspaceScope,
    profileId: string,
    frameworkId: string,
    entitlement: PrivateFrameworkEntitlement
  ): Promise<Framework> =>
    approvePrivateFramework(
      getServerDb(),
      scope,
      profileId,
      frameworkId,
      entitlement
    ),
  retirePrivateFramework: (
    scope: WorkspaceScope,
    profileId: string,
    frameworkId: string,
    entitlement: PrivateFrameworkEntitlement
  ): Promise<Framework> =>
    retirePrivateFramework(
      getServerDb(),
      scope,
      profileId,
      frameworkId,
      entitlement
    ),
  // Slice 7, R10/R11. `params` is the capability's own param type — validation
  // (the closed reaction set, the note's blank/length rules) belongs to the
  // capability, the same "validate at the boundary" discipline
  // `saveInterviewDraft`'s `patch: unknown` uses one entry up.
  recordFeedback: (
    scope: WorkspaceScope,
    profileId: string,
    params: RecordGenerationFeedbackParams
  ): Promise<GenerationFeedbackRow> =>
    recordFeedback(getServerDb(), scope, profileId, params),
  listFeedback: (
    scope: WorkspaceScope,
    profileId: string,
    page?: LedgerPage
  ): Promise<GenerationFeedbackRow[]> =>
    listFeedback(getServerDb(), scope, profileId, page),
  // Audit P6-A1 (R-174): "Leave this out of future drafts". `feedbackId` is
  // untrusted; the capability resolves it through the scope and refuses a
  // foreign, missing or malformed one with one byte-identical error.
  excludeFeedbackFromHistory: (
    scope: WorkspaceScope,
    profileId: string,
    feedbackId: string
  ): Promise<GenerationFeedbackRow> =>
    excludeFeedbackFromHistory(getServerDb(), scope, profileId, feedbackId),
  // Launch L3 (R-152): "Remember this for future drafts" — the Studio-side
  // door to the SAME creator-edit path `/brain` uses, so it runs through the
  // same brain-edit slot. It writes a PROPOSED Kill Test version, never an
  // active one; the creator confirms and activates it on `/brain`.
  rememberForFutureDrafts: (
    scope: WorkspaceScope,
    profileId: string,
    params: { text: string }
  ) =>
    withBrainEditSlot(getServerControlSlots(), scope, () =>
      rememberForFutureDrafts(getServerDb(), scope, profileId, params)
    ),
  brainAssetSummary: (
    scope: WorkspaceScope,
    profileId: string
  ): Promise<BrainAssetSummary> =>
    brainAssetSummary(getServerDb(), scope, profileId),
  hasGenerationForProfile: (
    scope: WorkspaceScope,
    profileId: string
  ): Promise<boolean> =>
    hasGenerationForProfile(getServerDb(), scope, profileId),
  // Slice 9a, R5-R9. `params` is the capability's own param type, the
  // `recordFeedback` line above: validation (the closed vocabularies, the
  // lever pairs, the window, the note rules and the R8 declared-metric
  // refusal) belongs to `recordResult`, which is also where every
  // server-derived column is built.
  recordResult: (
    scope: WorkspaceScope,
    profileId: string,
    params: RecordResultParams,
    entitlement: PerformanceLearningEntitlement
  ): Promise<ResultRow> =>
    recordResult(getServerDb(), scope, profileId, params, entitlement),
  // RAW ROWS, no comparison — see `results-ops.ts`'s header for what this
  // surface may never grow.
  listResults: (
    scope: WorkspaceScope,
    profileId: string,
    page?: LedgerPage
  ): Promise<ResultRow[]> => listResults(getServerDb(), scope, profileId, page),
  // Audit P6-R6: whether this creator has logged any result, for the
  // sentence `/studio` and first ideas render. The binding only; the query is
  // `ProfileScope.accessors.countResults`.
  countResults: (scope: WorkspaceScope, profileId: string): Promise<number> =>
    countResults(getServerDb(), scope, profileId),
  // R8. `null` is a PAGE STATE ("you have not declared a north-star metric
  // yet"), not an error - see `declaredMetricForProfile` for why the read and
  // the write answer the same absence differently.
  declaredMetricForProfile: (
    scope: WorkspaceScope,
    profileId: string
  ): Promise<DeclaredMetric | null> =>
    declaredMetricForProfile(getServerDb(), scope, profileId),
  // The output picker's scoped list. Whole rows; the projection decides what
  // of a generation a picker may show.
  generationsForResultLog: (
    scope: WorkspaceScope,
    profileId: string,
    page?: LedgerPage
  ): Promise<Generation[]> =>
    generationsForResultLog(getServerDb(), scope, profileId, page),
  // THE COMPARISON SEAM. Composition only: it constructs nothing, and the
  // WHOLE eligible population goes to `@respin/brain`, which owns grouping as
  // well as comparison.
  //
  // NO `page` PARAMETER, deliberately, and it is the one parameter a reader
  // will expect to find here: a comparison over a page is not a comparison.
  // The population's own bound plus the `truncated` flag the accessor MEASURES
  // are how this is bounded honestly instead — a clipped read is reported as
  // clipped rather than silently compared.
  resultComparisons: (
    scope: WorkspaceScope,
    profileId: string
  ): Promise<ComparisonGroup[]> =>
    resultComparisons(getServerDb(), scope, profileId),
  refreshPromotionProposals: async (
    scope: WorkspaceScope,
    profileId: string,
    entitlement: PerformanceLearningEntitlement
  ): Promise<PromotionProposal[]> => {
    const profileScope = await ProfileScope.mint(getServerDb(), scope, profileId);
    const caps = writeCapabilities(profileScope);
    return getServerDb().transaction((tx) => caps.refreshPromotionProposals(entitlement, tx));
  },
  promotionProposalReview: async (
    scope: WorkspaceScope,
    profileId: string,
    proposalId: string
  ): Promise<PromotionProposalReview> => {
    const profileScope = await ProfileScope.mint(getServerDb(), scope, profileId);
    return getServerDb().transaction((tx) => promotionProposalReviewInScope(profileScope, proposalId, tx));
  },
  promotionProposalHistory: async (
    scope: WorkspaceScope,
    profileId: string
  ): Promise<PromotionProposal[]> => {
    const profileScope = await ProfileScope.mint(getServerDb(), scope, profileId);
    return promotionProposalHistoryInScope(profileScope);
  },
  decidePromotionProposal: async (
    scope: WorkspaceScope,
    profileId: string,
    params: DecidePromotionProposalParams,
    entitlement: PerformanceLearningEntitlement
  ): Promise<PromotionDecisionResult> => {
    const profileScope = await ProfileScope.mint(getServerDb(), scope, profileId);
    const caps = writeCapabilities(profileScope);
    return getServerDb().transaction((tx) => caps.decidePromotionProposal(params, entitlement, tx));
  },

  // ---- Phase 10b-1 Task 8: owner-facing deletion (plan C2) -------------------
  // Every rule lives in deletion-lifecycle.ts and was gated in Tasks 3–5; these
  // are thin compositions. The journal is the SAME composition the worker uses:
  // unprovisioned, every request stops at `journal_pending` and says so.
  deletionJournalStatus: async (): Promise<{ configured: boolean }> => {
    const { configured } = await resolveAppDeletionJournal(process.env);
    return { configured };
  },
  /**
   * Which scopes this deployment lets a person REQUEST (`RESPIN_DELETION_REQUEST_SCOPES`).
   * Read by the page so a closed scope renders as closed rather than as a
   * button that refuses. Cancellation is never gated.
   */
  deletionRequestStatus: (): Readonly<Record<DeletionScope, boolean>> => {
    const enablement = resolveDeletionRequestEnablement(process.env);
    return Object.fromEntries(
      DELETION_SCOPES.map((scope) => [scope, enablement.requestsEnabled(scope)])
    ) as Record<DeletionScope, boolean>;
  },
  // The read asserts the cage itself (deletion-lifecycle.ts); the facade is a
  // thin forward of the same `scope`.
  pendingDeletions: (
    scope: WorkspaceScope | ReadGradeWorkspaceScope
  ): Promise<readonly DeletionOperation[]> => pendingDeletionsForScope(getServerDb(), scope),
  requestWorkspaceDeletion: async (scope: WorkspaceScope, params: ScopedRequestParams): Promise<DeletionOperation> => {
    assertDeletionRequestsEnabled(resolveDeletionRequestEnablement(process.env), "workspace");
    const { journal } = await resolveAppDeletionJournal(process.env);
    return requestWorkspaceDeletion(getServerDb(), scope, params, journal);
  },
  requestProfileDeletion: async (scope: WorkspaceScope, profileId: string, params: ScopedRequestParams): Promise<DeletionOperation> => {
    assertDeletionRequestsEnabled(resolveDeletionRequestEnablement(process.env), "profile");
    const { journal } = await resolveAppDeletionJournal(process.env);
    return requestProfileDeletion(getServerDb(), scope, profileId, params, journal);
  },
  /**
   * The seat policy restores memberships an earlier identity cancellation
   * stranded (R-162). No held-money port here (R-165): the replay lives in
   * @respin/credits, whose dispatcher keeps deliberate bare throws that must
   * stay off the app facade's reachable set, so the worker's deletion tick
   * replays held money for every workspace that is active again.
   */
  cancelScopedDeletion: async (
    operationId: string,
    params: Omit<ScopedRequestParams, "idempotencyKey" | "typedName">,
  ): Promise<DeletionOperation> => {
    const { journal } = await resolveAppDeletionJournal(process.env);
    return cancelScopedDeletion(getServerDb(), operationId, params, journal, {
      membershipRestore: NO_SEAT_CAP_RESTORE_POLICY,
    });
  },
  requestIdentityDeletion: async (
    params: Readonly<{ sessionId: string; idempotencyKey: string; reauthMaxAgeMs?: number }>,
    mail: Readonly<{ port: AuthMailPort; actionUrl: (operationId: string, secret: string) => string }>,
  ): Promise<IdentityDeletionRequestResult> => {
    assertDeletionRequestsEnabled(resolveDeletionRequestEnablement(process.env), "identity");
    const { journal } = await resolveAppDeletionJournal(process.env);
    return requestIdentityDeletion(getServerDb(), params, {
      journal,
      recoveryDelivery: createAuthMailRecoveryDelivery(getServerDb(), mail.port, { actionUrl: mail.actionUrl }),
      activationExclusions: resolveActivationExclusions(process.env),
    });
  },
  cancelIdentityDeletion: async (
    operationId: string,
    recoverySecret: string,
    params: Readonly<{ proofId: string; cancellationReceipt: string; reauthMaxAgeMs?: number }>,
  ) => {
    const { journal } = await resolveAppDeletionJournal(process.env);
    return cancelIdentityDeletion(getServerDb(), operationId, recoverySecret, params, {
      journal,
      membershipRestore: NO_SEAT_CAP_RESTORE_POLICY,
    });
  },
  beginIdentityCancellationRecoverySession: (operationId: string, recoverySecret: string, rateLimitKeyDigest: string) =>
    beginIdentityCancellationRecoverySession(getServerDb(), operationId, recoverySecret, rateLimitKeyDigest),
  createIdentityCancellationProofWithPassword: (
    operationId: string,
    recoverySession: string,
    password: string,
    rateLimitKeyDigest: string,
  ) => createIdentityCancellationProofWithPassword(getServerDb(), operationId, recoverySession, password, rateLimitKeyDigest),
  readIdentityCancellationStatus: (operationId: string, cancellationReceipt: string) =>
    readIdentityCancellationStatus(getServerDb(), operationId, cancellationReceipt),
};
