import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { JOBS_ROOT, WORKSPACE_ROOT } from '../paths.js';
import { invokeSkill } from './skill-invocation.js';

/**
 * Editorial CLI helpers (Phase 3): the job-lookup the `plan`/`validate` verbs need
 * (they take an artefact id, not a job id), and the two Phase-3 test meta-commands
 * `test:skills` and `test:models`.
 */

/**
 * The skills `test:skills` compiles and runs with no argument.
 *
 * Phase 5 adds the post-review skills. Not "the editorial skills" any more, but
 * the name is kept: it is the documented entry-gate command (tech-spec §7/§12),
 * and renaming it would be a contract change for a comment's benefit.
 */
export const EDITORIAL_SKILLS = ['propose', 'plan', 'validate', 'approve', 'package', 'revise'] as const;

/**
 * Find the job that owns an artefact file (e.g. `creative-briefs/<id>.json`).
 * `plan` and `validate` are addressed by artefact id, but every invocation is
 * logged against a job — so the id is resolved back to its job here.
 */
export function findJobForArtefact(subdir: string, fileName: string): string | null {
  if (!existsSync(JOBS_ROOT)) return null;
  for (const jobId of readdirSync(JOBS_ROOT)) {
    if (existsSync(join(JOBS_ROOT, jobId, subdir, fileName))) return jobId;
  }
  return null;
}

/**
 * Find the job that owns a RENDER, by its `renderId`.
 *
 * A render id is not a path: renders live at `renders/<tier>/<manifestId>/render.json`,
 * keyed by MANIFEST, so the render id has to be read out of each artefact. `approve`
 * and `package` are both addressed by render id (that is what an operator has in
 * hand after `cutdown render`), so both need this.
 *
 * Returns null rather than throwing on an unreadable artefact — the caller's next
 * move is to ask for `--job`, and a broken artefact in an unrelated job must not
 * stop that.
 */
