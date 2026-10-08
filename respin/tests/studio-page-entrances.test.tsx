// `/studio`'s ENTRANCE READS, through the real page component (launch L2 code
// gate: billing B-2 / compliance A-3, and billing B-5).
//
//  - The standalone reference entrance reads `pastedReferenceInPlan` (the tier
//    against the pasted-reference tier list) and NEVER `pastedReferenceQuote`,
//    whose balance read takes the workspace money lock. That the facade method
//    itself takes no lock is proven in
//    `packages/credits/tests/pasted-reference-availability.test.ts`; this
//    file proves the page asks it and not the quote.
//  - Three states: in the plan (offered), not in the plan (the plan block), and
//    a FAILED read (neutral copy and the trends link — never the plan block,
//    which would state a plan fact nobody read).
//  - "Find concepts" states the configured price of the mode it runs, from the
//    same server-resolved offers the panel prices (never a literal).
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_V1_SEED } from "@respin/db";

const state = vi.hoisted(() => ({
  requireUser: vi.fn(),
  scopeForUser: vi.fn(),
  selectedProfileForMember: vi.fn(),
  readBrainHistory: vi.fn(),
  getBillingState: vi.fn(),
  hasOpenPause: vi.fn(),
  getDisplayBalance: vi.fn(),
  creativePieceView: vi.fn(),
  conceptContextReady: vi.fn(),
  pastedReferenceInPlan: vi.fn(),
  pastedReferenceQuote: vi.fn(),
  getActiveConfigServer: vi.fn(),
  heldDrafts: vi.fn(),
  countResults: vi.fn(),
}));

vi.mock("@respin/auth", () => ({ requireUser: state.requireUser }));
vi.mock("../app/(product)/workspace-scope", () => ({ scopeForUser: state.scopeForUser }));
vi.mock("../app/(product)/studio/actions", () => ({
  cancelPieceAction: vi.fn(),
  commissionPieceAction: vi.fn(),
  findConceptAction: vi.fn(),
  generateAction: vi.fn(),
  newGenerationAction: vi.fn(),
  recordFeedbackAction: vi.fn(),
  rememberForFutureDraftsAction: vi.fn(),
  // Audit P6-A1 (R-174): "Leave this out of future drafts".
  excludeFeedbackFromHistoryAction: vi.fn(),
  resumeHeldDraftAction: vi.fn(),
  selectConceptAction: vi.fn(),
  startOwnIdeaAction: vi.fn(),
}));
vi.mock("@respin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/db")>()),
  respinDb: {
    selectedProfileForMember: state.selectedProfileForMember,
    readBrainHistory: state.readBrainHistory,
    countResults: state.countResults,
  },
}));
vi.mock("@respin/config/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/config/app-server")>()),
  getActiveConfigServer: state.getActiveConfigServer,
}));
// WITH the original spread: `billing-errors.ts` `instanceof`s the facade's
// error classes at module load.
vi.mock("@respin/credits/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/credits/app-server")>()),
  respinCredits: {
    getBillingState: state.getBillingState,
    hasOpenPause: state.hasOpenPause,
    getDisplayBalance: state.getDisplayBalance,
    creativePieceView: state.creativePieceView,
    conceptContextReady: state.conceptContextReady,
    pastedReferenceInPlan: state.pastedReferenceInPlan,
    pastedReferenceQuote: state.pastedReferenceQuote,
    heldDrafts: state.heldDrafts,
  },
}));

const StudioPage = (await import("../app/(product)/studio/page")).default;
const { REFERENCE_ENTRANCE_BLOCKED, REFERENCE_ENTRANCE_UNKNOWN } = await import(
  "../app/(product)/studio/run-copy"
);

const render = async () =>
  renderToStaticMarkup(await StudioPage({ searchParams: Promise.resolve({}) }))
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

