// THE PAGE COMPONENTS, EXECUTED (round-3 NOTE; phase-4 least-confident (a)).
//
// Three rounds of this milestone disclosed the same gap: "the tests drive the
// VIEWS, not the PAGES", so the gate call, the scope call, the try/catch
// wiring and the `searchParams` shape were proven by typecheck and by reading.
// The response each round was to move ANOTHER decision out of `page.tsx` into
// a pure module — which shrinks the untested surface without ever testing it,
// and is how the round-2 `portalAvailability` role hole and the round-2
// `AccessRefusal`-unreachable hole both got there in the first place.
//
// A Next async server component is just an async function returning JSX, so it
// can be awaited and handed to `renderToStaticMarkup`. The four package
// surfaces the page reaches are mocked at the module boundary — but through
// `importOriginal`, so every ERROR CLASS in the tree is the real one. That
// matters: the `WorkspaceAccessError` branch below is a real instance flowing
// through the real `billingErrorDisplay`, not a shape a mock agreed to.
//
// Scope, stated honestly: this covers `/usage`. `/settings/billing` and
// `/admin/config` are still executed by no test — see the round-3 report.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";

const LOT_UUID = "0195aa11-2222-7333-8444-555566667777";

const gate = vi.hoisted(() => ({ requireUser: vi.fn() }));
const scopeState = vi.hoisted(() => ({
  withWorkspace: vi.fn(),
  ledger: vi.fn(),
  subscription: vi.fn(),
  getBalance: vi.fn(),
  getBillingState: vi.fn(),
}));

vi.mock("@respin/auth", () => ({
  requireUser: gate.requireUser,
  requireAdmin: vi.fn(),
}));

vi.mock("@respin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/db")>()),
  respinDb: { withWorkspace: scopeState.withWorkspace },
}));

vi.mock("@respin/credits/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/credits/app-server")>()),
  respinCredits: {
    getBalance: scopeState.getBalance,
    getBillingState: scopeState.getBillingState,
  },
}));

const { WorkspaceAccessError } = await import("@respin/db");
const { LedgerIntegrityError } = await import("@respin/credits/app-server");
const { ConfigUnavailableError } = await import("@respin/config/app-server");
const UsagePage = (await import("../app/(product)/usage/page")).default;

const NOW = new Date("2026-08-17T00:00:00Z");

function okScope(role: "owner" | "editor" = "owner") {
  return {
    workspaceId: "ws_1",
    role,
    accessors: { ledger: scopeState.ledger, subscription: scopeState.subscription },
  };
}

async function renderUsage(
  search: Record<string, string | string[] | undefined> = {}
): Promise<string> {
  const el = await UsagePage({ searchParams: Promise.resolve(search) });
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireUser.mockResolvedValue({ id: "u_1" });
  scopeState.withWorkspace.mockResolvedValue(okScope());
  scopeState.getBalance.mockResolvedValue({ balance: 1250, asOf: NOW });
  scopeState.getBillingState.mockResolvedValue({ tier: "creator", state: "active" });
  scopeState.ledger.mockResolvedValue([
    {
      id: "row_1",
      createdAt: NOW,
      kind: "grant",
      delta: 250,
      expiresAt: NOW,
      refId: "in_zzz1",
    },
  ]);
  scopeState.subscription.mockResolvedValue([{ id: "sub_row" }]);
});

