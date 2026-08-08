import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { parse as parseYaml } from 'yaml';

import {
  assertContained,
  assertSafeId,
  contractSchemaId,
  fail,
  readContractJson,
  jobDir,
  resolveJobRelative,
  runSkillMain,
  validateContract,
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
import { loadStyleProfile as loadStyleProfileFile } from '@cutdown/style';
import type { AssetBounds } from '@cutdown/contracts';
import type { CreativeBriefV1, JobBriefV1, MasterStoryPlanV1, MomentV1, PlatformEdlV1, StyleProfileV1 } from '@cutdown/contracts/generated';

type JobBrief = JobBriefV1.JobBrief;
type Moment = MomentV1.Moment;
type PlatformEDL = PlatformEdlV1.PlatformEDL;
type StyleProfile = StyleProfileV1.StyleProfile;
type CreativeBrief = CreativeBriefV1.CreativeBrief;
type MasterStoryPlan = MasterStoryPlanV1.MasterStoryPlan;

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
  // The id becomes a FILENAME. Unguarded, `../<other-job>/edl/<x>` read another job's
  // EDL — and the two writes below then landed inside that job's directory, creating
  // directories on the way. Guarded here as well as patterned in the input schema,
  // because `entrypoint` is a documented direct invocation.
  assertSafeId(edlId, 'EDL id');
  const path = join(root, 'edl', `${edlId}.json`);
  if (!existsSync(path)) throw fail('EDL_NOT_FOUND', `No PlatformEDL ${edlId} at ${path}; run \`cutdown plan\` first.`);
  // Contract-validated on read, not cast. `storyPlanId` is `$ref: Ulid` in
  // platform-edl-v1 and becomes a FILENAME in `loadCreativeBrief` below, so
  // validating the artefact here guards that field — and every other id on it —
  // without a per-field assertion anyone can forget to add to the next sibling.
  return readContractJson<PlatformEDL>(
    path,
    contractSchemaId('platform-edl-v1'),
    'EDL_INVALID',
    `PlatformEDL ${edlId}`,
  );
}

function loadJobBrief(root: string): JobBrief {
  const dir = join(root, 'brief');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  const latest = files.at(-1);
  if (!latest) throw fail('BRIEF_NOT_FOUND', `Job has no committed JobBrief in ${dir}.`);
  return JSON.parse(readFileSync(join(dir, latest), 'utf8')) as JobBrief;
}

/**
 * Every committed Moment in the job, CONTRACT-VALIDATED per record.
 *
 * Validated because `moment-v1.assetId` is `$ref: Ulid` and it becomes a FILENAME
 * (`assets/<assetId>.json`). This was the FIFTH recurrence of the same defect, found
 * in round 4 — and found in a file the round-3 fix had already edited, which is the
 * whole argument for validating artefacts at the boundary instead of hunting fields
 * one reviewer finding at a time.
 *
 * Per ELEMENT, not per file: these files hold an array, and the array is not itself a
 * contract object, so a whole-document validation would prove nothing about the ids.
 */
function loadMoments(root: string): Moment[] {
  const dir = join(root, 'moments');
  if (!existsSync(dir)) return [];
  const moments: Moment[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch {
      // Not echoed: the parser message quotes the file's first bytes.
      throw fail('MOMENTS_INVALID', `The Moment file moments/${file} is not valid JSON.`);
    }
    if (!Array.isArray(parsed)) continue;
    parsed.forEach((record, i) => {
      moments.push(
        validateContract<Moment>(
          record,
          contractSchemaId('moment-v1'),
          'MOMENTS_INVALID',
          `Moment ${String(i)} in moments/${file}`,
        ),
      );
    });
  }
  return moments;
}

/**
 * Resolve the CreativeBrief behind an EDL via its story plan (best-effort — optional cross-check).
 *
 * Best-effort in ABSENCE only. A file that is present but fails its contract is a
 * refusal, not a silent `undefined`: `creativeBriefId` is read out of the story plan
 * and joined into a path on the next line, and this cross-check exists to catch
 * editorial divergence — skipping it because the plan was malformed would drop the
 * check precisely when something is already wrong.
 */
