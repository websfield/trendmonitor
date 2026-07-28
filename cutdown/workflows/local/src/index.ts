/**
 * @cutdown/workflow-local — the Phase 0 durable local workflow runner.
 *
 * See runner.ts for the orchestration contract and db.ts for the projection.
 * The run log is authoritative (tech-spec §5/§8); this package only projects it.
 */

export { Runner } from './runner.js';
export type {
  StepOutcome,
  StepInvoker,
  RunnerEnv,
  RunResult,
  StopReason,
} from './runner.js';
export { ProjectionDb } from './db.js';
export type { JobRow, JobStatus, InvocationRow } from './db.js';
export { PIPELINE, STATES } from './pipeline.js';
export type { JobState, PipelineStep } from './pipeline.js';
export { analyze, parseRunLog } from './runlog.js';
export type { SkillInvocationEntry, Analysis } from './runlog.js';
