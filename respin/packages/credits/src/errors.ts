// Typed refusals — the UI turns these into honest prompts (REQ-G03's
// blocked-at-zero message, the paused notice), never generic 500s.
export class InsufficientCreditsError extends Error {
  constructor(
    public readonly balance: number,
    public readonly cost: number
  ) {
    super(
      `Insufficient credits: balance ${balance}, requested ${cost}. Buy an overage pack or enable auto-top-up (REQ-G03).`
    );
    this.name = "InsufficientCreditsError";
  }
}

/**
 * The debit was refused AFTER the vendor had already answered.
 *
 * A DISTINCT CLASS, not a flag on the one above, because the two say opposite
 * things to the person reading the screen. `InsufficientCreditsError` raised
 * before the call means nothing happened: no tokens, no spend record, the
 * included run untouched. Raised inside `runInference`'s step-9 transaction it
 * means the opposite — the model answered, we paid the vendor, and
 * `model_usage` committed (R11's settlement tail) before the charge was
 * attempted and failed.
 *
 * Three reviewers found the same defect independently (2026-08-28): the shared
 * copy told creators on this path that the attempt "was refused BEFORE
 * anything was called, so nothing was spent and your included build was not
 * used" — three false clauses in one sentence, on the product's first money
 * surface. A class the UI can tell apart is the only way that sentence can be
 * right for both paths.
 *
 * It carries the `attemptId` so the recorded spend can be found from the
 * refusal, which is the question a creator on this path actually asks.
 */
export class PostCallDebitError extends Error {
  constructor(
    public readonly attemptId: string,
    public readonly balance: number,
    public readonly cost: number
  ) {
    super(
      `The attempt completed and was recorded, then its debit was refused: balance ${balance}, requested ${cost} (attempt ${attemptId}). The vendor was paid; nothing was taken from the workspace's balance.`
    );
    this.name = "PostCallDebitError";
  }
}

// WorkspacePausedError MOVED to @respin/db on 2026-08-21 (M2a, plan A-7) and is
// re-exported here so every existing import site is unchanged.
//
// It moved because `writeBrainDoc` — in packages/db — must refuse under an open
// pause, `pause_periods` is defined in packages/db, and @respin/credits depends
// on @respin/db, so the class could not stay here without being duplicated.
// TWO classes of this name would be the worse outcome: they fail `instanceof`
// against each other, and `app/(product)/billing-errors.ts` matches on
// `instanceof`, so the pause refusal would render as "Something went wrong".
// ONE class, one `instanceof`, one piece of copy.
export { WorkspacePausedError } from "@respin/db";

export class ClockSkewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClockSkewError";
  }
}

/**
 * The stored document's claim positions and the evidence's pointers disagree.
 *
 * A PROGRAMMING-ERROR CLASS, not a creator-facing one, and it exists because
 * the facade-error walk correctly refused the bare `new Error` it replaces —
 * `app/**` may `instanceof` only what this package exports, so an anonymous
 * throw on a reachable path renders as "Something went wrong".
 *
 * It can only fire if `buildVoiceDocument`'s RFC-6901 convention and
 * `enumerateClaimFieldsOf`'s walk diverge. That divergence is silent and
 * expensive: the document writes, the confirm screen renders, and
 * `activateBrainDoc` then refuses forever because the positions the creator
 * confirmed are not the positions it enumerates. Refusing the WRITE is the
 * fail-closed direction — no row is better than a row nobody can activate.
 */
export class BrainPointerDivergenceError extends Error {
  constructor(public readonly pointers: string[]) {
    super(
      `Evidence names ${pointers.length} position(s) the voice schema does not declare (${pointers.join(", ")}). The pointer convention and the claim enumerator have diverged, so no brain version was written — a version whose confirmed positions do not match its enumerated ones can never activate.`
    );
    this.name = "BrainPointerDivergenceError";
  }
}

