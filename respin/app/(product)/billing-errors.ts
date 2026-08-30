// THE ONE PLACE app/** turns a typed package refusal into words on a page.
//
// Why a code map and not `err.message`:
//  - The package messages are written for the person debugging the system, and
//    several of them carry identifiers — `LedgerIntegrityError` names ledger
//    row uuids, `ClockSkewError` names two ISO instants. Those belong in the
//    neither logs nor a creator's browser (billing/tenancy round-11 NOTE on
//    `customers.ts`, generalised: stable code/type in the log, remedy in the
//    message).
//  - Server actions redirect on failure, so the only channel back to the page
//    is the URL. Putting a MESSAGE there would let anyone hand a creator a link
//    that renders arbitrary text as if the product said it; a code cannot.
//
// The completeness of this map is ASSERTED, not promised: `tests/billing-ui.test.tsx`
// compares HANDLED_ERROR_CLASS_NAMES against every Error subclass exported by
// the two app-facing facades, so a class added to a facade without copy here
// fails the suite instead of degrading to "Something went wrong".
import {
  AlreadySubscribedError,
  AutoTopupCapError,
  BillingRoleError,
  CheckoutInFlightError,
  ClockSkewError,
  CustomerMappingLostError,
  InvoiceRecoveryUnavailableError,
  LedgerIntegrityError,
  NoLiveSubscriptionError,
  NoStripeCustomerError,
  NotChargeableError,
  NotPausedError,
  NotRecoverableError,
  PackPriceMismatchError,
  PackPriceNotMappedError,
  PackPriceUnavailableError,
  PauseLengthError,
  StripeNotConfiguredError,
  StripeSessionUrlMissingError,
  SubscriptionPausedError,
  UnknownTierPriceError,
  // Slice 2a — the metered model call. Five of these are new classes; two
  // (`InsufficientCreditsError`, `AutoTopupShortfallError`) became
  // app-reachable for the first time because `runInference` is the product's
  // first app-reachable SPEND.
  AutoTopupShortfallError,
  AutoTopupUnnamedRefusalError,
  ConfigNotMigratedError,
  AssemblyError,
  UnchargedAttemptCapError,
  BrainPointerDivergenceError,
  InferenceRoleError,
  NotEnoughPostsError,
  InsufficientCreditsError,
  LlmError,
  ProfileArchivedError,
  RunSlotBusyError,
  TopupInFlightError,

  PostCallDebitError,} from "@respin/credits/app-server";
import { ConfigUnavailableError } from "@respin/config/app-server";
import {
  BrainEditBusyError,
  BrainEditEmptyError,
  BrainEditLimitError,
  BrainDocumentLimitError,
  BrainReasonError,
  BrainRoleError,
  BrainVersionLimitError,
  ClaimWalkError,
  ContentSchemaError,
  ContentWalkError,
  KindNotYetWritableError,
  SchemaShapeError,
  SegmenterUnavailableError,
  PostContentError,
  PostAttestationError,
  EvidenceUnreadableError,
  ExportBusyError,
  ExportClassificationError,
  ProfileAccessError,
  ProfileCapError,
  ProfileNameError,
  ProfileRoleError,
  ProvenanceError,
  ReconciliationTargetError,
  ReferenceEchoError,
  ScopeForgeryError,
  UsageRawError,
  WorkspaceAccessError,
  WorkspacePausedError,
  // Slice 3b, Stage B1 — the interview draft's two typed refusals.
  InterviewAnswerError,
  InterviewDraftSubmittedError,
  OnboardingInputLimitError,
} from "@respin/db";

/**
 * The one refusal this layer OWNS rather than relays: Stripe Checkout needs
 * absolute return URLs, and guessing a host would send a paying customer to a
 * page that does not exist. Declared here (not in the actions file) because a
 * `"use server"` module may export only async functions.
 */
export class AppBaseUrlMissingError extends Error {
  constructor() {
    super("BETTER_AUTH_URL is not set; checkout return URLs cannot be built.");
    this.name = "AppBaseUrlMissingError";
  }
}

/**
 * Error classes defined in `app/**` rather than relayed from a package. The
 * completeness test allows exactly these beyond the facade surfaces.
 */
export const APP_LOCAL_ERROR_CLASS_NAMES = ["AppBaseUrlMissingError"];

