import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { isAbsolute, join, resolve, sep } from 'node:path';

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import {
  EXIT_INPUT_INVALID,
  SkillError,
  assertContained,
  assertContainedPhysical,
  assertJobRelative,
  assertSafeId,
  jobDir,
  resolveJobRelative,
} from '../src/index.js';

/**
 * Path containment in the skill runtime.
 *
 * This exists because the Phase 2 security review found a HIGH — `jobId` and
 * `assetId` reached filesystem paths unvalidated in the Python worker — and the
 * Phase 5 review found the SAME CLASS on the TypeScript side: `jobDir()` built a
 * path from a caller-supplied id with no guard, and the only check lived in the CLI,
 * where two documented callers bypass it (`cutdown skills run --job <safe>` passes
 * the request file through unmodified, and every `SKILL.md` declares a directly
 * invocable `entrypoint`).
 *
 * The guard therefore lives at the point the path is BUILT, and it is asserted here
 * rather than in each skill: three skills plus `ingest` share this one function, and
 * a per-skill guard is a guard someone forgets in the fourth.
 */

const WINDOWS = sep === '\\';
const WORKSPACE = resolve(WINDOWS ? 'C:\\ws' : '/ws');
const JOBS = join(WORKSPACE, 'project-data', 'jobs');
const BACKSLASH = String.fromCharCode(92);

const expectReject = (fn: () => unknown, codeFragment: string): SkillError => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof SkillError, `expected a SkillError, got ${String(error)}`);
    assert.equal(error.exitCode, EXIT_INPUT_INVALID, 'a bad id is a CALLER error (exit 2), not a skill failure');
    assert.ok(error.code.includes(codeFragment), `expected code to include ${codeFragment}, got ${error.code}`);
    return error;
  }
  throw new Error('expected a rejection, but the call returned');
};

describe('jobDir refuses an id that would escape the jobs root', () => {
  it('accepts an ordinary job id', () => {
    assert.equal(jobDir(WORKSPACE, 'test-mixed'), join(JOBS, 'test-mixed'));
  });

  it('refuses forward-slash traversal', () => {
    expectReject(() => jobDir(WORKSPACE, '../../../../Users/Public/evil'), 'UNSAFE_ID');
  });

  it('refuses BACKSLASH traversal — the Windows form escapes identically', () => {
    // Verified empirically: win32 `join('C:\\a\\b', '..\\..\\evil')` is `C:\evil`.
    // A guard that only knew about `/` would have missed the primary dev platform.
    const traversal = ['..', '..', '..', 'evil'].join(BACKSLASH);
    expectReject(() => jobDir(WORKSPACE, traversal), 'UNSAFE_ID');
  });

  it('refuses a bare `..`', () => {
    expectReject(() => jobDir(WORKSPACE, '..'), 'UNSAFE_ID');
  });

  it('refuses an absolute path', () => {
    expectReject(() => jobDir(WORKSPACE, WINDOWS ? `C:${BACKSLASH}Windows` : '/etc'), 'UNSAFE_ID');
  });

  it('refuses a UNC-shaped id', () => {
    expectReject(() => jobDir(WORKSPACE, `${BACKSLASH}${BACKSLASH}attacker${BACKSLASH}share`), 'UNSAFE_ID');
  });

  it('refuses an id embedding a separator even without `..`', () => {
    expectReject(() => jobDir(WORKSPACE, 'a/b'), 'UNSAFE_ID');
  });

  it('refuses an empty id and an id starting with a dot', () => {
    expectReject(() => jobDir(WORKSPACE, ''), 'UNSAFE_ID');
    expectReject(() => jobDir(WORKSPACE, '.hidden'), 'UNSAFE_ID');
  });

  it('refuses an id longer than the 64-character bound', () => {
    expectReject(() => jobDir(WORKSPACE, 'a'.repeat(65)), 'UNSAFE_ID');
  });

  it('names the id in the refusal, so an operator can see what was rejected', () => {
    const error = expectReject(() => jobDir(WORKSPACE, '../evil'), 'UNSAFE_ID');
    assert.ok(error.message.includes('../evil'));
    assert.ok(error.message.includes('directory name'), 'and says WHY the shape matters');
  });
});

