// Two-workspace isolation suite (tenancy plan-gate finding 2; Phase 2 AC-9):
// every PUBLIC db-facing credits API is exercised on workspace A and asserted
// unaffected by workspace B's rows AND by B's open pause — enumerated 1:1
// against the exported surface, mirroring the withWorkspace AC-7 pattern:
// a public function without an isolation case fails the enumeration assertion.
//
// The enumeration reads EVERY public entrypoint, not just src/index
// (code-review CHANGE): Phase 3's query paths all live outside that module —
// the stripe module (identity resolution, event dispatch, the six actions,
// auto-top-up) and the two wired facades. Enumerating only src/index made this
// guard pass vacuously while none of Phase 3 was covered.
import { describe, expect, it, vi } from "vitest";
import {
  createTestDb,
  creatorProfiles,
  creditLedger,
  modelUsage,
  ProfileCapError,
  pausePeriods,
  schema,
  subscriptions,
  trustWorkspaceId,
  seedAuthUser,
  seedDb,
  withWorkspace,
  CONFIG_V1_SEED,
  type TestDb,
  type VerifiedUserId,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import { eq, sql } from "drizzle-orm";
import type { LlmProvider } from "@respin/llm";
import * as credits from "../src/index";
import * as appServer from "../src/app-server";
import * as webhookServer from "../src/webhook-server";
import * as deletionServer from "../src/deletion-server";
import * as stripeActions from "../src/stripe/actions";
import * as billingContactMod from "../src/stripe/billing-contact";
import * as stripeCustomers from "../src/stripe/customers";
import * as stripeWebhooks from "../src/stripe/webhooks";
import * as stripeAutoTopup from "../src/stripe/auto-topup";
// INTERNAL modules, imported so their INTERNAL_MODULES claims can be checked
// against their real exports rather than trusted as prose.
import * as balanceMod from "../src/balance";
import * as deletionCommandsMod from "../src/stripe/deletion-commands";
import * as foldMod from "../src/fold";
import * as ledgerMod from "../src/ledger";
import * as stateMod from "../src/state";
import * as pauseMod from "../src/pause";
import * as clockMod from "../src/clock";
import * as profilesMod from "../src/profiles";
import * as inferenceMod from "../src/inference";
import * as monthsMod from "../src/months";
import * as metricsMod from "../src/metrics";
import * as errorsMod from "../src/errors";
import * as inferVoiceMod from "../src/infer-voice";
import * as generateMod from "../src/generate";
import * as modeAccessMod from "../src/mode-access";
import * as daysToEmptyMod from "../src/days-to-empty";
import * as adapterMod from "../src/stripe/adapter";
import * as autoTopupAuthorityMod from "../src/stripe/auto-topup-authority";
import * as autoTopupRolloutReconcileMod from "../src/stripe/auto-topup-rollout-reconcile";
import * as autoTopupRolloutMod from "../src/stripe/auto-topup-rollout";
import * as autoTopupV1ReconcileMod from "../src/stripe/auto-topup-v1-reconcile";
import * as setupMod from "../src/stripe/setup";
import * as packPriceMod from "../src/stripe/pack-price";
import * as packCheckoutAuthorityMod from "../src/stripe/pack-checkout-authority";
import * as tierCheckoutAuthorityMod from "../src/stripe/tier-checkout-authority";
import * as tierCheckoutRolloutMod from "../src/stripe/tier-checkout-rollout";
import * as tierCheckoutV1ReconcileMod from "../src/stripe/tier-checkout-v1-reconcile";
import * as tierInvoiceAuthorityMod from "../src/stripe/tier-invoice-authority";
import * as burnPeriodMod from "../src/burn-period";
import * as modeLabelMod from "../src/mode-label";
import * as includedBuildMod from "../src/included-build";
import * as pastedReferenceMod from "../src/pasted-reference";
import { handleStripeEvent } from "../src/stripe/webhooks";
import { workspaceForCustomer, getOrCreateCustomer } from "../src/stripe/customers";
import { createPortalUrl } from "../src/stripe/actions";
import { maybeAutoTopup } from "../src/stripe/auto-topup";
import { anySlots } from "./support/run-slots";

vi.mock("../src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../src/stripe/adapter")>()),
  getAutoTopupAuthorityKeyMaterial: () => ({
    id: "v1" as const,
    key: "isolation-authority-key-32-bytes",
    fingerprint: `sha256:${"a".repeat(64)}`,
  }),
  getAutoTopupAuthorityKey: () => "isolation-authority-key-32-bytes",
  getAuthenticatedStripeAccountIdentity: async () => ({
    accountId: "acct_isolation",
    livemode: false,
  }),
}));

/**
 * The Free tier's monthly allowance, FROM THE SEED rather than as a literal
 * (slice 6, R17).
 *
 * THREE ASSERTIONS IN THIS FILE USED TO READ `toBe(0)` and now read
 * `toBe(FREE_ALLOWANCE)`, and the change is a real behaviour change rather
 * than a fixture accommodation: `deriveBalance` MINTS a Free workspace's
 * monthly grant, lazily, the way it already materialises expiry. What each of
 * those assertions is actually about is unchanged and still non-vacuous —
 * every one of them checks the LEDGER ROWS first (`rows.every(r =>
 * r.workspaceId === X)`), so the isolation property is proved before any
 * balance is derived, and the balance read that follows is the one that mints.
 * Written as this constant so the assertion still says WHY the number is what
 * it is, instead of hard-coding a 25 nobody can trace.
 */
const FREE_ALLOWANCE = CONFIG_V1_SEED.allowances.free;

const HOUR = 3_600_000;
const future = (ms: number) => new Date(Date.now() + ms);

/**
 * A provider that answers without a network, for the isolation case below.
 *
 * A PLAIN OBJECT rather than `vi.mock`, and that is the shape `runInference`
 * takes its provider as a parameter for: a stub handed in as an argument can
 * also be one that THROWS IF CALLED, which is how the pre-call gates are
 * proved in `inference.test.ts`. A mocked module cannot express that — it has
 * already replaced the thing whose non-invocation is the evidence.
 */
const stubProvider = (): LlmProvider => ({
  vendor: "stub",
  complete: async () => ({
    text: "ok",
    servedModel: "claude-sonnet-5",
    usage: { tokensIn: 10, tokensOut: 5, raw: { input_tokens: 10, output_tokens: 5 } },
  }),
});

const req = (attemptId: string) => ({
  attemptId,
  system: "s",
  prompt: "p",
  promptBundleVersion: "test-bundle",
});

/**
 * The enumeration contract. Every exported FUNCTION of the public surface is
 * either covered by a named isolation case below or listed here with the
 * reason it needs none. Adding an export without touching this file fails
 * the completeness assertion.
 */
const NOT_DB_FACING: Record<string, string> = {
  foldLedger: "pure function — takes rows as arguments, no query",
  effectiveExpiry: "pure function — no query",
  trackedNicheEntitlement:
    "pure total lookup over the already-resolved tier — returns the server-owned DB writer cap but reads no workspace row",
  InsufficientCreditsError: "error class",
  PostCallDebitError: "error class",
  WorkspacePausedError: "error class",
  ClockSkewError: "error class",
  LedgerIntegrityError: "error class",
  RefundSourceNeverExpiresError: "error class",
  AlreadySubscribedError: "error class",
  CheckoutInFlightError: "error class",
  CheckoutReconciliationRequiredError: "error class",
  NoStripeCustomerError: "error class",
  BillingContactProviderError: "error class",
  NoLiveSubscriptionError: "error class",
  NotPausedError: "error class",
  TierCheckoutRolloutError: "error class",
  TierCheckoutAuthorityError: "error class",
  PackCheckoutAuthorityError: "error class",
  TierInvoiceAuthorityError: "error class",
  // Slice 6 — the composed generation's public surface. Nine error classes,
  // four pure functions and one composition, and every one of them is here for
  // a stated reason rather than as a batch:
  BrainNotActivatedError: "error class",
  GenerationAlreadyRefusedError: "error class",
  GenerationAttemptStateError:
    "error class (re-exported from @respin/db — the claim's transition refusal)",
  GenerationInFlightError: "error class",
  GenerationPayloadMismatchError: "error class",
  GenerationRecoveryRequiredError: "error class",
  GenerationUnchargedAttemptCapError: "error class",
  GenerationUnchargedCostCapError: "error class",
  ModeNotInPlanError: "error class",
  UnpricedOperationError: "error class",
  // Slice 7.
  RevisionParentError: "error class",
  UnknownEntitlementTierError: "error class",
  // Slice 8c (R-98) — the pasted reference's two refusals of its own.
  PastedReferenceTierError: "error class",
  PastedReferenceInputError: "error class",
  PerformanceLearningConfigUnavailableError: "error class",
  projectUsageRunway:
    "pure projection over config, pause, balance and aggregate values already read by its caller — no query, scope or workspace access",
  resolvePerformanceLearningEntitlement:
    "pure exhaustive matrix over a BillingState and performance-learning config already read by its caller — no query, scope or workspace access",
  pastedReferenceIntakePort:
    "COMPOSITION ONLY — the `submitted` adapter's production port. It binds a scope and a clock and forwards every call to `submitPastedReference` (this package, covered below); it owns no query and reads no row of its own (slice 8c, R4/R-98)",
  generationOp:
    "pure function — maps (mode, isRevision) onto a `creditCosts` key, runs no query. R8's whole pricing decision, in one place, so a revision cannot be priced at its parent mode's cost by a branch somebody forgot",
  includedBuildPurposes:
    "pure function — drives `generationOp` and `priceOf` over every priced operation of each purpose against a config document the CALLER has already read, and runs no query of its own. R-82: it replaced a frozen constant, because which purposes price their first billable attempt at zero is a fact `/admin/config` can change; `/admin/model-spend` reads the active document and hands the answer to `reconcileSpend`",
  onboardingBrainPrices:
    "pure function — the two branches of `priceOf`'s ONBOARDING case (unclaimed, and claimed by another attempt) over a config document the CALLER has already read, with a probe attempt id that is never stored. No query, no workspace data. It exists because `/onboarding` stated the included-build RULE in a sentence while reading only the rebuild price, which is false under any document that prices `creditCosts.onboardingBrainBuild` above zero (billing gate, 2026-09-02)",
  modeTiers:
    "pure lookup in the MODE_TIERS record — no query, no workspace data (R14)",
  modesIncludedIn:
    "pure derivation of the per-tier view from the same record — no query (R13)",
  modeOffers:
    "pure: `assertModeAllowed` read FORWARDS, over the same two authorities in the same order (the plan map here, IMPLEMENTED_MODES in @respin/modes) plus `modeLabel`. No query, no config, no workspace data — it is handed a resolved tier, like everything else in mode-access.ts. It exists so the mode picker in app/** is not a second derivation of the gate that refuses it (slice 7, R1/R13/R14)",
  privateFrameworkEntitlement:
    "pure lookup in the TIER_PRIVATE_FRAMEWORKS record. The tier it is handed comes from getWorkspaceBillingState, which is the one authority and IS covered below (R5c/REQ-D05)",
  GenerationAssemblyError: "error class (re-exported from @respin/modes)",
  KillTestError: "error class (re-exported from @respin/modes)",
  NoCreatorRulesError: "error class (re-exported from @respin/modes)",
  SpinSimilarityError: "error class (re-exported from @respin/modes)",
  ScriptOutputError: "error class (re-exported from @respin/modes)",
  UnknownModeError: "error class (re-exported from @respin/modes)",
  priceOf:
    "pure function — takes the already-read config document and a priced operation, runs no query (R13)",
  requiredConfigPaths:
    "pure function — builds a list of dotted config paths from a model id and a priced operation, runs no query",
  unchargedAttemptCap:
    "pure function — reads one number out of an already-read config document",
  unchargedAttemptWindowStart:
    "pure function — subtracts a config number from a clock the caller supplied, per purpose; no query. It exists because the count it feeds reads an APPEND-ONLY table, so an unwindowed count is a permanent refusal (billing gate, 2026-09-01)",
  freeAllowancePeriodKey:
    "pure function — formats a Date as `yyyy-MM` UTC (R17's period key)",
  freeAllowanceExpiry:
    "pure function — the first instant of the next UTC calendar month (R17's no-rollover expiry)",
  hashRequest:
    "pure function — sha256 over SIX strings the caller already holds (slice 7 added `parentGenerationId`); no query, and deliberately no creator identifier in it",
  planIncludesMode:
    "pure predicate over the MODE_TIERS map and a resolved tier — no query, no workspace data (R18)",
  assertModeAllowed:
    "pure refusal over the same map — the tier it is handed comes from getWorkspaceBillingState, which is the one authority and IS covered below (R18)",
  generate:
    "COMPOSITION ONLY — it owns no query. Every db touch is somebody else's already-isolated authority: `mintProfileScope` and `writeCapabilities` (@respin/db, proved by tests/profile-cage.test.ts and profile-scope.test.ts, whose P3 case now includes this slice's four capabilities), the caged accessors `latestBrainActivation`/`brainDocsByIds`/`countUnchargedBillableAttempts` (breach-tested on BOTH axes in profile-scope.test.ts), `deriveBalance`/`deriveBalanceInTx` and `debitCredits` (this package, covered below), and `getWorkspaceBillingState` (ditto). What is left in the function is prompt assembly, a fail-closed parse and the gate order — none of which reads a row.",
  // Slice 3 — the composed voice inference's public surface.
  BrainPointerDivergenceError: "error class",
  UnchargedAttemptCapError: "error class",
  AssemblyError: "error class (re-exported from @respin/llm)",
  NotEnoughPostsError: "error class (re-exported from @respin/llm)",
  inferVoice:
    "COMPOSITION ONLY — it owns no query. Its db touches are `mintProfileScope` and `writeCapabilities` (@respin/db, whose isolation is proved by tests/profile-cage.test.ts), the caged accessors `ownPostsNewest` and `countOwnPosts` on the minted scope (breach-tested in packages/db/tests/profile-scope.test.ts — tenancy round 3 corrected this sentence, which had said nothing here reads a row), and `runInference` (this package, covered above). What is left in the function is prompt assembly, a fail-closed reply parse and a pointer check. There is no isolation case to write here that would not be a re-test of one of those.",
  // Slice 2a. The FOUR refusals `runInference` can raise, plus the two
  // classes it re-exports from packages it composes: `app/**` may import only
  // this facade, so a class it cannot `instanceof` renders as "Something went
  // wrong" on the one screen that spends money.
  InferenceRoleError: "error class",
  ProfileArchivedError: "error class",
  // The concurrency bound's refusal (tech-spec S6). Not db-facing: it is built
  // from a refusal reason and two numbers the caller already holds, and the
  // only workspace-derived value it names is the tier, which the creator's own
  // billing page shows them.
  RunSlotBusyError: "error class",
  TopupInFlightError: "error class",
  ConfigNotMigratedError: "error class (from @respin/config)",
  AutoTopupShortfallError: "error class",
  AutoTopupUnnamedRefusalError: "error class",
  AutoTopupReconciliationRequiredError: "error class",
  AutoTopupAuthorityKeyError: "error class",
  AutoTopupAuthoritySignatureError: "error class",
  AutoTopupRolloutError: "error class",
  StripeAccountBindingError: "error class",
  AutoTopupAttemptIntegrityError: "error class",
  pendingAutoTopupAttempt:
    "pure projection over one subscription row already locked and read by its caller — no query or scope mint",
  mayChargeOffSession:
    "pure predicate over one subscription row already read by its caller — no query; app/** receives it only through the credits facade so the UI and charge site use one definition",
  getAutoTopupProtocolState:
    "global singleton rollout-state read with authenticated provider-binding verification; it reads no workspace row, so there is no A-vs-B isolation dimension",
  LlmError: "error class (from @respin/llm — the base of every provider failure)",
  PauseLengthError: "error class",
  AutoTopupCapError: "error class",
  StripeSessionUrlMissingError: "error class",
  CustomerMappingLostError: "error class",
  BillingRoleError: "error class",
  BillingReauthenticationError: "error class",
  UnknownTierPriceError: "error class",
  DuplicateStripeEvent: "error class",
  StripeNotConfiguredError: "error class",
  // Audit 2026-08-17 remediation (R1). All five are error classes, carrying no
  // query of their own; the CONDITIONS they signal are covered by cases in
  // actions.test.ts / stripe.test.ts.
  SubscriptionPausedError: "error class",
  NotChargeableError: "error class",
  PackPriceNotMappedError: "error class",
  PackPriceUnavailableError: "error class",
  PackPriceMismatchError: "error class",
  // Audit 2026-08-17 remediation (R2) — the `incomplete` remedy's refusals.
  InvoiceRecoveryUnavailableError: "error class",
  NotRecoverableError: "error class",
  getDbNow: "clock read — no workspace data",
  takeWorkspaceLock: "lock primitive — keyed by the id it is given",
  assertWriteClock: "guard — covered via debit/adjust/pause cases",
  getWebhookSecret: "env read — no query",
  isStripeConfigured:
    "env read — no query; re-exported from the app facade so the billing page's disabled state and the adapter's refusal cannot drift (phase 4)",
  hasLiveStripeSubscription:
    "pure predicate over a mirror row already read by its caller — no query of its own; re-exported from the app facade so the billing page's subscribe-vs-portal branch is the FOURTH reader of the one liveness definition, not a fifth definition (phase 4)",
  burnPeriod:
    "pure function over a subscription row already read by its caller, the RESOLVED tier its caller already derived, and a clock — no query of its own; re-exported from the app facade so /usage's period anchor for R7's credit burn is not re-derived a second time (slice 2b), and tier-keyed rather than row-keyed since the 2026-09-01 billing gate (a dead subscription keeps its `current_period_start` forever). It travels with `BURN_PERIOD_COPY`, a two-entry string map naming which period the creator is reading (R17a) — a CONST rather than a function, so these registries (which enumerate exported functions) do not list it separately",
  classifyStripeReceiptAttribution:
    "pure receipt-time classification over workspace/customer ids already resolved by the webhook — no query, scope mint, or workspace access",
  modeLabel:
    "pure lookup in `MODE_SPECS` — a mode id in, a creator-facing name out; no query, no config read, no workspace data. Re-exported from the app facade because `@respin/modes` is denied to app/** (R-64) and a label map living in a view would be a second mode vocabulary (slice 6, R17a)",
  // `getStripe` and `setupStripeProducts` used to be listed here. Neither is
  // on the enumerated public surface — `getStripe` lives in the INTERNAL
  // adapter module and the setup export is actually named `stripeSetup` — so
  // both were reasons for nothing, and the assertion added below now refuses
  // to let a claim like that sit here unnoticed (tenancy round-5 NOTE).
};