export const BILLING_ERROR_CODES = [
  "app_base_url_missing",
  "already_subscribed",
  "checkout_in_flight",
  "not_owner",
  "no_stripe_customer",
  "no_live_subscription",
  "not_paused",
  "pause_length",
  "auto_topup_cap",
  "stripe_not_configured",
  "stripe_session_url_missing",
  "unknown_tier_price",
  "customer_mapping_lost",
  "ledger_integrity",
  "clock_skew",
  "config_unavailable",
  "workspace_access",
  // Audit 2026-08-17 remediation (R1).
  "subscription_paused",
  "not_chargeable",
  "pack_price_not_mapped",
  "pack_price_unavailable",
  "pack_price_mismatch",
  // Audit 2026-08-17 remediation (R2) — the `incomplete` remedy.
  "invoice_recovery_unavailable",
  "not_recoverable",
  // M2a. `WorkspacePausedError` MOVED from @respin/credits to @respin/db, and
  // moving it deleted its last mention in any suite — `facade-errors.test.ts`
  // follows relative imports only, and @respin/db's errors were enumerated by
  // nobody. Without this entry the pause refusal renders as "Something went
  // wrong", which is the exact outcome the move was justified by avoiding.
  // The completeness test now enumerates @respin/db too, so this cannot
  // silently regress again.
  "workspace_paused",
  "profile_access",
  "provenance",
  "brain_edit_busy",
  "brain-edit-all-check",
  "brain_edit_limit",
  "brain_document_limit",
  "brain_version_limit",
  "onboarding_input_limit",
  "export_busy",
  "scope_forgery",
  "usage_raw",
  // M2b-1. `brain-content.ts` and `echo.ts` reached a deployed process for the
  // first time when @respin/db's index exported them, and the completeness
  // test above is what turned that into a demand for copy — which is the whole
  // reason it enumerates the WHOLE root export rather than the eslint
  // allowlist. Until then these seven refusals would have rendered as
  // "Something went wrong".
  "brain_content_schema",
  "brain_kind_not_writable",
  "brain_schema_shape",
  "brain_claim_walk",
  "brain_content_walk",
  "brain_reason",
  "brain_role",
  "segmenter_unavailable",
  // Slice 1 — the profile + intake refusals. Each is reachable from a form a
  // creator is looking at, so each names the one action THEY can take; the
  // cap's actual numbers are rendered by the onboarding page from config, never
  // interpolated into copy, because the `?e=` channel carries a code and a code
  // cannot be made to say something the product did not.
  "profile_cap",
  "profile_role",
  "profile_name",
  "post_content",
  // Slice 4 — the reference intake and the R-3 echo bar / quote budget it
  // switches on. `reference_echo` is its own code (see `ReferenceEchoError`'s
  // docblock in @respin/db's errors.ts): it means "this repeats a reference
  // post too closely", which is a different fix from `provenance`'s "a quote
  // didn't match your own words".
  "reference_echo",
  // Slice 3 — R8's attestation. A code of its own rather than folding into
  // `post_content`, because the two name different fixes: one is "edit your
  // text", the other is "tick the box", and a creator told the wrong one
  // edits text that was never the problem.
  "post_attestation",
  "evidence_unreadable",
  "export_classification",
  // Slice 2a — the metered model call.
  "inference_role",
  "profile_archived",
  "topup_in_flight",
  "insufficient_credits",
  "config_not_migrated",
  "autotopup_shortfall",
  "llm_unavailable",
  // Slice 3 — the composed voice inference. Only the first of these three is
  // something the creator can act on; the other two are ours, and their copy
  // says so rather than offering a button that cannot help.
  "not_enough_posts",
  "inference_unusable",
  "brain_pointer_divergence",
  // SLICE 2a FIX ROUND (2026-08-28). Three gates independently found that one
  // code per class cannot tell the truth here, because whether the creator
  // PAID does not follow from the class:
  //
  //   `llm_attempt_recorded` — a vendor failure the vendor still billed us for
  //     (`LlmError.billable`). `refused` and `schema_invalid` are `true` in
  //     `USAGE_OUTCOME_BILLABLE`, so they CONSUME the included run. The single
  //     `llm_unavailable` copy told those creators "your included build was
  //     not used", which is false, and their next press costs full price.
  //
  //   `debit_refused_after_call` — `InsufficientCreditsError` raised INSIDE the
  //     step-9 debit transaction, i.e. after the model answered and after the
  //     spend record committed. The `insufficient_credits` copy says the
  //     attempt "was refused BEFORE anything was called", which on this path is
  //     three false clauses in one sentence, on a money surface.
  "llm_attempt_recorded",
  // Slice 3, found by the BROWSER WALK: a reply the vendor cut off at this
  // server's own reply-length ceiling. Billable like its siblings, but the
  // remedy belongs to an operator rather than the reader, so it cannot share
  // their copy.
  "llm_truncated",
  // Slice 3, billing round 2: the cap on attempts we paid for and did not
  // charge for. A safety bound, not a product limit — the copy must not read
  // like the creator hit a plan ceiling.
  "uncharged_attempt_cap",
  "debit_refused_after_call",
  // SLICE 2a REMEDIATION (production BLOCK 4, 2026-08-28) — the concurrency
  // bound. TWO codes for ONE class, for the same reason the two above exist:
  // `RunSlotBusyError.reason` decides which sentence is TRUE, and the class
  // does not. `run_slot_busy` tells a creator they already have runs going;
  // `server_at_capacity` tells them we are full. Collapsing them would tell a
  // creator with no runs at all that they have too many.
  "run_slot_busy",
  "server_at_capacity",
  // Slice 2b-c / R4a. `applyReconciliationDelta` has no live caller in
  // app/** today, but its class is exported from @respin/db's root — see
  // the eslint allowlist's entry for the same forcing-function shape.
  "reconciliation_target",
  // Slice 3b, Stage B1 — the structured interview's two typed refusals.
  // `interview_answer` covers BOTH the real `InterviewAnswerError` (a race —
  // the interview UI validates length/shape client-side before it ever
  // reaches `saveInterviewDraft`, but the server re-validates and this is
  // its refusal if that ever disagrees) and the interview screen's OWN
  // field-named override of it (see `app/(product)/onboarding/interview/copy.ts`).
  "interview_answer",
  "interview_already_submitted",
  "unknown",
] as const;

export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number];

type ErrorClass = { new (...args: never[]): Error; readonly name: string };

