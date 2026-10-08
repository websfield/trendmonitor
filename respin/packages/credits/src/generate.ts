// THE COMPOSED GENERATION (slice 6, stage C) — the metered, settled,
// money-bearing half of "a creator generates a set of hooks".
//
// WHY IT IS HERE AND NOT IN `app/**` OR IN `packages/modes`. `@respin/modes` is
// DENIED from `app/**` by the eslint negation catch-all, exactly as
// `@respin/llm` is, so no server action may assemble a generation prompt; and
// this operation needs the ledger, the resolved tier, the active config and the
// scoped write capabilities in one place. `@respin/credits` is the only package
// that already depends on all of them — the same layering argument that put
// `createProfile`, `runInference` and `inferVoice` here.
//
// WHY IT DOES NOT CALL `runInference`, WHICH IS THE OBVIOUS SHAPE AND THE WRONG
// ONE. `runInference` is ONE vendor call and ONE debit keyed on the attempt id.
// A generation is up to THREE vendor calls (a draft, one rewrite, and the cheap
// creator-rule scoring) that must produce EXACTLY ONE debit — so composing
// `runInference` per call would either take three debits for one press or need
// three attempt ids, which would break the join `model_usage`, the claim and
// `credit_ledger_inference_debit_uq` all make on one id. What this file reuses
// instead is `runInference`'s ORDER (R15) and its two hardest pieces of
// bookkeeping: `recordUsage` (the cost/`cost_state` rules, including the
// "no usage reported means unknown, never zero" branch) and `withDeadline`.
//
// THE ORDER, and what each step is here to prevent. Steps 1-6 are
// `inference.ts`'s, unchanged and in its sequence; 6c and 6d are this
// operation's, and both sit where they do for a stated reason.
//
//   1-3. Cage, role, archived profile   — nothing happens for a caller who may
//        not do this, re-read at operation time.
//   3b.  (LAUNCH L2, R-151) THE MODE SPEC, THE CREATIVE PARSE, THE ORIGIN
//        SHAPE — all pure — THEN THE CLIENT INTENT AND A SCOPED READ-ONLY
//        LOOKUP OF THE CLAIM THIS ATTEMPT ID ALREADY HAS. A same-id submission
//        is decided here and never reaches steps 4-6: `settled` replays,
//        `vendor_complete` settles (24 h predicate under the row lock; the
//        debit's own recheck is its only money gate), `refused` /
//        `recovery_required` is the typed terminal, a different intent
//        refuses. Steps 4-6 run only for a NEW operation.
//   4.   PAUSE                          — before the call, because a zero-cost
//        mode never reaches `debitCredits` and so is never refused by the
//        pause gate inside it.
//   5.   TIER + MODE + CONFIG + PRICE   — the plan gate (R18) and then a fail
//        closed on the STORED document and on a missing price row, before a
//        vendor is contacted.
//   5b.  THE REVISION'S PARENT (slice 7, R6/R8) — resolved through a SCOPED
//        capability read, before the price, because it is what decides the
//        price: a revision costs `creditCosts.revision`, an original costs its
//        mode's key, and the boolean that chooses between them is
//        `parent !== null` rather than a caller's flag. Also before the run
//        slot, so a parent this creator cannot revise from does not burn one.
//   6.   UNCHARGED CAP, then BALANCE (+ auto-top-up) — before tokens are
//        spent, never after (R15/R16).
//   6b.  THE RUN SLOT                   — after every refusal above, so an
//        attempt refused on its way out does not burn one.
//   6c.  THE BRAIN, THE FRAMEWORKS AND THE ASSEMBLY — reads and pure functions
//        only (the framework library joins them in slice 7). They
//        are AFTER the slot because they are the last thing that can refuse
//        for free, and BEFORE the claim because the claim's payload hash is
//        taken over what they produced.
//   6d.  THE DURABLE CLAIM (R14)        — committed BEFORE outbound HTTP.
//        AFTER the slot deliberately: a slot refusal must not leave a claimed
//        attempt nothing will ever advance, because a creator retrying that
//        same id would then be told it is already running instead of being
//        told to wait for a slot.
//   7.   THE VENDOR CALLS               — outside every transaction, one to
//        three of them, each writing its own `model_usage` row in its own
//        committed transaction (R14a).
//   7b.  THE DURABLE RESPONSE CHECKPOINT (R14c) — the validated candidate is
//        STORED, in the same transaction that stamps `vendor_complete`. Before
//        it existed, a failure between the vendor answering and the settlement
//        committing meant we had paid, the creator got nothing, and the output
//        we already held was thrown away. Once stored, it is settled by one of
//        three callers within 24 hours of `vendor_completed_at` — a
//        resubmission of the SAME attempt id, the creator's "Finish this
//        draft" (`settleHeldAttempt`), or the operator's
//        `scripts/settle-candidate.ts` — and NOTHING settles it automatically:
//        the worker pages before its 24-hour clear destroys it (R-157).
//   8.   THE SETTLEMENT (R14b)          — one workspace-locked transaction:
//        re-derive tier, price and balance, take THE debit, write the
//        generation and move the claim to `settled`, all or nothing. It
//        settles FROM THE STORED CANDIDATE, on the fresh path as well as on a
//        later settle of a held candidate, so there is exactly one answer to
//        "what did this generation say" and both paths read the same bytes.
import { createHash } from "node:crypto";

import {
  CreativePieceError,
  SATURATION_NOTICE,
  VENDOR_COMPLETE_HARD_CLEAR_MS,
  isPastVendorCompleteHardClear,
  mintProfileScope,
  readPointer,
  enumerateClaimFields,
  hasOpenPause,
  writeCapabilities,
  type BrainActivationSnapshot,
  type BrainDoc,
  type BrainKind,
  type CreativePieceRead,
  type CreditLedgerRow,
  type DbLike,
  type Framework as FrameworkRow,
  type Generation,
  type GenerationAttempt,
  type ProfileScope,
  type RunSlots,
  spinReferenceForProfile,
  type WorkspaceScope,
} from "@respin/db";
import {
  configVersionContents,
  getActiveConfigRequiringStored,
  type RespinConfigV1,
} from "@respin/config";
import {
  CHECK,
  LlmError,
  LlmInputTooLargeError,
  LlmTruncatedError,
  assertInputWithinCeiling,
  costMicroUsd,
  priceFor,
  type AssembledPrompt,
  type InferenceOutcome,
  type LlmProvider,
} from "@respin/llm";
import {
  CREATIVE_FORM_MODES,
  CreativeRequestError,
  FRAMEWORK_EVIDENCE_LABEL,
  GenerationAssemblyError,
  buildCorpusIndex,
  contractOf,
  modeSpec,
  parseCreativeRequest,
  parseKillTestReply,
  parseScriptOutput,
  promptBundleVersion,
  UNIVERSAL_LAWS as MODES_UNIVERSAL_LAWS,
  readStoredScriptOutput,
  refusalIsClaimOnly,
  renderDraft,
  runGeneration,
  takesCreativeForm,
  words,
  type CreativeRequest,
  type CreativeRequestInput,
  type CreatorRule,
  type Framework,
  type GenerationContext,
  type HonestRefusal,
  type GenerationRun,
  type ModeId,
  type ScriptOutput,
} from "@respin/modes";

import { deriveBalance, deriveBalanceInTx } from "./balance";
import { debitCredits } from "./ledger";
import { getDbNow, takeWorkspaceLockInOrder } from "./clock";
import {
  BrainNotActivatedError,
  AutoTopupReconciliationRequiredError,
  ConceptContextInsufficientError,
  GenerationAlreadyRefusedError,
  GenerationHeldError,
  GenerationInFlightError,
  GenerationPayloadMismatchError,
  GenerationQuoteChangedError,
  GenerationRecoveryRequiredError,
  GenerationUnchargedAttemptCapError,
  GenerationUnchargedCostCapError,
  GenerationWindowCostCapError,
  HeldDraftUnavailableError,
  InsufficientCreditsError,
  PostCallDebitError,
  RevisionParentError,
  WorkspacePausedError,
  type GenerationHeldReason,
} from "./errors";
import {
  GENERATION_PURPOSE,
  InferenceRoleError,
  ProfileArchivedError,
  RunSlotBusyError,
  TopupInFlightError,
  priceOf,
  recordUsage,
  requiredConfigPaths,
  unchargedAttemptCap,
  unchargedAttemptWindowStart,
  withDeadline,
  type PricedOperation,
} from "./inference";
import {
  emitFrameworkOfferDroppedMetric,
  emitGenerationSpendUnrecordedMetric,
  emitUnchargedAttemptCapMetric,
} from "./metrics";
import { assertModeAllowed, type EntitlementTier } from "./mode-access";
import {
  buildRecentContext,
  recentContextIdsOf,
  type RecentContextSnapshot,
} from "./recent-context";
import { getWorkspaceBillingState } from "./state";
import { maybeAutoTopup } from "./stripe/auto-topup";

/**
 * The universal laws every generation runs under (tech-spec §3 step 1, layer
 * one of the three-layer IP).
 *
 * THEY LIVE IN `@respin/modes` NOW, AND THEY ARE IN THE BUNDLE HASH (audit
 * Phase 8, P8-A4; register 2026-10-05 item 45). This docblock used to say a
 * change here did NOT move `prompt_bundle_version` and promised the honest fix
 * for slice 7, which passed without it. The constant moved beside the other
 * creator-independent prompt strings `bundle.ts` hashes, this file re-exports
 * it under the same name, and the version below is derived from the laws the
 * context actually carries — so changing one sentence moves every mode's
 * `prompt_bundle_version` (`packages/modes/tests/bundle.test.ts`).
 */
export const UNIVERSAL_LAWS: readonly string[] = MODES_UNIVERSAL_LAWS;

/** What a creator asks for. Every field is theirs; nothing here is derived. */
export type GenerateParams = {
  mode: ModeId;
  /** Opaque, server-resolved autopsy identity for `analyseAndSpin`. */
  spinAutopsyId?: string;
  /**
   * MINTED BY THE CALLER, so the durable claim, every `model_usage` row and
   * the one `credit_ledger` debit all name the same attempt — REQ-G05 joins
   * spend to revenue on exactly this value, and
   * `credit_ledger_inference_debit_uq` is keyed on it.
   */
  attemptId: string;
  /** What they gave THIS generation. Stored verbatim on `generations.request`. */
  input: string;
  /** The platform the output is for — it drives the disclosure section. */
  platform: string;
  /**
   * REVISE THE OUTPUT THIS ATTEMPT ID PRODUCED (slice 7, R6/R8), or omit for
   * an original. When it is set, `input` is the creator's revision NOTE.
   *
   * AN ATTEMPT ID RATHER THAN A GENERATION ID, and that is the tenancy
   * decision in this parameter rather than a spelling. `readGenerationForAttempt`
   * is an existing SCOPED capability — it reads through the profile's own
   * predicate — so the row it returns is this creator's by construction, and it
   * is the ROW'S OWN `id` that is then handed to `settleGeneration` as the
   * parent. A generation id taken from the caller would have needed a second
   * scoped reader that does not exist in `@respin/db`, written here, outside
   * the cage; this way the id `generations.parent_id` stores is
   * SERVER-DERIVED, which is what R6's "the server derives scope" asks for.
   *
   * WHAT IT DOES *NOT* DO: it does not carry the price. The price key is
   * decided from the RESOLVED parent (`generationOp(mode, parent !== null)`),
   * so a call that names a parent it cannot revise is refused rather than
   * discounted, and a revision cannot be priced as an original by omitting a
   * flag — there is no flag.
   */
  revisionOfAttemptId?: string;
  /**
   * THE CREATIVE FORM AND THE DECLARED FILMING LIMITS (R-148), for `ideation`
   * and `ideaToScript` only — or omitted, for the legacy contract.
   *
   * WIRE INPUT, CAST AT THE ACTION and validated HERE by `parseCreativeRequest`
   * before anything else can happen — no claim, no slot, no provider call. A
   * value for any other mode is refused rather than ignored: silently dropping
   * a creator's form choice would run a request they did not make.
   *
   * ON A REVISION: omitted means "keep the parent's" — a version-2 parent's
   * form and limits are inherited, a legacy parent's revision stays legacy.
   * Present means the creator overrode them, which a legacy parent refuses.
   */
  creative?: CreativeRequestInput;
  /**
   * COMMISSION THE SCRIPT OF THIS CREATIVE PIECE (launch L2, R-151), or omit.
   *
   * `ideaToScript` only, never with a revision target. The piece is read
   * through the profile's own scope; its STORED concept (or the creator's own
   * stored idea) is what the script is developed from — `input` is then only
   * the creator's optional note, and no text the browser sends can stand in
   * for the stored item. `attemptId` must be the operation id the piece's
   * confirmation displayed (server-minted), unless that id already has a claim
   * — a same-id submission is observed before anything else is read.
   */
  pieceId?: string;
  /**
   * "FIND MY NEXT CONCEPT" (launch L2): an `ideation` with no starting
   * concept, built from the creator's approved context, the platform and any
   * limits. `input` is then the creator's optional hint ("" for none). Not
   * combinable with a revision or a piece.
   */
  findConcept?: boolean;
  /**
   * "THIS IS A SEQUEL TO MY RECENT WORK" (launch L3, R-152 item c) — the
   * creator's EXPLICIT request, from a checkbox, and the only way the history
   * block tells the model it may build on earlier work, including a direction
   * the creator set aside. Never inferred from the input or from any model
   * output. `ideation` / `ideaToScript` only (the modes that read history);
   * anything other than `true` / `false` / absent is refused before anything
   * is read. Part of the client intent when `true`.
   */
  sequel?: boolean;
};

export type GenerateResult = {
  attemptId: string;
  /**
   * True when this call returned a record SOMEBODY ELSE settled (R14c) — no
   * vendor call was made and no debit was taken by THIS call.
   *
   * THREE OUTCOMES, NOT TWO, and the third is why this field is not derivable
   * from `run` or from a zero charge:
   *   - a fresh run that settled          → `false`, `run` set, charged
   *   - a SETTLE OF A HELD CANDIDATE — a same-id resubmission, "Finish this
   *     draft" or the operator's command → `false`, `run` NULL, charged
   *   - a re-submission of a settled attempt, or a settlement that lost the
   *     workspace lock to a concurrent one → `true`, `run` null, charged 0
   */
  replayed: boolean;
  /** The stored row. The single source of truth for what the creator gets. */
  generation: Generation;
  /**
   * The pipeline's own result, present only when THIS CALL produced it.
   *
   * NULL ON A REPLAY *AND* ON A SETTLE OF A HELD CANDIDATE (R14c; a same-id
   * resubmission, "Finish this draft" or the operator's command),
   * which is the honest answer in both cases: neither call ran a pipeline. The
   * stored row above is what the database holds, and re-deriving a typed shape
   * from jsonb would be a second answer to "what did this generation say" that
   * could disagree with the first.
   */
  run: GenerationRun | null;
  /**
   * What THIS CALL debited. Zero on a replay and zero for a mode an operator
   * has priced at 0 — and those are different facts, which is why `replayed`
   * is its own field rather than something a reader has to infer from a zero.
   */
  creditsChargedNow: number;
  balanceAfter: number;
  /**
   * THE FREE CLAIM REFUSAL (owner decision 2026-10-07, R-173; amends R-68):
   * the stored generation is an honest refusal whose ONLY final-attempt cause
   * was the claim scan, and no ledger row paid for it. Decided by
   * `isFreeClaimRefusal` from the STORED generation and the settled attempt's
   * debit on every path — fresh, held settle and replay — so a screen says
   * "no credits were used" exactly when the ledger agrees.
   */
  freeClaimRefusal: boolean;
  /** The config version that priced the debit and stamped the generation. */
  configVersion: number;
  /** The tier resolved INSIDE the settlement lock (R14b). */
  resolvedTier: EntitlementTier;
  /**
   * WHAT THE CONTEXT BUDGET COULD NOT CARRY, for the ONE call that built an
   * offer (R17, slice 7 cross-boundary pass 2026-09-01).
   *
   * WHY IT LEAVES THE PACKAGE AT ALL. `frameworksForContext` returns
   * `{kept, dropped}` and until now only the SERVER learned about a drop, via
   * `respin.credits.framework_offer.dropped`. A creator whose own private
   * frameworks fill the budget stops being offered some of the material they
   * wrote, pays the same price for that generation, and reads nothing about
   * it — which is the silence the metric was added to stop an OPERATOR
   * suffering, applied to the person who actually wrote the frameworks.
   *
   * `null` RATHER THAN ZEROES WHEN NO OFFER WAS BUILT, and the distinction is
   * the point: a replay and a retry ran no pipeline and computed no offer, and
   * a mode with no `framework_eligibility` check is never offered a library at
   * all. Zeroes there would say "nothing was dropped", which is an answer this
   * call does not have.
   *
   * COUNTS ONLY — no names. A private framework's NAME is the creator's own
   * material and this shape is projected to a screen; the same rule
   * `FrameworkOfferDroppedMetric` states for the metric.
   */
  frameworkOffer: FrameworkOfferSummary | null;
};

/** One generation's framework offer, in numbers a screen can render. */
export type FrameworkOfferSummary = {
  /** Rows `eligibleFrameworks()` returned for this profile. */
  eligible: number;
  /** Rows actually put in the prompt. */
  offered: number;
  /**
   * CURATED rows dropped — zero unless one curated row is larger than the
   * whole budget, because the offer sorts shared-first.
   */
  droppedShared: number;
  /** The creator's OWN rows that did not fit. */
  droppedPrivate: number;
};

/**
 * Refusal codes recorded on `generation_attempts.refusal_code` (R14b).
 *
 * A CLOSED SET, because an operator reading a `refused` row needs the reason
 * to be a value they can filter on rather than a sentence somebody wrote, and
 * because `generation_attempts_refusal_code` refuses a `refused` row with no
 * code at all. It is the `BrainDocReason` discipline (C-42) applied one table
 * over: a code, never prose, so no creator content can ride in this column.
 */
export const GENERATION_REFUSAL_CODES = {
  /** The vendor answered and this product could not parse the reply (R3). */
  parse_failed: "parse_failed",
  /** The vendor failed — the class carries which way (`LlmError.outcome`). */
  vendor_failed: "vendor_failed",
  /** The kill-test scoring reply could not be parsed. */
  kill_test_failed: "kill_test_failed",
  /** The balance could not cover the charge AFTER the vendor had answered. */
  post_call_debit: "post_call_debit",
  /** The workspace was paused between the pre-call gate and settlement. */
  paused: "paused",
  /**
   * THE PROMPT COULD NOT BE ASSEMBLED FROM WHAT THIS ATTEMPT WAS GIVEN.
   *
   * `GenerationAssemblyError` — an empty input, a blank platform, an empty
   * brain, an unstated `unvouchedSpecifics` list. A CALLER-SIDE refusal, and
   * it needed its own code because it was recorded as `parse_failed`: the
   * operator-facing column blamed the vendor for a reply the vendor never
   * sent, on rows where no vendor call happened at all (billing gate,
   * 2026-09-02).
   */
  assembly_refused: "assembly_refused",
  /**
   * THE TRUSTED REFERENCE COULD NOT BE COMPARED AGAINST.
   *
   * `SpinSimilarityError` — the autopsy projection this spin was given is not
   * a shape the R-3 gate can use, or the output carried no hook-marked unit to
   * compare. OURS, never the creator's, and never the vendor's.
   *
   * ITS OWN CODE FOR THE REASON `assembly_refused` HAS ONE, and it is the same
   * defect recurring one class over (billing + compliance gates, 2026-09-04,
   * reached independently). It fell through to `parse_failed`, so the
   * operator-facing column said the model had answered with something unusable
   * — when in fact the vendor answered fine and our own bounds refused our own
   * data. The comment below this table claimed only `parseScriptOutput` and
   * `parseKillTestReply` could reach the default; that stopped being true when
   * the gate gained bounds that throw.
   */
  reference_unusable: "reference_unusable",
  /**
   * THE ASSEMBLED PROMPT WAS OVER `llm.maxInputTokens` (audit P3-R2, R-158).
   *
   * `LlmInputTooLargeError`, raised by `assertInputWithinCeiling` as the first
   * statement of `meteredCall` — before the `try` that writes a spend row — so
   * no vendor call was made and no `model_usage` row exists. Its own code for
   * the `assembly_refused` reason: neither the vendor nor the reply failed.
   */
  input_too_large: "input_too_large",
} as const;

export type GenerationRefusalCode =
  (typeof GENERATION_REFUSAL_CODES)[keyof typeof GENERATION_REFUSAL_CODES];

/**
 * Generate for a creator profile: gate, claim, call, settle.
 *
 * `provider` and `slots` are PARAMETERS rather than module singletons, and that
 * is a test seam with a purpose: every gate below step 7 is proved by handing
 * in a provider whose `complete` THROWS IF CALLED, so the proof that nothing
 * reached the vendor is the stub's own refusal rather than an assertion about a
 * spy. `vi.mock` cannot express that — it has already replaced the module.
 */
