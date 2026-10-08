# L1 gate — respin-compliance-reviewer, round 4 (final owner-authorised run, 2026-10-03)

Frozen tree: `L1-freeze-r4.sha256`, 42/42 OK before and after; digest `dd96d9fc26d3`.

**Verdict: NEEDS CHANGES · Almost · Grade B.** 0 BLOCK, 0 High, 4 CHANGE Medium, 1 Low, 3 Note. Round-3 High closed as a class.

## Findings

- **Medium** `respin/packages/modes/src/mode-checks.ts:1221` (`CLAUSE_BOUNDARY`), `:1229` (`clauseOf`): boundary list is lexical; one `[check]` covers two claims joined by a comma, em dash (spaced or glued), `,and`, `, yet`, `plus`, `&`, `, though`, `or`, parentheses, or a leading subordinator ("When I quit my job [check], my channel tripled"). Fix: each `[check]` belongs to the nearest match before it (position-based ownership), or a fuller boundary set; plant every line.
- **Medium** `mode-checks.ts:935-985` (`EVENT_SHAPES`), register `:1959-1962`: a second past-tense verb sharing the first verb's subject ("…over and over and won an award for it", "I quit my job last year [check] and won an award for it") is not matched; a `runGeneration` rewrite ends usable with it. The gap `shared-run-carries-invention` was deleted as closed. Fix: a continuation shape carrying the subject, judged on its own clause; or record and drive it and restore the gap as open.
- **Medium** `mode-checks.ts:1403`: the revision's `carriedUnconfirmed` check skips a whole field when any `[check]` appears in it; an unmarked restatement of a parent's `[check]`ed event beside a mark elsewhere passes. Fix: judge each carried run's own clause (reuse the ownership rule); plant both lines.
- **Medium** `mode-checks.ts:1088-1089` (`EVENT_SCAN_EXCLUDED`): reason for `disclosure.platform`/`.guidance` ("never presented") is false; Studio renders both (`app/(product)/studio/generation-outcome.tsx:527-528` via `projection.ts:202-205,276-279`); the gap omits them. Fix: correct the reason ("displayed until audit P1-R1 lands; not read for events") and add to the gap with a render-site test, or scan them.
- **Low** `mode-checks.ts:867` (`foldedWord`), `:1256`, register `:1974`: burnt/burned, learnt/learned not folded; re-measured 5 of 9 honest loaf paraphrases refused (count in `honest-line-reads-as-event` is stale). Fix: fold -t/-ed pasts; restate the count.
- **Note** `:1251,1267`: passes (b)/(c) vouch only for the matched subject and verb; an invented object on the same verb passes (within `real-quote-unrelated-event`); consider driven specimens.
- **Note** (pre-existing, out of scope): audit R3-1 — model-authored disclosure prose rendered on `/studio` (`generation-outcome.tsx:527-528`); tracked as audit P1-R1 (CRITICAL).
- **Note** `hard-rules.ts` `unsupported_experience` remedy "names no source for it" slightly off when a quote exists without the verb; points the right way.

§6 (dropped): R-149 item 4 overstates `shared-run-carries-invention` as closed.

## Round-3 findings

High (item gated on model fields): closed as a class (`eventConfirmationFor` reads only the server-stamped `contractVersion`; re-measured through `runGeneration`). Pass (a): closed as an instance (class open: Mediums 1 and 3). Passes (b)/(c): closed as an instance (elision, Medium 2). Displayed free text: closed as an instance (disclosure reason, Medium 4). False positives: closed (count stale, Low). Per-field shot map: closed. Envelope 5: closed.

**Recurrence diagnosis (reviewer):** lexical boundary and shape lists keep producing instances. Class closure: position-based mark ownership for marks; for recall, record each miss and rely on the always-shown item (R-150's choice) rather than adding shapes round after round.

False-positive cost of the tightened pass (b): acceptable under REQ-I03/I04 (errs toward marking; remedy honest; item always shows); measure in L6; burnt/burned fold is a cheap reduction.

Checks: similarity gate holds; kill-test honesty holds; taste rules not relaxed; no integrity rule weakened; no guarantees; no new concealment. Reviewer ran `vitest` (13 files, 895 passed) and three `tsx` probes; edited nothing.
