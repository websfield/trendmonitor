import { ok, strictEqual, throws } from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { resetCapabilityCache } from '@cutdown/renderer-core';

import {
  CHECK_ORDER,
  checkFfmpeg,
  checkFfprobe,
  checkNode,
  checkPnpm,
  checkUv,
  formatReport,
  readEngines,
  runChecks,
  satisfiesRange,
  type DoctorCheck,
} from '../src/commands/doctor.js';

/**
 * `cutdown doctor` (product-program Stage 0A, task 20).
 *
 * The load-bearing claim is not "it prints some checks" — it is that a machine
 * MISSING a required tool gets told the one thing to do about it. So the ffmpeg
 * case is driven for real: PATH is replaced with an empty directory and the real
 * probe is called, producing a real ENOENT from a real `spawn`. Nothing here
 * stubs the thing under test.
 *
 * `probeCapabilities` memoises, which would otherwise make the second call in a
 * process return the first call's answer — `resetCapabilityCache` brackets every
 * PATH change for exactly that reason.
 */

let emptyDir: string;
let realPath: string | undefined;

/** Replace PATH with a directory containing nothing, so every PATH lookup misses. */
function scrubPath(): void {
  process.env['PATH'] = emptyDir;
  // Windows' env is case-insensitive through `process.env`, but a stale `Path`
  // set separately would survive the assignment above on some shells; clearing
  // it makes the scrub unambiguous on both platforms.
  delete process.env['Path'];
  resetCapabilityCache();
}

function restorePath(): void {
  if (realPath === undefined) delete process.env['PATH'];
  else process.env['PATH'] = realPath;
  resetCapabilityCache();
}

before(() => {
  emptyDir = mkdtempSync(join(tmpdir(), 'cutdown-doctor-'));
  realPath = process.env['PATH'];
});

after(() => {
  restorePath();
  rmSync(emptyDir, { recursive: true, force: true });
});

describe('cutdown doctor — a missing tool names its fix', () => {
  it('missing ffmpeg names the fix', async () => {
    scrubPath();
    try {
      const check = await checkFfmpeg();
      strictEqual(check.status, 'fail');
      ok(check.fix !== undefined && check.fix.length > 0, 'a failing check must carry a fix');
      ok(/libass/i.test(check.fix), `the fix must name libass, got: ${check.fix}`);
      ok(/PATH/i.test(check.fix), `the fix must say where it has to go, got: ${check.fix}`);
      // The detail is what was OBSERVED, and must not be the fix restated.
      ok(check.detail.length > 0 && check.detail !== check.fix);
    } finally {
      restorePath();
    }
  });

  it('ffprobe is checked separately, because a partial install is a real state', async () => {
    scrubPath();
    try {
      const check = await checkFfprobe();
      strictEqual(check.status, 'fail');
      ok(check.fix !== undefined && /ffprobe/i.test(check.fix));
    } finally {
      restorePath();
    }
  });

  it('with ffmpeg back on PATH the same probe passes — the failure was the environment, not the probe', async () => {
    const check = await checkFfmpeg();
    // This machine (and CI, which provisions FFmpeg) has it. If this ever fails,
    // the environment genuinely lacks libass and doctor is telling the truth.
    strictEqual(check.status, 'ok', `expected FFmpeg with libass on PATH: ${check.detail}`);
    ok(/subtitles/.test(check.detail) && /ass/.test(check.detail));
  });
});

describe('cutdown doctor — the report promotes exactly one fix', () => {
  const failing = (id: string, label: string): DoctorCheck => ({
    id,
    label,
    status: 'fail',
    detail: `${id} is broken`,
    fix: `fix ${id} first`,
  });
  const passing = (id: string, label: string): DoctorCheck => ({
    id,
    label,
    status: 'ok',
    detail: `${id} is fine`,
  });

  it('promotes the FIRST failure in blocking order and lists the rest', () => {
    const report = formatReport([
      passing('node', 'Node.js'),
      failing('ffmpeg', 'FFmpeg + libass'),
      failing('contracts', 'Generated contract types'),
    ]);
    ok(report.includes('Fix this one first — FFmpeg + libass'), report);
    ok(report.includes('fix ffmpeg first'), report);
    // The later failure is named but its fix is NOT promoted — one instruction,
    // not a wall.
    ok(report.includes('Then: Generated contract types'), report);
    ok(!report.includes('fix contracts first'), report);
    ok(report.includes('2 of 3 checks failed'), report);
  });

  it('a clean run says so and promotes nothing', () => {
    const report = formatReport([passing('node', 'Node.js'), passing('uv', 'uv (Python worker)')]);
    ok(report.includes('All 2 checks passed'));
    ok(!report.includes('Fix this one first'));
  });

  it('blocking order is a policy: FFmpeg outranks a stale generated tree', () => {
    // Stated as the property rather than as an index into CHECK_ORDER, so a
    // reorder that changes which fix an operator is given fails HERE, loudly.
    const ffmpegAt = CHECK_ORDER.findIndex((probe) => probe.name === 'checkFfmpeg');
    const contractsAt = CHECK_ORDER.findIndex((probe) => probe.name === 'checkGeneratedTrees');
    ok(ffmpegAt >= 0 && contractsAt >= 0, 'both probes must be in CHECK_ORDER');
    ok(
      ffmpegAt < contractsAt,
      'FFmpeg gates every job from ingest onward; a stale tree only gates the entry gate',
    );
  });
});

