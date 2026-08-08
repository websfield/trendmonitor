import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';

/**
 * The `package` skill through its real argv entrypoint (tech-spec §6.2).
 *
 * Two of the four Phase 0 exit criteria are computed from ContentPackages and
 * nothing else, so almost every test here is a REFUSAL: each one is a way a
 * package could otherwise be counted as a delivered output without deserving it.
 * The happy path is proven once; the ways it must not happen are proven eight
 * times, because that is where the criteria actually live.
 *
 * The media is real (the `clean.mp4` fixture copied as a stand-in master) because
 * the cover and first-frame extraction genuinely runs FFmpeg — a mocked master
 * would leave `extractStillFrame` untested at the only boundary that matters.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(here, '..', '..');
const CUTDOWN_ROOT = join(SKILL_DIR, '..', '..');
const ENTRY = join(SKILL_DIR, 'dist', 'src', 'main.js');
const FIXTURE_MEDIA = join(CUTDOWN_ROOT, 'data', 'golden-sets', 'ingest', 'clean.mp4');

const JOB_ID = 'package-skill-test';
const ASSET_ID = '01KY2C5WZM38M23VRGB7H7WFV3';
const EDL_ID = '01J9ED2B3C4D5E6F7G8H9K0M6T';
const STORY_PLAN_ID = '01J9SP2B3C4D5E6F7G8H9K0M5S';
const CREATIVE_BRIEF_ID = '01J9CB2B3C4D5E6F7G8H9K0M1A';
const JOB_BRIEF_ID = '01J9JB2B3C4D5E6F7G8H9K0M1A';
const MOMENT_ID = '01J9MN2B3C4D5E6F7G8H9K0M1A';

const DRAFT_MANIFEST = '01J9RM2B3C4D5E6F7G8H9K0N1A';
const DRAFT_RENDER = '01J9RD2B3C4D5E6F7G8H9K0N2B';
const FINAL_MANIFEST = '01J9RM2B3C4D5E6F7G8H9K0N9Z';
const FINAL_RENDER = '01J9RD2B3C4D5E6F7G8H9K0N9Z';
const DECISION_ID = '01J9RV2B3C4D5E6F7G8H9K0P1A';
const EDITORIAL_PLAN_HASH = 'a'.repeat(64);

let workspace: string;
let jobDir: string;
let requestCounter = 0;

interface Invocation {
  status: number;
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  stderr: string;
}

function invoke(request: unknown): Invocation {
  requestCounter += 1;
  const inputPath = join(workspace, `request-${String(requestCounter)}.json`);
  const outputPath = `${inputPath}.out.json`;
  writeFileSync(inputPath, JSON.stringify(request));
  const run = spawnSync(process.execPath, [ENTRY, '--input', inputPath, '--output', outputPath], {
    encoding: 'utf8',
    cwd: SKILL_DIR,
    timeout: 300_000,
    shell: false,
    env: { ...process.env, CUTDOWN_WORKSPACE_ROOT: workspace },
  });
  if (run.error) throw run.error;
  const stderr = run.stderr ?? '';
  if ((run.status ?? 1) === 0) {
    return { status: 0, result: JSON.parse(readFileSync(outputPath, 'utf8')) as Record<string, unknown>, error: null, stderr };
  }
  const start = stderr.indexOf('{');
  ok(start >= 0, `expected a structured error on stderr, got: ${stderr.slice(0, 600)}`);
  ok(!stderr.includes('    at '), 'callers parse stderr; a stack trace breaks the contract');
  return { status: run.status ?? 1, result: null, error: JSON.parse(stderr.slice(start)) as { code: string; message: string }, stderr };
}

/** sha256 of a file, matching `hashBytes` in @cutdown/contracts. */
const sha256File = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const envelope = (kind: 'skill' | 'human' = 'skill') => ({
  schemaVersion: '1.0.0',
  createdAt: '2026-07-30T00:00:00.000Z',
  createdBy: kind === 'skill' ? { kind: 'skill', skill: 'plan', skillVersion: '1.0.0' } : { kind: 'human', name: 'Fred' },
});

const clearedRights = (evidenced = true) => ({
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
  evidenceUri: evidenced ? 'file:///permissions/clean.mp4.release.pdf' : null,
  notes: null,
});

