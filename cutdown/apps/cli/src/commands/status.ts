import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  comparePackages,
  createAjv,
  diffContractSets,
  evidenceGaps,
  formatAjvErrors,
  resolveOutputs,
  type ContractSetEntry,
  type LoadedPackages,
  type ResolvedOutput,
} from '@cutdown/contracts';
import type { ContentPackageV1 } from '@cutdown/contracts/generated';

import { JOBS_ROOT } from '../paths.js';

/**
 * `cutdown status --phase0` — the four exit criteria, computed from evidence
 * (decisions.md D-36/D-38, tech-spec §15 step 10).
 *
 * PRD §15's Phase 0 row, all four:
 *
 *   1. at least **20 approved real outputs across 3 accounts**;
 *   2. **zero invalid source ranges** in final renders;
 *   3. the **last 10 outputs require no breaking contract change**;
 *   4. **rights records and QA reports accompany every delivered package**.
 *
 * ## It reads ContentPackages and nothing else
 *
 * D-36 fixes the evidence: stable `accountId`, `sourceClassification`, package
 * `contractSet`, the approval, the final range validation, QA, and rights — all of
 * which live on the package. Deriving any criterion from somewhere softer (a run
 * log a re-run could change, a directory listing, an operator's tally) would make
 * progress a matter of interpretation. If a claim is not in a committed package, it
 * is not counted.
 *
 * ## The two milestones are never merged (D-38)
 *
 * `PIPELINE_IMPLEMENTATION_COMPLETE` says the machine works; `PHASE_0_EXIT_EARNED`
 * says the machine has done real work at scale. D-38 is explicit that the
 * implementation milestone must **never** be reported as Phase 0 exit, so they are
 * separate fields with separate reasons, and the second cannot be reached without
 * real footage (D-27).
 *
 * This command is also honest about the half of `PIPELINE_IMPLEMENTATION_COMPLETE`
 * it cannot see: the six implementation gates and the recorded-model suites are
 * build-time facts recorded in `docs/progress/`, not package evidence. What it
 * computes is the *pipeline* half — whether the whole chain has actually produced a
 * complete delivered bundle end to end — and it says which half that is.
 */

type ContentPackage = ContentPackageV1.ContentPackage;

export const REQUIRED_REAL_OUTPUTS = 20;
export const REQUIRED_ACCOUNTS = 3;
export const CONTRACT_WINDOW = 10;

/**
 * What the evidence says about one criterion. THREE states, never two.
 *
 * `met` and `not_met` are both *measured* claims — we counted, and the count either
 * clears the bar or does not. `unproven` is the third thing that is true far more
 * often than either during Phase 0: the evidence needed to decide is not there yet.
 * Collapsing it into `met` reports progress nobody made; collapsing it into
 * `not_met` reports a failure nobody demonstrated, and an operator chasing a
 * disproof that does not exist will look for a bug instead of producing outputs.
 *
 * This REPLACED a `met: boolean` rather than widening it. A widened field would
 * have left the renderer's `criterion.met ? 'x' : ' '` printing any truthy value as
 * `[x]`, so `unproven` would have rendered as MET — the exact inversion the third
 * state exists to prevent. Replacing makes `tsc` enumerate every consumer.
 */
export type CriterionState = 'met' | 'not_met' | 'unproven';

/**
 * ## Precedence: a proven failure outranks missing evidence
 *
 * A run can hold both an evidence-incomplete package (a *disproof* — that package
 * demonstrably lacks rights or QA evidence) and an unreadable file (which makes the
 * set incomplete, so anything computed *over the set* is unproven). The two answers
 * disagree, and the rule is uniform across all four criteria:
 *
 *   > each criterion reports `not_met` when a disproof is established from evidence
 *   > it can actually read, and `unproven` only when nothing is disproven and the
 *   > evidence is incomplete.
 *
 * Downgrading an established failure to `unproven` because some *other* file is
 * corrupt would file a proven failure under insufficient-evidence's label and hide
 * it behind the corrupt file — the same inversion criterion 3 refuses when it
 * reports a detected breaking change as `not_met` at any window size rather than
 * `unproven` below ten. Both states are red, so nothing is softened by this
 * ordering; what it preserves is *which* red, and the unreadable file is named in
 * the detail either way.
 *
 * The ordering only bites where a disproof is computable at all. Criteria 1 and 3
 * are computed from `resolveOutputs`, which goes indeterminate on any unreadable
 * file, so under an unreadable file they have no countable population and no
 * disproof is available: both are `unproven`, unconditionally.
 */