describe('cutdown doctor — version ranges are read, never duplicated', () => {
  it('reads the ranges from the real cutdown/package.json', () => {
    const engines = readEngines();
    ok(typeof engines.node === 'string' && engines.node.length > 0, 'engines.node must exist');
    ok(typeof engines.pnpm === 'string' && engines.pnpm.length > 0, 'engines.pnpm must exist');
    // The running Node must satisfy the range the workspace declares — if it did
    // not, the whole suite would be running outside its own supported engine.
    ok(satisfiesRange(process.version, engines.node));
  });

  it('the node check agrees with the declared range in both directions', async () => {
    const check = await checkNode();
    strictEqual(check.status, 'ok');
    ok(check.detail.includes(process.version));
    ok(!satisfiesRange('20.9.0', readEngines().node as string), 'Node 20 is below the node:sqlite floor (D-45)');
    ok(!satisfiesRange('25.0.0', readEngines().node as string), 'Node 25 is above the declared ceiling');
  });

  it('an unparseable clause THROWS rather than silently passing', () => {
    // A version checker that fails open is worse than none, because it is believed.
    throws(() => satisfiesRange('24.18.0', '^22.5.0'), /Unsupported version clause/);
    throws(() => satisfiesRange('24.18.0', '22.x'), /Unsupported version clause/);
    throws(() => satisfiesRange('not-a-version', '>=22.5.0'), /Unparseable version string/);
  });

  it('an unparseable clause throws even when an EARLIER clause already failed', () => {
    // The regression: `clauses.every(parse-and-test)` short-circuits, so a bad
    // clause sitting after a failing one was never parsed and the function
    // returned `false` — a verdict it had not computed, from a range it does not
    // understand. Order must not decide whether the refusal happens.
    throws(() => satisfiesRange('24.18.0', '>=25 ^22.5.0'), /Unsupported version clause/);
    throws(() => satisfiesRange('24.18.0', '^22.5.0 >=25'), /Unsupported version clause/);
  });

  it('a bare major with no operator is REFUSED, because its two readings disagree', () => {
    // `engines: "22"` means "22.x" to npm and "exactly 22.0.0" to a zero-filling
    // comparator. Answering either way is a guess, and the guess fails in a
    // believable direction: it would tell an operator running 22.7.1 to install
    // the 22 they already have.
    throws(() => satisfiesRange('22.7.1', '22'), /Ambiguous version clause/);
    throws(() => satisfiesRange('22.0.0', '22'), /Ambiguous version clause/);
    throws(() => satisfiesRange('22.7.1', '22.7'), /Ambiguous version clause/);
    // A COMPARISON operator is unambiguous and stays supported — `<25` is the
    // form `cutdown/package.json` actually declares.
    ok(satisfiesRange('24.18.0', '>=22 <25'));
    ok(!satisfiesRange('25.1.0', '>=22 <25'));
  });

  it('comparison is numeric, not lexicographic', () => {
    ok(satisfiesRange('24.18.0', '>=22.5.0'));
    ok(satisfiesRange('22.5.0', '>=22.5.0'), 'the floor itself satisfies >=');
    ok(!satisfiesRange('22.4.9', '>=22.5.0'));
    // The one a string compare gets wrong: "22.9" > "22.10" lexicographically.
    ok(satisfiesRange('22.10.0', '>=22.9.0'));
  });
});

