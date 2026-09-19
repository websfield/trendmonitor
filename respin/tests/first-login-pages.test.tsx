import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = { id: "first_login_user", name: "First Login" };
const NOW = new Date("2026-08-30T00:00:00Z");

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  ensureUserWorkspace: vi.fn(),
  withWorkspace: vi.fn(),
  monthlySpend: vi.fn(),
  burnByMode: vi.fn(),
  getBalance: vi.fn(),
  getBillingState: vi.fn(),
  usageRunwayFor: vi.fn(),
  selectedProfileForMember: vi.fn(),
  brainAssetSummary: vi.fn(),
  hasGenerationForProfile: vi.fn(),
  getActiveConfigServer: vi.fn(),
}));

vi.mock("@respin/auth", () => ({ requireUser: mocks.requireUser }));

vi.mock("@respin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/db")>()),
  respinDb: {
    ensureUserWorkspace: mocks.ensureUserWorkspace,
    withWorkspace: mocks.withWorkspace,
    monthlySpend: mocks.monthlySpend,
    burnByMode: mocks.burnByMode,
    selectedProfileForMember: mocks.selectedProfileForMember,
    brainAssetSummary: mocks.brainAssetSummary,
    hasGenerationForProfile: mocks.hasGenerationForProfile,
  },
}));

vi.mock("@respin/credits/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/credits/app-server")>()),
  isStripeConfigured: () => false,
  respinCredits: {
    getBalance: mocks.getBalance,
    getBillingState: mocks.getBillingState,
    usageRunwayFor: mocks.usageRunwayFor,
  },
}));

vi.mock("@respin/config/app-server", () => {
  class ConfigUnavailableError extends Error {}
  return {
    ConfigUnavailableError,
    getActiveConfigServer: mocks.getActiveConfigServer,
  };
});

const ProductLayout = (await import("../app/(product)/layout")).default;
const UsagePage = (await import("../app/(product)/usage/page")).default;
const BillingSettingsPage = (
  await import("../app/(product)/settings/billing/page")
).default;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function workspaceScope() {
  return {
    workspaceId: "ws_first_login",
    role: "owner" as const,
    accessors: {
      ledger: vi.fn().mockResolvedValue([]),
      subscription: vi.fn().mockResolvedValue([]),
    },
  };
}

/**
 * Hold the layout's bootstrap open while the page renders underneath it. A
 * bare page-level scope read sees no workspace; scopeForUser performs the
 * second idempotent bootstrap and then scopes the newly-created workspace.
 */
async function renderPageWhileLayoutBootstrapIsPending(
  renderPage: () => Promise<string>
): Promise<string> {
  let workspaceExists = false;
  let ensureCalls = 0;
  const layoutBootstrapStarted = deferred();
  const releaseLayoutBootstrap = deferred();

  mocks.ensureUserWorkspace.mockImplementation(async () => {
    ensureCalls += 1;
    if (ensureCalls === 1) {
      layoutBootstrapStarted.resolve();
      await releaseLayoutBootstrap.promise;
    }
    // The commit completes asynchronously. If scopeForUser ever stops awaiting
    // the bootstrap, its following withWorkspace call observes false and this
    // witness returns the access refusal again.
    await Promise.resolve();
    workspaceExists = true;
    return {
      workspace: { id: "ws_first_login", name: "First Login workspace" },
    };
  });
  mocks.withWorkspace.mockImplementation(async () => {
    if (!workspaceExists) {
      throw new Error("workspace bootstrap has not committed");
    }
    return workspaceScope();
  });

  const layoutPromise = ProductLayout({ children: <p>Page child</p> });
  await layoutBootstrapStarted.promise;
  let html = "";
  try {
    html = await renderPage();
  } finally {
    releaseLayoutBootstrap.resolve();
    await layoutPromise;
  }

  expect(
    mocks.ensureUserWorkspace,
    "the page must bootstrap for itself instead of borrowing the concurrent layout's pending work"
  ).toHaveBeenCalledTimes(2);
  expect(mocks.ensureUserWorkspace).toHaveBeenNthCalledWith(1, {
    authUserId: USER.id,
    name: USER.name,
  });
  expect(mocks.ensureUserWorkspace).toHaveBeenNthCalledWith(2, {
    authUserId: USER.id,
    name: USER.name,
  });
  expect(mocks.withWorkspace).toHaveBeenCalledTimes(2);
  expect(mocks.withWorkspace).toHaveBeenNthCalledWith(1, {
    authUserId: USER.id,
  });
  expect(mocks.withWorkspace).toHaveBeenNthCalledWith(2, {
    authUserId: USER.id,
  });
  return html;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(USER);
  mocks.monthlySpend.mockResolvedValue({
    hasAnyDebit: false,
    totalDebit: 0,
  });
  mocks.getBalance.mockResolvedValue({ balance: 0, asOf: NOW });
  mocks.getBillingState.mockResolvedValue({ tier: "free", state: "free" });
  mocks.usageRunwayFor.mockResolvedValue({
    state: "no_spend",
    asOf: NOW,
    windowStart: new Date("2026-07-31T00:00:00Z"),
    trailingWindowDays: 30,
    minimumDebitDays: 3,
    debitDayCount: 0,
    balance: 0,
    totalDebit: 0,
  });
  mocks.burnByMode.mockResolvedValue({
    byMode: [],
    notAGeneration: { credits: 0, debits: 0 },
    nonTerminalClaim: { credits: 0, debits: 0 },
  });
  mocks.selectedProfileForMember.mockResolvedValue({ id: "profile_first_login" });
  mocks.brainAssetSummary.mockResolvedValue({
    brainVersions: 0,
    testedRules: 0,
    loggedResults: 0,
    feedback: 0,
  });
  mocks.hasGenerationForProfile.mockResolvedValue(false);
  mocks.getActiveConfigServer.mockResolvedValue({
    version: 1,
    content: {
      stripePriceMap: {},
      allowances: { creator: 250, pro: 2_000, studio: 8_000 },
      pack: { credits: 1_000, priceUsd: 10 },
      pauseMonths: 3,
    },
  });
});

