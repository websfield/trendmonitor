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
      "gates",
      "generationSystem",
      "hardRuleBrief",
      "killTestSystem",
      "modeBrief",
      "outputContract",
      "rewriteInstruction",
    ]);
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

  it("...and the ENFORCEMENTS, which decide what survives as surely as the patterns", () => {
    // Demoting `plain-number` to a flag changes the population of drafts that
    // reach a creator without touching a single pattern source. A bundle
    // version that did not move for that would answer REQ-J02's question
    // ("what changed?") wrongly.
    const gates = bundlePartsFor("hooks").gates;
    expect(gates).toContain("plain-number=flag");
    expect(gates).toContain("currency=hard");
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
