// THE COMPARISON COMPOSITION (slice 9a, R10-R13) — the ONE app-reachable path
// from a creator's stored results to a comparison, and the seam three builders
// independently reported as missing before it existed.
//
// A SEPARATE MODULE FROM `results-ops.ts`, and not by preference. That file's
// header states what it may never grow — "a comparison, a cohort, a median, a
// per-1k, an effect, a minimum-n" — and putting this beside `recordResult`
// would make that sentence false the day it landed. The rule it protects is
// real: capture and construction are different acts, and a second construction
// site is a second answer to the question the whole slice rests on.
//
// WHAT THIS FILE IS, EXACTLY: scope, fetch, call, return. It CONSTRUCTS
// NOTHING. It contains no median, no per-1k, no exclusion, no minimum-n and no
// grouping key, and the reason that matters is worth stating rather than
// assuming — see below.
//
// WHY GROUPING IS NOT HERE, WHICH WAS A CORRECTED MISTAKE RATHER THAN AN
// OBVIOUS CHOICE (R-105). The seam was first designed with THIS file
// partitioning rows by `(treatmentKey, platform, audienceClass, metricKey,
// metricDeclaredByDocId)` and calling `buildLeverComparisons` once per group.
// That is wrong, and subtly: deciding which results belong in the same stratum
// IS the comparability decision, and it is the same decision
// `@respin/brain`'s `inStratum` predicate makes. Split across two packages,
// the two can disagree with nothing to adjudicate — which is precisely the
// shape that cost slice 8c its most expensive defect, where `packages/modes`
// and `packages/trends` each held half of one contract and each suite tested
// only its own half. So `buildComparisonGroups` derives the strata AND
// compares, and this file passes it the whole scoped population.
//
// WHY A FACADE AT ALL, rather than letting `app/**` import `@respin/brain`
// directly: `app/**` is default-deny by tenancy design (T1), and this is where
// profile scoping happens. `buildLeverComparisons` TRUSTS ITS CALLER to have
// scoped the rows — that trust is documented in `@respin/brain`'s own index —
// so the code that fetches through `withWorkspace` and the code that compares
// must not be separated by a boundary a screen can reach across. The facade is
// a STRONGER tenancy property than the direct import, not merely a preserved
// boundary.
import { buildComparisonGroups, type ComparisonGroup } from "@respin/brain";

import type { DbLike } from "./db-like";
import { ProfileScope, type WorkspaceScope } from "./with-workspace";
import { declaredMetricOf, type DeclaredMetric } from "./results-schema";

/**
 * Every comparison this creator's own results support (R10-R13).
 *
 * THE DECLARED METRICS ARE A MAP, NOT ONE VALUE, and this is the third defect
 * of the seam's shape rather than a design flourish. The accessor is called
 * with NO stratum, so one call spans the profile's whole eligible population —
 * which necessarily spans every strategy version the creator has ever
 * declared. Groups are keyed by `metricDeclaredByDocId` precisely so two
 * versions never pool (comparability predicate 2, REQ-B03), so one unit and
 * one direction cannot be right for two of them; labelling an older group with
 * the CURRENT version's direction inverts `improvement`, which is the exact
 * defect that field exists to prevent. `declaredMetricForProfile` returns the
 * ACTIVE metric and is right for the write path and wrong here.
 *
 * THE MAP IS BUILT FROM THE PROFILE'S OWN STRATEGY VERSIONS, through the
 * scoped accessor — never from the result rows' ids used as a lookup key into
 * anything wider. `brain_docs` versions are append-only, so a version a result
 * cites cannot have moved under it; that immutability is why C3 stores a
 * POINTER rather than copying unit and direction onto the result row, on
 * `generations.brainActivationId`'s argument that a copy creates "a second
 * answer … and the two could disagree with nothing to adjudicate".
 *
 * A VERSION WHOSE METRIC NO LONGER PARSES IS OMITTED FROM THE MAP, and
 * `buildComparisonGroups` throws rather than silently dropping the group it
 * belongs to. That is deliberate on both sides: a dropped group is a
 * comparison a creator cannot see and cannot be told about, which on this
 * screen is indistinguishable from having nothing comparable — the absence
 * meaning two things that the whole slice is built to avoid. It should be
 * unreachable, because `recordResult` refuses a result with no compatible
 * declaration (R8) and versions are immutable; "should be unreachable" is why
 * it throws instead of being handled here.
 *
 * NO ROLE GATE — a viewer may read, the `declaredMetricForProfile` rule.
 */
export async function resultComparisons(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<ComparisonGroup[]> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);

  const population = await profileScope.accessors.comparableResults();

  // THE NARROW READ (billing CHANGE 1, 2026-09-04). This loop used to call
  // `brainDocsByKind`, a bare `.select()` with NO limit: every column of up to
  // `BRAIN_VERSION_MAX` (200) brain documents, each `content` bounded only by
  // `BRAIN_DOCUMENT_TEXT_MAX` (500,000) — worst case ~100 MB, in the same
  // render whose sibling read had just been projected down to ~25 MB. Four
  // scalars per version cross now; `content` does not. See
  // `strategyMetricVersions` for why the wide accessor was not narrowed
  // instead (its other callers render and hash whole documents).
  const declaredMetrics = new Map<string, DeclaredMetric>();
  for (const version of await profileScope.accessors.strategyMetricVersions()) {
    const metric = declaredMetricOf({ metric: version.metric });
    if (metric) declaredMetrics.set(version.id, metric);
  }

  return buildComparisonGroups({
    // THE CALLER'S MINTED ID, not one read off the rows (builder B's tenancy
    // fix, 2026-09-04). The cross-profile guard used to take its expectation
    // from `results[0]!.profileId`, which proved HOMOGENEITY rather than
    // IDENTITY: a set uniformly belonging to another creator passed cleanly,
    // and `inStratum`'s profile predicate was self-referential because the
    // stratum was built from that same row. There is no live leak either way
    // — `comparableResults` applies `both(results)` on both its branches —
    // but the guard is now true at the layer that claims it.
    profileId: profileScope.profileId,
    results: population.rows,
    // THE CALLER'S REPORT ABOUT ITS OWN READ, passed through rather than
    // re-derived. `population.rows.length` is NOT this value: a page that
    // comes back short of its limit may still have been limited, which is why
    // the accessor measures it with a `limit + 1` probe instead of inferring
    // it, and why `buildComparisonGroups` takes it as a required parameter
    // with no default.
    truncated: population.truncated,
    declaredMetrics,
  });
}