interface Options {
  rights?: ReturnType<typeof clearedRights>;
  sourceClassification?: 'real' | 'fixture';
  finalGateStatus?: 'pass' | 'pass_with_waivers' | 'fail';
  finalFindings?: { findingId: string; checkId: string; severity: 'blocker' | 'warning' | 'info'; waivable: boolean }[];
  /** Set by `seedJob` — the fixture completes each finding to the real contract shape. */
  finalWaiverIds?: string[];
  finalWaivedFindingIds?: string[];
  rangeCheckStatus?: 'ran' | 'skipped' | 'errored';
  finalEditorialPlanHash?: string;
  decision?: { outcome: 'approved' } | { outcome: 'rejected'; reason: string };
  omitDecision?: boolean;
  approvalEdlId?: string;
  coverFrame?: unknown;
  omitCaptions?: boolean;
  omitFinalManifestApproval?: boolean;
  /** Make the DRAFT report's planHash differ from the approval's recorded one. */
  draftPlanHashOverride?: string;
  /** Delete the approved draft's QA report after seeding. */
  omitDraftQaReport?: boolean;
}

/** Build a complete, packageable job on disk; `options` breaks exactly one thing. */
function seedJob(options: Options = {}): void {
  rmSync(jobDir, { recursive: true, force: true });
  for (const sub of ['assets', 'brief', 'creative-briefs', 'story-plans', 'edl', 'source', 'reviews', 'moments']) {
    mkdirSync(join(jobDir, sub), { recursive: true });
  }
  cpSync(FIXTURE_MEDIA, join(jobDir, 'source', 'clean.mp4'));

  writeFileSync(
    join(jobDir, 'assets', `${ASSET_ID}.json`),
    JSON.stringify({
      assetId: ASSET_ID,
      envelope: envelope(),
      jobId: JOB_ID,
      relativePath: 'clean.mp4',
      assetKind: 'video',
      sourceClassification: options.sourceClassification ?? 'fixture',
      contentHash: { algorithm: 'sha256', value: 'b'.repeat(64) },
      byteSize: 184320,
      storedPath: 'source/clean.mp4',
      rights: options.rights ?? clearedRights(),
      preflight: { duration: { ticks: 76800, timebase: { num: 1, den: 15360 } }, audioTracks: [{ index: 0, codec: 'aac', sampleRate: 48000, channels: 1 }] },
      proxy: null,
    }),
  );

  writeFileSync(
    join(jobDir, 'brief', `${JOB_BRIEF_ID}.json`),
    JSON.stringify({ briefId: JOB_BRIEF_ID, envelope: envelope(), accountId: 'acct-social-soup-001', objective: 'discovery' }),
  );
  writeFileSync(
    join(jobDir, 'creative-briefs', `${CREATIVE_BRIEF_ID}.json`),
    JSON.stringify({ creativeBriefId: CREATIVE_BRIEF_ID, envelope: envelope(), jobId: JOB_ID }),
  );
  writeFileSync(
    join(jobDir, 'story-plans', `${STORY_PLAN_ID}.json`),
    JSON.stringify({ storyPlanId: STORY_PLAN_ID, envelope: envelope(), jobId: JOB_ID, creativeBriefId: CREATIVE_BRIEF_ID }),
  );
  writeFileSync(
    join(jobDir, 'edl', `${EDL_ID}.json`),
    JSON.stringify({
      edlId: EDL_ID,
      envelope: envelope(),
      jobId: JOB_ID,
      storyPlanId: STORY_PLAN_ID,
      parentEdlId: null,
      platform: 'tiktok',
      objective: 'discovery',
      distributionMode: 'organic',
      locale: 'en-AU',
      targetDurationRange: { minSeconds: 5, maxSeconds: 60 },
      canvas: { width: 720, height: 1280, aspectRatio: '9:16' },
      aspectTreatment: { mode: 'letterbox', rationale: 'landscape source' },
      hookFamily: 'curiosity_first',
      clips: [
        {
          clipId: 'clip-1',
          order: 0,
          momentId: MOMENT_ID,
          assetId: ASSET_ID,
          sourceRange: { assetId: ASSET_ID, startTicks: 0, endTicks: 46080, timebase: { num: 1, den: 15360 } },
          narrativeFunction: 'promise',
          rationale: 'opening',
          caption: { kind: 'text', displayText: 'short caption' },
        },
      ],
      audioMode: 'native_audio_plan',
      disclosures: { paidPartnership: false, aiGeneratedOrAltered: false, ownedBusinessPromotion: true },
      metadata: { title: 'Package test', description: null },
      coverFrame: options.coverFrame ?? { kind: 'none' },
      modelProvenance: { provider: 'anthropic', modelId: 'fixture', promptTemplateId: 'plan-edl', promptTemplateVersion: '1.0.0' },
    }),
  );

  writeRender('draft', DRAFT_MANIFEST, DRAFT_RENDER, EDITORIAL_PLAN_HASH, null, options);
  writeRender(
    'final',
    FINAL_MANIFEST,
    FINAL_RENDER,
    options.finalEditorialPlanHash ?? EDITORIAL_PLAN_HASH,
    options.omitFinalManifestApproval === true ? null : DRAFT_MANIFEST,
    options,
  );

  if (options.omitDraftQaReport === true) {
    rmSync(join(jobDir, 'renders', 'draft', DRAFT_MANIFEST, 'qa-report.json'), { force: true });
  }

  if (options.omitDecision !== true) {
    const decision = options.decision ?? { outcome: 'approved' as const };
    writeFileSync(
      join(jobDir, 'reviews', `${DECISION_ID}.json`),
      JSON.stringify({
        reviewDecisionId: DECISION_ID,
        envelope: envelope('human'),
        jobId: JOB_ID,
        subjectDraftRenderId: DRAFT_RENDER,
        subjectEdlId: options.approvalEdlId ?? EDL_ID,
        subjectRenderManifestId: DRAFT_MANIFEST,
        subjectPlanHash: { algorithm: 'sha256', value: 'c'.repeat(64) },
        decidedBy: 'Fred Wang',
        decidedAt: '2026-07-30T02:00:00.000Z',
        decision: decision.outcome === 'approved' ? { outcome: 'approved', notes: null } : { ...decision, notes: null },
      }),
    );
  }
}

