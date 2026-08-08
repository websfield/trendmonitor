import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { WORKSPACE_ROOT } from '../src/paths.js';
import {
  CONTRACT_WINDOW,
  REQUIRED_ACCOUNTS,
  REQUIRED_REAL_OUTPUTS,
  computePhase0Status,
  loadAllPackages,
} from '../src/commands/status.js';

/**
 * `cutdown status --phase0` (decisions.md D-36/D-38, tech-spec §15 step 10).
 *
 * The acceptance criterion is that this matches a HAND-COMPUTED 20-output scenario,
 * so the suite builds exactly that on disk and checks every criterion against a
 * count worked out by hand — including the four ways it must stay red:
 *
 *   - a fixture package must not be counted as a real output;
 *   - an account display-name change must not split a stable `accountId`;
 *   - a schema MAJOR bump inside the last ten must keep criterion 3 red;
 *   - a package missing rights or QA evidence must keep criterion 4 red.
 *
 * Every package is written as a real file and read back through `loadAllPackages`,
 * because the criteria are claims about what is ON DISK and a hand-built in-memory
 * array would skip the half of the code that decides what counts.
 */

let jobsRoot: string;
/** Bumped for every generated id, so ids are unique. */
let counter = 0;
/**
 * Bumped ONCE per package, and it alone drives `createdAt`.
 *
 * The first cut derived `createdAt` from `counter`, which advances several times per
 * package (one per generated id) — so on-disk order did not match write order and
 * the "last ten" window came out scrambled. Criterion 3 is entirely about ordering,
 * so a fixture whose order is incidental cannot test it.
 */
let packageSeq = 0;

const H = (c: string) => ({ algorithm: 'sha256' as const, value: c.repeat(64) });

