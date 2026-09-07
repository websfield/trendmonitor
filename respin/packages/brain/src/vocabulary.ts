// THE C1 VOCABULARIES, MIRRORED AS TYPES — and the mirror is temporary by
// design, stated here rather than discovered later.
//
// WHY A MIRROR EXISTS AT ALL. Slice 9a's pinned contract puts the closed sets
// (C1) in `@respin/db`, written by builder A, and the comparison builder (C5)
// here, written at the same hour on a separate tree. This file holds the four
// vocabularies as TYPE unions so this package compiles before A's tree merges.
//
// WHY TYPES AND NOT `as const` ARRAYS. A second RUNTIME array would be a
// second source of truth, and two packages independently owning the same
// closed set is the exact defect the pinned contract exists to prevent (slice
// 8c: four bounds chosen twice, both suites building their own fixtures and
// never meeting the other's data). A type union is erased at build time: it
// can disagree with `@respin/db`, but it cannot be READ by anything at
// runtime, so nothing can branch on the wrong copy.
//
// WHAT MAKES THE DISAGREEMENT VISIBLE RATHER THAN SILENT. Two mechanisms, not
// one comment:
//   1. `packages/brain/tests/vocabulary-mirror.test.ts` compares the string
//      sets written HERE against the `RESULT_*` `as const` arrays declared
//      anywhere in `@respin/db`'s sources, textually, the moment they exist.
//   2. The comparison builder never takes the vocabularies as data — it takes
//      ROWS. A caller passing `@respin/db`'s own row type is checked by the
//      compiler against these unions at the call site, which is where a
//      widened vocabulary in `@respin/db` has to surface.
//
// THE REPOINT IS OWED. When A's C1 lands, this file's four unions become
// `(typeof RESULT_*)[number]` re-exports from `@respin/db` and the mirror test
// retires. That is an integration-gate action, not a later slice's.

/** C1: never pooled (R13). */
export type AudienceClass = "organic" | "paid";

/** C1: never collapsed into one score (R9). */
export type Lever = "reach" | "conversion";

/**
 * C1: `unquantified` is stored and never enters a numerical cohort (R16);
 * `connector_verified` is structurally unreachable in v1 (three connector
 * columns and a database CHECK), so a row bearing it cannot exist yet — the
 * comparison still treats it as numerical, because the day it CAN exist the
 * builder must not be the thing that has to change.
 */
export type EvidenceState =
  | "unquantified"
  | "quantified_self_reported"
  | "connector_verified";

/**
 * C1 / R7: structured flags, never prose — the closed-code discipline
 * `brain-reason.ts` established. A comparison shows the codes carried by the
 * results it is made of; it does not interpret them.
 */
export type ConfounderCode =
  | "topic_overlap"
  | "posting_time_unknown"
  | "account_growth"
  | "spillover_from_other_post"
  | "external_promotion"
  | "platform_change";

/** C3 / slice 3b: the declared north-star metric's closed direction. */
export type MetricDirection = "higher_is_better" | "lower_is_better";

/**
 * WHAT THE COMPARISON READS OFF A RESULT ROW — a STRUCTURAL SUBSET of C2's
 * row, deliberately, and the deliberateness is the point.
 *
 * The pinned C2 row carries eleven more fields (`workspaceId`, `generationId`,
 * `note`, the three connector columns, `createdAt`…). None of them may change
 * a median, so none of them is named here. TypeScript's structural typing is
 * meant to make `@respin/db`'s row assignable to this WITHOUT a re-export or
 * an adapter: a caller hands over its rows and the compiler proves the
 * comparability fields line up. If `@respin/db` widens a vocabulary, that
 * assignment is where it fails — loudly, at the call site.
 *
 * MEASURED, NOT ASSUMED, and the measurement found ONE mismatch that is worth
 * stating instead of absorbing. Compiling `readonly ResultRow[]` against
 * `readonly ComparisonResultInput[]` on 2026-09-04 produced exactly one error:
 * `confounders` is `unknown` on the row, because the drizzle column is
 * `jsonb("confounders")` with no `$type<…>()`. Every other field — including
 * the nullable treatment key, both closed-set enums, all four numeric strings
 * and both `Date` columns — lines up. So the closed set the schema declares
 * and CHECK-constrains does not survive into the row type, and the fix belongs
 * on the column rather than here: widening this field to `unknown` would let
 * a comparison read a confounder vocabulary nobody owns.
 *
 * `treatmentKey` IS NULLABLE HERE AND NOT NULL IN C2, and this is a
 * DELIBERATE widening rather than a drift: C4 says a result with no
 * `generationId` "has no derivable treatment key" and is eligible for the
 * baseline but never for a treatment cohort, while C2 types the column
 * `string`. Accepting `string | null` is assignable from EITHER decision
 * (a `string` is a `string | null`), so this package cannot be the thing that
 * breaks when that contradiction is settled. A blank or whitespace-only key is
 * normalised to "no key" for the same reason — an empty string in a NOT NULL
 * column is the fabricated key C4 forbids, wearing a different shape.
 */
export type ComparisonResultInput = {
  id: string;
  profileId: string;
  platform: string;
  audienceClass: AudienceClass;
  metricKey: string;
  metricDeclaredByDocId: string;
  observedFrom: Date;
  observedTo: Date;
  treatmentKey: string | null;
  evidenceState: EvidenceState;
  /** Numeric-as-string, the drizzle numeric convention C2 pins. */
  reachValue: string | null;
  reachDenominator: string | null;
  conversionValue: string | null;
  conversionDenominator: string | null;
  confounders: readonly ConfounderCode[];
};