/** The reference entrance's own section. */
const referenceSection = (html: string): string => {
  const start = html.indexOf('data-testid="studio-entrance-reference"');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
};

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset();
  state.requireUser.mockResolvedValue({ id: "user_1", name: "U" });
  state.scopeForUser.mockResolvedValue({ workspaceId: "ws_1", role: "owner" });
  state.selectedProfileForMember.mockResolvedValue({ id: "profile_1", displayName: "Anna" });
  state.readBrainHistory.mockResolvedValue([{ status: "active" }]);
  state.getBillingState.mockResolvedValue({ tier: "free", state: "free" });
  state.hasOpenPause.mockResolvedValue(false);
  state.getDisplayBalance.mockResolvedValue({ balance: 30, settling: false });
  state.conceptContextReady.mockResolvedValue(true);
  state.countResults.mockResolvedValue(0);
  state.getActiveConfigServer.mockResolvedValue({ version: 1, content: CONFIG_V1_SEED });
  state.pastedReferenceQuote.mockRejectedValue(
    new Error("the page must not call the lock-taking quote")
  );
});

// AUDIT P6-R6 (register item 8): THE PAGE READS THE CREATOR'S OWN SCOPED
// COUNT AND THE SENTENCE FOLLOWS IT. The panel's branches are driven in
// `studio-ui.test.tsx`; this proves the page asks the scoped facade for THIS
// profile and threads the answer, and that a failed read never reads as zero.
describe("/studio's results sentence follows the scoped count (P6-R6)", () => {
  const basis = (html: string): string => {
    const start = html.indexOf('data-testid="studio-no-results-basis"');
    expect(start, "the sentence is not rendered").toBeGreaterThan(-1);
    return html.slice(start, html.indexOf("</p>", start));
  };

  it("asks `respinDb.countResults` for this scope and profile, and renders the count it returns", async () => {
    state.countResults.mockResolvedValue(4);
    const html = await render();
    expect(state.countResults).toHaveBeenCalledWith({ workspaceId: "ws_1", role: "owner" }, "profile_1");
    expect(basis(html)).toContain("You have logged 4 results.");
    expect(basis(html)).not.toMatch(/No results of yours have been logged/);
  });

  it("zero renders the none-logged branch; a FAILED read says so and never reads as zero", async () => {
    state.countResults.mockResolvedValue(0);
    expect(basis(await render())).toMatch(/No results of yours have been logged/);
    state.countResults.mockRejectedValue(new Error("the count could not be read"));
    const failed = basis(await render());
    expect(failed).toMatch(/could not read how many results/);
    expect(failed).not.toMatch(/No results of yours have been logged/);
  });
});

describe("/studio's reference entrance", () => {
  it("reads the plan WITHOUT the lock-taking quote, and offers the link when it is in the plan", async () => {
    state.pastedReferenceInPlan.mockResolvedValue(true);
    const section = referenceSection(await render());
    expect(state.pastedReferenceInPlan).toHaveBeenCalledTimes(1);
    expect(state.pastedReferenceQuote).not.toHaveBeenCalled();
    expect(section).toContain('href="/trends"');
    expect(section).not.toContain("studio-entrance-reference-blocked");
    expect(section).not.toContain("studio-entrance-reference-unknown");
  });

  it("not in the plan: the plan block, and no link", async () => {
    state.pastedReferenceInPlan.mockResolvedValue(false);
    const section = referenceSection(await render());
    expect(state.pastedReferenceQuote).not.toHaveBeenCalled();
    expect(section).toContain('data-testid="studio-entrance-reference-blocked"');
    expect(section).toContain(REFERENCE_ENTRANCE_BLOCKED);
    expect(section).not.toContain('href="/trends"');
  });

  it("a THROWN read is the neutral state with the trends link — never the plan block", async () => {
    state.pastedReferenceInPlan.mockRejectedValue(new Error("db down"));
    const section = referenceSection(await render());
    expect(state.pastedReferenceQuote).not.toHaveBeenCalled();
    expect(section).toContain('data-testid="studio-entrance-reference-unknown"');
    expect(section).toContain(REFERENCE_ENTRANCE_UNKNOWN);
    expect(section).toContain('href="/trends"');
    expect(section).not.toContain(REFERENCE_ENTRANCE_BLOCKED);
    expect(section).not.toContain("studio-entrance-reference-blocked");
  });
});

