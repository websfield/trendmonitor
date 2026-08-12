import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ulid } from 'ulid';

import {
  assertContained,
  assertSafeId,
  contractValidator,
  fail,
  formatAjvErrors,
  jobDir,
  runSkillMain,
  skillEnvelope,
  writeJsonAtomic,
  type SkillContext,
} from '@cutdown/skill-runtime';
import { PLATFORM_EDL_SCHEMA_VERSION } from '@cutdown/contracts';
import {
  ModelGateway,
  ModelNotConfiguredError,
  applyEdlConstraints,
  buildRevisePrompt,
  loadConfig,
  selectTarget,
  validateInterpretation,
  type InterpretedNote,
  type ReviseConstraint,
  type Transport,
  type TransportResponse,
} from '@cutdown/editorial';
import type { PlatformEdlV1, RenderV1, RenderV2 } from '@cutdown/contracts/generated';

/**
 * `revise` — the narrowest change that satisfies a reviewer's note
 * (REQ-039 / REQ-112 / REQ-113).
 *
 * The skill is a thin shell over `@cutdown/editorial`'s revision engine, and the
 * division is the point: the model interprets prose into constraints, deterministic
 * code decides which object gets rewritten, and this file does the I/O. Nothing
 * here reads `index/` or `moments/` — REQ-039's "reusing unchanged source indexes"
 * is satisfied by not having the code path at all rather than by choosing not to
 * take it.
 */

type PlatformEDL = PlatformEdlV1.PlatformEDL;
// Both majors flow through this reader (Stage 0B-3, D-62): v1 records on disk
// and v2 records from the constant-stamped producer. The two generated types are
// structurally identical (v2 only adds patterns, which types cannot carry), but
// the union states what is actually read.
type Render = RenderV1.Render | RenderV2.Render;

const SKILL = 'revise';
const VERSION = '1.0.0';
const TEMPLATE_ID = 'revise-interpret';
const EDL_SCHEMA_ID = 'https://cutdown.local/contracts/schemas/platform-edl-v1.json';

interface ReviseRequest {
  jobId: string;
  renderId: string;
  notes: string;
  recordedModelPath?: string | null;
}

interface ConstraintOut {
  kind: string;
  subject: string;
  instruction: string;
  sourceText: string;
}

type ReviseResult =
  | {
      kind: 'revised';
      jobId: string;
      target: 'platform-edl' | 'master-story-plan' | 'creative-brief';
      targetRationale: string;
      newObjectId: string;
      parentObjectId: string;
      objectPath: string;
      constraints: ConstraintOut[];
      applied: { kind: string; subject: string; change: string }[];
      unapplied: { kind: string; subject: string; reason: string }[];
      reindexed: false;
    }
  | { kind: 'needs_confirmation'; jobId: string; unresolved: string[]; constraints: ConstraintOut[] }
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
  // Contained to THIS SKILL's directory, which is where its fixtures live
  // (`skills/revise/fixtures/`) and is the field's only documented use. The field is
  // a caller-supplied path that reaches `readFileSync`, so unconstrained it is an
  // arbitrary-file read; the workspace root would be the looser bound and the skill
  // directory is the accurate one.
  assertContained(ctx.skillDir, recordedPath, 'The recorded model path');
  if (!existsSync(recordedPath)) throw fail('RECORDED_MODEL_MISSING', `No recorded model response at ${recordedPath}.`);
  const parsed = JSON.parse(readFileSync(recordedPath, 'utf8')) as { responses?: unknown[] };
  if (!Array.isArray(parsed.responses)) {
    throw fail('RECORDED_MODEL_INVALID', `${recordedPath} must carry a "responses" array of provider responses.`);
  }
  const responses: TransportResponse[] = parsed.responses.map((r) => ({ status: 200, body: JSON.stringify(r) }));
  const config = loadConfig({
    envFile: join(ctx.workspaceRoot, '.env'),
    environ: { ANTHROPIC_API_KEY: 'sk-ant-recorded-fixture', CUTDOWN_SPEND_CEILING_AUD: '1' },
  });
  return new ModelGateway(config, new RecordedTransport(responses));
}

