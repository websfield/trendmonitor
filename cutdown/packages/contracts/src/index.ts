/**
 * `@cutdown/contracts` — the contract layer.
 *
 * JSON Schema under `schemas/` is the only source of truth (tech-spec §3).
 * Generated TypeScript types live in `generated/typescript/` and are imported
 * from `@cutdown/contracts/generated`; this entry point exports the *machinery*
 * — validation, hashing, codegen, and the style-subset lint.
 */

export * from './paths.js';
export * from './artefact-paths.js';
export * from './subset-lint.js';
export * from './ajv.js';
export * from './hash.js';
export * from './range-check.js';
export * from './reviews.js';
export * from './output-identity.js';
export * from './contract-set.js';
export * from './generate.js';
export * from './check-generated.js';
export * from './validate.js';
export { PLATFORM_EDL_SCHEMA_VERSION, RENDER_SCHEMA_VERSION } from './versions.js';
