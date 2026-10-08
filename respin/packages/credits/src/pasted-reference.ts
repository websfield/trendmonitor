// THE CREATOR-SUBMITTED AUTOPSY'S MONEY (slice 8c, R-98; REQ-G04/G06, REQ-E05).
//
// WHY THIS IS IN `packages/credits` AND NOT IN `packages/db` — the same
// layering reason `profiles.ts` records for the profile cap (R-30 constraint
// 2): the paste is gated on the RESOLVED TIER, priced from the ACTIVE CONFIG
// DOCUMENT and debited on the LEDGER, and `@respin/db` can see none of the
// three. Stage A's `intakePastedReference` (`@respin/db`) owns the five rows a
// paste writes and is composed here, on THIS module's transaction handle, so
// the debit and the claim commit together or not at all (skill B3).
//
// THE MONEY SHAPE (R-98). A pasted reference's autopsy is creator-initiated
// work, so — unlike the scheduled shared autopsies, which stay system overhead
// under R-89 — it costs the creator `content.creditCosts.autopsy`, the key's
// first reader. The price is debited WITH THE CLAIM (a `debit` row,
// `refType: "autopsy_claim"`, `refId: <claim id>`), refused at insufficient
// balance BEFORE any row is written, and charged ONCE PER CLAIM: a re-paste
// that lands on an existing claim charges nothing. If the claim ends PARKED
// (five attempts under R-93, or the analysis refused by our own
// mechanism-level check) the creator is not left paying for nothing:
// `settleParkedAutopsies` appends ONE compensating credit per parked claim
// (`refund` kind, `refType: "autopsy_refund"`, `refId: <claim id>`) — the
// ledger's first compensating credit, which is why its idempotency and its
// scope are the two things this file's tests probe hardest.
//
// UNIQUENESS PER CLAIM IS ENFORCED TWICE, AND THE SECOND ONE IS THE SCHEMA
// (migration 0027). The writer reads the ledger for an existing row under the
// SAME workspace advisory lock every other allocating write serialises on
// (`takeWorkspaceLock`) — the serialisation the profile cap relies on for the
// identical read-then-write reason — and the refund additionally sits behind
// `refundCredits`' own over-refund guard (a second full refund of one debit
// "would exceed the original debit" and is refused by the ledger itself). The
// Docker suite drives both writers concurrently to prove the lock does the
// work. THE GUARD'S REACH IS STATED EXACTLY, because it is narrower than it
// reads: it counts refund rows under the SPELLING this call passes, so it
// protects THIS caller — which always passes the same
// `autopsy_refund`/`<claim id>` reference — and not a hypothetical second
// caller naming the same debit differently. That limitation, its witness and
// its M6 owner live on `RefundParams.ref` in `ledger.ts`.
//
// UNDER THAT SITS `credit_ledger_autopsy_claim_uq` AND
// `credit_ledger_autopsy_refund_uq` (`packages/db/src/billing-schema.ts`),
// the seventh and eighth partial uniques on `(ref_type, ref_id)`, in the same
// shape as `credit_ledger_inference_debit_uq` and its Stripe-object siblings.
// This block previously recorded their ABSENCE as a stated choice, on the
// ground that adding them was a migration outside this module's file set. That
// reasoning was about where the edit lives, not about what the guarantee is
// worth: the lock is an application convention, and one writer that forgets to
// take it — or one repair script run by hand — is a creator refunded twice for
// one parked autopsy, a mint out of nothing. The indexes are named BY NAME in
// `tests/pasted-reference.docker.test.ts`, so the guarantee has a witness and
// not just a comment.
//
// NO LITERAL PRICE ANYWHERE IN THIS FILE (R10, skill B5): the cost is
// `content.creditCosts[PASTED_REFERENCE_CREDIT_COST_KEY]` read INSIDE the
// transaction, the refund's amount is the ORIGINAL debit's, and the config
// version that priced the debit is stamped on its row.
import { and, eq } from "drizzle-orm";
import type { RespinConfigV1 } from "@respin/config";
import { getActiveConfigRequiringStored } from "@respin/config";
import type {
  CreditLedgerRow,
  DbLike,
  PastedReferenceIntakeInput,
  PastedReferenceIntakeResult,
  TxLike,
  VerifiedWorkspaceId,
  WorkspaceScope,
} from "@respin/db";
import {
  ProfileRoleError,
  WorkspacePausedError,
  creditLedger,
  hasOpenPause,
  intakePastedReference,
  mintProfileScope,
  normalisePastedReferenceUrl,
  parkedAutopsyClaimsForProfile,
} from "@respin/db";
import { deriveBalance, deriveBalanceInTx } from "./balance";
import { assertWriteClock, getDbNow, takeWorkspaceLockInOrder } from "./clock";
import {
  InsufficientCreditsError,
  PastedReferenceInputError,
  PastedReferenceTierError,
  type PastedReferenceInputField,
} from "./errors";
import { debitCredits, refundCredits } from "./ledger";
import { ENTITLEMENT_TIERS, type EntitlementTier } from "./mode-access";
import { getWorkspaceBillingState } from "./state";

