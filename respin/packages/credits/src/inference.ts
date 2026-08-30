// ONE METERED MODEL CALL (slice 2a). The order below IS the requirement.
//
// WHY THIS IS IN `packages/credits` AND NOT IN `packages/db`, which is where
// the phase plan's file table expected it:
//
//   `runInference` needs the resolved TIER (`state.ts`, this package), the
//   active CONFIG (`@respin/config`) and the credit LEDGER (this package).
//   `@respin/db` depends on none of them and cannot be made to — `@respin/credits`
//   already depends on `@respin/db`, so the edge only runs one way. This is the
//   identical layering that moved `createProfile` here in slice 1, and the
//   reason is recorded there in full (`profiles.ts`, R-30 constraint 2 / R-35
//   §1). `@respin/db` keeps what it owns: the `model_usage` INSERT and the
//   scoped reads, both as capabilities denied to `app/**`.
//
// THE ORDER, and what each step is here to prevent:
//
//   1-3. Cage, role, archived profile   — nothing happens for a caller who may
//        not do this, and "may not" is re-read at operation time.
//   4.   PAUSE                          — before the call, because a
//        zero-credit operation never reaches `debitCredits` and so is never
//        refused by the pause gate inside it.
//   5.   CONFIG + PRICE                 — fail closed on the STORED document
//        and on a missing price row, before a vendor is contacted.
//   6.   BALANCE (+ auto-top-up)        — before tokens are spent, never after.
//   7.   THE VENDOR CALL                — outside every transaction.
//   8.   `model_usage`, OWN TRANSACTION — committed alone, so nothing that
//        happens next can roll away the record of money already spent.
//   9.   THE DEBIT                      — after, keyed on the attempt, at most
//        once, enforced by a partial unique index rather than by this file.
import {
  hasOpenPause,
  mintProfileScope,
  writeCapabilities,
  type DbLike,
  type ModelUsageRow,
  type ProfileScope,
  type RunSlotRefusal,
  type RunSlots,
  type WorkspaceScope,
} from "@respin/db";
import {
  getActiveConfigRequiringStored,
  type RespinConfigV1,
} from "@respin/config";
import {
  LlmError,
  LlmTruncatedError,
  LlmUnavailableError,
  ModelPriceUnknownError,
  costMicroUsd,
  priceFor,
  type InferenceOutcome,
  type LlmProvider,
} from "@respin/llm";
import { deriveBalance, deriveBalanceInTx } from "./balance";
import { debitCredits } from "./ledger";
import { getWorkspaceBillingState, type BillingState } from "./state";
import { getDbNow, takeWorkspaceLock } from "./clock";
import {
  InsufficientCreditsError,
  UnchargedAttemptCapError,
  PostCallDebitError,
  WorkspacePausedError,
} from "./errors";
import { maybeAutoTopup } from "./stripe/auto-topup";

/**
 * The one purpose slice 2a runs. A named constant rather than a free string,
 * because it is the grain `countBillableAttempts` prices against: a typo at one
 * of the two call sites would silently hand every creator an unlimited supply
 * of included builds.
 */
export const ONBOARDING_BRAIN_PURPOSE = "onboarding_brain";

// `PROMPT_BUNDLE_VERSION` LIVED HERE AND IS GONE (billing gate round 2,
// 2026-08-29). It named slice 2a's connectivity ping, whose action R-46
// retired, and it was the DEFAULT for a NOT NULL spend-attribution column — so
// every slice-3 voice inference booked its spend against a bundle it did not
// run. With `promptBundleVersion` required on `RunInferenceParams`, the
// constant's only remaining function would have been to silently mis-attribute
// the next operation that forgot to pass one, which is the defect it caused.
// Each operation now names its own bundle (`VOICE_PROMPT_BUNDLE_VERSION`), and
// a new one that forgets is a compile error.

/** A viewer may read a workspace; causing it to spend money is not a read. */
export class InferenceRoleError extends Error {
  constructor(public readonly role: string) {
    super(
      `A ${role} cannot run a model call for this creator. Running one spends the workspace's credits, which is not a read (REQ-A02).`
    );
    this.name = "InferenceRoleError";
  }
}