describe('cutdown doctor — the real probe set on this machine', () => {
  it('no probe raises — a crashed check is the defect this pins', async () => {
    const checks = await runChecks();
    const raised = checks.filter((check) => check.label.includes('(raised)'));
    strictEqual(
      raised.length,
      0,
      `probe(s) raised instead of reporting: ${raised.map((r) => r.detail).join('; ')}`,
    );
  });

  it('every check is well-formed, and every failure carries a fix', async () => {
    const checks = await runChecks();
    strictEqual(checks.length, CHECK_ORDER.length, 'every probe reports; none is skipped');
    for (const check of checks) {
      ok(check.label.length > 0 && check.detail.length > 0, `${check.id} reported nothing`);
      ok(check.status === 'ok' || check.status === 'fail');
      if (check.status === 'fail') {
        ok(check.fix !== undefined && check.fix.length > 0, `${check.id} failed with no fix`);
      } else {
        strictEqual(check.fix, undefined, `${check.id} passed but carries a fix`);
      }
    }
    // The placeholder in `formatReport` exists only as a defect marker; if it is
    // ever rendered, a failing check shipped without a fix.
    ok(!formatReport(checks).includes('no fix recorded'));
  });
});

describe('cutdown doctor — a tool that is present but cannot RUN is a failure', () => {
  /**
   * The defect this pins, found by review and reproduced before fixing: every
   * non-`read` probe outcome fell through to `ok`, so `doctor` printed
   *
   *     OK    uv (Python worker)   ...\uv.EXE could not be spawned: spawn UNKNOWN
   *
   * — a green line whose own detail says the tool could not be spawned. Four
   * distinct states (shim / unrunnable / non-zero exit / timeout) had collapsed
   * into one empty version string, and NO test called `checkPnpm` or `checkUv`
   * at all, which is exactly why it survived to review.
   *
   * Driven for real: a file with the right name and the right extension is put
   * first on PATH, and the real probe tries to execute it.
   */
  async function withFakeToolFirstOnPath<T>(
    binary: string,
    contents: string,
    executable: boolean,
    body: () => Promise<T>,
  ): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), 'cutdown-doctor-fake-'));
    // `.exe` on Windows so `isDirectlyExecutable` says yes and the spawn is
    // actually attempted — a `.cmd` would take the (legitimate) shim path.
    const file = join(dir, process.platform === 'win32' ? `${binary}.exe` : binary);
    writeFileSync(file, contents);
    if (process.platform !== 'win32' && executable) chmodSync(file, 0o755);
    const saved = process.env['PATH'];
    process.env['PATH'] = `${dir}${delimiter}${saved ?? ''}`;
    try {
      return await body();
    } finally {
      if (saved === undefined) delete process.env['PATH'];
      else process.env['PATH'] = saved;
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('uv that is on PATH but not a runnable program FAILS, and the fix says so', async () => {
    const check = await withFakeToolFirstOnPath('uv', 'this is not a program\n', false, () => checkUv());
    strictEqual(check.status, 'fail', `expected fail, got ${check.status}: ${check.detail}`);
    ok(check.fix !== undefined);
    ok(/on PATH at/.test(check.fix), `the fix must name WHERE the unrunnable file is: ${check.fix}`);
    ok(/cannot run is not an installation/.test(check.fix), check.fix);
  });

  it('pnpm that is on PATH but not a runnable program FAILS — not "version unread"', async () => {
    const check = await withFakeToolFirstOnPath('pnpm', 'this is not a program\n', false, () => checkPnpm());
    strictEqual(check.status, 'fail', `expected fail, got ${check.status}: ${check.detail}`);
    // The specific regression: it must NOT be excused by the engine-strict
    // argument, which only ever applied to a shell shim.
    ok(!/engine-strict/.test(check.detail), `an unrunnable file is not a shim: ${check.detail}`);
  });

  // Both of the following are real SKIPs, not `if (win32) return`. An early return
  // reports the test as PASSED having asserted nothing, so the suite count claims a
  // check ran that never did — this project's own R1 ("an unrun check is not a
  // pass") turned on its own test suite. These two are the POSITIVE CONTROLS for
  // the round-1 BLOCK fix, so they are the last tests that should silently not run.
  const posixOnly = {
    skip: process.platform === 'win32' ? 'POSIX only — a runnable .exe cannot be synthesised here' : false,
  };

  it('a tool that runs but prints no readable version FAILS rather than passing empty', posixOnly, async () => {
    const check = await withFakeToolFirstOnPath('uv', '#!/bin/sh\necho "hello, not a version"\n', true, () =>
      checkUv(),
    );
    strictEqual(check.status, 'fail', `expected fail, got ${check.status}: ${check.detail}`);
    ok(/no readable version/.test(check.detail), check.detail);
  });

  it('a tool that answers properly PASSES — the failures above are not a blanket refusal', posixOnly, async () => {
    const check = await withFakeToolFirstOnPath('uv', '#!/bin/sh\necho "uv 9.9.9"\n', true, () => checkUv());
    strictEqual(check.status, 'ok', `expected ok, got ${check.detail}`);
    ok(check.detail.includes('9.9.9'));
  });
});

