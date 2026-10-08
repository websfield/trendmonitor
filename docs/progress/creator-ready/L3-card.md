# Launch remediation L3 — bounded context and explicit preferences

Phase: L3 of [launch remediation](../../plans/respin-launch-remediation-master-plan.md#l3--bounded-context-and-explicit-preferences). Programme ledger: [creator-ready ledger](ledger.md). Date: 2026-10-04. Depends on [L2](L2-card.md) (Ready/A 2026-10-04). Implementer defaults: `docs/initial/decisions.md` R-152 (with the gate amendments to items a and d).

## Phase L3 — review

**Overall: Ready.** L3 is built, green on my local machine and has passed its reviewer gate.

What it delivers:
- **Remember this for future drafts.** Studio offers this to owners only. The creator's typed words become a *proposed* Kill Test rule through the existing `/brain` edit path. It is not in force until the creator confirms and activates it on `/brain`. A repeat press writes nothing and says which version already holds the rule.
- **Labelled recent work.** Concept and script prompts carry at most 5 recent drafts and 3 reaction notes, under one configured character budget (`generation.recentContextCharBudget`, default 4,000). The ordering is deterministic: current piece, same platform, newest, id tie-break.
  - History sits outside both fact-checking corpora, so it cannot vouch for a specific.
  - Passages with `[check]`, traceability flags, claim flags or hard-enforced specific shapes are never sent.
- **Sequel checkbox** on the main Studio form. It is set only by the creator's value and enters the intent hash only when true.
- **Snapshot.** The request snapshot (v3) records history ids, ordering, labels, exclusions and the budget, with no creator text.
- **Erased history** ends the operation `recovery_required` before any debit. The vendor spend stays counted in both uncharged caps.

Gate history:
- One batch returned: billing PASS/A, tenancy PASS/A, learning PASS/A, security PASS/A, accessibility PASS/A, compliance Almost/B. The compliance Medium: no test showed history stays out of the basis corpus.
- No BLOCK or High, so no re-run. The Medium and all 13 Lows were fixed in one batch, each with a test that a planted mutation turned red (§3).

"Ready" here means ready on my local machine only. Nothing was released, committed or pushed. No paid model was run (E-30). Whether history makes the next draft more useful is owed by L6's next-session human witness.

| Gate | Result | One line |
|------|--------|----------|
| Validation (typecheck/lint/test) | green | Run by the orchestrator on the final tree (`L3-final.sha256`, 38 files, digest `63bfc49464b5`). `preflight`, `typecheck`, `worker:typecheck`, `lint`, `db:check` and `build` each exit 0. `TEST_DATABASE_URL=… pnpm -C respin test` exit 0: 252 files, 6,248 passed, 18 skipped, all in `journeys-workflow-triggers.test.ts`; the Docker suites ran live. |
| Respin billing & credits (`respin-billing-reviewer`, separate) | Ready A | [PASS A](L3-billing.md); 1 Low fixed, 3 Notes (1 fixed, 2 recorded) |
| Respin brain tenancy (`respin-tenancy-reviewer`, separate) | Ready A | [PASS A](L3-tenancy.md); 3 Low fixed · 0 open |
| Respin spin compliance (merged run) | Ready A (after Medium/Low batch-fix) | [Almost B](L3-merged.md) §A; 1 Medium + 2 Low fixed · 0 open |
| Respin learning honesty (merged run; plan: L3 preference boundary) | Ready A | [PASS A](L3-merged.md) §B; 2 Low fixed · 0 open |
| Security (merged run; plan: new action / trust boundary) | Ready A | [PASS A](L3-merged.md) §C; 1 Low fixed · 0 open |
| Accessibility of changed UI (merged run) | Ready A | [PASS A](L3-merged.md) §D; 3 Low fixed · 0 open |
| Acceptance criteria | 7/7 proven | Proof lines below. Usefulness is the L6 human witness, by the plan's own wording. |
| Least-confident probe | held | Probe 1 (implementer): the erased-context terminal has no product trigger and is proven only by a raw-SQL delete. Tenancy enumerated every remover of `generations`/`generation_feedback` and found each also removes the claim; the check is existence-by-id, so future per-item deletes are covered, but in-place redaction would need an extension. Billing confirmed no debit, spend still counted and no double settle. Probe 2: the 5/3 window may omit the key correction. Notes are budgeted first and whole, and one note always fits the default. The fix batch's own bet: the `month-date` hard shape also matches a bare month word ("March", "May"), so such passages are dropped and history may thin. Unmeasured until L6. |
| Reachability | reached via `/studio` (feedback block → Remember box; sequel checkbox on the main form) and the next concept/script generation | 3 deferred items (below) |
| Fixed without re-review | 15 | 1 Medium, 13 Low, 1 billing Note (BN-3); listed below |
| Gate ran | 3 runs · 0 re-runs | Announced: billing, tenancy, merged (compliance + learning + security + accessibility) |
| Gate intensity | lean | Billing and tenancy separate (Full gates: yes); compliance, learning, security and accessibility merged in one Opus run |

### Acceptance proof (plan L3 Acceptance)

- **AC1 deterministic bounded history:** `recent-context.test.ts` "1. DETERMINISTIC AND BOUNDED…", "1b. THE BUDGET is one configured number…", "1c. THE CURRENT PIECE RANKS FIRST…". Pass (full live-DB suite, exit 0).
- **AC2 no other-profile rows:** `recent-context.test.ts` "2. NO OTHER PROFILE'S ROWS…" (sibling profile and foreign workspace, unconditional), and `profile-scope.test.ts` "L3: the recent-context reads refuse a cross-parented row, table by table" (now including `creative_pieces`, T-L1). Pass.
- **AC3 rejection avoided unless a sequel is requested:** "3. A REJECTION IS AVOIDED…", "3b. A SEQUEL IS NEVER INFERRED OR SMUGGLED…"; `studio-ui.test.tsx` "THE SEQUEL REACHES THE REQUEST only as the box's own value…". Pass.
- **AC4 approved filming preference respected:** "4-6. REMEMBER THIS…": a proposed rule is absent from the prompt; once approved it appears in the brain block and the scoring call. Also "4b" (viewer and editor refused). Pass.
- **AC5 preference reversal effective for new operations:** the "4-6" reversal step. Pass.
- **AC6 old operation context identity unchanged:** "4-6", where the old id replays with no call and an identical snapshot; "10. A VERSION-2 CLAIM … still settles on resume"; "10b". Pass.
- **AC7 no laundering of unsupported details:** "7. NO LAUNDERING…", "7b. THE CORPUS, DIRECTLY…", "7c" (claim tokens), "7d" (hard shapes), "7e. HISTORY IS NOT BASIS MATERIAL" (A-M1, with a `creatorNote` control). Pass.
- **Lifecycle (erased or revoked context):** "8. ERASED CONTEXT ENDS THE OPERATION…", which now also asserts the usage rows stay unconsumed and the uncharged sums are > 0 (BL-1). "9. LIFECYCLE…"; `lifecycle-registry.test.ts` "launch L3 (R-152): … GOVERNED paths". Pass.
- **Extended suites named by the plan:** revision (`revision.test.ts` "L3: a revision's PARENT is material, never history…"), brain editing (`brain-edit.test.ts` L3 REMEMBER cases plus the C-L1 replay and owner tests), lifecycle (above). Pass.

### Fixed without re-review (§3)

- **A-M1:** `recent-context.test.ts` "7e". Tests only; the code was already correct. Plants P1, P1b and P1c red.
- **A-L1:** `recent-context.ts` `claimTokensOf` / `usablePassages`. Claim-flagged passages are dropped, and an unreadable `claims` makes the draft `unreadable`. "7c". P2 and P2c red.
- **A-L2:** `recent-context.ts` `carriesHardSpecific` (reuses `scanTraceability`; hard-enforced shapes omitted whole, never masked). Cases 7 and 7d. P3 and P3b red. R-152 item d amended.
- **B-L1:** `run-copy.ts` `FEEDBACK_TODAY` names both routes. `studio-ui` R12 ties the numbers to `RECENT_DRAFTS_MAX`/`RECENT_NOTES_MAX`. P10 red.
- **B-L2:** `feedback-block.tsx:66-76` comment corrected.
- **C-L1:** `feedback-ops.ts:151-163`. An already-held rule returns `written: false` and writes nothing. The owner gate runs first. `brain-edit.test.ts` replay (decomposed é plus padding) and owner tests. P5, P5b and P5c red. R-152 item a amended.
- **D-L1:** result text renders inside the persistent `role="status"` region (FeedbackBlock and RememberBlock, the class). P6 and P6b red.
- **D-L2:** the limit sentence comes from `BRAIN_EDIT_VALUE_MAX`. P7 red.
- **D-L3:** a refused submit keeps the text (a form keyed on the attempt, with `defaultValue`), plus `aria-invalid` and `aria-describedby` pointing at the alert. P8 and P8b red.
- **T-L1:** `profile-scope.test.ts` pieces witness, with the `:2440` comment corrected. P11 red.
- **T-L2:** `feedback-readers.test.ts` `FEEDBACK_READERS` (seven entries, a list per Respin rule 7) plus `scanFeedbackQueries` over `.from`, joins and raw `sql`. The docblocks at `with-workspace.ts:1833` and `:441-446` are corrected. P12 and P12b red.
- **T-L3:** the Remember block is owner-only (`rememberAllowed: scope.role === "owner"`). P9 red.
- **BL-1:** case 8 usage assertions. P4 red.
- **BN-3:** `schema.ts:444`, budget co-trigger comment.

### Deferred (owed elsewhere)

1. **BN-1 (billing note, optional):** move the `recovery_required` advance inside the locked settlement transaction (`generate.ts:1668-1673, 1856-1864`). No product path reinserts an erased row, and a double charge is impossible either way. Recorded, not done.
2. **BN-2:** the facade accepts `sequel` for **Find concepts** and the piece confirmation, but those forms do not send it, so those two flows cannot be sequels yet. Goes to L4, which reworks Studio's revise and select forms.
3. **Usefulness of the 5/3 window and the month-word thinning:** measured by L6's next-session human witness.

**Top things to fix (in order):**
1. `respin/tests/feedback-readers.test.ts` `KNOWN_FEEDBACK_AGGREGATES`: the widened scan surfaced a `count(*)` over `generation_feedback` in `brainAssetSummary`. It predates L3 (Phase 10b-1). It is listed as a known aggregate rather than judged against R11. Owner's call: keep it as a display count, or route it through `packages/brain`.
2. `respin/packages/credits/src/recent-context.ts` (`carriesHardSpecific`): the `month-date` shape drops any history passage containing a bare month word. If L6 shows history thinning, narrow the shape for history use only.
3. `respin/app/(product)/studio/actions.ts:258, 383`: wire `sequel` into the Find concepts and confirmation forms (L4, BN-2).

*Ask `/go` to explain any finding in plain words, or to just fix them.*
