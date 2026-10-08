# L1 gate — respin-billing-reviewer, round 1 (2026-10-03)

Frozen tree: working tree over `3533dbf`, `L1-freeze.sha256` digest `0b6f478fe312` (reviewer: 40/40 OK before and after).

**Verdict: NEEDS CHANGES · Almost · Grade B.** 0 BLOCK, 0 High, 1 CHANGE Medium, 1 CHANGE Low, 6 NOTE. No money invariant broken: ledger, idempotency, debit-in-transaction and refusal-before-vendor hold.

## Least-confident line: what a v2 parse refusal costs

`validateDocument` rejects → `ScriptOutputError` (no rewrite) → attempt `refused/parse_failed`, no settlement, no debit. The creator pays nothing. Respin pays the vendor call; its `model_usage` row is `schema_invalid`, billable, `consumedIncludedBuild=false`, counted by the per-profile hourly uncharged-attempt cap (10) and cost cap (`with-workspace.ts:2153-2218`). The cap is shared across modes, so a high v2 miss rate is an availability risk for the profile, not a money one. v2 rows carry their own bundle version, so the miss rate is measurable.

## Findings

- **CHANGE Medium** `respin/packages/credits/tests/generate.test.ts:2204`; code `respin/packages/credits/src/generate.ts:980-991`. No credits-level test drives a v2 reply that fails the strict parse through `generate`; every `schema_invalid` assertion uses v1 replies. A v2-only lenient metering branch would stay green and book misses `succeeded`/`consumedIncludedBuild=true`, escaping both caps (R-101 class). Fix: integration test with v2 parse-refused replies (stray `pivot`, missing `basis.kind`, model-written `contractVersion`) on draft 1 and on the rewrite; assert `parse_failed`, zero debits, `schema_invalid` with `consumedIncludedBuild=false`, and press cap+1 refused before the vendor.
- **CHANGE Low** `respin/packages/credits/tests/revision.test.ts:1197`. `ideaToScript` + `auto` never asserts its provider-call count. Fix: `expect(s.calls).toHaveLength(2)` on the parent half.
- **NOTE 1** `generate.ts:1316-1328` (pre-existing, more frequent under L1): draft 1's usage row is `consumedIncludedBuild=true` because it parsed; if the rewrite then fails to parse, draft 1's cost is invisible to both caps (bounded ≈2×). Follow-up: decide "consumed" from the settled outcome.
- **NOTE 2** New form/filming rules end in a charged honest refusal after the rewrite (existing tech-spec §3 step 5 behaviour, including the `same-kit-different-name` false positive); L5's T6-P decision should list them.
- **NOTE 3** v2 lengthens prompts and replies at an unchanged price; measure per bundle version before L6.
- **NOTE 4** Envelope 4 / deploy: no stranded debit. A pre-L1 `vendor_complete` row is never read by the new code; the SQL sweep moves it to `recovery_required` after 24 h; only that call's vendor cost is lost. That no `vendor_complete` row settles in production predates L1 and belongs to L2.
- **NOTE 5** An explicit creative request on a revision can swap the form at the revision price (no Studio control; hand-built post only). L2/L4 should decide whether a form swap is a new commission.
- **NOTE 6** `creative.ts:98-109` input bounds cite inline reasoning; they are input bounds, not prices; no B5 violation.

## Probes

Envelope stranding: no stranded debit. `hashRequest`: collision-free (creative record last, `JSON.stringify` of a fixed-position array) and replay-stable; Unicode-normalisation and list-order variants hash apart (refusal, never another's output). Refusal ordering: creative parse at `generate.ts:437/470` before price, caps, slot, claim and vendor; price never depends on `creative`; `readCandidate` enforces `output.requestedForm === request.creative.formChoice`. Money claims proven and non-vacuous (`generate.test.ts:2204` debits `[-3,-3]` and 2 calls; `:2302` 5 credits and 2 calls; `revision.test.ts:1163` revision price, 4 calls). Transactions intact. Reviewer ran `vitest` on `generate.test.ts` + `revision.test.ts` (110 passed); no mutations; Docker suites not run.