/** instanceof order matters only if classes ever subclass each other; none do. */
const HANDLERS: { cls: ErrorClass; code: BillingErrorCode }[] = [
  { cls: AppBaseUrlMissingError, code: "app_base_url_missing" },
  { cls: AlreadySubscribedError, code: "already_subscribed" },
  { cls: CheckoutInFlightError, code: "checkout_in_flight" },
  { cls: BillingRoleError, code: "not_owner" },
  { cls: NoStripeCustomerError, code: "no_stripe_customer" },
  { cls: NoLiveSubscriptionError, code: "no_live_subscription" },
  { cls: NotPausedError, code: "not_paused" },
  { cls: PauseLengthError, code: "pause_length" },
  { cls: AutoTopupCapError, code: "auto_topup_cap" },
  { cls: StripeNotConfiguredError, code: "stripe_not_configured" },
  { cls: StripeSessionUrlMissingError, code: "stripe_session_url_missing" },
  { cls: UnknownTierPriceError, code: "unknown_tier_price" },
  { cls: CustomerMappingLostError, code: "customer_mapping_lost" },
  { cls: LedgerIntegrityError, code: "ledger_integrity" },
  { cls: ClockSkewError, code: "clock_skew" },
  { cls: ConfigUnavailableError, code: "config_unavailable" },
  { cls: WorkspaceAccessError, code: "workspace_access" },
  { cls: SubscriptionPausedError, code: "subscription_paused" },
  { cls: NotChargeableError, code: "not_chargeable" },
  { cls: PackPriceNotMappedError, code: "pack_price_not_mapped" },
  { cls: PackPriceUnavailableError, code: "pack_price_unavailable" },
  { cls: PackPriceMismatchError, code: "pack_price_mismatch" },
  { cls: InvoiceRecoveryUnavailableError, code: "invoice_recovery_unavailable" },
  { cls: NotRecoverableError, code: "not_recoverable" },
  { cls: WorkspacePausedError, code: "workspace_paused" },
  { cls: ProfileAccessError, code: "profile_access" },
  // Slice 3, and it is listed BEFORE its base `ProvenanceError` deliberately:
  // `billingErrorCode` walks this list in order, so a base class placed first
  // would swallow the subclass — the same ordering rule the `LlmError` family
  // comment below states.
  //
  // ITS OWN CODE rather than the base's, because the two mean different things
  // to the one reader who can act. An ordinary `provenance` refusal is a
  // creator's page going stale, and reloading fixes it. This one means a
  // recorded quote does not read back from the post it names, which is a data
  // anomaly no creator can resolve — it is unreachable on the sanctioned path
  // (`onboarding_inputs` has no update and no delete), so reaching it is an
  // operator's signal, and collapsing it into `provenance` would hide that
  // signal in the noise of ordinary staleness.
  { cls: EvidenceUnreadableError, code: "evidence_unreadable" },
  { cls: ExportClassificationError, code: "export_classification" },
  // Slice 4, listed BEFORE `ProvenanceError` for the same ordering reason
  // `EvidenceUnreadableError` states above: `ReferenceEchoError` is not a
  // subclass of `ProvenanceError` (the two mean opposite things), but keeping
  // every entry that touches the same provenance mechanism together is what
  // the next reader looking for one will look for the other beside.
  { cls: ReferenceEchoError, code: "reference_echo" },
  { cls: BrainEditBusyError, code: "brain_edit_busy" },
  { cls: BrainEditEmptyError, code: "brain-edit-all-check" },
  { cls: BrainEditLimitError, code: "brain_edit_limit" },
  { cls: BrainDocumentLimitError, code: "brain_document_limit" },
  { cls: BrainVersionLimitError, code: "brain_version_limit" },
  { cls: OnboardingInputLimitError, code: "onboarding_input_limit" },
  { cls: ExportBusyError, code: "export_busy" },
  { cls: ProvenanceError, code: "provenance" },
  { cls: ScopeForgeryError, code: "scope_forgery" },
  { cls: UsageRawError, code: "usage_raw" },
  { cls: ContentSchemaError, code: "brain_content_schema" },
  { cls: KindNotYetWritableError, code: "brain_kind_not_writable" },
  { cls: SchemaShapeError, code: "brain_schema_shape" },
  { cls: ClaimWalkError, code: "brain_claim_walk" },
  { cls: ContentWalkError, code: "brain_content_walk" },
  { cls: BrainReasonError, code: "brain_reason" },
  { cls: BrainRoleError, code: "brain_role" },
  { cls: SegmenterUnavailableError, code: "segmenter_unavailable" },
  { cls: ProfileCapError, code: "profile_cap" },
  { cls: ProfileRoleError, code: "profile_role" },
  { cls: ProfileNameError, code: "profile_name" },
  { cls: PostContentError, code: "post_content" },
  // Slice 3 (R8). Listed beside its sibling because both are refusals of the
  // SAME form submit, and a reader debugging one will look for the other.
  { cls: PostAttestationError, code: "post_attestation" },
  { cls: UnchargedAttemptCapError, code: "uncharged_attempt_cap" },
  // Slice 2a. `LlmError` is the BASE class of every provider failure and is
  // matched LAST among its family on purpose: `billingErrorCode` walks this
  // list in order, and a base class placed before a subclass would swallow it.
  // There are no `LlmError` subclasses in this list — deliberately: the page
  // says one honest thing about "the model provider did not answer", and
  // enumerating six subclasses in `app/**` would be a second classification of
  // vendor failures beside the one that already travels on the error itself.
  { cls: InferenceRoleError, code: "inference_role" },
  // Slice 3. `NotEnoughPostsError` is NOT a subclass of `AssemblyError` — it is
  // its own class precisely so the one refusal a creator can act on cannot be
  // swallowed by the one they cannot. Order is still explicit here because
  // `billingErrorCode` walks this list top-down.
  { cls: NotEnoughPostsError, code: "not_enough_posts" },
  { cls: AssemblyError, code: "inference_unusable" },
  { cls: BrainPointerDivergenceError, code: "brain_pointer_divergence" },
  { cls: ProfileArchivedError, code: "profile_archived" },
  // THE FALLBACK, not the usual path: `billingErrorCode` branches on
  // `RunSlotBusyError.reason` BEFORE walking this table, so a real refusal
  // renders `run_slot_busy` or `server_at_capacity` according to what actually
  // happened. This entry exists because the completeness test enumerates the
  // facades' error CLASSES, and a class reachable only through an instance
  // branch would read to that test as a class with no copy.
  //
  // IT FALLS BACK TO `server_at_capacity`, THE ONE THAT BLAMES US. If the
  // reason were ever neither value, we would not know whether this creator has
  // runs of their own — and telling someone with none that they have too many
  // is the false statement; telling them we are busy is not.
  { cls: RunSlotBusyError, code: "server_at_capacity" },
  { cls: TopupInFlightError, code: "topup_in_flight" },
  { cls: InsufficientCreditsError, code: "insufficient_credits" },
  { cls: PostCallDebitError, code: "debit_refused_after_call" },
  { cls: ConfigNotMigratedError, code: "config_not_migrated" },
  { cls: AutoTopupShortfallError, code: "autotopup_shortfall" },
  { cls: AutoTopupUnnamedRefusalError, code: "autotopup_shortfall" },
  { cls: LlmError, code: "llm_unavailable" },
  { cls: ReconciliationTargetError, code: "reconciliation_target" },
  // Slice 3b, Stage B1.
  { cls: InterviewAnswerError, code: "interview_answer" },
  { cls: InterviewDraftSubmittedError, code: "interview_already_submitted" },
];

