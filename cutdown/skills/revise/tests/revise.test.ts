import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';

/**
 * The `revise` skill through its real argv entrypoint (tech-spec §6.2), driven by
 * RECORDED model responses (tech-spec §6.6 constrained fixtures) — no test here
 * touches a socket.
 *
 * Three properties carry REQ-039/112/113 and each has a test that can fail:
 *
 *   1. **Narrowness.** A caption-level note must not spawn a new CreativeBrief.
 *      Proven by lineage evidence on disk, not by reading the result's own claim.
 *   2. **No re-index.** The index and Moment artefacts are byte- and mtime-identical
 *      across a revision. This is the assertion, not the docstring.
 *   3. **Lineage.** The parent EDL is untouched and the child names it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(here, '..', '..');
const ENTRY = join(SKILL_DIR, 'dist', 'src', 'main.js');
const FIXTURES = join(SKILL_DIR, 'fixtures', 'revise');

const JOB_ID = 'revise-skill-test';
const ASSET_ID = '01KY2C5WZM38M23VRGB7H7WFV3';
const EDL_ID = '01J9ED2B3C4D5E6F7G8H9K0M6T';
const MOMENT_A = '01J9MN2B3C4D5E6F7G8H9K0M1A';
const MOMENT_B = '01J9MN2B3C4D5E6F7G8H9K0M2B';
const RENDER_ID = '01J9RD2B3C4D5E6F7G8H9K0N2B';
const MANIFEST_ID = '01J9RM2B3C4D5E6F7G8H9K0N1A';

const CAPTION_NOTE = 'The pacing is fine but the caption on the opening clip reads oddly.';
const AMBIGUOUS_NOTE = 'Not sure — make it punchier somehow.';
const WIDE_NOTE = 'Honestly the whole angle is wrong for this audience.';

let workspace: string;
let jobDir: string;
let requestCounter = 0;

interface Invocation {
  status: number;
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
}

function invoke(request: unknown): Invocation {
  requestCounter += 1;
  const inputPath = join(workspace, `request-${String(requestCounter)}.json`);
  const outputPath = `${inputPath}.out.json`;
  writeFileSync(inputPath, JSON.stringify(request));
  const run = spawnSync(process.execPath, [ENTRY, '--input', inputPath, '--output', outputPath], {
    encoding: 'utf8',
    cwd: SKILL_DIR,
    timeout: 120_000,
    shell: false,
    // CUTDOWN_WORKSPACE_ROOT points at the temp tree; the recorded gateway supplies
    // its own key and ceiling, so the real `.env` is never consulted for these.
    env: { ...process.env, CUTDOWN_WORKSPACE_ROOT: workspace },
  });
  if (run.error) throw run.error;
  const stderr = run.stderr ?? '';
  if ((run.status ?? 1) === 0) {
    return { status: 0, result: JSON.parse(readFileSync(outputPath, 'utf8')) as Record<string, unknown>, error: null };
  }
  const start = stderr.indexOf('{');
  ok(start >= 0, `expected a structured error on stderr, got: ${stderr.slice(0, 600)}`);
  ok(!stderr.includes('    at '), 'callers parse stderr; a stack trace breaks the contract');
  return { status: run.status ?? 1, result: null, error: JSON.parse(stderr.slice(start)) as { code: string; message: string } };
}

const envelope = {
  schemaVersion: '1.0.0',
  createdAt: '2026-07-30T00:00:00.000Z',
  createdBy: { kind: 'skill', skill: 'plan', skillVersion: '1.0.0' },
};

const clip = (order: number, clipId: string, momentId: string, caption: string) => ({
  clipId,
  order,
  momentId,
  assetId: ASSET_ID,
  sourceRange: { assetId: ASSET_ID, startTicks: order * 15360, endTicks: (order + 1) * 15360, timebase: { num: 1, den: 15360 } },
  narrativeFunction: order === 0 ? 'promise' : 'payoff',
  rationale: `slot ${String(order)}`,
  caption: { kind: 'text', displayText: caption },
});

function seedJob(): void {
  rmSync(jobDir, { recursive: true, force: true });
  for (const sub of ['edl', 'index', 'moments', 'creative-briefs', 'story-plans']) {
    mkdirSync(join(jobDir, sub), { recursive: true });
  }
  mkdirSync(join(jobDir, 'renders', 'draft', MANIFEST_ID), { recursive: true });

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
      targetDurationRange: { minSeconds: 5, maxSeconds: 60 },
      canvas: { width: 720, height: 1280, aspectRatio: '9:16' },
      aspectTreatment: { mode: 'letterbox', rationale: 'landscape source' },
      hookFamily: 'curiosity_first',
      clips: [clip(0, 'clip-1', MOMENT_A, 'it reads oddly here'), clip(1, 'clip-2', MOMENT_B, 'and here is the answer')],
      audioMode: 'native_audio_plan',
      disclosures: { paidPartnership: false, aiGeneratedOrAltered: false, ownedBusinessPromotion: true },
      metadata: { title: 'Revise test', description: null },
      coverFrame: { kind: 'none' },
      modelProvenance: { provider: 'anthropic', modelId: 'fixture', promptTemplateId: 'plan-edl', promptTemplateVersion: '1.0.0' },
    }),
  );

  writeFileSync(
    join(jobDir, 'renders', 'draft', MANIFEST_ID, 'render.json'),
    JSON.stringify({
      renderId: RENDER_ID,
      envelope,
      jobId: JOB_ID,
      edlId: EDL_ID,
      renderManifestId: MANIFEST_ID,
      tier: 'draft',
      releaseState: 'draft',
      outputPath: `renders/draft/${MANIFEST_ID}/output.mp4`,
    }),
  );

  // The artefacts a revision must NOT touch (REQ-039).
  writeFileSync(join(jobDir, 'index', 'source-index.json'), JSON.stringify({ sourceIndexId: 'idx', note: 'must survive untouched' }));
  writeFileSync(join(jobDir, 'moments', 'moments-a.json'), JSON.stringify([{ momentId: MOMENT_A }, { momentId: MOMENT_B }]));
  writeFileSync(join(jobDir, 'creative-briefs', '01J9CB2B3C4D5E6F7G8H9K0M1A.json'), JSON.stringify({ creativeBriefId: '01J9CB2B3C4D5E6F7G8H9K0M1A' }));
  writeFileSync(join(jobDir, 'story-plans', '01J9SP2B3C4D5E6F7G8H9K0M5S.json'), JSON.stringify({ storyPlanId: '01J9SP2B3C4D5E6F7G8H9K0M5S' }));
}

/** A snapshot of every artefact a revision must leave alone: content + mtime. */
function untouchableSnapshot(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const sub of ['index', 'moments', 'creative-briefs', 'story-plans']) {
    for (const file of readdirSync(join(jobDir, sub)).sort()) {
      const path = join(jobDir, sub, file);
      snapshot[`${sub}/${file}`] = `${readFileSync(path, 'utf8')}::${String(statSync(path).mtimeMs)}`;
    }
  }
  return snapshot;
}

