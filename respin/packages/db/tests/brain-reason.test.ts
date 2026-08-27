// `brain_docs.reason` carries no invented specific — because no caller prose
// reaches it (C-42, closing the round-5/6 compliance BLOCK).
//
// The finding: C-28 made `content` structural (every enumerated claim position
// must be cited or hold `[check]`), and `reason` — model-written, `text NOT
// NULL`, drawn from the same reference inputs, EXPORTED WHOLE — got an echo
// check and a length cap and no invented-specifics rule. REQ-I03 binds "any
// output". "a devout Catholic mother in Leeds, 42000 followers" echoes nothing,
// fits any cap, and exports verbatim.
import { describe, expect, it } from "vitest";
import {
  BRAIN_DOC_REASON_CODES,
  BrainReasonError,
  renderBrainReason,
  type BrainDocReason,
} from "../src/brain-reason";

const FACTS = { citedInputCount: 3, version: 4 };

/** The compliance reviewer's own fixture, verbatim. */
const INVENTED = "a devout Catholic mother in Leeds, 42000 followers";

describe("the reason a brain version carries is a CODE, not a sentence", () => {
  it("renders every code, and every rendering names the version", () => {
    for (const code of BRAIN_DOC_REASON_CODES) {
      const text = renderBrainReason({ code }, FACTS);
      expect(text, code).toContain("Version 4");
      expect(text.length, code).toBeGreaterThan(20);
    }
  });

  it("counts the cited inputs the SERVER verified, and agrees with itself", () => {
    expect(
      renderBrainReason({ code: "onboarding_inference" }, FACTS)
    ).toContain("3 of your onboarding inputs");
    // Singular, so the sentence is not quietly wrong at n = 1 — the smallest
    // form of "a stored reason describes something that actually happened".
    expect(
      renderBrainReason(
        { code: "onboarding_inference" },
        { citedInputCount: 1, version: 1 }
      )
    ).toContain("1 of your onboarding input.");
  });

  // ---------------------------------------------------------------- THE BAR

  it("cannot be TYPED to carry prose", () => {
    // @ts-expect-error — a free-text reason is not a reason.
    void (({ code: "creator_edit", detail: INVENTED } satisfies BrainDocReason));
    // @ts-expect-error — nor is a bare string, which is what the column used to take.
    void ((INVENTED satisfies BrainDocReason));
  });

  it("cannot be CAST to carry prose either — the runtime, not just the types", () => {
    // 2026-08-21 is in CLAUDE.md's Lessons because proving a field cannot be
    // TYPED is not proving it cannot be CAST: a `status` guard that was typed
    // shut and runtime open stayed GREEN under a planted mutation. So the
    // smuggle goes through `as unknown as`, the way a real cast would.
    const smuggled = {
      code: "creator_edit",
      detail: INVENTED,
      reason: INVENTED,
      note: INVENTED,
    } as unknown as BrainDocReason;
    const text = renderBrainReason(smuggled, FACTS);
    expect(text, "caller prose reached the stored reason").not.toContain(
      "Leeds"
    );
    expect(text).not.toContain("42000");
    expect(text).toBe("Version 4: you edited this document.");
  });

  it("refuses anything that is not a known code, rather than rendering it", () => {
    for (const bad of [
      INVENTED,
      "",
      "onboarding_inference ",
      "ONBOARDING_INFERENCE",
      null,
      undefined,
      42,
      { code: { code: "creator_edit" } },
    ]) {
      expect(
        () =>
          renderBrainReason(
            (typeof bad === "object" && bad !== null && "code" in bad
              ? bad
              : { code: bad }) as unknown as BrainDocReason,
            FACTS
          ),
        String(bad)
      ).toThrow(BrainReasonError);
    }
    // ...and a missing reason object entirely.
    expect(() =>
      renderBrainReason(undefined as unknown as BrainDocReason, FACTS)
    ).toThrow(BrainReasonError);
  });

  it("has NO free-text member anywhere in the closed set", () => {
    // The property stated as a property: if a code is ever added with a payload
    // the renderer interpolates, this is the test that has to be edited to
    // allow it — which is the review point a free-text field would not have.
    for (const code of BRAIN_DOC_REASON_CODES) {
      expect(Object.keys({ code })).toEqual(["code"]);
    }
    expect(BRAIN_DOC_REASON_CODES).toEqual([
      "onboarding_inference",
      "creator_edit",
      "correction",
    ]);
  });
});
