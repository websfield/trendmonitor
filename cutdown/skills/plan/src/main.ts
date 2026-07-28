import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ulid } from 'ulid';
import { parse as parseYaml } from 'yaml';

import {
  fail,
  jobDir,
  reject,
  runSkillMain,
  skillEnvelope,
  writeJsonAtomic,
  type SkillContext,
} from '@cutdown/skill-runtime';
import {
  ModelGateway,
  ModelNotConfiguredError,
  PHASE_0_PLATFORM,
  buildStoryPlanPrompt,
  loadConfig,
  resolveEdl,
  validateStoryPlanSchema,
  validateStoryPlanStructure,
  type PlatformCapability,
  type Transport,
  type TransportResponse,
} from '@cutdown/editorial';
import type { AssetBounds } from '@cutdown/contracts';
import type { CreativeBriefV1, JobBriefV1, MasterStoryPlanV1, MomentV1, PlatformEdlV1 } from '@cutdown/contracts/generated';

type JobBrief = JobBriefV1.JobBrief;
type CreativeBrief = CreativeBriefV1.CreativeBrief;
type Moment = MomentV1.Moment;
type MasterStoryPlan = MasterStoryPlanV1.MasterStoryPlan;
type PlatformEDL = PlatformEdlV1.PlatformEDL;

const SKILL = 'plan';
const VERSION = '1.0.0';
const STORY_TEMPLATE_ID = 'plan-story';
const EDL_TEMPLATE_ID = 'plan-edl';
const TEMPLATE_VERSION = '1.0.0';

interface PlanRequest {
  jobId: string;
  creativeBriefId: string;
  platform: string;
  recordedModelPath?: string | null;
  boundsPath?: string | null;
}

type PlanResult =
  | { kind: 'planned'; jobId: string; storyPlanId: string; storyPlanPath: string; edlId: string; edlPath: string; validation: { ok: boolean; clipsChecked: number } }
  | { kind: 'skipped'; code: 'MODEL_NOT_CONFIGURED'; reason: string };

class RecordedTransport implements Transport {
  private i = 0;
  constructor(private readonly responses: readonly TransportResponse[]) {}
  post(): Promise<TransportResponse> {
    const next = this.responses[this.i];
    this.i += 1;
    if (!next) return Promise.reject(new Error('recorded transport exhausted: the fixture has fewer responses than the skill made calls.'));
    return Promise.resolve(next);
  }
}

function recordedGateway(recordedPath: string, ctx: SkillContext): ModelGateway {
  if (!existsSync(recordedPath)) throw fail('RECORDED_MODEL_MISSING', `No recorded model response at ${recordedPath}.`);
  const parsed = JSON.parse(readFileSync(recordedPath, 'utf8')) as { responses?: unknown[] };
  if (!Array.isArray(parsed.responses)) throw fail('RECORDED_MODEL_INVALID', `${recordedPath} must carry a "responses" array.`);
  const responses: TransportResponse[] = parsed.responses.map((r) => ({ status: 200, body: JSON.stringify(r) }));
  const config = loadConfig({ envFile: join(ctx.workspaceRoot, '.env'), environ: { ANTHROPIC_API_KEY: 'sk-ant-recorded-fixture', CUTDOWN_SPEND_CEILING_AUD: '1' } });
  return new ModelGateway(config, new RecordedTransport(responses));
}

function loadJobBrief(root: string): JobBrief {
  const dir = join(root, 'brief');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  const latest = files.at(-1);
  if (!latest) throw fail('BRIEF_NOT_FOUND', `Job has no committed JobBrief in ${dir}.`);
  return JSON.parse(readFileSync(join(dir, latest), 'utf8')) as JobBrief;
}

function loadCreativeBrief(root: string, id: string): CreativeBrief {
  const path = join(root, 'creative-briefs', `${id}.json`);
  if (!existsSync(path)) throw fail('CREATIVE_BRIEF_NOT_FOUND', `No CreativeBrief ${id} at ${path}; run \`cutdown propose\` first.`);
  return JSON.parse(readFileSync(path, 'utf8')) as CreativeBrief;
}

function loadMoments(root: string): Moment[] {
  const dir = join(root, 'moments');
  if (!existsSync(dir)) return [];
  const moments: Moment[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown;
    if (Array.isArray(parsed)) moments.push(...(parsed as Moment[]));
  }
  return moments;
}