describe("/usage page component: the wiring no test executed (round-3 NOTE)", () => {
  it("calls the gate ABOVE everything, and its redirect propagates — no scope, no read", async () => {
    gate.requireUser.mockImplementation(async () => {
      redirect("/sign-in");
      throw new Error("unreachable");
    });
    let caught: (Error & { digest?: string }) | undefined;
    try {
      await renderUsage();
    } catch (err) {
      caught = err as Error & { digest?: string };
    }
    expect(caught?.digest).toMatch(/^NEXT_REDIRECT;/);
    expect(caught?.digest).toContain("/sign-in");
    // The gate is a gate, not a formality: nothing was scoped or read.
    expect(scopeState.withWorkspace).not.toHaveBeenCalled();
    expect(scopeState.getBalance).not.toHaveBeenCalled();
    expect(scopeState.ledger).not.toHaveBeenCalled();
  });

  it("happy path: scopes by the SESSION user id and renders the derived balance and history", async () => {
    const out = await renderUsage();
    expect(scopeState.withWorkspace).toHaveBeenCalledWith({ authUserId: "u_1" });
    expect(out).toContain('data-testid="balance-value"');
    expect(out).toContain(">1250<");
    expect(out).toContain('data-testid="ledger"');
    expect(out).toContain("in_zzz1");
    // ...and the ledger read is CLAMPED at the page size + 1 (the "is there
    // more?" probe), never unbounded.
    expect(scopeState.ledger).toHaveBeenCalledWith({ limit: 51 });
  });

  it("WorkspaceAccessError from withWorkspace renders AccessRefusal — the branch round 2 could not reach", async () => {
    scopeState.withWorkspace.mockRejectedValue(
      new WorkspaceAccessError(
        `user u_1 belongs to 2 workspaces; pass workspaceId (${LOT_UUID})`
      )
    );
    const out = await renderUsage();
    expect(out).toContain('data-testid="workspace-access-error"');
    // The page must not have gone on to read anything.
    expect(scopeState.getBalance).not.toHaveBeenCalled();
    // ...and the package message's identifiers stay in the log, not the page.
    expect(out).not.toContain(LOT_UUID);
  });

  it("a failing balance derivation is CONTAINED: honest copy, no balance element, history still rendered", async () => {
    scopeState.getBalance.mockRejectedValue(
      new LedgerIntegrityError(`row ${LOT_UUID} over-consumes`)
    );
    const out = await renderUsage();
    expect(out).toContain('data-testid="balance-error"');
    expect(out).not.toContain('data-testid="balance-value"');
    expect(out).not.toContain(LOT_UUID);
    // The rest of the page is not taken down with it.
    expect(out).toContain('data-testid="ledger"');
    expect(out).toContain("in_zzz1");
  });

  it("a failing billing-state read does NOT take the balance down (fail-closed config, round-2 wiring)", async () => {
    scopeState.getBillingState.mockRejectedValue(
      new ConfigUnavailableError("no active config row")
    );
    const out = await renderUsage();
    expect(out).toContain('data-testid="balance-value"');
    expect(out).not.toContain('data-testid="paused-notice"');
  });

  it("a PAUSED workspace gets the frozen notice, with the resume date the state carries", async () => {
    scopeState.getBillingState.mockResolvedValue({
      tier: "creator",
      state: "paused",
      resumesAt: new Date("2026-10-01T00:00:00Z"),
    });
    const out = await renderUsage();
    expect(out).toContain('data-testid="paused-notice"');
    expect(out).toContain("2026-10-01");
  });

  it("REQ-A02 at the CALL SITE: a non-owner gets no portal control, even with a Stripe customer", async () => {
    scopeState.withWorkspace.mockResolvedValue(okScope("editor"));
    const out = await renderUsage();
    expect(out).toContain('data-testid="portal-unavailable"');
  });

  it("searchParams: a refused action's `?e=` code is rendered, and an unknown one is not echoed", async () => {
    const known = await renderUsage({ e: "workspace_access" });
    expect(known).toContain('data-testid="usage-action-error"');
    const hostile = await renderUsage({ e: "<script>alert(1)</script>" });
    expect(hostile).toContain('data-testid="usage-action-error"');
    expect(hostile).not.toContain("alert(1)");
    // An ARRAY (?e=a&e=b) is the other shape a URL produces — it must not throw.
    const arrayShape = await renderUsage({ e: ["a", "b"] });
    expect(arrayShape).toContain('data-testid="balance-value"');
  });
});
