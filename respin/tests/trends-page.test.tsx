import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { PASTED_REFERENCE_TITLE_MAX, POST_CONTENT_MAX } from "@respin/db";

const state = vi.hoisted(() => ({
  requireUser: vi.fn(),
  scopeForUser: vi.fn(),
  selectedProfileForMember: vi.fn(),
  trendFeed: vi.fn(),
  trackedNiches: vi.fn(),
  pastedReferences: vi.fn(),
  settleParkedAutopsies: vi.fn(),
  pastedReferenceQuote: vi.fn(),
  spinAction: vi.fn(),
  trackNicheAction: vi.fn(),
  untrackNicheAction: vi.fn(),
  pasteReferenceAction: vi.fn(),
  /** Every facade call in the order it was MADE (R12: settle before the pasted read). */
  order: [] as string[],
}));

vi.mock("@respin/auth", () => ({ requireUser: state.requireUser }));
vi.mock("../app/(product)/workspace-scope", () => ({ scopeForUser: state.scopeForUser }));
vi.mock("../app/(product)/trends/actions", () => ({
  spinAction: state.spinAction,
  trackNicheAction: state.trackNicheAction,
  untrackNicheAction: state.untrackNicheAction,
  pasteReferenceAction: state.pasteReferenceAction,
}));
vi.mock("@respin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/db")>()),
  respinDb: {
    selectedProfileForMember: state.selectedProfileForMember,
    trendFeed: state.trendFeed,
    trackedNiches: state.trackedNiches,
    pastedReferences: state.pastedReferences,
  },
}));
// The credits facade is mocked WITH its original spread: `billing-errors.ts`
// `instanceof`s every error class the facade exports at module load, and a
// mock carrying only `respinCredits` would leave those `undefined`.
vi.mock("@respin/credits/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/credits/app-server")>()),
  respinCredits: {
    settleParkedAutopsies: state.settleParkedAutopsies,
    pastedReferenceQuote: state.pastedReferenceQuote,
  },
}));

const TrendsPage = (await import("../app/(product)/trends/page")).default;

const SCOPE = { workspaceId: "ws_1", role: "owner" };
const PROFILE_A = { id: "profile_a", displayName: "A" };
const PROFILE_B = { id: "profile_b", displayName: "B" };

function completedAutopsy(id = "autopsy_a") {
  return {
    id: "trend_a",
    title: "Scoped completed reference",
    niche: "stored niche only",
    channelId: "channel-private-id",
    sourcePublishedAt: new Date("2026-09-01T00:00:00Z"),
    videoViews: 4200n,
    channelMedianRecentViews: "1200",
    baselineSampleSize: 12,
    baselineObservationIds: ["not-rendered"],
    baselineWindowStartsAt: new Date("2026-08-01T00:00:00Z"),
    baselineWindowEndsAt: new Date("2026-09-01T00:00:00Z"),
    outlierRatio: "3.5",
    saturation: "measured" as const,
    saturationMeasurement: {
      matchingItems: 3,
      populationSize: 12,
      prevalence: "0.25",
      window: {
        startsAt: new Date("2026-08-01T00:00:00Z"),
        endsAt: new Date("2026-09-01T00:00:00Z"),
      },
      methodVersion: "measure-v1",
    },
    transcriptState: "transcript_available" as const,
    sourceKind: "youtube" as const,
    autopsy: {
      autopsyId: id,
      analysisVersion: "autopsy-v1",
      hookMechanic: "A bounded hook mechanic.",
      subjectTerms: ["subject"],
      hook: "A bounded autopsy hook.",
      structure: { beatCount: 3, turnBeat: 1 },
      beats: ["A bounded beats summary."],
      ending: "A bounded ending summary.",
      followTrigger: "A bounded follow trigger.",
    },
  };
}

const PASTED_AUTOPSY = {
  autopsyId: "pasted_autopsy_1",
  analysisVersion: "autopsy-v1",
  hookMechanic: "A pasted hook mechanic.",
  subjectTerms: ["SENTINEL-SUBJECT-TERM"],
  hook: "SENTINEL-REFERENCE-HOOK never rendered",
  structure: { beatCount: 2, turnBeat: 1 },
  beats: ["A pasted beats summary."],
  ending: "A pasted ending summary.",
  followTrigger: "A pasted follow trigger.",
};