/**
 * Functions that reach Stripe's API BEFORE any workspace-scoped write, so a
 * keyless suite cannot drive them end-to-end. Each is still isolation-tested
 * on the query it performs first, by the named case listed here — the point is
 * that "needs a key" never silently becomes "untested".
 */
const STRIPE_BOUND: Record<string, string> = {
  createStripeExternalCommandPort:
    "adapter factory for the deletion executor (Phase 10b-1 Task 4). Its execute/reconcile read and, for the auto-top-up fence, write the subscriptions mirror by the WORKSPACE ID CARRIED ON THE COMMAND ROW — an id the deletion authority derived under the membership lock, never a caller claim — and every Stripe call is driven with a fake client in deletion-commands.test.ts, including the cross-workspace no-op when the row has no subscription",
  createTierCheckoutUrl:
    "keyless up to the liveSubscription read — covered by the A-vs-B live-subscription case",
  createPackCheckoutUrl:
    "keyless up to getOrCreateCustomer — covered by the getOrCreateCustomer case",
  pauseSubscription:
    "keyless up to the liveSubscription read — covered by the A-vs-B live-subscription case",
  resumeSubscription:
    "keyless up to the subscriptions read — covered by the A-vs-B live-subscription case",
  findPaymentIntentForAttempt:
    "provider lookup over a signed opaque attempt identity; it reads no application database row and its authority matching is driven in auto-topup-rollout.test.ts",
};

const COVERED = new Set([
  // Slice 1, and the named case really exists now: "createProfile: A's profile
  // lands only in A, and B's cap is untouched by it". It was in this set with
  // NO case behind it until the billing gate caught the false citation
  // (2026-08-27) — the failure mode this file documents sixty lines below.
  "createProfile",
  // Slice 2a, and the named case really exists: "runInference: A's attempt is
  // priced off A's OWN history, and never reaches B". Added WITH its case, in
  // the same change, because the entry immediately above records what happens
  // when a name lands in this set without one.
  "runInference",
  "deriveBalance",
  "deriveBalanceInTx",
  "grantCredits",
  "purchasePackCredits",
  "adjustCredits",
  "refundCredits",
  "debitCredits",
  "getWorkspaceBillingState",
  "recordPauseStart",
  "recordPauseEnd",
  "hasOpenPause",
  "ensurePauseStarted",
  "ensurePauseEnded",
  // Phase 3
  "workspaceForCustomer",
  "getOrCreateCustomer",
  "handleStripeEvent",
  "handleStripeEventInTransaction",
  "maybeAutoTopup",
  // Package-internal durable-attempt writers. Each is reached only after the
  // public maybeAutoTopup/webhook authority has selected and locked one
  // workspace; the A-vs-B auto-top-up case below and the webhook attribution
  // cases exercise those owners rather than exposing a second app entrypoint.
  "ensureAutoTopupAttemptProtocol",
  "clearPendingAutoTopupAttempt",
  "bindPendingAutoTopupPaymentIntent",
  "createPortalUrl",
  "setAutoTopup",
  // Plan C3 (Phase 10b-1): the billing-contact handover and its status read.
  // Both take a WorkspaceScope, read ONE subscriptions row by the scope's
  // workspace id, and the handover writes that same row — covered by the
  // A-vs-B billing-contact case below, with the provider driven by a fake.
  "billingContactStatus",
  "acceptBillingContact",
  // Audit 2026-08-17 remediation (R2, #8). Genuinely COVERED rather than
  // STRIPE_BOUND: its owner gate, its workspace-scoped mirror read and its
  // status narrowing all run BEFORE the first Stripe call, so the keyless case
  // drives every decision this function makes about which workspace it is
  // acting for.
  "createInvoiceRecoveryUrl",
  // Slice 8c (R-98): the pasted reference's three facade methods, each with a
  // named two-workspace case below — "submitPastedReference: A's paste …",
  // "settleParkedAutopsies: B's parked claim …", "pastedReferenceQuote …".
  // Added WITH their cases, in the same change, for the reason the
  // `createProfile` entry above records.
  "submitPastedReference",
  "settleParkedAutopsies",
  "pastedReferenceQuote",
  // Slice 9b: each has a named A-vs-B authority case below. The entitlement
  // resolver reads the workspace's billing state; runway reads pause, balance
  // and debit history through one workspace-scoped repeatable-read snapshot.
  "performanceLearningEntitlementFor",
  "usageRunwayFor",
]);

// EVERY public entrypoint, not just src/index (code-review CHANGE). The two
// facades are objects of bound methods, so their surface is enumerated from
// the object's own function-valued keys too.
const FACADE_METHODS = [
  ...Object.keys(appServer.respinCredits),
  ...Object.keys(webhookServer.respinStripeWebhook),
];

const FACADE_METHOD_SOURCE: Record<string, string> = {
  getBalance: "deriveBalance",
  getBillingState: "getWorkspaceBillingState",
  // R-95 (slice 8 fix pass): the tracked-niche allowance facade composes the
  // covered tier authority (`getWorkspaceBillingState`, its ONLY workspace
  // read) with `getActiveConfig` (a global document, no workspace row) and the
  // pure `trackedNicheEntitlement`. Its isolation surface IS the tier read's.
  trackedNicheEntitlementFor: "getWorkspaceBillingState",
  handleEvent: "handleStripeEvent",
};

/**
 * The enumerated modules, keyed by their path under src/. The two assertions
 * below derive what SHOULD be here from package.json's `exports` and from the
 * source tree, so adding a module — or a whole new public subpath, which is
 * exactly how webhook-server escaped the previous guard — fails this suite
 * instead of silently shrinking its coverage (code-review CHANGE).
 */
const ENUMERATED: Record<string, object> = {
  "index.ts": credits,
  "app-server.ts": appServer,
  "webhook-server.ts": webhookServer,
  // Phase 10b-1 Task 4: the dedicated worker's one door into this package.
  "deletion-server.ts": deletionServer,
  "stripe/actions.ts": stripeActions,
  "stripe/billing-contact.ts": billingContactMod,
  "stripe/customers.ts": stripeCustomers,
  "stripe/webhooks.ts": stripeWebhooks,
  "stripe/auto-topup.ts": stripeAutoTopup,
};

/**
 * Source modules with no db-facing public surface of their own.
 *
 * The reasons are STRUCTURED because a prose reason rots: "re-exported through
 * index.ts" was false for `state.ts` from the moment round 6 added
 * `hasLiveStripeSubscription`, and false for `clock.ts`'s `latestEventAt` from
 * the day it was written — a claim nothing checks (tenancy round-7 NOTE, and
 * the same class as the app-server comment that CHANGE 2 turned into a test).
 * `viaIndex` names must BE exported by src/index.ts; `internalOnly` names must
 * NOT be; together they must cover the module's exported functions exactly.
 */
type InternalModule = {
  reason: string;
  viaIndex?: string[];
  internalOnly?: string[];
  /** Importing this module RUNS it (a CLI), so its exports are not read. */
  noImport?: true;
};

