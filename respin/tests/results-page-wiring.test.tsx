// THE `/results` PAGE COMPONENT, EXECUTED — the `page-wiring.test.tsx`
// analogue, built for the reason that file's own header gives.
//
// THE GAP THIS CLOSES, disclosed by the builder rather than found by a
// reviewer: every other suite on this surface drives the VIEWS. The page's
// gate call, its five branches, the order it reads in and the one-more-than-
// shown clamp were proven by typecheck and by reading, which is precisely the
// state `/usage` was in for three rounds — and the two holes that state
// produced there (a role check nothing reached, an `AccessRefusal` no path
// could render) are the register entries this file exists to avoid repeating.
//
// A Next async server component is just an async function returning JSX, so it
// is awaited and handed to `renderToStaticMarkup`. The package surfaces are
// mocked at the module boundary through `importOriginal`, so every ERROR CLASS
// in the tree is the REAL one: the refusals below are real instances flowing
// through the real `billingErrorDisplay`, not shapes a mock agreed to.
//
// ONE COUPLING TO KNOW ABOUT BEFORE YOU DEBUG THIS FILE. The happy-path test
// asserts every reader was called with `db.withWorkspace.mock.results[0].value`
// — the object the mocked `withWorkspace` returned — which holds only while
// `scopeForUser` hands that value back UNCHANGED. If the bootstrap-then-scope
// helper ever wraps, clones or re-mints the scope, five assertions here break
// at once for a reason that has nothing to do with the tenancy property they
// are testing. Fix them at `app/(product)/workspace-scope.ts`; there is
// nothing wrong with the cage.
//
// SCOPE, STATED HONESTLY: this covers the page's wiring — which reader is
// called with what, which branch renders, and what never runs after a refusal.
// It does not cover the server action (`results-log-action.test.tsx`) or the
// comparison arithmetic (`@respin/brain`'s own suite).
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import {
  FORBIDDEN_CLAIMS,
  PERFORMANCE_CLAIMS,
} from "./support/forbidden-claims";
import { claimHits, specimensFor } from "./support/claim-scan";

/** A uuid a refusal message might carry. It must never reach the page. */
const LOT_UUID = "0195aa11-2222-7333-8444-555566667777";

const gate = vi.hoisted(() => ({ requireUser: vi.fn() }));
const db = vi.hoisted(() => ({
  ensureUserWorkspace: vi.fn(),
  withWorkspace: vi.fn(),
  selectedProfileForMember: vi.fn(),
  declaredMetricForProfile: vi.fn(),
  listResults: vi.fn(),
  resultComparisons: vi.fn(),
  generationsForResultLog: vi.fn(),
  promotionProposalHistory: vi.fn(),
  promotionProposalReview: vi.fn(),
}));
const credits = vi.hoisted(() => ({
  performanceLearningEntitlementFor: vi.fn(),
  hasOpenPause: vi.fn(),
}));

vi.mock("@respin/auth", () => ({
  requireUser: gate.requireUser,
  requireAdmin: vi.fn(),
}));

vi.mock("@respin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/db")>()),
  respinDb: db,
}));

vi.mock("@respin/credits/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/credits/app-server")>()),
  respinCredits: credits,
}));

const { WorkspaceAccessError, ProfileAccessError, ComparisonInputError } =
  await import("@respin/db");
const { PerformanceLearningConfigUnavailableError } = await import(
  "@respin/credits"
);
const { BILLING_ERROR_COPY, CODE_FOR_ERROR_CLASS } = await import(
  "../app/(product)/billing-errors"
);
const ResultsPage = (await import("../app/(product)/results/page")).default;

const NOW = new Date("2026-08-08T00:00:00Z");

function storedResult(over: Record<string, unknown> = {}) {
  return {
    id: "r-1",
    profileId: "p_1",
    workspaceId: "ws_1",
    generationId: "g-1",
    platform: "TikTok",
    audienceClass: "organic",
    metricKey: "follows_per_1k",
    metricDeclaredByDocId: "bd-1",
    observedFrom: new Date("2026-08-01T00:00:00Z"),
    observedTo: NOW,
    treatmentKey: "fw-1@2|hooks|act-9|follows_per_1k",
    evidenceState: "quantified_self_reported",
    reachValue: "4000",
    reachDenominator: "12000",
    conversionValue: "80",
    conversionDenominator: "4000",
    confounders: ["topic_overlap"],
    note: null,
    connectorSource: null,
    connectorEventId: null,
    connectorObservedAt: null,
    createdAt: NOW,
    ...over,
  };
}

