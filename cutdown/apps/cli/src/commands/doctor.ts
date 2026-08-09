import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkGenerated, formatDrift, isClean } from '@cutdown/contracts';
import { loadFontRegistry, probeCapabilities, resolveFonts, runFfprobe } from '@cutdown/renderer-core';

import { DATA_ROOT, WORKSPACE_ROOT } from '../paths.js';
import { toolVersion, type ToolVersion } from '../tool-probe.js';

/**
 * `cutdown doctor` — one command that answers "is this machine able to run the
 * pipeline, and if not, what is the ONE thing to fix first?"
 *
 * It exists because every Phase 0 environment failure to date announced itself
 * somewhere deep in a run: a missing libass surfaced as a filtergraph error mid
 * encode, a stale generated tree as a type error in an unrelated package, a Node
 * major bump as a test-runner loader error (D-44). Each was cheap to diagnose
 * ONCE someone knew where to look, which is precisely what a newcomer does not.
 *
 * Two deliberate properties:
 *
 *  - **Every check runs.** A failing check never short-circuits the rest, because
 *    an operator with three broken things should learn that in one run, not three.
 *  - **One fix is promoted.** The checks are declared in BLOCKING order (see
 *    `CHECK_ORDER` below) and the first failure's fix is printed on its own at the
 *    end. A wall of equally-weighted failures is how a report gets skimmed.
 *
 * It never repairs anything. Every probe reuses the module the pipeline itself
 * uses — `probeCapabilities` for FFmpeg, `resolveFonts` for the font hashes,
 * `checkGenerated` for the trees — so a green `doctor` is evidence about the real
 * code path rather than about a parallel re-implementation of it.
 *
 * Note what this module does NOT import: `node:child_process`. See the probes
 * section below.
 */

/**
 * `unverified` is a third state on purpose, not a shade of `ok`.
 *
 * A tool that is present but that this command declines to execute — a Windows
 * `.cmd` shim, which cannot be spawned without a shell — is genuinely neither a
 * pass nor a failure: presence is real evidence, and the version is honestly
 * unknown. Folding it into `ok` would put it inside "All N checks passed. This
 * machine can run the pipeline", which claims verification that did not happen.
 * That is the rule this project's own measurement canon states first: an unrun
 * check is not a pass (`.claude/skills/cd-measurement-honesty`, R1).
 *
 * It does not fail the command — an operator whose pnpm is a shim has a working
 * machine — but it is counted and named separately.
 */
export type CheckStatus = 'ok' | 'unverified' | 'fail';

export interface DoctorCheck {
  readonly id: string;
  /** Human label, printed verbatim. */
  readonly label: string;
  readonly status: CheckStatus;
  /** What was found. Present on both outcomes — a green line still says what it saw. */
  readonly detail: string;
  /** The single action that clears this check. Present iff `status === 'fail'`. */
  readonly fix?: string;
}

export type Probe = () => Promise<DoctorCheck>;

// ---------------------------------------------------------------------------
// Version ranges
// ---------------------------------------------------------------------------

/**
 * Does `version` satisfy `range`?
 *
 * Deliberately NOT a semver library. The only ranges this has to answer are the
 * ones `cutdown/package.json` actually declares — `>=22.5.0 <25`, `>=10` — and a
 * dependency whose job is comparing two dotted integer triples is a dependency
 * the standard library already answers (CLAUDE.md golden rule 5).
 *
 * The important half is the refusal: a clause this does not understand throws,
 * so `doctor` reports "I cannot check this" rather than silently returning a
 * verdict it did not compute. A version checker that fails open is worse than
 * none, because it is believed.
 */
