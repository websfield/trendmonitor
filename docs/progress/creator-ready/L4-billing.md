# L4 gate — `respin-billing-reviewer` (billing & credits, full) (2026-10-04)

Frozen manifest `L4-gate.sha256` digest `4bceef9ce49a`: 40/40 OK before and after. The reviewer ran `TEST_DATABASE_URL=… vitest run packages/credits/tests/saved-generation.test.ts tests/saved-pack-action.docker.test.tsx` (2 files, 31 passed, the real Postgres half live). Nothing was edited or planted.

**Verdict: NEEDS CHANGES · Almost · B.** 0 BLOCK, 0 High, 2 Medium, 2 Low, 1 Note. No ledger, metering or read-spend defect.

## Findings

- **Medium — a revision can charge a price the creator never saw.** Locations: `credits/src/saved-generation.ts:323-346` (`revisionQuote`), `:536-571` (`reviseSaved`), `saved/[attemptId]/page.tsx:138`.
  - What happens: the page quotes the active config at render time. `reviseSaved` sends no quote back. `generate` prices under the config active at press time (`generate.ts:567-577`, `:702`). `GenerationQuoteChangedError` applies only when `piece !== null` (`:592-601`).
  - Scenario: the page shows 2 credits, an operator appends `creditCosts.revision: 4`, and the press charges 4. No test covers this.
  - Fix:
    - Send the quote's config version as a hidden field.
    - In `reviseSaved`, compare `priceOf(quoted, generationOp(mode, true))` with the active price, and throw `GenerationQuoteChangedError` on a difference.
    - Test: append a config between the read and the press, then expect a refusal with zero claims, ledger rows and provider calls.
- **Medium (confidence medium) — after a lost response the creator is likely to pay twice.** Locations: `saved/actions.ts:91` (`randomUUID()` per press), `saved-view.tsx:157/192` (children listed only for piece versions), `creative-work-ops.ts` `readSavedGenerationContextInScope` (reads the parent, not the children).
  - Why R-153 item 4 doesn't hold: for a non-piece draft, the reopened page never shows that a revision exists.
  - Scenario: the press settles and debits, the response is lost, the creator reloads and sees nothing, presses again, and is charged a second time.
  - Fix:
    - Minimum: list each generation's own scoped child revisions on the saved page, with a "you already made a revision at …" line above the presses.
    - Fuller fix: a durable revision operation id per (parent, preset), rotated when a press completes.
- **Low — the paid press is offered when the price can't be read.** Location: `saved/saved-copy.ts:80-84`, `:105-116`. When `credits === null`, `savedPressBlocks` still offers the press. Fix: return a revise block when `credits === null`.
- **Low — `analyseAndSpin` drafts show a priced revision offer that always fails.** Locations: `saved-generation.ts:464`, `:556-569`. Every press throws `GenerationAssemblyError` from `requireSpinAutopsyId` before any claim, so it costs nothing. Fix: mark spin parents not revisable, or pass the stored autopsy id.
- **Note:** the "replayed" branch at `saved/actions.ts:121-126` is unreachable while the id is a fresh UUID. It becomes live if the second Medium is fixed with a durable id.

## Checklist

| Check | Result | Detail |
|---|---|---|
| B1 append-only ledger | holds | Selection writes only `creative_pieces`. |
| B2 webhook idempotency | n/a | |
| B3 debit in the same transaction | holds | `reviseSaved` runs only through `generate`. `RevisionPresetError` is thrown before scope, claim or provider. Reading takes no provider. |
| B4 expiry and pause | holds | Selection and revision are refused under pause. Reading is classed as a read, and the test covers zero balance and pause. |
| B5 config, not code | holds | The same `creditCosts.revision` key is used on both sides. Gap: the quote is not bound to the version charged (first Medium). |
| B6 tier gates | holds | `assertModeAllowed` is the authority. |
| Threshold provenance | holds | UI bounds only. |
| B7 money paths tested | holds | Row counts are compared exactly. The docker test sees one transport call and one debit per revision, and zero for select, read, copy and export. BN-2: absent, `"yes"` and `"true"` all leave the hash unchanged. |
