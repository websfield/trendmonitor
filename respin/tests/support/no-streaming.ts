// R16's second branch, as ONE guard over EVERY screen that runs a generation.
//
// "The screen says the output is being prepared and does not imply a stream —
// an animated placeholder that suggests live generation is a claim."
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS (spin-compliance gate, 2026-09-01).
//
// The six shapes and their planted specimen were written inside
// `tests/studio-ui.test.tsx` and walked `app/(product)/studio/` — every file,
// six shapes, non-vacuity planted per shape. Slice 7 then added a SECOND screen
// that runs a real generation and shows a pending state,
// `/onboarding/first-ideas`, and its own scan read ONE of that directory's five
// files and covered THREE of the six shapes with no non-vacuity assertion at
// all. Both trees were clean, so nothing was broken — but a `skeleton` class or
// a "writing your ideas" label added to `first-ideas-view.tsx` would have
// shipped green.
//
// That is CLAUDE.md's 2026-08-29 lesson exactly: a derived guard is only as
// wide as its POPULATION, and a population written as ONE path narrows
// silently the day a second path appears. So the population here is a LIST
// (`GENERATION_SCREEN_DIRS`), and adding a third generation screen costs an
// entry rather than silently escaping the rule.
//
// EVERY PATTERN BELOW IS A REGEX LITERAL. None is assembled from a string:
// CLAUDE.md 2026-08-21 — one lost backslash turns `\s` into `s` and the scan
// silently matches nothing, and a scan reporting zero violations is otherwise
// indistinguishable from a scan that is working. `SHAPES_MATCHING_SPECIMEN`
// below is what proves each one still matches something.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Where a shape is forbidden: in the MARKUP (comments included) or in the WORDS
 * (comments stripped).
 *
 * THE SPLIT IS A REAL DISTINCTION rather than a convenience. A `<progress>`
 * element in a comment is a draft somebody left behind, while the sentences
 * explaining WHY nothing streams necessarily contain the words "skeleton",
 * "shimmer" and "streaming" — scanning the comments for those three would
 * delete the explanation and keep the rule.
 */
export type StreamScope = "markup" | "words";

export type StreamShape = readonly [
  label: string,
  pattern: RegExp,
  scope: StreamScope,
];

/** The six shapes R16 forbids on a screen that runs a generation. */
export const STREAM_SHAPES: readonly StreamShape[] = [
  ["a <progress> element", /<progress\b/, "markup"],
  ["a role=progressbar", /role=["']progressbar["']/, "markup"],
  ["an aria-valuenow", /aria-valuenow/, "markup"],
  ["a skeleton placeholder", /\bskeleton\b/i, "words"],
  ["a shimmer animation", /\bshimmer\b/i, "words"],
  // NARROWED AFTER A REAL FALSE POSITIVE, and the miss is worth keeping as the
  // shape rather than the instance: the first version banned `writing your`,
  // which matched "Writing your own frameworks is not part of this workspace's
  // plan" on `/studio/frameworks` — an honest tier sentence with nothing to do
  // with streaming. A ban that forces correct copy to be reworded is a ban
  // paying for a word rather than a claim (the same correction
  // `PERFORMANCE_CLAIMS` made for the bare word `reach`).
  [
    "a typing/streaming claim",
    /\bstreaming\b|\bis typing\b|\bwriting your (draft|script|ideas|hooks)\b|\bas it (arrives|is written)\b/i,
    "words",
  ],
];

/**
 * One string carrying a violation of ALL SIX shapes.
 *
 * PLANTED AS A STRING AND NEVER AS A FILE: these walkers read real app
 * directories, and a probe written into one is visible to every other scan
 * running concurrently.
 */
export const STREAM_SPECIMEN =
  `<progress role="progressbar" aria-valuenow="1" class="skeleton shimmer">` +
  `streaming, is typing, writing your draft, as it arrives</progress>`;

/**
 * EVERY directory holding a screen that runs a generation, relative to `respin`.
 *
 * THE POPULATION IS THIS LIST. A screen that spends a credit and shows a
 * pending state belongs here on the day it is written; the cost of adding one
 * is one entry.
 *
 * TWO THINGS KEEP THE LIST HONEST, because "somebody remembers" is not one of
 * them. `generationScreenFileCounts` makes a typo'd entry red rather than
 * vacuous — an entry that reads no files is a failure, not a pass — and
 * `unlistedGenerationScreenFiles` derives the COMPLETENESS from the whole
 * `app/` tree, so a screen that renders a generation and is not listed here is
 * reported by name.
 */
export const GENERATION_SCREEN_DIRS: readonly string[] = [
  "app/(product)/studio",
  "app/(product)/onboarding/first-ideas",
];

function walk(dir: string, acc: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(name)) acc.push(full);
  }
  return acc;
}

