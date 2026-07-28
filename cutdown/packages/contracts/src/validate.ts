import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import {
  CONTRACTS_ROOT,
  FIXTURES_DIR,
  listContractSchemas,
  schemaName,
} from './paths.js';
import { compileContractValidators, createAjv, formatAjvErrors } from './ajv.js';
import { formatViolations, lintAllSchemas } from './subset-lint.js';

/**
 * `cutdown validate:contracts` — the entry gate (tech-spec §3, §12).
 *
 * Three things must hold, in order:
 *   1. every schema parses and obeys the documented style subset;
 *   2. every fixture validates (or fails to) as its directory declares;
 *   3. **Ajv and Pydantic agree on every fixture.**
 *
 * (3) is the one that is easy to omit and expensive to omit. A single-validator
 * gate proves the schema is self-consistent; it does not prove the two
 * GENERATED languages describe the same contract. Since TypeScript writes most
 * artefacts and Python reads them (decisions.md D-12 splits the skills across
 * both), a silent divergence would surface as a runtime type error inside a
 * long indexing run, not here.
 */

export type Expectation = 'valid' | 'invalid';

export interface FixtureCase {
  contract: string;
  /** e.g. `valid/minimal.json` */
  case: string;
  expected: Expectation;
  path: string;
}

export interface ValidatorOutcome {
  contract: string;
  case: string;
  expected: Expectation;
  accepted: boolean;
  error: string | null;
}

export interface ValidationReport {
  lintViolations: number;
  lintDetail: string;
  cases: number;
  /** Cases where a validator disagreed with the fixture's declared expectation. */
  failures: string[];
  /** Cases where Ajv and Pydantic disagreed with EACH OTHER. */
  disagreements: string[];
  /** True when the Python half could not run at all. */
  pythonUnavailable: boolean;
  pythonError: string | null;
}

/** Discover fixtures: `fixtures/<contract>/{valid,invalid}/<case>.json`. */
export function listFixtures(): FixtureCase[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  const out: FixtureCase[] = [];
  for (const contract of readdirSync(FIXTURES_DIR).sort()) {
    const contractDir = join(FIXTURES_DIR, contract);
    if (!statSync(contractDir).isDirectory()) continue;
    for (const expected of ['valid', 'invalid'] as const) {
      const bucket = join(contractDir, expected);
      if (!existsSync(bucket) || !statSync(bucket).isDirectory()) continue;
      for (const file of readdirSync(bucket).sort()) {
        if (!file.endsWith('.json')) continue;
        out.push({
          contract,
          case: `${expected}/${file}`,
          expected,
          path: join(bucket, file),
        });
      }
    }
  }
  return out;
}

/** Run every fixture through Ajv. */
export function validateWithAjv(fixtures: FixtureCase[]): ValidatorOutcome[] {
  const ajv = createAjv();
  const validators = compileContractValidators(ajv);

  return fixtures.map((fixture) => {
    const validate = validators.get(fixture.contract);
    if (!validate) {
      return {
        contract: fixture.contract,
        case: fixture.case,
        expected: fixture.expected,
        accepted: false,
        error: `No schema named ${fixture.contract} for this fixture directory.`,
      };
    }
    const instance = JSON.parse(readFileSync(fixture.path, 'utf8')) as unknown;
    const accepted = validate(instance) as boolean;
    return {
      contract: fixture.contract,
      case: fixture.case,
      expected: fixture.expected,
      accepted,
      error: accepted ? null : formatAjvErrors(validate.errors),
    };
  });
}

