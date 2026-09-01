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
//   4.   PAUSE                          — before the call, because a zero-cost
//        mode never reaches `debitCredits` and so is never refused by the
//        pause gate inside it.
//   5.   TIER + MODE + CONFIG + PRICE   — the plan gate (R18) and then a fail
//        closed on the STORED document and on a missing price row, before a
//        vendor is contacted.
//   6.   UNCHARGED CAP, then BALANCE (+ auto-top-up) — before tokens are
//        spent, never after (R15/R16).
//   6b.  THE RUN SLOT                   — after every refusal above, so an
//        attempt refused on its way out does not burn one.
//   6c.  THE BRAIN AND THE ASSEMBLY     — reads and pure functions only. They
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
//        STORED, in the same transaction that stamps `vendor_complete`. This
//        is the step that makes a crash survivable rather than merely honest:
//        before it existed, a failure between the vendor answering and the
//        settlement committing meant we had paid, the creator got nothing, and
//        the output we already held was thrown away.
//   8.   THE SETTLEMENT (R14b)          — one workspace-locked transaction:
//        re-derive tier, price and balance, take THE debit, write the
//        generation and move the claim to `settled`, all or nothing. It
//        settles FROM THE STORED CANDIDATE, on the fresh path as well as on a
//        retry, so there is exactly one answer to "what did this generation
//        say" and both paths read it from the same bytes.
import { createHash } from "node:crypto";

import {
  GenerationAttemptStateError,
  mintProfileScope,
  readPointer,
  enumerateClaimFields,
  hasOpenPause,
  writeCapabilities,
  type BrainActivationSnapshot,
  type BrainDoc,
  type BrainKind,
  type CreditLedgerRow,
  type DbLike,
  type Generation,
  type GenerationAttempt,
  type ProfileScope,
  type RunSlots,
  type WorkspaceScope,
} from "@respin/db";
import {
  getActiveConfigRequiringStored,
  type RespinConfigV1,
} from "@respin/config";
import {
  CHECK,
  LlmError,
  LlmTruncatedError,
  priceFor,
  type AssembledPrompt,
  type InferenceOutcome,
  type LlmProvider,
} from "@respin/llm";
import {
  modeSpec,
  parseKillTestReply,
  parseScriptOutput,
  promptBundleVersion,
  runGeneration,
  type CreatorRule,
  type GenerationContext,
  type HonestRefusal,
  type GenerationRun,
  type ModeId,
  type ScriptOutput,
} from "@respin/modes";

