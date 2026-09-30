// The public Sample Spin's creator-facing words — the panel, every refusal's
// next action, the legal placeholder and the changelog entrypoint — pass the
// same claims canon every product screen passes (lean gate round 1, C-3).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SAMPLE_SPIN_NEXT_ACTION, SAMPLE_ORIGINAL } from "@respin/credits/app-server";
import { SampleSpinPanel } from "../app/(marketing)/sample-spin/sample-spin-panel";
import LegalPage from "../app/(marketing)/legal/page";
import {
  SAMPLE_SPIN_GOES_TO_PROVIDER,
  SAMPLE_SPIN_KEEPS_NOTHING,
  SAMPLE_SPIN_RETENTION,
} from "../app/(marketing)/sample-spin/disclosure";
import { FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS } from "./support/forbidden-claims";
import { claimHits, specimensFor } from "./support/claim-scan";

describe("the Sample Spin's words", () => {
  it("the panel's idle state claims nothing the canon forbids and names the fixture as fictional", () => {
    const html = renderToStaticMarkup(<SampleSpinPanel original={SAMPLE_ORIGINAL} maxCodePoints={600} />);
    expect(claimHits(html, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toEqual([]);
    expect(html).toContain("FICTIONAL");
    expect(html).toContain("NOTHING YOU TYPE IS KEPT");
  });

  // THE DISCLOSURE IS A PAIR, AND EVERY SURFACE OWES BOTH HALVES (batch-5
  // compliance gate, C-3; P6-R7's file row 15).
  //
  // "We keep nothing" and "your text is sent to a third party" are both true,
  // and only together are they honest. The provider half landed on ONE of the
  // three producers — the shouted foot — while the TEXTAREA LABEL, the
  // sentence a person reads as they type and the only one a screen reader
  // announces on focus, still said "Nothing you type is kept" alone, and
  // `/legal` named no provider anywhere on the page.
  //
  // The pin that existed was `toContain("NOTHING YOU TYPE IS KEPT")`, which
  // the PRE-FIX copy satisfied too: a revert would have been green. So this
  // asserts the pair, per surface, against the one exported sentence.
  it("every surface that says the Sample Spin keeps nothing also names the provider", () => {
    const surfaces: [string, string][] = [
      ["the panel", renderToStaticMarkup(<SampleSpinPanel original={SAMPLE_ORIGINAL} maxCodePoints={600} />)],
      ["/legal", renderToStaticMarkup(<LegalPage />)],
    ];
    for (const [where, html] of surfaces) {
      const text = html.toLowerCase();
      expect(text, `${where} does not say the Sample Spin keeps nothing`).toContain(
        SAMPLE_SPIN_KEEPS_NOTHING.toLowerCase()
      );
      expect(
        text,
        `${where} says "keeps nothing" without naming the third-party model provider`
      ).toContain(SAMPLE_SPIN_GOES_TO_PROVIDER.toLowerCase());
    }
  });

  it("the field LABEL carries it, not only the foot", () => {
    // The distinction the first fix missed. A `<label for=…>` is what a screen
    // reader announces when the textarea takes focus; the decorative foot is
    // not. Read the label element specifically rather than the whole page.
    const html = renderToStaticMarkup(
      <SampleSpinPanel original={SAMPLE_ORIGINAL} maxCodePoints={600} />
    );
    const label = /<label[^>]*class="sample-spin-label"[^>]*>([\s\S]*?)<\/label>/.exec(html);
    expect(label, "the Sample Spin field label is no longer where this test reads it").not.toBeNull();
    expect(label![1].toLowerCase()).toContain(SAMPLE_SPIN_GOES_TO_PROVIDER.toLowerCase());
  });

  it("NON-VACUITY: the comfortable half alone does not satisfy the pin", () => {
    // The exact pre-fix string, driven through the same predicate the cases
    // above use. Without this, a revert is green.
    const preFix = "Type an idea for the sample creator, a chair restorer. Nothing you type is kept.";
    expect(preFix.toLowerCase()).toContain(SAMPLE_SPIN_KEEPS_NOTHING.toLowerCase());
    expect(preFix.toLowerCase()).not.toContain(SAMPLE_SPIN_GOES_TO_PROVIDER.toLowerCase());
    // ...and the sentence that replaced it carries both.
    expect(SAMPLE_SPIN_RETENTION.toLowerCase()).toContain(SAMPLE_SPIN_KEEPS_NOTHING.toLowerCase());
    expect(SAMPLE_SPIN_RETENTION.toLowerCase()).toContain(SAMPLE_SPIN_GOES_TO_PROVIDER.toLowerCase());
  });

  it("every refusal's next action is within the canon and never blames the provider for an answer it gave", () => {
    for (const [reason, sentence] of Object.entries(SAMPLE_SPIN_NEXT_ACTION)) {
      expect(claimHits(sentence, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS), reason).toEqual([]);
    }
    expect(SAMPLE_SPIN_NEXT_ACTION.draft_unusable).not.toContain("provider");
    expect(SAMPLE_SPIN_NEXT_ACTION.service_unavailable).toContain("provider");
  });

  it("/legal says the documents are not published and claims nothing the canon forbids", () => {
    const html = renderToStaticMarkup(<LegalPage />);
    expect(claimHits(html, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toEqual([]);
    expect(html).toContain("not published yet");
  });

  it.each(specimensFor(FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS))(
    "PLANTED: %s would be caught in the panel's own markup",
    (label, specimen) => {
      // WAS STRUCTURALLY VACUOUS (audit 2026-09-19 finding 27): the local
      // `violations()` stringified the canon tuples, so the public Sample Spin
      // panel, every refusal sentence and `/legal` were unscanned. This plant
      // is what makes the scan above worth reading.
      const html = renderToStaticMarkup(<SampleSpinPanel original={SAMPLE_ORIGINAL} maxCodePoints={600} />);
      expect(claimHits(`${html}<p>${specimen}</p>`, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toContain(label);
    }
  );
});
