// /usage — REQ-G07's M1 slice. Server component: gate, scope, read, render.
//
// Every read goes through the sanctioned surfaces and nothing else (tenancy T1):
// `respinDb.withWorkspace` for the scope and its accessors, `respinCredits` for
// the derived balance and the billing state. No raw tables, no connection, no
// Stripe — the default-deny lint and the import-boundary fixtures enforce that,
// and this file is one of the paths they cover.
import { requireUser } from "@respin/auth";
import { respinDb } from "@respin/db";
import { respinCredits } from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { AccessRefusal } from "../access-refusal";
import { billingErrorDisplay, billingErrorFromCode } from "../billing-errors";
import { UsageView, type UsageLedgerRow } from "./usage-view";
import { portalAvailability } from "./copy";
import { openPortalAction } from "../settings/billing/actions";

/** How many ledger entries the page shows. One more is fetched to detect "more". */
const PAGE_SIZE = 50;

export default async function UsagePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The real gate, per-page (client-nav caches layouts — gate-completeness test).
  // ABOVE the try: `requireUser()` refuses by throwing a `redirect()`.
  const user = await requireUser();
  const search = await props.searchParams;

  // Scoping is a REFUSAL PATH, not an assumption: `withWorkspace` throws
  // `WorkspaceAccessError` for an unknown user and — the M2 case — for a user
  // who belongs to more than one workspace. Its rendered copy has existed since
  // this page shipped and was unreachable, because this call sat outside every
  // try and went to Next's default error page instead (round-2 NOTE).
  let scope: Awaited<ReturnType<typeof respinDb.withWorkspace>>;
  try {
    scope = await respinDb.withWorkspace({ authUserId: user.id });
  } catch (err) {
    rethrowNextControlFlow(err);
    console.error("[usage] workspace scope unavailable", err);
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
    console.error("[usage] balance derivation failed", err);
    const copy = billingErrorDisplay(err);
    balance = { ok: false, title: copy.title, detail: copy.detail };
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
  try {
    const state = await respinCredits.getBillingState(
      scope.workspaceId,
      new Date()
    );
    paused =
      state.state === "paused" ? { resumesAt: state.resumesAt ?? null } : null;
  } catch (err) {
    rethrowNextControlFlow(err);
    // A config read can fail closed (no seeded config). That must not take the
    // balance down with it — the pause notice is simply not shown, and the
    // billing page is where the operator-facing remedy is rendered in full.
    console.error("[usage] billing state unavailable", err);
  }

  const [subscription] = await scope.accessors.subscription();
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
