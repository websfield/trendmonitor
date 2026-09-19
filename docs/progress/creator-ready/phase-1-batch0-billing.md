# Phase 1 implementation — batch 0 billing

Independent reviewer: /root/phase1_batch0_billing. Requested gpt-6-astra/max, no history fork; resolved runtime unverified.

**Readiness: Almost · Grade B. Verdict: NEEDS CHANGES.** Billing implementation appears sound, but two required AC3 test guards are incomplete. Counts: 0 BLOCK, 0 High, 2 Medium.

## Findings

- **BILL-P1-001 — Medium, high confidence.** `respin/tests/onboarding-ui.test.tsx:1503`: the money-honesty scan still covers only `SPEND_ONLY`; it never scans the three rendered pre-vendor assembly refusals required by AC3. Separate literal-copy assertions pass. Extend the scan to those three rendered states and retain its omission witness.
- **BILL-P1-002 — Medium, high confidence.** `respin/tests/onboarding-ui.test.tsx:1624`: the preservation guard checks only declaration names and absence of assembly-kind strings. It does not assert that `ONBOARDING_ERROR_CODES` and `ONBOARDING_OVERRIDES` retain their contents, as AC3 requires. Independently pin the two named initializers.

Both findings concern required regression protection; neither establishes a current charging defect.

## Full checklist

1. B1 PASS for this diff: no ledger/stored-balance change; derived fold remains at `packages/credits/src/fold.ts:255`.
2. B2 PASS for this diff: Stripe handling unchanged; event identity and transaction boundaries remain at `stripe/webhooks.ts:953,1088,1110`. Double-delivery and grace/downgrade assertions inspected; their suites passed in parent transcript.
3. B3 PASS for this diff: no settlement/vendor-call change. Voice preparation precedes runInference, parsing follows settlement (`infer-voice.ts:207,214,236`). Debit/persistence retain shared transaction (`generate.ts:1314,1400`).
4. B4 PASS for this diff: expiry/pause unchanged. Pause suspension and allocation order reviewed. Current tech-spec R-20 governs soonest effective expiry first, superseding older checklist wording.
5. B5 PASS: credits changes are re-exports only; prices, allowances, config versions and settlement unchanged.
6. B6 PASS: T8 uses existing entitlement facade and identical Date for sibling quote; zero allowance removes only add form, preserving rows/removal/action gate.
7. Threshold provenance PASS: no new price/allowance; zero comparison tests configured allowance.
8. B7 NEEDS CHANGES: real PGlite inference/write composition and effective mutations present; two AC3 guards incomplete.

## Verification and coverage

- All 48 manifest source hashes plus accepted contract/lock hashes matched before and after.
- Compared 63 money source files with base, normalizing line endings: only permitted facade re-exports changed.
- Four parked billing-copy initializers independently compared byte-identical. Onboarding copy tables, config, settlement and niche actions/storage unchanged.
- Ran `pnpm -C respin exec vitest run tests/onboarding-ui.test.tsx tests/onboarding-refusal-log.test.ts tests/trends-page.test.tsx tests/trends-niche-ui.test.tsx packages/credits/tests/voice-build-tolerance.test.ts packages/llm/tests/assemble-kinds.test.ts`: 298 tests in 6 files passed, exit 0.
- Actual-module read-only `node --import tsx --input-type=module` mapper/parser probe: 4,704 whitespace/astral cases passed. First invocation suffered PowerShell Unicode pipe corruption; discarded and rerun with Unicode escapes.
- Inspected AC12 records, especially w2/w2e/w8/w8b: intended red assertions, controls and green restorations. Did not mutate frozen source independently.
- Inspected parent seven-command transcript: all exits 0, 5,203 tests passed/101 skipped.
- Read applicable canon, T1(iii)/T8, AC3/11/12, notes, relevant changed/new tests, changed billing/UI code, money-affecting mapper/provenance and unchanged money authorities. Other presentation work inspected only for billing effects.

No live journey, screenshots, Docker concurrency run or independent cross-model check. Environmental acceptance gaps remain; this report does not establish whole-phase Ready.

One reserved batch-0 evaluation completed. Close BILL-P1-001 and BILL-P1-002 before billing PASS.