/**
 * THE PRICE'S CONFIG KEY (R-98, R10). `satisfies` binds it to the document's
 * own key set, so a renamed key is a compile error here rather than a
 * `undefined` price somewhere below.
 */
export const PASTED_REFERENCE_CREDIT_COST_KEY = "autopsy" satisfies keyof RespinConfigV1["creditCosts"];

/** The `ref_type` of the debit that pays for a pasted reference's claim. */
export const PASTED_REFERENCE_DEBIT_REF_TYPE = "autopsy_claim";

/** The `ref_type` of the compensating credit a PARKED claim earns. */
export const PASTED_REFERENCE_REFUND_REF_TYPE = "autopsy_refund";

/**
 * WHICH TIERS MAY PASTE: everything above Free (R-98 "paid tiers only";
 * REQ-E05 keeps Free digest-only). Written as a derivation from the tier
 * vocabulary rather than a second hand-typed list, so a tier added to
 * `ENTITLEMENT_TIERS` is included here by construction and only `free` is
 * ever named. `tests/pasted-reference.test.ts` pins the derived set.
 */
export const PASTED_REFERENCE_TIERS: readonly EntitlementTier[] = ENTITLEMENT_TIERS.filter(
  (tier) => tier !== "free"
);

export type PastedReferenceQuote = {
  /** `content.creditCosts.autopsy` from the ACTIVE CONFIG DOCUMENT — never a literal. */
  creditCost: number;
  /** Derived from the ledger by `deriveBalance`; never stored. */
  balance: number;
  tier: EntitlementTier;
  /**
   * Whether the WRITER would refuse on tier or pause. Insufficient balance is
   * deliberately NOT decided here — the writer decides that under the lock,
   * and a screen that pre-decided it would be stating a money fact that can
   * change between the render and the press.
   */
  allowed: { ok: true } | { ok: false; reason: "tier" | "paused" };
};

/**
 * A QUOTE FOR A SCREEN, NOT A DECISION. Read-only: the tier (the one
 * authority), the active document's price, the derived balance and the pause
 * — so `/trends`' paste panel can print "Costs N credits" and its current
 * balance without a number typed into a screen file. The WRITER
 * (`submitPastedReference`) is the authority on every one of these at the
 * moment of the press; this is what the panel shows a second earlier.
 */
export async function pastedReferenceQuote(
  db: DbLike,
  workspaceId: VerifiedWorkspaceId,
  at: Date
): Promise<PastedReferenceQuote> {
  const billing = await getWorkspaceBillingState(db, workspaceId, at);
  const { content } = await getActiveConfigRequiringStored(db, [
    `creditCosts.${PASTED_REFERENCE_CREDIT_COST_KEY}`,
  ]);
  const view = await deriveBalance(db, workspaceId);
  const paused = await hasOpenPause(db, workspaceId);
  const allowed: PastedReferenceQuote["allowed"] = !PASTED_REFERENCE_TIERS.includes(billing.tier)
    ? { ok: false, reason: "tier" }
    : paused
      ? { ok: false, reason: "paused" }
      : { ok: true };
  return {
    creditCost: content.creditCosts[PASTED_REFERENCE_CREDIT_COST_KEY],
    balance: view.balance,
    tier: billing.tier,
    allowed,
  };
}

