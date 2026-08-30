// R14/R15 (slice 2b; renamed from /admin/margin in slice 2b-c —
// docs/plans/respin-finish-phase-2b.md's route-rename requirement):
// /admin/model-spend's presentation. Same rendering discipline as
// billing-ui.test.tsx (renderToStaticMarkup against a REAL component with
// REAL props, never a look-alike fixture).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdminModelSpendView,
  usd,
  type AdminModelSpendViewProps,
} from "../app/(admin)/admin/model-spend/model-spend-view";
import type { SpendReconciliationResult } from "@respin/db";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const RESULT_OK: SpendReconciliationResult = {
  rows: [
    {
      workspaceId: "ws_1",
      periodMonth: "2026-06-01",
      tier: "creator",
      rollupCostMicroUsd: 123_456_789n,
      rollupCallCount: 12,
      rollupUnknownCallCount: 2,
      usageCostMicroUsd: 123_456_789n,
      class: "reconciled",
    },
    {
      workspaceId: "ws_2",
      periodMonth: "2026-06-01",
      tier: "pro",
      rollupCostMicroUsd: 9_990_000n,
      rollupCallCount: 3,
      rollupUnknownCallCount: 0,
      usageCostMicroUsd: null,
      class: "orphaned",
    },
  ],
  counts: { reconciled: 1, orphaned: 1, drift: 0 },
  unbilledAttempts: [],
};

describe("usd(): bigint micro-USD -> dollars.cents, no float round-trip", () => {
  it("formats a plain amount", () => {
    // 123,456,789 micro-USD = $123.456789 -> $123.45, truncated to cents.
    expect(usd(123_456_789n)).toBe("$123.45");
  });
  it("formats zero", () => {
    expect(usd(0n)).toBe("$0.00");
  });
  it("formats a large amount without losing precision", () => {
    // 999,990,000 micro-USD = $999.99 exactly.
    expect(usd(999_990_000n)).toBe("$999.99");
  });
});

describe("AdminModelSpendView (R14)", () => {
  it("renders the spend table with month, tier, cost, calls and class", () => {
    const out = html(<AdminModelSpendView ok result={RESULT_OK} />);
    expect(out).toContain('data-testid="model-spend-table"');
    expect(out).toContain("2026-06");
    expect(out).toContain("Creator");
    expect(out).toContain("Pro");
    expect(out).toContain('data-testid="model-spend-class-reconciled"');
    expect(out).toContain('data-testid="model-spend-class-orphaned"');
  });

  // R4: the retained excluded-unknown share must be VISIBLE on the page that
  // renders the rollup, not merely stored on the row (phase-2b.md's own
  // wording: "plus the retained excluded-unknown share (R4)").
  it("renders the retained unknown-call share per grain (R4)", () => {
    const out = html(<AdminModelSpendView ok result={RESULT_OK} />);
    const matches = [...out.matchAll(/data-testid="model-spend-unknown-count">(\d+)</g)];
    expect(matches.map((m) => m[1])).toEqual(["2", "0"]);
  });

  it("an empty result says so plainly, inventing no row", () => {
    const empty: SpendReconciliationResult = {
      rows: [],
      counts: { reconciled: 0, orphaned: 0, drift: 0 },
      unbilledAttempts: [],
    };
    const out = html(<AdminModelSpendView ok result={empty} />);
    expect(out).toContain('data-testid="model-spend-empty"');
  });

  it("a load failure renders the error state, not a crash or an invented number", () => {
    const props: AdminModelSpendViewProps = { ok: false };
    const out = html(<AdminModelSpendView {...props} />);
    expect(out).toContain('data-testid="model-spend-error"');
    expect(out).not.toContain('data-testid="model-spend-table"');
  });

  it("unbilled attempts are listed with a report-not-repair caveat", () => {
    const withUnbilled: SpendReconciliationResult = {
      ...RESULT_OK,
      unbilledAttempts: [
        { attemptId: "att_x", workspaceId: "ws_1", purpose: "onboarding_brain" },
      ],
    };
    const out = html(<AdminModelSpendView ok result={withUnbilled} />);
    expect(out).toContain("att_x");
    expect(out).toContain("report, not an automatic charge");
  });

  it("drift is called out visibly (the only reconciliation class that is a defect)", () => {
    const withDrift: SpendReconciliationResult = {
      ...RESULT_OK,
      counts: { reconciled: 1, orphaned: 0, drift: 2 },
    };
    const out = html(<AdminModelSpendView ok result={withDrift} />);
    expect(out).toMatch(/Drift[\s\S]*?<strong>2<\/strong>/);
  });
});

