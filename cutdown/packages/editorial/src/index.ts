/**
 * `@cutdown/editorial` — the editorial stage core (Phase 3).
 *
 * The model PROPOSES; deterministic code here VALIDATES and owns every blocking
 * decision (decisions.md D-37). Nothing in this package ever fabricates an
 * embedding, a description, or a score, and every failure fails closed.
 */

export * from './gateway.js';
export * from './brief.js';
export * from './retrieval.js';
export * from './angles.js';
export * from './story-plan.js';
export * from './platform-adapt.js';
export * from './edl-resolve.js';
export * from './schema.js';
export * from './util.js';