/**
 * IS THE STANDALONE REFERENCE BREAKDOWN IN THIS WORKSPACE'S PLAN? (launch L2,
 * audit P8-R1 for `/studio`'s entrance.) The tier authority against
 * `PASTED_REFERENCE_TIERS`, and nothing else: no balance, no price, no pause.
 * `pastedReferenceQuote` derives the balance, and `deriveBalance` takes the
 * workspace money lock — so `/studio`, which only needs "offered or not",
 * reads this instead and never queues a render behind a settlement.
 * `pasted-reference-availability.test.ts` runs it on a database that refuses
 * every transaction and raw statement, the only way that lock can be taken.
 */
export async function pastedReferenceInPlan(
  db: DbLike,
  workspaceId: VerifiedWorkspaceId,
  at: Date
): Promise<boolean> {
  const billing = await getWorkspaceBillingState(db, workspaceId, at);
  return PASTED_REFERENCE_TIERS.includes(billing.tier);
}

export type SubmitPastedReferenceResult = PastedReferenceIntakeResult & {
  /**
   * What THIS call charged: the active document's `creditCosts.autopsy` when it
   * wrote the claim's debit, and `0` when it did not — because the ledger
   * already held that debit (`replayed`) or because the document priced the
   * paste at 0. NOT "0 on an existing claim": an existing claim that carries no
   * debit is charged, and that case is witnessed in `tests/pasted-reference.test.ts`.
   */
  creditsChargedNow: number;
  /**
   * THIS CLAIM ALREADY CARRIED ITS DEBIT, so this press charged nothing for
   * that reason and no other. Reported EXPLICITLY rather than left to be
   * inferred from `creditsChargedNow === 0`, which is the same boolean only
   * while `creditCosts.autopsy` is non-zero: under a document pricing it at 0
   * a creator's FIRST paste charges nothing, and the screen would tell them it
   * was "already queued" when it had just been created.
   *
   * IT IS THE DEBIT'S EXISTENCE, NOT THE INTAKE'S IDEMPOTENCY, and the
   * difference is a second false sentence. The intake can return existing
   * source/item/transcript rows and still mint a FRESH claim (a completed
   * claim at a superseded analysis version), which this press then pays for —
   * "nothing charged" would be wrong about money. `replayed` is true exactly
   * when the ledger already held this claim's `autopsy_claim` debit.
   */
  replayed: boolean;
  /** Derived inside the same transaction, after the debit. */
  balanceAfter: number;
  /** The config version whose `creditCosts.autopsy` priced (or would have priced) this paste. */
  configVersion: number;
};

