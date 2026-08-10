/**
 * Output identity and supersession — the SINGLE implementation (Stage 0B task 8).
 *
 * T-1 (settled 2026-08-09, graduating to decisions.md D-56) says a delivered
 * **output** is one approved cut per `CreativeBrief`: repackaging the same brief
 * produces a newer package of the *same* output, not a second output. Every
 * consumer that counts outputs — `status --phase0`'s criterion 1 today, Stage 1's
 * cohorts and Stage 6's uplift denominators later — resolves that here rather than
 * grouping packages itself. A second grouping rule in a second caller is a second
 * answer to "how many outputs are there?", which is the question this module
 * exists to make unambiguous (the same argument `reviews.ts` makes for "is this
 * approved?").
 *
 * ## Identity is DERIVED, never stored
 *
 * Nothing is written to a package to make this work. Spike **F-J** measured every
 * delivered package on disk: `lineage.creativeBriefId` is required by
 * `content-package-v1` and is a valid ULID on all three, so the material is
 * already there. Spike **F-I** is why it must stay derived — `skills/package`'s own
 * input schema refuses caller-supplied evidence fields ("a caller-supplied evidence
 * field is a caller-supplied claim"), and an operator-assertable discriminator
 * would make the number criterion 1 counts an assertion. **F-K** confirmed
 * supersession is computable from the packages alone, matching `skills/approve`,
 * which derives supersession over a total order and stores no pointer.
 *
 * Nothing here may be materialised onto `ContentPackage` either: the schema is
 * `additionalProperties: false`, so a stored `outputId` would make every new
 * package schema-invalid.
 *
 * ## The key, and the eviction each component prevents
 *
 * `(sourceClassification, accountId, jobId, creativeBriefId)`. Each component is
 * here because dropping it lets one package evict another that must be counted:
 *
 *   - **`sourceClassification`** — resolution happens *within* a class, so a
 *     fixture can never supersede a real output. D-36 makes this field solely
 *     responsible for keeping fixture runs out of Phase 0 exit evidence; a
 *     resolver that merged across it would hand a fixture the power to remove a
 *     real output from the exit count.
 *   - **`accountId`** — `status.ts` says a delivered package "travel[s] away from
 *     the job that minted [it]", so account isolation must hold by construction
 *     rather than transitively through `jobId`. Criterion 1's `accounts.length >=
 *     3` tally is built from the survivors, so a cross-account merge would
 *     silently *remove an account* from the count.
 *   - **`jobId`** — `loadAllPackages` walks **every** job under `JOBS_ROOT`, so a
 *     bare `creativeBriefId` groups across jobs by default. Nothing binds a
 *     package's `creativeBriefId` to its own job (`skills/package` copies it
 *     straight through from the story plan).
 *   - **`creativeBriefId`** — T-1's unit itself.
 *
 * The key is composed with `JSON.stringify` rather than a delimiter join, because
 * `accountId` and `jobId` are free strings: an id containing the delimiter could
 * otherwise forge membership of another group.
 *
 * ## Population: the completeness filter runs HERE, not in the caller
 *
 * Only evidence-complete packages (`evidenceGaps(pkg).length === 0`) take part in
 * resolution. Two reasons, and both are defects that were live in earlier drafts
 * of this design:
 *
 *   1. an evidence-incomplete package must never supersede a complete one — it
 *      would take criterion 1 from 1 → 0 while criterion 4 separately reported the
 *      offender, the exact sibling of the fixture-eviction case above; and
 *   2. if the filter ran in the caller, Stage 1's cohorts and Stage 6's
 *      denominators — which call this with raw `loadAllPackages()` output — would
 *      get a *different answer* than `status.ts` does. One implementation with two
 *      answers is what this module exists to prevent.
 *
 * Excluded packages are RETURNED on `excludedIncomplete`, never dropped silently:
 * a package that disappears from the count with nothing named is indistinguishable
 * from a package that was never produced.
 *
 * ## An unreadable file makes the whole resolution indeterminate
 *
 * Exactly `resolveApprovalForManifest`'s rule, for exactly its reason: the *set* is
 * what determines "latest", so an incomplete set cannot determine it. It is also
 * the only honest option here — an entry in `LoadedPackages.unreadable` is
 * `{path, reason}`, and it failed validation, so its `creativeBriefId`,
 * `accountId` and `sourceClassification` are **unknowable**; only `jobId` is
 * recoverable from the path. "The affected group" is therefore uncomputable, and
 * attributing the file to one group would be a guess dressed as a resolution.
 *
 * This costs nothing in reporting terms, because a run holding an unreadable
 * package already has to report every criterion as unproven and name the file.
 *
 * ## Two anomalies are REPORTED rather than resolved
 *
 * The composite key prevents both merges — and prevention is silent, which is the
 * problem. Both of these change the count and neither is visible today:
 *
 *   - one `creativeBriefId` under two `jobId`s **splits one output into two**,
 *     inflating the count;
 *   - one `creativeBriefId` under two `accountId`s splits it too **and** adds a
 *     spurious account to criterion 1's `accounts.length >= 3` tally, moving that
 *     criterion *toward* green.
 *
 * Anomaly detection runs within a `sourceClassification` class, matching
 * resolution: the counts these anomalies distort are per-class (real outputs are
 * counted; fixtures are excluded by D-36), so a fixture and a real package sharing
 * a brief is the fixture-eviction case — already handled by the key — and not a
 * split of either class's count.
 */

