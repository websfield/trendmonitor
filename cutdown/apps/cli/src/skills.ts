import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { SKILLS_ROOT, WORKSPACE_ROOT } from './paths.js';
import { CutdownError, EXIT_RUNTIME_FAILURE, runtimeFailure, type StructuredError } from './errors.js';

/**
 * Skill discovery and invocation (tech-spec §6).
 *
 * The whole Stage A → B → C story rests on one claim: every unit of editorial
 * capability is a self-contained package with ONE execution contract, callable
 * identically by a human, by Claude Code, by a Temporal activity, or by an HTTP
 * handler. This module is the Stage A implementation of that contract, and it
 * is deliberately the only place the CLI knows how to start a skill — the
 * `.claude` mirror, the local runner (Phase 3), and `skills serve` all funnel
 * through `runSkill` rather than each learning to spawn.
 */

export interface SkillFrontmatter {
  name: string;
  skillVersion: string;
  description: string;
  /** argv array — spawned DIRECTLY, never through a shell (tech-spec §6.2). */
  entrypoint: string[];
  execution: 'sync' | 'async';
  inputSchema: string;
  outputSchema: string;
  contractsUsed: string[];
  sideEffects: Array<'reads-project-data' | 'writes-project-data' | 'network'>;
  timeoutSeconds: number;
  heartbeatSeconds?: number;
}

export interface Skill {
  frontmatter: SkillFrontmatter;
  /** Absolute path to `skills/<name>/` — also the cwd every entrypoint runs in. */
  dir: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Parse `SKILL.md`'s YAML frontmatter. Strict validation lands in Phase 5's `skills sync` (D-15). */
export function readSkill(name: string): Skill {
  const dir = join(SKILLS_ROOT, name);
  const skillMd = join(dir, 'SKILL.md');
  if (!existsSync(skillMd)) {
    throw runtimeFailure({
      code: 'SKILL_NOT_FOUND',
      message: `No skill named "${name}" — expected ${skillMd}.`,
      skill: 'skills',
      skillVersion: '1.0.0',
      details: { available: listSkillNames() },
    });
  }

  const raw = readFileSync(skillMd, 'utf8');
  const match = FRONTMATTER.exec(raw);
  if (!match?.[1]) {
    throw runtimeFailure({
      code: 'SKILL_FRONTMATTER_MISSING',
      message: `${name}/SKILL.md has no YAML frontmatter block.`,
      skill: 'skills',
      skillVersion: '1.0.0',
    });
  }

  const frontmatter = parseYaml(match[1]) as SkillFrontmatter;
  if (!Array.isArray(frontmatter.entrypoint) || frontmatter.entrypoint.length === 0) {
    throw runtimeFailure({
      code: 'SKILL_ENTRYPOINT_INVALID',
      message: `${name}/SKILL.md must declare \`entrypoint\` as a non-empty argv array. A string would have to be shell-split, and shell-free spawning is what removes an entire injection class (tech-spec §6.2).`,
      skill: 'skills',
      skillVersion: '1.0.0',
      details: { entrypoint: frontmatter.entrypoint },
    });
  }
  return { frontmatter, dir };
}

export function listSkillNames(): string[] {
  if (!existsSync(SKILLS_ROOT)) return [];
  return readdirSync(SKILLS_ROOT)
    .filter((entry) => {
      const p = join(SKILLS_ROOT, entry);
      return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'));
    })
    .sort();
}

export interface RunSkillOptions {
  inputPath: string;
  outputPath: string;
  /** W3C traceparent, propagated explicitly — there is no automatic propagation across spawn (tech-spec §13). */
  traceparent?: string | undefined;
}

export interface RunSkillResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Parsed structured error when the skill failed and spoke the contract. */
  structuredError: StructuredError | null;
  durationMs: number;
}

/**
 * Spawn a skill's entrypoint argv directly, appending `--input`/`--output`.
 *
 * Deliberately NOT "run an executable file": bare executables need shebangs or
 * exec bits that do not exist on Windows — the primary dev machine — and
 * shell-free argv spawning removes shell injection entirely. If you ever find
 * yourself writing a `.cmd` shim here, you are off-contract.
 */
export function runSkill(skill: Skill, options: RunSkillOptions): RunSkillResult {
  const [command, ...rest] = skill.frontmatter.entrypoint;
  if (!command) {
    throw runtimeFailure({
      code: 'SKILL_ENTRYPOINT_INVALID',
      message: `${skill.frontmatter.name} has an empty entrypoint.`,
      skill: skill.frontmatter.name,
      skillVersion: skill.frontmatter.skillVersion,
    });
  }

  const argv = [...rest, '--input', options.inputPath, '--output', options.outputPath];

  const env: NodeJS.ProcessEnv = { ...process.env, CUTDOWN_WORKSPACE_ROOT: WORKSPACE_ROOT };
  if (options.traceparent) env['TRACEPARENT'] = options.traceparent;

  const startedAt = Date.now();
  const result = spawnSync(command, argv, {
    cwd: skill.dir,
    env,
    encoding: 'utf8',
    shell: false,
    timeout: skill.frontmatter.timeoutSeconds * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Date.now() - startedAt;

  if (result.error) {
    const timedOut = (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT';
    throw runtimeFailure({
      code: timedOut ? 'SKILL_TIMEOUT' : 'SKILL_SPAWN_FAILED',
      message: timedOut
        ? `${skill.frontmatter.name} exceeded its declared timeout of ${skill.frontmatter.timeoutSeconds}s and was killed.`
        : `Could not start ${skill.frontmatter.name}: ${result.error.message}`,
      skill: skill.frontmatter.name,
      skillVersion: skill.frontmatter.skillVersion,
      details: { entrypoint: skill.frontmatter.entrypoint, durationMs },
    });
  }

  return {
    exitCode: result.status ?? EXIT_RUNTIME_FAILURE,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    structuredError: parseStructuredError(result.stderr ?? ''),
    durationMs,
  };
}

/**
 * Recover the structured error object a failing skill wrote to stderr.
 *
 * Tolerant of leading noise (a warning from a dependency, say) by scanning for
 * the last JSON object in the stream — but never invents one: unparseable
 * stderr returns null and the caller surfaces the raw text instead of
 * pretending the skill spoke the contract.
 */
export function parseStructuredError(stderr: string): StructuredError | null {
  const start = stderr.indexOf('{');
  if (start === -1) return null;
  const candidate = stderr.slice(start).trim();
  try {
    const parsed = JSON.parse(candidate) as Partial<StructuredError>;
    if (typeof parsed.code === 'string' && typeof parsed.message === 'string') {
      return parsed as StructuredError;
    }
  } catch {
    /* not the contract's error object */
  }
  return null;
}

/**
 * Write JSON atomically: temp file in the same directory, then rename.
 *
 * tech-spec §6.2 requires output writes to be atomic, and §5 makes the point
 * that matters — the presence of an output file is only trusted alongside its
 * run-log completion entry. A same-directory rename is atomic on both NTFS and
 * POSIX; writing to a temp dir and renaming across volumes is not.
 */
export function writeJsonAtomic(path: string, value: unknown): void {
  const dir = join(path, '..');
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export { CutdownError };
