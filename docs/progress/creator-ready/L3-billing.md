# L3 gate — `respin-billing-reviewer` (billing & credits, full) (2026-10-04)

Frozen manifest `L3-gate.sha256` digest `d96685b4f2c6`: 37/37 OK before and after the reviewer's test run. Reviewer ran `TEST_DATABASE_URL=… vitest run packages/credits/tests/recent-context.test.ts packages/credits/tests/revision.test.ts packages/config/tests/config.test.ts` (3 files, 77 passed). Nothing edited or planted.

**Verdict: PASS · Ready · A.** 0 BLOCK, 0 High, 0 Medium, 1 Low, 3 Notes. The erased-context terminal takes no customer debit, keeps the vendor spend inside both uncharged caps, cannot double-settle, and leaves every pre-L3 intent hash and v2 snapshot working.

## Findings

- **Low** `packages/credits/tests/recent-context.test.ts:795-824`: case 8 never asserts that the operation's `model_usage` rows stay `consumed_included_build = false`. Those rows must keep counting toward `countUnchargedBillableAttempts` and `sumUnchargedBillableCostMicroUsd`. The code is correct today: the only writer that sets the flag for a generation is `settleGeneration` (`with-workspace.ts:5209-5219`), and the `contextErased` branch never reaches it. But a later change that marks this terminal's rows consumed would widen the free-tier spend bound unseen. Fix: assert every `model_usage` row for `op-erased` is unconsumed, and that `sumUnchargedBillableCostMicroUsd` > 0.
- **Note (low confidence)** `generate.ts:1668-1673, 1856-1864`: the erased-context decision is made under the lock, but the `recovery_required` transition is written later in its own transaction (same pattern as the 24 h path). Row presence is not strictly one-way: a concurrent same-id resume that ran after a row was reinserted could settle and charge once while the first caller reports `recovery_required`. No double charge is possible: the `settleGeneration` claim-state predicate and `credit_ledger_inference_debit_uq` both hold. No product path reinserts an erased row; both tables are insert-only per `table-writers.test.ts`. Optional fix: advance to `recovery_required` inside the locked transaction.
- **Note** `credits/src/app-server.ts:745-781` vs `studio/actions.ts:258, 383`: the facade accepts `sequel` for `findConcept`/`commissionPiece`, but neither action passes it. There is no billing effect, because an absent value hashes as before.
- **Note** `modes/src/assemble.ts:953-966`, `config/src/schema.ts:437-443`: `recentContextCharBudget` raises input cost per generation and rewrite call. This fails safe: the measured cap binds earlier and nothing leaks. But the cap's revisit-trigger comment names only `llm.maxOutputTokens`. Optional: name it as a co-trigger.

## Least-confident answers

1. **Does the terminal leak paid spend from the uncharged bounds?** No. Both caps count unconsumed `model_usage` rows (`with-workspace.ts:2254-2306`). Only `settleGeneration` consumes them, and `contextErased` returns before the debit and before settlement (`generate.ts:1660-1674`). This is shown by reading the code, with no test witness yet (the Low).
2. **Can it double-settle?** No. The settle transaction re-reads the claim `FOR UPDATE` and requires `vendor_complete`. A concurrent loser reaches the same terminal or replays. The one-debit-per-attempt unique index is unchanged.
3. **Is R-151's resume order preserved?** Yes. The order is: intent check, `observeExistingClaim`, then `settle`. `settle` checks moved, then 24 h, then erased context, then snapshot-config pricing, then the debit. Cases 8, 10 and 10b witness this.
4. **Do hashes change, or can a changed payload replay as identical?** Neither. `intentHashOf` is byte-identical to the pre-L3 version whenever `sequel !== true`. `assertOriginShape` refuses a cast non-boolean before the hash and before the same-id lookup (case 3b).

## Checklist

- B1 append-only ledger ✅
- B2 n/a
- B3 debit-in-transaction ✅
- B4 n/a
- B5 config-not-code ✅ (schema `:469`, default `:486`, seed `:139-142`; the per-operation budget is recorded in the snapshot)
- B6 tier gates ✅
- Threshold provenance ✅
- B7 money paths tested ✅, with the one Low gap