describe("brand-new direct page loads while the product layout bootstraps", () => {
  it("renders /usage from the new workspace instead of a transient access refusal", async () => {
    const html = await renderPageWhileLayoutBootstrapIsPending(async () => {
      const page = await UsagePage({ searchParams: Promise.resolve({}) });
      return renderToStaticMarkup(page);
    });

    expect(html).toContain('data-testid="balance-value"');
    expect(html).not.toContain('data-testid="workspace-access-error"');
    const [mintedScope] = mocks.usageRunwayFor.mock.calls[0];
    expect(mintedScope.workspaceId).toBe("ws_first_login");
    expect(mocks.selectedProfileForMember).toHaveBeenCalledWith(mintedScope);
    expect(mocks.brainAssetSummary).toHaveBeenCalledWith(mintedScope, "profile_first_login");
  });

  it("renders /settings/billing from the new workspace instead of a transient access refusal", async () => {
    const html = await renderPageWhileLayoutBootstrapIsPending(async () => {
      const page = await BillingSettingsPage({
        searchParams: Promise.resolve({}),
      });
      return renderToStaticMarkup(page);
    });

    expect(html).toContain('data-testid="current-plan"');
    expect(html).not.toContain('data-testid="workspace-access-error"');
  });
});

describe("the two first-login pages use the bootstrap-then-scope authority", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const surfaces = [
    {
      path: "app/(product)/usage/page.tsx",
      importPath: "../workspace-scope",
    },
    {
      path: "app/(product)/settings/billing/page.tsx",
      importPath: "../../workspace-scope",
    },
    {
      path: "app/(product)/settings/account/page.tsx",
      importPath: "../../workspace-scope",
    },
  ];

  it.each(surfaces)("$path routes scope derivation through scopeForUser", ({
    path,
    importPath,
  }) => {
    const source = readFileSync(resolve(root, path), "utf8");
    expect(source).toContain(
      'import { scopeForUser } from "' + importPath + '";'
    );
    expect(source).toContain("scope = await scopeForUser(user);");
    expect(source).not.toMatch(/await\s+respinDb\.withWorkspace\s*\(/);
  });

  it("NON-VACUITY: the direct-scope scan catches the bypass it forbids", () => {
    expect(
      "scope = await respinDb.withWorkspace({ authUserId: user.id });"
    ).toMatch(/await\s+respinDb\.withWorkspace\s*\(/);
    expect("scope = await scopeForUser(user);").not.toMatch(
      /await\s+respinDb\.withWorkspace\s*\(/
    );
  });
});
