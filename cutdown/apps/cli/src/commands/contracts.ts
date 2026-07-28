import {
  checkGenerated,
  formatDrift,
  generateAll,
  isClean,
  reportIsClean,
  validateContracts,
} from '@cutdown/contracts';

/**
 * The two contract entry-gate commands (tech-spec §3, §12).
 *
 * Colon-suffixed, per the CLI convention in §7: bare verbs (`ingest`, `render`)
 * operate on a job; colon-suffixed commands operate on the codebase.
 */

/** `cutdown validate:contracts` */
export function validateContractsCommand(): number {
  const report = validateContracts();

  if (report.lintViolations > 0) {
    process.stderr.write(
      `Schema style-subset violations (${report.lintViolations}):\n${report.lintDetail}\n\n`,
    );
  }

  if (report.pythonUnavailable) {
    process.stderr.write(
      'The Python validator could not run, so Ajv/Pydantic agreement was NOT checked.\n' +
        'This is a FAILURE, not a warning: single-validator validation proves the schema is\n' +
        'self-consistent, never that the two generated languages describe the same contract.\n' +
        `Detail: ${report.pythonError ?? '(none)'}\n\n`,
    );
  }

  for (const failure of report.failures) {
    process.stderr.write(`FAIL  ${failure}\n`);
  }
  for (const disagreement of report.disagreements) {
    process.stderr.write(`DISAGREE  ${disagreement}\n`);
  }

  const ok = reportIsClean(report);
  process.stdout.write(
    `validate:contracts — ${report.cases} fixture case(s), ` +
      `${report.lintViolations} lint violation(s), ` +
      `${report.failures.length} failure(s), ` +
      `${report.disagreements.length} cross-validator disagreement(s): ${ok ? 'PASS' : 'FAIL'}\n`,
  );
  return ok ? 0 : 1;
}

/** `cutdown build:contracts [--check]` */
export async function buildContractsCommand(check: boolean): Promise<number> {
  if (check) {
    const drift = await checkGenerated();
    if (isClean(drift)) {
      process.stdout.write('build:contracts --check — generated trees are current: PASS\n');
      return 0;
    }
    process.stderr.write(
      'Generated contract types are STALE. The committed TypeScript and Python no longer\n' +
        'match the schemas they are generated from, so both languages are compiling against\n' +
        'a contract that does not exist. Run `cutdown build:contracts` and commit the result\n' +
        'in the same commit as the schema change (tech-spec §3).\n\n' +
        `${formatDrift(drift)}\n`,
    );
    return 1;
  }

  await generateAll();
  process.stdout.write(
    'build:contracts — regenerated generated/typescript and generated/python.\n' +
      'Commit the regenerated trees alongside the schema change and its changelog entry.\n',
  );
  return 0;
}
