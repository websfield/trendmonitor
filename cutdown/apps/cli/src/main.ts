#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

import { parse as parseYaml } from 'yaml';

import { parse, requirePositional, requireString } from './args.js';
import { buildContractsCommand, validateContractsCommand } from './commands/contracts.js';
import { rangeCheckCommand } from './commands/range-check.js';
import { invokeSkill, resolveUserPath } from './commands/skill-invocation.js';
import { runCommand, rebuildIndexCommand } from './commands/run.js';
import { findJobForArtefact, testModelsCommand, testSkillsCommand } from './commands/editorial.js';
import { listSkillNames, readSkill } from './skills.js';
import { shutdownTracing } from './otel.js';
import { CutdownError, EXIT_UNEXPECTED, reportError } from './errors.js';

/**
 * The `cutdown` CLI — the operator surface for Stage A (tech-spec §7).
 *
 * Convention, enforced by the router below: bare verbs (`brief`, `ingest`) are
 * SKILL commands operating on a job; colon-suffixed commands
 * (`build:contracts`) are repo/meta commands operating on the codebase. The
 * distinction is not cosmetic — skill commands write to `project-data/` and
 * append to a run log; meta commands touch the repo and never a job.
 */

const USAGE = `cutdown — editorial engine runtime (Phase 0)

Job commands (operate on a job under project-data/jobs/<job-id>/):
  cutdown brief <job-id> --file <brief.yaml|json>
      JobBrief intake. Validates against job-brief-v1 and writes to brief/.
      Non-interactive: missing required fields fail listing the field names.

  cutdown ingest <file-or-directory> --job <job-id> [--rights-manifest <file>]
      Atomic multi-asset ingest. A non-recursive local directory (or a single
      file) is classified, hashed, preflighted, and proxied. The job inventory
      commits only after EVERY asset validates.

  cutdown index <job-id> --asset <asset-id> [--speaker-map <file>] [--vlm]
      Index one ingested asset: transcript and speaker turns, shots and scenes,
      on-screen text, audio events, quality flags, then the Moment Graph. Every
      sub-stage resumes from its own checkpoint. The visual-description stage is
      SKIPPED unless --vlm is given (D-21 spend ceiling). --force <a,b> re-runs
      named sub-stages.

  cutdown propose <job-id> --variants N [--recorded-model <file>] [--query-vector <file>]
      Propose N distinct CreativeBrief angles from the job's Moment Graph, or
      refuse with a reason when the footage cannot support them (REQ-036). The
      model proposes; deterministic code validates every reject (D-37).

  cutdown plan <creative-brief-id> --platform tiktok [--job <id>] [--recorded-model <file>] [--bounds <file>]
      Turn one approved CreativeBrief into a MasterStoryPlan and a TikTok
      PlatformEDL, validating structure and every source range. Refuses any
      platform but tiktok (D-3). --job is inferred from the artefact if omitted.

  cutdown validate <platform-edl-id> [--job <id>] [--recorded-model <file>] [--bounds <file>] [--style-profile <file>]
      Run the deterministic editorial gate over a PlatformEDL and, separately, the
      advisory LLM critic. Writes two outputs; gateStatus comes only from the
      deterministic blockers (D-37). A 'fail' is a valid result, not an error.

  cutdown range-check --input <file>
      Validate source ranges against an asset's preflighted duration. The single
      implementation behind the "zero invalid source ranges" exit criterion —
      exit 0 clean, 1 violations, 2 unusable input.

  cutdown run <job-id>
      Advance a job through the REQ-152 state machine as far as the available
      skills allow, driving each stage via the skill-invocation path. Resumes
      from the run log (a completed stage is never re-run), stops cleanly at a
      not-yet-implemented stage boundary (awaiting) or a structured-error exit
      (blocked, recoverable), and prints the resulting job state. The run log
      stays authoritative; index.db is projected from it (tech-spec §8).

  cutdown rebuild-index [<job-id>]
      Delete/recreate the index.db projection and replay every job's run log
      (or one job's) to reconstruct it losslessly. Proves that deleting index.db
      loses zero job state (§5).

Editorial test meta-commands (operate on the codebase):
  cutdown test:skills [name]       Compile + run the editorial skills' test suites
                                   via the Node-24 glob form (D-44). Recorded, no network.
  cutdown test:models --live [--job <id>] [--variants N]
                                   Run the SAME property assertions against the REAL
                                   gateway. OFF the entry gate; skips cleanly when the
                                   gateway is unconfigured (blocked on D-21/D-27).

Skill plumbing:
  cutdown skills list
  cutdown skills run <name> --input <file> --output <file>

Contract commands (operate on the codebase):
  cutdown validate:contracts       Schemas parse; every fixture validates through
                                   BOTH Ajv and the generated Pydantic models.
  cutdown build:contracts [--check]  Run both generators; --check fails if the
                                   committed generated trees are stale.
`;

