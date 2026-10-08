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
  AutoTopupAuthorityKeyError,
  AutoTopupAuthoritySignatureError,
  BillingContactProviderError,
  PublicSampleSpinEnablementError,
  PublicSampleSpinNotConfiguredError,
  BillingReauthenticationError,
  BillingRoleError,
  CheckoutInFlightError,
  CheckoutReconciliationRequiredError,
  TierCheckoutAuthorityError,
  TierCheckoutRolloutError,
  BalanceIsolationError,
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
  TierPriceChangedError,
  TierPriceMismatchError,
  TierPriceUnavailableError,
  PackPriceNotMappedError,
  PackPriceUnavailableError,
  PauseLengthError,
  StripeNotConfiguredError,
  StripeAccountBindingError,
  StripeSessionUrlMissingError,
  SubscriptionPausedError,
  UnknownTierPriceError,
  // Slice 2a — the metered model call. Five of these are new classes; two
  // (`InsufficientCreditsError`, `AutoTopupShortfallError`) became
  // app-reachable for the first time because `runInference` is the product's
  // first app-reachable SPEND.
  AutoTopupShortfallError,
  AutoTopupReconciliationRequiredError,
  AutoTopupRolloutError,
  AutoTopupAttemptIntegrityError,
  AutoTopupUnnamedRefusalError,
  ConfigNotMigratedError,
  AssemblyError,
  UnchargedAttemptCapError,
  BrainPointerDivergenceError,
  InferenceRoleError,
  NotEnoughPostsError,
  InsufficientCreditsError,
  LlmError,
  // Audit P3-R2 (R-158): the assembled-input ceiling's refusal, re-exported as
  // a VALUE by the facade because `app/**` may not import `@respin/llm`.
  LlmInputTooLargeError,
  ProfileArchivedError,
  RunSlotBusyError,
  TopupInFlightError,

  PostCallDebitError,
  // Slice 6 (stage D) — every refusal `respinCredits.generate` can raise.
  // FIFTEEN classes, and none of them was reachable before this slice: eleven
  // are @respin/credits' own, one (`GenerationAttemptStateError`) is @respin/db's
  // and re-exported by the credits facade because the generate path is what
  // raises it, and five are `@respin/modes`' — re-exported as VALUES by that
  // facade precisely so this file can `instanceof` them, since `@respin/modes`
  // itself is denied to app/** (R-64).
  BrainNotActivatedError,
  GenerationAlreadyRefusedError,
  GenerationAssemblyError,
  SpinSimilarityError,
  GenerationAttemptStateError,
  GenerationInFlightError,
  GenerationPayloadMismatchError,
  GenerationRecoveryRequiredError,
  GenerationUnchargedAttemptCapError,
  GenerationUnchargedCostCapError,
  // Audit P3-R3 / P3-A4 (R-158, R-157).
  GenerationWindowCostCapError,
  GenerationHeldError,
  HeldDraftUnavailableError,
  KillTestError,
  ModeNotInPlanError,
  NoCreatorRulesError,
  ScriptOutputError,
  UnknownModeError,
  UnpricedOperationError,
  // SLICE 7 (stage D) — the two classes `@respin/credits` added and stage C
  // left without copy, deliberately, because this file is stage D's. Both are
  // raised BEFORE the vendor is contacted, so both copies say plainly that
  // nothing was spent, and neither sells anything.
  RevisionParentError,
  UnknownEntitlementTierError,
  // R-148 (launch L1): the creative form control's one refusal, raised BEFORE
  // any claim or provider call, branched on its closed `reason` below.
  CreativeRequestError,
  // Launch L2 (R-151): a confirmed quote that moved, and the no-concept
  // entrance with nothing confirmed to start from.
  GenerationQuoteChangedError,
  ConceptContextInsufficientError,
  // Launch L4 (R-153): a saved-page revision the page never offered.
  RevisionPresetError,
  // SLICE 8c (R8/R13) — the two refusals `submitPastedReference` adds. Both
  // are raised BEFORE any row is written and before any credit moves, so both
  // copies say so; the tier one names the plans and sells nothing (the
  // `profile_cap` precedent), and the input one branches on the INSTANCE's
  // `field` (the `RunSlotBusyError` precedent) so a creator is told which box
  // to fix.
  PastedReferenceInputError,
  PastedReferenceTierError,
  // ...and `settleParkedAutopsies` -> `refundCredits`' one typed refusal,
  // reachable from a `/trends` PAGE LOAD (the one write that page makes).
  RefundSourceNeverExpiresError,
  PerformanceLearningConfigUnavailableError,
  // Not a class — the one SENTENCE a windowed uncharged-billable cap owes its
  // reader, imported rather than retyped so this map and the package message
  // cannot disagree about whether that refusal clears itself.
  UNCHARGED_CAP_WINDOW_CLAUSE,} from "@respin/credits/app-server";
import { ConfigUnavailableError } from "@respin/config/app-server";
import {
  ECHO_NO_GUARANTEE_CLAUSE,
  NOTHING_SAVED_CLAUSE,
} from "./refusal-clauses";
// R-176 (plan label R-159): the support address, read on the server in ONE
// module, and the pure sentence that names it or promises nothing.
import { supportContact } from "../support-contact";
import { withContact } from "../support-copy";
import {
  BrainEditBusyError,
  BrainEditEmptyError,
  BrainEditUnchangedError,
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
  AuthMailDeliveryError,
  AuthMailRefusedError,
  PublicSampleSpinKeyringError,
  PreflightRefusedError,
  ExportClassificationError,
  ProfileAccessError,
  ProfileCapError,
  ProfileNameError,
  ProfileRoleError,
  ProvenanceError,
  ReferenceEchoError,
  ScopeForgeryError,
  UsageRawError,
  WorkspaceAccessError,
  // R-163: the write grade's refusal for a pending-deletion-only identity.
  WorkspacePendingDeletionError,
  WorkspacePausedError,
  // Slice 3b, Stage B1 — the interview draft's two typed refusals.
  InterviewAnswerError,
  InterviewDraftSubmittedError,
  OnboardingInputLimitError,
  // SLICE 7 (stage D) — stage A's TEN typed refusals. They landed on
  // `@respin/db`'s root export, in `eslint.config.mjs`'s allowlist and here in
  // ONE change, which is what that package's index header asked for: the
  // completeness scan in `tests/billing-ui.test.tsx` enumerates the whole root
  // export, so exporting them without copy would have left the suite red on a
  // contract nobody had broken, and shipping them without the export would
  // have left ten refusals rendering "Something went wrong".
  GenerationLineageError,
  FeedbackReactionError,
  FeedbackNoteError,
  FeedbackDuplicateError,
  FeedbackTargetError,
  // Audit P6-A1 (R-174): "Leave this out of future drafts".
  FeedbackExclusionTargetError,
  FrameworkAccessError,
  FrameworkStaleError,
  FrameworkContentError,
  FrameworkLimitError,
  PrivateFrameworkTierError,
  // SLICE 9A — the results surface's four typed refusals. Same rule as the ten
  // above, and the same reason stated once more because this slice is where it
  // was nearly broken: `/results` returns its refusal as ACTION STATE rather
  // than as a `?e=` redirect, so `logResultAction` resolves whatever code its
  // catch classifies through `BILLING_ERROR_COPY` and sends the words down
  // with the state. Without these four, every one of them would arrive at the
  // creator as "Something went wrong" — a second live instance of registered
  // open finding `8c-R15`, on the one screen whose whole job is honesty about
  // what is and is not known.
  TreatmentKeyError,
  ResultInputError,
  ResultTargetError,
  ResultDuplicateError,
  // SLICE 9A, added after the slice's own reading of the four above found the
  // hole it fills: the stratum refusal used to be a `WorkspaceAccessError`,
  // and THAT class is covered here — so it would not have rendered
  // "Something went wrong". It would have rendered something worse. See the
  // copy entry for what, and for why this class exists at all.
  ComparisonStratumError,
  // SLICE 9A. FROM `@respin/db`, NOT FROM `@respin/brain`, although
  // `@respin/brain` is where the class is written. That package is denied to
  // `app/**` on purpose — `buildLeverComparisons` trusts its caller to have
  // scoped the rows, so the fetch and the comparison must not be a package
  // boundary apart — and importing it here to name a class would be exactly
  // the "widening a package boundary for a convenience" this file's own
  // precedent refuses. `@respin/db` composes the comparison and re-exports
  // the refusal, so this screen gets the one inert value it needs for an
  // `instanceof` and no access to the builder or anything else in there.
  ComparisonInputError,
  PerformanceLearningEntitlementError,
  PromotionAccessError,
  PromotionPayloadError,
  PromotionFreshnessError,
  PromotionDecisionError,
  // Launch L2 (R-151): the creative piece refusal (closed `reason`) and the
  // e2e transport-selection refusal (a server that selected the fake where it
  // may not). Both on the root export, both with copy below.
  CreativePieceError,
  LlmTransportSelectionError,
  // Audit Phase 8 (R-177): the lock-order guard's refusal, the render
  // budget's, and the budget's refusal to open inside an open transaction
  // (gate M2). None is a creator's to fix; each carries copy so none can
  // render as "Something went wrong".
  LockOrderError,
  RenderLockTimeoutError,
  RenderTransactionNestingError,
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
  "checkout_reconciliation_required",
  "tier_checkout_authority",
  "tier_checkout_rollout",
  "not_owner",
  "no_stripe_customer",
  "billing_contact_provider",
  // Phase 10a: the public Sample Spin's two deployment refusals. Rendered by
  // the demo route as a 503; never by a creator screen.
  "sample_spin_flag_invalid",
  "sample_spin_not_configured",
  "no_live_subscription",
  "not_paused",
  "pause_length",
  "auto_topup_cap",
  "billing_reauthentication",
  "stripe_not_configured",
  "stripe_session_url_missing",
  "unknown_tier_price",
  "customer_mapping_lost",
  "ledger_integrity",
  "clock_skew",
  // Audit Phase 8 (P8-A2, P8-A1, P8-R1; R-177).
  "balance_isolation",
  "lock_order",
  "render_lock_timeout",
  "render_transaction_nesting",
  "config_unavailable",
  "workspace_pending_deletion",
  "workspace_access",
  // Audit 2026-08-17 remediation (R1).
  "subscription_paused",
  "not_chargeable",
  "pack_price_not_mapped",
  "pack_price_unavailable",
  "pack_price_mismatch",
  "tier_price_unavailable",
  "tier_price_mismatch",
  "tier_price_changed",
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
  // Slice 5 gate round 1 (G3). Its OWN code rather than `provenance`, for the
  // same reason `reference_echo` and `evidence_unreadable` have theirs: the
  // `provenance` copy is written for a page that went stale, and this refusal
  // is a form nobody changed. Told the wrong one, a creator reloads a page
  // that was never wrong and presses the same button again.
  "brain_edit_unchanged",
  "brain_edit_limit",
  "brain_document_limit",
  "brain_version_limit",
  "onboarding_input_limit",
  "export_busy",
  "auth_mail_refused",
  // Phase 10a: the bucket keyring's parse refusal (an operator's env value)
  // and the startup preflight's refusal (never reached by a request: it
  // stops the process from starting). Copy exists so no facade class renders
  // as "Something went wrong".
  "sample_spin_keyring_invalid",
  "preflight_refused",
  "auth_mail_delivery",
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
  "topup_reconciliation_required",
  "auto_topup_status_unavailable",
  "insufficient_credits",
  "config_not_migrated",
  "autotopup_shortfall",
  "llm_unavailable",
  "reference_unusable",
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
  // Slice 3b, Stage B1 — the structured interview's two typed refusals.
  // `interview_answer` covers BOTH the real `InterviewAnswerError` (a race —
  // the interview UI validates length/shape client-side before it ever
  // reaches `saveInterviewDraft`, but the server re-validates and this is
  // its refusal if that ever disagrees) and the interview screen's OWN
  // field-named override of it (see `app/(product)/onboarding/interview/copy.ts`).
  "interview_answer",
  "interview_already_submitted",
  // SLICE 6 (stage D) — the generation surface's refusals. Fifteen classes,
  // fifteen codes, and the one-to-one is deliberate rather than lazy: each of
  // these names a DIFFERENT act for the reader (activate a brain, wait, start
  // a new one, tell us) or a different truth about whose fault it is, and
  // collapsing any pair would put a false remedy on the screen that spends a
  // creator's credits. The pairs it would be most tempting to collapse are
  // named where their copy is written.
  "brain_not_activated",
  "generation_already_refused",
  "generation_assembly",
  "generation_attempt_state",
  "generation_in_flight",
  "generation_payload_mismatch",
  "generation_recovery_required",
  "generation_uncharged_attempt_cap",
  "generation_uncharged_cost_cap",
  "generation_unusable",
  "kill_test_failed",
  "mode_not_in_plan",
  "no_creator_rules",
  "unknown_mode",
  "unpriced_operation",
  // SLICE 7 (stage D) — the revision, the feedback event, the private
  // framework library, and the one refusal that is about our configuration
  // rather than about anybody's plan.
  //
  // THE REVISION'S PARENT IS FIVE CODES FOR ONE CLASS, and that is the
  // `RunSlotBusyError` precedent rather than a new idea: `RevisionParentError`
  // carries a CLOSED `reason` (`not_this_creators` | `not_revisable` |
  // `different_mode` | `parent_unreadable`), and those are four different true
  // sentences about four different situations. A class-only mapping could pick
  // only one of them, and whichever it picked would be false for the other
  // three — telling a creator whose parent was an honest refusal that the
  // output "is not this creator's" sends them to look for a permissions
  // problem that does not exist. `revision_parent` is the neutral fallback for
  // a reason this build does not know, and it is neutral BECAUSE it names no
  // cause: unlike the run-slot pair there is no "the one that blames us" here,
  // so the honest fallback is the one that claims nothing.
  "revision_parent",
  "revision_parent_not_yours",
  "revision_parent_not_revisable",
  "revision_parent_different_mode",
  "revision_parent_unreadable",
  // R-148 (launch L1). TWO CODES FOR ONE CLASS, the `RevisionParentError`
  // precedent: "the form or limit you sent is not one we accept" and "that
  // draft predates forms, so its revision keeps its format" have different
  // remedies, and the second is not something the creator got wrong at all.
  "creative_request",
  "creative_revision_legacy",
  // Launch L2 (R-151): a revision keeps its parent's form — a different form
  // is a new commission, not a swap at the revision price.
  "creative_revision_form",
  // Launch L2 (R-151): the creative piece. Four reasons, four sentences, and a
  // neutral fallback for a reason this build does not know.
  "creative_piece",
  "creative_piece_not_found",
  "creative_piece_source",
  "creative_piece_stale",
  "creative_piece_not_commissionable",
  "generation_quote_changed",
  "concept_context_needed",
  // AUDIT P3-R2 (R-158) — THE INPUT CEILING. One class, seven codes, the
  // `RevisionParentError` precedent: the refusal's remedy depends on WHICH
  // part of the assembled prompt is largest (`LlmInputTooLargeError.
  // largestPart`), and "trim your Voice document" is false advice for a
  // creator whose paste is the problem. `input_too_large_posts` is the
  // onboarding branch: that caller bounds the whole prompt and names no part.
  "input_too_large",
  "input_too_large_voice",
  "input_too_large_strategy",
  "input_too_large_killtest",
  "input_too_large_frameworks",
  "input_too_large_input",
  "input_too_large_posts",
  // AUDIT P3-R3 (R-158) — the per-window TOTAL, successes included.
  "generation_window_cost_cap",
  // AUDIT P3-A4 (R-157) — A HELD DRAFT. Three reasons, three remedies (wait
  // for the pause to end, top up, or simply try again), one shared truth:
  // nothing was charged, and the draft is finishable from /studio until its
  // hold time. And "Finish this draft" naming an attempt this creator cannot
  // finish.
  "generation_held_paused",
  "generation_held_balance",
  "generation_held_transient",
  "held_draft_unavailable",
  "llm_transport_refused",
  // Launch L4 (R-153): the saved recording pack's revision presses.
  "revision_preset",
  "generation_lineage",
  "feedback_reaction",
  "feedback_target",
  "feedback_exclusion_target",
  "feedback_note",
  "feedback_duplicate",
  "framework_access",
  "framework_stale",
  "framework_content",
  "framework_limit",
  "private_framework_tier",
  "unknown_entitlement_tier",
  // SLICE 8c — the paste-a-reference refusals (R8, R13; R-96/R-98).
  //
  // FIVE CODES FOR ONE INPUT CLASS, and that is the `RevisionParentError`
  // precedent rather than a new idea: `PastedReferenceInputError` carries a
  // `field` (`sourceUrl` | `title` | `transcript` | `niche`), and those are four
  // different boxes on the form with four different limits. One code would
  // tell a creator whose URL was refused to shorten a transcript that was
  // fine. `pasted_reference_input` is the neutral fallback for a field this
  // build does not know, and it names no box because it cannot know which.
  "pasted_reference_tier",
  "pasted_reference_input",
  "pasted_reference_url",
  "pasted_reference_title",
  "pasted_reference_transcript",
  "pasted_reference_niche",
  // The parked-autopsy REFUND's one typed refusal (R9, R-98): the credits the
  // paste consumed came from a never-expiring lot, so `refundCredits` cannot
  // date the returned credits and stops rather than mint an expiry nobody
  // chose. An operator's case, and the copy says so.
  "refund_source_never_expires",
  // SLICE 9A. FOUR CODES RATHER THAN ONE, and the split is the whole value:
  // "what that draft tested could not be identified", "the form does not
  // describe a storable observation", "that draft is not this creator's" and
  // "you already logged that window" have four DIFFERENT remedies, and a
  // creator handed the wrong one does the wrong thing. `results` is
  // append-only with no update and no delete path, so a refusal that sends
  // someone to re-type numbers they cannot correct is worse here than on any
  // other form in the product.
  "result_treatment_key",
  "result_input",
  "result_target",
  "result_duplicate",
  // NOT A FIFTH RESULT-FORM REFUSAL, which is why it is not named
  // `result_*`: the four above are things a creator's submission can be, and
  // this one is a thing the PRODUCT can fail to describe. A creator reaching
  // it has done nothing wrong and has nothing on the form to correct.
  "comparison_stratum",
  // ONE CODE FOR NINE THROW SITES — see the copy entry for why they are one
  // refusal and not several.
  "comparison_input",
  // Slice 9b. Keep operational configuration failure separate from Free
  // view-only access: an unmapped price is ours to repair, not a plan limit.
  "performance_learning_unavailable",
  "performance_learning_view_only",
  "promotion_access",
  "promotion_payload",
  "promotion_freshness",
  "promotion_decision",
  "unknown",
] as const;

