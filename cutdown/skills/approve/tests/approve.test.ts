import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  loadReviewDecisions,
  resolveApprovalForManifest,
  selectLatestDecision,
  type ApprovalResolution,
} from '@cutdown/contracts';

/**
 * The `approve` skill through its real argv entrypoint (tech-spec §6.2).
 *
 * Exercised as a subprocess rather than by importing `run()`, because the
 * behaviours that carry the guarantee are boundary behaviours: exit codes, a
 * structured error on stderr, and an immutable artefact on disk.
 *
 * The load-bearing cases are the refusals (D-9, D-35) and history preservation:
 * a second decision must never overwrite the first, and every reader must agree
 * on which one is in force.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(here, '..', '..');
const ENTRY = join(SKILL_DIR, 'dist', 'src', 'main.js');
const JOB_ID = 'approve-skill-test';

const DRAFT_MANIFEST = '01J9RM2B3C4D5E6F7G8H9K0N1A';
const DRAFT_RENDER = '01J9RD2B3C4D5E6F7G8H9K0N2B';
const FINAL_MANIFEST = '01J9RM2B3C4D5E6F7G8H9K0N9Z';
const FINAL_RENDER = '01J9RD2B3C4D5E6F7G8H9K0N9Z';
const EDL_ID = '01J9ED2B3C4D5E6F7G8H9K0M6T';
const PLAN_HASH = 'de1420980ea9dff6de1420980ea9dff6de1420980ea9dff6de1420980ea9dff6';
const DECISION_ID_ANON = '01J9RV2B3C4D5E6F7G8H9K0AN1';
const DECISION_ID_UNDATED = '01J9RV2B3C4D5E6F7G8H9K0ND1';
const DECISION_ID_OFFSET_APPROVE = '01J9RV2B3C4D5E6F7G8H9K0FS1';
const DECISION_ID_OFFSET_REJECT = '01J9RV2B3C4D5E6F7G8H9K0FS2';

let workspace: string;
let jobDir: string;
let requestCounter = 0;

interface Invocation {
  status: number;
  result: Record<string, unknown> | null;
  error: { code: string; message: string; details?: unknown } | null;
  /** Captured on BOTH paths — a successful run's warnings are the point (see `invoke`). */
  stderr: string;
}

function invoke(request: unknown): Invocation {
  requestCounter += 1;
  const inputPath = join(workspace, `request-${String(requestCounter)}.json`);
  const outputPath = `${inputPath}.out.json`;
  writeFileSync(inputPath, JSON.stringify(request));
  // `spawnSync`, not `execFileSync`. The latter returns stdout only, so a warning
  // written to stderr by a SUCCESSFUL run is invisible — and `approve` now emits
  // exactly that when a file in the decision namespace is unreadable. `render.test.ts`
  // had already named this trap in a comment, and the fix whose entire content is a
  // success-path stderr warning landed in the suite that still had it.
  const run = spawnSync(process.execPath, [ENTRY, '--input', inputPath, '--output', outputPath], {
    encoding: 'utf8',
    cwd: SKILL_DIR,
    timeout: 60_000,
    env: { ...process.env, CUTDOWN_WORKSPACE_ROOT: workspace },
  });
  const stderr = run.stderr ?? '';
  if (run.status === 0) {
    return {
      status: 0,
      result: JSON.parse(readFileSync(outputPath, 'utf8')) as Record<string, unknown>,
      error: null,
      stderr,
    };
  }
  const start = stderr.indexOf('{');
  ok(start >= 0, `expected a structured error on stderr, got: ${stderr.slice(0, 500)}`);
  ok(!stderr.includes('    at '), 'callers parse stderr; a stack trace breaks the contract');
  return {
    status: run.status ?? 1,
    result: null,
    error: JSON.parse(stderr.slice(start)) as { code: string; message: string },
    stderr,
  };
}

