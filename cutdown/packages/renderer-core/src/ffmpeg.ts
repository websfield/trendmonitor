import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';

/**
 * The single sanctioned FFmpeg/ffprobe entrypoint (tech-spec §11).
 *
 * No other module in Cutdown may spawn `ffmpeg` or `ffprobe`. That is a hard
 * rule rather than a style preference, because the two things this process
 * consumes — **source filenames and caption text** — are both user-controlled,
 * and FFmpeg's argument surface is far more dangerous than it looks:
 *
 *   1. A filename beginning with `-` is parsed as an OPTION, not a path. A file
 *      called `-vf` turns an ingest into arbitrary filter execution.
 *   2. FFmpeg resolves *protocols* from the input string. Without an explicit
 *      whitelist, `concat:a|b`, `http://…`, `subfile:…`, and `crypto:…` are all
 *      reachable through nothing more than a crafted filename — an SSRF and a
 *      local-file-disclosure primitive in one.
 *   3. Caption text is interpolated into a FILTERGRAPH, and the escaping that
 *      matters there is FFmpeg's own two-level filtergraph syntax, not shell
 *      quoting. Reaching for shell escaping here is the wrong frame entirely:
 *      we never use a shell (`shell: false`, always), so shell metacharacters
 *      are inert — while `:`, `'`, `[`, `]`, `,`, `;`, `=` and `\` are live
 *      metacharacters that let caption text break out of its filter option and
 *      append filters of the attacker's choosing.
 *
 * Centralising the spawn is what makes those three defences checkable in one
 * place instead of being re-argued at every call site. `assertSafeArgv()` below
 * enforces 1 and 2 on the assembled argv itself, so a caller that forgets to
 * use `inputArgs()` fails loudly rather than silently opening the hole.
 *
 * Phase 4 hardens this module further (resource limits, sandboxing); this file
 * establishes the contract those additions extend.
 */

// ---------------------------------------------------------------------------
// Structured errors (tech-spec §6.2)
// ---------------------------------------------------------------------------

/** Exit code for an input-validation failure (tech-spec §6.2). */
export const EXIT_INPUT_VALIDATION = 2;
/** Exit code for a runtime failure (tech-spec §6.2). */
export const EXIT_RUNTIME = 3;

/**
 * The one JSON object a skill writes to stderr on failure (tech-spec §6.2).
 * Every caller — CLI, local runner, Temporal activity, HTTP shim — surfaces
 * this object rather than a stack trace, which is why it is a contract-shaped
 * payload and not just an Error subclass.
 */
export interface SkillErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly skill: string;
  readonly skillVersion: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Who is reporting the error. Defaults to this package. */
export interface SkillIdentity {
  readonly skill: string;
  readonly skillVersion: string;
}

export const RENDERER_CORE_IDENTITY: SkillIdentity = {
  skill: 'renderer-core',
  skillVersion: '0.1.0',
};

/**
 * A failure with a §6.2-shaped payload attached.
 *
 * `exitCode` is carried on the error rather than decided at the catch site, so
 * the input-validation-vs-runtime distinction is made by whoever actually knows
 * which it was. A rejected filename is 2; a decoder that fell over is 3.
 */
export class FfmpegError extends Error {
  readonly code: string;
  readonly skill: string;
  readonly skillVersion: string;
  readonly details: Readonly<Record<string, unknown>> | undefined;
  readonly exitCode: number;

  constructor(init: {
    code: string;
    message: string;
    exitCode: number;
    identity?: SkillIdentity;
    details?: Readonly<Record<string, unknown>>;
  }) {
    super(init.message);
    this.name = 'FfmpegError';
    this.code = init.code;
    const identity = init.identity ?? RENDERER_CORE_IDENTITY;
    this.skill = identity.skill;
    this.skillVersion = identity.skillVersion;
    this.details = init.details;
    this.exitCode = init.exitCode;
  }

  /** The exact object that goes on stderr. `details` is omitted when absent. */
  toPayload(): SkillErrorPayload {
    const base = {
      code: this.code,
      message: this.message,
      skill: this.skill,
      skillVersion: this.skillVersion,
    };
    return this.details === undefined ? base : { ...base, details: this.details };
  }
}

const inputError = (
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): FfmpegError =>
  new FfmpegError(
    details === undefined
      ? { code, message, exitCode: EXIT_INPUT_VALIDATION }
      : { code, message, exitCode: EXIT_INPUT_VALIDATION, details },
  );

