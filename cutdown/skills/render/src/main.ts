import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import {
  assertSafeId,
  contractSchemaId,
  fail,
  readContractJson,
  jobDir,
  resolveJobRelative,
  runSkillMain,
  writeJsonAtomic,
  type SkillContext,
} from '@cutdown/skill-runtime';
import {
  buildRenderManifest,
  withFfmpegVersion,
  loadFontRegistry,
  resolveFonts,
  libassFontsDir,
  assertFinalMatchesApprovedDraft,
  type RenderManifest,
} from '@cutdown/renderer-core';
import { FfmpegRendererAdapter } from '@cutdown/renderer-ffmpeg';
import { interpretAudioEventsDocument } from './audio-events.js';
import { assembleReviewPayload } from '@cutdown/editorial';
import { loadStyleProfile as loadStyleProfileFile } from '@cutdown/style';
import {
  ALL_CHECK_IDS,
  assembleTechnicalQaReport,
  evaluateChecks,
  loadQaRuleset,
  loadSafeZoneOverlay,
  measureRender,
  QaWaiverRejected,
  type QaCaptionCue,
  type QaNonSpeechEvent,
  type QaRuleset,
  type QaWaiver,
  type SafeZoneOverlay,
  type TechnicalQaReport,
} from '@cutdown/qa';
import {
  createAjv,
  formatAjvErrors,
  hashContent,
  loadReviewDecisions,
  resolveApprovalForManifest,
  type ReviewDecision,
} from '@cutdown/contracts';
import type {
  CreativeBriefV1,
  JobBriefV1,
  MasterStoryPlanV1,
  MomentV1,
  PlatformEdlV1,
  SourceAssetV1,
  StyleProfileV1,
} from '@cutdown/contracts/generated';

type PlatformEDL = PlatformEdlV1.PlatformEDL;
type CreativeBrief = CreativeBriefV1.CreativeBrief;
type JobBrief = JobBriefV1.JobBrief;
type MasterStoryPlan = MasterStoryPlanV1.MasterStoryPlan;
type Moment = MomentV1.Moment;
type SourceAsset = SourceAssetV1.SourceAsset;
type StyleProfile = StyleProfileV1.StyleProfile;

const SKILL = 'render';
const VERSION = '1.0.0';

interface RenderRequest {
  jobId: string;
  edlId: string;
  tier: 'draft' | 'final';
  approvedDraftManifestId?: string | null;
  styleProfilePath?: string | null;
  waiverPaths?: string[];
  audioEventsPath?: string | null;
}

interface RenderSkillResult {
  kind: 'rendered';
  jobId: string;
  edlId: string;
  tier: 'draft' | 'final';
  renderId: string;
  renderManifestId: string;
  manifestPath: string;
  renderPath: string;
  outputPath: string;
  qaReportPath: string;
  gateStatus: 'pass' | 'pass_with_waivers' | 'fail';
  blockerCount: number;
  warningCount: number;
  waivedCount: number;
  skippedCheckCount: number;
  planHash: string;
  /**
   * Job-relative path to the review payload (REQ-110's data), for a DRAFT render
   * that produced one. `null` on a final tier (nothing to review) and on a draft
   * whose payload could not be assembled — with the reason on stderr. Reported
   * rather than left as a silent side-effect: a reviewer needs to know whether
   * there is anything to read.
   */
  reviewPayloadPath: string | null;
}

const readJson = <T>(path: string, code: string, what: string): T => {
  if (!existsSync(path)) throw fail(code, `${what} not found at ${path}.`);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    // The parser's message QUOTES the offending input, so echoing it turns a
    // caller-supplied path into a file-read oracle (~10 bytes per attempt).
    throw fail(code, `${what} at ${path} is not valid JSON.`);
  }
};

function loadEdl(dir: string, edlId: string): PlatformEDL {
  assertSafeId(edlId, 'EDL id');
  const path = join(dir, 'edl', `${edlId}.json`);
  if (!existsSync(path)) throw fail('EDL_NOT_FOUND', `PlatformEDL not found at ${path}.`);
  // Contract-validated, because `creativeBriefFor` joins this EDL's `storyPlanId`
  // into a path. Validating the artefact enforces every `$ref: Ulid` on it at once.
  return readContractJson<PlatformEDL>(path, contractSchemaId('platform-edl-v1'), 'EDL_INVALID', `PlatformEDL ${edlId}`);
}