export async function generate(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  provider: LlmProvider,
  slots: RunSlots,
  params: GenerateParams,
  at: Date
): Promise<GenerateResult> {
  // 1. THE CAGE FIRST, and it is `mintProfileScope` that runs it — the mint
  //    calls `assertScoped` on the workspace scope and refuses a profile id
  //    that does not belong to it, with a message byte-identical to the one
  //    for a profile that does not exist (no enumeration oracle).
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  // 2. THE ROLE GATE. Generating spends the workspace's credits, which is not
  //    a read. The role is COPIED FROM THE WORKSPACE SCOPE at mint and is
  //    never a parameter, so there is no argument a caller can supply to
  //    raise it.
  if (scope.role === "viewer") throw new InferenceRoleError(scope.role);

  // 3. THE ARCHIVED GATE, READ NOW. A state copied onto the scope at mint
  //    would be a snapshot, and a profile archived while a page sat open would
  //    still generate.
  const [profile] = await scope.accessors.profile();
  if (!profile || profile.state !== "active") throw new ProfileArchivedError();

  // THE MODE IS A REAL MODE FIRST. `modeSpec` throws `UnknownModeError` for a
  // string that is not one of the seven — a pure check, before anything is
  // read: the honest answer to a typo is that the mode does not exist.
  const spec = modeSpec(params.mode);
  // R-148: THE CREATIVE HALF IS PARSED HERE, before the claim lookup, the
  // parent read, the price, the slot and every provider call — so a hostile
  // form or limit costs nothing and leaves no claimed attempt behind, and the
  // intent below is computed over its CANONICAL form. `undefined` is the only
  // spelling of "no creative request"; everything else goes through the parse.
  const requestedCreative = creativeRequestFor(params.mode, params.creative);
  // L2: the piece and no-concept origins combine with nothing they cannot.
  assertOriginShape(params);
  // 4. THE CLIENT INTENT AND THE SAME-ID CLAIM LOOKUP (launch L2, R-151; the
  //    plan's "Same-ID resume order"). The intent is a hash of what the CALLER
  //    asked for — never of the brain, bundle or config current now — and the
  //    lookup is a scoped, READ-ONLY read of the claim this attempt id already
  //    has, if any. A same-id submission is decided HERE, before every gate a
  //    resume must not meet: `settled` replays (no gate, no debit, no call);
  //    `vendor_complete` settles from the stored candidate, where the
  //    lock-held recheck inside `debitCredits` is the ONLY money gate;
  //    `refused` / `recovery_required` is the typed terminal. The pause, plan,
  //    cap and balance gates below run only when NO claim exists. A different
  //    intent under the same id refuses — a pre-L2 claim, which has none,
  //    included — and nothing is rebuilt from newer context.
  const intentSha256 = intentHashOf(params, requestedCreative);
  // The scoped write capabilities: a pure factory over the asserted scope.
  const caps = writeCapabilities(scope);
  const existing = await db.transaction((tx) =>
    caps.readGenerationAttempt(params.attemptId, tx)
  );
  if (existing) {
    if (existing.intentSha256 !== intentSha256) {
      throw new GenerationPayloadMismatchError(params.attemptId);
    }
    return await observeExistingClaim({ db, caps, scope, params, at }, existing);
  }

  // 5. THE PAUSE GATE, HERE RATHER THAN ONLY IN `debitCredits` (R8/REQ-G08).
  //    `creditCosts` is versioned config an operator may set to 0 for a mode,
  //    and `debitCredits` refuses a zero cost outright — so a zero-priced mode
  //    never reaches the debit's own pause gate and a paused workspace would
  //    burn our tokens on precisely the generation that costs the creator
  //    nothing.
  if (await hasOpenPause(db, scope.workspaceId)) {
    throw new WorkspacePausedError();
  }

  // 6. TIER AND MODE, CONFIG AND PRICE — all before the vendor is contacted.
  const billing = await getWorkspaceBillingState(db, scope.workspaceId, at);
  // R18. The plan gate, then the built gate: a Free creator asking for
  // `ideaToScript` is told their plan does not include it; a creator on any
  // tier asking for a mode slice 7 has not shipped is told we have not built
  // it — opposite statements about whose fault it is.
  assertModeAllowed(billing.tier, params.mode);
  // L2: THE PIECE, read through the profile's own scope, before the price, the
  // slot and the claim — a foreign, stale or cancelled piece costs nothing.
  const piece =
    params.pieceId === undefined ? null : await resolvePiece(db, caps, params);
  // Resolve the opaque id after caller/profile gates and before price, slot,
  // claim, or vendor. The reader owns rights, completed-status, transcript
  // availability, and bounded-reference validation; caller text is never a
  // similarity reference.
  const spinReference = spec.similarityGated
    ? await spinReferenceForProfile(
        db,
        scope,
        requireSpinAutopsyId(params.spinAutopsyId),
      )
    : null;
  // 5b. THE REVISION'S PARENT (R6/R8), RESOLVED BEFORE THE PRICE AND BEFORE
  //     THE VENDOR. Three things come out of this one read and they cannot
  //     disagree with each other: whether this is a revision at all, which
  //     generation `parent_id` will name, and the draft the revision is built
  //     from. `settleGeneration` re-reads the parent through the profile's own
  //     predicate inside the settlement transaction and is still the
  //     AUTHORITY; this is the same question asked where the answer is free.
  const revisionOfAttemptId = params.revisionOfAttemptId;
  const parent =
    revisionOfAttemptId === undefined
      ? null
      : await resolveRevisionParent(db, caps, params.mode, revisionOfAttemptId);
  // R-148: THE CREATIVE HALF THIS GENERATION RUNS UNDER, decided once, from
  // the parse above and the parent's STORED contract — never from the browser's
  // idea of which contract the parent has. Still before the price, the slot and
  // the claim, so a refused override costs nothing.
  const creative =
    piece === null
      ? effectiveCreative(requestedCreative, parent)
      : pieceCreative(requestedCreative, piece);
  // R8: a revision is priced as `creditCosts.revision`, NEVER at the parent
  // mode's price — and the boolean that decides it is `parent !== null`, which
  // is the resolved read above rather than a caller's flag. There is no input
  // to this call that prices a revision as an original.
  const op: PricedOperation = generationOp(params.mode, parent !== null);
  // Read once WITHOUT the model-specific paths to learn which models are
  // configured, then again requiring their price rows — two reads because the
  // paths being asserted DEPEND on the values being read.
  //
  // TWO MODELS, NOT ONE (billing gate, 2026-09-01). A generation makes up to
  // three vendor calls at TWO tiers: the draft and its one rewrite on
  // `llm.models.generation`, and the creator's-own-rules scoring on
  // `llm.models.classification` — card R5's "cheap model call". Both were
  // running on the generation model, so `llm.models.classification` (seeded
  // Haiku-class since M1) had zero production readers and every successful hook
  // set cost two Sonnet calls instead of Sonnet plus Haiku. That is a REQ-G05
  // margin number, which is the one number R-6 tunes pricing against.
  const probe = await getActiveConfigRequiringStored(db, [
    "llm.models.generation",
    "llm.models.classification",
  ]);
  const model = probe.content.llm.models.generation;
  const scoringModel = probe.content.llm.models.classification;
  const { version: preConfigVersion, content } =
    await getActiveConfigRequiringStored(
      db,
      requiredConfigPaths({ generation: model, classification: scoringModel }, op)
    );
  // FAIL CLOSED ON THE PRICE BEFORE SPENDING. Looked up here as well as after
  // the call: refusing a misconfigured model BEFORE we pay for it costs the
  // creator nothing, whereas the post-call lookup can only record
  // `cost_state: 'unknown'` against money already gone. BOTH models, because
  // both are called and an uncosted call understates spend and therefore
  // OVERSTATES margin.
  priceFor(content.llm.prices, model);
  priceFor(content.llm.prices, scoringModel);
  // L2 (R-151): A CONFIRMED COMMISSION IS CHARGED THE PRICE IT WAS SHOWN. The
  // piece holds the config version its confirmation was quoted under; when the
  // active document prices this operation differently the commission is
  // refused here — before the cap, the balance, the slot and the claim — and
  // "New generation" re-quotes it. The claim's snapshot then pins the version
  // the settlement prices by, so a version appended mid-flight cannot move it.
  if (piece !== null) {
    const quoted = (
      await configVersionContents(db, [piece.quoteConfigVersion])
    ).get(piece.quoteConfigVersion) as RespinConfigV1;
    const quotedPrice = priceOf(quoted, op);
    const currentPrice = priceOf(content, op);
    if (quotedPrice !== currentPrice) {
      throw new GenerationQuoteChangedError(quotedPrice, currentPrice);
    }
  }

  // 6b. THE UNCHARGED-ATTEMPT CAP, THEN THE BALANCE — both before the vendor.
  //
  // R16. A generation that is billable to us and free to the creator (a
  // truncated reply, or one we could not parse — the slice card's question-4
  // table) skips the balance check entirely, and both causes are deterministic
  // for a given input, so without this the press repeats forever at our
  // expense. The bound's WIDTH is the same as `runInference`'s and for the
  // same reason: this count runs outside any lock, so N presses in flight
  // together can each read `cap - 1`. That is the accepted width — once the
  // burst's `model_usage` rows commit, every later press is refused.
  const unchargedCap = unchargedAttemptCap(content, GENERATION_PURPOSE);
  const uncharged = await scope.accessors.countUnchargedBillableAttempts({
    purpose: GENERATION_PURPOSE,
    // WINDOWED, and that is the second half of the bound rather than a
    // refinement of it (billing gate, 2026-09-01). `model_usage` is
    // append-only, so an unwindowed count is a LIFETIME count: ten
    // deterministic failures EVER would refuse this profile's generations
    // permanently, remediable only by an operator raising a global key, with
    // nothing anywhere listing which profiles are stuck. What this bounds — a
    // truncation or an unparseable reply — repeats on the next press, so the
    // window is a sitting, not a lifetime.
    since: unchargedAttemptWindowStart(content, GENERATION_PURPOSE, at),
  });
  if (uncharged >= unchargedCap) {
    // THE WIDENED CHANNEL GETS A COUNTER (billing gate round 2, 2026-09-01).
    // Windowing this cap was the right trade, but it turned a bounded-forever
    // exposure into an unbounded-rate one on a tier that requires no card, and
    // nothing counted or surfaced it — the first abuse would have been learned
    // about from an invoice. See `metrics.ts` for what one sample may and may
    // not claim. It is emitted BEFORE the throw and cannot throw itself, so it
    // can never replace this refusal with a telemetry stack trace.
    emitUnchargedAttemptCapMetric({
      workspaceId: scope.workspaceId,
      profileId: scope.profileId,
      purpose: GENERATION_PURPOSE,
      attempts: uncharged,
      cap: unchargedCap,
      windowMinutes: content.generation.unchargedAttemptWindowMinutes,
          bound: "attempts",
    });
    throw new GenerationUnchargedAttemptCapError(
      uncharged,
      unchargedCap,
      // THE SAME NUMBER THE COUNT WAS TAKEN OVER, from the same already-read
      // document — never a second config read, which could disagree with the
      // window the refusal is actually about.
      content.generation.unchargedAttemptWindowMinutes
    );
  }
  // ...AND THE SAME BOUND IN MONEY (billing gate, 2026-09-04).
  //
  // The cap above counts ATTEMPTS while what it protects is SPEND, and the
  // 2026-09-04 ceiling change is the proof: `llm.maxOutputTokens` tripled, the
  // worst case per uncharged attempt went 0.14 -> 0.42 USD, and nothing
  // noticed, because no control here was denominated in money. Ten an hour on
  // a tier that requires no card is a floor of 100.80 USD per profile per day.
  //
  // SECOND, NOT INSTEAD. It is a different question over the same rows, and
  // either may bind first: frequency is what the count catches, cost per call
  // is what this catches. A row whose cost we could not compute contributes
  // zero here, so the count remains the bound on those.
  //
  // The window is the SAME already-read one, for the reason above.
  const unchargedCostCap = content.generation.maxUnchargedBillableCostMicroUsd;
  const unchargedCost = await scope.accessors.sumUnchargedBillableCostMicroUsd({
    purpose: GENERATION_PURPOSE,
    since: unchargedAttemptWindowStart(content, GENERATION_PURPOSE, at),
  });
  if (unchargedCost >= unchargedCostCap) {
    emitUnchargedAttemptCapMetric({
      workspaceId: scope.workspaceId,
      profileId: scope.profileId,
      purpose: GENERATION_PURPOSE,
      attempts: uncharged,
      cap: unchargedCap,
      windowMinutes: content.generation.unchargedAttemptWindowMinutes,
      // THE DISCRIMINATOR, and it is why this branch is not a copy of the one
      // above: without it the line reads `attempts=2 cap=10` on a refusal the
      // attempt check had just PASSED (billing + code review, round 2).
      bound: "cost",
      costMicroUsd: unchargedCost,
      capMicroUsd: unchargedCostCap,
    });
    throw new GenerationUnchargedCostCapError(
      unchargedCost,
      unchargedCostCap,
      content.generation.unchargedAttemptWindowMinutes
    );
  }
  // ...AND THE TOTAL, SUCCESSES INCLUDED (audit P3-R3, R-158). Both bounds
  // above count only rows the creator was NOT charged for, so a caller whose
  // every call succeeds was unbounded in money. This compares ALL of this
  // profile's billable generation spend in the same window against its own
  // key, `generation.maxBillableCostMicroUsdPerWindow` — sized as a runaway
  // bound (about 86 worst-case attempts), so no tier's legitimate use reaches
  // it. The uncharged key keeps its own meaning and keeps binding on abuse.
  const windowCostCap = content.generation.maxBillableCostMicroUsdPerWindow;
  const windowCost = await scope.accessors.sumBillableCostMicroUsd({
    purpose: GENERATION_PURPOSE,
    since: unchargedAttemptWindowStart(content, GENERATION_PURPOSE, at),
  });
  if (windowCost >= windowCostCap) {
    emitUnchargedAttemptCapMetric({
      workspaceId: scope.workspaceId,
      profileId: scope.profileId,
      purpose: GENERATION_PURPOSE,
      attempts: uncharged,
      cap: unchargedCap,
      windowMinutes: content.generation.unchargedAttemptWindowMinutes,
      bound: "window_cost",
      costMicroUsd: windowCost,
      capMicroUsd: windowCostCap,
    });
    throw new GenerationWindowCostCapError(
      windowCost,
      windowCostCap,
      content.generation.unchargedAttemptWindowMinutes
    );
  }

  // R15 / REQ-G03. A zero balance is refused BEFORE the vendor call, with the
  // top-up prompt.
  //
  // ONLY A NEW OPERATION REACHES THIS LINE (launch L2). The two residuals this
  // paragraph used to record — a re-submission of a SETTLED attempt told it was
  // out of credits, and a `vendor_complete` retry refused here instead of
  // settling — are closed by the read-only claim lookup at step 4, which
  // decides every same-id submission before any gate. The lookup writes
  // nothing, so a balance refusal here still leaves no `claimed` row behind.
  const preCallCost = priceOf(content, op);
  if (preCallCost > 0) {
    const view = await deriveBalance(db, scope.workspaceId);
    if (view.balance < preCallCost) {
      const shortfall = preCallCost - view.balance;
      // maybeAutoTopup converts every post-dispatch uncertainty into a durable
      // reconciliation result carrying its attempt id. Pre-dispatch rollout,
      // config, integrity, and clock refusals must keep their real type: calling
      // them "in flight" would ask an operator to reconcile no provider call.
      const outcome = await maybeAutoTopup(
        db,
        scope.workspaceId,
        shortfall,
        at
      );
      if (
        outcome?.triggered === false &&
        outcome.reason === "reconciliation_required"
      ) {
        throw new AutoTopupReconciliationRequiredError(
          outcome.attemptId,
          view.balance,
          preCallCost
        );
      }
      // REFUSED REGARDLESS. A triggered top-up does not license proceeding.
      throw outcome?.triggered
        ? new TopupInFlightError(view.balance, preCallCost)
        : new InsufficientCreditsError(view.balance, preCallCost);
    }
  }

  // 6b. THE RUN SLOT, taken now and held across every vendor call
  //     (tech-spec §6). AFTER the refusals above and BEFORE the claim — see
  //     the order note at the top of this file for why the claim is not first.
  const concurrencyLimit = content.concurrencyLimits[billing.tier];
  const slot = await slots.acquire(scope.workspaceId, concurrencyLimit);
  if (!slot.granted) {
    throw new RunSlotBusyError(slot.reason, concurrencyLimit, billing.tier);
  }

  try {
    // 6c. THE BRAIN AND THE ASSEMBLY. Reads and pure functions only.
    const [activation] = await scope.accessors.latestBrainActivation();
    // R9a: `generations.brain_activation_id` is NOT NULL because the snapshot
    // is what makes "a later brain edit cannot change the historical
    // explanation" true. No snapshot means no coherent brain, which is a
    // refusal rather than a generation with a null provenance.
    if (!activation) throw new BrainNotActivatedError();
    // THE DOCUMENTS THE SNAPSHOT NAMES, NOT "the documents that are active"
    // (tenancy gate, 2026-09-01). These used to be two independent statements
    // against two independent authorities — `latestBrainActivation()` and
    // `activeBrainDocs()` — run outside any transaction and outside the
    // per-profile brain lock. A coherent activation committing between them
    // stored `brain_activation_id = N` on a generation whose prompt was built
    // from N+1's documents: the explanation wrong from birth, which is the one
    // thing R9a exists to prevent, reachable with two tabs or two members.
    //
    // READING THE SNAPSHOT'S OWN IDS MAKES THE AGREEMENT DEFINITIONAL rather
    // than timed — there is no window left to lose, and no lock to take on a
    // path that would otherwise contend with every brain write. It is also the
    // reading that stays right for a RETRY: `observeExistingClaim` settles from
    // a stored candidate whose snapshot may be several activations old, and
    // "whatever is active now" would have described a different brain.
    //
    // A document the snapshot names that this profile does not own simply does
    // not come back (`brainDocsByIds` is scope-predicated and those columns
    // carry no FK), so the failure direction is a thinner brain and, below, an
    // assembly refusal — never another profile's voice.
    const activeDocs = await scope.accessors.brainDocsByIds(
      snapshotDocIds(activation)
    );
    // THE FRAMEWORK LIBRARY (slice 7, R1/R5a-R5c), through the ONE caged
    // accessor. `eligibleFrameworks()` is a single query over the approved,
    // non-retired, non-superseded rows that are EITHER shared (both owner
    // columns NULL by CHECK) OR this profile's own private ones — so a
    // cross-profile private framework cannot enter an assembly, and the
    // predicate that decides "recommendable" is the same expression for both
    // halves. Slice 6 passed `[]` here under R-29; the library exists now, and
    // `framework_eligibility` in `@respin/modes` stops being vacuous with it.
    //
    // ONLY FOR MODES THAT CAN NAME ONE, and the population is the registry's
    // own: `checks.includes("framework_eligibility")` is exactly the set of
    // modes whose output carries a framework (a caption does not), so the
    // caption mode neither pays the context for nine frameworks nor gets an
    // instruction it cannot follow. Deriving it from the SPEC rather than from
    // a second list here is CLAUDE.md's 2026-08-29 lesson: a population written
    // out twice narrows silently the day one copy is edited.
    //
    // AND IT IS BOUNDED (R17), which is not a defensive extra — it is what the
    // card's "measure the context growth rather than asserting it is fine"
    // turned up. `eligibleFrameworks()` is unbounded by construction:
    // `PRIVATE_FRAMEWORK_COUNT_MAX` is 50 live private frameworks per profile
    // and `FRAMEWORK_TEXT_MAX`/`FRAMEWORK_LIST_MAX` allow 24 beats of 4,000
    // characters each, so ONE row can be ~100k characters and fifty of them
    // ~5MB — on every generation, in the same call §7 gives 45 seconds and
    // REQ-G05 measures margin on. See `frameworksForContext`.
    //
    // AND A DROPPED ROW IS RECORDED (billing gate, 2026-09-01). The budget is
    // config now, and what it drops is a metric rather than a silence: a
    // creator whose own frameworks fill the prompt stops being offered the
    // curated library, pays the same price for that generation, and — before
    // this line — nothing anywhere said so. `emitUnchargedAttemptCapMetric`
    // twenty lines up exists for the same reason and says it plainly: the
    // first abuse of an unmeasured channel is learned about from an invoice.
    const eligibleFrameworks = spec.checks.includes("framework_eligibility")
      ? await scope.accessors.eligibleFrameworks()
      : [];
    const charBudget = content.generation.frameworkContextCharBudget;
    const offer = frameworksForContext(eligibleFrameworks, charBudget);
    // COUNTS ONLY, AND COMPUTED ONCE. The metric below and `GenerateResult`
    // read the SAME four numbers, so an operator's dashboard and the creator's
    // screen can never disagree about how many rows the budget dropped.
    const offerSummary: FrameworkOfferSummary = {
      eligible: eligibleFrameworks.length,
      offered: offer.kept.length,
      droppedShared: offer.dropped.filter((r) => r.visibility === "shared").length,
      droppedPrivate: offer.dropped.filter((r) => r.visibility !== "shared").length,
    };
    if (offer.dropped.length > 0) {
      // BEFORE the prompt is built and outside any transaction; it cannot
      // throw (see `emitFrameworkOfferDroppedMetric`), so it can never turn a
      // working generation into an error.
      emitFrameworkOfferDroppedMetric({
        workspaceId: scope.workspaceId,
        profileId: scope.profileId,
        mode: params.mode,
        ...offerSummary,
        charBudget,
      });
    }
    const offeredFrameworks = offer.kept;
    const brain = {
      voice: brainSentences(activeDocs, "voice"),
      strategy: brainSentences(activeDocs, "strategy"),
      killtest: brainSentences(activeDocs, "killtest"),
    };
    // L2: "FIND MY NEXT CONCEPT" WITH NOTHING SAFE TO START FROM is one short
    // question, not concepts built on an invented biography — decided from the
    // activated documents alone, with no model call (`conceptContextSufficient`).
    if (
      params.findConcept === true &&
      !conceptContextSufficient(
        activeDocs.find((d) => d.kind === "strategy")?.content ?? null,
        params.input
      )
    ) {
      throw new ConceptContextInsufficientError();
    }
    // WHAT THE MODEL IS GIVEN AS MATERIAL, and which of it is the CREATOR'S OWN
    // words (`creatorNote`, the only text a basis may quote). Four shapes:
    //   revision        — the note, then the parent draft (product text);
    //   piece/concept   — the note, then the stored concept (model text);
    //   piece/own idea  — the creator's stored idea and note: all theirs;
    //   find concept    — product scaffold plus the creator's optional hint.
    const material = materialFor(params, parent, piece);
    // LAUNCH L3 (R-152): THE BOUNDED, LABELLED RECENT WORK — for the concept
    // and script modes only, read through the one scoped accessor (both scope
    // columns on every table it touches, at most five drafts and three
    // reaction notes, the plan's deterministic relevance order) and cut to the
    // configured character budget. The rows this operation already carries as
    // MATERIAL — a revision's parent, a piece's source batch — are excluded
    // and recorded as such. Read now, on the NEW-operation path only: a
    // same-id submission was decided at step 4 and never rebuilds a prompt.
    const recent = takesCreativeForm(params.mode)
      ? buildRecentContext({
          candidates: await scope.accessors.recentContextCandidates({
            modes: CREATIVE_FORM_MODES,
            platform: params.platform,
            currentPieceId: piece?.pieceId ?? parent?.pieceId ?? null,
            excludeGenerationIds: materialIdsOf(parent, piece),
          }),
          charBudget: content.generation.recentContextCharBudget,
          sequel: params.sequel === true,
          materialIds: materialIdsOf(parent, piece),
          reportedSpecificsOf,
        })
      : null;
    const context: GenerationContext = {
      universalLaws: UNIVERSAL_LAWS,
      frameworks: offeredFrameworks.map(promptFramework),
      brain,
      // A REVISION'S MATERIAL IS ITS NOTE *AND* THE DRAFT IT REVISES, and
      // both have to be in `input` because that is the only channel
      // `GenerationContext` has for creator material — which has a consequence
      // stated rather than hidden: `traceabilityCorpusFor` builds the REQ-I03
      // corpus from `brain` plus `input`, so the parent draft is traceable
      // material for the revision.
      //
      // WHAT THAT COST, AND WHAT THE CORRECTED SENTENCE IS (spin-compliance
      // gate, 2026-09-01). The sentence here used to read "the parent passed
      // the same gate before it was stored ... a specific that survived the
      // parent's scan as a FLAG is one the revision's scan will accept
      // outright". BOTH HALVES WERE TOO NARROW, and each was measured:
      //
      //   `[check]`. The model is INSTRUCTED to mark an unsupported specific
      //   (`GENERATION_SYSTEM`), and a marked specific produces NO finding at
      //   all — it is not a flag, it is the model's own statement that the
      //   material does not carry it. `The $4,000 [check] rig...` in a parent
      //   put `4000` in the revision's corpus, so the revision emitted
      //   `$4,000` with no marker, `hardRules: []`, and the creator read it
      //   under "Every number, date and name in this draft was found in your
      //   brain or in what you typed in." That is REQ-I05, and it is now
      //   closed in `stripMarkedSpecifics` — in the INDEX, so every channel
      //   that carries gated output into a corpus is covered, not just this
      //   one.
      //
      //   FLAG-ONLY BY FIELD, not only by shape. R-68 demoted the whole
      //   `/disclosure/` section, so a `$4,000` written there is reported as a
      //   flag whatever its shape and was never traced to anything — and it
      //   vouched for a `$4,000` in the revision's HOOK. Measured on this
      //   build.
      //
      // So the parent's draft now vouches for exactly what its own scan
      // neither REPORTED nor EXCUSED WITH A MARKER — two different exclusions,
      // because a `[check]`ed specific produces no finding and would sail
      // through a findings-only rule. `stripMarkedSpecifics` removes the
      // marked ones inside the index; `unvouchedSpecifics` below removes the
      // reported ones, filtered against the creator's own material so nothing
      // they typed is removed.
      // WHAT REMAINS, and it is the intended widening rather than a hole: a
      // specific the parent's scan CLEARED — because the parent's own input or
      // brain carried it — still vouches for this revision even when this
      // note does not repeat it. `revision.test.ts`'s last describe block pins
      // every one of these as a MEASURED fact.
      input: material.input,
      platform: params.platform,
      // THE PARENT'S — OR THE SOURCE CONCEPT'S — REPORTED SPECIFICS, filtered
      // against the creator's own material (L2: a stored concept vouches for
      // exactly what a revision's parent does, by the same rule).
      unvouchedSpecifics:
        material.reportedSpecifics.length === 0
          ? []
          : unvouchedSpecifics(
              // THE CREATOR'S OWN MATERIAL, WITHOUT THE PARENT DRAFT OR THE
              // CONCEPT — which is the whole point: asking "does the creator
              // carry this" of a corpus that includes them would answer yes
              // every time.
              { brain: [...brain.voice, ...brain.strategy, ...brain.killtest],
                input: [material.creatorNote, params.platform] },
              material.reportedSpecifics
            ),
      // THE REFERENCE'S MECHANISM, FOR THE GATED MODE ONLY (slice 8c R11,
      // R-97; REQ-E04/I03). The four fields the trends screen already shows
      // — hook mechanic, beats, ending, follow trigger — reach the prompt as
      // another creator's mechanism to adapt. The GATE's fields (`hook`,
      // `subjectTerms`, `structure`) stay on `spinSimilarity` below and
      // never enter the context: `assertReferenceMechanism` refuses any
      // extra field by name, so spreading `spinReference` here would be a
      // refusal before the vendor, not a leak. NOT in the traceability
      // corpus — `traceabilityCorpusFor` reads `brain` and `input` only, so
      // a specific that appears only in the mechanism is refused as untraced.
      ...(spec.similarityGated && spinReference !== null
        ? {
            reference: {
              mechanism: {
                hookMechanic: spinReference.mechanism.hookMechanic,
                beats: spinReference.mechanism.beats,
                ending: spinReference.mechanism.ending,
                followTrigger: spinReference.mechanism.followTrigger,
              },
            },
          }
        : {}),
      // R-148: THE CREATIVE HALF, or `null` — stated on both branches. The
      // four server-derived fields are what only this layer can know: the
      // creator's OWN note (`params.input`, never the composed revision input
      // with its scaffold and parent draft — round-1 tenancy gate), so a basis
      // can only ever quote the creator; the excerpts the parent's own gate
      // already verified; the parent's own `[check]`ed passages, so a revision
      // cannot restate one unmarked (round-1 compliance BLOCK); and EVERY
      // eligible framework name — including the ones the budget dropped — so a
      // `custom` structure cannot borrow an approved name the prompt happened
      // to omit. That list is never rendered into a prompt, and a finding
      // against it names only the model's own custom name.
      creative:
        creative === null
          ? null
          : {
              formChoice: creative.formChoice,
              constraints: creative.constraints,
              creatorNote: material.creatorNote,
              carriedBasis: material.carriedBasis,
              carriedUnconfirmed: material.carriedUnconfirmed,
              approvedFrameworkNames: eligibleFrameworks.map((f) => f.name),
            },
      // LAUNCH L3: HISTORY, in its own labelled block and in NEITHER corpus —
      // it can steer, never vouch. `null` for every mode that reads none.
      recentWork: recent?.context ?? null,
    };
    // THE CREATOR'S OWN CRITERIA, and only those, go to the scoring model (R5).
    // The four hard rules are deterministic code inside `@respin/modes` and are
    // never asked about here.
    const creatorRules = creatorRulesOf(activeDocs);
    // THE CONTRACT THE PIPELINE WILL HOLD THE REPLY TO, derived by the same
    // `contractOf` the pipeline uses — so the bundle version stored on the
    // request, the one the pipeline stamps on the kill test, and the metering
    // parse below cannot name three different contracts (R-148, REQ-J02).
    const contract = contractOf(context);
    // THE LAWS THIS CONTEXT CARRIES are part of the digest (P8-A4), the same
    // argument `pipeline.ts` passes, so the stored version and the one stamped
    // on the kill test cannot name two different sets of laws.
    const bundleVersion = promptBundleVersion(
      params.mode,
      contract.version,
      context.universalLaws
    );
    // WHAT THIS FILE DOES NOT DO, SAID PLAINLY (billing gate, 2026-09-02).
    // This paragraph used to claim `assembleGenerationPrompt` was called here
    // as well as inside the pipeline, "so the payload hash is taken over a
    // request we already know is assemblable". IT IS NOT CALLED HERE — this
    // module neither imports nor invokes it (`GenerationAssemblyError` is
    // imported for `refusalCodeFor`, and that is the only mention). The
    // assembly refusal lands inside `runGeneration`, AFTER the claim and after
    // `advanceGenerationAttempt(to: "vendor_started")`. What follows from that,
    // measured: no vendor call and no debit — so "it costs nothing" holds in
    // the money sense — but a `generation_attempts` row IS written and settled
    // as `refused`, which is why that refusal now has its own code
    // (`assembly_refused`) instead of being recorded as `parse_failed`.
    const request: GenerationRequest = {
      mode: params.mode,
      platform: params.platform,
      // THE CREATOR'S OWN WORDS, which for a revision is the NOTE and not the
      // composed block above: `generations.request` is the record of what the
      // creator asked for, and the parent's draft is named by
      // `parentGenerationId` beside it rather than copied into it. The hash
      // below is still total over the request, because the composed block is a
      // function of these fields and the origin. L2: a piece or no-concept
      // request with no note of the creator's records a fixed marker instead
      // (`requestInputOf`), never a copy of the stored concept.
      input: requestInputOf(params, piece),
      brainActivationId: activation.id,
      promptBundleVersion: bundleVersion,
      // SERVER-DERIVED (R6), from the scoped read above — never the caller's
      // value. `null` means original; it is in the hash because a revision of
      // X and an original with the same note are different requests, and
      // colliding them would serve one creator the other's stored answer.
      parentGenerationId: parent?.id ?? null,
      spinAutopsyId: spinReference?.autopsyId ?? null,
      spinAnalysisVersion: spinReference?.analysisVersion ?? null,
      // R-148: THE CREATIVE HALF THIS GENERATION RAN UNDER — the creator's
      // explicit choice, or for a revision the parent's inherited one — in its
      // CANONICAL parsed form. Part of identity: a changed form choice or limit
      // under the same attempt id is a different request and refuses.
      creative,
      // L2 (R-151): WHERE THIS REQUEST CAME FROM — a creative piece (its id
      // and its stored source) or the no-concept entrance — recorded SEPARATELY
      // from `parentGenerationId`, which stays same-mode revision lineage. A
      // piece's script is an original of its mode, priced as one.
      origin: originOf(params, piece),
    };
    const payloadSha256 = hashRequest(request);
    // THE DURABLE VERSIONED SNAPSHOT (launch L2, R-151), bound to the claim in
    // the same INSERT, before any outbound call: identities, versions and the
    // hashes of the creator's words. Its `configVersion` is the version the
    // settlement prices by — the one whose price this attempt was gated on.
    const requestSnapshot = requestSnapshotOf({
      request,
      intentSha256,
      payloadSha256,
      configVersion: preConfigVersion,
      offered: offeredFrameworks,
      sequel: params.sequel === true,
      recentContext: recent?.snapshot ?? null,
    });

    // 6d. THE DURABLE CLAIM, COMMITTED BEFORE ANY OUTBOUND HTTP (R14).
    const claim = await db.transaction((tx) =>
      caps.claimGenerationAttempt(
        {
          attemptId: params.attemptId,
          purpose: GENERATION_PURPOSE,
          mode: params.mode,
          payloadSha256,
          intentSha256,
          requestSnapshot,
        },
        tx
      )
    );
    // SAME ATTEMPT ID + DIFFERENT INTENT REFUSES (R14). Reached only by a
    // submission that raced past the lookup at step 4 — two first presses of
    // one id. Compared on the INTENT, the value that does not move with the
    // brain or the bundle, and checked before the state switch below, because
    // serving the stored answer to a DIFFERENT request would be worse than
    // refusing: the creator would read an output they did not ask for.
    if (claim.attempt.intentSha256 !== intentSha256) {
      throw new GenerationPayloadMismatchError(params.attemptId);
    }
    if (!claim.created) {
      return await observeExistingClaim(
        { db, caps, scope, params, at },
        claim.attempt
      );
    }

    // 7. THE VENDOR SEQUENCE. Only the claim's winner reaches this line.
    await db.transaction((tx) =>
      caps.advanceGenerationAttempt(
        { attemptId: params.attemptId, to: "vendor_started" },
        tx
      )
    );

    // ONE DEADLINE FOR THE WHOLE OPERATION (audit P3-A3) — the draft, the one
    // rewrite and the scoring call share it, the `inference.ts` shape. Each
    // `meteredCall` used to mint its own `AbortSignal.timeout`, so a run of
    // three calls could take three `overallDeadlineMs` inside one server
    // action, and the recovery sweep's `overallDeadlineMs + 5 min` bound on a
    // `vendor_started` attempt did not describe it.
    const deadline = AbortSignal.timeout(content.llm.overallDeadlineMs);
    let run: GenerationRun;
    try {
      run = await runGeneration({
        mode: params.mode,
        context,
        creatorRules,
        spinSimilarity: spec.similarityGated
          ? {
              reference: {
                subjectTerms: spinReference!.subjectTerms,
                hook: spinReference!.hook,
                structure: spinReference!.structure,
              },
              // This is the same stored document that priced this attempt;
              // the pure pipeline does no second config read.
              configuredStrictness: content.similarity.strictness,
            }
          : undefined,
        generate: (prompt) =>
          meteredCall({
            db,
            scope,
            provider,
            prompt,
            params,
            model,
            content,
            configVersion: preConfigVersion,
            billingTier: billing.tier,
            bundleVersion,
            deadline,
            // WHETHER THE REPLY PARSED decides the row's OUTCOME at the call: a
            // reply we could not parse is the slice card's `schema_invalid`
            // row, billable. It no longer decides `consumed_included_build` —
            // every generation row is written `false` and `settleGeneration`
            // flips this operation's rows in the debit's transaction (R-151
            // item 5), so that column is the one `model_usage` field updated
            // after insert. The parse runs twice (here and inside the
            // pipeline) and that is deliberate: it is the SAME pure function,
            // so the two cannot disagree.
            parses: (text) => {
              try {
                // UNDER THE SAME CONTRACT the pipeline parses with (R-148):
                // the v1 parse refuses a v2 reply, so without it every usable
                // v2 draft would be metered `schema_invalid` and counted
                // against R16's uncharged bound.
                parseScriptOutput({ text, mode: params.mode, contract });
                return true;
              } catch {
                return false;
              }
            },
          }),
        // THE CHEAP MODEL (card R5). The creator's own kill-test criteria are a
        // scoring question, not a writing one, and running it on the generation
        // model doubled the cost of every successful hook set.
        scoreCreatorRules: (prompt) =>
          meteredCall({
            db,
            scope,
            provider,
            prompt,
            params,
            model: scoringModel,
            content,
            configVersion: preConfigVersion,
            billingTier: billing.tier,
            bundleVersion,
            deadline,
            parses: (text) => {
              try {
                parseKillTestReply({ text, rules: creatorRules });
                return true;
              } catch {
                return false;
              }
            },
          }),
      });
    } catch (e) {
      // A PAID CALL WITH NO SPEND ROW IS NOT A REFUSAL (audit P3-R5).
      // `meteredCall` raises `GenerationRecoveryRequiredError` when a call's
      // spend write failed twice (it is the only producer inside
      // `runGeneration`): the reply may well have parsed, and what failed is
      // our bookkeeping. It is the state `recovery_required` exists for —
      // operator-visible, no customer debit, never retried against the vendor
      // — and `meteredCall` has already emitted the token counts and cost.
      if (e instanceof GenerationRecoveryRequiredError) {
        await recordRecoveryRequired(db, caps, params.attemptId);
        throw e;
      }
      // THE ATTEMPT RECORDS THE REFUSAL AND NOTHING ELSE (R14b). No generation
      // is written, so no output is exposed — and every `model_usage` row this
      // sequence committed survives, because each was its own transaction.
      await recordRefusal(db, caps, params.attemptId, refusalCodeFor(e));
      throw e;
    }

    // 7b. THE DURABLE RESPONSE CHECKPOINT (R14c) — the state stamp AND the
    //     validated candidate, in ONE transaction, so the two can never
    //     disagree about whether there is something to settle.
    //
    // IT IS INSIDE THE SAME RECOVERY HANDLING AS THE SETTLEMENT, deliberately:
    // this write happens AFTER the vendor has been paid, so a database failure
    // here leaves exactly the state `recovery_required` exists for — spend
    // recorded, nothing settled, and no way to know what should have been
    // stored, because the one copy of it was in this process's memory. Left
    // outside, it would have propagated a raw driver error and stranded the
    // attempt at `vendor_started`, invisible to an operator.
    //
    // THE OTHER SIDE OF THE SAME LINE: once this transaction COMMITS, a crash
    // does not lose the output. The attempt sits at `vendor_complete` holding
    // the whole settlement input, for 24 hours from `vendor_completed_at`.
    // Inside that window it is settled without another vendor call by a
    // resubmission of the SAME attempt id (only `commissionPiece` reuses one —
    // every other surface mints a fresh id per press), by the creator's
    // "Finish this draft" on /studio, or by the operator's
    // `scripts/settle-candidate.ts`. Nothing settles it automatically: the
    // worker pages (`generation_unsettled_aging`) before its 24-hour clear
    // destroys it (R-157).
    let checkpointed: GenerationAttempt;
    try {
      checkpointed = await db.transaction((tx) =>
        caps.advanceGenerationAttempt(
          {
            attemptId: params.attemptId,
            to: "vendor_complete",
            candidate: candidateEnvelope(
              candidateOf(run, model, request, offeredFrameworks)
            ),
          },
          tx
        )
      );
    } catch (e) {
      await recordRecoveryRequired(db, caps, params.attemptId);
      throw new GenerationRecoveryRequiredError(params.attemptId, e);
    }

    // 8. THE SETTLEMENT (R14b) — ONE workspace-locked transaction, settling
    //    FROM THE ROW THE DATABASE RETURNED rather than from `run` in memory.
    //
    // That is not ceremony. The retry path can only settle from the stored
    // bytes, so if the fresh path settled from memory the two paths would be
    // two implementations of "what does this generation say" — and the one
    // that runs a hundred times a day would never exercise the reader the
    // recovery path depends on. Settling both ways through `readCandidate`
    // makes the round trip part of the happy path.
    const settled = await settle({
      db,
      caps,
      scope,
      params,
      at,
      candidate: readCandidate(params.mode, checkpointed),
      run,
    });
    // THE ONE PATH THAT REALLY BUILT AN OFFER. Overridden here rather than
    // threaded through `SettlementCtx`, because settlement neither reads nor
    // decides anything about the offer — passing it in would put a display
    // fact inside the money transaction's parameter object.
    return { ...settled, frameworkOffer: offerSummary };
  } finally {
    // UNCONDITIONAL, and the only release site. `release()` is idempotent and
    // never throws — a leaked slot would shrink the workspace's concurrency
    // every time something went wrong, until the tier could not generate at
    // all: the control quietly becoming the outage.
    await slot.lease.release();
  }
}