/** One pasted reference per claim state, as the scoped reader returns them. */
function pastedReference(
  overrides: Partial<{
    itemId: string;
    title: string | null;
    sourceUrl: string;
    niche: string | null;
    createdAt: Date;
    baselineState: "measured" | "unavailable";
    transcriptState: "transcript_available" | "transcript_unavailable";
    claim: null | {
      status: "pending" | "retrying" | "completed" | "parked";
      attemptCount: number;
      attemptCeiling: number;
      claimId: string;
      autopsyId: string | null;
    };
    autopsy: typeof PASTED_AUTOPSY | undefined;
  }> = {}
) {
  return {
    itemId: "pasted_item_1",
    title: "A pasted title",
    sourceUrl: "https://example.com/watch?v=abc",
    niche: null,
    createdAt: new Date("2026-09-03T10:00:00Z"),
    baselineState: "unavailable" as const,
    transcriptState: "transcript_available" as const,
    claim: {
      status: "pending" as const,
      attemptCount: 0,
      attemptCeiling: 5,
      claimId: "claim_1",
      autopsyId: null,
    },
    autopsy: undefined,
    ...overrides,
  };
}

/**
 * A `settleParkedAutopsies` result, in its FULL shape.
 *
 * All four fields, always, because the page's parked copy is now driven by
 * three of them and a fixture that omitted one would let `undefined` read as
 * "false"/"not in the list" — which is precisely how C2's defect rendered
 * "credits returned" over an empty ledger.
 */
function settlement(
  over: Partial<{
    refundedClaimIds: string[];
    creditsReturned: number;
    deferred: boolean;
    neverChargedClaimIds: string[];
    alreadyRefundedClaimIds: string[];
  }> = {}
) {
  return {
    refundedClaimIds: [],
    creditsReturned: 0,
    deferred: false,
    neverChargedClaimIds: [],
    alreadyRefundedClaimIds: [],
    ...over,
  };
}

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await TrendsPage());
}

beforeEach(() => {
  vi.clearAllMocks();
  state.order.length = 0;
  state.requireUser.mockResolvedValue({ id: "user_1" });
  state.scopeForUser.mockResolvedValue(SCOPE);
  state.selectedProfileForMember.mockResolvedValue(PROFILE_A);
  state.trendFeed.mockImplementation(async () => {
    state.order.push("trendFeed");
    return [completedAutopsy()];
  });
  state.trackedNiches.mockImplementation(async () => {
    state.order.push("trackedNiches");
    return [{ id: "tracked_1", niche: "home cooking" }];
  });
  state.pastedReferences.mockImplementation(async () => {
    state.order.push("pastedReferences");
    return [];
  });
  state.settleParkedAutopsies.mockImplementation(async () => {
    state.order.push("settleParkedAutopsies");
    return settlement();
  });
  state.pastedReferenceQuote.mockImplementation(async () => {
    state.order.push("pastedReferenceQuote");
    return { creditCost: 7, balance: 31, tier: "creator", allowed: { ok: true } };
  });
  state.spinAction.mockResolvedValue({ status: "idle" });
  state.trackNicheAction.mockResolvedValue({ status: "idle" });
  state.untrackNicheAction.mockResolvedValue({ status: "idle" });
  state.pasteReferenceAction.mockResolvedValue({ status: "idle" });
});