function writeRender(
  tier: 'draft' | 'final',
  manifestId: string,
  renderId: string,
  editorialPlanHash: string,
  approvedDraftManifestId: string | null,
  options: Options,
): void {
  const dir = join(jobDir, 'renders', tier, manifestId);
  mkdirSync(dir, { recursive: true });
  cpSync(FIXTURE_MEDIA, join(dir, 'output.mp4'));
  if (options.omitCaptions !== true) {
    writeFileSync(join(dir, 'captions.srt'), '1\n00:00:00,000 --> 00:00:02,000\nshort caption\n\n2\n00:00:02,000 --> 00:00:04,000\nsecond cue\n');
    writeFileSync(join(dir, 'captions.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nshort caption\n');
  }

  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      renderManifestId: manifestId,
      envelope: envelope(),
      jobId: JOB_ID,
      edlId: EDL_ID,
      parentManifestId: null,
      tier,
      editorialPlanHash: { algorithm: 'sha256', value: editorialPlanHash },
      approvedDraftManifestId,
      releaseState: 'draft',
      renderer: { name: 'renderer-ffmpeg', rendererVersion: '1.0.0', ffmpegVersion: '8.0.1-full_build' },
      // The real `render-manifest-v1` shape, not an approximation. Contract
      // validation on read is what surfaced that this fixture was a partial object —
      // which is the same lesson twice over: a fixture that does not satisfy the
      // contract is testing a shape the pipeline never sees.
      media: { source: tier === 'final' ? 'source_original' : 'proxy' },
      fonts: [{ family: 'Inter', role: 'caption', hash: { algorithm: 'sha256', value: 'd'.repeat(64) }, licenceNote: 'SIL Open Font License 1.1' }],
      output: { container: 'mp4', width: 720, height: 1280, frameRate: { num: 1, den: 30 } },
      encoderSettings: {
        videoCodec: 'h264',
        pixelFormat: 'yuv420p',
        crf: tier === 'final' ? 20 : 26,
        threads: 1,
        bitexact: true,
        stripCreationTime: true,
        audioCodec: 'aac',
        audioBitrateKbps: tier === 'final' ? 192 : 128,
      },
      audioMix: { normalize: true, targetLoudnessLufs: -14, maxTruePeakDbtp: -1, hasAudio: true },
      captions: {
        assPath: `renders/${tier}/${manifestId}/captions.ass`,
        srtPath: `renders/${tier}/${manifestId}/captions.srt`,
        vttPath: `renders/${tier}/${manifestId}/captions.vtt`,
        captionPlanHash: { algorithm: 'sha256', value: 'e'.repeat(64) },
      },
      platformOverlayVersion: '2026-07',
    }),
  );

  writeFileSync(
    join(dir, 'render.json'),
    JSON.stringify({
      renderId,
      envelope: envelope(),
      jobId: JOB_ID,
      edlId: EDL_ID,
      renderManifestId: manifestId,
      tier,
      releaseState: 'draft',
      outputPath: `renders/${tier}/${manifestId}/output.mp4`,
      // The REAL hash of the media on disk. The dummy value this used to carry was
      // caught by the new master-hash check, which is the check doing its job: the
      // package records `render.contentHash` as the master's hash, so a fixture whose
      // hash did not describe its own bytes was testing a package that lies.
      contentHash: { algorithm: 'sha256', value: sha256File(join(dir, 'output.mp4')) },
      duration: { ticks: 120, timebase: { num: 1, den: 30 } },
      dimensions: { width: 720, height: 1280 },
      loudness: { kind: 'measured', integratedLufs: -14, truePeakDbtp: -2.9, loudnessRangeLu: 3 },
      captions: {
        assPath: `renders/${tier}/${manifestId}/captions.ass`,
        srtPath: `renders/${tier}/${manifestId}/captions.srt`,
        vttPath: `renders/${tier}/${manifestId}/captions.vtt`,
        cueCount: 2,
      },
      renderer: { name: 'renderer-ffmpeg', rendererVersion: '1.0.0', ffmpegVersion: '8.0.1-full_build' },
      determinismTier: 1,
      visibleVersionIdentifier: tier === 'draft' ? 'DRAFT' : null,
    }),
  );

  const isFinal = tier === 'final';
  writeFileSync(
    join(dir, 'qa-report.json'),
    JSON.stringify({
      qaReportId: isFinal ? '01J9QR2B3C4D5E6F7G8H9K0N9Z' : '01J9QR2B3C4D5E6F7G8H9K0N1A',
      envelope: envelope(),
      jobId: JOB_ID,
      renderId,
      renderManifestId: manifestId,
      tier,
      rulesetVersion: '1.0.0',
      gateStatus: isFinal ? (options.finalGateStatus ?? 'pass') : 'pass',
      checksRun: [
        {
          checkId: 'source_range_validity',
          status: isFinal ? (options.rangeCheckStatus ?? 'ran') : 'ran',
          reason: isFinal && (options.rangeCheckStatus ?? 'ran') !== 'ran' ? 'the bounds file was unreadable' : null,
        },
      ],
      // Completed to the REAL finding shape. `technical-qa-report-v1` requires
      // `object`, `message`, `fix` and `timeRange` on every finding (REQ-106: an
      // unactionable finding trains people to skim the report), and contract
      // validation on read is what surfaced that the fixture omitted all four.
      findings: isFinal
        ? (options.finalFindings ?? []).map((f) => ({
            ...f,
            object: 'output',
            message: `${f.checkId} fired in this fixture`,
            fix: `fix the ${f.checkId} condition`,
            timeRange: null,
          }))
        : [],
      waiverIds: isFinal ? (options.finalWaiverIds ?? []) : [],
      waivedFindingIds: isFinal ? (options.finalWaivedFindingIds ?? []) : [],
      planHash: {
        algorithm: 'sha256',
        // The DRAFT's plan hash is what the approval records (`subjectPlanHash`), so
        // an override here simulates the draft being re-rendered after approval.
        value: isFinal ? '9'.repeat(64) : (options.draftPlanHashOverride ?? 'c'.repeat(64)),
      },
    }),
  );
}

