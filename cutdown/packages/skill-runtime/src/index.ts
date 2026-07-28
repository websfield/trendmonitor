import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { dirname, join, resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import * as ajvFormats from 'ajv-formats';

import { createAjv, formatAjvErrors, listAllSchemaFiles } from '@cutdown/contracts';

const addFormats = (ajvFormats as unknown as { default: FormatsPlugin }).default;

/**
 * The skill execution contract (tech-spec §6.2), implemented exactly once.
 *
 * Every skill — regardless of language on the TypeScript side — owes the same
 * behaviour, and every one of these clauses is a place a hand-rolled `main()`
 * would eventually get it wrong:
 *
 *  - Validate the request against `schema/input.json` BEFORE doing anything else.
 *  - On validation failure, exit 2 with a structured error on stderr and
 *    **never** a partial write to `--output`.
 *  - On success, write a result conforming to `schema/output.json`, ATOMICALLY
 *    (temp file + rename), and exit 0.
 *  - On runtime failure, exit 3 with a structured error.
 *  - Never write a stack trace to stderr — callers parse this stream.
 *
 * The output is validated too, not just the input. A skill that writes a result
 * its own declared schema rejects has broken the contract just as surely as one
 * that accepts a bad request, and it fails *here* rather than three stages later
 * when something tries to read the malformed artefact.
 */

export const EXIT_OK = 0;
export const EXIT_UNEXPECTED = 1;
export const EXIT_INPUT_INVALID = 2;
export const EXIT_RUNTIME_FAILURE = 3;

export interface StructuredError {
  code: string;
  message: string;
  skill: string;
  skillVersion: string;
  details?: unknown;
}

export class SkillError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details: unknown;

  constructor(code: string, message: string, exitCode: number, details?: unknown) {
    super(message);
    this.name = 'SkillError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

/** The skill could not do the work. Input was fine. */
export function fail(code: string, message: string, details?: unknown): SkillError {
  return new SkillError(code, message, EXIT_RUNTIME_FAILURE, details);
}

/** The caller sent something wrong. */
export function reject(code: string, message: string, details?: unknown): SkillError {
  return new SkillError(code, message, EXIT_INPUT_INVALID, details);
}

export interface SkillContext {
  skill: string;
  skillVersion: string;
  /** Absolute path to the skill directory — also this process's cwd. */
  skillDir: string;
  /** Absolute path to `cutdown/`. */
  workspaceRoot: string;
  /** The W3C traceparent handed down by the caller, if any (tech-spec §13). */
  traceparent: string | undefined;
}

export interface SkillDefinition<TRequest, TResult> {
  name: string;
  version: string;
  /** Relative to the skill directory, e.g. `./schema/input.json`. */
  inputSchema: string;
  outputSchema: string;
  run(request: TRequest, ctx: SkillContext): Promise<TResult>;
}

function loadSchema(skillDir: string, relPath: string): object {
  return JSON.parse(readFileSync(resolve(skillDir, relPath), 'utf8')) as object;
}

/**
 * Build an Ajv that knows the skill's own schemas AND every contract schema.
 *
 * Skill schemas legitimately `$ref` contract schemas, so both must be
 * registered on one instance for those references to resolve.
 */
function createSkillAjv(skillDir: string, def: SkillDefinition<unknown, unknown>): {
  validateInput: ReturnType<Ajv2020['compile']>;
  validateOutput: ReturnType<Ajv2020['compile']>;
} {
  const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: true });
  addFormats(ajv);
  ajv.addKeyword({ keyword: 'schemaVersion', metaSchema: { type: 'string' } });
  ajv.addKeyword({ keyword: 'changelog', metaSchema: { type: 'array' } });
  for (const file of listAllSchemaFiles()) {
    ajv.addSchema(JSON.parse(readFileSync(file, 'utf8')) as object);
  }
  return {
    validateInput: ajv.compile(loadSchema(skillDir, def.inputSchema)),
    validateOutput: ajv.compile(loadSchema(skillDir, def.outputSchema)),
  };
}

/** Atomic JSON write: temp file beside the target, then rename. */
export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

/** A shared Ajv over the contract schemas, for skills validating artefacts they produce. */
export function contractValidator(): Ajv2020 {
  return createAjv();
}