const runtimeError = (
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): FfmpegError =>
  new FfmpegError(
    details === undefined
      ? { code, message, exitCode: EXIT_RUNTIME }
      : { code, message, exitCode: EXIT_RUNTIME, details },
  );

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

/**
 * The only protocols FFmpeg may resolve. `file` for real paths, `pipe` for the
 * `-f null -` sink and `pipe:1` progress stream. Everything else — `concat:`,
 * `http:`, `https:`, `subfile:`, `crypto:`, `data:` — is unreachable.
 */
/**
 * The media binaries this module — and, per tech-spec §11, ONLY this module —
 * may spawn.
 *
 * Exported so that other modules can REFUSE to spawn them without naming them
 * themselves. That indirection is not decoration: §11's enforcing test
 * (`tests/determinism.test.ts`) detects a file that both imports
 * `node:child_process` and names one of these in a string literal, so a generic
 * process-spawning helper elsewhere in the workspace cannot state its own
 * refusal list without tripping the very rule it is enforcing. Keeping the names
 * here gives the rule one home, in the file the rule is about.
 *
 * `ffplay` is included though nothing spawns it: it is the third binary of the
 * same distribution, and the set exists to be a boundary rather than an
 * inventory of what happens to be called today.
 */
export const MEDIA_BINARIES: ReadonlySet<string> = new Set(['ffmpeg', 'ffprobe', 'ffplay']);

export const PROTOCOL_WHITELIST = 'file,pipe';

/** Inputs FFmpeg is allowed to be pointed at that are not filesystem paths. */
const ALLOWED_PIPE_INPUTS = new Set(['-', 'pipe:', 'pipe:0']);

/**
 * Reject an input path that FFmpeg would misread, before it reaches argv.
 *
 * Three rejections, each closing a distinct hole:
 *
 *   - **Option-shaped** (leading `-`): FFmpeg's parser cannot tell a file named
 *     `-vf` from the `-vf` flag, and argv position does not disambiguate it.
 *   - **Non-absolute**: a relative path resolves against whatever cwd the
 *     caller happened to have. Ingest, the local runner, and a Temporal
 *     activity all run with different working directories, so a relative path
 *     is not merely unsafe, it is not even well-defined.
 *   - **Protocol-shaped** (`scheme:` prefix): belt-and-braces behind
 *     `-protocol_whitelist`. `concat:` and friends never get as far as the
 *     protocol layer. Windows drive letters (`C:\…`) are explicitly permitted —
 *     a single-letter scheme is not a protocol FFmpeg implements.
 */
export function assertSafeInputPath(path: string): string {
  if (path.length === 0) {
    throw inputError('EMPTY_INPUT_PATH', 'Input path is empty.');
  }
  if (path.startsWith('-')) {
    throw inputError(
      'OPTION_SHAPED_INPUT_PATH',
      `Input path is option-shaped (leading "-") and would be parsed as an FFmpeg option, not a file: ${path}`,
      { path },
    );
  }
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(path);
  if (scheme !== null && (scheme[1]?.length ?? 0) > 1) {
    throw inputError(
      'PROTOCOL_SHAPED_INPUT_PATH',
      `Input path names an FFmpeg protocol (${scheme[1]}:) rather than a file. Only ${PROTOCOL_WHITELIST} are permitted: ${path}`,
      { path, scheme: scheme[1] },
    );
  }
  if (!isAbsolute(path)) {
    throw inputError(
      'RELATIVE_INPUT_PATH',
      `Input path must be absolute; a relative path resolves against an unspecified working directory: ${path}`,
      { path },
    );
  }
  if (path.includes('\0')) {
    throw inputError('NUL_IN_INPUT_PATH', 'Input path contains a NUL byte.', { path });
  }
  return path;
}

/**
 * The argv fragment for one input. Always emits the whitelist immediately
 * before its `-i`, because `-protocol_whitelist` is a per-input option in
 * FFmpeg — setting it once before several inputs does not cover them all.
 */
export function inputArgs(path: string): readonly string[] {
  return ['-protocol_whitelist', PROTOCOL_WHITELIST, '-i', assertSafeInputPath(path)];
}

/**
 * Re-verify the assembled argv, so the hard rule holds even for a caller that
 * hand-built its arguments instead of using `inputArgs()`. Every `-i` must name
 * a validated absolute path (or an explicit pipe) and must be preceded by the
 * protocol whitelist. This is the check that makes §11 enforceable rather than
 * merely documented.
 */
