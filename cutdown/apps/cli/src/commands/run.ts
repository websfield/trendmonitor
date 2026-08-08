import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  Runner,
  ProjectionDb,
  parseRunLog,
  createQaTransitionGate,
  openGate,
  type QaGateEnv,
  type QaGateReport,
  type ReviewDecisionState,
  type RunnerEnv,
  type StepInvoker,
  type StepOutcome,
  type SkillInvocationEntry,
  type PipelineStep,
} from '@cutdown/workflow-local';

import { resolveApprovalForManifest } from '@cutdown/contracts';

import { INDEX_DB, JOBS_ROOT, SKILLS_ROOT, assertSafeJobId, jobPaths } from '../paths.js';
import { invokeSkill } from './skill-invocation.js';
import { CutdownError } from '../errors.js';

/**
 * `cutdown run <job-id>` and `cutdown rebuild-index [<job-id>]` — the local
 * durable workflow runner's operator surface (tech-spec §8).
 *
 * The runner core lives in `@cutdown/workflow-local` and knows nothing about
 * paths or skills. This file supplies the three real dependencies: how to read
 * a job's authoritative run log, how to enumerate jobs, and how to invoke one
 * pipeline step against a real skill (deriving its request from prior recorded
 * outputs). The projection database is a disposable cache under `project-data/`.
 */

/** decisions.md D-3 fixes the Phase 0 platform; the runner never guesses another. */
const PHASE0_PLATFORM = 'tiktok';
/** A sensible Phase 0 default for an unattended `propose`; a human can re-run with more. */
const DEFAULT_VARIANTS = 3;

/** Build the path-aware environment the runner core needs. */
function makeEnv(): RunnerEnv {
  return {
    readRunLog(jobId: string): SkillInvocationEntry[] {
      const path = jobPaths(jobId).runLog;
      if (!existsSync(path)) return [];
      return parseRunLog(readFileSync(path, 'utf8'));
    },
    listJobIds(): string[] {
      if (!existsSync(JOBS_ROOT)) return [];
      return readdirSync(JOBS_ROOT, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(JOBS_ROOT, e.name, 'run-log.jsonl')))
        .map((e) => e.name)
        .sort();
    },
  };
}

function skillExists(skill: string): boolean {
  return existsSync(join(SKILLS_ROOT, skill, 'SKILL.md'));
}

/** Read the result JSON of the last COMPLETED invocation of a skill, if any. */
function latestSkillOutput(entries: SkillInvocationEntry[], skill: string): unknown | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e && e.skill === skill && e.status === 'completed' && e.outputPath) {
      if (!existsSync(e.outputPath)) return null;
      return JSON.parse(readFileSync(e.outputPath, 'utf8')) as unknown;
    }
  }
  return null;
}

type RequestPlan = { request: Record<string, unknown> } | { awaiting: string };

/**
 * Derive one step's skill request from the job's prior recorded outputs.
 *
 * The runner only drives a step whose inputs are unambiguous from the log.
 * `propose → plan → validate → render(draft)` and `render(final) → package`
 * chain cleanly by artefact id. Three steps deliberately do not:
 *
 *   - `ingest` needs an external source path the runner cannot invent;
 *   - `index` is per-asset and spend-gated (decisions.md D-21);
 *   - `approve` is a human act recorded with a name (decisions.md D-9) — this one
 *     is not a gap to close later. A runner able to originate an approval would
 *     be an auto-approval path.
 *
 * Each pauses as `awaiting` with the exact command to run by hand.
 */