export interface Criterion {
  readonly id: string;
  readonly label: string;
  readonly state: CriterionState;
  /** One line stating the measured position, whichever state it is in. */
  readonly detail: string;
  /** Package ids the criterion is red because of, when applicable. */
  readonly offendingPackageIds: readonly string[];
}

/**
 * Recovery for an unreadable package file, following `reviews.ts`'s wording for the
 * same class of refusal.
 *
 * An unreadable package now makes all four criteria unproven, which triples what
 * one bad file costs — and a widened fatal path ships WITH its way forward or it is
 * an outage wearing a control's clothes. The only production writer under
 * `jobs/*​/packages/` is the `package` skill, which validates before writing, so a
 * file that fails `content-package-v1` is hand-authored or corrupt: re-running the
 * skill replaces it. Never "delete the bad package" — a delivered package is
 * evidence, and a refusal that tells an operator to destroy evidence to clear
 * itself is worse than the block.
 */
export const UNREADABLE_PACKAGE_REMEDY =
  'Recovery is non-destructive: re-run `cutdown package` to write a valid package, or move the bad file aside — never delete delivered package evidence to clear the block.';

/** One earlier package of an output that a later package replaced (T-1). Named, never only counted. */
export interface SupersededPackage {
  readonly contentPackageId: string;
  readonly supersededBy: string;
  readonly sourceClassification: 'real' | 'fixture';
  readonly creativeBriefId: string;
}

export interface Phase0Status {
  readonly criteria: readonly Criterion[];
  /**
   * Every field here names its population, and the block reconciles against two
   * written identities that `status.test.ts` asserts:
   *
   *   readablePackages = realPackages + fixturePackages + packagesMissingEvidence
   *   resolvedRealOutputs + supersededRealPackages + rejectedRealPackages = realPackages
   *
   * `readablePackages` is NOT "every package file": an unreadable file is counted
   * nowhere in this block and is reported on `unreadable` instead. It was called
   * `totalPackages` and that was a subset wearing a total's name — the first
   * identity is false the moment a real package lacks evidence, which is exactly
   * the state the second identity's `rejected` term exists for.
   *
   * `realPackages`/`fixturePackages` are derived over the SAME population (the
   * evidence-complete readable packages), because the earlier code filtered `real`
   * out of the complete set and `fixture` out of all packages, so their sum
   * silently double-counted nothing and under-counted incompletes.
   *
   * `resolvedRealOutputs` is a count of OUTPUTS (T-1: one approved cut per
   * CreativeBrief); `realPackages` is a count of PACKAGES. They are different
   * numbers and neither may wear the other's name.
   */
  readonly counts: {
    readonly readablePackages: number;
    readonly realPackages: number;
    readonly fixturePackages: number;
    readonly warningWaivedPackages: number;
    readonly packagesMissingEvidence: number;
    readonly resolvedRealOutputs: number;
    readonly supersededRealPackages: number;
    /**
     * Complete real packages that resolution could not place — non-zero only on the
     * indeterminate arm, where an unreadable file makes every supersession answer
     * untrustworthy. Present so the second identity holds in that state too.
     */
    readonly rejectedRealPackages: number;
  };
  readonly accounts: readonly { readonly accountId: string; readonly realOutputs: number }[];
  /** The earlier packages T-1 folded into a later one, BY NAME — a count of 0 alone is indistinguishable from "supersession was not computed". */
  readonly superseded: readonly SupersededPackage[];
  /** Groupings the output key deliberately refused to merge, reported so the refusal is not silent. */
  readonly anomalies: readonly { readonly kind: string; readonly detail: string }[];
  readonly milestones: {
    readonly pipelineImplementationComplete: { readonly earned: boolean; readonly reason: string };
    readonly phase0ExitEarned: { readonly earned: boolean; readonly reason: string };
  };
  /** Files under `packages/` that did not parse as a ContentPackage, named not counted. */
  readonly unreadable: readonly { readonly path: string; readonly reason: string }[];
  /** The non-destructive way forward, present exactly when `unreadable` is non-empty. */
  readonly unreadableRemedy: string | null;
}

/**
 * `LoadedPackages`, `comparePackages` and `evidenceGaps` live in
 * `@cutdown/contracts`' `output-identity` module, not here.
 *
 * They are the inputs to `resolveOutputs`, the single implementation of output
 * identity and supersession — and `packages/contracts` cannot import from
 * `apps/cli`, so leaving any of the three behind would have forced a second copy
 * there. A second package comparator is a second answer to "which package is the
 * latest?", which is exactly the ambiguity that module exists to remove.
 */

