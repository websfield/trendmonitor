// Plan C1's first evidence state (R-115): only self-reported or unquantified
// results exist, so the comparison section says verified analytics are not
// connected and computes nothing. The other two states (short verified
// population; verified comparison) are driven in results-comparison.test.tsx.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EVIDENCE_STATE_COPY,
  NO_GENERATION_MEANING,
  VERIFICATION_UNAVAILABLE,
} from "../app/(product)/results/copy";
import { LogOutcome } from "../app/(product)/results/log-outcome";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ResultsView, type ResultRowView } from "../app/(product)/results/results-view";
// By path: root tests may read `@respin/brain`; the screen may not compute.
import { buildComparisonGroups } from "../packages/brain/src/comparison";
import type { ComparisonResultInput } from "../packages/brain/src/vocabulary";
import { FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS } from "./support/forbidden-claims";
import { claimHits, specimensFor } from "./support/claim-scan";
import { blankComments } from "./support/app-surface";
import { sourceFilesUnder } from "./support/source-files";

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

// ------------------------------------------------------------------
// AUDIT PHASE 2, P2-A1 (register item 15, R-170): the state is driven from
// REAL `buildComparisonGroups` output on a self-reported-only population —
// `comparisons: []` above was a state production never produced while groups
// were built from self-reported rows.
// ------------------------------------------------------------------
/** The `results-levers-disabled` paragraph of `log-panel.tsx`, as one sentence. */
function leversDisabledSentence(): string {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "app", "(product)", "results", "log-panel.tsx"),
    "utf8"
  );
  const start = source.indexOf('data-testid="results-levers-disabled">');
  expect(start, "the disabled-levers paragraph was not found").toBeGreaterThan(0);
  return source.slice(start, source.indexOf("</p>", start)).replace(/^[^>]*>/, "").replace(/\s+/g, " ").trim();
}

describe("a self-reported-only history, through the real comparison builder (P2-A1)", () => {
  const base = {
    profileId: "profile-1",
    platform: "TikTok",
    audienceClass: "organic" as const,
    metricKey: "follows_per_1k",
    metricDeclaredByDocId: "strategy-v1",
    observedFrom: new Date("2026-08-01T00:00:00Z"),
    observedTo: new Date("2026-08-08T00:00:00Z"),
    evidenceState: "quantified_self_reported" as const,
    reachDenominator: "12000",
    conversionValue: null,
    conversionDenominator: null,
    confounders: [] as const,
  };
  const KEY = "fw-1@2|hooks|act-9|follows_per_1k";
  const rows: ComparisonResultInput[] = [
    ...["g1", "g2", "g3"].map((g, i) => ({ ...base, id: `t${i}`, generationId: g, treatmentKey: KEY, reachValue: String(4000 + i) })),
    ...[0, 1].map((i) => ({ ...base, id: `b${i}`, generationId: null, treatmentKey: null, reachValue: String(1000 + i) })),
  ];

  it("builds no group, and /results renders the unverified state with no 'more results' sentence", () => {
    const groups = buildComparisonGroups({
      profileId: "profile-1",
      results: rows,
      truncated: false,
      declaredMetrics: new Map([["strategy-v1", { key: "follows_per_1k", label: "Follows", unit: "follows", direction: "higher_is_better" as const }]]),
    });
    expect(groups).toEqual([]);
    const html = renderToStaticMarkup(
      <ResultsView
        state={{
          kind: "ready",
          profileName: "Ada",
          metric: { label: "Follows", key: "follows_per_1k", unit: "follows", direction: "higher_is_better" },
          results: rows.map((r) => row({ id: r.id, treatmentKey: r.treatmentKey })),
          moreResults: false,
          comparisonError: null,
          comparisons: groups as never,
        }}
      />,
    );
    expect(html).toContain('data-testid="results-verification-unavailable"');
    expect(html).not.toContain('data-testid="results-no-comparison"');
    expect(html).not.toMatch(/more (verified )?(results?|posts?) in the same group/i);
  });

  // The scan above is live: every canon entry's planted specimen is caught.
  it.each(specimensFor(FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS))("PLANTED: %s is caught", (label, specimen) => {
    expect(claimHits(specimen, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toContain(label);
  });

  it("the four pre-R-115 sentences pass the canon and none says a self-reported result counts", () => {
    const sentences = [
      EVIDENCE_STATE_COPY.quantified_self_reported.meaning,
      NO_GENERATION_MEANING,
      renderToStaticMarkup(<LogOutcome state={{ status: "recorded", resultId: "r", evidenceState: "quantified_self_reported", joinsTreatmentGroup: true }} />),
      renderToStaticMarkup(<LogOutcome state={{ status: "recorded", resultId: "r", evidenceState: "quantified_self_reported", joinsTreatmentGroup: false }} />),
      // `useState` renders only its initial (quantified) branch statically, so
      // the disabled-levers sentence is read from the source, whole.
      leversDisabledSentence(),
    ].map((t) => t.replace(/<[^>]+>/g, " "));
    for (const text of sentences) {
      expect(claimHits(text, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS), text.slice(0, 80)).toEqual([]);
      expect(text).not.toMatch(/can (also )?count towards|counts towards your own baseline|will be counted|every comparison built from them|can join a treatment group|until you log one with numbers/i);
    }
  });
});

// ------------------------------------------------------------------
// THE PRE-R-115 SENTENCE CLASS, AS A SCANNED LIST (Phase 2 gate, learning).
// Four sentences were rewritten by hand and a fifth (`billing-errors.ts`'s
// `result_treatment_key` copy) survived — the instance list was the defect.
// This scans every string literal under `app/**` for the class: a sentence
// saying a logged (self-reported) result is counted, joins a group, or will be
// counted once more is logged. The allowed population is EMPTY; a sixth
// sentence goes red.
// ------------------------------------------------------------------
describe("no app sentence says a logged result is counted (R-115, scanned)", () => {
  const CLASS =
    /counts? towards your own baseline|can (?:also )?count towards|will be counted|can join a treatment group|every comparison built from them|until you log one with numbers/i;

  /** The string literals and JSX text of a source, comments blanked. */
  const prose = (text: string) => blankComments(text);

  it("the class appears in no app file", () => {
    const files = sourceFilesUnder(["app"]);
    expect(files.length).toBeGreaterThan(100);
    const hits = files.filter((f) => CLASS.test(prose(f.text))).map((f) => f.file);
    expect(hits).toEqual([]);
  });

  it.each([
    "it still counts towards your own baseline",
    "It can join a treatment group, because it names one of your drafts.",
    "it will be counted as it stands",
    "it stays out of every comparison until you log one with numbers",
  ])("PLANTED: %s is caught", (sentence) => {
    expect(CLASS.test(prose(`export const S = "${sentence}";`))).toBe(true);
  });

  it("a COMMENT recording the old sentence is not prose", () => {
    expect(CLASS.test(prose(`// used to say it "can join a treatment group"
const x = 1;`))).toBe(false);
  });
});