function buildRequest(step: PipelineStep, jobId: string, entries: SkillInvocationEntry[]): RequestPlan {
  switch (step.skill) {
    case 'ingest':
      return {
        awaiting:
          'the runner does not originate ingest (it needs an external source path); run `cutdown ingest <path> --job ' +
          `${jobId}\` first.`,
      };
    case 'index':
      return {
        awaiting:
          'indexing is per-asset and spend-gated (decisions.md D-21); run `cutdown index ' +
          `${jobId} --asset <asset-id>\` first.`,
      };
    case 'propose':
      return { request: { jobId, variants: DEFAULT_VARIANTS } };
    case 'plan': {
      const proposed = latestSkillOutput(entries, 'propose') as
        | { kind?: string; briefs?: Array<{ creativeBriefId?: string }> }
        | null;
      if (!proposed || proposed.kind !== 'briefs' || !proposed.briefs?.length) {
        return {
          awaiting:
            'propose produced no briefs to plan from ' +
            `(last result kind: ${proposed?.kind ?? 'none'}); nothing to advance.`,
        };
      }
      const creativeBriefId = proposed.briefs[0]?.creativeBriefId;
      if (!creativeBriefId) return { awaiting: 'the newest propose result carries no creativeBriefId.' };
      return { request: { jobId, creativeBriefId, platform: PHASE0_PLATFORM } };
    }
    case 'validate': {
      const planned = latestSkillOutput(entries, 'plan') as
        | { kind?: string; edlId?: string }
        | null;
      if (!planned || planned.kind !== 'planned' || !planned.edlId) {
        return {
          awaiting:
            'plan produced no PlatformEDL to validate ' +
            `(last result kind: ${planned?.kind ?? 'none'}); nothing to advance.`,
        };
      }
      return { request: { jobId, edlId: planned.edlId } };
    }
    case 'render': {
      // BOTH render steps, distinguished by the state the job is leaving — the
      // pipeline lists `render` twice and `runlog.analyze` consumes the two
      // invocations left to right, so `fromState` is the only thing that says
      // which tier is being asked for.
      const planned = latestSkillOutput(entries, 'plan') as { kind?: string; edlId?: string } | null;
      if (!planned || planned.kind !== 'planned' || !planned.edlId) {
        return { awaiting: `plan produced no PlatformEDL to render (last result kind: ${planned?.kind ?? 'none'}).` };
      }
      if (step.fromState === 'draft-rendering') {
        return { request: { jobId, edlId: planned.edlId, tier: 'draft' } };
      }
      // The FINAL tier must name the manifest the approval was given for. It is
      // read from the DECISION rather than from the newest draft directory: the
      // approval is the authority, and taking the newest draft instead would
      // silently render whatever was built last.
      const decided = latestSkillOutput(entries, 'approve') as
        | { kind?: string; outcome?: string; subjectRenderManifestId?: string }
        | null;
      if (!decided || decided.kind !== 'decided' || !decided.subjectRenderManifestId) {
        return { awaiting: 'no recorded approve result names the approved draft manifest; nothing authorises a final render.' };
      }
      if (decided.outcome !== 'approved') {
        // Belt and braces with the transition gate, which refuses this step for
        // the same reason. Two independent refusals for one rule is deliberate
        // here: the gate reads the artefacts on disk, this reads the recorded
        // result, and a final render is the most expensive irreversible step in
        // the pipeline.
        return {
          awaiting: `the review decision in force is "${decided.outcome}", not an approval; run \`cutdown revise\` rather than a final render.`,
        };
      }
      return {
        request: {
          jobId,
          edlId: planned.edlId,
          tier: 'final',
          approvedDraftManifestId: decided.subjectRenderManifestId,
        },
      };
    }
    case 'approve':
      // Never originated by the runner, and this is the one `awaiting` that is a
      // FEATURE rather than a gap: approval is a human act recorded with a name
      // (decisions.md D-9). A runner that could originate it would be an
      // auto-approval path, which is precisely what must not exist.
      return {
        awaiting:
          'approval is a human act recorded with a name (decisions.md D-9) and is never automated; run ' +
          `\`cutdown approve <draft-render-id> --by "<your name>"\` (or --reject --reason "...") for job ${jobId}.`,
      };
    case 'package': {
      const rendered = latestSkillOutput(entries, 'render') as
        | { kind?: string; tier?: string; renderId?: string }
        | null;
      if (!rendered || rendered.kind !== 'rendered' || !rendered.renderId) {
        return { awaiting: `no completed render to package (last result kind: ${rendered?.kind ?? 'none'}).` };
      }
      if (rendered.tier !== 'final') {
        return {
          awaiting: `the most recent render is the ${String(rendered.tier)} tier; only a FINAL render can be packaged (tech-spec §15 step 8).`,
        };
      }
      return { request: { jobId, finalRenderId: rendered.renderId } };
    }
    default:
      return { awaiting: `no request builder for skill '${step.skill}'.` };
  }
}