/** R17. The state is read at operation time, never carried on the scope. */
export class ProfileArchivedError extends Error {
  constructor() {
    super(
      "This creator profile is archived, so nothing new is generated for it. Its brain and its posts are untouched — reactivate the profile first."
    );
    this.name = "ProfileArchivedError";
  }
}

/**
 * The pre-call balance check refused, and an auto-top-up was set in motion.
 *
 * R10, and the point of it is the sentence this does NOT say. A triggered
 * top-up is an off-session PaymentIntent: it can decline, its webhook can lag,
 * and the monthly cap can bite. So the top-up NEVER licenses proceeding with
 * this attempt, and the copy promises that money is moving — not that the next
 * attempt will succeed.
 */
export class TopupInFlightError extends Error {
  constructor(
    public readonly balance: number,
    public readonly cost: number
  ) {
    super(
      `Not enough credits for this yet: balance ${balance}, this costs ${cost}. A top-up has been started, and credits land when your bank settles it. Nothing was spent and no model was called. Try again once your balance updates; if it does not, buy a pack from Billing.`
    );
    this.name = "TopupInFlightError";
  }
}

/**
 * The workspace is already running as many model calls as its tier allows, or
 * the process is at its own ceiling (tech-spec §6; production BLOCK 4).
 *
 * REFUSED BEFORE THE VENDOR IS CONTACTED, so the two things this says are both
 * true: nothing was spent, and the included build is intact. That is the whole
 * point of taking the slot ahead of the call rather than rate-limiting the
 * response.
 *
 * The two reasons are kept apart because they are different sentences. A
 * creator at `workspace_limit` has runs of their own to wait for; a creator at
 * `server_capacity` has none, and telling them they have too many would be a
 * false statement about their own account.
 */
export class RunSlotBusyError extends Error {
  constructor(
    public readonly reason: RunSlotRefusal,
    public readonly limit: number,
    public readonly tier: string
  ) {
    super(
      reason === "workspace_limit"
        ? `This workspace already has ${limit} model ${limit === 1 ? "call" : "calls"} running, which is the most its plan allows at once. Nothing was spent and no model was called. Wait for one to finish and try again.`
        : "We are running as many model calls as this server allows right now. Nothing was spent and no model was called. Try again in a moment."
    );
    this.name = "RunSlotBusyError";
  }
}

export type RunInferenceParams = {
  /**
   * MINTED BY THE CALLER, so a bounded retry inside the adapter shares it (R5)
   * and so the `model_usage` row and the `credit_ledger` debit name the same
   * attempt — REQ-G05 joins spend to revenue on exactly this value.
   */
  attemptId: string;
  system: string;
  prompt: string;
  /**
   * Which prompt bundle produced `system`/`prompt`.
   *
   * SUPPLIED BY THE OPERATION, because the constant was attributing every
   * slice-3 voice inference to `slice2a-smoke-v1` (billing gate, 2026-08-29) —
   * the connectivity ping's bundle, which the voice inference does not run.
   * The column exists "so spend can be attributed to a bundle once bundles
   * exist"; the first real bundle has arrived, and the attribution was wrong
   * from row one.
   *
   * REQUIRED (billing gate round 2). Left optional, the slice-2a default named
   * an operation that no longer exists on a NOT NULL spend-attribution column,
   * and its only remaining function would have been to silently mis-attribute
   * the NEXT operation that forgot — the defect just fixed. Required makes a
   * new operation a compile error instead of a wrong row.
   */
  promptBundleVersion: string;
};

export type RunInferenceResult = {
  text: string;
  attemptId: string;
  /** What the vendor served, which is not necessarily what was asked for. */
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** NULL when no price row existed — never a zero (D-M2-13). */
  costMicroUsd: bigint | null;
  /** 0 when this was the profile's included build. */
  creditsCharged: number;
  balanceAfter: number;
  configVersion: number;
  usageRowId: string;
};

