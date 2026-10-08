// THE TWO SIDES OF ONE COMPARISON, CHECKED AGAINST EACH OTHER.
//
// `@respin/db` PRODUCES the rows a comparison is computed over
// (`comparableResults` -> `ComparableResultRow`) and `@respin/brain` CONSUMES
// them (`buildLeverComparisons` -> `ComparisonResultInput`). The two types are
// deliberately NOT the same type and neither imports the other:
//
//   - `@respin/db` does not type its read surface as `ComparisonResultInput`,
//     because typing a producer by its CONSUMER makes the producer's contract
//     depend on what the consumer happens to need this month — the inversion
//     the edge direction exists to prevent.
//   - `@respin/brain` does not import `ResultRow`, because a pure comparison
//     package that imported a database row type would acquire drizzle, the
//     schema, and every column that has nothing to do with a median.
//
// So they agree STRUCTURALLY, and structural agreement that nobody checks is
// the seam this slice keeps finding. This file is the check.
//
// BY RELATIVE PATH, NOT BY PACKAGE NAME — the `llm-deadline-coherence.test.ts`
// and `claims-vocabulary-agreement.test.ts` arrangement.
//
// THIS COMMENT WAS WRITTEN WHEN THE EDGE DID NOT EXIST AND IS CORRECTED HERE
// RATHER THAN LEFT: for about an hour on 2026-09-04 `@respin/brain` was
// DECLARED in `packages/db/package.json` and NOT INSTALLED (`require.resolve`
// threw MODULE_NOT_FOUND, `tsc` reported TS2307), which made a relative path
// the only option. It IS installed now — verified in the same action as this
// sentence: `packages/db/node_modules/@respin/brain` is a symlink to
// `packages/brain`, and `results-comparison-ops.ts` imports the package by
// name and compiles.
//
// THE RELATIVE PATHS STAY, and the reason is now the better one. The property
// this file pins is a relationship between two TYPES, not a fact about the
// dependency graph, and it must hold from BOTH sides: there is deliberately no
// edge from `@respin/brain` back to `@respin/db`, so a test living in either
// package could only ever name one of them. A root test sits outside both
// boundaries and names both, which is exactly why this repo puts cross-package
// coherence checks here — and it means this check does not quietly become a
// check of the dependency graph if that edge is ever removed.
//
// ===========================================================================
// WHAT A GREEN RUN OF THIS FILE DOES AND DOES NOT PROVE.
//
// IT PROVES:
//   1. Every field `@respin/brain` reads is PRESENT on the projection and
//      assignable to the type it expects — checked by the COMPILER, so a
//      widened vocabulary or a dropped column fails here, not at a call site
//      that happens to exist today.
//   2. The projection carries nothing large: no column it selects can hold
//      unbounded text, which is the property `COMPARISON_POPULATION_MAX`
//      needs to bound bytes and not merely rows.
//   3. The columns it drops are dropped ON PURPOSE, named individually, so
//      removing one more is a deliberate edit rather than a diff nobody read.
//
// IT DOES NOT PROVE that the VALUES agree — that a `treatmentKey` this package
// writes is one that package would group on, or that a `confounders` array
// round-trips. Those are behavioural and they are asserted where the behaviour
// is (`packages/db/tests/results-schema.test.ts` for the write side,
// `packages/brain/tests/comparison.test.ts` for the read side). This file is
// about SHAPE, and a shape check that implied more would be the vacuous half
// of a two-part guarantee.
// ===========================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  comparableResultProjection,
  type ComparableResultRow,
  type ResultRow,
} from "../packages/db/src/results-schema";
import type { ComparisonResultInput } from "../packages/brain/src/vocabulary";

