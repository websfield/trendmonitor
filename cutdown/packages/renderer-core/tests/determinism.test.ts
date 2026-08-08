import { ok, strictEqual, throws } from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  DETERMINISM_TIER,
  DETERMINISTIC_THREADS,
  FfmpegError,
  assertDeterministicArgv,
  determinismArgs,
} from '../src/ffmpeg.js';

const here = dirname(fileURLToPath(import.meta.url));
/** `packages/renderer-core/dist/tests` → `cutdown/`. */
const CUTDOWN_ROOT = join(here, '..', '..', '..', '..');

describe('tier-1 determinism pins (tech-spec §12, D-33)', () => {
  it('claims tier 1 and nothing stronger', () => {
    strictEqual(DETERMINISM_TIER, 1);
  });

  it('pins threads to 1, so the manifest field means the same thing everywhere', () => {
    strictEqual(DETERMINISTIC_THREADS, 1);
  });

  it('emits every knob a byte comparison depends on', () => {
    const args = determinismArgs();
    for (const expected of ['-threads', '-fflags', '-flags', '-flags:a', '-map_metadata']) {
      ok(args.includes(expected), `${expected} missing`);
    }
    strictEqual(args[args.indexOf('-map_metadata') + 1], '-1');
    strictEqual(args[args.indexOf('-fflags') + 1], '+bitexact');
  });

  it('refuses a nonsensical thread count instead of silently defaulting', () => {
    throws(() => determinismArgs(0), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'INVALID_THREAD_COUNT');
      return true;
    });
  });
});

describe('assertDeterministicArgv — why a byte comparison alone is not proof', () => {
  /**
   * Two renders of a short clip can come out byte-identical by luck even with
   * `creation_time` stamped, if both encodes land in the same wall-clock second.
   * A test that only compares bytes therefore proves the machine was fast, not
   * that the pins are applied. This assertion is the other half.
   */
  it('accepts an argv carrying every pin', () => {
    assertDeterministicArgv(['-i', 'x.mp4', ...determinismArgs(1), 'out.mp4']);
  });

  it('rejects an argv with no bitexact flags', () => {
    throws(() => assertDeterministicArgv(['-i', 'x.mp4', '-threads', '1', 'out.mp4']), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'NON_DETERMINISTIC_ARGV');
      ok(error.message.includes('-fflags +bitexact'));
      return true;
    });
  });

  it('rejects an argv missing the AUDIO bitexact pin specifically', () => {
    // `-flags` does not reach the AAC encoder, which stamps its own build
    // identifier into the bitstream — so this argv carries every other pin and
    // still produces two different files across an FFmpeg upgrade. The docblock
    // claimed to check "every tier-1 pin" while this one went unchecked.
    const args = determinismArgs(1).filter((a, i, all) => a !== '-flags:a' && all[i - 1] !== '-flags:a');
    throws(() => assertDeterministicArgv(args), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'NON_DETERMINISTIC_ARGV');
      ok(error.message.includes('-flags:a +bitexact'));
      return true;
    });
  });

  it('rejects an argv that leaves creation_time in place', () => {
    const args = determinismArgs(1).filter((a, i, all) => a !== '-map_metadata' && all[i - 1] !== '-map_metadata');
    throws(() => assertDeterministicArgv(args), (error: unknown) => {
      ok(error instanceof FfmpegError);
      ok(error.message.includes('-map_metadata -1'));
      return true;
    });
  });

  it('rejects a bitexact flag paired with the wrong value', () => {
    throws(
      () =>
        assertDeterministicArgv([
          '-threads',
          '1',
          '-fflags',
          '+genpts',
          '-flags',
          '+bitexact',
          '-map_metadata',
          '-1',
        ]),
      (error: unknown) => {
        ok(error instanceof FfmpegError);
        strictEqual(error.code, 'NON_DETERMINISTIC_ARGV');
        return true;
      },
    );
  });
});

describe('tech-spec §11 — FFmpeg is spawned in exactly one module', () => {
  /**
   * The Phase 4 acceptance criterion asks for a grep proving no `ffmpeg` spawn
   * exists outside `ffmpeg.ts`. Running it as a TEST rather than pasting grep
   * output into a review means the rule keeps holding after the review is
   * written — a hard rule enforced once is a convention, not a rule.
   */
  const SOURCE_ROOTS = ['packages', 'skills', 'apps', 'workflows'];
  const ALLOWED = join('packages', 'renderer-core', 'src', 'ffmpeg.ts');
  /**
   * This file is excluded from its own scan — it carries the violating sample
   * used by the can-fail test below and spawns nothing. Named explicitly rather
   * than filtered by `.test.ts`, so a test that really did spawn ffmpeg would
   * still be caught.
   */
  const SELF = join('packages', 'renderer-core', 'tests', 'determinism.test.ts');

  function* walk(dir: string): Generator<string> {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'fixtures') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        yield* walk(full);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        yield full;
      }
    }
  }

  it('no module other than ffmpeg.ts spawns ffmpeg or ffprobe', () => {
    /**
     * The rule is about the MEDIA TOOLS, not about spawning in general. Other
     * modules legitimately spawn processes — the CLI spawns skill entrypoints,
     * `retrieval.ts` spawns the Python embedder, and every skill's integration
     * test spawns the skill it tests. Flagging those would make the check noisy
     * and, worse, would have to be suppressed with an exclusion list that the
     * next real violation could hide inside.
     *
     * So the violation is the CONJUNCTION: a file that both reaches for
     * `child_process` and names an FFmpeg binary. That is precisely what
     * "spawning ffmpeg outside ffmpeg.ts" looks like, and nothing else is.
     */
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of walk(join(CUTDOWN_ROOT, root))) {
        const relative = file.slice(CUTDOWN_ROOT.length + 1);
        if (relative === ALLOWED || relative === SELF) continue;
        const source = readFileSync(file, 'utf8');
        const spawnsSomething = /from ['"]node:child_process['"]/.test(source);
        const namesMediaBinary = /['"`](ffmpeg|ffprobe)['"`]/.test(source);
        if (spawnsSomething && namesMediaBinary) offenders.push(relative);
      }
    }
    strictEqual(
      offenders.join(', '),
      '',
      'tech-spec §11: FFmpeg/ffprobe are spawned only from packages/renderer-core/src/ffmpeg.ts',
    );
  });

  it('the check can actually fail — a module doing both is caught', () => {
    // A guard that has never been shown to fire is a guard nobody can trust.
    const violating = [
      "import { spawn } from 'node:child_process';",
      "spawn('ffmpeg', ['-i', input]);",
    ].join('\n');
    const spawnsSomething = /from ['"]node:child_process['"]/.test(violating);
    const namesMediaBinary = /['"`](ffmpeg|ffprobe)['"`]/.test(violating);
    ok(spawnsSomething && namesMediaBinary, 'the detector must flag a real violation');
  });
});
