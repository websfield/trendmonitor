// /admin/model-spend, EXECUTED — for the one decision that lives in the page
// and nowhere else: WHICH EXEMPTION IT HANDS TO `reconcileSpend` (R-82/R-85).
//
// WHY THIS FILE EXISTS (billing gate round 2, 2026-09-02, findings 1 and 5).
// `reconcileSpend`'s exemption argument is REQUIRED with no default, which
// makes OMITTING it a compile error — and nothing more. A WRONG answer is not
// a type error, and this page is the only production call site. R-81 passed a
// frozen constant here, so the report exempted every `onboarding_brain` claim
// holder no matter what the operator had priced the included build at.
//
// AND R-82's FIX WAS ONE DOCUMENT SHORT (billing gate, 2026-09-02). The page
// then read the ACTIVE document and handed over ONE list, which made today's
// prices judge every historical attempt: a price cut hid every lost debit
// incurred while the included build was charged. The argument is now a
// RESOLVER — `reconcileSpend` asks which `config_version`s its own rows carry
// and this page answers per version, from the documents those attempts were
// priced under. So the cases below assert the MAP the page produces rather
// than a list, with a mock that plays the query's half of the seam.
//
// A Next async server component is just an async function returning JSX
// (`tests/page-wiring.test.tsx`'s premise), so it can be awaited. The three
// package surfaces this page reaches are mocked at the module boundary, and
// only three things are asserted: the gate ran, the ANSWER, and what happens
// when a document cannot be read. Presentation stays where it is proved
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
  configVersionContentsServer: vi.fn(),
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
  configVersionContentsServer: state.configVersionContentsServer,
}));

const Page = (await import("../app/(admin)/admin/model-spend/page")).default;

const seed: RespinConfigV1 = respinConfigV1.parse(CONFIG_V1_SEED);

const EMPTY_RESULT = {
  rows: [],
  counts: { reconciled: 0, orphaned: 0, drift: 0 },
  unbilledAttempts: [],
};

/** A STORED document, with the included build priced at `credits`. */
const documentWithIncludedBuildAt = (credits: number): RespinConfigV1 => ({
  ...seed,
  creditCosts: { ...seed.creditCosts, onboardingBrainBuild: credits },
});

type Resolver = (
  versions: readonly number[]
) => Promise<ReadonlyMap<number, readonly string[]>>;

/**
 * THE MOCK PLAYS `reconcileSpend`'s HALF OF THE SEAM (R-85).
 *
 * The page hands over a RESOLVER now rather than a list, so a mock that only
 * recorded its argument would prove nothing: the argument is a closure. This
 * one does what the real query does — asks about the `config_version`s its own
 * rows carry — and the cases below assert the MAP that comes back.
 */
const askingAbout = (versions: readonly number[]) => {
  let answered: ReadonlyMap<number, readonly string[]> | undefined;
  state.reconcileSpend.mockImplementation(async (resolve: Resolver) => {
    answered = await resolve(versions);
    return EMPTY_RESULT;
  });
  return () => answered;
};

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireAdmin.mockResolvedValue({ id: "admin_1" });
  state.reconcileSpend.mockResolvedValue(EMPTY_RESULT);
  state.configVersionContentsServer.mockImplementation(
    async (versions: readonly number[]) =>
      new Map(versions.map((v) => [v, documentWithIncludedBuildAt(0)]))
  );
});