/**
 * Enforce the deadline on the OPERATION, not just on the requests inside it.
 *
 * WHY THE SIGNAL ALONE IS NOT ENOUGH, measured in the installed SDK rather than
 * assumed: `@anthropic-ai/sdk@0.71.2` checks the signal at request boundaries
 * (`client.js:239,247`), but its retry backoff is `await sleep(timeoutMillis)`
 * (`internal/utils/sleep.js`) — a bare `setTimeout` that takes NO signal — and
 * it honours a vendor `retry-after` of up to 60s (`client.js:403`). So a 429
 * carrying `retry-after: 45` sits in an un-abortable sleep and the real ceiling
 * becomes ~85s, with the run slot, a pool connection and a server-action worker
 * held for all of it, against tech-spec §7's 45s budget.
 *
 * The docblock on `InferenceRequest.signal` claimed the signal "is the only
 * bound that spans the RETRY LOOP". That is true of the requests and false of
 * the sleeps between them (production gate, round 2). This closes the gap.
 *
 * THE LOSING PROMISE IS NOT ABANDONED SILENTLY. `provider.complete` keeps
 * running after we stop waiting — we cannot un-call it — so its rejection is
 * swallowed deliberately to avoid an unhandled rejection taking the process
 * down. It will end quickly: the same signal aborts the SDK's next request.
 * What we do NOT do is let it decide the outcome, because by then the creator
 * has already been told the run timed out.
 */