const packageDirs = (): string[] => {
  const root = join(jobDir, 'packages');
  if (!existsSync(root)) return [];
  return readdirSync(root).sort();
};

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'cutdown-package-skill-'));
  jobDir = join(workspace, 'project-data', 'jobs', JOB_ID);
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

beforeEach(() => {
  seedJob();
});

describe('the happy path: an approved, QA-passed final render becomes a package', () => {
  it('writes a complete bundle with every piece of evidence', () => {
    const result = invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER });
    strictEqual(result.status, 0, JSON.stringify(result.error));

    deepStrictEqual(
      (result.result?.['files'] as string[]).sort(),
      ['captions.srt', 'captions.vtt', 'cover.png', 'edl.json', 'first-frame.png', 'master.mp4', 'package.json', 'qa-report.json'],
    );
    strictEqual(result.result?.['releaseState'], 'rights_approved', 'cleared + evidenced');
    strictEqual(result.result?.['sourceClassification'], 'fixture');
    strictEqual(result.result?.['reviewDecisionId'], DECISION_ID);
    strictEqual(result.result?.['rightsWeakestState'], 'cleared');
    strictEqual(result.result?.['rangeCount'], 1);

    const pkg = JSON.parse(
      readFileSync(join(jobDir, ...String(result.result?.['packagePath']).split('/'), 'package.json'), 'utf8'),
    ) as Record<string, never>;

    // Lineage resolves in BOTH directions without a cycle: the package names its
    // parents, and no parent names the package.
    const lineage = pkg['lineage'] as unknown as Record<string, unknown>;
    strictEqual(lineage['edlId'], EDL_ID);
    strictEqual(lineage['creativeBriefId'], CREATIVE_BRIEF_ID);
    strictEqual(lineage['approvedDraftManifestId'], DRAFT_MANIFEST);
    const decision = JSON.parse(readFileSync(join(jobDir, 'reviews', `${DECISION_ID}.json`), 'utf8')) as Record<string, unknown>;
    ok(!JSON.stringify(decision).includes(String(result.result?.['contentPackageId'])), 'the approval never references the package');

    // D-36 evidence fields.
    strictEqual((pkg['approval'] as unknown as Record<string, unknown>)['decidedBy'], 'Fred Wang');
    strictEqual((pkg['rangeValidation'] as unknown as Record<string, unknown>)['violationCount'], 0);
    ok((pkg['contractSet'] as unknown as unknown[]).length > 1, 'the contract set records every committed schema');
    strictEqual(pkg['accountId'], 'acct-social-soup-001', 'copied from the JobBrief so a rename cannot split the count');

    // REQ-104: caption sidecars exist even though the master has burned-in captions.
    strictEqual((pkg['captions'] as unknown as Record<string, unknown>)['cueCount'], 2);
    strictEqual((pkg['master'] as unknown as Record<string, unknown>)['burnedInCaptions'], true);

    // REQ-055: a defaulted cover says so.
    const coverSource = (pkg['cover'] as unknown as Record<string, unknown>)['coverSource'] as Record<string, unknown>;
    strictEqual(coverSource['kind'], 'defaulted_to_first_frame');
    ok(String(coverSource['reason']).includes('declares no cover frame'));

    // REQ-164: computed from what the pipeline actually did.
    const ai = pkg['aiAlterationRecord'] as unknown as Record<string, unknown>;
    strictEqual(ai['materialAlteration'], false);
    deepStrictEqual(ai['operations'], ['selection', 'captioning', 'loudness_normalisation']);
    strictEqual(ai['capturedAtIntake'], false, 'the REQ-163 categories the JobBrief cannot capture say so');
  });

  it('records a DECLARED cover when the EDL names one on the first clip', () => {
    seedJob({ coverFrame: { kind: 'moment_frame', momentId: MOMENT_ID, atTick: { ticks: 15360, timebase: { num: 1, den: 15360 } } } });
    const result = invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER });
    strictEqual(result.status, 0, JSON.stringify(result.error));
    const pkg = JSON.parse(
      readFileSync(join(jobDir, ...String(result.result?.['packagePath']).split('/'), 'package.json'), 'utf8'),
    ) as Record<string, never>;
    const coverSource = (pkg['cover'] as unknown as Record<string, unknown>)['coverSource'] as Record<string, unknown>;
    strictEqual(coverSource['kind'], 'declared');
    strictEqual(coverSource['atOutputMs'], 1000, 'one second into the first clip');
  });

  it('DEFAULTS the cover when the declared instant is past the first clip', () => {
    // Bounded above as well as below. A tick past the clip's `endTicks` yields a
    // positive offset that lands in a LATER clip, and the package would have recorded
    // `declared` naming the FIRST clip's moment — fabricated provenance for the one
    // field whose tagged union exists to stop exactly that.
    seedJob({
      coverFrame: { kind: 'moment_frame', momentId: MOMENT_ID, atTick: { ticks: 60000, timebase: { num: 1, den: 15360 } } },
    });
    const result = invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER });
    strictEqual(result.status, 0, JSON.stringify(result.error));
    const pkg = JSON.parse(
      readFileSync(join(jobDir, ...String(result.result?.['packagePath']).split('/'), 'package.json'), 'utf8'),
    ) as Record<string, never>;
    const coverSource = (pkg['cover'] as unknown as Record<string, unknown>)['coverSource'] as Record<string, unknown>;
    strictEqual(coverSource['kind'], 'defaulted_to_first_frame');
    ok(String(coverSource['reason']).includes('outside the first clip'));
    ok(String(coverSource['reason']).includes('wrong moment'), 'and says what it refused to do');
  });

  it('DEFAULTS the cover when the declared instant is in a different timebase', () => {
    seedJob({
      coverFrame: { kind: 'moment_frame', momentId: MOMENT_ID, atTick: { ticks: 30, timebase: { num: 1, den: 30 } } },
    });
    const result = invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER });
    strictEqual(result.status, 0, JSON.stringify(result.error));
    const pkg = JSON.parse(
      readFileSync(join(jobDir, ...String(result.result?.['packagePath']).split('/'), 'package.json'), 'utf8'),
    ) as Record<string, never>;
    const coverSource = (pkg['cover'] as unknown as Record<string, unknown>)['coverSource'] as Record<string, unknown>;
    strictEqual(coverSource['kind'], 'defaulted_to_first_frame');
    ok(String(coverSource['reason']).includes('re-basing'));
  });

  it('falls back to editorially_approved when a cleared right carries no evidence pointer', () => {
    seedJob({ rights: clearedRights(false) });
    const result = invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER });
    strictEqual(result.status, 0, JSON.stringify(result.error));
    strictEqual(result.result?.['releaseState'], 'editorially_approved');
    strictEqual(result.result?.['rightsAllEvidenced'], false, 'the gap is surfaced rather than silently accepted');
  });

  it('marks the package `real` only when every asset is real (D-36)', () => {
    seedJob({ sourceClassification: 'real' });
    const result = invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER });
    strictEqual(result.status, 0, JSON.stringify(result.error));
    strictEqual(result.result?.['sourceClassification'], 'real');
  });
});

