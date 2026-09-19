# Phase 1 implementation — batch 1 billing

Independent `/root/p1_b1_billing`; requested gpt-6-astra/max, fork_turns none; resolved runtime unverified. One reserved evaluation completed, read-only.

**Readiness: Ready · Grade A · PASS.** Zero BLOCK/High/Medium findings; no new billing regression.

- **BILL-P1-001 RESOLVED:** `respin/tests/onboarding-ui.test.tsx:1549` scans all three rendered pre-vendor refusals; independent literal assertions and omission witness remain.
- **BILL-P1-002 RESOLVED:** `respin/tests/onboarding-ui.test.tsx:1648` independently pins both named initializers, all override titles/details and exported runtime code list.

## Full checklist

1. B1 PASS retained: ledger/schema unchanged, derived fold at `packages/credits/src/fold.ts:255`; R-20 lot fold governs older naive-sum wording.
2. B2 PASS retained: webhook event identity/transactions unchanged (`stripe/webhooks.ts:953,1088,1110`); double-delivery/grace tests at `tests/stripe.test.ts:573,609,675`.
3. B3 PASS: preparation before inference, parsing after settlement (`infer-voice.ts:207,214,236`); generation debit transaction at `generate.ts:1314,1400`. No vendor-call/settlement change.
4. B4 PASS retained: expiry/pause unchanged; pause suspension `fold.ts:58`; R-20 soonest effective expiry first.
5. B5 PASS: credits-source changes facade exports only; costs, allowances, versions, settlement unchanged.
6. B6 PASS: active-config entitlement facade `app-server.ts:648`, sibling quote shares clock, zero allowance preserves removal, action gate intact.
7. Threshold provenance PASS: no new monetary threshold/allowance; zero tests configured allowance.
8. B7 PASS: both guards repaired, real PGlite inference/write passes, retained w8/w8b evidence shows red and restored green.

## Validation and coverage

Reviewer ran `pnpm -C respin exec vitest run tests/onboarding-ui.test.tsx tests/onboarding-refusal-log.test.ts tests/trends-page.test.tsx tests/trends-niche-ui.test.tsx packages/credits/tests/voice-build-tolerance.test.ts packages/llm/tests/assemble-kinds.test.ts`:308 tests/six files, exit0.

Read-only `pnpm exec node --import tsx --input-type=module` probe imported actual RunOutcome and independently enumerated16 kinds plus kindless/fallback/idle:19 states passed. Initial harness hit standalone JSX missing React global; corrected harness passed, no source changes.

All48 source hashes, contract, lock and HEAD matched before/after. Retained seven-command green transcript inspected. Fresh parent Bash-resolution failure/focused shell pass was parent-reported, not executed by reviewer.

Read governing canon/contract, prior report, repair notes, mutations, affected source/tests and relevant unchanged money authorities. Unchanged batch0 coverage retained, not a new whole-package audit. No mutation plants or edits. Whole-phase readiness remains Not yet: live journey, screenshots and Docker concurrency missing; no cross-model verification claimed.