/**
 * Too many attempts we PAID FOR and did not charge for, on one profile.
 *
 * THE BOUND THAT THE ENTITLEMENT SPLIT MADE NECESSARY (billing gate round 2,
 * 2026-08-29). Until `LlmError.consumesIncludedBuild` existed, every
 * non-consuming outcome was also a zero-cost one, so nothing had to count
 * these. `LlmTruncatedError` is the first that is billable to us and
 * deliberately free to the creator — correctly, because the cause is our own
 * reply ceiling — and that combination removed the last thing bounding it:
 * `priceOf` returns 0 for a non-consuming attempt, so the balance check is
 * skipped entirely, and truncation is DETERMINISTIC for a given input size.
 * A creator could press the button forever, at a full output ceiling a call,
 * for nothing.
 *
 * Round 1's defect had bounded this by accident — the second press cost 50
 * credits nobody on Free could pay. Fixing that defect reopened it, which is
 * why this class exists in the same change.
 *
 * IT IS A SAFETY BOUND, NOT A PRODUCT LIMIT, and the copy says so: the creator
 * did nothing wrong, they are not out of credits, and there is nothing for
 * them to change. It names an operator because an operator is who can fix it.
 */
export class UnchargedAttemptCapError extends Error {
  constructor(
    readonly attempts: number,
    readonly cap: number
  ) {
    super(
      // NOT "recent", AND STILL TRUE AFTER THE GENERATION CAP WAS WINDOWED
      // (billing gate round 3, 2026-08-29; re-verified 2026-09-01). This
      // purpose's window start is `new Date(0)` — `unchargedAttemptWindowStart`
      // in `inference.ts` is a total `Record` and answers the two purposes
      // differently on purpose — so the count behind THIS refusal is still a
      // LIFETIME count over an append-only table, with no per-profile clearing
      // act. The recorded clearing mechanism is an operator fixing the root
      // cause and raising the global `onboarding.maxUnchargedBillableAttempts`
      // (see R-48's addendum), so the copy must not imply the cap ages out or
      // can be reset per creator — and must NOT carry
      // `UNCHARGED_CAP_WINDOW_CLAUSE`, which its windowed sibling below does.
      // `generation-pricing.test.ts` asserts that split against the config
      // rather than leaving it as two sentences somebody kept in step.
      `This creator has ${attempts} runs on record that failed in a way that cost us money and cost you nothing, which is the limit (${cap}). Nothing was spent and no model was called this time. This is a fault on our side that repeats until it is fixed rather than anything you can change; please tell us so we can fix it.`
    );
    this.name = "UnchargedAttemptCapError";
  }
}

/**
 * WHAT A WINDOWED CAP OWES ITS READER, as ONE constant both surfaces import.
 *
 * `app/(product)/billing-errors.ts` writes the sentence a creator actually
 * reads (the `?e=` code map; the package messages are written for whoever is
 * debugging the system). Those two were independent literals, and the app one
 * inherited the same stale "there is nothing for you to change" the class
 * carried. Composing both from this constant is R-66's rule applied again —
 * the vocabulary belongs to the derivation, and a screen-side copy is a second
 * answer that goes stale the day the derivation changes.
 *
 * IT NAMES THE MECHANISM AND NOT A NUMBER, deliberately. `BILLING_ERROR_COPY`
 * is a static map — the `?e=` channel carries a code, never a message, so
 * nothing on that path can read the stored config document — and a hard-coded
 * "within the hour" there would be a copy of a value an operator can change in
 * `config_versions` without touching this file. That is exactly the drift this
 * constant exists to prevent. The class message above, which IS constructed
 * where the config has just been read, states the number.
 *
 * The claim it makes is asserted against the config in
 * `generation-pricing.test.ts`: windowed purposes carry it, lifetime ones must
 * not, so un-windowing the generation cap reddens a test instead of quietly
 * making this sentence a lie.
 */
export const UNCHARGED_CAP_WINDOW_CLAUSE =
  "This clears on its own: only recent failures count, so once these age out of that window you can generate again without anyone doing anything.";

