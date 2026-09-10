// Plan C1's first evidence state (R-115): only self-reported or unquantified
// results exist, so the comparison section says verified analytics are not
// connected and computes nothing. The other two states (short verified
// population; verified comparison) are driven in results-comparison.test.tsx.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VERIFICATION_UNAVAILABLE } from "../app/(product)/results/copy";
import { ResultsView, type ResultRowView } from "../app/(product)/results/results-view";

function row(over: Partial<ResultRowView>): ResultRowView {
  return {
    id: "r-1",
    platform: "TikTok",
    audienceClass: "organic",
    observedFrom: "2026-08-01",
    observedTo: "2026-08-08",
    evidenceState: "quantified_self_reported",
    metricKey: "follows_per_1k",
    levers: [
      { lever: "reach", value: "4000", denominator: "12000" },
      { lever: "conversion", value: null, denominator: null },
    ],
    confounders: [],
    treatmentKey: "fw-1@2|hooks|act-9|follows_per_1k",
    note: null,
    ...over,
  };
}

function render(results: ResultRowView[]): string {
  return renderToStaticMarkup(
    <ResultsView
      state={{
        kind: "ready",
        profileName: "Ada",
        metric: { label: "Follows", key: "follows_per_1k", unit: "follows", direction: "higher_is_better" },
        results,
        moreResults: false,
        comparisonError: null,
        comparisons: [],
      }}
    />,
  );
}

describe("results with no verified row", () => {
  it("say the comparison is unavailable because verified analytics are not connected, and show no effect", () => {
    const html = render([row({ id: "r-1" }), row({ id: "r-2", evidenceState: "unquantified", levers: [{ lever: "reach", value: null, denominator: null }, { lever: "conversion", value: null, denominator: null }] })]);
    expect(html).toContain('data-testid="results-verification-unavailable"');
    expect(html).toContain(VERIFICATION_UNAVAILABLE.slice(0, 40));
    expect(html).not.toContain("per 1,000");
  });

  it("NON-VACUITY: a verified row silences the notice", () => {
    const html = render([row({ id: "r-1", evidenceState: "connector_verified" })]);
    expect(html).not.toContain('data-testid="results-verification-unavailable"');
  });

  it("an empty history shows no notice either — absence is not the unavailable state", () => {
    expect(render([])).not.toContain('data-testid="results-verification-unavailable"');
  });
});