/** The production step invoker: existence check → request → invokeSkill → outcome. */
const realInvoker: StepInvoker = async (step, jobId, priorEntries): Promise<StepOutcome> => {
  if (!skillExists(step.skill)) {
    return {
      kind: 'awaiting',
      reason: `skill '${step.skill}' is not implemented yet (Phase ${step.phase}); stopping at this boundary.`,
    };
  }

  const plan = buildRequest(step, jobId, priorEntries);
  if ('awaiting' in plan) return { kind: 'awaiting', reason: plan.awaiting };

  try {
    // invokeSkill appends the authoritative `skill-invocation` line to the run
    // log itself — the runner re-reads and projects from there.
    await invokeSkill({ skillName: step.skill, jobId, request: plan.request });
    return { kind: 'completed' };
  } catch (err) {
    if (err instanceof CutdownError) {
      // A structured skill failure → the job blocks (recoverable), never a
      // fabricated success and never a silent skip.
      return { kind: 'blocked', error: err.toStructured() };
    }
    // An unexpected fault is a runner bug, not a job outcome — let it surface.
    throw err;
  }
};

/**
 * Find the QA report for a job's most recent render of a tier (tech-spec §15
 * step 7).
 *
 * "Most recent" is decided by the manifest-id directory name, which is a ULID —
 * lexicographically sortable by creation time, which is the property ULIDs exist
 * for. A re-render therefore supersedes its predecessor's verdict rather than
 * letting a stale pass authorise a newer, worse render.
 *
 * A directory with no `qa-report.json` yields `null`, and `null` blocks: a render
 * that exists without a report is the exact situation the gate refuses.
 *
 * `resolveJobRoot` is injected (defaulting to the real layout) purely so this
 * function can be tested against a temp directory. Phase 4 shipped it untested,
 * and it was where the fail-open lookup lived.
 */