export const CONTENT_PACKAGE_SCHEMA_ID = 'https://cutdown.local/contracts/schemas/content-package-v1.json';

/**
 * Validate a candidate against `content-package-v1`.
 *
 * The first cut was a top-level key-presence check, which admitted `"approval": {}`
 * — and the very next line read `pkg.approval.reviewDecisionId.length`, so a
 * half-written package crashed the whole command with a `TypeError` instead of being
 * reported as unreadable. That contradicted this module's own promise that unreadable
 * files are "named, never silently skipped": it named nothing and skipped everything.
 *
 * Validating against the contract also removes the need to hand-maintain a key list
 * that drifts from the schema.
 */
function describeIfNotPackage(
  value: unknown,
  validator: { validate: ((value: unknown) => boolean) | null; errors: () => string },
): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'not a JSON object';
  if (validator.validate === null) return `${CONTENT_PACKAGE_SCHEMA_ID} is not registered, so no package can be validated`;
  if (!validator.validate(value)) return `does not satisfy content-package-v1: ${validator.errors().trim()}`;
  return null;
}

/** Compiled once per walk, not once per package: `createAjv()` registers every schema. */
function packageValidator(): { validate: ((value: unknown) => boolean) | null; errors: () => string } {
  const compiled = createAjv().getSchema(CONTENT_PACKAGE_SCHEMA_ID);
  if (compiled === undefined) return { validate: null, errors: () => '(schema not registered)' };
  return { validate: (value: unknown) => compiled(value) as boolean, errors: () => formatAjvErrors(compiled.errors) };
}

/**
 * Read every ContentPackage across every job.
 *
 * An unreadable file is REPORTED, never skipped silently. A package that quietly
 * disappeared would understate progress, and — worse — an operator chasing a count
 * that will not move would have nothing to look at.
 */
export function loadAllPackages(jobsRoot: string = JOBS_ROOT): LoadedPackages {
  const packages: ContentPackage[] = [];
  const unreadable: { path: string; reason: string }[] = [];
  if (!existsSync(jobsRoot)) return { packages, unreadable };
  const validator = packageValidator();

  for (const jobId of readdirSync(jobsRoot).sort()) {
    const packagesRoot = join(jobsRoot, jobId, 'packages');
    if (!existsSync(packagesRoot)) continue;
    for (const entry of readdirSync(packagesRoot, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!entry.isDirectory()) continue;
      // A staging directory is an in-flight or crashed assembly, never a delivered
      // output. Skipped by NAME rather than reported: `package` removes its own
      // staging on any failure, so one lying around is a killed process, not a
      // corrupt package, and reporting it as unreadable would be misleading.
      if (entry.name.startsWith('.staging-')) continue;
      const path = `${jobId}/packages/${entry.name}/package.json`;
      const file = join(packagesRoot, entry.name, 'package.json');
      if (!existsSync(file)) {
        unreadable.push({ path, reason: 'the package directory holds no package.json' });
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
      } catch (error) {
        unreadable.push({ path, reason: `not valid JSON: ${(error as Error).message}` });
        continue;
      }
      const problem = describeIfNotPackage(parsed, validator);
      if (problem !== null) {
        unreadable.push({ path, reason: problem });
        continue;
      }
      packages.push(parsed as ContentPackage);
    }
  }
  packages.sort(comparePackages);
  return { packages, unreadable };
}

/**
 * Range-validation evidence, per D-36's "final-render range-validation ID".
 *
 * Same reachability note as `evidenceGaps` (now in `@cutdown/contracts`): the one
 * live check here is the cross-field one, because no single-field schema
 * constraint can express it.
 */
function rangeGaps(pkg: ContentPackage): string[] {
  const gaps: string[] = [];
  const rv = pkg.rangeValidation;
  // Unreachable: `const: "ran"`.
  if (rv.status !== 'ran') gaps.push(`the range check is "${String(rv.status)}", which is not evidence of zero`);
  // Unreachable: `const: 0`.
  if (rv.violationCount !== 0) gaps.push(`${String(rv.violationCount)} range violation(s)`);
  // Unreachable: `minimum: 1`.
  if (rv.rangeCount < 1) gaps.push('zero ranges were checked, so "zero violations" claims nothing');
  // REACHABLE. Two independently-valid Ulids that must be EQUAL — a relation no
  // per-property constraint in the schema subset can state.
  if (rv.qaReportId !== pkg.qa.qaReportId) {
    gaps.push('the range evidence names a different QA report than the package does');
  }
  return gaps;
}