// ------------------------------------------------------------------ helpers

type Caps = ReturnType<typeof writeCapabilities>;

function requireSpinAutopsyId(autopsyId: string | undefined): string {
  if (!autopsyId || !/\S/.test(autopsyId)) {
    throw new GenerationAssemblyError(
      "analyse-and-spin requires an autopsy selected by its opaque identifier",
    );
  }
  return autopsyId;
}

/**
 * Everything the settlement needs that is NOT the vendor's answer.
 *
 * ONE OBJECT rather than six parameters because both the fresh path and the
 * retry path build it, and a positional list two call sites fill in is a list
 * two call sites can fill in differently.
 */
type SettlementCtx = {
  db: DbLike;
  caps: Caps;
  scope: ProfileScope;
  params: GenerateParams;
  at: Date;
};

// THE PRICED OPERATION IS DELIBERATELY NOT ON THIS STRUCT ANY MORE (slice 7,
// R8). It used to be built once from `params` and carried into the settlement,
// which was correct while every generation was priced by its mode and became a
// hole the moment a revision was priced differently: a RETRY that re-submitted
// the same attempt id WITHOUT `revisionOfAttemptId` would have carried the
// mode's price into a settlement whose stored candidate was a revision. The
// settlement now derives the key from the CANDIDATE — the same bytes it takes
// every other field from — so params and the stored answer cannot disagree
// about what this generation costs.

/**
 * What a duplicate or repeated submission gets (R14/R14c).
 *
 * NOTHING HERE CALLS A VENDOR, which is the requirement. Each branch answers a
 * different question and none of them guesses:
 *
 *  - `settled`  → the stored record, returned as-is. The debit already
 *    happened and `credit_ledger_inference_debit_uq` would refuse a second one
 *    anyway, so `creditsChargedNow` is 0 and `replayed` says why.
 *  - `vendor_complete` → THE VENDOR HAS ANSWERED AND THE ANSWER IS STORED
 *    (R14c). This is the branch the durable candidate exists for: the attempt
 *    is finished with the vendor and unfinished with the ledger, so this call
 *    SETTLES it — one debit, one generation, zero HTTP. Before the candidate
 *    existed this state could only be reported as "already running", which was
 *    safe and threw away an output we had already paid for.
 *  - `refused` / `recovery_required` → the recorded terminal state, as a typed
 *    refusal. A `recovery_required` attempt is deliberately NOT retried: the
 *    system never guesses by calling the vendor again.
 *  - anything else (`claimed`, `vendor_started`) → the claim is live, the
 *    vendor may be mid-call, and this caller is not its winner.
 */
