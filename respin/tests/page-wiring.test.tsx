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
// Scope, stated honestly: this covers `/usage` in depth. The first-login
// concurrency seam executes `/settings/billing` in
// `first-login-pages.test.tsx`; `/admin/config` is still not executed here.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";

const LOT_UUID = "0195aa11-2222-7333-8444-555566667777";

const gate = vi.hoisted(() => ({ requireUser: vi.fn() }));
const scopeState = vi.hoisted(() => ({
  ensureUserWorkspace: vi.fn(),
  withWorkspace: vi.fn(),
  ledger: vi.fn(),
  subscription: vi.fn(),
  getDisplayBalance: vi.fn(),
  getBillingState: vi.fn(),
  usageRunwayFor: vi.fn(),
  selectedProfileForMember: vi.fn(),
  hasGenerationForProfile: vi.fn(),
  brainAssetSummary: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/studio",
}));

vi.mock("@respin/auth", () => ({
  requireUser: gate.requireUser,
  requireAdmin: vi.fn(),
}));

vi.mock("@respin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/db")>()),
  respinDb: {
    ensureUserWorkspace: scopeState.ensureUserWorkspace,
    withWorkspace: scopeState.withWorkspace,
    selectedProfileForMember: scopeState.selectedProfileForMember,
    hasGenerationForProfile: scopeState.hasGenerationForProfile,
    brainAssetSummary: scopeState.brainAssetSummary,
  },
}));

vi.mock("@respin/credits/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/credits/app-server")>()),
  respinCredits: {
    getDisplayBalance: scopeState.getDisplayBalance,
    getBillingState: scopeState.getBillingState,
    usageRunwayFor: scopeState.usageRunwayFor,
  },
}));

const { WorkspaceAccessError } = await import("@respin/db");
const { LedgerIntegrityError } = await import("@respin/credits/app-server");
const { ConfigUnavailableError } = await import("@respin/config/app-server");
const UsagePage = (await import("../app/(product)/usage/page")).default;
const { ProductNav } = await import("../app/(product)/nav");

const NOW = new Date("2026-08-17T00:00:00Z");

type InitialStateWiring = {
  initialStatePropDeclarations: number;
  initialStateDestructures: number;
  generationHooksForwardingInitialState: number;
};

