// The public Sample Spin's creator-facing words — the panel, every refusal's
// next action, the legal placeholder and the changelog entrypoint — pass the
// same claims canon every product screen passes (lean gate round 1, C-3).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SAMPLE_SPIN_NEXT_ACTION, SAMPLE_ORIGINAL } from "@respin/credits/app-server";
import { SampleSpinPanel } from "../app/(marketing)/sample-spin/sample-spin-panel";
import LegalPage from "../app/(marketing)/legal/page";
import { FORBIDDEN_CLAIMS } from "./support/forbidden-claims";

function violations(text: string): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const claim of FORBIDDEN_CLAIMS) {
    const pattern = typeof claim === "string" ? claim : (claim as { pattern?: RegExp | string }).pattern ?? String(claim);
    const hit = pattern instanceof RegExp ? pattern.test(lower) : lower.includes(String(pattern).toLowerCase());
    if (hit) hits.push(String(pattern));
  }
  return hits;
}

describe("the Sample Spin's words", () => {
  it("the panel's idle state claims nothing the canon forbids and names the fixture as fictional", () => {
    const html = renderToStaticMarkup(<SampleSpinPanel original={SAMPLE_ORIGINAL} maxCodePoints={600} />);
    expect(violations(html)).toEqual([]);
    expect(html).toContain("FICTIONAL");
    expect(html).toContain("NOTHING YOU TYPE IS KEPT");
  });

  it("every refusal's next action is within the canon and never blames the provider for an answer it gave", () => {
    for (const [reason, sentence] of Object.entries(SAMPLE_SPIN_NEXT_ACTION)) {
      expect(violations(sentence), reason).toEqual([]);
    }
    expect(SAMPLE_SPIN_NEXT_ACTION.draft_unusable).not.toContain("provider");
    expect(SAMPLE_SPIN_NEXT_ACTION.service_unavailable).toContain("provider");
  });

  it("/legal says the documents are not published and claims nothing the canon forbids", () => {
    const html = renderToStaticMarkup(<LegalPage />);
    expect(violations(html)).toEqual([]);
    expect(html).toContain("not published yet");
  });
});
