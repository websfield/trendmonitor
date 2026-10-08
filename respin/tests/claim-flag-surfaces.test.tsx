// EVERY SURFACE THAT PRESENTS GENERATED TEXT RENDERS ITS CLAIM FLAGS
// (audit Phase 2 gate, R-172).
//
// WHY THIS IS A LIST. The clause analysis in `packages/modes/src/claims.ts`
// FLAGS what it cannot decide rather than refusing it, because a refusal is
// debited. That trade is only honest if every flag is visible wherever the
// draft is shown. Before this gate the Spin screen showed none and the Sample
// Spin showed none. So the population of presenting surfaces is enumerated
// here — a LIST, not a producer (CLAUDE.md rule 7) — and each one is held
// either to rendering the flags or to carrying no flaggable field:
//
//   studio       `GenerationOutcome` renders `KillTestBlock`
//   first-ideas  renders `GenerationOutcome`
//   saved pack   `saved-view.tsx` renders `KillTestBlock`
//   Spin         `spin-panel.tsx` renders `KillTestBlock`
//   Sample Spin  `AcceptedView` renders the response's `claimFlags`
//   export       renders nothing; the JSON carries `generations.kill_test`
//                whole — witnessed in `packages/db/tests/export.test.ts`
//
// A NEW SURFACE IS A LIST EDIT: the scan below finds every `app/**` file that
// renders draft text through the document components, and each must be on the
// list.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KillTestBlock } from "../app/(product)/studio/generation-outcome";
import { SpinOutcome } from "../app/(product)/trends/spin-panel";
import { AcceptedView } from "../app/(marketing)/sample-spin/sample-spin-panel";
import { blankComments } from "./support/app-surface";
import { sourceFilesUnder } from "./support/source-files";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => blankComments(readFileSync(join(ROOT, file), "utf8"));

const FLAG = {
  family: "certainty",
  enforcement: "flag" as const,
  token: "can't miss",
  field: "/hooks/0/text",
  unit: "SURFACE-FLAG-SENTENCE",
};
const SUMMARY = {
  outcome: "passed",
  attempts: 1,
  rewritten: false,
  creatorRulesScored: false,
  verdicts: [],
  limitNote: "limit",
  traceability: [],
  claims: [FLAG],
};

/** Each presenting surface, and the file that must render the flags. */
const SURFACES: Readonly<Record<string, { file: string; renders: RegExp }>> = {
  studio: { file: "app/(product)/studio/generation-outcome.tsx", renders: /<KillTestBlock\b/ },
  "first-ideas": { file: "app/(product)/onboarding/first-ideas/first-ideas-result.tsx", renders: /<GenerationOutcome\b/ },
  "saved pack": { file: "app/(product)/studio/saved/saved-view.tsx", renders: /<KillTestBlock\b/ },
  spin: { file: "app/(product)/trends/spin-panel.tsx", renders: /<KillTestBlock\b/ },
  "sample spin": { file: "app/(marketing)/sample-spin/sample-spin-panel.tsx", renders: /result\.claimFlags\.map\(/ },
};

describe("claim flags are visible on every surface that presents a draft (R-172)", () => {
  it.each(Object.entries(SURFACES))("%s renders the flags", (_name, { file, renders }) => {
    expect(read(file)).toMatch(renders);
  });

  it("the shared block renders a flag's phrase and sentence", () => {
    const html = renderToStaticMarkup(<KillTestBlock summary={SUMMARY} />);
    expect(html).toContain('data-testid="studio-claims"');
    expect(html).toContain("SURFACE-FLAG-SENTENCE");
  });

  it("the Spin result renders it", () => {
    const html = renderToStaticMarkup(
      <SpinOutcome
        state={{ status: "result", spinResult: "x", weakestPoint: "w", disclosure: { kind: "policy_check_required" }, killTest: SUMMARY, chargedCredits: 1 }}
        originalReference={{ source: "YouTube", title: "t", mechanismSummary: "m" } as never}
      />
    );
    expect(html).toContain("SURFACE-FLAG-SENTENCE");
  });

  it("the Sample Spin result renders it", () => {
    const html = renderToStaticMarkup(
      <AcceptedView result={{ status: "accepted", spin: [], weakestPoint: "w", claimFlags: [FLAG], highlightedRules: [], rewritten: false }} />
    );
    expect(html).toContain('data-testid="sample-spin-claims"');
    expect(html).toContain("SURFACE-FLAG-SENTENCE");
  });

  it("THE POPULATION: every app file that renders a draft's document is on the list", () => {
    // A file rendering any document component, or a draft text projection,
    // is a presenting surface. The three below compose `/studio` itself —
    // each renders `GenerationOutcome`, the studio surface's own file — so
    // they are parts of a listed surface, not surfaces of their own.
    const COMPONENTS = new Set([
      "app/(product)/studio/studio-panel.tsx",
      "app/(product)/studio/piece-confirmation.tsx",
      "app/(product)/studio/entrances.tsx",
    ]);
    for (const file of COMPONENTS) expect(read(file), file).toMatch(/<GenerationOutcome\b/);
    const presenting = sourceFilesUnder(["app"])
      .filter((f) => /\.tsx$/.test(f.file))
      .filter((f) => /<(?:GenerationOutcome|KillTestBlock|ScriptSections|WhyThisPerforms)\b|result\.spin\.map\(|state\.spinResult\b/.test(blankComments(f.text)))
      .map((f) => f.file)
      .filter((f) => !COMPONENTS.has(f))
      .sort();
    expect(presenting).toEqual(Object.values(SURFACES).map((s) => s.file).sort());
  });
});