describe("/admin/model-spend: the argument it passes to reconcileSpend (R-82)", () => {
  it("calls the gate ABOVE everything — a refused admin reconciles nothing", async () => {
    gate.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(Page()).rejects.toThrow("NEXT_REDIRECT");
    expect(state.configVersionContentsServer).not.toHaveBeenCalled();
    expect(state.reconcileSpend).not.toHaveBeenCalled();
  });

  it("with the seeded price, it exempts the onboarding claim holder — and NOTHING else", async () => {
    const answer = askingAbout([3]);
    renderToStaticMarkup(await Page());
    expect(state.reconcileSpend).toHaveBeenCalledTimes(1);
    expect(
      answer()?.get(3),
      "a generation is never free — exempting its claim holder hides one lost debit per profile (R-81)"
    ).toEqual(["onboarding_brain"]);
  });

  it("R-85: it answers PER VERSION, out of the document each one stored", async () => {
    // THE FINDING (billing gate, 2026-09-02). This page read the ACTIVE
    // document and handed ONE list to a query with no `config_version` term,
    // so today's prices judged every historical attempt: cutting the included
    // build from 25 back to 0 exempted — and therefore HID — every lost debit
    // incurred while it was charged. Two versions are asked about here and the
    // two documents disagree, which one active read cannot express at all.
    state.configVersionContentsServer.mockImplementation(
      async (versions: readonly number[]) =>
        new Map(
          versions.map((v) => [v, documentWithIncludedBuildAt(v === 4 ? 25 : 0)])
        )
    );
    const answer = askingAbout([4, 5]);
    renderToStaticMarkup(await Page());
    expect(
      state.configVersionContentsServer,
      "the page asked about versions the reconciliation never named"
    ).toHaveBeenCalledWith([4, 5]);
    expect(
      answer()?.get(4),
      "version 4 charged the claim holder, so nothing priced under it is exempt"
    ).toEqual([]);
    expect(answer()?.get(5)).toEqual(["onboarding_brain"]);
  });

  it("THE FINDING: an operator who prices the included build at 25 gets an EMPTY exemption list", async () => {
    // The regression test for the frozen constant. R-81's
    // `INCLUDED_BUILD_PURPOSES` is `["onboarding_brain"]` whatever the stored
    // document says, so a page importing it passes that here and the claim
    // holder — who now owes a debit — stays invisible to the unbilled report.
    // Nothing in this case edits a source file: it is one config document.
    state.configVersionContentsServer.mockImplementation(
      async (versions: readonly number[]) =>
        new Map(versions.map((v) => [v, documentWithIncludedBuildAt(25)]))
    );
    const answer = askingAbout([7]);
    renderToStaticMarkup(await Page());
    expect(
      answer()?.get(7),
      "the included build is priced, so its claim holder owes a debit like every other attempt"
    ).toEqual([]);
  });

  it("the config read is the AUTHORITY, not a hint: it happens INSIDE the reconciliation, driven by ITS versions", async () => {
    // Ordering, so the answer cannot come from anywhere but the documents this
    // report's own rows were priced under. R-82 read config BEFORE the query;
    // R-85 reverses that deliberately — the query is what knows which versions
    // exist, so the read is a consequence of it rather than a guess ahead of it.
    const order: string[] = [];
    state.configVersionContentsServer.mockImplementation(
      async (versions: readonly number[]) => {
        order.push("config");
        return new Map(versions.map((v) => [v, documentWithIncludedBuildAt(0)]));
      }
    );
    state.reconcileSpend.mockImplementation(async (resolve: Resolver) => {
      order.push("reconcile");
      await resolve([1]);
      order.push("resolved");
      return EMPTY_RESULT;
    });
    renderToStaticMarkup(await Page());
    expect(order).toEqual(["reconcile", "config", "resolved"]);
  });

  it("a config that cannot be READ produces no report — never a default exemption", async () => {
    // FAIL CLOSED. The alternative shape — catch the config failure, fall back
    // to a built-in list, render a report — is the frozen constant again, with
    // an extra step.
    state.configVersionContentsServer.mockRejectedValue(new Error("no config"));
    state.reconcileSpend.mockImplementation(async (resolve: Resolver) => {
      await resolve([1]);
      return EMPTY_RESULT;
    });
    const out = renderToStaticMarkup(await Page());
    expect(out).toContain('data-testid="model-spend-error"');
    expect(out).not.toContain('data-testid="model-spend-table"');
  });
});