async function dispatch(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(USAGE);
    return 0;
  }

  switch (command) {
    case 'validate:contracts': {
      return validateContractsCommand();
    }

    case 'build:contracts': {
      const { options } = parse(rest, { check: { type: 'boolean' } });
      return buildContractsCommand(options['check'] === true);
    }

    case 'index': {
      const { positionals, options } = parse(rest, {
        asset: { type: 'string' },
        'speaker-map': { type: 'string' },
        'no-vlm': { type: 'boolean' },
        vlm: { type: 'boolean' },
        force: { type: 'string' },
      });
      const jobId = requirePositional(positionals, 0, 'job-id');
      const assetId = requireString(
        options,
        'asset',
        'Indexing is per-asset: --asset <assetId> from the ingest result.',
      );
      const speakerMap = options['speaker-map'];
      const forceList = typeof options['force'] === 'string' ? options['force'].split(',') : null;

      const outcome = await invokeSkill({
        skillName: 'index',
        jobId,
        request: {
          jobId,
          assetId,
          speakerMapPath:
            typeof speakerMap === 'string' ? resolveUserPath(speakerMap, 'Speaker map') : null,
          // Fail closed: the visual-description sub-stage costs money, and the
          // D-21 spend ceiling is owner-set and not yet in place. `--vlm` is the
          // explicit opt-in; absent it the stage is skipped with a reason.
          //
          // `--no-vlm` is honoured explicitly and WINS over `--vlm`. It is the
          // flag the phase plan documents, so it is the one an operator reaches
          // for — accepting it and then ignoring it would run a paid stage
          // against an explicit opt-out.
          noVlm: options['no-vlm'] === true || options['vlm'] !== true,
          force: forceList,
        },
      });
      process.stdout.write(`${JSON.stringify(outcome.result, null, 2)}\n`);
      return 0;
    }

    case 'range-check': {
      const { options } = parse(rest, { input: { type: 'string' } });
      const inputPath = resolveUserPath(
        requireString(options, 'input', 'Point it at a JSON file with `bounds` and `ranges`.'),
        'Range-check input',
      );
      return rangeCheckCommand(inputPath);
    }

    case 'run': {
      const { positionals } = parse(rest, {});
      const jobId = requirePositional(positionals, 0, 'job-id');
      return await runCommand(jobId);
    }

    case 'rebuild-index': {
      const { positionals } = parse(rest, {});
      return rebuildIndexCommand(positionals[0]);
    }

    case 'skills': {
      return dispatchSkills(rest);
    }

    case 'brief': {
      const { positionals, options } = parse(rest, { file: { type: 'string' } });
      const jobId = requirePositional(positionals, 0, 'job-id');
      const file = resolveUserPath(
        requireString(options, 'file', 'Point it at the JobBrief YAML or JSON to validate.'),
        'Brief file',
      );
      if (!existsSync(file)) {
        throw new Error(`Brief file not found: ${file}`);
      }
      // The brief may be YAML or JSON; the skill's contract is JSON, so the
      // parse happens here at the boundary rather than teaching every skill
      // two input dialects.
      const briefDocument = parseYaml(readFileSync(file, 'utf8')) as unknown;

      const outcome = await invokeSkill({
        skillName: 'brief',
        jobId,
        request: { jobId, sourcePath: file, brief: briefDocument },
      });
      process.stdout.write(`${JSON.stringify(outcome.result, null, 2)}\n`);
      return 0;
    }

    case 'propose': {
      const { positionals, options } = parse(rest, {
        variants: { type: 'string' },
        'recorded-model': { type: 'string' },
        'query-vector': { type: 'string' },
      });
      const jobId = requirePositional(positionals, 0, 'job-id');
      const variantsRaw = requireString(options, 'variants', 'How many CreativeBriefs to propose, e.g. --variants 3.');
      const variants = Number(variantsRaw);
      if (!Number.isInteger(variants) || variants < 1) {
        throw new Error(`--variants must be a positive integer, got ${JSON.stringify(variantsRaw)}.`);
      }
      const request: Record<string, unknown> = { jobId, variants };
      if (typeof options['recorded-model'] === 'string') request['recordedModelPath'] = resolveUserPath(options['recorded-model'], 'Recorded model');
      if (typeof options['query-vector'] === 'string') request['queryVectorPath'] = resolveUserPath(options['query-vector'], 'Query vector');
      const outcome = await invokeSkill({ skillName: 'propose', jobId, request });
      process.stdout.write(`${JSON.stringify(outcome.result, null, 2)}\n`);
      return 0;
    }

    case 'plan': {
      const { positionals, options } = parse(rest, {
        platform: { type: 'string' },
        job: { type: 'string' },
        'recorded-model': { type: 'string' },
        bounds: { type: 'string' },
      });
      const creativeBriefId = requirePositional(positionals, 0, 'creative-brief-id');
      const platform = requireString(options, 'platform', 'Target platform, e.g. --platform tiktok.');
      const jobId =
        (typeof options['job'] === 'string' ? options['job'] : undefined) ??
        findJobForArtefact('creative-briefs', `${creativeBriefId}.json`) ??
        undefined;
      if (!jobId) {
        throw new Error(`Could not find the job that owns CreativeBrief ${creativeBriefId}; pass --job <job-id>.`);
      }
      const request: Record<string, unknown> = { jobId, creativeBriefId, platform };
      if (typeof options['recorded-model'] === 'string') request['recordedModelPath'] = resolveUserPath(options['recorded-model'], 'Recorded model');
      if (typeof options['bounds'] === 'string') request['boundsPath'] = resolveUserPath(options['bounds'], 'Bounds');
      const outcome = await invokeSkill({ skillName: 'plan', jobId, request });
      process.stdout.write(`${JSON.stringify(outcome.result, null, 2)}\n`);
      return 0;
    }

    case 'validate': {
      const { positionals, options } = parse(rest, {
        job: { type: 'string' },
        'recorded-model': { type: 'string' },
        bounds: { type: 'string' },
        'style-profile': { type: 'string' },
      });
      const edlId = requirePositional(positionals, 0, 'platform-edl-id');
      const jobId =
        (typeof options['job'] === 'string' ? options['job'] : undefined) ??
        findJobForArtefact('edl', `${edlId}.json`) ??
        undefined;
      if (!jobId) {
        throw new Error(`Could not find the job that owns PlatformEDL ${edlId}; pass --job <job-id>.`);
      }
      const request: Record<string, unknown> = { jobId, edlId };
      if (typeof options['recorded-model'] === 'string') request['recordedModelPath'] = resolveUserPath(options['recorded-model'], 'Recorded model');
      if (typeof options['bounds'] === 'string') request['boundsPath'] = resolveUserPath(options['bounds'], 'Bounds');
      if (typeof options['style-profile'] === 'string') request['styleProfilePath'] = resolveUserPath(options['style-profile'], 'Style profile');
      const outcome = await invokeSkill({ skillName: 'validate', jobId, request });
      process.stdout.write(`${JSON.stringify(outcome.result, null, 2)}\n`);
      return 0;
    }

    case 'test:skills': {
      const { positionals } = parse(rest, {});
      return testSkillsCommand(positionals[0]);
    }

    case 'test:models': {
      const { options } = parse(rest, { live: { type: 'boolean' }, job: { type: 'string' }, variants: { type: 'string' } });
      const variants = typeof options['variants'] === 'string' ? Number(options['variants']) : 2;
      const modelsOpts: { live: boolean; job?: string; variants: number } = {
        live: options['live'] === true,
        variants: Number.isInteger(variants) && variants >= 1 ? variants : 2,
      };
      if (typeof options['job'] === 'string') modelsOpts.job = options['job'];
      return await testModelsCommand(modelsOpts);
    }

    case 'ingest': {
      const { positionals, options } = parse(rest, {
        job: { type: 'string' },
        'rights-manifest': { type: 'string' },
        'source-classification': { type: 'string' },
      });
      const inputPath = resolveUserPath(
        requirePositional(positionals, 0, 'file-or-directory'),
        'Ingest path',
      );
      const jobId = requireString(options, 'job', 'Every ingest belongs to a job: --job <job-id>.');
      const manifest = options['rights-manifest'];
      const classification = options['source-classification'];

      const outcome = await invokeSkill({
        skillName: 'ingest',
        jobId,
        request: {
          jobId,
          inputPath,
          rightsManifestPath:
            typeof manifest === 'string' ? resolveUserPath(manifest, 'Rights manifest') : null,
          // decisions.md D-36: every SourceAsset declares real or fixture, and
          // status reporting counts only `real`. Defaulting to `fixture` is the
          // fail-closed choice — a mislabelled fixture understates progress,
          // whereas a mislabelled real asset would inflate Phase 0 exit evidence.
          sourceClassification: classification === 'real' ? 'real' : 'fixture',
        },
      });
      process.stdout.write(`${JSON.stringify(outcome.result, null, 2)}\n`);
      return 0;
    }

    default: {
      process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
      return 1;
    }
  }
}

