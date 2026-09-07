# Respin learning honesty — slice 8c, round 1

**Reviewer:** `respin-learning-reviewer` · **Verdict: BLOCK** · Readiness **Not yet · D** · 1 BLOCK · 6 CHANGE · 4 NOTE

*Filed by the orchestrator: the reviewer is read-only and was told not to edit any file, so it returned the report as its result. The text below is the reviewer's, verbatim except for this header.*

**Manifest**: all **166** files in [`8c-review-manifest.md`](8c-review-manifest.md) hashed **before and after** — 0 mismatches both times. Nothing moved under me.

---

## Findings

### BLOCK 1 — a private paste's autopsy proposes a **shared** framework from n=1, citing evidence no curator can read

`respin/packages/db/src/system-spend.ts:1170` (call site) · reached in production for the first time by `respin/packages/db/src/trends-storage.ts:1105` → `respin/packages/credits/src/pasted-reference.ts:265`

`resolveAutopsyFramework` runs on **every** autopsy completion with no `rightsScope` condition. Before 8c the only production producer of autopsies was shared YouTube items; 8c makes `profile_private` claims reachable, so the producing population widened silently — CLAUDE.md's 2026-08-29 lesson exactly.

**Verified by running code.** A real `intakePastedReference` → `startAttempt` → `finalizeAttempt` on PGlite produced:

```
FRAMEWORK ROWS AFTER A PRIVATE PASTE'S AUTOPSY: 1
{ "name": "open on a visible tradeoff",
  "slug": "autopsy-be9cdf8f…", "visibility": "shared",
  "curatorStatus": "proposed", "workspaceId": null }
```

Failure scenario: one creator pastes one third-party video. From that single item — no channel baseline, no outlier ratio, no verification, n=1 — a shared, workspace-null proposal enters the curation queue whose `sourceReferences`/`evidenceEntries` (`respin/packages/db/src/frameworks.ts:1568-1576`) point at a `profile_private` `trend_item` that **no other workspace, and no curator outside that workspace, can read**. R-94 rests the whole control on human curation; the human is handed a citation they cannot open. R-96 records nothing about this, and the private-claim test at `respin/packages/db/tests/system-spend.test.ts:697` stops one assertion short — it checks `autopsies.rightsScope` and system-usage anonymity but never counts `frameworks`, while the shared test one screen down (`:820`) does.

**Fix**: gate the call on `cacheClaim.rightsScope === "shared_analysis"` — or record an owner decision that private pastes may propose, and in either case add the `frameworks` assertion to the private test so the choice has a witness rather than a silence.