async function withDeadline<T>(
  work: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) throw new LlmUnavailableError(null, "timeout");
  let onAbort!: () => void;
  const expiry = new Promise<never>((_, reject) => {
    onAbort = () => reject(new LlmUnavailableError(null, "timeout"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    signal.removeEventListener("abort", onAbort);
    // Attached unconditionally, including on the success path: if the deadline
    // won, `work` is still in flight and an unobserved rejection later is an
    // unhandled rejection.
    void work.catch(() => {});
  }
}

/** Every config path this operation's price depends on (R19). */
function requiredConfigPaths(model: string): string[] {
  return [
    "creditCosts.onboardingBrainBuild",
    "creditCosts.onboardingBrainRebuild",
    "llm.models.generation",
    "llm.maxOutputTokens",
    `llm.prices.${model}`,
  ];
}

/**
 * Run one metered model call for a creator profile.
 *
 * `provider` is a PARAMETER rather than a module singleton, and that is a test
 * seam with a purpose: every gate below step 6 is proved by handing in a
 * provider whose `complete` THROWS IF CALLED, so the proof that nothing reached
 * the vendor is the stub's own refusal rather than an assertion about a spy.
 * `vi.mock` cannot express that — it has already replaced the module.
 */
export async function runInference(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  provider: LlmProvider,
  slots: RunSlots,
  params: RunInferenceParams,
  at: Date
): Promise<RunInferenceResult> {
  // 1. THE CAGE FIRST, and it is `mintProfileScope` that runs it — the mint
  //    calls `assertScoped` on the workspace scope and refuses a profile id
  //    that does not belong to it, with a message byte-identical to the one
  //    for a profile that does not exist (no enumeration oracle). Taking a
  //    `profileId: string` rather than a ready-made `ProfileScope` is the
  //    `appendOwnPost` shape, and the reason is the same: `app/**` never holds
  //    a profile-grained scope, so there is nothing there to forge.
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  // 2. THE ROLE GATE, before touching anything else. The role is COPIED FROM
  //    THE WORKSPACE SCOPE at mint and is never a parameter, so there is no
  //    argument a caller can supply to raise it.
  if (scope.role === "viewer") throw new InferenceRoleError(scope.role);

  // 3. R17 — THE ARCHIVED GATE, READ NOW. A `state` copied onto the scope at
  //    mint would be a snapshot, and a profile archived while a page sat open
  //    would still generate. The accessor re-reads the row, filtered on BOTH
  //    the profile and the workspace.
  const [profile] = await scope.accessors.profile();
  if (!profile || profile.state !== "active") throw new ProfileArchivedError();

  // 4. THE PAUSE GATE, HERE RATHER THAN IN `debitCredits`, AND THAT IS THE
  //    REQUIREMENT (R8). `debitCredits` does refuse a paused workspace — but
  //    this operation is FREE the first time per profile, and a zero cost never
  //    reaches `debitCredits` at all (`assertPositiveInt` rejects 0, so the
  //    call is skipped entirely). Relying on the debit's gate would therefore
  //    let a paused workspace burn our tokens, on precisely the call that costs
  //    the creator nothing. REQ-G08 freezes entitlements, and an included build
  //    is an entitlement.
  if (await hasOpenPause(db, scope.workspaceId)) {
    throw new WorkspacePausedError();
  }

  // 5. CONFIG AND PRICE, BEFORE THE VENDOR IS CONTACTED.
  const billing = await getWorkspaceBillingState(db, scope.workspaceId, at);
  // Read once WITHOUT the model-specific path to learn which model is
  // configured, then again requiring that model's price row. Two reads rather
  // than one because the path being asserted DEPENDS on the value being read,
  // and R19's check is deliberately as narrow as the spend it guards: a
  // workspace that never runs a model is never refused for a price row it does
  // not use.
  const probe = await getActiveConfigRequiringStored(db, [
    "llm.models.generation",
  ]);
  const model = probe.content.llm.models.generation;
  const { version: configVersion, content } =
    await getActiveConfigRequiringStored(db, requiredConfigPaths(model));
  // FAIL CLOSED ON THE PRICE BEFORE SPENDING (R6). Looked up here as well as
  // after the call, deliberately: refusing a misconfigured model BEFORE we pay
  // for it costs the creator nothing, whereas the post-call lookup can only
  // record `cost_state: 'unknown'` against money already gone.
  priceFor(content.llm.prices, model);

  // 6. WHAT THIS ATTEMPT WOULD COST, AND WHETHER IT CAN BE PAID.
  //
  // Counted over DISTINCT BILLED attempt_ids, never rows: a bounded retry is
  // one attempt, and a 429 is not a billed attempt (R14).
  const priorAttempts = await scope.accessors.countBillableAttempts({
    purpose: ONBOARDING_BRAIN_PURPOSE,
  });
  // THE UNCHARGED-ATTEMPT CAP, BEFORE THE VENDOR (billing gate round 2).
  //
  // A billable-but-non-consuming attempt costs US a full output ceiling and
  // costs the creator nothing, so `preCallCost` below is 0 and the balance
  // check never runs. Truncation is deterministic for a given input size, so
  // without this the press repeats forever at our expense. Counted per profile
  // and per purpose, over DISTINCT attempts.
  //
  // IT REFUSES RATHER THAN CHARGING, deliberately: the cause is our own
  // misconfigured ceiling, and billing a creator for it is exactly what the
  // split above exists to stop. The refusal names an operator.
  //
  // THE BOUND'S REAL WIDTH (billing gate round 3, 2026-08-29): this count runs
  // outside any transaction or lock, before the slot is taken, so N presses
  // in flight together can each read `cap - 1` and all pass — the cap can be
  // overshot by up to the tier's slot limit within one burst. That is the
  // accepted width, not an oversight: once the burst's `model_usage` rows
  // commit, the count refuses every later press, so the "repeats forever"
  // hole stays closed and the exposure is a handful of output ceilings, ours
  // and never the creator's. Making it exact would mean counting inside the
  // debit's locked transaction, after the vendor was already paid — a charge
  // where a refusal was owed.
  const unchargedCap = content.onboarding.maxUnchargedBillableAttempts;
  const uncharged = await scope.accessors.countUnchargedBillableAttempts({
    purpose: ONBOARDING_BRAIN_PURPOSE,
  });
  if (uncharged >= unchargedCap) {
    throw new UnchargedAttemptCapError(uncharged, unchargedCap);
  }
  const preCallCost = priceOf(content, priorAttempts);
  if (preCallCost > 0) {
    const view = await deriveBalance(db, scope.workspaceId);
    if (view.balance < preCallCost) {
      const shortfall = preCallCost - view.balance;
      // R10. EVERY TOP-UP OUTCOME IS CAUGHT, RETURNED OR THROWN: this call
      // reaches Stripe, and an exception escaping here would surface as an
      // opaque 500 on the one path whose entire job is to explain a refusal.
      let triggered = false;
      try {
        const result = await maybeAutoTopup(
          db,
          scope.workspaceId,
          shortfall,
          at
        );
        triggered = result.triggered;
      } catch {
        // A top-up that could not even be attempted changes nothing about THIS
        // attempt — it was already refused. The creator is told the truth
        // either way, and why the top-up failed is Billing's to surface.
        triggered = false;
      }
      // REFUSED REGARDLESS. A triggered top-up does not license proceeding.
      throw triggered
        ? new TopupInFlightError(view.balance, preCallCost)
        : new InsufficientCreditsError(view.balance, preCallCost);
    }
  }

  // 6b. THE RUN SLOT, TAKEN NOW AND HELD ACROSS THE VENDOR CALL
  //     (tech-spec §6; production BLOCK 4 of 2026-08-28).
  //
  //     WHAT IT BOUNDS THAT NOTHING ELSE DID. Step 6 skips the balance read
  //     ENTIRELY when `preCallCost === 0`, and the seed prices
  //     `onboardingBrainBuild` at 0 — so on a fresh Free workspace N
  //     concurrent first presses all read "no priors", all skip the check,
  //     and all reached Anthropic. Our vendor bill was bounded by request
  //     concurrency and by nothing the customer had paid for.
  //
  //     AFTER the refusals above, not before, and the ordering is the
  //     requirement: an attempt refused for a pause, an archived profile or a
  //     short balance must not burn one of the workspace's slots on its way
  //     out. A slot is for a call we are actually about to make.
  //
  //     THE LIMIT COMES FROM CONFIG, KEYED BY THE TIER ALREADY RESOLVED at
  //     step 5 — read once and reused, never re-derived, so the slot and the
  //     `resolved_tier` stamped on `model_usage` can never disagree.
  //
  //     RELEASED IN `finally`, so a vendor timeout, a failed debit, or a
  //     thrown bookkeeping error all give the slot back. A slot leaked on the
  //     error path would shrink the workspace's concurrency every time
  //     something went wrong, until the tier could not generate at all — the
  //     control quietly becoming the outage (CLAUDE.md, 2026-07-30).
  const concurrencyLimit = content.concurrencyLimits[billing.tier];
  const slot = await slots.acquire(scope.workspaceId, concurrencyLimit);
  if (!slot.granted) {
    throw new RunSlotBusyError(slot.reason, concurrencyLimit, billing.tier);
  }

  try {
    // 7. THE VENDOR CALL. Outside every transaction — a transaction held open
    //    across a network call to a third party holds a connection for as long as
    //    that third party feels like taking, and the round-1 gate found exactly
    //    that shape wrapped around the `model_usage` write.
    let servedModel = model;
    let tokensIn = 0;
    let tokensOut = 0;
    let usageRaw: Record<string, number> = {};
    let text: string;
    try {
      const deadline = AbortSignal.timeout(content.llm.overallDeadlineMs);
      const result = await withDeadline(
        provider.complete({
        attemptId: params.attemptId,
        model,
        system: params.system,
        prompt: params.prompt,
        maxOutputTokens: content.llm.maxOutputTokens,
        // THE WHOLE CALL'S DEADLINE, RETRIES INCLUDED (production CHANGE 6).
        // `llm.timeoutMs` bounds ONE ATTEMPT, so it multiplies by
        // `maxRetries + 1` — ~181s at the defaults, inside a server action,
        // against tech-spec §7's 45s budget. Long before that a proxy cuts the
        // browser's connection while this process keeps going, commits
        // `model_usage` and charges: a dead page and a debit the creator cannot
        // explain. A signal is the only bound that spans the RETRY LOOP, which
        // is where the time actually accumulates.
        //
        // Read from the ACTIVE CONFIG (B5), so the deadline moves without a
        // deploy — and NOT on `requiredConfigPaths`, because a defaulted
        // deadline still bounds the call, unlike a defaulted price.
        signal: deadline,
        }),
        // THE SAME SIGNAL ON BOTH SIDES. The provider gets it so the in-flight
        // HTTP request is really cancelled rather than merely ignored; the race
        // gets it so the un-abortable backoff sleep between retries cannot
        // outlast the bound.
        deadline
      );
      text = result.text;
      servedModel = result.servedModel;
      tokensIn = result.usage.tokensIn;
      tokensOut = result.usage.tokensOut;
      usageRaw = result.usage.raw;
    } catch (e) {
      // 8a. THE SPEND RECORD IS WRITTEN ON FAILURE TOO (R13). A vendor 500 that
      //     leaves no row is a call we may or may not have paid for, with nothing
      //     to reconcile either way.
      //
      //     An `LlmError` CLASSIFIES ITSELF — outcome and billability travel on
      //     the class — so a new failure mode cannot be silently absorbed into a
      //     `default:` branch here. Anything else is an unknown failure and is
      //     recorded `unavailable`, which is the NON-billable direction: an
      //     failure we cannot classify must not consume a creator's included
      //     build.
      const outcome: InferenceOutcome =
        e instanceof LlmError ? e.outcome : "unavailable";
      //     WHETHER IT SPENT THE INCLUDED BUILD IS A SECOND QUESTION, and it
      //     travels on the class too (billing gate, 2026-08-29). It used to be
      //     derived from `outcome` alone at count time, which charged a creator
      //     their one free build for a TRUNCATION — an outage caused by this
      //     server's own reply ceiling, deterministic and unfixable by them.
      //     An unclassified failure consumes nothing, same direction as above.
      const consumedIncludedBuild =
        e instanceof LlmError ? e.consumesIncludedBuild : false;
      //     A TRUNCATION KNOWS WHAT IT COST. It is the only failure that
      //     carries the vendor's own usage report, because it is the only one
      //     where the vendor produced a full ceiling's worth of output and
      //     charged for it. Without this the row lands `cost_state: 'unknown'`
      //     and the most expensive call in the system is invisible to the
      //     REQ-G05 rollup (billing gate, 2026-08-29).
      if (e instanceof LlmTruncatedError && e.usage) {
        tokensIn = e.usage.tokensIn;
        tokensOut = e.usage.tokensOut;
        usageRaw = {
          input_tokens: e.usage.tokensIn,
          output_tokens: e.usage.tokensOut,
        };
      }
      //     AND THE BOOKKEEPING MUST NOT MASK THE VENDOR ERROR. `recordUsage`
      //     opens a transaction, so it can fail on its own — a dropped
      //     connection, a constraint, a pool timeout. Unguarded, ITS error
      //     replaces `e` as the thing that leaves this function, and `e` is
      //     what every downstream decision is made from: `billingErrorCode`
      //     branches on `LlmError.billable` to decide whether the creator's
      //     included build was consumed, and the copy table maps the class to a
      //     sentence. Losing it turns a named, true refusal into "Something
      //     went wrong" — on a path where money may already be gone.
      try {
        await recordUsage(scope, {
          db,
          params,
          model: servedModel,
          tokensIn,
          tokensOut,
          usageRaw,
          outcome,
          consumedIncludedBuild,
          promptBundleVersion: params.promptBundleVersion,
          billing,
          content,
          configVersion,
        });
      } catch (bookkeeping) {
        // NOT SWALLOWED — carried on `cause`, so the edge that logs this can
        // see that a spend record is MISSING. `packages/credits` has no logger
        // of its own (`safe-log` lives in `app/**`, which this package must not
        // import), so the cause chain is the only channel that reaches one.
        if (e instanceof Error && e.cause === undefined) e.cause = bookkeeping;
      }
      throw e;
    }

    // 8b. `model_usage` IN ITS OWN COMMITTED TRANSACTION (R11 — the A-7
    //     settlement-tail exemption). It commits BEFORE the debit is attempted,
    //     so a refused debit, or a crash between the two, leaves the spend
    //     recorded rather than rolled away. The round-1 defect was the reverse.
    const usageRow = await recordUsage(scope, {
      db,
      params,
      model: servedModel,
      tokensIn,
      tokensOut,
      usageRaw,
      outcome: "succeeded",
      // A successful run is exactly what the included build is for.
      consumedIncludedBuild: true,
      promptBundleVersion: params.promptBundleVersion,
      billing,
      content,
      configVersion,
    });

    // 9. THE DEBIT, AFTER, UNDER THE WORKSPACE LOCK.
    //
    // THE PRICE IS DECIDED AGAIN HERE, and this is the race step 6 cannot close:
    // two concurrent first-ever attempts both read "no prior attempts" before
    // either had written a row, so on step 6's answer alone both would be free.
    //
    // COUNTED BY ORDER, NOT BY EXCLUSION, and the difference is a defect this
    // code shipped with. `excludeAttemptId` alone is SYMMETRIC: by the time
    // either attempt reaches this transaction, BOTH usage rows have committed
    // (step 8b), so each excludes itself, counts the other, and both are charged
    // — the creator loses the included build they were promised. Serialising on
    // the lock does not help, because a tie cannot be broken by a predicate that
    // says the same thing about both sides. `earlierThanAttemptId` counts only
    // attempts strictly earlier by `(first row's created_at, attempt_id)`, which
    // is a total order, so exactly one attempt has zero predecessors whatever the
    // interleaving. Proved on real Postgres in
    // `packages/credits/tests/inference-race.docker.test.ts`; PGlite is
    // single-connection and could never have expressed it.
    //
    // The loser is charged, and if its balance cannot cover the charge the debit
    // refuses AFTER the tokens were burnt; that narrow case is the accepted cost
    // of not holding a lock across an HTTP call, and the spend record survives it
    // because of step 8b.
    const { creditsCharged, balanceAfter } = await db.transaction(async (tx) => {
      await takeWorkspaceLock(tx, scope.workspaceId);
      const priors = await scope.accessors.countBillableAttempts(
        {
          purpose: ONBOARDING_BRAIN_PURPOSE,
          earlierThanAttemptId: params.attemptId,
        },
        tx
      );
      const cost = priceOf(content, priors);
      if (cost === 0) {
        const view = await deriveBalanceInTx(tx, scope.workspaceId);
        return { creditsCharged: 0, balanceAfter: view.balance };
      }
      // WRAPPED, so the screen can tell the truth. `debitCredits` refuses a
      // short balance with `InsufficientCreditsError` — the same class the
      // PRE-CALL check at step 6 raises, and the two mean opposite things: there,
      // nothing happened; here, the model has answered, we have paid the vendor,
      // and `model_usage` committed at step 8b. The shared copy told creators on
      // this path that the attempt "was refused BEFORE anything was called, so
      // nothing was spent and your included build was not used" — three false
      // clauses, found independently by three reviewers (2026-08-28).
      try {
        await debitCredits(tx, {
          workspaceId: scope.workspaceId,
          cost,
          // `refType` is the literal `credit_ledger_inference_debit_uq` keys on.
          // Changing this string without changing that index silently removes
          // the at-most-one-debit-per-attempt guarantee.
          refType: "inference",
          refId: params.attemptId,
          at: await getDbNow(tx),
          configVersion,
        });
      } catch (e) {
        if (e instanceof InsufficientCreditsError) {
          throw new PostCallDebitError(params.attemptId, e.balance, e.cost);
        }
        throw e;
      }
      const view = await deriveBalanceInTx(tx, scope.workspaceId);
      return { creditsCharged: cost, balanceAfter: view.balance };
    });

    return {
      text,
      attemptId: params.attemptId,
      model: servedModel,
      tokensIn,
      tokensOut,
      costMicroUsd: usageRow.costMicroUsd,
      creditsCharged,
      balanceAfter,
      configVersion,
      usageRowId: usageRow.id,
    };
  } finally {
    // UNCONDITIONAL, and it is the only release site. `release()` is
    // idempotent and never throws — it destroys the connection rather than
    // propagate, because an exception here would replace whatever real error
    // is already on its way out of the `try`.
    await slot.lease.release();
  }
}

/** The included build is free; every rebuild after it is priced (D-M2-2). */
function priceOf(
  content: RespinConfigV1,
  priorBillableAttempts: number
): number {
  return priorBillableAttempts === 0
    ? content.creditCosts.onboardingBrainBuild
    : content.creditCosts.onboardingBrainRebuild;
}

/**
 * Write the settlement row, in its own transaction.
 *
 * `resolvedTier` and `costState` are BUILT FIELD BY FIELD and never spread from
 * anything a caller supplied (R15). `RecordModelUsageParams` takes both as
 * ordinary fields — the column's own docblock says so, and says that enforcing
 * it inside `packages/db` would invert the dependency graph — so R-30 binding
 * constraint 8 binds the WRITER instead, and this is that writer.
 */
async function recordUsage(
  scope: ProfileScope,
  args: {
    db: DbLike;
    params: RunInferenceParams;
    model: string;
    tokensIn: number;
    tokensOut: number;
    usageRaw: Record<string, number>;
    outcome: InferenceOutcome;
    /** Whether this attempt spent the profile's one included build. */
    consumedIncludedBuild: boolean;
    /** The bundle that produced the prompt. Required — see RunInferenceParams. */
    promptBundleVersion: string;
    billing: BillingState;
    content: RespinConfigV1;
    configVersion: number;
  }
): Promise<ModelUsageRow> {
  // THE PRICE LOOKUP CANNOT REFUSE THE ROW. By the time we are here the vendor
  // has been paid; a missing price row means we do not know what it cost, and
  // `cost_state: 'unknown'` with a NULL cost is the state the table's CHECK
  // constraint exists to express. Inventing a zero here is the silent margin
  // overstatement D-M2-13 forbids.
  let cost: bigint | null = null;
  let costState: "estimated" | "unknown" = "unknown";
  // A FAILED ATTEMPT THAT REPORTED NO USAGE COSTS `unknown`, NEVER A ZERO.
  //
  // The deadline (R-40) is what made this reachable often enough to matter: an
  // aborted call reports no usage, so `tokensIn`/`tokensOut` are both 0 — and
  // arithmetic over zero tokens yields a perfectly well-formed `0n` that this
  // function would have stamped `estimated`. That is a POSITIVE CLAIM that the
  // attempt cost us nothing, and for an abort it is very likely false: the
  // vendor may have processed and billed the input before we hung up. We have
  // no usage report, so the honest state is that we do not know.
  //
  // AND THE DIRECTION IS THE DANGEROUS ONE. Understating cost OVERSTATES
  // margin, which `tech-spec.md` §2 and D-M2-13 both name as the direction to
  // fail away from on the one number pricing is tuned against. `unknown` is
  // excluded from the REQ-G05 rollup and its share is reported, so this trades
  // a silent false zero for a visible gap — which is the trade this repo has
  // already made twice, both times after shipping the zero first.
  //
  // Scoped to `!succeeded` deliberately: a SUCCESSFUL call that genuinely used
  // zero tokens is a different claim, and the vendor did report it.
  // Left as its own branch rather than folded into the `catch` below: the two
  // reasons for `unknown` are different facts — "we have no price for this
  // model" and "we have no usage to price" — and reusing the price error to
  // signal the second would make the row's own explanation wrong.
  const noUsageReported =
    args.outcome !== "succeeded" && args.tokensIn === 0 && args.tokensOut === 0;
  if (!noUsageReported) {
    try {
      cost = costMicroUsd(
        priceFor(args.content.llm.prices, args.model),
        args.tokensIn,
        args.tokensOut
      );
      costState = "estimated";
    } catch (e) {
      if (!(e instanceof ModelPriceUnknownError)) throw e;
    }
  }

  const caps = writeCapabilities(scope);
  return args.db.transaction((tx) =>
    caps.recordModelUsage(
      {
        attemptId: args.params.attemptId,
        purpose: ONBOARDING_BRAIN_PURPOSE,
        model: args.model,
        tokensIn: args.tokensIn,
        tokensOut: args.tokensOut,
        usageRaw: args.usageRaw,
        costMicroUsd: cost,
        costState,
        // FROM THE ONE TIER AUTHORITY (`state.ts`), never re-derived here.
        resolvedTier: args.billing.tier,
        promptBundleVersion: args.promptBundleVersion,
        configVersion: args.configVersion,
        outcome: args.outcome,
        consumedIncludedBuild: args.consumedIncludedBuild,
      },
      tx
    )
  );
}