/**
 * Too many GENERATIONS we paid for and did not charge for, on one profile
 * (slice 6, R16).
 *
 * ITS OWN CLASS AND ITS OWN COPY, not a reuse of `UnchargedAttemptCapError`
 * above, and the difference is the sentence a creator reads. That one says
 * "runs on record" about an onboarding brain build, which happens a handful of
 * times per profile; this one is about generating, which is the thing a creator
 * does all day — so the numbers, the remedy and the reassurance are different
 * even though the mechanism is identical. R16 asks for "its own config key and
 * its own refusal copy"; `generation.maxUnchargedBillableAttempts` is the key
 * and this is the copy.
 *
 * WHAT MAKES A GENERATION UNCHARGED-BUT-BILLABLE (the slice card's question-4
 * table): a truncated reply (our `maxOutputTokens` was too low) and a reply
 * this product could not parse into a `ScriptOutput`. Both cost us a real
 * vendor call and both are deliberately free to the creator, because neither is
 * anything they did — which is exactly the hole R-48 records: `priceOf` never
 * runs, the balance check never runs, and the press repeats at our expense.
 *
 * UNLIKE ITS SIBLING, THE COUNT IS WINDOWED, AND THE COPY HAS TO SAY SO
 * (billing gate round 2, 2026-09-01). This class shipped under a docblock
 * inherited from `UnchargedAttemptCapError` — "the count is LIFETIME … the
 * copy must not imply the cap ages out … the clearing act is an operator
 * fixing the cause" — which was true of the count it was copied from and false
 * of this one from the moment `generation.unchargedAttemptWindowMinutes`
 * landed. `unchargedAttemptWindowStart` (`inference.ts`) subtracts that window
 * from the clock for THIS purpose and returns `new Date(0)` for onboarding's,
 * so this cap really does age out — inside an hour at the seeded value, with
 * no operator involved — and the copy was still telling the creator there was
 * "nothing for you to change" and that only we could fix it. That withheld the
 * only remedy the creator actually has, which is to come back shortly.
 *
 * SO THE MESSAGE NAMES THE WINDOW IN MINUTES, and takes it as a constructor
 * argument rather than reading config: this class is constructed at the one
 * site that has already read the active document, and a second read here would
 * be a second answer to "what is the window" that could disagree with the
 * count that was actually taken.
 */
export class GenerationUnchargedAttemptCapError extends Error {
  constructor(
    readonly attempts: number,
    readonly cap: number,
    /** The window the count was taken over — the same one the count used. */
    readonly windowMinutes: number
  ) {
    super(
      `This creator has ${attempts} generations in the last ${windowMinutes} minutes that failed in a way that cost us money and cost you nothing, which is the limit (${cap}). Nothing was spent and no model was called this time. ${UNCHARGED_CAP_WINDOW_CLAUSE} It is a fault on our side rather than anything you did, and it will keep happening until the cause is fixed; please tell us.`
    );
    this.name = "GenerationUnchargedAttemptCapError";
  }
}

/**
 * This creator has no coherent brain to generate from (slice 6, R9a).
 *
 * `generations.brain_activation_id` is NOT NULL because "a later brain or
 * metric edit cannot change the historical explanation" — the stored id names
 * a `brain_activation_snapshots` row, which is append-only and records the
 * exact Voice/Strategy/Kill-Test versions that were active TOGETHER. A profile
 * that has never activated a coherent brain has no such row, so there is
 * nothing honest to record and nothing coherent to generate from.
 *
 * REFUSED BEFORE THE VENDOR, so both clauses in the copy are true. It names the
 * act the creator can take, which is the `NotEnoughPostsError` shape.
 */
export class BrainNotActivatedError extends Error {
  constructor() {
    super(
      "This creator's brain has not been activated yet, so there is nothing to write in their voice. Nothing was spent and no model was called. Confirm and activate a brain version first, then try again."
    );
    this.name = "BrainNotActivatedError";
  }
}

/**
 * The same attempt id was submitted twice with a DIFFERENT payload (R14).
 *
 * The attempt id is the idempotency key: it is what `model_usage`, the debit's
 * `credit_ledger_inference_debit_uq` row and the `generation_attempts` claim
 * all join on. Two different requests under one key would settle one of them
 * against the other's spend record, so the second is refused rather than
 * silently served the first one's answer — which would be worse, because the
 * creator would read an output for a request they did not make.
 *
 * The hashes are NOT in the message: they are internal digests of the creator's
 * own material and belong in a log, not on a screen.
 */