/** Build the deterministic PlatformCapability from the D-3 YAML fixture. */
function loadCapability(ctx: SkillContext): PlatformCapability {
  const path = join(ctx.workspaceRoot, 'data', 'platform-capabilities', 'tiktok-organic-au-fixture.yaml');
  if (!existsSync(path)) throw fail('CAPABILITY_FIXTURE_MISSING', `TikTok capability fixture not found at ${path}.`);
  const doc = parseYaml(readFileSync(path, 'utf8')) as {
    platform?: string;
    media?: { preferredAspectRatios?: string[]; minResolution?: { width: number; height: number }; duration?: { minSeconds: number; maxSeconds: number } };
  };
  const ratios = doc.media?.preferredAspectRatios ?? ['9:16'];
  const res = doc.media?.minResolution ?? { width: 720, height: 1280 };
  const duration = doc.media?.duration ?? { minSeconds: 5, maxSeconds: 180 };
  return {
    platform: doc.platform ?? 'tiktok',
    duration: { minSeconds: duration.minSeconds, maxSeconds: duration.maxSeconds },
    canvas: { width: res.width, height: res.height, aspectRatio: ratios[0] ?? '9:16' },
    preferredAspectRatios: ratios,
    // The PRD §11 example carries no per-platform treatment allow-list; Phase 0
    // admits the full REQ-052 vocabulary (centre_crop is unrepresentable in the
    // enum), and the Phase 1 registry will restrict it per platform.
    aspectTreatmentOptions: ['subject_reframe', 'letterbox', 'blurred_background', 'branded_background', 'split_screen'],
  };
}

/** AssetBounds for every asset the Moments belong to (boundsPath override, else SourceAsset preflight). */
function loadBounds(root: string, assetIds: ReadonlySet<string>, boundsPath?: string | null): Map<string, AssetBounds> {
  const bounds = new Map<string, AssetBounds>();
  if (boundsPath) {
    const arr = JSON.parse(readFileSync(boundsPath, 'utf8')) as AssetBounds[];
    for (const b of arr) bounds.set(b.assetId, b);
    return bounds;
  }
  for (const assetId of assetIds) {
    const path = join(root, 'assets', `${assetId}.json`);
    if (!existsSync(path)) {
      bounds.set(assetId, { assetId, duration: null }); // fail closed: no bound => resolveEdl blocks
      continue;
    }
    const asset = JSON.parse(readFileSync(path, 'utf8')) as { preflight?: { duration?: AssetBounds['duration'] } };
    bounds.set(assetId, { assetId, duration: asset.preflight?.duration ?? null });
  }
  return bounds;
}

