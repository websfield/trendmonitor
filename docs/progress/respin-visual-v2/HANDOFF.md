# Handoff — Respin marketing-claims / workflow-guard repair (2026-09-20)

Paste the block below as the first message of the new session.

---

Read `docs/progress/respin-visual-v2/HANDOFF.md` and then continue the work it describes. Summary follows so you can start without re-deriving it.

## Where things stand

Working on **Respin** (`respin/`), branch `creator-ready-plan-review`, HEAD `4a19e04`, everything **uncommitted**. No deploy exists; owner works local-first.

A repair of two marketing/CI findings ran across two reviewer batches and **failed both**:

- **Batch 3** (4 evaluations): 4 BLOCK.
- **Batch 4** (4 evaluations): 4 BLOCK, Grade **F**. Three of the four were *caused by the batch-3 repair*.
- 17 evaluations consumed on gate `respin-visual-v2-phase-1`. **No batch 5 is approved** — ask before spending one.

Decisions written: **R-130** (the original repair) and **R-131** (correcting R-130) in `docs/initial/decisions.md`. Both are append-only and both **overclaim** — see below. Full chronology in `docs/progress/respin-visual-v2/ledger.md`; the report card is `docs/progress/respin-visual-v2-phase-1-review.md`.

## The one thing to understand before touching anything

Every failure in this work is the same shape, and it recurred **eight times in one round**: *fix the instances the last reviewer named, then write down that the class is closed.* CLAUDE.md non-negotiable 7 already governs it ("a derived guard's population is a list, not a producer") and this is its fourth recurrence.

Two compounding process errors, both confirmed:

1. **`docs/progress/audit/2026-09-19.md` already contained the findings.** It is a 47-item + 14-D-item register written the day before. The repair cited findings 27/28/30 and D6 because a reviewer quoted them, and missed **D13** in the same file — which names a live violation (`"Audiences punish it."`) still shipping today.
2. **`docs/plans/respin-audit-remediation-2026-09-19-*.md` already owns all of it**, with the *correct ordering*, and the repair inverted that ordering. Specifically:
   - **P1-R4** (Phase 1) specifies the shared claim-scan helper that was built here — including "the helper is the only exported way to run the canon".
   - **P6-R2** (Phase 6) specifies the instrument: `landing-pricing.test.ts` pinning **every** feature line to a config key or shipped path, plus the marketing render scan on Phase 1's helper.
   - **Phase 6 Task 1** says: *"The scanner first … Record which sentences go red before any copy changes,"* and *"Task 1 precedes Task 2 … the scanner's red list is the evidence that the rewrite was necessary and complete."*

   The repair did Task 2/3 (copy rewrites) and never did Task 1. That is why a false claim shipped unguarded.

**Read both documents end to end before writing code.** Not the cited lines — the whole register, and phase plans 1 and 6.

## Owner decisions already given (do not re-ask)

- Stop the live harm first, then build the mechanism rather than patching instances. **Done: live harm is stopped** (see below).
- Read the whole register and the nine phase plans before further repair. **Done.**
- Decide on batch 5 only after the next report.
- Deploy/GitHub is deferred — `todos.md` **T-21**. Do not work on CI execution.

## Open question the owner has NOT answered

This work belongs to remediation **Phase 1** (P1-R4) and **Phase 6** (P6-R1…R7), not to the visual-v2 Phase 1 gate it is currently logged against. Proposed: record **R-132** handing these items back to their owning phases and continue there. **Ask the owner before re-homing it** — it changes which plan the session executes.

## Already fixed this session (do not redo)