/** Run every fixture through the generated Pydantic models. */
export function validateWithPydantic(): {
  outcomes: ValidatorOutcome[];
  unavailable: boolean;
  error: string | null;
} {
  const script = join(CONTRACTS_ROOT, 'python', 'validate_fixtures.py');
  const workspaceRoot = join(CONTRACTS_ROOT, '..', '..');
  const result = spawnSync(
    'uv',
    ['run', '--project', workspaceRoot, '--group', 'dev', 'python', script, CONTRACTS_ROOT, FIXTURES_DIR],
    { encoding: 'utf8', shell: false, maxBuffer: 32 * 1024 * 1024 },
  );

  if (result.error) {
    return { outcomes: [], unavailable: true, error: `Could not run \`uv\`: ${result.error.message}` };
  }
  if (result.status !== 0) {
    return {
      outcomes: [],
      unavailable: true,
      error: `Python validator exited ${result.status}:\n${result.stderr || result.stdout}`,
    };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { results: ValidatorOutcome[] };
    return { outcomes: parsed.results, unavailable: false, error: null };
  } catch (err) {
    return {
      outcomes: [],
      unavailable: true,
      error: `Python validator produced unparseable output: ${(err as Error).message}\n${result.stdout.slice(0, 2000)}`,
    };
  }
}

export function validateContracts(): ValidationReport {
  const violations = lintAllSchemas();
  const fixtures = listFixtures();

  const failures: string[] = [];
  const disagreements: string[] = [];

  // Every contract must own at least one fixture of each kind. A contract with
  // no invalid fixture has never been shown to REJECT anything — the most
  // common way a schema quietly stops being a constraint.
  const covered = new Map<string, Set<Expectation>>();
  for (const f of fixtures) {
    if (!covered.has(f.contract)) covered.set(f.contract, new Set());
    covered.get(f.contract)!.add(f.expected);
  }
  for (const schemaPath of listContractSchemas()) {
    const name = schemaName(schemaPath);
    const have = covered.get(name) ?? new Set<Expectation>();
    for (const kind of ['valid', 'invalid'] as const) {
      if (!have.has(kind)) {
        failures.push(
          `${name}: no ${kind} fixture. Every contract needs both — an invalid fixture is the only proof the schema rejects anything.`,
        );
      }
    }
  }

  const ajvOutcomes = validateWithAjv(fixtures);
  const python = validateWithPydantic();

  const key = (o: { contract: string; case: string }): string => `${o.contract}::${o.case}`;
  const pyByKey = new Map(python.outcomes.map((o) => [key(o), o]));

  for (const outcome of ajvOutcomes) {
    const shouldAccept = outcome.expected === 'valid';
    if (outcome.accepted !== shouldAccept) {
      failures.push(
        outcome.accepted
          ? `${key(outcome)}: Ajv ACCEPTED a fixture declared invalid — the schema does not constrain what this fixture violates.`
          : `${key(outcome)}: Ajv rejected a fixture declared valid:\n${outcome.error}`,
      );
    }

    if (!python.unavailable) {
      const py = pyByKey.get(key(outcome));
      if (!py) {
        disagreements.push(`${key(outcome)}: Ajv saw this fixture, Pydantic did not.`);
      } else if (py.accepted !== outcome.accepted) {
        disagreements.push(
          `${key(outcome)}: Ajv ${outcome.accepted ? 'accepted' : 'rejected'} but Pydantic ${py.accepted ? 'accepted' : 'rejected'}. ` +
            `The two generated languages disagree about this contract. Ajv: ${outcome.error ?? 'ok'} | Pydantic: ${py.error ?? 'ok'}`,
        );
      }
    }
  }

  for (const py of python.outcomes) {
    const shouldAccept = py.expected === 'valid';
    if (py.accepted !== shouldAccept) {
      failures.push(
        py.accepted
          ? `${key(py)}: Pydantic ACCEPTED a fixture declared invalid.`
          : `${key(py)}: Pydantic rejected a fixture declared valid: ${py.error}`,
      );
    }
  }

  return {
    lintViolations: violations.length,
    lintDetail: formatViolations(violations),
    cases: fixtures.length,
    failures,
    disagreements,
    pythonUnavailable: python.unavailable,
    pythonError: python.error,
  };
}

export function reportIsClean(report: ValidationReport): boolean {
  return (
    report.lintViolations === 0 &&
    report.failures.length === 0 &&
    report.disagreements.length === 0 &&
    !report.pythonUnavailable
  );
}