export function makeQaGateEnv(
  resolveJobRoot: (jobId: string) => string = (jobId) => jobPaths(jobId).root,
): QaGateEnv {
  return {
    latestQaReport(jobId: string, tier: 'draft' | 'final'): QaGateReport | null {
      const tierRoot = join(resolveJobRoot(jobId), 'renders', tier);
      if (!existsSync(tierRoot)) return null;
      const manifestDirs = readdirSync(tierRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      const latest = manifestDirs[manifestDirs.length - 1];
      if (latest === undefined) return null;

      // ONLY the latest. An earlier version of this loop walked backwards until
      // it found any report, which meant the newest render having no report was
      // silently authorised by a PREVIOUS render's verdict — the gate failing
      // open in exactly the situation it exists for. A render directory with no
      // report is not "no evidence yet", it is "a render exists that was never
      // judged", and that must block.
      const reportPath = join(tierRoot, latest, 'qa-report.json');
      if (!existsSync(reportPath)) {
        throw new Error(
          `The latest ${tier} render (${latest}) has no qa-report.json. A render that exists without a report is never advanced past.`,
        );
      }
      // A parse failure is deliberately NOT caught here: the gate treats a
      // thrown read as QA_REPORT_UNREADABLE and blocks, which is different
      // from — and must not be collapsed into — "no report exists".
      return JSON.parse(readFileSync(reportPath, 'utf8')) as QaGateReport;
    },

    /**
     * The review decision in force for the job's latest DRAFT render
     * (tech-spec §15 step 8).
     *
     * "Latest draft" is the same ULID-ordered directory the QA lookup uses, so
     * the gate judges the approval of the draft it just judged the QA of — and a
     * newer, unapproved draft is never authorised by an older draft's approval.
     * The resolution itself is `resolveApprovalForManifest` from
     * `@cutdown/contracts`: one implementation shared with the `approve`,
     * `render` and `package` skills, because a second sort rule would be a second
     * answer to "is this approved?".
     */
    reviewDecisionInForce(jobId: string): ReviewDecisionState {
      const root = resolveJobRoot(jobId);
      const draftRoot = join(root, 'renders', 'draft');
      if (!existsSync(draftRoot)) return { kind: 'none' };
      const manifestDirs = readdirSync(draftRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      const latestDraftManifestId = manifestDirs[manifestDirs.length - 1];
      if (latestDraftManifestId === undefined) return { kind: 'none' };

      const resolution = resolveApprovalForManifest(join(root, 'reviews'), latestDraftManifestId);
      if (resolution.kind === 'indeterminate') {
        return {
          kind: 'unreadable',
          detail: resolution.rejectedFiles.map((f) => `${f.file} (${f.reason})`).join('; '),
        };
      }
      if (resolution.kind === 'approved') {
        return {
          kind: 'approved',
          decidedBy: resolution.decision.decidedBy,
          renderManifestId: latestDraftManifestId,
        };
      }
      if (resolution.kind === 'rejected') {
        const rejected = resolution.decision.decision as { outcome: 'rejected'; reason: string };
        return { kind: 'rejected', decidedBy: resolution.decision.decidedBy, reason: rejected.reason };
      }
      return { kind: 'none' };
    },
  };
}

export async function runCommand(jobId: string): Promise<number> {
  assertSafeJobId(jobId);
  const db = new ProjectionDb(INDEX_DB);
  try {
    const runner = new Runner(db, makeEnv(), realInvoker, createQaTransitionGate(makeQaGateEnv()));
    const result = await runner.advance(jobId);

    const lines = [
      `job ${result.jobId}`,
      `state: ${result.state}  (status: ${result.status})`,
      `stopped: ${result.stopReason}  — advanced ${result.advanced} step(s) this run`,
    ];
    if (result.stopReason === 'awaiting' && result.reason) lines.push(`awaiting: ${result.reason}`);
    if (result.stopReason === 'blocked') {
      lines.push(`blocked: ${JSON.stringify(result.error)}`);
    }
    if (result.stopReason === 'gate-blocked') {
      // Distinct from `blocked`: nothing ran and the run log is untouched, so
      // fixing the render or recording a waiver and re-running is the whole
      // recovery — no log surgery.
      lines.push(`gate refused (${result.gateCode ?? 'unknown'}): ${result.reason ?? ''}`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
    // A blocked job is a real, recoverable outcome — not a runner error — so the
    // command still exits 0; the printed state carries the news.
    return 0;
  } finally {
    db.close();
  }
}

export function rebuildIndexCommand(jobId?: string): number {
  if (jobId !== undefined) assertSafeJobId(jobId);
  const db = new ProjectionDb(INDEX_DB);
  try {
    // `openGate` explicitly: `rebuild` runs no steps, so no transition gate can
    // apply. Written down rather than achieved by omitting an argument.
    const runner = new Runner(db, makeEnv(), realInvoker, openGate);
    const rebuilt = runner.rebuild(jobId);
    process.stdout.write(
      `rebuilt index.db from run logs: ${rebuilt.length} job(s) [${rebuilt.join(', ')}]\n`,
    );
    return 0;
  } finally {
    db.close();
  }
}
