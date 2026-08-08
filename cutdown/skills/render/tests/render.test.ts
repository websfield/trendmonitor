import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { after, before, describe, it } from 'node:test';

import { FIXTURES_DIR } from '@cutdown/contracts';

/**
 * The `render` skill's execution contract, exercised through its real argv
 * entrypoint (tech-spec §6.2) rather than by importing `run()` — a skill's
 * caller is a subprocess boundary, and the behaviours that matter here (exit
 * codes, structured errors on stderr, an atomic output file) only exist at that
 * boundary.
 *
 * The load-bearing case is the D-34 refusal: a `final` render with no approval
 * must fail, and there must be no flag that changes that.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(here, '..', '..');

/**
 * A canonical contract fixture, as the single source of a VALID artefact shape.
 *
 * `packages/contracts/fixtures/<contract>/valid/complete.json` is already kept in
 * step with its schema by `validate:contracts`, so spreading one is the cheapest way
 * for a skill test to hold a real artefact rather than an approximation of one.
 */
const validFixture = (contract: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(join(FIXTURES_DIR, contract, 'valid', 'complete.json'), 'utf8'),
  ) as Record<string, unknown>;
const CUTDOWN_ROOT = join(SKILL_DIR, '..', '..');
const ENTRY = join(SKILL_DIR, 'dist', 'src', 'main.js');
const FIXTURE_MEDIA = join(CUTDOWN_ROOT, 'data', 'golden-sets', 'ingest', 'clean.mp4');
const ASSET_ID = '01KY2C5WZM38M23VRGB7H7WFV3';
const EDL_ID = '01J9ED2B3C4D5E6F7G8H9K0M6T';
const JOB_ID = 'render-skill-test';

let workspace: string;
let jobDir: string;

interface Invocation {
  status: number;
  stdout: string;
  stderr: string;
}