describe("the comparison's producer and consumer agree, without importing each other", () => {
  it("a projected row is assignable to what @respin/brain reads (COMPILE-TIME)", () => {
    // THE ASSERTION IS THE ASSIGNMENT. If `ComparableResultRow` ever stops
    // satisfying `ComparisonResultInput` — a dropped column, a widened enum, a
    // `confounders` that goes back to `unknown` — this file does not compile,
    // which is a louder failure than any runtime expectation could be. The
    // `satisfies` keeps the value's own type intact so the assertion cannot be
    // satisfied by a widening cast.
    const row = {} as ComparableResultRow;
    const consumed: ComparisonResultInput = row;
    // ...and the same in the array shape the builder actually takes, because
    // `readonly T[]` and `T[]` are not the same assignability question.
    const page: readonly ComparisonResultInput[] = [row] satisfies ComparableResultRow[];
    expect(consumed).toBe(row);
    expect(page).toHaveLength(1);
  });

  it("the projection selects EXACTLY the consumer's fields plus the cage's workspace column", () => {
    // Derived from the two sources rather than hand-listed: the projection's
    // keys are read off the object the accessor selects with, and the
    // consumer's fields are read off a value typed as `ComparisonResultInput`,
    // so neither list can be typed differently on two days.
    const projected = Object.keys(comparableResultProjection).sort();
    const consumed: Record<keyof ComparisonResultInput, true> = {
      id: true,
      profileId: true,
      // R-170 (audit Phase 2, P2-A1): n counts distinct posts.
      generationId: true,
      platform: true,
      audienceClass: true,
      metricKey: true,
      metricDeclaredByDocId: true,
      observedFrom: true,
      observedTo: true,
      treatmentKey: true,
      evidenceState: true,
      reachValue: true,
      reachDenominator: true,
      conversionValue: true,
      conversionDenominator: true,
      confounders: true,
    };
    // `Record<keyof ComparisonResultInput, true>` is what makes the literal
    // above CHECKED: a field added to the consumer without being added here is
    // a compile error, and a field removed from the consumer leaves an excess
    // property that is also one. So this list cannot silently drift from the
    // type it mirrors.
    const consumedFields = Object.keys(consumed).sort();
    expect(consumedFields.length).toBe(16);
    expect(projected).toEqual([...consumedFields, "workspaceId"].sort());
  });

  it("the projection drops the columns it is meant to drop, by name", () => {
    // THE POPULATION IS `keyof ResultRow`, CHECKED BY THE COMPILER rather than
    // read off the drizzle table object — `drizzle-orm` is a dependency of
    // `packages/db`, not of this root package, and reaching for it here would
    // be a root test acquiring a package dependency to enumerate something the
    // type system already knows. `Record<keyof ResultRow, true>` means a column
    // ADDED to `results` and not classified below is a compile error, and one
    // REMOVED leaves an excess property that is also one.
    const everyColumn: Record<keyof ResultRow, true> = {
      id: true,
      profileId: true,
      workspaceId: true,
      generationId: true,
      platform: true,
      audienceClass: true,
      metricKey: true,
      metricDeclaredByDocId: true,
      observedFrom: true,
      observedTo: true,
      treatmentKey: true,
      evidenceState: true,
      reachValue: true,
      reachDenominator: true,
      conversionValue: true,
      conversionDenominator: true,
      confounders: true,
      note: true,
      connectorSource: true,
      connectorEventId: true,
      connectorObservedAt: true,
      createdAt: true,
    };
    const projected = new Set(Object.keys(comparableResultProjection));
    const dropped = Object.keys(everyColumn)
      .filter((c) => !projected.has(c))
      .sort();
    expect(dropped).toEqual(
      [
        // THE REASON THIS PROJECTION EXISTS: `note` is the only unbounded text
        // column on the row, and no comparison reads it.
        "note",
        // v1 writes none of these, and none can change a median.
        "connectorSource",
        "connectorEventId",
        "connectorObservedAt",
        // Ordering is by `observed_to`, not by when the creator logged it.
        "createdAt",
      ].sort()
    );
  });

  it("BOTH reads in one render are projected — the population is two, not one", () => {
    // THE POPULATION IS A LIST (CLAUDE.md 2026-08-29), and this case exists
    // because it was written as one. `resultComparisons` performs TWO scoped
    // reads in the same server render, and this file pinned the byte property
    // of ONE of them while calling itself "the property
    // `COMPARISON_POPULATION_MAX` actually needs":
    //
    //   comparableResults        50,000 rows x whole row  ->  projected (~25 MB)
    //   brainDocsByKind          200 docs x whole document -> NOT projected,
    //                            `content` bounded only by
    //                            BRAIN_DOCUMENT_TEXT_MAX (500,000) => ~100 MB
    //
    // The second is now `strategyMetricVersions`, four scalars plus both scope
    // columns. Asserted from the SOURCE of the composition rather than from
    // memory, so a future edit that reaches back for the wide accessor fails
    // here and not in a production render.
    const composition = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../packages/db/src/results-comparison-ops.ts"),
      "utf8"
    );
    // THE CALL SHAPE, NOT THE BARE NAME. The first version of this assertion
    // searched for `brainDocsByKind` anywhere in the file and went red on the
    // COMMENT that explains why the wide accessor is no longer used — a scan
    // matching its own documentation, which is the fail-open shape wearing its
    // opposite. `.accessors.<name>(` is the invocation.
    const WIDE = /\.accessors\.brainDocsByKind\s*\(/;
    const NARROW = /\.accessors\.strategyMetricVersions\s*\(/;
    expect(
      WIDE.test(composition),
      "the comparison composition CALLS the wide brain-doc accessor again — that is ~100 MB of jsonb in the same render whose sibling read was projected to ~25 MB"
    ).toBe(false);
    expect(NARROW.test(composition), "the narrow read is not called").toBe(true);
    expect(
      /\.accessors\.comparableResults\s*\(/.test(composition),
      "the population read is not called"
    ).toBe(true);
    // NON-VACUITY, PLANTED: the pattern really does find the thing it claims to
    // forbid. A scan reporting zero violations is indistinguishable from a scan
    // whose pattern broke (CLAUDE.md 2026-08-21).
    expect(
      WIDE.test("  for (const v of await profileScope.accessors.brainDocsByKind('strategy')) {"),
      "the wide-accessor pattern matches nothing — it would report clean forever"
    ).toBe(true);
    expect(composition).toContain("buildComparisonGroups");
  });

  it("no projected column can hold unbounded text — the bound is on BYTES, not just rows", () => {
    // The property `COMPARISON_POPULATION_MAX` actually needs. `note` is the
    // one `text` column on this table with no ceiling of its own; every other
    // text column is either bounded by a writer limit (`platform`), by a closed
    // set (`evidence_state`, `audience_class`), or by construction (the metric
    // key is a slug, the treatment key is composed from a uuid, a mode and that
    // slug). This case is what fails if `note` is ever selected again.
    expect(Object.keys(comparableResultProjection)).not.toContain("note");
  });
});
