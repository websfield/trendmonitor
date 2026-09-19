# Batch 10 billing plan review

**Readiness: Almost · Grade: B · NEEDS CHANGES**

Returned by `/root/batch10_billing`: 0 BLOCK, 1 Medium CHANGE, 1 Low CHANGE. Phase 0 batch-15 Ready/A remains accepted; Phase 3 money implementation remains parked.

## Findings

- **B10-C1 — Medium, high confidence.** Phase 2:74 requires reconciliation across retained dispatch artifacts before another dispatch, but T4:95 and AC5:139 suppress every upload when a main-chapter screenshot is missing or a blocking note exists. A consuming refusal followed by a missing screenshot or later chapter failure loses its evidence with the ephemeral runner. Existing notes write only to disk (`respin/e2e/support/artifacts.ts:41,79`). No alternate durable consumption record is specified. Unknown/stop prevents further authorized spending, but failed-dispatch reconciliation becomes unavailable.
- **B10-C2 — Low, high confidence.** Phase 2:76 prescribes persisted usage outcome `ok`; the database enum is `succeeded`, `schema_invalid`, `rate_limited`, `unavailable`, `refused` (`packages/db/src/onboarding-schema.ts:83`). Successful inference records `succeeded` before parsing (`packages/credits/src/inference.ts:877`, `infer-voice.ts:231`). Action `status: ok` differs from parser failure `status: refused` (`app/(product)/onboarding/actions.ts:309,323`). The prescribed mock does not represent the persisted case.

## Checklist dispositions

1. Append-only ledger/derived balance: no new violation; reader read-only, existing lot-fold authority applied.
2. Idempotency: no webhook changes; existing double-delivery, grace/downgrade, zero-balance tests inspected, not executed.
3. Transactional debit: no settlement rewrite; claim/usage and parse-after-settlement checked. C1 affects evidence, not ledger mutation.
4. Expiry/pause: no changes; current effective-expiry authority applied, pre/post-claim pause explicit.
5. Config: no new violation; existing entitlement facade, no invented allowance.
6. Tier gates: no new violation; server owner authority retained, buy-pack assertion unconditional.
7. Threshold provenance: maxima only, no positive call floor; recorded dispatch/refusal caps retained.
8. Money tests: NEEDS CHANGES for C1/C2; classifier mutations and database integration specified, retention case and persisted fixture deficient.

## Prior findings

B9-C1 PARTIAL: claim/attempt reconciliation, unknown, truncation, pause and deduplication specified; C1 leaves failed-dispatch retention incomplete. B9-C2 RESOLVED (w8b propagated). B9-C3 RESOLVED (17/51 maxima, no floor, before SDK retries). B9-C4 RESOLVED (35 individually accounted: 33 present, one no-change, one unrecoverable report). B9-N1 RESOLVED (missing seeded control fails). Parked settlement/copy and usage-read residuals remain disclosed; Phase 0 not reopened.

## Evidence limits

Read complete canon/checklist/skill, master, both active phases, brief, codebase review, current repair/batch-9 reports, umbrella dependency/Phase-0 batch-15 evidence, map and relevant claim/usage/inference/actions/config/artifact/test sources. Read-only Get-Content, rg and git diff HEAD --name-only -- respin; no product paths returned (global-ignore warning). No tests, runtime witnesses, mutations or external writes. Parent document checks and historical tests are not current implementation acceptance. Nested cross-model review unavailable. Requested gpt-6-astra/max; runtime resolution unverified.
