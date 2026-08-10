import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { WORKSPACE_ROOT } from '../src/paths.js';
import {
  CONTRACT_WINDOW,
  REQUIRED_ACCOUNTS,
  REQUIRED_REAL_OUTPUTS,
  UNREADABLE_PACKAGE_REMEDY,
  computePhase0Status,
  loadAllPackages,
  statusPhase0Command,
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
  /**
   * Pin the CreativeBrief this package is a cut of.
   *
   * T-1/D-56 makes this the unit of a delivered OUTPUT, so it is the one option
   * every counting test below has to set: the default mints a fresh brief per
   * package, which is why the pre-T-1 suite stayed green under the new rule
   * without proving anything about it.
   */
  creativeBriefId?: string;
  /** Point the range evidence at a different QA report than the package's own. */
  mismatchedRangeReport?: boolean;
  /**
   * Blank `approval.reviewDecisionId` / `qa.qaReportId`.
   *
   * The two `evidenceGaps` checks whose "cannot fire" annotation had no test
   * driving it. Both fields are `$ref Ulid`, so a blank one makes the file fail
   * `content-package-v1` — which is the behaviour the annotation asserts.
   */
  emptyReviewDecisionId?: boolean;
  emptyQaReportId?: boolean;
}

/** A distinct, contract-valid (Crockford base32, 26 char) CreativeBrief id per index. */
const brief = (n: number): string => `01J9CB${String(n).padStart(20, '0')}`;

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
        reviewDecisionId: options.emptyReviewDecisionId === true ? '' : nextId('01J9RV'),
        decidedBy: 'Fred Wang',
        decidedAt: '2026-07-30T02:00:00.000Z',
        subjectDraftRenderId: nextId('01J9RD'),
        subjectRenderManifestId: nextId('01J9RM'),
      },
      lineage: {
        briefId: nextId('01J9JB'),
        creativeBriefId: options.creativeBriefId ?? nextId('01J9CB'),
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
        // Only the package's own id is blanked; `rangeValidation.qaReportId` keeps a
        // valid Ulid, so exactly ONE schema constraint is under test.
        qaReportId: options.emptyQaReportId === true ? '' : qaReportId,
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

/** The one directory this suite owns; every `reset()` mints a fresh root under it. */
let suiteRoot: string;

/**
 * Start the next test from a jobs root that is EMPTY BY CONSTRUCTION.
 *
 * This used to be `rmSync(jobsRoot, {recursive: true, force: true})` followed by a
 * re-`mkdir`, and the suite was intermittently red — three consecutive runs each
 * failing a *different* test (the fixture-eviction case reporting
 * `resolvedRealOutputs: 0`, then the repackaging and ten-package cases, then the
 * glyph render), followed by eleven green. A recursive delete on Windows is not
 * reliably complete when it returns, and a package directory that outlives its own
 * `package.json` is reported by `loadAllPackages` as an UNREADABLE file — which, under
 * the rule this stage added, makes all four criteria `unproven`. So one leftover from
 * the previous test does not fail the previous test; it silently corrupts the next
 * one, in whichever test happens to run after the race is lost.
 *
 * `mkdtemp` removes the race rather than narrowing it: nothing is deleted between
 * tests at all, and a fresh directory cannot hold another test's debris. The whole
 * tree goes at the end, once, where a slow delete costs nothing.
 */
function reset(): void {
  jobsRoot = join(mkdtempSync(join(suiteRoot, 'run-')), 'jobs');
  mkdirSync(jobsRoot, { recursive: true });
  // Asserted rather than assumed. If this ever stops being a fresh directory — a
  // revert to `rmSync`, a shared root, a stray writer — it fails HERE and says so,
  // instead of surfacing as an unrelated test's wrong count.
  deepStrictEqual(readdirSync(jobsRoot), [], 'each test must start from a genuinely empty jobs root');
  packageSeq = 0;
}

before(() => {
  suiteRoot = mkdtempSync(join(tmpdir(), 'cutdown-status-'));
  jobsRoot = join(suiteRoot, 'jobs');
  mkdirSync(jobsRoot, { recursive: true });
});

after(() => {
  rmSync(suiteRoot, { recursive: true, force: true });
});

describe('an empty history is UNPROVEN, never proven-by-absence', () => {
  it('reports all four criteria red and neither milestone earned', () => {
    reset();
    const result = status();
    strictEqual(result.criteria.filter((c) => c.state === 'met').length, 0);
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
    strictEqual(result.counts.readablePackages, 23);
    strictEqual(result.accounts.length, REQUIRED_ACCOUNTS);
    deepStrictEqual(
      result.accounts.map((a) => a.realOutputs),
      [7, 7, 6],
      'hand-computed: 20 spread over 3 accounts round-robin is 7/7/6',
    );
    strictEqual(criterion('approved-real-outputs').state, 'met');
    ok(criterion('approved-real-outputs').detail.includes('3 fixture package(s) EXCLUDED'));
  });

  it('counts the warning-waived packages separately (D-35)', () => {
    strictEqual(status().counts.warningWaivedPackages, 2);
  });

  it('reports all four criteria green and PHASE_0_EXIT_EARNED', () => {
    const result = status();
    const red = result.criteria.filter((c) => c.state !== 'met').map((c) => c.id);
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
    strictEqual(criterion('approved-real-outputs').state, 'not_met');
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
      criterion('approved-real-outputs').state,
      'not_met',
      '20 outputs on ONE account is still red: the criterion needs three',
    );
  });
});

