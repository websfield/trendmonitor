/**
 * The two-table durable projection (decisions.md D-11, tech-spec §8).
 *
 * A hand-rolled state machine over `node:sqlite` (decisions.md D-45: the Node 24
 * dev machine has no better-sqlite3 prebuilt and its native build fails, so the
 * runtime falls back to Node's built-in SQLite). NO queue library.
 *
 * This database is a PROJECTION of every job's `run-log.jsonl` and holds no
 * state that isn't derivable from those logs. Deleting the file loses nothing —
 * `rebuild-index` replays the logs and reconstructs it byte-for-byte. On any
 * divergence between the two, the run log wins and this row is overwritten.
 */

import { DatabaseSync } from 'node:sqlite';

import type { SkillInvocationEntry } from './runlog.js';

export type JobStatus = 'pending' | 'active' | 'blocked' | 'completed' | 'failed';

export interface JobRow {
  jobId: string;
  currentState: string;
  status: JobStatus;
  blockedError: string | null;
  updatedAt: string;
}

export interface InvocationRow {
  invocationId: string;
  jobId: string;
  skill: string;
  skillVersion: string;
  status: string;
  exitCode: number | null;
  inputPath: string | null;
  outputPath: string | null;
  error: string | null;
  loggedAt: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  job_id        TEXT PRIMARY KEY,
  current_state TEXT NOT NULL,
  status        TEXT NOT NULL,
  blocked_error TEXT,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skill_invocations (
  invocation_id TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL,
  skill         TEXT NOT NULL,
  skill_version TEXT NOT NULL,
  status        TEXT NOT NULL,
  exit_code     INTEGER,
  input_path    TEXT,
  output_path   TEXT,
  error         TEXT,
  logged_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invocations_job ON skill_invocations(job_id);
`;

export class ProjectionDb {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    // WAL keeps the projection readable while a long advance is mid-write; it is
    // a cache, so durability tuning is a convenience, not a correctness lever.
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  /** Drop and recreate both tables — the reset half of a full `rebuild-index`. */
  resetAll(): void {
    this.db.exec('DROP TABLE IF EXISTS skill_invocations;');
    this.db.exec('DROP TABLE IF EXISTS jobs;');
    this.db.exec(SCHEMA);
  }

  /** Remove one job's rows — the reset half of a single-job `rebuild-index`. */
  resetJob(jobId: string): void {
    this.db.prepare('DELETE FROM skill_invocations WHERE job_id = ?').run(jobId);
    this.db.prepare('DELETE FROM jobs WHERE job_id = ?').run(jobId);
  }

  upsertInvocation(jobId: string, entry: SkillInvocationEntry): void {
    this.db
      .prepare(
        `INSERT INTO skill_invocations
           (invocation_id, job_id, skill, skill_version, status, exit_code, input_path, output_path, error, logged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(invocation_id) DO UPDATE SET
           status = excluded.status,
           exit_code = excluded.exit_code,
           output_path = excluded.output_path,
           error = excluded.error,
           logged_at = excluded.logged_at`,
      )
      .run(
        entry.invocationId,
        jobId,
        entry.skill,
        entry.skillVersion,
        entry.status,
        typeof entry.exitCode === 'number' ? entry.exitCode : null,
        entry.inputPath ?? null,
        entry.outputPath ?? null,
        entry.error == null ? null : JSON.stringify(entry.error),
        entry.loggedAt,
      );
  }

  upsertJob(row: JobRow): void {
    this.db
      .prepare(
        `INSERT INTO jobs (job_id, current_state, status, blocked_error, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           current_state = excluded.current_state,
           status = excluded.status,
           blocked_error = excluded.blocked_error,
           updated_at = excluded.updated_at`,
      )
      .run(row.jobId, row.currentState, row.status, row.blockedError, row.updatedAt);
  }

  getJob(jobId: string): JobRow | null {
    const r = this.db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
    if (!r) return null;
    return {
      jobId: String(r['job_id']),
      currentState: String(r['current_state']),
      status: String(r['status']) as JobStatus,
      blockedError: r['blocked_error'] == null ? null : String(r['blocked_error']),
      updatedAt: String(r['updated_at']),
    };
  }

  listInvocations(jobId: string): InvocationRow[] {
    const rows = this.db
      .prepare('SELECT * FROM skill_invocations WHERE job_id = ? ORDER BY logged_at ASC')
      .all(jobId);
    return rows.map((r) => ({
      invocationId: String(r['invocation_id']),
      jobId: String(r['job_id']),
      skill: String(r['skill']),
      skillVersion: String(r['skill_version']),
      status: String(r['status']),
      exitCode: r['exit_code'] == null ? null : Number(r['exit_code']),
      inputPath: r['input_path'] == null ? null : String(r['input_path']),
      outputPath: r['output_path'] == null ? null : String(r['output_path']),
      error: r['error'] == null ? null : String(r['error']),
      loggedAt: String(r['logged_at']),
    }));
  }

  close(): void {
    this.db.close();
  }
}