*(The isolation half of this overlaps `respin-tenancy-reviewer` and `respin-compliance-reviewer`; I'm flagging and deferring that. The measurement half — unverified n=1 material entering a learning surface with an unresolvable evidence pointer — is mine, and it fails.)*

### CHANGE 2 — "No channel baseline — pasted reference" is **typed**, not derived; a measured item renders it and its own ratio on the same page

`respin/app/(product)/trends/page.tsx:176` · `respin/packages/db/src/trends-storage.ts:1223-1232`

`pastedReferencesForProfile`'s population is *"profile_private items under a submitted source"* — there is no `baseline_state` predicate, and `PastedReference` does not carry the column at all. `pastedStateFor` then stamps `outlier: null, baselineState: "unavailable", saturation: null` unconditionally.

**Verified by running code**: a `measured` profile-private item under a submitted source (a shape the codebase itself builds — `respin/packages/db/tests/system-spend.test.ts:142` and `pasted-reference.test.ts:358`) yields

```
MEASURED ITEM IN PASTED SECTION: true
reader carries baselineState? false
ranked feed ids: [ '01a066f7-…' ]        SAME ITEM IN BOTH SURFACES: true
feed projection outlierRatio: [ '2.00000000' ]
```

so one item renders as "Outlier ratio 2.00x against a 100 baseline from 2 recent items…" in the feed and "**No channel baseline — pasted reference**" in the section above it. No production writer creates that shape *today*, which is why this is CHANGE and not BLOCK — but the honesty claim is asserted by the page instead of read from the record, and the M7 witness uses `toContain` (`pasted-reference.test.ts:374`) so it cannot see the extra row.

**Fix**: add `eq(trendItems.baselineState, "unavailable")` to the reader's predicate *and* carry `baselineState` on `PastedReference` so the line is derived; tighten `:374` to `toEqual`.

### CHANGE 3 — "credits returned" is printed for a claim that was never charged

`respin/app/(product)/trends/pasted-references.tsx:106-116` · `respin/app/(product)/trends/page.tsx:146-149`

`submitPastedReference` writes **no** debit row when the active document prices `creditCosts.autopsy` at 0 (`respin/packages/credits/src/pasted-reference.ts:272`, `if (existingDebit === null && cost > 0)`) — a state the schema admits (`respin/packages/config/src/schema.ts:14`, `min(0)`) and the code elsewhere explicitly anticipates (`pasted-reference.ts:160-166`). On park, `settleParkedAutopsies` correctly appends nothing (`:357`, `if (debit === null) continue;` — it even has its own green test, *"a parked claim that was never debited (a zero-priced document) settles to nothing rather than inventing a credit"*). But `creditsReturnedFor` then returns `null`, which the card renders as the **refunded-on-an-earlier-load** branch: *"Could not be completed — credits returned … What this paste charged has been returned to your balance."*

The ledger holds neither a debit nor a refund for that claim. The `null` sentinel collapses three different realities — refunded earlier, refunded among several this load, and never charged at all — into one sentence that asserts a return. `tests/trends-page.test.tsx:392-429` covers the first two and the pause case; the third is absent.

**Fix**: have `settleParkedAutopsies` return the claim ids it found with no debit, and render "nothing was charged for this attempt" for those.

### CHANGE 4 — the pause deferral is inferred from the paste **quote**, which answers a different question

`respin/app/(product)/trends/page.tsx:292`

`refundDeferred = !quote.allowed.ok && quote.allowed.reason === "paused"`. But `pastedReferenceQuote` orders its reasons **tier first** (`respin/packages/credits/src/pasted-reference.ts:144-148`): a workspace that is *both* free-tier and paused reports `reason: "tier"`. Free-with-an-open-pause is reachable — `getWorkspaceBillingState` resolves `tier: "free", reason: "unmapped_price"` whenever a live subscription's `stripePriceId` is missing from the document's `stripePriceMap` (`respin/packages/credits/src/state.ts:232-238`), independently of `pause_periods`.

Scenario: an admin config append drops a price mapping while a paid workspace with a parked autopsy is paused. `settleParkedAutopsies` defers (`pasted-reference.ts:346-348`, returns `[]`), the quote says "tier", `refundDeferred` is false, and the creator is told the credits **have been returned** when they have not. The two facts are read from different sources; only one of them is the settlement.

**Fix**: return `deferred: true` from `settleParkedAutopsies` and read it, rather than reconstructing it from a screen quote.

### CHANGE 5 — the stored reason misnames why saturation is absent, and it ships in the creator's export

`respin/packages/db/src/trends-storage.ts:307` · CHECK at `respin/packages/db/src/trends-schema.ts:170`

The writer stamps `saturation: "unmeasured", saturationUnmeasuredReason: "incomplete_provenance"` on every pasted item, and its own comment concedes why: *"an item with no population is `unmeasured` with the one reason the CHECK admits"*. The provenance of a pasted reference is complete — there is no *population*. 0026 relaxed eight baseline columns and did not touch this vocabulary.

**Verified by running code** — the creator's JSON export carries it:

```
EXPORTED trend_items[0]: { "baselineState": "unavailable",
  "saturation": "unmeasured", "saturationUnmeasuredReason": "incomplete_provenance" }
```

This is slice 5's finding recurring: an absence attributed to the wrong cause. **Fix**: extend the CHECK's reason set with `no_population` and stamp that for `baseline_state = 'unavailable'`.

### CHANGE 6 — the claims-canon sweep's population is a hand-written list guarded by a count

`respin/tests/trends-ui.test.tsx:238-285` and `:538-544`

`RENDERED_STATES` is enumerated by hand; its only totality guard is `expect(RENDERED_STATES.length).toBeGreaterThanOrEqual(41)`. It happens to cover all six `PastedReferenceState` kinds and all three `PasteActionState` statuses **today** — I checked each — but a seventh state kind joins the union, the type-checker stays green, the count assertion stays green, and the new copy is never swept. Slice 6's and slice 7's round-1/2 BLOCKs were this class. The neighbouring source scan at `:828` gets this right (`readdirSync` over the whole directory) — the state sweep should too.

**Fix**: derive the set from the discriminant kinds (a `Record<PastedReferenceState["kind"], …>` map, or assert set-equality against the kinds parsed from the source) so an unswept state is a red test.

### CHANGE 7 — this session's server-side copy move narrowed which refusal words get swept

`respin/app/(product)/trends/actions.ts:212` · `respin/tests/trends-ui.test.tsx:246-249`

The refusal copy now travels as data (`copy: BILLING_ERROR_COPY[code]`) — the resolution is correct and `paste-state.ts:44-62` argues it well. But the honesty sweep over *rendered* copy still enumerates 7 codes, while the action can return **any** `BillingErrorCode` its `catch` classifies (that is the docblock's own claim). `BILLING_ERROR_COPY` as a whole is swept only for the entitlement-price class (`respin/tests/billing-ui.test.tsx:1536`), never against `FORBIDDEN_CLAIMS`/`PERFORMANCE_CLAIMS` — `billing-ui.test.tsx` does not import `tests/support/forbidden-claims.ts` at all.

**Fix**: one `it.each(Object.keys(BILLING_ERROR_COPY))` sweeping `title + detail` against the canon. That is the population, and it is already derivable.

### NOTES

- `respin/app/(product)/trends/trends-view.tsx:253-259` — the no-baseline line renders only in the `else` of `item.outlier`. Precedence, not mutual exclusion: a row carrying both would show the ratio and suppress the honest line. Unreachable while the page hardcodes `outlier: null`, but the guard belongs on `baselineState`.
- `respin/app/(product)/trends/pasted-references.tsx:81` — for a `failed` claim, `displayClaimStatus` (`trends-storage.ts:1200`) returns `retrying` with `attemptCount` = the attempt that **just failed**, so "Retrying — attempt 2 of 5" names the finished attempt, not the running one. The **ceiling is honest**: `AUTOPSY_ATTEMPT_CODE_CEILING` is genuinely the parking threshold (`system-spend.ts:196`), not a display-only constant, and no config path tightens it.
- `respin/packages/db/src/trends-storage.ts:1212-1216` — the "unbounded is safe because `REFERENCE_COUNT_MAX` is 50" argument doesn't hold for the population the reader actually selects (CHANGE 2), nor for a paste re-stored after its input cascaded away (`:1146-1150`), which mints a second reference input for the same item.
- Manifest provenance: `docs/plans/respin-finish-phase-6.md` and `respin-finish-phase-7.md` are labelled **"new in 8c"** but exist at `cc3ed43` and changed by one line each. Hashes are right; the status column is not.

---

## Checks run

1. **Sole emitter (L1)** — n/a, verified not vacuous. `promotion_proposals` does not exist anywhere in the Respin tree (grep over `*.ts`/`*.tsx`/`*.sql`), and this diff creates no proposal path. The shared-framework proposal path is a *different* surface and is finding 1.
2. **Minimum n (L2)** — n/a for brain proposals (M5/slice 9). **Fails** for the shared framework library: the effective n is 1 by design (R-94, no strength threshold) and 8c widened its input population — finding 1.
3. **Unverified never learns (L2)** — holds for voice inference: `respin/packages/credits/src/infer-voice.ts:181` filters `input_class` in SQL (`ownPostsNewest`), so a pasted third-party transcript cannot ground a voice document. **Fails** for the framework queue — finding 1.
4. **No pooling, no collapsing (L3)** — n/a. No paid/organic series and no reach/conversion surface in this slice. The feed's ordering score (`trends-storage.ts:790-793`) is rank-only and never rendered; pasted items are excluded from it by a control (`:784`) with a non-vacuous witness (`pasted-reference.test.ts:350`, which I ran green).
5. **Own baseline, stated exclusions (L4)** — holds at the database: migration 0026's `trend_items_baseline_state_shape` verified **by execution**, column by column, in both directions, with every measured row still held to `trend_items_baseline_provenance` and `trend_items_outlier_ratio_matches_inputs` verbatim. Falls short at the screen and the export — findings 2 and 5.
6. **Declared metric (L5)** — n/a. No north-star metric surface here; no composite/engagement score on any rendered state.
7. **Approval writes (L6)** — n/a for brain docs. The one page-load write is `settleParkedAutopsies`, named as such at `page.tsx:6-12` and ordered before the read (witnessed `trends-page.test.tsx:275-289`).
8. **Two claims (L7)** — holds. `docs/plans/respin-finish-master-plan.md:185` marks 8c in progress with no walk claimed; `respin-finish-phase-8c.md:62-70` leaves every verification box unticked including the browser walk; `respin-finish-phase-8.md`'s new status line separates engineering completion from the named outstanding evidence; the slice 6/7 cards' additions only point at the unrun walk procedure. **No document in this diff claims the vendor walk ran.**
9. **Number provenance** — holds mostly. Price is `content.creditCosts.autopsy` read under the lock (`pasted-reference.ts:255-258`), seeded at 4 (`respin/packages/db/src/seed.ts:51`), never a literal; the two form limits arrive as props; the ceiling is the R-93 constant; the derived directory scan (`trends-ui.test.tsx:828-858`) proves no screen file types a price or a limit, each pattern with a planted specimen. The two claim-shaped numbers/absences in findings 3 and 5 are not re-derivable from an artefact.

## Coverage

- **Read fully**: `pasted-references.tsx`, `paste-state.ts`, `page.tsx`, `trends-view.tsx`, `actions.ts`, `0026_lazy_vector.sql`, `packages/credits/src/pasted-reference.ts`, `decisions.md` R-96/R-97/R-98, `respin-finish-phase-8c.md`, the 8c manifest.
- **Read in the parts that matter**: `trends-storage.ts` (writers, feed reader, intake, pasted readers, projection), `trends-schema.ts` (CHECKs), `system-spend.ts` (attempt lifecycle, finalize), `frameworks.ts` (candidate preparation), `billing-errors.ts` (paste codes + `unknown`), `safe-log.ts`, `infer-voice.ts`, `traceability.ts` / `pipeline.ts` / `assemble.ts` diffs, `tests/trends-ui.test.tsx`, `tests/trends-page.test.tsx`, `tests/billing-ui.test.tsx`, `packages/db/tests/pasted-reference.test.ts`, `packages/db/tests/system-spend.test.ts`, `packages/modes/tests/spin-reference.test.ts`.
- **Skimmed**: `paste-panel.tsx`, `bundle.ts`, `creator-data-registry.ts`, `migration-shape.test.ts`, `export.test.ts`, the new `phase-6.md`/`phase-7.md`.
- **Not reached**: `pnpm-lock.yaml`, `eslint.config.mjs`, `0027_curious_paper_doll.sql` and `billing-schema.ts` (money's gate owns the rule; I checked only that the numbers they produce are displayed honestly — findings 3 and 4), the two Docker suites, `profile-cage.test.ts`, `packages/trends/src/sources.ts`.

**Commands run**
- SHA-256 over all 166 manifest paths, twice — 0 mismatches each time.
- `npx vitest run packages/db/tests/pasted-reference.test.ts packages/db/tests/migration-shape.test.ts` → **66 passed**, including the exhaustive per-column CHECK case (execution evidence for check 5's database half).
- `npx vitest run tests/trends-ui.test.tsx tests/trends-page.test.tsx tests/trends-actions.test.ts packages/credits/tests/pasted-reference.test.ts packages/modes/tests/spin-reference.test.ts` → **250 passed**.
- Three read-only probes (scratchpad only, no repo file created or edited), run with `npx tsx` against in-process PGlite with the committed migrations:
  1. printed the measured private item appearing in **both** the pasted section and the ranked feed with `outlierRatio 2.00000000` (finding 2);
  2. printed the exported `trend_items` row's `saturationUnmeasuredReason: "incomplete_provenance"` for a real paste (finding 5);
  3. drove `intakePastedReference` → `startAttempt` → `finalizeAttempt` and printed the resulting **shared, workspace-null, proposed** framework row (finding 1).

**Verified by running code**: findings 1, 2, 5 and check 5's database half. **Verified by reading**: findings 3, 4, 6, 7 and all four notes — 3 and 4 rest on branch conditions I read but did not drive to a rendered screen.

## Verdict

**BLOCK**

One unverified, baseline-less, single-item, profile-private record reaches a shared learning surface as an evidence-bearing proposal whose citation its human authority cannot open — introduced by this diff's reachability change, recorded in no decision and asserted by no test in either direction.

**Least-confident line:** that finding 4's free-tier-with-an-open-pause state is reachable in practice. I proved the *code* takes that branch (the quote's tier check precedes its pause check, and `unmapped_price` resolves a live subscription to `free`), but I did not construct the billing state end to end, and it is possible some webhook invariant I did not read closes an open `pause_periods` row before a price mapping can go missing. The structural point survives either way: the page reconstructs a money fact from a screen quote instead of from the settlement that produced it.