- The shared predicate `respin/tests/support/claim-scan.ts` (`claimHits`, `specimensFor`), tuple-typed so the old broken idiom is not expressible; `respin/tests/claim-scan.test.ts` plants every entry, keeps the broken idiom as a running fixture, and source-scans for re-inventions. Four inlined copies retired.
- The three structurally vacuous scans repaired (`changelog.test.ts`, `sample-spin-copy.test.tsx`, `activation-view.test.tsx`) with real plants.
- `claimHits` resets `lastIndex`; every canon entry asserted flagless (this was a live fail-open — with a `g` flag the predicate alternated true/false across identical calls).
- `pricing-copy.ts:31` Free line restored to `"Hooks, captions and ideas"` (traces to `MODE_TIERS` in `packages/credits/src/mode-access.ts`). **It had briefly read "Paste a reference, get an autopsy", which `PASTED_REFERENCE_TIERS` excludes Free from and `PastedReferenceTierError` refuses — worse than the line it replaced.**
- Copy: footer + root `metadata.description` → "built on reviewed mechanisms"; `MAIN_DEMO.shot` → `[check]`; step 03 states the connector precondition.
- `.github/workflows/respin-visual.yml` (new, secret-free Playwright matrix) + guard clauses in `respin/tests/journeys-workflow-triggers.test.ts`; `respin.yml` now triggers on `.github/workflows/**`.
- `e2e/visual/visual.spec.ts`: reading-order vs visual-order checks (found **A11Y-1**, an open WCAG 1.3.2 divergence, deliberately recorded not fixed), WebKit tab claims now report *skipped* not passed.

## Do this next

**Build the instrument before changing any more copy.** That is both the consolidator's recommendation and Phase 6 Task 1.

1. Extend `respin/tests/landing-pricing.test.ts` so **every** `PRICING[].lines[]` entry binds to a config key or a shipped path (`CONFIG_V1_SEED`, `MODE_TIERS`, `PASTED_REFERENCE_TIERS`, `trackedNiches`, `performanceLearning`). An unpinnable line must fail. Today it pins only price, allowance, profile count.
2. **Record the red list before rewriting anything.**
3. Finish P1-R4's gaps that batch 4 found:
   - `claim-scan.test.ts`'s re-invention scan covers `respin/tests` only — 513 files under `packages/`, `worker/`, `e2e/`, `app/` are outside it, including `packages/modes/tests/` which imports the same canon.
   - The scan catches one byte-alike spelling, not the class (a correct-shaped but weaker predicate is invisible).
   - `marketing-claims.test.tsx`'s metadata population walks `page.tsx` only — a `(marketing)/layout.tsx` is invisible; `metaText` reads `title`/`description` only, not `openGraph`/`twitter`.
   - `MARKETING_CLAIMS` is three morphological variants of two cited sentences, and its docblock + R-131 claim it is "derived from the marketing vocabulary". **Measured: 13 of 17 plausible sales sentences pass**, including `"Audiences punish it."` which ships live on all four marketing routes. Either derive it from a read of every rendered marketing sentence, or strike the "derived" claim from the docblock **and** R-131.
4. Then, and only then, the remaining copy rewrites — under Phase 6's requirement list, not a reviewer's citation list.

The full deduplicated fix list (9 must-fix / 7 fix-before-re-review / 6 optional / 1 process gate) is in the batch-4 consolidator's report, summarised in the report card's batch-3 section and the ledger's 2026-09-20 entries.

## Rules that bit hard here — obey them literally

- **Re-measure every number before writing it down.** Five stale matrix counts, a wrong line count and a wrong assertion count were all shipped in certifying artefacts this session. Name the run each figure came from.
- **The Bash tool eats one level of backslashes in heredocs.** Regexes written through `bash -c` silently lose escapes (`\s` → `s`). Use the Write/Edit tools for anything containing a regex, or `String.raw`.
- **Worktree bytes are CRLF while `.gitattributes` pins `eol=lf`.** Preserve each file's existing endings on write or you get a whole-file phantom diff.
- **Never run reviewers concurrently if any may mutate the tree.** Batch 2 BLOCKed on exactly that. Dispatch read-only, have them *name* mutations, run those serially with hashes verified either side.
- **Freeze and hash the manifest before a reviewer batch; read the reservation back before dispatch** (`.claude/gate-rules.md` §2).

## Verify before quoting

Last full measurement was taken **before** the final two fixes (`pricing-copy.ts`, `claim-scan.ts`/`claim-scan.test.ts`). Re-run and re-state:

```
pnpm -C respin typecheck && pnpm -C respin lint && pnpm -C respin test && pnpm -C respin build
pnpm -C respin preflight && pnpm -C respin db:check && pnpm -C respin worker:typecheck
cd respin && pnpm test:e2e:visual
```

Previous figures, now stale: 243 files / 5,605 passed / 119 skipped; matrix 356 passed / 4 skipped. Docker concurrency suites loud-skip without `TEST_DATABASE_URL`.
