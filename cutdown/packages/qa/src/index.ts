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

/**
 * Technical QA (Phase 4, Task 8) — the same discipline applied to the render:
 * thresholds are data (`data/rulesets/technical-qa-v1.yaml`), blockers are
 * non-waivable (D-35), and a check that could not run says so rather than
 * reporting clean.
 */
export * from './technical/index.js';
