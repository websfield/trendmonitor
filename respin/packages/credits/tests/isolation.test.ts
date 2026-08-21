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
import { describe, expect, it } from "vitest";
import {
  createTestDb,
  creditLedger,
  pausePeriods,
  schema,
  subscriptions,
  trustWorkspaceId,
  seedAuthUser,
  seedDb,
  CONFIG_V1_SEED,
  type TestDb,
  type VerifiedWorkspaceId,
} from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import * as credits from "../src/index";
import * as appServer from "../src/app-server";
import * as webhookServer from "../src/webhook-server";
import * as stripeActions from "../src/stripe/actions";
import * as stripeCustomers from "../src/stripe/customers";
import * as stripeWebhooks from "../src/stripe/webhooks";
import * as stripeAutoTopup from "../src/stripe/auto-topup";
// INTERNAL modules, imported so their INTERNAL_MODULES claims can be checked
// against their real exports rather than trusted as prose.
import * as balanceMod from "../src/balance";
import * as foldMod from "../src/fold";
import * as ledgerMod from "../src/ledger";
import * as stateMod from "../src/state";
import * as pauseMod from "../src/pause";
import * as clockMod from "../src/clock";
import * as monthsMod from "../src/months";
import * as metricsMod from "../src/metrics";
import * as errorsMod from "../src/errors";
import * as adapterMod from "../src/stripe/adapter";
import * as setupMod from "../src/stripe/setup";
import * as packPriceMod from "../src/stripe/pack-price";
import { handleStripeEvent } from "../src/stripe/webhooks";
import { workspaceForCustomer, getOrCreateCustomer } from "../src/stripe/customers";
import { createPortalUrl } from "../src/stripe/actions";
import { maybeAutoTopup } from "../src/stripe/auto-topup";

const HOUR = 3_600_000;
const future = (ms: number) => new Date(Date.now() + ms);

/**
 * The enumeration contract. Every exported FUNCTION of the public surface is
 * either covered by a named isolation case below or listed here with the
 * reason it needs none. Adding an export without touching this file fails
 * the completeness assertion.
 */
const NOT_DB_FACING: Record<string, string> = {
  foldLedger: "pure function — takes rows as arguments, no query",
  effectiveExpiry: "pure function — no query",
  InsufficientCreditsError: "error class",
  WorkspacePausedError: "error class",
  ClockSkewError: "error class",
  LedgerIntegrityError: "error class",
  RefundSourceNeverExpiresError: "error class",
  AlreadySubscribedError: "error class",
  CheckoutInFlightError: "error class",
  NoStripeCustomerError: "error class",
  NoLiveSubscriptionError: "error class",
  NotPausedError: "error class",
  PauseLengthError: "error class",
  AutoTopupCapError: "error class",
  StripeSessionUrlMissingError: "error class",
  CustomerMappingLostError: "error class",
  BillingRoleError: "error class",
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
  createTierCheckoutUrl:
    "keyless up to the liveSubscription read — covered by the A-vs-B live-subscription case",
  createPackCheckoutUrl:
    "keyless up to getOrCreateCustomer — covered by the getOrCreateCustomer case",
  pauseSubscription:
    "keyless up to the liveSubscription read — covered by the A-vs-B live-subscription case",
  resumeSubscription:
    "keyless up to the subscriptions read — covered by the A-vs-B live-subscription case",
};

const COVERED = new Set([
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
  "maybeAutoTopup",
  "createPortalUrl",
  "setAutoTopup",
  // Audit 2026-08-17 remediation (R2, #8). Genuinely COVERED rather than
  // STRIPE_BOUND: its owner gate, its workspace-scoped mirror read and its
  // status narrowing all run BEFORE the first Stripe call, so the keyless case
  // drives every decision this function makes about which workspace it is
  // acting for.
  "createInvoiceRecoveryUrl",
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
  "stripe/actions.ts": stripeActions,
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
    reason: "the balance authority — reached publicly through index.ts",
    viaIndex: ["deriveBalanceInTx", "deriveBalance"],
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
      "fold observability (audit 2026-08-17 #22 / R-25 D-AUDIT-3) — emits two named metrics and a workspace id, runs NO query of its own, and stays off src/index because app/** has no business emitting or redirecting money-path telemetry; its one caller is balance.ts, the balance authority",
    internalOnly: ["setFoldMetricSink", "emitFoldMetric"],
  },
  "errors.ts": {
    reason: "error classes only",
    viaIndex: [
      "InsufficientCreditsError",
      "WorkspacePausedError",
      "ClockSkewError",
    ],
  },
  "stripe/adapter.ts": {
    reason:
      "Stripe client factory + env reads — no query; the facades re-export what app/** needs",
    internalOnly: [
      "StripeNotConfiguredError",
      "getStripe",
      "getWebhookSecret",
      "isStripeConfigured",
    ],
  },
  "stripe/setup.ts": {
    reason:
      "one-off Stripe product/price seeding; reads the GLOBAL active config (not workspace-scoped) and writes nothing to our database",
    internalOnly: ["stripeSetup"],
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
      "resolvePackPrice",
    ],
  },
};

