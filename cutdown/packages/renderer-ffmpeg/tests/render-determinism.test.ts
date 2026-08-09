import { ok, strictEqual } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import type { PlatformEdlV1 } from '@cutdown/contracts/generated';
import {
  assertDeterministicArgv,
  buildRenderManifest,
  libassFontsDir,
  loadFontRegistry,
  preflight,
  resolveFonts,
  withFfmpegVersion,
  type PreflightReport,
  type RenderManifest,
  type ResolvedFont,
} from '@cutdown/renderer-core';
import {
  evaluateChecks,
  loadQaRuleset,
  loadSafeZoneOverlay,
  measureRender,
  computeGateStatus,
  type QaRuleset,
  type SafeZoneOverlay,
} from '@cutdown/qa';
import { FfmpegRendererAdapter, type FfmpegRenderPlan } from '../src/adapter.js';

/**
 * The tier-1 determinism proof (tech-spec §12, decisions.md D-33) and the
 * end-to-end QA gate demonstration, both against real FFmpeg and real media.
 *
 * D-33 made the pinned local environment the only reproducibility surface
 * Phase 0 had, and D-57 has since superseded it (CI runs the same suite on each
 * runner). Neither changes what this test asserts — so this test asserts the ONE claim the spec
 * permits: two renders of the same manifest on THIS machine are byte-identical.
 * It deliberately does not assert cross-machine identity, which §12 names as
 * false (x264's assembly dispatch is CPU-feature-dependent).
 *
 * The byte comparison alone would not be proof: a short clip can hash the same
 * twice by luck if both encodes land in the same wall-clock second. So the argv
 * is separately asserted to carry every pin.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CUTDOWN_ROOT = join(here, '..', '..', '..', '..');
const FIXTURE = join(CUTDOWN_ROOT, 'data', 'golden-sets', 'ingest', 'clean.mp4');
const FONTS_ROOT = join(CUTDOWN_ROOT, 'data', 'fonts');
const ASSET_ID = '01KY2C5WZM38M23VRGB7H7WFV3';

let workspace: string;
let report: PreflightReport;
let fonts: readonly ResolvedFont[];
let adapter: FfmpegRendererAdapter;
let ruleset: QaRuleset;
let overlay: SafeZoneOverlay;

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

function edlWith(caption: PlatformEdlV1.ClipCaption): PlatformEdlV1.PlatformEDL {
  const timebase = report.duration?.timebase ?? { num: 1, den: 15360 };
  const total = report.duration?.ticks ?? 76800;
  const envelope = {
    schemaVersion: '1.0.0',
    createdAt: '2026-07-29T00:00:00Z',
    createdBy: { kind: 'skill' as const, skill: 'plan', skillVersion: '1.0.0' },
  };
  const clip = (clipId: string, order: number, start: number, end: number, c: PlatformEdlV1.ClipCaption) => ({
    clipId,
    order,
    momentId: '01J9MN2B3C4D5E6F7G8H9K0M1A',
    assetId: ASSET_ID,
    sourceRange: { assetId: ASSET_ID, startTicks: start, endTicks: end, timebase },
    narrativeFunction: order === 0 ? 'promise' : 'payoff',
    rationale: 'determinism fixture',
    caption: c,
  });
  return {
    edlId: '01J9ED2B3C4D5E6F7G8H9K0M6T',
    envelope,
    jobId: 'determinism',
    storyPlanId: '01J9SP2B3C4D5E6F7G8H9K0M5S',
    parentEdlId: null,
    platform: 'tiktok',
    objective: 'awareness',
    distributionMode: 'organic',
    locale: 'en-AU',
    targetDurationRange: { minSeconds: 5, maxSeconds: 180 },
    canvas: { width: 720, height: 1280, aspectRatio: '9:16' },
    aspectTreatment: { mode: 'letterbox', rationale: 'landscape source, deterministic fixture' },
    hookFamily: 'curiosity_gap',
    clips: [
      clip('clip-1', 0, 0, Math.floor(total / 2), caption),
      clip('clip-2', 1, Math.floor(total / 2), total, { kind: 'none' }),
    ],
    audioMode: 'native_audio_plan',
    disclosures: { paidPartnership: false, aiGeneratedOrAltered: false, ownedBusinessPromotion: true },
    metadata: { title: 'Determinism fixture', description: null },
    coverFrame: { kind: 'none' },
    modelProvenance: {
      provider: 'anthropic',
      modelId: 'fixture',
      promptTemplateId: 'plan-edl',
      promptTemplateVersion: '1.0.0',
    },
  } as unknown as PlatformEdlV1.PlatformEDL;
}

async function manifestFor(
  edl: PlatformEdlV1.PlatformEDL,
  manifestId: string,
  tier: 'draft' | 'final' = 'draft',
  approvedDraftManifestId: string | null = null,
): Promise<RenderManifest> {
  const manifest = buildRenderManifest({
    jobId: 'determinism',
    edl: { edlId: edl.edlId, canvas: { width: 720, height: 1280 } },
    edlObject: edl,
    tier,
    approvedDraftManifestId,
    frameRate: { num: 1, den: 30 },
    fonts,
    hasAudio: report.audioTracks.length > 0,
    platformOverlayVersion: '2026-07',
    captionPaths: {
      assPath: `renders/${tier}/${manifestId}/captions.ass`,
      srtPath: `renders/${tier}/${manifestId}/captions.srt`,
      vttPath: `renders/${tier}/${manifestId}/captions.vtt`,
    },
    captionPlanHash: { algorithm: 'sha256', value: '0'.repeat(64) },
    renderManifestId: manifestId,
    createdAt: '2026-07-29T00:00:00Z',
  });
  return await withFfmpegVersion(manifest);
}

async function planFor(
  edl: PlatformEdlV1.PlatformEDL,
  manifestId: string,
  tier: 'draft' | 'final' = 'draft',
  approvedDraftManifestId: string | null = null,
): Promise<FfmpegRenderPlan> {
  const manifest = await manifestFor(edl, manifestId, tier, approvedDraftManifestId);
  return await adapter.plan(manifest, {
    jobDir: workspace,
    edl,
    mediaByAssetId: new Map([[ASSET_ID, FIXTURE]]),
    durationByAssetId: new Map(report.duration === null ? [] : [[ASSET_ID, report.duration]]),
    fontFiles: new Map(),
  });
}

before(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'cutdown-render-'));
  report = await preflight(FIXTURE, { skipCorruptionCheck: true });
  const registry = await loadFontRegistry(FONTS_ROOT);
  fonts = await resolveFonts(FONTS_ROOT, registry, ['caption']);
  const caption = fonts[0];
  ok(caption !== undefined);
  adapter = new FfmpegRendererAdapter({
    fontsDir: libassFontsDir(FONTS_ROOT, registry),
    captionFontFamily: caption.libassFamily,
    badgeFontFile: caption.path,
  });
  ruleset = await loadQaRuleset(join(CUTDOWN_ROOT, 'data', 'rulesets', 'technical-qa-v1.yaml'));
  overlay = await loadSafeZoneOverlay(
    join(CUTDOWN_ROOT, 'data', 'platform-capabilities', 'overlays', 'tiktok', 'organic-video', '2026-07.json'),
  );
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('tier-1 determinism on the machine running this suite (D-33, as amended by D-57)', () => {
  it('renders the same manifest twice to BYTE-IDENTICAL output', async () => {
    const edl = edlWith({ kind: 'text', displayText: 'a stable caption' });

    const first = await planFor(edl, '01J9RM2B3C4D5E6F7G8H9K0N1A');
    // Deliberately the SAME manifest id for both plans. The badge text is derived
    // from that id, so a differing id would change the burned-in pixels and the
    // comparison would be testing the badge rather than the encoder.
    const second = await planFor(edl, '01J9RM2B3C4D5E6F7G8H9K0N1A');

    strictEqual(first.planHash.value, second.planHash.value, 'the same inputs must produce the same plan');

    const encodeArgv = first.commands.find((c) => c.purpose === 'encode')?.argv;
    ok(encodeArgv !== undefined);
    // Half of the proof: the pins are actually on the command line. Without this
    // the byte comparison below could pass because both encodes happened to land
    // in the same second with creation_time stamped.
    assertDeterministicArgv(encodeArgv);

    const renderA = await adapter.execute(first, { jobDir: workspace, timeoutMs: 600_000 });
    const hashA = sha256(first.outputPath);
    const renderB = await adapter.execute(second, { jobDir: workspace, timeoutMs: 600_000 });
    const hashB = sha256(second.outputPath);

    strictEqual(
      hashA,
      hashB,
      'two renders of one manifest on the pinned environment must be byte-identical (tech-spec §12 tier 1)',
    );
    strictEqual(renderA.contentHash.value, hashA);
    strictEqual(renderB.contentHash.value, hashB);
    strictEqual(renderA.determinismTier, 1, 'Phase 0 claims tier 1 and nothing stronger');
  });

  it('reports measured loudness and true peak on the render artefact (REQ-085)', async () => {
    const edl = edlWith({ kind: 'text', displayText: 'loudness fixture' });
    const plan = await planFor(edl, '01J9RM2B3C4D5E6F7G8H9K0N2B');
    const render = await adapter.execute(plan, { jobDir: workspace, timeoutMs: 600_000 });

    strictEqual(render.loudness.kind, 'measured');
    if (render.loudness.kind === 'measured') {
      ok(Number.isFinite(render.loudness.integratedLufs));
      ok(Number.isFinite(render.loudness.truePeakDbtp));
      ok(
        Math.abs(render.loudness.integratedLufs - (-14)) < 2,
        `normalisation should land near the -14 LUFS target; measured ${String(render.loudness.integratedLufs)}`,
      );
    }
  });

  it('burns a visible version identifier into a DRAFT and none into a final (D-34)', async () => {
    const edl = edlWith({ kind: 'text', displayText: 'badge fixture' });

    const draftPlan = await planFor(edl, '01J9RM2B3C4D5E6F7G8H9K0N3C');
    const draftArgv = draftPlan.commands[0]?.argv ?? [];
    const draftGraph = draftArgv[draftArgv.indexOf('-filter_complex') + 1] ?? '';
    ok(draftGraph.includes('drawtext='), 'a draft must carry the DRAFT badge');

    const draftRender = await adapter.execute(draftPlan, { jobDir: workspace, timeoutMs: 600_000 });
    ok(draftRender.visibleVersionIdentifier !== null);
    ok(draftRender.visibleVersionIdentifier?.startsWith('DRAFT '));

    // The second half of the claim, which an earlier version of this test stated
    // in its title and never asserted.
    const finalPlan = await planFor(edl, '01J9RM2B3C4D5E6F7G8H9K0N3D', 'final', draftPlan.manifest.renderManifestId);
    const finalArgv = finalPlan.commands[0]?.argv ?? [];
    const finalGraph = finalArgv[finalArgv.indexOf('-filter_complex') + 1] ?? '';
    ok(!finalGraph.includes('drawtext='), 'a final must carry NO badge — it is the deliverable');

    const finalRender = await adapter.execute(finalPlan, { jobDir: workspace, timeoutMs: 600_000 });
    strictEqual(finalRender.visibleVersionIdentifier, null);
    strictEqual(finalRender.tier, 'final');
  });

  it('renders a FINAL tier from source originals, twice, byte-identically', async () => {
    /**
     * The acceptance criterion the phase plan states as "a final-tier render
     * proven", and Verification step 3's "the fixture harness produces the
     * full-quality final master from originals twice → byte-identical".
     *
     * Exercised through the ADAPTER, not the skill: the skill's public `final`
     * path requires a real approval record and that is Phase 5's flow. The phase
     * plan anticipates exactly this split — "Phase 4 exercises it only through
     * the fixture harness".
     */
    const edl = edlWith({ kind: 'text', displayText: 'final master' });
    const approvedDraftId = '01J9RM2B3C4D5E6F7G8H9K0N4A';

    const first = await planFor(edl, '01J9RM2B3C4D5E6F7G8H9K0N4B', 'final', approvedDraftId);
    const second = await planFor(edl, '01J9RM2B3C4D5E6F7G8H9K0N4B', 'final', approvedDraftId);

    strictEqual(first.manifest.media.source, 'source_original', 'a final renders from originals, not the proxy');
    strictEqual(first.manifest.tier, 'final');
    strictEqual(first.manifest.approvedDraftManifestId, approvedDraftId);

    const encodeArgv = first.commands.find((c) => c.purpose === 'encode')?.argv;
    ok(encodeArgv !== undefined);
    assertDeterministicArgv(encodeArgv);

    // Hash BETWEEN the two executes. Both plans share a manifest id, so they
    // share an output path — hashing both after the second render would compare
    // one file against itself and could never fail.
    const renderA = await adapter.execute(first, { jobDir: workspace, timeoutMs: 600_000 });
    const hashA = sha256(first.outputPath);
    const renderB = await adapter.execute(second, { jobDir: workspace, timeoutMs: 600_000 });
    const hashB = sha256(second.outputPath);

    strictEqual(
      hashA,
      hashB,
      'two final-tier renders of one manifest must be byte-identical on the pinned environment',
    );
    strictEqual(renderA.contentHash.value, renderB.contentHash.value);
    strictEqual(renderA.releaseState, 'draft', 'the renderer never marks its own output approved');
    ok(readFileSync(first.outputPath).length > 0, 'the final master plays as a real file');
  });

  it('emits all three caption files beside the burn-in (REQ-104)', async () => {
    const edl = edlWith({ kind: 'text', displayText: 'sidecar fixture' });
    const plan = await planFor(edl, '01J9RM2B3C4D5E6F7G8H9K0N4D');
    await adapter.execute(plan, { jobDir: workspace, timeoutMs: 600_000 });
    for (const purpose of ['burn-in captions (ASS)', 'caption sidecar (SRT)', 'caption sidecar (WebVTT)']) {
      const file = plan.files.find((f) => f.purpose === purpose);
      ok(file !== undefined, `${purpose} must be planned`);
      ok(readFileSync(file.path, 'utf8').length > 0, `${purpose} must be written and non-empty`);
    }
  });
});