/**
 * Every `.ts`/`.tsx` file under every directory in the population.
 *
 * A directory read rather than a file list, so a new file inside a covered
 * screen joins the scan without anyone remembering — the half the studio scan
 * already had and the first-ideas scan did not.
 */
export function generationScreenFiles(root: string): string[] {
  const acc: string[] = [];
  for (const rel of GENERATION_SCREEN_DIRS) walk(join(root, rel), acc);
  return acc;
}

/** How many files each entry in the population contributes, by entry. */
export function generationScreenFileCounts(root: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rel of GENERATION_SCREEN_DIRS) out[rel] = walk(join(root, rel), []).length;
  return out;
}

/**
 * Source with comments removed, for the WORD shapes only.
 *
 * All three comment forms — line, block and the JSX-expression wrapper — are
 * stripped, because all three carry the prose that explains the rule.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

/**
 * Every violation of every shape, across the whole population.
 *
 * Returns human-readable strings so a failure names the file, the shape and the
 * scope it was found in — `expect(...).toEqual([])` is the whole assertion.
 *
 * ITS WITNESS IS A PLANTED FILE, NOT A PLANTED STRING (spin-compliance gate,
 * 2026-09-02). `shapesMatchingSpecimen` proves the six PATTERNS still match
 * something; for one slice nothing proved the composed WALK still matched
 * anything, and `codeOnly` was the fail-open: with its body replaced by
 * `return ""`, this function returned `[]` over the real tree, the six labels
 * still matched the specimen string and the file counts were unchanged — every
 * assertion in both consuming suites green while `skeleton`, `shimmer` and the
 * streaming vocabulary were sayable on both screens. `tests/studio-ui.test.tsx`
 * now plants the specimen as a FILE in every listed directory against a
 * synthetic root (the same seam `unlistedGenerationScreenFiles` already had),
 * asserts all six labels per directory, and asserts a comment-only file is NOT
 * reported — so both directions of a broken stripper are red.
 */
export function streamingViolations(root: string): string[] {
  const found: string[] = [];
  for (const file of generationScreenFiles(root)) {
    const src = readFileSync(file, "utf8");
    const stripped = codeOnly(src);
    for (const [label, pattern, scope] of STREAM_SHAPES) {
      const subject = scope === "markup" ? src : stripped;
      if (pattern.test(subject)) {
        found.push(`${file.replace(root, "")}: ${label} (${scope})`);
      }
    }
  }
  return found;
}

/**
 * Files that render a generation result and sit OUTSIDE the population.
 *
 * THE LIST IS THE POPULATION, AND THIS IS THE CHECK THAT THE LIST IS COMPLETE.
 * A list narrows the day somebody forgets an entry, which is the same failure
 * one level up — so the completeness is derived rather than trusted: R18 says
 * every mode's result goes through ONE renderer, `app/(product)/studio/
 * generation-outcome.tsx`, so any file importing it is on a screen that shows a
 * generation, and its directory belongs here. A third generation screen imports
 * that component by construction and turns this red until it is listed.
 *
 * It reads the WHOLE `app/` tree, not the population, which is the point.
 */
export function unlistedGenerationScreenFiles(root: string): string[] {
  const appDir = join(root, "app");
  const listed = GENERATION_SCREEN_DIRS.map((rel) => join(root, rel));
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      const src = readFileSync(full, "utf8");
      // The IMPORT, not the word: a comment naming the component is prose.
      if (!/from\s+["'][^"']*generation-outcome["']/.test(src)) continue;
      if (!listed.some((d) => full.startsWith(d))) out.push(full.replace(root, ""));
    }
  };
  walk(appDir);
  return out;
}

/** How many files under `app/` import the shared result renderer at all. */
export function generationOutcomeImporters(root: string): number {
  let n = 0;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      if (/from\s+["'][^"']*generation-outcome["']/.test(readFileSync(full, "utf8"))) {
        n += 1;
      }
    }
  };
  walk(join(root, "app"));
  return n;
}

/**
 * The labels of the shapes that actually match the specimen.
 *
 * NON-VACUITY, PER SHAPE. A test asserts this equals every label: a typo in one
 * pattern otherwise leaves that shape sayable while the suite stays green,
 * because some OTHER pattern matched the planted string.
 */
export function shapesMatchingSpecimen(): string[] {
  return STREAM_SHAPES.filter(([, pattern]) => pattern.test(STREAM_SPECIMEN)).map(
    ([label]) => label
  );
}