/**
 * Paste a third-party video's URL and transcript, and pay for its autopsy
 * (R8, R-98). IN THIS ORDER AND NO OTHER, and each step is here because
 * skipping it fails differently:
 *
 *  1. THE MINT — `mintProfileScope` runs `assertScoped` on the workspace scope
 *     and refuses a profile id outside it; the minted role refuses a VIEWER
 *     (`ProfileRoleError`, the `assertMayTrack` rule stage A applies inside
 *     the intake too — a paste spends the workspace's credits, and a viewer
 *     may read but not spend).
 *  2. THE INPUT'S SHAPE, before any lock: the URL is normalised by the SAME
 *     function the intake keys idempotency on, so a bad URL is refused by
 *     name (`PastedReferenceInputError`) without contending the lock.
 *  3. ONE TRANSACTION, holding the WORKSPACE ADVISORY LOCK — the same lock the
 *     generation settlement and `createProfile` take, so a paste and a
 *     concurrent debit serialise in ONE lock order (G-17 records why a second
 *     key over the same grain is how a deadlock is written). Inside it:
 *     the write clock (`at` decides the tier, so a stale `at` is refused, the
 *     `createProfile` precedent) → THE TIER, from the one authority, paid
 *     tiers only (`PastedReferenceTierError`) → an OPEN PAUSE refused
 *     (`WorkspacePausedError`; REQ-G08 freezes entitlements) → THE PRICE from
 *     the ACTIVE CONFIG DOCUMENT, read under the lock so an admin append
 *     mid-decision cannot move it between the check and the debit → THE
 *     BALANCE, refused with `InsufficientCreditsError` BEFORE ANY ROW.
 *  4. `intakePastedReference` on THIS transaction handle (its own
 *     `db.transaction` becomes a savepoint), then the debit — unless the claim
 *     already carries one, in which case the paste was a replay and charges
 *     nothing. `debitCredits` re-checks pause, clock and balance under the
 *     same lock and refuses before writing.
 *
 * WHY THE LOCK IS TAKEN BEFORE THE TIER IS READ, when the card lists the tier
 * and pause refusals ahead of the lock: the tier and the price must be read
 * INSIDE the transaction that spends against them (the `createProfile`
 * precedent, not the two-read `trackedNicheEntitlementFor` shape), and the
 * transaction takes the lock as its first act. The ORDER OF REFUSALS the
 * creator observes is the card's — mint, tier, pause, balance — and every one
 * of them leaves no row.
 *
 * A REPLAY ON A SHORT BALANCE IS STILL REFUSED. The balance is checked before
 * the intake (the card's "refuse before any row"), and the writer cannot know
 * the paste is a replay until the intake has looked the claim up; so a
 * creator at zero re-pasting a URL they already paid for is told to top up,
 * although the replay would have charged nothing. Stated rather than
 * special-cased: the alternative is a pre-intake claim lookup that duplicates
 * the intake's idempotency rule here.
 */
export async function submitPastedReference(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  input: PastedReferenceIntakeInput,
  at: Date
): Promise<SubmitPastedReferenceResult> {
  const profile = await mintProfileScope(db, scope, profileId);
  if (profile.role !== "owner") {
    throw new ProfileRoleError(
      "paste a reference for this creator profile",
      profile.role,
      "owner"
    );
  }
  classifyInputRefusal(() => normalisePastedReferenceUrl(input.sourceUrl));

  return db.transaction(async (tx) => {
    // THE ORDERED HELPER (audit Phase 8, P8-A1, R-177; confirmed at build:
    // `intakePastedReference` below runs `assertFreshProfileScopeInTx`, the
    // profile lifecycle fence), so its membership locks come first, shared.
    await takeWorkspaceLockInOrder(tx, {
      workspaceId: profile.workspaceId,
      userId: profile.userId,
    });
    await assertWriteClock(tx, profile.workspaceId, at);

    // THE ONE TIER AUTHORITY, inside the lock (see the docblock).
    const billing = await getWorkspaceBillingState(tx, profile.workspaceId, at);
    if (!PASTED_REFERENCE_TIERS.includes(billing.tier)) {
      throw new PastedReferenceTierError(billing.tier);
    }
    if (await hasOpenPause(tx, profile.workspaceId)) {
      throw new WorkspacePausedError();
    }
    // THE STORED DOCUMENT, not a defaulted key (R19: a merely-defaulted price
    // never prices a debit), read in the same transaction as the debit.
    const { version: configVersion, content } = await getActiveConfigRequiringStored(tx, [
      `creditCosts.${PASTED_REFERENCE_CREDIT_COST_KEY}`,
    ]);
    const cost = content.creditCosts[PASTED_REFERENCE_CREDIT_COST_KEY];
    const before = await deriveBalanceInTx(tx, profile.workspaceId);
    if (before.balance < cost) {
      throw new InsufficientCreditsError(before.balance, cost);
    }

    const intake = await classifyInputRefusalAsync(() =>
      intakePastedReference(tx, scope, profileId, input)
    );

    // ONCE PER CLAIM. A replay returns the existing claim id, and the ledger
    // already holds its debit — read under the lock this transaction holds.
    const existingDebit = await autopsyClaimDebit(tx, profile.workspaceId, intake.claimId);
    let creditsChargedNow = 0;
    if (existingDebit === null && cost > 0) {
      await debitCredits(tx, {
        workspaceId: profile.workspaceId,
        cost,
        refType: PASTED_REFERENCE_DEBIT_REF_TYPE,
        refId: intake.claimId,
        at: await getDbNow(tx),
        configVersion,
      });
      creditsChargedNow = cost;
    }
    const after = await deriveBalanceInTx(tx, profile.workspaceId);
    return {
      ...intake,
      creditsChargedNow,
      replayed: existingDebit !== null,
      balanceAfter: after.balance,
      configVersion,
    };
  });
}