const INTERNAL_MODULES: Record<string, InternalModule> = {
  "balance.ts": {
    reason:
      "the balance authority — reached publicly through index.ts. Since slice 6 it also MINTS: `mintFreeAllowanceIfDue` is the R17 Free grant, and it stays package-private on the strongest form of the usual reason — it is a WRITE to `credit_ledger` on a read path, and the only thing that may run it is the fold that immediately counts it. Exposing it would be a second way to mint credits, outside the lock the fold holds.",
    viaIndex: [
      "deriveBalanceInTx",
      "deriveBalance",
      // Pure period arithmetic, on the public surface so the period key and
      // the no-rollover expiry can be asserted directly rather than inferred
      // from a stored row.
      "freeAllowancePeriodKey",
      "freeAllowanceExpiry",
    ],
    // NO `internalOnly` ENTRY FOR THE MINT, and its absence is the strongest
    // form of the claim above: `mintFreeAllowanceIfDue` is not exported at
    // all, so there is no name for this list to hold. The check below verifies
    // claims against the module's REAL exports, which is why naming an
    // unexported function here fails rather than reading as extra caution.
  },
  "fold.ts": {
    reason: "pure fold + its integrity error",
    viaIndex: ["LedgerIntegrityError", "effectiveExpiry", "foldLedger"],
  },
  "ledger.ts": {
    reason: "ledger ops, all re-exported through index.ts",
    viaIndex: [
      "RefundSourceNeverExpiresError",
      "grantCredits",
      "purchasePackCredits",
      "adjustCredits",
      "refundCredits",
      "debitCredits",
    ],
  },
  "state.ts": {
    reason:
      "billing state; the liveness predicate stays OFF src/index — its readers are actions.ts, auto-topup.ts and webhooks.ts inside the package, plus app/** through the app-server facade ONLY (phase 4: the billing page's subscribe-vs-portal branch is the fourth reader of the one definition, never a fifth definition of its own)",
    viaIndex: ["getWorkspaceBillingState"],
    // `scheduledCancelAt` joins the liveness predicate as internal-only for the
    // SAME reason: app/** must not read Stripe's two cancellation columns and
    // decide for itself what "scheduled to end" means — it receives the derived
    // date on BillingState (evidence-run finding 1).
    //
    // `mayChargeOffSession` joins them both (audit 2026-08-17 #6). It is the
    // GATE in `maybeAutoTopup` — not decoration, and the `internalOnly` reader
    // check below enforces that it stays one. It answers
    // "may we charge this customer off-session RIGHT NOW?", which is NOT the
    // same question as `hasLiveStripeSubscription`'s "does a subscription
    // exist?" — `unpaid` answers yes to the second and must answer no to the
    // first. It stays off src/index for the strongest version of the usual
    // reason: app/** must never be able to ask a charging-authority question at
    // all. The chargeable/not-chargeable fact reaches the UI only as a rendered
    // reason string on the billing page, never as a predicate the page may
    // re-evaluate.
    //
    // `isPausedSubscription` joins them (review of the audit remediation,
    // 2026-08-18) for the plainest form of the same reason: app/** receives the
    // pause as `BillingState.state === "paused"` and must never re-derive it
    // from the mirror columns. It exists because two IN-PACKAGE readers had
    // already derived it differently — `state.ts` liveness-gated (audit #5),
    // `createPackCheckoutUrl` from the raw column — so a fifth definition in
    // app/** is exactly what this list is for.
    internalOnly: [
      "hasLiveStripeSubscription",
      "isPausedSubscription",
      "scheduledCancelAt",
      "mayChargeOffSession",
    ],
  },
  "pause.ts": {
    reason:
      "pause record-keepers; the five convergent/strict writers are re-exported through index.ts, clearPauseMirror stays package-private (its only caller is resumeSubscription, and app/** must not be able to clear the mirror without telling Stripe)",
    viaIndex: [
      "hasOpenPause",
      "recordPauseStart",
      "ensurePauseStarted",
      "ensurePauseEnded",
      "recordPauseEnd",
    ],
    // `openPauseStartedKnownAt` is package-private for the same reason
    // `clearPauseMirror` is: it exposes the pause's KNOWLEDGE clock, and the one
    // thing app/** must never do is compare that clock itself. Its only caller
    // is `stripe/webhooks.ts`'s D-AUDIT-1 gate (audit 2026-08-17 #2), which
    // needs it to tell a pre-pause invoice delivered late from a genuine
    // during-pause invoice.
    internalOnly: ["clearPauseMirror", "openPauseStartedKnownAt"],
  },
  "included-build.ts": {
    reason:
      "R-82/R-85: WHICH PURPOSES PRICE THEIR FIRST BILLABLE ATTEMPT AT ZERO, under a config document the caller has already read — one answer per stored `config_version`, because judging a historical attempt by today's document hides the lost debit a price cut made invisible. Pure — it drives `priceOf` over every priced operation of each purpose and touches no database, no workspace and no scope — and it is in this package rather than in `@respin/db` because `priceOf` is what decides it and `@respin/db` may not import this package. `/admin/model-spend` carries its answers to `reconcileSpend`, whose resolver argument has no default.",
    viaIndex: ["includedBuildPurposes", "onboardingBrainPrices"],
    // `purposeIsIncluded` is the one-purpose half, split out so the EMPTY
    // operation list has a witness — `[].every(…)` is `true`, which would
    // exempt a purpose nobody classified. It stays package-private because
    // `app/**` must never be able to ask "is this purpose free" about a list
    // it composed itself: the only question a screen may ask is the derived
    // one, over the document it read.
    //
    // `probedCreditCostKeys` is package-private for the same reason and one
    // more: it is the LEFT side of a partition asserted against
    // `Object.keys(content.creditCosts)`, so that registering a new priced
    // operation costs a line in `UNPROBED_CREDIT_COST_KEYS` rather than
    // silently escaping the exemption's probe (billing gate, 2026-09-02 —
    // `autopsy` and `trendBrowse` are priced, uncovered and slice 8's). It
    // answers a question about THIS package's own operation lists, which is
    // not a question a screen has.
    internalOnly: ["purposeIsIncluded", "probedCreditCostKeys"],
  },
  "pasted-reference.ts": {
    reason:
      "the creator-submitted autopsy's MONEY (slice 8c, R-98). Here rather than in @respin/db for the reason profiles.ts and generate.ts are: the tier gate, the active document's price and the ledger are this package's. Its three db-facing entrypoints are covered by named two-workspace cases below; its four constants carry no query; `pastedReferenceIntakePort` is composition over `submitPastedReference`. The two private ledger reads (`autopsyClaimDebit`, `autopsyRefund`) are keyed on the workspace id the minted profile carries and are exercised on both workspaces by those cases.",
    viaIndex: [
      "submitPastedReference",
      "settleParkedAutopsies",
      "pastedReferenceQuote",
      "pastedReferenceIntakePort",
    ],
  },
  "profiles.ts": {
    reason:
      "the creator-profile ENTITLEMENT decision (slice 1, R-30 constraint 2). It is in this package rather than @respin/db because the cap is priced off the resolved tier, whose sole authority is state.ts here, and @respin/db cannot import it without creating a second tier authority. It owns no db-facing surface of its own: the INSERT and the COUNT are scope-caged write capabilities in @respin/db, and this module composes them behind the lock, the pause gate, the role gate and the cap.",
    viaIndex: ["createProfile"],
  },
  "inference.ts": {
    reason:
      "the METERED MODEL CALL (slice 2a). Here rather than in @respin/db for the same layering reason as profiles.ts: it needs the resolved tier (state.ts), the active config and the ledger, and @respin/db can see none of the three. Its db-facing surface is `runInference`, which is covered by a named cross-workspace case below; the two constants and the FOUR error classes carry no query. `requiredConfigPaths` and `priceOf` are pure, and `recordUsage` is package-private, reached only from `runInference`. `RunSlotBusyError` is the concurrency bound's refusal (tech-spec S6): it is constructed from a `RunSlotRefusal` and two numbers already in hand, reads nothing, and carries no workspace data beyond the tier name the creator's own plan already shows them.",
    viaIndex: [
      "runInference",
      "InferenceRoleError",
      "ProfileArchivedError",
      "RunSlotBusyError",
      "TopupInFlightError",
      // Slice 6, R13/R16. `priceOf` and `requiredConfigPaths` were package-
      // private while `runInference` was their only caller; they are now the
      // PER-PURPOSE pricing authority that `generate.ts` shares, and they are
      // on the public surface so a test can drive every purpose's price and
      // every purpose's required config paths without a database.
      "priceOf",
      "requiredConfigPaths",
      "unchargedAttemptCap",
      // Slice 6 gate round: WHEN that cap's count starts, per purpose. Public
      // for the same reason the cap is — a test drives both purposes' answers
      // without a database, and the two differ deliberately.
      "unchargedAttemptWindowStart",
    ],
    // `recordUsage` and `withDeadline` are package-private and are now shared
    // by BOTH metered operations (`runInference` and `generate`). That sharing
    // is the point: `recordUsage` owns the cost/`cost_state` rules — including
    // "a failed attempt that reported no usage costs `unknown`, never a zero" —
    // and two implementations of them is two answers to one margin number.
    // They stay off src/index because `app/**` must never be able to write a
    // spend row or to bound a call it did not make.
    internalOnly: ["recordUsage", "withDeadline"],
  },
  "clock.ts": {
    reason:
      "clock/lock primitives; latestEventAt exists only to serve assertWriteClock",
    viaIndex: ["getDbNow", "takeWorkspaceLock", "assertWriteClock"],
    internalOnly: ["latestEventAt"],
  },
  "months.ts": {
    reason: "pure calendar arithmetic — no db, no workspace, package-internal",
    internalOnly: ["addMonthsUtc"],
  },
  "metrics.ts": {
    reason:
      "money-path observability, now THREE metrics. (1) Fold observability (audit 2026-08-17 #22 / R-25 D-AUDIT-3) — two named metrics and a workspace id, caller balance.ts. (2) The uncharged-billable CAP crossing (billing gate round 2, 2026-09-01), whose callers are the two cap sites, generate.ts and inference.ts: windowing the generation cap converted a bounded-forever exposure into an unbounded-RATE one on a tier that needs no card, and nothing counted or surfaced it. It runs NO query of its own — every value is already in the caller's hand — and the whole module stays off src/index because app/** has no business emitting or redirecting money-path telemetry, still less pointing a cap counter at a sink of its choosing. (3) The framework offer's DROPPED rows (billing gate, 2026-09-01), whose caller is generate.ts: a framework the context budget cannot carry is simply not offered, and the accessor's `slug ASC` order meant an ordinary set of private frameworks could push the WHOLE curated library out of a prompt the creator paid full price for — with nothing counting it. Same discipline as its siblings: no query of its own, and off src/index",
    internalOnly: [
      "setFoldMetricSink",
      "emitFoldMetric",
      "setUnchargedAttemptCapMetricSink",
      "emitUnchargedAttemptCapMetric",
      "setFrameworkOfferDroppedMetricSink",
      "emitFrameworkOfferDroppedMetric",
    ],
  },
  "infer-voice.ts": {
    reason:
      "the composed voice inference — it OWNS no query of its own. Every db touch it makes is somebody else's already-isolated authority: `mintProfileScope` and `writeCapabilities` (@respin/db, covered by profile-cage.test.ts), the caged scope accessors `ownPostsNewest`/`countOwnPosts` (breach-tested in profile-scope.test.ts), and `runInference` (this package, enumerated below). What is left here is prompt assembly, a reply parse and a pointer check. `inferVoice` itself is reached from `app/**` through app-server.ts, which IS enumerated.",
    internalOnly: ["inferVoice", "buildVoiceDocument", "isAllPlaceholders"],
  },
  "errors.ts": {
    reason: "error classes only",
    viaIndex: [
      // Slice 3. Exported from index.ts alongside its siblings rather than
      // only from the app facade, so it is `viaIndex` for the same reason
      // they are: `app/(product)/billing-errors.ts` matches on `instanceof`,
      // and a class reachable from a facade method but absent from the public
      // surface is a refusal that renders as "Something went wrong".
      "BrainPointerDivergenceError",
      // Slice 3, billing round 2. Same reason as its siblings: it is thrown by
      // `runInference` and rendered by `billing-errors.ts` on an `instanceof`,
      // so it must be on the public surface or the refusal degrades to
      // "Something went wrong" on a screen that just refused a run.
      "UnchargedAttemptCapError",
      "InsufficientCreditsError",
      "PostCallDebitError",
      "WorkspacePausedError",
      "ClockSkewError",
      // Slice 6. Every generation refusal, on the public surface for exactly
      // the reason its siblings are: `app/(product)/billing-errors.ts` matches
      // on `instanceof`, and a class reachable from a facade method but absent
      // from the public surface renders as "Something went wrong" on the one
      // screen that spends a creator's credits.
      "BrainNotActivatedError",
      "GenerationAlreadyRefusedError",
      "GenerationInFlightError",
      "GenerationPayloadMismatchError",
      "GenerationRecoveryRequiredError",
      "GenerationUnchargedAttemptCapError",
      // Its money-denominated twin (billing gate, 2026-09-04). Same reason:
      // `respinCredits.generate` raises it, so `app/**` must be able to
      // `instanceof` it or the refusal renders as "Something went wrong".
      "GenerationUnchargedCostCapError",
      "UnpricedOperationError",
      // Slice 7 (R6/R8). The pre-call revision refusal — same reason again:
      // `respinCredits.generate` can raise it, so `app/**` must be able to
      // `instanceof` it or a named refusal about somebody else's output
      // renders as "Something went wrong".
      "RevisionParentError",
      // Slice 8c (R-98). Same reason again: both are raised by
      // `respinCredits.submitPastedReference` and rendered on `instanceof`.
      "PastedReferenceTierError",
      "PastedReferenceInputError",
      // Slice 9b. Raised by the app-facing performance-learning resolver and
      // therefore public for the same typed-copy reason as the errors above.
      "PerformanceLearningConfigUnavailableError",
      "AutoTopupReconciliationRequiredError",
    ],
  },
  "stripe/deletion-commands.ts": {
    reason:
      "the Stripe/local adapter behind the deletion executor's ExternalCommandPort (Phase 10b-1 Task 4) — reached only through the enumerated deletion-server entrypoint, never through index.ts",
    internalOnly: [
      "createStripeExternalCommandPort",
      // Plan C3: the personal-field predicate shared with billing-contact.ts,
      // so the erasure command and the handover cannot disagree about what
      // "clear" means. Pure, no query.
      "customerPersonalFieldsClear",
    ],
  },
  "stripe/adapter.ts": {
    reason:
      "Stripe client factory + env reads — no query; the facades re-export what app/** needs",
    internalOnly: [
      "StripeNotConfiguredError",
      "AutoTopupAuthorityKeyError",
      "StripeAccountBindingError",
      "getStripe",
      "getAutoTopupAuthorityKeyMaterial",
      "getAutoTopupAuthorityKey",
      "getAuthenticatedStripeAccountIdentity",
      "getWebhookSecret",
      "isStripeConfigured",
    ],
  },
  "stripe/auto-topup-authority.ts": {
    reason:
      "pure HMAC authority construction and verification over PaymentIntent fields already supplied by the caller; no database query or workspace capability",
    internalOnly: [
      "AutoTopupAuthoritySignatureError",
      "autoTopupAuthorityMetadata",
      "verifyAutoTopupAuthority",
    ],
  },
  "stripe/auto-topup-rollout-cli.ts": {
    reason: "operator CLI entrypoint for the rollout authority — importing it would run it",
    noImport: true,
  },
  "stripe/auto-topup-rollout-reconcile.ts": {
    reason:
      "operator-only legacy reconciliation behind the global rollout drain; it is never exposed to app/** and resolves workspace attribution through the package's existing customer authority",
    internalOnly: ["reconcileMissingLegacyAutoTopups"],
  },
  "stripe/auto-topup-rollout.ts": {
    reason:
      "global protocol rollout and audit authority. The app facade exposes only the read projection; all transition and recovery functions remain operator/package-internal",
    internalOnly: [
      "AutoTopupRolloutError",
      "getAutoTopupProtocolRollout",
      "getAutoTopupProtocolState",
      "isAutoTopupProtocolActive",
      "assertAutoTopupProtocolRecoveryReady",
      "beginAutoTopupProtocolDrain",
      "restartAutoTopupProtocolDrain",
      "auditAutoTopupLegacyDrain",
      "activateAutoTopupAttemptProtocol",
    ],
  },
  "stripe/auto-topup-v1-reconcile-cli.ts": {
    reason: "operator CLI entrypoint for durable-attempt recovery — importing it would run it",
    noImport: true,
  },
  "stripe/auto-topup-v1-reconcile.ts": {
    reason:
      "operator-only recovery of signed durable attempts under the global rollout authority; never exposed to app/**",
    internalOnly: [
      "AutoTopupV1ReconcileError",
      "reconcileBoundAutoTopupAttempts",
    ],
  },
  "stripe/setup.ts": {
    reason:
      "one-off Stripe product/price seeding; reads the GLOBAL active config (not workspace-scoped) and writes nothing to our database",
    internalOnly: ["stripeSetup"],
  },
  "generate.ts": {
    reason:
      "the COMPOSED GENERATION (slice 6). Here rather than in @respin/db for the same layering reason as profiles.ts and inference.ts: it needs the resolved tier (state.ts), the active config, the ledger and the scoped write capabilities, and @respin/db can see only the last. It owns NO query of its own — every db touch is a caged accessor, a write capability, `debitCredits` or `deriveBalance*`, each isolated where it lives. `generate` itself reaches app/** through app-server.ts, which IS enumerated; `hashRequest` is pure and is on the public surface so the payload identity can be asserted without a database. Slice 7 added the framework read (`scope.accessors.eligibleFrameworks()`, a caged accessor breach-tested in profile-scope.test.ts) and the revision's parent read (`caps.readGenerationForAttempt`, an already-isolated write capability) — both somebody else's authority, so the sentence above still holds.",
    viaIndex: ["generate", "generationOp", "hashRequest"],
    internalOnly: [
      "promptFramework",
      "frameworksForContext",
      "frameworkVersionsUsed",
      "revisionInput",
      // THE REVISION'S TRACEABILITY HALF (spin-compliance gate, 2026-09-01),
      // both PURE and both package-private. `reportedSpecificsOf` reads a
      // parent's already-fetched `kill_test` jsonb — no query — and
      // `unvouchedSpecifics` compares two lists of strings through
      // `@respin/modes`' own corpus index. They are exported for the tests
      // that drive their false branches (a fail-closed refusal on an
      // unreadable document, and a filter that must never deny a specific the
      // creator typed), not for a caller.
      "reportedSpecificsOf",
      "unvouchedSpecifics",
    ],
  },
  "mode-access.ts": {
    reason:
      "R18's tier->mode map. PURE: it is handed a resolved tier and answers a question about it, and it reads no subscription row, no price map and no config — the tier authority stays `getWorkspaceBillingState`, because a second derivation is the defect class behind two M1 round-6 findings. It has no isolation surface at all.",
    viaIndex: [
      "planIncludesMode",
      "assertModeAllowed",
      "modeTiers",
      "modesIncludedIn",
      "modeOffers",
      "privateFrameworkEntitlement",
      "trackedNicheEntitlement",
      "performanceLearningEntitlementFor",
      "resolvePerformanceLearningEntitlement",
      "ModeNotInPlanError",
      "UnknownEntitlementTierError",
    ],
  },
  "days-to-empty.ts": {
    reason:
      "Slice 9b's one-snapshot usage runway. The public authority `usageRunwayFor` is covered by a named two-workspace case below; `projectUsageRunway` is pure over already-read values. The internal transaction/read seams exist for focused snapshot and failure-state tests, while `assertUsageRunwayScope` rejects forged and wrong-grain scopes before any reader runs.",
    viaIndex: ["projectUsageRunway", "usageRunwayFor"],
    internalOnly: [
      "assertUsageRunwayScope",
      "usageRunwayInTx",
      "usageRunwayForWithReaders",
    ],
  },
  "burn-period.ts": {
    reason:
      "R7 (slice 2b) / R17a (slice 6): the creator's credit-burn period anchor and the words for it — pure functions over a subscription row already read by its caller, the tier its caller already resolved, and a clock; no query of its own, no workspace access",
    internalOnly: ["burnPeriod"],
  },
  "mode-label.ts": {
    reason:
      "R17a (slice 6): the creator-facing name for a stored `generations.mode` — a pure lookup in `MODE_SPECS`, no query, no config, no workspace access. It exists because `@respin/modes` is denied to app/** (R-64) and `@respin/db` must not depend on the pipeline package either, so this is the seam that already exists rather than a new one",
    internalOnly: ["modeLabel"],
  },
  "stripe/setup-cli.ts": {
    reason: "CLI entrypoint for the above — importing it would run it",
    noImport: true,
  },
  "stripe/pack-price.ts": {
    reason:
      "the ONE pack-price resolver (audit 2026-08-17 #7). Reads the GLOBAL active config and Stripe's Price object; writes nothing and touches no workspace-scoped table, so it has no isolation surface of its own. Package-private on purpose: its two callers are the manual pack Checkout and auto-top-up, and app/** must never resolve a charge amount itself — the whole point of the module is that ONE place decides what a pack costs. The three errors reach app/** through the app-server facade instead",
    internalOnly: [
      "PackPriceUnavailableError",
      "PackPriceMismatchError",
      "PackPriceNotMappedError",
      "packCheckoutV1PriceKey",
      "assertPackCheckoutV1WriterFence",
      "mappedPackPriceId",
      "resolvePackPrice",
    ],
  },
  "stripe/pack-checkout-authority.ts": {
    reason:
      "pure HMAC authority construction and verification over one provider Checkout Session; no database query or workspace capability",
    internalOnly: [
      "PackCheckoutAuthorityError",
      "packCheckoutAuthorityMetadata",
      "verifyPackCheckoutAuthority",
    ],
  },
  "stripe/tier-checkout-authority.ts": {
    reason:
      "pure HMAC generation-authority construction and verification over provider metadata; no database query or workspace capability",
    internalOnly: [
      "TierCheckoutAuthorityError",
      "tierCheckoutAuthorityMetadata",
      "tierCheckoutAuthorityMetadataFromProvider",
      "verifyTierCheckoutAuthority",
    ],
  },
  "stripe/tier-checkout-rollout-cli.ts": {
    reason: "operator CLI entrypoint for the tier Checkout rollout — importing it would run it",
    noImport: true,
  },
  "stripe/tier-checkout-rollout.ts": {
    reason:
      "operator-only tier Checkout rollout, provider audit, and recovery fence; never exposed to app/** except its typed refusal through the facade",
    internalOnly: [
      "TierCheckoutRolloutError",
      "getTierCheckoutProtocolRollout",
      "getTierCheckoutProtocolState",
      "assertTierCheckoutProtocolActive",
      "assertTierCheckoutProtocolRecoveryReady",
      "beginTierCheckoutProtocolDrain",
      "restartTierCheckoutProtocolDrain",
      "auditTierCheckoutLegacyDrain",
      "activateTierCheckoutAttemptProtocol",
    ],
  },
  "stripe/tier-checkout-v1-reconcile.ts": {
    reason:
      "operator-only recovery of a signed provider tier Checkout under lifecycle and rollout locks; never exposed to app/**",
    internalOnly: [
      "TierCheckoutV1ReconcileError",
      "reconcileTierCheckoutV1Session",
    ],
  },
  "stripe/tier-invoice-authority.ts": {
    reason:
      "pure HMAC invoice-time economic authority construction and verification; no database query or workspace capability",
    internalOnly: [
      "TierInvoiceAuthorityError",
      "tierInvoiceAuthorityMetadata",
      "hasTierInvoiceAuthorityMetadata",
      "tierInvoiceAuthorityMetadataFromProvider",
      "verifyTierInvoiceAuthority",
    ],
  },
};