function comparisonGroup() {
  const present = (n: number, median: number, ids: string[]) => ({
    state: "present" as const,
    n,
    medianPer1k: median,
    resultIds: ids,
  });
  const lever = (name: "reach" | "conversion") => ({
    lever: name,
    treatment: present(3, 120, ["t-1", "t-2", "t-3"]),
    baseline: present(3, 90, ["b-1", "b-2", "b-3"]),
    effectPer1k: 30,
    improvement: "better" as const,
    direction: "higher_is_better" as const,
    unit: "follows",
    confoundersPresent: ["topic_overlap"],
  });
  return {
    stratum: {
      profileId: "p_1",
      platform: "TikTok",
      audienceClass: "organic" as const,
      metricKey: "follows_per_1k",
      observedFrom: new Date("2026-08-01T00:00:00Z"),
      observedTo: NOW,
    },
    treatmentKey: "fw-1@2|hooks|act-9|follows_per_1k",
    comparisons: [lever("reach"), lever("conversion")],
  };
}

const render = async (): Promise<string> =>
  renderToStaticMarkup(await ResultsPage());

// THE PREDICATE IS `claimHits` (P1-R4, applied 2026-09-21). This file held
// `const RESULTS_CLAIM_CANON = [...]` and a bare `.test()` — correctly
// shaped, so no re-invention scanner could see it, and one of six the
// batch-5 compliance gate counted. The LISTS are still named here, because
// which lists apply to a screen is that screen's decision; what may not be
// re-invented is the thing that DECIDES whether a string matches.

const entitlementStates = [
  {
    label: "Free view-only performance-record access",
    arrange: () => {
      credits.performanceLearningEntitlementFor.mockResolvedValue("view_only");
    },
  },
  {
    label: "performance-record configuration unavailable",
    arrange: () => {
      credits.performanceLearningEntitlementFor.mockRejectedValue(
        new PerformanceLearningConfigUnavailableError("config_unavailable")
      );
    },
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireUser.mockResolvedValue({ id: "u_1", name: "Ada" });
  db.ensureUserWorkspace.mockResolvedValue({
    workspace: { id: "ws_1", name: "Workspace" },
  });
  db.withWorkspace.mockResolvedValue({
    workspaceId: "ws_1",
    role: "owner",
    userId: "u_1",
  });
  db.selectedProfileForMember.mockResolvedValue({
    id: "p_1",
    displayName: "Ada",
  });
  db.declaredMetricForProfile.mockResolvedValue({
    label: "Follows",
    key: "follows_per_1k",
    unit: "follows",
    direction: "higher_is_better",
  });
  db.listResults.mockResolvedValue([storedResult()]);
  db.resultComparisons.mockResolvedValue([comparisonGroup()]);
  db.generationsForResultLog.mockResolvedValue([
    { id: "g-1", mode: "hooks", createdAt: new Date("2026-08-01T09:30:00Z") },
  ]);
  db.promotionProposalHistory.mockResolvedValue([]);
  credits.performanceLearningEntitlementFor.mockResolvedValue("full");
  credits.hasOpenPause.mockResolvedValue(false);
});

describe("/results page component: the gate", () => {
  it("calls the gate ABOVE everything, and its redirect propagates — nothing is scoped or read", async () => {
    gate.requireUser.mockImplementation(async () => {
      redirect("/sign-in");
      throw new Error("unreachable");
    });
    let caught: (Error & { digest?: string }) | undefined;
    try {
      await render();
    } catch (err) {
      caught = err as Error & { digest?: string };
    }
    expect(caught?.digest).toMatch(/^NEXT_REDIRECT;/);
    expect(caught?.digest).toContain("/sign-in");
    // A gate, not a formality: no scope, no profile, no row of a creator's
    // own outcome data was read.
    expect(db.ensureUserWorkspace).not.toHaveBeenCalled();
    expect(db.withWorkspace).not.toHaveBeenCalled();
    expect(db.listResults).not.toHaveBeenCalled();
    expect(db.resultComparisons).not.toHaveBeenCalled();
  });
});

