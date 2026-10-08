# L2 gate — respin-billing-reviewer re-run (§5) (2026-10-04)

Frozen manifest `L2-rerun.sha256` (93 files, digest `285ff31cf5b4`). `sha256sum -c` passed 93/93 before and after. The reviewer ran `vitest run generate.test.ts pasted-reference-availability.test.ts studio-page-entrances.test.tsx isolation.test.ts` live: 4 files, 147 passed.

**Verdict: PASS · Ready · Grade A.** 0 BLOCK · 0 CHANGE · 4 Note.

## Movement
- **B-1 High: RESOLVED.**
  - `recordSpend` (`generate.ts:1484-1506`) retries in a fresh transaction. Both `recordUsage` sites on the generation path use it.
  - After two failures the success path throws `GenerationRecoveryRequiredError`, which routes to `recovery_required`: no debit, null candidate, and the creator copy stays true.
  - In a double outage, the sweeper (`generation-recovery.ts:116`) closes `vendor_started`.
  - The `refusalCodeFor` docblock is now honest.
- **B-2 Medium: RESOLVED.** `pastedReferenceInPlan` reads billing state only and takes no lock. The page handles three states. The test is non-vacuous: the lock-refusing database rejects the old quote read.
- **B-3 Low: RESOLVED.** The comment is true: the only `update(modelUsage)` is the consumed flag.
- **B-4 Low: RESOLVED.** The in-flight counting is pinned both ways (`generate.test.ts:3133`), and the consequence is stated in R-151 item 5.
- **B-5 Low: RESOLVED.** The price comes from the panel's own config-priced offer, and a config-perturbation test pins it.
- **Note 2** (the reload copy): RESOLVED. **Note 1** (a resume refused on balance or pause clears the paid candidate): unchanged by design and recorded.

## Notes (optional)
- **Lost acknowledgement on a committed write → duplicate usage row.**
  - Attempt cap: unaffected (it counts distinct `attemptId`s).
  - Cost cap: at most one transient over-refusal, which ends once settlement consumes both rows.
  - Rollup and margin: overstates cost and understates margin (the D-M2-13 direction).
  - No wrong charge, refund or missed refusal. Judged acceptable. To make the retry exact: a per-call client row id plus `ON CONFLICT DO NOTHING`.
- **A v1 `request_snapshot` at `vendor_complete` is refused on resume (`recovery_required`, no debit), never mis-priced.**
  - Only local or dev databases that ran round-1 L2 code can hold one, because migration `0062` is not deployed.
  - Accepting `v ∈ {1,2}` would be lossless. That is the owner's call; refusing is the fail-closed direction.
- **`spendCostOf` (`generate.ts:1508-1518`) re-implements `recordUsage`'s cost rule.** Consider exporting one `usageCostOf`.
- **Onboarding's success-path `recordUsage` (`inference.ts:1004`) is the same unguarded class as P3-R5.** It sits inside the A-11 fence, so it belongs to L5.
