/**
 * `@cutdown/qa` — the deterministic editorial QA gates (Phase 3, Task 7).
 *
 * The LLM critic is advisory evidence only; every BLOCKING decision is computed
 * here in versioned, deterministic code (decisions.md D-37). Blockers are
 * non-waivable (D-35). The two result sets — deterministic blockers and critic
 * advisories — are kept separate by construction and never reclassified.
 */

export * from './editorial-checks.js';
export * from './editorial-gates.js';
