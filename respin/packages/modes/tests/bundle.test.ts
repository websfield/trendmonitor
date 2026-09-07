// Slice 6 stage B, R4 / REQ-J02: `prompt_bundle_version` is a content hash of
// the mode's assembled system context.
//
// The property that makes it worth having: it moves when the prompt or a gate
// moves, and it does NOT move per creator. A version that changed per
// generation would diagnose nothing, and would put creator content into a
// spend-attribution string.
import { describe, expect, it } from "vitest";

import {
  PROMPT_BUNDLE_NAMESPACE,
  bundlePartsFor,
  hashBundleParts,
  promptBundleVersion,
} from "../src/bundle";
import { MODE_IDS } from "../src/modes";
import { SPECIFIC_SHAPES } from "../src/traceability";

describe("the version string", () => {
  it("names the namespace and the mode, then a digest", () => {
    const v = promptBundleVersion("hooks");
    expect(v.startsWith(PROMPT_BUNDLE_NAMESPACE + "/hooks@")).toBe(true);
    expect(v.split("@")[1]).toMatch(/^[0-9a-f]{12}$/);
  });

  it("is DETERMINISTIC — no clock, no randomness", () => {
    expect(promptBundleVersion("hooks")).toBe(promptBundleVersion("hooks"));
  });

  it("differs per mode, because the brief and the output contract do", () => {
    const versions = MODE_IDS.map((m) => promptBundleVersion(m));
    expect(new Set(versions).size).toBe(MODE_IDS.length);
  });

  it("every mode HAS one — a mode with no bundle would book spend against nothing", () => {
    for (const m of MODE_IDS) {
      expect(promptBundleVersion(m), m).toMatch(/@[0-9a-f]{12}$/);
    }
  });
});

