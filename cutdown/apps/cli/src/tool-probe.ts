import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import { MEDIA_BINARIES } from '@cutdown/renderer-core';

/**
 * Finding a build tool on PATH and asking it its version.
 *
 * **Why this is its own module.** tech-spec §11 states that FFmpeg and ffprobe are
 * spawned from exactly one place, `renderer-core/src/ffmpeg.ts`, and that rule is
 * enforced by a test (`determinism.test.ts`) whose detector is the CONJUNCTION:
 * a file that both reaches for `node:child_process` and names a media binary. Its
 * own comment explains why it must not grow an exclusion list — the next real
 * violation would hide inside it.
 *
 * `cutdown doctor` has to spawn *some* tools (pnpm, uv) while also reporting on
 * FFmpeg, so it would trip that detector. The dodge would be to rename doctor's
 * check ids; the fix is this file. Generic process-spawning lives here and knows
 * nothing about media, and `doctor.ts` names the media tools while spawning
 * nothing — it reaches FFmpeg only through `renderer-core`, which is exactly the
 * property §11 asserts. The guard now passes because the invariant holds, rather
 * than because it was told to look away.
 */

/**
 * Find `binary` on PATH ourselves, rather than asking `spawn` to.
 *
 * Windows is the whole reason. Two facts about the installed toolchain, both
 * verified rather than remembered (golden rule 9):
 *
 *  - `CreateProcess` appends `.exe` but never `.cmd`, so a `.cmd` shim is
 *    invisible to a bare `spawn('pnpm', …)`;
 *  - since the Node 20 fix for CVE-2024-27980, spawning a `.cmd`/`.bat` with
 *    `shell: false` **throws `EINVAL` synchronously**. It is not a fallback that
 *    quietly fails — it is a crash, and it is what the first cut of `doctor` did
 *    to both `pnpm` and `uv` on the D-33 machine.
 *
 * Resolving the path here gives an honest three-way answer — absent, present and
 * directly executable, present as a shell shim — instead of one misreported as
 * another. A shell is deliberately not used to bridge the third case:
 * `shell: false` is the house rule (`renderer-core/src/ffmpeg.ts`), and the
 * version of a build tool is not worth being the exception that makes it two.
 */
export function whichOnPath(binary: string): string | null {
  const pathValue = process.env['PATH'] ?? process.env['Path'] ?? '';
  const dirs = pathValue.split(delimiter).filter((dir) => dir.length > 0);
  const extensions =
    process.platform === 'win32'
      ? // PATHEXT is the OS's own list and is the current fact; the fallback is
        // the Windows default for the rare stripped environment.
        (process.env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD').split(';').filter((e) => e.length > 0)
      : [''];
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = join(dir, `${binary}${extension}`);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Not there, or the directory is unreadable. Either way, keep looking —
        // one bad PATH entry must not stop the scan.
      }
    }
  }
  return null;
}

/** Can this resolved file be handed to `spawn` with `shell: false`? */
function isDirectlyExecutable(resolved: string): boolean {
  return process.platform !== 'win32' || /\.exe$/i.test(resolved);
}

/**
 * How the probe ended. **Discriminated on purpose**, because the first cut of
 * this module returned `version: ''` from four different situations and the
 * caller could not tell them apart — so `cutdown doctor` printed a green `OK`
 * line for a `uv` it had just failed to execute, with the words "could not be
 * spawned" in the very detail beside it. Four states collapsed into one empty
 * string is absence reported as success.
 *
 *  - `absent`        — not on PATH at all.
 *  - `shim`          — present, but a `.cmd`/`.bat` we decline to run without a
 *                      shell. Present is a real and useful answer; the version
 *                      is honestly unknown.
 *  - `unrunnable`    — present and we tried: `spawn` refused it.
 *  - `exit-nonzero`  — it ran and failed.
 *  - `timeout`       — it ran and never answered.
 *  - `read`          — it ran, and `version` is what it said.
 *
 * Only `shim` and `read` describe a working tool. Everything else is a failure,
 * and it is the caller's job to say so rather than to see an empty string.
 */
export type ProbeOutcome = 'absent' | 'shim' | 'unrunnable' | 'exit-nonzero' | 'timeout' | 'read';

export interface ToolVersion {
  readonly outcome: ProbeOutcome;
  /** Present on PATH at all — true for every outcome except `absent`. */
  readonly found: boolean;
  /** Non-empty **only** when `outcome === 'read'`. */
  readonly version: string;
  /** Resolved absolute path, or null when `absent`. */
  readonly path: string | null;
  readonly detail: string;
}

/**
 * tech-spec §11: the media binaries are spawned from exactly one module,
 * `renderer-core/src/ffmpeg.ts`. This module refuses them at the spawn.
 *
 * Splitting the spawn machinery out of `doctor.ts` satisfied §11's enforcing
 * test — and also created a hole that test cannot see. Its detector flags a file
 * that both imports `node:child_process` AND names a media binary; after the
 * split, a caller writing `toolVersion('ff' + 'mpeg')` names the binary while
 * importing no `child_process`, and this file imports `child_process` while
 * naming none. Neither half trips the conjunction, and FFmpeg would be spawned
 * outside `ffmpeg.ts` with nothing to catch it.
 *
 * So the rule is enforced where the spawn happens, not where the name is written
 * — guard the class, not the call site (CLAUDE.md, 2026-07-30). The list is
 * IMPORTED rather than restated, both because one rule deserves one home and
 * because writing those names here would trip the detector this guard supports.
 */
