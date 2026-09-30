# Master plan — audit remediation, 2026-09-19 register

**Programme:** `respin-audit-remediation-2026-09-19`. **Authored:** 2026-09-20, against `docs/progress/audit/2026-09-19.md` (readiness *Not yet*, grade D).
**Codebase review:** [`respin-audit-remediation-2026-09-19-codebase-review.md`](../progress/respin-audit-remediation-2026-09-19-codebase-review.md) — **read it before any phase**; it corrects five audit claims in ways that change the remedy.

## Objective

Close the register. The audit's own headline is that this is one defect wearing twenty-two faces: *controls in this codebase are repeatedly designed, documented, believed-tested, and absent*, and nine of fourteen absences are **hand-written populations where a derived one was possible** — CLAUDE.md Respin rule 7, now on its sixth recurrence. So the plan is not a list of fixes in register order. It is ordered by **what is open right now**, and inside each phase the rule is the one the audit states: build the derivation, then let the instances fall out of it.

Three things shape the sequencing:

1. **One live breach leads.** R3-1 — two of three presenters render model-invented platform-policy advice under a heading reading *Disclosure*, against owner-approved R-121, with the compliant third presenter sitting in the repo as the template. It is a few lines. It goes first.
2. **A gate that is 100% open is worse than a gate that is missing**, because the missing one does not report PASS. Three claim-honesty scans can never match a word; one scanner fails open on a semicolon; one compliance scanner cannot express the line the rule exists to forbid. Phase 1 closes the instruments before later phases start relying on them to prove their own work.
3. **Blast radius is capped today and the plan keeps it that way.** No production deploy exists, `RESPIN_DELETION_REQUEST_SCOPES` is unset, and the money path's own phase is parked. Per the owner's 2026-09-19 decision, nothing in this plan requires a cloud account or a deploy; deploy-side closure goes to `todos.md`.

## Non-goals

- **No deploy-side work.** Executing the restore drill against a real backup, the AWS account inventory, off-host secret locations, the deletion-journal credential mechanism and worker paging all land in `todos.md` as T-23/T-24. Their code and document halves stay in Phase 9.
- **No package carve.** Item 39's live half is that `tech-spec.md:34-35` describes a package map that does not exist; Phase 8 fixes the document and records the carve as a decision with a trigger. Moving 46,107 lines is not this plan's job.
- **No new audit.** The unswept list (`deletion-executor.ts`, `retention-clocks.ts`, `retention-receiver.ts`, `auth-lifecycle.ts`, `packages/brain/src/{comparison,vocabulary}.ts`, worker job payloads, and the `packages/modes` test files round 3 could not reach) is an input to the next audit, not a phase here.
- **Item 9's refund-budget row** is excluded by the audit's own words — already documented, not new.
- **Building an analytics connector** to make the landing page's learning-loop copy true is an owner product decision. Phase 6 changes the copy to what ships.

## Register coverage — every item is homed

| Register item | Phase | Register item | Phase |
|---|---|---|---|
| 1, 2, 3, 9(part) | 3 | 27, 29 | 1 |
| 4 | 5 | 28, 30, 31 | 6 |
| 5, 6, 7, 8 | 4 | 32, 33, 34, 35, 36, 37 | 7 |
| 10, 11, 12, 15 | 5 | 38, 41's G-17 LOW (R-144) and two-folds LOW (P8-R1) | 8 |
| 13, 14 | 1 | 39 | 8 (doc half only) |
| 16, 17 | 1 | 40, 41's autopsy-bounds MEDIUM (the five copies) | 11 (split from 8 per §11; 41's other sub-items are in the table below) |
| 18, 19 | 8 | 42, 43, 44 | 9 |
| 20(code/doc), 23, 24, 25, 26 | 9 | 45, 46 (first MEDIUM; the second is in the table below) | 2 |
| 47 (MEDIUM — the proposal fallback; its five LOWs are in the table below) | 2 | | |
| 20(evidence), 21, 22, 25(cred) | `todos.md` T-23/T-24 | D1, D2, D14 | 5 |
| D3, D11, D12 | 3, 4 | D4, D5, D6, D13 | 6 |
| D7, D8, D9, D10 | 9 | R2-1, R2-2 | 1 |
| R2-3 (registry ↔ enum) | 2 (P2-R11) | R3-1 | 1 |
| R3-2, R3-3, R3-4, R3-5, R3-6 | 2 | 47's worker-loss LOWs (refresh SUCCEEDED, `stats.at(-1)`, activation send) — *relabelled 2026-09-21; this row read "9's LOW worker-loss items"* | 3 (P3-R6) |

**Sub-items the batch-0 generalist found unhomed (item 41 ×3, 46 ×1, 47 ×2, round 2 ×3), each homed or dismissed here on 2026-09-21 — every claim verified against the tree in the same edit:**

