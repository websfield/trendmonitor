/**
 * The structured error shape every skill and every caller speaks (tech-spec §6.2).
 *
 * One JSON object on stderr — never a stack trace, never prose. Four callers
 * have to surface these identically (CLI, local runner, Temporal activity, HTTP
 * shim), and a human reading a Claude Code transcript has to understand them
 * too, so the shape is fixed here and reused rather than reinvented per skill.
 */

/** Exit codes are part of the contract, not an implementation detail. */
export const EXIT_OK = 0;
/** Reserved for a genuinely unexpected crash — not part of the skill contract. */
export const EXIT_UNEXPECTED = 1;
/** Input failed schema validation. The caller sent something wrong. */
export const EXIT_INPUT_INVALID = 2;
/** The skill ran and failed. The input was fine; the work was not possible. */
export const EXIT_RUNTIME_FAILURE = 3;

export interface StructuredError {
  /** Stable, greppable, SCREAMING_SNAKE. Not a sentence. */
  code: string;
  /** One human sentence. Says what happened and, where possible, what to do. */
  message: string;
  skill: string;
  skillVersion: string;
  /** Anything machine-useful: offending paths, field names, validator output. */
  details?: unknown;
}

export class CutdownError extends Error {
  readonly code: string;
  readonly skill: string;
  readonly skillVersion: string;
  readonly exitCode: number;
  readonly details: unknown;

  constructor(init: StructuredError & { exitCode: number }) {
    super(init.message);
    this.name = 'CutdownError';
    this.code = init.code;
    this.skill = init.skill;
    this.skillVersion = init.skillVersion;
    this.exitCode = init.exitCode;
    this.details = init.details;
  }

  toStructured(): StructuredError {
    const out: StructuredError = {
      code: this.code,
      message: this.message,
      skill: this.skill,
      skillVersion: this.skillVersion,
    };
    if (this.details !== undefined) out.details = this.details;
    return out;
  }
}

export function inputInvalid(
  init: Omit<StructuredError, never>,
): CutdownError {
  return new CutdownError({ ...init, exitCode: EXIT_INPUT_INVALID });
}

export function runtimeFailure(
  init: Omit<StructuredError, never>,
): CutdownError {
  return new CutdownError({ ...init, exitCode: EXIT_RUNTIME_FAILURE });
}

/**
 * Write a structured error to stderr and return its exit code.
 *
 * Anything that is not already a CutdownError is wrapped rather than leaked:
 * a caller parsing stderr must never have to distinguish "a skill failed" from
 * "Node threw". The original message is preserved in `details`.
 */
export function reportError(err: unknown, skill: string, skillVersion: string): number {
  const structured: StructuredError =
    err instanceof CutdownError
      ? err.toStructured()
      : {
          code: 'UNEXPECTED_ERROR',
          message: err instanceof Error ? err.message : String(err),
          skill,
          skillVersion,
          details: err instanceof Error ? { stack: err.stack } : undefined,
        };

  process.stderr.write(`${JSON.stringify(structured, null, 2)}\n`);
  return err instanceof CutdownError ? err.exitCode : EXIT_UNEXPECTED;
}
