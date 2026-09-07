// /usage — REQ-G07's M1 slice. Server component: gate, scope, read, render.
//
// Every read goes through the sanctioned surfaces and nothing else (tenancy T1):
// `scopeForUser` for bootstrap-safe scope and its accessors, `respinDb` for
// the scoped monthly-spend reader, and `respinCredits` for
// the derived balance and the billing state. No raw tables, no connection, no
// Stripe — the default-deny lint and the import-boundary fixtures enforce that,
// and this file is one of the paths they cover.
import { requireUser } from "@respin/auth";
import { respinDb } from "@respin/db";
import {
  respinCredits,
  burnPeriod,
  BURN_PERIOD_COPY,
  modeLabel,
  type BurnPeriodTier,
} from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { AccessRefusal } from "../access-refusal";
import { billingErrorDisplay, billingErrorFromCode } from "../billing-errors";
import {
  UsageView,
  type BurnByMode,
  type MonthlyBurn,
  type UsageLedgerRow,
} from "./usage-view";
import { portalAvailability } from "./copy";
import { openPortalAction } from "../settings/billing/actions";
import { logRefusal } from "../safe-log";
import { scopeForUser } from "../workspace-scope";

/** How many ledger entries the page shows. One more is fetched to detect "more". */
const PAGE_SIZE = 50;