/** A render artefact plus its QA report, on disk where the skill will find them. */
function writeRender(opts: {
  tier: 'draft' | 'final';
  manifestId: string;
  renderId: string;
  gateStatus?: 'pass' | 'pass_with_waivers' | 'fail';
  findings?: { findingId: string; checkId: string; severity: 'blocker' | 'warning' | 'info' }[];
  omitReport?: boolean;
}): void {
  const dir = join(jobDir, 'renders', opts.tier, opts.manifestId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'render.json'),
    JSON.stringify({
      renderId: opts.renderId,
      jobId: JOB_ID,
      edlId: EDL_ID,
      renderManifestId: opts.manifestId,
      tier: opts.tier,
      releaseState: 'draft',
    }),
  );
  if (opts.omitReport === true) return;
  writeFileSync(
    join(dir, 'qa-report.json'),
    JSON.stringify({
      qaReportId: '01J9QR2B3C4D5E6F7G8H9K0N1A',
      jobId: JOB_ID,
      renderId: opts.renderId,
      renderManifestId: opts.manifestId,
      tier: opts.tier,
      gateStatus: opts.gateStatus ?? 'pass',
      findings: opts.findings ?? [],
      waiverIds: [],
      waivedFindingIds: [],
      planHash: { algorithm: 'sha256', value: PLAN_HASH },
    }),
  );
}

const reviewsDir = () => join(jobDir, 'reviews');
const decisionFiles = (): string[] => {
  try {
    return readdirSync(reviewsDir()).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
};

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'cutdown-approve-skill-'));
  jobDir = join(workspace, 'project-data', 'jobs', JOB_ID);
  mkdirSync(jobDir, { recursive: true });
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

beforeEach(() => {
  // Every test starts with no decisions, so history assertions are about what
  // the test itself recorded.
  rmSync(reviewsDir(), { recursive: true, force: true });
});

describe('what approve refuses (D-9, D-35)', () => {
  before(() => {
    writeRender({ tier: 'draft', manifestId: DRAFT_MANIFEST, renderId: DRAFT_RENDER });
    writeRender({ tier: 'final', manifestId: FINAL_MANIFEST, renderId: FINAL_RENDER });
  });

  it('rejects a request with no approver name — exit 2, not 3', () => {
    const result = invoke({ jobId: JOB_ID, draftRenderId: DRAFT_RENDER });
    strictEqual(result.status, 2, 'a missing required field is an INPUT failure (§6.2 exit 2)');
    strictEqual(result.error?.code, 'REQUEST_SCHEMA_INVALID');
    deepStrictEqual(decisionFiles(), [], 'a refused request writes nothing');
  });

  it('rejects a rejection with no reason — exit 2', () => {
    const result = invoke({ jobId: JOB_ID, draftRenderId: DRAFT_RENDER, decidedBy: 'Fred', reject: true });
    strictEqual(result.status, 2);
    strictEqual(result.error?.code, 'REJECTION_REASON_REQUIRED');
    ok(result.error?.message.includes('cutdown revise'), 'the refusal explains what consumes the reason');
    deepStrictEqual(decisionFiles(), []);
  });

  it('rejects a whitespace-only reason — a blank reason is no reason', () => {
    const result = invoke({
      jobId: JOB_ID,
      draftRenderId: DRAFT_RENDER,
      decidedBy: 'Fred',
      reject: true,
      reason: '   ',
    });
    strictEqual(result.status, 2);
    strictEqual(result.error?.code, 'REJECTION_REASON_REQUIRED');
  });

  it('refuses an unknown render id', () => {
    const result = invoke({ jobId: JOB_ID, draftRenderId: '01J9RD2B3C4D5E6F7G8H9K0ZZZ', decidedBy: 'Fred' });
    strictEqual(result.status, 3);
    strictEqual(result.error?.code, 'RENDER_NOT_FOUND');
  });

  it('refuses to approve a FINAL render — approval is of a draft, or the ordering is circular', () => {
    const result = invoke({ jobId: JOB_ID, draftRenderId: FINAL_RENDER, decidedBy: 'Fred' });
    strictEqual(result.status, 3);
    strictEqual(result.error?.code, 'NOT_A_DRAFT_RENDER');
    ok(result.error?.message.includes('circular'));
    deepStrictEqual(decisionFiles(), []);
  });

  it('refuses to approve a draft whose QA gate refuses — a blocker is non-waivable by ANYONE', () => {
    const blockedRender = '01J9RD2B3C4D5E6F7G8H9K0B1K';
    writeRender({
      tier: 'draft',
      manifestId: '01J9RM2B3C4D5E6F7G8H9K0B1K',
      renderId: blockedRender,
      gateStatus: 'fail',
      findings: [{ findingId: 'source_range_validity:clip-1', checkId: 'source_range_validity', severity: 'blocker' }],
    });
    const result = invoke({ jobId: JOB_ID, draftRenderId: blockedRender, decidedBy: 'Fred' });
    strictEqual(result.status, 3);
    strictEqual(result.error?.code, 'DRAFT_QA_NOT_PASSED');
    ok(result.error?.message.includes('D-35'));
    ok(result.error?.message.includes('--reject'), 'the refusal names the outcome that IS available');
    deepStrictEqual(decisionFiles(), [], 'an approval nobody may give is never written');
  });

  it('refuses to approve a draft with no QA report at all — absence of evidence is not a pass', () => {
    const unjudged = '01J9RD2B3C4D5E6F7G8H9K0N7J';
    writeRender({ tier: 'draft', manifestId: '01J9RM2B3C4D5E6F7G8H9K0N7J', renderId: unjudged, omitReport: true });
    const result = invoke({ jobId: JOB_ID, draftRenderId: unjudged, decidedBy: 'Fred' });
    strictEqual(result.status, 3);
    strictEqual(result.error?.code, 'DRAFT_QA_NOT_PASSED');
  });

  it('refuses even a REJECTION when no QA report exists at all — and this is a real limit', () => {
    // Honest limitation, locked in rather than left implicit. A ReviewDecision must
    // carry `subjectPlanHash`, and the plan hash lives on the QA report — so with no
    // report there is nothing to scope the decision to, and recording one would mean
    // inventing the identity the decision attaches to. The render skill guarantees a
    // report beside every render, so reaching this state means something upstream is
    // broken and the fix is to re-render, not to record a decision about nothing.
    const unjudged = '01J9RD2B3C4D5E6F7G8H9K0N8N';
    writeRender({ tier: 'draft', manifestId: '01J9RM2B3C4D5E6F7G8H9K0N8N', renderId: unjudged, omitReport: true });
    const result = invoke({
      jobId: JOB_ID,
      draftRenderId: unjudged,
      decidedBy: 'Fred',
      reject: true,
      reason: 'Nothing was measured, so I am sending it back.',
    });
    strictEqual(result.status, 3);
    strictEqual(result.error?.code, 'QA_REPORT_MISSING');
    ok(result.error?.message.includes('re-run'), 'the refusal names the fix');
    deepStrictEqual(decisionFiles(), [], 'no decision is invented for a render nobody measured');
  });

  it('DOES let a reviewer reject a QA-failed draft — that is exactly what review is for', () => {
    const blockedRender = '01J9RD2B3C4D5E6F7G8H9K0B22';
    writeRender({
      tier: 'draft',
      manifestId: '01J9RM2B3C4D5E6F7G8H9K0B22',
      renderId: blockedRender,
      gateStatus: 'fail',
      findings: [{ findingId: 'caption_overflow:cue-2', checkId: 'caption_overflow', severity: 'warning' }],
    });
    const result = invoke({
      jobId: JOB_ID,
      draftRenderId: blockedRender,
      decidedBy: 'Fred',
      reject: true,
      reason: 'Captions overflow and the opening is slack.',
    });
    strictEqual(result.status, 0);
    strictEqual(result.result?.['outcome'], 'rejected');
    strictEqual(result.result?.['nextState'], 'revise');
    strictEqual(result.result?.['qaGateStatus'], 'fail', 'the failing verdict is recorded, not hidden');
  });
});