describe('assertContained is the belt to assertSafeId braces', () => {
  it('accepts the root itself and a child', () => {
    assertContained(JOBS, JOBS, 'root');
    assertContained(JOBS, join(JOBS, 'j1', 'renders'), 'child');
  });

  it('refuses a sibling whose name merely starts with the root', () => {
    // `.../jobs-evil` starts with `.../jobs` as a STRING but is not a child. This is
    // why the comparison appends a separator.
    expectReject(() => assertContained(JOBS, `${JOBS}-evil`, 'sibling'), 'PATH_ESCAPES_ROOT');
  });

  it('refuses a parent', () => {
    expectReject(() => assertContained(JOBS, WORKSPACE, 'parent'), 'PATH_ESCAPES_ROOT');
  });

  it('does not depend on the id regex being exhaustive', () => {
    // The point of having two checks: this one would catch an escape the regex let
    // through, whatever future shape that took.
    expectReject(() => assertContained(JOBS, resolve(JOBS, '..', '..', 'x'), 'escaped'), 'PATH_ESCAPES_ROOT');
  });
});

describe('assertJobRelative guards paths read out of STORED artefacts', () => {
  it('accepts a job-relative path', () => {
    assertJobRelative('renders/final/01J9/output.mp4', 'outputPath');
  });

  it('refuses `..` traversal in either separator', () => {
    expectReject(() => assertJobRelative('../../secret.txt', 'outputPath'), 'UNSAFE_ARTEFACT_PATH');
    expectReject(
      () => assertJobRelative(['..', '..', 'secret.txt'].join(BACKSLASH), 'outputPath'),
      'UNSAFE_ARTEFACT_PATH',
    );
  });

  it('refuses an absolute path and a drive-letter path', () => {
    expectReject(() => assertJobRelative('/etc/passwd', 'outputPath'), 'UNSAFE_ARTEFACT_PATH');
    expectReject(() => assertJobRelative(`C:${BACKSLASH}Windows${BACKSLASH}x`, 'outputPath'), 'UNSAFE_ARTEFACT_PATH');
  });

  it('refuses a UNC path', () => {
    // The Phase 2 MEDIUM: a UNC value makes FFmpeg fetch over SMB, leaking NTLM.
    const unc = `${BACKSLASH}${BACKSLASH}host${BACKSLASH}share${BACKSLASH}x.mp4`;
    expectReject(() => assertJobRelative(unc, 'outputPath'), 'UNSAFE_ARTEFACT_PATH');
  });

  it('refuses a NUL byte', () => {
    expectReject(() => assertJobRelative('renders/a\0b.mp4', 'outputPath'), 'UNSAFE_ARTEFACT_PATH');
  });

  it('refuses an empty value', () => {
    expectReject(() => assertJobRelative('', 'outputPath'), 'UNSAFE_ARTEFACT_PATH');
  });

  it('refuses a Windows reserved DEVICE name in ANY segment', () => {
    // The class-boundary sibling of the id guards. `renders/nul.mp4` stays
    // inside the job root, so containment passes it — and it then reaches
    // copyFileSync/FFmpeg as the null device.
    for (const bad of ['nul', 'renders/nul.mp4', 'renders/final/con.srt', `renders${BACKSLASH}aux.mp4`, 'com1/output.mp4']) {
      expectReject(() => assertJobRelative(bad, 'outputPath'), 'UNSAFE_ARTEFACT_PATH');
    }
  });

  it('still accepts a path whose segments merely CONTAIN a device name', () => {
    assertJobRelative('renders/nul-check.mp4', 'outputPath');
    assertJobRelative('renders/final/connect.srt', 'outputPath');
  });
});

