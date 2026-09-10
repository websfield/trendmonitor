// /admin/activation's presentation (Phase 10a plan C5, R-121): a small cell is
// shown with its external-suppression label and never as zero, an expired
// aggregate is withheld with its reason, every row's limitation is printed,
// and the day-90 target reads as a target.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ACTIVATION_TARGET_SENTENCE,
  AdminActivationView,
  EXPIRED_LABEL,
  SMALL_CELL_LABEL,
  WINDOW_OPEN_LABEL,
} from "../app/(admin)/admin/activation/activation-view";
import { FORBIDDEN_CLAIMS } from "./support/forbidden-claims";

const LIMITATION = "emailVerified is read as of capture; Better Auth stores no verification timestamp, so late verifiers are counted as activated";

const cohorts = [
  { cohortDate: "2026-09-01", metricVersion: 1, signups: 25, activated: 10, excluded: 1, smallCell: false, aggregateExpired: false, matured: true, limitation: LIMITATION },
  { cohortDate: "2026-09-02", metricVersion: 1, signups: 3, activated: 3, excluded: 0, smallCell: true, aggregateExpired: false, matured: true, limitation: LIMITATION },
  { cohortDate: "2024-01-01", metricVersion: 1, signups: 40, activated: 20, excluded: 0, smallCell: false, aggregateExpired: true, matured: true, limitation: LIMITATION },
  // Yesterday: its last signup's window is still open (lean gate round 1, L-1).
  { cohortDate: "2026-09-08", metricVersion: 1, signups: 7, activated: 7, excluded: 0, smallCell: true, aggregateExpired: false, matured: false, limitation: LIMITATION },
];

describe("AdminActivationView", () => {
  const html = renderToStaticMarkup(<AdminActivationView ok cohorts={cohorts} asOf="2026-09-09T00:00:00.000Z" />);

  it("shows the exact counts, labels the small cell as externally suppressed (never zero), and withholds the expired row's rate", () => {
    expect(html).toContain("40.0%");
    expect(html).toContain(SMALL_CELL_LABEL);
    expect(html).toContain(">3<");
    expect(html).not.toContain(">0.0%<");
    expect((html.match(new RegExp(EXPIRED_LABEL, "g")) ?? []).length).toBe(2);
    expect(html).toContain("aggregate counts only");
  });

  it("an open window is labelled, its counts marked partial, and it carries NO rate (R-121)", () => {
    expect((html.match(new RegExp(WINDOW_OPEN_LABEL, "g")) ?? []).length).toBeGreaterThanOrEqual(3);
    const openRow = html.slice(html.indexOf("<td>2026-09-08</td>"), html.indexOf("</tr>", html.indexOf("<td>2026-09-08</td>")));
    expect(openRow).toContain("7 (partial)");
    // 7 of 7 would be 100.0%; the open window's row carries no percentage at all.
    expect(openRow).not.toMatch(/\d+\.\d%/);
  });

  it("prints the limitation on the report and the target as a target", () => {
    expect(html).toContain(LIMITATION);
    expect(html).toContain(ACTIVATION_TARGET_SENTENCE);
    expect(ACTIVATION_TARGET_SENTENCE).toMatch(/Target, not evidence/);
  });

  it("an empty report is an absence, not a zero rate; a failed read says so", () => {
    expect(renderToStaticMarkup(<AdminActivationView ok cohorts={[]} asOf="x" />)).toContain("not a zero rate");
    expect(renderToStaticMarkup(<AdminActivationView ok={false} />)).toContain("could not be loaded");
  });

  it("claims nothing the canon forbids", () => {
    const text = html.toLowerCase();
    for (const claim of FORBIDDEN_CLAIMS) {
      const pattern = typeof claim === "string" ? claim : (claim as { pattern?: RegExp | string }).pattern ?? String(claim);
      const hit = pattern instanceof RegExp ? pattern.test(text) : text.includes(String(pattern).toLowerCase());
      expect(hit, `forbidden claim: ${String(pattern)}`).toBe(false);
    }
  });
});
