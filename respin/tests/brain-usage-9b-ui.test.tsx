import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createTestDb,
  creatorProfiles,
  ensureUserWorkspace,
  enumerateClaimFields,
  mintProfileScope,
  openBrainExport,
  readBrainHistory,
  renderBrainReason,
  seedAuthUser,
  withWorkspace,
  writeCapabilities,
  type BrainVersionView,
  type SourceEvidenceEntry,
} from "@respin/db";
import { BURN_PERIOD_COPY, type UsageRunwayResult } from "@respin/credits/app-server";
import {
  BrainView,
  type BrainViewProps,
} from "../app/(product)/brain/brain-view";
import {
  UsageView,
  type UsageViewProps,
} from "../app/(product)/usage/usage-view";
import {
  FORBIDDEN_CLAIMS,
  PERFORMANCE_CLAIMS,
} from "./support/forbidden-claims";
import { claimHits, specimensFor } from "./support/claim-scan";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AS_OF = new Date("2026-09-05T12:00:00.000Z");

const performanceVersion = (over: Partial<BrainVersionView> = {}): BrainVersionView => ({
  brainDocId: "performance-1",
  version: 1,
  status: "active",
  reason: renderBrainReason(
    { code: "brain_promotion" },
    { citedInputCount: 3, version: 1 }
  ),
  claims: [
    { pointer: "/rules/0/metricLabel", value: "This will perform and get more views", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/metricKey", value: "qualified_leads", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/metricUnit", value: "leads", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/metricDirection", value: "higher_is_better", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/lever", value: "conversion", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/platform", value: "youtube", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/audienceClass", value: "organic", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/observedFrom", value: "2026-08-01", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/observedTo", value: "2026-08-31", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/pastOutcome", value: "better", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/treatmentN", value: "3", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/baselineN", value: "3", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/treatmentMedianPer1k", value: "60", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/baselineMedianPer1k", value: "40", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/effectPer1k", value: "20", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/selfReportedN", value: "2", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/connectorVerifiedN", value: "4", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/evidenceStrength", value: "repeated", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/confounders/0", value: "topic_overlap", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
    { pointer: "/rules/0/confounders/1", value: "platform_change", isPlaceholder: false, quote: null, source: null, evidenceAnnotation: null, confirmed: true },
  ],
  confirmedAt: AS_OF,
  activatedAt: AS_OF,
  supersededAt: null,
  replacedByVersion: null,
  createdAt: AS_OF,
  updatedAt: AS_OF,
  ...over,
});

const proposal = {
  id: "proposal-1",
  source: "results",
  status: "accepted",
  evidenceDigest: "a".repeat(64),
  createdAt: AS_OF,
  acceptedActivationId: "activation-1",
  acceptedBrainDocId: "performance-1",
  decisionUserId: "00000000-0000-4000-8000-000000000001",
  decisionRole: "owner",
  decisionAt: AS_OF,
} as const;

const brainProps: BrainViewProps = {
  profileName: "Anna",
  voice: { proposed: null, active: null },
  strategy: { proposed: null, active: null },
  killtest: { proposed: null, active: null },
  voiceHistory: [],
  strategyHistory: [],
  killtestHistory: [],
  performanceHistory: [performanceVersion()],
  proposalHistory: [{ proposal, resultEvidenceIds: ["result-1"], feedbackEvidenceIds: [] }],
  assetCounts: { brainVersions: 4, testedRules: 1, loggedResults: 6, feedback: 2 },
  interviewTouchedButUndrafted: { strategy: false, killtest: false },
  decideBlock: null,
  confirmVoiceAction: "/brain",
  confirmStrategyAction: "/brain",
  confirmKillTestAction: "/brain",
  editVoiceAction: "/brain",
  editStrategyAction: "/brain",
  editKillTestAction: "/brain",
  editMetricAction: "/brain",
  activateVoiceAction: "/brain",
  activateStrategyAction: "/brain",
  activateKillTestAction: "/brain",
  exportJsonHref: null,
  exportMarkdownHref: null,
  error: null,
};

const usageProps: UsageViewProps = {
  balance: { ok: true, value: 20, asOf: AS_OF },
  burn: { ok: true, hasAnyDebit: false },
  period: { start: AS_OF, ...BURN_PERIOD_COPY.calendar_month },
  burnByMode: { ok: true, byMode: [], notAGeneration: { credits: 0, debits: 0 }, nonTerminalClaim: { credits: 0, debits: 0 } },
  runway: {
    state: "estimate",
    asOf: AS_OF,
    windowStart: AS_OF,
    trailingWindowDays: 30,
    minimumDebitDays: 3,
    debitDayCount: 3,
    balance: 20,
    totalDebit: 12,
    dailyRate: 0.4,
    daysToEmpty: 50,
  },
  brainAssets: {
    state: "available",
    brainVersions: 4,
    testedRules: 1,
    loggedResults: 6,
    feedback: 2,
  },
  rows: [],
  moreRows: false,
  paused: null,
  portal: { available: false, reason: "No billing account." },
  error: null,
  billingHref: "/settings/billing",
};

async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let output = "";
  for await (const chunk of chunks) output += chunk;
  return output;
}