/** The class names this module claims to handle (read by the completeness test). */
/**
 * Class name -> the code the CLASS TABLE maps it to.
 *
 * Exported so a test can derive which codes a given operation can produce from
 * the classes its source actually throws, rather than from a hand-kept list
 * that falls behind the call graph — which is what let the two run-slot codes
 * ship with no copy on the one screen that raises them (compliance gate,
 * 2026-08-28).
 *
 * NOT the whole story on its own: `billingErrorCode` branches on the INSTANCE
 * first for two classes, so a class here can also produce a code that is not
 * its table entry. `INSTANCE_BRANCH_CODES` below carries those, and the test
 * unions the two.
 */
export const CODE_FOR_ERROR_CLASS: Readonly<Record<string, BillingErrorCode>> =
  Object.fromEntries(HANDLERS.map((h) => [h.cls.name, h.code]));

/**
 * The codes `billingErrorCode` can return for a class WITHOUT using that
 * class's table entry, because it branches on the instance first.
 *
 * Kept beside the branches themselves; a new instance branch that is not
 * recorded here is invisible to the derivation above, so the test that reads it
 * asserts this map is non-empty and names every class the branches test.
 */
export const INSTANCE_BRANCH_CODES: Readonly<
  Record<string, readonly BillingErrorCode[]>
> = {
  LlmError: ["llm_attempt_recorded", "llm_truncated"],
  RunSlotBusyError: ["run_slot_busy", "server_at_capacity"],
};

/**
 * Classes that `billingErrorCode` resolves through a BASE class rather than
 * through their own table entry.
 *
 * `billingErrorCode` matches with `instanceof`, so a subclass of a table entry
 * is handled without appearing in the table. That is deliberate for the vendor
 * family: this facade re-exports only the base `LlmError` (see its docblock —
 * enumerating six subclasses in `app/**` would be a second classification of
 * vendor failures beside the one that already travels on the error), so
 * `app/**` cannot even name `LlmUnavailableError`.
 *
 * WHY IT IS WRITTEN DOWN. A test derives which codes a screen must have copy
 * for from the classes an operation's source constructs, and that derivation
 * cannot follow a prototype chain it has no constructor for. The honest answer
 * is to record the relationship next to the table it extends rather than to
 * widen the package boundary so a test can import the subclasses — which would
 * make `@respin/llm` importable from `app/**` to satisfy a test, i.e. loosen a
 * tenancy boundary for a convenience.
 *
 * The map is small on purpose and it is NOT a licence to hand-maintain the
 * derivation: a class covered by neither the table nor an entry here fails the
 * test, which is the defect class (a refusal rendering "Something went wrong").
 */
export const ERROR_CLASS_COVERED_BY_BASE: Readonly<Record<string, string>> = {
  LlmNotConfiguredError: "LlmError",
  LlmUnavailableError: "LlmError",
  LlmRateLimitedError: "LlmError",
  LlmRefusedError: "LlmError",
  LlmSchemaInvalidError: "LlmError",
  LlmHostNotAllowedError: "LlmError",
};

export const HANDLED_ERROR_CLASS_NAMES: string[] = HANDLERS.map(
  (h) => h.cls.name
);

export type BillingErrorCopy = { title: string; detail: string };

/**
 * Every message names what happened and what the reader can DO. Where the
 * remedy belongs to an operator rather than a creator (a missing key, a broken
 * ledger), it says so plainly instead of offering a button that cannot help —
 * a refusal whose printed remedy is not an action the reader may take is the
 * failure mode CLAUDE.md's 2026-07-30 lesson is about.
 */