import type { ContentPackageV1 } from '../generated/typescript/index.js';

export type ContentPackage = ContentPackageV1.ContentPackage;

/** A file under a job's `packages/` that did not parse as a ContentPackage, and why. */
export interface UnreadablePackageFile {
  readonly path: string;
  readonly reason: string;
}

/**
 * What a walk of the package tree produced: the packages that validated, and the
 * files that did not.
 *
 * Both channels travel together because the second one changes the meaning of the
 * first — see `resolveOutputs`. Declared here rather than beside its producer
 * (`loadAllPackages`, in `apps/cli`) because `packages/contracts` cannot import
 * from `apps/cli`; the dependency runs one way, and this module needs the type.
 */
export interface LoadedPackages {
  readonly packages: readonly ContentPackage[];
  readonly unreadable: readonly UnreadablePackageFile[];
}

/**
 * Total order over packages: `envelope.createdAt` as an INSTANT, then the ULID.
 *
 * Needed because criterion 3 is about "the last ten", and "last" has to be a
 * decidable question. `createdAt` alone can tie (two packages in the same second);
 * `contentPackageId` is a ULID and unique, so the pair cannot.
 *
 * Compared as an instant for exactly the reason `compareDecisions` is:
 * `envelope-v1.createdAt` is `format: date-time`, which admits an offset, so
 * `…T04:00:00+10:00` sorts after `…T20:00:00Z` (the previous day) while being
 * earlier. The `package` skill writes `new Date().toISOString()`, so every package
 * this pipeline produces is already `Z`-normalised — but a hand-authored or
 * externally-produced package is not, and criterion 3 is entirely about ordering.
 * An unparseable value sorts FIRST so it can never become "the latest".
 *
 * Lives here, with `resolveOutputs`, because supersession is decided by this order:
 * a second comparator in a second module would be a second answer to "which package
 * is the latest?".
 */
export function comparePackages(a: ContentPackage, b: ContentPackage): number {
  const at = Date.parse(a.envelope.createdAt);
  const bt = Date.parse(b.envelope.createdAt);
  const aOk = Number.isFinite(at);
  const bOk = Number.isFinite(bt);
  if (!aOk || !bOk) {
    if (!aOk && !bOk) return comparePackageIds(a, b);
    return aOk ? 1 : -1;
  }
  if (at !== bt) return at < bt ? -1 : 1;
  return comparePackageIds(a, b);
}

function comparePackageIds(a: ContentPackage, b: ContentPackage): number {
  if (a.contentPackageId === b.contentPackageId) return 0;
  return a.contentPackageId < b.contentPackageId ? -1 : 1;
}

/**
 * Does this package carry every piece of evidence a delivered output must?
 *
 * **Reachability, stated so `packagesMissingEvidence` is not misread as live.**
 * Packages are contract-validated on read, so most of these can no longer fire:
 * `content-package-v1.json` already makes the shape they test unrepresentable.
 * Across this function and `rangeGaps` (which stays in `status.ts`, since only
 * criterion 2 reads it), EIGHT of the ten gap checks are in that position;
 * exactly ONE here survives validation — `weakestState` — because the enum
 * admits every rights state and only `package`'s refusal keeps a committed
 * package at `cleared`. A non-zero count therefore means a rights failure, or a
 * range-report mismatch from `rangeGaps`, and nothing else.
 *
 * They are kept rather than pruned because each is the same assertion the schema
 * makes, and the commands that read packages read ones that have travelled away
 * from the job that minted them.
 *
 * **The claim is driven, not merely written** (CLAUDE.md, 2026-07-30 — assert it in
 * a test or delete it), and it took TWO tests because it is two claims:
 *
 *   - `status.test.ts`'s *"the schema constraints the status reachability notes
 *     depend on"* pins each constraint named below by `$ref`, `enum`, `const` or
 *     `minItems`, so a loosening turns a "cannot fire" line back into a live one and
 *     says so, instead of leaving this comment quietly wrong; and
 *   - one test per check writes a package violating it and asserts the file is
 *     REFUSED — all five unreachable checks, plus `weakestState` asserted as the
 *     live gap it is. The pin alone was not enough: it says what the schema
 *     declares, not what the reader does with it, and for two of the six
 *     (`reviewDecisionId`, `qaReportId`) nothing drove the behaviour at all until a
 *     review counted them.
 */