export class GenerationPayloadMismatchError extends Error {
  constructor(readonly attemptId: string) {
    super(
      // IT COVERS A SECOND CAUSE, and says so rather than asserting the one it
      // cannot tell apart — `GenerationInFlightError`'s "stuck case"
      // precedent, twenty lines down. All this refusal knows is that the hash
      // stored against the attempt id is not the hash of the request that
      // arrived, and slice 7 gave that two causes: a genuinely different
      // request, and an attempt STARTED BY AN EARLIER BUILD, whose stored hash
      // was taken over five fields before `parentGenerationId` became the
      // sixth. Telling the second creator they "submitted a different request"
      // is a sentence about them that is not true. The remedy is the same for
      // both, which is what makes one refusal honest.
      "This id was already used for a generation whose request does not match this one, so it was refused rather than answered with that one's output. An attempt started before this product was last updated reads the same way. Nothing was spent and no model was called. Start the generation again."
    );
    this.name = "GenerationPayloadMismatchError";
  }
}

/**
 * The same attempt is already running (R14's duplicate-claim refusal).
 *
 * ONLY THE WINNER OF THE CLAIM MAY EXECUTE THE VENDOR SEQUENCE. A duplicate or
 * concurrent submission observes the claim and is refused here — it does not
 * call the vendor a second time for the same money, and it does not wait,
 * because waiting inside a server action holds a connection for the length of
 * somebody else's HTTP call.
 *
 * IT ALSO COVERS THE STUCK CASE, and says so honestly rather than pretending
 * otherwise: a process that died between the claim and the vendor call leaves a
 * claim nothing will advance, and this refusal cannot tell that apart from a
 * run that is genuinely in flight. The remedy is the same either way — start a
 * new generation, which mints a new attempt id — and nothing was charged.
 */
export class GenerationInFlightError extends Error {
  constructor(
    readonly attemptId: string,
    readonly state: string
  ) {
    super(
      "This generation is already running, so it was not started a second time. Nothing extra was spent. Wait for it to finish, or start a new one."
    );
    this.name = "GenerationInFlightError";
  }
}

/**
 * The vendor was called and we cannot prove what came back (R14c).
 *
 * THE SYSTEM NEVER GUESSES BY CALLING THE VENDOR AGAIN. A crash (or a database
 * failure) after outbound HTTP but before the settlement transaction commits
 * leaves an attempt whose spend record exists and whose result does not. A
 * second vendor call would be a second real charge for one press, and settling
 * anything at all would be inventing an output.
 *
 * SO: the attempt is marked `recovery_required`, which is visible to an
 * operator, and the creator is told the truth — nothing was taken from their
 * balance. The debit is the thing that did not happen: `settleGeneration` and
 * `debitCredits` share one transaction, so a failure there rolls BOTH back and
 * leaves only the `model_usage` rows, which are ours to reconcile.
 */
export class GenerationRecoveryRequiredError extends Error {
  constructor(
    readonly attemptId: string,
    // THE REAL FAILURE TRAVELS ON `cause`, never in the message. `packages/credits`
    // has no logger of its own (`safe-log` lives in `app/**`, which this package
    // must not import), so the cause chain is the only channel that reaches one —
    // and the message a creator reads must not carry a driver error.
    cause?: unknown
  ) {
    super(
      "This generation reached the model and then could not be finished safely, so it has been flagged for us to look at rather than run again. Nothing was taken from your balance. Start a new generation when you are ready.",
      cause === undefined ? undefined : { cause }
    );
    this.name = "GenerationRecoveryRequiredError";
  }
}

/**
 * This attempt id already ended in a refusal (R14).
 *
 * A CLASS OF ITS OWN rather than a reuse of `GenerationInFlightError`, because
 * "it is still running, wait" and "it already finished without an answer" are
 * opposite instructions. Re-running the same attempt id is deliberately NOT
 * "try the vendor again": the payload is byte-identical by construction (a
 * different one is `GenerationPayloadMismatchError`), so a refusal that was
 * deterministic would simply repeat at our expense — which is the exact hole
 * R-48's uncharged bound exists to close, one layer up.
 *
 * It carries the recorded `refusalCode` because that is what an operator reads
 * off the attempt row, and because the creator's remedy is "start a new one"
 * either way.
 */