function loadCreativeBrief(root: string, edl: PlatformEDL): CreativeBrief | undefined {
  const storyPlanPath = join(root, 'story-plans', `${edl.storyPlanId}.json`);
  if (!existsSync(storyPlanPath)) return undefined;
  const story = readContractJson<MasterStoryPlan>(
    storyPlanPath,
    contractSchemaId('master-story-plan-v1'),
    'STORY_PLAN_INVALID',
    `MasterStoryPlan ${edl.storyPlanId}`,
  );
  const briefPath = join(root, 'creative-briefs', `${story.creativeBriefId}.json`);
  if (!existsSync(briefPath)) return undefined;
  return readContractJson<CreativeBrief>(
    briefPath,
    contractSchemaId('creative-brief-v1'),
    'CREATIVE_BRIEF_INVALID',
    `CreativeBrief ${story.creativeBriefId}`,
  );
}

function loadStyleProfile(root: string, jobBrief: JobBrief, styleProfilePath?: string | null): StyleProfile | undefined {
  // Through `@cutdown/style`, not a bare `JSON.parse`. Three things were wrong with
  // the parse: the shipped profiles are YAML, so `--style-profile
  // data/style-profiles/<acct>.yaml` — the documented invocation — never parsed at all;
  // nothing validated the result against `style-profile-v1`, so a malformed profile
  // silently contributed zero prohibitedClaims to a BLOCKING gate; and the echoed
  // SyntaxError quoted the file's first bytes back to a caller who chose the path.
  if (styleProfilePath) return loadStyleProfileFile(styleProfilePath);
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
  // Two DIFFERENT classes of path, and the round-3 fix wrongly treated them as one.
  //
  // `recordedModelPath` and `boundsPath` are RECORDED-FIXTURE overrides for offline
  // runs whose only documented home is `skills/validate/fixtures/`, so containment to
  // the skill directory is exactly right — unbounded, they named any file on the
  // machine and the echoed parse failure quoted its first bytes.
  //
  // `styleProfilePath` is NOT one of those. It is a documented production option
  // (`cutdown validate --style-profile <file>`), its real profiles ship at
  // `cutdown/data/style-profiles/*.yaml`, and its prohibitedClaims feed the BLOCKING
  // prohibited-claim gate. Containing it to the skill directory refused every real
  // profile with `PATH_ESCAPES_ROOT`, so the gate ran with fewer prohibitions than the
  // brand declares — a guard that broke the ordinary path, which is the Phase-4 lesson
  // this project already wrote down. Its oracle is closed the other way instead: the
  // load goes through `@cutdown/style`, which validates against `style-profile-v1` and
  // reports no instance values.
  if (request.boundsPath) assertContained(ctx.skillDir, request.boundsPath, 'The bounds path');
  if (request.recordedModelPath) assertContained(ctx.skillDir, request.recordedModelPath, 'The recorded model path');

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
  // `reviews/gates/`, NOT `reviews/`.
  //
  // tech-spec §9.1 documents `reviews/` as holding "ReviewDecision records from
  // `cutdown approve`", and these are gate reports, not decisions — writing them there
  // has been a spec violation since Phase 3. It became an outage in Phase 5: the
  // decision resolver reads that directory, so every validated job carried two
  // non-decision files and the fail-closed `indeterminate` arm then barred it from
  // ever reaching a final render or a package.
  //
  // A subdirectory keeps the gate result associated with review (it IS review
  // material, alongside `reviews/pending/`) while putting it outside the namespace
  // `approve` owns. Still built through the resolver: these are WRITES, and
  // `writeJsonAtomic` mkdir -p's the parent, so a traversing id would create
  // directories in another job as a side effect of validating.
  const gatePathAbs = resolveJobRelative(root, `reviews/gates/${request.edlId}-gate.json`, 'The gate output path');
  const criticPathAbs = resolveJobRelative(root, `reviews/gates/${request.edlId}-critic.json`, 'The critic output path');
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
