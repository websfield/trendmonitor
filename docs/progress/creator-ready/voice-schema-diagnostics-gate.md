# Gate record — voice schema diagnostics + bounded retry (A+C)

**Gate ID:** `creator-ready-voice-schema-diagnostics`
**Opened:** 2026-09-18
**Relationship to the Phase 1 gate:** SEPARATE. The Phase 1 gate
(`creator-ready-phase-1`) reached batch 4 with 11 evaluations and recorded "No
further review allowance implied"; that budget and its open findings stay
intact and still owed. This gate covers only the new source below, created on
2026-09-18 after the live walk. Owner decision of 2026-09-18 registered this as
a new gate at batch 0 rather than as a continuation.

## Review history

Batch 0. No evaluation has been dispatched for this gate before this
reservation. This line is the establishing record (§2): the gate was created in
this session and has no prior consumption.

## What is assessed (fixed inputs)

Base commit `79de2db`, working tree uncommitted. Source under review:

| File | Change |
|---|---|
| `respin/packages/llm/src/assemble.ts` | `AssemblySchemaIssue` type; `AssemblyError.schemaIssue`; populated at the `bad_shape` throw |
| `respin/app/(product)/safe-log.ts` | `schemaIssueFields` clamp; `SCHEMA_KEYS_LOGGED_MAX` |
| `respin/app/(product)/onboarding/actions.ts` | passes `schemaIssueFields(err.schemaIssue)` into `logRefusal` |
| `respin/packages/credits/src/inference.ts` | `RunInferenceParams.validate`; retry loop; shared deadline; `schema_invalid` row for a discarded attempt |
| `respin/packages/credits/src/infer-voice.ts` | supplies `validate`; captures `parsed`; fail-closed guard |
| `respin/packages/credits/tests/infer-voice.test.ts` | retry + money-invariant assertions (one prior assertion deliberately changed, see below) |
| `respin/tests/voice-schema-diagnostics.test.ts` | new suite (10 tests) |

## Reserved slots — batch 0

| Slot | Reviewer | Critical Path | Status |
|---|---|---|---|
| 1 | `respin-billing-reviewer` | Respin billing & credits (`Full gates? yes`) | DISPATCHED 2026-09-18, running |
| 2 | `respin-compliance-reviewer` | Respin spin compliance | DISPATCHED 2026-09-18, running |

Both slots are consumed from the moment of dispatch. A run that is interrupted
or returns no terminal result stays consumed and incomplete; it does not earn a
free retry (§2). Two evaluations consumed on this gate so far.

Both paths keep separate reviewers regardless of the project's `lean` intensity,
because billing is a `Full gates? yes` row. No final consolidator slot is
reserved: two specialists on two disjoint paths, each returning its own verdict.

Planned dispatch: both in parallel, read-only, against the fixed inputs above.

## Facts the reviewers must be given

- Entry gate: `typecheck`, `lint`, `worker:typecheck` pass; full suite
  **5,372 passed / 236 files, 0 skipped**, run with `TEST_DATABASE_URL` so the
  Docker concurrency suites were live.
- Three mutation witnesses were planted and went red, then restored with
  `sha256sum -c` confirming both touched sources byte-identical.
- One PRE-EXISTING assertion was deliberately changed: `infer-voice.test.ts`
  asserted `model_usage` had 1 row after an unreadable reply; it now asserts 2
  (two real vendor calls), plus same-attempt-id and zero-debit. This is a
  behaviour change, not a weakened assertion, and is the single most important
  thing for the billing reviewer to judge.
- A `symbol-citations` guard caught a comment naming a symbol that never
  existed (`logVoiceAssemblyContext`); corrected to `schemaIssueFields`.
- No live `bad_shape` has occurred since the change, so the new log line is
  proven by test only, never in production.

## Results

Pending — no evaluation dispatched at the time this record was written.