// ---------------------------------------------------------------- R15 GATE
//
// THE HARD RULE: this page renders cost, never a computed margin figure. The
// scan runs against the REAL RENDERED OUTPUT of a REAL fixture with REAL
// data, the same shape that caught 23 of 33 codes on /onboarding (R-36) —
// not a source-text grep, which a comment could satisfy without the page
// actually being honest. UNCHANGED BY THE ROUTE RENAME: R15 binds the
// component's rendered output, not its file path or URL.

/**
 * VISIBLE TEXT ONLY — strips every tag and its attributes first. Scanning raw
 * markup was this scan's first draft, and it failed on its own render: `<h2
 * style="margin-top:0">` contains the substring "margin" as MARKUP (a CSS
 * property, not a word a person reads), and a scan that cannot tell the two
 * apart flags its own CSS. The `data-testid`s were renamed off `margin-*` in
 * slice 2b-c's billing gate round 1 (2026-08-30, matching this file's own
 * R14 route rename), so the CSS property is now the only surviving "margin"
 * substring in this component's markup — the fixture proof below (a
 * synthetic `data-testid="margin-42"`) still exercises the discrimination
 * this component no longer needs, on the general principle that ANY
 * `data-testid` containing "margin" must not fool the scan, not only the
 * ones this component happens to have today. "Rendered copy" means what a
 * screen reader or a person sees — the same distinction
 * `retention.test.ts`'s `stripComments` draws for source, applied here to
 * markup instead.
 */
function visibleText(rendered: string): string {
  return rendered.replace(/<[^>]*>/g, " ");
}

describe("R15: /admin/model-spend renders NO gross-margin figure", () => {
  const FIXTURES: { name: string; props: AdminModelSpendViewProps }[] = [
    { name: "populated result", props: { ok: true, result: RESULT_OK } },
    {
      name: "result with drift and unbilled attempts",
      props: {
        ok: true,
        result: {
          ...RESULT_OK,
          counts: { reconciled: 1, orphaned: 1, drift: 3 },
          unbilledAttempts: [
            { attemptId: "att_y", workspaceId: "ws_2", purpose: "onboarding_brain" },
          ],
        },
      },
    },
    { name: "load error", props: { ok: false } },
    {
      name: "empty result",
      props: {
        ok: true,
        result: { rows: [], counts: { reconciled: 0, orphaned: 0, drift: 0 }, unbilledAttempts: [] },
      },
    },
  ];

  it.each(FIXTURES)(
    "$name never says the word 'margin' as a label for a number",
    ({ props }) => {
      const out = visibleText(html(<AdminModelSpendView {...props} />));
      // "Margin" appears in PROSE explaining why there is no margin figure —
      // never attached to a rendered number. A specimen proves the scan is
      // not vacuous (fixture-proof pattern, matching table-writers.test.ts's
      // non-vacuity discipline).
      const marginMentions = [...out.matchAll(/margin/gi)];
      for (const m of marginMentions) {
        const windowText = out.slice(
          Math.max(0, m.index! - 5),
          m.index! + 60
        );
        expect(
          windowText,
          `a "margin" mention with a digit nearby: "${windowText}"`
        ).not.toMatch(/margin\D*\d/i);
      }
    }
  );

  it.each(FIXTURES)(
    "$name renders no percentage figure at all",
    ({ props }) => {
      const out = visibleText(html(<AdminModelSpendView {...props} />));
      expect(out).not.toMatch(/\d+(\.\d+)?\s*%/);
    }
  );

  it("FIXTURE PROOF the scan is not vacuous: a planted 'margin: 40%' label would be caught", () => {
    const planted = visibleText("<p>Gross margin: 40%</p>");
    const mentions = [...planted.matchAll(/margin/gi)];
    expect(mentions.length).toBeGreaterThan(0);
    const windowText = planted.slice(
      Math.max(0, mentions[0].index! - 5),
      mentions[0].index! + 60
    );
    expect(windowText).toMatch(/margin\D*\d/i);
    expect(planted).toMatch(/\d+(\.\d+)?\s*%/);
  });

  it("FIXTURE PROOF the scan is not fooled by 'margin' appearing only in MARKUP (style/data-testid), the defect this scan's first draft shipped with", () => {
    const markupOnly = visibleText(
      '<h2 style="margin-top:0" data-testid="margin-42">Reconciliation</h2>'
    );
    expect([...markupOnly.matchAll(/margin\D*\d/gi)]).toHaveLength(0);
  });
});