describe('fail-closed: every way a package must NOT happen', () => {
  const refuses = (code: string, expectMessage?: string) => (result: Invocation) => {
    strictEqual(result.status, 3, `expected a runtime refusal, got ${String(result.status)}: ${JSON.stringify(result.error)}`);
    strictEqual(result.error?.code, code);
    if (expectMessage !== undefined) ok(result.error?.message.includes(expectMessage), `expected the message to mention ${expectMessage}`);
    deepStrictEqual(packageDirs(), [], 'a refused package leaves NOTHING behind — not even a staging directory');
  };

  it('refuses a DRAFT render', () => {
    refuses('NOT_A_FINAL_RENDER', 'A draft is not a master')(invoke({ jobId: JOB_ID, finalRenderId: DRAFT_RENDER }));
  });

  it('refuses when no approval exists (pre-approval packaging)', () => {
    seedJob({ omitDecision: true });
    refuses('FINAL_RENDER_NOT_APPROVED', 'Packaging before approval fails')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses when the decision in force is a REJECTION, and says so distinctly', () => {
    seedJob({ decision: { outcome: 'rejected', reason: 'the opening is slack' } });
    refuses('PACKAGE_APPROVAL_REJECTED', 'the opening is slack')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses when a ULID-named file in reviews/ is unreadable (THE SKILL, not the resolver)', () => {
    // Round-3 gap: the indeterminate arm blocked packaging but was tested only in the
    // resolver's own unit suite, so nothing here would have caught the CRITICAL.
    seedJob({});
    writeFileSync(join(jobDir, 'reviews', '01J9RV2B3C4D5E6F7G8H9K0PK1.json'), '{ "reviewDecisionId": "01J9RV');
    refuses('REVIEW_DECISIONS_INDETERMINATE', 'incomplete')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
    rmSync(join(jobDir, 'reviews', '01J9RV2B3C4D5E6F7G8H9K0PK1.json'), { force: true });
  });

  it("PACKAGES SUCCESSFULLY with `validate`'s gate outputs present in reviews/gates/", () => {
    // The round-3 CRITICAL from the packaging side, asserted on the HAPPY path: every
    // job runs `validate` (pipeline step 5), so while its outputs sat directly in
    // `reviews/` no job could ever be packaged. A refusal test alone would not catch a
    // regression here — the point is that packaging SUCCEEDS.
    seedJob({});
    mkdirSync(join(jobDir, 'reviews', 'gates'), { recursive: true });
    writeFileSync(join(jobDir, 'reviews', 'gates', `${EDL_ID}-gate.json`), JSON.stringify({ edlId: EDL_ID, gateStatus: 'pass' }));
    writeFileSync(join(jobDir, 'reviews', 'gates', `${EDL_ID}-critic.json`), JSON.stringify({ edlId: EDL_ID, findings: [] }));
    const result = invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER });
    strictEqual(result.status, 0, `packaging failed: ${result.stderr.slice(0, 600)}`);
    strictEqual(packageDirs().length, 1, 'exactly one package, and a gate report did not veto it');
  });

  it('refuses when the approval was given for a DIFFERENT EDL', () => {
    seedJob({ approvalEdlId: '01J9ED2B3C4D5E6F7G8H9K0MZZ' });
    refuses('APPROVAL_SUBJECT_MISMATCH', 'never authorises another')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses when the final manifest names no approved draft at all', () => {
    seedJob({ omitFinalManifestApproval: true });
    refuses('FINAL_RENDER_NOT_APPROVED', 'names no approved draft')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses EDITORIAL DIVERGENCE — the cut changed after sign-off', () => {
    // The load-bearing check. `editorialPlanHash` is computed from the EDL, so this
    // is what makes "the delivered cut is the cut that was approved" a fact.
    seedJob({ finalEditorialPlanHash: '1'.repeat(64) });
    refuses('EDITORIAL_DIVERGENCE', 'changed after sign-off')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses a FAILED final QA gate', () => {
    seedJob({
      finalGateStatus: 'fail',
      finalFindings: [{ findingId: 'caption_overflow:cue-1', checkId: 'caption_overflow', severity: 'warning', waivable: true }],
    });
    refuses('FINAL_QA_NOT_PASSED')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses a BLOCKER even when the stored gateStatus claims `pass`', () => {
    // A report is a file on disk. The verdict is re-derived from `findings`, so a
    // hand-edited `"gateStatus": "pass"` beside a blocker cannot deliver.
    seedJob({
      finalGateStatus: 'pass',
      finalFindings: [{ findingId: 'container_corruption:output', checkId: 'container_corruption', severity: 'blocker', waivable: false }],
    });
    refuses('FINAL_QA_NOT_PASSED', 'non-waivable')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses an attempted BLOCKER WAIVER — a waived blocker cannot become a package', () => {
    seedJob({
      finalGateStatus: 'pass_with_waivers',
      finalFindings: [{ findingId: 'source_range_validity:clip-1', checkId: 'source_range_validity', severity: 'blocker', waivable: false }],
      finalWaiverIds: ['01J9QW2B3C4D5E6F7G8H9K0P1F'],
      finalWaivedFindingIds: ['source_range_validity:clip-1'],
    });
    refuses('FINAL_QA_NOT_PASSED', 'non-waivable')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses a SKIPPED range check — absence of evidence is not evidence of zero', () => {
    seedJob({ rangeCheckStatus: 'skipped' });
    refuses('RANGE_VALIDATION_MISSING', 'not evidence of zero')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses UNKNOWN rights on the same footing as expired', () => {
    seedJob({ rights: { ...clearedRights(), state: 'unknown' } });
    refuses('RIGHTS_NOT_CLEARED', 'an absent record is the worst case')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses EXPIRED rights', () => {
    seedJob({ rights: { ...clearedRights(), state: 'expired' } });
    refuses('RIGHTS_NOT_CLEARED', 'NON-WAIVABLE')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses RESTRICTED rights', () => {
    seedJob({ rights: { ...clearedRights(), state: 'restricted' } });
    refuses('RIGHTS_NOT_CLEARED')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses a missing caption sidecar (REQ-104 needs a caption FILE)', () => {
    seedJob({ omitCaptions: true });
    refuses('CAPTION_SIDECAR_MISSING', 'even for a burned-in master')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses a waiver id with no committed record behind it', () => {
    seedJob({
      finalGateStatus: 'pass_with_waivers',
      finalFindings: [{ findingId: 'true_peak:audio', checkId: 'true_peak', severity: 'warning', waivable: true }],
      finalWaiverIds: ['01J9QW2B3C4D5E6F7G8H9K0P1F'],
      finalWaivedFindingIds: ['true_peak:audio'],
    });
    refuses('WAIVER_EVIDENCE_MISSING', 'carries its waivers in full')(invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }));
  });

  it('refuses a waiver that is on disk but fails its own schema, and says so', () => {
    // Self-review found this: the first cut parsed-and-CAST the waiver file, so a
    // file carrying only `waiverId` was indexed and its missing `approvedBy` /
    // `reason` / `waivedAt` reached the package as `undefined`. The package's own
    // contract validation would have caught it eventually — but with an error
    // pointing at the package rather than at the file that caused it.
    seedJob({
      finalGateStatus: 'pass_with_waivers',
      finalFindings: [{ findingId: 'true_peak:audio', checkId: 'true_peak', severity: 'warning', waivable: true }],
      finalWaiverIds: ['01J9QW2B3C4D5E6F7G8H9K0P1F'],
      finalWaivedFindingIds: ['true_peak:audio'],
    });
    mkdirSync(join(jobDir, 'waivers'), { recursive: true });
    // Structurally a waiver — and anonymous, unexplained and undated, which is the
    // one thing a waiver may never be (D-35).
    writeFileSync(
      join(jobDir, 'waivers', '01J9QW2B3C4D5E6F7G8H9K0P1F.json'),
      JSON.stringify({ waiverId: '01J9QW2B3C4D5E6F7G8H9K0P1F', findingIds: ['true_peak:audio'] }),
    );

    const result = invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER });
    strictEqual(result.status, 3);
    strictEqual(result.error?.code, 'WAIVER_EVIDENCE_MISSING');
    ok(
      result.error?.message.includes('schema-invalid'),
      'the refusal distinguishes "no such waiver" from "a waiver that does not satisfy qa-waiver-v1"',
    );
    ok(result.error?.message.includes('approvedBy') || result.error?.message.includes('required'));
    deepStrictEqual(packageDirs(), []);
  });

  it('refuses when the DRAFT was re-rendered against a different plan after approval', () => {
    // The `subjectPlanHash` check the schema promises. `editorialPlanHash` would NOT
    // catch this: the plan hash covers the resolved manifest, clip ranges and caption
    // files, so a draft re-rendered with different caption geometry or encode settings
    // moves it while the EDL — and therefore `editorialPlanHash` — stays put.
    seedJob({ draftPlanHashOverride: '7'.repeat(64) });
    refuses('APPROVED_PLAN_SUPERSEDED', 'no longer describes the cut on disk')(
      invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }),
    );
  });

  it('refuses when the approved draft has no QA report — the check must not be skippable', () => {
    // Previously an `existsSync` with no else, so deleting one file inside a job
    // silently disabled the strongest post-approval check.
    seedJob({ omitDraftQaReport: true });
    refuses('APPROVED_DRAFT_QA_REPORT_MISSING', 'never exists without a report')(
      invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER }),
    );
  });

  it('refuses an unknown render id', () => {
    refuses('RENDER_NOT_FOUND')(invoke({ jobId: JOB_ID, finalRenderId: '01J9RD2B3C4D5E6F7G8H9K0ZZZ' }));
  });
});

