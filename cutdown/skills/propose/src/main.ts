import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ulid } from 'ulid';

import {
  assertContained,
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
  assessFootageSufficiency,
  buildProposePrompt,
  computeDistinctness,
  embedQuery,
  loadConfig,
  rankMoments,
  validateProposedCreativeBriefs,
  type QueryVector,
  type RankedMoment,
  type Transport,
  type TransportResponse,
} from '@cutdown/editorial';
import type { CreativeBriefV1, JobBriefV1, MomentV1 } from '@cutdown/contracts/generated';

type JobBrief = JobBriefV1.JobBrief;
type Moment = MomentV1.Moment;
type CreativeBrief = CreativeBriefV1.CreativeBrief;

const SKILL = 'propose';
const VERSION = '1.0.0';
const PROMPT_TEMPLATE_ID = 'propose-angles';
const PROMPT_TEMPLATE_VERSION = '1.0.0';

interface ProposeRequest {
  jobId: string;
  variants: number;
  recordedModelPath?: string | null;
  queryVectorPath?: string | null;
}

type ProposeResult =
  | { kind: 'briefs'; jobId: string; count: number; briefs: Array<{ creativeBriefId: string; path: string; semanticAngleLabel: string; sharedMomentFraction: number }> }
  | { kind: 'refusal'; jobId: string; missing: string[]; narrowerSuggestion: string; feasibleVariants?: number }
  | { kind: 'skipped'; code: 'MODEL_NOT_CONFIGURED'; reason: string };

/** Replays recorded provider responses over the gateway's injected transport — no network. */
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

/** Build a gateway that replays a recorded provider-response file (`{responses:[...]}`). */
function recordedGateway(recordedPath: string, ctx: SkillContext): ModelGateway {
  if (!existsSync(recordedPath)) throw fail('RECORDED_MODEL_MISSING', `No recorded model response at ${recordedPath}.`);
  const parsed = JSON.parse(readFileSync(recordedPath, 'utf8')) as { responses?: unknown[] };
  if (!Array.isArray(parsed.responses)) throw fail('RECORDED_MODEL_INVALID', `${recordedPath} must carry a "responses" array of provider responses.`);
  const responses: TransportResponse[] = parsed.responses.map((r) => ({ status: 200, body: JSON.stringify(r) }));
  const config = loadConfig({
    envFile: join(ctx.workspaceRoot, '.env'),
    environ: { ANTHROPIC_API_KEY: 'sk-ant-recorded-fixture', CUTDOWN_SPEND_CEILING_AUD: '1' },
  });
  return new ModelGateway(config, new RecordedTransport(responses));
}

/** The newest JobBrief committed for a job (ULIDs sort by time). */
function loadJobBrief(root: string): JobBrief {
  const dir = join(root, 'brief');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  const latest = files.at(-1);
  if (!latest) throw fail('BRIEF_NOT_FOUND', `Job has no committed JobBrief in ${dir}; run \`cutdown brief\` first.`);
  return JSON.parse(readFileSync(join(dir, latest), 'utf8')) as JobBrief;
}

/** Every Moment committed for a job — each `moments-*.json` file is a JSON array. */
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

function loadQueryVector(path: string): QueryVector {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<QueryVector>;
  if (typeof parsed.model !== 'string' || typeof parsed.modelVersion !== 'string' || typeof parsed.dimensions !== 'number' || !Array.isArray(parsed.vector)) {
    throw reject('QUERY_VECTOR_INVALID', `${path} must be {model, modelVersion, dimensions, vector}.`);
  }
  return { model: parsed.model, modelVersion: parsed.modelVersion, dimensions: parsed.dimensions, vector: parsed.vector as number[] };
}

/** The retrieval query text derived deterministically from the brief. */
function queryText(brief: JobBrief): string {
  return `${brief.contentPromise} ${brief.audience} ${brief.objective}`;
}

/**
 * The gateway validator: assemble the model's angles into full CreativeBriefs,
 * compute distinctness in code (REQ-031), and validate every one against
 * creative-brief-v1 + Moment-id integrity (REQ-034). A throw here triggers D-32's
 * single repair retry; anything returned is trusted as a validated brief set.
 */
