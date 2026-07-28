/**
 * The REQ-152 state model and the Phase 0 skill pipeline (tech-spec §8).
 *
 * `STATES` is the FULL, verbatim REQ-152 order — every state the Stage B/C
 * Temporal workflow will reuse unchanged, including `publishing` (Stage B+) and
 * the three terminal states. The Phase 0 runner never dwells in `publishing`
 * (it transitions `packaging → completed` directly), but the name stays in the
 * model so the migration is a runner swap, not a redesign.
 *
 * `PIPELINE` is the ordered list of skill-driven steps. It is coarser than
 * `STATES`: one skill invocation can carry a job across a pass-through state
 * (`ingest` does uploaded→preflight; `index` does indexing→moment-extraction),
 * so each step names the state it advances FROM and the state the job enters
 * once it completes.
 */

/** REQ-152, verbatim order. The shared state model reused by Stage B Temporal. */
export const STATES = [
  'uploaded',
  'preflight',
  'indexing',
  'moment-extraction',
  'brief-generation',
  'edl-generation',
  'validating',
  'draft-rendering',
  'review',
  'final-rendering',
  'packaging',
  'publishing',
  'completed',
  'blocked',
  'failed',
] as const;

export type JobState = (typeof STATES)[number];

export interface PipelineStep {
  /** The skill invoked to execute this step. */
  readonly skill: string;
  /** The REQ-152 state a job sits in while this step is the next one pending. */
  readonly fromState: JobState;
  /** The state the job enters once this step has a completed invocation. */
  readonly toState: JobState;
  /**
   * Where the skill first lands (Phase 3 has skills through `validate`; the
   * render/approve/package skills do not exist yet — the runner stops cleanly
   * at their boundary rather than failing). Informational; the runner checks
   * skill existence at run time, not from this field.
   */
  readonly phase: 3 | 4 | 5;
}

/**
 * The Phase 0 pipeline. `publishing` is intentionally absent: `package`
 * completes into `completed` (tech-spec §8 — the Stage B+ `publishing` state
 * exists in STATES but the Phase 0 runner skips it).
 *
 * Steps are matched to run-log invocations by skill name in order (see
 * runlog.ts `analyze`), so the two `render` steps (draft, final) are consumed
 * left-to-right against the two render invocations a full job records.
 */
export const PIPELINE: readonly PipelineStep[] = [
  { skill: 'ingest', fromState: 'uploaded', toState: 'indexing', phase: 3 },
  { skill: 'index', fromState: 'indexing', toState: 'brief-generation', phase: 3 },
  { skill: 'propose', fromState: 'brief-generation', toState: 'edl-generation', phase: 3 },
  { skill: 'plan', fromState: 'edl-generation', toState: 'validating', phase: 3 },
  { skill: 'validate', fromState: 'validating', toState: 'draft-rendering', phase: 3 },
  { skill: 'render', fromState: 'draft-rendering', toState: 'review', phase: 4 },
  { skill: 'approve', fromState: 'review', toState: 'final-rendering', phase: 5 },
  { skill: 'render', fromState: 'final-rendering', toState: 'packaging', phase: 4 },
  { skill: 'package', fromState: 'packaging', toState: 'completed', phase: 5 },
];
