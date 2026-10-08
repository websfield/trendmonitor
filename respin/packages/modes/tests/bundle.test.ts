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
  UNTRUSTED_ENCODING_PROBE,
  bundlePartsFor,
  hashBundleParts,
  promptBundleVersion,
} from "../src/bundle";
import { MODE_IDS } from "../src/modes";
import {
  AUTO_FORM_INSTRUCTION,
  CONSTRAINT_LABELS,
  CREATIVE_BLOCK_HEADER,
  CREATIVE_RULES,
  DRAFT_FENCE_CLOSE,
  DRAFT_FENCE_OPEN,
  FORM_INSTRUCTIONS,
  FORM_REQUESTED_NOTE,
  INPUT_FENCE_CLOSE,
  INPUT_FENCE_OPEN,
  KILL_TEST_DRAFT_FENCE_OPEN,
  NO_CONSTRAINTS_LINE,
  PEOPLE_LABELS,
  UNIVERSAL_LAWS,
  universalLawLines,
  assembleGenerationPrompt,
  assembleRewritePrompt,
  encodeUntrusted,
  type GenerationContext,
} from "../src/assemble";
import { CREATIVE_FORM_MODES } from "../src/creative";
import { assembleKillTestPrompt } from "../src/kill-test";
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
      // Gate note (audit Phase 8): the static labels around per-generation
      // text — the mode's input label, "What was found:", the kill test's two.
      "promptLabels",
      // Slice 8c: the reference block's STATIC words — header, note and the
      // per-field labels. Same argument as `frameworkBlock`: they decide how
      // a model reads another creator's mechanism, and they lived in
      // `contextBlock` where nothing hashed them.
      "referenceBlock",
      "rewriteInstruction",
      // Audit Phase 8 (P8-A4): the universal laws the generation renders —
      // outside the hash until 2026-10-07, against their own docblock's promise.
      "universalLaws",
      // Audit Phase 8 (P8-R2): the untrusted-input fences and the encoding's
      // behaviour — `contextBlock`'s output, which nothing else hashes.
      "untrustedFences",
    ]);
  });

  it("AC5: the fences are IN the hashed part, and flipping one delimiter constant moves the digest", () => {
    const parts = bundlePartsFor("hooks");
    // Non-vacuity: every marker the prompt emits is in the part that is hashed.
    for (const marker of [INPUT_FENCE_OPEN, INPUT_FENCE_CLOSE, DRAFT_FENCE_OPEN, DRAFT_FENCE_CLOSE, KILL_TEST_DRAFT_FENCE_OPEN]) {
      expect(parts.untrustedFences, marker).toContain(marker);
    }
    // ...and the encoding's OUTPUT on the probe, not merely its name.
    expect(parts.untrustedFences).toMatch(/^encoding="/m);
    expect(parts.untrustedFences).toContain("draftMarkers=");
    const flipped = {
      ...parts,
      untrustedFences: parts.untrustedFences.split(INPUT_FENCE_CLOSE).join("<<<END OF INPUT>>>"),
    };
    expect(flipped.untrustedFences).not.toBe(parts.untrustedFences);
    expect(hashBundleParts(flipped)).not.toBe(hashBundleParts(parts));
  });

  it("AC5 non-vacuity: every fence line the ASSEMBLED prompts emit is a line of the hashed part — an inlined literal in contextBlock or the rewrite would be red", () => {
    const context: GenerationContext = {
      universalLaws: [...UNIVERSAL_LAWS],
      frameworks: [],
      brain: { voice: ["plain"], strategy: [], killtest: [] },
      input: "an idea",
      platform: "youtube",
      unvouchedSpecifics: [],
      creative: null,
      recentWork: null,
    };
    const first = assembleGenerationPrompt({ mode: "hooks", context });
    const rewrite = assembleRewritePrompt({
      mode: "hooks",
      context,
      draft: "{}",
      findings: [{ rule: "hook_word_ceiling", shape: "too_long", field: "/hooks/0/text", excerpt: "x", remedy: "r" }] as never,
    });
    const scoring = assembleKillTestPrompt({ draft: "{}", rules: [{ id: "r1", text: "never open on a question" }] });
    const fenceLines = [first.prompt, rewrite.prompt, scoring.prompt]
      .flatMap((p) => p.split("\n"))
      .filter((l) => l.startsWith("<<<"));
    // The five markers, each actually emitted by one of the three prompts.
    expect(new Set(fenceLines)).toEqual(
      new Set([INPUT_FENCE_OPEN, INPUT_FENCE_CLOSE, DRAFT_FENCE_OPEN, DRAFT_FENCE_CLOSE, KILL_TEST_DRAFT_FENCE_OPEN])
    );
    const hashedLines = new Set(bundlePartsFor("hooks").untrustedFences.split("\n"));
    for (const line of fenceLines) expect(hashedLines.has(line), line).toBe(true);
    // ...and the encoding the slot uses is the one whose output is hashed.
    expect(bundlePartsFor("hooks").untrustedFences).toContain(
      "encoding=" + encodeUntrusted(UNTRUSTED_ENCODING_PROBE)
    );
  });

  it("AC14: changing ONE universal-law sentence moves prompt_bundle_version, for every mode", () => {
    const edited = [...UNIVERSAL_LAWS];
    edited[0] = edited[0] + " (edited)";
    for (const m of MODE_IDS) {
      expect(promptBundleVersion(m, 1, edited), m).not.toBe(promptBundleVersion(m));
    }
    // The default IS the product's constant: passing it explicitly changes nothing.
    expect(promptBundleVersion("hooks", 1, UNIVERSAL_LAWS)).toBe(promptBundleVersion("hooks"));
    // The block exactly as the prompt renders it (label and bullets), gate note.
    expect(bundlePartsFor("hooks").universalLaws).toBe(universalLawLines(UNIVERSAL_LAWS).join("\n"));
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

  describe("the claim FIELD POPULATION, GUARDS and OCCURRENCE POLICY (audit Phase 2, P2-R2…R4)", () => {
    // Measured 2026-09-21: none of the three was in the hashed description, so
    // what Phase 2 changes would have left `prompt_bundle_version` unmoved.
    const lineOf = (gates: string, prefix: string) =>
      gates.split("\n").find((l) => l.startsWith(prefix));
    const withLine = (parts: Record<string, string>, prefix: string, edit: (l: string) => string) => ({
      ...parts,
      gates: parts.gates
        .split("\n")
        .map((l) => (l.startsWith(prefix) ? edit(l) : l))
        .join("\n"),
    });

    it("claimFields= carries each hard shape's RESOLVED pointer set, and flipping one entry moves the digest", () => {
      const parts = bundlePartsFor("hooks");
      const line = lineOf(parts.gates, "claimFields=");
      expect(line, "the field population is not in the hash").toBeDefined();
      // Non-vacuity: an explanation-only shape and an every-presented one.
      expect(line).toContain("will perform=/whyThisPerforms/reasoning,/whyThisPerforms/weakestPoint|");
      expect(line).toMatch(/guarantee=[^|]*\/caption\/text/);
      expect(line).not.toMatch(/guarantee=[^|]*\/disclosure\//);
      // Flip ONE entry: `guarantee` back to the explanation section only.
      const flipped = withLine(parts, "claimFields=", (l) =>
        l.replace(/guarantee=[^|]*/, "guarantee=/whyThisPerforms/reasoning,/whyThisPerforms/weakestPoint")
      );
      expect(flipped.gates).not.toBe(parts.gates);
      expect(hashBundleParts(flipped)).not.toBe(hashBundleParts(parts));
    });

    it("claimGuards= carries every guard's window and pattern, and one guard pattern moving moves the digest", () => {
      const parts = bundlePartsFor("hooks");
      const line = lineOf(parts.gates, "claimGuards=");
      expect(line).toContain("disclosure-directive:outside:concealment~");
      // R-173's closed allowlist, every phrase written out.
      expect(line).toContain(" hedges~hedge-no-guarantee:guarantee=no guarantee,no guarantees,there is no guarantee,");
      expect(line).toContain("hedge-not-proven:proven to=");
      expect(line).toContain(' tails~"",", just what worked for me"');
      expect(line).toContain(" admission~/whyThisPerforms/weakestPoint=it's unlikely to go viral,");
      const flipped = withLine(parts, "claimGuards=", (l) => l.replace("i can't guarantee,", ""));
      expect(flipped.gates).not.toBe(parts.gates);
      expect(hashBundleParts(flipped)).not.toBe(hashBundleParts(parts));
    });

    it("claimOccurrence= carries the scan's OUTPUT on the probes, and the occurrence policy moving moves the digest", () => {
      const parts = bundlePartsFor("hooks");
      const line = lineOf(parts.gates, "claimOccurrence=");
      // The strictest-across-occurrences reading, and the em-dash clause.
      expect(line).toContain("goes viral anyway.=>viral=flag/goes viral=hard");
      // R-173's endpoint rule: the hedge admits only a sentence that IS it.
      expect(line).toContain("this will perform.=>will perform=hard/guarantee=hard");
      expect(line).toContain("/caption/text:Results are guaranteed.=>guarantee=hard");
      // A first-occurrence-only policy would have printed `goes viral=flag`.
      const flipped = withLine(parts, "claimOccurrence=", (l) =>
        l.replace("goes viral anyway.=>viral=flag/goes viral=hard", "goes viral anyway.=>viral=flag/goes viral=flag")
      );
      expect(hashBundleParts(flipped)).not.toBe(hashBundleParts(parts));
    });
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

describe("R-148: a version-2 generation runs, and is booked against, its own bundle", () => {
  it("each form mode's v2 bundle differs from its v1 bundle", () => {
    for (const mode of CREATIVE_FORM_MODES) {
      expect(promptBundleVersion(mode, 2), mode).not.toBe(promptBundleVersion(mode));
      expect(promptBundleVersion(mode, 2), mode).toMatch(
        new RegExp(`^${PROMPT_BUNDLE_NAMESPACE}/${mode}@[0-9a-f]{12}$`)
      );
    }
  });

  it("the v2 parts add the creative block and swap the output contract — and nothing else", () => {
    const v1 = bundlePartsFor("ideation");
    const v2 = bundlePartsFor("ideation", 2);
    expect(Object.keys(v2).sort()).toEqual([...Object.keys(v1), "creativeBlock"].sort());
    expect(v2.outputContract).not.toBe(v1.outputContract);
    for (const key of Object.keys(v1)) {
      if (key === "outputContract") continue;
      expect(v2[key], key).toBe(v1[key]);
    }
  });

  it("the creative block carries EVERY static creative sentence the prompt can use", () => {
    const block = bundlePartsFor("ideaToScript", 2).creativeBlock;
    for (const text of [
      CREATIVE_BLOCK_HEADER,
      FORM_REQUESTED_NOTE,
      AUTO_FORM_INSTRUCTION,
      NO_CONSTRAINTS_LINE,
      ...Object.values(FORM_INSTRUCTIONS),
      ...CREATIVE_RULES,
      ...Object.values(CONSTRAINT_LABELS),
      ...Object.values(PEOPLE_LABELS),
    ]) {
      expect(block).toContain(text);
    }
    // ...and the creative block's hash is part of the version: change one
    // sentence of it and the digest moves.
    const parts = bundlePartsFor("ideation", 2);
    expect(
      hashBundleParts({ ...parts, creativeBlock: parts.creativeBlock + " reworded" })
    ).not.toBe(hashBundleParts(parts));
  });

  it("the gate description carries the creative checks' constants, for every mode", () => {
    const gates = bundlePartsFor("hooks").gates;
    expect(gates).toContain("basis=minWords");
    expect(gates).toContain("pivotForForm=");
    expect(gates).toContain("demonstration_experiment:reveal");
    expect(gates).toContain("constraintBounds=");
    expect(gates).toContain("form_mismatch");
  });

  it("L1 moved EVERY mode's bundle: each gate description names R-148's rules", () => {
    // WHY THIS IS PINNED: the bundle version is part of `hashRequest`, so this
    // is what makes an attempt claimed by a pre-L1 build fail its payload-hash
    // check rather than settle under rules it never ran (`generate.ts`'s
    // `CANDIDATE_VERSION` note relies on it). A pre-L1 gate line could not name
    // a rule that did not exist.
    for (const mode of MODE_IDS) {
      const gates = bundlePartsFor(mode).gates;
      for (const rule of [
        "form_mismatch",
        "unsupported_experience",
        "filming_outside_limits",
        "custom_framework_name",
      ]) {
        expect(gates, `${mode} / ${rule}`).toContain(rule);
      }
    }
  });

  it("a mode with no v2 contract has no v2 bundle", () => {
    expect(() => promptBundleVersion("hooks", 2)).toThrow(/no version-2 prompt bundle/);
  });
});