async function observeExistingClaim(
  ctx: SettlementCtx,
  attempt: GenerationAttempt
): Promise<GenerateResult> {
  const { db, caps, scope } = ctx;
  switch (attempt.state) {
    case "vendor_complete":
      // SETTLED FROM THE STORED CANDIDATE, through the same `settle` the fresh
      // path uses — not a second settlement written for the recovery case.
      // `run` is null because THIS call did not produce it; the stored
      // generation `settle` returns is what the creator reads.
      return await settle({
        ...ctx,
        candidate: readCandidate(ctx.params.mode, attempt),
        run: null,
      });
    case "settled": {
      const generation = await db.transaction((tx) =>
        caps.readGenerationForAttempt(attempt.attemptId, tx)
      );
      if (!generation) {
        // UNREACHABLE WHILE `generation_attempts_settled_has_generation`
        // EXISTS — it is an EQUALITY, so the database refuses a settled
        // attempt with no generation. Handled anyway, in the direction that
        // charges nobody and calls nothing.
        throw new GenerationRecoveryRequiredError(attempt.attemptId);
      }
      const view = await deriveBalance(db, scope.workspaceId);
      return {
        attemptId: attempt.attemptId,
        replayed: true,
        generation,
        run: null,
        creditsChargedNow: 0,
        balanceAfter: view.balance,
        freeClaimRefusal: isFreeClaimRefusal(generation, attempt.debitLedgerId),
        // NO OFFER WAS BUILT BY THIS CALL. A replay reads a settled row; no
        // prompt was assembled, so "nothing was dropped" is not something this
        // call knows (see `GenerateResult.frameworkOffer`).
        frameworkOffer: null,
        configVersion: generation.configVersion,
        resolvedTier: (
          await getWorkspaceBillingState(db, scope.workspaceId, view.asOf)
        ).tier,
      };
    }
    case "refused":
      throw new GenerationAlreadyRefusedError(
        attempt.attemptId,
        attempt.refusalCode
      );
    case "recovery_required":
      throw new GenerationRecoveryRequiredError(attempt.attemptId);
    default:
      throw new GenerationInFlightError(attempt.attemptId, attempt.state);
  }
}

/**
 * ONE VENDOR CALL, METERED (R14a).
 *
 * `model_usage` IS WRITTEN IN ITS OWN COMMITTED TRANSACTION, per call, before
 * anything downstream can fail — so a settlement refusal, a parse failure or a
 * crash leaves the spend recorded rather than rolled away. `recordUsage` is
 * `inference.ts`'s, not a second copy: the cost/`cost_state` rules it carries
 * (including "a failed attempt that reported no usage costs `unknown`, never a
 * zero") are the subtle half, and two implementations of them is how a margin
 * number comes to have two answers.
 */
async function meteredCall(args: {
  db: DbLike;
  scope: ProfileScope;
  provider: LlmProvider;
  prompt: AssembledPrompt;
  params: GenerateParams;
  model: string;
  content: RespinConfigV1;
  configVersion: number;
  billingTier: EntitlementTier;
  bundleVersion: string;
  /** THE OPERATION'S one deadline, shared by every call (audit P3-A3). */
  deadline: AbortSignal;
  /** Whether the reply is one this product can use. Pure; see the call site. */
  parses: (text: string) => boolean;
}): Promise<string> {
  // THE INPUT CEILING, FIRST AND BEFORE THE `try` (audit P3-R2, R-158). The
  // one statement both callbacks share, and it runs before the recording
  // contract begins: a refusal here writes ZERO `model_usage` rows, because
  // the failure row is written only inside the catch below — and
  // `LlmInputTooLargeError` is not an `LlmError`, so nothing here could
  // classify it as a vendor outcome. Exempt parts (the vendor's own draft on
  // a rewrite or a scoring call) are skipped, so a draft that was admitted
  // and paid for is never refused on its way back in.
  assertInputWithinCeiling(args.prompt, args.content.llm.maxInputTokens);
  const usageParams = {
    attemptId: args.params.attemptId,
    system: args.prompt.system,
    prompt: args.prompt.prompt,
    promptBundleVersion: args.bundleVersion,
  };
  const shared = {
    db: args.db,
    params: usageParams,
    purpose: GENERATION_PURPOSE,
    promptBundleVersion: args.bundleVersion,
    resolvedTier: args.billingTier,
    content: args.content,
    configVersion: args.configVersion,
  };

  let servedModel = args.model;
  let tokensIn = 0;
  let tokensOut = 0;
  let usageRaw: Record<string, number> = {};
  let text: string;
  try {
    const result = await withDeadline(
      args.provider.complete({
        attemptId: args.params.attemptId,
        model: args.model,
        system: args.prompt.system,
        prompt: args.prompt.prompt,
        maxOutputTokens: args.content.llm.maxOutputTokens,
        signal: args.deadline,
      }),
      args.deadline
    );
    text = result.text;
    servedModel = result.servedModel;
    tokensIn = result.usage.tokensIn;
    tokensOut = result.usage.tokensOut;
    usageRaw = result.usage.raw;
  } catch (e) {
    // THE SPEND RECORD IS WRITTEN ON FAILURE TOO. An `LlmError` classifies
    // itself — outcome and billability travel on the class — so a new failure
    // mode cannot be absorbed into a `default:` branch here. Anything else is
    // recorded `unavailable`, the NON-billable direction.
    const outcome: InferenceOutcome =
      e instanceof LlmError ? e.outcome : "unavailable";
    // A TRUNCATION KNOWS WHAT IT COST: it is the only failure carrying the
    // vendor's own usage report, because it is the only one where the vendor
    // produced a full ceiling of output and charged for it.
    if (e instanceof LlmTruncatedError && e.usage) {
      tokensIn = e.usage.tokensIn;
      tokensOut = e.usage.tokensOut;
      usageRaw = {
        input_tokens: e.usage.tokensIn,
        output_tokens: e.usage.tokensOut,
      };
    }
    const unwritten = await recordSpend(args.scope, {
      ...shared,
      model: servedModel,
      tokensIn,
      tokensOut,
      usageRaw,
      outcome,
      // NO GENERATION HAS AN "INCLUDED BUILD" (D-M2-2 is a property of the
      // onboarding brain). For this purpose the column answers R16's
      // question instead — "was the creator charged for the call we paid
      // for?" — and a failed call is never charged.
      consumedIncludedBuild: false,
    });
    // NOT SWALLOWED — carried on `cause`, so the edge that logs this can see
    // that a spend record is MISSING. Losing `e` would turn a named, true
    // refusal into "Something went wrong" on a path where money may already
    // be gone. The vendor's own failure stays the error, so the claim records
    // the code `refusalCodeFor` gives it, and `recordSpend` has already
    // emitted the numbers.
    if (unwritten !== null && e instanceof Error && e.cause === undefined) {
      e.cause = unwritten;
    }
    throw e;
  }

  const usable = args.parses(text);
  const unwritten = await recordSpend(args.scope, {
    ...shared,
    model: servedModel,
    tokensIn,
    tokensOut,
    usageRaw,
    // `schema_invalid` IS THE HONEST OUTCOME for a reply we could not parse:
    // the vendor produced and charged for text, and nothing usable came back.
    // It is BILLABLE (`USAGE_OUTCOME_BILLABLE`) — the outcome R16's bound counts.
    outcome: usable ? "succeeded" : "schema_invalid",
    // GENERATION PURPOSE ONLY, and always `false` here (launch L2, R-151 item
    // 5): at call time the creator has not been charged, and
    // `settleGeneration` marks this operation's rows consumed in the SAME
    // transaction as the debit and the generation. An operation that settles
    // nothing keeps every row counted by `countUnchargedBillableAttempts` and
    // `sumUnchargedBillableCostMicroUsd`. The onboarding voice purpose never
    // comes through here (A-11 fence).
    consumedIncludedBuild: false,
  });
  if (unwritten !== null) {
    // THE VENDOR WAS PAID AND NO ROW SAYS SO (audit P3-R5). Thrown as the
    // recovery terminal itself, so `generate` routes the claim to
    // `recovery_required` — never to `refused` with `parse_failed`, which
    // would name the reply as the failure — and the write failure travels on
    // `cause`.
    throw new GenerationRecoveryRequiredError(args.params.attemptId, unwritten);
  }
  return text;
}

type SpendRow = Parameters<typeof recordUsage>[1];

/**
 * Write one call's `model_usage` row; on a failure, ONCE more — `recordUsage`
 * opens its own transaction, so the second write is a fresh one (audit
 * P3-R5). Returns `null` when a row was written, or the second write's failure
 * (carrying the first on its `cause` when that slot is empty) after emitting
 * the call's token counts and cost — numbers and the attempt id only — so the
 * spend can be reconstructed from the event stream.
 */
async function recordSpend(
  scope: ProfileScope,
  row: SpendRow
): Promise<unknown | null> {
  try {
    await recordUsage(scope, row);
    return null;
  } catch (first) {
    try {
      await recordUsage(scope, row);
      return null;
    } catch (second) {
      if (second instanceof Error && second.cause === undefined) second.cause = first;
      emitGenerationSpendUnrecordedMetric({
        attemptId: row.params.attemptId,
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        costMicroUsd: spendCostOf(row),
      });
      return second;
    }
  }
}

/** The cost `recordUsage` would have stored, or `null` where it would store none. */
function spendCostOf(row: SpendRow): bigint | null {
  if (row.outcome !== "succeeded" && row.tokensIn === 0 && row.tokensOut === 0) {
    return null;
  }
  try {
    return costMicroUsd(priceFor(row.content.llm.prices, row.model), row.tokensIn, row.tokensOut);
  } catch {
    return null;
  }
}

/**
 * THE SETTLEMENT TRANSACTION (R14b), from the STORED candidate (R14c).
 *
 * ONE transaction, under the workspace lock, containing the debit AND the
 * generation AND the claim's transition. If any of them fails, none of them
 * commits — there is no state in which a usable generation exists unpaid, and
 * none in which a debit names a generation that was never stored.
 *
 * THE PRICE IS THE CLAIM'S (launch L2, R-151): the settlement prices under the
 * config version recorded in the claim's snapshot before any outbound call —
 * not under whatever version is active when the lock is taken — so a version
 * appended while the vendor answered cannot move the charge, and
 * `DebitParams.configVersion` names the document that set the number. (Before
 * L2 this re-read the ACTIVE config here, and a generation begun under N could
 * settle under N+1.)
 *
 * IT IS CALLED FROM TWO PLACES AND IS ONE FUNCTION, which is the point: the
 * fresh path calls it having just written the candidate, and
 * `observeExistingClaim` calls it for a `vendor_complete` attempt an earlier
 * call stored — reached by a same-id resubmission, by `settleHeldAttempt`
 * ("Finish this draft") or by the operator's command, never automatically.
 * NEITHER CAN CALL A VENDOR FROM HERE — there is no provider in scope — so
 * "settling a held candidate makes no vendor call" is a property of what this
 * function can reach, not of a branch remembering not to.
 */
async function settle(
  args: SettlementCtx & {
    candidate: StoredCandidate;
    /**
     * The pipeline's own result when THIS call produced it, `null` when this
     * call is settling a candidate an earlier one stored. It is REPORTED,
     * never READ: every value written below comes from `candidate`, so the two
     * cannot disagree about what was stored.
     */
    run: GenerationRun | null;
  }
): Promise<GenerateResult> {
  const { db, caps, scope, params, candidate, run } = args;
  // R8, FROM THE STORED BYTES. `parentGenerationId` is on the candidate, so
  // "is this a revision?" has exactly one answer on the fresh path and on a
  // retry — see the note on `SettlementCtx` for the hole this closes.
  const op: PricedOperation = generationOp(
    params.mode,
    candidate.request.parentGenerationId !== null
  );
  let outcome: SettlementOutcome;
  // When the vendor answered — read under the lock below — so a HELD refusal
  // can say until when the draft is held.
  let vendorCompletedAt: Date | null = null;
  try {
    outcome = await db.transaction(async (tx) => {
      // THE ORDERED HELPER (audit Phase 8, P8-A1, R-177): the membership graph
      // locks this transaction re-enters below — `caps.readGenerationAttempt`,
      // `recentContextPresent`, `settleGeneration` all run the profile
      // lifecycle fence — are taken HERE, shared, before the billing lock.
      // Taken after it, they were the inversion that deadlocked settlement
      // against the webhook and auto-top-up (register 2026-10-05 item 5).
      await takeWorkspaceLockInOrder(tx, {
        workspaceId: scope.workspaceId,
        userId: scope.userId,
      });
      // WHOSE TURN IT IS, DECIDED INSIDE THE LOCK (R14c). Two callers can hold
      // a `vendor_complete` row they both read BEFORE the lock — the original
      // press and a retry, or two retries — and exactly one of them may debit.
      // Reading the claim here, under the lock, is what makes that a decision
      // rather than a race; deciding it from the row each caller arrived with
      // is a read-then-write two connections both answer "yes" to.
      //
      // The loser does NOT fail. It unwinds to `observeExistingClaim`, which
      // hands back whatever the winner produced — so a concurrent retry is a
      // replay, not an error a creator has to interpret.
      //
      // A RETURN AND NOT A THROW, for two reasons. Nothing has been written
      // yet — the transaction has taken the lock and read one row — so
      // committing it and rolling it back leave the database in the same
      // state. And a thrown sentinel would be an `Error` subclass on a path
      // `app/**` can reach, which `facade-errors.test.ts` requires be
      // re-exported from the facade: that would put a class the creator can
      // never receive into the vocabulary a screen has to write copy for.
      // FOR UPDATE (launch L2, P3-R1): the claim row's own lock, so the
      // 24-hour predicate below cannot be overtaken by the worker's hard clear
      // between the check and the write.
      const claim = await caps.readGenerationAttempt(params.attemptId, tx, {
        lock: true,
      });
      if (!claim || claim.state !== "vendor_complete") {
        return { moved: claim };
      }
      vendorCompletedAt = claim.vendorCompletedAt;
      // THE 24-HOUR PREDICATE, ENFORCED AT SETTLEMENT (launch L2, P3-R1). A
      // candidate is settleable only while `vendor_completed_at >= now − 24 h`
      // — the window the worker's `hardClearUnsettled` closes. Past it this
      // resume gets the typed terminal (`recovery_required`, no customer
      // debit; the vendor spend already happened and stays counted), never a
      // late settle. Nothing has been written in this transaction yet.
      if (
        claim.vendorCompletedAt === null ||
        isPastVendorCompleteHardClear(claim.vendorCompletedAt, await getDbNow(tx))
      ) {
        return { expired: claim };
      }
      // ERASED CONTEXT ENDS THE OPERATION (launch L3, R-152 item e). The
      // claim's snapshot names every earlier draft and reaction note its
      // prompt carried as history; if one of them no longer exists in this
      // profile's scope, the candidate was built from context the creator (or
      // the lifecycle) has since erased, and storing it would keep that
      // context alive inside a new output. So it is the typed terminal under
      // the pinned charging policy — `recovery_required`, candidate cleared, no
      // customer debit — and NOTHING is rebuilt: no reread, no restore, no
      // second vendor call. Checked here, inside the workspace lock and before
      // the debit, on the fresh path and on every resume alike. A section this
      // build cannot read is the same terminal (fail closed), via the catch.
      const recentIds = recentContextIdsOf(claim);
      if (
        recentIds !== null &&
        recentIds.generationIds.length + recentIds.feedbackIds.length > 0
      ) {
        const present = await scope.accessors.recentContextPresent(recentIds, tx);
        const presentGenerations = new Set(present.generationIds);
        const presentFeedback = new Set(present.feedbackIds);
        if (
          !recentIds.generationIds.every((id) => presentGenerations.has(id)) ||
          !recentIds.feedbackIds.every((id) => presentFeedback.has(id))
        ) {
          return { contextErased: claim };
        }
      }
      // RE-DERIVED INSIDE THE LOCK. The tier does not price a generation (the
      // MODE does), so this is not the price input — it is what the result
      // reports the debit was taken under, read from the ONE tier authority
      // rather than carried from before the vendor call.
      //
      // THE MODE GATE IS DELIBERATELY *NOT* RE-RUN HERE, and that is a stated
      // choice rather than an omission. A workspace that downgraded during the
      // vendor call would fail R18's plan check now — and refusing at this
      // point would throw away an answer we have already paid for, charge
      // nobody, and tell a creator their generation vanished. The plan gate is
      // an ENTITLEMENT check on starting work; the settlement's job is to
      // record work that happened. The exposure is one output on a plan that
      // no longer includes the mode, for the duration of one call.
      const billing = await getWorkspaceBillingState(
        tx,
        scope.workspaceId,
        args.at
      );
      // THE PRICE IS THE CLAIM'S, NOT TODAY'S (launch L2, R-151). This used to
      // re-read the ACTIVE config inside the lock, so a version appended while
      // the vendor was answering could price a generation differently from the
      // number its confirmation displayed. The settlement now prices under the
      // config version recorded in the claim's snapshot before any outbound
      // call — the version whose price the pre-call gates (and, for a confirmed
      // commission, the quote check) were run on, already verified to carry
      // every required stored path when it was read. `config_versions` is
      // append-only, so that document cannot have changed since. The debit
      // records the same version, so a dispute reconciles against the document
      // that set the number.
      //
      // IT ALSO CLOSES the residual `generation-pricing.test.ts` names: an
      // operator who removes a vendor price row between the pre-call read and
      // this one no longer strands a paid generation, because this
      // transaction no longer re-reads the active document's price rows.
      const configVersion = snapshotConfigVersionOf(claim);
      const content = (await configVersionContents(tx, [configVersion])).get(
        configVersion
      ) as RespinConfigV1;
      // A REFUSAL CAUSED ONLY BY THE CLAIM SCAN IS FREE (owner decision
      // 2026-10-07, R-173; amends R-68). The strict hedge allowlist refuses
      // some honest sentences, and a creator is never charged for that: the
      // pipeline's one rewrite already ran as system spend, and when it still
      // refuses on `forbidden_claim` alone no debit is taken. Any other cause
      // — or a mix — keeps today's price. Decided from the STORED candidate,
      // the same record `isFreeClaimRefusal` reads off the settled row.
      const freeClaimRefusal =
        candidate.outcome === "honest_refusal" &&
        refusalIsClaimOnly(candidate.killTest);
      const cost = freeClaimRefusal ? 0 : priceOf(content, op);
      let debit: CreditLedgerRow | null = null;
      if (cost > 0) {
        // `debitCredits` re-reads the pause, the write clock AND the balance
        // under this same lock, and refuses before writing. That is where
        // "balance is rechecked inside the settlement lock" actually lives.
        try {
          debit = await debitCredits(tx, {
            workspaceId: scope.workspaceId,
            cost,
            // `refType` is the literal `credit_ledger_inference_debit_uq` keys
            // on, and R-63 records the decision to REUSE it rather than mint a
            // sixth constraint: one index, global, refusing a second debit for
            // one attempt whichever operation claimed it.
            refType: "inference",
            refId: params.attemptId,
            at: await getDbNow(tx),
            configVersion,
          });
        } catch (e) {
          // WRAPPED, so the screen can tell the truth. The same class means
          // opposite things before and after the vendor call: there, nothing
          // happened; here, the model has answered and we have paid for it.
          if (e instanceof InsufficientCreditsError) {
            throw new PostCallDebitError(params.attemptId, e.balance, e.cost);
          }
          throw e;
        }
      }
      // EVERY FIELD FROM THE STORED CANDIDATE. `run` is deliberately not read
      // here even on the fresh path, so the settlement has exactly one source
      // and the retry path is not a second, less-travelled implementation of
      // it.
      const { generation } = await caps.settleGeneration(
        {
          attemptId: params.attemptId,
          mode: params.mode,
          brainActivationId: candidate.request.brainActivationId,
          // WHICH FRAMEWORKS THE OUTPUT ACTUALLY NAMED (R9a), resolved when the
          // candidate was built and read back from it here — never the whole
          // offered library. The column's own contract is "the exact framework
          // versions USED", and recording nine offered rows as used would be a
          // false provenance claim on every generation that named one of them.
          frameworkVersions: candidate.frameworkVersions,
          // NO STORED CONTEXT ROWS YET. The creator's input for a generation is
          // typed into the studio and is not an `onboarding_inputs` row, so
          // there is no id to name — and the input itself is on `request`
          // below, verbatim, so the provenance is complete rather than partial.
          contextInputIds: [],
          request: candidate.request,
          model: candidate.model,
          promptBundleVersion: candidate.request.promptBundleVersion,
          configVersion,
          outcome: candidate.outcome,
          output: candidate.output,
          // REQ-I04: every usable output names its weakest point, and
          // `generations_usable_names_weakest_point` refuses one that does not.
          // It is READ OFF THE PARSED DOCUMENT rather than stored beside it,
          // because a second copy in the candidate could disagree with the
          // document it claims to summarise. The claim is the model's about
          // its own idea.
          weakestPoint: candidate.output
            ? candidate.output.whyThisPerforms.weakestPoint
            : null,
          refusalReason: candidate.refusalReason,
          killTest: candidate.killTest,
          rewriteCount: candidate.rewriteCount,
          debitLedgerId: debit?.id ?? null,
          // R-173: a free claim refusal's usage rows stay UNCONSUMED — system
          // spend, still counted by both uncharged-attempt caps — because
          // nobody was charged for them.
          usageIsSystemSpend: freeClaimRefusal,
          // R6's LINEAGE, from the stored candidate. `undefined` means original
          // — `SettleGenerationParams` deliberately has no `null` spelling —
          // and `settleGeneration` re-reads a non-undefined parent through the
          // profile's own predicate before it writes, which is what makes a
          // cross-tenant or not-yet-earlier parent a NAMED refusal rather than
          // a 23503. That check is the authority; `resolveRevisionParent` in
          // this file is the same question asked before the vendor is paid.
          parentId: candidate.request.parentGenerationId ?? undefined,
          // L2: the piece this script was commissioned for, from the stored
          // candidate — its selection is recorded in this same transaction.
          ...(candidate.request.origin?.kind === "piece"
            ? { pieceId: candidate.request.origin.pieceId }
            : {}),
        },
        tx
      );
      const view = await deriveBalanceInTx(tx, scope.workspaceId);
      return {
        settled: {
          generation,
          creditsChargedNow: cost,
          balanceAfter: view.balance,
          freeClaimRefusal: isFreeClaimRefusal(generation, debit?.id ?? null),
          configVersion,
          resolvedTier: billing.tier,
        },
      };
    });
  } catch (e) {
    // A TRANSIENT CONDITION HOLDS THE DRAFT; ANYTHING ELSE IS A FAILURE
    // (audit P3-A4, R-157).
    //
    // A pause ends, a balance can be topped up, and a serialisation failure,
    // a deadlock or a lock timeout is gone on the next try. These used to
    // REFUSE the attempt, which nulls the candidate — so an output the vendor
    // had already been paid for was destroyed by a condition that clears in
    // minutes, contradicting R14c's charter above. Now NOTHING is written: the
    // transaction rolled back, the attempt stays `vendor_complete` with its
    // candidate, and the creator is told the draft is held, unsettled and
    // uncharged, and can be finished from /studio until 24 hours after the
    // vendor answered — after which the worker's clear removes it, uncharged.
    const held = heldReasonOf(e);
    if (held !== null) {
      throw new GenerationHeldError(
        params.attemptId,
        held,
        vendorCompletedAt === null
          ? null
          : new Date(
              (vendorCompletedAt as Date).getTime() + VENDOR_COMPLETE_HARD_CLEAR_MS
            ),
        e
      );
    }
    // ANYTHING ELSE IS `recovery_required` (R14c): the vendor was called, we
    // have its `model_usage` rows, and we cannot prove what should have been
    // stored. It is visible to an operator, the creator is told nothing was
    // taken from their balance (true — the debit rolled back with the
    // generation), and THE SYSTEM NEVER GUESSES BY CALLING THE VENDOR AGAIN.
    await recordRecoveryRequired(db, caps, params.attemptId);
    throw new GenerationRecoveryRequiredError(params.attemptId, e);
  }

  // SOMEBODY ELSE GOT THERE FIRST — handled OUTSIDE the try, deliberately.
  // `observeExistingClaim` raises the typed refusals a creator reads
  // (`GenerationAlreadyRefusedError` and friends), and inside the try they
  // would have been swallowed by the `recovery_required` branch above and
  // reported as a failure this product could not explain.
  //
  // IT CANNOT RECURSE BACK INTO `settle`: the only branch of
  // `observeExistingClaim` that calls this function is its `vendor_complete`
  // one, and the single `return { moved }` above is guarded by
  // `state !== "vendor_complete"` — the one state that never reaches here is
  // the one that would recurse.
  if ("expired" in outcome) {
    // THE TYPED TERMINAL FOR A RESUME PAST 24 HOURS (launch L2, P3-R1): the
    // same transition the worker's hard clear makes — `recovery_required`,
    // candidate cleared — recorded in its own transaction (a concurrent clear
    // having made it first is not an error worth replacing this one with).
    // No customer debit was taken, and no vendor is called.
    await recordRecoveryRequired(db, caps, params.attemptId);
    throw new GenerationRecoveryRequiredError(
      params.attemptId,
      "the stored candidate is past the 24-hour settlement window"
    );
  }
  if ("contextErased" in outcome) {
    // LAUNCH L3 (R-152 item e): the same terminal transition as the 24-hour
    // clear — `recovery_required`, candidate cleared, no customer debit, no
    // vendor call — with the reason on `cause`, never in what a creator reads.
    await recordRecoveryRequired(db, caps, params.attemptId);
    throw new GenerationRecoveryRequiredError(
      params.attemptId,
      "recent work this draft was built from has since been erased"
    );
  }
  if ("moved" in outcome) {
    if (!outcome.moved) {
      // The claim is gone from under us — the profile was deleted mid-flight
      // and the row cascaded. Nothing was charged, and nothing is guessed.
      throw new GenerationRecoveryRequiredError(
        params.attemptId,
        "the claim no longer exists"
      );
    }
    return await observeExistingClaim(args, outcome.moved);
  }
  return {
    attemptId: params.attemptId,
    replayed: false,
    run,
    // SETTLEMENT DOES NOT BUILD THE OFFER, so the honest value here is `null`
    // — which is also the right answer for the RETRY path that settles a
    // stored candidate without assembling a prompt. The fresh path overrides
    // it with the offer it really built; see `generate`'s final return.
    frameworkOffer: null,
    ...outcome.settled,
  };
}