export type SettleParkedAutopsiesResult = {
  /** The claims refunded BY THIS CALL — `[]` on a replay or when nothing is parked. */
  refundedClaimIds: readonly string[];
  /** The sum of the ORIGINAL debits returned by this call; `0` when nothing was settled. */
  creditsReturned: number;
  /**
   * SETTLEMENT WAS DEFERRED BY AN OPEN PAUSE, read INSIDE this settlement's own
   * transaction (slice 8c round 1, billing CHANGE 2 / learning CHANGE 4).
   *
   * Reported rather than left for a screen to re-derive, because every
   * re-derivation is a SECOND read at a SECOND moment under a DIFFERENT
   * precedence: `/trends` reconstructed it from `pastedReferenceQuote`, whose
   * `allowed` tests TIER BEFORE PAUSE, so a paused workspace whose
   * subscription had also lapsed reported `reason: "tier"`, the page's flag
   * read false, and the creator was told "credits returned" in the past tense
   * with zero refund rows and zero credits back. Reproduced by running it
   * before this field existed. `deferred` is the pause boolean this
   * transaction acted on, so there is nothing left to infer.
   *
   * `deferred: true` implies `refundedClaimIds: []`, `creditsReturned: 0`,
   * `neverChargedClaimIds: []` AND `alreadyRefundedClaimIds: []` — nothing was
   * READ, so nothing is CLAIMED: every empty list here means "not looked at",
   * never "none".
   */
  deferred: boolean;
  /**
   * PARKED CLAIMS CARRYING NO `autopsy_claim` DEBIT — nothing was ever charged
   * for them, so nothing is returned, and that is a THIRD state rather than a
   * quiet member of the two above (slice 8c round 1, billing CHANGE 2).
   *
   * A document pricing `creditCosts.autopsy` at 0 writes the claim and no
   * debit row (a zero-delta ledger row is an integrity error, not a row), so
   * such a claim settles to nothing CORRECTLY. Without this list the screen
   * cannot tell that state from "this claim was refunded on an EARLIER load",
   * and it asserted a return that never happened.
   *
   * IT IS "NO DEBIT ROW", WHICH IS "NEVER CHARGED" ONLY BECAUSE THE LEDGER IS
   * APPEND-ONLY (learning gate round 2, NOTE 1). `credit_ledger` has no delete
   * or re-scope path, `submitPastedReference` is the sole writer of
   * `refType: "autopsy_claim"`, and both that debit and this read are scoped to
   * the same workspace — so "no debit" can only mean one was never written. The
   * day any of those three stops being true, this list stops meaning what the
   * screen says it means; `tests/table-writers.test.ts`'s `autopsy_cache_claims`
   * entry carries that invariant where a new writer will read it.
   */
  neverChargedClaimIds: readonly string[];
  /**
   * PARKED CLAIMS THAT ALREADY CARRIED AN `autopsy_refund` BEFORE THIS CALL —
   * refunded on an EARLIER load, and settled correctly by that load.
   *
   * A FOURTH STATE, AND THE ONE THAT MAKES THE SCREEN'S PARKED COPY POSITIVE
   * (slice 8c round 2, billing CHANGE 1 / learning CHANGE 1). The page rendered
   * "credits returned", past tense, for every parked claim the other three lists
   * did not name — a COMPLEMENT, not an observation. A claim the worker parks
   * between the settlement (`page.tsx`, before the read) and the pasted read
   * (a later transaction) is in no list at all, so it fell through to that
   * sentence over a ledger holding the debit and no refund. Both reviewers drove
   * the sequence. With this list every parked sentence the screen says is
   * anchored in something this settlement OBSERVED, and a claim it never saw
   * gets its own non-asserting state instead.
   *
   * THE PRECEDENCE IS DEBIT-FIRST, and it is stated because it is arbitrary at
   * one unreachable point: a claim with a refund but no debit would be reported
   * here as never-charged. `refundCredits` requires an `originalDebitId`, so a
   * refund cannot exist without the debit that funded it; if that ever changes,
   * this ordering is the line to revisit.
   */
  alreadyRefundedClaimIds: readonly string[];
};

