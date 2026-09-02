// /admin/model-spend, EXECUTED — for the one decision that lives in the page
// and nowhere else: WHICH LIST IT HANDS TO `reconcileSpend` (R-82).
//
// WHY THIS FILE EXISTS (billing gate round 2, 2026-09-02, findings 1 and 5).
// `reconcileSpend(includedBuildPurposes)` is a REQUIRED parameter with no
// default, which makes OMITTING it a compile error — and nothing more.
// `readonly string[]` means a WRONG list is not a type error, and this page is
// the only production call site. R-81 passed a frozen constant here, so the
// report exempted every `onboarding_brain` claim holder no matter what the
// operator had priced the included build at; the page now derives the list
// from the ACTIVE config document, and that derivation is worth exactly as
// much as the argument the page actually passes.
//
// A Next async server component is just an async function returning JSX
// (`tests/page-wiring.test.tsx`'s premise), so it can be awaited. The three
// package surfaces this page reaches are mocked at the module boundary, and
// only three things are asserted: the gate ran, the ARGUMENT, and what happens
// when the config cannot be read. Presentation stays where it is proved
// already, against the view, in `tests/model-spend-ui.test.tsx`.
//
// `@respin/credits/app-server` IS NOT MOCKED, deliberately: `includedBuildPurposes`
// is the real derivation, so these cases fail if it stops reading the document.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_V1_SEED } from "@respin/db";
import { respinConfigV1, type RespinConfigV1 } from "@respin/config";

const gate = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const state = vi.hoisted(() => ({
  reconcileSpend: vi.fn(),
  getActiveConfigServer: vi.fn(),
}));

vi.mock("@respin/auth", () => ({
  requireAdmin: gate.requireAdmin,
  requireUser: vi.fn(),
}));

vi.mock("@respin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/db")>()),
  respinDb: { reconcileSpend: state.reconcileSpend },
}));

vi.mock("@respin/config/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/config/app-server")>()),
  getActiveConfigServer: state.getActiveConfigServer,
}));

const Page = (await import("../app/(admin)/admin/model-spend/page")).default;

const seed: RespinConfigV1 = respinConfigV1.parse(CONFIG_V1_SEED);

const EMPTY_RESULT = {
  rows: [],
  counts: { reconciled: 0, orphaned: 0, drift: 0 },
  unbilledAttempts: [],
};

/** The active document, with the included build priced at `credits`. */
const activeWithIncludedBuildAt = (credits: number) => ({
  version: 7,
  content: {
    ...seed,
    creditCosts: { ...seed.creditCosts, onboardingBrainBuild: credits },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireAdmin.mockResolvedValue({ id: "admin_1" });
  state.reconcileSpend.mockResolvedValue(EMPTY_RESULT);
  state.getActiveConfigServer.mockResolvedValue(activeWithIncludedBuildAt(0));
});

describe("/admin/model-spend: the argument it passes to reconcileSpend (R-82)", () => {
  it("calls the gate ABOVE everything — a refused admin reconciles nothing", async () => {
    gate.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(Page()).rejects.toThrow("NEXT_REDIRECT");
    expect(state.getActiveConfigServer).not.toHaveBeenCalled();
    expect(state.reconcileSpend).not.toHaveBeenCalled();
  });

  it("with the seeded price, it exempts the onboarding claim holder — and NOTHING else", async () => {
    renderToStaticMarkup(await Page());
    expect(state.reconcileSpend).toHaveBeenCalledTimes(1);
    expect(
      state.reconcileSpend.mock.calls[0][0],
      "a generation is never free — exempting its claim holder hides one lost debit per profile (R-81)"
    ).toEqual(["onboarding_brain"]);
  });

  it("THE FINDING: an operator who prices the included build at 25 gets an EMPTY exemption list", async () => {
    // The regression test for the frozen constant. R-81's
    // `INCLUDED_BUILD_PURPOSES` is `["onboarding_brain"]` whatever the stored
    // document says, so a page importing it passes that here and the claim
    // holder — who now owes a debit — stays invisible to the unbilled report.
    // Nothing in this case edits a source file: it is one config document.
    state.getActiveConfigServer.mockResolvedValue(activeWithIncludedBuildAt(25));
    renderToStaticMarkup(await Page());
    expect(
      state.reconcileSpend.mock.calls[0][0],
      "the included build is priced, so its claim holder owes a debit like every other attempt"
    ).toEqual([]);
  });

  it("the config read is the AUTHORITY, not a hint: it happens BEFORE the reconciliation", async () => {
    // Ordering, so the argument cannot come from anywhere but the document
    // this report is about.
    const order: string[] = [];
    state.getActiveConfigServer.mockImplementation(async () => {
      order.push("config");
      return activeWithIncludedBuildAt(0);
    });
    state.reconcileSpend.mockImplementation(async () => {
      order.push("reconcile");
      return EMPTY_RESULT;
    });
    renderToStaticMarkup(await Page());
    expect(order).toEqual(["config", "reconcile"]);
  });

  it("a config that cannot be READ produces no report — never a default exemption", async () => {
    // FAIL CLOSED. The alternative shape — catch the config failure, fall back
    // to a built-in list, render a report — is the frozen constant again, with
    // an extra step.
    state.getActiveConfigServer.mockRejectedValue(new Error("no config"));
    const out = renderToStaticMarkup(await Page());
    expect(state.reconcileSpend).not.toHaveBeenCalled();
    expect(out).toContain('data-testid="model-spend-error"');
    expect(out).not.toContain('data-testid="model-spend-table"');
  });
});