function assembleBriefs(
  parsed: unknown,
  args: { brief: JobBrief; variants: number; inputMomentIds: ReadonlySet<string>; provider: string; modelId: string; jobId: string },
): CreativeBrief[] {
  const record = parsed as { angles?: unknown };
  if (!Array.isArray(record.angles)) throw new Error('response must be a JSON object {"angles": [...]}.');
  if (record.angles.length !== args.variants) {
    throw new Error(`expected exactly ${args.variants} angle(s), got ${record.angles.length}.`);
  }

  const angles = record.angles as Array<Record<string, unknown>>;
  const distinctness = computeDistinctness(
    angles.map((a, i) => ({
      label: `angle-${i + 1}`,
      selectedMomentIds: Array.isArray(a['selectedMoments']) ? (a['selectedMoments'] as Array<{ momentId?: unknown }>).map((m) => String(m.momentId)) : [],
      semanticAngleLabel: typeof a['semanticAngleLabel'] === 'string' ? (a['semanticAngleLabel'] as string) : `angle-${i + 1}`,
    })),
  );

  const candidates: CreativeBrief[] = angles.map((angle, i) => ({
    creativeBriefId: ulid(),
    envelope: skillEnvelope(SKILL, VERSION),
    jobId: args.jobId,
    sourceBriefId: args.brief.briefId,
    parentCreativeBriefId: null,
    audiencePromise: angle['audiencePromise'] as string,
    creativeThesis: angle['creativeThesis'] as string,
    hookFamily: angle['hookFamily'] as CreativeBrief['hookFamily'],
    narrativeArchetype: angle['narrativeArchetype'] as string,
    value: angle['value'] as string,
    proofPoints: angle['proofPoints'] as CreativeBrief['proofPoints'],
    selectedMoments: angle['selectedMoments'] as CreativeBrief['selectedMoments'],
    cta: angle['cta'] as CreativeBrief['cta'],
    distinctness: distinctness[i]?.distinctness ?? { peerBriefLabels: [], sharedMomentFraction: 0, semanticAngleLabel: `angle-${i + 1}` },
    knownLimitations: (angle['knownLimitations'] as string[] | undefined) ?? [],
    modelProvenance: { provider: args.provider, modelId: args.modelId, promptTemplateId: PROMPT_TEMPLATE_ID, promptTemplateVersion: PROMPT_TEMPLATE_VERSION },
  }));

  const validation = validateProposedCreativeBriefs(candidates, args.inputMomentIds);
  if (!validation.ok) {
    throw new Error(`proposed briefs failed validation: ${validation.violations.map((v) => `[${v.code}] ${v.message}`).join(' | ')}`);
  }

  // Plannability (REQ-034 downstream): `plan` may only cut an angle's OWN
  // selectedMoments, and the D-37 required-evidence gate then blocks an EDL
  // missing ANY cited evidence Moment — so evidence outside selectedMoments is a
  // brief that can never pass the gate. Reject it here, where the repair retry
  // can still fix it, instead of minting a dead-on-arrival artefact (a live run
  // reached the gate before this check existed).
  for (const [i, cb] of candidates.entries()) {
    const selected = new Set(cb.selectedMoments.map((m) => m.momentId));
    const strays = [...new Set(cb.proofPoints.flatMap((p) => p.evidenceMomentIds).filter((id) => !selected.has(id)))].sort();
    if (strays.length > 0) {
      throw new Error(
        `angle ${i + 1}: proofPoint evidenceMomentIds [${strays.join(', ')}] are not in that angle's selectedMoments; every evidence Moment must also be a selected Moment or the EDL can never realise it.`,
      );
    }
  }
  return candidates;
}