describe('a warning waiver is accepted and counted separately (D-35)', () => {
  it('packages with pass_with_waivers and carries the waiver in full', () => {
    seedJob({
      finalGateStatus: 'pass_with_waivers',
      finalFindings: [{ findingId: 'true_peak:audio', checkId: 'true_peak', severity: 'warning', waivable: true }],
      finalWaiverIds: ['01J9QW2B3C4D5E6F7G8H9K0P1F'],
      finalWaivedFindingIds: ['true_peak:audio'],
    });
    mkdirSync(join(jobDir, 'waivers'), { recursive: true });
    writeFileSync(
      join(jobDir, 'waivers', '01J9QW2B3C4D5E6F7G8H9K0P1F.json'),
      JSON.stringify({
        waiverId: '01J9QW2B3C4D5E6F7G8H9K0P1F',
        envelope: envelope('human'),
        jobId: JOB_ID,
        renderId: FINAL_RENDER,
        findingIds: ['true_peak:audio'],
        approvedBy: 'Fred Wang',
        reason: 'True peak is 0.1 dB over on a fixture with a synthetic tone.',
        waivedAt: '2026-07-30T02:30:00.000Z',
        planHash: { algorithm: 'sha256', value: '9'.repeat(64) },
      }),
    );

    const result = invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER });
    strictEqual(result.status, 0, JSON.stringify(result.error));
    strictEqual(result.result?.['qaGateStatus'], 'pass_with_waivers');
    strictEqual(result.result?.['warningWaiverCount'], 1);

    const pkg = JSON.parse(
      readFileSync(join(jobDir, ...String(result.result?.['packagePath']).split('/'), 'package.json'), 'utf8'),
    ) as Record<string, never>;
    const qa = pkg['qa'] as unknown as { waivers: { approvedBy: string; reason: string }[]; blockerCount: number };
    strictEqual(qa.blockerCount, 0);
    strictEqual(qa.waivers[0]?.approvedBy, 'Fred Wang');
    ok(qa.waivers[0]?.reason.includes('synthetic tone'), 'the reason travels with the delivered package, not just the id');
  });
});

describe('packages are immutable', () => {
  it('a second packaging of the same render mints a NEW id rather than overwriting', () => {
    const first = invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER });
    strictEqual(first.status, 0, JSON.stringify(first.error));
    const second = invoke({ jobId: JOB_ID, finalRenderId: FINAL_RENDER });
    strictEqual(second.status, 0, JSON.stringify(second.error));
    ok(first.result?.['contentPackageId'] !== second.result?.['contentPackageId']);
    strictEqual(packageDirs().length, 2, 'both bundles survive; neither is clobbered');
  });
});