/** Namespaces for the internal modules, so their claims can be checked. */
const INTERNAL_NAMESPACES: Record<string, object> = {
  "balance.ts": balanceMod,
  "stripe/deletion-commands.ts": deletionCommandsMod,
  "fold.ts": foldMod,
  "ledger.ts": ledgerMod,
  "state.ts": stateMod,
  "pause.ts": pauseMod,
  "clock.ts": clockMod,
  "profiles.ts": profilesMod,
  "inference.ts": inferenceMod,
  "months.ts": monthsMod,
  "metrics.ts": metricsMod,
  "errors.ts": errorsMod,
  "infer-voice.ts": inferVoiceMod,
  "generate.ts": generateMod,
  "mode-access.ts": modeAccessMod,
  "days-to-empty.ts": daysToEmptyMod,
  "stripe/adapter.ts": adapterMod,
  "stripe/auto-topup-authority.ts": autoTopupAuthorityMod,
  "stripe/auto-topup-rollout-reconcile.ts": autoTopupRolloutReconcileMod,
  "stripe/auto-topup-rollout.ts": autoTopupRolloutMod,
  "stripe/auto-topup-v1-reconcile.ts": autoTopupV1ReconcileMod,
  "stripe/setup.ts": setupMod,
  "stripe/pack-price.ts": packPriceMod,
  "stripe/pack-checkout-authority.ts": packCheckoutAuthorityMod,
  "stripe/tier-checkout-authority.ts": tierCheckoutAuthorityMod,
  "stripe/tier-checkout-rollout.ts": tierCheckoutRolloutMod,
  "stripe/tier-checkout-v1-reconcile.ts": tierCheckoutV1ReconcileMod,
  "stripe/tier-invoice-authority.ts": tierInvoiceAuthorityMod,
  "burn-period.ts": burnPeriodMod,
  "mode-label.ts": modeLabelMod,
  "included-build.ts": includedBuildMod,
  "pasted-reference.ts": pastedReferenceMod,
};

/**
 * `internalOnly` names that ARE deliberately re-exported from an app-facing
 * facade, each with the reason (tenancy gate 2026-08-18). "Package-private"
 * and "unreachable from app/**" are different claims, and this is the list of
 * places they legitimately diverge — everything else must satisfy both.
 */
const FACADE_REEXPORTED: Record<string, string> = {
  hasLiveStripeSubscription:
    "THE one liveness definition. The billing page is its fourth reader (subscribe-vs-portal), and a page-local notion of 'looks subscribed' would be a fifth definition — which is exactly what produced the round-6 BLOCK. Re-exported as a pure predicate over a row the page has already read; it performs no query.",
  isStripeConfigured:
    "answers the keyless question the same way the adapter does, so the page's disabled state and the action's refusal cannot drift. An env read, no query, no workspace data.",
  burnPeriod:
    "R7 (slice 2b): a pure function over a subscription row `/usage` has already read, the tier it has already resolved, and a clock — no query of its own, so re-exporting it costs nothing tenancy-wise and saves the page from re-deriving the period-anchor rule itself.",
  modeLabel:
    "R17a (slice 6): the ONE route from app/** to `MODE_SPECS[…].label`. `@respin/modes` is denied to app/** (R-64), so without this re-export the by-mode panel would either print raw mode ids or grow a hand-written label map — a second mode vocabulary that goes stale the day slice 7 adds six modes. Pure: a string in, a string out, no query and no workspace data.",
  getWebhookSecret:
      "the SIGNATURE-VERIFICATION secret, reached only through the WEBHOOK facade — which is allowlisted to app/api/stripe/webhook/** alone, not to app/** at large (see app-server.ts's header for why that distinction exists). The route needs it to call the SDK's static constructEvent BEFORE any handler runs; it performs no query and touches no workspace data.",
  mayChargeOffSession:
    "the one pure off-session-chargeability predicate. The billing page needs the same answer as maybeAutoTopup so it does not present a dead control; it receives a row already scoped by the server and performs no query or mutation.",
};

