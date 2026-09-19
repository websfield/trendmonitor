# Phase 1 batch4 independent tenancy review

Reviewer: `/root/p1_b4_tenancy`, fresh default context, requested gpt-6-astra/max, no history fork; resolved runtime unverified. Tenth evaluation overall. Read-only; report saved by parent.

**Tenancy readiness: Ready · Grade A · PASS.** Zero findings. TEN02 resolved; TEN01/03 remain resolved.

The collector at `respin/packages/llm/tests/assemble-kinds.test.ts:598` counts declaration names before pruning function bodies.

Independent actual-scanner probes across584 tracked sources reject the original block-function shadow and held-out overloaded function, escaped declaration identifier, and renamed destructuring shadows. Unrelated nested declarations, named function expressions, methods and getter-local bindings remain accepted. All variants produced zero TypeScript diagnostics and ESLint errors/warnings. Shadow variants changed actual assembler execution to `quote_not_found`; positive controls preserved original evidence.

## Eight checklist dispositions

1. **PASS, retained:** scoped generation read through `ProfileScope.mint` and `generationsNewest`, with-workspace.ts:2790.
2. **Not triggered:** no shared-library contribution or seeding changes.
3. **PASS:** TEN02 forwarding assurance repaired; append-only brains, provenance and approval protections unchanged.
4. **PASS, retained:** no new sensitive inference or silent update.
5. **Not triggered:** no creator-data table or lifecycle changes.
6. **PASS, retained:** owner enforcement unchanged, with-workspace.ts:4084.
7. **PASS, retained:** content-free refusal handling unchanged, onboarding/actions.ts:323.
8. **PASS:** T1/T3 and AC2 remain traceable; declaration witnesses at assemble-kinds.test.ts:903 cover the obligation.

## Checks and coverage

Executed `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts -t 'mapper containment'`: exit0,49 passed/66 unselected,134.28 seconds. Read-only Node compiler/lint/runtime probes exited0. Reviewed retained red-stage, full-assembler and seven-command gate transcripts; no broad gate rerun.

Scanner and controls read; relevant assembler, scoping, refusal, contract and prior-review sections inspected. Unchanged T1/T3 coverage retained from batch3. All48 hashes, contract, lockfile, HEAD and manifest matched before/after; only the test file differs from batch3. No files edited.

**Verdict: PASS for tenancy.** Whole-phase readiness remains unverified: live Verification3 header4/4 outstanding; bad_shape unresolved. No live rerun or independent cross-model assurance claimed.