describe('resolveJobRelative is the one call an artefact path should go through', () => {
  const jobRoot = join(JOBS, 'j1');

  it('resolves a job-relative path under the job root', () => {
    const resolved = resolveJobRelative(jobRoot, 'renders/final/M/output.mp4', 'outputPath');
    assert.ok(isAbsolute(resolved));
    assert.ok(resolved.startsWith(jobRoot + sep));
  });

  it('refuses a traversing stored path — the delivered-package vector', () => {
    // A stored `outputPath` of `../../../<something>` would have been copied verbatim
    // into `packages/<ulid>/master.mp4`, a directory whose whole purpose is to be
    // handed to a client.
    expectReject(() => resolveJobRelative(jobRoot, '../../../secret.txt', 'outputPath'), 'UNSAFE_ARTEFACT_PATH');
  });
});

describe('assertSafeId is reusable for any id that becomes a path component', () => {
  it('accepts ULIDs and ordinary ids', () => {
    assertSafeId('01J9RM2B3C4D5E6F7G8H9K0N1A', 'manifest id');
    assertSafeId('idx-1', 'job id');
  });

  it('refuses the traversal shapes', () => {
    expectReject(() => assertSafeId('../x', 'manifest id'), 'UNSAFE_ID');
    expectReject(() => assertSafeId(`a${BACKSLASH}b`, 'manifest id'), 'UNSAFE_ID');
  });

  /**
   * THE SHARED FIXTURE. `apps/cli/tests/paths.test.ts` and
   * `workers/indexer-python/tests/test_harness.py` drive the same file through
   * their own mirrors of this guard, so a case added here has to be agreed by
   * all three.
   *
   * This exists because the three copies DID diverge and nothing caught it:
   * Python's `$` also matches before a trailing newline, so `"abc\n"` was
   * accepted by the worker — the one mirror reachable without the CLI — and
   * rejected here. Three implementations with three independent test suites is
   * an invitation to drift; one fixture is the cheap structural fix this
   * project's own "add a lint" rule asks for.
   */
  const CASES = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', 'tests', 'safe-id-cases.json'), 'utf8'),
  ) as { accept: string[]; reject: string[] };

  it('agrees with the other two mirrors on every REJECTED id', () => {
    for (const bad of CASES.reject) {
      expectReject(() => assertSafeId(bad, 'job id'), 'UNSAFE_ID');
    }
  });

  it('agrees with the other two mirrors on every ACCEPTED id', () => {
    // The acceptance half is not decoration: a guard that rejects everything
    // passes every rejection test ever written, and `falcon`/`nul-check`/`com10`
    // are what keep the device rule anchored at the stem.
    for (const good of CASES.accept) {
      assertSafeId(good, 'job id');
    }
  });
});

describe('assertJobRelative rejects an alternate-data-stream path', () => {
  it('refuses a colon in a non-leading segment', () => {
    // `renders/a.mp4:hidden` stays inside the job root, so the impact is cosmetic
    // rather than an escape — but no legitimate artefact path contains a colon.
    expectReject(() => assertJobRelative('renders/a.mp4:hidden', 'outputPath'), 'UNSAFE_ARTEFACT_PATH');
  });
});

