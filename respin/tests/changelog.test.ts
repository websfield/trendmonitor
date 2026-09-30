// /changelog states what exists; the shared claims canon forbids it promising
// learning, accuracy, results or the future — the same scan every
// creator-facing screen passes.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHANGELOG } from "../app/(marketing)/changelog/entries";
import { FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS } from "./support/forbidden-claims";
import { claimHits, specimensFor } from "./support/claim-scan";

describe("the changelog", () => {
  it("has dated entries, newest first, each with a title and a summary", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.summary.trim().length).toBeGreaterThan(0);
    }
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("claims nothing the canon forbids, and the scan is proved live on these entries", () => {
    // WAS STRUCTURALLY VACUOUS (audit 2026-09-19 finding 27): this file
    // re-invented the predicate and stringified the canon tuples, so every
    // changelog entry was unscanned while the suite stayed green. The
    // predicate now lives in one place, and the plant below is the witness
    // this file never had.
    for (const entry of CHANGELOG) {
      const text = `${entry.title} ${entry.summary}`;
      expect(claimHits(text, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS), entry.title).toEqual([]);
    }
  });

  it.each(specimensFor(FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS))(
    "PLANTED: %s would be caught in an entry's summary",
    (label, specimen) => {
      const entry = CHANGELOG[0];
      expect(claimHits(`${entry.title} ${entry.summary} ${specimen}`, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toContain(label);
    }
  );

  // THE CANON CANNOT SEE THIS CLASS, AND THAT IS WHY THIS BLOCK EXISTS.
  //
  // The 2026-09-05 entry said the Brain "proposes **Performance Meta rules**
  // from repeated structured feedback" (batch-5 learning gate, L-1). Every
  // word of it passes `FORBIDDEN_CLAIMS` and `PERFORMANCE_CLAIMS`, and it is
  // false in the one direction R-115 and non-negotiable 4 exist to forbid:
  // `performance_meta` is minted ONLY by `buildResultProposalDraft`, which
  // refuses any evidence row that is not `connector_verified`; `feedbackMap`
  // mints `voice` and `killtest` and nothing else. The entry attached the
  // RESULT path's target to the FEEDBACK path's source, on a public page.
  //
  // It was introduced by the repair for audit finding 31 — the previous text
  // read "from result evidence and repeated structured feedback", where the
  // noun at least had a source to attach to. Removing the source and keeping
  // the noun is the sharpest shape of the 2026-07-30 lesson: the sentence
  // written at the moment you believe the property most.
  //
  // So the capability nouns are PINNED to the producer, the way
  // `landing-pricing.test.ts` pins the pricing lines. The population is read
  // out of `proposal.ts`'s own `feedbackMap` literal rather than typed here,
  // because a hand-list of proposal kinds is the thing that just failed.
  describe("the feedback-proposal entry names the targets the code actually mints", () => {
    const proposalSrc = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "..", "packages/brain/src/proposal.ts"),
      "utf8"
    ).replace(/\r\n/g, "\n");

    /** Every `kind` inside `proposal.ts`'s `feedbackMap` literal. */
    const feedbackTargetKinds = (): string[] => {
      const literal = /const feedbackMap[\s\S]*?= \{\n([\s\S]*?)\n\};/.exec(proposalSrc);
      if (literal === null) {
        throw new Error("feedbackMap is no longer where this pin reads it — re-derive before editing the copy");
      }
      return [...new Set([...literal[1]!.matchAll(/kind:\s*"([a-z_]+)"/g)].map((m) => m[1]!))].sort();
    };

    const entry = CHANGELOG.find((e) => e.date === "2026-09-05");

    it("reads the producer, and the read is non-vacuous", () => {
      // If this ever returns [] the two assertions below would pass on an
      // empty population, which is the vacuous-scan shape this whole phase
      // exists to delete.
      expect(feedbackTargetKinds()).toEqual(["killtest", "voice"]);
    });

    it("names a target the feedback path mints, and no target it does not", () => {
      expect(entry, "the 2026-09-05 feedback-proposal entry").toBeDefined();
      const text = `${entry!.title} ${entry!.summary}`.toLowerCase();
      // `performance_meta` is the results-only target. Its human spelling must
      // not appear beside "feedback" anywhere in this entry.
      expect(text, "performance_meta is minted only from connector-verified results").not.toContain("performance meta");
      // ...and the entry must name at least one target that IS minted here,
      // so deleting the nouns altogether does not turn this green.
      expect(
        ["voice", "kill test"].some((noun) => text.includes(noun)),
        "the entry names none of the targets feedbackMap actually mints"
      ).toBe(true);
    });

    it("NON-VACUITY: the old sentence is what this catches", () => {
      const shipped = "The Creator Brain proposes Performance Meta rules from repeated structured feedback".toLowerCase();
      expect(shipped).toContain("performance meta");
    });
  });
});
