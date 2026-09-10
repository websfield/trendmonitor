// /changelog states what exists; the shared claims canon forbids it promising
// learning, accuracy, results or the future — the same scan every
// creator-facing screen passes.
import { describe, expect, it } from "vitest";
import { CHANGELOG } from "../app/(marketing)/changelog/entries";
import { FORBIDDEN_CLAIMS } from "./support/forbidden-claims";

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

  it("claims nothing the canon forbids", () => {
    for (const entry of CHANGELOG) {
      const text = `${entry.title} ${entry.summary}`.toLowerCase();
      for (const claim of FORBIDDEN_CLAIMS) {
        const pattern = typeof claim === "string" ? claim : (claim as { pattern?: RegExp | string }).pattern ?? String(claim);
        const hit = pattern instanceof RegExp ? pattern.test(text) : text.includes(String(pattern).toLowerCase());
        expect(hit, `"${entry.title}" carries a forbidden claim: ${String(pattern)}`).toBe(false);
      }
    }
  });
});