export function satisfiesRange(version: string, range: string): boolean {
  const clauses = range.trim().split(/\s+/).filter((c) => c.length > 0);
  if (clauses.length === 0) {
    throw new Error(`Empty version range: ${JSON.stringify(range)}.`);
  }
  // EVERY clause is parsed BEFORE any is evaluated. `clauses.every(parse-and-test)`
  // short-circuits on the first `false`, so an unparseable clause sitting after a
  // failing one would never be reached and the function would quietly return a
  // verdict — which is precisely the behaviour the docblock above promises it
  // does not have. Parsing first is what makes that promise true.
  const parsed = clauses.map((clause) => parseClause(clause, range));
  const actual = parseVersion(version);
  return parsed.every(({ operator, bound }) => {
    const cmp = compareVersions(actual, bound);
    switch (operator) {
      case '>=':
        return cmp >= 0;
      case '<=':
        return cmp <= 0;
      case '>':
        return cmp > 0;
      case '<':
        return cmp < 0;
      default:
        return cmp === 0;
    }
  });
}

interface Clause {
  readonly operator: '>=' | '<=' | '>' | '<' | '=';
  readonly bound: [number, number, number];
}

function parseClause(clause: string, range: string): Clause {
  const match = /^(>=|<=|>|<|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(clause);
  if (match === null) {
    throw new Error(
      `Unsupported version clause ${JSON.stringify(clause)} in range ${JSON.stringify(range)}. ` +
        '`cutdown doctor` compares dotted integer versions only; teach it this form or simplify the range.',
    );
  }
  const operator = (match[1] ?? '=') as Clause['operator'];
  const components = [match[2], match[3], match[4]].filter((c) => c !== undefined).length;
  // A bare `22` under an EQUALITY operator is ambiguous and the two readings
  // disagree: npm means "22.x", zero-filling means "exactly 22.0.0". Nobody
  // writing `engines.node: "22"` means the latter, so answering it either way is
  // a guess. Refuse it — the caller can write `>=22 <23`, which this understands
  // exactly. For a COMPARISON operator there is no ambiguity: `<25` is `<25.0.0`
  // on both readings, and `<25` is what `cutdown/package.json` actually declares.
  if (operator === '=' && components < 3) {
    throw new Error(
      `Ambiguous version clause ${JSON.stringify(clause)} in range ${JSON.stringify(range)}: ` +
        'a bare major/minor with no comparison operator could mean "exactly X.0.0" or "any X.*", ' +
        'and those disagree. Write it as a range, e.g. ">=22 <23".',
    );
  }
  return {
    operator,
    bound: [Number(match[2]), Number(match[3] ?? '0'), Number(match[4] ?? '0')],
  };
}

function parseVersion(version: string): [number, number, number] {
  // Tolerate a leading `v` (`process.version` is `v24.18.0`) and any
  // prerelease/build suffix, which no engines range here discriminates on.
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (match === null) {
    throw new Error(`Unparseable version string: ${JSON.stringify(version)}.`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    const left = a[i] as number;
    const right = b[i] as number;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

interface Engines {
  readonly node?: string;
  readonly pnpm?: string;
}

/** `cutdown/package.json`'s `engines` — the ONE home for these ranges (D-54's rule). */
export function readEngines(workspaceRoot: string = WORKSPACE_ROOT): Engines {
  const raw = readFileSync(join(workspaceRoot, 'package.json'), 'utf8');
  const parsed = JSON.parse(raw) as { engines?: Engines };
  return parsed.engines ?? {};
}

// ---------------------------------------------------------------------------
// The probes
//
// This module names the media binaries but spawns NOTHING: `pnpm`/`uv` go
// through `../tool-probe.js`, and FFmpeg/ffprobe are reached only through
// `@cutdown/renderer-core`. That split is required, not stylistic — tech-spec
// §11 allows exactly one module to spawn the media tools, and its enforcing test
// flags any file that both imports `node:child_process` and names one. See the
// header of `tool-probe.ts`.
// ---------------------------------------------------------------------------

export async function checkNode(): Promise<DoctorCheck> {
  const range = readEngines().node;
  if (range === undefined) {
    return {
      id: 'node',
      label: 'Node.js',
      status: 'fail',
      detail: 'cutdown/package.json declares no engines.node',
      fix: 'Restore `engines.node` in cutdown/package.json — the runtime floor is settled law (D-45, D-46), not a preference.',
    };
  }
  const ok = satisfiesRange(process.version, range);
  return ok
    ? { id: 'node', label: 'Node.js', status: 'ok', detail: `${process.version} satisfies ${range}` }
    : {
        id: 'node',
        label: 'Node.js',
        status: 'fail',
        detail: `${process.version} does not satisfy ${range}`,
        fix: `Install Node ${range} (the workspace pins ${range} because the local runner needs node:sqlite — decisions.md D-45/D-46). \`.tool-versions\` names the exact build.`,
      };
}

/**
 * Turn a non-`read` probe outcome into a check, or `null` if the tool answered.
 *
 * Shared by `checkPnpm` and `checkUv` so the two cannot drift — and, more to the
 * point, so the failure states are handled ONCE and exhaustively. The first cut
 * let every non-`read` outcome fall through to `ok`, which meant `doctor` printed
 * a green line whose own detail read "could not be spawned". Absence reported as
 * success is the single failure this command exists to prevent.
 *
 * `shim` is the one non-`read` outcome that is still a pass, and only because
 * "present" is genuinely the whole answer available: a `.cmd` cannot be run
 * without a shell (see `tool-probe.ts`), and the range it would have been checked
 * against is separately enforced by the tool itself.
 */
function nonAnswerCheck(
  id: string,
  label: string,
  found: ToolVersion,
  installFix: string,
  rangeEnforcedBy: string | null,
): DoctorCheck | null {
  switch (found.outcome) {
    case 'read':
      return null;
    case 'absent':
      return { id, label, status: 'fail', detail: found.detail, fix: installFix };
    case 'shim':
      return {
        id,
        label,
        // NOT `ok`: present, but this command did not run it. See `CheckStatus`.
        status: 'unverified',
        detail:
          rangeEnforcedBy === null
            ? found.detail
            : `${found.detail}; version unread — ${rangeEnforcedBy}`,
      };
    case 'unrunnable':
    case 'exit-nonzero':
    case 'timeout':
      return {
        id,
        label,
        status: 'fail',
        detail: found.detail,
        fix:
          `${label} is on PATH at ${found.path ?? '(unknown)'} but did not answer \`--version\` ` +
          `(${found.outcome}). A file that cannot run is not an installation: remove or repair that ` +
          `entry, then — ${installFix}`,
      };
  }
}

export async function checkPnpm(): Promise<DoctorCheck> {
  const range = readEngines().pnpm ?? '>=10';
  const found = await toolVersion('pnpm');
  const nonAnswer = nonAnswerCheck(
    'pnpm',
    'pnpm',
    found,
    'Install pnpm: `corepack enable && corepack prepare pnpm@10.28.2 --activate` (the version `packageManager` pins).',
    // On Windows pnpm is a `.cmd` shim this deliberately does not execute. That
    // is not a hole: `engine-strict` (D-39) makes `pnpm install` itself refuse an
    // out-of-range pnpm, so the range is checked by the thing that depends on it.
    `\`pnpm install\` enforces ${range} itself (engine-strict, D-39)`,
  );
  if (nonAnswer !== null) return nonAnswer;
  if (!satisfiesRange(found.version, range)) {
    return {
      id: 'pnpm',
      label: 'pnpm',
      status: 'fail',
      detail: `${found.version} does not satisfy ${range}`,
      fix: `Install pnpm ${range}: \`corepack prepare pnpm@10.28.2 --activate\`.`,
    };
  }
  return { id: 'pnpm', label: 'pnpm', status: 'ok', detail: `${found.version} satisfies ${range} (${found.path ?? ''})` };
}

export async function checkFfmpeg(): Promise<DoctorCheck> {
  try {
    const capabilities = await probeCapabilities();
    if (!capabilities.hasLibass) {
      return {
        id: 'ffmpeg',
        label: 'FFmpeg + libass',
        status: 'fail',
        detail: `${capabilities.version} carries neither the \`subtitles\` nor the \`ass\` filter`,
        fix: 'Install an FFmpeg build compiled --enable-libass (a "full" build). Open captions are burned in by libass; a minimal build renders video and silently no captions.',
      };
    }
    return {
      id: 'ffmpeg',
      label: 'FFmpeg + libass',
      status: 'ok',
      detail: `${capabilities.version} (subtitles + ass filters present)`,
    };
  } catch (error) {
    return {
      id: 'ffmpeg',
      label: 'FFmpeg + libass',
      status: 'fail',
      detail: describe(error),
      fix: 'Install FFmpeg with libass and put it on PATH (developer-guide.md §1; decisions.md D-39 pins the verified build). Every ingest, index and render shells out to it.',
    };
  }
}

export async function checkFfprobe(): Promise<DoctorCheck> {
  try {
    const result = await runFfprobe(['-hide_banner', '-version'], { timeoutMs: 20_000 });
    const firstLine = result.stdout.split('\n')[0]?.trim() ?? '';
    return {
      id: 'ffprobe',
      label: 'ffprobe',
      status: 'ok',
      detail: firstLine.length > 0 ? firstLine : 'present',
    };
  } catch (error) {
    return {
      id: 'ffprobe',
      label: 'ffprobe',
      status: 'fail',
      detail: describe(error),
      // Named separately from ffmpeg because they are separate binaries and a
      // partial install genuinely happens — ingest preflight (REQ-004) is all
      // ffprobe, so an ffmpeg-only machine fails at step one with no captions
      // rendered and nothing to look at.
      fix: 'Install ffprobe — it ships beside ffmpeg in the same build, so a missing one means a partial install. Ingest preflight reads every asset with it.',
    };
  }
}

export async function checkUv(): Promise<DoctorCheck> {
  const found = await toolVersion('uv');
  const nonAnswer = nonAnswerCheck(
    'uv',
    'uv (Python worker)',
    found,
    'Install uv (https://docs.astral.sh/uv/) — the indexer worker (transcript, shots, OCR, audio events, quality) runs under it.',
    // No `rangeEnforcedBy`: nothing declares a uv version range, so a shim is
    // reported as present with no claim about its version, and nothing more.
    null,
  );
  if (nonAnswer !== null) return nonAnswer;
  return { id: 'uv', label: 'uv (Python worker)', status: 'ok', detail: found.detail };
}

export async function checkFonts(): Promise<DoctorCheck> {
  const fontsDir = join(DATA_ROOT, 'fonts');
  try {
    const registry = await loadFontRegistry(fontsDir);
    // Every declared role, not just the caption one: `resolveFonts` verifies the
    // sha256 of each file it resolves, and a render REFUSES on a mismatch rather
    // than substituting (FONT_HASH_MISMATCH). Checking one role would leave the
    // other two to fail at render time, which is the thing doctor exists to stop.
    const roles = registry.fonts.map((font) => font.role);
    const resolved = await resolveFonts(fontsDir, registry, roles);
    return {
      id: 'fonts',
      label: 'Caption fonts',
      status: 'ok',
      detail: `${String(resolved.length)} font(s) present and hash-verified (${roles.join(', ')})`,
    };
  } catch (error) {
    return {
      id: 'fonts',
      label: 'Caption fonts',
      status: 'fail',
      detail: describe(error),
      fix: `Restore cutdown/data/fonts from git — the files are vendored and hash-pinned, and a render refuses rather than substituting a font (decisions.md D-29, D-49).`,
    };
  }
}

export async function checkGeneratedTrees(): Promise<DoctorCheck> {
  try {
    const drift = await checkGenerated();
    return isClean(drift)
      ? { id: 'contracts', label: 'Generated contract types', status: 'ok', detail: 'committed trees are current' }
      : {
          id: 'contracts',
          label: 'Generated contract types',
          status: 'fail',
          detail: formatDrift(drift).split('\n')[0] ?? 'the committed trees are stale',
          fix: 'Run `cutdown build:contracts` and commit the regenerated trees with the schema change (tech-spec §3, D-24).',
        };
  } catch (error) {
    return {
      id: 'contracts',
      label: 'Generated contract types',
      status: 'fail',
      detail: describe(error),
      fix: 'Run `cutdown build:contracts` — the generator could not compare the committed trees.',
    };
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message.split('\n')[0] ?? error.message;
  return String(error);
}

/**
 * The checks, in **blocking order** — the order decides which single fix is
 * promoted, so it is a judgement about the pipeline and not an aesthetic one.
 *
 * Node first because nothing else runs without it, then pnpm because it is how
 * everything is built. FFmpeg and ffprobe next: they gate `ingest`, which is
 * step one of every job. `uv` gates `index`, which is step two. Fonts gate
 * rendering, and stale generated trees gate only the entry gate — the pipeline
 * still runs, it just cannot be trusted to be building against the schemas.
 */
export const CHECK_ORDER: readonly Probe[] = [
  checkNode,
  checkPnpm,
  checkFfmpeg,
  checkFfprobe,
  checkUv,
  checkFonts,
  checkGeneratedTrees,
];

/** Run every probe. Never short-circuits: three broken things are learned in one run. */
export async function runChecks(probes: readonly Probe[] = CHECK_ORDER): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  for (const probe of probes) {
    try {
      checks.push(await probe());
    } catch (error) {
      // A probe that throws is itself a failure to report, never a crash of the
      // one command an operator reaches for when things are already broken.
      //
      // It keeps its IDENTITY. The first cut labelled every raising probe
      // `A check could not run`, so two of them were indistinguishable in the
      // report ("Then: A check could not run") and the promoted fix blamed
      // doctor — when the commonest cause is an operator's own malformed
      // `engines` value, which `satisfiesRange` throws on by design.
      const name = probe.name.replace(/^check/, '').toLowerCase() || 'unknown';
      checks.push({
        id: name,
        label: `${probe.name} (raised)`,
        status: 'fail',
        detail: describe(error),
        fix:
          `The \`${probe.name}\` check could not run: ${describe(error)}. ` +
          'Read that message first — it usually names bad configuration rather than a defect in doctor.',
      });
    }
  }
  return checks;
}

const MARKER: Record<CheckStatus, string> = { ok: 'OK  ', unverified: '?   ', fail: 'FAIL' };

/** Render the report. Pure, so the wording is testable without an environment. */
export function formatReport(checks: readonly DoctorCheck[]): string {
  const lines: string[] = ['cutdown doctor — environment check', ''];
  for (const check of checks) {
    lines.push(`  ${MARKER[check.status]}  ${check.label.padEnd(26)} ${check.detail}`);
  }
  const failures = checks.filter((check) => check.status === 'fail');
  const unverified = checks.filter((check) => check.status === 'unverified');
  lines.push('');
  if (failures.length === 0) {
    // This sentence IS the claim an operator carries away, so it must never say
    // "all passed" while something went unverified (see `CheckStatus`).
    lines.push(
      unverified.length === 0
        ? `  All ${String(checks.length)} checks passed. This machine can run the pipeline.`
        : `  ${String(checks.length - unverified.length)} of ${String(checks.length)} checks passed and ` +
            `${String(unverified.length)} could not be verified ` +
            `(${unverified.map((c) => c.label).join(', ')}) — present, but not run by this command. ` +
            'Nothing is known to be broken.',
    );
    lines.push('');
    return lines.join('\n');
  }
  const first = failures[0] as DoctorCheck;
  lines.push(
    `  ${String(failures.length)} of ${String(checks.length)} checks failed. Fix this one first — ${first.label}:`,
    '',
    `    ${first.fix ?? '(no fix recorded — that is itself a defect in doctor)'}`,
  );
  if (failures.length > 1) {
    lines.push('', `  Then: ${failures.slice(1).map((f) => f.label).join(', ')}.`);
  }
  lines.push('');
  return lines.join('\n');
}

/** `cutdown doctor` — exit 0 when every check passes, 3 otherwise. */
export async function doctorCommand(probes: readonly Probe[] = CHECK_ORDER): Promise<number> {
  const checks = await runChecks(probes);
  const report = formatReport(checks);
  const failed = checks.some((check) => check.status === 'fail');
  // The report goes to stdout either way: it is the ANSWER to the question the
  // operator asked, not a diagnostic about this command. Exit 3 (runtime
  // failure, tech-spec §6.2) is what a script reads.
  process.stdout.write(report);
  return failed ? 3 : 0;
}