function loadAssets(dir: string): Map<string, SourceAsset> {
  const assetsDir = join(dir, 'assets');
  if (!existsSync(assetsDir)) throw fail('ASSETS_NOT_FOUND', `No assets directory at ${assetsDir}; the job has not been ingested.`);
  const map = new Map<string, SourceAsset>();
  for (const file of readdirSync(assetsDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const asset = JSON.parse(readFileSync(join(assetsDir, file), 'utf8')) as SourceAsset;
    map.set(asset.assetId, asset);
  }
  return map;
}

/**
 * The approval check for a `final` render (D-34, tech-spec §15 step 8).
 *
 * Deliberately has no bypass. "Packaging before approval or from a draft fails"
 * is a build-sequence rule, and a flag that skipped it — however well named —
 * would be the thing every hurried run reached for.
 *
 * The lookup is `resolveApprovalForManifest` from `@cutdown/contracts`, which is
 * the single implementation of "which decision is in force" shared with the
 * `approve` and `package` skills and with the runner's pre-`approve` gate. Two consequences
 * worth naming:
 *
 *   - A decision for a DIFFERENT manifest cannot be mistaken for this one — the
 *     resolver filters by subject, so mismatch is impossible by construction
 *     rather than caught by a comparison someone could forget to write.
 *   - "Rejected" and "nobody has decided" are reported as different refusals.
 *     Both block, but only the first has an actionable next step, and telling an
 *     operator "not approved" when the truth is "rejected, here is why" wastes
 *     the review that already happened.
 */
function requireApproval(dir: string, draftManifestId: string): ReviewDecision {
  const reviewsDir = join(dir, 'reviews');
  const resolution = resolveApprovalForManifest(reviewsDir, draftManifestId);

  if (resolution.kind === 'rejected') {
    const rejected = resolution.decision.decision as { outcome: 'rejected'; reason: string };
    throw fail(
      'FINAL_RENDER_REJECTED',
      `The review decision in force for draft manifest ${draftManifestId} is a REJECTION by ${resolution.decision.decidedBy}: "${rejected.reason}". ` +
        `Run \`cutdown revise\` to act on it. A rejection never authorises a final render, and there is no flag that overrides it.`,
      { draftManifestId, reason: rejected.reason, reviewDecisionId: resolution.decision.reviewDecisionId },
    );
  }

  if (resolution.kind === 'indeterminate') {
    // An unreadable file under reviews/ makes the decision set INCOMPLETE, and the
    // set is what determines "latest" — so the missing file could be the rejection
    // that supersedes an approval. Refusing here costs a false stop when the bad file
    // is unrelated; the alternative is rendering a cut a human may have rejected.
    throw fail(
      'REVIEW_DECISIONS_INDETERMINATE',
      `A final render cannot be authorised: ${String(resolution.rejectedFiles.length)} file(s) under reviews/ could not be read as decisions, so the decision set is incomplete and no approval can be trusted — one of them may be the rejection that supersedes an approval. ` +
        `Fix or remove: ${resolution.rejectedFiles.map((f) => `${f.file} (${f.reason})`).join('; ')}`,
      { draftManifestId, rejectedFiles: resolution.rejectedFiles },
    );
  }

  if (resolution.kind === 'none') {
    // The count of decisions that exist for OTHER manifests is the difference
    // between "nobody has reviewed anything" and "somebody reviewed a different
    // cut" — an operator who approved the wrong draft needs to be told which.
    const all = loadReviewDecisions(reviewsDir);
    const elsewhere = all.decisions.length;
    throw fail(
      'FINAL_RENDER_NOT_APPROVED',
      `A final render requires an approved draft, and no review decision in this job names manifest ${draftManifestId}. ` +
        (elsewhere > 0
          ? `${String(elsewhere)} decision(s) exist for other manifests — approving one draft never authorises another. `
          : 'No review decisions exist for this job at all. ') +
        `Run \`cutdown approve <draft-render-id> --by <name>\` first. There is no flag that waives this: rendering final from an unapproved plan is the ordering violation the approval flow exists to prevent (D-34).`,
      { draftManifestId, decisionsForOtherManifests: elsewhere },
    );
  }

  return resolution.decision;
}

/**
 * The caller-supplied StyleProfile, loaded through `@cutdown/style`.
 *
 * NOT contained to the skill directory: this is a documented production option and
 * the real profiles ship at `cutdown/data/style-profiles/`, so a containment check
 * here would refuse every legitimate one. The oracle is closed the other way — the
 * shared loader validates against `style-profile-v1` and its errors carry
 * `instancePath`/`params` only, never instance values, where the old bare
 * `JSON.parse`/`parseYaml` cast echoed a SyntaxError quoting the file's first bytes
 * back to whoever chose the path.
 */
function loadStyleProfile(path: string | null | undefined): StyleProfile | null {
  if (path === null || path === undefined) return null;
  if (!existsSync(path)) throw fail('STYLE_PROFILE_NOT_FOUND', `No StyleProfile at ${path}.`);
  return loadStyleProfileFile(path);
}

/**
 * The overlay named by the platform capability fixture.
 *
 * Returns the REASON alongside, because three distinct failures reach here — no
 * capability fixture, a fixture declaring no `safeZoneAsset`, or a declared
 * overlay file that is absent — and collapsing them into a bare null tells an
 * operator chasing an unchecked caption nothing about which one happened.
 */
async function loadOverlay(
  workspaceRoot: string,
  platform: string,
): Promise<{ overlay: SafeZoneOverlay | null; reason?: string }> {
  const fixturePath = join(
    workspaceRoot,
    'data',
    'platform-capabilities',
    `${platform}-organic-au-fixture.yaml`,
  );
  if (!existsSync(fixturePath)) {
    return { overlay: null, reason: `No platform capability fixture at ${platform}-organic-au-fixture.yaml.` };
  }
  const fixture = parseYaml(readFileSync(fixturePath, 'utf8')) as {
    media?: { safeZoneAsset?: string };
  };
  const relative = fixture.media?.safeZoneAsset;
  if (relative === undefined) {
    return { overlay: null, reason: `The ${platform} capability fixture declares no media.safeZoneAsset.` };
  }
  const overlayPath = join(workspaceRoot, 'data', 'platform-capabilities', ...relative.split('/'));
  if (!existsSync(overlayPath)) {
    return { overlay: null, reason: `The capability fixture names overlay ${relative}, which does not exist.` };
  }
  return { overlay: await loadSafeZoneOverlay(overlayPath) };
}

async function run(request: RenderRequest, ctx: SkillContext): Promise<RenderSkillResult> {
  const dir = jobDir(ctx.workspaceRoot, request.jobId);
  const edl = loadEdl(dir, request.edlId);
  const assets = loadAssets(dir);

  if (request.tier === 'final' && (request.approvedDraftManifestId ?? null) === null) {
    throw fail(
      'FINAL_RENDER_NOT_APPROVED',
      'A final render must name the approved draft manifest that authorises it (`approvedDraftManifestId`).',
    );
  }
  let approvedDraft: RenderManifest | null = null;
  if (request.tier === 'final') {
    const draftManifestId = request.approvedDraftManifestId as string;
    // Asserted here as well as patterned in the input schema: this value becomes a
    // directory name (`renders/draft/<id>/manifest.json`), and a skill's
    // `entrypoint` is a documented direct invocation — so a guard that lived only
    // in the schema would have the same bypass shape the Phase 2 HIGH had.
    assertSafeId(draftManifestId, 'The approved draft manifest id');
    const approval = requireApproval(dir, draftManifestId);
    // Stated explicitly, ahead of the manifest comparison that would also catch
    // it: the approval names the EDL revision it was given for, and rendering a
    // DIFFERENT EDL under that approval is the single most likely way to deliver
    // a cut nobody signed off. The manifest scan finds it too, but only after the
    // whole manifest is built, and reports it as a bare field name.
    if (approval.subjectEdlId !== request.edlId) {
      throw fail(
        'APPROVAL_SUBJECT_MISMATCH',
        `The approval in force for draft manifest ${draftManifestId} was given for EDL ${approval.subjectEdlId}, but this render is of EDL ${request.edlId}. ` +
          `An approval of one cut never authorises another (REQ-113: a revision is a new object, linked to its parent).`,
        { approvedEdlId: approval.subjectEdlId, requestedEdlId: request.edlId },
      );
    }
    // CONTRACT-VALIDATED, not cast. This is the subject of the tech-spec §11
    // post-approval comparison below, and `assertFinalMatchesApprovedDraft` scans the
    // union of both manifests' keys — so an approved draft manifest reduced to just
    // `editorialPlanHash` and `captions.captionPlanHash` used to compare EQUAL to
    // anything, and a final master nobody had signed off shipped with `ok: true`.
    // `package` reads the same file for the same purpose through its own validating
    // helper (`skills/package/src/main.ts`), and this was the site that was missed.
    approvedDraft = readContractJson<RenderManifest>(
      join(dir, 'renders', 'draft', draftManifestId, 'manifest.json'),
      contractSchemaId('render-manifest-v1'),
      'APPROVED_DRAFT_MANIFEST_MISSING',
      'The approved draft manifest',
    );
  }

  // Resolve media per tier and collect bounds, recording which assets carry
  // audio so a MIXED timeline can be refused before any encode cost.
  const mediaByAssetId = new Map<string, string>();
  // Tracks whether ANY clip fell back to the original on a draft. One fallback makes
  // the render's media provenance `source_original`, because the manifest must not
  // claim proxy media for a file that was read from the originals.
  let usedSourceOriginal = request.tier === 'final';
  const durationByAssetId = new Map<string, { ticks: number; timebase: { num: number; den: number } }>();
  const withAudio = new Set<string>();
  const withoutAudio = new Set<string>();
  for (const clip of edl.clips) {
    const asset = assets.get(clip.assetId);
    if (asset === undefined) {
      throw fail('ASSET_NOT_FOUND', `Clip ${clip.clipId} references asset ${clip.assetId}, which is not in this job.`);
    }
    const stored =
      request.tier === 'final' ? asset.storedPath : (asset.proxy?.storedPath ?? asset.storedPath);
    if (request.tier === 'draft' && asset.proxy?.storedPath === undefined) {
      // Falling back to the original for a draft is honest but worth saying:
      // the draft then costs what a final costs, which is the thing D-25 exists
      // to avoid. stderr, not the result: the result is contract-shaped and a
      // caller parses it, while this is an operator note.
      process.stderr.write(
        `[render] Asset ${clip.assetId} has no proxy; the draft renders from the original, which is slower and larger than D-25 intends.\n`,
      );
      // The assignment the comment on `usedSourceOriginal` claimed and the code
      // omitted: detecting the fallback and warning about it is not the same as
      // RECORDING it, and `media.source` is a provenance claim in an artefact a
      // client can be shown. Safe against the final/draft equality check because
      // `media` is in `TIER_VARIABLE_FIELDS`.
      usedSourceOriginal = true;
    }
    // `storedPath` comes off a stored artefact read with a bare cast, and it goes
    // straight into an FFmpeg input path. `assertJobRelative`'s own docstring names
    // this exact field, and the guard was applied only in `package` — so the
    // invariant held in the Python worker (`assert_safe_media_path`) and not here.
    // A traversing value would burn content from OUTSIDE the job into a master.
    mediaByAssetId.set(clip.assetId, resolveJobRelative(dir, stored, `Asset ${clip.assetId}'s storedPath`));
    if (asset.preflight.duration !== null) durationByAssetId.set(clip.assetId, asset.preflight.duration);
    (asset.preflight.audioTracks.length > 0 ? withAudio : withoutAudio).add(clip.assetId);
  }

  // KNOWN PHASE-0 LIMIT, refused rather than half-performed. `concat` cannot
  // join segments whose stream layouts differ, so a timeline mixing an
  // audio-bearing clip with a silent one needs synthesised silence for the
  // silent segments. That synthesis is not built. Refusing here — before any
  // encode — is the honest behaviour: the alternative was a raw FFmpeg
  // "matches no streams" fault from inside execute(), which breaks this
  // module's own "plan() decides, execute() does" contract and tells an
  // operator nothing about what to do.
  if (withAudio.size > 0 && withoutAudio.size > 0) {
    throw fail(
      'MIXED_AUDIO_TIMELINE_UNSUPPORTED',
      `This EDL mixes assets that carry audio (${[...withAudio].join(', ')}) with assets that do not (${[...withoutAudio].join(', ')}). ` +
        `Phase 0 does not synthesise silence for the silent segments, and FFmpeg's concat cannot join segments with different stream layouts, so the render is refused rather than attempted. ` +
        `Either cut the timeline from assets that all carry audio, or from assets that none do.`,
      { withAudio: [...withAudio], withoutAudio: [...withoutAudio] },
    );
  }
  const hasAudio = withAudio.size > 0;

  const fontsRoot = join(ctx.workspaceRoot, 'data', 'fonts');
  const registry = await loadFontRegistry(fontsRoot);
  const fonts = await resolveFonts(fontsRoot, registry, ['caption']);
  const captionFont = fonts[0];
  if (captionFont === undefined) throw fail('NO_CAPTION_FONT', 'The font registry resolved no caption font.');

  const styleProfile = loadStyleProfile(request.styleProfilePath);
  const frameRate = { num: 1, den: 30 };

  // ---- Everything QA needs, loaded and VALIDATED before plan()/execute() ----
  //
  // These four loads all used to sit after `execute()`, which meant a bad
  // ruleset, a missing overlay, an unreadable `--audio-events` file or a waiver
  // that failed its schema left `output.mp4` on disk with no report beside it —
  // the exact state SKILL.md says is impossible, produced by the gate's own
  // error paths. They are pure input validation, so they belong where this
  // module's own contract puts them: before plan() decides anything, and long
  // before an encode costs money.
  const ruleset = await loadQaRuleset(join(ctx.workspaceRoot, 'data', 'rulesets', 'technical-qa-v1.yaml'));
  const overlayResult = await loadOverlay(ctx.workspaceRoot, edl.platform);
  const nonSpeechEvents = loadAudioEvents(request.audioEventsPath ?? null, edl);
  const waivers = loadWaivers(request.waiverPaths ?? []);

  const manifestId = `${request.tier === 'final' ? 'F' : 'D'}${Date.now().toString(36).toUpperCase()}`;
  // Manifest ids are ULIDs; the placeholder above is replaced by the builder's
  // own generator. Kept as a local only to name the render directory before the
  // manifest exists would be circular — so the directory is named FROM the id.
  void manifestId;

  let manifest = buildRenderManifest({
    jobId: request.jobId,
    edl: { edlId: edl.edlId, canvas: { width: edl.canvas.width, height: edl.canvas.height } },
    edlObject: edl,
    tier: request.tier,
    frameRate,
    fonts,
    hasAudio,
    mediaSource: usedSourceOriginal ? 'source_original' : 'proxy',
    platformOverlayVersion: '2026-07',
    // Placeholder paths; rewritten below once the generated id is known.
    captionPaths: { assPath: 'x', srtPath: 'x', vttPath: 'x' },
    captionPlanHash: { algorithm: 'sha256', value: '0'.repeat(64) },
    approvedDraftManifestId: request.tier === 'final' ? (request.approvedDraftManifestId as string) : null,
  });

  const renderRel = `renders/${manifest.tier}/${manifest.renderManifestId}`;
  manifest = {
    ...manifest,
    captions: {
      assPath: `${renderRel}/captions.ass`,
      srtPath: `${renderRel}/captions.srt`,
      vttPath: `${renderRel}/captions.vtt`,
      captionPlanHash: manifest.captions.captionPlanHash,
    },
  };
  manifest = await withFfmpegVersion(manifest);

  const adapter = new FfmpegRendererAdapter({
    fontsDir: libassFontsDir(fontsRoot, registry),
    captionFontFamily: captionFont.libassFamily,
    badgeFontFile: captionFont.path,
    ...(styleProfile === null ? {} : { captionStyle: captionStyleFrom(styleProfile) }),
  });

  const plan = await adapter.plan(manifest, {
    jobDir: dir,
    edl,
    mediaByAssetId,
    durationByAssetId,
    fontFiles: new Map(),
  });

  // The caption plan hash is only knowable once the captions are built, so the
  // manifest is completed here and re-planned. Re-planning rather than patching
  // the plan keeps a single code path that turns a manifest into commands.
  const captionPlanHash = hashContent(plan.extras.captionPlan.cues);
  manifest = { ...manifest, captions: { ...manifest.captions, captionPlanHash } };

  if (approvedDraft !== null) {
    const comparison = assertFinalMatchesApprovedDraft(approvedDraft, manifest);
    if (!comparison.ok) {
      throw fail(
        'FINAL_DIFFERS_FROM_APPROVED_DRAFT',
        `The final render differs from the approved draft in ${comparison.changedFields.join(', ')}. ` +
          `A final may differ only in tier, media and encode settings — everything else was signed off as it stood.`,
        { changedFields: comparison.changedFields },
      );
    }
  }

  const finalPlan = await adapter.plan(manifest, {
    jobDir: dir,
    edl,
    mediaByAssetId,
    durationByAssetId,
    fontFiles: new Map(),
  });

  const render = await adapter.execute(finalPlan, { jobDir: dir, timeoutMs: 1_500_000 });

  const manifestPath = join(dir, renderRel, 'manifest.json');
  const renderPath = join(dir, renderRel, 'render.json');
  const qaReportPath = join(dir, renderRel, 'qa-report.json');

  // ---- QA, in the same invocation. No render exists without a report. ----
  //
  // From here on the encoded file EXISTS on disk, so every exit from this
  // function must leave a report beside it. `commitUnmeasuredReport` is that
  // guarantee: any throw between here and the successful write commits a
  // fail-closed report first, then re-surfaces the error. Phase 4 shipped that
  // protection for exactly one error class (`QaWaiverRejected`) and left five
  // others able to orphan a render.
  // Returns void and the caller re-throws, rather than being typed `never` and
  // throwing itself: TypeScript's control-flow analysis only treats a call as
  // unreachable-after when the callee is declared with an explicit type
  // annotation, so a `never` arrow here would silently lose the definite-
  // assignment narrowing the `try`/`catch` blocks below rely on.
  const commitUnmeasuredReport = (error: unknown): void => {
    writeJsonAtomic(manifestPath, manifest);
    writeJsonAtomic(renderPath, render);
    writeJsonAtomic(
      qaReportPath,
      unmeasuredReport({
        jobId: request.jobId,
        renderId: render.renderId,
        renderManifestId: manifest.renderManifestId,
        tier: manifest.tier,
        ruleset,
        planHash: finalPlan.planHash,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  // Measurement is the one QA input that CANNOT be hoisted above the render —
  // it measures the render. So it is guarded instead: an ffprobe that cannot
  // read the produced file leaves a report saying exactly that, fail-closed.
  let measurements;
  try {
    measurements = await measureRender({
      outputPath: finalPlan.outputPath,
      ruleset,
      hasAudio,
      loudness: render.loudness,
      // Contained, like every other artefact-derived path. Found by the new
      // artefact-path lint, not by a reviewer: three MORE unguarded siblings of
      // exactly the field family the round-2 fix was about.
      captionFiles: {
        ass: resolveJobRelative(dir, manifest.captions.assPath, "The manifest's ASS caption path"),
        srt: resolveJobRelative(dir, manifest.captions.srtPath, "The manifest's SRT caption path"),
        vtt: resolveJobRelative(dir, manifest.captions.vttPath, "The manifest's WebVTT caption path"),
      },
    });
  } catch (error) {
    commitUnmeasuredReport(error);
    throw error;
  }

  const captionCues: QaCaptionCue[] = finalPlan.extras.captionPlan.cues.map((cue) => ({
    index: cue.index,
    startMs: frameMs(cue.startFrame, frameRate),
    endMs: frameMs(cue.endFrame, frameRate),
    displayText: cue.displayText,
    lines: cue.lines,
  }));
  const plannedDurationMs = frameMs(
    finalPlan.extras.clips.reduce((max, clip) => Math.max(max, clip.outputEndFrame), 0),
    frameRate,
  );

  let evaluation;
  try {
    evaluation = evaluateChecks(measurements, {
      ruleset,
      overlay: overlayResult.overlay,
      ...(overlayResult.reason === undefined ? {} : { overlayUnavailableReason: overlayResult.reason }),
      expected: {
        width: manifest.output.width,
        height: manifest.output.height,
        container: manifest.output.container,
        videoCodec: manifest.encoderSettings.videoCodec,
        audioCodec: manifest.encoderSettings.audioCodec,
        hasAudio,
        targetLoudnessLufs: manifest.audioMix.targetLoudnessLufs,
        maxTruePeakDbtp: manifest.audioMix.maxTruePeakDbtp,
        normalise: manifest.audioMix.normalize,
      },
      plannedDurationMs,
      aspectTreatmentMode: edl.aspectTreatment.mode,
      captions: captionCues,
      captionReviewFlags: finalPlan.extras.captionPlan.reviewFlags,
      captionStyle: {
        fontSizePx: finalPlan.extras.captionPlan.style.fontSizePx,
        marginVerticalPx: finalPlan.extras.captionPlan.style.marginVerticalPx,
        marginHorizontalPx: finalPlan.extras.captionPlan.style.marginHorizontalPx,
      },
      // `plan()` refuses an out-of-bounds range outright, so reaching this line
      // at all means the single bounds validator ran and found nothing. Recorded
      // as an empty list rather than skipped: the check DID run.
      sourceRangeViolations: [],
      nonSpeechEvents,
      minResolution: null,
    });
  } catch (error) {
    commitUnmeasuredReport(error);
    throw error;
  }

  let report;
  try {
    report = assembleTechnicalQaReport({
      jobId: request.jobId,
      renderId: render.renderId,
      renderManifestId: manifest.renderManifestId,
      tier: manifest.tier,
      ruleset,
      checksRun: evaluation.checksRun,
      findings: evaluation.findings,
      planHash: finalPlan.planHash,
      waivers,
    });
  } catch (error) {
    if (error instanceof QaWaiverRejected) {
      // The render exists on disk, and the truth is that NO waiver was accepted
      // — so the real findings are committed with an empty waiver list before
      // the rejection surfaces. A better report than the unmeasured one,
      // because the checks all ran; only the waivers were refused.
      writeJsonAtomic(manifestPath, manifest);
      writeJsonAtomic(renderPath, render);
      writeJsonAtomic(
        qaReportPath,
        assembleTechnicalQaReport({
          jobId: request.jobId,
          renderId: render.renderId,
          renderManifestId: manifest.renderManifestId,
          tier: manifest.tier,
          ruleset,
          checksRun: evaluation.checksRun,
          findings: evaluation.findings,
          planHash: finalPlan.planHash,
          waivers: [],
        }),
      );
      throw fail(error.code, error.message, { waiverId: error.waiverId, findingIds: error.findingIds });
    }
    commitUnmeasuredReport(error);
    throw error;
  }

  writeJsonAtomic(manifestPath, manifest);
  writeJsonAtomic(renderPath, render);
  writeJsonAtomic(qaReportPath, report);

  // ---- The review payload (REQ-110's data, no UI — task 6) ----
  //
  // Written for the DRAFT tier only, and written HERE because this is where its
  // subject comes into existence: a reviewer who is about to run `cutdown approve`
  // needs the angle, the promise, the hook hypothesis, the source moments, the
  // rights posture and the rationale beside the file they watch, and "there was a
  // draft but nothing to review it against" is the gap D-9's no-UI decision would
  // otherwise leave.
  //
  // It is best-effort by design, and the ONE thing it must never do is fail the
  // render. A payload is a convenience view over artefacts that already exist; if
  // its inputs are incomplete (a Moment Graph that has moved on, a brief that was
  // never committed) the honest outcome is a warning on stderr, not the loss of a
  // successful render. The refusals that matter are all upstream of here.
  let reviewPayloadRel: string | null = null;
  if (manifest.tier === 'draft') {
    try {
      const payload = assembleReviewPayload({
        jobBrief: loadLatestJson<JobBrief>(join(dir, 'brief')),
        creativeBrief: creativeBriefFor(dir, edl),
        edl,
        render,
        momentsById: loadMoments(dir),
        // An asset carrying no rights block is OMITTED from the map rather than
        // reaching in and throwing. `source-asset-v1` requires `rights`, so this
        // only happens for a partial or hand-authored artefact — and the honest
        // result is that the payload reports the asset as `unknown`, which is what
        // an absent map entry means. A payload that died because rights were
        // missing would be exactly the wrong way round.
        rightsByAssetId: new Map(
          [...assets].flatMap(([id, asset]) =>
            typeof asset.rights?.state === 'string' ? [[id, asset.rights.state] as const] : [],
          ),
        ),
        qaReport: report,
        assembledAt: new Date().toISOString(),
      });
      reviewPayloadRel = `reviews/pending/${render.renderId}.json`;
      writeJsonAtomic(join(dir, 'reviews', 'pending', `${render.renderId}.json`), payload);
    } catch (error) {
      process.stderr.write(
        `[render] The draft rendered and passed QA, but the review payload could not be assembled: ${(error as Error).message}\n` +
          `[render] The render, manifest and QA report are all committed. Review the output directly, or fix the missing input and re-render.\n`,
      );
    }
  }

  const blockerCount = report.findings.filter((f) => f.severity === 'blocker').length;
  const warningCount = report.findings.filter((f) => f.severity === 'warning').length;

  return {
    kind: 'rendered',
    jobId: request.jobId,
    edlId: request.edlId,
    tier: manifest.tier,
    renderId: render.renderId,
    renderManifestId: manifest.renderManifestId,
    manifestPath: `${renderRel}/manifest.json`,
    renderPath: `${renderRel}/render.json`,
    outputPath: render.outputPath,
    qaReportPath: `${renderRel}/qa-report.json`,
    gateStatus: report.gateStatus,
    blockerCount,
    warningCount,
    waivedCount: report.waiverIds.length,
    skippedCheckCount: report.checksRun.filter((c) => c.status !== 'ran').length,
    planHash: finalPlan.planHash.value,
    reviewPayloadPath: reviewPayloadRel,
  };
}

const frameMs = (frame: number, frameRate: { num: number; den: number }): number =>
  Math.round((frame * frameRate.num * 1000) / frameRate.den);

/**
 * `null` means NOT SUPPLIED. A path that was supplied and cannot be read is a
 * different fact and raises — otherwise the report would say "no indexed audio
 * events were supplied" to an operator who supplied exactly that, and the check
 * would read as a deliberate non-applicability rather than a missing file.
 *
 * Shape handling lives in `audio-events.ts`: the file may be output-relative
 * `{events}` or the `index` skill's source-relative `{audioEvents}` artefact,
 * which is projected through the EDL's clips onto the output timeline. The
 * Phase 6 proving run found the artefact shape unreadable here — the only file
 * the pipeline actually produces was the one the option refused.
 */
function loadAudioEvents(path: string | null, edl: PlatformEDL): QaNonSpeechEvent[] | null {
  if (path === null) return null;
  if (!existsSync(path)) {
    throw fail('AUDIO_EVENTS_NOT_FOUND', `--audio-events was given ${path}, which does not exist.`);
  }
  // Through `readJson`, which does NOT echo the parser message. The bare
  // `JSON.parse` quoted the file's first ~10 bytes back to a caller who chose the
  // path, which made `--audio-events` a partial-read oracle over any readable file.
  const parsed = readJson<unknown>(path, 'AUDIO_EVENTS_INVALID', 'The audio events file');
  const clips = [...edl.clips]
    .sort((a, b) => a.order - b.order)
    .map((clip) => ({
      // `assetId` rides along deliberately: a source index is per-asset, so the
      // events in this file describe ONE asset, and a multi-asset EDL's clips do
      // not. Dropping it here is what let one asset's events project onto
      // another's ranges (D-51's remaining half).
      assetId: clip.assetId,
      startTicks: clip.sourceRange.startTicks,
      endTicks: clip.sourceRange.endTicks,
      timebase: clip.sourceRange.timebase,
    }));
  try {
    return interpretAudioEventsDocument(parsed, clips);
  } catch (err) {
    // The interpreter's messages name fields and entry indices, never content.
    throw fail('AUDIO_EVENTS_INVALID', `${path} is not a usable audio-events file: ${(err as Error).message}`);
  }
}

/**
 * Read and VALIDATE every `--waiver` file against `qa-waiver-v1`.
 *
 * Not merely parsed and cast: D-35 requires a named approver, a reason, a
 * timestamp and the finding ids, and a bare `JSON.parse` plus a TypeScript cast
 * accepts `{findingIds:[...]}` with none of them while still flipping the gate
 * to `pass_with_waivers` — an anonymous, unexplained waiver, which is the one
 * thing a waiver may never be.
 *
 * Called BEFORE plan()/execute(): a malformed waiver is bad input, and rejecting
 * it after an encode would leave a render on disk with no report beside it.
 */
function loadWaivers(paths: readonly string[]): QaWaiver[] {
  if (paths.length === 0) return [];
  const validator = createAjv().getSchema('https://cutdown.local/contracts/schemas/qa-waiver-v1.json');
  if (validator === undefined) {
    throw fail('WAIVER_SCHEMA_MISSING', 'qa-waiver-v1 is not registered; waivers cannot be validated.');
  }
  return paths.map((path) => {
    const candidate = readJson<unknown>(path, 'WAIVER_UNREADABLE', 'QaWaiver');
    if (!validator(candidate)) {
      throw fail(
        'WAIVER_SCHEMA_INVALID',
        `The waiver at ${path} does not satisfy qa-waiver-v1: ${formatAjvErrors(validator.errors)}. ` +
          `A waiver without a named approver, a reason, a timestamp and the finding ids it covers is not a waiver (D-35), and is rejected rather than ignored.`,
      );
    }
    return candidate as QaWaiver;
  });
}

/**
 * The report written when QA could not judge a render that already exists.
 *
 * `container_corruption` — a non-waivable blocker (D-35) — is the honest verdict
 * for "the encoder produced a file and the measurement pass could not read it".
 * The message says plainly that this is a *measurement failure* rather than a
 * confirmed corrupt container, so nobody reads it as a decoded diagnosis; what
 * matters for correctness is that it BLOCKS, and that every other check is
 * recorded `errored` with the same reason instead of silently absent.
 *
 * The alternative — deleting the orphan render — would destroy the only evidence
 * of what the encoder actually did, and `output.mp4` is often exactly what an
 * operator needs to look at to understand why the measurement failed.
 */
function unmeasuredReport(input: {
  jobId: string;
  renderId: string;
  renderManifestId: string;
  tier: 'draft' | 'final';
  ruleset: QaRuleset;
  planHash: { algorithm: 'sha256'; value: string };
  reason: string;
}): TechnicalQaReport {
  const reason = `Technical QA could not be completed for this render: ${input.reason}`;
  return assembleTechnicalQaReport({
    jobId: input.jobId,
    renderId: input.renderId,
    renderManifestId: input.renderManifestId,
    tier: input.tier,
    ruleset: input.ruleset,
    checksRun: ALL_CHECK_IDS.map((checkId) => ({ checkId, status: 'errored' as const, reason })),
    findings: [
      {
        findingId: `container_corruption:output:qa-incomplete`,
        checkId: 'container_corruption',
        severity: 'blocker',
        waivable: false,
        object: 'output',
        message:
          `${reason} This is a MEASUREMENT failure, not a decoded diagnosis of a corrupt container — but an output QA cannot read is not a deliverable, ` +
          `so it is reported as a non-waivable blocker rather than left as an unjudged render.`,
        fix: 'Inspect the render at the recorded outputPath and the FFmpeg/FFprobe error above, then re-run `cutdown render`. No waiver can clear this (D-35).',
        timeRange: null,
      },
    ],
    // Deliberately empty. Supplied waivers were validated before the render, but
    // they name findings from a real evaluation that never happened here, so
    // applying them would throw WAIVER_NAMES_UNKNOWN_FINDING from inside the very
    // error path that exists to guarantee a report gets written.
    waivers: [],
    planHash: input.planHash,
  });
}

/**
 * The newest committed JSON artefact in a directory.
 *
 * "Newest" is the last name in sorted order, which is creation order because every
 * artefact is named by a ULID. Throws when the directory is empty or absent —
 * the caller (the review payload, which is best-effort) turns that into a warning.
 */
function loadLatestJson<T>(dir: string): T {
  if (!existsSync(dir)) throw new Error(`no committed artefacts in ${dir}`);
  const latest = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().at(-1);
  if (latest === undefined) throw new Error(`no committed artefacts in ${dir}`);
  return JSON.parse(readFileSync(join(dir, latest), 'utf8')) as T;
}

/**
 * The CreativeBrief this EDL descends from, resolved through its MasterStoryPlan.
 *
 * The EDL names its story plan, and the story plan names its creative brief — so
 * the lineage is walked rather than guessed. Taking "the newest CreativeBrief" for
 * a job would silently attribute a cut to a sibling variant, which is precisely
 * the confusion side-by-side variant review exists to remove.
 */
function creativeBriefFor(dir: string, edl: PlatformEDL): CreativeBrief {
  const storyPlanPath = join(dir, 'story-plans', `${edl.storyPlanId}.json`);
  if (!existsSync(storyPlanPath)) {
    throw new Error(`the EDL names story plan ${edl.storyPlanId}, which is not committed in this job`);
  }
  // Both ids on this walk become FILENAMES, and both are `$ref: Ulid` in their own
  // contracts — so validating each artefact on read enforces them at the boundary
  // rather than re-asserting per field, which is the pattern that kept missing the
  // sibling on the next line.
  const storyPlan = readContractJson<MasterStoryPlan>(
    storyPlanPath,
    contractSchemaId('master-story-plan-v1'),
    'STORY_PLAN_INVALID',
    `MasterStoryPlan ${edl.storyPlanId}`,
  );
  const briefPath = join(dir, 'creative-briefs', `${storyPlan.creativeBriefId}.json`);
  if (!existsSync(briefPath)) {
    throw new Error(`story plan ${edl.storyPlanId} names CreativeBrief ${storyPlan.creativeBriefId}, which is not committed in this job`);
  }
  return readContractJson<CreativeBrief>(
    briefPath,
    contractSchemaId('creative-brief-v1'),
    'CREATIVE_BRIEF_INVALID',
    `CreativeBrief ${storyPlan.creativeBriefId}`,
  );
}

/** Every committed Moment in the job, by momentId. */
function loadMoments(dir: string): Map<string, Moment> {
  const momentsDir = join(dir, 'moments');
  const map = new Map<string, Moment>();
  if (!existsSync(momentsDir)) return map;
  for (const file of readdirSync(momentsDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(join(momentsDir, file), 'utf8')) as Moment | { moments?: Moment[] };
    // Phase 2 commits Moments either individually or as one `{moments: [...]}`
    // document per asset; both shapes are read rather than one being assumed.
    if (Array.isArray((parsed as { moments?: Moment[] }).moments)) {
      for (const moment of (parsed as { moments: Moment[] }).moments) map.set(moment.momentId, moment);
    } else {
      const moment = parsed as Moment;
      if (typeof moment.momentId === 'string') map.set(moment.momentId, moment);
    }
  }
  return map;
}

/** Caption colours from the StyleProfile's declared roles (D-26 invariants only). */
function captionStyleFrom(profile: StyleProfile): { primaryColourHex?: string; outlineColourHex?: string } {
  const text = profile.colours.find((c) => c.role === 'text');
  const background = profile.colours.find((c) => c.role === 'background');
  return {
    // Background colour for the TEXT and text colour for the OUTLINE: a caption
    // sits over video, so it needs the light-on-dark inversion of the brand's
    // page palette, not the palette itself.
    ...(background === undefined ? {} : { primaryColourHex: background.hex }),
    ...(text === undefined ? {} : { outlineColourHex: text.hex }),
  };
}

await runSkillMain<RenderRequest, RenderSkillResult>({
  name: SKILL,
  version: VERSION,
  inputSchema: './schema/input.json',
  outputSchema: './schema/output.json',
  run,
});