export function computePhase0Status(loaded: LoadedPackages): Phase0Status {
  const all = [...loaded.packages].sort(comparePackages);
  const unreadable = loaded.unreadable;
  const remedy = unreadable.length > 0 ? UNREADABLE_PACKAGE_REMEDY : null;
  const unreadableNote = `${String(unreadable.length)} unreadable package file(s) — see below. ${UNREADABLE_PACKAGE_REMEDY}`;

  // What "approved" means HERE, precisely: the package is contract-valid and carries
  // an approval id, a passing QA verdict with no blocker, and a cleared rights
  // manifest. It does NOT resolve the approval id back to a ReviewDecision on disk —
  // a delivered package is meant to travel away from its job directory, so the
  // decision file may legitimately not be reachable from where this command runs.
  // `package` is what refuses to mint a package without a resolvable approval; this
  // command checks the evidence the package itself carries.
  //
  // `real` and `fixture` are both filtered out of `complete`, over the SAME
  // population, so the Counts block's first identity holds. `sourceClassification`
  // is the sole mechanism keeping fixture runs out of exit evidence (D-27/D-36/D-38).
  const complete = all.filter((pkg) => evidenceGaps(pkg).length === 0);
  const incomplete = all.filter((pkg) => evidenceGaps(pkg).length > 0);
  const real = complete.filter((pkg) => pkg.sourceClassification === 'real');
  const fixture = complete.filter((pkg) => pkg.sourceClassification === 'fixture');

  // T-1 (D-56): a delivered OUTPUT is one approved cut per CreativeBrief, so two
  // packages of one brief are one output. `resolveOutputs` is the single
  // implementation of that grouping and of supersession — this command consumes it
  // rather than grouping packages itself, because a second grouping rule here would
  // be a second answer to "how many outputs are there?".
  //
  // Note what it does NOT replace: `complete`/`incomplete` above are still computed
  // from the same exported `evidenceGaps`, which is the same rule the resolver's own
  // population filter applies — one rule, read twice, not two rules.
  const resolution = resolveOutputs(loaded);
  const resolved = resolution.kind === 'resolved';
  const realOutputs: readonly ResolvedOutput[] = resolved
    ? resolution.outputs.filter((output) => output.key.sourceClassification === 'real')
    : [];
  const superseded: SupersededPackage[] = resolved
    ? resolution.outputs.flatMap((output) =>
        output.superseded.map((pkg) => ({
          contentPackageId: pkg.contentPackageId,
          supersededBy: output.survivor.contentPackageId,
          sourceClassification: output.key.sourceClassification,
          creativeBriefId: output.key.creativeBriefId,
        })),
      )
    : [];
  const supersededRealPackages = realOutputs.reduce((sum, output) => sum + output.superseded.length, 0);
  // Non-zero only on the indeterminate arm: no complete real package is placed at
  // all there, so every one of them is neither a survivor nor superseded.
  const rejectedRealPackages = resolved ? 0 : real.length;

  // Grouped by the STABLE accountId, never by display name — D-36 keeps the
  // display name off the package precisely so a rename cannot split a count. The
  // tally is over RESOLVED OUTPUTS, not packages: criterion 1's numerator counts
  // outputs, so an account tally counted in packages would let two packages of one
  // brief disagree with the numerator about what an output is.
  const byAccount = new Map<string, number>();
  for (const output of realOutputs) {
    byAccount.set(output.key.accountId, (byAccount.get(output.key.accountId) ?? 0) + 1);
  }
  const accounts = [...byAccount.entries()]
    .map(([accountId, realOutputs_]) => ({ accountId, realOutputs: realOutputs_ }))
    .sort((a, b) => (a.accountId < b.accountId ? -1 : 1));

  const criterion1: Criterion = {
    id: 'approved-real-outputs',
    label: `>= ${String(REQUIRED_REAL_OUTPUTS)} approved real outputs across ${String(REQUIRED_ACCOUNTS)} accounts`,
    // Unproven, never not_met, when resolution is indeterminate: with an unreadable
    // file the population cannot be counted at all, so no disproof is available.
    state: !resolved
      ? 'unproven'
      : realOutputs.length >= REQUIRED_REAL_OUTPUTS && accounts.length >= REQUIRED_ACCOUNTS
        ? 'met'
        : 'not_met',
    detail: !resolved
      ? `the output count is UNPROVEN: an unreadable file may itself be a delivered output, or the later package that supersedes one. ${unreadableNote}`
      : `${String(realOutputs.length)}/${String(REQUIRED_REAL_OUTPUTS)} approved real output(s) across ` +
        `${String(accounts.length)}/${String(REQUIRED_ACCOUNTS)} account(s)` +
        ` (T-1/D-56: one approved cut per CreativeBrief, from ${String(real.length)} complete real package(s))` +
        (fixture.length > 0 ? `; ${String(fixture.length)} fixture package(s) EXCLUDED (D-36)` : ''),
    offendingPackageIds: [],
  };

  // Criterion 2 binds to FINAL renders, and every ContentPackage is built from one.
  // Its population is the evidence-complete set across ALL classes — including the
  // fixture package, which carries range evidence like any other and which PRD §15
  // does not qualify as "real" here.
  const rangeOffenders = complete.filter((pkg) => rangeGaps(pkg).length > 0);
  const criterion2: Criterion = {
    id: 'zero-invalid-source-ranges',
    label: 'zero invalid source ranges in final renders',
    // A range offender is a DISPROOF computed from packages that were read
    // successfully, so it outranks an unreadable file's missing evidence.
    state:
      rangeOffenders.length > 0
        ? 'not_met'
        : unreadable.length > 0 || complete.length === 0
          ? 'unproven'
          : 'met',
    detail:
      complete.length === 0
        ? 'no delivered package exists yet, so there is nothing to have validated — this is UNPROVEN, not proven' +
          (unreadable.length > 0 ? `; ${unreadableNote}` : '')
        : `${String(complete.length)} package(s) carry range-validation evidence; ` +
          `${String(complete.reduce((sum, pkg) => sum + pkg.rangeValidation.rangeCount, 0))} range(s) validated, ` +
          `${String(rangeOffenders.length)} package(s) without acceptable evidence` +
          // NOT "the same population as criterion 1". The reason an unreadable file
          // touches THIS criterion is narrower and specific: the file that could not
          // be read may itself have carried invalid ranges, so zero violations
          // counted over the files that happened to parse is not zero. With an
          // offender already found the criterion is disproven either way, and the
          // clause says the count is a floor rather than claiming UNPROVEN.
          (unreadable.length === 0
            ? ''
            : rangeOffenders.length > 0
              ? `; and an unreadable file may have carried invalid ranges too, so that offender count is a floor. ${unreadableNote}`
              : `; UNPROVEN — an unreadable file may have carried invalid ranges, so a count of zero over the files that parsed is not zero. ${unreadableNote}`),
    offendingPackageIds: rangeOffenders.map((pkg) => pkg.contentPackageId),
  };

  // Criterion 3 compares each delivered package's recorded contract set with its
  // predecessor's. A `majorVersion` that moved is a breaking change (tech-spec §3);
  // a `contentHash` that moved under an unchanged major is compatible or editorial.
  // The packages ARE the timeline.
  //
  // ## Two populations, and they are legitimately different
  //
  // The THRESHOLD counts resolved real OUTPUTS — PRD §15's Phase 0 row reads "the
  // last 10 outputs require no breaking contract change", and this label says
  // outputs too. Counted in packages, ten repackages of a single CreativeBrief
  // would make the criterion decidable and green over ONE output.
  //
  // The TIMELINE walks every evidence-complete real PACKAGE in that span, survivors
  // and superseded alike — because `contractSet` is a property of the PACKAGE that
  // recorded it, not of the output. Walking survivors only would resurrect the very
  // defect this criterion exists to catch: bump a contract, repackage every affected
  // CreativeBrief, and every pre-bump package is superseded, so the survivors all
  // carry the new major and the diff reads clean over a window in which a major
  // demonstrably moved.
  //
  // ## The population is the SPAN, not the windowed outputs' own packages
  //
  // `windowOutputs.flatMap(o => [...o.superseded, o.survivor])` is *the packages
  // belonging to the windowed outputs*, which is a different set — and a smaller one
  // than the span it reaches across. A windowed output's superseded package can
  // predate the survivor of an output the ten-output slice excludes, so that earlier
  // package pulls the span's start backwards while the excluded output's packages are
  // never examined. Measured on 13 evidence-complete real packages over 12 outputs
  // (the first brief repackaged last): two packages sat strictly inside the printed
  // span, one ADDED a contract and the next REMOVED it, both were skipped, and the
  // criterion reported `met` while printing "no schema major version moved between
  // consecutive packages" — the denial this criterion exists to stop, over a
  // classification (`removed`) it deliberately counts as breaking.
  //
  // So the span's start is derived from the windowed outputs, and its POPULATION is
  // then every evidence-complete real package at or after that start. `real` is
  // already in `comparePackages` order (`all` is sorted and both filters preserve it),
  // and `spanStart` is itself one of its members, so the filter is a suffix.
  const windowOutputs = realOutputs.slice(-CONTRACT_WINDOW);
  const spanStart = windowOutputs
    .flatMap((output) => [...output.superseded, output.survivor])
    .sort(comparePackages)[0];
  const window = spanStart === undefined ? [] : real.filter((pkg) => comparePackages(pkg, spanStart) >= 0);
  const breaking: { from: string; to: string; schemaId: string; description: string }[] = [];
  for (let i = 1; i < window.length; i++) {
    const previous = window[i - 1] as ContentPackage;
    const current = window[i] as ContentPackage;
    for (const drift of diffContractSets(
      previous.contractSet as unknown as ContractSetEntry[],
      current.contractSet as unknown as ContractSetEntry[],
    )) {
      const short = drift.schemaId.split('/').pop() ?? drift.schemaId;
      if (drift.kind === 'breaking') {
        breaking.push({
          from: previous.contentPackageId,
          to: current.contentPackageId,
          schemaId: drift.schemaId,
          description: `${short} v${String(drift.from)}→v${String(drift.to)}`,
        });
      } else if (drift.kind === 'removed') {
        // `diffContractSets` deliberately leaves this judgement to the caller, and
        // the caller has to actually make it: a contract that DISAPPEARED between two
        // delivered packages is at least as breaking as a major bump — every reader
        // of that object lost its schema. Ignoring it kept the criterion green on the
        // more severe of the two changes.
        breaking.push({
          from: previous.contentPackageId,
          to: current.contentPackageId,
          schemaId: drift.schemaId,
          description: `${short} REMOVED from the contract set`,
        });
      }
      // `added` is genuinely additive and `compatible` is a description-only edit;
      // neither resets the ten-output clock (tech-spec §3).
    }
  }
  // The rule is THREE-way, and the order of the branches is the whole point.
  //
  //   PRD §15, Phase 0: "the last 10 outputs require no breaking contract change".
  //
  // 1. A DETECTED breaking change is `not_met` at ANY window size. It is a proven
  //    failure, and reporting it as `unproven` because fewer than ten outputs exist
  //    would file it under insufficient evidence — defeating this criterion at
  //    exactly the moment it is needed, since the next contract migration lands
  //    with roughly three outputs on the clock.
  // 2. A clean but SHORT window is `unproven`: stability across ten outputs cannot
  //    be satisfied by having produced one. The threshold is `CONTRACT_WINDOW`,
  //    which is what the label already promises — it used to be `2`, in both the
  //    predicate and the sentence beside it.
  // 3. Only a clean FULL window is `met`.
  //
  // `offendingPackageIds` cannot be non-empty under `unproven`, BY CONSTRUCTION
  // rather than by a comment: the list is derived from the state below, and the
  // state is `not_met` whenever `breaking` is non-empty. A criterion that says it
  // cannot judge must not also list offenders. The nine-output test asserts the
  // observable end of that (`[]`), and the three-output test asserts the other end
  // (offenders listed, under `not_met`).
  const criterion3State: CriterionState = !resolved
    ? 'unproven'
    : breaking.length > 0
      ? 'not_met'
      : windowOutputs.length < CONTRACT_WINDOW
        ? 'unproven'
        : 'met';
  const criterion3: Criterion = {
    id: 'no-breaking-contract-change',
    label: `the last ${String(CONTRACT_WINDOW)} outputs require no breaking contract change`,
    state: criterion3State,
    detail: !resolved
      ? `the contract-drift window is UNPROVEN: the timeline it would walk is known to be incomplete. ${unreadableNote}`
      : breaking.length > 0
        ? `${String(breaking.length)} breaking change(s) across ${String(windowOutputs.length)} resolved real output(s) ` +
          `(${String(window.length)} evidence-complete real package(s) in the span): ` +
          breaking.map((b) => `${b.description} between ${b.from.slice(-6)} and ${b.to.slice(-6)}`).join('; ')
        : windowOutputs.length < CONTRACT_WINDOW
          ? // Says nothing about whether a major moved. The old sentence at this
            // branch claimed "no schema major version moved between consecutive
            // packages" for any window of 2..9, which is the denial this criterion
            // exists to stop printing.
            `only ${String(windowOutputs.length)}/${String(CONTRACT_WINDOW)} resolved real output(s) exist ` +
            `(${String(window.length)} evidence-complete real package(s) in the span), so stability across ` +
            `${String(CONTRACT_WINDOW)} outputs is UNPROVEN (not proven by absence)`
          : `${String(windowOutputs.length)} resolved real output(s) in the window ` +
            `(${String(window.length)} evidence-complete real package(s) in the span); ` +
            `no schema major version moved between consecutive packages`,
    offendingPackageIds: criterion3State === 'not_met' ? breaking.map((b) => b.to) : [],
  };

  const evidenceOffenders = incomplete.map((pkg) => pkg.contentPackageId);
  const criterion4: Criterion = {
    id: 'rights-and-qa-evidence',
    label: 'rights records and QA reports accompany every delivered package',
    // An incomplete package is a DISPROOF — that package is delivered and its
    // evidence is demonstrably missing — so it outranks an unreadable file, which
    // only makes the set incomplete. An unreadable file ALONE is `unproven`, never
    // `not_met`: this branch used to report a disproof where the evidence was merely
    // unreadable, which told an operator a package had failed when no package had
    // been read.
    state:
      incomplete.length > 0
        ? 'not_met'
        : unreadable.length > 0 || all.length === 0
          ? 'unproven'
          : 'met',
    detail:
      all.length === 0
        ? 'no delivered package exists yet — UNPROVEN' + (unreadable.length > 0 ? `; ${unreadableNote}` : '')
        : `${String(complete.length)}/${String(all.length)} readable package(s) carry complete rights + QA evidence` +
          (incomplete.length > 0
            ? `; incomplete: ${incomplete.map((pkg) => `${pkg.contentPackageId.slice(-6)} (${evidenceGaps(pkg).join(', ')})`).join('; ')}`
            : '') +
          (unreadable.length === 0
            ? ''
            : incomplete.length > 0
              ? `; and the evidence in ${String(unreadable.length)} unreadable file(s) is unknown, so that offender list is a floor. ${unreadableNote}`
              : `; UNPROVEN over the unreadable file(s) — a file that could not be read is not a package that failed. ${unreadableNote}`),
    offendingPackageIds: evidenceOffenders,
  };

  const criteria = [criterion1, criterion2, criterion3, criterion4];
  const warningWaived = all.filter((pkg) => pkg.qa.waivers.length > 0);

  // D-38. The pipeline milestone is about the MACHINE; the exit milestone is about
  // real work at scale. Reported separately, with the implementation milestone
  // stating plainly which half of D-38's definition it can and cannot see.
  const pipelineEarned = complete.length > 0;
  // `unproven` is NOT earned. Only a measured `met` counts — an exit milestone
  // granted on the strength of "we could not tell" is the softest failure this
  // command could have.
  const exitEarned = criteria.every((criterion) => criterion.state === 'met');

  // The two red states are reported as the different things they are, in the one
  // string a human reads. Either clause is omitted when its count is zero.
  const notMet = criteria.filter((c) => c.state === 'not_met');
  const unproven = criteria.filter((c) => c.state === 'unproven');
  const shortfall = [
    ...(notMet.length > 0 ? [`${String(notMet.length)} of 4 criteria are not met: ${notMet.map((c) => c.id).join(', ')}`] : []),
    ...(unproven.length > 0 ? [`${String(unproven.length)} unproven: ${unproven.map((c) => c.id).join(', ')}`] : []),
  ].join('; ');

  return {
    criteria,
    counts: {
      readablePackages: all.length,
      realPackages: real.length,
      fixturePackages: fixture.length,
      warningWaivedPackages: warningWaived.length,
      packagesMissingEvidence: incomplete.length,
      resolvedRealOutputs: realOutputs.length,
      supersededRealPackages,
      rejectedRealPackages,
    },
    accounts,
    superseded,
    anomalies: resolved ? resolution.anomalies.map((a) => ({ kind: a.kind, detail: a.detail })) : [],
    milestones: {
      pipelineImplementationComplete: {
        earned: pipelineEarned,
        reason: pipelineEarned
          ? `${String(complete.length)} complete package(s) exist, so the chain from ingest to package has run end to end. ` +
            `This is the PIPELINE half of D-38 only: the six implementation gates and the recorded-model suites are build-time facts recorded in docs/progress/, not package evidence, and this command does not read them.`
          : 'no package with complete evidence exists yet, so the chain from ingest to package has not been proven end to end.',
      },
      phase0ExitEarned: {
        earned: exitEarned,
        reason: exitEarned
          ? 'all four PRD §15 criteria are green on real footage.'
          : `${shortfall}. D-38: the implementation milestone must never be reported as Phase 0 exit.`,
      },
    },
    unreadable,
    unreadableRemedy: remedy,
  };
}