export function assertSafeArgv(args: readonly string[]): void {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== '-i') continue;
    const target = args[i + 1];
    if (target === undefined) {
      throw inputError('DANGLING_INPUT_FLAG', 'Argument list ends with "-i" and no input.');
    }

    // `-f lavfi -i <graph>` is a SYNTHETIC input — a generated colour field,
    // test pattern, or silent audio bed — not a path, so neither the absolute-
    // path rule nor the protocol whitelist applies to it. This is the one
    // exception, and it is safe only under a standing condition: a lavfi graph
    // string is always authored by this codebase and NEVER carries user text.
    // Anything user-derived that must appear in a lavfi graph goes through
    // `escapeFiltergraphText()` first, exactly as it would in any other filter.
    if (args[i - 2] === '-f' && args[i - 1] === 'lavfi') continue;

    if (!ALLOWED_PIPE_INPUTS.has(target)) {
      assertSafeInputPath(target);
    }
    // `-protocol_whitelist` is a PER-INPUT option, so it must sit in the two
    // argv slots immediately before this `-i`. Scanning the whole prefix
    // instead — `args.slice(0, i).some(...)` — let one whitelist earlier in the
    // command satisfy every later input: `[-protocol_whitelist, file,pipe, -i,
    // a.mp4, -i, b.mp4]` would pass while `b.mp4` carried no whitelist at all.
    // That is the enforcement being weaker than the invariant it documents.
    const whitelisted =
      args[i - 2] === '-protocol_whitelist' && args[i - 1] === PROTOCOL_WHITELIST;
    if (!whitelisted) {
      throw inputError(
        'MISSING_PROTOCOL_WHITELIST',
        `Input "${target}" is not preceded by -protocol_whitelist ${PROTOCOL_WHITELIST}; crafted filenames could reach concat:/http:/subfile:.`,
        { input: target },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Filtergraph escaping
// ---------------------------------------------------------------------------

/**
 * FFmpeg unescapes a filtergraph in two passes, outermost first, so producing a
 * literal requires escaping in the reverse order — level 1 then level 2.
 *
 * Level 1 is the *filter option value* parser: `:` separates options, and `\`
 * and `'` are its escape characters.
 *
 * Level 2 is the *filtergraph description* parser: `[`, `]`, `,`, `;`, `=`
 * delimit pads, filters and arguments, plus `\` and `'` again.
 *
 * Composing them is what makes a literal `:` survive: level 1 turns it into
 * `\:`, then level 2 turns that backslash into `\\`, giving `\\:` in the graph
 * string. The graph parser consumes one backslash, the option parser consumes
 * the other, and the filter receives `:`. Escaping only once — the intuitive
 * mistake — leaves `\:` in the graph, where the graph parser eats the backslash
 * and the option parser sees a bare separator: caption text breaks out.
 *
 * Shell metacharacters are deliberately NOT in either set. We spawn with
 * `shell: false`, so `;`, `|`, `$` and backticks have no shell meaning here;
 * the ones that appear below are filtergraph metacharacters that happen to
 * overlap.
 */
const escapeLevel1 = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');

const escapeLevel2 = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[[\],;=]/g, (c) => `\\${c}`);

/**
 * Characters that cannot be represented in a filtergraph at all. A newline is
 * NOT among them — a literal newline is legal inside a `drawtext` value and is
 * how multi-line captions are expressed — but a carriage return and the other
 * C0 controls have no escape and no meaning, and silently stripping them would
 * change the rendered caption without saying so.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_IN_FILTER = /[\u0000-\u0009\u000B-\u001F\u007F]/;

/**
 * Escape user-derived text for interpolation into a filter option value —
 * caption text in `drawtext=text=…`, and any other value carrying user content.
 *
 * This is the function that stands between a caption and arbitrary filter
 * injection, so it rejects rather than mangles what it cannot represent.
 */
export function escapeFiltergraphText(text: string): string {
  const control = FORBIDDEN_IN_FILTER.exec(text);
  if (control !== null) {
    const codePoint = control[0].codePointAt(0) ?? 0;
    throw inputError(
      'CONTROL_CHAR_IN_FILTER_TEXT',
      `Filter text contains control character U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}, which has no filtergraph representation.`,
      { offset: control.index },
    );
  }
  return escapeLevel2(escapeLevel1(text));
}

/**
 * Escape a filesystem path for use INSIDE a filter — `subtitles=<path>`,
 * `drawtext=fontfile=<path>`, `movie=<path>`.
 *
 * Windows is the whole difficulty. `C:\fonts\x.ttf` contains a drive colon that
 * level 1 reads as an option separator, and backslashes that both levels read
 * as escapes; passed through raw it does not merely fail, it silently truncates
 * the path at the colon and reinterprets the remainder. Backslashes are first
 * normalised to forward slashes — FFmpeg accepts them on Windows — which
 * removes the backslash ambiguity entirely and leaves only the drive colon for
 * the two-level escape to handle. `C:\fonts\x.ttf` therefore becomes
 * `C\\:/fonts/x.ttf` in the graph string.
 *
 * Paths that enter a filter are validated with the same rules as `-i` inputs,
 * because a filter path is an input in every sense that matters.
 */
export function escapeFilterPath(path: string): string {
  assertSafeInputPath(path);
  return escapeFiltergraphText(path.replace(/\\/g, '/'));
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

export interface RunOptions {
  /** Milliseconds before the child is killed. A render that hangs is a render that never fails. */
  readonly timeoutMs?: number;
  /** Reported in any structured error raised by this run. */
  readonly identity?: SkillIdentity;
  /** Working directory. Irrelevant to correctness — every path is absolute — but honoured. */
  readonly cwd?: string;
}

export interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly argv: readonly string[];
}

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Spawn a binary with an argv array and **no shell**, ever.
 *
 * `shell: false` is passed explicitly rather than relied on as the default: it
 * is the single most consequential option in this file, and a default is not
 * something a reader should have to remember.
 *
 * A timeout kills the child and reports `code: 'TIMEOUT'`, deliberately
 * distinct from a non-zero exit. The two mean different things to a caller —
 * a timeout is retryable, a non-zero exit usually is not — and collapsing them
 * into "it failed" is how a stuck encode becomes an infinite retry loop.
 */
async function run(
  binary: string,
  args: readonly string[],
  options: RunOptions,
): Promise<RunResult> {
  assertSafeArgv(args);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return await new Promise<RunResult>((resolve, reject) => {
    const child = spawn(binary, [...args], {
      shell: false,
      windowsHide: true,
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    timer.unref?.();

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (cause: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      const missing = cause.code === 'ENOENT';
      reject(
        runtimeError(
          missing ? 'FFMPEG_NOT_FOUND' : 'FFMPEG_SPAWN_FAILED',
          missing
            ? `${binary} was not found on PATH. Cutdown requires an FFmpeg build with libass (developer-guide.md §1, decisions.md D-39).`
            : `Failed to spawn ${binary}: ${cause.message}`,
          { binary },
        ),
      );
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          runtimeError(
            'TIMEOUT',
            `${binary} exceeded its ${timeoutMs} ms timeout and was killed.`,
            { binary, timeoutMs, argv: [...args], stderr: stderr.slice(-4000) },
          ),
        );
        return;
      }
      resolve({ stdout, stderr, exitCode: code ?? (signal === null ? 1 : 1), argv: [...args] });
    });
  });
}

