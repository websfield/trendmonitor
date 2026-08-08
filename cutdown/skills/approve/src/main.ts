import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ulid } from 'ulid';

import {
  contractValidator,
  fail,
  formatAjvErrors,
  jobDir,
  reject,
  runSkillMain,
  writeJsonAtomic,
  type SkillContext,
} from '@cutdown/skill-runtime';
import {
  decisionsForManifest,
  loadReviewDecisions,
  type ReviewDecision,
} from '@cutdown/contracts';
import { qaAllowsAdvance, type TechnicalQaReport } from '@cutdown/qa';
import type { RenderV1 } from '@cutdown/contracts/generated';

/**
 * `approve` — the human act, recorded with a name (decisions.md D-9,
 * tech-spec §15 step 8).
 *
 * The whole skill is one write, and every interesting line is a refusal. What it
 * must never do is produce a record that *looks* like an authorisation for
 * something the human did not see: so the subject ids are resolved from the
 * render artefact on disk rather than taken from the caller, and the produced
 * ReviewDecision is validated against `review-decision-v1` before it is written,
 * not after something downstream trips over it.
 */

type Render = RenderV1.Render;

const SKILL = 'approve';
const VERSION = '1.0.0';

const DECISION_SCHEMA_ID = 'https://cutdown.local/contracts/schemas/review-decision-v1.json';

interface ApproveRequest {
  jobId: string;
  draftRenderId: string;
  decidedBy: string;
  reject?: boolean;
  reason?: string | null;
  notes?: string | null;
}

interface ApproveResult {
  kind: 'decided';
  jobId: string;
  reviewDecisionId: string;
  decisionPath: string;
  outcome: 'approved' | 'rejected';
  nextState: 'final-rendering' | 'revise';
  subjectDraftRenderId: string;
  subjectRenderManifestId: string;
  subjectEdlId: string;
  decidedBy: string;
  supersededDecisionIds: string[];
  qaGateStatus: 'pass' | 'pass_with_waivers' | 'fail' | null;
}

interface LocatedRender {
  readonly render: Render;
  /** Job-relative directory holding the render, its manifest and its QA report. */
  readonly renderRel: string;
}

/**
 * Find a render by its `renderId`.
 *
 * Renders are stored under `renders/<tier>/<manifestId>/render.json`, so a render
 * id is not a path — it has to be looked up. BOTH tiers are searched rather than
 * only `draft`: if the caller names a final render, the honest error is "that is a
 * final render, and approval is of a draft", not "no such render". A lookup that
 * only searched the draft tier would report the wrong fact.
 */