describe("9b Brain asset and Performance Meta UI", () => {
  it("carries a real stored numeric Performance Meta document through history, Brain, and Markdown", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "performance_meta_ui");
    const { workspace } = await ensureUserWorkspace(db, {
      authUserId: "performance_meta_ui",
      name: "Performance Meta",
    });
    const [profile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: workspace.id, displayName: "Anna" })
      .returning();
    const scope = await withWorkspace(db, { authUserId: "performance_meta_ui" });
    const caps = writeCapabilities(await mintProfileScope(db, scope, profile.id));
    const content = {
      rules: [{
        metricLabel: "This will perform and get more views",
        metricKey: "qualified_leads",
        metricUnit: "leads",
        metricDirection: "lower_is_better" as const,
        lever: "conversion" as const,
        platform: "youtube",
        audienceClass: "organic" as const,
        observedFrom: "2026-08-01",
        observedTo: "2026-08-31",
        treatmentN: 3,
        baselineN: 3,
        treatmentMedianPer1k: 40,
        baselineMedianPer1k: 60,
        effectPer1k: -20,
        pastOutcome: "better" as const,
        evidenceStrength: "repeated" as const,
        selfReportedN: 2,
        connectorVerifiedN: 4,
        confounders: ["topic_overlap" as const, "platform_change" as const],
      }],
    };
    const pointers = enumerateClaimFields("performance_meta", content);
    const evidenceText = pointers.map((pointer) => `Evidence for ${pointer}`).join("\n");
    const input = await caps.appendOnboardingInput({
      inputClass: "creator_authored",
      fieldKey: "performance_meta",
      content: evidenceText,
    });
    const sourceEvidence: SourceEvidenceEntry[] = pointers.map((field) => {
      const quote = `Evidence for ${field}`;
      const startUtf16 = input.content.indexOf(quote);
      return { field, quote, inputId: input.id, startUtf16, endUtf16: startUtf16 + quote.length };
    });
    await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "performance_meta",
          content,
          sourceEvidence,
          reason: { code: "brain_promotion" },
        },
        tx
      )
    );

    const history = await readBrainHistory(db, scope, profile.id, "performance_meta");
    expect(history).toHaveLength(1);
    expect(history[0]?.claims.find((claim) => claim.pointer === "/rules/0/effectPer1k")?.value).toBe("-20");
    expect(history[0]?.claims.find((claim) => claim.pointer === "/rules/0/treatmentN")?.value).toBe("3");

    const html = renderToStaticMarkup(<BrainView {...brainProps} performanceHistory={history} />);
    expect(html).toContain("This treatment was lower than this baseline in these observations.");
    expect(html).toContain("Signed effect per 1,000</dt><dd>-20</dd>");

    const markdown = await collect(await openBrainExport(db, scope, profile.id, "markdown"));
    expect(markdown).toContain("Creator-authored metric label: This will perform and get more views");
    expect(markdown).toContain("- Signed effect per 1,000: -20");
    expect(markdown).toContain("This treatment was lower than this baseline in these observations.");
    expect(markdown).toContain("This describes past observations, does not establish cause, and is not a forecast.");

    const productMarkdown = markdown
      .replace(/^Creator-authored metric label:.*$/m, "")
      .toLowerCase();
    // ONE PREDICATE (P1-R4, applied 2026-09-21). This ran its own loop over
    // the shared module-level RegExp objects — correctly shaped, so invisible
    // to every scanner, and one of six the batch-5 compliance gate counted.
    expect(claimHits(productMarkdown, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toEqual([]);
    for (const specimen of ["this draft will perform", "it outperforms your last post"]) {
      expect(
        claimHits(`${productMarkdown} ${specimen}`, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS).length
      ).toBeGreaterThan(0);
    }
  });

  // PER ENTRY, NOT TWO SENTENCES. The two specimens above prove the scan is
  // live; they do not prove it is live PER PATTERN, and a typo in one entry
  // leaves that word sayable here while both of them still go red on some
  // other pattern. This is the `CLAIM_SPECIMENS` loop the sixteen working
  // consumers carry and this file was recorded as owing (`PLANT_OWED`).
  it.each(specimensFor(FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS))(
    "PLANTED: %s would be caught in this screen's exported markdown",
    (label, specimen) => {
      expect(claimHits(specimen, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toContain(label);
    }
  );

  it("renders exact asset counts, immutable membership, and accepted activation", () => {
    const html = renderToStaticMarkup(<BrainView {...brainProps} />);
    expect(html).toContain("4</span> brain versions");
    expect(html).toContain("1</span> tested rules");
    expect(html).toContain("6</span> logged results");
    expect(html).toContain("2</span> feedback entries");
    expect(html).toContain("Result evidence IDs: result-1.");
    expect(html).toContain("Feedback evidence IDs: None.");
    expect(html).toContain("Accepted activation: activation-1.");
    expect(html).toContain("Member 00000000-0000-4000-8000-000000000001 · owner");
    expect(html).toContain("Recorded 2026-09-05T12:00:00.000Z");
  });

  it("attributes a terminal decision after the actor has been deleted without inventing a name", () => {
    const deletedActor = { ...proposal, decisionUserId: null };
    const html = renderToStaticMarkup(
      <BrainView
        {...brainProps}
        proposalHistory={[{ proposal: deletedActor, resultEvidenceIds: [], feedbackEvidenceIds: [] }]}
      />
    );
    expect(html).toContain("Deleted member · owner");
    expect(html).toContain("Recorded 2026-09-05T12:00:00.000Z");
    expect(html).not.toContain("Deleted member Anna");
  });

  it("states the past-tense outcome, non-causal limit, and evidence-strength limit", () => {
    const html = renderToStaticMarkup(<BrainView {...brainProps} />);
    expect(html).toContain("This treatment was higher than this baseline in these observations.");
    expect(html).toContain("This describes past observations, does not establish cause, and is not a forecast.");
    expect(html).toContain("Evidence strength describes the recorded evidence, not confidence or probability.");
  });

  it("renders every stored C5 field and structured confounders", () => {
    const html = renderToStaticMarkup(<BrainView {...brainProps} />);
    for (const value of [
      "qualified_leads", "leads", "higher_is_better", "conversion", "youtube", "organic",
      "2026-08-01 to 2026-08-31", "n 3; median per 1,000 60", "n 3; median per 1,000 40",
      "Signed effect per 1,000", "Past outcome", "2 quantified self-reported; 4 connector verified",
      "topic_overlap", "platform_change",
    ]) expect(html).toContain(value);
  });

  it("uses the signed stored effect for a lower-is-better observed relation, not pastOutcome", () => {
    const lower = performanceVersion({
      claims: performanceVersion().claims.map((claim) =>
        claim.pointer === "/rules/0/metricDirection"
          ? { ...claim, value: "lower_is_better" }
          : claim.pointer === "/rules/0/effectPer1k"
            ? { ...claim, value: "-20" }
            : claim
      ),
    });
    const html = renderToStaticMarkup(<BrainView {...brainProps} performanceHistory={[lower]} />);
    expect(html).toContain("This treatment was lower than this baseline in these observations.");
    expect(html).toContain("Past outcome</dt><dd>better</dd>");
  });

  it("scans product-built Performance Meta copy with planted forecast and efficacy specimens, while excluding escaped creator-authored data", () => {
    const html = renderToStaticMarkup(<BrainView {...brainProps} />);
    const productCopy = html
      .replace(/<p[^>]*data-creator-authored[^>]*>[\s\S]*?<\/p>/g, "")
      // The required evidence-strength disclosure names the word in order to
      // deny it. Remove that exact required sentence, not the word, so a new
      // confidence claim still fails the shared canon scan.
      .replace(/Evidence strength describes the recorded evidence, not confidence or probability\./g, "")
      .toLowerCase();
    expect(claimHits(productCopy, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toEqual([]);
    expect(html).toContain("Creator-authored metric label: This will perform and get more views");
    for (const specimen of ["this draft will perform", "it outperforms your last post"]) {
      const planted = `${productCopy} ${specimen}`;
      expect(
        claimHits(planted, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS).length
      ).toBeGreaterThan(0);
    }
  });
});

describe("9b days-to-empty UI", () => {
  it("keeps the compact brain-asset read and /brain link available during pause and on Free", () => {
    for (const props of [
      { paused: { resumesAt: null }, brainAssets: usageProps.brainAssets },
      { paused: null, brainAssets: usageProps.brainAssets },
    ]) {
      const html = renderToStaticMarkup(<UsageView {...usageProps} {...props} />);
      expect(html).toContain('data-testid="usage-brain-assets"');
      expect(html).toContain('href="/brain"');
      expect(html).toContain("4</span> brain versions");
    }
  });

  it("renders the estimate from the projection, with its configured window, debit days, balance and as-of", () => {
    const html = renderToStaticMarkup(<UsageView {...usageProps} />);
    expect(html).toContain("Estimated 50 days to empty.");
    expect(html).toContain("configured trailing 30 days, 3 distinct debit days");
    expect(html).toContain("ledger-derived balance of 20 credits as of 2026-09-05T12:00:00.000Z");
  });

  const closedRunways: [string, UsageRunwayResult, string][] = [
    ["paused", { ...usageProps.runway, state: "paused" as const }, "Not applicable while this workspace is paused"],
    ["no spend", { ...usageProps.runway, state: "no_spend" as const }, "No debit was recorded in the configured trailing 30 days"],
    ["too few debit days", { ...usageProps.runway, state: "too_few_debit_days" as const, debitDayCount: 2 }, "It needs at least 3 debit days"],
  ] as unknown as [string, UsageRunwayResult, string][];
  it.each(closedRunways)("renders the %s closed state", (_label, runway, expected) => {
    expect(renderToStaticMarkup(<UsageView {...usageProps} runway={runway} />)).toContain(expected);
  });

  it.each([
    ["config", "the configured trailing window could not be read"],
    ["pause", "the pause state could not be read"],
    ["balance", "the ledger-derived balance could not be read"],
    ["ledger", "the ledger debit history could not be read"],
  ] as const)("renders the %s reader absence", (component, expected) => {
    const runway = { state: "read_unavailable" as const, component, asOf: AS_OF };
    expect(renderToStaticMarkup(<UsageView {...usageProps} runway={runway} />)).toContain(expected);
  });

  it("uses the runway reader rather than page rows, model usage, or the spend rollup", () => {
    const page = readFileSync(join(ROOT, "app", "(product)", "usage", "page.tsx"), "utf8");
    const view = readFileSync(join(ROOT, "app", "(product)", "usage", "usage-view.tsx"), "utf8");
    expect(page).toContain("respinCredits.usageRunwayFor(scope)");
    expect(page).toContain("respinDb.brainAssetSummary(scope, profile.id)");
    const runwayPanel = view.slice(
      view.indexOf("function RunwayPanel"),
      view.indexOf("export function UsageView")
    );
    expect(runwayPanel).not.toContain("daysToEmptyNote");
    expect(runwayPanel).not.toMatch(/model_usage|workspace_spend_monthly/);
  });
});
