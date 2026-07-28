import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

/**
 * Filesystem layout of the contracts package.
 *
 * Resolved from this module's own URL rather than `process.cwd()`: every caller
 * spawns skills with the *skill* directory as cwd (tech-spec §6.2), so a
 * cwd-relative path here would resolve differently depending on who called.
 */
const here = dirname(fileURLToPath(import.meta.url));

/** `packages/contracts/` — this package's root, two levels up from `dist/src/`. */
export const CONTRACTS_ROOT = resolve(here, '..', '..');

export const SCHEMAS_DIR = join(CONTRACTS_ROOT, 'schemas');
export const COMMON_DIR = join(SCHEMAS_DIR, 'common');
export const ENUMS_DIR = join(CONTRACTS_ROOT, 'enums');
export const FIXTURES_DIR = join(CONTRACTS_ROOT, 'fixtures');
export const GENERATED_DIR = join(CONTRACTS_ROOT, 'generated');
export const GENERATED_TS_DIR = join(GENERATED_DIR, 'typescript');
export const GENERATED_PY_DIR = join(GENERATED_DIR, 'python');
export const GENERATED_PY_PACKAGE = join(GENERATED_PY_DIR, 'cutdown_contracts');

/**
 * The base URI every `$id` is derived from.
 *
 * `.local` is a reserved TLD that can never resolve on the public internet — the
 * identifiers are stable names, and nothing should ever attempt to fetch one.
 */
export const ID_BASE = 'https://cutdown.local/contracts';

function jsonFilesIn(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(dir, name))
    .filter((p) => statSync(p).isFile())
    .sort();
}

/**
 * Top-level object schemas — the ones with a `schemaVersion` and a `changelog`,
 * one per PRD §5 contract object.
 *
 * Deliberately NOT recursive: `schemas/common/` holds shared `$defs` that are
 * referenced rather than instantiated, and they must not be mistaken for
 * contracts in their own right (they carry no version lineage of their own).
 */
export function listContractSchemas(): string[] {
  return jsonFilesIn(SCHEMAS_DIR);
}

/** Shared definition files under `schemas/common/`. Referenced only. */
export function listCommonSchemas(): string[] {
  return jsonFilesIn(COMMON_DIR);
}

/** Single-source enum registries (tech-spec §3). Referenced only. */
export function listEnumSchemas(): string[] {
  return jsonFilesIn(ENUMS_DIR);
}

/** Every schema file the validator must load, in a stable order. */
export function listAllSchemaFiles(): string[] {
  return [...listEnumSchemas(), ...listCommonSchemas(), ...listContractSchemas()];
}

/**
 * The `$id` a file at `absPath` is required to declare.
 *
 * Deriving the expected id from the path — rather than trusting whatever the
 * file says — is what catches a copy-pasted schema that kept its source's `$id`.
 * Two files sharing an `$id` is not a cosmetic problem: Ajv would silently
 * resolve every `$ref` to whichever one was registered first.
 */
export function expectedId(absPath: string): string {
  const rel = relative(CONTRACTS_ROOT, absPath).split(sep).join('/');
  return `${ID_BASE}/${rel}`;
}

/** Bare contract name (`job-brief-v1`) from a schema path. */
export function schemaName(absPath: string): string {
  const base = absPath.split(sep).pop() ?? absPath;
  return base.replace(/\.json$/, '');
}