/**
 * Return the price of every PARKED pasted-reference claim this profile paid
 * for and has not yet been refunded for (R9, R-98) — THE ONE WRITE THE TRENDS
 * PAGE MAKES ON LOAD, and named as such there.
 *
 * Under the workspace lock, for each of the profile's parked claims (read
 * through stage A's owner-only `parkedAutopsyClaimsForProfile`, which mints
 * the same profile scope and returns EVERY `profile_private` `parked` claim
 * under the pair, so a sibling profile's parked claim is never even a
 * candidate): if an `autopsy_claim` debit exists for the claim and no
 * `autopsy_refund` credit does, append ONE `refund` row for the ORIGINAL
 * debit's amount — not today's price, which may have moved — with
 * `refType: "autopsy_refund"`, `refId: <claim id>`.
 *
 * THE POPULATION IS CLAIMS, NOT THE DISPLAY PROJECTION, and the difference is
 * a creator's money (slice 8c round 1, tenancy CHANGE 1 / billing CHANGE 4 —
 * two Full-gate reviewers, two probes, one conclusion). This read was
 * `pastedReferencesForProfile`, the owner's SCREEN list, whose
 * `projectPastedReference` takes the NEWEST claim per item (`limit 1`). The
 * settled population was therefore "parked ∩ newest-per-item", strictly
 * narrower than R9's "the profile's parked claims" — and the moment a second
 * claim exists on one item (an `AUTOPSY_ANALYSIS_VERSION` bump, the state
 * `submitPastedReference`'s own `replayed` docblock above anticipates) the
 * older parked-and-debited claim went invisible FOREVER: settlement is
 * idempotent, so no later load recovers it, and the creator was silently down
 * `creditCosts.autopsy` with no surface saying so. CLAUDE.md 2026-08-29 in its
 * exact shape — a population written as one path, narrowing the day a second
 * path appears — so the reader is now the one whose population IS the rule.
 *
 * THE CREDIT KIND IS `refund`, chosen over `adjust` and `grant` for its
 * EXPIRY: `refundCredits` (D-M1-7) dates the returned credits to the latest
 * effective expiry of the lots the debit consumed, so a refund of expiring
 * credits mints no never-expiring ones and opens no new expiry window — the
 * creator gets back exactly the spendability they had. (A never-expiring
 * source — an admin goodwill adjust with no expiry — makes `refundCredits`
 * raise `RefundSourceNeverExpiresError`, which propagates: that is an
 * operator's case, and inventing an expiry here would be a policy this module
 * does not own.)
 *
 * IDEMPOTENT BY CLAIM ID: a second call finds the refund row and appends
 * nothing; a non-parked claim is never a candidate; the balance after the
 * refund equals the balance before the paste. The Docker suite drives two
 * concurrent settlements to prove the lock keeps it to one row.
 *
 * AN OPEN PAUSE DEFERS SETTLEMENT rather than refusing the page: credits are
 * frozen for the duration of a pause (REQ-G08), the consumed lots' expiry
 * clocks are frozen with them, and `refundCredits` refuses to date a refund
 * off a frozen clock. Returning `[]` here leaves the claim parked and unpaid
 * for, and the first settlement after resume returns it — witnessed. THE
 * DEFERRAL IS REPORTED (`deferred: true`) rather than left to be inferred:
 * `[]` alone is the same value as "nothing was parked", and the screen that
 * re-derived the difference from the paste quote got it wrong (see
 * `SettleParkedAutopsiesResult.deferred`).
 *
 * A PARKED CLAIM THAT WAS NEVER CHARGED is reported too
 * (`neverChargedClaimIds`), for the same reason and not a different one: it
 * settles to nothing correctly, and "nothing" is otherwise indistinguishable
 * from "already refunded on an earlier load".
 *
 * SO IS A CLAIM THIS CALL FOUND ALREADY REFUNDED (`alreadyRefundedClaimIds`),
 * which completes the set: after this call every parked claim the settlement
 * SAW is named in exactly one of the three lists, and a parked claim named in
 * none of them is one the settlement never saw — parked after it looked. The
 * screen needs that difference because "refunded on an earlier load" and "not
 * settled yet" are the same absence otherwise, and it printed the first
 * sentence over the second state (slice 8c round 2).
 *
 * NO ROLE GATE, deliberately: settlement spends nothing and returns the
 * workspace's own money, so a viewer loading `/trends` triggers it exactly as
 * an owner does. The mint still cages the profile to the scope.
 */
