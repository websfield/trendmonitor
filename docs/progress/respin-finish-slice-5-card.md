# Slice 5 report card — Brain editing, versions, export

**Readiness: Ready**
**Date: 2026-08-31**
**Plan: [`respin-finish-master-plan.md`](../plans/respin-finish-master-plan.md) · Card: [`respin-finish-phase-5.md`](../plans/respin-finish-phase-5.md) · Decisions: `decisions.md` R-61, R-62**

A creator can now **edit Voice, Strategy, Kill Test or their declared metric, see the version they replaced still readable with its own quotes, and export the whole brain as JSON and markdown.** That line was walked in a browser on a hydrated production build, twice — once for the ordinary path and once for the population the first walk missed.

M2's Creator Brain is complete with this slice, except B04's first-three-ideas entry, which slice 7 owns.

## The acceptance line, walked

Two walks, on two different creators, with **zero vendor calls** — model spend was withheld for this session, so every path below is deterministic.

**Walk 1 — the ordinary path.** Fresh account → creator profile → reference post → structured interview → Strategy v1 and Kill Test v1 confirmed and activated. Then: edit a Strategy claim (v2, `proposed`, reason "you edited this document", active v1 untouched) → confirm → activate → v1 becomes `superseded` and renders read-only with **its own original text and quote** plus "Replaced by version 2 on 2026-08-31" → export JSON and markdown.

**Walk 2 — the population walk 1 missed.** A creator who **declined both optional metric questions**. The stored `metric` was verified to have no `platform` and no `window` key, which is the exact precondition of the defect the learning gate found. Editing the metric with the optionals blank now succeeds (v2, optionals still *absent* — declined, not coerced to `[check]`), and adding a previously-declined optional also succeeds (v3, `platform: "LinkedIn"`).

Evidence: [strategy history](respin-finish/evidence/slice5-strategy-history.png) · [reference-echo refusal](respin-finish/evidence/slice5-reference-echo-refusal.png) · [export and annotation](respin-finish/evidence/slice5-export-and-annotation.png) · [metric fix, declined optionals](respin-finish/evidence/slice5-metric-declined-optionals-fixed.png).

### What the walks proved, per requirement

| Req | Proof |
|---|---|
| R1/R2/R3 | Both versions render; superseded is read-only with its own quotes and replacement stamp; the stale "surfaced by nothing / no export exists" copy is gone |
| R4/R5 | New `proposed` version via `writeBrainDoc`, reason `creator_edit`, active untouched; exactly one `creator_authored` row, `field_key='creator_edit'` |
| **R6** | v2's `source_evidence` shows all **nine** unchanged fields keeping their **original** interview `inputId`s and quotes; only the edited field cites the new row |
| R8 | All-`[check]` refused with the named code `brain-edit-all-check` and copy saying which case it is and that nothing changed |
| **R9** | A deliberately corrupted evidence offset produced **HTTP 200, all 5 documents exported**, with a named annotation in JSON *and* markdown; `/brain` rendered it inline instead of 500ing. Corruption reversed and re-verified |
| R10 | "no rules recorded" for empty claim arrays; never `0` |
| R11/R14 | Registry-driven JSON with all 6 included tables and 3 excluded named; markdown carries its projection header in the file |
| R13 | A real foreign profile and a bogus id return the **same** 404 — isolation holds, no enumeration oracle |
| R15a | Reference echo refused **in place**, naming field, reference, span and corrective action. DB proof it is a rollback: no new version, and the `creator_edit` input count unchanged |

## Entry gate

Clean on the current tree, CI shape, Docker live, zero skips: typecheck 0 (root + auth/config/credits/db/llm), full-repo ESLint 0, `db:check` clean, `next build` exit 0, Vitest **82 files / 1763 tests / 1763 passed / 0 skipped**.

The 1663-test baseline grew to 1763 — **+100 tests**, almost all of them witnesses the gates showed were missing.