import { deriveBalance, deriveBalanceInTx } from "./balance";
import { debitCredits } from "./ledger";
import { getDbNow, takeWorkspaceLock } from "./clock";
import {
  BrainNotActivatedError,
  GenerationAlreadyRefusedError,
  GenerationInFlightError,
  GenerationPayloadMismatchError,
  GenerationRecoveryRequiredError,
  GenerationUnchargedAttemptCapError,
  InsufficientCreditsError,
  PostCallDebitError,
  WorkspacePausedError,
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
import { emitUnchargedAttemptCapMetric } from "./metrics";
import { assertModeAllowed, type EntitlementTier } from "./mode-access";
import { getWorkspaceBillingState } from "./state";
import { maybeAutoTopup } from "./stripe/auto-topup";

/**
 * The universal laws every generation runs under (tech-spec §3 step 1, layer
 * one of the three-layer IP).
 *
 * A CONSTANT HERE AND NOT CONFIG, deliberately: they are the product's own
 * position, not an operator dial, and moving one is a code change with a test
 * — the `POST_CONTENT_MAX` argument, which holds for a thing that costs no
 * money and refuses nothing. They are not in the prompt bundle's hash by
 * accident either: `bundle.ts` hashes only the CREATOR-INDEPENDENT strings
 * `@respin/modes` owns, and these are supplied by this file, so a change here
 * does NOT move `prompt_bundle_version`. That limit is stated rather than
 * hidden; the honest fix (hashing the supplied laws too) belongs with slice 7,
 * where the laws stop being three placeholder sentences.
 */
export const UNIVERSAL_LAWS: readonly string[] = [
  "A hook earns the next second or nothing after it matters.",
  "Specifics beat adjectives: a thing a viewer can picture beats a word that describes it.",
  "One idea per piece. A second idea is a second piece.",
];

/** What a creator asks for. Every field is theirs; nothing here is derived. */
export type GenerateParams = {
  mode: ModeId;
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
   *   - a RETRY that settled a stored candidate → `false`, `run` NULL, charged
   *   - a re-submission of a settled attempt, or a settlement that lost the
   *     workspace lock to a concurrent one → `true`, `run` null, charged 0
   */
  replayed: boolean;
  /** The stored row. The single source of truth for what the creator gets. */
  generation: Generation;
  /**
   * The pipeline's own result, present only when THIS CALL produced it.
   *
   * NULL ON A REPLAY *AND* ON A RETRY THAT SETTLED A STORED CANDIDATE (R14c),
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
  /** The config version that priced the debit and stamped the generation. */
  configVersion: number;
  /** The tier resolved INSIDE the settlement lock (R14b). */
  resolvedTier: EntitlementTier;
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

  // 4. THE PAUSE GATE, HERE RATHER THAN ONLY IN `debitCredits` (R8/REQ-G08).
  //    `creditCosts` is versioned config an operator may set to 0 for a mode,
  //    and `debitCredits` refuses a zero cost outright — so a zero-priced mode
  //    never reaches the debit's own pause gate and a paused workspace would
  //    burn our tokens on precisely the generation that costs the creator
  //    nothing.
  if (await hasOpenPause(db, scope.workspaceId)) {
    throw new WorkspacePausedError();
  }

  // 5. TIER, MODE, CONFIG AND PRICE — all before the vendor is contacted.
  const billing = await getWorkspaceBillingState(db, scope.workspaceId, at);
  // THE MODE IS A REAL MODE FIRST. `modeSpec` throws `UnknownModeError` for a
  // string that is not one of the seven, and it runs BEFORE the plan gate
  // deliberately: telling someone their plan does not include `fullScrpit` is
  // a false statement about their plan, and the honest answer to a typo is
  // that the mode does not exist.
  const spec = modeSpec(params.mode);
  // R18. Then the plan gate, then the built gate: a Free creator asking for
  // `ideaToScript` is told their plan does not include it; a creator on any
  // tier asking for a mode slice 7 has not shipped is told we have not built
  // it — opposite statements about whose fault it is.
  assertModeAllowed(billing.tier, params.mode);
  const op: PricedOperation = {
    purpose: GENERATION_PURPOSE,
    // The mode's OWN credit-cost key (R13). `creditCosts.hookSet` has been
    // seeded since M1 with no reader; this is its first one.
    creditCostKey: spec.creditCostKey,
  };
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

  // 6. THE UNCHARGED-ATTEMPT CAP, THEN THE BALANCE — both before the vendor.
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

  // R15 / REQ-G03. A zero balance is refused BEFORE the vendor call, with the
  // top-up prompt.
  //
  // A STATED RESIDUAL, because it is a consequence of keeping this gate where
  // `runInference` put it: a RE-SUBMISSION of an already-settled attempt id
  // still passes through here, so a creator who has since spent their balance
  // is told they are out of credits instead of being handed the generation
  // they already paid for. Nothing is charged and nothing is lost either way.
  //
  // R14c GIVES IT A SECOND CASE, and this one is a delay rather than a loss: a
  // retry of a `vendor_complete` attempt is refused here too, so its stored
  // candidate waits until the workspace can pay for it instead of settling
  // now. That is the right way round — the debit is what settlement takes, and
  // taking it from a balance that cannot cover it is the thing R14b refuses
  // one step later anyway — and the candidate survives the wait, which before
  // this column existed it did not.
  // Moving the claim lookup above this gate would fix the message and would
  // cost the property the ordering exists for — a balance refusal would then
  // leave a `claimed` row nothing will ever advance, which is the same trap
  // the run slot is taken before the claim to avoid. The narrow fix belongs
  // with stage D, which mints a fresh attempt id per press and can pass the
  // stored generation id for a re-read instead.
  const preCallCost = priceOf(content, op);
  if (preCallCost > 0) {
    const view = await deriveBalance(db, scope.workspaceId);
    if (view.balance < preCallCost) {
      const shortfall = preCallCost - view.balance;
      // EVERY TOP-UP OUTCOME IS CAUGHT, RETURNED OR THROWN (R10): this call
      // reaches Stripe, and an exception escaping here would surface as an
      // opaque 500 on the one path whose entire job is to explain a refusal.
      let triggered = false;
      try {
        const result = await maybeAutoTopup(db, scope.workspaceId, shortfall, at);
        triggered = result.triggered;
      } catch {
        triggered = false;
      }
      // REFUSED REGARDLESS. A triggered top-up does not license proceeding.
      throw triggered
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

  const caps = writeCapabilities(scope);

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
    const context: GenerationContext = {
      universalLaws: UNIVERSAL_LAWS,
      // NO FRAMEWORKS YET, and `[]` is a real answer rather than a placeholder:
      // R-29 defers seeding the shared framework library to a later milestone
      // with its own evidence rules, and `generations.framework_versions`
      // defaults to `[]` for exactly this reason ("no framework was used").
      frameworks: [],
      brain: {
        voice: brainSentences(activeDocs, "voice"),
        strategy: brainSentences(activeDocs, "strategy"),
        killtest: brainSentences(activeDocs, "killtest"),
      },
      input: params.input,
      platform: params.platform,
    };
    // THE CREATOR'S OWN CRITERIA, and only those, go to the scoring model (R5).
    // The four hard rules are deterministic code inside `@respin/modes` and are
    // never asked about here.
    const creatorRules = creatorRulesOf(activeDocs);
    const bundleVersion = promptBundleVersion(params.mode);
    // `assembleGenerationPrompt` refuses an empty input, a missing platform and
    // an empty brain — all BEFORE the claim, so none of them leaves a row.
    // Calling it here as well as inside the pipeline is deliberate: the payload
    // hash must be taken over a request we already know is assemblable.
    const request = {
      mode: params.mode,
      platform: params.platform,
      input: params.input,
      brainActivationId: activation.id,
      promptBundleVersion: bundleVersion,
    };
    const payloadSha256 = hashRequest(request);

    // 6d. THE DURABLE CLAIM, COMMITTED BEFORE ANY OUTBOUND HTTP (R14).
    const claim = await db.transaction((tx) =>
      caps.claimGenerationAttempt(
        {
          attemptId: params.attemptId,
          purpose: GENERATION_PURPOSE,
          mode: params.mode,
          payloadSha256,
        },
        tx
      )
    );
    // SAME ATTEMPT ID + DIFFERENT PAYLOAD REFUSES (R14). Checked before the
    // state switch below, because serving the stored answer to a DIFFERENT
    // request would be worse than refusing: the creator would read an output
    // for something they did not ask for.
    if (claim.attempt.payloadSha256 !== payloadSha256) {
      throw new GenerationPayloadMismatchError(params.attemptId);
    }
    if (!claim.created) {
      return await observeExistingClaim(
        { db, caps, scope, params, op, at },
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

    let run: GenerationRun;
    try {
      run = await runGeneration({
        mode: params.mode,
        context,
        creatorRules,
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
            // WHETHER THE REPLY PARSED IS DECIDED AT THE CALL, and that is what
            // makes R16's bound real. `model_usage` is append-only, so the row
            // written here can never be corrected later — and the question the
            // bound asks ("did this cost us money and the creator nothing?") is
            // answered by exactly this: a reply we could not parse is the
            // slice card's `schema_invalid` row, billable and not debited.
            // The parse runs twice (here and inside the pipeline) and that is
            // deliberate: it is the SAME pure function, so the two cannot
            // disagree, and the alternative is a flag written before its own
            // fact is known.
            parses: (text) => {
              try {
                parseScriptOutput({ text, mode: params.mode });
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
    // loses nothing. The attempt sits at `vendor_complete` holding the whole
    // settlement input, and a retry finishes it without calling the vendor
    // again. That is the difference this checkpoint buys and the reason the
    // candidate is written here rather than at settlement time.
    let checkpointed: GenerationAttempt;
    try {
      checkpointed = await db.transaction((tx) =>
        caps.advanceGenerationAttempt(
          {
            attemptId: params.attemptId,
            to: "vendor_complete",
            candidate: candidateEnvelope(
              candidateOf(run, model, request)
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
    return await settle({
      db,
      caps,
      scope,
      params,
      op,
      at,
      candidate: readCandidate(params.mode, checkpointed),
      run,
    });
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
  op: PricedOperation;
  at: Date;
};

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
  /** Whether the reply is one this product can use. Pure; see the call site. */
  parses: (text: string) => boolean;
}): Promise<string> {
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
    const deadline = AbortSignal.timeout(args.content.llm.overallDeadlineMs);
    const result = await withDeadline(
      args.provider.complete({
        attemptId: args.params.attemptId,
        model: args.model,
        system: args.prompt.system,
        prompt: args.prompt.prompt,
        maxOutputTokens: args.content.llm.maxOutputTokens,
        signal: deadline,
      }),
      deadline
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
    try {
      await recordUsage(args.scope, {
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
    } catch (bookkeeping) {
      // NOT SWALLOWED — carried on `cause`, so the edge that logs this can see
      // that a spend record is MISSING. Losing `e` would turn a named, true
      // refusal into "Something went wrong" on a path where money may already
      // be gone.
      if (e instanceof Error && e.cause === undefined) e.cause = bookkeeping;
    }
    throw e;
  }

  const usable = args.parses(text);
  await recordUsage(args.scope, {
    ...shared,
    model: servedModel,
    tokensIn,
    tokensOut,
    usageRaw,
    // `schema_invalid` IS THE HONEST OUTCOME for a reply we could not parse:
    // the vendor produced and charged for text, and nothing usable came back.
    // It is BILLABLE (`USAGE_OUTCOME_BILLABLE`) and, below, not consumed — the
    // exact pair R16's bound counts.
    outcome: usable ? "succeeded" : "schema_invalid",
    consumedIncludedBuild: usable,
  });
  return text;
}

/**
 * THE SETTLEMENT TRANSACTION (R14b), from the STORED candidate (R14c).
 *
 * ONE transaction, under the workspace lock, containing the debit AND the
 * generation AND the claim's transition. If any of them fails, none of them
 * commits — there is no state in which a usable generation exists unpaid, and
 * none in which a debit names a generation that was never stored.
 *
 * THE PRICE IS DECIDED AGAIN HERE, from the config read INSIDE the lock, and
 * that is not ceremony: `config_versions` is append-only and the ACTIVE version
 * moves, so a generation that began under version N can settle under N+1, and
 * `DebitParams.configVersion` exists precisely so a customer dispute can be
 * reconciled against the document that set the number.
 *
 * IT IS CALLED FROM TWO PLACES AND IS ONE FUNCTION, which is the point: the
 * fresh path calls it having just written the candidate, and a retry of a
 * `vendor_complete` attempt calls it having just read one an earlier call
 * wrote. NEITHER CAN CALL A VENDOR FROM HERE — there is no provider in scope —
 * so "the retry settles without another vendor call" is a property of what
 * this function can reach, not of a branch remembering not to.
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
  let outcome: SettlementOutcome;
  try {
    outcome = await db.transaction(async (tx) => {
      await takeWorkspaceLock(tx, scope.workspaceId);
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
      const claim = await caps.readGenerationAttempt(params.attemptId, tx);
      if (!claim || claim.state !== "vendor_complete") {
        return { moved: claim };
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
      // RE-READ INSIDE THE LOCK, and it can legitimately be a LATER version
      // than the one the `model_usage` rows were stamped with:
      // `config_versions` is append-only and the ACTIVE version moves, so a
      // generation that began under N can settle under N+1. Both stamps are
      // honest about their own moment — the usage rows say what was active
      // when we called the vendor, and the debit says what priced it — and
      // `DebitParams.configVersion` exists precisely so the charge can be
      // reconciled against the document that set the number.
      const { version: configVersion, content } =
        await getActiveConfigRequiringStored(
          tx,
          // NO CLASSIFICATION ROLE HERE, deliberately: this transaction calls
          // no vendor. The scoring call is already made and already metered, so
          // a missing price row for it can no longer prevent a spend — it could
          // only strand a generation the creator has already paid for. See
          // `ModelsInUse.classification`.
          //
          // WHAT THAT DOES *NOT* CLOSE, stated because the sentence that used
          // to sit here — "what this read still fails closed on is the price
          // that decides the DEBIT" — read as though it did (billing gate
          // round 2, 2026-09-01). The price that decides the debit is
          // `creditCosts.<op.creditCostKey>` and it IS on the list. But
          // `requiredConfigPaths`' `shared` block also puts
          // `llm.prices.<candidate.model>` on it, and that row is a VENDOR
          // COST: nothing in this transaction reads it, `priceOf` does not
          // consult it, and it decides no debit. So an operator who removes
          // the generation model's price row between the pre-call read and
          // this one still strands a generation we have already paid a vendor
          // for — the exact failure the classification carve-out was written
          // against, one model over. It is PRE-EXISTING and it is left open
          // here rather than narrowed in a copy-fix pass: narrowing `shared`
          // widens the set of stored documents every settlement accepts, on
          // the money path, and that is a change that deserves its own tests
          // rather than a ride-along. `generation-pricing.test.ts` asserts the
          // residual explicitly so it is a witnessed fact and not a surprise.
          requiredConfigPaths({ generation: candidate.model }, args.op)
        );
      const cost = priceOf(content, args.op);
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
          frameworkVersions: [],
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
        },
        tx
      );
      const view = await deriveBalanceInTx(tx, scope.workspaceId);
      return {
        settled: {
          generation,
          creditsChargedNow: cost,
          balanceAfter: view.balance,
          configVersion,
          resolvedTier: billing.tier,
        },
      };
    });
  } catch (e) {
    // A REFUSAL AND A FAILURE ARE DIFFERENT ROWS.
    //
    // A refusal is a decision this product made with the facts in hand — the
    // balance could not cover the charge, or the workspace was paused between
    // the pre-call gate and here. The attempt records it, no generation
    // exists, no output is exposed, and the creator gets the typed refusal.
    //
    // AND THE REFUSAL CLEARS THE CANDIDATE, because
    // `advanceGenerationAttempt` nulls it on every non-settled terminal: a
    // creator who was charged nothing must not leave a copy of the words they
    // never received sitting in an operational table.
    if (e instanceof PostCallDebitError || e instanceof WorkspacePausedError) {
      await recordRefusal(db, caps, params.attemptId, refusalCodeFor(e));
      throw e;
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
    ...outcome.settled,
  };
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
        configVersion: number;
        resolvedTier: EntitlementTier;
      };
    }
  | { moved: GenerationAttempt | undefined };

/**
 * Record a terminal refusal on the claim, without letting the bookkeeping
 * replace the refusal the creator needs to read.
 *
 * ITS OWN TRANSACTION, because the settlement's has already rolled back by the
 * time this runs. Failures are carried, never thrown: this function is only
 * ever called on a path that is already throwing something more informative.
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
  } catch (e) {
    // A claim that has already moved on (a concurrent terminal write) is not
    // an error worth replacing the real one with.
    if (e instanceof GenerationAttemptStateError) return;
    throw e;
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

/** Which closed code a thrown failure records on the claim (R14b). */
function refusalCodeFor(e: unknown): GenerationRefusalCode {
  if (e instanceof WorkspacePausedError) return GENERATION_REFUSAL_CODES.paused;
  if (e instanceof PostCallDebitError) {
    return GENERATION_REFUSAL_CODES.post_call_debit;
  }
  if (e instanceof LlmError) return GENERATION_REFUSAL_CODES.vendor_failed;
  if (e instanceof Error && e.name === "KillTestError") {
    return GENERATION_REFUSAL_CODES.kill_test_failed;
  }
  // EVERYTHING ELSE IS A PARSE FAILURE, and that is the honest default rather
  // than a lazy one: the only other thing that can throw between the claim and
  // the settlement is `parseScriptOutput` (R3's fail-closed contract) or
  // `parseKillTestReply`, both of which mean "the reply was not usable".
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
const CANDIDATE_VERSION = 1;

/** The settlement input, derived from the pipeline's result. Pure. */
function candidateOf(
  run: GenerationRun,
  model: string,
  request: GenerationRequest
): StoredCandidate {
  const shared = {
    model,
    request,
    killTest: run.killTest,
    // `drafts` is 1 or 2 by its own type, so this is 0 or 1 by construction —
    // the bound `generations_one_rewrite` also holds, from the other side.
    rewriteCount: (run.drafts - 1) as 0 | 1,
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
  };
  const killTest = object(env.killTest, "killTest");
  const shared = {
    model,
    request,
    killTest,
    rewriteCount: rewriteCountOf(env.rewriteCount),
  };
  if (env.outcome === "usable") {
    // THROUGH THE MODE'S OWN PARSER, not a shape check written here. It is the
    // same function that refused this document's shape before it was stored,
    // so "what a usable output is" has exactly one definition — and it
    // re-checks the mode's required and permitted sections, which is what
    // stops a hookSet candidate settling as some other mode's document.
    try {
      const output = parseScriptOutput({
        text: JSON.stringify(env.output),
        mode,
      });
      return { ...shared, outcome: "usable", output, refusalReason: null };
    } catch (e) {
      unreadable(
        `its output is not a valid ${mode} document (${e instanceof Error ? e.message : "unparseable"})`
      );
    }
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
  ].join(RECORD_SEP);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
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
  if (!doc) return [];
  const out: string[] = [];
  for (const pointer of enumerateClaimFields(kind, doc.content)) {
    const value = readPointer(doc.content, pointer);
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
  if (!doc) return [];
  const rules: CreatorRule[] = [];
  for (const pointer of enumerateClaimFields("killtest", doc.content)) {
    if (!pointer.startsWith("/rules/")) continue;
    const value = readPointer(doc.content, pointer);
    if (typeof value !== "string") continue;
    rules.push({ id: pointer, text: value });
  }
  return rules;
}