function initialStateWiring(source: string): InitialStateWiring {
  const file = ts.createSourceFile("panel.tsx", source, ts.ScriptTarget.Latest, true);
  let initialStatePropDeclarations = 0;
  let initialStateDestructures = 0;
  let generationHooksForwardingInitialState = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text.endsWith("Panel")) {
      const parameter = node.parameters[0];
      if (parameter && ts.isObjectBindingPattern(parameter.name)) {
        initialStateDestructures += parameter.name.elements.filter(
          (element) => element.name.getText(file) === "initialState"
        ).length;
      }
    }
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text.endsWith("PanelProps") &&
      ts.isTypeLiteralNode(node.type)
    ) {
      initialStatePropDeclarations += node.type.members.filter(
        (member) =>
          ts.isPropertySignature(member) && member.name?.getText(file) === "initialState"
      ).length;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "useActionState" &&
      node.arguments.length >= 2 &&
      ts.isIdentifier(node.arguments[0]) &&
      node.arguments[0].text === "action" &&
      ts.isBinaryExpression(node.arguments[1]) &&
      node.arguments[1].operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      ts.isIdentifier(node.arguments[1].left) &&
      node.arguments[1].left.text === "initialState"
    ) {
      generationHooksForwardingInitialState += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return {
    initialStatePropDeclarations,
    initialStateDestructures,
    generationHooksForwardingInitialState,
  };
}

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
  scopeState.ensureUserWorkspace.mockResolvedValue({
    workspace: { id: "ws_1", name: "Workspace" },
  });
  scopeState.withWorkspace.mockResolvedValue(okScope());
  scopeState.getDisplayBalance.mockResolvedValue({ balance: 1250, asOf: NOW, settling: false });
  scopeState.getBillingState.mockResolvedValue({ tier: "creator", state: "active" });
  scopeState.usageRunwayFor.mockResolvedValue({
    state: "no_spend",
    asOf: NOW,
    windowStart: new Date("2026-07-18T00:00:00Z"),
    trailingWindowDays: 30,
    minimumDebitDays: 3,
    debitDayCount: 0,
    balance: 1250,
    totalDebit: 0,
  });
  scopeState.selectedProfileForMember.mockResolvedValue({ id: "profile_1" });
  scopeState.hasGenerationForProfile.mockResolvedValue(false);
  scopeState.brainAssetSummary.mockResolvedValue({
    brainVersions: 2,
    testedRules: 1,
    loggedResults: 3,
    feedback: 1,
  });
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
    expect(scopeState.ensureUserWorkspace).not.toHaveBeenCalled();
    expect(scopeState.withWorkspace).not.toHaveBeenCalled();
    expect(scopeState.getDisplayBalance).not.toHaveBeenCalled();
    expect(scopeState.ledger).not.toHaveBeenCalled();
  });

  it("happy path: scopes by the SESSION user id and renders the derived balance and history", async () => {
    const out = await renderUsage();
    expect(scopeState.ensureUserWorkspace).toHaveBeenCalledWith({
      authUserId: "u_1",
      name: undefined,
    });
    expect(scopeState.withWorkspace).toHaveBeenCalledWith({ authUserId: "u_1" });
    expect(out).toContain('data-testid="balance-value"');
    expect(out).toContain(">1250<");
    expect(out).toContain('data-testid="ledger"');
    expect(out).toContain("in_zzz1");
    // ...and the ledger read is CLAMPED at the page size + 1 (the "is there
    // more?" probe), never unbounded.
    expect(scopeState.ledger).toHaveBeenCalledWith({ limit: 51 });
    const mintedScope = await scopeState.withWorkspace.mock.results[0].value;
    expect(scopeState.usageRunwayFor).toHaveBeenCalledWith(mintedScope);
    expect(scopeState.selectedProfileForMember).toHaveBeenCalledWith(mintedScope);
    expect(scopeState.brainAssetSummary).toHaveBeenCalledWith(mintedScope, "profile_1");
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
    expect(scopeState.getDisplayBalance).not.toHaveBeenCalled();
    // ...and the package message's identifiers stay in the log, not the page.
    expect(out).not.toContain(LOT_UUID);
  });

  it("a failing balance derivation is CONTAINED: honest copy, no balance element, history still rendered", async () => {
    scopeState.getDisplayBalance.mockRejectedValue(
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

describe("Phase 1 T2: first-session navigation", () => {
  it("retains every first-session route in the v2 navigation, and the journey helper waits for onboarding", () => {
    const nav = renderToStaticMarkup(<ProductNav />);
    const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1]);
    // NOT de-duplicated. The first v2 cut rendered the secondary links and the
    // shell foot twice and hid one copy with a media query; a `new Set(...)`
    // here made that invisible to this suite. Every route must appear EXACTLY
    // once in the served markup, so a second copy fails right here.
    expect([...hrefs(nav)].sort()).toEqual([
      "/brain", "/onboarding", "/results", "/settings/account", "/settings/billing", "/studio", "/trends", "/usage",
    ]);
    const primary = nav.match(/<div class="shell-nav-primary">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(hrefs(primary)).toEqual(["/studio", "/trends", "/brain", "/results"]);
    // The visible LABELS, pinned. The rename of /trends to "References" landed
    // in the same change that deleted the only label assertion, so nothing
    // caught that the destination is still headed "Trends" (phase-1 gate).
    // `/trends` keeps the "References" label by the owner's 2026-09-20
    // decision; the heading and docs/initial/decisions.md were updated to match.
    const labels = [...nav.matchAll(/<span class="nav-label">([^<]+)<\/span>/g)].map((match) => match[1]);
    expect(labels).toEqual([
      "Studio", "References", "Brain", "Results",
      "Onboarding", "Usage", "Billing", "Account",
    ]);

    const authSupport = readFileSync(
      new URL("../e2e/support/auth.ts", import.meta.url),
      "utf8"
    );
    expect(authSupport).toContain('page.waitForURL("**/onboarding"');
  });
});

describe("Phase 1 T7: injected panel state stays test-only", () => {
  it("declares and destructures initialState only on the two panel roots, then forwards it to named generation hooks", () => {
    const appRoot = fileURLToPath(new URL("../app/", import.meta.url));
    const panelFiles = [
      "(product)/studio/studio-panel.tsx",
      "(product)/onboarding/first-ideas/first-ideas-panel.tsx",
    ];
    const allAppFiles: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory)) {
        const file = join(directory, entry);
        if (statSync(file).isDirectory()) walk(file);
        else if (/\.tsx?$/.test(file)) allAppFiles.push(file);
      }
    };
    walk(appRoot);
    const filesWithInitialState = allAppFiles
      .filter((file) => readFileSync(file, "utf8").includes("initialState"))
      .map((file) => relative(appRoot, file).replace(/\\/g, "/"))
      .sort();
    expect(filesWithInitialState).toEqual([...panelFiles].sort());
    for (const file of panelFiles) {
      const source = readFileSync(join(appRoot, file), "utf8");
      expect(initialStateWiring(source), file).toEqual({
        initialStatePropDeclarations: 1,
        initialStateDestructures: 1,
        generationHooksForwardingInitialState: 1,
      });

      const withoutForwarding = source.replace(
        file.includes("studio-panel")
          ? "initialState ?? IDLE_STUDIO_STATE"
          : "initialState ?? IDLE",
        file.includes("studio-panel") ? "IDLE_STUDIO_STATE" : "IDLE"
      );
      expect(initialStateWiring(withoutForwarding), `${file} isolated removal plant`).toEqual({
        initialStatePropDeclarations: 1,
        initialStateDestructures: 1,
        generationHooksForwardingInitialState: 0,
      });

      const withoutDestructure = source.replace("  initialState,\n", "  testState,\n");
      expect(initialStateWiring(withoutDestructure), `${file} isolated destructure plant`).toEqual({
        initialStatePropDeclarations: 1,
        initialStateDestructures: 0,
        generationHooksForwardingInitialState: 1,
      });
    }
  });

  it("keeps native folds out of the complete two-panel render closure", () => {
    const appRoot = fileURLToPath(new URL("../app/", import.meta.url));
    const expectedDetails = new Map([
      ["(product)/studio/studio-panel.tsx", 1],
      ["(product)/studio/feedback-block.tsx", 0],
      ["(product)/studio/generation-outcome.tsx", 0],
      ["(product)/studio/lineage-view.tsx", 0],
      // Launch L2 (R-151): the entrances and the piece confirmation render the
      // concept batch and the script through `GenerationOutcome`, so the L1
      // blocks they carry must never sit inside a fold either.
      ["(product)/studio/entrances.tsx", 0],
      ["(product)/studio/piece-confirmation.tsx", 0],
      ["(product)/studio/studio-view.tsx", 0],
      ["(product)/onboarding/first-ideas/first-ideas-panel.tsx", 1],
      ["(product)/onboarding/first-ideas/first-ideas-result.tsx", 0],
      ["ui/banner.tsx", 0],
      ["(product)/onboarding/submit-button.tsx", 0],
    ]);
    for (const [file, expected] of expectedDetails) {
      const detailsCount = (source: string) => (source.match(/<details/g) ?? []).length;
      const count = detailsCount(readFileSync(join(appRoot, file), "utf8"));
      expect(count, file).toBe(expected);
      expect(detailsCount("<details><summary>plant</summary></details>")).toBe(1);
    }
  });
});
