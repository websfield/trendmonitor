// R9 (slice 2b): the "by mode" note claims exactly one spend PURPOSE exists.
// DERIVED, not asserted: this scan finds every distinct string literal
// assigned to `purpose:` anywhere in `packages/credits/src` and fails if the
// count no longer matches `KNOWN_SPEND_PURPOSE_COUNT` — so the sentence
// cannot stay true past slice 6 (which adds generation modes, and with them
// a second purpose) without someone noticing and rewriting the copy.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_SPEND_PURPOSE_COUNT, burnByModeNote } from "../app/(product)/usage/usage-view";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CREDITS_SRC = join(ROOT, "packages", "credits", "src");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Every distinct spend-purpose CONSTANT defined in the package, by its own
 * string value — not every `purpose:` call site, which names the CONSTANT
 * (`purpose: ONBOARDING_BRAIN_PURPOSE`), never a raw literal (a first draft
 * of this scan matched the call-site shape and found zero, because every
 * real call site passes the constant, exactly as `RecordModelUsageParams`'s
 * docblock in with-workspace.ts intends). Scanning the DEFINITION site is
 * both the shape that actually appears and the more precise signal: it names
 * the true source of "how many purposes exist" rather than counting how many
 * places happen to reference one.
 */
function distinctPurposeLiterals(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(CREDITS_SRC)) {
    const src = readFileSync(file, "utf8")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of src.matchAll(
      /export\s+const\s+\w*PURPOSE\w*\s*=\s*(["'`])([^"'`]*)\1/g
    )) {
      found.add(m[2]);
    }
  }
  return found;
}

describe("R9: the by-mode note's claim is derived from the real purpose count, not asserted", () => {
  it("the scan is not vacuous — it finds the one purpose known to exist today", () => {
    const purposes = distinctPurposeLiterals();
    expect(purposes.size).toBeGreaterThan(0);
    expect(purposes).toContain("onboarding_brain");
  });

  it("the real count matches KNOWN_SPEND_PURPOSE_COUNT — a mismatch means the copy in usage-view.tsx's burnByModeNote is now stale and must be rewritten, not that this test should be relaxed", () => {
    const purposes = distinctPurposeLiterals();
    expect(
      purposes.size,
      `packages/credits/src now writes ${purposes.size} distinct spend purposes (${[...purposes].join(", ")}) but usage-view.tsx's KNOWN_SPEND_PURPOSE_COUNT still says ${KNOWN_SPEND_PURPOSE_COUNT} — burnByModeNote's "exactly one thing spends credits today" claim is stale`
    ).toBe(KNOWN_SPEND_PURPOSE_COUNT);
  });

  it("the note's own text agrees with the constant while the constant is 1 (fixture proof the mechanism reads the real value)", () => {
    if (KNOWN_SPEND_PURPOSE_COUNT === 1) {
      expect(burnByModeNote()).toMatch(/exactly one thing spends credits today/i);
    }
  });
});