describe('an approval records the reviewed draft, its EDL and its manifest — and no package', () => {
  before(() => {
    writeRender({ tier: 'draft', manifestId: DRAFT_MANIFEST, renderId: DRAFT_RENDER });
  });

  it('writes a schema-valid ReviewDecision naming all four subjects', () => {
    const result = invoke({
      jobId: JOB_ID,
      draftRenderId: DRAFT_RENDER,
      decidedBy: 'Fred Wang',
      notes: 'Hook lands early; ship it.',
    });
    strictEqual(result.status, 0, JSON.stringify(result.error));
    strictEqual(result.result?.['outcome'], 'approved');
    strictEqual(result.result?.['nextState'], 'final-rendering');
    strictEqual(result.result?.['subjectDraftRenderId'], DRAFT_RENDER);
    strictEqual(result.result?.['subjectRenderManifestId'], DRAFT_MANIFEST);
    strictEqual(result.result?.['subjectEdlId'], EDL_ID);
    deepStrictEqual(result.result?.['supersededDecisionIds'], []);

    const decisionPath = join(jobDir, ...String(result.result?.['decisionPath']).split('/'));
    const decision = JSON.parse(readFileSync(decisionPath, 'utf8')) as Record<string, unknown>;

    strictEqual(decision['subjectDraftRenderId'], DRAFT_RENDER);
    strictEqual(decision['subjectEdlId'], EDL_ID);
    strictEqual(decision['subjectRenderManifestId'], DRAFT_MANIFEST);
    deepStrictEqual(decision['subjectPlanHash'], { algorithm: 'sha256', value: PLAN_HASH });
    strictEqual(decision['decidedBy'], 'Fred Wang');
    deepStrictEqual(decision['decision'], { outcome: 'approved', notes: 'Hook lands early; ship it.' });

    // D-9: the envelope attributes the decision to the HUMAN, never to this skill.
    const envelope = decision['envelope'] as { createdBy: { kind: string; name?: string } };
    strictEqual(envelope.createdBy.kind, 'human');
    strictEqual(envelope.createdBy.name, 'Fred Wang');

    // The structural half of "it cannot reference a future package": there is no
    // field for one, and the schema is closed.
    ok(
      !Object.keys(decision).some((key) => key.toLowerCase().includes('package')),
      'a decision that named a package would invert the lineage the exit criteria are computed over',
    );
  });

  it('names the ULID-shaped file after the decision, not after the manifest', () => {
    const result = invoke({ jobId: JOB_ID, draftRenderId: DRAFT_RENDER, decidedBy: 'Fred' });
    strictEqual(result.status, 0);
    strictEqual(
      result.result?.['decisionPath'],
      `reviews/${String(result.result?.['reviewDecisionId'])}.json`,
      'one file per DECISION is what makes history preservable — one file per manifest would have to be overwritten',
    );
  });
});