export function evidenceGaps(pkg: ContentPackage): string[] {
  const gaps: string[] = [];
  // Unreachable: `$ref Ulid` — a fixed 26-character pattern, never empty.
  if (pkg.approval.reviewDecisionId.length === 0) gaps.push('no approval id');
  // Unreachable: `$ref Ulid`.
  if (pkg.qa.qaReportId.length === 0) gaps.push('no QA report id');
  // Unreachable: `enum: ["pass", "pass_with_waivers"]`.
  if (pkg.qa.gateStatus !== 'pass' && pkg.qa.gateStatus !== 'pass_with_waivers') gaps.push(`QA gateStatus is "${String(pkg.qa.gateStatus)}"`);
  // Unreachable: `const: 0` — blockers are non-waivable (D-35), so a package
  // carrying one is not a thing that can exist.
  if (pkg.qa.blockerCount !== 0) gaps.push(`carries ${String(pkg.qa.blockerCount)} blocker(s)`);
  // Unreachable: `minItems: 1`.
  if (pkg.rightsManifest.assets.length === 0) gaps.push('rights manifest names no assets');
  // REACHABLE. The enum admits every rights state; `cleared` holds by refusal at
  // packaging time, not by construction, so this is the live check.
  if (pkg.rightsManifest.weakestState !== 'cleared') gaps.push(`weakest rights state is "${pkg.rightsManifest.weakestState}"`);
  return gaps;
}

/** The derived identity of one delivered output. Never stored on a package. */
export interface OutputKey {
  readonly sourceClassification: ContentPackage['sourceClassification'];
  readonly accountId: string;
  readonly jobId: string;
  readonly creativeBriefId: string;
}

/** The key a package belongs to. Pure projection — it reads nothing but the package. */
export function outputKeyOf(pkg: ContentPackage): OutputKey {
  return {
    sourceClassification: pkg.sourceClassification,
    accountId: pkg.accountId,
    jobId: pkg.jobId,
    creativeBriefId: pkg.lineage.creativeBriefId,
  };
}

/**
 * A key as one comparable string, for grouping.
 *
 * `JSON.stringify` of the tuple rather than a `|` join: `accountId` and `jobId`
 * are free strings, so a value containing the delimiter could otherwise be built
 * to collide with another group's key — and a collision here merges two outputs
 * into one.
 */
export function outputKeyString(key: OutputKey): string {
  return JSON.stringify([key.sourceClassification, key.accountId, key.jobId, key.creativeBriefId]);
}

/** One resolved output: the package in force, and every package it superseded. */
export interface ResolvedOutput {
  readonly key: OutputKey;
  /** The latest package for this key by `comparePackages`. */
  readonly survivor: ContentPackage;
  /** Earlier packages of the same output, oldest first. Named, never just counted. */
  readonly superseded: readonly ContentPackage[];
}

export type OutputAnomalyKind = 'creative-brief-spans-jobs' | 'creative-brief-spans-accounts';

/**
 * A grouping the key deliberately refuses to merge, named so the refusal is not
 * silent. An anomaly is a REPORT, never a resolution: nothing here changes which
 * package survives.
 */
export interface OutputAnomaly {
  readonly kind: OutputAnomalyKind;
  readonly sourceClassification: ContentPackage['sourceClassification'];
  readonly creativeBriefId: string;
  /** The distinct `jobId`s or `accountId`s the brief spans, sorted. */
  readonly values: readonly string[];
  /** Every package involved, in force order. */
  readonly contentPackageIds: readonly string[];
  readonly detail: string;
}

export type OutputResolution =
  | {
      readonly kind: 'resolved';
      /**
       * One entry per output, in force order (oldest survivor first) — so a caller
       * asking for "the last N outputs" takes a suffix.
       *
       * Both classes are present and they are NEVER summed: filter on
       * `key.sourceClassification` first. `outputs.length` is a count of real and
       * fixture outputs together, which is not a number any exit criterion asks for.
       */
      readonly outputs: readonly ResolvedOutput[];
      /**
       * Packages excluded from resolution because they lack evidence, with the
       * gaps that excluded them. They are not outputs and they supersede nothing.
       */
      readonly excludedIncomplete: readonly { readonly pkg: ContentPackage; readonly gaps: readonly string[] }[];
      readonly anomalies: readonly OutputAnomaly[];
    }
  | {
      /**
       * At least one file under `packages/` could not be read as a ContentPackage,
       * so the set is INCOMPLETE and no supersession answer can be trusted. Carried
       * on THIS ARM ONLY — the check runs before any package is examined, so on the
       * resolved arm the list is provably empty and a field for it would be dead
       * policy that looks live.
       */
      readonly kind: 'indeterminate';
      readonly unreadable: readonly UnreadablePackageFile[];
    };