describe('criterion 3: a schema MAJOR bump inside the last ten keeps it red', () => {
  /**
   * A family bump AS THE VERSIONING POLICY MANDATES IT (tech-spec §3): a semantic
   * change **adds a new file**, so `platform-edl-v2.json` appears BESIDE
   * `platform-edl-v1.json` and both entries coexist in the recorded set.
   *
   * This is the re-anchoring the plan's task 4b demanded. The only proof this branch
   * had was `platform-edl-v1.json` changing its own `majorVersion` from 1 to 2 in
   * place — the one transition §3 declares impossible — so the criterion's whole
   * subject matter was tested exclusively through a state the project forbids, and
   * the reachable shape (a new sibling file) was classified `added` and printed
   * "no schema major version moved". The in-place case is kept below, because it is
   * still worth refusing; it is no longer the only proof.
   */
  const coexisting = [
    { schemaId: 'https://cutdown.local/contracts/schemas/platform-edl-v1.json', majorVersion: 1, schemaVersion: '1.0.0', contentHash: H('a') },
    { schemaId: 'https://cutdown.local/contracts/schemas/platform-edl-v2.json', majorVersion: 2, schemaVersion: '2.0.0', contentHash: H('2') },
    { schemaId: 'https://cutdown.local/contracts/schemas/render-v1.json', majorVersion: 1, schemaVersion: '1.0.0', contentHash: H('b') },
  ];

  /** The forbidden shape: one `$id`, a mutated major. Refused, but no longer alone. */
  const mutatedInPlace = [
    { schemaId: 'https://cutdown.local/contracts/schemas/platform-edl-v1.json', majorVersion: 2, schemaVersion: '2.0.0', contentHash: H('a') },
    { schemaId: 'https://cutdown.local/contracts/schemas/render-v1.json', majorVersion: 1, schemaVersion: '1.0.0', contentHash: H('b') },
  ];

  it('goes red when a new major of an existing family JOINS the contract set', () => {
    reset();
    for (let i = 0; i < 8; i++) writePackage({ accountId: `acct-${String(i % 3)}` });
    // The bump lands inside the window, in the shape tech-spec §3 mandates.
    writePackage({ accountId: 'acct-0', contractSet: coexisting });
    writePackage({ accountId: 'acct-1', contractSet: coexisting });
    const c3 = criterion('no-breaking-contract-change');
    strictEqual(c3.state, 'not_met');
    ok(c3.detail.includes('platform-edl-v2.json v1→v2'), 'the offending schema and versions are named');
    strictEqual(c3.offendingPackageIds.length, 1, 'exactly one consecutive pair broke');
  });

  it('still refuses an in-place major mutation, even though the policy forbids authoring one', () => {
    reset();
    for (let i = 0; i < 8; i++) writePackage({ accountId: `acct-${String(i % 3)}` });
    writePackage({ accountId: 'acct-0', contractSet: mutatedInPlace });
    writePackage({ accountId: 'acct-1', contractSet: mutatedInPlace });
    const c3 = criterion('no-breaking-contract-change');
    strictEqual(c3.state, 'not_met');
    ok(c3.detail.includes('platform-edl-v1.json v1→v2'));
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
    strictEqual(criterion('no-breaking-contract-change').state, 'met');
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
    strictEqual(c3.state, 'not_met');
    ok(c3.detail.includes('REMOVED'), 'and the detail names what was lost');
  });

  it('only looks at the last ten — an older bump falls out of the window', () => {
    reset();
    writePackage({ accountId: 'acct-0' });
    writePackage({ accountId: 'acct-1', contractSet: coexisting });
    // Ten more on the bumped set: the bump is now the 11th-from-last boundary.
    for (let i = 0; i < 10; i++) writePackage({ accountId: `acct-${String(i % 3)}`, contractSet: coexisting });
    const c3 = criterion('no-breaking-contract-change');
    strictEqual(c3.state, 'met', `window of ${String(CONTRACT_WINDOW)} should no longer contain the bump`);
  });

  it('reports a DETECTED breaking change as not_met at THREE outputs, never as unproven', () => {
    // The three-way rule's whole reason to exist. A two-branch rule
    // (`window < 10 ⇒ unproven`, else breaking/clean) files a proven failure under
    // insufficient evidence's label — and it would do so at exactly the window size
    // the next contract migration lands at.
    reset();
    writePackage({ accountId: 'acct-0' });
    writePackage({ accountId: 'acct-1', contractSet: coexisting });
    writePackage({ accountId: 'acct-2', contractSet: coexisting });
    const c3 = criterion('no-breaking-contract-change');
    strictEqual(c3.state, 'not_met', 'a detected bump is a PROVEN failure at any window size');
    ok(c3.detail.includes('platform-edl-v2.json v1→v2'), 'and the offenders are named');
    strictEqual(c3.offendingPackageIds.length, 1);
  });

  it('is still red when a bump is ABSORBED by repackaging every affected CreativeBrief', () => {
    // The survivors-only trap. Bump a contract, then repackage all three briefs: every
    // pre-bump package is superseded, so a drift timeline walking survivors sees three
    // packages that all carry v2 and reports no movement — over a window in which a
    // major demonstrably moved. `contractSet` is a property of the PACKAGE, so the
    // timeline walks every delivered package of the windowed outputs.
    reset();
    for (let i = 0; i < 3; i++) writePackage({ jobId: 'job-abs', creativeBriefId: brief(i), accountId: `acct-${String(i)}` });
    for (let i = 0; i < 3; i++) {
      writePackage({ jobId: 'job-abs', creativeBriefId: brief(i), accountId: `acct-${String(i)}`, contractSet: coexisting });
    }
    const result = status();
    strictEqual(result.counts.resolvedRealOutputs, 3, 'three briefs, repackaged: still three outputs');
    strictEqual(result.counts.supersededRealPackages, 3, 'every pre-bump package was superseded');
    const c3 = criterion('no-breaking-contract-change');
    strictEqual(c3.state, 'not_met', 'the bump is still visible — the timeline is packages, not survivors');
    ok(c3.detail.includes('platform-edl-v2.json v1→v2'));
    ok(c3.detail.includes('6 evidence-complete real package(s) in the span'), 'and the span names both populations');
  });

  it('a package between two windowed packages is still walked', () => {
    // The span is the population, NOT output membership. A windowed output's
    // SUPERSEDED package can predate the survivor of an output that
    // `slice(-CONTRACT_WINDOW)` excludes, so a timeline built from
    // `windowOutputs.flatMap(...)` reaches back past packages it never examines —
    // and the criterion then reports on a span with holes in it.
    //
    // Built to exactly that shape: 13 evidence-complete real packages over 12
    // outputs, the FIRST brief repackaged LAST. Ordered by survivor, the two
    // earliest survivors (P2 and P3) fall out of the ten-output slice, while the
    // repackaged output drags the span's start back to P1 — so P2 and P3 sit
    // strictly INSIDE the printed span and outside every windowed output.
    //
    // P2 adds a contract and P3 removes it again. `removed` is a classification
    // this criterion deliberately counts as breaking, so skipping the pair
    // reported `met` while printing "no schema major version moved between
    // consecutive packages" — the exact denial the whole criterion exists to stop.
    reset();
    const withExtra = [
      ...DEFAULT_CONTRACT_SET,
      {
        schemaId: 'https://cutdown.local/contracts/schemas/supersession-record-v1.json',
        majorVersion: 1,
        schemaVersion: '1.0.0',
        contentHash: H('8'),
      },
    ];
    const job = 'job-span';
    writePackage({ jobId: job, creativeBriefId: brief(0) }); // P1 — superseded by P13
    writePackage({ jobId: job, creativeBriefId: brief(1), contractSet: withExtra }); // P2 — ADDS a contract
    writePackage({ jobId: job, creativeBriefId: brief(2) }); // P3 — REMOVES it again
    for (let i = 3; i < 12; i++) writePackage({ jobId: job, creativeBriefId: brief(i) }); // P4..P12
    writePackage({ jobId: job, creativeBriefId: brief(0) }); // P13 — repackages the first brief

    const result = status();
    strictEqual(result.counts.realPackages, 13, 'thirteen evidence-complete real packages on disk');
    strictEqual(result.counts.resolvedRealOutputs, 12, 'twelve outputs — the first brief was repackaged');
    const c3 = criterion('no-breaking-contract-change');
    ok(
      c3.detail.includes('13 evidence-complete real package(s) in the span'),
      `the span counts every evidence-complete real package inside it, not just the windowed outputs' own: ${c3.detail}`,
    );
    strictEqual(c3.state, 'not_met', 'the removal between P2 and P3 is inside the span, so it must be walked');
    ok(c3.detail.includes('supersession-record-v1.json REMOVED'), 'and the lost contract is named');
  });

  it('leaves NINE outputs unproven — and says nothing about whether a major moved', () => {
    reset();
    for (let i = 0; i < CONTRACT_WINDOW - 1; i++) writePackage({ accountId: `acct-${String(i % 3)}` });
    const c3 = criterion('no-breaking-contract-change');
    strictEqual(c3.state, 'unproven', 'nine is not ten');
    ok(c3.detail.includes(`9/${String(CONTRACT_WINDOW)} resolved real output(s)`));
    ok(c3.detail.includes('UNPROVEN'));
    ok(
      !c3.detail.includes('no schema major version moved'),
      'the UNPROVEN branch must not print the sentence that denies a bump happened',
    );
    deepStrictEqual(c3.offendingPackageIds, [], 'a criterion that cannot judge must not list offenders');
  });

  it('becomes decidable at TEN outputs', () => {
    reset();
    for (let i = 0; i < CONTRACT_WINDOW; i++) writePackage({ accountId: `acct-${String(i % 3)}` });
    const c3 = criterion('no-breaking-contract-change');
    strictEqual(c3.state, 'met');
    ok(c3.detail.includes('no schema major version moved'));
  });

  it('is NOT made decidable by ten packages of ONE CreativeBrief — the threshold counts outputs', () => {
    // The dilution trap. Ten repackages of one brief are ten packages and ONE output;
    // a threshold denominated in packages would call the criterion decidable, and
    // green, on the strength of a single delivered output.
    reset();
    for (let i = 0; i < CONTRACT_WINDOW; i++) writePackage({ jobId: 'job-one', creativeBriefId: brief(1) });
    const result = status();
    strictEqual(result.counts.realPackages, CONTRACT_WINDOW);
    strictEqual(result.counts.resolvedRealOutputs, 1);
    const c3 = criterion('no-breaking-contract-change');
    strictEqual(c3.state, 'unproven');
    ok(c3.detail.includes(`1/${String(CONTRACT_WINDOW)} resolved real output(s)`));
    ok(c3.detail.includes('10 evidence-complete real package(s) in the span'));
  });
});

