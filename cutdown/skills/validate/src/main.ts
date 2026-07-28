import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { parse as parseYaml } from 'yaml';

import {
  fail,
  jobDir,
  runSkillMain,
  writeJsonAtomic,
  type SkillContext,
} from '@cutdown/skill-runtime';
import {
  ModelGateway,
  ModelNotConfiguredError,
  loadConfig,
  type PlatformCapability,
  type Transport,
  type TransportResponse,
} from '@cutdown/editorial';
import { assembleGateResult, runDeterministicGates, type CriticFinding, type DeterministicGateResult } from '@cutdown/qa';
import type { AssetBounds } from '@cutdown/contracts';
import type { CreativeBriefV1, JobBriefV1, MomentV1, PlatformEdlV1, StyleProfileV1 } from '@cutdown/contracts/generated';

type JobBrief = JobBriefV1.JobBrief;
type Moment = MomentV1.Moment;
type PlatformEDL = PlatformEdlV1.PlatformEDL;
type StyleProfile = StyleProfileV1.StyleProfile;
type CreativeBrief = CreativeBriefV1.CreativeBrief;

const SKILL = 'validate';
const VERSION = '1.0.0';
const CRITIC_TEMPLATE_ID = 'validate-critic';

const CRITIC_LENSES = [
  'coherence', 'first_frame', 'redundancy', 'context', 'abrupt_audio',
  'caption_overload', 'style_fit', 'originality', 'policy', 'platform_readiness',
] as const;

interface ValidateRequest {
  jobId: string;
  edlId: string;
  recordedModelPath?: string | null;
  boundsPath?: string | null;
  styleProfilePath?: string | null;
}

interface ValidateResult {
  kind: 'validated';
  jobId: string;
  edlId: string;
  gateStatus: 'pass' | 'fail';
  blockerCount: number;
  deterministicAdvisoryCount: number;
  gatePath: string;
  criticPath: string;
  critic: { status: 'ran' | 'skipped'; findingCount?: number; reason?: string };
}

class RecordedTransport implements Transport {
  private i = 0;
  constructor(private readonly responses: readonly TransportResponse[]) {}
  post(): Promise<TransportResponse> {
    const next = this.responses[this.i];
    this.i += 1;
    if (!next) return Promise.reject(new Error('recorded transport exhausted.'));
    return Promise.resolve(next);
  }
}

function recordedGateway(recordedPath: string, ctx: SkillContext): ModelGateway {
  if (!existsSync(recordedPath)) throw fail('RECORDED_MODEL_MISSING', `No recorded critic response at ${recordedPath}.`);
  const parsed = JSON.parse(readFileSync(recordedPath, 'utf8')) as { responses?: unknown[] };
  if (!Array.isArray(parsed.responses)) throw fail('RECORDED_MODEL_INVALID', `${recordedPath} must carry a "responses" array.`);
  const responses: TransportResponse[] = parsed.responses.map((r) => ({ status: 200, body: JSON.stringify(r) }));
  const config = loadConfig({ envFile: join(ctx.workspaceRoot, '.env'), environ: { ANTHROPIC_API_KEY: 'sk-ant-recorded-fixture', CUTDOWN_SPEND_CEILING_AUD: '1' } });
  return new ModelGateway(config, new RecordedTransport(responses));
}

function readJsonIfExists<T>(path: string): T | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined;
}

function loadEdl(root: string, edlId: string): PlatformEDL {
  const path = join(root, 'edl', `${edlId}.json`);
  if (!existsSync(path)) throw fail('EDL_NOT_FOUND', `No PlatformEDL ${edlId} at ${path}; run \`cutdown plan\` first.`);
  return JSON.parse(readFileSync(path, 'utf8')) as PlatformEDL;
}