/** A ULID-shaped id whose lexical order matches creation order. */
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${String(counter).padStart(26 - prefix.length, '0')}`.toUpperCase();
}

interface PackageOptions {
  accountId?: string;
  sourceClassification?: 'real' | 'fixture';
  contractSet?: { schemaId: string; majorVersion: number; schemaVersion: string; contentHash: ReturnType<typeof H> }[];
  createdAt?: string;
  waiverCount?: number;
  rangeStatus?: 'ran' | 'skipped';
  rangeViolations?: number;
  rangeCount?: number;
  qaGateStatus?: 'pass' | 'pass_with_waivers' | 'fail';
  blockerCount?: number;
  weakestRightsState?: string;
  noAssets?: boolean;
  jobId?: string;
  /** Point the range evidence at a different QA report than the package's own. */
  mismatchedRangeReport?: boolean;
}

const DEFAULT_CONTRACT_SET = [
  { schemaId: 'https://cutdown.local/contracts/schemas/platform-edl-v1.json', majorVersion: 1, schemaVersion: '1.0.0', contentHash: H('a') },
  { schemaId: 'https://cutdown.local/contracts/schemas/render-v1.json', majorVersion: 1, schemaVersion: '1.0.0', contentHash: H('b') },
];

/** Write one ContentPackage to disk and return its id. */
function writePackage(options: PackageOptions = {}): string {
  packageSeq += 1;
  const id = nextId('01J9CP');
  const jobId = options.jobId ?? `job-${id.slice(-4)}`;
  const dir = join(jobsRoot, jobId, 'packages', id);
  mkdirSync(dir, { recursive: true });
  const qaReportId = nextId('01J9QR');
  const waiverCount = options.waiverCount ?? 0;

  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      contentPackageId: id,
      envelope: {
        schemaVersion: '1.0.0',
        // Strictly increasing in write order: one minute per package, so the sort
        // this suite relies on is the order the packages were created in.
        createdAt: options.createdAt ?? `2026-07-01T00:${String(packageSeq).padStart(2, '0')}:00.000Z`,
        createdBy: { kind: 'skill', skill: 'package', skillVersion: '1.0.0' },
      },
      jobId,
      accountId: options.accountId ?? 'acct-001',
      releaseState: 'rights_approved',
      sourceClassification: options.sourceClassification ?? 'real',
      approval: {
        reviewDecisionId: nextId('01J9RV'),
        decidedBy: 'Fred Wang',
        decidedAt: '2026-07-30T02:00:00.000Z',
        subjectDraftRenderId: nextId('01J9RD'),
        subjectRenderManifestId: nextId('01J9RM'),
      },
      lineage: {
        briefId: nextId('01J9JB'),
        creativeBriefId: nextId('01J9CB'),
        storyPlanId: nextId('01J9SP'),
        edlId: nextId('01J9ED'),
        finalRenderId: nextId('01J9RF'),
        finalRenderManifestId: nextId('01J9RN'),
        approvedDraftManifestId: nextId('01J9RQ'),
        editorialPlanHash: H('c'),
        planHash: H('d'),
      },
      master: {
        path: 'master.mp4',
        contentHash: H('e'),
        byteSize: 1000,
        container: 'mp4',
        durationMs: 4000,
        dimensions: { width: 720, height: 1280 },
        burnedInCaptions: true,
      },
      captions: { srtPath: 'captions.srt', vttPath: 'captions.vtt', cueCount: 2 },
      cover: {
        coverImagePath: 'cover.png',
        firstFramePath: 'first-frame.png',
        coverSource: { kind: 'defaulted_to_first_frame', reason: 'no cover declared' },
      },
      rightsManifest: {
        rightsManifestId: nextId('01J9RG'),
        assets:
          options.noAssets === true
            ? []
            : [
                {
                  assetId: nextId('01KY2C'),
                  relativePath: 'clean.mp4',
                  sourceClassification: options.sourceClassification ?? 'real',
                  contentHash: H('f'),
                  // The FULL RightsRecord. `rights-record-v1` requires all sixteen
                  // fields — a `{state:'cleared'}` stub was a shape the pipeline never
                  // produces, and contract validation on read is what surfaced it.
                  rights: {
                    state: 'cleared',
                    owner: 'Social Soup',
                    supplier: 'Social Soup',
                    permittedPlatforms: ['tiktok'],
                    territories: ['AU'],
                    campaignStart: '2026-07-01',
                    campaignEnd: '2026-12-31',
                    expiryDate: '2026-12-31',
                    talentReleaseStatus: 'obtained',
                    locationReleaseStatus: 'not_required',
                    musicStatus: 'none',
                    editingPermitted: true,
                    paidAmplificationPermitted: false,
                    evidenceUri: 'file:///permissions/clean.mp4.release.pdf',
                    notes: null,
                  },
                },
              ],
        weakestState: options.weakestRightsState ?? 'cleared',
        allEvidenced: true,
      },
      disclosures: {
        paidPartnership: false,
        aiGeneratedOrAltered: false,
        ownedBusinessPromotion: true,
        thirdPartyPromotion: false,
        affiliateRelationship: false,
        regulatedCategory: null,
      },
      aiAlterationRecord: { operations: ['selection'], materialAlteration: false, capturedAtIntake: false },
      qa: {
        qaReportId,
        gateStatus: options.qaGateStatus ?? (waiverCount > 0 ? 'pass_with_waivers' : 'pass'),
        rulesetVersion: '1.0.0',
        blockerCount: options.blockerCount ?? 0,
        warningCount: waiverCount,
        waivers: Array.from({ length: waiverCount }, () => ({
          waiverId: nextId('01J9QW'),
          approvedBy: 'Fred Wang',
          reason: 'accepted for a fixture tone',
          waivedAt: '2026-07-30T02:30:00.000Z',
          findingIds: ['true_peak:audio'],
        })),
      },
      rangeValidation: {
        qaReportId: options.mismatchedRangeReport === true ? nextId('01J9QR') : qaReportId,
        checkId: 'source_range_validity',
        status: options.rangeStatus ?? 'ran',
        rangeCount: options.rangeCount ?? 3,
        violationCount: options.rangeViolations ?? 0,
      },
      contractSet: options.contractSet ?? DEFAULT_CONTRACT_SET,
      provenance: {
        renderer: { name: 'renderer-ffmpeg', version: '1.0.0' },
        ffmpegVersion: '8.0.1',
        determinismTier: 1,
        qaRulesetVersion: '1.0.0',
        modelProvenance: { provider: 'anthropic', modelId: 'claude-sonnet-5', promptTemplateId: 'plan-edl', promptTemplateVersion: '1.0.0' },
        styleProfile: { kind: 'none', reason: 'none supplied' },
        platformCapability: { platform: 'tiktok', surface: 'organic-video', overlayVersion: '2026-07' },
        fonts: [{ family: 'Inter', role: 'caption', contentHash: H('9'), licenceNote: 'OFL' }],
      },
    }),
  );
  return id;
}

const status = () => computePhase0Status(loadAllPackages(jobsRoot));
const criterion = (id: string) => {
  const found = status().criteria.find((c) => c.id === id);
  ok(found !== undefined, `no criterion ${id}`);
  return found;
};

function reset(): void {
  rmSync(jobsRoot, { recursive: true, force: true });
  mkdirSync(jobsRoot, { recursive: true });
  packageSeq = 0;
}

before(() => {
  jobsRoot = join(mkdtempSync(join(tmpdir(), 'cutdown-status-')), 'jobs');
  mkdirSync(jobsRoot, { recursive: true });
});

after(() => {
  rmSync(join(jobsRoot, '..'), { recursive: true, force: true });
});

describe('an empty history is UNPROVEN, never proven-by-absence', () => {
  it('reports all four criteria red and neither milestone earned', () => {
    reset();
    const result = status();
    strictEqual(result.criteria.filter((c) => c.met).length, 0);
    strictEqual(result.milestones.pipelineImplementationComplete.earned, false);
    strictEqual(result.milestones.phase0ExitEarned.earned, false);
    // The wording matters: "zero invalid ranges" over zero packages is not zero.
    ok(criterion('zero-invalid-source-ranges').detail.includes('UNPROVEN'));
    ok(criterion('no-breaking-contract-change').detail.includes('not proven by absence'));
  });
});

describe('the hand-computed 20-output scenario', () => {
  // Hand-computed: 20 real packages spread 7 / 7 / 6 across three stable accounts,
  // plus 3 fixture packages that must NOT count, plus 2 of the real ones carrying a
  // warning waiver (counted separately, D-35). Expected: criteria 1, 2, 3 and 4 all
  // green; real = 20; fixture = 3; warning-waived = 2; accounts = 3.
  before(() => {
    reset();
    const accounts = ['acct-social-soup-001', 'acct-social-soup-002', 'acct-social-soup-003'];
    for (let i = 0; i < 20; i++) {
      writePackage({
        accountId: accounts[i % 3] as string,
        sourceClassification: 'real',
        // Two of the twenty were delivered with an accepted warning.
        waiverCount: i === 4 || i === 11 ? 1 : 0,
      });
    }
    for (let i = 0; i < 3; i++) writePackage({ sourceClassification: 'fixture' });
  });

  it('counts 20 real outputs across 3 accounts and excludes the 3 fixtures', () => {
    const result = status();
    strictEqual(result.counts.realPackages, REQUIRED_REAL_OUTPUTS);
    strictEqual(result.counts.fixturePackages, 3);
    strictEqual(result.counts.totalPackages, 23);
    strictEqual(result.accounts.length, REQUIRED_ACCOUNTS);
    deepStrictEqual(
      result.accounts.map((a) => a.realOutputs),
      [7, 7, 6],
      'hand-computed: 20 spread over 3 accounts round-robin is 7/7/6',
    );
    ok(criterion('approved-real-outputs').met);
    ok(criterion('approved-real-outputs').detail.includes('3 fixture package(s) EXCLUDED'));
  });

  it('counts the warning-waived packages separately (D-35)', () => {
    strictEqual(status().counts.warningWaivedPackages, 2);
  });

  it('reports all four criteria green and PHASE_0_EXIT_EARNED', () => {
    const result = status();
    const red = result.criteria.filter((c) => !c.met).map((c) => c.id);
    deepStrictEqual(red, [], `unexpectedly red: ${red.join(', ')}`);
    strictEqual(result.milestones.phase0ExitEarned.earned, true);
    strictEqual(result.milestones.pipelineImplementationComplete.earned, true);
    ok(
      result.milestones.pipelineImplementationComplete.reason.includes('PIPELINE half of D-38 only'),
      'the implementation milestone says which half of D-38 it can see — it must never be read as Phase 0 exit',
    );
  });
});

describe('fixture packages can never earn Phase 0 exit (D-27/D-36/D-38)', () => {
  it('20 FIXTURE packages across 3 accounts leave criterion 1 red', () => {
    reset();
    const accounts = ['acct-a', 'acct-b', 'acct-c'];
    for (let i = 0; i < 20; i++) {
      writePackage({ accountId: accounts[i % 3] as string, sourceClassification: 'fixture' });
    }
    const result = status();
    strictEqual(result.counts.fixturePackages, 20);
    strictEqual(result.counts.realPackages, 0);
    strictEqual(criterion('approved-real-outputs').met, false);
    strictEqual(result.milestones.phase0ExitEarned.earned, false);
    // But the pipeline milestone IS earned: the machine demonstrably works.
    strictEqual(result.milestones.pipelineImplementationComplete.earned, true);
  });
});

describe('a stable accountId survives a display-name change (D-36)', () => {
  it('does not split a count when the human-readable label would have', () => {
    // The package carries no display name AT ALL — that is the mechanism. These 20
    // outputs are one account before and after a rename, and the count stays one.
    reset();
    for (let i = 0; i < 20; i++) writePackage({ accountId: 'acct-social-soup-001' });
    const result = status();
    strictEqual(result.accounts.length, 1, 'one stable id, one group');
    strictEqual(result.accounts[0]?.realOutputs, 20);
    strictEqual(
      criterion('approved-real-outputs').met,
      false,
      '20 outputs on ONE account is still red: the criterion needs three',
    );
  });
});

describe('criterion 3: a schema MAJOR bump inside the last ten keeps it red', () => {
  const bumped = [
    { schemaId: 'https://cutdown.local/contracts/schemas/platform-edl-v1.json', majorVersion: 2, schemaVersion: '2.0.0', contentHash: H('a') },
    { schemaId: 'https://cutdown.local/contracts/schemas/render-v1.json', majorVersion: 1, schemaVersion: '1.0.0', contentHash: H('b') },
  ];

  it('goes red when a major version moves between consecutive packages', () => {
    reset();
    for (let i = 0; i < 8; i++) writePackage({ accountId: `acct-${String(i % 3)}` });
    // The bump lands inside the window.
    writePackage({ accountId: 'acct-0', contractSet: bumped });
    writePackage({ accountId: 'acct-1', contractSet: bumped });
    const c3 = criterion('no-breaking-contract-change');
    strictEqual(c3.met, false);
    ok(c3.detail.includes('platform-edl-v1.json v1→v2'), 'the offending schema and versions are named');
    strictEqual(c3.offendingPackageIds.length, 1, 'exactly one consecutive pair broke');
  });

  it('stays GREEN when only a content hash moves under an unchanged major', () => {
    // A description-only schema edit is a compatible change (tech-spec §3), and the
    // criterion is about BREAKING changes. Conflating the two would make every typo
    // fix in a schema comment reset the ten-output clock.
    reset();
    const edited = [
      { schemaId: 'https://cutdown.local/contracts/schemas/platform-edl-v1.json', majorVersion: 1, schemaVersion: '1.1.0', contentHash: H('7') },
      { schemaId: 'https://cutdown.local/contracts/schemas/render-v1.json', majorVersion: 1, schemaVersion: '1.0.0', contentHash: H('b') },
    ];
    for (let i = 0; i < 5; i++) writePackage({ accountId: `acct-${String(i % 3)}` });
    for (let i = 0; i < 5; i++) writePackage({ accountId: `acct-${String(i % 3)}`, contractSet: edited });
    strictEqual(criterion('no-breaking-contract-change').met, true);
  });

  it('counts a REMOVED contract as breaking — losing a schema is at least as bad as a bump', () => {
    // `diffContractSets` deliberately leaves this judgement to the caller, and the
    // caller was not making it: a schema that DISAPPEARED between two delivered
    // packages left the criterion green on the more severe of the two changes.
    reset();
    const shrunk = [DEFAULT_CONTRACT_SET[0] as (typeof DEFAULT_CONTRACT_SET)[number]];
    for (let i = 0; i < 5; i++) writePackage({ accountId: `acct-${String(i % 3)}` });
    for (let i = 0; i < 5; i++) writePackage({ accountId: `acct-${String(i % 3)}`, contractSet: shrunk });
    const c3 = criterion('no-breaking-contract-change');
    strictEqual(c3.met, false);
    ok(c3.detail.includes('REMOVED'), 'and the detail names what was lost');
  });

  it('only looks at the last ten — an older bump falls out of the window', () => {
    reset();
    writePackage({ accountId: 'acct-0' });
    writePackage({ accountId: 'acct-1', contractSet: bumped });
    // Ten more on the bumped set: the bump is now the 11th-from-last boundary.
    for (let i = 0; i < 10; i++) writePackage({ accountId: `acct-${String(i % 3)}`, contractSet: bumped });
    const c3 = criterion('no-breaking-contract-change');
    strictEqual(c3.met, true, `window of ${String(CONTRACT_WINDOW)} should no longer contain the bump`);
  });
});

describe('criterion 2: range evidence has to be real evidence', () => {
  it('a SKIPPED range check is UNREPRESENTABLE, and such a file never counts', () => {
    // `content-package-v1` fixes `rangeValidation.status` at `const: "ran"`, so a
    // package claiming a skipped range check cannot satisfy its own contract. Since
    // packages are now validated on read, the file is REPORTED as unreadable rather
    // than counted as "a package missing evidence" — which is the stronger outcome:
    // the bad state does not exist, instead of existing and being caught.
    reset();
    writePackage({ rangeStatus: 'skipped' });
    const result = status();
    strictEqual(result.counts.totalPackages, 0, 'it is not a package at all');
    strictEqual(result.unreadable.length, 1);
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('zero-invalid-source-ranges').met, false);
    strictEqual(criterion('rights-and-qa-evidence').met, false, 'an unreadable file keeps criterion 4 red');
  });

  it('a non-zero violationCount is UNREPRESENTABLE (const: 0), so such a file never counts', () => {
    reset();
    writePackage({ rangeViolations: 2 });
    const result = status();
    strictEqual(result.counts.totalPackages, 0, 'it fails its own contract, so it is not a package');
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('zero-invalid-source-ranges').met, false);
  });

  it('a zero rangeCount is UNREPRESENTABLE (minimum: 1) — "zero violations" over zero ranges claims nothing', () => {
    reset();
    writePackage({ rangeCount: 0 });
    const result = status();
    strictEqual(result.counts.totalPackages, 0);
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('zero-invalid-source-ranges').met, false);
  });
});

describe('criterion 4: missing evidence keeps it red', () => {
  it('a rights manifest with NO assets is unrepresentable, and such a file never counts', () => {
    // `rightsManifest.assets` is `minItems: 1` — "a package with no source assets is
    // not a package". Same reasoning as the skipped range check above: validated on
    // read, the file is reported rather than counted.
    reset();
    writePackage({ noAssets: true });
    const result = status();
    strictEqual(result.counts.totalPackages, 0);
    strictEqual(result.unreadable.length, 1);
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('rights-and-qa-evidence').met, false);
  });

  it('a `fail` gateStatus is UNREPRESENTABLE — the enum has no such member', () => {
    reset();
    writePackage({ qaGateStatus: 'fail' });
    const result = status();
    strictEqual(result.counts.totalPackages, 0);
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('rights-and-qa-evidence').met, false);
  });

  it('a non-zero blockerCount is UNREPRESENTABLE (const: 0), and never reaches the real count', () => {
    // A hand-authored package must not be able to assert its way into criterion 1 —
    // and it cannot even be a package, because the contract fixes the field at zero.
    reset();
    writePackage({ blockerCount: 1 });
    const result = status();
    strictEqual(result.counts.totalPackages, 0);
    strictEqual(result.counts.realPackages, 0, 'an unreadable file is never a counted output');
    strictEqual(criterion('rights-and-qa-evidence').met, false);
  });

  it('goes red on an uncleared weakestState — one of the two gaps still REACHABLE', () => {
    // `weakestState` is an enum with four members, so `unknown` is contract-VALID and
    // the package parses. This is one of only two `evidenceGaps` checks that a valid
    // package can still trip, which is why it earns a live test of its own.
    reset();
    writePackage({ weakestRightsState: 'unknown' });
    const result = status();
    strictEqual(result.counts.totalPackages, 1, 'it IS a valid package — the gap is semantic, not structural');
    strictEqual(result.counts.packagesMissingEvidence, 1);
    strictEqual(criterion('rights-and-qa-evidence').met, false);
    ok(criterion('rights-and-qa-evidence').detail.includes('weakest rights state'));
  });

  it('goes red when the range evidence names a DIFFERENT QA report — the other reachable gap', () => {
    // Both ids are Ulids, so this is contract-valid and only `rangeGaps` catches it:
    // range evidence that points at a different report is not evidence about THIS one.
    reset();
    writePackage({ mismatchedRangeReport: true });
    const result = status();
    strictEqual(result.counts.totalPackages, 1);
    strictEqual(criterion('zero-invalid-source-ranges').met, false);
    ok(criterion('zero-invalid-source-ranges').detail.includes('without acceptable evidence'));
  });
});

describe('unreadable package files are named, never silently skipped', () => {
  it('reports a malformed package and keeps criterion 4 red', () => {
    reset();
    writePackage();
    const dir = join(jobsRoot, 'job-broken', 'packages', '01J9CP00000000000000000BAD');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{ not json');
    const result = status();
    strictEqual(result.unreadable.length, 1);
    ok(result.unreadable[0]?.reason.includes('not valid JSON'));
    strictEqual(criterion('rights-and-qa-evidence').met, false, 'an unreadable package is missing evidence');
  });

  it('ignores a leftover .staging- directory rather than reporting it as corrupt', () => {
    // `package` removes its own staging on any failure, so one lying around is a
    // killed process — not a corrupt package, and not a delivered output either.
    reset();
    writePackage();
    mkdirSync(join(jobsRoot, 'job-x', 'packages', '.staging-01J9CP00000000000000000ABC'), { recursive: true });
    const result = status();
    deepStrictEqual(result.unreadable, []);
    strictEqual(result.counts.totalPackages, 1);
  });
});

/**
 * The reachability annotations in `evidenceGaps` / `rangeGaps` are claims about
 * the CONTRACT, not about this file — and a comment claiming a property is not
 * the property. Eight of the ten gap checks are marked "unreachable after
 * validate-on-read" so `counts.packagesMissingEvidence` is not misread as a live
 * signal; each of those markings depends on one schema constraint holding.
 *
 * If a constraint is ever loosened, the check becomes live again and the comment
 * beside it becomes false. This asserts the constraints by name so that
 * loosening fails here instead.
 */
describe('the schema constraints the status reachability notes depend on', () => {
  // Anchored on WORKSPACE_ROOT, not on this file: these tests execute from
  // `dist/tests/`, where a hand-counted `../../..` lands in `apps/` instead of
  // the workspace root.
  const schema = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, 'packages', 'contracts', 'schemas', 'content-package-v1.json'), 'utf8'),
  ) as { properties: Record<string, { properties: Record<string, Record<string, unknown>> }> };

  const prop = (section: string, key: string): Record<string, unknown> =>
    schema.properties[section]?.properties[key] ?? {};

  it('pins the constraints that make eight gap checks unreachable', () => {
    strictEqual(prop('approval', 'reviewDecisionId')['$ref'], './common/timecode-v1.json#/$defs/Ulid');
    strictEqual(prop('qa', 'qaReportId')['$ref'], './common/timecode-v1.json#/$defs/Ulid');
    deepStrictEqual(prop('qa', 'gateStatus')['enum'], ['pass', 'pass_with_waivers']);
    strictEqual(prop('qa', 'blockerCount')['const'], 0);
    strictEqual(prop('rightsManifest', 'assets')['minItems'], 1);
    strictEqual(prop('rangeValidation', 'status')['const'], 'ran');
    strictEqual(prop('rangeValidation', 'violationCount')['const'], 0);
    strictEqual(prop('rangeValidation', 'rangeCount')['minimum'], 1);
  });

  it('confirms the two REACHABLE checks are genuinely unconstrained by the schema', () => {
    // The control. If `weakestState` ever acquired `const: "cleared"`, the one
    // live evidence check would go dead and `packagesMissingEvidence` would be
    // structurally incapable of counting anything — a silent zero, which is the
    // exact misreading these notes exist to prevent.
    const weakest = prop('rightsManifest', 'weakestState');
    strictEqual(weakest['const'], undefined, 'weakestState must stay enum-wide; refusal at packaging is what holds it at cleared');
    // And the cross-field equality has no per-property expression at all.
    strictEqual(prop('rangeValidation', 'qaReportId')['const'], undefined);
  });
});