it("INTERNAL_MODULES claims are CHECKED, not prose (tenancy round-7 NOTE)", () => {
  const indexNames = new Set(Object.keys(credits));
  const facadeNames = new Set([
    ...Object.keys(appServer),
    ...Object.keys(webhookServer),
  ]);
  for (const [path, entry] of Object.entries(INTERNAL_MODULES)) {
    if (entry.noImport) continue;
    const mod = INTERNAL_NAMESPACES[path];
    expect(mod, `${path} must have a namespace to check against`).toBeDefined();
    const exportedFns = Object.entries(mod)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k);
    const claimed = [...(entry.viaIndex ?? []), ...(entry.internalOnly ?? [])];
    expect(
      exportedFns.filter((n) => !claimed.includes(n)),
      `${path}: exported function with no claim`
    ).toEqual([]);
    expect(
      claimed.filter((n) => !exportedFns.includes(n)),
      `${path}: a claim names something the module does not export`
    ).toEqual([]);
    for (const n of entry.viaIndex ?? []) {
      expect(indexNames, `${path} claims ${n} reaches index.ts`).toContain(n);
    }
    for (const n of entry.internalOnly ?? []) {
      expect(indexNames, `${path} claims ${n} is package-private`).not.toContain(n);
      // …AND absent from the app-facing FACADES (tenancy gate 2026-08-18).
      // Checking only `index.ts` made "internalOnly" mean less than every
      // reason attached to it claims: those reasons say app/** must not be
      // able to reach the name, and app/** imports the FACADE, not the index.
      // `hasLiveStripeSubscription` proves the gap is real — it is listed
      // internalOnly and IS re-exported from app-server. So the check is
      // "absent from the facades unless the re-export is declared here, with
      // its reason", which is what makes adding `setFoldMetricSink` to the
      // facade fail this suite instead of passing it.
      // ERROR CLASSES are exempt as a CLASS, not one by one: `app/**` may
      // import only the facade, so a typed refusal it cannot `instanceof`
      // degrades to "Something went wrong" — and `facade-errors.test.ts`
      // actively REQUIRES every constructible error to be re-exported. Listing
      // them individually here would be a second, drifting copy of that rule.
      // Everything else needs a named reason.
      const exported = (mod as Record<string, unknown>)[n];
      const isErrorClass =
        typeof exported === "function" &&
        (exported as { prototype?: unknown }).prototype instanceof Error;
      if (!FACADE_REEXPORTED[n] && !isErrorClass) {
        expect(
          facadeNames,
          `${path} claims ${n} is package-private, but it is re-exported from an app-facing facade — either stop exporting it or declare the re-export in FACADE_REEXPORTED with a reason`
        ).not.toContain(n);
      }
    }
  }
  // Non-vacuity: the check must be reading real modules with real exports.
  expect(Object.keys(INTERNAL_NAMESPACES).length).toBeGreaterThan(8);
  expect(indexNames.size).toBeGreaterThan(15);

  // FACADE_REEXPORTED STALENESS (tenancy gate NOTE, 2026-08-18). The allowlist
  // grants an exception; nothing checked the exception was still being used, so
  // an entry whose name stopped being re-exported would keep passing forever
  // and quietly widen what the next reader believes is sanctioned. Same shape
  // as every other claim in this file: it has to be true to stay.
  for (const n of Object.keys(FACADE_REEXPORTED)) {
    expect(
      facadeNames,
      `FACADE_REEXPORTED lists ${n}, but no facade re-exports it — delete the entry`
    ).toContain(n);
  }
});

/**
 * Every `internalOnly` name must have at least one IN-PACKAGE reader.
 *
 * The billing gate found `mayChargeOffSession` with zero callers while two
 * comments claimed it was the mechanism at the auto-top-up charge site — a dead
 * export holding a reserved seat on a list whose entries all carry a reason
 * beginning "its readers are…". The fix was to make it the real gate; THIS is
 * what stops the next one, because "delete it if nothing uses it" was prose and
 * prose does not fire.
 *
 * Source-level, like the retention scan, and for the same reason: the risk is a
 * name nothing calls, which no type can flag.
 */
it("every internalOnly name is actually READ inside the package", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { resolve, dirname, join, relative, sep } = await import("node:path");
  const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
  const files = (function walk(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, acc);
      else if (full.endsWith(".ts")) acc.push(full);
    }
    return acc;
  })(srcDir);
  const sources = files.map((f) => ({
    rel: relative(srcDir, f).split(sep).join("/"),
    // Blank comments first — a comment naming a function is not a reader.
    text: readFileSync(f, "utf8")
      .replace(/\/\/.*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // IMPORT STATEMENTS ARE NOT USES. Stripping them is what makes this
      // check bite: un-wiring a predicate usually leaves its import behind,
      // and counting that would let a dead export vindicate itself with the
      // very line that fails to use it. Proven by mutation, not assumed.
      .replace(/import[\s\S]*?from\s*["'][^"']*["'];?/g, ""),
  }));

  // The package's OWN tests count as readers for a deliberate test seam, but
  // THIS file does not: the registry above names every internalOnly export as
  // a string, so counting it would make every entry vindicate itself.
  const testDir = resolve(dirname(fileURLToPath(import.meta.url)));
  const testText = readdirSync(testDir)
    .filter((f) => f.endsWith(".ts") && f !== "isolation.test.ts")
    .map((f) => readFileSync(join(testDir, f), "utf8"))
    .join("\n");

  const orphans: string[] = [];
  for (const [path, entry] of Object.entries(INTERNAL_MODULES)) {
    for (const n of entry.internalOnly ?? []) {
      const pattern = new RegExp(String.raw`\b` + n + String.raw`\b`, "g");
      // Every mention across the package's sources, comments already stripped.
      // BOUND, stated so nobody reads this as "has a caller" (tenancy gate
      // NOTE): two mentions inside the DEFINING file alone would also satisfy
      // it — a re-export line, a recursive call, a type position. It is a
      // source-level heuristic for "is this export dead", not a call-graph, and
      // it is calibrated to the shape that actually occurred: a lone
      // self-definition with every claimed reader in a comment.
      // The DEFINITION is one of them, so a live export needs at least two: a
      // lone self-mention is precisely the dead-export shape this catches.
      const srcRefs = sources.reduce(
        (acc, src) => acc + (src.text.match(pattern)?.length ?? 0),
        0
      );
      const testRefs = testText.match(pattern)?.length ?? 0;
      if (srcRefs < 2 && testRefs === 0) orphans.push(`${path}:${n}`);
    }
  }
  expect(
    orphans,
    `these package-private exports have NO reader — only their own definition. Wire them up or delete them; a dead export whose reason says "its readers are…" is a comment claiming a property it does not have: ${orphans.join(", ")}`
  ).toEqual([]);

  // Non-vacuity: the scan really read the package's sources.
  expect(sources.length).toBeGreaterThan(10);
});

it("ENUMERATION completeness: every SOURCE module is enumerated or internal-with-reason", async () => {
  const { readdirSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { resolve, dirname, relative } = await import("node:path");
  const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(resolve(dir, e.name))
        : e.name.endsWith(".ts")
          ? [resolve(dir, e.name)]
          : []
    );
  const modules = walk(srcDir).map((f) =>
    relative(srcDir, f).replace(/\\/g, "/")
  );
  // `__*_probe.ts` is the repo's TRANSIENT TEST PROBE convention (tsconfig
  // excludes it for the same reason): `tests/import-boundary.test.ts`'s
  // non-vacuity case writes `__cage_probe.ts` into THIS package's src for the
  // lifetime of one assertion, and vitest runs that file in a concurrent
  // worker — so this walk raced it and reported a planted probe as an
  // unenumerated module (first seen 2026-08-29; an interrupted run can also
  // strand the file past its `finally`). Excluded BY THE CONVENTION, not by
  // the one filename, and only the convention: a real module named
  // `__x_probe.ts` would dodge this walk, which is why the convention is
  // reserved for probes (tsconfig.json documents it).
  const isProbe = (m: string) => /(^|\/)__[^/]*_probe\.ts$/.test(m);
  // THE EXCLUSION'S OWN NON-VACUITY (tenancy round-3 NOTE): a mis-widened
  // pattern here silently narrows the enumeration walk, which is the 2026-08-21
  // scanner lesson one notch removed. The probe convention must match, and
  // near-miss real-module names must NOT.
  expect(isProbe("__cage_probe.ts")).toBe(true);
  expect(isProbe("stripe/__cast_probe.ts")).toBe(true);
  expect(isProbe("probe.ts")).toBe(false);
  expect(isProbe("__cageprobe.ts")).toBe(false);
  expect(isProbe("cage_probe.ts")).toBe(false);
  expect(isProbe("__probe_helpers.ts")).toBe(false);
  const unaccounted = modules.filter(
    (m) => !(m in ENUMERATED) && !(m in INTERNAL_MODULES) && !isProbe(m)
  );
  expect(
    unaccounted,
    "a new credits module must be enumerated for isolation or listed internal-with-reason"
  ).toEqual([]);
});

it("ENUMERATION completeness: every PUBLIC package.json export is enumerated", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { resolve, dirname } = await import("node:path");
  const pkgPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../package.json"
  );
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    exports: Record<string, string>;
  };
  // "./src/x.ts" → "x.ts"
  const targets = Object.values(pkg.exports).map((p) =>
    p.replace(/^\.\/src\//, "")
  );
  expect(targets.length).toBeGreaterThan(0);
  const missing = targets.filter((t) => !(t in ENUMERATED));
  expect(
    missing,
    "a new PUBLIC entrypoint must be added to ENUMERATED — this is exactly how webhook-server escaped the previous guard"
  ).toEqual([]);
});

it("ENUMERATION: every exported function of every public entrypoint is covered or excluded-with-reason", () => {
  const exported = Object.values(ENUMERATED).flatMap((mod) =>
    Object.entries(mod)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k)
  );
  // The facade methods resolve to the underlying function they wrap.
  const viaFacade = FACADE_METHODS.map((m) => FACADE_METHOD_SOURCE[m] ?? m);

  const unaccounted = [...new Set([...exported, ...viaFacade])].filter(
    (name) =>
      !COVERED.has(name) &&
      !(name in NOT_DB_FACING) &&
      !(name in STRIPE_BOUND)
  );
  expect(unaccounted, "add an isolation case or a reasoned exclusion").toEqual(
    []
  );

  // The guard is one-directional: it catches a NEW export with no reason, but
  // never noticed a reason citing a name that no longer exists. Two such keys
  // survived four review rounds (`getStripe`, `setupStripeProducts` — the real
  // export is `stripeSetup`, and its module is INTERNAL), which is the
  // "reasoned exclusion resting on a false citation" shape (tenancy round-5
  // NOTE). A stale key is a claim about a surface, and a claim nothing checks
  // rots — the same reason AC-9 became a scan.
  const known = new Set([...exported, ...viaFacade]);
  const stale = [
    ...Object.keys(NOT_DB_FACING),
    ...Object.keys(STRIPE_BOUND),
    ...COVERED,
  ].filter((name) => !known.has(name));
  expect(
    stale,
    "an exclusion or coverage claim names something the public surface does not export — delete or correct it"
  ).toEqual([]);
});

it("ENUMERATION is NOT vacuous: it actually sees the Phase-3 query paths", () => {
  // The guard passed vacuously before because it read only src/index, where
  // none of these live. Assert the enumeration source really carries them.
  const seen = [
    ...Object.keys(stripeCustomers),
    ...Object.keys(stripeWebhooks),
    ...Object.keys(stripeActions),
    ...Object.keys(stripeAutoTopup),
  ];
  for (const name of [
    "workspaceForCustomer",
    "getOrCreateCustomer",
    "handleStripeEvent",
    "maybeAutoTopup",
    "createPortalUrl",
  ]) {
    expect(seen, name).toContain(name);
    expect(Object.keys(credits), `${name} is NOT in src/index`).not.toContain(
      name
    );
  }
});

type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];
const tx = <T>(db: TestDb, fn: (t: Tx) => Promise<T>) => db.transaction(fn);

async function twoWorkspaces(db: TestDb): Promise<{
  A: VerifiedWorkspaceId;
  B: VerifiedWorkspaceId;
}> {
  const [wa] = await db
    .insert(schema.workspaces)
    .values({ name: "A" })
    .returning();
  const [wb] = await db
    .insert(schema.workspaces)
    .values({ name: "B" })
    .returning();
  return { A: trustWorkspaceId(wa.id), B: trustWorkspaceId(wb.id) };
}

/**
 * A REAL scope, minted through `withWorkspace` (M2a task 11).
 *
 * These cases used to pass `{ workspaceId: A, role: "owner" } as never`. That
 * compiled while `WorkspaceScope` was a structural type; it is now a class the
 * cage recognises by identity, so every one of those literals throws
 * `ScopeForgeryError` the moment `assertOwner` calls `assertScoped` — which is
 * the guard working, and is why these fixtures are repaired rather than cast
 * harder.
 *
 * A FRESH USER PER CALL, deliberately: `memberships_user_workspace_uq`
 * (`schema.ts:72`) forbids one user holding owner AND editor on one workspace,
 * so "the suite already seeds a user" is not enough — a role matrix needs one
 * auth user, one domain user and one membership per role.
 */
let mintSeq = 0;
const reauthenticationByScope = new WeakMap<
  WorkspaceScope,
  { authUserId: string; sessionId: string; reauthenticatedAt: Date }
