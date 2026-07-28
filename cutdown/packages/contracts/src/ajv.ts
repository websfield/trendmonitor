import { readFileSync } from 'node:fs';

// ajv and ajv-formats are CommonJS. Under NodeNext, a default import of either
// is typed as the whole module namespace (not constructable / not callable), so
// both are reached through their NAMED bindings — which Node's CJS lexer does
// expose, and which are correctly typed. Verified against ajv 8.20.0.
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import type { FormatsPlugin } from 'ajv-formats';
import * as ajvFormats from 'ajv-formats';

// `ajv-formats` has a CJS default export that NodeNext types as the namespace
// itself, so TypeScript sees no call signature. The runtime shape was verified
// directly (`typeof ns.default === 'function'` against ajv-formats 3.0.1); this
// asserts that verified shape rather than widening the module to `any`.
const addFormats = (ajvFormats as unknown as { default: FormatsPlugin }).default;

import { listAllSchemaFiles, listContractSchemas, schemaName } from './paths.js';

/**
 * One Ajv instance with every schema, enum, and shared definition registered by
 * `$id`, so cross-file `$ref`s resolve without network access.
 *
 * Strict mode stays ON. `schemaVersion` and `changelog` are legitimate
 * annotations that Ajv would otherwise reject as unknown keywords, so they are
 * declared rather than silenced with `strict: false` — turning strict off
 * globally would also hide genuine typos like `requred` or `additionalProperies`,
 * which is exactly the class of mistake this package exists to prevent.
 */
export function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    // `$data` and code generation defaults are fine; we only validate.
    validateFormats: true,
  });
  addFormats(ajv);

  ajv.addKeyword({ keyword: 'schemaVersion', metaSchema: { type: 'string' } });
  ajv.addKeyword({ keyword: 'changelog', metaSchema: { type: 'array' } });

  for (const file of listAllSchemaFiles()) {
    const schema = JSON.parse(readFileSync(file, 'utf8')) as object;
    ajv.addSchema(schema);
  }
  return ajv;
}

/** Compiled validators for the top-level contracts, keyed by bare name. */
export function compileContractValidators(
  ajv: Ajv2020,
): Map<string, ValidateFunction> {
  const out = new Map<string, ValidateFunction>();
  for (const file of listContractSchemas()) {
    const schema = JSON.parse(readFileSync(file, 'utf8')) as { $id?: string };
    if (!schema.$id) {
      throw new Error(`${file} has no $id; subset lint should have caught this.`);
    }
    const validate = ajv.getSchema(schema.$id);
    if (!validate) {
      throw new Error(`Ajv could not resolve ${schema.$id}.`);
    }
    out.set(schemaName(file), validate);
  }
  return out;
}

/** Render Ajv errors as one readable line each. */
export function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return '(no detail)';
  return errors
    .map((e) => `    ${e.instancePath || '/'} ${e.message ?? ''}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`)
    .join('\n');
}