function invoke(request: unknown): Invocation {
  const inputPath = join(workspace, `request-${String(Math.abs(hash(JSON.stringify(request))))}.json`);
  const outputPath = `${inputPath}.out.json`;
  writeFileSync(inputPath, JSON.stringify(request));
  // `spawnSync`, not `execFileSync`: the latter returns stdout only, so a warning
  // written to stderr by a SUCCESSFUL run is invisible to the test. Several
  // behaviours here are exactly that shape — an operator note on a degraded path
  // that must not fail the render — and a helper that cannot see them would let
  // them rot silently.
  const result = spawnSync(process.execPath, [ENTRY, '--input', inputPath, '--output', outputPath], {
    encoding: 'utf8',
    cwd: SKILL_DIR,
    timeout: 600_000,
    shell: false,
    env: { ...process.env, CUTDOWN_WORKSPACE_ROOT: workspace },
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const hash = (value: string): number => {
  let h = 0;
  for (const char of value) h = (h * 31 + char.charCodeAt(0)) | 0;
  return h;
};

function structuredError(stderr: string): { code: string; message: string } {
  const start = stderr.indexOf('{');
  ok(start >= 0, `expected a structured error on stderr, got: ${stderr.slice(0, 400)}`);
  return JSON.parse(stderr.slice(start)) as { code: string; message: string };
}

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'cutdown-render-skill-'));
  // The skill reads fonts, rulesets and the platform fixture from the workspace
  // root, so the temp workspace mirrors those directories rather than pointing
  // at the real one — the test must not be able to write into the repo.
  for (const relative of ['data/fonts', 'data/rulesets', 'data/platform-capabilities']) {
    cpSync(join(CUTDOWN_ROOT, relative), join(workspace, relative), { recursive: true });
  }

  jobDir = join(workspace, 'project-data', 'jobs', JOB_ID);
  mkdirSync(join(jobDir, 'edl'), { recursive: true });
  mkdirSync(join(jobDir, 'assets'), { recursive: true });
  mkdirSync(join(jobDir, 'source'), { recursive: true });
  cpSync(FIXTURE_MEDIA, join(jobDir, 'source', 'clean.mp4'));

  writeFileSync(
    join(jobDir, 'assets', `${ASSET_ID}.json`),
    JSON.stringify({
      assetId: ASSET_ID,
      storedPath: 'source/clean.mp4',
      // No proxy on purpose: the draft falls back to the original and says so on
      // stderr, which is the honest degraded path rather than a hard failure.
      preflight: {
        duration: { ticks: 76800, timebase: { num: 1, den: 15360 } },
        audioTracks: [{ index: 0, codec: 'aac', sampleRate: 48000, channels: 1 }],
      },
    }),
  );

  const envelope = {
    schemaVersion: '1.0.0',
    createdAt: '2026-07-29T00:00:00Z',
    createdBy: { kind: 'skill', skill: 'plan', skillVersion: '1.0.0' },
  };
  writeFileSync(
    join(jobDir, 'edl', `${EDL_ID}.json`),
    JSON.stringify({
      edlId: EDL_ID,
      envelope,
      jobId: JOB_ID,
      storyPlanId: '01J9SP2B3C4D5E6F7G8H9K0M5S',
      parentEdlId: null,
      platform: 'tiktok',
      objective: 'discovery',
      distributionMode: 'organic',
      locale: 'en-AU',
      targetDurationRange: { minSeconds: 5, maxSeconds: 180 },
      canvas: { width: 720, height: 1280, aspectRatio: '9:16' },
      aspectTreatment: { mode: 'letterbox', rationale: 'landscape source' },
      hookFamily: 'curiosity_first',
      clips: [
        {
          clipId: 'clip-1',
          order: 0,
          momentId: '01J9MN2B3C4D5E6F7G8H9K0M1A',
          assetId: ASSET_ID,
          sourceRange: { assetId: ASSET_ID, startTicks: 0, endTicks: 46080, timebase: { num: 1, den: 15360 } },
          narrativeFunction: 'promise',
          rationale: 'opening',
          caption: { kind: 'text', displayText: 'short caption' },
        },
      ],
      audioMode: 'native_audio_plan',
      disclosures: { paidPartnership: false, aiGeneratedOrAltered: false, ownedBusinessPromotion: true },
      metadata: { title: 'Render skill test', description: null },
      coverFrame: { kind: 'none' },
      modelProvenance: { provider: 'anthropic', modelId: 'fixture', promptTemplateId: 'plan-edl', promptTemplateVersion: '1.0.0' },
    }),
  );
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

/**
 * Write a ReviewDecision the way Phase 5's `approve` skill does: one file per
 * DECISION, named by its ULID, so a second decision never overwrites the first.
 */
function writeDecision(opts: {
  reviewDecisionId: string;
  subjectRenderManifestId: string;
  outcome: 'approved' | 'rejected';
  reason?: string;
  subjectEdlId?: string;
  decidedAt?: string;
}): void {
  mkdirSync(join(jobDir, 'reviews'), { recursive: true });
  const decidedAt = opts.decidedAt ?? '2026-07-30T00:00:00.000Z';
  writeFileSync(
    join(jobDir, 'reviews', `${opts.reviewDecisionId}.json`),
    JSON.stringify({
      reviewDecisionId: opts.reviewDecisionId,
      envelope: { schemaVersion: '1.0.0', createdAt: decidedAt, createdBy: { kind: 'human', name: 'Test operator' } },
      jobId: JOB_ID,
      subjectDraftRenderId: '01J9RD2B3C4D5E6F7G8H9K0N2B',
      subjectEdlId: opts.subjectEdlId ?? EDL_ID,
      subjectRenderManifestId: opts.subjectRenderManifestId,
      subjectPlanHash: { algorithm: 'sha256', value: 'd'.repeat(64) },
      decidedBy: 'Test operator',
      decidedAt,
      decision:
        opts.outcome === 'approved'
          ? { outcome: 'approved', notes: null }
          : { outcome: 'rejected', reason: opts.reason ?? 'no', notes: null },
    }),
  );
}

describe('D-34 — a final render is not authorised without an approval', () => {
  it('refuses a final that names no approved draft', () => {
    const result = invoke({ jobId: JOB_ID, edlId: EDL_ID, tier: 'final' });
    strictEqual(result.status, 3);
    strictEqual(structuredError(result.stderr).code, 'FINAL_RENDER_NOT_APPROVED');
  });

  it('refuses a final whose named draft has no approval record on disk', () => {
    const result = invoke({
      jobId: JOB_ID,
      edlId: EDL_ID,
      tier: 'final',
      approvedDraftManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A',
    });
    strictEqual(result.status, 3);
    const error = structuredError(result.stderr);
    strictEqual(error.code, 'FINAL_RENDER_NOT_APPROVED');
    ok(
      error.message.includes('no flag that waives this'),
      'the refusal must state that no bypass exists, so nobody goes looking for one',
    );
  });

  it('refuses a final when the only decision names a DIFFERENT manifest', () => {
    // Under the Phase 5 layout, decisions are filtered by `subjectRenderManifestId`
    // rather than compared after the fact, so a decision for another cut cannot be
    // mistaken for this one BY CONSTRUCTION. What the refusal must still do is say
    // which situation this is: an operator who approved the wrong draft needs to
    // know a decision exists, just not for this manifest.
    writeDecision({
      reviewDecisionId: '01J9RV2B3C4D5E6F7G8H9K0N7G',
      subjectRenderManifestId: '01J9RM2B3C4D5E6F7G8H9K0N9H',
      outcome: 'approved',
    });
    const result = invoke({
      jobId: JOB_ID,
      edlId: EDL_ID,
      tier: 'final',
      approvedDraftManifestId: '01J9RM2B3C4D5E6F7G8H9K0N7G',
    });
    strictEqual(result.status, 3);
    const error = structuredError(result.stderr);
    strictEqual(error.code, 'FINAL_RENDER_NOT_APPROVED');
    ok(
      error.message.includes('1 decision(s) exist for other manifests'),
      'the refusal distinguishes "nobody reviewed anything" from "somebody reviewed a different cut"',
    );
  });

  it('refuses a final whose decision in force is a REJECTION, and quotes the reason', () => {
    writeDecision({
      reviewDecisionId: '01J9RV2B3C4D5E6F7G8H9K0N8J',
      subjectRenderManifestId: '01J9RM2B3C4D5E6F7G8H9K0N8J',
      outcome: 'rejected',
      reason: 'The opening is slack — tighten it.',
    });
    const result = invoke({
      jobId: JOB_ID,
      edlId: EDL_ID,
      tier: 'final',
      approvedDraftManifestId: '01J9RM2B3C4D5E6F7G8H9K0N8J',
    });
    strictEqual(result.status, 3);
    const error = structuredError(result.stderr);
    strictEqual(error.code, 'FINAL_RENDER_REJECTED', 'a rejection is a DIFFERENT refusal from "nobody decided"');
    ok(error.message.includes('tighten it'), 'the reason a human gave is surfaced, not swallowed');
    ok(error.message.includes('cutdown revise'), 'and the actionable next step is named');
  });

  it('refuses a final when a ULID-named file in reviews/ is unreadable (THE SKILL, not the resolver)', () => {
    // Round 3 found the indeterminate arm had zero coverage in ANY caller that
    // blocks on it — only in the resolver's own unit tests. That gap is exactly why
    // the round-3 CRITICAL shipped: the arm was correct in isolation and catastrophic
    // in the pipeline. This drives it through the real argv entrypoint.
    const manifestId = '01J9RM2B3C4D5E6F7G8H9K0NX1';
    writeDecision({
      reviewDecisionId: '01J9RV2B3C4D5E6F7G8H9K0NX1',
      subjectRenderManifestId: manifestId,
      outcome: 'approved',
    });
    writeFileSync(join(jobDir, 'reviews', '01J9RV2B3C4D5E6F7G8H9K0NX2.json'), '{ "reviewDecisionId": "01J9RV');
    const result = invoke({ jobId: JOB_ID, edlId: EDL_ID, tier: 'final', approvedDraftManifestId: manifestId });
    strictEqual(result.status, 3);
    const error = structuredError(result.stderr);
    strictEqual(error.code, 'REVIEW_DECISIONS_INDETERMINATE', 'an incomplete decision set cannot authorise a final');
    ok(error.message.includes('01J9RV2B3C4D5E6F7G8H9K0NX2'), 'and the operator is told WHICH file to fix');
    rmSync(join(jobDir, 'reviews', '01J9RV2B3C4D5E6F7G8H9K0NX2.json'), { force: true });
  });

  it("does NOT block on `validate`'s gate outputs, which live in reviews/gates/", () => {
    // The round-3 CRITICAL, at the caller. `validate` is pipeline step 5 and every
    // job runs it, so when its outputs sat directly in `reviews/` the indeterminate
    // arm barred EVERY job from a final render — on the happy path, with a real human
    // approval on disk and no attacker involved.
    const manifestId = '01J9RM2B3C4D5E6F7G8H9K0NX3';
    writeDecision({
      reviewDecisionId: '01J9RV2B3C4D5E6F7G8H9K0NX3',
      subjectRenderManifestId: manifestId,
      outcome: 'approved',
      subjectEdlId: '01J9ED2B3C4D5E6F7G8H9K0MZZ',
    });
    mkdirSync(join(jobDir, 'reviews', 'gates'), { recursive: true });
    writeFileSync(join(jobDir, 'reviews', 'gates', `${EDL_ID}-gate.json`), JSON.stringify({ edlId: EDL_ID, gateStatus: 'pass' }));
    writeFileSync(join(jobDir, 'reviews', 'gates', `${EDL_ID}-critic.json`), JSON.stringify({ edlId: EDL_ID, findings: [] }));

    const result = invoke({ jobId: JOB_ID, edlId: EDL_ID, tier: 'final', approvedDraftManifestId: manifestId });
    // It still fails — the approval names a different EDL — but on the SUBJECT
    // mismatch, which proves the resolution got past the decision set intact.
    // Asserting `!== 'REVIEW_DECISIONS_INDETERMINATE'` alone would pass for the
    // wrong reason if the skill started failing earlier.
    strictEqual(structuredError(result.stderr).code, 'APPROVAL_SUBJECT_MISMATCH');
  });

  it('refuses a final whose approval was given for a DIFFERENT EDL', () => {
    const manifestId = '01J9RM2B3C4D5E6F7G8H9K0N6F';
    writeDecision({
      reviewDecisionId: '01J9RV2B3C4D5E6F7G8H9K0N6F',
      subjectRenderManifestId: manifestId,
      outcome: 'approved',
      subjectEdlId: '01J9ED2B3C4D5E6F7G8H9K0MZZ',
    });
    const result = invoke({
      jobId: JOB_ID,
      edlId: EDL_ID,
      tier: 'final',
      approvedDraftManifestId: manifestId,
    });
    strictEqual(result.status, 3);
    strictEqual(structuredError(result.stderr).code, 'APPROVAL_SUBJECT_MISMATCH');
  });

  it('takes the LATEST decision, so a later rejection overrides an earlier approval', () => {
    const manifestId = '01J9RM2B3C4D5E6F7G8H9K0N5E';
    writeDecision({
      reviewDecisionId: '01J9RV2B3C4D5E6F7G8H9K0N5A',
      subjectRenderManifestId: manifestId,
      outcome: 'approved',
      decidedAt: '2026-07-30T01:00:00.000Z',
    });
    writeDecision({
      reviewDecisionId: '01J9RV2B3C4D5E6F7G8H9K0N5B',
      subjectRenderManifestId: manifestId,
      outcome: 'rejected',
      reason: 'Second look: the claim at 3 s is unsupported.',
      decidedAt: '2026-07-30T02:00:00.000Z',
    });
    const result = invoke({
      jobId: JOB_ID,
      edlId: EDL_ID,
      tier: 'final',
      approvedDraftManifestId: manifestId,
    });
    strictEqual(result.status, 3);
    strictEqual(
      structuredError(result.stderr).code,
      'FINAL_RENDER_REJECTED',
      'an approval does not outrank a later rejection — a reviewer must be able to change their mind',
    );
  });
});

describe('a draft render produces the render, the manifest and the QA report together', () => {
  it('renders and gates in one invocation', () => {
    const result = invoke({ jobId: JOB_ID, edlId: EDL_ID, tier: 'draft' });
    strictEqual(result.status, 0, `render failed: ${result.stderr.slice(0, 800)}`);

    const outputPath = join(workspace, `request-${String(Math.abs(hash(JSON.stringify({ jobId: JOB_ID, edlId: EDL_ID, tier: 'draft' }))))}.json.out.json`);
    const output = JSON.parse(readFileSync(outputPath, 'utf8')) as {
      kind: string;
      tier: string;
      gateStatus: string;
      blockerCount: number;
      skippedCheckCount: number;
      manifestPath: string;
      renderPath: string;
      qaReportPath: string;
      outputPath: string;
    };

    strictEqual(output.kind, 'rendered');
    strictEqual(output.tier, 'draft');
    strictEqual(output.blockerCount, 0, 'a clean fixture render must produce no blockers');

    // The three artefacts exist together — "no render exists without a report
    // beside it" is the whole point of doing QA in this invocation.
    for (const relative of [output.manifestPath, output.renderPath, output.qaReportPath, output.outputPath]) {
      const absolute = join(jobDir, ...relative.split('/'));
      ok(readFileSync(absolute).length > 0, `${relative} must exist and be non-empty`);
    }

    const report = JSON.parse(
      readFileSync(join(jobDir, ...output.qaReportPath.split('/')), 'utf8'),
    ) as { checksRun: { checkId: string; status: string; reason: string | null }[]; rulesetVersion: string };
    strictEqual(report.checksRun.length, 23, 'every check is recorded, including the ones that did not run');
    for (const record of report.checksRun) {
      if (record.status !== 'ran') {
        ok(record.reason !== null && record.reason.length > 0, `${record.checkId} must say why it did not run`);
      }
    }
    ok(report.rulesetVersion.length > 0, 'the report names the ruleset version that judged it');

    // BLOCK-2's actual content, asserted. Round 2 "fixed" `media.source` by declaring
    // a tracking variable, writing the comment, detecting the proxy-less fallback and
    // warning on stderr — and never assigning the variable, so the behaviour was
    // byte-for-byte unchanged and round 3 caught it only by reading the code. The
    // fixture asset deliberately has NO proxy, so this draft genuinely rendered from
    // the original, and claiming `proxy` would be a false provenance claim in an
    // artefact a client can be shown.
    const manifest = JSON.parse(
      readFileSync(join(jobDir, ...output.manifestPath.split('/')), 'utf8'),
    ) as { tier: string; media: { source: string } };
    strictEqual(manifest.tier, 'draft');
    strictEqual(
      manifest.media.source,
      'source_original',
      'a draft that fell back to the originals must RECORD that, not inherit the tier default',
    );

    const render = JSON.parse(readFileSync(join(jobDir, ...output.renderPath.split('/')), 'utf8')) as {
      loudness:
        | { kind: 'measured'; integratedLufs: number; truePeakDbtp: number }
        | { kind: 'unavailable'; reason: string };
      determinismTier: number;
      releaseState: string;
      visibleVersionIdentifier: string | null;
    };
    // NOT `['measured','unavailable'].includes(kind)` — LoudnessReport IS exactly
    // that two-member union, so such an assertion holds for any behaviour of the
    // code under test and can never fail. The fixture carries an audio track, so
    // the measurement is the thing to assert.
    strictEqual(render.loudness.kind, 'measured');
    if (render.loudness.kind === 'measured') {
      ok(Number.isFinite(render.loudness.integratedLufs), 'REQ-085: integrated loudness is reported');
      ok(Number.isFinite(render.loudness.truePeakDbtp), 'REQ-085: true peak is reported');
    }
    strictEqual(render.determinismTier, 1);
    strictEqual(render.releaseState, 'draft', 'the renderer never marks its own output approved');
    ok(render.visibleVersionIdentifier !== null, 'D-34: a draft carries a visible version identifier');
  });

  it('rejects an unknown EDL with a structured error, not a stack trace', () => {
    const result = invoke({ jobId: JOB_ID, edlId: '01J9ED2B3C4D5E6F7G8H9K0ZZZ', tier: 'draft' });
    ok(result.status === 2 || result.status === 3);
    ok(!result.stderr.includes('    at '), 'callers parse stderr; a stack trace breaks the contract');
  });
});

/**
 * Phase 4 residuals 1 and 4, closed here.
 *
 * Residual 1: five throw paths left `output.mp4` on disk with no report beside
 * it — the state SKILL.md calls impossible, produced by the gate's own error
 * paths. The fix is ORDERING (validate QA inputs before `plan()`), so the proof
 * is that a refused invocation leaves NO render directory at all.
 *
 * Residual 4: `MIXED_AUDIO_TIMELINE_UNSUPPORTED`, `WAIVER_SCHEMA_INVALID` and
 * `AUDIO_EVENTS_NOT_FOUND` were implemented and never tested.
 */
describe('bad QA inputs are refused BEFORE anything is rendered', () => {
  const renderDirs = (): string[] => {
    const root = join(jobDir, 'renders', 'draft');
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  };

  it('refuses a schema-invalid waiver and leaves no new render behind', () => {
    const before = renderDirs();
    const waiverPath = join(workspace, 'anonymous-waiver.json');
    // Structurally a waiver, but with no approver, no reason and no timestamp —
    // precisely the anonymous rubber stamp D-35 forbids. A bare JSON.parse plus a
    // cast would accept this and flip the gate to `pass_with_waivers`.
    writeFileSync(waiverPath, JSON.stringify({ findingIds: ['true_peak:audio'] }));

    const result = invoke({ jobId: JOB_ID, edlId: EDL_ID, tier: 'draft', waiverPaths: [waiverPath] });
    strictEqual(result.status, 3);
    strictEqual(structuredError(result.stderr).code, 'WAIVER_SCHEMA_INVALID');
    deepStrictEqual(
      renderDirs(),
      before,
      'the waiver is bad INPUT, so it must be refused before any encode — an orphan render directory here is residual 1 reopening',
    );
  });

  it('refuses an unreadable --audio-events path and leaves no new render behind', () => {
    const before = renderDirs();
    const result = invoke({
      jobId: JOB_ID,
      edlId: EDL_ID,
      tier: 'draft',
      audioEventsPath: join(workspace, 'no-such-audio-events.json'),
    });
    strictEqual(result.status, 3);
    strictEqual(structuredError(result.stderr).code, 'AUDIO_EVENTS_NOT_FOUND');
    deepStrictEqual(renderDirs(), before, 'no render may exist without a report beside it');
  });

  it('refuses a timeline that mixes audio-bearing and silent assets (D-50)', () => {
    const before = renderDirs();
    const silentAssetId = '01KY2C5WZM38M23VRGB7H7WSJK';
    const mixedEdlId = '01J9ED2B3C4D5E6F7G8H9K0MJX';

    // A real silent asset: the SAME media, declared with no audio tracks. What
    // the refusal turns on is the DECLARED stream layout, which is what FFmpeg's
    // concat demuxer cannot reconcile across segments.
    writeFileSync(
      join(jobDir, 'assets', `${silentAssetId}.json`),
      JSON.stringify({
        assetId: silentAssetId,
        storedPath: 'source/clean.mp4',
        preflight: {
          duration: { ticks: 76800, timebase: { num: 1, den: 15360 } },
          audioTracks: [],
        },
      }),
    );

    const base = JSON.parse(readFileSync(join(jobDir, 'edl', `${EDL_ID}.json`), 'utf8')) as {
      clips: Record<string, unknown>[];
      [key: string]: unknown;
    };
    const firstClip = base.clips[0] as Record<string, unknown>;
    writeFileSync(
      join(jobDir, 'edl', `${mixedEdlId}.json`),
      JSON.stringify({
        ...base,
        edlId: mixedEdlId,
        clips: [
          firstClip,
          {
            ...firstClip,
            clipId: 'clip-2',
            order: 1,
            assetId: silentAssetId,
            sourceRange: {
              assetId: silentAssetId,
              startTicks: 0,
              endTicks: 15360,
              timebase: { num: 1, den: 15360 },
            },
            narrativeFunction: 'payoff',
          },
        ],
      }),
    );

    const result = invoke({ jobId: JOB_ID, edlId: mixedEdlId, tier: 'draft' });
    strictEqual(result.status, 3);
    const error = structuredError(result.stderr);
    strictEqual(error.code, 'MIXED_AUDIO_TIMELINE_UNSUPPORTED');
    ok(
      error.message.includes('refused rather than attempted'),
      'D-50: the refusal states that Phase 0 does not synthesise silence, so the operator knows this is a scope limit rather than a fault',
    );
    deepStrictEqual(renderDirs(), before, 'the refusal happens before any encode cost');
  });
});

/**
 * The review payload (REQ-110's data, no UI — Phase 5 task 6).
 *
 * Two cases, and the DEGRADED one matters more: a payload is a convenience view
 * over artefacts that already exist, so a missing input must cost a warning, never
 * a successful render. `reviewPayloadPath` is reported either way so a reviewer is
 * never left guessing whether there is anything to read.
 */
describe('a draft render assembles the review payload beside it', () => {
  // `audioEventsPath: null` only varies the request hash (the invoke helper keys
  // its temp files on it); the render input schema is CLOSED, so an ad-hoc marker
  // field would be rejected with exit 2 — which is the schema doing its job.
  const draftRequest = { jobId: JOB_ID, edlId: EDL_ID, tier: 'draft' as const, audioEventsPath: null };

  it('degrades to a WARNING when the editorial lineage is not on disk', () => {
    // This job's fixture has an EDL and assets but no brief, story plan, creative
    // brief or Moment Graph — the state a hand-driven render leaves. The render
    // must still succeed.
    const result = invoke(draftRequest);
    strictEqual(result.status, 0, `render failed: ${result.stderr.slice(0, 600)}`);
    const outputPath = join(workspace, `request-${String(Math.abs(hash(JSON.stringify(draftRequest))))}.json.out.json`);
    const output = JSON.parse(readFileSync(outputPath, 'utf8')) as { reviewPayloadPath: string | null };
    strictEqual(output.reviewPayloadPath, null, 'reported as absent rather than omitted');
    ok(
      result.stderr.includes('review payload could not be assembled'),
      'the reason is on stderr — a silently missing payload is what makes a reviewer think there is nothing to review',
    );
    ok(result.stderr.includes('are all committed'), 'and the operator is told the render itself is fine');
  });

  it('degrades to a WARNING when the lineage is PRESENT but contract-invalid', () => {
    // `readContractJson` made a partial-but-previously-tolerated artefact a hard
    // refusal, and `creativeBriefFor` is called inside the review-payload try/catch —
    // so the claim is that an invalid brief costs the PAYLOAD, never the render. That
    // claim had no test: the existing case covers an ABSENT lineage, which takes a
    // different branch (`existsSync`), so a refactor that let the throw escape the try
    // would have failed the render and no test would have noticed.
    const storyPlanId = '01J9SP2B3C4D5E6F7G8H9K0M5S';
    mkdirSync(join(jobDir, 'story-plans'), { recursive: true });
    writeFileSync(join(jobDir, 'story-plans', `${storyPlanId}.json`), JSON.stringify({ storyPlanId }));

    const request = { jobId: JOB_ID, edlId: EDL_ID, tier: 'draft' as const, styleProfilePath: null };
    const result = invoke(request);
    strictEqual(result.status, 0, `the render itself must still succeed: ${result.stderr.slice(0, 500)}`);
    ok(result.stderr.includes('review payload could not be assembled'), 'and the reason is on stderr');
    ok(result.stderr.includes('are all committed'), 'and the operator is told the render is fine');

    const outPath = join(workspace, `request-${String(Math.abs(hash(JSON.stringify(request))))}.json.out.json`);
    const output = JSON.parse(readFileSync(outPath, 'utf8')) as { reviewPayloadPath: string | null };
    strictEqual(output.reviewPayloadPath, null, 'and the result says honestly that there is nothing to review');

    rmSync(join(jobDir, 'story-plans'), { recursive: true, force: true });
  });

  it('writes reviews/pending/<renderId>.json once the lineage IS on disk', () => {
    const storyPlanId = '01J9SP2B3C4D5E6F7G8H9K0M5S';
    const creativeBriefId = '01J9CB2B3C4D5E6F7G8H9K0M1A';
    const envelope = {
      schemaVersion: '1.0.0',
      createdAt: '2026-07-30T00:00:00.000Z',
      createdBy: { kind: 'skill', skill: 'plan', skillVersion: '1.0.0' },
    };
    mkdirSync(join(jobDir, 'brief'), { recursive: true });
    mkdirSync(join(jobDir, 'story-plans'), { recursive: true });
    mkdirSync(join(jobDir, 'creative-briefs'), { recursive: true });
    mkdirSync(join(jobDir, 'moments'), { recursive: true });

    writeFileSync(
      join(jobDir, 'brief', '01J9JB2B3C4D5E6F7G8H9K0M1A.json'),
      JSON.stringify({
        ...validFixture('job-brief-v1'),
        briefId: '01J9JB2B3C4D5E6F7G8H9K0M1A',
        envelope,
        accountId: 'acct-test-001',
        objective: 'discovery',
      }),
    );
    // Built FROM the canonical valid fixtures rather than hand-authored, then
    // overridden only where this test asserts a value. The hand-authored versions
    // were missing five required fields each — invisible while both artefacts were
    // read with a bare cast, and a hard refusal the moment `creativeBriefFor`
    // started validating them. Deriving keeps the fixture contract-true by
    // construction instead of by my memory of the schema.
    writeFileSync(
      join(jobDir, 'story-plans', `${storyPlanId}.json`),
      JSON.stringify({ ...validFixture('master-story-plan-v1'), storyPlanId, envelope, jobId: JOB_ID, creativeBriefId }),
    );
    writeFileSync(
      join(jobDir, 'creative-briefs', `${creativeBriefId}.json`),
      JSON.stringify({
        ...validFixture('creative-brief-v1'),
        creativeBriefId,
        envelope,
        jobId: JOB_ID,
        audiencePromise: 'You will know in 5 seconds',
        creativeThesis: 'Objection first',
        hookFamily: 'curiosity_first',
        narrativeArchetype: 'objection-first',
        knownLimitations: ['no price on camera'],
      }),
    );
    writeFileSync(
      join(jobDir, 'moments', '01J9MN2B3C4D5E6F7G8H9K0M1A.json'),
      JSON.stringify({
        momentId: '01J9MN2B3C4D5E6F7G8H9K0M1A',
        assetId: ASSET_ID,
        transcript: { verbatimText: 'the opening line', displayText: 'the opening line', wordCount: 3, segmentIds: [], lowConfidenceWordCount: 0 },
      }),
    );

    const request = { jobId: JOB_ID, edlId: EDL_ID, tier: 'draft' as const, styleProfilePath: null };
    const result = invoke(request);
    strictEqual(result.status, 0, `render failed: ${result.stderr.slice(0, 600)}`);
    const outPath = join(workspace, `request-${String(Math.abs(hash(JSON.stringify(request))))}.json.out.json`);
    const output = JSON.parse(readFileSync(outPath, 'utf8')) as { renderId: string; reviewPayloadPath: string | null };
    strictEqual(output.reviewPayloadPath, `reviews/pending/${output.renderId}.json`);

    const payload = JSON.parse(
      readFileSync(join(jobDir, ...String(output.reviewPayloadPath).split('/')), 'utf8'),
    ) as {
      angle: string;
      accountId: string;
      moments: { momentId: string; verbatim: { value: string | null }; rightsState: { value: string | null } }[];
      rights: { weakestState: { value: string | null; reason?: string } };
      qa: { value: { gateStatus: string } | null };
      decisionRationale: string[];
    };
    strictEqual(payload.angle, 'Objection first');
    strictEqual(payload.accountId, 'acct-test-001');
    strictEqual(payload.moments[0]?.verbatim.value, 'the opening line');
    strictEqual(payload.qa.value?.gateStatus, 'pass');
    ok(payload.decisionRationale.some((line) => line.includes('no price on camera')));
    // The fixture asset carries no `rights` block, so the payload must say so
    // rather than presenting the cut as cleared.
    ok(
      payload.rights.weakestState.value === null || payload.rights.weakestState.value === 'unknown',
      'an asset with no rights record can never summarise as cleared (REQ-003)',
    );
  });
});

/**
 * Phase 5 round-2 security MEDIUM, as a test.
 *
 * `asset.storedPath` is read out of a stored artefact with a bare cast and joined into
 * an FFmpeg INPUT path. `assertJobRelative`'s own docstring names this exact field —
 * and the guard was applied only in `package`, so the invariant held in the Python
 * worker (`assert_safe_media_path`) and not here. A traversing value would burn
 * content from outside the job into a master about to be handed to a client.
 */
describe('a traversing asset storedPath is refused before any encode', () => {
  it('refuses a `..` traversal and renders nothing', () => {
    const traversingAssetId = '01KY2C5WZM38M23VRGB7H7WTRV';
    const traversingEdlId = '01J9ED2B3C4D5E6F7G8H9K0MTR';
    writeFileSync(
      join(jobDir, 'assets', `${traversingAssetId}.json`),
      JSON.stringify({
        assetId: traversingAssetId,
        // Points outside the job. `assertSafeInputPath` alone would accept the joined
        // result (absolute, no protocol, not option-shaped), which is why containment
        // has to be checked before the join.
        storedPath: '../../../../clean.mp4',
        preflight: {
          duration: { ticks: 76800, timebase: { num: 1, den: 15360 } },
          audioTracks: [{ index: 0, codec: 'aac', sampleRate: 48000, channels: 1 }],
        },
      }),
    );
    const base = JSON.parse(readFileSync(join(jobDir, 'edl', `${EDL_ID}.json`), 'utf8')) as {
      clips: Record<string, unknown>[];
      [key: string]: unknown;
    };
    const firstClip = base.clips[0] as Record<string, unknown>;
    writeFileSync(
      join(jobDir, 'edl', `${traversingEdlId}.json`),
      JSON.stringify({
        ...base,
        edlId: traversingEdlId,
        clips: [
          {
            ...firstClip,
            assetId: traversingAssetId,
            sourceRange: {
              assetId: traversingAssetId,
              startTicks: 0,
              endTicks: 15360,
              timebase: { num: 1, den: 15360 },
            },
          },
        ],
      }),
    );

    const before = existsSync(join(jobDir, 'renders', 'draft'))
      ? readdirSync(join(jobDir, 'renders', 'draft')).length
      : 0;
    const result = invoke({ jobId: JOB_ID, edlId: traversingEdlId, tier: 'draft' });
    strictEqual(result.status, 2, 'a traversing stored path is a CALLER/data error (exit 2)');
    strictEqual(structuredError(result.stderr).code, 'UNSAFE_ARTEFACT_PATH');
    const after = existsSync(join(jobDir, 'renders', 'draft'))
      ? readdirSync(join(jobDir, 'renders', 'draft')).length
      : 0;
    strictEqual(after, before, 'refused before any encode — no render directory appeared');
  });

  it('refuses a traversing edlId on the request itself', () => {
    const result = invoke({ jobId: JOB_ID, edlId: '../../../etc/passwd', tier: 'draft' });
    ok(result.status === 2 || result.status === 3);
    ok(!result.stderr.includes('    at '), 'still a structured error, not a stack trace');
  });
});