describe('duplicate and conflicting decisions preserve history', () => {
  before(() => {
    writeRender({ tier: 'draft', manifestId: DRAFT_MANIFEST, renderId: DRAFT_RENDER });
  });

  it('a second decision about the same draft is a NEW record that supersedes without deleting', () => {
    const first = invoke({ jobId: JOB_ID, draftRenderId: DRAFT_RENDER, decidedBy: 'Fred', notes: 'looks good' });
    strictEqual(first.status, 0);

    const second = invoke({
      jobId: JOB_ID,
      draftRenderId: DRAFT_RENDER,
      decidedBy: 'Bea',
      reject: true,
      reason: 'Second look: the claim at 3 s is not supported by the footage.',
    });
    strictEqual(second.status, 0);

    // Both files still exist — nothing was overwritten.
    strictEqual(decisionFiles().length, 2);
    deepStrictEqual(second.result?.['supersededDecisionIds'], [first.result?.['reviewDecisionId']]);

    // And the decision IN FORCE is the later one, whatever it says. An approval
    // does not outrank a subsequent rejection — a reviewer must be able to change
    // their mind, and the resolver is the single implementation every reader uses.
    const loaded = loadReviewDecisions(reviewsDir());
    strictEqual(loaded.decisions.length, 2);
    deepStrictEqual(loaded.rejected, []);
    const inForce = selectLatestDecision(loaded.decisions);
    strictEqual(inForce?.reviewDecisionId, second.result?.['reviewDecisionId']);
    strictEqual(inForce?.decision.outcome, 'rejected');
  });

  it('WARNS on a SUCCESSFUL approve when a namespace file is unreadable, and names the consequence', () => {
    // `approve` reads `loadReviewDecisions` and uses only `.decisions`, so
    // `supersededDecisionIds` can be computed from an incomplete set. It records the
    // human's decision anyway — D-9 reserves that act for a person, and a corrupt
    // neighbour must not block it — but it must SAY SO, because every other caller of
    // that module refuses outright and the operator needs to know a final render will.
    //
    // This test is why the harness above uses `spawnSync`: `execFileSync` returns
    // stdout only, so a warning from a SUCCESSFUL run was structurally invisible here.
    mkdirSync(reviewsDir(), { recursive: true });
    writeFileSync(join(reviewsDir(), '01J9RV2B3C4D5E6F7G8H9K0WN1.json'), '{ truncated');

    const outcome = invoke({ jobId: JOB_ID, draftRenderId: DRAFT_RENDER, decidedBy: 'Fred' });
    strictEqual(outcome.status, 0, `approve must still record the decision: ${outcome.stderr.slice(0, 400)}`);
    ok(
      outcome.stderr.includes('01J9RV2B3C4D5E6F7G8H9K0WN1.json'),
      'the warning names the file, so the operator can fix it',
    );
    ok(outcome.stderr.includes('INCOMPLETE'), 'and says the superseded set cannot be trusted');
    ok(outcome.stderr.includes('will refuse'), 'and names the consequence — a final render blocks until it is fixed');

    rmSync(join(reviewsDir(), '01J9RV2B3C4D5E6F7G8H9K0WN1.json'), { force: true });
  });

  it('selection is deterministic when two decisions share a decidedAt — the ULID breaks the tie', () => {
    // Hand-authored records with an identical timestamp: the pair (decidedAt,
    // reviewDecisionId) is a total order, so this cannot come down to directory
    // order, which would come down to the filesystem.
    mkdirSync(reviewsDir(), { recursive: true });
    const base = {
      envelope: {
        schemaVersion: '1.0.0',
        createdAt: '2026-07-30T05:00:00.000Z',
        createdBy: { kind: 'human', name: 'Fred' },
      },
      jobId: JOB_ID,
      subjectDraftRenderId: DRAFT_RENDER,
      subjectEdlId: EDL_ID,
      subjectRenderManifestId: DRAFT_MANIFEST,
      subjectPlanHash: { algorithm: 'sha256', value: PLAN_HASH },
      decidedBy: 'Fred',
      decidedAt: '2026-07-30T05:00:00.000Z',
    };
    const lower = '01J9RV2B3C4D5E6F7G8H9K0AAA';
    const higher = '01J9RV2B3C4D5E6F7G8H9K0ZZZ';
    // Written in the order that would give the WRONG answer if directory order
    // decided it.
    writeFileSync(
      join(reviewsDir(), `${higher}.json`),
      JSON.stringify({ ...base, reviewDecisionId: higher, decision: { outcome: 'approved', notes: null } }),
    );
    writeFileSync(
      join(reviewsDir(), `${lower}.json`),
      JSON.stringify({
        ...base,
        reviewDecisionId: lower,
        decision: { outcome: 'rejected', reason: 'earlier ULID', notes: null },
      }),
    );

    const inForce = selectLatestDecision(loadReviewDecisions(reviewsDir()).decisions);
    strictEqual(inForce?.reviewDecisionId, higher, 'the higher ULID wins the tie, both directions of write order');
  });

  it('a malformed file under reviews/ is REPORTED, never silently dropped', () => {
    // ULID-NAMED, because that is the namespace the resolver owns. A non-ULID name is
    // out of scope entirely (see the namespace suite below) — the "reported, never
    // silently dropped" property is about files that ARE candidate decisions.
    mkdirSync(reviewsDir(), { recursive: true });
    writeFileSync(join(reviewsDir(), '01J9RV2B3C4D5E6F7G8H9K0BD1.json'), '{"reviewDecisionId": "oops"}');
    writeFileSync(join(reviewsDir(), '01J9RV2B3C4D5E6F7G8H9K0BD2.json'), '{ not json');

    const loaded = loadReviewDecisions(reviewsDir());
    strictEqual(loaded.decisions.length, 0);
    strictEqual(loaded.rejected.length, 2);
    ok(loaded.rejected.some((r) => r.reason.includes('does not satisfy review-decision-v1')));
    ok(loaded.rejected.some((r) => r.reason.includes('not valid JSON')));
    // The distinction that matters: a caller must be able to tell "nobody
    // decided" from "a decision exists and is unreadable".
  });

  it('refuses an ANONYMOUS approval — the case a key-presence check let through', () => {
    // The reviewer's finding, locked in. The first cut checked only that eight keys
    // were `!== undefined`, so `decidedBy: null` passed and became "the approval in
    // force" — an unattributable approval, which is the one thing D-9 forbids. The
    // resolver now validates against the contract, which already forbade it.
    mkdirSync(reviewsDir(), { recursive: true });
    writeFileSync(
      join(reviewsDir(), `${DECISION_ID_ANON}.json`),
      JSON.stringify({
        reviewDecisionId: DECISION_ID_ANON,
        envelope: { schemaVersion: '1.0.0', createdAt: '2026-07-30T05:00:00.000Z', createdBy: { kind: 'human', name: 'x' } },
        jobId: JOB_ID,
        subjectDraftRenderId: DRAFT_RENDER,
        subjectEdlId: EDL_ID,
        subjectRenderManifestId: DRAFT_MANIFEST,
        subjectPlanHash: { algorithm: 'sha256', value: PLAN_HASH },
        decidedBy: null,
        decidedAt: '2026-07-30T05:00:00.000Z',
        decision: { outcome: 'approved', notes: null },
      }),
    );
    const loaded = loadReviewDecisions(reviewsDir());
    strictEqual(loaded.decisions.length, 0, 'an anonymous approval is not a decision');
    ok(loaded.rejected[0]?.reason.includes('decidedBy'));
    strictEqual(selectLatestDecision(loaded.decisions), null, 'so nothing is in force');
  });

  it('refuses a decision whose decidedAt is not an instant — it cannot be ordered', () => {
    mkdirSync(reviewsDir(), { recursive: true });
    writeFileSync(
      join(reviewsDir(), `${DECISION_ID_UNDATED}.json`),
      JSON.stringify({
        reviewDecisionId: DECISION_ID_UNDATED,
        envelope: { schemaVersion: '1.0.0', createdAt: '2026-07-30T05:00:00.000Z', createdBy: { kind: 'human', name: 'Fred' } },
        jobId: JOB_ID,
        subjectDraftRenderId: DRAFT_RENDER,
        subjectEdlId: EDL_ID,
        subjectRenderManifestId: DRAFT_MANIFEST,
        subjectPlanHash: { algorithm: 'sha256', value: PLAN_HASH },
        decidedBy: 'Fred',
        decidedAt: 'yesterday',
        decision: { outcome: 'approved', notes: null },
      }),
    );
    const loaded = loadReviewDecisions(reviewsDir());
    strictEqual(loaded.decisions.length, 0, 'an unorderable decision cannot be the one in force');
    ok(loaded.rejected.length === 1);
  });

  it('orders by INSTANT, so an offset timestamp cannot outrank a genuinely later one', () => {
    // THE reviewer BLOCK, as a test. `2026-07-31T04:00:00+10:00` is 18:00Z — earlier
    // than `2026-07-30T20:00:00Z` — but sorts LATER as a string. Under the original
    // lexical compare the approval won and a cut a named human rejected would have
    // been rendered final and delivered.
    mkdirSync(reviewsDir(), { recursive: true });
    const base = {
      envelope: { schemaVersion: '1.0.0', createdAt: '2026-07-30T05:00:00.000Z', createdBy: { kind: 'human', name: 'Fred' } },
      jobId: JOB_ID,
      subjectDraftRenderId: DRAFT_RENDER,
      subjectEdlId: EDL_ID,
      subjectRenderManifestId: DRAFT_MANIFEST,
      subjectPlanHash: { algorithm: 'sha256', value: PLAN_HASH },
      decidedBy: 'Fred',
    };
    writeFileSync(
      join(reviewsDir(), `${DECISION_ID_OFFSET_APPROVE}.json`),
      JSON.stringify({
        ...base,
        reviewDecisionId: DECISION_ID_OFFSET_APPROVE,
        decidedAt: '2026-07-31T04:00:00+10:00',
        decision: { outcome: 'approved', notes: null },
      }),
    );
    writeFileSync(
      join(reviewsDir(), `${DECISION_ID_OFFSET_REJECT}.json`),
      JSON.stringify({
        ...base,
        reviewDecisionId: DECISION_ID_OFFSET_REJECT,
        decidedAt: '2026-07-30T20:00:00Z',
        decision: { outcome: 'rejected', reason: 'decided later in real time', notes: null },
      }),
    );

    const inForce = selectLatestDecision(loadReviewDecisions(reviewsDir()).decisions);
    strictEqual(
      inForce?.decision.outcome,
      'rejected',
      'the 20:00Z rejection is genuinely later than the +10:00 approval (18:00Z) and must win',
    );
    strictEqual(inForce?.reviewDecisionId, DECISION_ID_OFFSET_REJECT);
  });
});