describe('T-1/D-56: one approved cut per CreativeBrief is ONE delivered output', () => {
  it('counts two packages of one CreativeBrief once, the LATER surviving and the earlier NAMED', () => {
    // `writePackage` defaults `jobId` to a fresh job per package, so `jobId` is passed
    // explicitly here: under the composite output key, two different jobs would not
    // merge and this test would pass while proving nothing.
    reset();
    const earlier = writePackage({ jobId: 'job-t1', creativeBriefId: brief(1) });
    const later = writePackage({ jobId: 'job-t1', creativeBriefId: brief(1) });
    const result = status();
    strictEqual(result.counts.realPackages, 2, 'two packages exist on disk');
    strictEqual(result.counts.resolvedRealOutputs, 1, 'and they are ONE output');
    strictEqual(result.counts.supersededRealPackages, 1);
    deepStrictEqual(
      result.superseded.map((s) => [s.contentPackageId, s.supersededBy]),
      [[earlier, later]],
      'the superseded package is NAMED — a count of 0 is indistinguishable from "supersession was not computed"',
    );
    ok(criterion('approved-real-outputs').detail.includes('1/20 approved real output(s)'));
  });

  it('does not merge two packages of one CreativeBrief in DIFFERENT jobs, and reports the split', () => {
    reset();
    writePackage({ jobId: 'job-a', creativeBriefId: brief(1) });
    writePackage({ jobId: 'job-b', creativeBriefId: brief(1) });
    const result = status();
    strictEqual(result.counts.resolvedRealOutputs, 2, 'the composite key keeps them apart');
    strictEqual(result.counts.supersededRealPackages, 0);
    deepStrictEqual(
      result.anomalies.map((a) => a.kind),
      ['creative-brief-spans-jobs'],
      'the refusal to merge inflates the count, so it is REPORTED and not merely prevented',
    );
  });

  it('does not merge two packages of one CreativeBrief under DIFFERENT accounts, and reports it', () => {
    // The inverse of the jobId case, and the worse one: it splits one output into two
    // AND adds a spurious account to criterion 1's `accounts.length >= 3` tally,
    // moving that criterion TOWARD green.
    reset();
    writePackage({ jobId: 'job-x', creativeBriefId: brief(1), accountId: 'acct-A' });
    writePackage({ jobId: 'job-x', creativeBriefId: brief(1), accountId: 'acct-B' });
    const result = status();
    strictEqual(result.counts.resolvedRealOutputs, 2);
    strictEqual(result.accounts.length, 2);
    deepStrictEqual(
      result.anomalies.map((a) => a.kind),
      ['creative-brief-spans-accounts'],
    );
  });

  it('never lets a FIXTURE evict a real output that shares its CreativeBrief (D-36)', () => {
    reset();
    const realPkg = writePackage({ jobId: 'job-m', creativeBriefId: brief(1), sourceClassification: 'real' });
    // Written LATER, so under a class-blind key it would be "the latest" and would
    // take the real package's place — removing a real output from the exit count.
    writePackage({ jobId: 'job-m', creativeBriefId: brief(1), sourceClassification: 'fixture' });
    const result = status();
    strictEqual(result.counts.resolvedRealOutputs, 1);
    strictEqual(result.counts.supersededRealPackages, 0, 'a fixture supersedes nothing real');
    deepStrictEqual(result.superseded, []);
    ok(
      status().criteria.find((c) => c.id === 'approved-real-outputs')?.detail.includes('1/20'),
      'the real output survives',
    );
    strictEqual(result.counts.fixturePackages, 1);
    // Same class, same brief, one job — resolution is per class, so the fixture is
    // its own output and neither class evicts the other.
    strictEqual(realPkg.length, 26);
  });

  it('never lets an EVIDENCE-INCOMPLETE package supersede a complete one', () => {
    reset();
    const good = writePackage({ jobId: 'job-e', creativeBriefId: brief(1) });
    // Later, and missing evidence: under a completeness-blind resolver it would
    // supersede the good package and take criterion 1 from 1 to 0, while criterion 4
    // separately reported the offender.
    writePackage({ jobId: 'job-e', creativeBriefId: brief(1), weakestRightsState: 'unknown' });
    const result = status();
    strictEqual(result.counts.resolvedRealOutputs, 1);
    strictEqual(result.counts.packagesMissingEvidence, 1);
    deepStrictEqual(result.superseded, [], 'an incomplete package supersedes nothing');
    ok(criterion('approved-real-outputs').detail.includes('1/20 approved real output(s)'));
    strictEqual(criterion('rights-and-qa-evidence').state, 'not_met');
    ok(criterion('rights-and-qa-evidence').detail.includes(good.slice(-6)) === false, 'the complete package is not an offender');
  });

  it('keeps criterion 1 red at 20 PACKAGES over 19 briefs — the numerator counts outputs', () => {
    // The exit criterion is about outputs, and this is the corpus where the two
    // numbers first disagree at the threshold: a package-counted numerator would
    // report criterion 1 MET on 20 packages that are only 19 delivered outputs.
    reset();
    const accounts = ['acct-1', 'acct-2', 'acct-3'];
    for (let i = 0; i < 19; i++) {
      writePackage({ jobId: 'job-n', creativeBriefId: brief(i), accountId: accounts[i % 3] as string });
    }
    // The twentieth PACKAGE is a repackage of the first brief, not a new output.
    writePackage({ jobId: 'job-n', creativeBriefId: brief(0), accountId: accounts[0] as string });
    const result = status();
    strictEqual(result.counts.realPackages, 20, 'twenty packages on disk');
    strictEqual(result.counts.resolvedRealOutputs, 19, 'nineteen delivered outputs');
    strictEqual(result.accounts.length, REQUIRED_ACCOUNTS);
    strictEqual(criterion('approved-real-outputs').state, 'not_met', '20 packages are not 20 outputs');
    ok(criterion('approved-real-outputs').detail.includes('19/20 approved real output(s) across 3/3 account(s)'));
    strictEqual(status().milestones.phase0ExitEarned.earned, false);
  });

  it('counts the ACCOUNT tally over resolved outputs, not packages (a 2-account proof)', () => {
    // The 1-account live repo cannot distinguish the two implementations, so this is
    // built to: account A has two packages of ONE brief (one output), account B has
    // one package. A package-counted tally would report A: 2.
    reset();
    writePackage({ jobId: 'job-a', creativeBriefId: brief(1), accountId: 'acct-A' });
    writePackage({ jobId: 'job-a', creativeBriefId: brief(1), accountId: 'acct-A' });
    writePackage({ jobId: 'job-b', creativeBriefId: brief(2), accountId: 'acct-B' });
    const result = status();
    strictEqual(result.counts.realPackages, 3, 'three packages');
    strictEqual(result.counts.resolvedRealOutputs, 2, 'two outputs');
    deepStrictEqual(
      result.accounts,
      [
        { accountId: 'acct-A', realOutputs: 1 },
        { accountId: 'acct-B', realOutputs: 1 },
      ],
      'acct-A has ONE output, not two packages',
    );
    ok(criterion('approved-real-outputs').detail.includes('2/20 approved real output(s) across 2/3 account(s)'));
  });
});