export async function toolVersion(
  binary: string,
  args: readonly string[] = ['--version'],
): Promise<ToolVersion> {
  if (MEDIA_BINARIES.has(binary.toLowerCase().replace(/\.(exe|cmd|bat)$/i, ''))) {
    throw new Error(
      `tech-spec §11: ${binary} is spawned from exactly one module, ` +
        '`packages/renderer-core/src/ffmpeg.ts`, and this is not it. Use `probeCapabilities()` / ' +
        '`runFfprobe()` from `@cutdown/renderer-core`, which record the build string the ' +
        'determinism proof depends on.',
    );
  }
  const resolved = whichOnPath(binary);
  if (resolved === null) {
    return { outcome: 'absent', found: false, version: '', path: null, detail: 'not found on PATH' };
  }
  if (!isDirectlyExecutable(resolved)) {
    return {
      outcome: 'shim',
      found: true,
      version: '',
      path: resolved,
      detail: `${resolved} (a shell shim — present, version not probed)`,
    };
  }
  const outcome = await spawnCapture(resolved, args);
  if (!outcome.spawned) {
    // Note this is NOT `absent`: `whichOnPath` found a file, so the honest report
    // is "it is there and it would not run" — a different problem with a
    // different fix from "install it".
    return {
      outcome: 'unrunnable',
      found: true,
      version: '',
      path: resolved,
      detail: `${resolved} ${outcome.detail}`,
    };
  }
  if (outcome.timedOut) {
    return {
      outcome: 'timeout',
      found: true,
      version: '',
      path: resolved,
      detail: `${resolved} ${outcome.detail}`,
    };
  }
  if (outcome.exitCode !== 0) {
    return {
      outcome: 'exit-nonzero',
      found: true,
      version: '',
      path: resolved,
      detail: `${resolved} ${args.join(' ')} exited ${String(outcome.exitCode)}`,
    };
  }
  // Tools print either a bare version (`uv 0.9.7`, `10.28.2`) or a banner; the
  // first dotted-integer token on the first line is the version in both.
  const firstLine = outcome.stdout.split('\n')[0]?.trim() ?? '';
  const version = /(\d+\.\d+\.\d+|\d+\.\d+|\d+)/.exec(firstLine)?.[1] ?? '';
  if (version === '') {
    // It ran and exited 0 but said nothing we can read as a version. That is a
    // successful spawn of something that is not the tool we asked for.
    return {
      outcome: 'exit-nonzero',
      found: true,
      version: '',
      path: resolved,
      detail: `${resolved} ran but printed no readable version (${JSON.stringify(firstLine.slice(0, 80))})`,
    };
  }
  return { outcome: 'read', found: true, version, path: resolved, detail: firstLine };
}

interface SpawnOutcome {
  readonly spawned: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly detail: string;
  /** Distinguishes "ran and failed" from "never answered" — different problems. */
  readonly timedOut: boolean;
}

function spawnCapture(binary: string, args: readonly string[]): Promise<SpawnOutcome> {
  return new Promise<SpawnOutcome>((resolveOutcome) => {
    // `spawn` can throw SYNCHRONOUSLY (EINVAL for a `.cmd` under `shell: false`,
    // EACCES for a non-executable file). Inside a Promise executor that rejects
    // rather than crashing, but a diagnostic must never turn an environment fact
    // into an exception — every path below ends in a reported outcome.
    let child;
    try {
      child = spawn(binary, [...args], { shell: false, windowsHide: true });
    } catch (cause) {
      resolveOutcome({
        spawned: false,
        exitCode: 1,
        stdout: '',
        timedOut: false,
        detail: `could not be spawned: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
      return;
    }
    let stdout = '';
    let settled = false;
    const settle = (outcome: SpawnOutcome): void => {
      if (settled) return;
      settled = true;
      resolveOutcome(outcome);
    };
    // A version probe that hangs is a doctor that hangs — the one command an
    // operator runs when things are already wrong.
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle({ spawned: true, exitCode: 1, stdout: '', timedOut: true, detail: 'did not answer within 20s' });
    }, 20_000);
    timer.unref?.();
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', () => {
      /* version banners on stderr are not needed; drained so the pipe cannot fill */
    });
    child.on('error', (cause: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      settle({
        spawned: false,
        exitCode: 1,
        stdout: '',
        timedOut: false,
        // NOT "not found on PATH": `whichOnPath` already found the file, so an
        // ENOENT here means it named an interpreter or library that is missing.
        // Reporting it as absent would send an operator to reinstall a tool that
        // is sitting right there.
        detail:
          cause.code === 'ENOENT'
            ? `could not be spawned (ENOENT — the file exists but something it needs does not): ${cause.message}`
            : `could not be spawned: ${cause.message}`,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      settle({ spawned: true, exitCode: code ?? 1, stdout, timedOut: false, detail: '' });
    });
  });
}