export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number];

type ErrorClass = { new (...args: never[]): Error; readonly name: string };

/** instanceof order matters only if classes ever subclass each other; none do. */
const HANDLERS: { cls: ErrorClass; code: BillingErrorCode }[] = [
  { cls: AppBaseUrlMissingError, code: "app_base_url_missing" },
  { cls: AlreadySubscribedError, code: "already_subscribed" },
  { cls: CheckoutInFlightError, code: "checkout_in_flight" },
  {
    cls: CheckoutReconciliationRequiredError,
    code: "checkout_reconciliation_required",
  },
  { cls: TierCheckoutAuthorityError, code: "tier_checkout_authority" },
  { cls: TierCheckoutRolloutError, code: "tier_checkout_rollout" },
  { cls: BillingRoleError, code: "not_owner" },
  { cls: NoStripeCustomerError, code: "no_stripe_customer" },
  { cls: BillingContactProviderError, code: "billing_contact_provider" },
  { cls: PublicSampleSpinEnablementError, code: "sample_spin_flag_invalid" },
  { cls: PublicSampleSpinNotConfiguredError, code: "sample_spin_not_configured" },
  { cls: NoLiveSubscriptionError, code: "no_live_subscription" },
  { cls: NotPausedError, code: "not_paused" },
  { cls: PauseLengthError, code: "pause_length" },
  { cls: AutoTopupCapError, code: "auto_topup_cap" },
  { cls: BillingReauthenticationError, code: "billing_reauthentication" },
  { cls: StripeNotConfiguredError, code: "stripe_not_configured" },
  { cls: StripeSessionUrlMissingError, code: "stripe_session_url_missing" },
  { cls: UnknownTierPriceError, code: "unknown_tier_price" },
  { cls: CustomerMappingLostError, code: "customer_mapping_lost" },
  { cls: LedgerIntegrityError, code: "ledger_integrity" },
  { cls: ClockSkewError, code: "clock_skew" },
  { cls: BalanceIsolationError, code: "balance_isolation" },
  { cls: LockOrderError, code: "lock_order" },
  { cls: RenderLockTimeoutError, code: "render_lock_timeout" },
  { cls: RenderTransactionNestingError, code: "render_transaction_nesting" },
  { cls: ConfigUnavailableError, code: "config_unavailable" },
  // BEFORE its base `WorkspaceAccessError` (the list is walked in order).
  { cls: WorkspacePendingDeletionError, code: "workspace_pending_deletion" },
  { cls: WorkspaceAccessError, code: "workspace_access" },
  { cls: SubscriptionPausedError, code: "subscription_paused" },
  { cls: NotChargeableError, code: "not_chargeable" },
  { cls: PackPriceNotMappedError, code: "pack_price_not_mapped" },
  { cls: PackPriceUnavailableError, code: "pack_price_unavailable" },
  { cls: PackPriceMismatchError, code: "pack_price_mismatch" },
  { cls: TierPriceUnavailableError, code: "tier_price_unavailable" },
  { cls: TierPriceMismatchError, code: "tier_price_mismatch" },
  { cls: TierPriceChangedError, code: "tier_price_changed" },
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
  { cls: BrainEditUnchangedError, code: "brain_edit_unchanged" },
  { cls: BrainEditLimitError, code: "brain_edit_limit" },
  { cls: BrainDocumentLimitError, code: "brain_document_limit" },
  { cls: BrainVersionLimitError, code: "brain_version_limit" },
  { cls: OnboardingInputLimitError, code: "onboarding_input_limit" },
  { cls: ExportBusyError, code: "export_busy" },
  // Phase 10b-1 Task 4: the closed auth-delivery authority. A refusal means
  // nothing was sent (quota or recipient); a delivery error means the
  // provider did not durably accept it. Neither is ever reported as sent.
  { cls: AuthMailRefusedError, code: "auth_mail_refused" },
  { cls: PublicSampleSpinKeyringError, code: "sample_spin_keyring_invalid" },
  { cls: PreflightRefusedError, code: "preflight_refused" },
  { cls: AuthMailDeliveryError, code: "auth_mail_delivery" },
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
  {
    cls: AutoTopupReconciliationRequiredError,
    code: "topup_reconciliation_required",
  },
  { cls: AutoTopupRolloutError, code: "auto_topup_status_unavailable" },
  { cls: AutoTopupAuthorityKeyError, code: "auto_topup_status_unavailable" },
  { cls: StripeAccountBindingError, code: "auto_topup_status_unavailable" },
  {
    cls: AutoTopupAuthoritySignatureError,
    code: "topup_reconciliation_required",
  },
  { cls: InsufficientCreditsError, code: "insufficient_credits" },
  { cls: PostCallDebitError, code: "debit_refused_after_call" },
  { cls: ConfigNotMigratedError, code: "config_not_migrated" },
  { cls: AutoTopupShortfallError, code: "autotopup_shortfall" },
  {
    cls: AutoTopupAttemptIntegrityError,
    code: "topup_reconciliation_required",
  },
  { cls: AutoTopupUnnamedRefusalError, code: "autotopup_shortfall" },
  { cls: LlmError, code: "llm_unavailable" },
  // Slice 3b, Stage B1.
  { cls: InterviewAnswerError, code: "interview_answer" },
  { cls: InterviewDraftSubmittedError, code: "interview_already_submitted" },
  // SLICE 6 (stage D) — the generation path. None of these subclasses another
  // and none is a subclass of anything already in this table, so the walk order
  // decides nothing here; they are grouped so the next reader finds them
  // together. `GenerationAssemblyError` in particular is NOT a subclass of
  // @respin/llm's `AssemblyError` (different package, different failure: one is
  // "the vendor's reply was unusable", this one is "we refused to build the
  // request at all"), so it needs its own entry and its own words.
  { cls: BrainNotActivatedError, code: "brain_not_activated" },
  { cls: ModeNotInPlanError, code: "mode_not_in_plan" },
  { cls: UnknownModeError, code: "unknown_mode" },
  { cls: UnpricedOperationError, code: "unpriced_operation" },
  { cls: GenerationUnchargedAttemptCapError, code: "generation_uncharged_attempt_cap" },
  // The money-denominated twin (billing gate, 2026-09-04). Neither subclasses
  // the other, so walk order decides nothing between them.
  { cls: GenerationUnchargedCostCapError, code: "generation_uncharged_cost_cap" },
  { cls: GenerationInFlightError, code: "generation_in_flight" },
  { cls: GenerationAlreadyRefusedError, code: "generation_already_refused" },
  { cls: GenerationPayloadMismatchError, code: "generation_payload_mismatch" },
  { cls: GenerationRecoveryRequiredError, code: "generation_recovery_required" },
  { cls: GenerationAttemptStateError, code: "generation_attempt_state" },
  { cls: GenerationAssemblyError, code: "generation_assembly" },
  // SLICE 8c CLOSE-OUT (2026-09-04). Both the billing and the compliance
  // reviewer found this independently: a `SpinSimilarityError` had no entry
  // here, so `billingErrorCode` fell through to `unknown` and a creator whose
  // spin hit it read "Something went wrong". It is OUR data being refused by
  // OUR bounds, so the copy says so and does not send them to reword anything.
  { cls: SpinSimilarityError, code: "reference_unusable" },
  { cls: ScriptOutputError, code: "generation_unusable" },
  { cls: KillTestError, code: "kill_test_failed" },
  { cls: NoCreatorRulesError, code: "no_creator_rules" },
  // SLICE 7 (stage D). None of these subclasses another and none is a subclass
  // of anything already in this table, so the walk order decides nothing here.
  //
  // `RevisionParentError`'s ENTRY IS THE FALLBACK, NOT THE USUAL PATH:
  // `billingErrorCode` branches on its closed `reason` BEFORE walking this
  // table, exactly as it does for `RunSlotBusyError`. The entry exists because
  // the completeness test enumerates the facades' error CLASSES, and a class
  // reachable only through an instance branch would read to that test as a
  // class with no copy.
  { cls: RevisionParentError, code: "revision_parent" },
  // R-148. The FALLBACK for a `CreativeRequestError`; `billingErrorCode`
  // branches on its `reason` first, so a legacy-format revision is told the
  // truth about why rather than that its request was malformed.
  { cls: CreativeRequestError, code: "creative_request" },
  // Launch L2 (R-151). The piece's ENTRY IS THE FALLBACK: `billingErrorCode`
  // branches on its `reason` first.
  { cls: CreativePieceError, code: "creative_piece" },
  { cls: GenerationQuoteChangedError, code: "generation_quote_changed" },
  // Audit P3-R2/R3/A4. `LlmInputTooLargeError` and `GenerationHeldError` are
  // FALLBACK entries: `billingErrorCode` branches on the instance first.
  // `LlmInputTooLargeError` is not an `LlmError`, so the vendor branches above
  // cannot take it whatever the walk order.
  { cls: LlmInputTooLargeError, code: "input_too_large" },
  { cls: GenerationWindowCostCapError, code: "generation_window_cost_cap" },
  { cls: GenerationHeldError, code: "generation_held_transient" },
  { cls: HeldDraftUnavailableError, code: "held_draft_unavailable" },
  { cls: ConceptContextInsufficientError, code: "concept_context_needed" },
  { cls: RevisionPresetError, code: "revision_preset" },
  { cls: LlmTransportSelectionError, code: "llm_transport_refused" },
  { cls: GenerationLineageError, code: "generation_lineage" },
  { cls: FeedbackReactionError, code: "feedback_reaction" },
  { cls: FeedbackTargetError, code: "feedback_target" },
  { cls: FeedbackExclusionTargetError, code: "feedback_exclusion_target" },
  { cls: FeedbackNoteError, code: "feedback_note" },
  { cls: FeedbackDuplicateError, code: "feedback_duplicate" },
  { cls: FrameworkAccessError, code: "framework_access" },
  { cls: FrameworkStaleError, code: "framework_stale" },
  { cls: FrameworkContentError, code: "framework_content" },
  { cls: FrameworkLimitError, code: "framework_limit" },
  { cls: PrivateFrameworkTierError, code: "private_framework_tier" },
  { cls: UnknownEntitlementTierError, code: "unknown_entitlement_tier" },
  // SLICE 8c. Neither subclasses anything in this table. The input class's
  // ENTRY IS THE FALLBACK, NOT THE USUAL PATH: `billingErrorCode` branches on
  // its `field` BEFORE walking this table, exactly as it does for
  // `RevisionParentError`; the entry exists because the completeness test
  // enumerates the facades' error CLASSES.
  { cls: PastedReferenceTierError, code: "pasted_reference_tier" },
  { cls: PastedReferenceInputError, code: "pasted_reference_input" },
  { cls: RefundSourceNeverExpiresError, code: "refund_source_never_expires" },
  // SLICE 9A. None of the four subclasses anything else in this table, and
  // none has an instance branch: `logResultAction` forwards form strings and
  // takes no decision, so the class IS the refusal and this table is the whole
  // mapping.
  { cls: TreatmentKeyError, code: "result_treatment_key" },
  { cls: ResultInputError, code: "result_input" },
  { cls: ResultTargetError, code: "result_target" },
  { cls: ResultDuplicateError, code: "result_duplicate" },
  { cls: ComparisonStratumError, code: "comparison_stratum" },
  { cls: ComparisonInputError, code: "comparison_input" },
  { cls: PerformanceLearningConfigUnavailableError, code: "performance_learning_unavailable" },
  { cls: PerformanceLearningEntitlementError, code: "performance_learning_view_only" },
  { cls: PromotionAccessError, code: "promotion_access" },
  { cls: PromotionPayloadError, code: "promotion_payload" },
  { cls: PromotionFreshnessError, code: "promotion_freshness" },
  { cls: PromotionDecisionError, code: "promotion_decision" },
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
  // Slice 7. Four reasons, four sentences — see the codes' own block above for
  // why one code for this class would be false three times out of four.
  RevisionParentError: [
    "revision_parent_not_yours",
    "revision_parent_not_revisable",
    "revision_parent_different_mode",
    "revision_parent_unreadable",
    // The `??` fallback is a code the branch RETURNS, so it is listed here
    // too (launch L2, E-25(iii): the derivation test reads every literal the
    // branch can return, fallbacks included).
    "revision_parent",
  ],
  // Slice 8c. Four fields, four sentences — see the codes' own block above.
  PastedReferenceInputError: [
    "pasted_reference_url",
    "pasted_reference_title",
    "pasted_reference_transcript",
    "pasted_reference_niche",
    // The `??` fallback (`billing-errors.ts`' `PASTED_REFERENCE_FIELD_CODES[
    // err.field] ?? "pasted_reference_input"`), named by the L2 scanner.
    "pasted_reference_input",
  ],
  // R-148 (launch L1), entry added in launch L2 (E-25(iii)): it had an
  // instance branch and no entry here, so a screen deriving its codes from
  // this map could not see `creative_revision_legacy`.
  CreativeRequestError: [
    "creative_revision_legacy",
    "creative_revision_form",
    "creative_request",
  ],
  // Audit P3-R2: the largest part decides the remedy; no part (the
  // onboarding caller) is the posts branch; any other part is the fallback.
  LlmInputTooLargeError: [
    "input_too_large_voice",
    "input_too_large_strategy",
    "input_too_large_killtest",
    "input_too_large_frameworks",
    "input_too_large_input",
    "input_too_large_posts",
    "input_too_large",
  ],
  // Audit P3-A4: three held reasons, and the transient code as the fallback
  // for a reason this build does not know.
  GenerationHeldError: [
    "generation_held_paused",
    "generation_held_balance",
    "generation_held_transient",
  ],
  // Launch L2 (R-151): the creative piece's four reasons and its fallback.
  CreativePieceError: [
    "creative_piece_not_found",
    "creative_piece_source",
    "creative_piece_stale",
    "creative_piece_not_commissionable",
    "creative_piece",
  ],
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
 * THE CODES WHOSE REMEDY ENDS WITH A PERSON (audit P6-R6 amendment, R-176).
 *
 * Every one of these entries told the creator to reach support while no channel existed
 * (measured 2026-10-05: 13 lines in this file sending the creator to support;
 * measured 2026-10-07: 18 more asking the creator to "tell us"). Their `BILLING_ERROR_COPY`
 * text now keeps only the remedy the creator can act on, and
 * `billingErrorCopy` appends `contactSentence` when `RESPIN_SUPPORT_EMAIL` is
 * set, so the promise exists exactly when the channel does. A LIST, not a
 * predicate over the copy (Respin rule 7): a new code that should send people
 * to support is a list edit, and `tests/support-contact.test.tsx` pins this
 * list to the measured population.
 */
export const SUPPORT_CONTACT_CODES: readonly BillingErrorCode[] = [
  "ledger_integrity",
  "provenance",
  "brain_version_limit",
  "onboarding_input_limit",
  "auth_mail_refused",
  "scope_forgery",
  "usage_raw",
  "brain_schema_shape",
  "brain_claim_walk",
  "export_classification",
  "comparison_stratum",
  "comparison_input",
  "unknown",
  // THE SECOND PREDICATE (measured 2026-10-07, R-176): eighteen entries that
  // asked the creator to "tell us" with no channel to tell us through. Same
  // treatment: the stored text keeps the remedy, the address is appended.
  "autotopup_shortfall",
  "llm_attempt_recorded",
  "brain_pointer_divergence",
  "evidence_unreadable",
  "llm_truncated",
  "uncharged_attempt_cap",
  "input_too_large_frameworks",
  "generation_window_cost_cap",
  "llm_transport_refused",
  "unpriced_operation",
  "generation_uncharged_cost_cap",
  "generation_uncharged_attempt_cap",
  "reference_unusable",
  "generation_unusable",
  "kill_test_failed",
  "generation_lineage",
  "unknown_entitlement_tier",
  "refund_source_never_expires",
];

/**
 * The copy for one code, with the contact line appended for a
 * `SUPPORT_CONTACT_CODES` member when there is a channel.
 *
 * `support` DEFAULTS TO THE SERVER READ, evaluated at the call: this module is
 * server-only (it imports `@respin/credits/app-server`, and
 * `tests/client-bundle-boundary.test.ts` keeps it out of client bundles), so
 * every caller of `billingErrorDisplay` / `billingErrorFromCode` and every
 * screen-copy resolver that falls back to this table reads the address in the
 * request that renders the sentence. A test passes it explicitly.
 */
export function billingErrorCopy(
  code: BillingErrorCode,
  support: string | null = supportContact()
): BillingErrorCopy {
  return withSupportContactFor(code, BILLING_ERROR_COPY[code], support);
}

/**
 * The same rule for a SCREEN'S OVERRIDE of a code's copy (`/studio`,
 * `/onboarding`, the frameworks page): an override of a
 * `SUPPORT_CONTACT_CODES` member gets the contact line exactly as the shared
 * entry would, so overriding the words never drops the channel.
 */
export function withSupportContactFor(
  code: BillingErrorCode,
  copy: BillingErrorCopy,
  support: string | null = supportContact()
): BillingErrorCopy {
  return SUPPORT_CONTACT_CODES.includes(code)
    ? { title: copy.title, detail: withContact(copy.detail, support) }
    : copy;
}

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
  sample_spin_flag_invalid: {
    title: "The Sample Spin is not configured on this deployment",
    detail:
      "RESPIN_PUBLIC_SAMPLE_SPIN carries a value this build does not accept. An operator sets it to preview, or leaves it unset to keep the landing mockup.",
  },
  sample_spin_not_configured: {
    title: "The Sample Spin is not configured on this deployment",
    detail:
      "The Sample Spin is switched on but its bucket key is missing. An operator sets RESPIN_PUBLIC_SAMPLE_SPIN_HMAC_KEYS; until then no visitor can be admitted.",
  },
  billing_contact_provider: {
    title: "The billing contact could not be moved",
    detail:
      "The payment provider did not confirm the handover, so nothing was changed here. Try again; if it keeps failing, an operator can check the customer record in Stripe.",
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
      "This will not fix itself on a retry, and it is not something you can correct from here. Nothing was charged and no credits were spent. The refusal code, error type and any server-derived context are recorded for an operator.",
  },
  // Audit Phase 8 (R-177). Each is refused BEFORE any write, which is what
  // lets the copy say nothing changed.
  balance_isolation: {
    title: "Your balance could not be read just now",
    detail:
      "Nothing was charged or changed. Reload the page. The refusal code and error type are recorded for an operator.",
  },
  lock_order: {
    title: "This action was stopped before it changed anything",
    detail:
      "Nothing was charged or changed. It was refused by a safety check that keeps two operations on this workspace from blocking each other. Try again; the refusal code and error type are recorded for an operator.",
  },
  render_lock_timeout: {
    title: "This page waited too long for this workspace",
    detail:
      "Another operation on this workspace held something this page needed for more than five seconds, so the page stopped waiting rather than hang. Nothing was charged or changed. Reload in a moment.",
  },
  // A programming error refused before any statement ran (gate M2): a bounded
  // read was asked to open inside an open transaction.
  render_transaction_nesting: {
    title: "This page could not be read safely",
    detail:
      "A read was stopped before it ran because it would have changed how another operation waits. Nothing was charged or changed. Reload the page; the refusal code and error type are recorded for an operator.",
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
  // R-163: a refusal with a way forward (CLAUDE.md 2026-07-30). The page it
  // names is one of the three that hold the read grade during grace.
  workspace_pending_deletion: {
    title: "This workspace is scheduled for deletion",
    detail:
      "Its pages are closed while the deletion is pending. Open /settings/account to cancel the deletion; until it erases, your brain's history stays readable on /brain and its export stays available.",
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
      // "we will not attempt" REWORDED, not exempted (learning honesty gate,
      // 2026-09-01). `FORBIDDEN_CLAIMS` bans `\bwe will` as a promise about
      // what the product is going to do; this was the NEGATED form, describing
      // what does not happen, so the ban was paying for a word rather than a
      // claim. Narrowing the pattern to spare it would loosen the guard for
      // every screen; saying the same fact without the first person costs
      // nothing and is plainer. `/usage` renders any code in this table, and
      // `tests/usage-honesty.test.tsx` is what now reads them all.
      "Stripe has stopped collecting on this subscription, so no automatic charge is attempted against it. Nothing was charged. Open the Customer Portal and settle the outstanding invoice — the subscription can still be recovered — and this becomes available again.",
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
  // Phase 6 billing gate (R-175): the plan price Stripe would charge is
  // checked against the price this product states before a Checkout opens.
  tier_price_unavailable: {
    title: "This plan's price cannot be charged right now",
    detail:
      "The Stripe price behind this plan is not a monthly, fixed-amount price in US dollars, or it is archived, so no Checkout was opened and nothing was charged. This is an operator problem: the Stripe price needs fixing or remapping in /admin/config. Your current plan is unchanged.",
  },
  tier_price_changed: {
    title: "The price changed while you were checking out",
    detail:
      "The price for this plan was changed while your Checkout was being prepared, so nothing was opened or charged. Try again: the new price is checked before anything happens.",
  },
  tier_price_mismatch: {
    title: "This plan's price does not match the price we show",
    detail:
      "Stripe would charge a different amount for this plan from the price this product states, so no Checkout was opened and nothing was charged. You will not be billed an amount you were not shown. This is an operator problem: a new Stripe price at the stated amount needs to be mapped in /admin/config. Your current plan is unchanged.",
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
      "This attempt was refused and nothing was spent: no model was called and this attempt did not use up your first run for this creator. A top-up has been started, and credits land when your bank settles it. Try again only once your balance updates; if it does not, ask an administrator to reconcile the pending top-up before buying anything else.",
  },
  insufficient_credits: {
    title: "Not enough credits for this",
    detail:
      "This attempt was refused BEFORE anything was called, so nothing was spent and this attempt did not use up your first run for this creator. Buy an overage pack from Billing, or turn on auto-top-up so the credits are bought automatically next time — the attempt that triggers it is still refused, so you retry once they land.",
  },
  config_not_migrated: {
    title: "This server's pricing configuration is mid-deploy",
    detail:
      "The running code knows what this costs, but the stored configuration it would be billed against does not carry that price yet — so the charge could not be reconciled afterwards, and it was refused rather than guessed. Nothing was spent. This clears itself once an administrator runs the configuration migration; it needs no new deploy.",
  },
  autotopup_shortfall: {
    title: "Something went wrong on our side",
    detail:
      "A top-up was requested for an amount that does not make sense, which is a fault in our code rather than anything you did. Nothing was charged. The refusal is recorded for an operator.",
  },
  llm_attempt_recorded: {
    title: "The model answered, but not usably",
    detail:
      "The provider returned something we could not use, and it charged us for the attempt — so this one counted: if this was your first run for this creator, that run is now used. Nothing was taken from your credit balance. Try again without rewording anything: this attempt sends a fixed message of ours and nothing you wrote.",
  },
  debit_refused_after_call: {
    title: "The run completed but could not be charged",
    detail:
      "The model answered and we recorded the attempt, then the charge was refused because the balance had already gone. Nothing was taken from your balance and the reply was not kept. Buy an overage pack from Billing, or turn on auto-top-up, then run it again.",
  },
  llm_unavailable: {
    title: "The model provider did not answer",
    detail:
      "Nothing was spent and this attempt did not use up your first run for this creator. This is almost always brief — try again in a minute. There is nothing for you to reword: this attempt sends a fixed message of ours, never anything you wrote."
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
      "Every claim in a brain has to point at something you actually wrote, and one of the quotes did not appear where it said it did — so it was refused rather than stored. Nothing was saved and no credits were spent. Try the build again. The refusal code and error type are recorded without the quote.",
  },
  brain_edit_unchanged: {
    title: "Nothing in that submission was different",
    detail:
      "The values you submitted match the version already stored, so no replacement draft was created — a Brain version is permanent once written, and one that changes nothing would sit in your history forever saying nothing. Nothing was lost and nothing is out of date: change at least one field and submit again, or leave this document as it is.",
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
      "This creator profile has reached the retained Brain-version limit, so another immutable version was not stored, and this profile cannot take more versions. The version already in force is unchanged, and your export keeps the complete history.",
  },
  onboarding_input_limit: {
    title: "That creator input cannot be stored",
    detail:
      "The normalized input is blank or too long, one of its fields is too long, or this creator profile has reached its retained-input limit. Shorten the input and try again. If the profile is full, it cannot take more material.",
  },
  export_busy: {
    title: "A complete export is already being prepared",
    detail:
      "Another export for this workspace is still in progress. Wait for that download to finish, then try the export again. No Brain data was changed.",
  },
  sample_spin_keyring_invalid: {
    title: "The Sample Spin is not configured on this deployment",
    detail:
      "RESPIN_PUBLIC_SAMPLE_SPIN_HMAC_KEYS is malformed. An operator sets it to the current key, optionally followed by the one prior key; see env.example. No visitor is admitted until then.",
  },
  preflight_refused: {
    title: "This server did not start cleanly",
    detail:
      "The startup preflight refused a registry check, which should have stopped the process before it served anything. An operator reads the refusal code in the server log and redeploys a build that passes `pnpm preflight`.",
  },
  auth_mail_refused: {
    title: "We could not send that email right now",
    detail:
      "The product's email allowance for today or this month is used up, or the address on the account could not be resolved. Nothing was sent. Try again later.",
  },
  // Covers BOTH delivery statuses the error carries: a definitive provider
  // refusal and an indeterminate exchange (timeout, 5xx, idempotent replay).
  // The second may still arrive, so the copy claims neither direction
  // (round-1 lean S3).
  auth_mail_delivery: {
    title: "That email was not confirmed as sent",
    detail:
      "The mail provider did not confirm the message. It may still arrive; if it does not, request it again in a few minutes. Nothing else on your account was changed.",
  },
  // Slice 4 (R12, R13). THIS COPY NAMES THE CATEGORY, NEVER THE SPECIFIC POST
  // OR SPAN — and that is a statement about the CHANNELS this string travels
  // on, narrowed in slice 5 because it had come to assert the OPPOSITE of what
  // the product does (gate round 1, G3). Each half re-checked against the file
  // that decides it:
  //
  //   - THE `?e=` REDIRECT: still true. `failHref` in brain/actions.ts builds
  //     `/brain?e=${code}` from `logRefusal`'s return value, so a CODE is the
  //     whole payload; there is no field in that channel a quote could ride in.
  //   - THE LOG: still true. `safe-log.ts` emits `{code, errorName,
  //     driverCode?}` plus caller-supplied server ids, and its own rule is that
  //     NO exception message crosses the boundary — `ReferenceEchoError` is
  //     named there as one of the reasons why.
  //   - THE BROWSER: NO LONGER TRUE, deliberately, and by a different route.
  //     `referenceEchoState` (brain/actions.ts) validates the typed
  //     `ReferenceEchoError.match` and returns a BOUNDED structured state — a
  //     pointer, a uuid-shaped input id, and a span truncated at
  //     `REFERENCE_MATCH_PREVIEW_MAX` code points — which `brain/edit-form.tsx`
  //     renders inside the form. It is the creator's OWN reference post, shown
  //     to the creator who saved it, against the field they just edited; the
  //     bound and the shape validation are what keep it a citation rather than
  //     an open text channel. THIS copy still carries none of it, because it is
  //     the fallback for every OTHER path, where nothing has been validated.
  //
  // What this copy adds over the generic `provenance` entry is the ACTUAL
  // remedy for THIS refusal: rewrite in your own words, not "reload and retry"
  // — retrying an echo refusal unchanged fails identically. R13: it does not
  // say the result is original or safe to publish — R-3 is a control, not a
  // guarantee (REQ-I04). That sentence and the "nothing was saved" clause are
  // `./refusal-clauses`, SHARED with the in-form banner rather than written
  // twice: the banner had neither, and a refusal that does not say the draft
  // was dropped, or that quietly implies passing the bar means the field is
  // clean, is the one this product must not ship (G2).
  reference_echo: {
    title: "This repeats one of your reference posts too closely",
    detail:
      `A reference post is kept only to find the pattern behind it, never to be repeated word for word — so a draft that echoes a long stretch of one, or quotes more of one than the limit allows, is refused rather than stored. ${NOTHING_SAVED_CLAUSE} Rewrite the field describing the mechanism in your own words, or cite a shorter piece of the reference post, and try again. ${ECHO_NO_GUARANTEE_CLAUSE}`,
  },
  scope_forgery: {
    title: "The action was refused before it touched any data",
    detail:
      "A safety check that guards which workspace and which profile an action may reach did not pass. That is never something you can cause by using the product normally, so it means a bug rather than a mistake on your part. Nothing was read and nothing was written. The refusal code, error type and any server-derived context are recorded.",
  },
  usage_raw: {
    title: "The action was refused before anything was recorded",
    detail:
      "A safety check on what may be stored alongside a usage record did not pass, so nothing was written. Nothing you typed was lost and no credits were spent. This is never something you can cause by using the product normally, so it means a bug rather than a mistake on your part. The refusal code, error type and any server-derived context are recorded.",
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
    title: "This voice draft could not be used",
    detail:
      "The reply did not pass one of the product's voice-draft checks, so nothing was saved. Your run was still made, so it counted. Any charge for this run is in your credit history on the usage page.",
  },
  brain_pointer_divergence: {
    title: "We could not line the evidence up with the fields",
    detail:
      "This one is ours, not yours. The model answered and we could not match its quotes to the fields they belong to, so nothing was written rather than storing a version you would never be able to confirm. Your run was made and counted. Please try again. The refusal is recorded for an operator.",
  },
  brain_kind_not_writable: {
    title: "This part of your brain is not written from onboarding",
    detail:
      "Your performance notes are written from posted results that have been verified, never inferred from the material you uploaded — inferring them now would be a claim about how your content performs with no result behind it. Nothing was saved. This document stays empty until you have at least three verified, comparable results to write it from, and results logging is not built yet, so today there is nothing for you to do here.",
  },
  brain_schema_shape: {
    title: "The brain document shapes are misconfigured",
    detail:
      "A safety check that runs when the server starts found a brain-document shape that would let a claim be stored without a way for you to confirm it. This is never something you can cause by using the product; it means a bug. The refusal code and error type are recorded, but the field value is not logged.",
  },
  brain_claim_walk: {
    title: "The action was refused before anything was stored",
    detail:
      "The server could not agree with itself about which parts of a brain document are claims you would need to confirm, so it refused rather than storing a document you could not fully review. Nothing was saved and no credits were spent. The refusal code and error type are recorded without the document content.",
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
    // ONE CODE, FOUR ACTS. `ProfileRoleError` covers creating a profile,
    // adding a post, writing a brain document, and (slice 8) tracking or
    // untracking a trend niche, so this copy may not describe only the first —
    // a viewer whose PASTE was refused used to read "Nothing was created" about
    // a post (tenancy gate, 2026-08-27). The `?e=` channel carries a code and
    // not the act, so the copy covers the class.
    // ...and (slice 8c) a FIFTH act: pasting a reference for autopsy, which
    // spends the workspace's credits and lands in the creator's record.
    title: "Viewer access cannot change this creator's record",
    detail:
      "Adding creator profiles or posts, pasting a reference for autopsy, or changing the trends this creator tracks, needs at least editor access — profiles come out of the workspace's paid allowance, posts and pasted references become part of a creator's permanent record, and tracked niches and autopsies use the plan's allowance and credits. Nothing was saved and nothing was charged. Ask a workspace owner to make the change, or to give you editor access.",
  },
  profile_name: {
    title: "That profile name cannot be used",
    detail:
      "A creator profile name has to be one line of visible text, at most 80 characters, and not blank. Nothing was created. Edit the name and submit it again.",
  },
  evidence_unreadable: {
    title: "Part of this brain draft could not be shown",
    detail:
      "One of the quotes recorded for this draft does not match the post it names, so the page stopped rather than showing you a quote it cannot prove came from you. Nothing was changed and nothing you saved was lost. This is not something you can fix; build a fresh draft in the meantime, and the refusal is recorded for an operator.",
  },
  export_classification: {
    title: "The export is missing a registered data reader",
    detail:
      "A creator-data table is marked for export but the exporter has no scoped reader for it, so the download stopped rather than silently omit data. This is an operator problem, not something you can fix in the form. The refusal code and error type are recorded, and an operator can compare the export registry with its scoped readers.",
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
      "Nothing was spent, no model was called, and this attempt did not use up your first run for this creator — it was refused before any of that. Your plan allows a set number of model calls at the same time; wait for one of the runs already going to finish, then try again.",
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
      "This is us, not you, and not your plan: the server is already running as many model calls as it allows at once. Nothing was spent, no model was called, and this attempt did not use up your first run for this creator. Try again in a moment.",
  },
  llm_truncated: {
    title: "The model's answer was cut off",
    detail:
      // "your next run is still included" WAS A PRICE CLAIM THIS TABLE CANNOT
      // READ (billing gate, 2026-09-02). `BILLING_ERROR_COPY` is a static map —
      // the `?e=` channel carries a code, never a message — so it has no
      // config and cannot say what the included build costs. The FACT it can
      // state is the one this path actually establishes: the claim was not
      // consumed, so the next run is still the first one for this creator, at
      // whatever that first run is priced (the run control on the brain page
      // reads and states both prices).
      //
      // AND THE FIRST FIX STOPPED ONE PHRASE SHORT, INSIDE THIS SENTENCE
      // (round 2 of the same gate). It removed "still included" and left "it
      // did NOT use your included build" three words later, justified as
      // "true whatever the document prices it at" — which is true of the
      // CLAIM ROW and false of what a creator reads: "your included build" is
      // itself the promise of a free build. Under the document R-82's own
      // test appends (`onboardingBrainBuild: 25`) a creator is told they
      // still hold a free first build they do not have. Eight strings in this
      // map said one of "your included build was not used", "your included
      // run was not used", "your included build is untouched"; ALL EIGHT now
      // name the CLAIM without naming its price — "your first run for this
      // creator" — which is the fact these refusal paths establish. No wrong
      // debit followed from any of them (nothing was spent on a refusal
      // path), which is why this is a change and not an incident.
      //
      // THE PHRASE IS BANNED ON `/studio` BY THE SAME SCAN THE OLD ONE WAS.
      // `/studio` has no per-creator first run either, so replacing the
      // wording without widening `tests/studio-ui.test.tsx`'s
      // `FALSE_ON_THIS_SCREEN` pattern would have narrowed that control
      // silently — the 2026-08-29 population lesson, in the fix for a copy
      // defect. It is widened, with a planted specimen.
      "The answer came back longer than this server's reply-length limit allows, so nothing usable arrived. Nothing was taken from your credit balance, and it did NOT use up your first run for this creator — your next run is still that first one. This is a server setting rather than anything you did, and trying again will hit the same limit until an operator raises it, so retrying will not help; the refusal is recorded for an operator.",
  },
  uncharged_attempt_cap: {
    title: "This creator's runs keep failing on our side",
    // NOT "recent", and no promised per-creator clearing (billing gate round
    // 3, 2026-08-29; re-verified round 2, 2026-09-01): the count is lifetime
    // over an append-only table — `unchargedAttemptWindowStart` returns the
    // epoch for the ONBOARDING purpose, and only for that one — and the
    // clearing mechanism is an operator fixing the root cause. See R-48's
    // addendum and the class's own comment in @respin/credits errors.ts.
    // It therefore must NOT carry `UNCHARGED_CAP_WINDOW_CLAUSE`, which its
    // windowed sibling `generation_uncharged_attempt_cap` does; the split is
    // asserted against the config in `tests/usage-honesty.test.tsx`.
    detail:
      "Runs for this creator have repeatedly failed in a way that cost us money and cost you nothing, so the product has stopped trying rather than keep burning them. Nothing was spent, no model was called, and your first run for this creator is untouched. There is nothing for you to change: this is a fault on our side, and it is recorded for an operator.",
  },
  // ---------------------------------------------------- SLICE 6: generation
  //
  // Every one of these is read on `/studio`, the screen that turns a creator's
  // idea into something they would publish and takes a credit for it. Three
  // rules hold across the block and each was broken at least once elsewhere in
  // this file before it was written down:
  //
  //  1. SAY WHETHER MONEY MOVED, in the same sentence as what happened. Ten of
  //     these fifteen refuse before the vendor is contacted and say so; the two
  //     that do not (`generation_recovery_required`, and `debit_refused_after_
  //     call` one screen up) say the opposite thing rather than staying quiet.
  //  2. NAME AN ACT THE READER MAY TAKE — or say plainly that there is not one
  //     and that it is ours to fix. A refusal whose printed remedy is not an
  //     action the reader can perform is the 2026-07-30 lesson's failure mode.
  //  3. NO UPGRADE PROMPT. `mode_not_in_plan` is the first refusal in this
  //     product that a reader could plausibly be sold out of, and it is written
  //     under the same rule `profile_cap` and `run_slot_busy` already carry.
  brain_not_activated: {
    title: "This creator has no activated brain yet",
    detail:
      "A draft is written from an activated brain — the Voice, Strategy and Kill Test versions you have confirmed — and this creator has none active, so there was nothing to write from. Nothing was spent and no model was called. Confirm a version on the brain page and activate it, then come back.",
  },
  mode_not_in_plan: {
    // IT DOES NOT NAME AN UPGRADE AS THE REMEDY, and the precedent is
    // `profile_cap` and `run_slot_busy` above. Two independent reasons, both
    // load-bearing: which modes a plan includes lives in the tier map in
    // `@respin/credits`, so a sentence here naming another plan's contents is
    // a second copy of that map that goes stale silently; and a refusal is not
    // a sales surface (non-negotiable 6, on a money path). What the reader gets
    // instead is the fact they can act on — this plan does not include it,
    // nothing was spent — and the billing page, which is where plans are
    // compared without a refusal banner steering the comparison.
    title: "Your plan does not include that mode",
    detail:
      "Plans differ in which modes they include, and this workspace's plan does not include the one that was asked for. Nothing was spent and no model was called. The billing page shows what this workspace is on today.",
  },
  creative_request: {
    title: "That form or filming limit is not one the studio accepts",
    detail:
      "The request carried a creative form, or a filming limit, that the studio form does not offer: an unknown form, a form for a mode that does not take one, or a limit that is too long or not a whole number of minutes. It stopped before anything ran, so nothing was spent and no model was called. Choose the form and the limits again on the studio page.",
  },
  creative_revision_legacy: {
    title: "That draft keeps its original format",
    detail:
      "The draft you are revising was made before creative forms existed, so its revision keeps that format and cannot take a form or filming limits. Nothing was spent and no model was called. Send the revision without a form, or start a new draft to use one.",
  },
  // Launch L2 (R-151).
  creative_revision_form: {
    title: "A revision keeps the form of the draft it revises",
    detail:
      "A revision makes the same draft better — shorter, easier to film — in the same form. A different form is a different script, which is a new commission priced as one, not a revision. Nothing was spent and no model was called. Send the revision without changing the form, or develop the concept again in the form you want.",
  },
  creative_piece: {
    title: "That concept could not be used",
    detail:
      "The concept or piece this page sent could not be used as it was, so nothing was changed. Nothing was spent and no model was called. Reload the page and choose again.",
  },
  creative_piece_not_found: {
    title: "That concept is not available here",
    detail:
      "The concept or piece this page named is not available on this creator profile, so nothing was changed. Nothing was spent and no model was called. Reload the page and choose from this creator's own concepts.",
  },
  creative_piece_source: {
    title: "There is no concept at that position to develop",
    detail:
      "The output this page named has no concept at that position — or it is not a set of concepts — so nothing was chosen. Nothing was spent and no model was called. Reload the page and choose one of the concepts shown.",
  },
  creative_piece_stale: {
    title: "This page was out of date",
    detail:
      "The piece changed since this page was shown — another tab may have started a new generation or cancelled it — so nothing was changed. Nothing was spent and no model was called. Reload to see where it stands now.",
  },
  creative_piece_not_commissionable: {
    title: "This piece cannot be developed any more",
    detail:
      "This piece was cancelled, or the request did not match what a piece can commission, so nothing was started. Nothing was spent and no model was called. Choose the concept again to start a fresh piece.",
  },
  generation_quote_changed: {
    title: "The script's price changed since it was shown",
    detail:
      "The price shown when you chose this concept is no longer the current one, so the script was not started — you are never charged a price you were not shown. Nothing was spent and no model was called. Press New generation to see the current price, then confirm again.",
  },
  // AUDIT P3-R2 (R-158). Every one of these is TRUE BY CONSTRUCTION about
  // money: the ceiling is checked before any vendor call and before any spend
  // row, so "nothing was spent" is the refusal's own position. Each names the
  // part and the act that shrinks it; no copy offers an automatic trim, because
  // silently dropping context would change the output without saying so.
  input_too_large: {
    title: "This request is too large to send",
    detail:
      "Everything this draft would carry — your brain, the frameworks it is offered, what you pasted and the instructions — adds up to more than one request may hold, so nothing was sent to the model and nothing was spent. Shorten what you pasted, or trim the longest document on your Brain page, then run it again.",
  },
  input_too_large_voice: {
    title: "Your Voice document is too large for one request",
    detail:
      "The largest part of this request is your Voice document, and with everything else it carries the request is over the limit one request may hold — so nothing was sent to the model and nothing was spent. Trim some Voice entries on your Brain page, then run it again.",
  },
  input_too_large_strategy: {
    title: "Your Strategy document is too large for one request",
    detail:
      "The largest part of this request is your Strategy document, and with everything else it carries the request is over the limit one request may hold — so nothing was sent to the model and nothing was spent. Trim some Strategy entries on your Brain page, then run it again.",
  },
  input_too_large_killtest: {
    title: "Your Kill Test document is too large for one request",
    detail:
      "The largest part of this request is your Kill Test document, and with everything else it carries the request is over the limit one request may hold — so nothing was sent to the model and nothing was spent. Trim some Kill Test rules on your Brain page, then run it again.",
  },
  input_too_large_frameworks: {
    title: "This request is too large to send",
    detail:
      "The largest part of this request is the frameworks it is offered, and with everything else it carries the request is over the limit one request may hold — so nothing was sent to the model and nothing was spent. Shorten what you pasted or trim the longest document on your Brain page, then run it again.",
  },
  input_too_large_input: {
    title: "What you pasted is too long for one request",
    detail:
      "The largest part of this request is what you typed or pasted, and with everything else it carries the request is over the limit one request may hold — so nothing was sent to the model and nothing was spent. Shorten it, then run it again.",
  },
  input_too_large_posts: {
    title: "The saved posts are too long to read in one request",
    detail:
      "Together, the posts this run would read are over the limit one request may hold — so nothing was sent to the model and nothing was spent, and your first run for this creator was not used. Remove or shorten some of the posts you pasted, then run it again.",
  },
  // AUDIT P3-R3 (R-158). NOT the uncharged copy: this creator was being
  // charged, nothing failed, and the remedy is time.
  generation_window_cost_cap: {
    title: "This creator has hit the hourly generation ceiling",
    detail:
      "Generations for this creator in the last hour have reached the ceiling we set to stop a runaway — a bound no ordinary use reaches. Nothing was spent and no model was called this time. It clears on its own as the hour moves on.",
  },
  // AUDIT P3-A4 (R-157). The draft is FINISHED AND HELD — never "lost", never
  // "held" without the path and the time. The time is on /studio beside the
  // draft, read from the attempt itself.
  generation_held_paused: {
    title: "Your draft is finished and held while the workspace is paused",
    detail:
      "The model answered and your draft is stored, but this workspace is paused, so it was not charged and not added to your drafts. It is held for 24 hours from when the model answered — the exact time is shown with it under Held drafts on Studio. Resume from Billing, then press Finish this draft. If the time passes first, the draft is removed and nothing is charged.",
  },
  generation_held_balance: {
    title: "Your draft is finished and held until your balance covers it",
    detail:
      "The model answered and your draft is stored, but your balance could not cover its price, so it was not charged and not added to your drafts. It is held for 24 hours from when the model answered — the exact time is shown with it under Held drafts on Studio. Buy an overage pack or turn on auto-top-up from Billing, then press Finish this draft. If the time passes first, the draft is removed and nothing is charged.",
  },
  generation_held_transient: {
    title: "Your draft is finished and held for a moment",
    detail:
      "The model answered and your draft is stored, but saving it met a brief conflict on our side, so it was not charged and not added to your drafts. It is held for 24 hours from when the model answered — the exact time is shown with it under Held drafts on Studio. Press Finish this draft there. If the time passes first, the draft is removed and nothing is charged.",
  },
  // ONLY "no such held draft for this creator": a finished draft replays, and
  // one past its hold time is the recovery terminal — each has its own code.
  held_draft_unavailable: {
    title: "That draft cannot be finished here",
    detail:
      "There is no held draft with that reference for this creator — the page may be out of date. Nothing was charged. Reload Studio to see the drafts that are still held.",
  },
  concept_context_needed: {
    title: "Tell us what your videos are about first",
    detail:
      "Your confirmed brain does not yet say what you make, so there is nothing safe to build concepts from — and the studio will not invent it. In one sentence, say what your videos are about, then try again. Nothing was spent and no model was called.",
  },
  revision_preset: {
    title: "That revision is not one this page offers",
    detail:
      "The page sent a revision it does not offer, so nothing was started. Nothing was spent and no model was called. Reload the page and choose one of the revisions shown.",
  },
  llm_transport_refused: {
    title: "This server is set up for testing only",
    detail:
      "This server was started with a test-only setting that is refused outside a test environment, so the request did not run. Nothing was spent and no model was called. This is a fault on our side, not something you did, and it is recorded for an operator.",
  },
  unknown_mode: {
    title: "That is not one of this product's modes",
    detail:
      "The request named a mode this product does not have, so it stopped rather than guessing which one was meant. Nothing was spent and no model was called. Use the form on the studio page rather than a hand-built link.",
  },
  unpriced_operation: {
    title: "This build could not price that run",
    detail:
      "Rather than charge a number nobody chose, the run stopped before it started. Nothing was spent and no model was called. This is a fault in the build rather than anything you did, and it is recorded for an operator to fix.",
  },
  generation_uncharged_cost_cap: {
    // SAME SENTENCE TO THE CREATOR AS ITS SIBLING, and deliberately so: which
    // of the two bounds bit is an OPERATOR's diagnosis (frequency versus cost
    // per call), and the creator's situation is identical either way — our
    // fault, nothing spent, self-clearing inside the window. Saying "you have
    // spent too much" would be false: these are attempts they were not charged
    // for.
    //
    // TWO CAUSES SINCE R-173, AND THE COPY NAMES BOTH (billing verification,
    // 2026-10-07): a draft stopped only because it made a claim this product
    // won't make is free and counts here too, and for that cause there IS a
    // remedy the creator owns. "A fault on our side" is said only of the
    // other cause, where it is true.
    title: "Too many uncharged drafts for this creator just now",
    detail:
      `Recent drafts for this creator stopped before anything was charged, so we have paused new ones for a short while. Nothing was spent and no model was called this time, and no credits were used. ${UNCHARGED_CAP_WINDOW_CLAUSE} If those drafts were stopped because they made a claim this product won't make, ask for a draft without that claim. If they failed for any other reason, the fault is on our side rather than anything you did.`,
  },
  generation_uncharged_attempt_cap: {
    // THE OPPOSITE RULE FROM `uncharged_attempt_cap` ABOVE, and that is the
    // whole reason the two codes exist separately (billing gate round 2,
    // 2026-09-01). This code shipped carrying its sibling's rule — "the count
    // is lifetime over an append-only table, and the clearing act is an
    // operator fixing the cause" — copied at a moment when it was true of both.
    // `generation.unchargedAttemptWindowMinutes` made it false HERE:
    // `unchargedAttemptWindowStart` windows the generation count and leaves
    // onboarding's at the epoch, so this refusal clears itself inside an hour
    // at the seeded value with no operator involved, and the detail was still
    // telling the creator "there is nothing for you to change — this is a
    // fault on our side". That withheld the only remedy that exists.
    //
    // THE CLEARING SENTENCE IS IMPORTED, NOT WRITTEN HERE
    // (`UNCHARGED_CAP_WINDOW_CLAUSE`, `@respin/credits`). Two independent
    // literals are how the stale one survived; the package message and this
    // copy now cannot say different things about whether it clears. It names
    // the mechanism rather than a number for the reason the constant's own
    // docblock gives: this map is static, the `?e=` channel carries a code and
    // never a message, so nothing on this path can read the stored config —
    // and a hard-coded "within the hour" here would be a second copy of a
    // value an operator can change without touching this file.
    //
    // IT STILL DOES NOT PROMISE A FIX. "Clears on its own" and "is fixed" are
    // different claims: the cause repeats until we deal with it. The ask to
    // "tell us" it used to carry promised a channel that did not exist; since
    // R-176 the copy says the failure is recorded, and `billingErrorCopy`
    // appends the operator-set support address when there is one.
    //
    // TWO CAUSES SINCE R-173 (billing verification, 2026-10-07), as on its
    // sibling: a free claim refusal counts here, and its remedy is the
    // creator's; the "ours" sentence is said only of the other cause.
    title: "Drafts for this creator keep stopping before they are charged",
    detail: `Drafts for this creator have repeatedly stopped before anything was charged, so the product has paused new ones. Nothing was spent and no model was called this time. ${UNCHARGED_CAP_WINDOW_CLAUSE} If they were stopped because they made a claim this product won't make, ask for a draft without that claim. If they failed for any other reason, the failure is ours and will keep happening until we fix the cause; it is recorded for an operator.`,
  },
  generation_in_flight: {
    title: "That draft is already running",
    detail:
      "The same run was submitted twice, so it was not started a second time and nothing extra was spent. Wait for the one in flight to finish, or start a new draft. If nothing ever arrives, starting a new draft is safe — it takes its own id and is charged on its own.",
  },
  generation_already_refused: {
    // OPPOSITE INSTRUCTIONS from `generation_in_flight`, which is why it is not
    // the same code: "wait for it" and "it already finished without an answer"
    // cannot both be printed for one reader.
    title: "That draft already finished without an answer",
    detail:
      "This run ended earlier without producing anything usable, so it was not run again — repeating it would fail the same way and cost us the same money. Nothing extra was spent. Start a new draft.",
  },
  generation_payload_mismatch: {
    // TWO CAUSES, AND THE SCREEN MAY NOT PICK ONE (slice 7 cross-boundary
    // pass, 2026-09-01). This copy asserted that the request "reused an id
    // that belongs to another draft". All the server knows is that the hash
    // stored against this attempt id is not the hash of the request that
    // arrived, and `hashRequest` gained a SIXTH field in slice 7 — so an
    // attempt started by an earlier build has a stored hash taken over five
    // fields and cannot match, however faithfully the creator resubmitted.
    // `GenerationPayloadMismatchError`'s own message already named both; this
    // one named the accusing half. Telling a creator they submitted a
    // different request when they did not is the defect class this slice has
    // fixed twice already, so the screen states the OBSERVATION and the
    // remedy, which is the same either way.
    title: "That run id does not match this request",
    detail:
      "This id was already used for a request that does not match this one, so it was refused rather than answered with that one's output — you would have been shown a draft for something you did not ask for. A draft started before this product was last updated reads the same way, so this does not necessarily mean you asked for anything different. Nothing was spent and no model was called. Start the draft again from the studio page.",
  },
  generation_recovery_required: {
    // ONE OF THE TWO ON THIS SCREEN WHERE THE VENDOR WAS ACTUALLY REACHED. The
    // creator's balance is untouched — `settleGeneration` and `debitCredits`
    // share one transaction, so a failure there rolls both back — and saying so
    // is the whole job of this copy.
    title: "That draft could not be finished safely",
    detail:
      "The run got as far as the model and then could not be completed, so it has been flagged for us to look at rather than run again — running it again would be a second real charge for one press. Nothing was taken from your credit balance. Start a new draft when you are ready.",
  },
  generation_attempt_state: {
    title: "That draft has already moved on",
    detail:
      "The run was asked to take a step it cannot take from where it is — usually because it has already finished, or because it belongs to a different creator profile. Nothing was changed and nothing extra was spent. Start a new draft.",
  },
  generation_assembly: {
    title: "There was not enough to build a draft from",
    detail:
      "A draft needs something to work from: what you typed in, a platform, and an activated brain for this creator. One of those was missing, so nothing was built. Nothing was spent and no model was called. Fill in the box, pick a platform, and make sure this creator has an activated brain.",
  },
  reference_unusable: {
    // OURS, AND THE COPY SAYS SO. The trusted autopsy projection is something
    // this product built; a creator cannot fix it by rewriting their input, so
    // the remedy must not imply they can. Nothing is charged: the reference is
    // now checked at `runGeneration` entry, before any vendor call.
    title: "This trend could not be used as a reference",
    detail:
      "The analysis behind this trend is not in a shape the copy check can compare a draft against, so nothing was generated. Nothing was spent and no model was called. This is our side of it rather than anything about what you wrote — try a different trend.",
  },
  generation_unusable: {
    // OUR PARSE FAILURE, and the money sentence is the point (slice card
    // question 4): the vendor charged us and the creator is not charged.
    title: "The model's answer was not usable",
    detail:
      "The answer came back in a shape this product could not read, so nothing was stored — a half-parsed draft is worse than none. Nothing was taken from your credit balance. This is our side of the exchange rather than anything you did; try again.",
  },
  kill_test_failed: {
    // THE SCORING CALL'S FAILURE, not the kill test finding fault with a draft.
    // A draft that fails the hard rules twice is an HONEST REFUSAL rendered on
    // the studio page with its reasons and a sharper angle — it is the product
    // working (REQ-C03), it is charged for (except a refusal caused only by
    // the claim scan, which is free — R-173), and it is not an error code at all.
    title: "The check on your own criteria did not complete",
    detail:
      "Your draft is scored against the kill-test criteria you wrote, and that scoring step did not return something readable, so the run stopped rather than reporting a verdict it did not have. Nothing was taken from your credit balance. Try again.",
  },
  no_creator_rules: {
    title: "This creator has no kill-test criteria yet",
    detail:
      "The scoring step was asked to judge a draft against this creator's own criteria and there are none written yet. This is not a failure of the draft: the product's own hard rules still ran. Nothing extra was spent. Add kill-test criteria on the brain page if you want drafts judged against them too.",
  },
  // ------------------------------------------------------- SLICE 7 (stage D)
  //
  // THE RULE EVERY SENTENCE BELOW OBEYS, and it is R15: none of them names an
  // upgrade, another plan, or "subscribing" as the remedy — the
  // `profile_cap` / `ModeNotInPlanError` precedent. Two of them are about a
  // plan boundary (`private_framework_tier`) or our own configuration
  // (`unknown_entitlement_tier`), which is exactly where the temptation is.
  //
  // WHERE THAT IS ENFORCED, corrected after a billing gate measured the claim
  // that used to be here (2026-09-01). This comment named
  // `tests/billing-ui.test.tsx` as scanning "this whole map for the shape", and
  // that file contained no such scan — zero matches for `upgrade` in it. The
  // property held anyway, on the two SCREENS: `tests/studio-ui.test.tsx`
  // derives the pattern over `STUDIO_ERROR_CODES` with a planted-violation
  // case, and `tests/framework-ui.test.tsx` does the same over
  // `FRAMEWORK_ERROR_CODES`. A comment naming the wrong witness is how the real
  // witness gets deleted later, so the missing map-wide scan has now been
  // written too: "no billing copy sells a plan" in `tests/billing-ui.test.tsx`
  // runs the same pattern over EVERY `BILLING_ERROR_CODES` entry, with the two
  // codes that legitimately say "subscribe" — `no_stripe_customer` and
  // `no_live_subscription`, which are about opening a billing account at all
  // rather than about a bigger plan — pinned as a named, justified exception
  // instead of the pattern being narrowed to hide them.
  //
  // AND THE SECOND RULE: every one of them says what happened to the MONEY.
  // All but one are raised before a vendor is contacted, so they say nothing
  // was spent — plainly, not by omission. `generation_lineage` is the
  // exception and its own comment says why it is worded differently.
  revision_parent: {
    title: "That revision could not be linked to the output it revises",
    detail:
      "Nothing was generated and nothing was spent. A revision is built from the output it revises, and this one could not be tied to that output. Reopen the draft you meant to revise and start the revision from there, or start a fresh draft in the same mode.",
  },
  revision_parent_not_yours: {
    title: "That revision could not be linked to the output it revises",
    detail:
      "Either that output is not this creator's, or it no longer exists. Nothing was generated and nothing was spent. Reopen the output you want to revise from this creator's own drafts and start the revision from there.",
  },
  revision_parent_not_revisable: {
    title: "There is no draft there to revise",
    detail:
      "That output was an honest refusal — the checks stopped it, so no draft was ever stored and there is nothing for a revision to work from. Nothing was generated and nothing was spent. The refusal names a sharper angle; trying it is a new draft rather than a revision, and it is priced as one.",
  },
  revision_parent_different_mode: {
    title: "A revision stays in the mode it was written in",
    detail:
      "This one asked for a different mode from the output it revises, and the two produce different documents — so it was refused rather than quietly rewritten as something else. Nothing was generated and nothing was spent. Revise it in the mode it was written in, or start a new draft in the mode you want.",
  },
  revision_parent_unreadable: {
    title: "That output cannot be read back",
    detail:
      "The stored draft is not in a shape this version of the product can build on, so nothing was made from it. Nothing was generated and nothing was spent, and the output itself is untouched — it is still in your export. This one is ours to look at; a new draft in the same mode is the way forward meanwhile.",
  },
  generation_lineage: {
    // The AUTHORITY's refusal, raised inside the settlement transaction —
    // `RevisionParentError` above is the same question asked one step earlier,
    // where the answer costs nothing. Reaching THIS one means the parent
    // stopped resolving between the two checks, i.e. after the model was
    // called, so the copy must not repeat the earlier one's "nothing was
    // generated" wording about work that has by then already happened.
    title: "That revision could not be stored against the output it revises",
    detail:
      "The link between this revision and the draft it came from could not be made, so the revision was not stored. Nothing was taken from your credit balance. Reopen the output you meant to revise and try again; if it keeps happening, retrying will not help, because this one is on our side.",
  },
  feedback_reaction: {
    title: "That reaction is not one this product has",
    detail:
      "Your feedback was not recorded. The reactions are a fixed list this page renders, so this usually means the page has been open since before an update. Reload and choose one of the reactions shown. Nothing about your draft changed.",
  },
  feedback_target: {
    title: "That output is not available on this creator profile",
    detail:
      "The feedback was not recorded, because the draft it is about could not be found for this creator. Reopen the output from this creator's own drafts and leave the feedback from there. Nothing was changed and nothing was spent.",
  },
  // Audit P6-A1 (R-174). The reaction EXISTS somewhere, so this copy never
  // says it "was not recorded"; it says it is not one this profile can
  // address, which is the byte-identical answer for foreign and missing ids.
  feedback_exclusion_target: {
    title: "That reaction is not on this creator profile",
    detail:
      "It was not left out of future drafts, because it is not one of the reactions recorded for this creator. Reload Studio and use the control beside a reaction you recorded here. Nothing was changed and nothing was spent.",
  },
  feedback_note: {
    title: "That note could not be saved with your reaction",
    detail:
      "The note beside a reaction is optional, and this one was either empty-but-sent or longer than the limit shown under the box. Nothing was recorded — including the reaction — so choose the reaction again with the note shortened, or with no note at all.",
  },
  feedback_duplicate: {
    title: "You have already recorded that reaction on this output",
    detail:
      "Nothing was changed, and any note you just typed was NOT kept. Feedback is a record of what you said the first time, so it is never overwritten. If you have something to add, choose a different reaction — you can record more than one about the same draft.",
  },
  framework_access: {
    title: "That framework is not available on this creator profile",
    detail:
      "Nothing was changed. Private frameworks belong to one creator profile, and the shared library is not edited from here — it is curated, and every profile sees the same approved set. Open the framework from this creator's own list and try again.",
  },
  framework_stale: {
    title: "That framework has a newer version than this page was showing",
    detail:
      "Nothing was written, and nothing was lost: every version of a framework is kept, so the newer one is intact and so is the one you were editing. Reload to see the current version, then make your change again.",
  },
  framework_content: {
    // THE SCREEN MAY NOT BE MORE CERTAIN THAN THE CHECK (slice 7
    // cross-boundary pass, 2026-09-01). This detail asserted as FACT that the
    // framework "carried" a phrase "crediting the move to a named person".
    // The rule behind that clause (`attributed_person` in
    // `packages/db/src/frameworks.ts`) is lexical: it can see that a phrase has
    // the SHAPE of an attribution and cannot know a capitalised word is a
    // person — which is why the same gate round hedged the server's own detail
    // to "reads like it credits the move to a named person" after the rule
    // over-refused five of seven ordinary sentences ("a concept from
    // Japanese", "from Reels"). A refusal naming a cause that did not happen is
    // the class R-76 corrected; a screen restating that cause as certain
    // reopens it one layer up.
    //
    // THE MATCHED SPAN IS NOT HERE, AND THAT IS A RECORDED RESIDUAL RATHER
    // THAN AN OVERSIGHT. `FrameworkContentError` carries `field` and `detail`,
    // and this table maps a CODE to canned copy — nothing on the action
    // contract carries per-instance context to a screen. Naming the field
    // would need that contract widened, which is a change to every action that
    // reports a refusal, not to this entry. Recorded in `decisions.md` R-77.
    // Until then the copy says which classes the check looks for and admits it
    // reads wording, so a creator can find the phrase themselves rather than
    // being told a sentence they did not write.
    title: "A framework describes a mechanism, not a person or a number",
    detail:
      "This one was not stored because something in it reads like a thing a mechanism never carries — a handle, a link, a follower count or another metric, or a phrase crediting the move to a named person. Those checks read wording rather than meaning, so one of them can be wrong about a sentence you meant plainly. Describe what the move does and why it works, without naming who did it or how it did. Nothing was stored and nothing was spent.",
  },
  framework_limit: {
    title: "That framework is past one of the limits",
    detail:
      "Nothing was stored. Either a field is longer than the limit shown beside it, a list holds more entries than allowed, or this creator profile already holds as many live frameworks as it can. Shorten it, or retire one you no longer use, and try again — a retired framework keeps every version of its text.",
  },
  private_framework_tier: {
    // R15, AND THIS IS THE ENTRY THE RULE WAS WRITTEN FOR. A tier refusal is
    // where "upgrade for this" writes itself, and it is a sales prompt on a
    // screen that has just refused somebody. What the copy does instead is
    // state the boundary and name the thing that IS available on every plan —
    // a fact the reader can act on rather than a price.
    title: "This plan does not include private frameworks",
    detail:
      "Nothing was stored and nothing was spent. The shared framework library is on every plan, it is what this product builds drafts from, and it is curated rather than editable — so your drafts still draw on it exactly as they did. Private frameworks are the ability to add your own alongside it.",
  },
  unknown_entitlement_tier: {
    title: "We could not tell what your plan includes",
    detail:
      "This build has no answer for the plan on this workspace, so nothing was changed rather than guessed at. That is about our configuration, not about your plan, and nothing you can change from here will fix it. Nothing was spent. The shared framework library is unaffected meanwhile.",
  },
  // ------------------------------------------------------- SLICE 8c (R13)
  //
  // The paste-a-reference refusals. Every one is raised BEFORE any row is
  // written and before any credit moves (R8's order: mint → tier → pause →
  // lock → balance → intake → debit), so every one says so. NO NUMBER IS TYPED
  // HERE: the transcript limit and the title limit are stated on the form
  // itself from the package constants (`POST_CONTENT_MAX`,
  // `PASTED_REFERENCE_TITLE_MAX`), and this map is static — the `feedback_note`
  // precedent, "longer than the limit shown under the box".
  pasted_reference_tier: {
    // IT NAMES THE PLANS AND DOES NOT SELL ONE — the `profile_cap` /
    // `mode_not_in_plan` precedent, on a refusal that is the single most
    // tempting place in this product to write "upgrade". Free stays
    // digest-only (REQ-E05, R-96); the reader gets the boundary and the
    // billing page, which is where plans are compared without a refusal
    // banner steering the comparison.
    title: "This plan does not include pasting references",
    detail:
      "Pasting a reference for autopsy is part of the Creator, Pro and Studio plans, and this workspace's plan does not include it. Nothing was saved and nothing was charged. The billing page shows what this workspace is on today.",
  },
  pasted_reference_input: {
    title: "That reference was not saved",
    detail:
      "One of the four fields — the link, the title, the transcript or the niche — was refused, and this build could not say which. Nothing was saved and nothing was charged. Check each against the limit shown beside it and submit again.",
  },
  pasted_reference_url: {
    title: "That link cannot be used",
    detail:
      "The link has to be a full public web address starting with http:// or https://, and this one was not. Nothing was saved and nothing was charged. Paste the video's address as it appears in the browser and submit again.",
  },
  pasted_reference_title: {
    title: "That title is too long",
    detail:
      "The title is optional, and when given it has to fit the limit shown under the box. Nothing was saved and nothing was charged. Shorten it, or leave it blank and the link's site is shown instead.",
  },
  pasted_reference_transcript: {
    title: "That transcript was not saved",
    detail:
      "The transcript has to be present, not blank, and within the limit shown under the box. Nothing was saved and nothing was charged. Paste the transcript of one video and submit again.",
  },
  pasted_reference_niche: {
    title: "That niche is not one this creator tracks",
    detail:
      "A pasted reference can only be filed under a niche this creator profile already tracks, and this one was not on that list — usually because the page has been open since the niche was removed. Nothing was saved and nothing was charged. Reload, pick a niche from the list or choose none, and submit again.",
  },
  refund_source_never_expires: {
    // RAISED ON A PAGE LOAD, NOT A PRESS: `/trends` settles parked autopsies
    // before it reads them, and this is `refundCredits` refusing to date the
    // returned credits because the ones the paste consumed had no expiry
    // (D-M1-7). The page shows this instead of the feed, so the copy has to
    // say plainly that the money is not lost, that nothing else on the page
    // is wrong, and that the fix is an operator's — a goodwill adjustment
    // with an explicit expiry — rather than anything the reader can press.
    title: "A refund you are owed could not be dated",
    detail:
      "An autopsy you paid for could not be completed, so its credits are due back to you — but the credits that paid for it came from a grant with no expiry date, and rather than invent an expiry for the returned ones the refund stopped. Nothing was taken from your balance and the return is still owed, not lost. This is ours to resolve: an operator can return the credits as an adjustment with an explicit expiry. The refusal code and error type are recorded.",
  },
  // ----------------------------------------------------- SLICE 9A: /results
  //
  // FOUR REFUSALS, FOUR REMEDIES, AND EVERY REMEDY IS SOMETHING THE READER CAN
  // DO. `results` is append-only: no update path, no delete path. So a refusal
  // that leaves a creator holding numbers they cannot store, or that sends
  // them to press the same button again, is the shape CLAUDE.md's 2026-07-30
  // lesson names — a control that becomes the outage. Two of the four (the
  // treatment key and the duplicate) therefore name a DIFFERENT act that works
  // rather than a retry that cannot.
  //
  // AND NONE OF THEM PROMISES ANYTHING. `tests/results-honesty.test.tsx`
  // renders every code in this table through the results refusal banner and
  // scans it against the shared claims canon, because `/results` resolves
  // whatever code its catch classifies — the channel is open, so the whole
  // table is this screen's copy.
  result_treatment_key: {
    title: "That result was not logged, because what it tested could not be identified",
    detail:
      "A result about one of your drafts carries a record of what that draft was built from — the framework, the mode, and the version of your brain that was in force — and for this one, part of that record is missing or unreadable. Nothing was stored and nothing was spent. Rather than guess, this refuses: a treatment named wrongly would put your post in a group it does not belong to. You can log the same result right now by choosing the option that says it is not about one of your Respin drafts — it is stored and shown, it is not counted into a baseline (only a verified analytics connector could supply a counted result), and it says plainly that nothing here can name what it tested.",
  },
  result_input: {
    title: "That result was not logged",
    detail:
      "Something on the form does not describe an observation that can be stored. The usual causes are an end date that is not after the start date, a count entered without its denominator or a denominator without its count, a denominator of zero, or a blank note that was sent as if it said something. Nothing was stored and nothing was spent, and the values are still in the form. Check the window and each lever against the notes beside them, then log it again.",
  },
  result_target: {
    title: "That draft is not available on this creator profile",
    detail:
      "The result was not stored, because the draft it names could not be found for this creator. That usually means this page was open while the selected creator profile changed underneath it. Reload the page and pick the draft from this creator's own list, or choose the option that says it is not about one of your Respin drafts if it was about something else. Nothing was changed and nothing was spent.",
  },
  result_duplicate: {
    title: "A result for that draft, metric and window is already logged",
    detail:
      "Nothing was changed, and the numbers you just typed were NOT kept. A logged result is a record of what you observed, so it is never overwritten and never quietly replaced — a cohort minimum reached by pressing submit twice would be a rule warranted by one post. If you are reporting how the same post did over a longer or a later period, change the observation window and log it again: that is a second observation, not a correction.",
  },
  checkout_reconciliation_required: {
    title: "This checkout needs reconciliation",
    detail:
      "A subscription checkout may already exist or may have completed, but its webhook has not safely converged with this workspace yet. No new checkout was opened because that could bill you twice. Wait a few minutes and reload; if it persists, an operator must reconcile the saved checkout attempt with Stripe before you try again.",
  },
  tier_checkout_authority: {
    title: "Subscription billing authority could not be verified",
    detail:
      "The billing request did not continue because its signed subscription authority did not match the provider-bound rollout. Reload and try once; if it persists, an operator must reconcile the saved checkout attempt and billing rollout before you continue.",
  },
  tier_checkout_rollout: {
    title: "Subscription checkout is temporarily unavailable",
    detail:
      "The safer subscription-checkout protocol has not finished its operator-controlled rollout, so no checkout was opened and nothing was charged. Try again after the rollout is complete; an operator can inspect the rollout status if this persists.",
  },
  topup_reconciliation_required: {
    title: "A top-up may still be in flight",
    detail:
      "This run was refused and no model was called, but the payment provider did not confirm whether the automatic top-up completed. Do not buy another pack or retry yet: an administrator must reconcile the pending top-up first, then your balance will update if it succeeded.",
  },
  auto_topup_status_unavailable: {
    title: "Auto-top-up status is temporarily unavailable",
    detail:
      "The billing page cannot verify whether the safer auto-top-up protocol is active, so it does not present a pending preference as live. Reload before changing this setting; if the status remains unavailable, ask an administrator to check the rollout state.",
  },
  billing_reauthentication: {
    title: "Confirm this billing change",
    detail:
      "Enter the current password for this signed-in session and try again. Nothing was changed or charged.",
  },
  performance_learning_unavailable: {
    title: "Performance records are temporarily unavailable",
    detail:
      "This is an operational configuration issue, not a restriction of your plan. Your results and proposal history remain readable. An operator needs to repair the billing configuration before performance-record writes can continue.",
  },
  performance_learning_view_only: {
    title: "This workspace has view-only performance-record access",
    detail:
      "Your results and proposal history remain readable. Logging results, refreshing proposals, and changing the brain require full performance-record access.",
  },
  promotion_access: {
    title: "That proposal is not available here",
    detail:
      "It may belong to another creator profile or no longer be readable. Your existing results and proposal history remain available; reload this page and choose a proposal from this creator profile.",
  },
  promotion_payload: {
    title: "That proposal cannot be reviewed",
    detail:
      "Its stored evidence no longer has a usable review shape, so no decision was made. Refresh proposals and review the current record again; if this remains, an operator needs to investigate.",
  },
  promotion_freshness: {
    title: "That proposal is no longer the version you reviewed",
    detail:
      "No decision was made. Refresh the proposal and read every field and source again before choosing accept or reject.",
  },
  promotion_decision: {
    title: "That proposal decision was refused",
    detail:
      "No decision was made because the complete reviewed field set was not available. Open the full review again and use its decision controls.",
  },
  /**
   * THE COMPARISON'S POPULATION COULD NOT BE DESCRIBED (slice 9a).
   *
   * WHY THE CLASS EXISTS, because the copy only makes sense with it: this
   * refusal used to be a `WorkspaceAccessError`, which IS covered in this
   * table — so it would never have rendered "Something went wrong". It would
   * have rendered something worse. That code's copy says "Sign in with the
   * account that owns it, or ask its owner for access", so a creator whose
   * comparison could not be set up would have been told, confidently, to sign
   * in as somebody else. A printed fix that is USABLE AND WRONG sits on the
   * same side of CLAUDE.md's 2026-07-30 line as one that cannot be followed.
   *
   * SCOPE, STATED RATHER THAN ASSUMED: 9a CANNOT REACH THIS. This screen
   * passes no stratum at all — the comparison arrives already built from the
   * facade — so there is no path from `/results` to this copy in this slice.
   * It is owed anyway for two reasons: 9b's first stratum-passing caller is
   * the one that will hit it, and `tests/billing-ui.test.tsx` derives its
   * population from "every Error class app/** can receive from a facade",
   * which is exactly the derived population CLAUDE.md's 2026-08-29 lesson says
   * goes stale the day a second path appears.
   *
   * IT MAKES NO CLAIM ABOUT WHAT WAS PRESERVED, and that absence is the
   * decision rather than an omission — the class's own message dropped the
   * same sentence for the same reason. "Nothing was changed" is a claim about
   * the whole call path, and nothing structurally stops a later caller raising
   * this from inside a transaction that has already written; the reassurance
   * would then be confident and wrong, which is the defect this class was
   * split out of, one slice later. A caller that KNOWS what it preserved says
   * so itself, where the knowledge is.
   *
   * NOT A SYNONYM EITHER. `profile-scope.test.ts` pins the absence by
   * PATTERN and discloses its own limit — it bans the spellings it
   * enumerates, not the class of claim — so "your results are safe", "nothing
   * was lost" and every kindly-worded cousin are out by this paragraph rather
   * than by a regex. What is said instead is the true and useful half: the
   * fault is ours, the reader caused none of it, and there is nothing on the
   * form to correct.
   *
   * IT NAMES NO PART AND NO VALUE. The class's `detail` says which part of
   * the stratum was unusable in words; that message never crosses to a screen
   * or a log (`safe-log.ts`), and this static copy cannot see it — so the
   * sentence describes the KIND of failure and does not pretend to know which.
   */
  comparison_stratum: {
    title: "That comparison could not be set up",
    detail:
      "The population this comparison was asked to cover was not one the product could describe, so no comparison is shown. This is a fault on our side, not something wrong with the results you logged: you caused none of it and there is nothing on the form to correct. Reload the page and try again; the refusal code and error type are recorded.",
  },
  /**
   * A COMPARISON COULD NOT BE COMPUTED FROM STORED ROWS (slice 9a).
   *
   * NINE THROW SITES, ONE CODE, and the judgement is the same one that split
   * `comparison_stratum` out of `workspace_access` — applied here and coming
   * out the other way. The four `result_*` codes are four things a creator's
   * SUBMISSION can be, so they need four remedies. These nine are one thing:
   * the product could not compute a comparison from data it had already
   * stored. A creator can act on none of them, the remedy is identical for
   * all nine, and splitting them would produce codes whose creator-facing
   * words were the same sentence typed twice.
   *
   * ---- AN OPERATOR GAP THIS ENTRY RECORDS AND DOES NOT CLOSE. NO OWNER YET.
   *
   * WHAT ONE CODE COSTS: `logRefusal` records the code and the class name, so
   * an operator reading a log line cannot tell a zero denominator from a
   * cross-profile refusal — nine causes arrive as one line. A second code
   * would not fix it either, and that is the part worth keeping: all nine are
   * ONE class, so the class name is equally uninformative, and splitting
   * creator-facing copy to do a taxonomy's job would give two identical
   * sentences and still no operator signal.
   *
   * THE INSTRUMENT THAT WOULD FIX IT IS NOT A CODE. It is the exception's own
   * detail, which names the cause in words and which `safe-log.ts`
   * deliberately does not log — for a reason that is right and unrelated to
   * this (a foreign error's message can carry creator content). Closing this
   * therefore means a way to carry a SAFE, closed-vocabulary cause label from
   * a package to a log line, which is a piece of machinery this product does
   * not have and which no slice owns. Left stated rather than invented here:
   * a cause label smuggled into this table would be a screen's copy map
   * pretending to be operator telemetry.
   *
   * THE ONE THAT WOULD MOST DESERVE ITS OWN CODE IS THE ONE THAT MUST NOT HAVE
   * IT: the cross-profile guard (rows from more than one profile reaching one
   * comparison). Its remedy is identical, and a distinguishable refusal would
   * tell a creator that another profile's rows touched their comparison —
   * alarming, unactionable, and a disclosure that helps nobody.
   *
   * ---- WHICH OF THE NINE ARE BELIEVED UNREACHABLE, AND WHY THAT IS THE
   * REASON THE COPY EXISTS RATHER THAN A REASON TO SKIP IT. Slice 8c's
   * `llm_unavailable` was also believed unreachable, and it was the blocker
   * that ended that slice unwalked.
   *
   *   - HALF A LEVER PAIR, and A RESULT WINDOW THAT DOES NOT MOVE FORWARD, are
   *     enforced by `results_lever_pairs_complete` and
   *     `results_window_forward`. Two layers; a row reaching these did not
   *     come from this product's writer.
   *   - A NON-FINITE LEVER VALUE and a NON-POSITIVE DENOMINATOR are guarded by
   *     ONE layer, not two, and this correction is measured rather than
   *     assumed: `results_denominators_positive` does NOT close the NaN case.
   *     Verified against the running Postgres 17 —
   *     `select 'NaN'::numeric > 0` returns TRUE — so a stored `NaN`
   *     denominator passes that CHECK and is caught only by `decimalOrThrow`
   *     at the writer. Anything that writes a lever without going through
   *     `recordResult` reaches this refusal.
   *   - A BLANK TREATMENT KEY and a STRATUM WINDOW THAT DOES NOT MOVE FORWARD
   *     are arguments the composition builds, so they are OUR bug, not a
   *     stored-data problem.
   *   - A DECLARED METRIC THAT IS MISSING, or that disagrees with the key the
   *     result copied, is the MOST reachable of the nine: no CHECK can span
   *     two tables, so nothing but the writer's own single read makes those
   *     agree.
   *
   * IT MAKES NO CLAIM ABOUT WHAT WAS PRESERVED, in any spelling — the
   * `comparison_stratum` rule, and for the same reason. The reassurance would
   * be a claim about a whole call path made by copy that can see none of it.
   * A/S out-pinning pattern catches the spellings it enumerates and not a
   * synonym, so this paragraph is what keeps "your results are safe" and its
   * cousins out.
   *
   * IT DESCRIBES NO PAGE BEHAVIOUR, and that absence is the point. It used to
   * say "this page stopped rather than show you part of the picture", which
   * was true of the whole-page refusal and became false the moment the
   * comparison read was contained so the form and the history survive — and a
   * test had PINNED the false half, calling it an accurate description. A
   * sentence about what the screen does around a refusal is a sentence a
   * layout change falsifies; this one says what did not happen and what the
   * reader can do, which no rendering decision can make untrue.
   */
  comparison_input: {
    title: "That comparison could not be computed",
    detail:
      "The product could not build a comparison out of results it had already stored, so no comparison is shown. This is a fault on our side, not something wrong with the results you logged: nothing you entered caused it and there is nothing on the form to correct. Reload the page and try again; the refusal code and error type are recorded.",
  },
  unknown: {
    title: "Something went wrong",
    detail:
      "The action did not complete and nothing was charged. Try again. The refusal code, error type and any server-derived context are recorded without exception details.",
  },
};

/**
 * `PastedReferenceInputError.field` -> the sentence that is true for it.
 *
 * The keys are the paste form's four fields (`app/(product)/trends/paste-state.ts`
 * `PASTE_REFUSED_FIELDS`), written out for the same reason
 * `REVISION_PARENT_CODES` is: the union is not something a screen imports from
 * a package's internals. What keeps them honest is `tests/billing-ui.test.tsx`'s
 * "EVERY `PastedReferenceInputError` field has its own code, and the `??`
 * fallback is live", which drives every field and one the map does not answer
 * for through `billingErrorCode`.
 */
const PASTED_REFERENCE_FIELD_CODES: Readonly<Record<string, BillingErrorCode>> = {
  sourceUrl: "pasted_reference_url",
  title: "pasted_reference_title",
  transcript: "pasted_reference_transcript",
  niche: "pasted_reference_niche",
};

/**
 * `RevisionParentError.reason` -> the sentence that is true for it.
 *
 * The keys are `packages/credits/src/errors.ts`'s `REVISION_PARENT_REFUSALS`
 * values. They are written out rather than imported because the union type is
 * not on the facade and a screen must not reach into a package's internals for
 * one; what keeps them honest is `tests/billing-ui.test.tsx`'s
 * "EVERY `RevisionParentError` reason has its own code, and the `??` fallback
 * is live", which derives its population from `REVISION_PARENT_REFUSALS`
 * itself, drives every reason through `billingErrorCode`, and fails on one this
 * map does not answer for — including by falling through to `revision_parent`.
 *
 * THAT TEST WAS WRITTEN IN THE ACTION THAT WROTE THIS SENTENCE (billing gate,
 * 2026-09-01). The comment claimed it before it existed; the file had no
 * `revision_parent` case at all.
 */
const REVISION_PARENT_CODES: Readonly<Record<string, BillingErrorCode>> = {
  not_this_creators: "revision_parent_not_yours",
  not_revisable: "revision_parent_not_revisable",
  different_mode: "revision_parent_different_mode",
  parent_unreadable: "revision_parent_unreadable",
};

/**
 * `LlmInputTooLargeError.largestPart` -> the code whose remedy is true for it
 * (audit P3-R2). A part this build does not know reads the generic code.
 */
const INPUT_TOO_LARGE_PART_CODES: Readonly<Record<string, BillingErrorCode>> = {
  "brain.voice": "input_too_large_voice",
  "brain.strategy": "input_too_large_strategy",
  "brain.killtest": "input_too_large_killtest",
  frameworks: "input_too_large_frameworks",
  input: "input_too_large_input",
};

/** `GenerationHeldError.reason` -> its remedy's code (audit P3-A4). */
const GENERATION_HELD_CODES: Readonly<Record<string, BillingErrorCode>> = {
  paused: "generation_held_paused",
  insufficient_balance: "generation_held_balance",
  transient: "generation_held_transient",
};

/** `CreativePieceError.reason` -> the sentence that is true for it (launch L2). */
const CREATIVE_PIECE_CODES: Readonly<Record<string, BillingErrorCode>> = {
  not_found: "creative_piece_not_found",
  source_unusable: "creative_piece_source",
  stale: "creative_piece_stale",
  not_commissionable: "creative_piece_not_commissionable",
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
  // SAME REASON, THIRD INSTANCE (slice 7). `RevisionParentError` carries a
  // CLOSED `reason` code — the `BrainDocReason` discipline, so a screen can
  // branch and an operator can filter — and its four values are four different
  // true sentences. A class-only mapping would tell a creator whose parent was
  // an honest refusal that the output "is not this creator's", which sends them
  // to look for a permissions problem that does not exist.
  //
  // `??` IS THE FALLBACK AND IT IS NOT DEAD: `reason` arrives on an object this
  // build did not necessarily construct (a rolling deploy runs two builds at
  // once), and `tests/billing-ui.test.tsx`'s "EVERY `RevisionParentError`
  // reason has its own code, and the `??` fallback is live" drives this branch
  // with a reason cast in through `as never` — CLAUDE.md 2026-08-21, proving a
  // field cannot be TYPED is not proving it cannot be CAST. (That case was
  // written in the same action as this sentence, 2026-09-01: the comment named
  // it before it existed.)
  if (err instanceof RevisionParentError) {
    return REVISION_PARENT_CODES[err.reason] ?? "revision_parent";
  }
  // SAME REASON, FOURTH INSTANCE (slice 8c). `PastedReferenceInputError`
  // carries the FIELD it refused, and "shorten the transcript" is false advice
  // for a creator whose link was the problem. The `??` is live for the same
  // rolling-deploy reason as the branch above, and is driven with a field cast
  // in through `as never` by `tests/billing-ui.test.tsx`.
  // SAME REASON, FIFTH INSTANCE (R-148). `CreativeRequestError.reason` is a
  // closed code; the one reason with a different true sentence gets its own
  // code, and every other reason — an unknown form, a form sent for a mode
  // that takes none, a malformed limit — reads the neutral one, which names
  // no value (the refusal must not echo what was refused).
  if (err instanceof CreativeRequestError) {
    if (err.reason === "revision_keeps_legacy_format") return "creative_revision_legacy";
    if (err.reason === "revision_keeps_form") return "creative_revision_form";
    return "creative_request";
  }
  // SAME REASON, SIXTH INSTANCE (launch L2, R-151). `CreativePieceError.reason`
  // is a closed code and its four values are four true sentences; the `??` is
  // live for the rolling-deploy reason the branches above give.
  if (err instanceof CreativePieceError) {
    return CREATIVE_PIECE_CODES[err.reason] ?? "creative_piece";
  }
  if (err instanceof PastedReferenceInputError) {
    return PASTED_REFERENCE_FIELD_CODES[err.field] ?? "pasted_reference_input";
  }
  // AUDIT P3-R2 (R-158): the remedy is the LARGEST PART's. A null part is the
  // onboarding caller, which bounds the whole prompt — its remedy is the posts.
  if (err instanceof LlmInputTooLargeError) {
    if (err.largestPart === null) return "input_too_large_posts";
    return INPUT_TOO_LARGE_PART_CODES[err.largestPart] ?? "input_too_large";
  }
  // AUDIT P3-A4 (R-157): a held draft's reason names its remedy.
  if (err instanceof GenerationHeldError) {
    return GENERATION_HELD_CODES[err.reason] ?? "generation_held_transient";
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
  return { code, ...billingErrorCopy(code) };
}

/** Copy for a `?e=` code carried back from a server action's redirect. */
export function billingErrorFromCode(
  value: string | undefined | null
): (BillingErrorCopy & { code: BillingErrorCode }) | null {
  if (value === undefined || value === null || value === "") return null;
  const code: BillingErrorCode = isBillingErrorCode(value) ? value : "unknown";
  return { code, ...billingErrorCopy(code) };
}
