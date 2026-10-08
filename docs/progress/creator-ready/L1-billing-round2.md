# L1 gate — respin-billing-reviewer, round 2 (the one permitted re-run, 2026-10-03)

Frozen tree: `L1-freeze-r2.sha256`, 41/41 OK before and after; sorted digest `3a85025daeb4`.

**Verdict: PASS · Ready · Grade A.** 0 BLOCK, 0 High, 0 Medium, 0 Low, 4 Note.

## Round-1 findings

- CHANGE Medium (no v2 strict-parse-failure money test): **closed** — `respin/packages/credits/tests/generate.test.ts:2450` (model-written `contractVersion`, missing `basis.kind`, stray `pivot` on the rewrite; `refused/parse_failed`, `schema_invalid` + `consumedIncludedBuild=false`, zero debits/generations; cap 3 → fourth press `GenerationUnchargedAttemptCapError` before the vendor with `never()`). Non-vacuous by its exact-equality assertions (`:2476`, `:2497`); reverse direction covered at `:2237`.
- CHANGE Low (`ideaToScript` + auto call count): **closed** — `revision.test.ts:1212`.
- NOTE 1: still open by design, routed to L2 (R-149 item 8; pinned at `:2520-2523`).

## Questions

1. Server `[check]` marks before the kill test (`pipeline.ts:171-174,205-208,263-266`): pure, cannot throw on a schema-valid draft, re-reads through `readStoredScriptOutput`; only removes findings (former rewrites become first-draft passes); filming fields are not in `eventUnits`; witnessed `pipeline.test.ts:1257` (`calls === 1`).
2. `EVENT_SHAPES` false positives: call bound unchanged (≤2 generation calls + ≤1 scoring call on accept); every new rule returns a finding, never a throw, so outcomes settle charged (usable or billable honest refusal) and nothing enters or escapes the uncharged cap. Exposure: one extra vendor call per false positive; a persistent one is a charged refusal (Note A).
3. `creatorNote`/`carriedUnconfirmed`: no effect on request identity, replay or envelope (note = hashed `request.input`; carried passages are pure functions of the hashed, fail-closed parent; candidate stores only `{formChoice, constraints}`; replay settles from the stored candidate).

## Notes (not graded)

- **Note A** `respin/packages/modes/src/mode-checks.ts:922-926`: `result-claim` has no subject/tense guard and lists everyday verbs; "here's why that worked" with basis `none` costs a rewrite, and an unmarked repeat is a charged refusal at mode price. Measure rewrite rate and refusal-by-rule per v2 `promptBundleVersion` before L6; add `unsupported_experience` (all shapes) to L5's T6-P charged-refusal list.
- **Note B** `mode-checks.ts:1446-1457`: if the version/stamp agreement guard ever fired it would throw after a paid parsed draft (R-101 class); cannot fire today because stamp, contract and check context derive from one `context.creative`.
- **Note C** `revision.test.ts:1339,1384`: the two new revision refusals do not assert calls or `creditsChargedNow` (covered generally at `generate.test.ts:2286`).
- **Note D**: round-1 Note 1, routed to L2.

Checks B1–B7 and threshold provenance hold. Reviewer ran `vitest` on generate/revision/pipeline/mode-checks tests (315 passed); no mutations; Docker suites not run.
