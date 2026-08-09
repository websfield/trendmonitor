import { ok, rejects, strictEqual } from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { describe, it } from 'node:test';

import { toolVersion, whichOnPath } from '../src/tool-probe.js';

/**
 * `apps/cli/src/tool-probe.ts` — finding a build tool on PATH and reading its
 * version.
 *
 * Separate from `doctor.test.ts` for the same reason the source module is
 * separate from `doctor.ts`: tech-spec §11's enforcing test flags any file that
 * both imports `node:child_process` and names a media binary, and it must not
 * grow an exclusion list. This file names no media binary; `doctor.test.ts`
 * spawns the CLI but names none either. Both halves of the rule stay true.
 *
 * Everything here is hermetic — a temp directory with a real file in it, PREPENDED
 * to the real PATH so the resolver is exercised against a genuine multi-entry
 * PATH rather than a one-element toy.
 */

interface Shim {
  readonly dir: string;
  readonly file: string;
  readonly name: string;
}

/** Write a real, runnable executable that prints `version` and nothing else. */
function makeShim(name: string, version: string, executable: boolean): Shim {
  const dir = mkdtempSync(join(tmpdir(), 'cutdown-toolprobe-'));
  const isWindows = process.platform === 'win32';
  // `.exe` cannot be faked, so the "directly executable" path is exercised on
  // POSIX and the "shell shim" path on Windows — which is exactly the split the
  // module draws, and the reason it exists.
  const file = join(dir, isWindows ? `${name}.cmd` : name);
  writeFileSync(file, isWindows ? `@echo off\r\necho ${version}\r\n` : `#!/bin/sh\necho ${version}\n`);
  if (!isWindows && executable) chmodSync(file, 0o755);
  return { dir, file, name };
}

async function withPathPrefix<T>(dir: string, body: () => Promise<T> | T): Promise<T> {
  const saved = process.env['PATH'];
  process.env['PATH'] = `${dir}${delimiter}${saved ?? ''}`;
  try {
    return await body();
  } finally {
    if (saved === undefined) delete process.env['PATH'];
    else process.env['PATH'] = saved;
  }
}

describe('whichOnPath', () => {
  it('finds a real file on a real multi-entry PATH, and returns null for one that is absent', async () => {
    const shim = makeShim('cutdown-probe-alpha', '1.2.3', true);
    try {
      await withPathPrefix(shim.dir, () => {
        const resolved = whichOnPath(shim.name);
        ok(resolved !== null, 'the shim must be found');
        // Compared case-insensitively on Windows: PATHEXT is uppercase (`.CMD`)
        // while the file is `.cmd`, and the filesystem does not distinguish them.
        strictEqual(
          process.platform === 'win32' ? resolved.toLowerCase() : resolved,
          process.platform === 'win32' ? shim.file.toLowerCase() : shim.file,
        );
        strictEqual(whichOnPath('cutdown-no-such-binary-9c1f'), null);
      });
    } finally {
      rmSync(shim.dir, { recursive: true, force: true });
    }
  });

  it('an unreadable or nonexistent PATH entry does not stop the scan', async () => {
    const shim = makeShim('cutdown-probe-beta', '4.5.6', true);
    try {
      // A junk entry FIRST: one bad directory on PATH must not hide a tool that
      // is genuinely installed further along it.
      const junk = join(shim.dir, 'does-not-exist-at-all');
      await withPathPrefix(`${junk}${delimiter}${shim.dir}`, () => {
        ok(whichOnPath(shim.name) !== null);
      });
    } finally {
      rmSync(shim.dir, { recursive: true, force: true });
    }
  });
});