describe('the Counts block reconciles against its written identities', () => {
  const assertIdentities = (result: ReturnType<typeof status>): void => {
    const c = result.counts;
    strictEqual(
      c.readablePackages,
      c.realPackages + c.fixturePackages + c.packagesMissingEvidence,
      'readable = real + fixture + missing evidence',
    );
    strictEqual(
      c.resolvedRealOutputs + c.supersededRealPackages + c.rejectedRealPackages,
      c.realPackages,
      'resolved outputs + superseded + rejected = real packages',
    );
  };

  it('holds with EVIDENCE-INCOMPLETE packages of BOTH classes present', () => {
    // The case that made the earlier `total = real + fixture` equation false: `real`
    // was filtered out of the complete set and `fixture` out of all packages, so one
    // incomplete package of either class broke the sum. It passed only vacuously, on
    // a corpus with zero incompletes — and both classes are here, because deriving
    // the two terms over different populations is wrong in either direction.
    reset();
    writePackage({ jobId: 'job-r', creativeBriefId: brief(1) });
    writePackage({ jobId: 'job-r', creativeBriefId: brief(1) });
    writePackage({ jobId: 'job-f', creativeBriefId: brief(2), sourceClassification: 'fixture' });
    writePackage({ jobId: 'job-i', creativeBriefId: brief(3), weakestRightsState: 'unknown' });
    writePackage({
      jobId: 'job-if',
      creativeBriefId: brief(4),
      sourceClassification: 'fixture',
      weakestRightsState: 'unknown',
    });
    const result = status();
    deepStrictEqual(
      {
        readable: result.counts.readablePackages,
        real: result.counts.realPackages,
        fixture: result.counts.fixturePackages,
        missing: result.counts.packagesMissingEvidence,
        outputs: result.counts.resolvedRealOutputs,
        superseded: result.counts.supersededRealPackages,
        rejected: result.counts.rejectedRealPackages,
      },
      { readable: 5, real: 2, fixture: 1, missing: 2, outputs: 1, superseded: 1, rejected: 0 },
      'hand-computed: 5 readable = 2 complete real + 1 complete fixture + 2 incomplete; 1 output + 1 superseded + 0 rejected = 2 real',
    );
    assertIdentities(result);
  });

  it('holds on the REJECTED arm, where an unreadable file places no package at all', () => {
    reset();
    writePackage({ jobId: 'job-r', creativeBriefId: brief(1) });
    writePackage({ jobId: 'job-r', creativeBriefId: brief(1) });
    const dir = join(jobsRoot, 'job-broken', 'packages', '01J9CP00000000000000000BAD');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{ not json');
    const result = status();
    strictEqual(result.counts.rejectedRealPackages, 2, 'neither survivor nor superseded — unresolvable');
    strictEqual(result.counts.resolvedRealOutputs, 0);
    strictEqual(result.counts.supersededRealPackages, 0);
    assertIdentities(result);
  });

  it('holds on the hand-computed 20-output corpus', () => {
    reset();
    const accounts = ['acct-1', 'acct-2', 'acct-3'];
    for (let i = 0; i < 20; i++) writePackage({ accountId: accounts[i % 3] as string });
    for (let i = 0; i < 3; i++) writePackage({ sourceClassification: 'fixture' });
    assertIdentities(status());
  });
});

describe('an unreadable package makes ALL FOUR criteria unproven, with a way forward', () => {
  const withOneUnreadable = (): ReturnType<typeof status> => {
    reset();
    writePackage({ jobId: 'job-ok', creativeBriefId: brief(1) });
    const dir = join(jobsRoot, 'job-broken', 'packages', '01J9CP00000000000000000BAD');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{ not json');
    return status();
  };

  it('reports every criterion as unproven — including criterion 4, which reported a disproof', () => {
    const result = withOneUnreadable();
    deepStrictEqual(
      result.criteria.map((c) => [c.id, c.state]),
      [
        ['approved-real-outputs', 'unproven'],
        ['zero-invalid-source-ranges', 'unproven'],
        ['no-breaking-contract-change', 'unproven'],
        ['rights-and-qa-evidence', 'unproven'],
      ],
      'a file that could not be read is not a package that failed',
    );
    strictEqual(result.milestones.phase0ExitEarned.earned, false, 'unproven is never earned');
    ok(result.milestones.phase0ExitEarned.reason.includes('4 unproven:'));
  });

  it("states criterion 2's own reason — an unreadable file may have carried invalid ranges", () => {
    ok(
      withOneUnreadable()
        .criteria.find((c) => c.id === 'zero-invalid-source-ranges')
        ?.detail.includes('an unreadable file may have carried invalid ranges'),
    );
  });

  it('prints a NON-DESTRUCTIVE remedy, and never tells anyone to delete evidence', () => {
    const result = withOneUnreadable();
    strictEqual(result.unreadableRemedy, UNREADABLE_PACKAGE_REMEDY);
    ok(UNREADABLE_PACKAGE_REMEDY.includes('re-run `cutdown package`'));
    ok(UNREADABLE_PACKAGE_REMEDY.includes('move the bad file aside'));
    ok(UNREADABLE_PACKAGE_REMEDY.includes('never delete delivered package evidence'));
    for (const c of result.criteria) {
      if (c.detail.includes('unreadable')) ok(c.detail.includes(UNREADABLE_PACKAGE_REMEDY), `${c.id} names the way forward`);
    }
  });

  it('carries no remedy when nothing is unreadable', () => {
    reset();
    writePackage();
    strictEqual(status().unreadableRemedy, null);
  });

  /**
   * PRECEDENCE, decided and asserted: a PROVEN failure outranks missing evidence.
   *
   * A run can hold both an evidence-incomplete package (disproof) and an unreadable
   * file (unproven). Downgrading the disproof to `unproven` would hide an established
   * failure behind an unrelated corrupt file, which is the same inversion criterion 3
   * refuses when it reports a detected bump as `not_met` below ten outputs. Criteria
   * 1 and 3 have no disproof available under an unreadable file — they are computed
   * from a resolution that goes indeterminate — so they stay unproven.
   */
  it('reports a proven failure as not_met even while an unreadable file is present', () => {
    reset();
    writePackage({ jobId: 'job-i', creativeBriefId: brief(1), weakestRightsState: 'unknown' });
    const dir = join(jobsRoot, 'job-broken', 'packages', '01J9CP00000000000000000BAD');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{ not json');
    const result = status();
    deepStrictEqual(
      result.criteria.map((c) => [c.id, c.state]),
      [
        ['approved-real-outputs', 'unproven'],
        ['zero-invalid-source-ranges', 'unproven'],
        ['no-breaking-contract-change', 'unproven'],
        ['rights-and-qa-evidence', 'not_met'],
      ],
      'criterion 4 has a disproof it can read; criteria 1 and 3 have no countable population at all',
    );
    ok(
      result.criteria.find((c) => c.id === 'rights-and-qa-evidence')?.detail.includes(UNREADABLE_PACKAGE_REMEDY),
      'and the unreadable file is still named, with its way forward',
    );
  });
});

describe('the three criterion states are reported as three different things', () => {
  it('renders three distinguishable glyphs and prints the remedy', () => {
    reset();
    // One complete real package: criterion 1 not_met, criterion 3 unproven,
    // criteria 2 and 4 met — all three states in one render.
    writePackage({ jobId: 'job-g', creativeBriefId: brief(1) });
    const before = computePhase0Status(loadAllPackages(jobsRoot));
    deepStrictEqual(before.criteria.map((c) => c.state), ['not_met', 'met', 'unproven', 'met']);

    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stdout.write;
    try {
      strictEqual(statusPhase0Command(jobsRoot), 0);
    } finally {
      process.stdout.write = original;
    }
    const out = written.join('');
    ok(out.includes('[x] zero invalid source ranges'), 'met renders [x]');
    ok(out.includes('[ ] >= 20 approved real outputs'), 'not_met renders [ ]');
    ok(out.includes(`[?] the last ${String(CONTRACT_WINDOW)} outputs`), 'unproven renders [?] — never [x]');
  });

  it('names both shortfall clauses separately, omitting either when its count is zero', () => {
    reset();
    writePackage({ jobId: 'job-s', creativeBriefId: brief(1) });
    strictEqual(
      status().milestones.phase0ExitEarned.reason,
      '1 of 4 criteria are not met: approved-real-outputs; 1 unproven: no-breaking-contract-change. ' +
        'D-38: the implementation milestone must never be reported as Phase 0 exit.',
    );

    reset();
    strictEqual(
      status().milestones.phase0ExitEarned.reason,
      '1 of 4 criteria are not met: approved-real-outputs; ' +
        '3 unproven: zero-invalid-source-ranges, no-breaking-contract-change, rights-and-qa-evidence. ' +
        'D-38: the implementation milestone must never be reported as Phase 0 exit.',
      'an empty history is mostly UNPROVEN, and the sentence a human reads says so',
    );
  });
});

describe('the live corpus: two real packages of one CreativeBrief are ONE output', () => {
  it('reports 1 real output where 2 real packages exist, or skips loudly', (t) => {
    // Driven from the REAL delivered packages, not the temp fixtures: the 2 → 1
    // transition this stage exists to produce is a claim about what `skills/package`
    // actually wrote. `project-data/` is gitignored, so a clean clone and CI have no
    // corpus — absence SKIPS with its reason named rather than passing vacuously.
    const loaded = loadAllPackages();
    const realPackages = loaded.packages.filter((pkg) => pkg.sourceClassification === 'real');
    if (realPackages.length === 0) {
      t.skip('no real ContentPackage on disk — project-data/ is gitignored, so this corpus does not exist on a clean clone or in CI');
      return;
    }
    const result = computePhase0Status(loaded);
    strictEqual(result.counts.realPackages, 2, 'a third real package means these expectations need re-deriving');
    strictEqual(result.counts.resolvedRealOutputs, 1, 'the live count moves from 2 packages to 1 output');
    strictEqual(result.counts.supersededRealPackages, 1);
    strictEqual(result.superseded.length, 1, 'and the superseded package is named, not merely counted');
    strictEqual(result.accounts.length, 1);
    strictEqual(result.accounts[0]?.realOutputs, 1);
    strictEqual(result.criteria.find((c) => c.id === 'approved-real-outputs')?.state, 'not_met');
    strictEqual(result.criteria.find((c) => c.id === 'no-breaking-contract-change')?.state, 'unproven');
    strictEqual(result.milestones.phase0ExitEarned.earned, false);
    strictEqual(result.milestones.pipelineImplementationComplete.earned, true);
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
    strictEqual(result.counts.readablePackages, 0, 'it is not a package at all');
    strictEqual(result.unreadable.length, 1);
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('zero-invalid-source-ranges').state, 'unproven');
    strictEqual(
      criterion('rights-and-qa-evidence').state,
      'unproven',
      'an unreadable file is UNPROVEN, not disproven: no package failed — one could not be read',
    );
  });

  it('a non-zero violationCount is UNREPRESENTABLE (const: 0), so such a file never counts', () => {
    reset();
    writePackage({ rangeViolations: 2 });
    const result = status();
    strictEqual(result.counts.readablePackages, 0, 'it fails its own contract, so it is not a package');
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('zero-invalid-source-ranges').state, 'unproven');
  });

  it('a zero rangeCount is UNREPRESENTABLE (minimum: 1) — "zero violations" over zero ranges claims nothing', () => {
    reset();
    writePackage({ rangeCount: 0 });
    const result = status();
    strictEqual(result.counts.readablePackages, 0);
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('zero-invalid-source-ranges').state, 'unproven');
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
    strictEqual(result.counts.readablePackages, 0);
    strictEqual(result.unreadable.length, 1);
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('rights-and-qa-evidence').state, 'unproven');
  });

  it('a `fail` gateStatus is UNREPRESENTABLE — the enum has no such member', () => {
    reset();
    writePackage({ qaGateStatus: 'fail' });
    const result = status();
    strictEqual(result.counts.readablePackages, 0);
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('rights-and-qa-evidence').state, 'unproven');
  });

  it('a non-zero blockerCount is UNREPRESENTABLE (const: 0), and never reaches the real count', () => {
    // A hand-authored package must not be able to assert its way into criterion 1 —
    // and it cannot even be a package, because the contract fixes the field at zero.
    reset();
    writePackage({ blockerCount: 1 });
    const result = status();
    strictEqual(result.counts.readablePackages, 0);
    strictEqual(result.counts.realPackages, 0, 'an unreadable file is never a counted output');
    strictEqual(criterion('rights-and-qa-evidence').state, 'unproven');
  });

  it('an EMPTY approval id is UNREPRESENTABLE ($ref Ulid), so such a file never counts', () => {
    // `evidenceGaps`'s first check. Its "unreachable" annotation rests on the Ulid
    // pattern, and the schema constraint was pinned below — but nothing DROVE the
    // behaviour, so the annotation was the only thing claiming a blank approval id
    // could not reach the gap. Now a package carrying one is shown to be refused,
    // on the same footing as the three siblings above.
    reset();
    writePackage({ emptyReviewDecisionId: true });
    const result = status();
    strictEqual(result.counts.readablePackages, 0, 'an empty approval id is not a package');
    strictEqual(result.unreadable.length, 1);
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('rights-and-qa-evidence').state, 'unproven');
  });

  it('an EMPTY QA report id is UNREPRESENTABLE ($ref Ulid), so such a file never counts', () => {
    // `evidenceGaps`'s second check, and the other one that had no test of its own.
    reset();
    writePackage({ emptyQaReportId: true });
    const result = status();
    strictEqual(result.counts.readablePackages, 0, 'an empty QA report id is not a package');
    strictEqual(result.unreadable.length, 1);
    ok(result.unreadable[0]?.reason.includes('content-package-v1'));
    strictEqual(criterion('rights-and-qa-evidence').state, 'unproven');
  });

  it('goes red on an uncleared weakestState — one of the two gaps still REACHABLE', () => {
    // `weakestState` is an enum with four members, so `unknown` is contract-VALID and
    // the package parses. This is one of only two `evidenceGaps` checks that a valid
    // package can still trip, which is why it earns a live test of its own.
    reset();
    writePackage({ weakestRightsState: 'unknown' });
    const result = status();
    strictEqual(result.counts.readablePackages, 1, 'it IS a valid package — the gap is semantic, not structural');
    strictEqual(result.counts.packagesMissingEvidence, 1);
    strictEqual(
      criterion('rights-and-qa-evidence').state,
      'not_met',
      'a readable package whose evidence is missing DISPROVES the criterion — it is not merely unproven',
    );
    ok(criterion('rights-and-qa-evidence').detail.includes('weakest rights state'));
  });

  it('goes red when the range evidence names a DIFFERENT QA report — the other reachable gap', () => {
    // Both ids are Ulids, so this is contract-valid and only `rangeGaps` catches it:
    // range evidence that points at a different report is not evidence about THIS one.
    reset();
    writePackage({ mismatchedRangeReport: true });
    const result = status();
    strictEqual(result.counts.readablePackages, 1);
    strictEqual(criterion('zero-invalid-source-ranges').state, 'not_met');
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
    strictEqual(
      criterion('rights-and-qa-evidence').state,
      'unproven',
      'an unreadable package makes the evidence set incomplete — it does not prove a package failed',
    );
  });

  it('ignores a leftover .staging- directory rather than reporting it as corrupt', () => {
    // `package` removes its own staging on any failure, so one lying around is a
    // killed process — not a corrupt package, and not a delivered output either.
    reset();
    writePackage();
    mkdirSync(join(jobsRoot, 'job-x', 'packages', '.staging-01J9CP00000000000000000ABC'), { recursive: true });
    const result = status();
    deepStrictEqual(result.unreadable, []);
    strictEqual(result.counts.readablePackages, 1);
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