const edlFiles = (): string[] => readdirSync(join(jobDir, 'edl')).sort();

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'cutdown-revise-skill-'));
  jobDir = join(workspace, 'project-data', 'jobs', JOB_ID);
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

beforeEach(() => {
  seedJob();
});

describe('narrowness: a caption note revises the EDL and nothing wider (REQ-039)', () => {
  it('regenerates the PlatformEDL, links its parent, and spawns no CreativeBrief', () => {
    const before = untouchableSnapshot();
    const result = invoke({
      jobId: JOB_ID,
      renderId: RENDER_ID,
      notes: CAPTION_NOTE,
      recordedModelPath: join(FIXTURES, 'recorded-caption-fix.json'),
    });
    strictEqual(result.status, 0, JSON.stringify(result.error));
    strictEqual(result.result?.['kind'], 'revised');
    strictEqual(result.result?.['target'], 'platform-edl');
    strictEqual(result.result?.['parentObjectId'], EDL_ID);
    strictEqual(result.result?.['reindexed'], false);

    // THE narrowness proof, taken from disk rather than from the result's claim:
    // a second EDL exists and the creative-briefs / story-plans directories are
    // exactly as they were.
    strictEqual(edlFiles().length, 2, 'a new EDL revision landed beside its parent');
    deepStrictEqual(
      untouchableSnapshot(),
      before,
      'no CreativeBrief, MasterStoryPlan, index or Moment artefact may be created, rewritten or even re-stamped by a caption fix',
    );

    // Lineage: the parent is untouched and still says what it said (REQ-113).
    const parent = JSON.parse(readFileSync(join(jobDir, 'edl', `${EDL_ID}.json`), 'utf8')) as {
      edlId: string;
      parentEdlId: null;
      clips: { clipId: string; caption: { displayText: string } }[];
    };
    strictEqual(parent.edlId, EDL_ID);
    strictEqual(parent.parentEdlId, null);
    strictEqual(parent.clips[0]?.caption.displayText, 'it reads oddly here', 'the approved cut is byte-for-byte what was approved');

    // The child carries the change and names its parent.
    const child = JSON.parse(
      readFileSync(join(jobDir, ...String(result.result?.['objectPath']).split('/')), 'utf8'),
    ) as { edlId: string; parentEdlId: string; envelope: { schemaVersion: string }; clips: { clipId: string; caption: { displayText: string } }[] };
    strictEqual(child.parentEdlId, EDL_ID);
    // The revised EDL is a platform-edl instance at the CURRENT contract
    // version (a revision preserves clips, including D-52 transitions). The
    // constant's drift test pins it to the schema; this pins the PRODUCER to
    // the constant, closing the silent-revert-to-default gap.
    strictEqual(child.envelope.schemaVersion, '1.1.0', 'revise must stamp PLATFORM_EDL_SCHEMA_VERSION');
    strictEqual(child.edlId, result.result?.['newObjectId']);
    strictEqual(child.clips[0]?.caption.displayText, 'Say it plainly: five minutes, start to finish');
    strictEqual(child.clips[1]?.caption.displayText, 'and here is the answer', 'the untouched clip is untouched');
  });

  it('shows the interpreted constraints with VERBATIM source text (REQ-112)', () => {
    const result = invoke({
      jobId: JOB_ID,
      renderId: RENDER_ID,
      notes: CAPTION_NOTE,
      recordedModelPath: join(FIXTURES, 'recorded-caption-fix.json'),
    });
    strictEqual(result.status, 0, JSON.stringify(result.error));
    const constraints = result.result?.['constraints'] as { kind: string; sourceText: string }[];
    strictEqual(constraints.length, 1);
    strictEqual(constraints[0]?.kind, 'caption_text');
    ok(
      CAPTION_NOTE.includes(constraints[0]?.sourceText ?? ' '),
      'a reviewer checking the interpretation checks it against their own words, so sourceText is a substring — not a paraphrase',
    );
    ok(String(result.result?.['targetRationale']).includes('caption_text'), 'the rationale cites the constraint that decided the target');
  });
});