export const BILLING_ERROR_COPY: Record<BillingErrorCode, BillingErrorCopy> = {
  app_base_url_missing: {
    title: "This server does not know its own address",
    detail:
      "Checkout needs an absolute address to send you back to, and rather than guess one the action stopped. Nothing was charged. An operator needs to set BETTER_AUTH_URL in respin/.env.local (for local development that is http://localhost:3000) and restart the app.",
  },
  already_subscribed: {
    title: "This workspace already has a subscription",
    detail:
      "Starting a second checkout would create a second Stripe subscription and bill you twice, so it was refused. Change or cancel your plan in the Customer Portal instead. If your first payment never completed, Stripe emailed an invoice you can still pay — or wait about a day for that attempt to expire and start again.",
  },
  checkout_in_flight: {
    title: "A checkout is already open for this workspace",
    detail:
      "Finish the checkout you already started, or leave it — an abandoned checkout lapses within 24 hours and you can pick a different plan then. Nothing has been charged.",
  },
  not_owner: {
    title: "Only the workspace owner can change billing",
    detail:
      "Ask the owner of this workspace to make the change. Nothing was modified.",
  },
  no_stripe_customer: {
    title: "This workspace has no billing account yet",
    detail:
      "A billing account is created the first time you subscribe or buy a credit pack. Start there, then the Customer Portal becomes available.",
  },
  no_live_subscription: {
    title: "No live subscription",
    detail:
      "This action needs a subscription that still exists in Stripe. A cancelled subscription cannot be reused — subscribe again to continue.",
  },
  not_paused: {
    title: "Nothing to resume",
    detail:
      "This workspace has no paused subscription. If you paused moments ago, the pause is recorded when Stripe confirms it — reload and try again.",
  },
  pause_length: {
    title: "That pause length is not allowed",
    detail:
      "Choose a whole number of months inside the range shown on the pause form.",
  },
  auto_topup_cap: {
    title: "Auto-top-up needs a monthly cap",
    detail:
      "Enter the most you are willing to be charged in a calendar month, as a positive amount. Auto-top-up stays off until a cap is set.",
  },
  stripe_not_configured: {
    title: "Billing is not configured on this server",
    detail:
      "No Stripe key is set, so no billing action can run. An operator needs to put STRIPE_SECRET_KEY in respin/.env.local (see respin/env.example), run `pnpm stripe:setup`, and paste the printed price ids into /admin/config.",
  },
  stripe_session_url_missing: {
    title: "Stripe returned something we did not expect",
    detail:
      "Nothing was charged. Try again; if it keeps happening, an operator should compare the checkout session in the Stripe dashboard against the API version this app is pinned to.",
  },
  unknown_tier_price: {
    title: "No Stripe price is mapped for that plan",
    detail:
      "This install has not been finished. An operator needs to run `pnpm stripe:setup` and paste the printed price ids into /admin/config as `stripePriceMap`.",
  },
  customer_mapping_lost: {
    title: "This workspace's billing record is no longer there",
    detail:
      "Nothing was charged. This usually means the workspace was deleted while the page was open. Reload; if the workspace still exists, try again. The refusal code, error type and any server-derived context are recorded for an operator; customer and exception details are not logged.",
  },
  ledger_integrity: {
    title: "Your credit history could not be read",
    detail:
      "This will not fix itself on a retry, and it is not something you can correct from here. Nothing was charged and no credits were spent. Please contact support; the refusal code, error type and any server-derived context are recorded for an operator.",
  },
  clock_skew: {
    title: "The server clock and the database clock disagree",
    detail:
      "The action was refused rather than recorded at the wrong time. Nothing was charged. This is an operator problem; the refusal code, error type and any server-derived context are recorded.",
  },
  config_unavailable: {
    title: "Runtime configuration is missing or invalid",
    detail:
      "Prices, allowances and credit costs all come from a versioned config row, and this server has none it can read — so nothing is being guessed. An operator needs to seed the database (`pnpm db:seed`) or append a valid version at /admin/config.",
  },
  workspace_access: {
    title: "You do not have access to this workspace",
    detail:
      "Sign in with the account that owns it, or ask its owner for access. Nothing was modified.",
  },
  // Audit 2026-08-17 remediation (R1). Each names what happened AND what the
  // reader can do — and where the remedy belongs to an operator rather than a
  // creator, it says so instead of offering a button that cannot help.
  subscription_paused: {
    title: "Your subscription is paused",
    detail:
      "A pause means no charges, so this was refused before anything reached Stripe — nothing was charged. Resume your subscription from this page and then try again. Your existing credits are frozen, not lost.",
  },
  not_chargeable: {
    title: "There is an unpaid invoice on this subscription",
    detail:
      "Stripe has stopped collecting on this subscription, so we will not attempt an automatic charge against it. Nothing was charged. Open the Customer Portal and settle the outstanding invoice — the subscription can still be recovered — and this becomes available again.",
  },
  pack_price_not_mapped: {
    title: "Credit packs are not set up on this server",
    detail:
      "No Stripe price is mapped for the credit pack, so there is nothing to charge. Nothing was charged. An operator needs to run `pnpm stripe:setup` and paste the printed price ids into /admin/config as `stripePriceMap`.",
  },
  pack_price_unavailable: {
    title: "The credit-pack price cannot be charged",
    detail:
      "Stripe has the pack price in a state a charge cannot be built from — archived, or with no fixed amount, or in the wrong currency. Nothing was charged. An operator needs to check the pack price in the Stripe dashboard; the refusal code, error type and any server-derived context are recorded.",
  },
  pack_price_mismatch: {
    title: "The credit-pack price does not match this server's configuration",
    detail:
      "Stripe and the app disagree about what a pack costs, so the charge was refused rather than guessing which price is right — nothing was charged, and you have not been billed twice. This is an operator problem: compare the Stripe dashboard with /admin/config, where the app's figure is corrected. The refusal code and error type are recorded without either amount.",
  },
  // Audit 2026-08-17 remediation (R2) — the `incomplete` remedy's two refusals.
  invoice_recovery_unavailable: {
    title: "There is no invoice left to pay",
    detail:
      "Nothing was charged. Reload this page: if your payment has since gone through your plan is already active, and if the attempt has lapsed (Stripe expires an unpaid first invoice after about a day) you can start a new plan from here.",
  },
  not_recoverable: {
    title: "That is not the right fix for this subscription",
    detail:
      "Paying a one-off invoice only helps a subscription whose FIRST payment never completed. Nothing was charged. Update your card in the Customer Portal instead — that is what recovers a subscription whose renewal failed.",
  },
  // M2a — the four typed refusals @respin/db owns.
  inference_role: {
    title: "You cannot run this for this creator",
    detail:
      "Running a model call spends the workspace's credits, so it is not something a viewer can do. Nothing was spent and nothing was called. Ask the workspace owner for editor access if you need to run it.",
  },
  profile_archived: {
    title: "This creator profile is archived",
    detail:
      "Nothing new is generated for an archived profile. Its brain and its posts are untouched and still exported — archiving only takes the profile out of your plan's profile allowance. Reactivate it first if you want to run this.",
  },
  topup_in_flight: {
    title: "Not enough credits yet — a top-up is on its way",
    detail:
      "This attempt was refused and nothing was spent: no model was called and your included build was not used. A top-up has been started, and credits land when your bank settles it. Try again once your balance updates on this page — and if it does not, buy a pack from Billing rather than waiting.",
  },
  insufficient_credits: {
    title: "Not enough credits for this",
    detail:
      "This attempt was refused BEFORE anything was called, so nothing was spent and your included build was not used. Buy an overage pack from Billing, or turn on auto-top-up so the credits are bought automatically next time — the attempt that triggers it is still refused, so you retry once they land.",
  },
  config_not_migrated: {
    title: "This server's pricing configuration is mid-deploy",
    detail:
      "The running code knows what this costs, but the stored configuration it would be billed against does not carry that price yet — so the charge could not be reconciled afterwards, and it was refused rather than guessed. Nothing was spent. This clears itself once an administrator runs the configuration migration; it needs no new deploy.",
  },
  autotopup_shortfall: {
    title: "Something went wrong on our side",
    detail:
      "A top-up was requested for an amount that does not make sense, which is a fault in our code rather than anything you did. Nothing was charged. Please tell us what you were doing when this appeared.",
  },
  llm_attempt_recorded: {
    title: "The model answered, but not usably",
    detail:
      "The provider returned something we could not use, and it charged us for the attempt — so this one counted: if it was your included run for this creator, that run is now used. Nothing was taken from your credit balance. Try again; if it keeps happening, tell us rather than rewording anything, because this attempt sends a fixed message of ours and nothing you wrote.",
  },
  debit_refused_after_call: {
    title: "The run completed but could not be charged",
    detail:
      "The model answered and we recorded the attempt, then the charge was refused because the balance had already gone. Nothing was taken from your balance and the reply was not kept. Buy an overage pack from Billing, or turn on auto-top-up, then run it again.",
  },
  llm_unavailable: {
    title: "The model provider did not answer",
    detail:
      "Nothing was spent and your included run was not used. This is almost always brief — try again in a minute. There is nothing for you to reword: this attempt sends a fixed message of ours, never anything you wrote."
  },
  workspace_paused: {
    title: "This workspace is paused",
    detail:
      "While a pause is on, credits are frozen and nothing that would spend them runs — including building or updating a creator brain. Nothing was charged and nothing was lost: your credits and your existing brain are exactly where you left them. Resume from the billing page and this becomes available again.",
  },
  profile_access: {
    title: "That creator profile is not available here",
    detail:
      "It either does not exist or belongs to a different workspace, and this page will not say which — that distinction would let anyone probe for other people's profiles. Nothing was changed. If it should be here, ask the workspace owner to check the profile list.",
  },
  provenance: {
    title: "A quoted line did not match your own words",
    detail:
      "Every claim in a brain has to point at something you actually wrote, and one of the quotes did not appear where it said it did — so it was refused rather than stored. Nothing was saved and no credits were spent. Try the build again; if it keeps happening, contact support. The refusal code and error type are recorded without the quote.",
  },
  "brain-edit-all-check": {
    title: "Keep at least one rule stated",
    detail:
      "[check] is available when you do not want the product to state a value yet, but a whole brain document cannot be blanked to [check]. Nothing was changed. Leave at least one rule stated in this document, then create the replacement draft again.",
  },
  brain_edit_busy: {
    title: "Another Brain edit is still being saved",
    detail:
      "Another Brain edit in this workspace is already in progress, so this request stopped before creating a replacement. Wait for it to finish, reload and review the current version, then submit your edit again.",
  },
  brain_edit_limit: {
    title: "That edit is too large to submit",
    detail:
      "The edit has too many fields, a field or pointer is too long, or the combined replacement is too large for one request. Nothing was changed and the version already in force is untouched. Edit fewer fields at once or shorten the changed text, then submit again.",
  },
  brain_document_limit: {
    title: "That brain version is too large to store",
    detail:
      "The proposed Brain version has too many claim or evidence entries, or its combined text is too large. Nothing was stored and the version already in force is unchanged. Shorten or reduce the claims and evidence, then rebuild or submit the replacement again.",
  },
  brain_version_limit: {
    title: "This creator's Brain history is full",
    detail:
      "This creator profile has reached the retained Brain-version limit, so another immutable version was not stored. Export the complete history, then contact support before making more revisions. The version already in force is unchanged.",
  },
  onboarding_input_limit: {
    title: "That creator input cannot be stored",
    detail:
      "The normalized input is blank or too long, one of its fields is too long, or this creator profile has reached its retained-input limit. Shorten the input and try again. If the profile is full, contact support before adding more material.",
  },
  export_busy: {
    title: "A complete export is already being prepared",
    detail:
      "Another export for this workspace is still in progress. Wait for that download to finish, then try the export again. No Brain data was changed.",
  },
  // Slice 4 (R12, R13). NAMES THE CATEGORY, NEVER THE SPECIFIC POST OR SPAN —
  // this code arrives through the same `?e=`/return-value channel every other
  // refusal does, which carries a code and never a message, so the exact quote
  // and reference id `ReferenceEchoError` names are omitted from both browser
  // and log. What this copy adds over the generic `provenance`
  // entry is the ACTUAL remedy for THIS refusal: rewrite in your own words,
  // not "reload and retry" — retrying an echo refusal unchanged fails
  // identically. R13: it does not say the result is original or safe to
  // publish — R-3 is a control, not a guarantee (REQ-I04).
  reference_echo: {
    title: "This repeats one of your reference posts too closely",
    detail:
      "A reference post is kept only to find the pattern behind it, never to be repeated word for word — so a draft that echoes a long stretch of one, or quotes more of one than the limit allows, is refused rather than stored. Nothing was saved and no credits were spent. Rewrite the field describing the mechanism in your own words, or cite a shorter piece of the reference post, and try again. This check does not promise the result is original or safe to publish — it only stops the one thing it can measure: repeating a reference post's own wording.",
  },
  scope_forgery: {
    title: "The action was refused before it touched any data",
    detail:
      "A safety check that guards which workspace and which profile an action may reach did not pass. That is never something you can cause by using the product normally, so it means a bug rather than a mistake on your part. Nothing was read and nothing was written. Please contact support; the refusal code, error type and any server-derived context are recorded.",
  },
  usage_raw: {
    title: "The action was refused before anything was recorded",
    detail:
      "A safety check on what may be stored alongside a usage record did not pass, so nothing was written. Nothing you typed was lost and no credits were spent. This is never something you can cause by using the product normally, so it means a bug rather than a mistake on your part. Please contact support; the refusal code, error type and any server-derived context are recorded.",
  },
  // Slice 2b-c / R4a. There is no product action that reaches this today — it
  // is `applyReconciliationDelta`'s "this vendor cost-reconciliation event
  // named an id that no longer exists" refusal, an operator-only path with no
  // live caller yet. Copy exists only to satisfy the completeness scan (its
  // own comment: a class exported from @respin/db's root is required to have
  // copy the moment it exists, not the moment a caller reaches it) — same
  // "never something you did" shape as scope_forgery/usage_raw above.
  reconciliation_target: {
    title: "That reconciliation could not be applied",
    detail:
      "A cost-reconciliation event named a record that no longer exists. This is never something you can cause by using the product normally, so it means a bug or a stale reference rather than a mistake on your part. Please contact support; the refusal code, error type and any server-derived context are recorded.",
  },
  // Slice 3b, Stage B1. The interview screen replaces this GENERIC copy with
  // one that names the exact field, drawn entirely from its own closed
  // vocabulary (`app/(product)/onboarding/interview/copy.ts`) — this entry is
  // the fallback for anywhere else `InterviewAnswerError` could theoretically
  // surface, and for the completeness scan itself.
  interview_answer: {
    title: "That answer could not be saved",
    detail:
      "One of your interview answers is too long, or a list has too many items. Nothing else on the draft was lost. Shorten that answer and save again.",
  },
  interview_already_submitted: {
    title: "This interview has already been submitted",
    detail:
      "Once submitted, an interview's answers are fixed — resuming only applies to a draft that has not been submitted yet. Nothing was changed. To change something you already answered, edit the brain document it produced instead.",
  },
  brain_content_schema: {
    title: "That brain document did not match its shape",
    detail:
      "A brain document has a fixed set of fields so that every claim about you is one you can confirm or correct individually, and this one carried a field outside that set — so it was refused rather than stored. Nothing was saved and no credits were spent. Try building the document again; if it keeps happening the shape needs widening, which is a code change. The refusal code and error type are recorded without the document content.",
  },
  not_enough_posts: {
    title: "A few more posts first",
    detail:
      "Reading a voice from one or two posts would be reading one post twice, so nothing was sent to a model and nothing was spent. Paste a few more posts you wrote yourself and run it again — the page shows how many you have and how many are needed.",
  },
  inference_unusable: {
    title: "The model's answer could not be used",
    detail:
      "The reply did not come back in a form we could check — most often a quote that is not actually in any of your posts. Rather than store a rule we cannot show you the evidence for, nothing was saved. Your run was still made, so it counted; try again, and if it keeps happening it is our problem to fix, not yours.",
  },
  brain_pointer_divergence: {
    title: "We could not line the evidence up with the fields",
    detail:
      "This one is ours, not yours. The model answered and we could not match its quotes to the fields they belong to, so nothing was written rather than storing a version you would never be able to confirm. Your run was made and counted. Please try again, and tell us if it repeats.",
  },
  brain_kind_not_writable: {
    title: "This part of your brain is not written from onboarding",
    detail:
      "Your performance notes are written from posted results that have been verified, never inferred from the material you uploaded — inferring them now would be a claim about how your content performs with no result behind it. Nothing was saved. This document stays empty until you have at least three verified, comparable results to write it from, and results logging is not built yet, so today there is nothing for you to do here.",
  },
  brain_schema_shape: {
    title: "The brain document shapes are misconfigured",
    detail:
      "A safety check that runs when the server starts found a brain-document shape that would let a claim be stored without a way for you to confirm it. This is never something you can cause by using the product; it means a bug. Contact support; the refusal code and error type are recorded, but the field value is not logged.",
  },
  brain_claim_walk: {
    title: "The action was refused before anything was stored",
    detail:
      "The server could not agree with itself about which parts of a brain document are claims you would need to confirm, so it refused rather than storing a document you could not fully review. Nothing was saved and no credits were spent. Please contact support if it keeps happening; the refusal code and error type are recorded without the document content.",
  },
  brain_content_walk: {
    title: "That document was too deeply nested to check",
    detail:
      "Before a brain document is stored it is checked line by line against the reference posts you have uploaded, and this one was structured too deeply for that check to finish — so it was refused rather than stored unchecked. Nothing was saved. Try again with a simpler structure; the refusal code and error type are recorded without post or document content.",
  },
  brain_reason: {
    title: "The action was refused before anything was stored",
    detail:
      "Every version of your brain records why it exists, and the reason is chosen from a fixed set rather than written as free text, so that a stored reason can never contain a detail nobody verified. This request carried something outside that set. Nothing was saved and no credits were spent; the refusal code and error type are recorded without the rejected value.",
  },
  brain_role: {
    title: "Your role cannot confirm or activate this",
    detail:
      "Confirming a brain document, and activating a version of it, are the two acts that decide what the product believes about this creator and then acts on — so they need at least editor access, and you are a viewer. Nothing was changed. Ask a workspace owner to make the change, or to raise your role in workspace settings.",
  },
  segmenter_unavailable: {
    title: "This server cannot run the reference check",
    detail:
      "The check that stops your brain from repeating somebody else's post needs full language support in the server runtime, and it is not available here — so rather than run a weakened version of that check, the action stopped. Nothing was saved. An operator needs to run the app on a Node build with full ICU (full-icu) and restart it.",
  },
  profile_cap: {
    // IT DOES NOT NAME AN UPGRADE AS THE REMEDY. A paid tier's higher
    // allowance has no route to it yet — the onboarding page binds one profile
    // and ships no switcher — so telling a capped creator to "move to a plan
    // with a higher limit" would take money for something they cannot use
    // (billing gate, 2026-08-27). The remedy returns when the switcher does.
    title: "Your plan's creator profiles are all in use",
    detail:
      "Each plan includes a set number of creator profiles, and this workspace is using all of them. Nothing was created and nothing was lost — the onboarding page shows your plan and how many profiles it includes.",
  },
  profile_role: {
    // ONE CODE, THREE ACTS. `ProfileRoleError` covers creating a profile,
    // adding a post, and writing a brain document, so this copy may not
    // describe only the first — a viewer whose PASTE was refused used to read
    // "Nothing was created" about a post (tenancy gate, 2026-08-27). The `?e=`
    // channel carries a code and not the act, so the copy covers the class.
    title: "Viewer access cannot change this creator's record",
    detail:
      "Adding creator profiles or posts needs at least editor access — profiles come out of the workspace's paid allowance, and posts become part of a creator's permanent record. Nothing was saved. Ask a workspace owner to make the change, or to give you editor access.",
  },
  profile_name: {
    title: "That profile name cannot be used",
    detail:
      "A creator profile name has to be one line of visible text, at most 80 characters, and not blank. Nothing was created. Edit the name and submit it again.",
  },
  evidence_unreadable: {
    title: "Part of this brain draft could not be shown",
    detail:
      "One of the quotes recorded for this draft does not match the post it names, so the page stopped rather than showing you a quote it cannot prove came from you. Nothing was changed and nothing you saved was lost. This is not something you can fix — tell us, and build a fresh draft in the meantime.",
  },
  export_classification: {
    title: "The export is missing a registered data reader",
    detail:
      "A creator-data table is marked for export but the exporter has no scoped reader for it, so the download stopped rather than silently omit data. This is an operator problem, not something you can fix in the form. Please contact support; the refusal code and error type are recorded, and an operator can compare the export registry with its scoped readers.",
  },
  post_attestation: {
    title: "That post was not saved",
    detail:
      "Posts kept as your own are the only material a voice brain is inferred from, so the product will not label one that way unless you say you wrote it. Nothing was saved, and everything you had already added is still there. Tick the confirmation under the box and submit it again.",
  },
  post_content: {
    title: "That post was not saved",
    detail:
      "Paste the text of a single post — not blank, and up to 20,000 characters. Nothing was saved, and everything you had already added is still there. Shorten it or split it into the separate posts it came from, and try again.",
  },
  run_slot_busy: {
    title: "This creator already has as many runs going as your plan allows",
    detail:
      "Nothing was spent, no model was called, and your included build was not used — this attempt was refused before any of that. Your plan allows a set number of model calls at the same time; wait for one of the runs already going to finish, then try again.",
  },
  // THE SENTENCE THAT IS NOT HERE: "Upgrading raises the number." Three
  // reviewers found it independently and it is false for two tiers of four —
  // `concurrencyLimits` is `{free: 2, creator: 2, pro: 4, studio: 8}`, so the
  // Free creator most likely to hit this limit would pay $10/mo for Creator and
  // get the same 2, and Studio has nothing above it. It is the defect
  // `profile_cap` twenty lines up already records ("telling a capped creator to
  // move to a higher plan would take money for something they cannot use"), and
  // non-negotiable 6 forbids exactly this on a money surface.
  //
  // Deleted rather than corrected to name Pro: a refusal is not a sales
  // surface, the relation between tiers lives in config and would go stale
  // here, and "wait for a run to finish" is the remedy that is true for every
  // tier including the top one.
  server_at_capacity: {
    title: "We are at capacity right now",
    detail:
      "This is us, not you, and not your plan: the server is already running as many model calls as it allows at once. Nothing was spent, no model was called, and your included build was not used. Try again in a moment.",
  },
  llm_truncated: {
    title: "The model's answer was cut off",
    detail:
      "The answer came back longer than this server's reply-length limit allows, so nothing usable arrived. Nothing was taken from your credit balance, and it did NOT use your included build — your next run is still included. This is a server setting rather than anything you did, and trying again will hit the same limit until an operator raises it, so tell us rather than retrying.",
  },
  uncharged_attempt_cap: {
    title: "This creator's runs keep failing on our side",
    // NOT "recent", and no promised per-creator clearing (billing gate round
    // 3, 2026-08-29): the count is lifetime over an append-only table, and the
    // clearing mechanism is an operator fixing the root cause — see R-48's
    // addendum and the class's own comment in @respin/credits errors.ts.
    detail:
      "Runs for this creator have repeatedly failed in a way that cost us money and cost you nothing, so the product has stopped trying rather than keep burning them. Nothing was spent, no model was called, and your included build is untouched. There is nothing for you to change — this is a fault on our side; please tell us so we can fix it.",
  },
  unknown: {
    title: "Something went wrong",
    detail:
      "The action did not complete and nothing was charged. Try again; if it keeps happening, contact support. The refusal code, error type and any server-derived context are recorded without exception details.",
  },
};