async function dispatchSkills(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;

  if (sub === 'list') {
    for (const name of listSkillNames()) {
      const skill = readSkill(name);
      process.stdout.write(
        `${name.padEnd(12)} v${skill.frontmatter.skillVersion.padEnd(8)} ${skill.frontmatter.execution.padEnd(6)} ${skill.frontmatter.description}\n`,
      );
    }
    return 0;
  }

  if (sub === 'run') {
    const { positionals, options } = parse(rest, {
      input: { type: 'string' },
      output: { type: 'string' },
      job: { type: 'string' },
    });
    const name = requirePositional(positionals, 0, 'skill-name');
    const inputPath = resolveUserPath(
      requireString(options, 'input', 'The request JSON to hand the skill.'),
      'Input',
    );
    const outputPath = resolveUserPath(
      requireString(options, 'output', 'Where the skill should write its result.'),
      'Output',
    );

    // The job id is normally carried inside the request; `--job` overrides it
    // for the rare direct invocation whose request has no job of its own.
    const request = JSON.parse(readFileSync(inputPath, 'utf8')) as { jobId?: string };
    const jobId =
      (typeof options['job'] === 'string' ? options['job'] : undefined) ?? request.jobId;
    if (!jobId) {
      throw new Error(
        'No job id: the request has no `jobId` and no --job was given. Skill invocations are always logged against a job.',
      );
    }

    const outcome = await invokeSkill({ skillName: name, jobId, request, inputPath, outputPath });
    process.stdout.write(
      `${name} ok in ${outcome.durationMs}ms → ${outcome.outputPath}\n`,
    );
    return 0;
  }

  process.stderr.write(`Unknown \`skills\` subcommand: ${sub ?? '(none)'}\n\n${USAGE}`);
  return 1;
}

async function main(): Promise<void> {
  let code = EXIT_UNEXPECTED;
  try {
    code = await dispatch(process.argv.slice(2));
  } catch (err) {
    code =
      err instanceof CutdownError
        ? reportError(err, err.skill, err.skillVersion)
        : reportError(err, 'cli', '1.0.0');
  } finally {
    await shutdownTracing();
  }
  process.exitCode = code;
}

await main();
