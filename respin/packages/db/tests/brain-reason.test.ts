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
  classifyBrainReason,
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

/**
 * THE CLASSIFIER AND THE RENDERER MUST AGREE — proved GENERATIVELY against the
 * real producer, not against a list of hand-picked sentences.
 *
 * `classifyBrainReason` exists because `brain_docs.reason` stores the SENTENCE
 * and the export / `/brain` have to branch on the CODE (the absence sentence is
 * selected by (kind, reason), REQ-I03). That makes this a property between two
 * things that can drift, which is CLAUDE.md's 2026-08-18 lesson exactly: a list
 * of counterexamples closes instances and leaves the class open. So every code
 * is driven through the renderer across a range of the only facts it
 * interpolates, and the round trip is asserted for all of them.
 */
describe("classifyBrainReason: the round trip with the only producer", () => {
  const VERSIONS = [1, 2, 9, 10, 42, 1000];
  const COUNTS = [0, 1, 2, 3, 11, 250];

  it("every rendered sentence classifies back to the code that produced it", () => {
    let checked = 0;
    for (const code of BRAIN_DOC_REASON_CODES) {
      for (const version of VERSIONS) {
        for (const citedInputCount of COUNTS) {
          const sentence = renderBrainReason({ code }, { version, citedInputCount });
          expect(classifyBrainReason(sentence), sentence).toBe(code);
          checked += 1;
        }
      }
    }
    // Non-vacuity: the loops really ran, over every code.
    expect(checked).toBe(
      BRAIN_DOC_REASON_CODES.length * VERSIONS.length * COUNTS.length
    );
  });

  it("no rendered sentence classifies as a code OTHER than its own", () => {
    // Mutual exclusivity stated separately: a pattern widened until it also
    // matches a sibling's sentence would still pass the round trip above if it
    // happened to be tried first.
    for (const code of BRAIN_DOC_REASON_CODES) {
      const sentence = renderBrainReason({ code }, { version: 7, citedInputCount: 4 });
      for (const other of BRAIN_DOC_REASON_CODES) {
        if (other === code) continue;
        const otherSentence = renderBrainReason(
          { code: other },
          { version: 7, citedInputCount: 4 }
        );
        expect(otherSentence, `${code} and ${other} render the same sentence`).not.toBe(
          sentence
        );
      }
    }
  });

  it("returns null for anything this build did not render", () => {
    // `reason` is `text NOT NULL` on an append-only table, so an incident's
    // hand-run UPDATE is representable. The callers must be able to tell "we
    // do not know why this version exists" from a code, because the honest
    // absence sentence for the first is different (see export.ts).
    for (const stored of [
      "",
      "something nobody rendered",
      "Version 1: built from 3 of your posts.",
      // Near-misses: the shape without the version prefix, and the prefix
      // without a number.
      "you edited this document.",
      "Version: you edited this document.",
      // Trailing prose after the sentence the server composes.
      "Version 1: you edited this document. And here is a detail nobody verified.",
    ]) {
      expect(classifyBrainReason(stored), stored).toBeNull();
    }
  });
});