describe("/trends server page wiring", () => {
  it("keeps the auth redirect above scope/profile/feed work", async () => {
    state.requireUser.mockImplementation(async () => {
      redirect("/sign-in");
      throw new Error("unreachable");
    });
    await expect(renderPage()).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;/) });
    expect(state.scopeForUser).not.toHaveBeenCalled();
    expect(state.selectedProfileForMember).not.toHaveBeenCalled();
    expect(state.trendFeed).not.toHaveBeenCalled();
    expect(state.settleParkedAutopsies).not.toHaveBeenCalled();
    expect(state.pastedReferences).not.toHaveBeenCalled();
  });

  it("calls the app-safe reader only with the derived scope and selected profile", async () => {
    const html = await renderPage();
    expect(state.scopeForUser).toHaveBeenCalledWith({ id: "user_1" });
    expect(state.selectedProfileForMember).toHaveBeenCalledWith(SCOPE);
    expect(state.trendFeed).toHaveBeenCalledTimes(1);
    expect(state.trendFeed).toHaveBeenCalledWith(SCOPE, PROFILE_A.id);
    expect(state.trackedNiches).toHaveBeenCalledWith(SCOPE, PROFILE_A.id);
    // No niche, reference text, transcript, or arbitrary profile reaches the
    // page reader. Its stored-niche and profile cage are the authority.
    expect(state.trendFeed.mock.calls[0]).toHaveLength(2);
    expect(html).toContain("Scoped completed reference");
    expect(html).toContain("Track a niche");
    expect(html).toContain("Tracking follows this profile and its plan limit");
    expect(html).toContain("home cooking");
    expect(html).toContain("Remove");
    expect(html).toContain("Spin this reference");
    expect(html).not.toContain("channel-private-id");
    expect(html).not.toContain("not-rendered");
  });

  it("does not retain a previous profile or let a caller niche bypass the selected profile", async () => {
    await renderPage();
    state.selectedProfileForMember.mockResolvedValue(PROFILE_B);
    state.trendFeed.mockResolvedValue([completedAutopsy("autopsy_b")]);
    await renderPage();
    expect(state.trendFeed.mock.calls).toEqual([
      [SCOPE, PROFILE_A.id],
      [SCOPE, PROFILE_B.id],
    ]);
    expect(state.trackedNiches.mock.calls).toEqual([
      [SCOPE, PROFILE_A.id],
      [SCOPE, PROFILE_B.id],
    ]);
    // Slice 8c: the settlement (a WRITE) and the pasted read follow the
    // selected profile the same way — nothing a caller supplies can point
    // either at a profile the member did not select.
    expect(state.settleParkedAutopsies.mock.calls).toEqual([
      [SCOPE, PROFILE_A.id],
      [SCOPE, PROFILE_B.id],
    ]);
    expect(state.pastedReferences.mock.calls).toEqual([
      [SCOPE, PROFILE_A.id],
      [SCOPE, PROFILE_B.id],
    ]);
    expect(state.pastedReferenceQuote.mock.calls).toEqual([
      [SCOPE.workspaceId, expect.any(Date)],
      [SCOPE.workspaceId, expect.any(Date)],
    ]);
  });

  it("contains the no-profile case before the scoped feed reader", async () => {
    state.selectedProfileForMember.mockResolvedValue(null);
    const html = await renderPage();
    expect(html).toContain("Select or create a creator profile");
    expect(state.trendFeed).not.toHaveBeenCalled();
    expect(state.trackedNiches).not.toHaveBeenCalled();
    // ...and before the ONE write this page makes and the pasted read: with
    // no profile there is nothing to settle and nobody to paste for.
    expect(state.settleParkedAutopsies).not.toHaveBeenCalled();
    expect(state.pastedReferences).not.toHaveBeenCalled();
    expect(state.pastedReferenceQuote).not.toHaveBeenCalled();
    expect(html).not.toContain("Paste a reference");
  });

  it("withholds an incomplete completed-autopsy projection instead of inventing its display stages", async () => {
    const incomplete = completedAutopsy();
    delete (incomplete.autopsy as Record<string, unknown>).beats;
    state.trendFeed.mockResolvedValue([incomplete]);
    const html = await renderPage();
    expect(html).toContain("Completed autopsy display details are unavailable");
    expect(html).not.toContain("Spin this reference");
  });
});

// ------------------------- slice 8c, R12: settle FIRST, then read; the panel gets the quote

