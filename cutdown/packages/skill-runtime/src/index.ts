import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { dirname, join, resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import * as ajvFormats from 'ajv-formats';

import {
  ArtefactPathError,
  assertContainedLexical,
  assertContainedPhysicalPath,
  assertJobRelativePath,
  createAjv,
  formatAjvErrors,
  listAllSchemaFiles,
  resolveArtefactPath,
} from '@cutdown/contracts';

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

/**
 * Run a path guard from `@cutdown/contracts` and re-raise as a SkillError.
 *
 * The guards moved into `contracts` so `renderer-ffmpeg` — which does not depend on
 * this package — can use the same implementation instead of a bare `join`. Exit-code
 * semantics stay HERE: a bad artefact path is a caller error (exit 2), and `contracts`
 * has no business knowing about exit codes.
 */
function asSkillError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ArtefactPathError) throw reject(error.code, error.message, error.details);
    throw error;
  }
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

/**
 * Envelope for a freshly produced artefact (tech-spec §3).
 *
 * `contractVersion` is the schema version the instance is written against and
 * defaults to '1.0.0'. A producer emitting a contract whose schema has moved
 * (e.g. platform-edl-v1 at 1.1.0 since the D-52 transition field) passes the
 * real version — an envelope claiming 1.0.0 for an instance using a 1.1.0
 * field would be a false statement the validators happen to accept.
 */
export function skillEnvelope(skill: string, skillVersion: string, contractVersion = '1.0.0') {
  return {
    schemaVersion: contractVersion,
    createdAt: new Date().toISOString(),
    createdBy: { kind: 'skill' as const, skill, skillVersion },
  };
}

/**
 * The shape a job id may take, because it becomes a directory name.
 *
 * Mirrors `assertSafeJobId` in `apps/cli/src/paths.ts` deliberately: the CLI needs
 * it before it can build a request path, and the skill runtime needs it because a
 * skill is directly invocable and must not depend on who called it.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Windows reserved DEVICE names, which are legal filenames everywhere else.
 *
 * Not a traversal — a reliability failure, and the claim here is limited to what
 * was actually MEASURED on the D-33 machine (Windows 11, CPython + cmd.exe),
 * because the obvious version of this comment is false:
 *
 *   - `nul` (and `nul.` — Windows strips the trailing dot) IS the null device: a
 *     file of that name accepts writes, reports 0 bytes and never appears in a
 *     directory listing. As a *directory* — the case that matters, since these
 *     are ids that become path segments — `mkdir` appears to succeed and then
 *     every child write fails with "no such file or directory" on a path that
 *     looks like it exists. Confusing, not silent.
 *   - `nul.json`, `con`, `aux`, `prn`, `com1`, `lpt1` measured as ORDINARY files
 *     here. They are still reserved in the Win32 device namespace and behave
 *     differently across Windows builds, shells and APIs, so they are refused
 *     for portability — deliberately rejecting a superset of what misbehaves on
 *     this one machine, which is the safe direction to be wrong in.
 *
 * `assertSafeId` is covered by a Windows-gated test that MEASURES the `nul` case
 * rather than restating it, per this project's "a comment claiming a property is
 * not the property" rule.
 *
 * Enforced in the three CODE guards rather than in the ten skill input schemas.
 * A case-insensitive alternation IS expressible in ECMA-262 with character
 * classes (`[Cc][Oo][Nn]…`) — the reason is verbosity across ten hand-maintained
 * schema files, not impossibility. The division is deliberate: schemas validate
 * shape, these guards own containment, and they sit where the path is built.
 *
 * `\Z`-equivalent anchoring matters: the Python mirror must use `\Z`, since its
 * `$` also matches before a trailing newline. `tests/safe-id-cases.json` is the
 * shared fixture that pins all three mirrors to the same verdicts.
 */
const WINDOWS_RESERVED_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/**
 * Reject an id that could escape the directory it is about to name.
 *
 * Exported so a skill can guard any OTHER id it turns into a path (an assetId, a
 * manifest id) with the same rule rather than inventing a second one.
 */
export function assertSafeId(value: string, what: string): void {
  if (!SAFE_ID.test(value) || value.includes('..')) {
    throw reject(
      'UNSAFE_ID',
      `${what} ${JSON.stringify(value)} is not a safe path component. Use letters, digits, dot, dash or underscore (max 64 chars): it becomes a directory name, and a traversing value would put client media somewhere nobody is looking for it.`,
      { value, what },
    );
  }
  if (WINDOWS_RESERVED_DEVICE.test(value)) {
    throw reject(
      'UNSAFE_ID',
      `${what} ${JSON.stringify(value)} names a device in the Windows reserved namespace, and it becomes a directory name. \`nul\` is the worst case — the directory appears to be created and then every write inside it fails with "no such file or directory" — and the rest are unreliable across Windows builds and APIs. Choose another ${what}.`,
      { value, what },
    );
  }
}