>();
async function mintScope(
  db: TestDb,
  workspaceId: VerifiedWorkspaceId,
  role: "owner" | "editor" | "viewer"
): Promise<WorkspaceScope> {
  const authUserId = `iso_scope_${role}_${mintSeq++}`;
  await seedAuthUser(db, authUserId);
  const [u] = await db
    .insert(schema.users)
    .values({ authUserId })
    .returning();
  await db
    .insert(schema.memberships)
    .values({ userId: u.id, workspaceId, role });
  const reauthenticatedAt = new Date();
  const sessionId = `session-${authUserId}`;
  await db.insert(schema.session).values({
    id: sessionId,
    token: `token-${authUserId}`,
    userId: authUserId,
    expiresAt: new Date(reauthenticatedAt.getTime() + HOUR),
    updatedAt: reauthenticatedAt,
    reauthenticatedAt,
  });
  const scope = await withWorkspace(db, { authUserId, workspaceId });
  reauthenticationByScope.set(scope, { authUserId, sessionId, reauthenticatedAt });
  return scope;
}

function reauthenticationFor(scope: WorkspaceScope) {
  const authority = reauthenticationByScope.get(scope);
  if (!authority) throw new Error("test fixture is missing exact-session reauthentication");
  return authority;
}

describe("cross-workspace isolation (A must never see or be moved by B)", () => {
  it("deriveBalance/deriveBalanceInTx: A's balance ignores B's rows entirely", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await tx(db, async (t) => {
      await credits.grantCredits(t, {
        workspaceId: A, amount: 10, expiresAt: future(24 * HOUR),
        refType: "invoice", refId: "a1", configVersion: 1,
      });
      await credits.grantCredits(t, {
        workspaceId: B, amount: 999, expiresAt: future(24 * HOUR),
        refType: "invoice", refId: "b1", configVersion: 1,
      });
    });
    expect((await credits.deriveBalance(db, A)).balance).toBe(10);
    expect((await credits.deriveBalance(db, B)).balance).toBe(999);
  });

  it("debitCredits: A's debit consumes only A's lots; B's balance untouched; A cannot spend B's credits", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await tx(db, (t) =>
      credits.grantCredits(t, {
        workspaceId: B, amount: 100, expiresAt: future(24 * HOUR),
        refType: "invoice", refId: "b1", configVersion: 1,
      })
    );
    // A has zero — B's 100 must not be reachable
    await expect(
      tx(db, (t) =>
        credits.debitCredits(t, {
          workspaceId: A, cost: 1, refType: "t", refId: "x", at: new Date(), configVersion: 1,
        })
      )
    ).rejects.toThrow(credits.InsufficientCreditsError);
    expect((await credits.deriveBalance(db, B)).balance).toBe(100);
  });

  it("grant/pack/adjust/refund on A write rows carrying ONLY A's workspace id", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await tx(db, async (t) => {
      await credits.grantCredits(t, {
        workspaceId: A, amount: 10, expiresAt: future(24 * HOUR),
        refType: "invoice", refId: "a1", configVersion: 1,
      });
      await credits.purchasePackCredits(t, {
        workspaceId: A, amount: 20, expiresAt: future(48 * HOUR),
        amountCents: 1000, refType: "checkout", refId: "cs1", configVersion: 1,
      });
      await credits.adjustCredits(t, {
        workspaceId: A, delta: 5, reasonCode: "goodwill",
      });
    });
    const debit = await tx(db, (t) =>
      credits.debitCredits(t, {
        workspaceId: A, cost: 8, refType: "t", refId: "d", at: new Date(), configVersion: 1,
      })
    );
    await tx(db, (t) =>
      credits.refundCredits(t, { workspaceId: A, amount: 3, originalDebitId: debit.id })
    );
    const rows = await db.select().from(creditLedger);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.workspaceId === A)).toBe(true);
    // ZERO, not the Free allowance, and the reason is worth naming: this case
    // uses `createTestDb()` with NO seeded config, and R17's mint SKIPS when
    // no active config exists (a balance read must not become unavailable on a
    // mis-configured install — see `mintFreeAllowanceIfDue`). So the number
    // here is 0 for a stated reason rather than by luck, and the isolation
    // property it is asserting — B holds none of A's rows — is unaffected
    // either way.
    expect((await credits.deriveBalance(db, B)).balance).toBe(0);
  });

  it("refundCredits on A refuses a debit id belonging to B (no cross-workspace reach)", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await tx(db, (t) =>
      credits.grantCredits(t, {
        workspaceId: B, amount: 10, expiresAt: future(24 * HOUR),
        refType: "invoice", refId: "b1", configVersion: 1,
      })
    );
    const bDebit = await tx(db, (t) =>
      credits.debitCredits(t, {
        workspaceId: B, cost: 5, refType: "t", refId: "bd", at: new Date(), configVersion: 1,
      })
    );
    await expect(
      tx(db, (t) =>
        credits.refundCredits(t, {
          workspaceId: A, amount: 5, originalDebitId: bDebit.id,
        })
      )
    ).rejects.toThrow(/not a debit row of this workspace/);
  });

  it("B's OPEN PAUSE does not shift A's effective expiries, block A's debits, or freeze A's materialization", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    // A: an ALREADY-EXPIRED lot with remainder (historical row) — must materialize
    // even while B is paused; and A's live lot stays debit-able.
    await db.insert(creditLedger).values([
      {
        workspaceId: A, delta: 100, kind: "grant",
        createdAt: new Date(Date.now() - 48 * HOUR),
        expiresAt: new Date(Date.now() - 24 * HOUR),
      },
      {
        workspaceId: A, delta: 50, kind: "grant",
        createdAt: new Date(Date.now() - 48 * HOUR),
        expiresAt: future(24 * HOUR),
      },
    ]);
    await db.insert(pausePeriods).values({
      workspaceId: B,
      startedAt: new Date(Date.now() - 72 * HOUR), // open, long before A's expiry
    });
    const view = await credits.deriveBalance(db, A);
    expect(view.balance).toBe(50); // expired lot materialized DESPITE B's pause
    const expiries = (await db.select().from(creditLedger)).filter(
      (r) => r.kind === "expiry"
    );
    expect(expiries).toHaveLength(1);
    expect(expiries[0].workspaceId).toBe(A);
    // and A can still debit (B's pause must not trip A's pause guard)
    await tx(db, (t) =>
      credits.debitCredits(t, {
        workspaceId: A, cost: 10, refType: "t", refId: "ok", at: new Date(), configVersion: 1,
      })
    );
    expect(await tx(db, (t) => credits.hasOpenPause(t, A))).toBe(false);
    expect(await tx(db, (t) => credits.hasOpenPause(t, B))).toBe(true);
  });

  it("recordPauseStart/End on A touch only A's rows and A's mirror", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await db.insert(schema.subscriptions).values([
      { workspaceId: A, stripeCustomerId: "cus_a", status: "active" },
      { workspaceId: B, stripeCustomerId: "cus_b", status: "active" },
    ]);
    await tx(db, (t) => credits.recordPauseStart(t, A, new Date()));
    const subs = await db.select().from(schema.subscriptions);
    expect(subs.find((s) => s.workspaceId === A)?.pausedAt).not.toBeNull();
    expect(subs.find((s) => s.workspaceId === B)?.pausedAt).toBeNull();
    await tx(db, (t) => credits.recordPauseEnd(t, A, new Date(Date.now() + 1000)));
    const pauses = await db.select().from(pausePeriods);
    expect(pauses.every((p) => p.workspaceId === A)).toBe(true);
  });

  // ---- Phase 3 query paths (code-review CHANGE: previously uncovered) ----

  it("workspaceForCustomer: the sole identity authority maps each customer to ITS OWN workspace, against a real second workspace", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await db.insert(subscriptions).values([
      { workspaceId: A, stripeCustomerId: "cus_A", status: "none" },
      { workspaceId: B, stripeCustomerId: "cus_B", status: "none" },
    ]);
    expect(await workspaceForCustomer(db, "cus_A")).toBe(A);
    expect(await workspaceForCustomer(db, "cus_B")).toBe(B);
    // never each other, and an unknown customer resolves to nothing (fail closed)
    expect(await workspaceForCustomer(db, "cus_A")).not.toBe(B);
    expect(await workspaceForCustomer(db, "cus_unknown")).toBeNull();
  });

  it("getOrCreateCustomer returns A's OWN stored customer and never B's (no Stripe call when the mapping exists)", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await db.insert(subscriptions).values([
      { workspaceId: A, stripeCustomerId: "cus_A", status: "none" },
      { workspaceId: B, stripeCustomerId: "cus_B", status: "none" },
    ]);
    // Keyless: reaching Stripe here would throw StripeNotConfiguredError.
    // The contact id is only WRITTEN on a fresh mapping; both exist here, so
    // a placeholder brand is enough to prove the early return.
    const contact = "00000000-0000-4000-8000-000000000001" as VerifiedUserId;
    expect(await getOrCreateCustomer(db, A, "a@example.com", contact)).toBe("cus_A");
    expect(await getOrCreateCustomer(db, B, "b@example.com", contact)).toBe("cus_B");
  });

  it("handleStripeEvent: an event for B's customer writes ONLY B's rows — A is untouched", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await seedAuthUser(db, "iso_user");
    await seedDb(db);
    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_creator: "creator" } },
      "test-admin"
    );
    await db.insert(subscriptions).values([
      { workspaceId: A, stripeCustomerId: "cus_A", status: "none" },
      { workspaceId: B, stripeCustomerId: "cus_B", status: "none" },
    ]);
    const sec = Math.floor(Date.now() / 1000);
    const event = {
      id: "evt_iso_1",
      object: "event",
      type: "invoice.paid",
      created: sec,
      data: {
        object: {
          id: "in_iso",
          object: "invoice",
          customer: "cus_B", // B's customer
          billing_reason: "subscription_cycle",
          // The INVOICE-level parent, which names the subscription that
          // generated it — distinct from the LINE-level
          // `subscription_item_details` below, and the field audit #4's
          // identity cross-check reads. Real Stripe sets both (the sibling
          // fixture in stripe.test.ts:167 always has); this fixture carried
          // only the line-level one, so it was an unrealistic payload that
          // happened to pass while nothing looked at invoice identity.
          parent: { subscription_details: { subscription: "sub_iso" } },
          lines: {
            object: "list",
            data: [
              {
                id: "il_iso",
                object: "line_item",
                period: { start: sec, end: sec + 30 * 86400 },
                pricing: { price_details: { price: "price_creator" } },
                // The handler selects the subscription line by discriminator.
                parent: {
                  type: "subscription_item_details",
                  subscription_item_details: { subscription: "sub_iso" },
                },
              },
            ],
          },
        },
      },
    } as unknown as Parameters<typeof handleStripeEvent>[1];

    expect(await handleStripeEvent(db, event)).toBe("processed");
    const rows = await db.select().from(creditLedger);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.workspaceId === B)).toBe(true);
    // BOTH workspaces mint their own Free allowance here (R17): this case DOES
    // seed a config, and both `subscriptions` rows carry `status: "none"`, so
    // `getWorkspaceBillingState` resolves both to `free`. A's 25 is A's own —
    // the assertion above already proved every ledger row written by the event
    // belongs to B — and B's 250 is the invoice's allowance ON TOP of its own
    // Free grant, which is why the number is written as a sum rather than as
    // 275.
    expect((await credits.deriveBalance(db, A)).balance).toBe(FREE_ALLOWANCE);
    expect((await credits.deriveBalance(db, B)).balance).toBe(250 + FREE_ALLOWANCE);
  });

  it("maybeAutoTopup: B's auto-top-up spend does NOT consume A's monthly cap", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await seedDb(db); // config v1
    // A MAPPED pack price (audit #7, billing gate 2026-08-18). The comment on
    // the line above used to read "config v1 (pack price)", which was true of
    // `pack.priceUsd` and false of what auto-top-up now needs: `seedDb` ships
    // `stripePriceMap: {}`, and the charge is priced from Stripe's own Price
    // through `resolvePackPrice` rather than from the config number. Without a
    // mapping this case fails on PackPriceNotMappedError before it reaches the
    // per-workspace cap it exists to test.
    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { price_pack: "pack" } },
      "isolation-test"
    );
    // This is deliberately a pre-cutover legacy settlement: it proves the cap
    // query includes retained protocol-0 history after v1 activation without
    // attempting to create a new unbound ledger row after the fence is live.
    await db.insert(creditLedger).values([
      {
        workspaceId: B, delta: 1000, kind: "pack", refType: "auto_topup",
        refId: "pi_b1", stripeEventId: "evt_b1", amountCents: 2000,
        configVersion: 1, expiresAt: future(24 * HOUR),
      },
    ]);
    const rolloutAt = new Date();
    await db
      .update(schema.autoTopupProtocolRollouts)
      .set({
        state: "active",
        revision: 1,
        fleetQuiescedAt: rolloutAt,
        drainStartedAt: rolloutAt,
        providerReconciledAt: rolloutAt,
        reconciledCustomers: 0,
        reconciledPaymentIntents: 0,
        authorityKeyId: "v1",
        authorityKeyFingerprint: `sha256:${"a".repeat(64)}`,
        stripeAccountId: "acct_isolation",
        stripeLivemode: false,
        activatedAt: rolloutAt,
      })
      .where(eq(schema.autoTopupProtocolRollouts.protocol, "v1"));
    await db.insert(subscriptions).values([
      {
        workspaceId: A, stripeCustomerId: "cus_A",
        // Both are LIVE subscribers — auto-top-up refuses without a live
        // subscription (billing round-7 CHANGE 1), and this case is about the
        // CAP being per-workspace, not about the liveness guard.
        stripeSubscriptionId: "sub_A", status: "active",
        autoTopupV1Enabled: true, autoTopupMonthlyCapCents: 2000,
      },
      {
        workspaceId: B, stripeCustomerId: "cus_B",
        stripeSubscriptionId: "sub_B", status: "active",
        autoTopupV1Enabled: true, autoTopupMonthlyCapCents: 2000,
      },
    ]);
    await db
      .update(subscriptions)
      .set({ autoTopupV1Enabled: true })
      .where(sql`${subscriptions.workspaceId} IN (${A}, ${B})`);
    // B has already spent its whole cap this month via the retained settlement.
    // B is capped...
    expect(await maybeAutoTopup(db, B, 100, new Date())).toEqual({
      triggered: false,
      reason: "cap_reached",
    });
    // ...and A's headroom is untouched by B's spend: A gets PAST the cap check
    // and fails only at the keyless Stripe call (proving the cap query passed).
    await expect(maybeAutoTopup(db, A, 100, new Date())).rejects.toThrow(
      /STRIPE_SECRET_KEY/
    );
  });

  it("createPortalUrl: A with no Stripe customer refuses even though B has one (no cross-workspace read)", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await db.insert(subscriptions).values({
      workspaceId: B, stripeCustomerId: "cus_B", status: "active",
    });
    const scopeA = await mintScope(db, A, "owner");
    await expect(
      createPortalUrl(db, scopeA, "https://x", reauthenticationFor(scopeA))
    ).rejects.toThrow(stripeActions.NoStripeCustomerError);
  });

  it("createInvoiceRecoveryUrl: B's incomplete subscription is invisible to A, and a wrong-status A is refused before any Stripe call (audit #8)", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    // ONLY B has the recoverable (incomplete) subscription.
    await db.insert(subscriptions).values({
      workspaceId: B, stripeCustomerId: "cus_B_inc",
      stripeSubscriptionId: "sub_B_inc", stripePriceId: "price_creator",
      status: "incomplete",
    });
    // A has NOTHING: refused on the missing customer, never reaching Stripe and
    // never seeing B's recoverable subscription.
    const missingScopeA = await mintScope(db, A, "owner");
    await expect(
      stripeActions.createInvoiceRecoveryUrl(
        db,
        missingScopeA,
        reauthenticationFor(missingScopeA)
      )
    ).rejects.toThrow(stripeActions.NoStripeCustomerError);

    // A with a HEALTHY subscription of its own: refused on STATUS, and this is
    // the assertion that makes the case non-vacuous as a keyless test — the
    // status gate is deliberately ahead of the Stripe call, so this refusal
    // proves the narrowing rather than proving the absence of a key.
    await db.insert(subscriptions).values({
      workspaceId: A, stripeCustomerId: "cus_A_active",
      stripeSubscriptionId: "sub_A_active", stripePriceId: "price_creator",
      status: "active",
    });
    const activeScopeA = await mintScope(db, A, "owner");
    await expect(
      stripeActions.createInvoiceRecoveryUrl(
        db,
        activeScopeA,
        reauthenticationFor(activeScopeA)
      )
    ).rejects.toThrow(stripeActions.NotRecoverableError);

    // …and a non-owner of the incomplete workspace is refused ahead of both.
    const editorScopeB = await mintScope(db, B, "editor");
    await expect(
      stripeActions.createInvoiceRecoveryUrl(
        db,
        editorScopeB,
        reauthenticationFor(editorScopeB)
      )
    ).rejects.toThrow(stripeActions.BillingRoleError);
  });

  // THE A-vs-B LIVE-SUBSCRIPTION CASE. Three STRIPE_BOUND exclusions above
  // cite this by name as their coverage, and for two review rounds it did not
  // exist — a reasoned exclusion resting on a false citation is just an
  // unguarded surface with a comment (tenancy round 4 CHANGE).
  it("A-vs-B live subscription: B's active subscription never satisfies or blocks A's tier-checkout, pause or resume", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await seedAuthUser(db, "iso_ab_sub");
    await seedDb(db);
    // ONLY B is subscribed. A is bare.
    await db.insert(subscriptions).values({
      workspaceId: B,
      stripeCustomerId: "cus_B",
      stripeSubscriptionId: "sub_B",
      stripePriceId: "price_creator",
      status: "active",
    });
    const ctxA = await mintScope(db, A, "owner");
    const authorityA = reauthenticationByScope.get(ctxA);
    if (!authorityA) throw new Error("test fixture is missing exact-session reauthentication");

    // pause/resume read the SUBSCRIPTION: B's must be invisible, so A refuses
    // for want of its own — never acts on sub_B.
    await expect(
      stripeActions.pauseSubscription(db, ctxA, 1, new Date(), authorityA)
    ).rejects.toThrow(/subscription/i);
    await expect(stripeActions.resumeSubscription(db, ctxA, authorityA)).rejects.toThrow(
      /subscription/i
    );

    // createTierCheckoutUrl reads liveSubscription for the F1 double-billing
    // guard: B's live subscription must NOT make A look already-subscribed.
    // A is keyless, so it must get PAST the guard and fail at Stripe instead.
    await expect(
      stripeActions.createTierCheckoutUrl(db, ctxA, "creator", "a@example.com", {
        successUrl: "https://x/ok",
        cancelUrl: "https://x/no",
      }, authorityA)
    ).rejects.toThrow(/(Stripe|STRIPE_SECRET_KEY|price|rollout)/i);
    await expect(
      stripeActions.createTierCheckoutUrl(db, ctxA, "creator", "a@example.com", {
        successUrl: "https://x/ok",
        cancelUrl: "https://x/no",
      }, authorityA)
    ).rejects.not.toThrow(/[Aa]lready subscribed/);

    // ...and none of it wrote to B.
    const [rowB] = (await db.select().from(subscriptions)).filter(
      (r) => r.workspaceId === B
    );
    expect(rowB.status).toBe("active");
    expect(rowB.pausedAt ?? null).toBeNull();
    expect(await db.select().from(pausePeriods)).toHaveLength(0);
  });

  it("handleStripeEvent pack checkout: a session settling for B mints ONLY in B, and A's identical-id history cannot mask it", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await seedAuthUser(db, "iso_pack");
    await seedDb(db);
    await db.insert(subscriptions).values([
      { workspaceId: A, stripeCustomerId: "cus_A", status: "active" },
      { workspaceId: B, stripeCustomerId: "cus_B", status: "active" },
    ]);
    await handleStripeEvent(db, {
      id: "evt_pack_B",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "cs_shared",
          object: "checkout.session",
          customer: "cus_B",
          mode: "payment",
          payment_status: "paid",
          amount_total: 1000,
          metadata: { respin_kind: "pack" },
        },
      },
    } as never);
    const rows = await db.select().from(creditLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0].workspaceId).toBe(B);
    expect(rows[0].refId).toBe("cs_shared");
    expect(rows.some((r) => r.workspaceId === A)).toBe(false);
  });

  it("setAutoTopup on A leaves B's auto-top-up settings alone", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    // Both LIVE: arming auto-top-up now requires a live subscription through
    // the ONE liveness definition (round-10 CHANGE 4), so a mirror without a
    // subscription id is refused before it can be armed.
    await db.insert(subscriptions).values([
      {
        workspaceId: A, stripeCustomerId: "cus_A",
        stripeSubscriptionId: "sub_A", status: "active",
      },
      {
        workspaceId: B, stripeCustomerId: "cus_B",
        stripeSubscriptionId: "sub_B_at", status: "active",
        autoTopupV1Enabled: true, autoTopupMonthlyCapCents: 5000,
      },
    ]);
    const ownerScope = await mintScope(db, A, "owner");
    await stripeActions.setAutoTopup(
      db,
      ownerScope,
      { enabled: true, monthlyCapCents: 1000 },
      reauthenticationByScope.get(ownerScope)!
    );
    const rows = await db.select().from(subscriptions);
    expect(rows.find((r) => r.workspaceId === A)?.autoTopupMonthlyCapCents).toBe(1000);
    expect(rows.find((r) => r.workspaceId === B)?.autoTopupMonthlyCapCents).toBe(5000);
  });

  it("acceptBillingContact on A rewrites A's customer and A's binding only; billingContactStatus reads A's row only", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    const ownerA = await mintScope(db, A, "owner");
    const ownerB = await mintScope(db, B, "owner");
    await db.insert(subscriptions).values([
      { workspaceId: A, stripeCustomerId: "cus_A", status: "active", billingContactUserId: ownerB.userId },
      { workspaceId: B, stripeCustomerId: "cus_B", status: "active", billingContactUserId: ownerB.userId },
    ]);
    const updated: string[] = [];
    const client = () => ({
      customers: {
        update: async (id: string, params: unknown) => {
          updated.push(id);
          return { id, ...(params as object), address: null, shipping: null, metadata: {} } as never;
        },
        retrieve: async () => {
          throw new Error("not used");
        },
      },
    });
    expect(await billingContactMod.billingContactStatus(db, ownerA)).toMatchObject({ hasCustomer: true, isCurrentUser: false });
    await billingContactMod.acceptBillingContact(db, ownerA, "owner-a@example.test", reauthenticationFor(ownerA), client);
    // ONE provider write, on A's customer; B's customer and B's binding untouched.
    expect(updated).toEqual(["cus_A"]);
    const rows = await db.select().from(subscriptions);
    expect(rows.find((r) => r.workspaceId === A)?.billingContactUserId).toBe(ownerA.userId);
    expect(rows.find((r) => r.workspaceId === B)?.billingContactUserId).toBe(ownerB.userId);
    expect(await billingContactMod.billingContactStatus(db, ownerB)).toEqual({ hasCustomer: true, contactUserId: ownerB.userId, isCurrentUser: true });
  });

  it("ensurePauseStarted/Ended on A converge without touching B's pause state", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await db.insert(subscriptions).values([
      { workspaceId: A, stripeCustomerId: "cus_A", status: "active" },
      { workspaceId: B, stripeCustomerId: "cus_B", status: "active" },
    ]);
    await tx(db, (t) => credits.ensurePauseStarted(t, B, new Date()));
    // A's converge calls are no-ops/idempotent and never see B's open pause
    expect(await tx(db, (t) => credits.ensurePauseEnded(t, A, new Date()))).toBe(
      false
    );
    expect(await tx(db, (t) => credits.ensurePauseStarted(t, A, new Date()))).toBe(
      true
    );
    expect(await tx(db, (t) => credits.hasOpenPause(t, B))).toBe(true);
    const pauses = await db.select().from(pausePeriods);
    expect(pauses).toHaveLength(2);
    expect(new Set(pauses.map((p) => p.workspaceId))).toEqual(new Set([A, B]));
  });

  it("createProfile: A's profile lands only in A, and B's cap is untouched by it", async () => {
    // THIS CASE EXISTS BECAUSE THE BILLING GATE FOUND ITS ABSENCE (2026-08-27).
    // `"createProfile"` had been added to `COVERED` above, whose stated contract
    // is "covered by a named isolation case below" — and there was no such case.
    // The set is consumed only as a name list, so the enumeration could not tell
    // a case from a claim: exactly the "reasoned exclusion resting on a false
    // citation" shape this file warns about sixty lines further down.
    const db = await createTestDb();
    await seedDb(db); // config v1 — free cap is 1
    const { A, B } = await twoWorkspaces(db);
    const ownerA = await mintScope(db, A, "owner");
    const ownerB = await mintScope(db, B, "owner");

    const inA = await credits.createProfile(db, ownerA, "A's creator", new Date());
    expect(inA.workspaceId).toBe(A as string);

    // NON-VACUITY IN BOTH DIRECTIONS. A is now AT its cap of 1 — and B, which
    // shares the config document and the table, is not: if the count leaked
    // across workspaces, B's create would be refused.
    await expect(
      credits.createProfile(db, ownerA, "A's second", new Date())
    ).rejects.toBeInstanceOf(ProfileCapError);
    const inB = await credits.createProfile(db, ownerB, "B's creator", new Date());
    expect(inB.workspaceId).toBe(B as string);

    // ...and the table holds exactly one row per workspace, each carrying its
    // own workspace id. A dropped predicate on the COUNT shows up above; a
    // dropped predicate on the INSERT shows up here.
    const rows = await db.select().from(creatorProfiles);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.workspaceId === (A as string))).toHaveLength(1);
    expect(rows.filter((r) => r.workspaceId === (B as string))).toHaveLength(1);
  });

  /**
   * Two PAID workspaces, one profile each, `credits` each — the fixture the
   * three slice-8c cases share. Paid through the ONE authority (a live
   * subscription plus a price the ACTIVE document maps), never a mirror flag.
   */
  async function twoPaidWorkspaces(db: TestDb, creditsEach: number) {
    await seedDb(db);
    const { A, B } = await twoWorkspaces(db);
    const ownerA = await mintScope(db, A, "owner");
    const ownerB = await mintScope(db, B, "owner");
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(db, { ...content, stripePriceMap: { price_creator: "creator" } }, "iso-admin");
    for (const [ws, n] of [[A, "a"], [B, "b"]] as const) {
      await db.insert(schema.subscriptions).values({
        workspaceId: ws, stripeCustomerId: `cus_${n}`, stripeSubscriptionId: `sub_${n}`,
        stripePriceId: "price_creator", status: "active",
      });
      if (creditsEach > 0) {
        await tx(db, (t) =>
          credits.grantCredits(t, {
            workspaceId: ws, amount: creditsEach, expiresAt: future(365 * 24 * HOUR),
            refType: "test", refId: `${n}-grant`, configVersion: 1,
          })
        );
      }
    }
    const profA = await credits.createProfile(db, ownerA, "A's creator", new Date());
    const profB = await credits.createProfile(db, ownerB, "B's creator", new Date());
    return { A, B, ownerA, ownerB, profA, profB };
  }
  const PASTE = { sourceUrl: "https://www.youtube.com/watch?v=iso123", transcript: "Open on the tradeoff.\nShow the pan." };
  const ledgerOf = async (db: TestDb, ws: VerifiedWorkspaceId) =>
    (await db.select().from(creditLedger)).filter((r) => r.workspaceId === (ws as string));

  it("submitPastedReference: A's paste lands only in A — B's ledger, rows and replay are untouched by it", async () => {
    const db = await createTestDb();
    const { A, B, ownerA, ownerB, profA, profB } = await twoPaidWorkspaces(db, 100);
    const price = (await getActiveConfig(db)).content.creditCosts.autopsy;

    const inA = await credits.submitPastedReference(db, ownerA, profA.id, PASTE, new Date());
    expect(inA.creditsChargedNow).toBe(price);
    // B's balance is untouched, and B's ledger holds no autopsy debit.
    expect((await credits.deriveBalance(db, B)).balance).toBe(100);
    expect((await ledgerOf(db, B)).filter((r) => r.refType === "autopsy_claim")).toHaveLength(0);
    expect((await ledgerOf(db, A)).filter((r) => r.refType === "autopsy_claim")).toHaveLength(1);

    // NON-VACUITY: the SAME URL and text pasted in B is NOT a replay of A's
    // claim — B gets its own claim and pays its own price. If the idempotency
    // lookup or the debit lookup leaked across workspaces, B would be charged
    // 0 here (or A's claim id would come back).
    const inB = await credits.submitPastedReference(db, ownerB, profB.id, PASTE, new Date());
    expect(inB.claimId).not.toBe(inA.claimId);
    expect(inB.creditsChargedNow).toBe(price);
    expect((await credits.deriveBalance(db, A)).balance).toBe(100 - price);
    expect((await credits.deriveBalance(db, B)).balance).toBe(100 - price);
    // ...and every private row carries its own workspace.
    for (const table of [schema.trendItems, schema.autopsyCacheClaims, schema.onboardingInputs] as const) {
      const rows = await db.select().from(table);
      expect(rows.filter((r) => r.workspaceId === (A as string))).toHaveLength(1);
      expect(rows.filter((r) => r.workspaceId === (B as string))).toHaveLength(1);
    }
  });

  it("settleParkedAutopsies: B's parked claim never refunds A, and A's settlement never touches B's ledger", async () => {
    const db = await createTestDb();
    const { A, B, ownerA, ownerB, profA, profB } = await twoPaidWorkspaces(db, 100);
    const inB = await credits.submitPastedReference(db, ownerB, profB.id, PASTE, new Date());
    await db.update(schema.autopsyCacheClaims).set({ status: "parked", attemptCount: 5 })
      .where(eq(schema.autopsyCacheClaims.id, inB.claimId));

    // A settles: nothing of A's is parked, and B's parked claim is not A's.
    expect(await credits.settleParkedAutopsies(db, ownerA, profA.id)).toEqual({ refundedClaimIds: [], creditsReturned: 0, deferred: false, neverChargedClaimIds: [], alreadyRefundedClaimIds: [] });
    expect((await credits.deriveBalance(db, A)).balance).toBe(100);
    expect((await ledgerOf(db, B)).filter((r) => r.refType === "autopsy_refund")).toHaveLength(0);

    // NON-VACUITY: B's own settlement DOES refund it, exactly once, in B.
    expect(await credits.settleParkedAutopsies(db, ownerB, profB.id)).toEqual({ refundedClaimIds: [inB.claimId], creditsReturned: inB.creditsChargedNow, deferred: false, neverChargedClaimIds: [], alreadyRefundedClaimIds: [] });
    expect((await credits.deriveBalance(db, B)).balance).toBe(100);
    const refunds = (await db.select().from(creditLedger)).filter((r) => r.refType === "autopsy_refund");
    expect(refunds).toHaveLength(1);
    expect(refunds[0].workspaceId).toBe(B as string);
    // ...and a cross-workspace scope cannot even name B's profile.
    await expect(credits.settleParkedAutopsies(db, ownerA, profB.id)).rejects.toThrow();
  });

  it("pastedReferenceQuote reads only the given workspace's tier, balance and pause", async () => {
    const db = await createTestDb();
    const { A, B } = await twoPaidWorkspaces(db, 100);
    await tx(db, (t) => credits.recordPauseStart(t, B, new Date(), future(30 * 24 * HOUR), new Date()));
    await tx(db, (t) => credits.grantCredits(t, {
      workspaceId: B, amount: 500, expiresAt: future(365 * 24 * HOUR), refType: "test", refId: "b-extra", configVersion: 1,
    }));
    const price = (await getActiveConfig(db)).content.creditCosts.autopsy;
    expect(await credits.pastedReferenceQuote(db, A, new Date())).toEqual({
      creditCost: price, balance: 100, tier: "creator", allowed: { ok: true },
    });
    expect((await credits.pastedReferenceQuote(db, B, new Date())).allowed).toEqual({ ok: false, reason: "paused" });
  });

  it("performanceLearningEntitlementFor resolves each workspace's own billing tier against the active config", async () => {
    const db = await createTestDb();
    await seedDb(db);
    const { A, B } = await twoWorkspaces(db);
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      {
        ...content,
        stripePriceMap: { price_creator: "creator" },
        // Deliberately inverted: this proves the result came from the exact
        // configured tier rather than a guessed paid/full or free/view map.
        performanceLearning: {
          free: "full",
          creator: "view_only",
          pro: "full",
          studio: "full",
        },
      },
      "isolation-test"
    );
    await db.insert(subscriptions).values({
      workspaceId: B,
      stripeCustomerId: "cus_perf_b",
      stripeSubscriptionId: "sub_perf_b",
      stripePriceId: "price_creator",
      status: "active",
    });

    // B's paid row must not move A off its own absent/dead -> Free state.
    expect(
      await credits.performanceLearningEntitlementFor(db, A, new Date())
    ).toBe("full");
    // NON-VACUITY: B's own mapped paid state resolves differently.
    expect(
      await credits.performanceLearningEntitlementFor(db, B, new Date())
    ).toBe("view_only");
  });

  it("usageRunwayFor reads only the scoped workspace's pause, balance and debit history", async () => {
    const db = await createTestDb();
    await seedDb(db);
    const { A, B } = await twoWorkspaces(db);
    const ownerA = await mintScope(db, A, "owner");
    const ownerB = await mintScope(db, B, "owner");
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, stripePriceMap: { price_creator: "creator" } },
      "isolation-test"
    );
    await db.insert(subscriptions).values([
      {
        workspaceId: A,
        stripeCustomerId: "cus_runway_a",
        stripeSubscriptionId: "sub_runway_a",
        stripePriceId: "price_creator",
        status: "active",
      },
      {
        workspaceId: B,
        stripeCustomerId: "cus_runway_b",
        stripeSubscriptionId: "sub_runway_b",
        stripePriceId: "price_creator",
        status: "active",
      },
    ]);

    const base = new Date();
    const ago = (days: number) =>
      new Date(base.getTime() - days * 24 * HOUR);
    const expiresAt = new Date(base.getTime() + 365 * 24 * HOUR);
    await db.insert(creditLedger).values([
      { workspaceId: A, delta: 100, kind: "grant", refType: "test", refId: "runway-a-grant", expiresAt, configVersion: 1, createdAt: ago(4) },
      { workspaceId: A, delta: -10, kind: "debit", refType: "runway", refId: "runway-a-1", expiresAt: null, configVersion: 1, createdAt: ago(3) },
      { workspaceId: A, delta: -10, kind: "debit", refType: "runway", refId: "runway-a-2", expiresAt: null, configVersion: 1, createdAt: ago(2) },
      { workspaceId: A, delta: -10, kind: "debit", refType: "runway", refId: "runway-a-3", expiresAt: null, configVersion: 1, createdAt: ago(1) },
      { workspaceId: B, delta: 500, kind: "grant", refType: "test", refId: "runway-b-grant", expiresAt, configVersion: 1, createdAt: ago(4) },
      { workspaceId: B, delta: -100, kind: "debit", refType: "runway", refId: "runway-b-1", expiresAt: null, configVersion: 1, createdAt: ago(3) },
      { workspaceId: B, delta: -100, kind: "debit", refType: "runway", refId: "runway-b-2", expiresAt: null, configVersion: 1, createdAt: ago(2) },
      { workspaceId: B, delta: -100, kind: "debit", refType: "runway", refId: "runway-b-3", expiresAt: null, configVersion: 1, createdAt: ago(1) },
    ]);
    // The pause begins after all B debits: the fixture respects the writer's
    // no-debit-during-pause invariant while proving B's pause is invisible to A.
    await db.insert(pausePeriods).values({
      workspaceId: B,
      startedAt: new Date(base.getTime() - 12 * HOUR),
    });

    expect(await credits.usageRunwayFor(db, ownerA)).toMatchObject({
      state: "estimate",
      balance: 70,
      totalDebit: 30,
      debitDayCount: 3,
      dailyRate: 1,
      daysToEmpty: 70,
    });
    // NON-VACUITY: the same authority can see B's distinct rows and pause,
    // while those values did not contaminate A's estimate above.
    expect(await credits.usageRunwayFor(db, ownerB)).toMatchObject({
      state: "paused",
      balance: 200,
      totalDebit: 300,
      debitDayCount: 3,
    });
  });

  it("runInference: A's attempt is priced off A's OWN history, and never reaches B", async () => {
    // THE ISOLATION QUESTION THIS OPERATION ACTUALLY POSES is not "does the
    // row carry the right workspace id" — it is "whose history decides what
    // this creator is charged". D-M2-2 gives each profile ONE included build
    // and prices every rebuild after it off the included-build CLAIM
    // (`firstBillableAttempt`, R-80), so a dropped workspace predicate on that
    // read would let B's spending consume A's included build: A would be
    // charged 50 credits for the first thing they ever ran, because a stranger
    // had run one first.
    const db = await createTestDb();
    await seedDb(db);
    const { A, B } = await twoWorkspaces(db);
    const ownerA = await mintScope(db, A, "owner");
    const ownerB = await mintScope(db, B, "owner");
    const profA = await credits.createProfile(db, ownerA, "A's creator", new Date());
    const profB = await credits.createProfile(db, ownerB, "B's creator", new Date());

    // B goes first and burns ITS included build, then a second, PAID attempt.
    await tx(db, (t) =>
      credits.grantCredits(t, {
        workspaceId: B,
        amount: 500,
        expiresAt: future(365 * 24 * HOUR),
        refType: "test",
        refId: "b-grant",
        configVersion: 1,
      })
    );
    await credits.runInference(db, ownerB, profB.id, stubProvider(), anySlots(), req("b-1"), new Date());
    const bSecond = await credits.runInference(
      db,
      ownerB,
      profB.id,
      stubProvider(),
      anySlots(),
      req("b-2"),
      new Date()
    );
    expect(bSecond.creditsCharged).toBe(50);

    // A now runs its FIRST EVER attempt, with a balance of ZERO. If B's two
    // attempts were visible to A's count, this is refused for insufficient
    // credits before the provider is ever called — so a leak here is not a
    // subtle mis-charge, it is A being locked out of the product by a stranger.
    const aFirst = await credits.runInference(
      db,
      ownerA,
      profA.id,
      stubProvider(),
      anySlots(),
      req("a-1"),
      new Date()
    );
    expect(aFirst.creditsCharged).toBe(0);
    // A's OWN Free allowance, minted by the balance read inside the debit
    // transaction (R17) — never B's. The next assertion is what keeps this
    // case non-vacuous: 25 does not cover a 50-credit rebuild, so A's second
    // attempt is still refused on A's own balance.
    expect(aFirst.balanceAfter).toBe(FREE_ALLOWANCE);

    // NON-VACUITY: the pricing rule is live, not simply always-free. A's
    // SECOND attempt is priced, and refuses on A's own empty balance.
    await expect(
      credits.runInference(db, ownerA, profA.id, stubProvider(), anySlots(), req("a-2"), new Date())
    ).rejects.toBeInstanceOf(credits.InsufficientCreditsError);

    // ...and every row written carries its own workspace: a dropped predicate
    // on the INSERT shows up here, one on the COUNT shows up above.
    const usage = await db.select().from(modelUsage);
    expect(usage.filter((u) => u.workspaceId === (A as string))).toHaveLength(1);
    expect(usage.filter((u) => u.workspaceId === (B as string))).toHaveLength(2);
    const debits = (await db.select().from(creditLedger)).filter(
      (r) => r.refType === "inference"
    );
    expect(debits).toHaveLength(1);
    expect(debits[0].workspaceId).toBe(B as string);
  });

  it("getWorkspaceBillingState reads only the given workspace's subscription", async () => {
    const db = await createTestDb();
    const { A, B } = await twoWorkspaces(db);
    await db.insert(schema.subscriptions).values({
      workspaceId: B, stripeCustomerId: "cus_b", status: "active", stripePriceId: "p",
    });
    // A has no row → free, regardless of B's active subscription
    // (config not needed: the free path returns before any config read)
    expect(await credits.getWorkspaceBillingState(db, A, new Date())).toEqual({
      tier: "free",
      state: "free",
    });
  });
});