describe('toolVersion', () => {
  it('reports a tool that is absent as absent — never as a crash', async () => {
    const outcome = await toolVersion('cutdown-no-such-binary-9c1f');
    strictEqual(outcome.found, false);
    strictEqual(outcome.path, null);
    strictEqual(outcome.version, '');
    ok(outcome.detail.length > 0);
  });

  it('a shell shim is PRESENT with an unread version, never an exception', async () => {
    /**
     * The regression this pins. Since the Node 20 fix for CVE-2024-27980,
     * `spawn('x.cmd', …, { shell: false })` throws EINVAL **synchronously** — so
     * the first cut of `doctor`, which tried `pnpm.cmd` before `pnpm.exe`,
     * reported "A check could not run" for both pnpm and uv on the D-33 machine.
     * A shim on PATH is an environment fact and must read as one.
     */
    const shim = makeShim('cutdown-probe-gamma', '10.28.2', true);
    try {
      await withPathPrefix(shim.dir, async () => {
        const outcome = await toolVersion(shim.name);
        strictEqual(outcome.found, true, 'a file on PATH is found whether or not it can be run');
        ok(outcome.detail.length > 0);
        if (process.platform === 'win32') {
          // Declined, deliberately: executing it would need a shell.
          strictEqual(outcome.version, '');
          ok(/shell shim/.test(outcome.detail), outcome.detail);
        } else {
          strictEqual(outcome.version, '10.28.2', 'a directly executable tool IS run and read');
        }
      });
    } finally {
      rmSync(shim.dir, { recursive: true, force: true });
    }
  });

  it('a file that cannot be executed reports found-without-version rather than throwing', {
    // A real SKIP, not `if (win32) return`. An early return reports the test as
    // PASSED having asserted nothing, so the suite count says a check ran that
    // never did — this project's own R1 ("an unrun check is not a pass") applied
    // to its own test suite. POSIX only: the mode bit is what makes this case
    // reachable, and Windows has no equivalent.
    skip: process.platform === 'win32' ? 'POSIX only — Windows has no executable bit' : false,
  }, async () => {
    const shim = makeShim('cutdown-probe-delta', '9.9.9', false);
    try {
      await withPathPrefix(shim.dir, async () => {
        const outcome = await toolVersion(shim.name);
        strictEqual(outcome.found, true);
        strictEqual(outcome.version, '');
        ok(/could not be spawned/.test(outcome.detail), outcome.detail);
      });
    } finally {
      rmSync(shim.dir, { recursive: true, force: true });
    }
  });
});

describe('tool-probe refuses the media binaries — tech-spec §11 enforced at the spawn', () => {
  /**
   * The hole the split opened, and the reason this guard is here rather than in a
   * grep. §11's enforcing test (`renderer-core/tests/determinism.test.ts`) detects
   * a CONJUNCTION: one file importing `node:child_process` and naming a media
   * binary. Splitting doctor's spawning into this module satisfied that detector —
   * and simultaneously made it blind, because a caller can now name the binary
   * without importing `child_process` while this file imports `child_process`
   * without naming one. `toolVersion('ffmpeg')` would have spawned FFmpeg outside
   * `ffmpeg.ts` with nothing to catch it.
   */
  for (const binary of ['ffmpeg', 'ffprobe', 'ffplay', 'FFmpeg', 'ffmpeg.exe']) {
    it(`refuses ${binary}, naming the module that may spawn it`, async () => {
      await rejects(
        () => toolVersion(binary),
        (error: unknown) => {
          const message = (error as Error).message;
          ok(/tech-spec §11/.test(message), message);
          ok(/renderer-core/.test(message), 'the refusal must name the way forward');
          return true;
        },
      );
    });
  }

  it('still probes an ordinary tool — the refusal is a named set, not a blanket', async () => {
    const outcome = await toolVersion('cutdown-no-such-binary-9c1f');
    strictEqual(outcome.outcome, 'absent');
  });

  it('the guard fires BEFORE the PATH lookup, so it cannot be dodged by absence', async () => {
    // If it were ordered the other way, `toolVersion('ffmpeg')` on a machine
    // without ffmpeg would return `absent` rather than refusing — and the
    // violation would only appear on machines where it works.
    const saved = process.env['PATH'];
    process.env['PATH'] = '';
    try {
      await rejects(() => toolVersion('ffmpeg'), /tech-spec §11/);
    } finally {
      if (saved === undefined) delete process.env['PATH'];
      else process.env['PATH'] = saved;
    }
  });
});