async function run(request: PlanRequest, ctx: SkillContext): Promise<PlanResult> {
  // 1. Refuse any non-Phase-0 platform explicitly (D-3) — a caller-input error.
  if (request.platform !== PHASE_0_PLATFORM) {
    throw reject(
      'PLATFORM_UNSUPPORTED',
      `Platform ${JSON.stringify(request.platform)} has no Phase 0 capability fixture — only ${PHASE_0_PLATFORM} does (D-3). plan fails explicitly rather than falling back to a generic profile.`,
    );
  }

  const root = jobDir(ctx.workspaceRoot, request.jobId);
  const jobBrief = loadJobBrief(root);
  const creativeBrief = loadCreativeBrief(root, request.creativeBriefId);
  const moments = loadMoments(root);
  const capability = loadCapability(ctx);

  const momentAssetById = new Map<string, string>();
  for (const m of moments) momentAssetById.set(m.momentId, m.assetId);
  const selectedAssetIds = new Set<string>();
  for (const sm of creativeBrief.selectedMoments) {
    const assetId = momentAssetById.get(sm.momentId);
    if (assetId) selectedAssetIds.add(assetId);
  }
  const boundsByAsset = loadBounds(root, selectedAssetIds, request.boundsPath);

  // 2. Choose the gateway (recorded replay for tests, else the configured live gateway).
  let gateway: ModelGateway;
  if (request.recordedModelPath) {
    gateway = recordedGateway(request.recordedModelPath, ctx);
  } else {
    const config = loadConfig({ envFile: join(ctx.workspaceRoot, '.env') });
    if (!config.isEnabled) {
      return { kind: 'skipped', code: 'MODEL_NOT_CONFIGURED', reason: config.unconfiguredReason() ?? 'the editorial gateway is not configured.' };
    }
    gateway = new ModelGateway(config);
  }
  const provenance = { provider: gateway.config.provider, modelId: gateway.config.modelId, promptTemplateVersion: TEMPLATE_VERSION };

  try {
    // 3. Story plan — model proposes, deterministic structure check owns the reject.
    const storyPrompt = buildStoryPlanPrompt({ creativeBrief });
    const storyResult = await gateway.completeJson<MasterStoryPlan>({
      system: storyPrompt.system,
      content: storyPrompt.content,
      promptTemplateId: STORY_TEMPLATE_ID,
      validate: (parsed) => {
        const record = parsed as { beats?: unknown; dependencies?: unknown; alternateHooks?: unknown };
        const plan: MasterStoryPlan = {
          storyPlanId: ulid(),
          envelope: skillEnvelope(SKILL, VERSION),
          jobId: request.jobId,
          creativeBriefId: creativeBrief.creativeBriefId,
          parentStoryPlanId: null,
          beats: (record.beats as MasterStoryPlan['beats']) ?? [],
          dependencies: (record.dependencies as MasterStoryPlan['dependencies']) ?? [],
          alternateHooks: (record.alternateHooks as MasterStoryPlan['alternateHooks']) ?? [],
          modelProvenance: { ...provenance, promptTemplateId: STORY_TEMPLATE_ID },
        };
        const schemaErrors = validateStoryPlanSchema(plan);
        if (schemaErrors.length > 0) throw new Error(`story plan schema invalid: ${schemaErrors.join('; ')}`);
        const structural = validateStoryPlanStructure(plan, creativeBrief);
        if (structural.length > 0) throw new Error(`story plan structure invalid: ${structural.map((v) => `[${v.code}] ${v.message}`).join(' | ')}`);
        return plan;
      },
    });
    const storyPlan = storyResult.data;

    // 4. Platform EDL — model proposes ranges; resolveEdl owns the bounds block.
    const edlPrompt = buildEdlPrompt(creativeBrief, storyPlan);
    let clipsChecked = 0;
    const edlResult = await gateway.completeJson<PlatformEDL>({
      system: edlPrompt.system,
      content: edlPrompt.content,
      promptTemplateId: EDL_TEMPLATE_ID,
      validate: (parsed) => {
        const record = parsed as Partial<PlatformEDL>;
        const edl: PlatformEDL = {
          edlId: ulid(),
          envelope: skillEnvelope(SKILL, VERSION),
          jobId: request.jobId,
          storyPlanId: storyPlan.storyPlanId,
          parentEdlId: null,
          platform: PHASE_0_PLATFORM,
          objective: jobBrief.objective,
          distributionMode: jobBrief.distributionMode,
          locale: jobBrief.locale,
          targetDurationRange: jobBrief.durationRange,
          canvas: capability.canvas,
          aspectTreatment: record.aspectTreatment as PlatformEDL['aspectTreatment'],
          hookFamily: creativeBrief.hookFamily,
          clips: (record.clips as PlatformEDL['clips']) ?? [],
          audioMode: record.audioMode as PlatformEDL['audioMode'],
          disclosures: record.disclosures as PlatformEDL['disclosures'],
          metadata: record.metadata as PlatformEDL['metadata'],
          coverFrame: (record.coverFrame as PlatformEDL['coverFrame']) ?? { kind: 'none' },
          modelProvenance: { ...provenance, promptTemplateId: EDL_TEMPLATE_ID },
        };
        const resolution = resolveEdl(edl, boundsByAsset, { momentAssetById });
        if (!resolution.ok) {
          const detail = [...resolution.schemaErrors, ...resolution.violations.map((v) => `[${v.code}] ${v.message}`)].join(' | ');
          throw new Error(`EDL invalid: ${detail}`);
        }
        clipsChecked = resolution.checked;
        return edl;
      },
    });
    const edl = edlResult.data;

    const storyPlanPath = join(root, 'story-plans', `${storyPlan.storyPlanId}.json`);
    const edlPath = join(root, 'edl', `${edl.edlId}.json`);
    writeJsonAtomic(storyPlanPath, storyPlan);
    writeJsonAtomic(edlPath, edl);

    return {
      kind: 'planned',
      jobId: request.jobId,
      storyPlanId: storyPlan.storyPlanId,
      storyPlanPath: relative(root, storyPlanPath).split('\\').join('/'),
      edlId: edl.edlId,
      edlPath: relative(root, edlPath).split('\\').join('/'),
      validation: { ok: true, clipsChecked },
    };
  } catch (err) {
    if (err instanceof ModelNotConfiguredError) {
      return { kind: 'skipped', code: 'MODEL_NOT_CONFIGURED', reason: err.message };
    }
    throw fail('PLAN_MODEL_FAILED', `the model plan was unusable after one repair retry: ${(err as Error).message}`);
  }
}

/** Assemble the EDL prompt from the CreativeBrief + the just-validated story plan. */
function buildEdlPrompt(creativeBrief: CreativeBrief, storyPlan: MasterStoryPlan): { system: string; content: Array<{ type: 'text'; text: string }> } {
  const system =
    'You are a platform editor turning an approved narrative plan into a TikTok 9:16 timeline. ' +
    'Return ONLY a JSON object with {clips, aspectTreatment, audioMode, disclosures, metadata, coverFrame}. ' +
    'Rules enforced deterministically after you answer: every clip.sourceRange MUST be within the asset bounds ' +
    '(an out-of-bounds range is rejected, never clamped); clip.order MUST be a contiguous run; clip.assetId MUST ' +
    'equal its Moment\'s asset; a quote caption MUST carry verbatimSourceText and speakerLabel from the Moment. ' +
    'aspectTreatment.mode must be a permitted non-crop treatment (REQ-052).';
  const payload = {
    creativeThesis: creativeBrief.creativeThesis,
    hookFamily: creativeBrief.hookFamily,
    beats: storyPlan.beats.map((b) => ({ beatId: b.beatId, order: b.order, function: b.function, momentId: b.momentId })),
    selectedMoments: creativeBrief.selectedMoments.map((m) => ({ momentId: m.momentId, candidateFunction: m.candidateFunction })),
  };
  return { system, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

await runSkillMain<PlanRequest, PlanResult>({
  name: SKILL,
  version: VERSION,
  inputSchema: './schema/input.json',
  outputSchema: './schema/output.json',
  run,
});