/**
 * IS THIS STORED GENERATION A FREE CLAIM REFUSAL? (R-173.) An honest refusal
 * whose final attempt failed on `forbidden_claim` alone AND that no ledger row
 * paid for. The second clause is what makes a screen's "no credits were used"
 * a statement about the ledger rather than about the rule: a claim-only
 * refusal settled before R-173 was debited, and its replay must not say
 * otherwise. `debitLedgerId` is the SETTLED ATTEMPT's terminal id (the
 * generation row does not carry one): the debit just taken on the settling
 * path, `generation_attempts.debit_ledger_id` on a replay.
 */
function isFreeClaimRefusal(
  generation: Generation,
  debitLedgerId: string | null
): boolean {
  return (
    generation.outcome === "honest_refusal" &&
    debitLedgerId === null &&
    refusalIsClaimOnly(generation.killTest)
  );
}

/**
 * What the settlement transaction returns: the settled row, or the claim as it
 * was found under the lock when this caller was not the one settling it.
 */
type SettlementOutcome =
  | {
      settled: {
        generation: Generation;
        creditsChargedNow: number;
        balanceAfter: number;
        freeClaimRefusal: boolean;
        configVersion: number;
        resolvedTier: EntitlementTier;
      };
    }
  | { moved: GenerationAttempt | undefined }
  | { expired: GenerationAttempt }
  | { contextErased: GenerationAttempt };

/**
 * Record a terminal refusal on the claim, without letting the bookkeeping
 * replace the refusal the creator needs to read.
 *
 * ITS OWN TRANSACTION. Its one caller is `generate`'s catch around the vendor
 * sequence, which is already throwing the error the creator needs to read —
 * so a failure here is SWALLOWED, as `recordRecoveryRequired` below swallows
 * its own (audit P3-A5). It used to rethrow anything but a state conflict,
 * which replaced the informative error with a driver error AND left the
 * attempt where it was. What keeps that loud instead of silent: an attempt
 * left at `vendor_started` is moved to `recovery_required` by the worker past
 * its deadline and pages `generation_started_past_deadline`
 * (`worker/retention.ts`).
 */
async function recordRefusal(
  db: DbLike,
  caps: Caps,
  attemptId: string,
  refusalCode: GenerationRefusalCode
): Promise<void> {
  try {
    await db.transaction((tx) =>
      caps.advanceGenerationAttempt({ attemptId, to: "refused", refusalCode }, tx)
    );
  } catch {
    // Swallowed — see the docblock: the caller rethrows the real error, and
    // the attempt this left behind is swept and paged by the worker.
  }
}

async function recordRecoveryRequired(
  db: DbLike,
  caps: Caps,
  attemptId: string
): Promise<void> {
  try {
    await db.transaction((tx) =>
      caps.advanceGenerationAttempt({ attemptId, to: "recovery_required" }, tx)
    );
  } catch {
    // DELIBERATELY SWALLOWED, and this is the one place it is right: the
    // caller is about to throw `GenerationRecoveryRequiredError` carrying the
    // real cause, and an error raised while trying to FLAG a failure must not
    // replace the failure itself. The `model_usage` rows are the durable
    // record either way.
  }
}

/**
 * Which closed code a thrown failure records on the claim (R14b).
 *
 * ITS ONE CALLER: `generate`'s catch around `runGeneration`, which first
 * routes `GenerationRecoveryRequiredError` (a spend write that failed twice,
 * audit P3-R5) to `recovery_required` and never hands it here. (`settle`'s
 * catch was a second caller until audit P3-A4: a pause or a short balance at
 * settlement now HOLDS the draft and records nothing.) The `paused` and
 * `post_call_debit` branches below therefore have no producer today; they
 * stay so a stored code keeps its meaning for rows written before P3-A4.
 *
 * WHAT CAN REACH IT, by producer: `LlmInputTooLargeError`
 * (`assertInputWithinCeiling`, the first statement of `meteredCall`) →
 * `input_too_large`; `LlmError` subclasses rethrown by
 * `meteredCall` → `vendor_failed`; `KillTestError` (`parseKillTestReply`) →
 * `kill_test_failed`; `GenerationAssemblyError` (`assembleGenerationPrompt` /
 * `assembleRewritePrompt`) → `assembly_refused`; `SpinSimilarityError`
 * (`assertTrustedReference` and the pipeline's two missing-reference guards) →
 * `reference_unusable`; `ScriptOutputError` (`parseScriptOutput`) →
 * `parse_failed`. The default ALSO receives anything nobody classified — a
 * provider that throws something other than an `LlmError`, `NoCreatorRulesError`
 * if the pipeline ever scored an empty rule list, or a programming error — and
 * records it as `parse_failed`, which for those is the wrong reason. There is
 * no closed code for "unclassified"; adding one is the fix if that row ever
 * has to be told apart.
 */
function refusalCodeFor(e: unknown): GenerationRefusalCode {
  if (e instanceof WorkspacePausedError) return GENERATION_REFUSAL_CODES.paused;
  if (e instanceof PostCallDebitError) {
    return GENERATION_REFUSAL_CODES.post_call_debit;
  }
  // BEFORE the `LlmError` branch, though neither subclasses the other: our
  // own size refusal is never a vendor outcome (audit P3-R2).
  if (e instanceof LlmInputTooLargeError) {
    return GENERATION_REFUSAL_CODES.input_too_large;
  }
  if (e instanceof LlmError) return GENERATION_REFUSAL_CODES.vendor_failed;
  if (e instanceof Error && e.name === "KillTestError") {
    return GENERATION_REFUSAL_CODES.kill_test_failed;
  }
  // A CALLER-SIDE REFUSAL IS NOT A VENDOR FAILURE (billing gate, 2026-09-02).
  // `runGeneration` calls `assembleGenerationPrompt`, which refuses an empty
  // input, a blank platform, an empty brain and an unstated unvouched list —
  // INSIDE the pipeline, so after the claim and after `vendor_started`, and
  // therefore on this path rather than before it. It used to fall through to
  // `parse_failed`, which told an operator reading `generation_attempts` that
  // the model had answered with something unusable when no model was called.
  // Nothing was spent either way; the row said the wrong thing about why.
  if (e instanceof GenerationAssemblyError) {
    return GENERATION_REFUSAL_CODES.assembly_refused;
  }
  // THE SAME REASON, ONE CLASS OVER. `SpinSimilarityError` is thrown by
  // `assertTrustedReference`'s four bounds and by the two missing-reference
  // guards in `pipeline.ts`. Named by `name` rather than by `instanceof` for
  // the reason the `KillTestError` branch above is: `@respin/modes` is not a
  // dependency this module may narrow against at the type level here.
  if (e instanceof Error && e.name === "SpinSimilarityError") {
    return GENERATION_REFUSAL_CODES.reference_unusable;
  }
  // THE DEFAULT: `ScriptOutputError`, plus the unclassified remainder the
  // docblock lists — not only parse failures.
  return GENERATION_REFUSAL_CODES.parse_failed;
}

/**
 * The stored `refusal_reason` for an honest refusal (REQ-C03, R7).
 *
 * THE HEADLINE, THE REASONS AND THE SHARPER ANGLE, in one column, because
 * `generations_refusal_states_reason` requires a non-blank reason for exactly
 * this outcome — "everything died, here is why, here is a sharper angle to
 * try". The structured form is on `kill_test` beside it, so this string is the
 * readable summary rather than the only record.
 */
function refusalReasonOf(refusal: HonestRefusal): string {
  return [refusal.headline, ...refusal.why, refusal.sharperAngle].join("\n");
}

/**
 * SQLSTATEs a settlement may meet and that are gone on the next attempt:
 * serialisation failure, deadlock, lock not available (audit P3-A4).
 */
const TRANSIENT_SETTLEMENT_SQLSTATES: ReadonlySet<string> = new Set([
  "40001",
  "40P01",
  "55P03",
]);

/**
 * Which held reason a settlement failure is, or `null` when it is not one
 * that ends on its own (audit P3-A4, R-157). The driver code is read off the
 * error and its `cause` chain (drizzle wraps the pg error), bounded in depth.
 */
function heldReasonOf(e: unknown): GenerationHeldReason | null {
  if (e instanceof WorkspacePausedError) return "paused";
  if (e instanceof PostCallDebitError) return "insufficient_balance";
  let current: unknown = e;
  for (let depth = 0; depth < 5 && current != null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_SETTLEMENT_SQLSTATES.has(code)) {
      return "transient";
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * "FINISH THIS DRAFT" (audit P3-A4, R-157) — and the entry the operator's
 * `scripts/settle-candidate.ts` calls (P3-R1(b)).
 *
 * Settles one HELD candidate by its attempt id, through the ONE existing
 * path: the claim is read through this profile's own scoped capability (a
 * foreign or unknown id is `HeldDraftUnavailableError`, one message for both),
 * then handed to `observeExistingClaim` — so the settlement, the 24-hour
 * predicate under the claim row's lock and the single debit are exactly the
 * same-id resubmission's. WHAT IT SKIPS IS THE INTENT COMPARISON, and only
 * that: the caller holds an attempt id, not the original request, so there is
 * no intent to compare; a claim that predates `intent_sha256` settles too.
 *
 * WHAT IT INHERITS, by being that path: a paused workspace or a short balance
 * holds the draft again (`GenerationHeldError`); a workspace under deletion is
 * refused by the scope mint before this runs; a candidate past 24 hours is
 * `recovery_required`; an already-settled attempt is a replay that charges
 * nothing — so a second press, or a second operator run, is idempotent. A
 * tier change since the claim is NOT a refusal: `settle` records the tier it
 * read under the lock.
 */
export async function settleHeldAttempt(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  attemptId: string,
  at: Date
): Promise<GenerateResult> {
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  // The `generate` gates a same-id resubmission meets before its claim
  // lookup: role, then the archived profile, read now.
  if (scope.role === "viewer") throw new InferenceRoleError(scope.role);
  const [profile] = await scope.accessors.profile();
  if (!profile || profile.state !== "active") throw new ProfileArchivedError();
  const caps = writeCapabilities(scope);
  const claim = await db.transaction((tx) =>
    caps.readGenerationAttempt(attemptId, tx)
  );
  if (!claim || claim.purpose !== GENERATION_PURPOSE) {
    throw new HeldDraftUnavailableError(attemptId);
  }
  // The stored mode is a real mode, or the claim is not one this build wrote.
  const mode = claim.mode as ModeId;
  modeSpec(mode);
  return await observeExistingClaim(
    {
      db,
      caps,
      scope,
      // `settle` reads `attemptId` and `mode` off these and nothing else —
      // every settled value comes from the stored candidate.
      params: { mode, attemptId, input: "", platform: "" },
      at,
    },
    claim
  );
}

// ------------------------------------------------- the durable candidate (R14c)

/**
 * What the creator asked for, as assembled — the object `payload_sha256`
 * hashes and `generations.request` stores.
 *
 * NAMED rather than inline because THREE things now agree on it: the hash, the
 * stored generation, and the candidate that survives a crash between them. An
 * inline shape in three places is three shapes that only look the same.
 */
export type GenerationRequest = {
  mode: string;
  platform: string;
  input: string;
  brainActivationId: string;
  promptBundleVersion: string;
  /**
   * THE OUTPUT THIS ONE REVISES (slice 7, R6), or `null` for an original.
   *
   * A GENERATION ID, resolved by the server from the attempt id the caller
   * named — see `GenerateParams.revisionOfAttemptId`. It is here rather than
   * only on the row because all three consumers of this shape need it: the
   * payload hash (two different requests must not collide), the stored
   * `generations.request`, and the candidate a retry settles from, which is
   * where the settlement reads the lineage AND the price from.
   */
  parentGenerationId: string | null;
  /** Server-derived identity/version of the reference used by a Spin. */
  spinAutopsyId: string | null;
  spinAnalysisVersion: string | null;
  /**
   * THE CREATIVE HALF (R-148): the requested form and the declared limits in
   * their canonical parsed form, or `null` for a legacy generation.
   *
   * IT DECIDES WHICH OUTPUT CONTRACT THE STORED OUTPUT IS READ UNDER, so
   * `readCandidate` holds the stored output to it — a non-null value with an
   * unversioned output, or a null one with a v2 output, is unreadable.
   */
  creative: CreativeRequest | null;
  /**
   * WHERE THE REQUEST CAME FROM (launch L2, R-151) — `null` for the ordinary
   * Studio press. Server-derived: the piece's id and stored source come from
   * the scoped piece read, never from the caller. In the payload hash, in the
   * stored generation and in the candidate a retry settles from — which is
   * where the settlement reads the piece whose selection it records.
   */
  origin: GenerationOrigin;
};

/** The request's origin (launch L2). See `GenerationRequest.origin`. */
export type GenerationOrigin =
  | null
  | { kind: "find_concept" }
  | {
      kind: "piece";
      pieceId: string;
      sourceGenerationId: string | null;
      sourceIdeaIndex: number | null;
    };

/**
 * THE DURABLE VALIDATED CANDIDATE (R14c) — the settlement's whole input.
 *
 * WHY IT IS THE SETTLEMENT'S INPUT AND NOT A COPY OF `GenerationRun`. A stored
 * `GenerationRun` would have to be handed back to the settlement as a
 * `GenerationRun`, and nothing in `packages/credits` can validate one — its
 * shape belongs to `@respin/modes` — so reading it back would end in a cast,
 * which is a claim about bytes nobody checked. This shape is exactly the five
 * values `settleGeneration` writes plus the provenance the settlement cannot
 * safely re-derive, and every one of them is checked on the way back in:
 * `output` through `parseScriptOutput`, the mode's own parser, which is the
 * same function that validated it before it was ever stored.
 *
 * `killTest` IS `unknown` ON PURPOSE. It is written to a `jsonb` column and
 * read by nothing in this package, so validating its interior here would be
 * `@respin/modes`' contract restated in a second place that can drift from it.
 * What IS enforced is that it is an object — see `readCandidate`.
 *
 * WHAT IS *NOT* HERE, and why: no `weakestPoint` (read off the parsed output,
 * so a second copy cannot disagree with the document it summarises), no
 * `configVersion` (the settlement re-reads it inside the lock — a generation
 * that began under N may legitimately settle under N+1), and no tier.
 */
export type StoredCandidate = {
  /** The model that ACTUALLY produced this, not the one config names today. */
  model: string;
  request: GenerationRequest;
  killTest: unknown;
  /** R6's bound. `generations_one_rewrite` CHECKs 0..1 on the way in. */
  rewriteCount: 0 | 1;
  /**
   * The frameworks the OUTPUT NAMED, as `{id, version}` (slice 7, R9a).
   *
   * RESOLVED WHEN THE CANDIDATE IS BUILT, not at settlement, because settlement
   * has no access to the offered library — a retry settles minutes later, from
   * bytes, with no scope read of `frameworks` in sight. Resolving it here and
   * storing the answer is the same discipline the rest of this shape follows:
   * the settlement reads one document and never re-derives anything from a
   * world that has moved.
   */
  frameworkVersions: FrameworkVersion[];
} & (
  | { outcome: "usable"; output: ScriptOutput; refusalReason: null }
  | { outcome: "honest_refusal"; output: null; refusalReason: string }
);

/**
 * The envelope version.
 *
 * A STORED DOCUMENT WITH NO VERSION IS A DOCUMENT THAT CANNOT BE CHANGED
 * SAFELY: the rows this reader meets are written by whatever code was
 * deployed when the vendor answered, which during a rolling deploy is not
 * this code. An unrecognised version is refused rather than best-guessed, so
 * the failure is "an operator must look at this" and never "settled from a
 * shape we half-understood".
 */
const CANDIDATE_VERSION = 6;

/*
 * WHY 6 (launch L2, R-151). Version 6's `request` carries `origin` (a piece or
 * the no-concept entrance, or `null`), and the reader REQUIRES the key because
 * the settlement reads the piece whose selection it records from it. `origin`
 * is also part of `hashRequest`, and L2 compares a same-id submission on the
 * claim's intent hash, which a pre-L2 claim does not carry — so an attempt
 * claimed by an earlier build is refused on the intent before its candidate is
 * read. Schedule the deploy with no attempt in flight (R-149 item 7's rule).
 */

/*
 * WHY 5 (R-150 point 2, launch L1 round 3). A version-2 output now REQUIRES
 * the server-owned `serverChecks` field, which the stored reader validates. A
 * version-4 candidate was written before that field existed, so it is refused
 * by its VERSION — an operator reads "envelope version 4" — rather than by a
 * missing key deep in the output reader. No version-4 envelope ever reached
 * production (L1 had not shipped); this is the dev-row case.
 */

/*
 * WHY 4 (R-148, launch L1). Version 4's `request` carries `creative`, and the
 * reader REQUIRES the key — `null` or a request — because it decides which
 * output contract the stored output is held to. A version-3 envelope is
 * refused like any other unknown version, for the slice-7 reason below: L1
 * moved EVERY mode's `prompt_bundle_version` (the gate description now names
 * the four form rules and their constants — `bundle.test.ts` asserts that for
 * every mode), and the bundle version is part of `hashRequest`, so an attempt
 * claimed by a pre-L1 build cannot match this build's payload hash and is
 * refused on the hash before its candidate is read.
 */

/**
 * WHY 2 AND NOT 1 (slice 7). Version 1's envelope had no `frameworkVersions`
 * and its `request` had no `parentGenerationId`, and both are fields the
 * settlement now READS — the first decides a provenance column, the second
 * decides the lineage AND the price. Reading a v1 document leniently (missing
 * means `[]`, missing means `null`) would settle a revision at the mode's
 * price, which is the one outcome R8 exists to prevent.
 *
 * AND THE REFUSAL THAT ACTUALLY FIRES IS NOT THIS ONE (billing gate,
 * 2026-09-01). This paragraph used to end "a v1 row therefore refuses, stays
 * at `vendor_complete` with its bytes intact, and is visible to an operator —
 * the behaviour `readCandidate`'s docblock already specifies". The OUTCOME is
 * right and the MECHANISM named was not: a v1 candidate cannot reach
 * `readCandidate` at all. `hashRequest` gained its sixth field in the same
 * change, so a pre-deploy attempt's stored `payload_sha256` — taken over five
 * — cannot equal the hash this build computes, and the equality check twenty
 * lines into `generate` throws `GenerationPayloadMismatchError` first. Both
 * halves are RUN rather than argued: `revision.test.ts` computes the five-field
 * canonical string and asserts the hashes differ, and its "a retry that DROPS
 * the revision flag" case proves the ordering — an attempt sitting at
 * `vendor_complete` WITH a stored candidate is refused on the hash without the
 * candidate being read.
 *
 * SO THE STORED BYTES ARE STILL INTACT AND THE ATTEMPT IS STILL AT
 * `vendor_complete` for an operator; what changes is which sentence the
 * creator gets, and `GenerationPayloadMismatchError`'s message now covers this
 * cause instead of telling them they submitted a different request.
 */

/** The settlement input, derived from the pipeline's result. Pure. */
function candidateOf(
  run: GenerationRun,
  model: string,
  request: GenerationRequest,
  offered: readonly FrameworkRow[]
): StoredCandidate {
  const shared = {
    model,
    request,
    killTest: run.killTest,
    // `drafts` is 1 or 2 by its own type, so this is 0 or 1 by construction —
    // the bound `generations_one_rewrite` also holds, from the other side.
    rewriteCount: (run.drafts - 1) as 0 | 1,
    frameworkVersions: frameworkVersionsUsed(
      run.status === "usable" ? run.output : null,
      offered
    ),
  };
  return run.status === "usable"
    ? { ...shared, outcome: "usable", output: run.output, refusalReason: null }
    : {
        ...shared,
        outcome: "honest_refusal",
        output: null,
        refusalReason: refusalReasonOf(run.refusal),
      };
}

/** The stored form. `jsonb`, so plain JSON only — no Dates, no classes. */
function candidateEnvelope(c: StoredCandidate): Record<string, unknown> {
  return {
    v: CANDIDATE_VERSION,
    model: c.model,
    request: c.request,
    outcome: c.outcome,
    output: c.output,
    refusalReason: c.refusalReason,
    killTest: c.killTest,
    rewriteCount: c.rewriteCount,
    frameworkVersions: c.frameworkVersions,
  };
}

/**
 * Read a stored candidate back, FAIL-CLOSED (R14c).
 *
 * THE POINT OF PARSING SOMETHING WE WROTE. It crossed a process boundary and a
 * `jsonb` round trip, it may have been written by a previous deployment, and
 * the alternative to checking it is a cast — which is how a settlement comes
 * to write a `generations` row that satisfies no CHECK and fails INSIDE the
 * money transaction, with the vendor already paid. R3's fail-closed contract
 * for a vendor reply is the same contract, and this is the same parser.
 *
 * EVERY FAILURE IS `GenerationRecoveryRequiredError`, RAISED HERE, rather than
 * a private class a caller converts. Two reasons, and the second is the one
 * that decided it: the outcome genuinely IS recovery (the vendor was paid, we
 * hold something we cannot use, and calling again would be guessing); and
 * `app/**` may import only the credits facade, so a private `Error` subclass
 * on a facade-reachable path is a class a screen cannot `instanceof` —
 * `facade-errors.test.ts` refuses one, and it is right to.
 *
 * THE DIAGNOSTIC RIDES ON `cause`, never in the message, which is the rule
 * `GenerationRecoveryRequiredError`'s own constructor states: what a creator
 * reads must not carry the shape of a document they never saw.
 *
 * AN UNREADABLE CANDIDATE LEAVES THE ATTEMPT AT `vendor_complete`, and that is
 * a deliberate departure from "flag it and move on": moving to
 * `recovery_required` would CLEAR the candidate (the equality CHECK makes that
 * transition null it), and the bytes an operator needs in order to fix the
 * reader are the very thing that would be destroyed. Nothing is charged either
 * way and no vendor is called either way, and the row stays plainly visible as
 * an attempt that reached the model and never settled.
 *
 * A MISSING candidate is unreachable while
 * `generation_attempts_candidate_iff_vendor_complete` exists — it is an
 * equality, so the database refuses a `vendor_complete` row without one — and
 * it is handled here anyway, in the direction that charges nobody and calls
 * nothing.
 */
function readCandidate(
  mode: ModeId,
  attempt: GenerationAttempt
): StoredCandidate {
  const unreadable = (what: string): never => {
    throw new GenerationRecoveryRequiredError(
      attempt.attemptId,
      `the stored generation candidate is unusable: ${what}`
    );
  };
  const object = (value: unknown, what: string): Record<string, unknown> => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      unreadable(`${what} is not an object`);
    }
    return value as Record<string, unknown>;
  };
  const nonBlank = (value: unknown, what: string): string => {
    if (typeof value !== "string" || value.trim() === "") {
      unreadable(`${what} is not a non-blank string`);
    }
    return value as string;
  };
  // R6's bound, read back as the LITERAL union rather than as a number: a
  // narrowing on an `unknown` reached through an index signature does not
  // survive to the property read, so the inline version compiles only with a
  // cast — and a cast is the thing this reader exists to avoid.
  const rewriteCountOf = (value: unknown): 0 | 1 => {
    if (value === 0) return 0;
    if (value === 1) return 1;
    return unreadable(
      `rewriteCount is ${String(value)}, and R6 permits exactly one rewrite`
    );
  };

  const env = object(attempt.candidate, "the candidate");
  if (env.v !== CANDIDATE_VERSION) {
    unreadable(
      `it was written by envelope version ${String(env.v)}, and this build reads ${CANDIDATE_VERSION}`
    );
  }
  const model = nonBlank(env.model, "model");
  const req = object(env.request, "request");
  const request: GenerationRequest = {
    mode: nonBlank(req.mode, "request.mode"),
    platform: nonBlank(req.platform, "request.platform"),
    input: nonBlank(req.input, "request.input"),
    brainActivationId: nonBlank(
      req.brainActivationId,
      "request.brainActivationId"
    ),
    promptBundleVersion: nonBlank(
      req.promptBundleVersion,
      "request.promptBundleVersion"
    ),
    // `null` OR a non-blank string, and nothing else — never `undefined`
    // coerced to `null`. This value decides both the stored lineage and the
    // PRICE, so a document that merely omits it is a document this build cannot
    // settle correctly, which is what the envelope version bump is for.
    parentGenerationId:
      req.parentGenerationId === null
        ? null
        : nonBlank(req.parentGenerationId, "request.parentGenerationId"),
    spinAutopsyId:
      req.spinAutopsyId === null
        ? null
        : nonBlank(req.spinAutopsyId, "request.spinAutopsyId"),
    spinAnalysisVersion:
      req.spinAnalysisVersion === null
        ? null
        : nonBlank(req.spinAnalysisVersion, "request.spinAnalysisVersion"),
    creative: creativeOf(req, unreadable),
    origin: originFromStored(req, unreadable),
  };
  const killTest = object(env.killTest, "killTest");
  const shared = {
    model,
    request,
    killTest,
    rewriteCount: rewriteCountOf(env.rewriteCount),
    frameworkVersions: frameworkVersionsOf(env.frameworkVersions, unreadable),
  };
  if (env.outcome === "usable") {
    // THROUGH THE MODE'S OWN PARSER, not a shape check written here. It is the
    // same function that refused this document's shape before it was stored,
    // so "what a usable output is" has exactly one definition — and it
    // re-checks the mode's required and permitted sections, which is what
    // stops a hookSet candidate settling as some other mode's document.
    let output: ScriptOutput;
    try {
      // THE STORED READER (R-148): it reads the version the output carries,
      // and an output with none is read as the legacy contract — never as v2.
      output = readStoredScriptOutput({ value: env.output, mode });
    } catch (e) {
      return unreadable(
        `its output is not a valid ${mode} document (${e instanceof Error ? e.message : "unparseable"})`
      );
    }
    // ...AND THE OUTPUT'S VERSION MUST BE THE ONE ITS REQUEST ASKED FOR. A
    // creative request with a legacy output would settle a draft that never
    // honoured the creator's form; a legacy request with a v2 output, a draft
    // held to a contract nobody asked for. Neither is a document this build
    // can settle truthfully.
    const wanted = request.creative;
    if (wanted === null && output.contractVersion !== undefined) {
      return unreadable("its output is version 2 and its request asked for no creative form");
    }
    if (
      wanted !== null &&
      (output.contractVersion !== 2 || output.requestedForm !== wanted.formChoice)
    ) {
      return unreadable("its output does not carry the form its request asked for");
    }
    return { ...shared, outcome: "usable", output, refusalReason: null };
  }
  if (env.outcome === "honest_refusal") {
    return {
      ...shared,
      outcome: "honest_refusal",
      output: null,
      // Non-blank, because `generations_refusal_states_reason` is an equality
      // over exactly this predicate: an honest refusal that states no reason is
      // a refusal a creator cannot inspect, which is R7's definition of a bug.
      refusalReason: nonBlank(env.refusalReason, "refusalReason"),
    };
  }
  return unreadable(
    `its outcome is ${String(env.outcome)}, which is neither a usable output nor a stated refusal`
  );
}

