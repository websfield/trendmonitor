// The SANCTIONED surface for app/** (phase-2 handoff contract, audience split):
// app code gets high-level, always-scoped operations and never the raw
// connection — a handler holding createDb + the sql tag could bypass
// withWorkspace with zero schema imports, so the connection stays in here.
// The lint in respin/eslint.config.mjs enforces this default-deny for STATIC
// imports; the dynamic-import source scan in respin/tests/import-boundary.test.ts
// covers `await import(...)`, which no-restricted-imports does not see.
import {
  createDb,
  createRunSlotPool,
  DEFAULT_RUN_SLOT_POOL_MAX,
  type Db,
} from "./client";
import { ensureUserWorkspace, type BootstrapParams } from "./bootstrap";
import {
  withWorkspace,
  monthlySpend,
  type ActivateBrainDocCoherentResult,
  type LedgerPage,
  type MonthlySpendResult,
  type WorkspaceCtx,
  type WorkspaceScope,
} from "./with-workspace";
import {
  appendOwnPost,
  appendReferencePost,
  listOnboardingInputs,
} from "./onboarding-ops";
import type { InputClass } from "./onboarding-schema";
import {
  activateVoice,
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
import type { OnboardingInterviewDraft } from "./onboarding-schema";

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
  ensureUserWorkspace: (params: BootstrapParams) =>
    ensureUserWorkspace(getServerDb(), params),
  withWorkspace: (ctx: WorkspaceCtx) => withWorkspace(getServerDb(), ctx),
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
  activateVoice: (
    scope: WorkspaceScope,
    profileId: string,
    brainDocId: string
  ) => activateVoice(getServerDb(), scope, profileId, brainDocId),
  // Slice 3b (Stage B2): the same trio extended to `strategy`/`killtest`, and
  // ONE coherent activation entrypoint for all three kinds (R8). Positional
  // `WorkspaceScope`, same AC-13 reason as every entry above.
  readStrategyBrain: (scope: WorkspaceScope, profileId: string) =>
    readStrategyBrain(getServerDb(), scope, profileId),
  readKillTestBrain: (scope: WorkspaceScope, profileId: string) =>
    readKillTestBrain(getServerDb(), scope, profileId),
  readBrainHistory: (
    scope: WorkspaceScope,
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
    scope: WorkspaceScope,
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
  // like every entry above; `reconcileSpend` takes none, deliberately — it is
  // the cross-workspace operator query `/admin/model-spend` calls behind
  // `requireAdmin()`, the same shape as `@respin/config`'s
  // `getActiveConfigServer` taking no scope.
  monthlySpend: (
    scope: WorkspaceScope,
    periodStart: Date
  ): Promise<MonthlySpendResult> => monthlySpend(getServerDb(), scope, periodStart),
  reconcileSpend: (): Promise<SpendReconciliationResult> =>
    reconcileSpend(getServerDb()),
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
};