describe('assertContainedPhysical follows symlinks; assertContained does not', () => {
  let root: string;
  let jobRoot: string;
  let outside: string;
  let linkSupported = true;
  let junctionSupported = true;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'cutdown-link-'));
    jobRoot = join(root, 'jobs', 'j1');
    mkdirSync(join(jobRoot, 'renders'), { recursive: true });
    outside = join(root, 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'secret.txt'), 'not yours');
    try {
      symlinkSync(join(outside, 'secret.txt'), join(jobRoot, 'renders', 'linked.txt'), 'file');
    } catch {
      // Windows needs a privilege for file symlinks. A DIRECTORY junction does not,
      // which is why the security property is asserted through one below rather than
      // left to a skipped test — round 3 found that on this machine the escape case
      // was asserted NOWHERE while the suite still reported PASS.
      linkSupported = false;
    }
    try {
      mkdirSync(join(jobRoot, 'exports'), { recursive: true });
      symlinkSync(outside, join(jobRoot, 'exports', 'via-junction'), 'junction');
    } catch {
      junctionSupported = false;
    }
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('the LEXICAL check passes a link that points outside the job', (t) => {
    if (!linkSupported) return t.skip('file symlinks need a privilege this machine does not grant');
    // Documented, not accidental: `resolve()` normalises `..` and does not follow
    // links, which is why the physical variant exists.
    assertContained(jobRoot, join(jobRoot, 'renders', 'linked.txt'), 'linked');
  });

  it('the PHYSICAL check refuses it', (t) => {
    if (!linkSupported) return t.skip('file symlinks need a privilege this machine does not grant');
    // The case that matters: `package` copies this path into a delivered bundle.
    expectReject(
      () => assertContainedPhysical(jobRoot, join(jobRoot, 'renders', 'linked.txt'), 'linked'),
      'PATH_ESCAPES_ROOT',
    );
  });

  it('accepts a real file inside the job', () => {
    writeFileSync(join(jobRoot, 'renders', 'real.txt'), 'mine');
    assertContainedPhysical(jobRoot, join(jobRoot, 'renders', 'real.txt'), 'real');
  });

  it('has SOME link type available, or the escape property is asserted nowhere', () => {
    // Round 3 found the escape case covered by two tests that both skipped, while the
    // suite still reported PASS. Skipping the junction tests too would restore exactly
    // that hole, so the absence of BOTH link types is a failure, not a quiet skip.
    assert.ok(
      linkSupported || junctionSupported,
      'neither file symlinks nor directory junctions are available here, so the escape refusal cannot be proven on this machine — and a green suite would be a lie',
    );
  });

  it('refuses a READ through a directory junction pointing out of the job', (t) => {
    if (!junctionSupported) return t.skip('directory junctions are not available here');
    // The property the two skipped file-symlink tests above were meant to assert,
    // exercised through the link type Windows grants unprivileged. `package` copies
    // such a path into a delivered bundle, so this is the case that matters.
    assertContained(jobRoot, join(jobRoot, 'exports', 'via-junction', 'secret.txt'), 'junctioned');
    expectReject(
      () => assertContainedPhysical(jobRoot, join(jobRoot, 'exports', 'via-junction', 'secret.txt'), 'junctioned'),
      'PATH_ESCAPES_ROOT',
    );
  });

  it('refuses a WRITE target under a junction, resolving its nearest existing ancestor', (t) => {
    if (!junctionSupported) return t.skip('directory junctions are not available here');
    // Round-3 security LOW. The leaf does not exist, so `realpathSync` threw and the
    // old code RETURNED — the lexical check having passed — and the write landed
    // outside the job. The ancestor is what carries the link, so it is what must be
    // resolved. `assertContainedPhysical` is reached on write paths via
    // `resolveJobRelative`, so this was a live write escape, not a read-only one.
    expectReject(
      () => assertContainedPhysical(jobRoot, join(jobRoot, 'exports', 'via-junction', 'new-file.mp4'), 'write target'),
      'PATH_ESCAPES_ROOT',
    );
  });

  it('still accepts a legitimate write target that does not exist yet', () => {
    // The Phase-4 lesson: a guard that breaks the ordinary path is not a fix.
    assertContainedPhysical(jobRoot, join(jobRoot, 'reviews', 'not-yet.json'), 'write target');
    expectReject(
      () => assertContainedPhysical(jobRoot, join(root, 'elsewhere', 'not-yet.json'), 'write target'),
      'PATH_ESCAPES_ROOT',
    );
  });
});