/**
 * Assert `candidate` resolves inside `root`, LEXICALLY.
 *
 * The belt to `assertSafeId`'s braces, and the one that does not depend on a regex
 * being exhaustive. Compared with a trailing separator so `.../jobs-evil` cannot
 * pass as a child of `.../jobs`.
 *
 * **Lexical, not physical**: `resolve()` normalises `..` but does not follow symlinks,
 * so a symlink INSIDE the job that points outside it satisfies this check. That is a
 * deliberate difference from the Python twin (`assert_contained` in `harness.py` uses
 * `Path.resolve()`, which does follow links) and it is stated here rather than left
 * for a reader to assume the two are equivalent. Use `assertContainedPhysical` for a
 * path that will be READ or COPIED, where following a link actually matters.
 */
export function assertContained(root: string, candidate: string, what: string): void {
  asSkillError(() => assertContainedLexical(root, candidate, what));
}

/**
 * `project-data/jobs/<jobId>/` — GUARDED, because this is where a job id becomes a
 * filesystem path.
 *
 * The guard lives here rather than in each skill for the reason the 2026-07-21
 * ledger entry records for `harness.py`: `main.py`'s own docstring documented direct
 * invocation, so a guard that lived only in the caller had a documented bypass. The
 * same is true of every skill here — `entrypoint` in each `SKILL.md` IS a documented
 * direct invocation, and `cutdown skills run --job <safe>` passes the request file
 * through unmodified, so the request's own `jobId` never met the CLI's assertion.
 *
 * Both halves are applied: the id must be a safe component, AND the result must
 * resolve inside the jobs root. The second does not depend on the first being
 * exhaustive.
 */
export function jobDir(workspaceRoot: string, jobId: string): string {
  assertSafeId(jobId, 'Job id');
  const jobsRoot = join(workspaceRoot, 'project-data', 'jobs');
  const dir = join(jobsRoot, jobId);
  assertContained(jobsRoot, dir, `Job directory for ${JSON.stringify(jobId)}`);
  return dir;
}

/**
 * Assert `candidate` resolves inside `root` after resolving symlinks.
 *
 * The physical counterpart to `assertContained`, for a path about to be read or copied
 * — a symlink inside a job pointing at something outside it would otherwise be
 * followed into a delivered package.
 *
 * When the candidate does not exist yet (a WRITE target), the nearest existing
 * ANCESTOR is resolved instead of falling back to the lexical check. "The leaf is
 * missing" is not an escape, but it is also not safety: `<job>/link/out.mp4` where
 * `link` is a symlink out of the job made `realpathSync` throw on the missing leaf,
 * and returning there let the write land outside the job. The ancestor carries the
 * link, so resolving it is what actually answers the question.
 */
export function assertContainedPhysical(root: string, candidate: string, what: string): void {
  asSkillError(() => assertContainedPhysicalPath(root, candidate, what));
}

/**
 * Assert a path read out of a STORED ARTEFACT is job-relative before it is joined.
 *
 * `render.outputPath`, `render.captions.*Path` and `asset.storedPath` are described
 * as job-relative but carry no pattern in their schemas, and they are read with
 * `JSON.parse` — so a traversing value in an artefact reaches `copyFileSync` and
 * lands whatever it points at inside a bundle that is about to be handed to a
 * client. `split('/')` does not save it: a backslash value stays one component and
 * `path.win32.join` normalises it anyway (verified).
 */
export function assertJobRelative(value: string, what: string): void {
  asSkillError(() => assertJobRelativePath(value, what));
}

/**
 * Resolve a stored job-relative path against a job root, guarded both ways.
 *
 * The one call every artefact-derived path should go through, so the check cannot be
 * forgotten at a call site.
 */
export function resolveJobRelative(jobRoot: string, value: string, what: string): string {
  return asSkillError(() => resolveArtefactPath(jobRoot, value, what));
}


/**
 * A contract `$id` from its file basename.
 *
 * Derived rather than pasted per contract: I typed the wrong host into a
 * hand-written map on the first cut, and an unresolvable `$id` fails CLOSED here
 * (`CONTRACT_SCHEMA_MISSING`), so the typo would have surfaced as "the schema is
 * missing" rather than "the URL is wrong".
 */
export function contractSchemaId(basename: string): string {
  return `https://cutdown.local/contracts/schemas/${basename}.json`;
}

/** One Ajv per process: `contractValidator()` reads ~20 schema files off disk. */
let sharedContractAjv: Ajv2020 | null = null;

/**
 * Read a stored artefact and VALIDATE it against its contract before returning it.
 *
 * Here rather than per skill, because "guard the field the reviewer named" has now
 * produced THREE recurrences of one defect: an id is read out of an artefact with a
 * bare `JSON.parse` + cast, joined into a filesystem path, the named field gets an
 * `assertSafeId`, and the sibling on the next line is missed. Validating the whole
 * artefact at the boundary enforces every `$ref: Ulid` in its schema at once, so
 * there is no per-field guard left to forget — which is what actually stops a fourth
 * recurrence.
 *
 * A truncated or hand-edited artefact also becomes a NAMED refusal here instead of a
 * `TypeError` surfacing as `UNEXPECTED_ERROR` three frames later.
 *
 * The parser's own message is deliberately NOT echoed: `JSON.parse` quotes the
 * offending input, so `<10 bytes of ${path}>` reaches stderr, and a caller-supplied
 * path turns that into a file-read oracle. The path and the fact of the failure are
 * enough to fix a broken artefact.
 */