/**
 * One glyph per state, and all three are DISTINGUISHABLE.
 *
 * The predecessor was `criterion.met ? 'x' : ' '`, a two-way render over what is now
 * a three-way state — which is why the state replaced the boolean instead of
 * widening it: any truthy value would have printed as `[x]`, so the operator would
 * have read "we cannot tell" as "done".
 */
const STATE_GLYPH: Record<CriterionState, string> = { met: '[x]', not_met: '[ ]', unproven: '[?]' };

/** `cutdown status --phase0`. Exit 0 always — a red criterion is news, not an error. */
export function statusPhase0Command(jobsRoot: string = JOBS_ROOT): number {
  const status = computePhase0Status(loadAllPackages(jobsRoot));
  const lines: string[] = [
    '',
    'cutdown status --phase0 — PRD §15 Phase 0 exit criteria (evidence: ContentPackages only, D-36)',
    '',
    '  [x] met   [ ] not met (measured)   [?] unproven (the evidence to decide is not there)',
    '',
  ];

  for (const criterion of status.criteria) {
    lines.push(`  ${STATE_GLYPH[criterion.state]} ${criterion.label}`);
    lines.push(`      ${criterion.detail}`);
    if (criterion.offendingPackageIds.length > 0) {
      lines.push(`      offending package(s): ${criterion.offendingPackageIds.join(', ')}`);
    }
  }

  lines.push('', '  Counts (readable = real + fixture + missing evidence; resolved outputs + superseded + rejected = real)');
  lines.push(`    packages readable ........ ${String(status.counts.readablePackages)}   (an unreadable file is counted nowhere here — see below)`);
  lines.push(`    real, complete ........... ${String(status.counts.realPackages)}`);
  lines.push(`    fixture, complete ........ ${String(status.counts.fixturePackages)}   (NOT counted toward criterion 1, D-36)`);
  lines.push(`    missing evidence ......... ${String(status.counts.packagesMissingEvidence)}`);
  lines.push(`    warning-waived ........... ${String(status.counts.warningWaivedPackages)}   (D-35: reported separately from clean packages)`);
  lines.push(`    resolved real OUTPUTS .... ${String(status.counts.resolvedRealOutputs)}   (T-1/D-56: one approved cut per CreativeBrief)`);
  lines.push(`    superseded real .......... ${String(status.counts.supersededRealPackages)}`);
  lines.push(`    rejected real ............ ${String(status.counts.rejectedRealPackages)}   (unresolvable: the package set is incomplete)`);

  if (status.accounts.length > 0) {
    lines.push('', '  Real outputs by stable accountId (D-36 — a display-name change never splits a count)');
    for (const account of status.accounts) {
      lines.push(`    ${account.accountId} .... ${String(account.realOutputs)}`);
    }
  }

  if (status.superseded.length > 0) {
    lines.push('', '  Superseded packages (T-1 — folded into a later package of the same CreativeBrief, NAMED not just counted)');
    for (const item of status.superseded) {
      lines.push(`    ${item.contentPackageId} (${item.sourceClassification}) superseded by ${item.supersededBy} — CreativeBrief ${item.creativeBriefId}`);
    }
  }

  if (status.anomalies.length > 0) {
    lines.push('', '  Anomalies (the output key refused to merge these, and the refusal changes the count)');
    for (const anomaly of status.anomalies) lines.push(`    ${anomaly.kind}: ${anomaly.detail}`);
  }

  if (status.unreadable.length > 0) {
    lines.push('', '  Unreadable package files (named, never silently skipped — every criterion above is unproven or worse because of these)');
    for (const bad of status.unreadable) lines.push(`    ${bad.path}: ${bad.reason}`);
    if (status.unreadableRemedy !== null) lines.push(`    ${status.unreadableRemedy}`);
  }

  lines.push('', '  Milestones (D-38 — never merged)');
  lines.push(
    `    PIPELINE_IMPLEMENTATION_COMPLETE  ${status.milestones.pipelineImplementationComplete.earned ? 'EARNED' : 'not earned'}`,
  );
  lines.push(`      ${status.milestones.pipelineImplementationComplete.reason}`);
  lines.push(`    PHASE_0_EXIT_EARNED               ${status.milestones.phase0ExitEarned.earned ? 'EARNED' : 'not earned'}`);
  lines.push(`      ${status.milestones.phase0ExitEarned.reason}`);
  lines.push('');

  process.stdout.write(`${lines.join('\n')}\n`);
  // Deliberately 0. A red criterion is the honest state of an in-progress Phase 0,
  // not a command failure — and an operator running this daily must not learn to
  // read a non-zero exit as noise.
  return 0;
}
