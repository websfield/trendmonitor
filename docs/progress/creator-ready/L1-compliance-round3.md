# L1 gate — respin-compliance-reviewer, round 3 (owner-authorised beyond §5, 2026-10-03)

Frozen tree: `L1-freeze-r3.sha256`, 41/41 OK before and after; digest `f0ef98ba70fa`.

**Verdict: NEEDS CHANGES · Almost · Grade C.** 0 BLOCK, 1 CHANGE High, 4 CHANGE Medium, 1 Low, 3 Note. Round-2 BLOCK and High closed as a class; a fifth class member sits in R-150 point 3's confirmation item.

## Findings

- **CHANGE High** `respin/packages/modes/src/mode-checks.ts:1181-1191` (`needsEventConfirmation`), `respin/packages/credits/src/presented-output.ts:127-130`, register strings `mode-checks.ts:1850,1862,1880`. The item shows only when a recall-limited shape matches, the model-authored `form` is not `explain_opinion`, or the model-authored `basis.kind` is not `none` — so it is absent in exactly the recall gap R-150 point 3 discloses whenever the model labels the unit `explain_opinion` with basis `none` (the model's own pick under "Choose for me"). Measured through real `runGeneration`: the register's own example "a stranger knocks your tripod over halfway through your best take" (explicit and auto), a present-tense story labelled `explain_opinion` under auto, and beats "my neighbour knocked the light over…", "I swam out to the buoy…", "I quit my job to do this" — usable, 1 call, 0 findings, no item. Register strings claim the item "asks the creator to confirm every event"; the driver (`mode-checks.test.ts:1030`) never asserts it. Mitigation: `basisSentence` (`run-copy.ts:147`) still prints "No source given…". Fix: show `EVENT_CONFIRMATION_ITEM` on every v2 output with no model-authored condition (or amend R-150 point 3); plant the register example and assert the item.
- **CHANGE Medium** `mode-checks.ts:1285`: pass (a) accepts `[check]` anywhere on the line, not adjacent ("the dial [check]. I sold the footage to a studio and won an award for it"). Fix: mark in the same sentence/clause as the match span; plant both lines.
- **CHANGE Medium** `mode-checks.ts:1286-1287`, `assemble.ts:544`: passes (b)/(c) exempt the whole line and the prompt discloses the lexical floor; inventions ride on a real quote or a 4-word run (from input, brain, or declared-limits text). Fix: (c) only if the match span lies inside the shared run; (b) never exempts a `result-claim`/`owned-result` whose result words are not in the quote; drop the "share 2 meaning words" route from the prompt.
- **CHANGE Medium** `mode-checks.ts:1067-1077,1886`: displayed free-text fields (`shotMap.shot/.note`, `hooks.mechanic`, `filming.location/.equipment`) excluded from the scan and the item with inaccurate reasons; "the award I won with this hook" as a mechanic passes. Fix: scan them, or record and drive them with correct reasons.
- **CHANGE Medium** `assemble.ts:544`, `mode-checks.ts:1874`: false-positive cost — indicative (author-written, not a rate) 12/20 generic hook/caption/beat lines refused (second-person past, "we've all", `your …` results); 2/5 honest paraphrases refused; 3/3 invented first-person claims refused (correct). Fix: prompt says viewer-addressed past-tense and "we've all" lines count as events and need a mark; record the indicative rate in the gap until L6.
- **Low** `presented-output.ts:116-117`: a shot line flagged by kit in its `note` marks the `shot` text; the note renders unmarked.
- **Note** — stored v2 output without `serverChecks`: no production rows (HEAD has no v2); a dev row raises `GenerationRecoveryRequiredError` as a candidate (vendor spend lost, nothing charged) and `parent_unreadable` as a parent; envelope 4 not bumped for the new requirement (billing/tenancy flag).
- **Note** — declared-limit text quotable as a `material` basis widens pass (b).
- **Note** — "really happened to you" reads oddly for a demonstration filmed later; conservative.

§6 (dropped): R-149 item 4 and R-150 point 3 overstate the item's coverage.

## Round-2 findings

BLOCK closed as a class (B1/B1b/B2/B3 refused). High closed as a class (structural `serverChecks`; C4/C4c `invented_specific`; reply cannot forge or suppress the stamp). E3 partly closed (usable; rate still high). Recall strings, custom names, E2: closed as instances. Shot-map note, R-149 claim: closed.

Checks: similarity gate holds (`similarity.ts`, `traceability.ts`, `claims.ts` unchanged); kill-test honesty holds; taste rules untouched; no integrity rule weakened; no guarantees; no concealment. Reviewer ran `vitest` on modes + studio-ui + isolation (885 passed) and seven `tsx` probes; edited nothing.
