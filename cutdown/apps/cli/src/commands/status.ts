import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { createAjv, diffContractSets, formatAjvErrors, type ContractSetEntry } from '@cutdown/contracts';
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

export interface Criterion {
  readonly id: string;
  readonly label: string;
  readonly met: boolean;
  /** One line stating the measured position, whether met or not. */
  readonly detail: string;
  /** Package ids the criterion is red because of, when applicable. */
  readonly offendingPackageIds: readonly string[];
}

export interface Phase0Status {
  readonly criteria: readonly Criterion[];
  readonly counts: {
    readonly totalPackages: number;
    readonly realPackages: number;
    readonly fixturePackages: number;
    readonly warningWaivedPackages: number;
    readonly packagesMissingEvidence: number;
  };
  readonly accounts: readonly { readonly accountId: string; readonly realOutputs: number }[];
  readonly milestones: {
    readonly pipelineImplementationComplete: { readonly earned: boolean; readonly reason: string };
    readonly phase0ExitEarned: { readonly earned: boolean; readonly reason: string };
  };
  /** Files under `packages/` that did not parse as a ContentPackage, named not counted. */
  readonly unreadable: readonly { readonly path: string; readonly reason: string }[];
}

export interface LoadedPackages {
  readonly packages: readonly ContentPackage[];
  readonly unreadable: readonly { readonly path: string; readonly reason: string }[];
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
 * Does this package carry every piece of evidence a delivered output must?
 *
 * **Reachability, stated so `packagesMissingEvidence` is not misread as live.**
 * Packages are contract-validated on read, so most of these can no longer fire:
 * `content-package-v1.json` already makes the shape they test unrepresentable.
 * Across both functions, EIGHT of the ten gap checks are in that position;
 * exactly ONE here survives validation — `weakestState` — because the enum
 * admits every rights state and only `package`'s refusal keeps a committed
 * package at `cleared`. A non-zero count therefore means a rights failure, or a
 * range-report mismatch from `rangeGaps`, and nothing else.
 *
 * They are kept rather than pruned because each is the same assertion the schema
 * makes, and this command reads packages that have travelled away from the job
 * that minted them. `status.test.ts` asserts the schema constraints named below,
 * so a loosening turns a "cannot fire" line back into a live one and says so,
 * instead of leaving this comment quietly wrong.
 */
function evidenceGaps(pkg: ContentPackage): string[] {
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

/**
 * Range-validation evidence, per D-36's "final-render range-validation ID".
 *
 * Same reachability note as `evidenceGaps`: the one live check here is the
 * cross-field one, because no single-field schema constraint can express it.
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

  // Criterion 1 counts only APPROVED REAL packages. `sourceClassification` is the
  // sole mechanism keeping fixture runs out of exit evidence (D-27/D-36/D-38).
  //
  // What "approved" means HERE, precisely: the package is contract-valid and carries
  // an approval id, a passing QA verdict with no blocker, and a cleared rights
  // manifest. It does NOT resolve the approval id back to a ReviewDecision on disk —
  // a delivered package is meant to travel away from its job directory, so the
  // decision file may legitimately not be reachable from where this command runs.
  // `package` is what refuses to mint a package without a resolvable approval; this
  // command checks the evidence the package itself carries.
  const complete = all.filter((pkg) => evidenceGaps(pkg).length === 0);
  const real = complete.filter((pkg) => pkg.sourceClassification === 'real');
  const fixture = all.filter((pkg) => pkg.sourceClassification === 'fixture');
  const incomplete = all.filter((pkg) => evidenceGaps(pkg).length > 0);

  // Grouped by the STABLE accountId, never by display name — D-36 keeps the
  // display name off the package precisely so a rename cannot split a count.
  const byAccount = new Map<string, number>();
  for (const pkg of real) byAccount.set(pkg.accountId, (byAccount.get(pkg.accountId) ?? 0) + 1);
  const accounts = [...byAccount.entries()]
    .map(([accountId, realOutputs]) => ({ accountId, realOutputs }))
    .sort((a, b) => (a.accountId < b.accountId ? -1 : 1));

  const criterion1: Criterion = {
    id: 'approved-real-outputs',
    label: `>= ${String(REQUIRED_REAL_OUTPUTS)} approved real outputs across ${String(REQUIRED_ACCOUNTS)} accounts`,
    met: real.length >= REQUIRED_REAL_OUTPUTS && accounts.length >= REQUIRED_ACCOUNTS,
    detail:
      `${String(real.length)}/${String(REQUIRED_REAL_OUTPUTS)} approved real output(s) across ` +
      `${String(accounts.length)}/${String(REQUIRED_ACCOUNTS)} account(s)` +
      (fixture.length > 0 ? `; ${String(fixture.length)} fixture package(s) EXCLUDED (D-36)` : ''),
    offendingPackageIds: [],
  };

  // Criterion 2 binds to FINAL renders, and every ContentPackage is built from one.
  const rangeOffenders = complete.filter((pkg) => rangeGaps(pkg).length > 0);
  const criterion2: Criterion = {
    id: 'zero-invalid-source-ranges',
    label: 'zero invalid source ranges in final renders',
    met: rangeOffenders.length === 0 && complete.length > 0,
    detail:
      complete.length === 0
        ? 'no delivered package exists yet, so there is nothing to have validated — this is UNPROVEN, not proven'
        : `${String(complete.length)} package(s) carry range-validation evidence; ` +
          `${String(complete.reduce((sum, pkg) => sum + pkg.rangeValidation.rangeCount, 0))} range(s) validated, ` +
          `${String(rangeOffenders.length)} package(s) without acceptable evidence`,
    offendingPackageIds: rangeOffenders.map((pkg) => pkg.contentPackageId),
  };

  // Criterion 3 walks the last ten APPROVED REAL packages in order and compares
  // each recorded contract set with its predecessor's. A `majorVersion` that moved
  // is a breaking change (tech-spec §3); a `contentHash` that moved under an
  // unchanged major is compatible or editorial. The packages ARE the timeline.
  const window = real.slice(-CONTRACT_WINDOW);
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
  const criterion3: Criterion = {
    id: 'no-breaking-contract-change',
    label: `the last ${String(CONTRACT_WINDOW)} outputs require no breaking contract change`,
    // An empty or single-package window is UNPROVEN, not proven: a criterion about
    // stability across ten outputs cannot be satisfied by having produced one.
    met: window.length >= 2 && breaking.length === 0,
    detail:
      window.length < 2
        ? `only ${String(window.length)} approved real output(s) exist, so stability across ${String(CONTRACT_WINDOW)} is UNPROVEN (not proven by absence)`
        : breaking.length === 0
          ? `${String(window.length)} output(s) in the window; no schema major version moved between consecutive packages`
          : `${String(breaking.length)} breaking change(s): ` +
            breaking.map((b) => `${b.description} between ${b.from.slice(-6)} and ${b.to.slice(-6)}`).join('; '),
    offendingPackageIds: breaking.map((b) => b.to),
  };

  const evidenceOffenders = incomplete.map((pkg) => pkg.contentPackageId);
  const criterion4: Criterion = {
    id: 'rights-and-qa-evidence',
    label: 'rights records and QA reports accompany every delivered package',
    met: all.length > 0 && incomplete.length === 0 && loaded.unreadable.length === 0,
    detail:
      all.length === 0
        ? 'no delivered package exists yet — UNPROVEN'
        : `${String(complete.length)}/${String(all.length)} package(s) carry complete rights + QA evidence` +
          (incomplete.length > 0
            ? `; incomplete: ${incomplete.map((pkg) => `${pkg.contentPackageId.slice(-6)} (${evidenceGaps(pkg).join(', ')})`).join('; ')}`
            : '') +
          (loaded.unreadable.length > 0 ? `; ${String(loaded.unreadable.length)} unreadable package file(s)` : ''),
    offendingPackageIds: evidenceOffenders,
  };

  const criteria = [criterion1, criterion2, criterion3, criterion4];
  const warningWaived = all.filter((pkg) => pkg.qa.waivers.length > 0);

  // D-38. The pipeline milestone is about the MACHINE; the exit milestone is about
  // real work at scale. Reported separately, with the implementation milestone
  // stating plainly which half of D-38's definition it can and cannot see.
  const pipelineEarned = complete.length > 0;
  const exitEarned = criteria.every((criterion) => criterion.met);

  return {
    criteria,
    counts: {
      totalPackages: all.length,
      realPackages: real.length,
      fixturePackages: fixture.length,
      warningWaivedPackages: warningWaived.length,
      packagesMissingEvidence: incomplete.length,
    },
    accounts,
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
          : `${String(criteria.filter((c) => !c.met).length)} of 4 criteria are not met: ${criteria.filter((c) => !c.met).map((c) => c.id).join(', ')}. ` +
            `D-38: the implementation milestone must never be reported as Phase 0 exit.`,
      },
    },
    unreadable: loaded.unreadable,
  };
}

/** `cutdown status --phase0`. Exit 0 always — a red criterion is news, not an error. */
export function statusPhase0Command(jobsRoot: string = JOBS_ROOT): number {
  const status = computePhase0Status(loadAllPackages(jobsRoot));
  const lines: string[] = ['', 'cutdown status --phase0 — PRD §15 Phase 0 exit criteria (evidence: ContentPackages only, D-36)', ''];

  for (const criterion of status.criteria) {
    lines.push(`  [${criterion.met ? 'x' : ' '}] ${criterion.label}`);
    lines.push(`      ${criterion.detail}`);
    if (criterion.offendingPackageIds.length > 0) {
      lines.push(`      offending package(s): ${criterion.offendingPackageIds.join(', ')}`);
    }
  }

  lines.push('', '  Counts');
  lines.push(`    packages total ............ ${String(status.counts.totalPackages)}`);
  lines.push(`    real (counted) ........... ${String(status.counts.realPackages)}`);
  lines.push(`    fixture (NOT counted) .... ${String(status.counts.fixturePackages)}`);
  lines.push(`    warning-waived ........... ${String(status.counts.warningWaivedPackages)}   (D-35: reported separately from clean packages)`);
  lines.push(`    missing evidence ......... ${String(status.counts.packagesMissingEvidence)}`);

  if (status.accounts.length > 0) {
    lines.push('', '  Real outputs by stable accountId (D-36 — a display-name change never splits a count)');
    for (const account of status.accounts) {
      lines.push(`    ${account.accountId} .... ${String(account.realOutputs)}`);
    }
  }

  if (status.unreadable.length > 0) {
    lines.push('', '  Unreadable package files (named, never silently skipped)');
    for (const bad of status.unreadable) lines.push(`    ${bad.path}: ${bad.reason}`);
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