export function billingErrorCode(err: unknown): BillingErrorCode {
  // BEFORE THE CLASS TABLE, because for a vendor failure the class does NOT
  // decide whether the creator paid — the instance does. `LlmError.billable`
  // is exactly that fact, and it already travels on the error (the facade
  // re-exports only the base class for this reason). `refused` and
  // `schema_invalid` are `true` in `USAGE_OUTCOME_BILLABLE`, so those attempts
  // CONSUME the included run; folding them into `llm_unavailable` told those
  // creators "your included build was not used" and left their next press
  // costing full price (three gates, 2026-08-28).
  // TRUNCATION FIRST, because it is billable and the branch below would
  // otherwise swallow it. That branch is not wrong about the MONEY — the
  // attempt was paid for — it is wrong about the REMEDY, which is the half a
  // refusal exists to deliver. "The provider had a problem, try again" sends
  // a creator to press a button that fails identically every time:
  // truncation is deterministic for a given input size and the dial is
  // `llm.maxOutputTokens` in the stored config, which is an operator's.
  //
  // Keyed on `LlmError.operatorRemedy`, NOT on a subclass: the facade
  // exports only the base to app/**, so the discriminator travels on the
  // instance — exactly the precedent `billable` set one line down.
  if (err instanceof LlmError && err.operatorRemedy) return "llm_truncated";
  if (err instanceof LlmError && err.billable) return "llm_attempt_recorded";
  // SAME REASON, second instance. `RunSlotBusyError` carries WHY the slot was
  // refused, and the two reasons are two different true sentences — one about
  // the creator's own runs, one about the server. A class-only mapping can
  // only pick one of them, and whichever it picked would be false for the
  // other half of the creators who hit it.
  if (err instanceof RunSlotBusyError) {
    return err.reason === "workspace_limit"
      ? "run_slot_busy"
      : "server_at_capacity";
  }
  for (const h of HANDLERS) {
    if (err instanceof h.cls) return h.code;
  }
  return "unknown";
}

export function isBillingErrorCode(
  value: string | undefined | null
): value is BillingErrorCode {
  return (
    typeof value === "string" &&
    (BILLING_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** Copy for a caught error — never the error's own message (see the header). */
export function billingErrorDisplay(err: unknown): BillingErrorCopy & {
  code: BillingErrorCode;
} {
  const code = billingErrorCode(err);
  return { code, ...BILLING_ERROR_COPY[code] };
}

/** Copy for a `?e=` code carried back from a server action's redirect. */
export function billingErrorFromCode(
  value: string | undefined | null
): (BillingErrorCopy & { code: BillingErrorCode }) | null {
  if (value === undefined || value === null || value === "") return null;
  const code: BillingErrorCode = isBillingErrorCode(value) ? value : "unknown";
  return { code, ...BILLING_ERROR_COPY[code] };
}