**Recorded honestly:** the first gate attempt took four runs (1662, 1661, 1661, then 1663 clean). Every failure in every red run was a **60-second timeout, never an assertion**, and the failing file *moved* between runs — the signature of contention, not a defect. Two were proven green in isolation together, 17/17 in 21 s. One red run was self-inflicted by concurrent database inspection. Later gate runs, after the fix passes, were clean first time. The machine-level instability is real and its cause is **not** claimed solved.

## Critical-Path gates

Run on the **main tree, not isolated worktrees** — Slice 4c's work is uncommitted, so a worktree or HEAD review reads a tree without it. Same deviation Slices 3 and 2b-c recorded, for the same reason. Two rounds, three reviewers each, six reviewer runs total.

| Gate | Round 1 | Round 2 |
|---|---|---|
| Respin brain tenancy (**Full**) | NEEDS CHANGES — Almost/C, 0 BLOCK, 7 CHANGE | NEEDS CHANGES — Almost/**B+**, 1 CHANGE |
| Respin spin compliance | NEEDS CHANGES — Almost/B−, 0 BLOCK, 5 CHANGE | NEEDS CHANGES — Almost/**B**, 1 CHANGE |
| Respin learning honesty | NEEDS CHANGES — Almost/C, 0 BLOCK, 6 CHANGE | NEEDS CHANGES — Almost/**B−**, 2 CHANGE |

**Zero BLOCKs in any round.** Round 2 verified every round-1 finding fixed on the production path. Its four CHANGEs were then fixed **without a third round**, which is what the pack prescribes for CHANGE-level findings once the two-round bound is spent.

**Billing was not run.** This slice touches no ledger, Stripe, pricing or metering surface; the export's only money-adjacent seam is a `RunSlots` lease, which spends nothing.

### What the gates actually caught

Three findings justify the whole round and are worth naming.

**1. There were two exporters, and every guard was on the one no user could reach.** `openBrainExport` is what the route calls; `exportBrain`/`exportBrainFile`/`withPreparedExport` had zero `app/**` callers — yet R11, R12, R13's sibling case and R15 were all witnessed against them. The tenancy reviewer proved the consequence by planting: **M1 stayed green and M7 survived on the production path.** The dead exporter is deleted; every guard now drives the live path, and M1, M6 and M7 redden.

This also **corrected an inherited claim of mine**: the ledger's "8/8 mutations reddened, 0 survived" was not supportable — the matrix was real but planted in unreachable code. Restated as *5 of 8 stand; M1, M6, M7 were unproven on the path production uses.*

**2. A functional defect a browser walk could not find, because the walk built the happy path.** The declared metric could not be edited **at all** by a creator who declined either optional metric question — they got `ProvenanceError` surfaced as "What this page showed you and what the server holds no longer agree", a false cause for a dead end on REQ-B03's own surface. My first walk missed it because the creator I created answered every question. Walk 2 exists because of this finding.

**3. The export misattributed absence — twice, at two different widths.** All three reviewers independently found that the markdown printed the voice-only sentence ("We could not point to a quote from your posts") for *every* document kind, when a Strategy `[check]` means the creator left an interview field undecided and nobody searched anything. Round 2 then found the fix closed the *kind* instance and left the *authorship* one: a creator who deliberately blanks a Voice field still had their own decision attributed to our failed search. Absence copy is now selected on **(kind, reason)**, from one source shared by screen and file.

## Fixes shipped this round

- The unreachable exporter deleted; all export guards on `openBrainExport`.
- `ProfileExportTable` derived from `PROFILE_EXPORT_TABLES`, the unchecked cast gone — **the compiler is the guard, proven by planting a seventh member and observing TS2366**. R11's refusal now precedes HTTP 200, witnessed by a test asserting zero slot acquisitions and zero transactions.
- Absence copy selected on (kind, reason), one source, `Record`-typed so a new code is a compile error; the export drops the "confirm it" call to action a downloaded file cannot honour.
- Metric editable for declined optionals: `null` means *declined*, and `mayCreate` is schema-probed, granted only for declared absent optionals — `writePointer`'s `Object.hasOwn` guard is not relaxed generally.
- Markdown emits quote provenance ("Your own answer, from <date>:"), human headings instead of RFC-6901 pointers, each version's reason, and states in the file that it cannot be read back in.
- `BrainEditUnchangedError` gives the no-op edit its own honest refusal.
- The R15a banner carries the "nothing was saved" and REQ-I04 no-guarantee clauses from the same constants `reference_echo` uses.
- The `verified` ban binds negation to the verb and covers `verifying`/`verifiable`; the three measured under-catch strings are now CATCHES cases.
- Four orphaned accessors and two now-false comments deleted; the FK coverage they owned was **moved**, not dropped.
- `tests/shared-copy-identity.test.ts` fails if app copy ever diverges from `@respin/db`'s again.

## Mutation evidence — read the population note

Round 1's inherited matrix is **restated, not repeated**: 5 of 8 stand; M1, M6 and M7 were planted in unreachable code. After the fix, all three redden on the production path, alongside seven further mutations (two `exportPage` predicate drops, the guard moved inside the stream, the call-to-action reuse, the absence collapse, the old lookbehind, a seventh table member caught by the compiler).

**Three mutations SURVIVED during this round and are recorded rather than smoothed:**

1. A kind-blind absence mutation survived because the test asserted `toContain(exportAbsenceSentence("killtest"))` — an assertion that reads the very constant the mutation moves, so it travelled with it. Rewritten to pin literal phrases; then red.
2. A reference-echo mutation survived because it was planted on the **activation** seam rather than the **write** seam. The implementer recorded being "one step from reporting a false green", then found the real seam.
3. Emptying `creatableClaimPointers` left the *headline* metric test green — that test witnesses only the null-means-decline half.

That is CLAUDE.md's 2026-08-26 lesson doing its work: a green matrix is evidence about the code you have, and the author is the worst judge of which code that is.

## Residuals — named, not absorbed

- **The Voice edit was never walked in a browser.** Creating a `voice` document requires a paid vendor inference, withheld this session. `editBrainDocument` is kind-agnostic and voice is covered by package tests, but the browser discriminator was not run.
- **R7's viewer refusal** needs a second seat (slice 10b) and **R12's paused export** needs an open pause — both witnessed by tests, not by a walk.
- **`classifyBrainReason` parses the stored rendered sentence** because `brain_docs` has no `reason_code` column. I verified all **9 distinct `reason` values actually in this database classify correctly, 0 unclassified** — but a row written by a *future* renderer change would silently fall to the claims-nothing sentence. A `reason_code` column deletes the coupling; a fix pass was not the place to add one.
- **The create-grant half of the metric fix rests on one test on one pointer** (`/metric/platform`); `/metric/window` is witnessed for decline only. Both run the identical loop with no per-pointer branching, and both were walked in a browser.
- **The full-suite timeout instability on this machine is unexplained.** Only its absence in the passing runs is claimed.
- **Card deviation:** R15/task 21 names "the `frameworks` accessor on `ProfileAccessors`". It is deleted; `exportPage`'s scoped `frameworks` branch satisfies its stated purpose and carries the private-only rule and its witness. Recorded in `decisions.md` R-62.

## Open items closed

Brain-surface tasks **15, 21, 22, 23, 37, 44**. R-30.7 (framework seeding) remains owned by slice 7 with its first production reader.

## Verdict

**Ready.** The acceptance line is walked, the entry gate is clean with zero skips, both gate rounds are complete with zero BLOCKs and every round-1 finding verified fixed on the production path, the round-2 CHANGEs are fixed and reported, and the decisions are recorded in R-61 and R-62. Slice 6 is unblocked — note its walk is **on Free**, so free-tier credit minting is a precondition of its acceptance test, not a nicety.