export class GenerationAlreadyRefusedError extends Error {
  constructor(
    readonly attemptId: string,
    readonly refusalCode: string | null
  ) {
    super(
      "This generation already finished without an answer, so it was not run again. Nothing extra was spent. Start a new one."
    );
    this.name = "GenerationAlreadyRefusedError";
  }
}

/**
 * A priced operation this build does not know how to price (slice 6, R13).
 *
 * THE `default:` BRANCH OF THE TWO PER-PURPOSE SWITCHES, and it is a CLASS
 * rather than a bare `throw new Error` for the reason `facade-errors.test.ts`
 * enforces on every app-reachable path: `app/**` may `instanceof` only what the
 * facade exports, so an anonymous throw renders as "Something went wrong" on
 * the one screen that spends money.
 *
 * It is unreachable while the union is exhaustive — the `never` assignment
 * beside it is a compile error the moment a third purpose is added without its
 * price — so it is the RUNTIME half of a control whose compile-time half is the
 * real one. Both exist because a cast can defeat the type and nothing can
 * defeat the throw, which is CLAUDE.md's 2026-08-21 lesson: proving a value
 * cannot be TYPED is not proving it cannot be CAST.
 */
export class UnpricedOperationError extends Error {
  constructor(readonly purpose: string) {
    super(
      `This build does not know how to price a '${purpose}' operation, so it refused rather than charging a number nobody chose. Nothing was spent and no model was called.`
    );
    this.name = "UnpricedOperationError";
  }
}

/**
 * WHY A REVISION COULD NOT BE STARTED FROM THE OUTPUT IT NAMED (slice 7, R6).
 *
 * A CLOSED SET OF FOUR, and they are four because they are four different
 * facts a creator needs told apart. The alternative — one message for all of
 * them — would either leak (see below) or say nothing actionable.
 *
 * IT SAID "THREE" ABOVE FOUR MEMBERS until the billing gate counted them
 * (2026-09-01): `parent_unreadable` was added with the rest and the sentence
 * was not. `app/(product)/billing-errors.ts` carries a FIFTH answer — the
 * neutral fallback for a reason this build does not know — which is copy
 * rather than a code, and R-72 records why it names no cause.
 *
 * ALL FOUR COUNTS IN THIS FILE ARE NOW BOUND, and the third recurrence is why
 * (billing gate, 2026-09-02). Round 1 bound nothing and fixed one sentence;
 * round 2 bound "ABOVE FOUR MEMBERS" and the messages docblock below and left
 * the three counts in the paragraph ABOVE — in the same docblock — free to rot
 * the same way. `tests/billing-ui.test.tsx` ("the counts these two docblocks
 * assert are the counts the collection has") now reads this paragraph too and
 * fails if any of its numbers, or the words they are written in, drift from
 * `Object.keys(REVISION_PARENT_REFUSALS).length`.
 */
export const REVISION_PARENT_REFUSALS = {
  /**
   * FOREIGN, NONEXISTENT AND MALFORMED, DELIBERATELY COLLAPSED INTO ONE.
   *
   * The enumeration rule `ProfileAccessError` and `GenerationAttemptStateError`
   * both state: a refusal that distinguished "another creator's output" from
   * "no such output" is an oracle over every workspace's ids. Splitting these
   * would be exactly that oracle, so the split does not exist.
   */
  not_this_creators: "not_this_creators",
  /**
   * The named output is an HONEST REFUSAL, so there is no text to revise.
   *
   * NOT AN ENUMERATION RISK, because reaching this answer already required
   * owning the row. And not merely tidy either: it closes a PRICING hole.
   * `creditCosts.revision` (2) is below every script price (5), so if a
   * refusal — which produces no output — could be "revised", a creator could
   * generate at the revision price indefinitely by revising the thing that
   * failed. A refusal names a sharper angle to try; trying it is a new
   * generation, and it is priced as one.
   */
  not_revisable: "not_revisable",
  /**
   * The revision asked for a DIFFERENT mode from the output it revises.
   *
   * A revision keeps its parent's mode. The parent's own document is the
   * material a revision is built from, and every mode has a different output
   * contract (`ModeSpec.required`/`permitted`), so "revise this hook set as a
   * caption" is a new generation that happens to start from an old one — which
   * is priced as a generation, not as a revision.
   *
   * REVISIT TRIGGER: a creator surface that genuinely wants cross-mode
   * derivation. Widening this later is safe (it admits pairs that are refused
   * today); narrowing it later would orphan lineage rows already stored.
   */
  different_mode: "different_mode",
  /**
   * The stored output no longer parses as a document of its own mode.
   *
   * NOT AN EXPECTED CASE and not dead code either: `generations.output` is
   * `jsonb`, it was written by whatever build was deployed when it settled, and
   * `parseScriptOutput` is fail-closed. It is `readCandidate`'s envelope-version
   * branch one table over — the difference between refusing to build on bytes
   * this build cannot read and casting them into the next generation's prompt.
   */
  parent_unreadable: "parent_unreadable",
} as const;

