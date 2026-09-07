// Shared fixtures for the `@respin/modes` suites.
//
// ONE SET OF SPECIMENS, several readers: the output parse, the kill test and
// the pipeline all need "a clean hook set" and "a hook set carrying M3's
// planted violation", and two hand-written versions of either would let one
// suite pass on a document the other never sees.
//
// THE CLEAN FIXTURE IS CLEAN AGAINST AN EMPTY CORPUS, deliberately: every
// capitalised word in it is a grammar word on `traceability.ts`'s opener list
// and it carries no digits, so a test that expects "no findings" is not
// quietly relying on a corpus entry it forgot to supply.

/**
 * M3's fourth planted fixture: a hook two words over the 14-word cap.
 *
 * HERE RATHER THAN IN `hard-rules.test.ts`, where it started: importing a
 * `*.test.ts` from another test file re-registers its whole suite in the
 * importer. Measured, not feared — `pipeline.test.ts` reported 54 tests, 22 of
 * which were hard-rules', run a second time under the wrong file's name.
 */
export const SIXTEEN_WORD_HOOK =
  "The one thing nobody ever tells you about shooting your very first video with a phone";

/** A hook set that violates nothing. */
export const CLEAN_HOOKS = {
  hooks: [
    {
      text: "You are shooting three takes when one honest take would do",
      mechanic: "contradiction",
    },
    {
      text: "The setting you skipped is the one your viewer notices first",
      mechanic: "cost reveal",
    },
    {
      text: "Nobody tells you the boring part is where the work happens",
      mechanic: "withheld detail",
    },
  ],
  whyThisPerforms: {
    reasoning:
      "Each hook opens on a different mechanic, so a viewer who ignores one may still stop for another.",
    weakestPoint:
      "None of these has been tested against how your own audience actually behaves.",
  },
  disclosure: {
    platform: "youtube",
    guidance:
      "Say in the description that a tool helped draft this, in your own words.",
  },
};

/** Serialise a fixture the way a model would reply. */
export const asReply = (doc: unknown): string => JSON.stringify(doc);

/** A structurally complete document for every section at once. */
export const EVERY_SECTION = {
  thesis: { statement: "one clear claim", why: "because it is provable" },
  framework: { name: "cost reveal", why: "it fits the footage" },
  hooks: [
    { text: "a hook", mechanic: "contradiction" },
    { text: "another hook", mechanic: "cost reveal" },
    { text: "a third hook", mechanic: "withheld detail" },
  ],
  ideas: [
    { hook: "a hook", thesis: "a thesis", framework: "a framework" },
    { hook: "a second hook", thesis: "a thesis", framework: "a framework" },
    { hook: "a third hook", thesis: "a thesis", framework: "a framework" },
  ],
  beats: [
    { atSeconds: 0, vo: "open on the mess", isTurn: false },
    { atSeconds: 6, vo: "here is the turn", isTurn: true },
  ],
  shotMap: [{ beatIndex: 0, shot: "wide handheld", note: "keep it moving" }],
  onScreenText: [{ atSeconds: 1, text: "the boring part" }],
  caption: { text: "a caption", hashtags: ["one", "two"] },
  whyThisPerforms: {
    reasoning: "it opens on a cost the viewer recognises",
    weakestPoint: "nothing here has been measured on your audience",
  },
  disclosure: { platform: "youtube", guidance: "say a tool helped draft it" },
};