/** Namespaces for the internal modules, so their claims can be checked. */
const INTERNAL_NAMESPACES: Record<string, object> = {
  "balance.ts": balanceMod,
  "fold.ts": foldMod,
  "ledger.ts": ledgerMod,
  "state.ts": stateMod,
  "pause.ts": pauseMod,
  "clock.ts": clockMod,
  "months.ts": monthsMod,
  "metrics.ts": metricsMod,
  "errors.ts": errorsMod,
  "stripe/adapter.ts": adapterMod,
  "stripe/setup.ts": setupMod,
  "stripe/pack-price.ts": packPriceMod,
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
  getWebhookSecret:
    "the SIGNATURE-VERIFICATION secret, reached only through the WEBHOOK facade — which is allowlisted to app/api/stripe/webhook/** alone, not to app/** at large (see app-server.ts's header for why that distinction exists). The route needs it to call the SDK's static constructEvent BEFORE any handler runs; it performs no query and touches no workspace data.",
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
  const unaccounted = modules.filter(
    (m) => !(m in ENUMERATED) && !(m in INTERNAL_MODULES)
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
    expect(await getOrCreateCustomer(db, A, "a@example.com")).toBe("cus_A");
    expect(await getOrCreateCustomer(db, B, "b@example.com")).toBe("cus_B");
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
    expect((await credits.deriveBalance(db, A)).balance).toBe(0);
    expect((await credits.deriveBalance(db, B)).balance).toBe(250);
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
    await db.insert(subscriptions).values([
      {
        workspaceId: A, stripeCustomerId: "cus_A",
        // Both are LIVE subscribers — auto-top-up refuses without a live
        // subscription (billing round-7 CHANGE 1), and this case is about the
        // CAP being per-workspace, not about the liveness guard.
        stripeSubscriptionId: "sub_A", status: "active",
        autoTopupEnabled: true, autoTopupMonthlyCapCents: 2000,
      },
      {
        workspaceId: B, stripeCustomerId: "cus_B",
        stripeSubscriptionId: "sub_B", status: "active",
        autoTopupEnabled: true, autoTopupMonthlyCapCents: 2000,
      },
    ]);
    // B has already spent its whole cap this month.
    await db.insert(creditLedger).values([
      {
        workspaceId: B, delta: 1000, kind: "pack", refType: "auto_topup",
        refId: "pi_b1", amountCents: 2000, expiresAt: future(24 * HOUR),
      },
    ]);
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
    await expect(
      createPortalUrl(db, { workspaceId: A, role: "owner" } as never, "https://x")
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
    await expect(
      stripeActions.createInvoiceRecoveryUrl(db, {
        workspaceId: A, role: "owner",
      } as never)
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
    await expect(
      stripeActions.createInvoiceRecoveryUrl(db, {
        workspaceId: A, role: "owner",
      } as never)
    ).rejects.toThrow(stripeActions.NotRecoverableError);

    // …and a non-owner of the incomplete workspace is refused ahead of both.
    await expect(
      stripeActions.createInvoiceRecoveryUrl(db, {
        workspaceId: B, role: "editor",
      } as never)
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
    const ctxA = { workspaceId: A, role: "owner" } as never;

    // pause/resume read the SUBSCRIPTION: B's must be invisible, so A refuses
    // for want of its own — never acts on sub_B.
    await expect(
      stripeActions.pauseSubscription(db, ctxA, 1, new Date())
    ).rejects.toThrow(/subscription/i);
    await expect(stripeActions.resumeSubscription(db, ctxA)).rejects.toThrow(
      /subscription/i
    );

    // createTierCheckoutUrl reads liveSubscription for the F1 double-billing
    // guard: B's live subscription must NOT make A look already-subscribed.
    // A is keyless, so it must get PAST the guard and fail at Stripe instead.
    await expect(
      stripeActions.createTierCheckoutUrl(db, ctxA, "creator", "a@example.com", {
        successUrl: "https://x/ok",
        cancelUrl: "https://x/no",
      })
    ).rejects.toThrow(/(Stripe|STRIPE_SECRET_KEY|price)/i);
    await expect(
      stripeActions.createTierCheckoutUrl(db, ctxA, "creator", "a@example.com", {
        successUrl: "https://x/ok",
        cancelUrl: "https://x/no",
      })
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
        autoTopupEnabled: true, autoTopupMonthlyCapCents: 5000,
      },
    ]);
    await stripeActions.setAutoTopup(
      db,
      { workspaceId: A, role: "owner" } as never,
      { enabled: true, monthlyCapCents: 1000 }
    );
    const rows = await db.select().from(subscriptions);
    expect(rows.find((r) => r.workspaceId === A)?.autoTopupMonthlyCapCents).toBe(1000);
    expect(rows.find((r) => r.workspaceId === B)?.autoTopupMonthlyCapCents).toBe(5000);
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