describe('ambiguity is a refusal, not a guess (REQ-112)', () => {
  it('returns needs_confirmation and writes NO revision', () => {
    const result = invoke({
      jobId: JOB_ID,
      renderId: RENDER_ID,
      notes: AMBIGUOUS_NOTE,
      recordedModelPath: join(FIXTURES, 'recorded-ambiguous.json'),
    });
    strictEqual(result.status, 0, 'an unresolvable note is a RESULT, not a skill failure');
    strictEqual(result.result?.['kind'], 'needs_confirmation');
    deepStrictEqual(result.result?.['unresolved'], ['make it punchier']);
    strictEqual(edlFiles().length, 1, 'a half-understood note must not be half-applied to an approved cut');
  });
});

describe('a wide revision is refused, not half-performed', () => {
  it('refuses an angle-level note and names the command that owns that object', () => {
    const result = invoke({
      jobId: JOB_ID,
      renderId: RENDER_ID,
      notes: WIDE_NOTE,
      recordedModelPath: join(FIXTURES, 'recorded-wide-angle.json'),
    });
    strictEqual(result.status, 3);
    strictEqual(result.error?.code, 'REVISION_TARGET_NOT_IMPLEMENTED');
    ok(result.error?.message.includes('creative-brief'), 'the widened target is named');
    ok(result.error?.message.includes('cutdown propose'), 'and so is the skill that owns regenerating it');
    strictEqual(edlFiles().length, 1, 'nothing was written');
  });
});

describe('a model interpretation that cannot be checked is rejected', () => {
  it('exhausts the single repair retry on a PARAPHRASED sourceText and writes nothing (D-32)', () => {
    const before = untouchableSnapshot();
    const result = invoke({
      jobId: JOB_ID,
      renderId: RENDER_ID,
      notes: CAPTION_NOTE,
      recordedModelPath: join(FIXTURES, 'recorded-paraphrased-source.json'),
    });
    strictEqual(result.status, 3);
    ok(
      result.error?.message.includes('sourceText') || result.error?.message.includes('schema'),
      `expected the refusal to name the unverifiable interpretation, got: ${result.error?.message ?? ''}`,
    );
    strictEqual(edlFiles().length, 1, 'no partial write on a schema failure');
    deepStrictEqual(untouchableSnapshot(), before);
  });
});

describe('the gateway is not configured — the Phase 0 default', () => {
  it('skips cleanly with a reason rather than attempting a paid call', () => {
    // No `recordedModelPath`, and the temp workspace has no `.env`: the unset D-21
    // ceiling is the expected Phase 0 state, and it must degrade to a clean skip.
    const result = invoke({ jobId: JOB_ID, renderId: RENDER_ID, notes: CAPTION_NOTE });
    strictEqual(result.status, 0);
    strictEqual(result.result?.['kind'], 'skipped');
    strictEqual(result.result?.['code'], 'MODEL_NOT_CONFIGURED');
    strictEqual(edlFiles().length, 1);
  });
});

describe('a note about a render that does not exist', () => {
  it('refuses rather than revising the newest EDL it can find', () => {
    const result = invoke({
      jobId: JOB_ID,
      renderId: '01J9RD2B3C4D5E6F7G8H9K0ZZZ',
      notes: CAPTION_NOTE,
      recordedModelPath: join(FIXTURES, 'recorded-caption-fix.json'),
    });
    strictEqual(result.status, 3);
    strictEqual(result.error?.code, 'RENDER_NOT_FOUND');
    ok(result.error?.message.includes('somebody watched'), 'a note is always about a cut that was reviewed');
  });
});