describe("what is in the hash", () => {
  it("covers the system prompt, the brief, the contract, the rewrite text, the scorer and the gates", () => {
    // Named rather than counted, so adding a part is a visible edit here.
    expect(Object.keys(bundlePartsFor("hooks")).sort()).toEqual([
      // Slice 7 round 2: the framework block's STATIC words — its header, the
      // evidence note and the empty-case line. The list is creator-dependent
      // and stays out; these three are instructions the product wrote, and
      // they lived in `contextBlock` where nothing hashed them.
      "frameworkBlock",
      "gates",
      "generationSystem",
      "hardRuleBrief",
      "killTestSystem",
      "modeBrief",
      // Slice 7: which OUTPUT checks this mode runs. Two modes with the same
      // prompt and different gates produce different populations of surviving
      // drafts, which is the question REQ-J02 asks a version to answer.
      "modeChecks",
      "outputContract",
      // Slice 8c: the reference block's STATIC words — header, note and the
      // per-field labels. Same argument as `frameworkBlock`: they decide how
      // a model reads another creator's mechanism, and they lived in
      // `contextBlock` where nothing hashed them.
      "referenceBlock",
      "rewriteInstruction",
    ]);
  });

  it("...and the reference block's own instructions, which are not per creator (slice 8c)", () => {
    const block = bundlePartsFor("analyseAndSpin").referenceBlock;
    expect(block).toContain("adapt it, never quote it");
    expect(block).toContain("not this creator's material");
    expect(block).toContain("Hook mechanic");
    // The same for two modes — the product's words, never a creator's — and
    // it carries no mechanism text at all.
    expect(bundlePartsFor("hooks").referenceBlock).toBe(block);
  });

  it("the gate description carries the CONSTANTS and the PATTERN SOURCES", () => {
    // Loosening the hook cap changes which drafts survive as surely as
    // rewording the prompt does. A bundle version that moved for one and not
    // the other would answer REQ-J02's question wrongly half the time.
    const gates = bundlePartsFor("hooks").gates;
    expect(gates).toContain("hookMaxWords=14");
    expect(gates).toContain("fragment=3x3");
    expect(gates).toContain("its-not-its~");
    expect(gates).toContain("plain-number~");
  });

  it("a HARD RULE's pattern moving moves the version — measured on the slice 8c `month-date` fix", () => {
    // WHAT THIS VERSION EXISTS TO RECORD, in the one case this file can name
    // from its own history. Slice 8c round 1 gave `month-date`'s optional day
    // group a `(?!\d)` digit boundary, because without it "March 2024"
    // tokenised as "March 20" — the rule refused dates the creator had typed
    // and cleared invented years. No prompt word changed; the population of
    // drafts that reach a creator did.
    //
    // MEASURED against the real `bundlePartsFor`/`hashBundleParts` at the time
    // of the fix: `modes/hooks` moved from digest `4812d0cdfa7b` to
    // `cc41f0cd57b3`. The digests are NOT pinned here — pinning a derived
    // digest pins the hash function and reddens on every unrelated prompt edit
    // — so the property is asserted the way it is actually load-bearing: the
    // boundary is IN the hashed gate description, and taking it out changes the
    // digest.
    //
    // SCOPED TO `month-date`'s OWN SEGMENT (round-2 NOTE 1). `toContain` over
    // the whole flat `gates` string was precise only by luck: the literal
    // occurs exactly once today, so the day a second shape carried it,
    // deleting `month-date`'s boundary would have kept this green.
    //
    // The segment is REBUILT from the shape table the way `gateDescription`
    // builds it, rather than parsed back out of the line — because that line
    // cannot be parsed: it joins segments with `|`, which is also regex
    // alternation, and `month-date`'s own source is full of it. Splitting on
    // `|` yields "month-date~\b(?:Jan(?:uary)?" and the assertion silently
    // tests a fragment. (Harmless for the hash, which never parses it.)
    const boundary = "(?!\\d)";
    const parts = bundlePartsFor("hooks");
    const shape = SPECIFIC_SHAPES.find((s) => s.id === "month-date");
    expect(shape, "`month-date` is no longer a declared shape").toBeDefined();
    const segment = shape!.id + "~" + shape!.pattern.source;
    // The segment really is what the hash carries...
    expect(parts.gates).toContain(segment);
    // ...and the boundary is inside THAT segment, not merely somewhere in the
    // description.
    expect(segment).toContain(boundary);
    const without = {
      ...parts,
      gates: parts.gates.replace(segment, segment.split(boundary).join("")),
    };
    expect(without.gates).not.toBe(parts.gates);
    expect(hashBundleParts(without)).not.toBe(hashBundleParts(parts));
  });

  it("...and so does the EXTENT POLICY, which moves with no pattern changing at all", () => {
    // SLICE 8c ROUND 2. The fix that closed the round-2 BLOCK touched no
    // pattern and no enforcement: `SPECIFIC_SHAPES` is byte-identical either
    // side of it. What changed is how the shapes' matches are RESOLVED against
    // one another — and that decides which drafts reach a creator just as
    // surely as a pattern edit, so REQ-J02's question ("what changed?") has to
    // see it. Before this line existed it did not: the rule went from clearing
    // an invented `3x` to refusing it with the digest unmoved.
    //
    // MEASURED against the real hasher in this session: `modes/hooks` moved
    // from `cc41f0cd57b3` (the round-1 digest recorded above) to
    // `344b9be0e52b`. The attribution was checked, not assumed — removing ONLY
    // the `specificExtent=` line from the current bundle reproduced
    // `cc41f0cd57b3` exactly, so every other hashed input is unchanged and the
    // move is this line and nothing else. Neither digest is PINNED here (a
    // pinned derived digest pins the hash function and reddens on every
    // unrelated prompt edit); what is asserted is the load-bearing part — the
    // policy's own output is in the hashed description, and removing it moves
    // the digest.
    const parts = bundlePartsFor("hooks");
    const line = parts.gates
      .split("\n")
      .find((l) => l.startsWith("specificExtent="));
    expect(line, "the extent policy is not in the hash").toBeDefined();
    // It carries the tokeniser's OUTPUT, not a hand-bumped policy name: the
    // resolved `shape:token` pairs are in the string.
    expect(line).toContain("month-date:June");
    expect(line).toContain("multiplier:3x");
    const without = {
      ...parts,
      gates: parts.gates
        .split("\n")
        .filter((l) => !l.startsWith("specificExtent="))
        .join("\n"),
    };
    expect(hashBundleParts(without)).not.toBe(hashBundleParts(parts));
  });

  it("...and the ENFORCEMENTS, which decide what survives as surely as the patterns", () => {
    // Demoting `plain-number` to a flag changes the population of drafts that
    // reach a creator without touching a single pattern source. A bundle
    // version that did not move for that would answer REQ-J02's question
    // ("what changed?") wrongly.
    const gates = bundlePartsFor("hooks").gates;
    expect(gates).toContain("plain-number=flag");
    expect(gates).toContain("currency=hard");
  });

  it("...and the per-mode checks' constants and patterns (slice 7)", () => {
    // Same argument as `hookMaxWords`: moving the hook-overlap threshold or the
    // thesis word floor changes which drafts reach a creator with no prompt
    // edit at all, so a version that did not move for it would misattribute the
    // change.
    const gates = bundlePartsFor("hooks").gates;
    expect(gates).toContain("modeCheck=hookSpread0.6/3");
    expect(gates).toContain("summaryRegister=describes-the-source~");
    expect(gates).toContain("namesNothing=bare-none~");
  });

  it("...and the framework block's own instructions, which are not per creator", () => {
    // The evidence note is what stops a rung being read as a score. Deleting
    // it changes what a model does with an `unsupported` framework on every
    // generation that offers one, and REQ-J02's question is "what changed?".
    const block = bundlePartsFor("hooks").frameworkBlock;
    expect(block).toContain("use one of these, by its own name");
    expect(block).toContain("not a prediction, and not a promise");
    expect(block).toContain("say so in the weakest point");
    // ...and it is the SAME for two modes: it is the product's words, not the
    // creator's, which is why it belongs in a version at all.
    expect(bundlePartsFor("caption").frameworkBlock).toBe(block);
  });

  it("...and WHICH checks the mode declares, which differs per mode", () => {
    expect(bundlePartsFor("sourceToReel").modeChecks).toContain(
      "source_fidelity"
    );
    expect(bundlePartsFor("caption").modeChecks).not.toContain(
      "source_fidelity"
    );
  });

  it("...and the claim vocabulary, which is the fifth rule", () => {
    const gates = bundlePartsFor("hooks").gates;
    expect(gates).toContain("performance:will perform~");
    expect(gates).toContain("concealment:skip the label~");
  });

  it("...and which claim shapes may REFUSE, which moves without a pattern moving", () => {
    // A bare metric noun demoted to a flag changes which drafts reach a
    // creator while every pattern source stays byte-identical.
    const gates = bundlePartsFor("hooks").gates;
    expect(gates).toContain("views=flag");
    expect(gates).toContain("will perform=hard");
  });

  it("a gate change MOVES the version", () => {
    // The property stated end to end rather than per part: the digest of the
    // real bundle differs from the digest of the same bundle with one gate
    // description altered.
    const parts = bundlePartsFor("hooks");
    expect(
      hashBundleParts({ ...parts, gates: parts.gates.replace("=flag", "=hard") })
    ).not.toBe(hashBundleParts(parts));
  });

  it("changing ANY part changes the digest", () => {
    const parts = bundlePartsFor("hooks");
    for (const key of Object.keys(parts)) {
      const moved = { ...parts, [key]: parts[key] + " " };
      expect(hashBundleParts(moved), key).not.toBe(hashBundleParts(parts));
    }
  });
});

describe("the canonicalisation", () => {
  it("does not depend on key ORDER — a refactor is not a version bump", () => {
    expect(hashBundleParts({ a: "1", b: "2" })).toBe(
      hashBundleParts({ b: "2", a: "1" })
    );
  });

  it("SEPARATES fields, so two different bundles cannot collide", () => {
    // The claim in `bundle.ts`'s docblock, COMPUTED rather than asserted: the
    // naive space-join really does collide on this pair, and the real one does
    // not.
    const naive = (p: Record<string, string>) =>
      Object.keys(p)
        .sort()
        .map((k) => k + " " + p[k])
        .join("");
    expect(naive({ a: "b", c: "d" })).toBe(naive({ a: "bc d" }));
    expect(hashBundleParts({ a: "b", c: "d" })).not.toBe(
      hashBundleParts({ a: "bc d" })
    );
  });

  it("an empty bundle is not the same as a one-empty-part bundle", () => {
    expect(hashBundleParts({})).not.toBe(hashBundleParts({ a: "" }));
  });
});
