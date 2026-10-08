# L2 gate — respin-billing-reviewer (2026-10-04)

Frozen manifest `L2-gate.sha256` digest `6b5ba677d515`: every entry OK before review. Reviewer ran `vitest run generate.test.ts creative-work.test.ts generation-recovery.test.ts llm-transport-selection.test.ts llm-transport-fake.test.ts` live: 5 files, 134 passed.

**Verdict: NEEDS CHANGES · Almost · Grade C.** 0 BLOCK · 1 High · 1 Medium · 3 Low · 2 Note.

## Findings

- **High** `respin/packages/credits/src/generate.ts:1428-1451` (with `:1129-1135`, `:1836-1840`): the success-path `recordUsage` is unguarded (audit P3-R5).
  - E-25(i) routes P3-R5 into L2 "where L2 edits the generate.ts lines they cite". L2 rewrote that statement for the draft-1 flag, and no disposition is recorded.
  - If the insert throws after a paid vendor call, `generate`'s catch records `refused` with `parse_failed`, and no `model_usage` row exists for the paid call. After the draft-1 fix, these rows are the only thing the uncharged bounds count, so paid spend escapes both caps.
  - The docblock at `:1836-1840` falsely says only the parsers can throw.
  - Fix: apply P3-R5 as specified (`respin-audit-remediation-2026-09-19-phase-3.md:47`): guard the write like the failure path, carry the cause, retry once, route to `recovery_required`, and emit the token counts.
- **Medium** `respin/app/(product)/studio/page.tsx:348`: the reference-entrance read `pastedReferenceQuote` reaches `deriveBalance`, which reaches `takeWorkspaceLock` (`balance.ts:62`). Every `/studio` render therefore blocks on the money lock a second time (P8-R1 joins L2 by E-25(i)), and the comment at `creative-work.ts:207-210` claims L2 adds no lock-taking read. Fix: use a lock-free read (billing-state tier against the pasted-reference tier list).
- **Low** `generate.ts:1081-1090`: a stale comment says `model_usage` is append-only and the flag is decided at the call. That is false after R-151 item 5.
- **Low** `with-workspace.ts:5013-5024`: in-flight generations' draft rows count toward the uncharged cost cap ($1.00 per profile per 60 min) until settlement, so concurrent chargeable generations can be refused transiently. Fix: add a test that pins the in-flight counting, and re-derive the cap's sizing against `concurrencyLimits` (accessor predicates unchanged; A-11 fence).
- **Low** `entrances.tsx:108,166` / `run-copy.ts:908`: "Find three concepts" charges `creditCosts.ideationBatch` but shows no price. Fix: show the configured price.
- Note `generate.ts:1275-1279`, `:1686-1688`: a `vendor_complete` resume while the balance is short or the workspace is paused records `refused` and clears a candidate the vendor was already paid for. The plan's ordering requires this. Consider keeping the candidate on a resume-path balance refusal.
- Note `run-copy.ts:952` / `copy.ts` `pieceViewFor`: `PIECE_OPERATION_NOTE` says a reload "returns this same script". After a reload the form resets to defaults, so a resubmit of non-default fields refuses as a changed payload. The sentence overclaims.

## Checks

1, 3, 4, 5, 6, 7 hold; 2 is n/a. Check 8 holds except the High. The A-11 fence holds (`git diff --stat` is empty on the fence files). The transport fake holds. Same-ID ordering, the 24 h predicate under `FOR UPDATE`, the config-version pin, and the debit/generation/claim/piece link in one transaction are all verified.