export { formatAjvErrors };

/**
 * Run a skill as a process. Call this from the skill's `main.ts` and nothing else.
 */
export async function runSkillMain<TRequest, TResult>(
  def: SkillDefinition<TRequest, TResult>,
): Promise<void> {
  const skillDir = process.cwd();
  const emit = (error: StructuredError, exitCode: number): void => {
    process.stderr.write(`${JSON.stringify(error, null, 2)}\n`);
    process.exitCode = exitCode;
  };

  let inputPath: string;
  let outputPath: string;
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: { input: { type: 'string' }, output: { type: 'string' } },
      allowPositionals: false,
      strict: true,
    });
    if (typeof values.input !== 'string' || typeof values.output !== 'string') {
      throw new Error('Both --input and --output are required.');
    }
    inputPath = resolve(values.input);
    outputPath = resolve(values.output);
  } catch (err) {
    emit(
      {
        code: 'SKILL_ARGS_INVALID',
        message: `${def.name} expects --input <path> --output <path>. ${(err as Error).message}`,
        skill: def.name,
        skillVersion: def.version,
      },
      EXIT_INPUT_INVALID,
    );
    return;
  }

  try {
    const { validateInput, validateOutput } = createSkillAjv(skillDir, def as SkillDefinition<unknown, unknown>);

    let request: unknown;
    try {
      request = JSON.parse(readFileSync(inputPath, 'utf8'));
    } catch (err) {
      throw reject('REQUEST_UNREADABLE', `Could not read request at ${inputPath}: ${(err as Error).message}`);
    }

    if (!validateInput(request)) {
      throw reject(
        'REQUEST_SCHEMA_INVALID',
        `The request does not satisfy ${def.name}'s input schema.`,
        { errors: validateInput.errors, formatted: formatAjvErrors(validateInput.errors) },
      );
    }

    const ctx: SkillContext = {
      skill: def.name,
      skillVersion: def.version,
      skillDir,
      workspaceRoot: process.env['CUTDOWN_WORKSPACE_ROOT'] ?? resolve(skillDir, '..', '..'),
      traceparent: process.env['TRACEPARENT'],
    };

    const result = await def.run(request as TRequest, ctx);

    if (!validateOutput(result)) {
      // Deliberately a RUNTIME failure, not an input failure: the caller did
      // nothing wrong; the skill produced something its own contract forbids.
      throw fail(
        'RESULT_SCHEMA_INVALID',
        `${def.name} produced a result its own output schema rejects. This is a defect in the skill.`,
        { errors: validateOutput.errors, formatted: formatAjvErrors(validateOutput.errors) },
      );
    }

    writeJsonAtomic(outputPath, result);
    process.exitCode = EXIT_OK;
  } catch (err) {
    if (err instanceof SkillError) {
      emit(
        {
          code: err.code,
          message: err.message,
          skill: def.name,
          skillVersion: def.version,
          details: err.details,
        },
        err.exitCode,
      );
      return;
    }
    // An error that is not a SkillError is still a RUNTIME failure as far as
    // the caller is concerned, so it exits 3 — §6.2 defines only 2 and 3, and
    // emitting 1 would put an undefined code on the contract. The stack is
    // deliberately NOT included: this stream is parsed by four different
    // callers, it is surfaced verbatim to humans, and absolute local paths in a
    // stack trace are noise at best. `errorType` keeps the diagnostic value.
    emit(
      {
        code: 'UNEXPECTED_ERROR',
        message: err instanceof Error ? err.message : String(err),
        skill: def.name,
        skillVersion: def.version,
        details: { errorType: err instanceof Error ? err.name : typeof err },
      },
      EXIT_RUNTIME_FAILURE,
    );
  }
}

/** Envelope for a freshly produced artefact (tech-spec §3). */
export function skillEnvelope(skill: string, skillVersion: string) {
  return {
    schemaVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    createdBy: { kind: 'skill' as const, skill, skillVersion },
  };
}

/** `project-data/jobs/<jobId>/` for a skill that knows the workspace root. */
export function jobDir(workspaceRoot: string, jobId: string): string {
  return join(workspaceRoot, 'project-data', 'jobs', jobId);
}