export async function settleParkedAutopsies(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<SettleParkedAutopsiesResult> {
  const profile = await mintProfileScope(db, scope, profileId);
  return db.transaction(async (tx) => {
    // THE ORDERED HELPER (audit Phase 8, P8-A1, R-177; found at build — the
    // plan counted this site "billing alone"): `parkedAutopsyClaimsForProfile`
    // below runs `assertFreshProfileScopeInTx`, the profile lifecycle fence.
    await takeWorkspaceLockInOrder(tx, {
      workspaceId: profile.workspaceId,
      userId: profile.userId,
    });
    // THE ONE PAUSE READ, inside this transaction, and the one the result
    // reports: no caller re-derives it (see the `deferred` field).
    if (await hasOpenPause(tx, profile.workspaceId)) {
      return {
        refundedClaimIds: [],
        creditsReturned: 0,
        deferred: true,
        neverChargedClaimIds: [],
        alreadyRefundedClaimIds: [],
      };
    }
    const parked = await parkedAutopsyClaimsForProfile(tx, scope, profileId);
    const refundedClaimIds: string[] = [];
    const neverChargedClaimIds: string[] = [];
    const alreadyRefundedClaimIds: string[] = [];
    let creditsReturned = 0;
    for (const { claimId } of parked) {
      const debit = await autopsyClaimDebit(tx, profile.workspaceId, claimId);
      if (debit === null) {
        neverChargedClaimIds.push(claimId);
        continue;
      }
      // READ IN THIS TRANSACTION, and REPORTED rather than skipped in silence:
      // the screen's "credits returned" now requires this observation or a
      // refund made below, so a `continue` that said nothing left the sentence
      // to be reached by elimination (round 2).
      if ((await autopsyRefund(tx, profile.workspaceId, claimId)) !== null) {
        alreadyRefundedClaimIds.push(claimId);
        continue;
      }
      const amount = -debit.delta;
      await refundCredits(tx, {
        workspaceId: profile.workspaceId,
        amount,
        originalDebitId: debit.id,
        ref: { refType: PASTED_REFERENCE_REFUND_REF_TYPE, refId: claimId },
      });
      refundedClaimIds.push(claimId);
      creditsReturned += amount;
    }
    return {
      refundedClaimIds,
      creditsReturned,
      deferred: false,
      neverChargedClaimIds,
      alreadyRefundedClaimIds,
    };
  });
}

/**
 * THE `submitted` ADAPTER'S PRODUCTION PORT (`@respin/trends`'
 * `ReferenceIntakePort`, slice 8 R4) — bound to a workspace scope and a clock,
 * because the port's own signature carries only a profile id and the paste.
 *
 * Its shape is asserted against the port TYPE in `tests/pasted-reference.test.ts`
 * (`const port: ReferenceIntakePort = pastedReferenceIntakePort(…)`), and the
 * adapter is driven end to end there through `submitted.submit`. The type is
 * not imported HERE: `@respin/credits` does not declare `@respin/trends` as a
 * dependency, and this module needs nothing from it at runtime.
 *
 * THE PORT HAS NO REFUSAL ARM (audit Phase 2, P2-R11): it returns an
 * acceptance or throws. The intake has no quote budget — R-3's quote budget
 * is enforced where a voice document is GROUNDED, not where a reference is
 * stored (`appendReferencePost` refuses blank or over-ceiling
 * text with `PostContentError`, which is not a quote budget either). Every
 * refusal this port can raise — tier, pause, role, balance, content, input
 * shape — is a typed error thrown through, never relabelled as a reason the
 * product did not compute.
 */
export function pastedReferenceIntakePort(
  db: DbLike,
  scope: WorkspaceScope,
  at: Date
): {
  intakeReferenceTranscript(input: {
    profileId: string;
    sourceUrl: string;
    transcript: string;
  }): Promise<{ accepted: true; referenceInputId: string }>;
} {
  return {
    async intakeReferenceTranscript(input) {
      const result = await submitPastedReference(
        db,
        scope,
        input.profileId,
        { sourceUrl: input.sourceUrl, transcript: input.transcript },
        at
      );
      return { accepted: true, referenceInputId: result.referenceInputId };
    },
  };
}

/** The `autopsy_claim` debit for this claim in THIS workspace, or `null`. */
async function autopsyClaimDebit(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  claimId: string
): Promise<CreditLedgerRow | null> {
  const [row] = await tx
    .select()
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.workspaceId, workspaceId),
        eq(creditLedger.kind, "debit"),
        eq(creditLedger.refType, PASTED_REFERENCE_DEBIT_REF_TYPE),
        eq(creditLedger.refId, claimId)
      )
    )
    .limit(1);
  return row ?? null;
}

