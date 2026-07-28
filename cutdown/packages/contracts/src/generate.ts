import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { compileFromFile } from 'json-schema-to-typescript';

import {
  CONTRACTS_ROOT,
  GENERATED_PY_PACKAGE,
  GENERATED_TS_DIR,
  SCHEMAS_DIR,
  listContractSchemas,
  schemaName,
} from './paths.js';
import { formatViolations, lintAllSchemas } from './subset-lint.js';

/**
 * Contract codegen (tech-spec §3, decisions.md D-24).
 *
 * JSON Schema is the ONLY source of truth. TypeScript types and Python Pydantic
 * models are generated from it and committed beside their generators; neither
 * is ever hand-written. `build:contracts` runs BOTH generators and fails on
 * either — agreement between the two is itself part of the contract, so a
 * schema that only one of them can express is a schema defect, not a generator
 * problem.
 *
 * A note for whoever tidies this up later: the generated TypeScript contains a
 * handful of structurally-identical aliases (`Timebase1`…`Timebase4`,
 * `ContentHash1`, `Ulid1`). They exist because those schemas attach a use-site
 * `description` alongside a `$ref`, and json-schema-to-typescript materialises
 * an annotated reference as its own type. That is a deliberate trade: the
 * use-site prose ("for audio this is {num: 1, den: sampleRate}, so ticks ARE
 * sample counts") is precisely what stops the field being misused, and these
 * schemas are the product's law. TypeScript is structurally typed, so the
 * aliases interoperate freely. Do NOT strip the descriptions to tidy the
 * generated output.
 */

const CODEGEN_BANNER = `/* eslint-disable */
/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source of truth: packages/contracts/schemas/. Regenerate with:
 *   pnpm -C cutdown exec cutdown build:contracts
 *
 * This tree is COMMITTED, never gitignored (tech-spec §3): a schema change, its
 * changelog entry, and the regenerated types land in the same commit, and
 * \`build:contracts --check\` fails when regeneration would dirty it.
 */
`;

export interface GenerateOptions {
  /** Write somewhere other than the committed trees — used by `--check`. */
  tsOutDir?: string;
  pyOutDir?: string;
}

/** Generate the TypeScript tree. Returns the files written, path → contents. */
export async function generateTypeScript(outDir: string): Promise<Map<string, string>> {
  const written = new Map<string, string>();
  const names: string[] = [];

  for (const schemaPath of listContractSchemas()) {
    const name = schemaName(schemaPath);
    names.push(name);
    const body = await compileFromFile(schemaPath, {
      cwd: SCHEMAS_DIR,
      bannerComment: '',
      additionalProperties: false,
      declareExternallyReferenced: true,
      enableConstEnums: false,
      format: true,
    });
    written.set(join(outDir, `${name}.ts`), `${CODEGEN_BANNER}\n${body}`);
  }

  // Namespaced barrel. A flat `export *` would collide — `Envelope`, `Timebase`
  // and friends legitimately appear in several contracts — and renaming them
  // away would make the generated names diverge from the schema titles. The
  // namespace layout also mirrors the generated Python package, so the two
  // languages read the same way.
  const barrel = [
    CODEGEN_BANNER,
    ...names.map((n) => `export * as ${toNamespace(n)} from './${n}.js';`),
    '',
  ].join('\n');
  written.set(join(outDir, 'index.ts'), barrel);

  return written;
}

/** `job-brief-v1` → `JobBriefV1` */
function toNamespace(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Generate the Python tree by running `datamodel-codegen` over the whole
 * `schemas/` directory, so cross-file `$ref`s become real module imports and
 * `schemas/common/` is factored out rather than copied into every model.
 */
export function generatePython(outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  const args = [
    'run',
    '--project',
    join(CONTRACTS_ROOT, '..', '..'),
    '--group',
    'dev',
    'datamodel-codegen',
    '--input',
    SCHEMAS_DIR,
    '--input-file-type',
    'jsonschema',
    '--output',
    outDir,
    '--output-model-type',
    'pydantic_v2.BaseModel',
    '--target-python-version',
    '3.12',
    // The enum registries live in `enums/`, a sibling of the input directory.
    // They are trusted, in-repo, local files; without this flag the generator
    // emits a deprecation warning for every one of them.
    '--allow-remote-refs',
    // Use schema `title`s as class names, so a tagged union's branches come out
    // as `NoCta`/`PrimaryCta` rather than `Cta`/`Cta1`.
    '--use-title-as-name',
    // Without this, every file carries a generation timestamp and
    // `build:contracts --check` would report the tree dirty on every run —
    // turning the staleness gate into noise that gets ignored.
    '--disable-timestamp',
    '--formatters',
    'black',
    'isort',
    '--use-standard-collections',
    '--use-union-operator',
  ];

  const result = spawnSync('uv', args, { encoding: 'utf8', shell: false });
  if (result.error) {
    throw new Error(`Could not run \`uv\` for the Python generator: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `datamodel-codegen failed (exit ${result.status}):\n${result.stderr || result.stdout}`,
    );
  }
}

/** Run both generators into the committed trees. */
export async function generateAll(options: GenerateOptions = {}): Promise<void> {
  const violations = lintAllSchemas();
  if (violations.length > 0) {
    throw new Error(
      `Schema subset lint failed — ${violations.length} violation(s). ` +
        `The style subset (tech-spec §3) is what keeps BOTH generators valid:\n${formatViolations(violations)}`,
    );
  }

  const tsOut = options.tsOutDir ?? GENERATED_TS_DIR;
  const pyOut = options.pyOutDir ?? GENERATED_PY_PACKAGE;

  const tsFiles = await generateTypeScript(tsOut);
  rmSync(tsOut, { recursive: true, force: true });
  mkdirSync(tsOut, { recursive: true });
  for (const [path, contents] of tsFiles) {
    writeFileSync(path, contents, 'utf8');
  }

  rmSync(pyOut, { recursive: true, force: true });
  generatePython(pyOut);
  // A generated package needs a marker so `pytest`'s importer treats it as one.
  const initPath = join(pyOut, '__init__.py');
  let init = '';
  try {
    init = readFileSync(initPath, 'utf8');
  } catch {
    /* generator did not emit one */
  }
  if (!init.includes('GENERATED')) {
    writeFileSync(
      initPath,
      `"""GENERATED PACKAGE — DO NOT EDIT.\n\nSource of truth: packages/contracts/schemas/.\nRegenerate with: pnpm -C cutdown exec cutdown build:contracts\n"""\n\n${init}`,
      'utf8',
    );
  }
}