| Register sub-item | Disposition |
|---|---|
| 47's MEDIUM — the idempotent proposal insert's fallback read (`promotion-ops.ts:263-268`) | 2 (P2-R10; one remedy chosen — **the history-preserving form**, re-chosen in batch 1 #20 and sharpened in batch 3 (#2): a re-derived digest whose row went `stale`/`superseded` inserts a **fresh `proposed` row** and no terminal row is ever updated, while a `rejected` or `accepted` row keeps arbitrating the conflict and proposes nothing; `promotion_proposals_evidence_digest_uq` becomes a partial unique index on **`status NOT IN ('stale', 'superseded')`** — migration `0064` in the intended order, Phase 2 rows 36–38 — and the fallback read at `:264-268` adds the same `status NOT IN ('stale', 'superseded')` predicate. *This cell read "re-assert `proposed`" — batch 0's remedy, which reopened what R-115 ¶3 calls immutable history — until 2026-09-21, and then read `status = 'proposed'` — the batch-2 predicate that re-proposed a rejected digest on every refresh — until the same day's Codex re-check made it match Phase 2*) |
| 47's `scan-journey-notes` LOW (`scripts/scan-journey-notes.ts:32`) | 1 (P1-R8) — *was missing from this table* |
| 47's Sample-Spin-503 LOW — zero usable creator rules turns a paid Sample Spin success into a 503 after the vendor was billed (`sample-spin/run.ts:357-364` vs `system-spend.ts:701-704`; `pipeline.ts:317-324` skips the scoring call when `usableCreatorRules` is empty) | **3 (P3-R8, rows 30–32, AC12)** — a money-loss shape (vendor paid, no output); homed with Phase 3's settlement work. Row landed in Phase 3's repair on 2026-09-21 |
| 46's second MEDIUM — `connector-verified-closure.test.ts:34` cannot see an indirect writer (`evidenceState: input.evidenceState`) | 2 (P2-R12; a learning-honesty tripwire, so it rides Phase 2's learning gate) |
| Round 2's `quote_budget_exceeded` MEDIUM — `ReferenceIntakePort` advertises a refusal its sole implementation never produces (`sources.ts:130-134` vs `pasted-reference.ts:519-526`; `trends.test.ts:124-133` tests the phantom) | 2 (P2-R11b — the arm and the test are deleted) |
| Round 2's `saturation.ts:11` MEDIUM-LOW — one admitted unmeasured reason while storage writes `no_population` under a CHECK | 2 (P2-R11c — the union equals the CHECK's set) |
| Round 2's verbatim/echo LOW — the four displayed autopsy fields carry no verbatim check against the source transcript; `assertAutopsyMechanismContent` (`packages/db/src/frameworks.ts:1684`, run at `worker/system-autopsy.ts:479`) bounds fields, not runs | **11** (P11-R3, rows 18–19, AC3 — the autopsy-bound consolidation split from Phase 8 per §11, the one phase that already edits the autopsy contract's population). *The split landed 2026-09-21: `…-phase-11.md` carries P11-R1/R2 (Phase 8's former P8-R3/R4 verbatim) and R-145, and Phase 8's file now holds only pointers to them (its P8-R3/P8-R4 lines and row 19's parenthesis); this cell described that move as still owed until the same day.* Mitigations verified real by the audit (`hook`/`subjectTerms` never render); the residual is a verbatim beat with no name, number or metric |
| 41's second MEDIUM — the Trends domain in three homes: `worker/autopsy-vendor.ts:18-79` holds prompt text and cost math outside every package, and there are **four** physical `provider.complete` sites, one outside `packages/` (measured 2026-09-21: `packages/credits/src/generate.ts:1197`, `packages/credits/src/inference.ts:799`, `packages/credits/src/sample-spin/run.ts:295`, `worker/autopsy-vendor.ts:170`) | Split. **Enumeration half → 3 (P3-R9, row 13 `tests/provider-complete-sites.test.ts`, AC12):** the four sites are a written list asserted equal to the scan two-way (a missing site and an extra listed site both red) — that list *is* what rule 7 requires; landed in Phase 3's repair on 2026-09-21. **Re-homing half → deferral ledger** (moving the worker's prompt text under a package and the cross-package lint), with the trigger recorded there |
| 41's third MEDIUM — pause has two stored truths (`subscriptions.pausedAt` and `pause_periods`), read together because they can disagree (`studio/page.tsx:178-190`, `balance.ts:259-264` — re-verified: the free-mint gate checks the mirror **and** `hasOpenPause`) | **Deferral ledger**, not dismissed: collapsing to one truth touches the ledger's expiry materialisation, every pause reader and a migration, with no live defect behind it; Phase 8's committed-fold fallback reads pauses and is the first consumer that must choose one — **Phase 8 AC10 (rows 21–22) is the receiving row for that choice** (added 2026-09-21): the fallback reads `pause_periods` alone, and a planted disagreement in both directions proves the fold and `studio/page.tsx:178-190` agree. Trigger and closure proof for the collapse itself stay in the ledger |
| 41's AC-13 LOW — the completeness scan reads parameter type *text* (`packages/db/src/app-server.ts:119-125` records that folding scope-taking entries into an options object would hide them) | **Deferral ledger**: a test-parsing-strategy risk with no live defect; the docblock is the current control. Trigger recorded in the ledger |

Every ranked item and sub-item of the register is now in a phase row above or in the deferral ledger with a trigger — the sentence that stood here until 2026-09-21 ("Nothing in the register is unhomed") was false at the sub-item level for eight entries and two rows were mislabelled (batch-0 generalist, BLOCK 7). Items marked *dismissed*, *underclaim*, *hunted-and-did-not-find*, *parked* or *refuted* carry no obligation by construction.

## Phases

| Phase | Description | Est. | Depends on | Plan |
|---|---|---|---|---|
| 1 | Open gates and the live disclosure breach | 3–4 h | none | `respin-audit-remediation-2026-09-19-phase-1.md` |
| 2 | Rule-6 machinery — generator first, then the escapes | 6–8 h | 1 | `…-phase-2.md` |
| 3 | Money: the loss paths | 7–9 h | none | `…-phase-3.md` |
| 4 | Money: ledger invariants, scoped reads, cost | 5–7 h | 3 | `…-phase-4.md` |
| 5 | Identity, tenancy and the erasure lifecycle | 9–11 h | none | `…-phase-5.md` |
| 6 | Outbound truth — what customers read | 4–5 h | 1, 2 (AC6's `[check]`-sentence pin consumes Phase 2 AC8 — merged C-7, added 2026-09-21) | `…-phase-6.md` |
| 7 | Accessibility | 4–5 h | none | `…-phase-7.md` |
| 8 | Availability and prompt hardening | 4–6 h | 3 | `…-phase-8.md` |
| 9 | Operability truth and the dependency floor | 5–7 h | 1, 3, 4, 5, 8, 11 (11 edits `packages/credits/src/mode-access.ts` under the billing gate, so the ORM bump stays the last money-touching change) | `…-phase-9.md` |
| 10 | Accessibility — surface-wide titles, landmarks and tables (split from 7 per §11) | 2–3 h | 7 | `…-phase-10.md` |
| 11 | Entitlement brand and autopsy-bound consolidation (split from 8 per §11) | 4–5 h | 8 (file-overlap serialisation, order 3 → 8 → 11) | `…-phase-11.md` |

**Total 53–70 h, the sum of the eleven phase headers** (author estimates from the task lists; no measured baseline exists for this repo's phase durations). **Reconciled 2026-09-21 (batch 1, #29):** this table read 47–62 h and five rows disagreed with their phase headers — 3 (6–8 vs 7–9), 5 (8–10 vs 9–11), 7 (5–6 vs 4–5), 8 (5–7 vs 4–6), 11 (3–4 vs 4–5); the headers are the authority and the table now copies them. The sentence that stood here — "Phases 10 and 11 carry the hours moved out of 7 and 8, not new hours" — was false by those headers: the split re-estimated each half, so 7 + 10 = 6–8 h against the pre-split 5–6 h and 8 + 11 = 8–11 h against the pre-split 5–7 h; the 1–2 h and 3–4 h differences are re-estimates of the same work at finer grain, not new scope, and the pre-split figures were the coarser guess. 9 depends on 1 (its runbook-counts test walks the tree through `tests/support/source-files.ts`) and on every money-touching phase — 3, 4, 5 and 8 (`packages/credits/src/{clock,balance,stripe/customers}.ts`) — so the ORM bump is the last money-touching change and its gate re-runs nothing.

**Execution order — serial, one checkout (replaces the concurrency sentence that stood here until 2026-09-21).** Phases run **1 → 2 → 3 → 4 → 5 → 6 → 7 → 10 → 8 → 11 → 9**, one at a time, each gated before the next starts. Phases 1, 3, 5 and 7 have no dependency edge between them, but they are **not** run concurrently on this checkout (Phase 5 now also edits `packages/credits/src/app-server.ts` and `stripe/billing-contact.ts`, files Phases 3 and 8 edit — the serial order 3 → 4 → 5 → … → 8 keeps one writer at a time): the 2026-08-02 lesson (never two mutating agents against one worktree; a result whose target moved is not evidence) governs, and the tree is not partitioned — measured 2026-09-21 from the nine file tables *before* the batch-0 repairs, 24 paths appear in two or more phases, including `docs/initial/decisions.md` (1, 2, 3, 5, 8, 9), `app/(product)/studio/run-copy.ts` (1, 2, 4, 6), `packages/db/src/app-server.ts` (5, 6, 8, 9), `app/(product)/trends/actions.ts` (1, 2, 8), `tests/studio-ui.test.tsx` (1, 2, 6), `app/(auth)/auth-form.tsx` and `app/(auth)/recover-deletion/page.tsx` (5, 7), `app/(marketing)/landing-sections.tsx` (6, 7 — and 2 after the repairs), `app/(product)/studio/studio-panel.tsx` (3, 7 — and 6 after the repairs), `app/(product)/brain/brain-view.tsx` (2, 7), `eslint.config.mjs` (2, 8), `packages/db/src/with-workspace.ts` (3, 8), `packages/db/src/trends-storage.ts` (4, 8 — and 2 after the repairs), and the migration journal (3, 4). If the owner ever chooses concurrency, the rule is: one worktree per concurrent phase, the shared-file list re-measured from the tables **on that day** (the measurement is a five-line script over the `Files to create / modify` sections, not this paragraph), and no two concurrent phases may share a path. **Decision-number reconciliation:** `decisions.md` is append-only, so the R-134…R-147 numbers in the table below are the *intended order*, not a reservation — a phase writes the **next free number at landing time**, and if that differs from the table the phase's ledger line records the mapping and this table is corrected in the same change; a later phase never renumbers an earlier phase's landed entry. The migration-ordinal rule (Risks row 7) is the same rule for `0062`/`0063`.

**File-row counts (rows in each phase's *Files to create / modify* table).** Re-counted 2026-09-21 after the Codex mechanical re-check that ran every population row's own predicate against the tree (batch 3 had applied the sharpened authoring rule — producers and receivers, never call sites — to every population row batch 2 named), phases 1–11: **36 / 40 / 44 / 25 / 34 / 29 / 18 / 23 / 22 / 17 / 31** (after batch 3 these read 33 / 38 / 43 / 25 / 33 / 29 / 18 / 22 / 21 / 17 / 30; 3 read 37 and 11 read 28 after batch 1; batch 3 added Phase 3's rows 38–43 — the kill-test prompt producer, two `partSizes` completeness witnesses, the accessor's `profile-scope.test.ts` entries, the `0062` migration test and the root home of the way-forward copy assertion — and Phase 11's rows 29–30, the fourth value-checking receiver `requireFull` and the sixth screen consumer `frameworks/copy.ts`; the re-check added the files a requirement already edited or tested in without a row — Phase 1's `telemetry-sinks.ts` wrapper home and three census entries dispositioned *migrate* (rows 34–36), Phase 3's `config.test.ts` (row 44), Phase 5's probe home `packages/credits/tests/actions.test.ts` (row 34), Phase 8's `bundle.test.ts` (row 23), Phase 9's five untouched-by-the-bump package manifests (row 22), Phase 11's two echo-case tests (row 31) — and folded the seventh screen consumer `trends/page.tsx` into Phase 11 row 8). **Phases 1 (36), 2 (38), 3 (44), 5 (34), 6 (29) and 11 (31) exceed the 25-row target** — the owner accepted the round-budget risk for 1, 2, 3, 5, 6 on 2026-09-21 (Plan review log); 11's growth (test lift rows 22–24, the worker catch, the seam pass-through) is the same class and is covered by the same acceptance — every row over the target is a population batch 0 or the re-check measured and required to be listed rather than hidden (the six disclosure carriers and their fixtures, the eleven `[check]` sites, the three trends-vocabulary copies, `bundle.ts` and its test, Phase 3's total-cost accessor, Phase 6's unpinned changelog count); each phase file records it as a §11 signal rather than rounding it away. The §11 dispositions — split for 7 and 8, accepted risk proposed for 1, 2, 3, 5 and (by one row) 6 — are recorded in the Plan review log below.

## Critical Paths touched

| Path | Phases | Separate full gate |
|---|---|---|
| Respin billing & credits | 3, 4, 5, 6, 8, 9, 11 | Yes |
| Respin brain tenancy | 1, 3, 4, 5, 6, 8, 9, 11 | Yes |
| Respin spin compliance | 1, 2, 6, 8, 11 | No; lean merge |
| Respin learning honesty | 1, 2, 6, 11 | No; lean merge |

Each phase plan repeats its own selection and owes one verdict per path it touches (§1). Phase 6 joined billing and tenancy on 2026-09-21: its pricing cards read `CONFIG_V1_SEED` and its CTA carries `?plan=` (billing — the batch-5 gate already reserved that reviewer; the phase file's own table omitted the row until batch 0's billing BLOCK 1 and now carries it), and its owed conditional-sentence half needs a scoped result-count read (tenancy). **Batch 0 added three selections, mirrored here and applied in the phase files by their repair:** Phase 3 joins brain tenancy (the `dunning_started_at` column must enter `lifecycle-column-census.ts:58` in the same change — tenancy CHANGE); Phase 8 joins brain tenancy (its `withRenderTransaction` governs every scoped product-page read and its display fold is a new `credit_ledger` reader outside the lock — tenancy CHANGE); and the third selection — learning honesty for the `PerformanceLearningEntitlement` brand at `with-workspace.ts:3294`, the seam `recordResult`/`refreshPromotionProposals` take, with `results/actions.ts` (merged L-2) — **moved to Phase 11 with the brand under the §11 split**, together with the cage edits (`with-workspace.ts`, `app-server.ts`, `trends-storage.ts`, `frameworks.ts`) and the lint-fenced sole-minter. So Phase 8 maps **three** paths (billing, tenancy, compliance) and Phase 11 **four** (billing, tenancy, compliance, learning), which is what the table above and both phase files read; this paragraph said "8's four paths" until 2026-09-21. Phases 10 and 11 inherit their parent's selection (7's zero paths → the independent generalist; 8's three paths plus the learning-honesty row that moved with the brand) and record it in their own files. Phases 7 and 10 map **zero** Critical Paths and therefore each owe one independent generalist review (§10), not none.

## Decisions baked in

1. **Derive the population, then fix the instances — never the reverse.** Where a remedy could be either "add the missing entry" or "compute the list", the plan takes the computation, because the register records the hand-list version failing six times. The three concrete carriers: a shared `tests/support` roots module (Phase 1), the installed-router assertion for rate-limit keys (Phase 1), and the schema-derived output pointer set (Phase 2).
2. **Measure before fixing, exactly once.** Round 3 put a process question to the chair and the chair answered it: `claims.ts` has no generative witness, and all three of its findings are classes a generator over {field} × {shape} × {separator} × {occurrence} would have found in one run. **Phase 2's first task is that generator, and it records the escape count before any of R3-2/R3-3 is touched.** If the generator finds classes this plan does not name, that is the point of it.
3. **The smaller assertion beats the bigger enum.** Item 12 wants a read-only lifecycle grade. The lifecycle enums are binary with a coupled check constraint, so a new value would touch every `eq(*.lifecycleState,"active")` join in the tree. Phase 5 adds a dedicated read grade used by export and history instead — same property, a fraction of the surface — **minted inside `withWorkspace`**, the fence that actually refuses (`with-workspace.ts:5926-5942` inner-joins `lifecycleState = 'active'` before any scope exists; `bootstrap.ts:65-97` filters the same way), not one layer below it in `membership-lifecycle.ts` as this plan and the codebase review §1 item 12 first said (batch 0 tenancy BLOCK; the review is amended).
4. **Two cheap halves beat one expensive whole on item 1.** `settle` is private and a general auto-settlement producer is a large change. Phase 3 lands the age-based alert *before* the 24-hour clear (which removes "the only alert fires after the destruction") and an operator command that re-enters settlement for one stored candidate, and corrects the comment that promises what neither does. Automatic settlement is a decision, recorded with a trigger, not silently skipped.
5. **Item 38's coupling is broken by the render path, not by the outbox.** Making every product page stop blocking on the money lock (`pg_try_advisory_xact_lock` + a committed-fold fallback, plus `lock_timeout` on render transactions) removes the cross-tenant availability coupling. Moving Stripe mutations out from under the lock is a second, larger change; it is recorded with a trigger and not done here.
6. **Deviation from the phase-plan convention, stated so it is a choice and not drift.** The repo's phase plans pin the nine Golden rules and the seven Respin non-negotiables verbatim in every file. They ride in every session's context from CLAUDE.md already, so this programme pins them **once, below**, and each phase quotes verbatim only the *lessons that bite that phase*. If a reviewer judges this insufficient, the remedy is a paste, not a re-plan.

## Pinned conventions (READ FIRST — applies to every phase)

The nine **Golden rules** and the seven **Non-negotiable rules (Respin)** of `CLAUDE.md` govern every phase of this plan without exception, and are not restated per phase. Two of them are load-bearing here and are quoted in full because this register exists largely because of them:

> **Golden rule 1. Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code — and a claim you *record* (in a comment, a doc, a decision log) is verified against the file it names **in the same action that records it**. A structural claim ("this can never happen") is proven by running it (a test or the command), not by an argument.

> **Respin rule 7. A derived guard's population is a list, not a producer.** Any allowlist/guard computed by reading "everything that can reach this state" from a single call site — refusal codes a screen can throw, fields a scope guards, tables a registry covers — enumerates that population explicitly and is updated by listing every producer, never by grepping one; a second producer added later is a list edit, not an automatic inclusion.

**Lessons that bite this programme,** verbatim from CLAUDE.md, each cited by the phase it governs:

> 2026-08-26 — **A verifier that reports success is not verified until something OUTSIDE it tries to break it**: a scanner built from a string-assembled regex fails OPEN silently (one lost backslash turns `\s` into `s`), and a mutation matrix is blind to a control that was never written — so every scanner must assert it catches a PLANTED violation of each shape it claims to cover… *(Phases 1, 2, 6, 9)*

> 2026-08-21 — **Proving a field cannot be TYPED is not proving it cannot be CAST**: for every server-derived column, assert the runtime strip by smuggling a value in through `as unknown as`, not only by `@ts-expect-error`. *(Phases 4, 5)*

> 2026-09-09 — **Isolating a failure so the batch survives it converts a LOUD failure into a SILENT one**: the try/catch ships in the same change as a count that reaches an alert, or a poisoned item retries forever unseen — and the comment saying the count is reported is not the reporting. *(Phase 3)*

> 2026-07-30 — **Fail closed, but never without a way forward**: before making an unreadable or invalid file fatal, grep every *writer* into that directory, and read the refusal's own printed remedy — if it says "delete this evidence", the control is the outage. *(Phases 5, 9)*

> 2026-08-18 — When a guard's promise depends on a **third-party parser accepting the same values it does**, prove that property **generatively against the installed parser**, never with a list of counterexamples. *(Phases 1, 2)*

> 2026-09-04, recurred 2026-09-18 — **Any operation that re-materialises worktree bytes can flip line endings, and `git status` will not show it** … run `git ls-files --eol` on the scanned set after any snapshot or branch switch before believing a red or a green scanner. *(Phases 1, 2, 6 — every phase that edits a source-scanning test; Phase 2 pins its pre-fix hashes in both LF and CRLF forms for exactly this reason)*

> 2026-08-02, recurred 2026-09-20 — **The target can also MOVE: never run two agents that mutate the worktree against one checkout.** … before dispatching parallel work that writes, give each writer its own worktree, or serialise them; and **hash the reviewed files before a gate and re-verify after**, because a result whose target changed is not evidence even when nothing was corrupted. *(The programme's execution order — serial, one checkout — and every gate's frozen-hash table)*

## Dependencies

- **External:** none new. The only version change in the programme is `drizzle-orm` 0.44.7 → `^0.45.2` (Phase 9), which is simultaneously the fix for `GHSA-gpj5-g38j-94v9` and the satisfaction of `better-auth@1.6.28`'s declared peer.
- **Internal:** Phase 1 owns `tests/support/source-files.ts` (the root population — built 2026-09-20 under R-132 under this name; the plan's first name `production-roots.ts` was never created), `tests/support/claim-scan.ts` (built the same day), and — since batch 0 — `packages/credits/src/presented-output.ts`, the presenter-side substitution homed in the facade because `app/**` may not import `@respin/modes` (`eslint.config.mjs:801-820`); Phases 2 and 6 consume the first two, Phase 2's `displayableSpin` (its row 23) consumes `presentedTextUnits` from the third, and Phase 9's `tests/runbook-counts.test.ts` consumes the walker. The output-pointer derivation is Phase 2's own Task 4, not a Phase 1 handoff. Phase 6's `[check]`-sentence pin consumes `TRACEABILITY_LIMIT_NOTE`'s wording as Phase 2 AC8 leaves it. Phase 4 consumes Phase 3's migration ordinal (0062 → 0063).
- **Database:** three new migrations in the *intended order* — `0062` (dunning episode start, Phase 3), `0063` (credit-ledger mutation guard, Phase 4) and `0064` (the promotion-proposal digest uniqueness becomes a partial unique index on `status NOT IN ('stale', 'superseded')` — `proposed`, `accepted` and `rejected` rows arbitrate, only history is excluded — Phase 2 P2-R10's history-preserving form, added 2026-09-21, batch 1 #20, predicate corrected in batch 3 #2). All append to `packages/db/migrations/meta/_journal.json`. Phase 5 owes no `0064` (decided in its batch-0 repair, P5-R6). **The intended order is not the landing order:** the serial execution order runs Phase 2 before Phases 3 and 4, so under the reconciliation rule (*Phases*, above) and Risks row 7 Phase 2 takes the next free ordinal on disk at landing — `0062` — and Phases 3 and 4 take `0063`/`0064`; the landing phase's ledger line records the mapping and this line is corrected in the same change. Phase 4's dependency on Phase 3's ordinal is unchanged in kind (it takes the one after Phase 3's, whatever that is).

## Decisions to write (`docs/initial/decisions.md`, append-only, starting at R-134 — renumbered 2026-09-21 from R-128 because R-128…R-133 landed in `decisions.md` after this plan was authored; the numbers are the intended order, not a reservation — see the reconciliation rule under *Phases*)

| Proposed | Subject | Phase | Register |
|---|---|---|---|
| R-134 | Who settles a stranded `vendor_complete` candidate, what the creator is told when nobody does, and the trigger for automatic settlement | 3 | 1 |
| R-135 | The creator input-token ceiling as a REQ-G05 margin dial, with the number's provenance | 3 | 2 |
| R-136 | Amends D-M1-4 / REQ-G06: grace is bounded per unpaid *episode*, not per failure event | 3 | 3 |
| R-137 | Amends R-118: whether identity erasure may originate a workspace erasure for a sole owner; and that the sign-in surface is a dependent of `decisions.md:1600`'s enrolment | 5 | 10, 4 |
| R-138 | What bootstrap does when the identity's only workspace is pending deletion, and where the cancel control lives | 5 | 11 |
| R-139 | Amends R-119/R-122: `blocked`'s cancel exit, the journal-reservation wedge, and who owns the five resume seams | 5 | D1 |
| R-140 | Amends R-122: export and history availability across lifecycle states | 5 | 12 |
| R-141 | Amends R-4: "never fetch a submitted URL" as the enforceable form of compliant-sources-only — recording the measured outbound allowlist (Phase 1 P1-R2: six call sites measured 2026-09-21, seven once the one `originPinnedFetch` wrapper lands; the count the scan asserts two-way at landing is the one recorded) | 1 | R2-1 |
| R-142 | Amends R-68/R-69: the hard-claim field population — **whichever the generator's escape count chooses** (every field for the `certainty`/own-baseline shapes, or the schema-derived enumerated set), recorded with the count and the false-fire numbers beside it. *This row pre-decided "the sections the creator publishes" until 2026-09-21 (merged L-6); the decision is Phase 2 Task 1's, not this table's* | 2 | R3-2 |
| R-143 | The rule-4 carve-out for the feedback proposal source (a reaction is not a result), **citing R-115 ¶2** (`decisions.md:1574`) which already records it, and pinning the bar as the code's four properties with a witness each (Phase 2 P2-R9); and that `/studio`'s feedback copy (`FEEDBACK_TODAY`, Phase 1 P1-R5) is a **dependent** of this decision — REG-29's ADR half, folded in 2026-09-21. CLAUDE.md rule 4 stands as worded; no `repo: CLAUDE.md` row | 2 | 46, 29 |
| R-144 | No provider HTTP under `takeWorkspaceLock`; the render path never blocks on it — closing G-17's lock order; outbox migration recorded with a trigger | 8 | 38 |
| R-145 | Addendum to R-30: how a tier-derived entitlement crosses the `@respin/db` boundary (the brand at compile time, the `entitlementCage` at runtime — the receivers' own value checks accept a composed value, measured 2026-09-21) | 11 (split from 8 per §11; the number keeps its place in the intended order and reconciles at landing) | 40 |
| R-146 | The real package map, and why the `@respin/telemetry` / `@respin/lifecycle` carve is deferred, with its revisit trigger | 8 | 39 |
| R-147 | Amends R-124: the migrate-then-verify restore order, and the local-drill mode | 9 | 20 |

`SECURITY-EXCEPTIONS.md` is re-dated in Phase 9 with the missed M2 trigger recorded as missed (register item 42) — a document edit, not a decision entry.

## Deferral ledger

| Pending obligation | Receiving row / trigger | Closure proof |
|---|---|---|
| Restore drill executed end-to-end as a script against a production backup | `todos.md` **T-23** | a `RESTORE DRILL PASSED` transcript under `docs/progress/audit/evidence/` |
| AWS account `770371751912` inventory row, break-glass ownership, Anthropic and Google OAuth account rows | `todos.md` **T-23** | `RUNBOOK.md` Accounts section with a bumped *Last reviewed* |
| Off-host location of `BACKUP_PASSPHRASE_FILE` and `RESPIN_AUTO_TOPUP_AUTHORITY_KEY`; deletion-journal credential mechanism | `todos.md` **T-23** | a "Restore-critical secrets" section naming stores, never values |
| Worker-health paging above 90 s, and the forward-only migration rollback policy; **and CI-schedule paging beyond GitHub's own workflow-failure notification** (Phase 9 P9-R10: a `schedule:` run has no PR author, so the built route is GitHub's notification to the last committer of the workflow file, named in the file — anything past that is deploy-side and rides this same T-24 row; folded here 2026-09-21, Codex re-check) | `todos.md` **T-24** | an alert route recorded in RUNBOOK Observability, covering both the worker heartbeat and a scheduled audit failure |
| Automatic settlement of a stranded `vendor_complete` candidate | R-134's trigger: the first operator command run in anger, or the first stranded candidate on a deployed instance | a settlement producer with a generative witness |
| Moving Stripe mutations out from under the workspace lock (outbox) | R-144's trigger: the first measured lock wait above 5 s on a render path (5 s is an **owner-chosen** threshold with no measurement behind it — no lock-wait metric exists today; R-144 records it as chosen, not derived, and Phase 8's `lock_timeout` value is the same number so the two cannot drift) | outbox dispatch records |
| Seats, roles and the ownership-transfer surface (`decisions.md:1600`'s 10b-2 work) — Phase 5 names it as the reason an OAuth-only identity cannot reach reauth-gated billing actions, and does not build it | the finish programme's 10b-2 slice (`docs/plans/respin-finish-master-plan.md`); this plan's R-137 records the sign-in surface as a dependent of that enrolment | an invite/transfer path with its own tenancy gate |
| **The workspace selector for the read grade** — an identity holding a second, *active* workspace can hold Phase 5's read-grade scope for its tombstoned one only by naming it (`withWorkspace` honours an explicit `ctx.workspaceId` through membership, `with-workspace.ts:5948-5955`), and none of the three read pages (`/api/export`, `/settings/account`, `/brain`) names a workspace today (`readScopeForUser(user)` takes the user alone), so for such an identity they render the active workspace and the tombstoned one's export and history wait (Phase 5 P5-R3, batch-1 tenancy NOTE; recorded in R-140). Added to this ledger 2026-09-21 (Codex re-check) — the row above is the seat/ownership work that owns the selector; this row is the read-grade obligation that waits on it | **Trigger:** the first identity on a local or deployed instance that holds an active membership and a pending workspace deletion together and asks for the tombstoned one's export or history — or the 10b-2 slice landing, whichever comes first; R-140 records that the cage admits the explicit form now, so the closure is a page change, not a cage change | the three read pages accept an explicit workspace id (the `ctx.workspaceId` form), with a test that mints an identity holding one active and one tombstoned membership and reaches the tombstoned workspace's `GET /api/export` 200 and `/brain` history through the read grade while the active one stays write-grade |
| Live-render accessibility properties (focus actually moving on mount, `aria-live` announcement) and the light-theme contrast doubling that Phase 7 parks | the audit's own parked list (`docs/progress/audit/2026-09-19.md`, item 33/34 notes) and `todos.md` T-22 for the screen-reader half (R-133: never a blocker) | a Playwright observation under `respin/e2e/`, or T-22 closed |
| `@respin/telemetry` / `@respin/lifecycle` carve | R-146's trigger: the next file admitted to `packages/db` that imports nothing from it | an eslint negation-list entry per new package |
| A support channel for the "contact support" strings (card measured 47 across 9 files on 2026-09-20; re-measured at execution) | owner decision — Phase 6 records the count and removes the promise where no channel exists | either an address in the footer or the strings reworded |
| **The marketing-claims generator** over {subject} × {outcome} × {hedge} — the class is *measured, not closed*: R-132 §1 records 17 of 17 plausible sales sentences passing the canon, and `MARKETING_CLAIM_GAPS` (six shapes) is asserted as an absence on every rendered marketing surface; Phase 6's instrument proves the pins and the scan, not the class (merged L-5, 2026-09-21) | **Trigger:** a measured sales claim reaching a visitor through a shape in `MARKETING_CLAIM_GAPS` (the render scan's absence assertion going red is the detector), **or** the first marketing surface added outside `app/(marketing)/**` — the same trigger form `KNOWN_VOCABULARY_GAPS` uses for `claims.ts`, which Phase 2 Task 1 answers with a generator. Until then the six shapes stay a pinned list | a generative witness over the marketing surfaces on the `claims-generative.test.ts` template, with its escape count recorded before any copy fix, and `MARKETING_CLAIM_GAPS` reduced to zero shapes or each remaining shape carrying its reason |
| **Re-homing the Trends domain's third home** — `worker/autopsy-vendor.ts:18-79`'s prompt text, stage instructions and bounded-cost math live outside every package and outside the cross-package lint (item 41's second MEDIUM; the enumeration half is Phase 3's chokepoint scan) | **Trigger:** the `@respin/telemetry` / `@respin/lifecycle` carve (R-146's own trigger) or the first second consumer of the autopsy prompt text — whichever comes first; the four `provider.complete` sites stay a scanned list meanwhile | the worker's autopsy prompt under a package with an eslint negation-list entry, and the site count in the scan unchanged |
| **Pause's two stored truths** — `subscriptions.pausedAt` (the mirror) and `pause_periods` (the authority), read together because they can disagree (`studio/page.tsx:178-190`, `balance.ts:259-264`) (item 41's third MEDIUM) | **Trigger:** the first observed disagreement between the two on a local or deployed instance (the studio page's double read is where it would surface). **The consumer's choice has a receiving row (added 2026-09-21): Phase 8 AC10, rows 21–22** — the committed-fold fallback reads `pause_periods` alone through `loadHistory` (`balance.ts:32-44`), the authority `studio/page.tsx:178-190` also reads, and a test plants a mirror/authority disagreement in both directions and asserts the fold and the studio page agree; the free-mint gate's mirror read (`balance.ts:263`) is skipped on that path. That AC records the choice; it does not close this row | one truth, or the mirror derived from the authority by a test that plants a disagreement and watches it heal — a future phase, not named here until the trigger fires |
| **The AC-13 completeness scan reads parameter type text** (`packages/db/src/app-server.ts:119-125`; item 41's AC-13 LOW) | **Trigger:** the first facade entry whose scope parameter is not a positional one-token type (the docblock at `:119-125` is the current control and says why the shape is held) | the scan reading the TypeScript AST (or the facade's own export list) instead of parameter text, with a planted options-object entry turning it red |
| **Echo backfill of stored autopsy analyses** — Phase 11's verbatim-echo check (P11-R3) runs on *new* analyses only; analyses stored before it are not re-scanned ("a backfill is an owner call", `…-phase-11.md` Out of scope). Added 2026-09-21 (batch 1, #30) | **Trigger:** the first echo refusal recorded on a deployed instance (evidence that the shape occurs on real transcripts), **or** the first render of a stored pre-check analysis on a paid surface — whichever comes first; until then the stored rows are read-only history | a one-shot re-scan job over stored analyses whose report names the count scanned, the count refused and each refused id, run before any pre-check analysis is rendered |
| **Unreconciled vendor spend after a double `recordUsage` failure** — Phase 3 P3-R5 re-attempts the spend row once and, if that fails, emits the token counts and cost on the recovery event (numbers only, keyed by attempt id) and records the spend as unreconciled in the card; no automatic reconstruction is built (`…-phase-3.md` P3-R5, Out of scope). Added 2026-09-21 (batch 1, #30) | **Trigger:** the first recovery event carrying token counts with no matching `model_usage` row on a deployed instance (the operator's own `recovery_required` review is where it surfaces), or the first REQ-G05 margin report that cannot close its spend population | a reconstruction command that writes the `model_usage` row from the event's numbers under the same attempt id, idempotent on it, with a test that plants a double failure and watches the row heal |

## Risks

| Risk | Mitigation |
|---|---|
| A remedy built on the audit's wording rather than the file (five claims did not survive re-read) | The codebase review is a prerequisite read for every phase, and every phase's first verification step re-reads its own fix sites |
| Widening a source scanner turns it red on a phantom line-ending change | Every phase that edits a scanning test runs `git ls-files --eol` on the scanned set first, per the 2026-09-18 lesson; `.gitattributes` `eol=lf` coverage is checked in Phase 1 |
| The new derived populations are themselves vacuous | Each ships with a **planted** specimen for every shape it claims to cover, and a non-vacuity floor asserting the scan found files at all — the 2026-08-26 lesson, applied to the fixes for the 2026-08-26 lesson |
| Phase 2's generator finds classes beyond R3-2/R3-3 | That is the designed outcome. The escape count is recorded before any fix; new classes are added to the phase's requirement list, not deferred silently |
| The `drizzle-orm` bump breaks the money path under real concurrency | Phase 9 lands it as its own commit with the full billing and tenancy gates and the live-Postgres concurrency run (`TEST_DATABASE_URL=… pnpm -C respin test`), exactly as `SECURITY-EXCEPTIONS.md` prescribes |
| Phase 5 changes the deletion state machine while `RESPIN_DELETION_REQUEST_SCOPES` is unset, so no manual path exercises it | Every transition change ships with an assertion over **every** `(state, "cancelled")` pair — accepted or refused, never unasserted |
| Migrations from three phases collide on an ordinal | In the intended order Phase 3 takes `0062`, Phase 4 `0063`, Phase 2 `0064`; in the serial landing order Phase 2 lands first and takes `0062`, and each later phase takes the next free ordinal on disk, renumbering before commit if the intended label is taken — the landing phase's ledger line records the mapping (Dependencies, *Database*) |

## Quality gates (per phase, never per task)

Per CLAUDE.md's Definition of Done and `.claude/gate-rules.md`. A phase is done when:

- The entry gate is clean: `pnpm -C respin typecheck && pnpm -C respin lint && pnpm -C respin test && pnpm -C respin build`, plus `pnpm -C respin preflight` and `pnpm -C respin worker:typecheck` where the phase touches the worker, plus `pnpm -C respin db:check` where it adds a migration.
- Every Critical Path the phase touches reports PASS — one verdict per path, batch 0 plus at most two retry batches per continuing gate (§3), announced before the batch starts.
- The report card reads **Ready**.
- Any invariant the phase changes is updated in its owning decision **in the same change**.
- Evidence is per phase: gate transcripts under `docs/progress/respin-audit-remediation-2026-09-19/`, one report card, one ledger line. No per-task document layer.

## Progress tracking

| Phase | Status | Started | Completed | Notes |
|---|---|---|---|---|
| 1 | 🔄 In progress | 2026-09-20 | | P1-R4 built under R-132 (`tests/support/claim-scan.ts`, `source-files.ts`, three consumers, census); batch 5 of the `phase-1-and-6` gate spent: billing BLOCK + merged NEEDS CHANGES repaired, consolidator interrupted — repairs unreviewed, 2 retry batches remain. R1–R3, R5–R9 not started |
| 2 | ⏳ Not started | | | |
| 3 | ⏳ Not started | | | |
| 4 | ⏳ Not started | | | |
| 5 | ⏳ Not started | | | |
| 6 | 🔄 In progress | 2026-09-20 | | Tasks 1–5 built under R-132 (instrument first: `phase-1-and-6-instruments.md`); same batch-5 status as Phase 1. Owed: the two-branch results sentence with its scoped count accessor (rows 9–11, 17–19, 27–29 — tenancy), the three prose pins (row 1, C-7), and the contact-support owner decision |
| 7 | ⏳ Not started | | | |
| 8 | ⏳ Not started | | | |
| 9 | ⏳ Not started | | | |
| 10 | ⏳ Not started | | | Split from 7 per §11 (2026-09-21); `…-phase-10.md` landed the same day |
| 11 | ⏳ Not started | | | Split from 8 per §11 (2026-09-21); `…-phase-11.md` landed the same day |

## Plan review log

| Batch | Date | Reviewers reserved | Verdict |
|---|---|---|---|
| 0 | 2026-09-21 | 4 evaluations — see the reservation below | **NOT READY** — billing BLOCK (2/9/6), tenancy BLOCK (1/6/6), compliance NEEDS CHANGES (C), learning NEEDS CHANGES (B−), generalist NOT READY (D); 64 findings (7 BLOCK · 20 HIGH · 14 MEDIUM · 10 LOW · 13 NOTE); report `../progress/respin-audit-remediation-2026-09-19-plan-review.md`; slot reports under `../progress/respin-audit-remediation-2026-09-19/plan-gate/` |
| 0 → repair | 2026-09-21 | — (no evaluation spent) | Findings applied to the plan files, each verified against the tree in the same edit; the master, Phases 1, 2, 6 and the codebase review by one repair, Phases 3–9 and the new 10/11 files by another. Every BLOCK/HIGH changes what will be built and re-runs its reviewer in **batch 1**; MEDIUM/LOW items that change only how the plan reads are batched here without re-review, except 28, 31, 36 and 39 (gate-rules §9 row 4) |
| 1 | 2026-09-21 | 4 evaluations — see the retry batch 1 reservation below | **NOT READY** — billing BLOCK (1/6/5), tenancy BLOCK (1/4/4), compliance NEEDS CHANGES (B−), learning NEEDS CHANGES (B), generalist NOT READY (D); 62/64 batch-0 findings closed, 44 new (2 BLOCK · 18 HIGH · 4 MEDIUM · 8 LOW · 12 NOTE) — repairs recur the same under-enumeration one layer deeper; §5 diagnostic exchange owed before batch 2 (the last retry); report `../progress/respin-audit-remediation-2026-09-19-plan-review.md` §Retry batch 1; slot reports `plan-gate/batch-1-*.md` |
| 2 | 2026-09-21 | 1 evaluation — `plan-reviewer`, sole run under the 2.0 canon (slot 9) | **NOT READY** — billing BLOCK, tenancy NEEDS CHANGES, compliance NEEDS CHANGES, learning NEEDS CHANGES, generalist NOT READY (D); 44/44 batch-1 findings applied (43 closed, 1 regressed), 19 new (1 BLOCK · 3 HIGH · 6 MEDIUM · 4 LOW · 5 NOTE); recurrence: yes, in five rows the repair rebuilt — the rule was applied to the test side of a row and not the production side; residual invariant: a population row lists producers AND receivers, not call sites; batch 3 runs under the owner's 2026-09-21 pre-approval; report `../progress/respin-audit-remediation-2026-09-19-plan-review.md` §Retry batch 2 |
| 3 | 2026-09-21 | 1 evaluation — `plan-reviewer`, sole run (slot 10), owner pre-approved | **NOT READY** — billing PASS, learning PASS, tenancy NEEDS CHANGES (Medium), compliance NEEDS CHANGES (High), generalist NOT READY; Almost / C; 19/19 batch-2 findings closed, 0 regressed, 10 new (0 BLOCK · 1 HIGH · 1 MEDIUM · 4 LOW · 4 NOTE); recurrence: once, one hop further out (the client-bundle boundary on Phase 2's `[check]` home) plus one predicate spelling with a complete list; every re-measured population equals its list; no further batch authorised — the owner decides; report §Retry batch 3 |
| – | 2026-09-21 | – (owner decision, no evaluation) | **READY** — the owner accepted batch 3's ten findings as repaired without a further evaluation. All ten were applied by the orchestrator and verified against the tree in the same edit: the compliance HIGH (Phase 2's `[check]` home vs the client-bundle boundary — `promotion-panel.tsx` now takes `checkMarker` as a prop from `results/page.tsx` row 40, `run-copy.ts:462` is the recorded third declaration pinned equal to `@respin/llm`'s), the tenancy MEDIUM (γ → `privateFrameworkEntitlement`), and eight Low/Note items. Batch 3 had already returned billing PASS and learning PASS with 0 BLOCK. Gate allowance spent: 10 evaluations over batches 0–3; no re-review was run on these repairs, and that is the owner's recorded call — the Phase 2 and Phase 11 code gates review the same surfaces when those phases build. Ledger: the 2026-09-21 'Batch-3's ten findings APPLIED' entry |

**§11 plan-size disposition (batch 0, recorded 2026-09-21 — taken by the orchestrator, revertible by the owner).** Disposition **1, SPLIT**: Phase 7 Task 5 (rows 17–29 — `/settings/account`, `/trends`, the mojibake and the seven LOW items) becomes **Phase 10**; Phase 8 Tasks 3–4 (rows 13–29 — the entitlement brand and the autopsy-bounds home) become **Phase 11**, which also lets the billing full gate review the lock/fold slice (Phase 8 rows 1–7, 30–32) in one round (slot 1 NOTE). Each new phase inherits its parent's gate selection and carries its own Reachability, Least-confident and ledger rows; the Phases table above carries their rows with counts owed until the files land. Not disposition 2 (accepted risk) — that would have pre-authorised nothing and left the second §11 signal (simulation fidelity lowest on exactly those two tasks) unanswered. The owner may revert to disposition 2 by striking Phases 10 and 11 and recording acceptance here; acceptance never pre-authorises retry batch 3.

**§11 for Phases 1 (32), 2 (33), 3 (33), 5 (29) and 6 (26) — disposition 2 proposed, accepted risk, pending the owner's word.** These five grew past the target only because batch 0 and the 2026-09-21 Codex re-check required every measured population to be listed as rows (Respin rule 7) — six disclosure carriers and their fixtures, eleven `[check]` sites, the four `provider.complete` sites, the five dunning writers, the read-grade scope's fences and readers, the total-cost accessor Task 2 of Phase 3 already required, the changelog mode count no test read. Each extra row is a list entry an implementer edits in minutes, not a new mechanism; §11's second signal (the generalist could not simulate faithfully) fired for 7 Task 5 and 8 Task 3 only, and those are split. Splitting these five would answer a row count with more phases, contracts and gates — the 2026-09-08 lesson — while the round budget is the only cost the extra rows carry. So the orchestrator records **accepted round-budget risk** for 1, 2, 3, 5 and 6 as its proposal; the owner confirms or overrides when the gate reports; the retry batch's generalist may contest it as a finding. Acceptance never pre-authorises retry batch 3.

**Owner decisions, 2026-09-21 (verbatim: "1. Go with batch 2 · 2. Accept the risks · 3. Approval 3rd batch should batch 2 failed").** (1) Retry batch 2 is authorised; under the pack's 2.0 canon (`.claude/gate-rules.md` §5 and `create-plan.md` Step 6, adopted by `/sync-pack` on 2026-09-21 while batch 1 was running) the plan gate is one `plan-reviewer` run over the frozen set, so batch 2 is one evaluation, briefed with the four path checklists and the batch-1 reports for movement. (2) The §11 accepted-risk disposition for Phases 1, 2, 3, 5 and 6 is **confirmed by the owner** — no further split. (3) A third batch is **pre-approved** should batch 2 return NOT READY; per §5 it is one more run, after the residual is put to the owner in one exchange. The §5 diagnostic exchange for batch 1 is closed by decision (1): the reconciled invariant is the generalist's authoring rule (predicate written per population row; all roots incl. tests where the shape changes; every alternate spelling planted; one hop outward), applied to every population row before batch 2.

### Batch 0 reservation — gate `respin-audit-remediation-2026-09-19-plan` (2026-09-21)

**History.** This gate has consumed nothing: the log above read "Not yet run" from authoring until today, and no `-plan-review.md` exists. Batch 0 is the initial evaluation; retries are batches 1 and 2. Gate intensity `lean` (CLAUDE.md): the two `Full gates? = yes` paths keep their own reviewers; the two `no` paths merge into one run; the generalist stays separate and last (gate-rules §9 row 7). Authorization: the owner's `/go implement docs/plans/respin-audit-remediation-2026-09-19-master-plan.md` (2026-09-21) — whole-goal build authorization, which requires this plan gate first.

**Pre-gate audits, both run before the reservation (Step 5.5).** Codex `gpt-6-astra` at `xhigh` (Mode 2) returned **FAIL — 17 [P1] / 2 [P2]**; an Opus-high mechanical gather returned 13 [P1] / 4 [P2]. Every item was verified against the tree and fixed in the plan files (decision numbers renumbered R-134…R-147; todo rows T-23/T-24; REG-16/17 homed as P1-R9; every task→file-row range re-derived; eleven nonexistent paths corrected; Phase 4 tenancy, Phase 6 billing+tenancy and Phase 9's dependencies mirrored; the `[check]` and autopsy-bound populations enumerated; Phase 7's contrast numbers recomputed against today's tokens; Reachability lines added to all nine phases; two deferrals given ledger rows), except the two deliberately **raised** into this gate: the §11 plan-size finding for Phases 7 (29 rows) and 8 (32 rows), and the register's "five copies" of the autopsy bounds versus four declaration sites on disk (recorded in Phase 8 as measured).

| Slot | Reviewer | Critical Path(s) | Dispatch (planned) | Status |
|---|---|---|---|---|
| 1 | `respin-billing-reviewer` | Respin billing & credits (phases 3, 4, 5, 6, 8, 9) — `Full gates? = yes`, separate | by name; frontmatter `model: fable`, `effort: xhigh` | returned (batch 0) |
| 2 | `respin-tenancy-reviewer` | Respin brain tenancy (phases 1, 4, 5, 6, 9) — `Full gates? = yes`, separate | by name; frontmatter `model: fable`, `effort: xhigh` | returned (batch 0) |
| 3 | merged `respin-compliance-reviewer` + `respin-learning-reviewer` (lean) | Respin spin compliance (1, 2, 6, 8); Respin learning honesty (1, 2, 6) — two verdicts | `general-purpose` with both checklists pinned verbatim; dispatch `model: fable`; "think hard" | returned (batch 0) |
| 4 | `plan-reviewer` (generalist, last) | plan integrity; Phase 7's zero-path coverage; §11 plan-size disposition; consolidates 1–3 | by name; frontmatter `model: fable`, `effort: xhigh`; runs after 1–3 return | returned (batch 0) |

**Fixed assessment inputs, sha256 (first 8), measured after the last plan edit and before this reservation was written.** The master plan's own hash is the pre-reservation state (`f3cb7859`); its as-dispatched value is recorded in `docs/progress/respin-audit-remediation-2026-09-19/ledger.md`, the only place it can be stated without invalidating itself.

| Hash | File |
|---|---|
| `f3cb7859` | `docs/plans/respin-audit-remediation-2026-09-19-master-plan.md` |
| `571f6670` | `docs/plans/respin-audit-remediation-2026-09-19-phase-1.md` |
| `f43789f4` | `docs/plans/respin-audit-remediation-2026-09-19-phase-2.md` |
| `f6447452` | `docs/plans/respin-audit-remediation-2026-09-19-phase-3.md` |
| `83133365` | `docs/plans/respin-audit-remediation-2026-09-19-phase-4.md` |
| `24f0700d` | `docs/plans/respin-audit-remediation-2026-09-19-phase-5.md` |
| `e410d0f2` | `docs/plans/respin-audit-remediation-2026-09-19-phase-6.md` |
| `28b6416b` | `docs/plans/respin-audit-remediation-2026-09-19-phase-7.md` |
| `d39a1431` | `docs/plans/respin-audit-remediation-2026-09-19-phase-8.md` |
| `47034be4` | `docs/plans/respin-audit-remediation-2026-09-19-phase-9.md` |
| `dfd6f30a` | `docs/progress/respin-audit-remediation-2026-09-19-codebase-review.md` |
| `0425ee63` | `docs/progress/respin-audit-remediation-2026-09-19/phase-1-and-6-card.md` |

All reviewers are read-only and told so; a mutation a reviewer wants proven is named in its report and run by the orchestrator afterwards. Effective runtime model/effort are unknown unless exposed; the column above records requests only.


### Retry batch 1 reservation — gate `respin-audit-remediation-2026-09-19-plan` (2026-09-21)

**Consumed so far on this gate: batch 0 (4 evaluations).** Batch 1 is the first of the two permitted retries (§3). Every path returned BLOCK or High in batch 0 and every phase file was materially edited by three repair passes (A: master/1/2/6/codebase-review; B: 3/4/5/7/8/9 + new 10/11; C: the Codex re-check's 12 [P1]) — so **all four path verdicts and the generalist are invalidated and re-reserved**; nothing is carried. Codex Mode 2 (`gpt-6-astra`/`xhigh`) ran twice outside the gate: FAIL 17 [P1] before batch 0, FAIL 12 [P1] after passes A/B — all 29 fixed; pass C's closure pass found no further residue.

| Slot | Reviewer | Critical Path(s) | Dispatch (planned) | Status |
|---|---|---|---|---|
| 5 | `respin-billing-reviewer` | Respin billing & credits (3, 4, 5, 6, 8, 9, 11) — separate | by name; frontmatter `model: fable`, `effort: xhigh` | returned (batch 1) |
| 6 | `respin-tenancy-reviewer` | Respin brain tenancy (1, 3, 4, 5, 6, 8, 9, 11) — separate | by name; frontmatter `model: fable`, `effort: xhigh` | returned (batch 1) |
| 7 | merged compliance + learning (lean) | Respin spin compliance (1, 2, 6, 8, 11); Respin learning honesty (1, 2, 6, 11) — two verdicts | `general-purpose`, dispatch `model: fable`, "think hard" | returned (batch 1) |
| 8 | `plan-reviewer` (generalist, last) | plan integrity; Phases 7 and 10 zero-path coverage; §11 dispositions; consolidates 5–7 | by name; frontmatter `model: fable`, `effort: xhigh`; after 5–7 return | returned (batch 1) |

**Fixed assessment inputs, sha256 (first 8), measured after pass C and before this reservation was written.** The master's own row is the pre-reservation state; its as-dispatched value is in `ledger.md`.

| Hash | File |
|---|---|
| `48a15f4c` | `docs/plans/respin-audit-remediation-2026-09-19-master-plan.md` |
| `1c2169da` | `docs/plans/respin-audit-remediation-2026-09-19-phase-1.md` |
| `dfa89e78` | `docs/plans/respin-audit-remediation-2026-09-19-phase-2.md` |
| `a2a5e538` | `docs/plans/respin-audit-remediation-2026-09-19-phase-3.md` |
| `64148883` | `docs/plans/respin-audit-remediation-2026-09-19-phase-4.md` |
| `8673012d` | `docs/plans/respin-audit-remediation-2026-09-19-phase-5.md` |
| `7770d985` | `docs/plans/respin-audit-remediation-2026-09-19-phase-6.md` |
| `d226ba35` | `docs/plans/respin-audit-remediation-2026-09-19-phase-7.md` |
| `88c04c6d` | `docs/plans/respin-audit-remediation-2026-09-19-phase-8.md` |
| `0689ddfb` | `docs/plans/respin-audit-remediation-2026-09-19-phase-9.md` |
| `4e9247c9` | `docs/plans/respin-audit-remediation-2026-09-19-phase-10.md` |
| `dc2f7aed` | `docs/plans/respin-audit-remediation-2026-09-19-phase-11.md` |
| `6bde50e8` | `docs/progress/respin-audit-remediation-2026-09-19-codebase-review.md` |
| `0425ee63` | `docs/progress/respin-audit-remediation-2026-09-19/phase-1-and-6-card.md` |

Reviewers are read-only; named mutations are run by the orchestrator afterwards. Planned dispatch settings are requests; runtime values unknown unless exposed.

### Retry batch 2 reservation — gate `respin-audit-remediation-2026-09-19-plan` (2026-09-21)

**Consumed: batches 0 and 1 (8 evaluations). Batch 2 is the last permitted retry; the owner pre-approved a third on 2026-09-21 should this one fail.** Under the 2.0 canon adopted mid-gate the plan gate is **one `plan-reviewer` run** over the frozen set, briefed with all four Critical-Path checklists (billing, tenancy, compliance, learning — pasted verbatim) and the batch-1 reports for movement; it renders one verdict per path plus the generalist verdict. Codex Mode 2 (`gpt-6-astra`/`xhigh`) ran a third time after the batch-1 repairs: FAIL 8 [P1] / 3 [P2] — all fixed by one serial repair context, closure pass clean.

| Slot | Reviewer | Scope | Dispatch (planned) | Status |
|---|---|---|---|---|
| 9 | `plan-reviewer` (sole run, batch 2) | plan integrity + the four path checklists; movement on batch 1's 44; §11 accepted-risk set (1, 2, 3, 5, 6, 11); §10 zero-path 7 and 10 | by name; frontmatter `model: fable`, `effort: xhigh` | returned (batch 2) |

**Fixed assessment inputs, sha256 (first 8), measured after repair C and before this reservation was written.** The master's own row is the pre-reservation state; its as-dispatched value is in `ledger.md`.

| Hash | File |
|---|---|
| `154bb120` | `docs/plans/respin-audit-remediation-2026-09-19-master-plan.md` |
| `00e4c296` | `docs/plans/respin-audit-remediation-2026-09-19-phase-1.md` |
| `c93533ba` | `docs/plans/respin-audit-remediation-2026-09-19-phase-2.md` |
| `55f59c8c` | `docs/plans/respin-audit-remediation-2026-09-19-phase-3.md` |
| `3135cf5b` | `docs/plans/respin-audit-remediation-2026-09-19-phase-4.md` |
| `ead7b7eb` | `docs/plans/respin-audit-remediation-2026-09-19-phase-5.md` |
| `18989d9a` | `docs/plans/respin-audit-remediation-2026-09-19-phase-6.md` |
| `5bbeafa0` | `docs/plans/respin-audit-remediation-2026-09-19-phase-7.md` |
| `85ffe1a5` | `docs/plans/respin-audit-remediation-2026-09-19-phase-8.md` |
| `bdb258c8` | `docs/plans/respin-audit-remediation-2026-09-19-phase-9.md` |
| `3b30b6fc` | `docs/plans/respin-audit-remediation-2026-09-19-phase-10.md` |
| `f646706b` | `docs/plans/respin-audit-remediation-2026-09-19-phase-11.md` |
| `2052c45a` | `docs/progress/respin-audit-remediation-2026-09-19-codebase-review.md` |
| `0425ee63` | `docs/progress/respin-audit-remediation-2026-09-19/phase-1-and-6-card.md` |

### Retry batch 3 reservation — gate `respin-audit-remediation-2026-09-19-plan` (2026-09-21)

**Consumed: batches 0, 1, 2 (9 evaluations). Batch 3 runs under the owner's explicit pre-approval of 2026-09-21 ("Approval 3rd batch should batch 2 failed") — one `plan-reviewer` run, the 2.0 shape.** Between batch 2 and this reservation: one repair context closed all 19 batch-2 findings under the sharpened rule (a population row lists its producers AND receivers, never call sites); Codex Mode 2 #4 then EXECUTED every predicate and found six lists their predicates did not reproduce plus nine unrowed files (13 [P1]) — a second repair context fixed all 16 and scripted every population predicate in all eleven phases against the tree (three further mismatches found and fixed, fourteen confirmed equal); Codex #5 returned **zero [P1]** and five [P2], fixed by the orchestrator (a 335→333 walker count, a receiver hit count, a `packages/trends/README.md` row, a `:189` ownership sentence, a stale "row 5 here"). Under the project's same-finding-recurrence rule this is the batch that must not return the under-enumeration class.

| Slot | Reviewer | Scope | Dispatch (planned) | Status |
|---|---|---|---|---|
| 10 | `plan-reviewer` (sole run, batch 3) | plan integrity + the four path checklists; movement on batch 2's 19; recurrence headline; §11 accepted-risk set (1, 2, 3, 5, 6, 11); §10 zero-path 7 and 10 | by name; frontmatter `model: fable`, `effort: xhigh` | returned (batch 3) |

**Fixed assessment inputs, sha256 (first 8), measured after the last edit and before this reservation was written.** The master's own row is the pre-reservation state; its as-dispatched value is in `ledger.md`.

| Hash | File |
|---|---|
| `81c4836c` | `docs/plans/respin-audit-remediation-2026-09-19-master-plan.md` |
| `b16ea9bc` | `docs/plans/respin-audit-remediation-2026-09-19-phase-1.md` |
| `462c28e4` | `docs/plans/respin-audit-remediation-2026-09-19-phase-2.md` |
| `1ad237f6` | `docs/plans/respin-audit-remediation-2026-09-19-phase-3.md` |
| `5759ee39` | `docs/plans/respin-audit-remediation-2026-09-19-phase-4.md` |
| `f1293266` | `docs/plans/respin-audit-remediation-2026-09-19-phase-5.md` |
| `3e3330ea` | `docs/plans/respin-audit-remediation-2026-09-19-phase-6.md` |
| `5bbeafa0` | `docs/plans/respin-audit-remediation-2026-09-19-phase-7.md` |
| `69567a7d` | `docs/plans/respin-audit-remediation-2026-09-19-phase-8.md` |
| `4d28a3c4` | `docs/plans/respin-audit-remediation-2026-09-19-phase-9.md` |
| `485b8b0c` | `docs/plans/respin-audit-remediation-2026-09-19-phase-10.md` |
| `77d038c0` | `docs/plans/respin-audit-remediation-2026-09-19-phase-11.md` |
| `2052c45a` | `docs/progress/respin-audit-remediation-2026-09-19-codebase-review.md` |
| `0425ee63` | `docs/progress/respin-audit-remediation-2026-09-19/phase-1-and-6-card.md` |

## Exit demonstration

The programme is complete when, on a local tree:

1. A paying creator's Spin and Studio results show a neutral disclosure line and no model-authored platform-policy prose — verified by the carrier types being `PresentedDisclosure` (kind only — no free-text member, no platform), by the serialised action state of a usable run never containing a sentinel guidance string (the whole-object witness), and by a scan asserting **no** file under `app/**` or `packages/*/src/**` reads `disclosure.guidance` in any of its four spellings (member, renamed, bracket, destructure) outside the one owning module (`packages/credits/src/presented-output.ts`) and the modes text-unit reader.
2. Every claim-honesty scan fails on a planted specimen of each word it claims to cover, on every surface including the marketing pages and the changelog.
3. A repeated `invoice.payment_failed` inside one unpaid episode does not extend paid entitlement past the 7 days REQ-G06 promises, proved by a test that drives three failures across two lapsed deadlines.
4. A sole-owner creator can request identity erasure and reach a terminal state, and cancelling it returns them to exactly one workspace.
5. `pnpm -C respin test` with `TEST_DATABASE_URL` set is green on `drizzle-orm` ≥ 0.45.2 with `better-auth`'s peer satisfied.
6. `RUNBOOK.md`'s stated counts are asserted against the tree by a test, and its recovery commands run as written.