/** The `autopsy_refund` credit for this claim in THIS workspace, or `null`. */
async function autopsyRefund(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  claimId: string
): Promise<CreditLedgerRow | null> {
  const [row] = await tx
    .select()
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.workspaceId, workspaceId),
        eq(creditLedger.kind, "refund"),
        eq(creditLedger.refType, PASTED_REFERENCE_REFUND_REF_TYPE),
        eq(creditLedger.refId, claimId)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * THE STORAGE LAYER'S BARE `Error`s, CLASSIFIED BY FIELD — and ONLY those.
 * Stage A refuses a malformed URL, an over-long title, a non-text transcript
 * and an untracked niche with plain `Error`s whose messages name the field;
 * anything typed (`PostContentError`, `WorkspacePausedError`,
 * `ProfileRoleError`) or unrecognised is rethrown untouched, because a bare
 * error this table cannot name is an integrity failure, not an input one.
 * The population is the LIST below, not a prefix: a new stage-A message
 * needs a line here or it renders as "Something went wrong" (CLAUDE.md
 * 2026-08-29 — a population written as one path narrows silently).
 */
const INPUT_REFUSAL_SHAPES: readonly { field: PastedReferenceInputField; test: RegExp }[] = [
  { field: "sourceUrl", test: /^pasted reference URL/ },
  { field: "title", test: /^pasted reference title/ },
  { field: "transcript", test: /^pasted transcript must be text/ },
  { field: "niche", test: /^pasted reference niche|is not one of this profile's tracked niches/ },
];

function toInputRefusal(error: unknown): unknown {
  if (!(error instanceof Error) || error.constructor !== Error) return error;
  const shape = INPUT_REFUSAL_SHAPES.find((s) => s.test.test(error.message));
  return shape ? new PastedReferenceInputError(shape.field, error.message) : error;
}

function classifyInputRefusal<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw toInputRefusal(error);
  }
}

async function classifyInputRefusalAsync<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toInputRefusal(error);
  }
}