/** Run ffmpeg. Non-zero exit becomes a structured runtime error. */
export async function runFfmpeg(
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const result = await run('ffmpeg', args, options);
  if (result.exitCode !== 0) {
    throw runtimeError('FFMPEG_FAILED', `ffmpeg exited with code ${result.exitCode}.`, {
      exitCode: result.exitCode,
      argv: [...args],
      stderr: result.stderr.slice(-4000),
    });
  }
  return result;
}

/**
 * Run ffmpeg but tolerate a non-zero exit, returning it for the caller to
 * classify. Used only by the corruption probe, where a decode failure is the
 * measurement rather than an error.
 */
export async function runFfmpegAllowFailure(
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  return await run('ffmpeg', args, options);
}

/** Run ffprobe. Non-zero exit becomes a structured runtime error. */
export async function runFfprobe(
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const result = await run('ffprobe', args, options);
  if (result.exitCode !== 0) {
    throw runtimeError('FFPROBE_FAILED', `ffprobe exited with code ${result.exitCode}.`, {
      exitCode: result.exitCode,
      argv: [...args],
      stderr: result.stderr.slice(-4000),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Version and capabilities
// ---------------------------------------------------------------------------

let cachedVersion: string | undefined;

/**
 * The exact FFmpeg build string, e.g.
 * `ffmpeg version 8.0.1-full_build-www.gyan.dev …`.
 *
 * Recorded on every RenderManifest (tech-spec §11) and — because D-33 makes the
 * pinned local machine the only reproducibility surface Phase 0 has — this
 * string IS the environment half of the tier-1 byte-identical determinism proof
 * (§12). A render whose FFmpeg build string differs is not a determinism
 * failure, it is a different experiment, and only a recorded build string can
 * tell those apart.
 */
export async function ffmpegVersion(): Promise<string> {
  if (cachedVersion !== undefined) return cachedVersion;
  const { stdout } = await run('ffmpeg', ['-hide_banner', '-version'], { timeoutMs: 20_000 });
  const firstLine = stdout.split('\n')[0]?.trim() ?? '';
  if (firstLine.length === 0) {
    throw runtimeError('FFMPEG_VERSION_UNREADABLE', 'ffmpeg -version produced no output.');
  }
  cachedVersion = firstLine;
  return firstLine;
}

export interface FfmpegCapabilities {
  readonly version: string;
  /** `subtitles` — renders SRT/ASS via libass. The Phase 0 open-caption path. */
  readonly hasSubtitlesFilter: boolean;
  /** `ass` — renders ASS directly. Both are libass; both are required. */
  readonly hasAssFilter: boolean;
  readonly hasLibass: boolean;
}

let cachedCapabilities: FfmpegCapabilities | undefined;

/**
 * Enumerate the filters this build actually carries.
 *
 * Presence of `subtitles` and `ass` is the operational test for libass — the
 * property tech-spec §11 depends on and D-39 verified for this exact build.
 * A build string alone cannot answer it: "8.0.1" says nothing about which
 * `--enable-*` flags were set, and a minimal build silently lacks both filters.
 */
export async function probeCapabilities(): Promise<FfmpegCapabilities> {
  if (cachedCapabilities !== undefined) return cachedCapabilities;
  const [version, filters] = await Promise.all([
    ffmpegVersion(),
    run('ffmpeg', ['-hide_banner', '-filters'], { timeoutMs: 20_000 }),
  ]);
  // `ffmpeg -filters` lines look like `" .. subtitles         V->V   Render …"`.
  // The three-character flag column is NOT a fixed alphabet — an unsupported
  // flag prints as a SPACE, so a `[TSC.]{3}` pattern silently matches nothing
  // and every capability probe returns false. The `A->A` / `V->V` / `|->V`
  // arrow column is the unambiguous anchor, so the name is taken as the token
  // immediately preceding it.
  const names = new Set(
    filters.stdout
      .split('\n')
      .map((line) => {
        const tokens = line.trim().split(/\s+/);
        const arrow = tokens.findIndex((token) => token.includes('->'));
        return arrow > 0 ? tokens[arrow - 1] : undefined;
      })
      .filter((name): name is string => name !== undefined),
  );
  const hasSubtitlesFilter = names.has('subtitles');
  const hasAssFilter = names.has('ass');
  cachedCapabilities = {
    version,
    hasSubtitlesFilter,
    hasAssFilter,
    hasLibass: hasSubtitlesFilter && hasAssFilter,
  };
  return cachedCapabilities;
}

/**
 * Fail fast, and fail actionably, when the local FFmpeg cannot render captions.
 *
 * The ingest preflight asserts this (developer-guide §1) rather than the render
 * stage, on purpose: discovering at render time that captions are impossible
 * means the whole index and editorial spend has already happened. The error
 * names the missing filters and the fix, because "libass not available" sends a
 * developer to the wrong search.
 */
export async function assertLibass(): Promise<FfmpegCapabilities> {
  const capabilities = await probeCapabilities();
  if (!capabilities.hasLibass) {
    const missing = [
      capabilities.hasSubtitlesFilter ? undefined : 'subtitles',
      capabilities.hasAssFilter ? undefined : 'ass',
    ].filter((name): name is string => name !== undefined);
    throw runtimeError(
      'LIBASS_MISSING',
      `This FFmpeg build lacks the ${missing.join(' and ')} filter(s), so open captions cannot be rendered. ` +
        `Install a full build with libass (decisions.md D-39 pins ffmpeg 8.0.1-full from gyan.dev; ` +
        `on Linux use a distribution build configured with --enable-libass). Detected: ${capabilities.version}`,
      { missingFilters: missing, version: capabilities.version },
    );
  }
  return capabilities;
}

/** Test seam: forget the cached version/capability answers. */
export function resetCapabilityCache(): void {
  cachedVersion = undefined;
  cachedCapabilities = undefined;
}

// ---------------------------------------------------------------------------
// Determinism pins (tech-spec §12 tier 1, D-33)
// ---------------------------------------------------------------------------

/**
 * The only determinism tier Phase 0 claims: **byte-identical, same machine**
 * (tech-spec §12). Tiers 2 and 3 belong to the Remotion path, which does not
 * exist yet (D-16). Writing a cross-machine byte-identity test is spec-forbidden
 * — x264's assembly dispatch is CPU-feature-dependent, so the claim would be
 * false the first time it ran on different silicon.
 */
export const DETERMINISM_TIER = 1;

/**
 * Fixed thread count for every deterministic encode.
 *
 * `1`, not `N`. libx264's frame-level threading splits the picture into slices
 * whose *boundaries* depend on the thread count, and the rate-control state each
 * slice sees depends on scheduling. `-threads 1` removes both sources of
 * nondeterminism at once. A pinned `threads=4` is byte-identical to itself on
 * one machine but silently is not across machines with different core counts —
 * pinning to 1 makes the manifest field mean the same thing everywhere, which is
 * the property a recorded knob is supposed to have.
 */
export const DETERMINISTIC_THREADS = 1;

/**
 * The exact knobs whose absence makes two identical renders differ.
 *
 * These are not "hygiene". Without `-map_metadata -1` FFmpeg copies the source's
 * `creation_time` into the output; without `+bitexact` it stamps the encoder
 * build string and a `Lavf` version into the container; without a pinned
 * `-threads` the slice layout drifts. Each one alone is enough to defeat a
 * byte-comparison, which is why they travel together as one array rather than
 * being remembered individually at call sites.
 */
export function determinismArgs(threads: number = DETERMINISTIC_THREADS): readonly string[] {
  if (!Number.isInteger(threads) || threads < 1) {
    throw inputError(
      'INVALID_THREAD_COUNT',
      `Thread count must be a positive integer; received ${String(threads)}.`,
      { threads },
    );
  }
  return [
    '-threads',
    String(threads),
    '-fflags',
    '+bitexact',
    '-flags',
    '+bitexact',
    // The AAC encoder writes its own build identifier into the bitstream
    // unless told not to; `-flags` alone does not reach it.
    '-flags:a',
    '+bitexact',
    '-map_metadata',
    '-1',
  ];
}

/**
 * Assert an argv actually carries every tier-1 pin.
 *
 * This exists because the determinism test would otherwise be able to pass for
 * the wrong reason: two renders of a *short* clip can come out byte-identical by
 * luck even with `creation_time` stamped, if both encodes land in the same
 * wall-clock second. A test that only compares bytes therefore proves nothing
 * about the pins — it proves the machine was fast. Checking the argv separately
 * is what makes the byte comparison mean what it claims.
 */
export function assertDeterministicArgv(args: readonly string[]): void {
  const hasPair = (flag: string, value: string): boolean =>
    args.some((arg, i) => arg === flag && args[i + 1] === value);

  const missing: string[] = [];
  // Presence is not enough: `-threads 0` is ffmpeg's "pick a number from the
  // machine", which is precisely the non-determinism the pin exists to remove —
  // and `determinismArgs` already refuses `threads < 1`, so an argv that reached
  // here with `0` came from somewhere that bypassed it.
  const threadsAt = args.indexOf('-threads');
  const threadCount = threadsAt === -1 ? null : Number(args[threadsAt + 1]);
  if (threadsAt === -1) missing.push('-threads');
  else if (!Number.isInteger(threadCount) || (threadCount ?? 0) < 1) missing.push('-threads <positive integer>');
  if (!hasPair('-fflags', '+bitexact')) missing.push('-fflags +bitexact');
  if (!hasPair('-flags', '+bitexact')) missing.push('-flags +bitexact');
  // The AAC encoder writes its own build identifier into the bitstream unless
  // told not to, and `-flags` does not reach it — so an argv carrying every
  // OTHER pin still produces two non-identical files whenever the FFmpeg build
  // changes. This assertion was missing while the docblock above claimed to
  // check "every tier-1 pin"; a comment claiming a property is not the property.
  if (!hasPair('-flags:a', '+bitexact')) missing.push('-flags:a +bitexact');
  if (!hasPair('-map_metadata', '-1')) missing.push('-map_metadata -1');

  if (missing.length > 0) {
    throw inputError(
      'NON_DETERMINISTIC_ARGV',
      `Render argv is missing tier-1 determinism pins (tech-spec §12, D-33): ${missing.join(', ')}. ` +
        `Two runs of this command are not guaranteed byte-identical, so the render cannot be reproduced.`,
      { missing },
    );
  }
}