export default async function UsagePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The real gate, per-page (client-nav caches layouts — gate-completeness test).
  // ABOVE the try: `requireUser()` refuses by throwing a `redirect()`.
  const user = await requireUser();
  const search = await props.searchParams;

  // Scoping is a REFUSAL PATH, not an assumption: `scopeForUser` bootstraps
  // before the scope read so this page cannot lose the first-login race against
  // the concurrently-rendered layout. Its underlying `withWorkspace` still
  // throws `WorkspaceAccessError` when scope is ambiguous, including the M2
  // case where a user belongs to more than one workspace. The refusal stays
  // inside this try so its existing creator-facing copy remains reachable.
  let scope: Awaited<ReturnType<typeof scopeForUser>>;
  try {
    scope = await scopeForUser(user);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[usage] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  // Balance: the SINGLE authority. A failure here is not a page crash — a
  // LedgerIntegrityError in particular will not fix itself on a reload, and the
  // creator needs to be told that rather than shown a stack trace.
  let balance: Parameters<typeof UsageView>[0]["balance"];
  try {
    const view = await respinCredits.getBalance(scope.workspaceId);
    balance = { ok: true, value: view.balance, asOf: view.asOf };
  } catch (err) {
    rethrowNextControlFlow(err);
    // Ids and instants stay in the log; the page gets the remedy.
    logRefusal("[usage] balance derivation failed", err);
    const copy = billingErrorDisplay(err);
    balance = { ok: false, title: copy.title, detail: copy.detail };
  }

  // C8's runway read is intentionally separate from the visible ledger page.
  // `usageRunwayFor` owns one repeatable-read transaction containing the DB
  // clock, active config, open-pause state, derived balance and debit history.
  // It returns a named unavailable state for every component it can safely
  // degrade, so this page neither substitutes a wall clock nor derives a rate.
  let runway: Parameters<typeof UsageView>[0]["runway"];
  try {
    runway = await respinCredits.usageRunwayFor(scope);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[usage] runway read unavailable", err);
    // The projection's named unavailable states require its authoritative DB
    // instant. When acquiring that instant itself fails, inventing a timestamp
    // would turn an outage into a false observation, so use the page's normal
    // refusal surface rather than manufacturing a fifth projection state.
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  // Brain assets are a free, paused-safe read. The aggregate is scoped and
  // exact in the DB layer; this page does not count a bounded history list.
  let brainAssets: Parameters<typeof UsageView>[0]["brainAssets"];
  try {
    const profile = await respinDb.selectedProfileForMember(scope);
    brainAssets = profile
      ? { state: "available", ...(await respinDb.brainAssetSummary(scope, profile.id)) }
      : { state: "no_profile" };
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[usage] brain assets unavailable", err);
    brainAssets = { state: "unavailable" };
  }

  // One extra row is fetched purely to answer "is there more?" honestly —
  // without it the page would have to either claim completeness it cannot
  // check, or count the whole table.
  const fetched = await scope.accessors.ledger({ limit: PAGE_SIZE + 1 });
  const moreRows = fetched.length > PAGE_SIZE;
  const rows: UsageLedgerRow[] = fetched.slice(0, PAGE_SIZE).map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    kind: r.kind,
    delta: r.delta,
    expiresAt: r.expiresAt,
    ref: r.refId,
  }));

  // Pause notice + portal availability. Billing state is its own authority; the
  // subscription row only answers "is there a Stripe customer to send them to".
  let paused: { resumesAt: Date | null } | null = null;
  // THE RESOLVED TIER, KEPT — because the burn period below is chosen by it and
  // not by whether a `subscriptions` row happens to carry a window (billing
  // gate, 2026-09-01). `unknown` is the honest value when this read failed: it
  // is not a tier, and `burnPeriod` treats it as "no anniversary we can trust",
  // which degrades to the calendar month rather than to a stale window.
  let billingTier: BurnPeriodTier = "unknown";
  try {
    const state = await respinCredits.getBillingState(
      scope.workspaceId,
      new Date()
    );
    billingTier = state.tier;
    paused =
      state.state === "paused" ? { resumesAt: state.resumesAt ?? null } : null;
  } catch (err) {
    rethrowNextControlFlow(err);
    // A config read can fail closed (no seeded config). That must not take the
    // balance down with it — the pause notice is simply not shown, and the
    // billing page is where the operator-facing remedy is rendered in full.
    logRefusal("[usage] billing state unavailable", err);
  }

  const [subscription] = await scope.accessors.subscription();

  // R7/R8 (slice 2b): this month's credit burn, from the same period
  // authority billing uses. Failing this must not take the balance or the
  // ledger down with it — `ok: false` renders as a stated "couldn't load"
  // rather than a page crash, the same fail-soft shape `paused` above uses.
  //
  // ONE PERIOD, DERIVED ONCE, read by both panels AND named on the screen.
  // `burnPeriod` is the single authority (paid: the subscription's own
  // `current_period_start`; Free — and anything else that resolves to Free —
  // the UTC calendar month, which is the key its Free credits are minted on),
  // and computing it twice is how the total and the split would come to
  // disagree about which window they are describing.
  //
  // IT IS PASSED THE TIER, NOT JUST THE ROW (billing gate, 2026-09-01):
  // `DEAD_SUBSCRIPTION_FIELDS` does not clear `currentPeriodStart`, so a
  // cancelled subscriber's row anchors "this month" to a window that never
  // advances again — harmless until slice 6's Free mint started granting them
  // credits on the calendar month, at which point the page summed many months
  // of burn under one month's label.
  const period = burnPeriod({ subscription, tier: billingTier, now: new Date() });
  const periodStart = period.start;
  let burn: MonthlyBurn;
  try {
    const result = await respinDb.monthlySpend(scope, periodStart);
    burn = result.hasAnyDebit
      ? { ok: true, hasAnyDebit: true, totalDebit: result.totalDebit }
      : { ok: true, hasAnyDebit: false };
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[usage] monthly burn unavailable", err);
    burn = { ok: false };
  }

  // R17a (slice 6): the same period, split by the mode each debit's attempt
  // settled into. ITS OWN try/catch, so a failure here degrades the split
  // alone — the total above and the ledger below are separate answers and a
  // creator losing all three to one query is worse than losing one.
  //
  // `modeLabel` is resolved HERE and not in the view: `@respin/modes` is denied
  // to `app/**` (R-64), and a hand-written label map in a component would be a
  // second mode vocabulary that goes stale the day slice 7 adds six modes.
  let burnByMode: BurnByMode;
  try {
    const split = await respinDb.burnByMode(scope, periodStart);
    burnByMode = {
      ok: true,
      byMode: split.byMode.map((r) => ({
        mode: r.mode,
        label: modeLabel(r.mode),
        credits: r.credits,
        debits: r.debits,
      })),
      notAGeneration: split.notAGeneration,
      nonTerminalClaim: split.nonTerminalClaim,
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[usage] burn by mode unavailable", err);
    burnByMode = { ok: false };
  }

  // REQ-A02: role first, then "is there a Stripe customer to send them to".
  // PURE and unit-tested (`portalAvailability`): an inline ternary here would
  // be a decision nothing could assert, which is how the role test came to be
  // missing (round-2 CHANGE 6). `tests/page-wiring.test.tsx` now executes THIS
  // page and asserts the role test at this call site — the other two pages
  // still have no such harness, so the rule stands: decisions live in pure
  // functions, not in page bodies.
  const portal = portalAvailability({
    isOwner: scope.role === "owner",
    hasStripeCustomer: Boolean(subscription),
  });

  return (
    <UsageView
      balance={balance}
      burn={burn}
      // R17a: the creator must be able to tell which period they are reading.
      // Resolved here, from the one derivation above, for the reason `modeLabel`
      // is resolved here (R-66): a screen-side copy of the vocabulary is a
      // second answer that can name a window the derivation did not choose.
      period={{ start: period.start, ...BURN_PERIOD_COPY[period.kind] }}
      burnByMode={burnByMode}
      runway={runway}
      brainAssets={brainAssets}
      rows={rows}
      moreRows={moreRows}
      paused={paused}
      // A refused portal action redirects back HERE with a code (its `from`
      // field names this page, and the action allowlists it), so this page has
      // to be able to say what happened — otherwise the button would appear to
      // do nothing at all.
      error={billingErrorFromCode(
        typeof search.e === "string" ? search.e : undefined
      )}
      portal={
        portal.ok
          ? { available: true, action: openPortalAction }
          : { available: false, reason: portal.reason }
      }
      billingHref="/settings/billing"
    />
  );
}
