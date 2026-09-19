# Batch 11 tenancy plan review

Independent `/root/batch11_tenancy`, requested default gpt-6-astra/max, fork_turns none; runtime resolution unknown. Returned 2026-09-18. **Almost / Grade B / NEEDS CHANGES.** One Medium, high confidence; no High/BLOCK. Plan assessment only.

## Finding

**B11-C1 confirmed (same as billing, not additional).** P2:76 puts raw records under artifacts/consumption; :78 rejects extra fields, symlinks, foreign IDs and malformed records for the separate manifest. T4:99/AC5:143 upload the whole artifacts tree excluding only _handoff after cleanup/behavioral scan success. A content-bearing unexpected field fails consumption validation but remains uploadable through the main report. P2:80 negative tests miss this alternate route. Counting authority remains intact: rejected records never authorize dispatch. No separate cleanup/unknown-stop defect found.

## All eight tenancy checks

1. Scoping PASS at plan level: retained P1:96,112,192 scoped composition and own/sibling/foreign/cross-parent witnesses; P2:72,80 test-only readonly reader, validated owner/profile, stdin SQL binding and both scope predicates.
2. Mechanism stripping N/A: no session-library or founding seeding change.
3. Append-only/provenance/approval PASS: P1:90,110,188 original slices, offset domain, mapper containment, proposal/confirmation unchanged; batch10 source verification retained.
4. Sensitive inference PASS unchanged: no new inference/automatic activation.
5. Export/deletion N/A to new product tables: none added; synthetic evidence assessed under check7.
6. Roles/admin PASS: P2:55,96,99,143 UI signup, validated ID, allowlist startup, editor assertions; evidence grants no product authority.
7. PII/secrets NEEDS CHANGES B11-C1: serialization protects only separate upload. P2:78,99,128,143 otherwise retains cleanup/process absence/handoff removal/content-free fields.
8. Falsifiability/provenance NEEDS CHANGES B11-C1 upload population: P2:80 negatives omit effect on main upload; existing provenance/containment witnesses retained.

## Prior movement

B10-C1 resolved for original screenshot/BLOCKING reproducer P2:76-80; B11-C1 is a repair-introduced boundary defect. B10-C2 resolved P2:80 persisted succeeded/action distinction. B9-C1 resolved P2:72-80,139,144 scoped claims/usage, deduplication, durable reconciliation. T9-1 retained P1:90,188 forwarding/override plants. T9-2 retained P1:110,188 pre-slice domain/witnesses. T9-3 retained P2:99,128,143 bounded cleanup/both uploads. T9-4 retained P1:90 callback/table. Batch10's fifteen older closures remain unchanged, accounting batch10-tenancy.md:32. Phase0 batch15 Ready/A retained, no current product acceptance.

## Bounded diagnostic and coverage

New reproducer: malformed raw record plus successful cleanup/behavioral checks. Population: writer, validator, both uploads, workflow tests, AC5. Cause: validating one destination while same source remains reachable through another.

Fully read both phases, brief, codebase review, tenancy checklist/skill, gate rules, batch10 tenancy/generalist and batch11 billing. Read current reservation/master, repair disposition and dependency/batch15 proof. Inspected artifact/handoff helpers and journey callers. Retired master history not fully reread. Read-only Get-Content/rg/rg --files; no edits/tests/mutations/Linux/Docker/dispatch/external actions/subdelegation. Parent checks not reviewer executions; historical 5067 passed/101 skipped/23 Docker files NOT RUN remains historical. Cross-model unavailable. Verdict NEEDS CHANGES, B11-C1 only.