/**
 * The Phase 5 round-2 BLOCK, as a test.
 *
 * `rejectedFiles` lived only on the `none` arm, so when an approval resolved, an
 * UNREADABLE rejection was invisible — and render, package, the runner gate and
 * the runner gate all authorised a cut a human may have rejected. The round-1 Ajv
 * fix widened the window, because Ajv refuses strictly more files than the
 * key-presence check it replaced: an RFC-3339 leap second is contract-valid and
 * `Date.parse`-NaN.
 */
describe('an unreadable decision makes the whole resolution INDETERMINATE', () => {
  const writeDecision = (id: string, decidedAt: string, outcome: 'approved' | 'rejected'): void => {
    mkdirSync(reviewsDir(), { recursive: true });
    writeFileSync(
      join(reviewsDir(), `${id}.json`),
      JSON.stringify({
        reviewDecisionId: id,
        envelope: { schemaVersion: '1.0.0', createdAt: '2026-07-30T05:00:00.000Z', createdBy: { kind: 'human', name: 'Fred' } },
        jobId: JOB_ID,
        subjectDraftRenderId: DRAFT_RENDER,
        subjectEdlId: EDL_ID,
        subjectRenderManifestId: DRAFT_MANIFEST,
        subjectPlanHash: { algorithm: 'sha256', value: PLAN_HASH },
        decidedBy: 'Fred',
        decidedAt,
        decision:
          outcome === 'approved'
            ? { outcome: 'approved', notes: null }
            : { outcome: 'rejected', reason: 'sending it back', notes: null },
      }),
    );
  };

  it('refuses to report `approved` when a sibling decision file is unreadable', () => {
    writeDecision('01J9RV2B3C4D5E6F7G8H9K0AP1', '2026-06-30T20:00:00.000Z', 'approved');
    // A LATER rejection that the contract accepts but `Date.parse` does not: an
    // RFC-3339 leap second. Under the round-1 code this was dropped, the approval
    // resolved, and the drop was invisible on that arm.
    writeDecision('01J9RV2B3C4D5E6F7G8H9K0RJ1', '2026-06-30T23:59:60Z', 'rejected');

    const resolution = resolveApprovalForManifest(reviewsDir(), DRAFT_MANIFEST);
    strictEqual(
      resolution.kind,
      'indeterminate',
      'the decision set is INCOMPLETE, and the set is what determines which decision is latest',
    );
    strictEqual(resolution.rejectedFiles.length, 1);
    ok(resolution.rejectedFiles[0]?.file.includes('01J9RV2B3C4D5E6F7G8H9K0RJ1'));
  });

  it('reports unreadable files on the indeterminate arm ALONE, so no branch guards a dead case', () => {
    // Replaces a test that asserted `Array.isArray(x.rejectedFiles)` on three arms —
    // something TypeScript already guaranteed, so it could never fail. The real
    // property is the opposite of what that test implied: because the indeterminate
    // return is unconditional, the other three arms can never carry files, and the
    // `rejectedFiles.length > 0` branches guarding them in render/package/run were
    // DEAD code that read as live policy. The field now exists on one arm only, and
    // the exhaustive switch below stops compiling if that changes.
    rmSync(reviewsDir(), { recursive: true, force: true });
    const arms: ApprovalResolution[] = [];
    arms.push(resolveApprovalForManifest(reviewsDir(), DRAFT_MANIFEST));
    writeDecision('01J9RV2B3C4D5E6F7G8H9K0AP2', '2026-07-30T05:00:00.000Z', 'approved');
    arms.push(resolveApprovalForManifest(reviewsDir(), DRAFT_MANIFEST));
    writeDecision('01J9RV2B3C4D5E6F7G8H9K0RJ2', '2026-07-30T06:00:00.000Z', 'rejected');
    arms.push(resolveApprovalForManifest(reviewsDir(), DRAFT_MANIFEST));
    writeFileSync(join(reviewsDir(), '01J9RV2B3C4D5E6F7G8H9K0TR9.json'), '{ truncated');
    arms.push(resolveApprovalForManifest(reviewsDir(), DRAFT_MANIFEST));

    deepStrictEqual(arms.map((a) => a.kind), ['none', 'approved', 'rejected', 'indeterminate']);
    for (const arm of arms) {
      // An exhaustive switch: adding an arm, or moving `rejectedFiles` back onto one
      // of the other three, fails to COMPILE rather than silently passing.
      switch (arm.kind) {
        case 'none':
        case 'approved':
        case 'rejected':
          ok(!('rejectedFiles' in arm), `${arm.kind} must not carry rejectedFiles — it is provably empty there`);
          break;
        case 'indeterminate':
          strictEqual(arm.rejectedFiles.length, 1);
          break;
        default: {
          const exhaustive: never = arm;
          throw new Error(`unhandled arm ${JSON.stringify(exhaustive)}`);
        }
      }
    }
  });

  it('the RESOLVER reports indeterminate for a truncated candidate decision', () => {
    rmSync(reviewsDir(), { recursive: true, force: true });
    writeDecision('01J9RV2B3C4D5E6F7G8H9K0AP3', '2026-07-30T05:00:00.000Z', 'approved');
    // ULID-named, so it is IN the decision namespace: a truncated candidate decision
    // might be the rejection that supersedes, and that still blocks.
    writeFileSync(join(reviewsDir(), '01J9RV2B3C4D5E6F7G8H9K0TR1.json'), '{ "reviewDecisionId": "01J9RV');
    const resolution = resolveApprovalForManifest(reviewsDir(), DRAFT_MANIFEST);
    strictEqual(resolution.kind, 'indeterminate', 'a truncated candidate decision is enough — it might be the rejection');
  });
});