async function run(request: ProposeRequest, ctx: SkillContext): Promise<ProposeResult> {
  const root = jobDir(ctx.workspaceRoot, request.jobId);
  const brief = loadJobBrief(root);
  const moments = loadMoments(root);
  const variants = request.variants;

  // No footage at all: refuse immediately (never spawn an embedder against nothing).
  const sufficiencyBrief: JobBrief = { ...brief, variantCount: variants };
  if (moments.length === 0) {
    const decision = assessFootageSufficiency(sufficiencyBrief, []);
    if (decision.sufficient) throw fail('SUFFICIENCY_INCONSISTENT', 'no moments but sufficiency reported true.');
    return { kind: 'refusal', jobId: request.jobId, missing: decision.missing, narrowerSuggestion: decision.narrowerSuggestion };
  }

  // Rank against the brief. A query vector may be supplied (offline/tests) or computed by Python.
  // Contained to the skill directory, matching `revise`. These are RECORDED-FIXTURE
  // overrides for offline runs — the only documented use is `skills/<name>/fixtures/`
  // — and unbounded they let a caller name any file on the machine, whose parse
  // failure was then echoed back with the first bytes of content quoted: a file-read
  // oracle demonstrated against `cutdown/.env`. Neither the containment nor the
  // silenced parser message is optional; each closes half of it.
  if (request.queryVectorPath) assertContained(ctx.skillDir, request.queryVectorPath, 'The query vector path');
  if (request.recordedModelPath) assertContained(ctx.skillDir, request.recordedModelPath, 'The recorded model path');

  const query = request.queryVectorPath ? loadQueryVector(request.queryVectorPath) : embedQuery(queryText(brief));
  let ranked: RankedMoment[];
  try {
    ranked = rankMoments(query.vector, moments, { queryModel: { model: query.model, modelVersion: query.modelVersion } });
  } catch (err) {
    throw fail('RETRIEVAL_FAILED', `ranking refused: ${(err as Error).message}`);
  }

  const decision = assessFootageSufficiency(sufficiencyBrief, ranked);
  if (!decision.sufficient) {
    const rankable = ranked.filter((r) => r.score !== null).length;
    return { kind: 'refusal', jobId: request.jobId, missing: decision.missing, narrowerSuggestion: decision.narrowerSuggestion, feasibleVariants: Math.max(0, Math.floor(rankable / 2)) };
  }

  // Choose the gateway: recorded replay for tests, else the configured live gateway.
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

  const inputMomentIds = new Set(moments.map((m) => m.momentId));
  const prompt = buildProposePrompt({ brief: sufficiencyBrief, rankedMoments: ranked });

  let briefs: CreativeBrief[];
  try {
    const result = await gateway.completeJson<CreativeBrief[]>({
      system: prompt.system,
      content: prompt.content,
      promptTemplateId: PROMPT_TEMPLATE_ID,
      validate: (parsed) =>
        assembleBriefs(parsed, {
          brief,
          variants,
          inputMomentIds,
          provider: gateway.config.provider,
          modelId: gateway.config.modelId,
          jobId: request.jobId,
        }),
    });
    briefs = result.data;
  } catch (err) {
    if (err instanceof ModelNotConfiguredError) {
      return { kind: 'skipped', code: 'MODEL_NOT_CONFIGURED', reason: err.message };
    }
    // No retry claim here: firstText/transport failures throw BEFORE the repair
    // loop runs; the gateway's own schema error already says "after one repair
    // retry" in the one case where that is true.
    throw fail('PROPOSE_MODEL_FAILED', `the model proposal was unusable: ${(err as Error).message}`);
  }

  const written = briefs.map((cb) => {
    const path = join(root, 'creative-briefs', `${cb.creativeBriefId}.json`);
    writeJsonAtomic(path, cb);
    return {
      creativeBriefId: cb.creativeBriefId,
      path: relative(root, path).split('\\').join('/'),
      semanticAngleLabel: cb.distinctness.semanticAngleLabel,
      sharedMomentFraction: cb.distinctness.sharedMomentFraction,
    };
  });

  return { kind: 'briefs', jobId: request.jobId, count: written.length, briefs: written };
}

await runSkillMain<ProposeRequest, ProposeResult>({
  name: SKILL,
  version: VERSION,
  inputSchema: './schema/input.json',
  outputSchema: './schema/output.json',
  run,
});