function locateRender(root: string, renderId: string): LocatedRender | null {
  for (const tier of ['draft', 'final'] as const) {
    const tierRoot = join(root, 'renders', tier);
    if (!existsSync(tierRoot)) continue;
    for (const manifestDir of readdirSync(tierRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      const renderPath = join(tierRoot, manifestDir, 'render.json');
      if (!existsSync(renderPath)) continue;
      let parsed: Render;
      try {
        parsed = JSON.parse(readFileSync(renderPath, 'utf8')) as Render;
      } catch (error) {
        // A render artefact that will not parse is a real problem, and skipping
        // it silently would report the render as absent — which reads as "never
        // rendered" rather than "the record is broken".
        throw fail(
          'RENDER_ARTEFACT_UNREADABLE',
          `The render record at renders/${tier}/${manifestDir}/render.json is not valid JSON: ${(error as Error).message}`,
        );
      }
      if (parsed.renderId === renderId) {
        return { render: parsed, renderRel: `renders/${tier}/${manifestDir}` };
      }
    }
  }
  return null;
}

/** The QA report beside a render, or null if none was written. */
function readQaReport(root: string, renderRel: string): TechnicalQaReport | null {
  const path = join(root, ...renderRel.split('/'), 'qa-report.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as TechnicalQaReport;
  } catch (error) {
    throw fail(
      'QA_REPORT_UNREADABLE',
      `The QA report at ${renderRel}/qa-report.json is not valid JSON: ${(error as Error).message}. ` +
        `A malformed report fails closed — it is never treated as absent, and never as a pass.`,
    );
  }
}

/** The render's plan hash, taken from the QA report that judged it. */
function planHashFrom(report: TechnicalQaReport): { algorithm: 'sha256'; value: string } {
  return { algorithm: 'sha256', value: report.planHash.value };
}

async function run(request: ApproveRequest, ctx: SkillContext): Promise<ApproveResult> {
  const root = jobDir(ctx.workspaceRoot, request.jobId);
  const rejecting = request.reject === true;

  // Checked before anything is read: a rejection with no reason is a dead end for
  // the `revise` stage that consumes it. `reject()` rather than `fail()` — the
  // caller sent an incomplete request (exit 2), the skill did not fail (exit 3).
  if (rejecting && (request.reason ?? '').trim().length === 0) {
    throw reject(
      'REJECTION_REASON_REQUIRED',
      'A rejection must carry a reason (`--reason "..."`). The rejection path leads to `cutdown revise`, which interprets that text into structured constraints — a rejection without it sends someone back with nothing to act on.',
    );
  }

  const located = locateRender(root, request.draftRenderId);
  if (located === null) {
    throw fail(
      'RENDER_NOT_FOUND',
      `No render with id ${request.draftRenderId} exists in job ${request.jobId}. ` +
        `Approval names the render a human WATCHED (the \`renderId\` from the render result), not a manifest id.`,
      { draftRenderId: request.draftRenderId },
    );
  }
  const { render, renderRel } = located;

  if (render.tier !== 'draft') {
    throw fail(
      'NOT_A_DRAFT_RENDER',
      `Render ${request.draftRenderId} is a ${render.tier}-tier render. Approval is of a DRAFT: the final render is a consequence of approval (tech-spec §15 step 8), so approving one would make the ordering circular.`,
      { tier: render.tier },
    );
  }

  const report = readQaReport(root, renderRel);
  const qaGateStatus = report?.gateStatus ?? null;

  // The rule that stops the direct CLI call being a documented bypass of the
  // runner's transition gate. D-35's blockers are non-waivable BY ANYONE — an
  // approver included — and `qaAllowsAdvance` is the same single implementation
  // the runner gate consults, so there is one answer rather than two.
  //
  // Only approvals are gated. Rejecting a QA-failed draft is exactly what a
  // reviewer should be able to do, and refusing that would leave a broken draft
  // with no recordable outcome at all.
  if (!rejecting) {
    const allowed = qaAllowsAdvance(report);
    if (!allowed.allowed) {
      throw fail(
        'DRAFT_QA_NOT_PASSED',
        `Draft render ${request.draftRenderId} cannot be approved: ${allowed.reason} ` +
          `Blockers are non-waivable (decisions.md D-35) — including by an approver. Fix the render, or record a named waiver for a WARNING, then approve. ` +
          `To send this draft back instead, run the same command with --reject --reason "...".`,
        { qaGateStatus, qaReportPath: `${renderRel}/qa-report.json` },
      );
    }
  }

  // `report` is non-null here for an approval (qaAllowsAdvance refuses null), but
  // a rejection may legitimately have none — a render whose QA never completed is
  // precisely something to reject.
  if (report === null) {
    throw fail(
      'QA_REPORT_MISSING',
      `Draft render ${request.draftRenderId} has no QA report at ${renderRel}/qa-report.json, so there is no plan hash to record against a decision. ` +
        `A render without a report is the state tech-spec §15 step 7 exists to make impossible; re-run \`cutdown render\`.`,
    );
  }

  const existing = loadReviewDecisions(join(root, 'reviews'));
  const superseded = decisionsForManifest(existing.decisions, render.renderManifestId);

  // `existing.rejected` is NOT discarded. `supersededDecisionIds` below is what an
  // operator reads to confirm nothing was lost, and computing it from a set known to
  // be incomplete while saying nothing is the kind of quiet half-truth every other
  // caller of this module now refuses outright.
  //
  // A WARNING rather than a refusal, and deliberately: recording a human's decision
  // must not be blocked by a neighbouring file, or a corrupt artefact would stop the
  // one act D-9 reserves for a person. The consumers that must fail closed —
  // `render`, `package`, the runner gate — already do.
  if (existing.rejected.length > 0) {
    process.stderr.write(
      `[approve] ${String(existing.rejected.length)} file(s) in the decision namespace could not be read as decisions: ` +
        `${existing.rejected.map((f) => `${f.file} (${f.reason})`).join('; ')}\n` +
        `[approve] This decision is still recorded, but supersededDecisionIds is computed from an INCOMPLETE set, ` +
        `and \`cutdown render --tier final\` will refuse until those files are fixed or removed.\n`,
    );
  }

  const decidedAt = new Date().toISOString();
  const decision: ReviewDecision = {
    reviewDecisionId: ulid(),
    envelope: {
      schemaVersion: '1.0.0',
      createdAt: decidedAt,
      // A HumanCreator, never a SkillCreator: D-9 makes this a human act, and the
      // envelope's tagged union is what stops this skill attributing the decision
      // to itself.
      createdBy: { kind: 'human', name: request.decidedBy },
    },
    jobId: request.jobId,
    subjectDraftRenderId: render.renderId,
    subjectEdlId: render.edlId,
    subjectRenderManifestId: render.renderManifestId,
    subjectPlanHash: planHashFrom(report),
    decidedBy: request.decidedBy,
    decidedAt,
    decision: rejecting
      ? { outcome: 'rejected', reason: request.reason as string, notes: request.notes ?? null }
      : { outcome: 'approved', notes: request.notes ?? null },
  };

  // Validated against the CONTRACT before it lands, not just against this skill's
  // output schema. The output schema describes the result summary; the artefact on
  // disk is what `render`, `package` and the runner gate read, and a malformed
  // one would fail three stages later with no clue where it came from.
  const validate = contractValidator().getSchema(DECISION_SCHEMA_ID);
  if (validate === undefined) {
    throw fail('DECISION_SCHEMA_MISSING', `${DECISION_SCHEMA_ID} is not registered; the decision cannot be validated.`);
  }
  if (!validate(decision)) {
    throw fail(
      'DECISION_SCHEMA_INVALID',
      `The review decision this skill built does not satisfy review-decision-v1: ${formatAjvErrors(validate.errors)}. This is a defect in the skill, not in the request.`,
    );
  }

  const decisionRel = `reviews/${decision.reviewDecisionId}.json`;
  // One file per DECISION, never one per manifest. A second decision about the
  // same draft must not overwrite the first: history is preserved and which one
  // is in force is computed by `selectLatestDecision`.
  writeJsonAtomic(join(root, 'reviews', `${decision.reviewDecisionId}.json`), decision);

  return {
    kind: 'decided',
    jobId: request.jobId,
    reviewDecisionId: decision.reviewDecisionId,
    decisionPath: decisionRel,
    outcome: rejecting ? 'rejected' : 'approved',
    nextState: rejecting ? 'revise' : 'final-rendering',
    subjectDraftRenderId: render.renderId,
    subjectRenderManifestId: render.renderManifestId,
    subjectEdlId: render.edlId,
    decidedBy: request.decidedBy,
    supersededDecisionIds: superseded.map((d) => d.reviewDecisionId),
    qaGateStatus,
  };
}

await runSkillMain<ApproveRequest, ApproveResult>({
  name: SKILL,
  version: VERSION,
  inputSchema: './schema/input.json',
  outputSchema: './schema/output.json',
  run,
});