export type RevisionParentRefusal =
  (typeof REVISION_PARENT_REFUSALS)[keyof typeof REVISION_PARENT_REFUSALS];

/**
 * A revision named a parent it cannot be built from (slice 7, R6/R8).
 *
 * RAISED BEFORE THE VENDOR IS CONTACTED, which is the whole reason it exists as
 * a separate class from `@respin/db`'s `GenerationLineageError`. That one is
 * the AUTHORITY — `settleGeneration` re-reads the parent through the profile's
 * own scoped predicate inside the settlement transaction and refuses there —
 * but the settlement runs AFTER the model has been called and paid for, so a
 * creator whose parent id did not resolve would have burned a vendor call to
 * learn it. This is the same question asked one step earlier, where the answer
 * costs nothing.
 *
 * IT DOES NOT REPLACE THE AUTHORITY, and the ordering is what makes that true:
 * the parent this class checks is read through the profile's write capability
 * and it is the ROW'S OWN id that is then handed to `settleGeneration`, so the
 * settlement's check is over a server-derived value rather than a caller's.
 *
 * `reason` IS A CLOSED CODE, never prose, so a screen can branch on it and an
 * operator can filter on it — the `BrainDocReason` discipline (C-42).
 */
export class RevisionParentError extends Error {
  constructor(readonly reason: RevisionParentRefusal) {
    super(REVISION_PARENT_MESSAGES[reason]);
    this.name = "RevisionParentError";
  }
}

/**
 * What each refusal says, as a total `Record` over the closed set.
 *
 * NONE OF THEM NAMES AN UPGRADE (R15), and none of them claims the creator did
 * something wrong: three of the four are about what the product can do with the
 * row they picked, and the fourth is about ownership, which a creator cannot
 * meaningfully act on beyond reopening the output they meant.
 *
 * IT SAID "TWO OF THE THREE" ABOVE FOUR MEMBERS until the billing gate counted
 * them (round 2, 2026-09-01) — the SAME miscount `REVISION_PARENT_REFUSALS`
 * records fixing twelve lines above, in the same file, in the same slice: the
 * first fix closed the case it was handed and left its sibling. Both counts are
 * now BOUND to `REVISION_PARENT_REFUSALS` itself by
 * `tests/billing-ui.test.tsx` ("the counts these two docblocks assert are the
 * counts the collection has"), which reads this sentence and fails if the words
 * and the member count disagree — or if the sentence is reworded out from under
 * it. A count asserted in prose is a claim; this one has a run behind it.
 */
const REVISION_PARENT_MESSAGES: Record<RevisionParentRefusal, string> = {
  not_this_creators:
    "That revision could not be linked to the output it revises. Either that output is not this creator's, or it no longer exists. Nothing was generated and nothing was spent — reopen the output you want to revise and start the revision from there.",
  not_revisable:
    "That output was an honest refusal, so there is no draft to revise. Nothing was generated and nothing was spent — the refusal names a sharper angle, and trying it is a new generation rather than a revision.",
  different_mode:
    "A revision stays in the mode it was written in, and this one asked for a different one. Nothing was generated and nothing was spent — revise it as it is, or start a new generation in the mode you want.",
  parent_unreadable:
    "That output cannot be read back in the shape this version of the product expects, so nothing was built from it. Nothing was generated and nothing was spent — the output itself is untouched, and a new generation in the same mode is the way forward while we look at it.",
};