export function readContractJson<T>(path: string, schemaId: string, code: string, what: string): T {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw fail(code, `${what} could not be read at ${path}.`);
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw fail(code, `${what} at ${path} is not valid JSON.`);
  }
  return validateContract<T>(candidate, schemaId, code, `${what} at ${path}`);
}

/**
 * Read a stored artefact whose contract family spans more than one major, and
 * validate it against the major the artefact itself DECLARES.
 *
 * Dispatch keys on `envelope.schemaVersion` — the envelope field every contract
 * instance is required to carry — never on try-in-order validation: a v2 instance
 * also satisfies v1's shape (v2 only narrows), so trying majors in sequence would
 * silently mask a mislabelled instance. A record that declares major 2 and fails
 * v2's constraints is invalid, full stop; it is not retried against v1
 * (`packages/skill-runtime/tests/versioned-read.test.ts` pins this).
 *
 * A declared major no basename covers is refused FAIL CLOSED with the accepted
 * majors named and a non-destructive remedy — the `reviews.ts` posture: never
 * instruct anyone to delete evidence.
 *
 * `basenames` are contract file basenames (e.g. `['render-v1', 'render-v2']`),
 * the same tokens `contractSchemaId` takes. First consumer: `skills/package`
 * reading render records across the Stage 0B-3 `render-v2` bump (D-62).
 */
export function readVersionedContractJson<T>(path: string, basenames: string[], code: string, what: string): T {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw fail(code, `${what} could not be read at ${path}.`);
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw fail(code, `${what} at ${path} is not valid JSON.`);
  }
  // `JSON.parse` happily returns `null`, a number, or a string — none of which
  // can carry an envelope, and reading `.envelope` off `null` would surface as
  // the exact unnamed TypeError this helper's sibling exists to prevent.
  if (candidate === null || typeof candidate !== 'object') {
    throw fail(code, `${what} at ${path} carries no readable envelope.schemaVersion, so its contract major cannot be determined.`);
  }
  const envelope = (candidate as { envelope?: { schemaVersion?: unknown } }).envelope;
  const declared = envelope?.schemaVersion;
  if (typeof declared !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(declared)) {
    throw fail(code, `${what} at ${path} carries no readable envelope.schemaVersion, so its contract major cannot be determined.`);
  }
  const declaredMajor = Number(declared.split('.')[0]);
  const byMajor = new Map<number, string>();
  for (const basename of basenames) {
    const suffix = /-v([0-9]+)$/.exec(basename);
    if (suffix === null) {
      throw fail('CONTRACT_SCHEMA_MISSING', `${basename} carries no -vN suffix, so it cannot participate in major dispatch.`);
    }
    if (byMajor.has(Number(suffix[1]))) {
      // A caller error, made loud: two basenames claiming one major would let
      // Map's silent last-wins decide which schema validates the artefact.
      throw fail('CONTRACT_SCHEMA_MISSING', `two basenames claim major ${suffix[1] ?? ''}; dispatch needs one schema per major.`);
    }
    byMajor.set(Number(suffix[1]), basename);
  }
  const basename = byMajor.get(declaredMajor);
  if (basename === undefined) {
    const accepted = [...byMajor.keys()].sort((a, b) => a - b).join(', ');
    throw fail(
      code,
      `${what} at ${path} declares schemaVersion ${declared}, whose major (${String(declaredMajor)}) is not one this reader accepts (accepted: ${accepted}). ` +
        `Re-run the skill that produced it, or move the file aside for inspection — never delete evidence.`,
    );
  }
  return validateContract<T>(candidate, contractSchemaId(basename), code, `${what} at ${path}`);
}

/**
 * The validation half of `readContractJson`, for a value already in hand.
 *
 * Exists because several artefacts are stored as an ARRAY of contract objects — a
 * `moments/*.json` file is a list of `moment-v1` records — and each ELEMENT is what
 * carries the `$ref: Ulid` fields that become filesystem paths. Validating the array
 * as one document would need a wrapper schema that does not exist; validating each
 * element is what actually enforces the ids.
 */
export function validateContract<T>(candidate: unknown, schemaId: string, code: string, what: string): T {
  sharedContractAjv ??= contractValidator();
  const validate = sharedContractAjv.getSchema(schemaId);
  if (validate === undefined) {
    // Fail closed: an unregistered schema means NOTHING can be shown to be valid.
    throw fail('CONTRACT_SCHEMA_MISSING', `${schemaId} is not registered, so ${what} cannot be validated.`);
  }
  if (!validate(candidate)) {
    throw fail(
      code,
      `${what} does not satisfy ${schemaId.split('/').pop() ?? schemaId}: ` +
        `${formatAjvErrors(validate.errors)}. A stored artefact that fails its own contract is not ` +
        `trustworthy input — several of its ids become filesystem paths.`,
    );
  }
  return candidate as T;
}