describe('cutdown doctor — a raising probe keeps its identity', () => {
  it('two raising probes are distinguishable, and the fix does not blame doctor', async () => {
    // The first cut labelled every raising probe "A check could not run", so the
    // report read "Then: A check could not run." and the promoted fix said the
    // defect was doctor's — when the commonest cause is a malformed `engines`
    // value that `satisfiesRange` throws on by design.
    async function checkAlpha(): Promise<DoctorCheck> {
      throw new Error('alpha exploded');
    }
    async function checkBeta(): Promise<DoctorCheck> {
      throw new Error('beta exploded');
    }
    const checks = await runChecks([checkAlpha, checkBeta]);
    strictEqual(checks.length, 2);
    strictEqual(checks[0]?.id, 'alpha');
    strictEqual(checks[1]?.id, 'beta');
    ok(checks[0]?.detail.includes('alpha exploded'));
    ok(checks[0]?.fix?.includes('checkAlpha'), 'the fix names the probe that raised');
    ok(checks[0]?.fix?.includes('alpha exploded'), 'the fix carries the real message, not a generic one');
    // The regression: the first cut's only instruction was "Report this — … a
    // defect in doctor itself", which sent the operator to the wrong place for
    // the commonest cause (their own malformed `engines` value).
    ok(!/^Report this/.test(checks[0]?.fix ?? ''), 'the fix must not open by blaming doctor');
    ok(
      /Read that message first/.test(checks[0]?.fix ?? ''),
      'the fix must point at the raised message, which usually names bad configuration',
    );
    const report = formatReport(checks);
    ok(report.includes('checkAlpha'), report);
    ok(report.includes('checkBeta'), report);
  });
});

describe('cutdown doctor — present-but-unverified is its own state, not a pass', () => {
  /**
   * A `.cmd` shim is present and this command declines to execute it (a shell
   * would be needed; see `tool-probe.ts`). That is neither a pass nor a failure,
   * and folding it into `ok` would put it inside "All N checks passed. This
   * machine can run the pipeline" — claiming a verification that did not happen.
   * The measurement canon this stage also authored states it first: an unrun
   * check is not a pass (R1).
   *
   * The `shim` arm was the ONE `ok`-producing arm of `ProbeOutcome` with no test
   * after the round-1 fix, which is how it kept its overstated status.
   */
  it('a Windows .cmd shim reports UNVERIFIED, and the summary refuses to say "all passed"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cutdown-doctor-shim-'));
    const shim = join(dir, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
    writeFileSync(shim, process.platform === 'win32' ? '@echo off\r\necho 10.28.2\r\n' : '#!/bin/sh\necho 10.28.2\n');
    const saved = process.env['PATH'];
    process.env['PATH'] = `${dir}${delimiter}${saved ?? ''}`;
    try {
      const check = await checkPnpm();
      if (process.platform === 'win32') {
        strictEqual(check.status, 'unverified', `expected unverified, got ${check.status}: ${check.detail}`);
        strictEqual(check.fix, undefined, 'unverified is not a failure, so it carries no fix');
        ok(/engine-strict/.test(check.detail), 'it must name what DOES enforce the range');
      } else {
        // On POSIX the shim is directly executable, so this is the `read` arm —
        // and the range check applies for real.
        strictEqual(check.status, 'ok');
      }
      // The summary line is the claim an operator carries away, so assert it
      // directly rather than trusting the status alone.
      const report = formatReport([
        { id: 'node', label: 'Node.js', status: 'ok', detail: 'fine' },
        { id: 'pnpm', label: 'pnpm', status: 'unverified', detail: 'a shell shim' },
      ]);
      ok(!report.includes('All 2 checks passed'), report);
      ok(report.includes('could not be verified'), report);
      ok(report.includes('pnpm'), report);
      ok(report.includes('Nothing is known to be broken'), report);
      ok(!report.includes('Fix this one first'), 'unverified must not promote a fix');
    } finally {
      if (saved === undefined) delete process.env['PATH'];
      else process.env['PATH'] = saved;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unverified does not fail the command, but a real failure still does', () => {
    const unverifiedOnly = formatReport([
      { id: 'pnpm', label: 'pnpm', status: 'unverified', detail: 'a shell shim' },
    ]);
    ok(!unverifiedOnly.includes('checks failed'), unverifiedOnly);
    const withFailure = formatReport([
      { id: 'pnpm', label: 'pnpm', status: 'unverified', detail: 'a shell shim' },
      { id: 'uv', label: 'uv (Python worker)', status: 'fail', detail: 'absent', fix: 'install uv' },
    ]);
    ok(withFailure.includes('1 of 2 checks failed'), withFailure);
    ok(withFailure.includes('install uv'), withFailure);
  });
});
