import { ok, strictEqual } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { WORKSPACE_ROOT } from '../src/paths.js';

/**
 * `cutdown doctor` as an actual CLI verb, run as a real subprocess.
 *
 * Split from `doctor.test.ts` because this is the only part that spawns anything,
 * and tech-spec §11's enforcing test flags a file that BOTH imports
 * `node:child_process` and names a media binary. Its own comment explains why it
 * must never grow an exclusion list, so the code moves instead. Nothing here names
 * a media binary in a string literal; the FFmpeg assertion below is a regex over
 * doctor's rendered report.
 */

let emptyDir: string;

before(() => {
  emptyDir = mkdtempSync(join(tmpdir(), 'cutdown-doctor-cli-'));
});

after(() => {
  rmSync(emptyDir, { recursive: true, force: true });
});

describe('cutdown doctor — the CLI verb is wired', () => {
  it('a scrubbed PATH makes the real CLI exit 3 with one promoted fix', () => {
    const result = spawnSync(
      process.execPath,
      [join(WORKSPACE_ROOT, 'apps', 'cli', 'dist', 'src', 'main.js'), 'doctor'],
      {
        encoding: 'utf8',
        // Node itself is spawned by absolute path, so an empty PATH cannot stop
        // the CLI from starting — only its tool lookups.
        env: { ...process.env, PATH: emptyDir, Path: emptyDir },
      },
    );
    strictEqual(result.status, 3, `expected exit 3, got ${String(result.status)}: ${result.stderr}`);
    ok(result.stdout.startsWith('cutdown doctor — environment check'), result.stdout);
    ok(result.stdout.includes('Fix this one first'), result.stdout);
    ok(/FAIL\s+FFmpeg \+ libass/.test(result.stdout), result.stdout);
    // Not "Unknown command" — the verb reached its handler.
    ok(!result.stderr.includes('Unknown command'), result.stderr);
  });

  it('doctor appears in the CLI usage, so it is discoverable', () => {
    const result = spawnSync(
      process.execPath,
      [join(WORKSPACE_ROOT, 'apps', 'cli', 'dist', 'src', 'main.js'), '--help'],
      { encoding: 'utf8' },
    );
    strictEqual(result.status, 0);
    ok(result.stdout.includes('cutdown doctor'), 'doctor must be listed in the usage block');
  });
});