/**
 * The payload identity (R14): a sha256 over the request, as lowercase hex.
 *
 * BUILT FROM AN EXPLICIT ORDERED LIST, never `JSON.stringify(object)`: key
 * order in an object literal is a property of how the object was constructed,
 * and a refactor that reorders it would make every in-flight attempt's hash
 * change — which is a payload MISMATCH refusal for a request nobody edited.
 *
 * The separators are the same escapes `@respin/modes`' bundle hash uses, and
 * for the same measured reason: joining on an ordinary space makes
 * `{a: "b", c: "d"}` and `{a: "bc d"}` the same hash input.
 */
/**
 * The separators, written as ESCAPES rather than as the literal control bytes
 * an earlier draft of this file carried — `bundle.ts` records the same
 * correction one package over, and it is not a style point: an invisible byte
 * in source is a byte nobody reviews, and this one decides whether two
 * different requests can collide into one payload identity.
 */
const FIELD_SEP = "\u0000";
const RECORD_SEP = "\u0001";

export function hashRequest(request: GenerationRequest): string {
  const canonical = [
    "mode" + FIELD_SEP + request.mode,
    "platform" + FIELD_SEP + request.platform,
    "input" + FIELD_SEP + request.input,
    "brainActivationId" + FIELD_SEP + request.brainActivationId,
    "promptBundleVersion" + FIELD_SEP + request.promptBundleVersion,
    // SIX FIELDS, NOT FIVE (slice 7, R6). Without it, "revise output X with
    // this note" and a plain generation whose input happened to be the same
    // note hash identically — so a creator submitting the second under an
    // attempt id the first already used would be handed the first's stored
    // output as though it were theirs. `""` for an original is a real value
    // rather than an omission, because omitting a field shortens the canonical
    // string and is itself a collision surface.
    "parentGenerationId" + FIELD_SEP + (request.parentGenerationId ?? ""),
    "spinAutopsyId" + FIELD_SEP + (request.spinAutopsyId ?? ""),
    "spinAnalysisVersion" + FIELD_SEP + (request.spinAnalysisVersion ?? ""),
    // R-148: THE CREATIVE HALF, AS ONE RECORD, ALWAYS PRESENT — `""` for a
    // legacy request, the `parentGenerationId` rule: an omitted record would
    // shorten the canonical string, and an omission is a collision surface.
    // The value is a POSITIONAL JSON ARRAY with every field present, so there
    // is no key order to drift and no omitted constraint to shorten it, and
    // `JSON.stringify` escapes U+0000 and U+0001, so a creator's text can never
    // forge one of this function's separators inside the record. `""` is never
    // a JSON array, so a legacy request and a creative one cannot collide here.
    "creative" +
      FIELD_SEP +
      (request.creative === null ? "" : creativeCanonical(request.creative)),
    // L2: THE ORIGIN, as one positional JSON record — `""` for none, the
    // `creative` rule above. A piece's script and an ordinary press with the
    // same words are different requests.
    "origin" + FIELD_SEP + originCanonical(request.origin),
  ].join(RECORD_SEP);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function originCanonical(origin: GenerationOrigin): string {
  if (origin === null) return "";
  if (origin.kind === "find_concept") return JSON.stringify(["find_concept"]);
  return JSON.stringify([
    "piece",
    origin.pieceId,
    origin.sourceGenerationId,
    origin.sourceIdeaIndex,
  ]);
}

/**
 * THE CLIENT INTENT (launch L2, R-151): a sha256 over what the CALLER asked
 * for, in a fixed order with the hash's own separators — mode, platform, their
 * words, the revision target, the piece, the no-concept flag, the Spin
 * reference id and the CANONICAL creative request — and, since launch L3, the
 * explicit sequel request when it is `true`. Nothing read from the database is
 * in it (not the brain, not the bundle, not the config, not the history the
 * prompt will carry), so a same-id submission compares this and observes the
 * claim.
 */
export function intentHashOf(
  params: GenerateParams,
  creative: CreativeRequest | null
): string {
  const canonical = [
    "mode" + FIELD_SEP + params.mode,
    "platform" + FIELD_SEP + params.platform,
    "input" + FIELD_SEP + params.input,
    "revisionOfAttemptId" + FIELD_SEP + (params.revisionOfAttemptId ?? ""),
    "pieceId" + FIELD_SEP + (params.pieceId ?? ""),
    "findConcept" + FIELD_SEP + (params.findConcept === true ? "1" : ""),
    "spinAutopsyId" + FIELD_SEP + (params.spinAutopsyId ?? ""),
    "creative" + FIELD_SEP + (creative === null ? "" : creativeCanonical(creative)),
    // LAUNCH L3 (R-152): the explicit sequel request, APPENDED ONLY WHEN TRUE
    // so every intent a pre-L3 build hashed (none of which could ask for a
    // sequel) is byte-identical here, and a same-id resubmission across the
    // deploy still observes its claim. A sequel and a plain request are
    // different intents: the prompt differs.
    ...(params.sequel === true ? ["sequel" + FIELD_SEP + "1"] : []),
  ].join(RECORD_SEP);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

const sha256Hex = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

/**
 * The snapshot's shape version. 2 since the L2 code gate (T-2): version 1
 * stored `platform` as the caller's free text. 3 since launch L3 (R-152): the
 * snapshot also carries `sequel` and `recentContext` (the chosen history
 * records, their order, the exclusions and the budget — ids and numbers only).
 * A version-2 claim is still READ for its config version (`snapshotConfigVersionOf`):
 * its shape is a subset of 3's and it carries no history to check.
 */
const REQUEST_SNAPSHOT_VERSION = 3;
const READABLE_SNAPSHOT_VERSIONS: readonly number[] = [2, REQUEST_SNAPSHOT_VERSION];

/**
 * THE DURABLE VERSIONED REQUEST SNAPSHOT (launch L2, R-151) — identities and
 * versions only. The creator's words appear as HASHES (`inputSha256`,
 * `creativeSha256`, and `platformSha256` — the server accepts any non-blank
 * platform string, so it is caller text too), never as text: the claim row
 * outlives a refusal, and the text lives in `generations.request` once — and
 * only if — a generation settles. `configVersion` is the version the
 * settlement prices by.
 */
function requestSnapshotOf(args: {
  request: GenerationRequest;
  intentSha256: string;
  payloadSha256: string;
  configVersion: number;
  offered: readonly FrameworkRow[];
  sequel: boolean;
  recentContext: RecentContextSnapshot | null;
}): Record<string, unknown> {
  const { request } = args;
  return {
    // LAUNCH L3 (R-152): what the prompt carried as HISTORY — ids, closed
    // labels, versions, order, exclusions and the budget — or `null` for a
    // mode that reads none. The settlement re-checks these ids are still
    // present (`recentContextIdsOf`) and never rebuilds anything from them.
    sequel: args.sequel,
    recentContext: args.recentContext,
    v: REQUEST_SNAPSHOT_VERSION,
    intentSha256: args.intentSha256,
    payloadSha256: args.payloadSha256,
    mode: request.mode,
    platformSha256: sha256Hex(request.platform),
    inputSha256: sha256Hex(request.input),
    creativeSha256:
      request.creative === null ? null : sha256Hex(creativeCanonical(request.creative)),
    formChoice: request.creative?.formChoice ?? null,
    parentGenerationId: request.parentGenerationId,
    origin: request.origin,
    spinAutopsyId: request.spinAutopsyId,
    spinAnalysisVersion: request.spinAnalysisVersion,
    brainActivationId: request.brainActivationId,
    promptBundleVersion: request.promptBundleVersion,
    configVersion: args.configVersion,
    frameworkVersions: args.offered.map((f) => ({ id: f.id, version: f.version })),
  };
}

/**
 * The config version a claim's snapshot pins, FAIL-CLOSED: a claim with no
 * readable snapshot (a pre-L2 row, or bytes this build did not write) is
 * `recovery_required` rather than priced under a guess.
 */
function snapshotConfigVersionOf(claim: GenerationAttempt): number {
  const snap = claim.requestSnapshot as Record<string, unknown> | null;
  const version = snap?.configVersion;
  if (
    snap === null ||
    !READABLE_SNAPSHOT_VERSIONS.includes(snap.v as number) ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    throw new GenerationRecoveryRequiredError(
      claim.attemptId,
      "the claim carries no readable request snapshot"
    );
  }
  return version;
}

/**
 * The creative half's canonical form for the payload identity: a fixed-order
 * array of every field, absence written as `null` / `[]`.
 */
function creativeCanonical(creative: CreativeRequest): string {
  const c = creative.constraints;
  return JSON.stringify([
    creative.formChoice,
    c.people,
    c.maxMinutes,
    [...c.locations],
    [...c.equipment],
    c.footage,
  ]);
}

// ------------------------------------------------ the creative half (R-148)

/**
 * The validated creative request, or `null` — the operation's ONE boundary
 * for wire input (R-148, launch L1).
 *
 * BOTH REFUSALS ARE `CreativeRequestError`, both before any claim or provider
 * call: a creative request for a mode that does not take one (silently
 * dropping it would run a request the creator did not make), and whatever
 * `parseCreativeRequest` refuses — an unknown form, an unknown key, an
 * unbounded or malformed limit.
 */
function creativeRequestFor(
  mode: ModeId,
  raw: CreativeRequestInput | undefined
): CreativeRequest | null {
  if (raw === undefined) return null;
  if (!takesCreativeForm(mode)) {
    throw new CreativeRequestError("form_not_offered_for_mode");
  }
  return parseCreativeRequest(raw);
}

/**
 * WHICH CREATIVE CONTRACT A GENERATION RUNS UNDER, from the request and the
 * parent's STORED contract (R-148).
 *
 *   original            → what was asked for, or legacy
 *   revision of a v1    → legacy; an override is REFUSED (the parent's format
 *                         predates forms, and silently ignoring the override
 *                         would run a request the creator did not make)
 *   revision of a v2    → the override if one was sent; otherwise the
 *                         parent's own limits and its form — for a script made
 *                         under "Choose for me", the form it RESOLVED to, so a
 *                         revision keeps the parent's form rather than
 *                         re-rolling it; for a concept batch, "Choose for me"
 *                         again, because each concept resolved on its own.
 */
function effectiveCreative(
  requested: CreativeRequest | null,
  parent: ResolvedParent | null
): CreativeRequest | null {
  if (parent === null) return requested;
  if (parent.v2 === null) {
    if (requested !== null) {
      throw new CreativeRequestError("revision_keeps_legacy_format");
    }
    return null;
  }
  const inherited = parent.v2.creative;
  const inheritedForm =
    inherited.formChoice === "auto" && parent.v2.scriptForm !== null
      ? parent.v2.scriptForm
      : inherited.formChoice;
  if (requested !== null) {
    // L2 (R-151; the L1 card's deferral): AN OVERRIDE MAY CHANGE THE FILMING
    // LIMITS — "easier to film" is the same piece made better — but NOT THE
    // FORM. A different form is a different script, which is a new commission
    // at its mode's price (develop the concept again), never a swap at the
    // revision price. Refused before the price, the slot and the claim.
    if (requested.formChoice !== inheritedForm) {
      throw new CreativeRequestError("revision_keeps_form");
    }
    return requested;
  }
  return { formChoice: inheritedForm, constraints: inherited.constraints };
}

// ------------------------------------------- the creative piece (launch L2)

/**
 * The origin rules a request must satisfy before anything is read: a piece is
 * an `ideaToScript` commission and nothing else; "find my next concept" is an
 * `ideation` and nothing else. A refusal here costs nothing.
 */
function assertOriginShape(params: GenerateParams): void {
  // LAUNCH L3 (R-152 item c): a sequel is a request about RECENT WORK, which
  // only the concept and script modes read — on any other mode it would be
  // silently dropped, so it is refused. And it is a boolean or absent: a cast
  // cannot smuggle a truthy string into "the creator asked for a sequel".
  const sequel: unknown = params.sequel;
  if (sequel !== undefined && typeof sequel !== "boolean") {
    throw new GenerationAssemblyError("the sequel request is a yes or a no");
  }
  if (sequel === true && !takesCreativeForm(params.mode)) {
    throw new GenerationAssemblyError(
      "a sequel builds on recent concepts and scripts, which only the concept and script modes read"
    );
  }
  if (params.pieceId !== undefined) {
    if (
      params.mode !== "ideaToScript" ||
      params.revisionOfAttemptId !== undefined ||
      params.findConcept === true ||
      params.spinAutopsyId !== undefined
    ) {
      throw new CreativePieceError("not_commissionable");
    }
  }
  if (params.findConcept === true) {
    if (params.mode !== "ideation" || params.revisionOfAttemptId !== undefined) {
      throw new GenerationAssemblyError(
        "find-my-next-concept is an ideation with no revision target"
      );
    }
  }
}

/**
 * A piece, resolved for its commission (launch L2). Every value here comes from
 * the scoped piece read — the stored concept, re-parsed through the mode's own
 * stored reader; the creator's own stored idea; the quote's config version.
 */
type ResolvedPiece = {
  pieceId: string;
  sourceGenerationId: string | null;
  sourceIdeaIndex: number | null;
  quoteConfigVersion: number;
  /** The stored concept, rendered as labelled MODEL text — or null. */
  conceptText: string | null;
  /** The creator's own stored idea — or null. */
  ownIdea: string | null;
  /** What the source concept's own scan reported (it vouches for nothing). */
  reportedSpecifics: string[];
  /** A version-2 concept's form, limits, verified basis and marked passages. */
  v2: {
    creative: CreativeRequest;
    conceptForm: CreativeRequest["formChoice"];
    basisExcerpts: string[];
    unconfirmedPassages: string[];
  } | null;
};

async function resolvePiece(
  db: DbLike,
  caps: Caps,
  params: GenerateParams
): Promise<ResolvedPiece> {
  const read: CreativePieceRead | undefined = await db.transaction((tx) =>
    caps.readCreativePiece(params.pieceId as string, tx)
  );
  if (!read) throw new CreativePieceError("not_found");
  const { piece, source } = read;
  if (piece.state === "cancelled") {
    throw new CreativePieceError("not_commissionable");
  }
  // THE OPERATION ID IS THE ONE THE CONFIRMATION DISPLAYED — server-minted,
  // current. A same-id submission that already has a claim never gets here
  // (step 4), so this refuses only a NEW operation under an id the piece no
  // longer offers: a stale tab after "New generation", or an invented id.
  if (piece.operationAttemptId !== params.attemptId) {
    throw new CreativePieceError("stale");
  }
  if (piece.sourceGenerationId === null) {
    return {
      pieceId: piece.id,
      sourceGenerationId: null,
      sourceIdeaIndex: null,
      quoteConfigVersion: piece.quoteConfigVersion,
      conceptText: null,
      ownIdea: piece.ownIdea,
      reportedSpecifics: [],
      v2: null,
    };
  }
  // THE SOURCE WAS DELETED (or is not this profile's — the read is scoped):
  // its FK cascade normally takes the piece with it; refused either way.
  if (source === null) throw new CreativePieceError("not_found");
  const index = piece.sourceIdeaIndex as number;
  const concept = storedConceptOf(source, index);
  return {
    pieceId: piece.id,
    sourceGenerationId: piece.sourceGenerationId,
    sourceIdeaIndex: index,
    quoteConfigVersion: piece.quoteConfigVersion,
    conceptText: concept.text,
    ownIdea: null,
    reportedSpecifics: concept.reportedSpecifics,
    v2: concept.v2,
  };
}

/**
 * ONE CONCEPT OUT OF A STORED IDEATION OUTPUT, validated against the
 * authoritative, versioned parsed output (launch L2) — the same stored reader
 * the settlement and the revision path use. A source that is not a usable
 * ideation batch, an output this build cannot read, or an index that is not
 * one of its concepts is `source_unusable`. Exported for the selection path.
 */
export function storedConceptOf(
  source: Generation,
  index: number
): {
  text: string;
  hook: string;
  thesis: string;
  framework: string;
  formLabelId: CreativeRequest["formChoice"] | null;
  premise: { whatHappens: string; interest: string; payoff: string } | null;
  reportedSpecifics: string[];
  v2: ResolvedPiece["v2"];
} {
  if (source.mode !== "ideation" || source.outcome !== "usable" || source.output === null) {
    throw new CreativePieceError("source_unusable");
  }
  let output: ScriptOutput;
  try {
    output = readStoredScriptOutput({ value: source.output, mode: "ideation" });
  } catch {
    throw new CreativePieceError("source_unusable");
  }
  const ideas = output.ideas ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= ideas.length) {
    throw new CreativePieceError("source_unusable");
  }
  let reportedSpecifics: string[];
  try {
    reportedSpecifics = reportedSpecificsOf(source.killTest);
  } catch {
    throw new CreativePieceError("source_unusable");
  }
  if (output.contractVersion === 2) {
    const idea = output.ideas![index];
    let creative: CreativeRequest;
    try {
      creative = parseCreativeRequest(
        (source.request as Record<string, unknown> | null)?.creative
      );
    } catch {
      throw new CreativePieceError("source_unusable");
    }
    const premise = idea.premise;
    return {
      text: renderConcept({
        hook: idea.hook,
        thesis: idea.thesis,
        framework: idea.framework,
        premise,
      }),
      hook: idea.hook,
      thesis: idea.thesis,
      framework: idea.framework,
      formLabelId: idea.form,
      premise: {
        whatHappens: premise.whatHappens,
        interest: premise.interest,
        payoff: premise.payoff,
      },
      reportedSpecifics,
      v2: {
        creative,
        conceptForm: idea.form,
        basisExcerpts: premise.basis.kind === "material" ? [premise.basis.excerpt] : [],
        unconfirmedPassages: [premise.whatHappens, premise.interest, premise.payoff].filter(
          (text) => text.includes(CHECK)
        ),
      },
    };
  }
  const idea = ideas[index];
  return {
    text: renderConcept({ hook: idea.hook, thesis: idea.thesis, framework: idea.framework, premise: null }),
    hook: idea.hook,
    thesis: idea.thesis,
    framework: idea.framework,
    formLabelId: null,
    premise: null,
    reportedSpecifics,
    v2: null,
  };
}

/** A concept as plain labelled text — the creator MATERIAL, never a prompt. */
function renderConcept(c: {
  hook: string;
  thesis: string;
  framework: string;
  premise: { whatHappens: string; interest: string; payoff: string } | null;
}): string {
  return [
    `Hook: ${c.hook}`,
    `Thesis: ${c.thesis}`,
    `Structure: ${c.framework}`,
    ...(c.premise === null
      ? []
      : [
          `What happens: ${c.premise.whatHappens}`,
          `Why it is interesting: ${c.premise.interest}`,
          `The payoff: ${c.premise.payoff}`,
        ]),
  ].join("\n");
}

/**
 * The creative half a piece's script runs under (launch L2; L1's "developing a
 * stored concept defaults to its stored resolved form, with an explicit user
 * override treated as part of the new commission"): the creator's explicit
 * request if they sent one, else a version-2 concept's own resolved form and
 * the limits it was generated under, else the legacy contract.
 */
function pieceCreative(
  requested: CreativeRequest | null,
  piece: ResolvedPiece
): CreativeRequest | null {
  if (requested !== null) return requested;
  if (piece.v2 === null) return null;
  return { formChoice: piece.v2.conceptForm, constraints: piece.v2.creative.constraints };
}

/** The product scaffold for "find my next concept" — no creator material. */
export const FIND_CONCEPT_INPUT =
  "The creator has no concept yet. Propose exactly three different concepts they could film next, drawn only from what their brain says about them, the platform and any filming limits. Do not invent anything about their life, their past or their results.";

/** What a concept piece's script is developed from: the note, then the concept. */
export function conceptInput(note: string, conceptText: string): string {
  return [
    "Develop this concept, which was proposed earlier, into a full script. What the creator added:",
    note,
    "",
    "The concept — keep its premise:",
    conceptText,
  ].join("\n");
}

/**
 * WHAT THE MODEL IS GIVEN AS MATERIAL, and which part is the creator's OWN
 * words (`creatorNote` — the only text a basis may quote, and it must occur
 * inside `input`). Product scaffold and model-authored text (a parent draft, a
 * stored concept) are material, never the creator's words.
 */
function materialFor(
  params: GenerateParams,
  parent: ResolvedParent | null,
  piece: ResolvedPiece | null
): {
  input: string;
  creatorNote: string;
  reportedSpecifics: string[];
  carriedBasis: string[];
  carriedUnconfirmed: string[];
} {
  if (parent !== null) {
    return {
      input: revisionInput(params.input, parent.draft),
      creatorNote: params.input,
      reportedSpecifics: parent.reportedSpecifics,
      carriedBasis: parent.v2?.basisExcerpts ?? [],
      carriedUnconfirmed: parent.v2?.unconfirmedPassages ?? [],
    };
  }
  if (piece !== null && piece.conceptText !== null) {
    return {
      input: conceptInput(params.input, piece.conceptText),
      creatorNote: params.input,
      reportedSpecifics: piece.reportedSpecifics,
      carriedBasis: piece.v2?.basisExcerpts ?? [],
      carriedUnconfirmed: piece.v2?.unconfirmedPassages ?? [],
    };
  }
  if (piece !== null) {
    // THE CREATOR'S OWN IDEA, preserved verbatim, then their note: all theirs.
    const own = [piece.ownIdea as string, params.input]
      .filter((text) => /\S/.test(text))
      .join("\n\n");
    return { input: own, creatorNote: own, reportedSpecifics: [], carriedBasis: [], carriedUnconfirmed: [] };
  }
  if (params.findConcept === true) {
    return {
      input: /\S/.test(params.input)
        ? `${FIND_CONCEPT_INPUT}\n\nWhat the creator said:\n${params.input}`
        : FIND_CONCEPT_INPUT,
      creatorNote: params.input,
      reportedSpecifics: [],
      carriedBasis: [],
      carriedUnconfirmed: [],
    };
  }
  return {
    input: params.input,
    creatorNote: params.input,
    reportedSpecifics: [],
    carriedBasis: [],
    carriedUnconfirmed: [],
  };
}

/**
 * The drafts this operation already carries AS MATERIAL (launch L3): a
 * revision's parent and a piece's source batch. They are excluded from the
 * history block — sending them twice would weight them twice — and recorded in
 * the snapshot as `already_material`.
 */
function materialIdsOf(
  parent: ResolvedParent | null,
  piece: ResolvedPiece | null
): string[] {
  return [parent?.id, piece?.sourceGenerationId].filter(
    (id): id is string => typeof id === "string"
  );
}

/** Recorded when a piece or no-concept request carries no words of the creator's. */
export const PIECE_REQUEST_MARKER = "(develop the chosen concept)";
export const FIND_CONCEPT_REQUEST_MARKER = "(find my next concept)";

/**
 * `generations.request.input` — the creator's own words for this request. A
 * piece of the creator's own idea records that idea (and note); a concept piece
 * or a no-concept request with no note records a fixed marker, never a copy of
 * the stored concept or of product scaffold.
 */
function requestInputOf(params: GenerateParams, piece: ResolvedPiece | null): string {
  if (piece !== null && piece.ownIdea !== null) {
    return [piece.ownIdea, params.input].filter((text) => /\S/.test(text)).join("\n\n");
  }
  if (/\S/.test(params.input)) return params.input;
  if (piece !== null) return PIECE_REQUEST_MARKER;
  if (params.findConcept === true) return FIND_CONCEPT_REQUEST_MARKER;
  return params.input;
}

function originOf(params: GenerateParams, piece: ResolvedPiece | null): GenerationOrigin {
  if (piece !== null) {
    return {
      kind: "piece",
      pieceId: piece.pieceId,
      sourceGenerationId: piece.sourceGenerationId,
      sourceIdeaIndex: piece.sourceIdeaIndex,
    };
  }
  if (params.findConcept === true) return { kind: "find_concept" };
  return null;
}

/** A stored request's origin, read FAIL-CLOSED (envelope 6 always states it). */
function originFromStored(
  req: Record<string, unknown>,
  unreadable: (what: string) => never
): GenerationOrigin {
  if (!Object.prototype.hasOwnProperty.call(req, "origin")) {
    return unreadable("request.origin is missing, and a version-6 request always states it");
  }
  const raw = req.origin;
  if (raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return unreadable("request.origin is not an object");
  }
  const o = raw as Record<string, unknown>;
  if (o.kind === "find_concept") return { kind: "find_concept" };
  if (o.kind !== "piece" || typeof o.pieceId !== "string" || o.pieceId.trim() === "") {
    return unreadable("request.origin is not an origin this build writes");
  }
  const sourceGenerationId = o.sourceGenerationId;
  const sourceIdeaIndex = o.sourceIdeaIndex;
  const bothNull = sourceGenerationId === null && sourceIdeaIndex === null;
  const bothSet =
    typeof sourceGenerationId === "string" &&
    typeof sourceIdeaIndex === "number" &&
    Number.isInteger(sourceIdeaIndex);
  if (!bothNull && !bothSet) {
    return unreadable("request.origin's source is not a pair");
  }
  return {
    kind: "piece",
    pieceId: o.pieceId,
    sourceGenerationId: sourceGenerationId as string | null,
    sourceIdeaIndex: sourceIdeaIndex as number | null,
  };
}

/**
 * The fewest letter-bearing words a hint must carry to count as the creator
 * saying what their videos are about (R-151 item 8, amended 2026-10-04 after
 * the L2 code gate: `"x"` and `"."` passed the old any-non-blank rule).
 */
export const CONCEPT_HINT_MIN_WORDS = 3;

/**
 * The Strategy claim positions that say WHAT the creator makes and for whom.
 * A LIST, by pointer: `goals`, `ambitions` and the metric are claims too, but
 * "grow to 10k" says nothing about what the videos are, so they do not count.
 */
const CONCEPT_CONTEXT_POINTERS: readonly RegExp[] = [
  /^\/audience$/,
  /^\/positioning$/,
  /^\/pillars\/\d+$/,
];

/**
 * IS THERE ENOUGH APPROVED CONTEXT TO SUGGEST CONCEPTS? (launch L2) — a pure,
 * deterministic rule, never a model call: the ACTIVATED Strategy document must
 * confirm its audience, its positioning or a pillar (a filled position, not a
 * `[check]`), or the creator's hint must carry at least
 * `CONCEPT_HINT_MIN_WORDS` words that contain a letter. `strategy` is that
 * document's content, or `null` when the activation names none.
 */
export function conceptContextSufficient(
  strategy: unknown,
  hint: string
): boolean {
  return strategyNamesWhatTheyMake(strategy) || hintWordCount(hint) >= CONCEPT_HINT_MIN_WORDS;
}

function strategyNamesWhatTheyMake(content: unknown): boolean {
  if (content === null || content === undefined) return false;
  for (const pointer of enumerateClaimFields("strategy", content)) {
    if (!CONCEPT_CONTEXT_POINTERS.some((p) => p.test(pointer))) continue;
    const value = readPointer(content, pointer);
    if (typeof value === "string" && value !== CHECK && /\S/.test(value)) return true;
  }
  return false;
}

function hintWordCount(hint: string): number {
  return hint.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
}

/**
 * A stored request's creative half, read FAIL-CLOSED (R-148).
 *
 * THE KEY IS REQUIRED: every version-4 writer states it, `null` or a request,
 * so a missing key is a document this build did not write. A present value goes
 * back through `parseCreativeRequest` — the same parse that admitted it — so a
 * stored request cannot carry a form this build would refuse at the door.
 */
function creativeOf(
  req: Record<string, unknown>,
  unreadable: (what: string) => never
): CreativeRequest | null {
  if (!Object.prototype.hasOwnProperty.call(req, "creative")) {
    return unreadable("request.creative is missing, and a version-4 request always states it");
  }
  if (req.creative === null) return null;
  try {
    return parseCreativeRequest(req.creative);
  } catch {
    return unreadable("request.creative is not a creative request this build accepts");
  }
}

/**
 * Flatten one active brain document into the sentences it asserts.
 *
 * THE CLAIM ENUMERATOR IS THE POPULATION, not the content's own keys: it is the
 * same function the activation gate walks, so a field the creator was never
 * asked to confirm cannot reach a prompt through here. `[check]` positions are
 * dropped — a position the creator has not filled in is not a claim, and
 * sending the placeholder to a model asks it to write in a voice described as
 * "unknown".
 *
 * The pointer is kept in the sentence (`register: warm and direct`) because a
 * bare value tells the model nothing about which question it answers.
 */
/**
 * The document ids one coherent activation names (R9a), nulls dropped.
 *
 * A LIST OF THE FOUR COLUMNS rather than the three `brainSentences` happens to
 * read: the population is "what the snapshot records", so slice 9 making
 * `performance_meta` writable costs nothing here, and a kind this pipeline does
 * not consume is filtered by `brainSentences`/`creatorRulesOf` rather than by
 * being invisible to the read that proves provenance.
 */
function snapshotDocIds(activation: BrainActivationSnapshot): string[] {
  return [
    activation.voiceDocId,
    activation.strategyDocId,
    activation.killtestDocId,
    activation.performanceMetaDocId,
  ].filter((id): id is string => typeof id === "string");
}

function brainSentences(docs: readonly BrainDoc[], kind: BrainKind): string[] {
  const doc = docs.find((d) => d.kind === kind);
  return doc ? brainSentencesOf(kind, doc.content) : [];
}

/**
 * One document's confirmed claims as prompt sentences. EXPORTED for the public
 * Sample Spin (Phase 10a C2), whose fictional brain is content without a
 * `brain_docs` row: the same flatten, so the demo's prompt is built from
 * exactly what a creator's would be.
 */
export function brainSentencesOf(kind: BrainKind, content: unknown): string[] {
  const out: string[] = [];
  for (const pointer of enumerateClaimFields(kind, content)) {
    const value = readPointer(content, pointer);
    if (typeof value !== "string" || value === CHECK) continue;
    out.push(`${pointer.slice(1).replace(/\//g, " ")}: ${value}`);
  }
  return out;
}

/**
 * The creator's own kill criteria, as the scoring call's rules (R5).
 *
 * ONLY `killtest.rules`, and only claim positions: the product's four hard
 * rules are deterministic code in `@respin/modes` and are never sent to a
 * model, because a hard integrity rule decided by a model is a rule that can be
 * talked out of firing. `bannedWords`/`bannedVibes` are deliberately not here —
 * they are a different check with a different shape, and slice 7 owns it.
 *
 * The rule id is its RFC-6901 pointer, which is stable within one document and
 * is what the reply cites back.
 */
function creatorRulesOf(docs: readonly BrainDoc[]): CreatorRule[] {
  const doc = docs.find((d) => d.kind === "killtest");
  return doc ? creatorRulesOfContent(doc.content) : [];
}

/** The scoring rules of one Kill Test document's content; see `brainSentencesOf`. */
export function creatorRulesOfContent(content: unknown): CreatorRule[] {
  const rules: CreatorRule[] = [];
  for (const pointer of enumerateClaimFields("killtest", content)) {
    if (!pointer.startsWith("/rules/")) continue;
    const value = readPointer(content, pointer);
    if (typeof value !== "string") continue;
    rules.push({ id: pointer, text: value });
  }
  return rules;
}

// ------------------------------------------------- the price key (R8/R13)

/**
 * The `creditCosts` key a REVISION is priced from (slice 7, R8).
 *
 * SEEDED AT 2 SINCE M1 WITH NO READER, exactly as `hookSet` was before slice
 * 6. It is deliberately NOT in `@respin/modes`' `CreditCostKey` union: a
 * revision is not a mode, and putting it there would have made
 * `Record<ModeId, ModeSpec>` able to price a mode as a revision.
 */
export const REVISION_CREDIT_COST_KEY = "revision" as const;

/**
 * What this generation is priced as (R8/R13).
 *
 * THE ONE PLACE THE REVISION PRICE IS DECIDED, and it is a function of two
 * values rather than a branch at a call site: a revision costs
 * `creditCosts.revision`, everything else costs its MODE's key. Mutation M3
 * ("revision priced at the parent mode's cost") is a one-line edit here and
 * reddens `generation-pricing.test.ts`'s table and `generate.test.ts`'s
 * behavioural debit case together.
 *
 * `modeSpec` REFUSES A STRING THAT IS NOT A MODE, so there is no path through
 * this function that returns a key nobody chose — and it is resolved
 * UNCONDITIONALLY rather than only on the non-revision branch. The ternary
 * version short-circuited: `generationOp("seriesPlanner", true)` priced a
 * revision of a mode that does not exist, because the revision key does not
 * need the spec. Unreachable today (`generate` calls `modeSpec` before this and
 * `settle` prices a mode that call already validated), and closed anyway, for
 * the reason the file's other fail-closed reads give: a price is the one thing
 * that must not be answerable for an input nobody checked.
 */
export function generationOp(
  mode: ModeId,
  isRevision: boolean
): PricedOperation {
  const spec = modeSpec(mode);
  return {
    purpose: GENERATION_PURPOSE,
    creditCostKey: isRevision ? REVISION_CREDIT_COST_KEY : spec.creditCostKey,
  };
}

// ------------------------------------------------------ the revision (R6-R8)

/**
 * The parent an attempt id names, or a typed refusal (slice 7, R6).
 *
 * THE READ IS `readGenerationForAttempt`, WHICH IS ALREADY SCOPED. It is a
 * capability on `writeCapabilities(scope)` and its predicate carries both scope
 * columns, so a foreign, deleted or simply wrong attempt id comes back
 * `undefined` — indistinguishable from each other, which is the enumeration
 * rule `ProfileAccessError` states and the reason all three collapse into one
 * refusal code here. Nothing in this function trusts an id.
 *
 * IT RETURNS THE ROW'S OWN `id`, and that is the point of taking an ATTEMPT id
 * in the first place: the value that reaches `generations.parent_id` is one
 * this server read out of a scoped query, not one a caller supplied.
 *
 * THE DRAFT IS RE-PARSED THROUGH THE MODE'S OWN PARSER before it is rendered,
 * for `readCandidate`'s reason one table over: the stored output crossed a
 * `jsonb` round trip and may have been written by an earlier build, and the
 * alternative to checking it is a cast that puts an unvalidated document into
 * the next generation's prompt.
 *
 * IT ALSO RETURNS WHAT THE PARENT'S OWN GATE REPORTED, and that is the half
 * the spin-compliance gate added. The parent's draft becomes traceability
 * corpus for the revision (see the context block in `generate`), and "this
 * document was gated" is NOT "this document was vouched for": a `plain-number`
 * or a `proper-noun` is reported as a FLAG, and every shape inside a
 * `FLAG_ONLY_FIELD_PREFIXES` section is reported as a flag whatever its shape
 * — so a `$4,000` in a stored parent's `/disclosure/guidance` had never been
 * traced to anything and still vouched for a `$4,000` in the revision's hook.
 * Measured on this build before the fix. Those tokens travel with the draft.
 */
/**
 * What a revision's parent read returns.
 *
 * `v2` IS NULL FOR A LEGACY PARENT, and that null decides the revision's
 * contract (`effectiveCreative`): it comes from the parent's STORED output
 * version, never from anything the caller sent.
 */
type ResolvedParent = {
  id: string;
  draft: string;
  /**
   * The creative piece the parent was commissioned for (its stored
   * `request.origin.pieceId`), or `null` — launch L3's "current piece" for a
   * revision, which is only a RANKING input to the scoped history read.
   */
  pieceId: string | null;
  reportedSpecifics: string[];
  v2: {
    /** The parent's own creative request, as stored and re-parsed. */
    creative: CreativeRequest;
    /** A script parent's resolved form, or `null` for a concept batch. */
    scriptForm: CreativeRequest["formChoice"] | null;
    /** Basis excerpts the parent's own gate verified (`material` only). */
    basisExcerpts: string[];
    /** The parent's premise and beat passages it marked `[check]`. */
    unconfirmedPassages: string[];
  } | null;
};

async function resolveRevisionParent(
  db: DbLike,
  caps: Caps,
  mode: ModeId,
  parentAttemptId: string
): Promise<ResolvedParent> {
  const row = await db.transaction((tx) =>
    caps.readGenerationForAttempt(parentAttemptId, tx)
  );
  if (!row) throw new RevisionParentError("not_this_creators");
  // A REVISION KEEPS ITS PARENT'S MODE. Checked before the outcome, and
  // checked at all because every mode has a different output contract — see
  // `REVISION_PARENT_REFUSALS.different_mode` for the decision and its revisit
  // trigger. Nothing leaks: reaching this line already proved ownership.
  if (row.mode !== mode) throw new RevisionParentError("different_mode");
  // AN HONEST REFUSAL HAS NO DRAFT TO REVISE, and pricing one as a revision
  // would be a discount on generating from scratch — see `not_revisable`.
  if (row.outcome !== "usable" || row.output === null) {
    throw new RevisionParentError("not_revisable");
  }
  let output: ScriptOutput;
  try {
    // THE STORED READER (R-148): a legacy parent is read as legacy and a v2
    // parent as v2, by the version the stored output carries.
    output = readStoredScriptOutput({ value: row.output, mode });
  } catch {
    throw new RevisionParentError("parent_unreadable");
  }
  const origin = (row.request as { origin?: { pieceId?: unknown } | null } | null)?.origin;
  return {
    id: row.id,
    draft: renderDraft(output),
    pieceId: typeof origin?.pieceId === "string" ? origin.pieceId : null,
    reportedSpecifics: reportedSpecificsOf(row.killTest),
    v2: output.contractVersion === 2 ? parentV2Of(output, row.request) : null,
  };
}

/**
 * A v2 parent's creative half, FAIL-CLOSED: its stored request must state the
 * creative request the output was stamped with, or the parent is unreadable —
 * a revision must never inherit a form and limits nobody can show were the
 * parent's.
 */
function parentV2Of(
  output: Extract<ScriptOutput, { contractVersion: 2 }>,
  request: unknown
): NonNullable<ResolvedParent["v2"]> {
  const stored =
    typeof request === "object" && request !== null && !Array.isArray(request)
      ? (request as Record<string, unknown>).creative
      : undefined;
  let creative: CreativeRequest;
  try {
    creative = parseCreativeRequest(stored);
  } catch {
    throw new RevisionParentError("parent_unreadable");
  }
  if (creative.formChoice !== output.requestedForm) {
    throw new RevisionParentError("parent_unreadable");
  }
  const premises = [
    ...(output.premise ? [output.premise] : []),
    ...(output.ideas ?? []).map((idea) => idea.premise),
  ];
  // THE PARENT'S OWN UNCONFIRMED PASSAGES: every premise line and beat it
  // marked `[check]`. Filming fields are not here — the server's decisions
  // about them are `serverChecks`, and say nothing about whether an event
  // happened.
  const passages = [
    ...premises.flatMap((p) => [p.whatHappens, p.interest, p.payoff]),
    ...(output.beats ?? []).map((b) => b.vo),
  ];
  return {
    creative,
    scriptForm: output.form ?? null,
    basisExcerpts: premises.flatMap((p) =>
      p.basis.kind === "material" ? [p.basis.excerpt] : []
    ),
    unconfirmedPassages: passages.filter((text) => text.includes(CHECK)),
  };
}

/**
 * THE SPECIFICS THE PARENT'S OWN SCAN REPORTED, out of its stored `kill_test`.
 *
 * FAIL-CLOSED, AND THE REFUSAL IS `parent_unreadable` — the same answer this
 * function's neighbour gives for an output that no longer parses, for the same
 * reason its docblock states: `kill_test` is `jsonb`, it was written by
 * whatever build settled it, and the alternative to checking it is a silent
 * `[]`. A silent `[]` here is not a smaller answer, it is the WRONG one: it
 * says "the parent's scan reported nothing", which is precisely the sentence
 * that lets a never-traced specific vouch for the revision.
 *
 * `finalAttempt` AND NOT `firstAttempt`, because `generations.output` is the
 * FINAL draft. The first attempt's findings are about a document that was
 * rewritten and never stored, and carrying them would deny the revision
 * specifics that the accepted draft was actually traced on.
 *
 * AN EMPTY `traceability` ARRAY IS A REAL ANSWER and is not confused with an
 * unreadable one: a clean draft reports nothing. What is refused is a document
 * with no `finalAttempt`, a `traceability` that is not an array, or an entry
 * with no string `token` — three shapes this product never writes.
 */
export function reportedSpecificsOf(killTest: unknown): string[] {
  const root = killTest as Record<string, unknown> | null | undefined;
  const final =
    root && typeof root === "object"
      ? (root.finalAttempt as Record<string, unknown> | undefined)
      : undefined;
  if (!final || typeof final !== "object") {
    throw new RevisionParentError("parent_unreadable");
  }
  const findings = final.traceability;
  if (!Array.isArray(findings)) {
    throw new RevisionParentError("parent_unreadable");
  }
  return findings.map((f) => {
    const token = (f as { token?: unknown } | null)?.token;
    if (typeof token !== "string" || token.length === 0) {
      throw new RevisionParentError("parent_unreadable");
    }
    return token;
  });
}

/**
 * Which of the parent's reported specifics the creator's OWN material does not
 * already carry (slice 7 gate).
 *
 * THE FILTER IS WHAT MAKES THE SUBTRACTION SAFE, and it is the whole reason
 * this lives here rather than inside `@respin/modes`. `buildCorpusIndex`
 * removes `unvouched` tokens from the index GLOBALLY — it holds one string for
 * `input` and cannot tell the creator's note from the parent draft glued to
 * it. So a token the creator typed themselves must never reach that list: the
 * revision would flag a specific its own author supplied, which costs a
 * rewrite and possibly a refusal they were debited for — the exact direction
 * R-68 corrected one slice earlier.
 *
 * BOTH SIDES GO THROUGH `buildCorpusIndex`, the creator's material and the
 * token itself, so there is NO second tokeniser and NO second normaliser here:
 * `$1,200` and `1200` are one specific because `@respin/modes` says they are,
 * not because this file agrees with it today.
 *
 * IT IS DELIBERATELY THE LENIENT SIDE OF `traceable`, and the asymmetry is
 * stated rather than discovered. `traceable` requires EVERY word of a
 * multi-word name and never decomposes a number; this asks whether ANY
 * normalised form of the token appears in the creator's own material. The two
 * differ only by keeping a token that `traceable` would have called
 * untraceable — which leaves the parent draft vouching for it, exactly as it
 * did before this function existed. The error direction is therefore "no new
 * refusal", never "a new silent acceptance of something the parent's gate
 * reported".
 */
export function unvouchedSpecifics(
  creatorMaterial: { brain: readonly string[]; input: readonly string[] },
  reported: readonly string[]
): string[] {
  const own = buildCorpusIndex(creatorMaterial);
  const out: string[] = [];
  for (const token of reported) {
    const forms = buildCorpusIndex({ brain: [], input: [token] });
    let carried = false;
    for (const form of forms) if (own.has(form)) carried = true;
    if (!carried) out.push(token);
  }
  return out;
}

/**
 * What a revision is generated FROM: the creator's note, then the draft.
 *
 * THE NOTE COMES FIRST, deliberately — it is the instruction, and a model that
 * reads the draft first tends to continue it rather than change it. Both are
 * plain labelled text rather than a second prompt template, because prompt
 * assembly belongs to `@respin/modes` and this package must not grow a private
 * one: what is built here is the creator MATERIAL, and
 * `assembleGenerationPrompt` is still the only thing that turns material into
 * a prompt.
 */
export function revisionInput(note: string, parentDraft: string): string {
  return [
    "This is a revision of a draft you produced earlier. What the creator asked to change:",
    note,
    "",
    "The draft being revised — rewrite it to answer the note above, and keep everything the note does not ask you to change:",
    parentDraft,
  ].join("\n");
}

// ------------------------------------------------------- frameworks (R5/R9a)

/** `generations.framework_versions`' element shape. */
type FrameworkVersion = { id: string; version: number };

/**
 * One eligible row, as the two strings `@respin/modes` puts in a prompt.
 *
 * THE SATURATION NOTICE RIDES ON THE SUMMARY (R5b / REQ-D02). A saturated
 * framework "warns and demands a fresh interpretation", and a warning each
 * consumer has to remember to add is a warning one of them will omit — so it is
 * part of the value rather than part of a screen. The string is
 * `@respin/db`'s `SATURATION_NOTICE`, not a second wording.
 *
 * `beats` IS `jsonb`, therefore `unknown`, therefore GUARDED rather than cast:
 * a row whose beats are not strings contributes no beats instead of putting
 * `[object Object]` in a prompt.
 *
 * THE EVIDENCE RUNG RIDES ALONG TOO, and it did not until round 2 of the
 * billing gate (2026-09-01). `confidence` is DERIVED from how many evidence
 * entries a framework carries (`deriveFrameworkConfidence`, and a CHECK
 * constraint), it is on the screen with what it counts beside it
 * (`frameworks-view.tsx`), and it was dropped here — so a framework at
 * `unsupported` ("a shape somebody wrote down, and nothing more") reached the
 * model IDENTICALLY to one at `contrasted`, and the model then wrote
 * `whyThisPerforms.reasoning` and a weakest point about it. That is the
 * non-negotiable-6 question ("every output names its weakest point") answered
 * without the one fact that most often IS the weakest point.
 *
 * THE WORD ONLY, NEVER THE LADDER. What the rung means is stated ONCE, in
 * `@respin/modes`' `FRAMEWORK_EVIDENCE_NOTE`, above the list — not repeated per
 * row, and not restated as a count here, which would be a second copy of a
 * ladder `@respin/db` owns and a CHECK constraint enforces.
 *
 * IT COSTS BUDGET AND THE BUDGET SEES IT: `frameworksForContext` measures
 * `promptFramework`'s own output, so the extra characters are rationed by
 * `config.generation.frameworkContextCharBudget` like every other character
 * rather than being spent behind its back. Measured in
 * `generation-frameworks.test.ts`.
 */
export function promptFramework(row: FrameworkRow): Framework {
  const beats = Array.isArray(row.beats)
    ? row.beats.filter((b): b is string => typeof b === "string")
    : [];
  return {
    name: row.name,
    summary: [
      beats.length > 0 ? "Beats: " + beats.join(" -> ") : "",
      row.whyItConverts,
      // Every legacy saturation tag lacks a measured market population/window.
      // The trend monitor has not produced a framework-level measurement yet,
      // so no row may enter a prompt without the limitation.
      SATURATION_NOTICE,
      // LAST, so it reads as a label on the row rather than as part of the
      // claim, and unconditional: "no rung stated" would be indistinguishable
      // from a rung nobody wrote down, which is exactly what `unsupported`
      // means and exactly the confusion this is closing.
      FRAMEWORK_EVIDENCE_LABEL + row.confidence,
    ]
      .filter((part) => part.length > 0)
      .join(" "),
  };
}

/**
 * HOW MUCH OF ONE GENERATION'S PROMPT THE FRAMEWORK LIBRARY MAY OCCUPY (R17).
 *
 * IT IS CONFIG NOW, NOT A CONSTANT (billing gate, 2026-09-01), and this
 * paragraph is what used to argue the other way. The constant's own docblock
 * called itself "a safety ceiling on one call's size, closer to
 * `llm.maxOutputTokens` (which IS config) than to a price" and named the
 * handoff it could not make from that stage. `llm.maxOutputTokens` bounds the
 * REPLY; this bounds the PROMPT, on every generation that offers frameworks,
 * and input is billed per token on every call an attempt makes — so it is a
 * REQ-G05 margin input held where an operator cannot move it without a deploy.
 * `config.generation.frameworkContextCharBudget` is the dial; its number, its
 * `.default(...)` and its absence from `requiredConfigPaths` are all argued in
 * `packages/config/src/schema.ts` beside the value.
 *
 * WHAT REMAINS HERE is the SHAPE of the offer, which is not a dial: whole rows
 * only, curated before private, and a dropped row recorded rather than
 * silent.
 */

/** One eligible library, split by what fits the budget. */
export type FrameworkOffer = {
  /** Offered to the model, in offer order. */
  kept: FrameworkRow[];
  /** Eligible, and NOT offered — the rows the budget could not take. */
  dropped: FrameworkRow[];
};

/**
 * The frameworks that FIT (R17) — whole rows only, never truncated.
 *
 * TRUNCATION IS THE OBVIOUS FIX AND IT IS THE WRONG ONE. A framework is a
 * sequence of beats plus why they work; half of that is not a smaller
 * framework, it is a corrupted one, and a model handed three and a half beats
 * will invent the fourth. So a row either arrives whole or does not arrive.
 *
 * `continue`, NOT `break`, so one oversized row does not hide every row after
 * it — the pathological private framework a creator can write under
 * `FRAMEWORK_TEXT_MAX` would otherwise silently cost them the entire curated
 * library.
 *
 * THE OFFER ORDER IS CURATED FIRST, AND THAT REPLACED "the accessor's order,
 * which is alphabetical and arbitrary" (billing gate, 2026-09-01). The old
 * paragraph here said the drop order "is arbitrary and it is SAID rather than
 * dressed up". Alphabetical is not neutral once you know what the library is
 * called: ALL NINE seeded frameworks are named "The …", so every one of their
 * slugs begins `the-`, and `eligibleFrameworks()` ORDERED BY `slug ASC` alone.
 * A private framework named with an earlier letter therefore sorted AHEAD of
 * the entire curated library. Measured on this build, with private rows the
 * same average size as the curated ones (559 characters — no pathological row
 * needed):
 *
 *   private=20  curated lost 0
 *   private=25  curated lost 0
 *   private=30  curated lost 4
 *   private=40  curated lost 8
 *   private=50  curated lost 8   (PRIVATE_FRAMEWORK_COUNT_MAX)
 *
 * A creator on the tier that lets them write frameworks silently loses the
 * product's own library — the thing they pay for — and pays full price for the
 * generation that lost it. Sorting the OFFER puts that decision here rather
 * than in an ORDER BY chosen for pagination: a private row can no longer evict
 * a curated one at any count, whatever order the accessor returns.
 *
 * WHAT THE ACCESSOR DOES NOW, because the sentence above stopped being the
 * whole story in the same gate round (R-76, and `packages/db` owns that half).
 * `eligibleFrameworks()` orders SHARED ROWS FIRST and only then
 * `slug ASC, version DESC`, and the leading key is a raw `CASE` expression
 * rather than `asc(visibility)` — the pgEnum happens to declare `shared`
 * before `private`, so ordering by the column would be correct today and would
 * invert silently the day somebody re-orders the enum for an unrelated reason.
 *
 * THE TWO SORTS ARE NOT REDUNDANT, WHICH IS WHY BOTH STAYED. The accessor's is
 * what makes the READ deterministic in the right direction; this one is what
 * makes the property hold for any caller and any future accessor, including a
 * paginated or differently-ordered one. `generation-frameworks.test.ts` drives
 * them apart on purpose: the eviction case feeds this function the slug-only
 * order the accessor NO LONGER returns, because a fixture already sorted
 * curated-first would pass against a `frameworksForContext` that did no
 * sorting at all.
 *
 * WITHIN each group the accessor's order is PRESERVED (`sort` is stable in
 * every engine this runs on, and it is asserted rather than assumed), so the
 * same profile still gets the same offer twice.
 *
 * A DROPPED FRAMEWORK IS SIMPLY NOT OFFERED, with the consequences that follow
 * for free: the model never sees it, `framework_eligibility` refuses the output
 * if it names one anyway, and `frameworkVersionsUsed` is computed over the
 * KEPT list, so no provenance is recorded for a row the generation never had.
 * What is NOT free is that nobody knew it happened — see
 * `emitFrameworkOfferDroppedMetric` at the call site.
 */
export function frameworksForContext(
  rows: readonly FrameworkRow[],
  charBudget: number
): FrameworkOffer {
  // CURATED FIRST. `visibility` is the row's own column and the same value
  // `eligibleFrameworks()`' `or` branches on, so this cannot disagree with
  // which arm a row arrived through.
  const inOfferOrder = [...rows].sort((a, b) => {
    const shared = (r: FrameworkRow) => (r.visibility === "shared" ? 0 : 1);
    return shared(a) - shared(b);
  });
  const kept: FrameworkRow[] = [];
  const dropped: FrameworkRow[] = [];
  let used = 0;
  for (const row of inOfferOrder) {
    const framework = promptFramework(row);
    const size = framework.name.length + framework.summary.length;
    if (used + size > charBudget) {
      dropped.push(row);
      continue;
    }
    used += size;
    kept.push(row);
  }
  return { kept, dropped };
}

/**
 * Two framework names compared the way `@respin/modes` compares them.
 *
 * IT SHARES THE TOKENISER RATHER THAN RE-IMPLEMENTING IT — `words` is
 * `@respin/modes`' own export and is what `flatten` there is built on — so the
 * two can only disagree about composition, never about what a word is.
 * `generation-frameworks.test.ts` drives that agreement against
 * `scanModeChecks` itself rather than asserting it: a name the eligibility
 * check ACCEPTS must be a name this resolver FINDS, or the row records no
 * provenance for a framework the output was allowed to name.
 */
function flattenFrameworkName(name: string): string {
  return words(name)
    .map((w) => w.toLowerCase())
    .join(" ");
}

/**
 * Which offered frameworks the output actually NAMED (R9a).
 *
 * THE SAME TWO POSITIONS `framework_eligibility` reads — the document's own
 * `/framework/name` and each idea's `/ideas/N/framework` — and the same
 * either-direction containment, because a model decorates ("The Cost Reveal
 * framework" is the offered "cost reveal").
 *
 * ITS FAILURE DIRECTION IS UNDER-RECORDING, and that is deliberate: a name this
 * resolver cannot match records no provenance, whereas a looser match would
 * record a framework the generation did not use. For a mode carrying the
 * eligibility check the two cannot come apart on a SETTLED usable output —
 * a name outside the offered set is a hard-rule finding, so it never settles.
 */
export function frameworkVersionsUsed(
  output: ScriptOutput | null,
  offered: readonly FrameworkRow[]
): FrameworkVersion[] {
  if (!output) return [];
  // A v2 `custom` STRUCTURE IS NEVER PROVENANCE FOR A LIBRARY ROW (R-148 point
  // 5). It is held not to CARRY an approved name, but an approved name can
  // still CONTAIN it ("loop" inside "open loop"), and the either-direction
  // containment below would then record a framework the output explicitly said
  // it did not use. Only `offered` (and every legacy) name is resolved.
  const names: string[] =
    output.contractVersion === 2
      ? [
          ...(output.framework && output.framework.provenance === "offered"
            ? [output.framework.name]
            : []),
          ...(output.ideas ?? [])
            .filter((idea) => idea.frameworkProvenance === "offered")
            .map((idea) => idea.framework),
        ]
      : [
          ...(output.framework ? [output.framework.name] : []),
          ...(output.ideas ?? []).map((idea) => idea.framework),
        ];
  const named = names.map(flattenFrameworkName);
  if (named.length === 0) return [];
  const used = new Map<string, FrameworkVersion>();
  for (const row of offered) {
    const flat = flattenFrameworkName(row.name);
    if (flat.length === 0) continue;
    if (named.some((n) => n.includes(flat) || flat.includes(n))) {
      used.set(row.id, { id: row.id, version: row.version });
    }
  }
  return [...used.values()];
}

/**
 * Read the stored `frameworkVersions` back, FAIL-CLOSED.
 *
 * The same contract as every other field of the envelope: it is written to
 * `jsonb`, it crossed a process boundary, and the alternative to checking it is
 * a cast that puts an unchecked array into a NOT NULL provenance column. An
 * empty array is a real answer ("no framework was named"); a missing or
 * mis-shaped one is not.
 */
function frameworkVersionsOf(
  value: unknown,
  unreadable: (what: string) => never
): FrameworkVersion[] {
  if (!Array.isArray(value)) unreadable("frameworkVersions is not an array");
  return (value as unknown[]).map((entry, i) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      unreadable("frameworkVersions[" + i + "] is not an object");
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.trim() === "") {
      unreadable("frameworkVersions[" + i + "].id is not a non-blank string");
    }
    if (typeof record.version !== "number" || !Number.isInteger(record.version)) {
      unreadable("frameworkVersions[" + i + "].version is not an integer");
    }
    return { id: record.id as string, version: record.version as number };
  });
}