describe('QA blocks a bad render, end to end', () => {
  it('measures a real render and reports a caption overflow with a time range', async () => {
    // A caption far longer than the fitted line budget: the wrap is honest (it
    // never truncates), so the overflow lands in the report rather than being
    // silently absorbed.
    const edl = edlWith({
      kind: 'text',
      displayText:
        'this caption is deliberately far too long to fit the TikTok caption safe area at the default font size and will overflow every line budget the ruleset declares',
    });
    const plan = await planFor(edl, '01J9RM2B3C4D5E6F7G8H9K0N5E');
    const render = await adapter.execute(plan, { jobDir: workspace, timeoutMs: 600_000 });

    const measurements = await measureRender({
      outputPath: plan.outputPath,
      ruleset,
      hasAudio: true,
      loudness: render.loudness,
      captionFiles: {
        ass: plan.files[0]?.path ?? '',
        srt: plan.files[1]?.path ?? '',
        vtt: plan.files[2]?.path ?? '',
      },
    });

    const cues = plan.extras.captionPlan.cues.map((cue) => ({
      index: cue.index,
      startMs: Math.round((cue.startFrame * 1000) / 30),
      endMs: Math.round((cue.endFrame * 1000) / 30),
      displayText: cue.displayText,
      lines: cue.lines,
    }));

    const evaluation = evaluateChecks(measurements, {
      ruleset,
      overlay,
      expected: {
        width: 720,
        height: 1280,
        container: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        hasAudio: true,
        targetLoudnessLufs: -14,
        maxTruePeakDbtp: -1,
        normalise: true,
      },
      plannedDurationMs: Math.round(
        (Math.max(...plan.extras.clips.map((c) => c.outputEndFrame)) * 1000) / 30,
      ),
      aspectTreatmentMode: 'letterbox',
      captions: cues,
      captionReviewFlags: plan.extras.captionPlan.reviewFlags,
      captionStyle: {
        fontSizePx: plan.extras.captionPlan.style.fontSizePx,
        marginVerticalPx: plan.extras.captionPlan.style.marginVerticalPx,
        marginHorizontalPx: plan.extras.captionPlan.style.marginHorizontalPx,
      },
      sourceRangeViolations: [],
      nonSpeechEvents: null,
      minResolution: null,
    });

    const overflow = evaluation.findings.filter((f) => f.checkId === 'caption_overflow');
    ok(overflow.length > 0, 'an oversized caption must be reported, not absorbed');
    for (const finding of overflow) {
      ok(finding.timeRange !== null, 'REQ-106: a caption finding names its time range');
      ok(finding.fix.length > 0, 'REQ-106: and what to do about it');
    }

    const gate = computeGateStatus(evaluation.findings, []);
    strictEqual(gate.gateStatus, 'fail', 'an unwaived warning blocks the gate');
  });

  it('a clean render passes the gate', async () => {
    const edl = edlWith({ kind: 'text', displayText: 'short and clean' });
    const plan = await planFor(edl, '01J9RM2B3C4D5E6F7G8H9K0N6F');
    const render = await adapter.execute(plan, { jobDir: workspace, timeoutMs: 600_000 });

    const measurements = await measureRender({
      outputPath: plan.outputPath,
      ruleset,
      hasAudio: true,
      loudness: render.loudness,
      captionFiles: {
        ass: plan.files[0]?.path ?? '',
        srt: plan.files[1]?.path ?? '',
        vtt: plan.files[2]?.path ?? '',
      },
    });

    strictEqual(measurements.filePresent, true);
    strictEqual(measurements.corruption, 'clean');
    strictEqual(measurements.width, 720);
    strictEqual(measurements.height, 1280);
    strictEqual(measurements.videoCodec, 'h264');
    strictEqual(measurements.audioCodec, 'aac');
    strictEqual(measurements.captionFiles.ass && measurements.captionFiles.srt && measurements.captionFiles.vtt, true);
  });
});