function loadJobBrief(root: string): JobBrief {
  const dir = join(root, 'brief');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  const latest = files.at(-1);
  if (!latest) throw fail('BRIEF_NOT_FOUND', `Job has no committed JobBrief in ${dir}.`);
  return JSON.parse(readFileSync(join(dir, latest), 'utf8')) as JobBrief;
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

/** Resolve the CreativeBrief behind an EDL via its story plan (best-effort — optional cross-check). */
function loadCreativeBrief(root: string, edl: PlatformEDL): CreativeBrief | undefined {
  const story = readJsonIfExists<{ creativeBriefId?: string }>(join(root, 'story-plans', `${edl.storyPlanId}.json`));
  if (!story?.creativeBriefId) return undefined;
  return readJsonIfExists<CreativeBrief>(join(root, 'creative-briefs', `${story.creativeBriefId}.json`));
}

function loadStyleProfile(root: string, jobBrief: JobBrief, styleProfilePath?: string | null): StyleProfile | undefined {
  if (styleProfilePath) return JSON.parse(readFileSync(styleProfilePath, 'utf8')) as StyleProfile;
  const dir = join(root, 'style-profiles');
  if (!existsSync(dir)) return undefined;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const profile = JSON.parse(readFileSync(join(dir, file), 'utf8')) as StyleProfile;
    if (profile.accountId === jobBrief.accountId) return profile;
  }
  return undefined;
}

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
    aspectTreatmentOptions: ['subject_reframe', 'letterbox', 'blurred_background', 'branded_background', 'split_screen'],
  };
}

function loadBounds(root: string, assetIds: ReadonlySet<string>, boundsPath?: string | null): Map<string, AssetBounds> {
  const bounds = new Map<string, AssetBounds>();
  if (boundsPath) {
    for (const b of JSON.parse(readFileSync(boundsPath, 'utf8')) as AssetBounds[]) bounds.set(b.assetId, b);
    return bounds;
  }
  for (const assetId of assetIds) {
    const asset = readJsonIfExists<{ preflight?: { duration?: AssetBounds['duration'] } }>(join(root, 'assets', `${assetId}.json`));
    bounds.set(assetId, { assetId, duration: asset?.preflight?.duration ?? null });
  }
  return bounds;
}