export function findJobForRender(renderId: string): string | null {
  if (!existsSync(JOBS_ROOT)) return null;
  for (const jobId of readdirSync(JOBS_ROOT).sort()) {
    for (const tier of ['draft', 'final']) {
      const tierRoot = join(JOBS_ROOT, jobId, 'renders', tier);
      if (!existsSync(tierRoot)) continue;
      for (const manifestDir of readdirSync(tierRoot).sort()) {
        const renderPath = join(tierRoot, manifestDir, 'render.json');
        if (!existsSync(renderPath)) continue;
        try {
          const parsed = JSON.parse(readFileSync(renderPath, 'utf8')) as { renderId?: string };
          if (parsed.renderId === renderId) return jobId;
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}

/**
 * `cutdown test:skills [name]` — compile then run each editorial skill's tests via
 * the Node-24 GLOB form (decisions.md D-44: the directory-arg form throws a loader
 * error on Node 24). Returns 0 only if every suite passes.
 */
export function testSkillsCommand(name?: string): number {
  const names = name ? [name] : [...EDITORIAL_SKILLS];
  const tscJs = join(WORKSPACE_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  let failed = 0;

  for (const skill of names) {
    const tsconfig = join('skills', skill, 'tsconfig.json');
    if (!existsSync(join(WORKSPACE_ROOT, tsconfig))) {
      process.stderr.write(`test:skills — no skill named "${skill}" (${tsconfig} missing)\n`);
      failed += 1;
      continue;
    }

    process.stdout.write(`\n=== ${skill}: compile ===\n`);
    const build = spawnSync(process.execPath, [tscJs, '-b', tsconfig], { cwd: WORKSPACE_ROOT, encoding: 'utf8', shell: false });
    process.stdout.write(build.stdout ?? '');
    process.stderr.write(build.stderr ?? '');
    if (build.status !== 0) { failed += 1; continue; }

    const testsDir = join(WORKSPACE_ROOT, 'skills', skill, 'dist', 'tests');
    const testFiles = existsSync(testsDir)
      ? readdirSync(testsDir).filter((f) => f.endsWith('.test.js')).map((f) => join('skills', skill, 'dist', 'tests', f))
      : [];
    if (testFiles.length === 0) {
      process.stdout.write(`${skill}: no test files found\n`);
      continue;
    }

    process.stdout.write(`=== ${skill}: node --test (glob form, D-44) ===\n`);
    const run = spawnSync(process.execPath, ['--test', ...testFiles], { cwd: WORKSPACE_ROOT, encoding: 'utf8', shell: false });
    process.stdout.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    if (run.status !== 0) failed += 1;
  }

  process.stdout.write(`\ntest:skills — ${names.length - failed}/${names.length} skill suite(s) passed\n`);
  return failed === 0 ? 0 : 1;
}

/**
 * `cutdown test:models --live` — run the SAME property assertions the recorded
 * suites run, but against the REAL gateway. It is deliberately OFF the ordinary
 * entry gate and skips CLEANLY when the gateway is unconfigured (no key / no D-21
 * ceiling) — the expected Phase-0 state, blocked on D-21/D-27.
 */
export async function testModelsCommand(opts: { live: boolean; job?: string; variants: number }): Promise<number> {
  if (!opts.live) {
    process.stderr.write('test:models is a LIVE-only command; pass --live. It is never part of the entry gate.\n');
    return 2;
  }
  if (!opts.job) {
    process.stdout.write(
      'test:models --live needs a real, indexed --job <id> (D-27 footage) to exercise the live gateway.\n' +
        'Nothing to run; treating as a clean skip (live model proving is blocked on D-21/D-27).\n',
    );
    return 0;
  }

  // propose (live: no recorded model). A clean skip when the gateway is unconfigured.
  const propose = await invokeSkill({ skillName: 'propose', jobId: opts.job, request: { jobId: opts.job, variants: opts.variants } });
  const proposeResult = propose.result as { kind: string; count?: number; briefs?: Array<{ creativeBriefId: string }> };
  if (proposeResult.kind === 'skipped') {
    process.stdout.write('LIVE SKIP — the editorial gateway is not configured (no key / no D-21 ceiling). test:models is off the entry gate; nothing failed.\n');
    return 0;
  }
  if (proposeResult.kind === 'refusal') {
    process.stdout.write('LIVE — propose refused (REQ-036): the footage cannot support the requested variants. This is an honest result.\n');
    return 0;
  }
  // Property: N briefs returned.
  if (proposeResult.kind !== 'briefs' || (proposeResult.count ?? 0) < 1 || !proposeResult.briefs?.length) {
    process.stderr.write(`LIVE FAIL — propose did not return briefs: ${JSON.stringify(proposeResult)}\n`);
    return 1;
  }
  const creativeBriefId = proposeResult.briefs[0]!.creativeBriefId;
  process.stdout.write(`LIVE — propose returned ${proposeResult.count} brief(s); planning ${creativeBriefId}.\n`);

  const plan = await invokeSkill({ skillName: 'plan', jobId: opts.job, request: { jobId: opts.job, creativeBriefId, platform: 'tiktok' } });
  const planResult = plan.result as { kind: string; edlId?: string; validation?: { ok: boolean } };
  if (planResult.kind === 'skipped') { process.stdout.write('LIVE SKIP — gateway unconfigured at plan.\n'); return 0; }
  if (planResult.kind !== 'planned' || !planResult.edlId || planResult.validation?.ok !== true) {
    process.stderr.write(`LIVE FAIL — plan did not produce a resolved EDL: ${JSON.stringify(planResult)}\n`);
    return 1;
  }

  const validate = await invokeSkill({ skillName: 'validate', jobId: opts.job, request: { jobId: opts.job, edlId: planResult.edlId } });
  const validateResult = validate.result as { kind: string; gateStatus?: string };
  if (validateResult.kind !== 'validated' || (validateResult.gateStatus !== 'pass' && validateResult.gateStatus !== 'fail')) {
    process.stderr.write(`LIVE FAIL — validate did not produce a deterministic verdict: ${JSON.stringify(validateResult)}\n`);
    return 1;
  }

  process.stdout.write(`LIVE PASS — propose→plan→validate ran end-to-end; deterministic gateStatus=${validateResult.gateStatus}.\n`);
  return 0;
}