/**
 * The Phase 5 round-3 CRITICAL, as a test.
 *
 * `validate` (pipeline step 5) writes `<edlId>-gate.json` and `<edlId>-critic.json`,
 * and until round 3 it wrote them into `reviews/` — the directory this resolver reads.
 * Combined with the round-2 `indeterminate` arm, that meant EVERY validated job was
 * permanently barred from a final render and a package, and a real human approval was
 * silently nullified. Two guarantees are asserted here, because either alone would
 * leave the outage one refactor away:
 *
 *   1. the resolver only considers the namespace `approve` owns (`<ulid>.json`);
 *   2. so a neighbour file in `reviews/` is out of scope, not a veto.
 */
describe('the decision namespace is what `approve` writes, and nothing else', () => {
  const APPROVAL = '01J9RV2B3C4D5E6F7G8H9K0NS1';

  const writeApproval = (): void => {
    mkdirSync(reviewsDir(), { recursive: true });
    writeFileSync(
      join(reviewsDir(), `${APPROVAL}.json`),
      JSON.stringify({
        reviewDecisionId: APPROVAL,
        envelope: { schemaVersion: '1.0.0', createdAt: '2026-07-30T05:00:00.000Z', createdBy: { kind: 'human', name: 'Fred' } },
        jobId: JOB_ID,
        subjectDraftRenderId: DRAFT_RENDER,
        subjectEdlId: EDL_ID,
        subjectRenderManifestId: DRAFT_MANIFEST,
        subjectPlanHash: { algorithm: 'sha256', value: PLAN_HASH },
        decidedBy: 'Fred',
        decidedAt: '2026-07-30T05:00:00.000Z',
        decision: { outcome: 'approved', notes: null },
      }),
    );
  };

  it("an approval still resolves with validate's gate outputs sitting in reviews/", () => {
    // The exact outage. Before the namespace fix this returned `indeterminate` and
    // every consumer refused — on the HAPPY PATH, with no attacker involved.
    writeApproval();
    writeFileSync(join(reviewsDir(), `${EDL_ID}-gate.json`), JSON.stringify({ edlId: EDL_ID, gateStatus: 'pass' }));
    writeFileSync(join(reviewsDir(), `${EDL_ID}-critic.json`), JSON.stringify({ edlId: EDL_ID, findings: [] }));

    const resolution = resolveApprovalForManifest(reviewsDir(), DRAFT_MANIFEST);
    strictEqual(resolution.kind, 'approved', 'a gate report is not a decision and must not veto one');
  });

  it('an unrelated dropped .json is out of scope, not an irrevocable veto', () => {
    // One byte in the wrong place used to bar every final render for the job, with a
    // printed remedy that told the operator to delete review evidence.
    writeApproval();
    writeFileSync(join(reviewsDir(), 'notes.json'), '{ half a thought');
    writeFileSync(join(reviewsDir(), '.DS_Store'), 'junk');
    strictEqual(resolveApprovalForManifest(reviewsDir(), DRAFT_MANIFEST).kind, 'approved');
  });

  it('but a ULID-named file that fails the contract IS still indeterminate', () => {
    // The namespace fix must not weaken the round-2 BLOCK fix: a file that IS in the
    // decision namespace and does not parse might be the rejection that supersedes.
    writeApproval();
    writeFileSync(join(reviewsDir(), '01J9RV2B3C4D5E6F7G8H9K0NS2.json'), '{ truncated');
    const resolution = resolveApprovalForManifest(reviewsDir(), DRAFT_MANIFEST);
    strictEqual(resolution.kind, 'indeterminate');
    ok(resolution.rejectedFiles[0]?.file.includes('01J9RV2B3C4D5E6F7G8H9K0NS2'));
  });

  it('ignores a ULID-named file with the wrong extension', () => {
    writeApproval();
    writeFileSync(join(reviewsDir(), '01J9RV2B3C4D5E6F7G8H9K0NS3.json.bak'), 'editor backup');
    strictEqual(resolveApprovalForManifest(reviewsDir(), DRAFT_MANIFEST).kind, 'approved');
  });
});