/** The render the note is about, and the EDL it realises. */
function loadRenderAndEdl(root: string, renderId: string): { render: Render; edl: PlatformEDL } {
  for (const tier of ['draft', 'final'] as const) {
    const tierRoot = join(root, 'renders', tier);
    if (!existsSync(tierRoot)) continue;
    for (const manifestDir of readdirSync(tierRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      const renderPath = join(tierRoot, manifestDir, 'render.json');
      if (!existsSync(renderPath)) continue;
      const render = JSON.parse(readFileSync(renderPath, 'utf8')) as Render;
      if (render.renderId !== renderId) continue;
      // Read out of an artefact with a bare cast, then joined — the same id
      // `package` guards. the render contract (both majors) types it as a Ulid, so a value that fails this
      // is a corrupt artefact, not a legitimate one.
      assertSafeId(render.edlId, 'The EDL id on the render record');
      const edlPath = join(root, 'edl', `${render.edlId}.json`);
      if (!existsSync(edlPath)) {
        throw fail(
          'EDL_NOT_FOUND',
          `Render ${renderId} realises EDL ${render.edlId}, which is not committed in this job. There is nothing to revise.`,
        );
      }
      return { render, edl: JSON.parse(readFileSync(edlPath, 'utf8')) as PlatformEDL };
    }
  }
  throw fail(
    'RENDER_NOT_FOUND',
    `No render with id ${renderId} exists in job ${root.split(/[\\/]/).pop() ?? ''}. A note is always about a cut somebody watched.`,
    { renderId },
  );
}

const asOut = (constraints: readonly ReviseConstraint[]): ConstraintOut[] =>
  constraints.map((c) => ({ kind: c.kind, subject: c.subject, instruction: c.instruction, sourceText: c.sourceText }));

async function run(request: ReviseRequest, ctx: SkillContext): Promise<ReviseResult> {
  const root = jobDir(ctx.workspaceRoot, request.jobId);
  assertSafeId(request.renderId, 'Render id');
  const { edl } = loadRenderAndEdl(root, request.renderId);

  const recorded = request.recordedModelPath ?? null;
  let gateway: ModelGateway;
  if (recorded !== null) {
    gateway = recordedGateway(recorded, ctx);
  } else {
    const config = loadConfig({ envFile: join(ctx.workspaceRoot, '.env') });
    if (!config.isEnabled) {
      // The expected Phase 0 state (D-21's ceiling is owner-set and unset). A clean
      // skip, exit 0 — never a partial revision and never a paid call by default.
      return {
        kind: 'skipped',
        code: 'MODEL_NOT_CONFIGURED',
        reason: config.unconfiguredReason() ?? 'the editorial gateway is not configured.',
      };
    }
    gateway = new ModelGateway(config);
  }

  const prompt = buildRevisePrompt({ notes: request.notes, edl });

  let interpreted: InterpretedNote;
  try {
    // The gateway's `Validator<T>` signals rejection by THROWING, and catches the
    // throw to drive its single repair retry (D-32). The thrown message is what the
    // retry shows the model, so it carries the violation list verbatim rather than
    // a generic "invalid" — a repair attempt told only that it failed repeats itself.
    const result = await gateway.completeJson<InterpretedNote>({
      system: prompt.system,
      content: prompt.content,
      promptTemplateId: TEMPLATE_ID,
      validate: (candidate: unknown): InterpretedNote => {
        const checked = validateInterpretation(candidate, request.notes, edl);
        if (checked.kind === 'invalid') {
          throw new Error(
            `the interpretation is not usable: ${checked.violations
              .map((v) => `constraint ${String(v.index)}: ${v.problem}`)
              .join('; ')}`,
          );
        }
        return checked.interpreted;
      },
    });
    interpreted = result.data;
  } catch (error) {
    if (error instanceof ModelNotConfiguredError) {
      return { kind: 'skipped', code: 'MODEL_NOT_CONFIGURED', reason: error.message };
    }
    throw error;
  }

  const { constraints, unresolved } = interpreted;

  // REQ-112: ambiguity is a refusal, not a guess. Unresolved fragments come FIRST
  // — a note that is half-understood must not be half-applied, because the half
  // that was applied is a change to an approved cut nobody asked for.
  if (unresolved.length > 0) {
    return { kind: 'needs_confirmation', jobId: request.jobId, unresolved: [...unresolved], constraints: asOut(constraints) };
  }
  if (constraints.length === 0) {
    return {
      kind: 'needs_confirmation',
      jobId: request.jobId,
      unresolved: [request.notes],
      constraints: [],
    };
  }

  const selection = selectTarget(constraints);
  if (selection === null) {
    throw fail('NO_REVISION_TARGET', 'The interpreted constraints resolved to no revision target, which should be impossible for a non-empty constraint list.');
  }

  // Phase 0 regenerates the EDL deterministically. The wider two targets need a
  // re-plan (a story-plan or brief regeneration through `propose`/`plan`), which is
  // a different model call and a different skill — so they are REFUSED here with
  // the next command named, rather than half-performed.
  if (selection.target !== 'platform-edl') {
    throw fail(
      'REVISION_TARGET_NOT_IMPLEMENTED',
      `This note requires regenerating the ${selection.target}: ${selection.rationale} ` +
        `Phase 0's \`revise\` regenerates the PlatformEDL only; a wider revision goes back through ` +
        `${selection.target === 'creative-brief' ? '`cutdown propose`' : '`cutdown plan`'} so the model call that owns that object makes it. ` +
        `Refused rather than approximated — a partial wide revision would leave the objects disagreeing about the same cut.`,
      { target: selection.target, constraints: asOut(constraints) },
    );
  }

  const newEdlId = ulid();
  // The child gets a FRESH envelope and THIS call's model provenance. Spreading the
  // parent's would make the revision claim it was created by `plan` at the parent's
  // timestamp, and the interpretation call that produced it would appear nowhere —
  // while `package` copies `modelProvenance` straight into the delivered package.
  const revised = applyEdlConstraints(edl, constraints, newEdlId, {
    // A revised EDL preserves clips (including D-52 transitions), so it is a
    // platform-edl instance at the CURRENT contract version, not 1.0.0.
    envelope: skillEnvelope(SKILL, VERSION, PLATFORM_EDL_SCHEMA_VERSION),
    modelProvenance: {
      provider: gateway.config.provider,
      modelId: gateway.config.modelId,
      promptTemplateId: TEMPLATE_ID,
      promptTemplateVersion: VERSION,
    },
  });

  // Nothing changed? Say so rather than committing a revision that differs from
  // its parent only by id — a lineage full of no-op revisions makes the real ones
  // impossible to find.
  if (revised.applied.length === 0) {
    return {
      kind: 'needs_confirmation',
      jobId: request.jobId,
      unresolved: [
        `None of the interpreted constraints could be applied to EDL ${edl.edlId}: ` +
          revised.unapplied.map((u) => `${u.kind} on ${u.subject} (${u.reason})`).join('; '),
      ],
      constraints: asOut(constraints),
    };
  }

  const validate = contractValidator().getSchema(EDL_SCHEMA_ID);
  if (validate === undefined) throw fail('EDL_SCHEMA_MISSING', `${EDL_SCHEMA_ID} is not registered; the revision cannot be validated.`);
  if (!validate(revised.edl)) {
    throw fail(
      'REVISED_EDL_SCHEMA_INVALID',
      `The revised EDL does not satisfy platform-edl-v1: ${formatAjvErrors(validate.errors)}. The original EDL is untouched.`,
    );
  }

  // Written to a NEW file. The parent stays exactly as it was — REQ-113 requires a
  // previously approved version to remain reproducible, and an in-place mutation
  // would make every review decision naming it describe something else.
  const objectPath = `edl/${newEdlId}.json`;
  writeJsonAtomic(join(root, 'edl', `${newEdlId}.json`), revised.edl);

  return {
    kind: 'revised',
    jobId: request.jobId,
    target: 'platform-edl',
    targetRationale: selection.rationale,
    newObjectId: newEdlId,
    parentObjectId: edl.edlId,
    objectPath,
    constraints: asOut(constraints),
    applied: [...revised.applied],
    unapplied: [...revised.unapplied],
    // Not a claim this skill has to be trusted on: `reindexed` is `const: false`
    // in the output schema, so a re-indexing revision could not be written down.
    reindexed: false,
  };
}

await runSkillMain<ReviseRequest, ReviseResult>({
  name: SKILL,
  version: VERSION,
  inputSchema: './schema/input.json',
  outputSchema: './schema/output.json',
  run,
});