/** Build the critic prompt — advisory lenses only; it cannot block (D-37). */
function buildCriticPrompt(edl: PlatformEDL): { system: string; content: Array<{ type: 'text'; text: string }> } {
  const system =
    'You are an ADVISORY editorial critic reviewing one TikTok cut. Your findings are evidence for a human ' +
    'reviewer and NEVER block publication — deterministic checks own every block. ' +
    `Return ONLY {"findings":[{"lens","severity","note","cite"?}]} where lens is one of: ${CRITIC_LENSES.join(', ')}. ` +
    'Comment on coherence, first-frame strength, redundancy, missing context, abrupt audio, caption overload, ' +
    'brand-style fit, originality suspicion, likely policy risk, and platform readiness. Do NOT invent a block.';
  const payload = {
    metadata: edl.metadata,
    hookFamily: edl.hookFamily,
    aspectTreatment: edl.aspectTreatment,
    clips: edl.clips.map((c) => ({ clipId: c.clipId, order: c.order, narrativeFunction: c.narrativeFunction, caption: c.caption })),
  };
  return { system, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function toCriticFinding(raw: unknown): CriticFinding {
  const rec = raw as { lens?: unknown; severity?: unknown; note?: unknown; cite?: unknown };
  const finding: CriticFinding = {
    source: 'critic',
    lens: typeof rec.lens === 'string' ? rec.lens : 'unspecified',
    severity: typeof rec.severity === 'string' ? rec.severity : 'info',
    note: typeof rec.note === 'string' ? rec.note : '',
  };
  if (typeof rec.cite === 'string') finding.cite = rec.cite;
  return finding;
}

async function run(request: ValidateRequest, ctx: SkillContext): Promise<ValidateResult> {
  const root = jobDir(ctx.workspaceRoot, request.jobId);
  const edl = loadEdl(root, request.edlId);
  const jobBrief = loadJobBrief(root);
  const moments = loadMoments(root);
  const capability = loadCapability(ctx);
  const styleProfile = loadStyleProfile(root, jobBrief, request.styleProfilePath);
  const creativeBrief = loadCreativeBrief(root, edl);

  const momentAssetById = new Map<string, string>();
  for (const m of moments) momentAssetById.set(m.momentId, m.assetId);
  const assetIds = new Set<string>(edl.clips.map((c) => c.assetId));
  const boundsByAsset = loadBounds(root, assetIds, request.boundsPath);

  // 1. The deterministic gate — owns every block, needs no model (D-37). Always runs.
  const deterministic: DeterministicGateResult = runDeterministicGates(edl, {
    moments,
    jobBrief,
    ...(styleProfile ? { styleProfile } : {}),
    ...(creativeBrief ? { creativeBrief } : {}),
    capability,
    boundsByAsset,
    momentAssetById,
  });

  // 2. The advisory critic — separate output, cannot change gateStatus (D-37).
  let critic: { status: 'ran' | 'skipped'; findingCount?: number; reason?: string };
  let criticAdvisories: CriticFinding[] = [];
  let gateway: ModelGateway | null = null;

  if (request.recordedModelPath) {
    gateway = recordedGateway(request.recordedModelPath, ctx);
  } else {
    const config = loadConfig({ envFile: join(ctx.workspaceRoot, '.env') });
    if (config.isEnabled) gateway = new ModelGateway(config);
  }

  if (gateway === null) {
    critic = { status: 'skipped', reason: 'the editorial gateway is not configured (no key / no D-21 spend ceiling); the deterministic gate still produced its verdict.' };
  } else {
    try {
      const prompt = buildCriticPrompt(edl);
      const result = await gateway.completeJson<CriticFinding[]>({
        system: prompt.system,
        content: prompt.content,
        promptTemplateId: CRITIC_TEMPLATE_ID,
        validate: (parsed) => {
          const rec = parsed as { findings?: unknown };
          if (!Array.isArray(rec.findings)) throw new Error('critic response must be {"findings":[...]}.');
          return rec.findings.map(toCriticFinding);
        },
      });
      criticAdvisories = result.data;
      critic = { status: 'ran', findingCount: criticAdvisories.length };
    } catch (err) {
      if (err instanceof ModelNotConfiguredError) {
        critic = { status: 'skipped', reason: err.message };
      } else {
        // The critic is advisory: its failure must NOT fail the deterministic verdict.
        critic = { status: 'skipped', reason: `critic call failed and was skipped (advisory only): ${(err as Error).message}` };
      }
    }
  }

  // 3. Persist the TWO outputs separately, then reference both. gateStatus is the
  // deterministic verdict only — the assembled result cannot promote a critic finding.
  const full = assembleGateResult({ deterministic, criticAdvisories });
  const gatePathAbs = join(root, 'reviews', `${request.edlId}-gate.json`);
  const criticPathAbs = join(root, 'reviews', `${request.edlId}-critic.json`);
  writeJsonAtomic(gatePathAbs, {
    edlId: request.edlId,
    gateStatus: deterministic.gateStatus,
    blockers: deterministic.blockers,
    advisories: deterministic.advisories,
    checked: deterministic.checked,
  });
  writeJsonAtomic(criticPathAbs, { edlId: request.edlId, critic, findings: criticAdvisories });

  return {
    kind: 'validated',
    jobId: request.jobId,
    edlId: request.edlId,
    gateStatus: full.gateStatus,
    blockerCount: deterministic.blockers.length,
    deterministicAdvisoryCount: deterministic.advisories.length,
    gatePath: relative(root, gatePathAbs).split('\\').join('/'),
    criticPath: relative(root, criticPathAbs).split('\\').join('/'),
    critic,
  };
}

await runSkillMain<ValidateRequest, ValidateResult>({
  name: SKILL,
  version: VERSION,
  inputSchema: './schema/input.json',
  outputSchema: './schema/output.json',
  run,
});