/**
 * Resolve delivered packages into delivered outputs (T-1).
 *
 * Takes `LoadedPackages` — both channels — rather than a bare package array: the
 * unreadable channel is what makes the answer indeterminate, and a signature that
 * could not see it would have had a rejection policy nothing could ever populate.
 */
export function resolveOutputs(loaded: LoadedPackages): OutputResolution {
  // FIRST, before any package is examined. An unreadable file might be the later
  // package that supersedes one of the survivors below.
  if (loaded.unreadable.length > 0) {
    return { kind: 'indeterminate', unreadable: [...loaded.unreadable] };
  }

  const complete: ContentPackage[] = [];
  const excludedIncomplete: { pkg: ContentPackage; gaps: readonly string[] }[] = [];
  for (const pkg of loaded.packages) {
    const gaps = evidenceGaps(pkg);
    if (gaps.length === 0) complete.push(pkg);
    else excludedIncomplete.push({ pkg, gaps });
  }
  complete.sort(comparePackages);
  excludedIncomplete.sort((a, b) => comparePackages(a.pkg, b.pkg));

  const groups = new Map<string, ContentPackage[]>();
  for (const pkg of complete) {
    const key = outputKeyString(outputKeyOf(pkg));
    const members = groups.get(key);
    if (members === undefined) groups.set(key, [pkg]);
    else members.push(pkg);
  }

  const outputs: ResolvedOutput[] = [];
  for (const members of groups.values()) {
    // `complete` was sorted before grouping and insertion preserves that order, so
    // the last member is the latest. Guarded anyway: a group is never empty, but
    // `noUncheckedIndexedAccess` is right that the compiler cannot know it.
    const survivor = members[members.length - 1];
    if (survivor === undefined) continue;
    outputs.push({ key: outputKeyOf(survivor), survivor, superseded: members.slice(0, -1) });
  }
  outputs.sort((a, b) => comparePackages(a.survivor, b.survivor));

  return { kind: 'resolved', outputs, excludedIncomplete, anomalies: detectAnomalies(complete) };
}

/**
 * The two splits the key prevents, named.
 *
 * Runs over the same population resolution does — the evidence-complete packages,
 * within one `sourceClassification` — so an anomaly always describes packages that
 * are actually being counted.
 */
function detectAnomalies(complete: readonly ContentPackage[]): OutputAnomaly[] {
  const byBrief = new Map<string, ContentPackage[]>();
  for (const pkg of complete) {
    const key = JSON.stringify([pkg.sourceClassification, pkg.lineage.creativeBriefId]);
    const members = byBrief.get(key);
    if (members === undefined) byBrief.set(key, [pkg]);
    else members.push(pkg);
  }

  const anomalies: OutputAnomaly[] = [];
  for (const members of byBrief.values()) {
    const first = members[0];
    if (first === undefined) continue;
    const creativeBriefId = first.lineage.creativeBriefId;
    const sourceClassification = first.sourceClassification;
    const contentPackageIds = members.map((pkg) => pkg.contentPackageId);

    const jobIds = [...new Set(members.map((pkg) => pkg.jobId))].sort();
    if (jobIds.length > 1) {
      anomalies.push({
        kind: 'creative-brief-spans-jobs',
        sourceClassification,
        creativeBriefId,
        values: jobIds,
        contentPackageIds,
        detail:
          `CreativeBrief ${creativeBriefId} (${sourceClassification}) appears under ${String(jobIds.length)} jobs ` +
          `(${jobIds.join(', ')}), so it counts as ${String(jobIds.length)} outputs rather than one`,
      });
    }

    const accountIds = [...new Set(members.map((pkg) => pkg.accountId))].sort();
    if (accountIds.length > 1) {
      anomalies.push({
        kind: 'creative-brief-spans-accounts',
        sourceClassification,
        creativeBriefId,
        values: accountIds,
        contentPackageIds,
        detail:
          `CreativeBrief ${creativeBriefId} (${sourceClassification}) appears under ${String(accountIds.length)} accounts ` +
          `(${accountIds.join(', ')}), which both splits the output count and adds an account to the account tally`,
      });
    }
  }

  anomalies.sort((a, b) =>
    a.kind === b.kind
      ? a.creativeBriefId < b.creativeBriefId
        ? -1
        : a.creativeBriefId > b.creativeBriefId
          ? 1
          : 0
      : a.kind < b.kind
        ? -1
        : 1,
  );
  return anomalies;
}