describe("/studio's Find concepts price", () => {
  it("states the CONFIGURED ideation price beside the press, from the active document", async () => {
    state.pastedReferenceInPlan.mockResolvedValue(false);
    const html = await render();
    const price: number = CONFIG_V1_SEED.creditCosts.ideationBatch;
    expect(html).toContain(
      `Finding concepts costs ${price} ${price === 1 ? "credit" : "credits"} — the configured price.`
    );
    // ...and the press is described by it.
    expect(html).toMatch(/<p[^>]*id="studio-find-cost"/);
    expect(html).toMatch(/aria-describedby="studio-find-cost"/);
  });

  it("follows the configured number, never a literal: a different config prices it differently", async () => {
    state.pastedReferenceInPlan.mockResolvedValue(false);
    const price = CONFIG_V1_SEED.creditCosts.ideationBatch + 7;
    state.getActiveConfigServer.mockResolvedValue({
      version: 2,
      content: { ...CONFIG_V1_SEED, creditCosts: { ...CONFIG_V1_SEED.creditCosts, ideationBatch: price } },
    });
    expect(await render()).toContain(`Finding concepts costs ${price} credits — the configured price.`);
  });

  it("an unreadable config states that the price could not be read, never a number", async () => {
    state.pastedReferenceInPlan.mockResolvedValue(false);
    state.getActiveConfigServer.mockRejectedValue(new Error("config down"));
    const html = await render();
    expect(html).toContain("The price of finding concepts could not be read just now");
    expect(html).not.toMatch(/Finding concepts costs \d/);
  });
});

describe("/studio's held drafts and input limit (audit P3-A4, P3-R2)", () => {
  it("lists each held draft with the UTC time it is removed and a Finish control that posts ONLY its attempt id", async () => {
    state.pastedReferenceInPlan.mockResolvedValue(false);
    state.heldDrafts.mockResolvedValue([
      { attemptId: "att-held-1", mode: "hooks", heldUntil: new Date("2026-10-06T14:03:00.000Z") },
    ]);
    const html = await render();
    expect(state.heldDrafts).toHaveBeenCalledWith({ workspaceId: "ws_1", role: "owner" }, "profile_1");
    const start = html.indexOf('data-testid="studio-held-drafts"');
    expect(start).toBeGreaterThan(-1);
    const section = html.slice(start, html.indexOf("</ul>", start));
    expect(section).toContain("Held drafts");
    expect(section).toContain("held until 2026-10-06 14:03 UTC");
    expect(section).toContain("Finish this draft");
    expect(section).toContain('name="heldAttemptId" value="att-held-1"');
    // It posts the id and nothing a generate press would send.
    expect(section).not.toMatch(/name="(input|mode|platform)"/);
  });

  it("no held draft renders no section; a FAILED read says so rather than implying none", async () => {
    state.pastedReferenceInPlan.mockResolvedValue(false);
    state.heldDrafts.mockResolvedValue([]);
    expect(await render()).not.toContain('data-testid="studio-held-drafts"');
    state.heldDrafts.mockRejectedValue(new Error("db down"));
    expect(await render()).toContain('data-testid="studio-held-unavailable"');
  });

  it("states the input limit as visible text from the configured number — never a maxLength on the textarea", async () => {
    state.pastedReferenceInPlan.mockResolvedValue(false);
    state.heldDrafts.mockResolvedValue([]);
    state.getActiveConfigServer.mockResolvedValue({
      version: 2,
      content: { ...CONFIG_V1_SEED, llm: { ...CONFIG_V1_SEED.llm, maxInputTokens: 12_345 } },
    });
    const html = await render();
    expect(html).toContain("about 12,345 characters in total");
    const textarea = html.slice(html.indexOf('id="studio-input"') - 200, html.indexOf('id="studio-input"') + 200);
    expect(textarea).not.toMatch(/maxLength|maxlength/);
  });
});