describe("/results page component: the happy path", () => {
  it("renders the shared Free view-only notice once across the real result children", async () => {
    credits.performanceLearningEntitlementFor.mockResolvedValue("view_only");

    const out = await render();
    expect(out.match(/Free view-only performance-record access/g)).toHaveLength(1);
    expect(out).toContain("logging a result requires full access.");
    expect(out).toContain("Brain-update proposals also require full access.");
  });

  it("keeps the free proposal boundary distinct from result logging", () => {
    const pageSource = readFileSync(
      new URL("../app/(product)/results/page.tsx", import.meta.url),
      "utf8"
    );
    expect(pageSource).toContain("Brain-update proposals also require full access.");
    expect(pageSource).not.toContain(
      "logging results and brain-update proposals require full access"
    );
  });

  it("binds every promotion mutation on the server and passes them into the client panel", () => {
    const pageSource = readFileSync(
      new URL("../app/(product)/results/page.tsx", import.meta.url),
      "utf8"
    );
    const panelSource = readFileSync(
      new URL("../app/(product)/results/promotion-panel.tsx", import.meta.url),
      "utf8"
    );
    for (const action of [
      "refreshPromotionAction",
      "reviewPromotionAction",
      "decidePromotionAction",
    ]) {
      expect(pageSource).toContain(`${action}.bind(null, profile.id)`);
    }
    expect(panelSource).not.toMatch(/from ["']\.\/actions["']/);
    expect(panelSource).not.toMatch(/from ["']@respin\//);
  });

  it("scopes by the SESSION user id, reads under that scope, and renders both halves", async () => {
    const out = await render();
    expect(db.ensureUserWorkspace).toHaveBeenCalledWith({
      authUserId: "u_1",
      name: "Ada",
    });
    expect(db.withWorkspace).toHaveBeenCalledWith({ authUserId: "u_1" });
    // EVERY READ CARRIES THE SCOPE AND THE SELECTED PROFILE — the tenancy
    // property this page has to hold (REQ-A03/R-9). Asserted per reader, not
    // once, because a page that scoped three of four reads would look correct
    // in a spot check.
    const scope = await db.withWorkspace.mock.results[0].value;
    for (const reader of [
      db.declaredMetricForProfile,
      db.resultComparisons,
      db.generationsForResultLog,
      db.promotionProposalHistory,
    ]) {
      expect(reader).toHaveBeenCalledWith(scope, "p_1");
    }
    expect(db.listResults).toHaveBeenCalledWith(scope, "p_1", { limit: 51 });
    expect(out).toContain('data-testid="results-log-panel"');
    expect(out).toContain('data-testid="results-row"');
    expect(out).toContain('data-testid="results-comparison-0"');
    expect(out).toContain('data-testid="results-metric-label"');
    expect(out).toContain("Follows");
  });

  it("READS ARE CLAMPED AT ONE MORE THAN SHOWN, so 'there are more' is observed", async () => {
    // The `/usage` lesson: a clamped page presented as the whole. 51 for a
    // list of 50 is the probe; the comparison read is NOT clamped, because a
    // median over a page is not a median.
    await render();
    expect(db.listResults).toHaveBeenCalledWith(expect.anything(), "p_1", {
      limit: 51,
    });
    expect(db.resultComparisons).toHaveBeenCalledWith(expect.anything(), "p_1");
  });

  it("a 51st row makes the list say so; exactly 50 does not", async () => {
    db.listResults.mockResolvedValue(
      Array.from({ length: 51 }, (_, i) => storedResult({ id: `r-${i}` }))
    );
    const clamped = await render();
    expect(clamped).toContain('data-testid="results-list-clamped"');
    expect(clamped.match(/data-testid="results-row"/g)).toHaveLength(50);

    db.listResults.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => storedResult({ id: `r-${i}` }))
    );
    const exact = await render();
    expect(exact).not.toContain('data-testid="results-list-clamped"');
    expect(exact.match(/data-testid="results-row"/g)).toHaveLength(50);
  });

  it("the generation picker shows mode and ISO day, and NOTHING ELSE off the row", async () => {
    // The reader returns WHOLE generation rows — its own docblock says the
    // projection is the screen's job — so this asserts the projection really
    // is one. The row below carries a draft's text and its prompt; neither may
    // reach the picker, because a picker is a list of a creator's own drafts
    // and not a place to re-render one.
    db.generationsForResultLog.mockResolvedValue([
      {
        id: "g-1",
        mode: "hooks",
        createdAt: new Date("2026-08-01T09:30:00Z"),
        outputText: "SEVEN-WORD-HOOK-THE-PICKER-MUST-NOT-RENDER",
        promptBundleVersion: "PROMPT-BUNDLE-MUST-NOT-RENDER",
        brainActivationId: "ACTIVATION-MUST-NOT-RENDER",
      },
    ]);
    const out = await render();
    expect(out).toContain('<option value="g-1">hooks — 2026-08-01</option>');
    for (const leaked of [
      "SEVEN-WORD-HOOK-THE-PICKER-MUST-NOT-RENDER",
      "PROMPT-BUNDLE-MUST-NOT-RENDER",
      "ACTIVATION-MUST-NOT-RENDER",
    ]) {
      expect(out, `the picker rendered ${leaked}`).not.toContain(leaked);
    }
  });

  it("a VIEWER gets the reason instead of the form — the role branch, executed", async () => {
    // The `/usage` register entry this file exists for: a role check that no
    // test reached. The real gate is inside `recordResult`; this is the
    // courtesy, and a courtesy nothing drives is a courtesy nobody has run.
    db.withWorkspace.mockResolvedValue({
      workspaceId: "ws_1",
      role: "viewer",
      userId: "u_1",
    });
    const out = await render();
    expect(out).toContain('data-testid="results-log-blocked"');
    expect(out).toContain("viewer access");
    expect(out).not.toContain('name="platform"');
  });

  it("a paid pause still permits result logging while proposal changes are refused", async () => {
    credits.hasOpenPause.mockResolvedValue(true);
    const out = await render();
    expect(out).toContain('name="platform"');
    expect(out).toContain('data-testid="results-promotions"');
    expect(out).toContain("paused");
    expect(out).not.toContain("Refresh proposals");
  });

  it.each(entitlementStates)(
    "$label is a named read-only Results state, while history remains visible",
    async ({ arrange }) => {
      arrange();
      const out = await render();
      expect(out).toContain('data-testid="results-log-blocked"');
      expect(out).not.toContain('name="platform"');
      expect(out).toContain('data-testid="results-promotions"');
      expect(out).not.toContain("Refresh proposals");
    }
  );

  it.each(entitlementStates)(
    "the actual rendered $label state is clean under the shared claim canon",
    async ({ label, arrange }) => {
      arrange();
      const html = await render();
      expect(
        claimHits(html, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS),
        `the ${label} page state`
      ).toEqual([]);
    }
  );

  // The plant this file was recorded as owing (`PLANT_OWED`): per ENTRY, so a
  // typo in one pattern cannot hide behind another pattern matching the same
  // sentence.
  it.each(specimensFor(FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS))(
    "PLANTED: %s would be caught in a rendered /results state",
    (label, specimen) => {
      expect(claimHits(specimen, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toContain(label);
    }
  );

  it("a partial proposal review announces that the rendered cards are incomplete", async () => {
    db.promotionProposalHistory.mockResolvedValue([{ id: "proposal-1" }]);
    db.promotionProposalReview.mockRejectedValue(new Error("proposal read failed"));
    const out = await render();
    expect(out).toContain('data-testid="promotion-history-partial"');
    expect(out).toContain("not a complete proposal history");
  });

  it("an unavailable proposal-history reader names the operational state", async () => {
    db.promotionProposalHistory.mockRejectedValue(new Error("proposal history failed"));
    const out = await render();
    expect(out).toContain('data-testid="promotion-history-unavailable"');
    expect(out).toContain("cannot say whether proposals exist");
  });
});

describe("/results page component: the four refusal branches", () => {
  it("no creator profile selected → the named state, and NOTHING is read for a profile", async () => {
    db.selectedProfileForMember.mockResolvedValue(null);
    const out = await render();
    expect(out).toContain('data-testid="results-no-profile"');
    expect(db.declaredMetricForProfile).not.toHaveBeenCalled();
    expect(db.listResults).not.toHaveBeenCalled();
    expect(db.resultComparisons).not.toHaveBeenCalled();
  });

  it("R8: no declared metric → the refusal WITH its remedy, and no form, and no reads", async () => {
    db.declaredMetricForProfile.mockResolvedValue(null);
    const out = await render();
    expect(out).toContain('data-testid="results-no-declared-metric"');
    expect(out).toContain("north-star metric");
    // The remedy is a link a creator can press, not a sentence about a page.
    expect(out).toContain('href="/brain"');
    // Offering a form whose only outcome is a refusal is what this branch
    // exists to avoid — and the page stops before reading anything else.
    expect(out).not.toContain('data-testid="results-log-panel"');
    expect(db.listResults).not.toHaveBeenCalled();
    expect(db.resultComparisons).not.toHaveBeenCalled();
  });

  it("WorkspaceAccessError from the scope renders AccessRefusal, and leaks no id", async () => {
    db.withWorkspace.mockRejectedValue(
      new WorkspaceAccessError(
        `user u_1 belongs to 2 workspaces; pass workspaceId (${LOT_UUID})`
      )
    );
    const out = await render();
    expect(out).toContain('data-testid="workspace-access-error"');
    expect(out).not.toContain(LOT_UUID);
    expect(db.selectedProfileForMember).not.toHaveBeenCalled();
    expect(db.listResults).not.toHaveBeenCalled();
  });

  it("a failing PROFILE read renders AccessRefusal rather than a page with no profile", async () => {
    // A REAL instance of the REAL class — the whole reason the mock is built
    // through `importOriginal`. `ProfileAccessError` names no id by
    // construction (a uuidv7 leaks creation time), so what this proves is the
    // branch, and the class's own copy is what reaches the reader.
    db.selectedProfileForMember.mockRejectedValue(new ProfileAccessError());
    const out = await render();
    expect(out).toContain('data-testid="workspace-access-error"');
    // A FAILED READ MUST NOT LOOK LIKE "you have no creator profile": that
    // state tells a creator to go and make one they may already have.
    expect(out).not.toContain('data-testid="results-no-profile"');
    // ...and the page stopped: no creator's outcome data was read for a
    // profile the cage refused.
    expect(db.listResults).not.toHaveBeenCalled();
    expect(db.resultComparisons).not.toHaveBeenCalled();
  });

  it("a failing DECLARED-METRIC read is a refusal, never a silently defaulted metric", async () => {
    // R8's sharpest edge: "no metric declared" and "we could not find out"
    // are different facts, and the second must not render as the first —
    // which would tell a creator to go declare a metric they already have.
    db.declaredMetricForProfile.mockRejectedValue(
      new Error(`metric read failed for ${LOT_UUID}`)
    );
    const out = await render();
    expect(out).toContain('data-testid="workspace-access-error"');
    expect(out).not.toContain('data-testid="results-no-declared-metric"');
    expect(out).not.toContain(LOT_UUID);
  });

  it("a failing COMPARISON read is CONTAINED: the form and the history survive", async () => {
    // THIS ASSERTED THE OPPOSITE UNTIL THE GATE FOUND IT. The page refused
    // entirely on a failed comparison read, and the argument for that was
    // real: rendering the list beside a SILENTLY missing comparison is
    // indistinguishable from "nothing is comparable yet".
    //
    // THE ARGUMENT IS ANSWERED RATHER THAN DROPPED — the section is not
    // silent, it carries its own named refusal — and the cost of the old
    // behaviour was the deciding half: `results` is append-only with NO
    // DELETE PATH, so one unreadable row took away the log form too. A creator
    // could then neither remove the row nor record anything new, and
    // `comparison_input`'s "reload the page and try again" would have been
    // untrue on a permanent outage. That is the control becoming the outage.
    db.resultComparisons.mockRejectedValue(new Error(`boom ${LOT_UUID}`));
    const out = await render();
    // The page is NOT refused...
    expect(out).not.toContain('data-testid="workspace-access-error"');
    // ...the two things a creator can still do are still there...
    expect(out).toContain('data-testid="results-log-panel"');
    expect(out).toContain('data-testid="results-row"');
    // ...the failure is named in place, not silent...
    expect(out).toContain('data-testid="results-comparison-error"');
    // ...and it is NOT dressed up as "nothing is comparable yet".
    expect(out).not.toContain('data-testid="results-no-comparison"');
    expect(out).not.toContain(LOT_UUID);
  });

  it("a contained ComparisonInputError still carries ITS OWN copy in place", async () => {
    db.resultComparisons.mockRejectedValue(
      new ComparisonInputError("result r-9: reach denominator must be greater than zero")
    );
    const out = await render();
    expect(out).toContain('data-testid="results-comparison-error"');
    expect(out).toContain(BILLING_ERROR_COPY.comparison_input.title);
    expect(out).not.toContain(BILLING_ERROR_COPY.unknown.title);
    // THE MAPPING, NAMED DIRECTLY AS WELL AS RENDERED. The render above covers
    // it end to end and is the stronger assertion; this one is the DIAGNOSIS —
    // an unwired class fails here saying so, instead of leaving a reader with
    // "expected the HTML to contain a title" and no idea which hop broke. It
    // is also the last trace of the absence pin this test replaced: that
    // assertion read this same map, and dropping the binding would have
    // dropped the only line that names the table.
    expect(CODE_FOR_ERROR_CLASS.ComparisonInputError).toBe("comparison_input");
    expect(out).not.toContain("r-9");
    // And the creator can still log the next result.
    expect(out).toContain('data-testid="results-log-panel"');
  });

  it("NON-VACUITY: a healthy comparison read renders no failure banner", async () => {
    const out = await render();
    expect(out).not.toContain('data-testid="results-comparison-error"');
  });

  it("the comparison copy claims NOTHING about what was preserved", () => {
    // FOUND BY PLANTING, NOT BY REVIEW: an earlier version of this file had
    // this assertion, a restructure dropped it, and a planted
    // "nothing was changed" then went unnoticed while the claims canon caught
    // a planted "improve" beside it. The canon scans for banned WORDS; only
    // this pattern watches for the preservation PROMISE, so losing it left
    // exactly one hole and no failure to point at it.
    //
    // Same rule and same disclosed limit as `comparison_stratum`: it catches
    // the spellings it enumerates, NOT the class of claim, so a kindly-worded
    // synonym would pass. The entry's docblock is what keeps the claim out;
    // this catches the regression.
    const copy = BILLING_ERROR_COPY.comparison_input;
    const text = `${copy.title} ${copy.detail}`;
    expect(
      text,
      "the comparison copy makes an unconditional promise about what was preserved"
    ).not.toMatch(/nothing was (changed|saved|stored|written|lost)|(is|are|remain[s]?) (safe|untouched|unaffected)|no( thing)? .{0,20}(was|were) (changed|written)/i);
    // NON-VACUITY: the pattern really does catch the banned sentence.
    expect("The comparison failed. Nothing was changed.").toMatch(/nothing was (changed|saved|stored|written|lost)|(is|are|remain[s]?) (safe|untouched|unaffected)|no( thing)? .{0,20}(was|were) (changed|written)/i);
    // ...and the true half is present: our fault, nothing on the form to fix,
    // and an accurate description of what the creator is looking at.
    expect(copy.detail).toContain("fault on our side");
    expect(copy.detail).toContain("nothing on the form to correct");
    // AND IT DESCRIBES NO PAGE BEHAVIOUR. This line used to pin
    // "this page stopped" as "an accurate description of what the creator is
    // looking at" — a test enforcing a statement the containment fix had made
    // false, which is worse than the statement alone. What is asserted now is
    // the absence: refusal copy may not narrate the layout, because a layout
    // change would falsify it and only this test would be holding it in place.
    expect(copy.detail).not.toContain("this page stopped");
    expect(copy.detail).toContain("no comparison is shown");
  });

  it("NON-VACUITY: with every read healthy, none of the refusal markers is rendered", async () => {
    // Six refusal assertions above are worth nothing if the happy path also
    // renders them.
    const out = await render();
    for (const marker of [
      "workspace-access-error",
      "results-no-profile",
      "results-no-declared-metric",
      "results-log-blocked",
    ]) {
      expect(out, `${marker} rendered on the happy path`).not.toContain(
        `data-testid="${marker}"`
      );
    }
  });
});