describe("/trends pasted references (R12, R-98)", () => {
  it("runs the parked-autopsy settlement BEFORE the pasted read, and once per load", async () => {
    await renderPage();
    expect(state.settleParkedAutopsies).toHaveBeenCalledTimes(1);
    expect(state.settleParkedAutopsies).toHaveBeenCalledWith(SCOPE, PROFILE_A.id);
    expect(state.pastedReferences).toHaveBeenCalledWith(SCOPE, PROFILE_A.id);
    // ORDER, not just presence: the section reports a refund on the load
    // that made it only if the read follows the write.
    const settleAt = state.order.indexOf("settleParkedAutopsies");
    const readAt = state.order.indexOf("pastedReferences");
    expect(settleAt).toBeGreaterThanOrEqual(0);
    expect(readAt).toBeGreaterThan(settleAt);
    // ...and the settlement is a WRITE, so it waits for the profile: it is
    // never in flight beside the profile read.
    expect(state.order[0]).toBe("settleParkedAutopsies");
  });

  it("contains a refused settlement like every other refusal — shown, logged by code, never swallowed", async () => {
    const { WorkspacePausedError } = await import("@respin/db");
    state.settleParkedAutopsies.mockRejectedValue(new WorkspacePausedError());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const html = await renderPage();
      expect(html).toContain("This workspace is paused");
      expect(state.pastedReferences).not.toHaveBeenCalled();
      expect(state.trendFeed).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        "[trends] parked-autopsy settlement refused",
        expect.objectContaining({ code: "workspace_paused", profileId: PROFILE_A.id })
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("passes the quote's price and balance and the two package ceilings into the panel — no number from this test's page", async () => {
    const html = await renderPage();
    expect(html).toContain("Paste a reference");
    expect(html).toMatch(/Costs <span class="mono">7<\/span> credits/);
    expect(html).toMatch(/Balance: <span class="mono">31<\/span>/);
    expect(html).toContain(`<span class="mono">${POST_CONTENT_MAX.toLocaleString("en-US")}</span> characters`);
    expect(html).toContain(`<span class="mono">${PASTED_REFERENCE_TITLE_MAX}</span> characters`);
    // The tracked niches are the select's options, "None" first and selected.
    expect(html).toMatch(/<option value="" selected="">None<\/option><option value="home cooking">home cooking<\/option>/);
    // The action is bound to the SELECTED profile: the page never exposes a
    // profile field for the form to supply.
    expect(html).not.toContain('name="profileId"');
  });

  it("renders the panel DISABLED with plan-naming copy on a tier refusal, and never sells", async () => {
    state.pastedReferenceQuote.mockResolvedValue({ creditCost: 7, balance: 0, tier: "free", allowed: { ok: false, reason: "tier" } });
    const html = await renderPage();
    expect(html).toContain('data-testid="paste-disabled-tier"');
    expect(html).toContain("Creator, Pro and Studio plans");
    expect(html.toLowerCase()).not.toMatch(/\bupgrad|move to a (higher |paid )?plan|a plan that includes|\bsubscribe\b/);
    expect(html).not.toContain('href="/settings/billing"');
  });

  it("still renders the panel and the pasted section on an EMPTY feed and on an UNAVAILABLE feed", async () => {
    state.trendFeed.mockResolvedValue([]);
    const empty = await renderPage();
    expect(empty).toContain("No eligible autopsied trend items are available for this profile yet.");
    expect(empty).toContain("Paste a reference");
    expect(empty).toContain("Your pasted references");
    expect(empty).toContain("Nothing pasted yet.");

    const incomplete = completedAutopsy();
    delete (incomplete.autopsy as Record<string, unknown>).beats;
    state.trendFeed.mockResolvedValue([incomplete]);
    const unavailable = await renderPage();
    expect(unavailable).toContain("Completed autopsy display details are unavailable");
    expect(unavailable).toContain("Paste a reference");
    expect(unavailable).toContain("Your pasted references");
  });

  it("projects each claim state into its designed row, newest first as the reader returns them", async () => {
    state.pastedReferences.mockResolvedValue([
      pastedReference({ itemId: "p_ready", title: null, claim: { status: "completed", attemptCount: 1, attemptCeiling: 5, claimId: "c_ready", autopsyId: "pasted_autopsy_1" }, autopsy: PASTED_AUTOPSY }),
      pastedReference({ itemId: "p_retry", claim: { status: "retrying", attemptCount: 2, attemptCeiling: 5, claimId: "c_retry", autopsyId: null } }),
      pastedReference({ itemId: "p_queued", niche: "home cooking" }),
      pastedReference({ itemId: "p_gone", transcriptState: "transcript_unavailable", claim: { status: "retrying", attemptCount: 1, attemptCeiling: 5, claimId: "c_gone", autopsyId: null } }),
    ]);
    const page = await renderPage();
    // THE SECTION, not the page: the ranked feed's own item (with its real
    // ratio) renders below it, and the assertions here are about the pasted
    // rows only.
    const html = page.slice(page.indexOf('data-testid="pasted-references"'), page.indexOf("<h1"));
    expect(html.length).toBeGreaterThan(0);
    const at = (id: string) => html.indexOf(`data-testid="pasted-${id}"`);
    expect(at("p_ready")).toBeGreaterThanOrEqual(0);
    expect(at("p_ready")).toBeLessThan(at("p_retry"));
    expect(at("p_retry")).toBeLessThan(at("p_queued"));
    expect(at("p_queued")).toBeLessThan(at("p_gone"));

    // READY: the feed's own card, the explicit no-baseline line where the
    // ratio block sits, the live spin form bound to the autopsy id — and the
    // gate's inputs never rendered.
    expect(html).toContain('data-testid="pasted-state-ready"');
    expect(html).toContain('data-testid="baseline-unavailable-p_ready"');
    expect(html).toContain("No channel baseline — pasted reference");
    expect(html).toContain("A pasted hook mechanic.");
    expect(html).toContain('value="pasted_autopsy_1"');
    expect(html).not.toContain("SENTINEL-REFERENCE-HOOK");
    expect(html).not.toContain("SENTINEL-SUBJECT-TERM");
    expect(html).not.toContain("Outlier ratio");
    // A null title falls back to the link's host, never to the URL itself.
    expect(html).toContain("<h3 id=\"pasted-title-p_ready\">example.com</h3>");

    expect(html).toContain('data-testid="pasted-state-retrying"');
    expect(html).toMatch(/attempt <span class="mono">2<\/span> of <span class="mono">5<\/span>/);
    expect(html).toContain('data-testid="pasted-state-queued"');
    expect(html).toContain("Niche: <span class=\"mono\">home cooking</span>");
    // A missing transcript outranks an in-flight claim: nothing can run on it.
    expect(html).toContain('data-testid="pasted-state-transcript-unavailable"');
    // Every original is a link labelled as the other creator's work.
    expect(html).toContain('rel="noopener noreferrer" target="_blank"');
  });

  it("the 'No channel baseline' line is READ FROM THE RECORD, not typed by the page (C10)", async () => {
    const ready = (baselineState: "measured" | "unavailable") =>
      pastedReference({
        itemId: "p_ready", title: null, baselineState,
        claim: { status: "completed", attemptCount: 1, attemptCeiling: 5, claimId: "c_ready", autopsyId: "pasted_autopsy_1" },
        autopsy: PASTED_AUTOPSY,
      });

    state.pastedReferences.mockResolvedValue([ready("unavailable")]);
    expect(await renderPage()).toContain("No channel baseline — pasted reference");

    // The reader predicates on `unavailable`, so this row does not occur
    // today — which is exactly why the page must not ASSERT the sentence. It
    // was stamped `"unavailable"` unconditionally, so a `measured` row would
    // have printed "No channel baseline" for an item carrying a real ratio.
    state.pastedReferences.mockResolvedValue([ready("measured")]);
    const measured = await renderPage();
    const section = measured.slice(measured.indexOf('data-testid="pasted-references"'), measured.indexOf("<h1"));
    expect(section).toContain('data-testid="pasted-state-ready"');
    expect(section).not.toContain("No channel baseline");
    expect(section).not.toContain("Outlier ratio");
  });

  it("names the returned credits on a parked item ONLY when this load's settlement is attributable to that claim", async () => {
    const parked = (itemId: string, claimId: string) =>
      pastedReference({ itemId, claim: { status: "parked", attemptCount: 5, attemptCeiling: 5, claimId, autopsyId: null } });
    // The pasted SECTION only — the paste panel above it states the quote's
    // price, which is a different number about a different thing.
    const section = async () => {
      const page = await renderPage();
      return page.slice(page.indexOf('data-testid="pasted-references"'), page.indexOf("<h1"));
    };

    // One refund this load, for this claim: the number is stated.
    state.settleParkedAutopsies.mockResolvedValue(settlement({ refundedClaimIds: ["c_parked_1"], creditsReturned: 9 }));
    state.pastedReferences.mockResolvedValue([parked("p1", "c_parked_1")]);
    let html = await section();
    expect(html).toMatch(/Could not be completed — <span class="mono">9<\/span> credits returned/);

    // Refunded on an EARLIER load: "credits returned", no number invented — and
    // it is the settlement NAMING the claim in `alreadyRefundedClaimIds` that
    // earns the past tense, not the absence of it from the other two lists
    // (round 2).
    state.settleParkedAutopsies.mockResolvedValue(settlement({ alreadyRefundedClaimIds: ["c_parked_1"] }));
    html = await section();
    expect(html).toContain("Could not be completed — credits returned");
    expect(html).not.toMatch(/<span class="mono">\d+<\/span> credits returned/);

    // Two refunds in one load: a total cannot be split without guessing.
    state.settleParkedAutopsies.mockResolvedValue(settlement({ refundedClaimIds: ["c_parked_1", "c_parked_2"], creditsReturned: 18 }));
    state.pastedReferences.mockResolvedValue([parked("p1", "c_parked_1"), parked("p2", "c_parked_2")]);
    html = await section();
    expect(html).not.toMatch(/<span class="mono">\d+<\/span> credits returned/);
    expect(html).not.toContain(">18<");
    expect(html).not.toContain(">9<");
  });

  it("the deferral is the SETTLEMENT's answer, not the quote's — a paused, non-paid workspace still reads deferred (C2)", async () => {
    // THE DEFECT, driven end to end. The page's refund-deferred flag was
    // `quote.allowed.reason === "paused"`, and `pastedReferenceQuote` tests
    // TIER BEFORE PAUSE — so a workspace that is both non-paid and paused
    // answers `"tier"`, the flag read false, and the section printed
    // "credits returned", past tense, over a settlement that returned nothing.
    // The quote below says `"tier"`; the settlement says `deferred: true`; the
    // screen must follow the settlement.
    const parked = pastedReference({ itemId: "p1", claim: { status: "parked", attemptCount: 5, attemptCeiling: 5, claimId: "c_parked_1", autopsyId: null } });
    state.pastedReferences.mockResolvedValue([parked]);
    state.pastedReferenceQuote.mockResolvedValue({ creditCost: 7, balance: 0, tier: "free", allowed: { ok: false, reason: "tier" } });
    state.settleParkedAutopsies.mockResolvedValue(settlement({ deferred: true }));
    let html = await renderPage();
    expect(html).toContain("settled when the pause ends");
    expect(html).toContain("nothing has been returned yet");
    expect(html).not.toContain("has been returned to your balance");
    expect(html).not.toContain("— credits returned");

    // ...and the converse: a quote that says "paused" does NOT make the copy
    // deferred when the settlement actually ran (a pause that ended between
    // the settlement and the quote, which share no read).
    state.pastedReferenceQuote.mockResolvedValue({ creditCost: 7, balance: 31, tier: "creator", allowed: { ok: false, reason: "paused" } });
    state.settleParkedAutopsies.mockResolvedValue(settlement({ refundedClaimIds: ["c_parked_1"], creditsReturned: 9 }));
    html = await renderPage();
    expect(html).not.toContain("settled when the pause ends");
    expect(html).toMatch(/Could not be completed — <span class="mono">9<\/span> credits returned/);
  });

  it("a parked claim the settlement found NO debit for says nothing was charged, never 'credits returned' (C2b)", async () => {
    // Under a document pricing `creditCosts.autopsy` at 0 the paste writes no
    // ledger row, so the settlement correctly appends nothing — and the page
    // used to read that same "no number for this claim" as the
    // refunded-on-an-earlier-load branch and assert a return that never was.
    state.pastedReferences.mockResolvedValue([
      pastedReference({ itemId: "p1", claim: { status: "parked", attemptCount: 5, attemptCeiling: 5, claimId: "c_free", autopsyId: null } }),
    ]);
    state.settleParkedAutopsies.mockResolvedValue(settlement({ neverChargedClaimIds: ["c_free"] }));
    const html = await renderPage();
    expect(html).toContain("Could not be completed — nothing was charged");
    expect(html).toContain("nothing to return");
    expect(html).not.toContain("credits returned");
    expect(html).not.toContain("has been returned to your balance");

    // A DIFFERENT claim in that list does not borrow the sentence — and the
    // claim nobody named is now the NOT-SETTLED-YET state, not "credits
    // returned" (round 2). Naming `c_parked_1` as already refunded is what puts
    // the past tense back.
    state.settleParkedAutopsies.mockResolvedValue(settlement({ neverChargedClaimIds: ["c_someone_else"] }));
    const unnamed = await renderPage();
    expect(unnamed).toContain("Could not be completed — not settled yet");
    expect(unnamed).not.toContain("nothing was charged");
    expect(unnamed).not.toContain("credits returned");

    state.settleParkedAutopsies.mockResolvedValue(
      settlement({ neverChargedClaimIds: ["c_someone_else"], alreadyRefundedClaimIds: ["c_free"] })
    );
    expect(await renderPage()).toContain("Could not be completed — credits returned");
  });

  it("a claim parked BETWEEN the settlement and the pasted read says nothing about the money (round 2)", async () => {
    // THE SEQUENCE, driven: the page settles at one moment (`page.tsx`, before
    // the `Promise.all`) and reads the pasted references in a later
    // transaction. A claim the worker parks in that window is in NONE of the
    // settlement's lists — the settlement ran before the claim was parked, so
    // it returns the empty result of a profile with nothing parked — and the
    // read that follows shows it as `parked`. `parked_returned` was the
    // fallthrough, so the creator was told their credits had been returned over
    // a ledger holding the debit and no refund.
    //
    // The mocks are the two moments: the settlement answers as it did BEFORE
    // the park, the reader answers as it does AFTER.
    state.settleParkedAutopsies.mockResolvedValue(settlement());
    state.pastedReferences.mockResolvedValue([
      pastedReference({
        itemId: "p_window",
        claim: { status: "parked", attemptCount: 5, attemptCeiling: 5, claimId: "c_window", autopsyId: null },
      }),
    ]);
    const html = await renderPage();
    // NON-VACUITY: the row really rendered, and it really is the parked banner.
    expect(html).toContain('data-testid="pasted-p_window"');
    expect(html).toContain('data-testid="pasted-state-parked"');
    expect(html).toContain('data-refund="unsettled"');
    expect(html).toContain("Could not be completed — not settled yet");
    // The false sentence, in both of its spellings, and the other two states'
    // money claims with it.
    expect(html).not.toContain("credits returned");
    expect(html).not.toContain("has been returned to your balance");
    expect(html).not.toContain("nothing was charged");
    expect(html).not.toContain("when the pause ends");
  });

  it("a settlement refused because the refund cannot be dated renders its own copy, not 'Something went wrong'", async () => {
    const { RefundSourceNeverExpiresError } = await import("@respin/credits/app-server");
    state.settleParkedAutopsies.mockRejectedValue(new RefundSourceNeverExpiresError());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const html = await renderPage();
      expect(html).toContain("A refund you are owed could not be dated");
      expect(html).toContain("still owed, not lost");
      expect(html).not.toContain("Something went wrong");
      expect(errorSpy).toHaveBeenCalledWith(
        "[trends] parked-autopsy settlement refused",
        expect.objectContaining({ code: "refund_source_never_expires" })
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("says a completed claim's details are unavailable rather than rendering a partial autopsy", async () => {
    const partial = { ...PASTED_AUTOPSY, beats: [] };
    state.pastedReferences.mockResolvedValue([
      pastedReference({ itemId: "p_partial", claim: { status: "completed", attemptCount: 1, attemptCeiling: 5, claimId: "c_partial", autopsyId: "pasted_autopsy_1" }, autopsy: partial }),
      pastedReference({ itemId: "p_noclaim", claim: null }),
    ]);
    const html = await renderPage();
    expect(html).toContain('data-testid="pasted-state-unavailable"');
    expect(html).toContain("display details are unavailable");
    expect(html).toContain("No autopsy was opened for this reference");
    expect(html).not.toContain('data-testid="pasted-state-ready"');
    expect(html).not.toContain('value="pasted_autopsy_1"');
  });
});
