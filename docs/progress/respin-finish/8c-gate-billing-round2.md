# Respin billing & credits — slice 8c, ROUND 2 (Full gate, final round)

**Readiness: Almost · Grade: B+ · Every money statement I could make false in round 1 is now true when I run it; what is left is two comments that promise more than the code does.**

**Verdict: NEEDS CHANGES** · 0 BLOCK · 2 CHANGE · 2 NOTE · 1 accepted deferral carried forward.

**Scope**: the 173 files of [`8c-review-manifest-round2.md`](8c-review-manifest-round2.md), billing subset, with the **39 round-1 fix-pass files as primary scope**. Main tree at `cc3ed43` + uncommitted state; no worktree. **Hashes verified before AND after: 173/173 match both times, zero mismatches.** No repo file was touched by this review; every probe, mutant and config lives outside the repo in the session scratchpad. The working tree carries the same 164 `respin/` entries before and after, and every path in it is in the manifest (I diffed the two sets — zero unlisted files).

Out of scope and untouched by this diff: `src/`, `cutdown/`, `docs/initial.past/`, `docs/video-editing/`.

---

## 0. What I verified by RUNNING, not reading

| # | Claim | Result |
|---|---|---|
| 1 | The entry gate reproduces on this exact tree | **147 files / 3780 tests / 0 failed / 0 skipped, exit 0**, CI shape, `TEST_DATABASE_URL` live against the Docker Postgres, 194s. Matches `entry-gate-slice-8c-fixpass.txt`. |
| 2 | C1 / my CHANGE 4 — the lost refund | **Returned.** PROBE B2, real Postgres: balance `100 → 96 → 100`, one `autopsy_refund` row for the parked claim, while the display projection was showing a DIFFERENT claim (`displayClaimStatus:"pending"`, `displayShowsOldClaim:false`) — so the case is non-vacuous. |
| 3 | The new reader cannot reach outside the minted pair | **Confirmed.** PROBE SCOPE: two profiles in ONE workspace, one parked claim each; `parkedAutopsyClaimsForProfile` returns exactly its own, and A's settlement refunds only A's. |
| 4 | C2 / my CHANGE 2 — the pause deferral | **Fixed.** PROBE F2: settlement `deferred:true` while `pastedReferenceQuote` says `{ok:false, reason:"tier"}` on a `free` tier. The exact state that printed "credits returned" over an empty ledger in round 1. |
| 5 | C6 / my CHANGE 3 — `replayed` vs "already queued" | **Fixed.** PROBE I: re-paste onto a settled parked claim → `claimStatus:"parked"`, `replayed:true`, `charged:0`, `debits:1`, `refunds:1`, balance back to 100. |
| 6 | C7 / my CHANGE 6 — the mutant that survived round 1 | **Now reddens.** I re-planted my exact round-1 mutant (`replayed: creditsChargedNow === 0`) against an aliased copy: **1 failed / 37 passed** at `pasted-reference.test.ts:276`. Round 1 was 34/34 green with the same revert. |
| 7 | The four fix-pass mutations the builder claims | **All red, measured.** M-A (population reverted) → 1 red; M-B (`deferred` inverted) → 2 red; M-C (never-charged skipped) → 1 red; M-F (`claimStatus` constant) → 1 red. Control through the same alias path: 38/38 green. |
| 8 | The C4 rider drives the guard rather than snapshotting it | **Confirmed.** M-E: I replaced `pointsAtDebit` with a true per-debit predicate (M6's fix, simulated) and `ledger.test.ts:211` went **red** (1 failed / 24 passed); the unmutated copy through the same alias is 25/25 green. |
| 9 | The consolidator's caller census (its own least-confident line) | **Re-run independently, and it holds.** `refundCredits` has exactly one production caller — `packages/credits/src/pasted-reference.ts:425`. I grepped ALL file types under `respin/` (excluding `node_modules`, `.next`), and separately every `import(` in `packages/*/src`, `app`, `worker`, `lib`, `scripts`: the only dynamic imports in the tree are `packages/db/src/testing.ts` (pg / drizzle / migrator) and two TYPE-position `import("./spin-state")` in `trends-view.tsx`. `refundCredits` is **not** bound on `packages/credits/src/app-server.ts`. **No hidden caller ⇒ not a BLOCK.** |
| 10 | Migration 0028 does not touch money | **Confirmed on the live database.** `credit_ledger` carries the same 9 constraints and 10 indexes, including `credit_ledger_autopsy_claim_uq` and `credit_ledger_autopsy_refund_uq` (partial uniques on `(ref_type, ref_id)`) and the `credit_ledger_autopsy_ref` CHECK. `pnpm db:check` → *Everything's fine*. |
| 11 | `neverChargedClaimIds` absorbs a missing debit | **Reproduced.** PROBE G: delete the claim's `autopsy_claim` debit row and the settlement reports `neverChargedClaimIds:[claim]` — the screen would then say "nothing was charged" about a claim that was. Severity judged in NOTE 3. |
| 12 | A zero-priced DUPLICATE paste reports `replayed:false` | **Reproduced.** PROBE H: both presses `{replayed:false, charged:0, claimStatus:"pending"}`, `sameClaim:true`. |
| 13 | `refundedClaimIds` ordering | **Claim-creation order.** PROBE J: `[first, second]` in paste order. No production consumer depends on it (see below). |

---

## 1. My six round-1 findings — closed or not, and how I know

| # | Round-1 finding | Status | How I determined it |
|---|---|---|---|
| 1 | `ledger.ts` over-refund guard is per-SPELLING and the docblock said the opposite | **PARTIAL — by arbitration, and the rider is real** | RAN: M-E turns the rider test red, so it drives the guard (item 8). RAN: my own caller census (item 9) confirms the reachability claim the CHANGE grade rests on. READ: `ledger.ts:214-249` now states the limitation, names M6 as owner and the second caller as trigger; `ledger.ts:290-296` says what the code does. See §3 for my judgement on the rider. |
| 2 | The page re-derived the pause deferral from the quote | **RESOLVED** | RAN: PROBE F2 (item 4) — the round-1 state now reports `deferred:true`. RAN: M-B/M-C red (item 7). READ: `page.tsx:194-202` reads `settlement.deferred` / `.neverChargedClaimIds` and consults the quote for nothing but price/balance/allowed (`page.tsx:234-242`). |
| 3 | `replayed` was the wrong sentence for "already queued" | **RESOLVED** | RAN: PROBE I (item 5); M-F red (item 7). READ: `paste-panel.tsx:302-333` switches on `claimStatus` with an exhaustive `never`; `parked` and `completed` get their own copy and never reach the "Already queued" line. I checked the grouping too: `failed` sits with `pending` **correctly**, because `systemAutopsyQueueCandidates` (`system-spend.ts:105`) selects `["pending","failed"]` — a failed claim really is still queued. |
| 4 | A parked debited claim became unrefundable once a second claim existed on its item | **RESOLVED** | RAN: PROBE B2 (item 2) and PROBE SCOPE (item 3); M-A red (item 7). READ: `trends-storage.ts:1323-1336` — same `ProfileScope.mint` and the same `(rights_scope='profile_private', profile_id, workspace_id)` triple as the display reader, plus `status='parked'`, ordered `(created_at, id)` ascending. I also traced the population it now covers: `profile_private` claims have exactly one writer (`claimPrivateAutopsyForSystem`, `trends-storage.ts:635`), called only from `intakePastedReference` (`:1092`, `:1113`), composed only by `submitPastedReference` — so the widened population is exactly the paste population and nothing else. |
| 5 | A settlement refusal takes down the whole `/trends` surface | **NOT FIXED — deferred, and I accept the deferral with one objection** | READ: `page.tsx:274-280` is unchanged; a `RefundSourceNeverExpiresError` still returns `<AccessRefusal>` for the entire page. The owner (M6 / operator-surface work) and trigger are stated in `8c-gate-code-review-round1.md` §4's Gate-C table — and **nowhere else**. See NOTE 4. |
| 6 | The `replayed` fix had no witness at the layer that implements it | **RESOLVED** | RAN: item 6 — my exact round-1 mutant now reddens `pasted-reference.test.ts:276`, which asserts both cases I named (zero-priced FIRST paste `replayed:false`; duplicate `replayed:true`). |

---

## 2. Findings

### ⚠️ CHANGE 1 — `respin/app/(product)/trends/pasted-references.tsx:22` · `parked_returned` has a fourth member the docblock does not name, and the copy is past-tense about it

The comment reads: *"Both spellings assert a return that happened, which is true of both."* It names two members — refunded this load, refunded on an earlier load. There is a third: **a claim that becomes `parked` between the settlement and the pasted read.**

The settlement commits at `page.tsx:275`; the pasted references are read at `page.tsx:291`, in a separate transaction inside a later `Promise.all`. A claim the worker parks in that window is `parked` in the display and was not `parked` when the settlement looked. `pastedStateFor` (`page.tsx:193-203`) then finds `deferred === false` and no entry in `neverChargedClaimIds`, so it renders `parked_returned` with `creditsReturned: null` — i.e. `pasted-references.tsx:131`, **"Could not be completed — credits returned"**, and `:139`, *"What this paste charged has been returned to your balance."* Zero refund rows exist for that claim.

This is the residue of round-1 CHANGE 2's own class. That fix closed the **precedence** instance (tier-before-pause) and the comment at `page.tsx:303-311` correctly retires it. It did not close the **ordering** instance, which the same comment names in passing ("a pause ending between the settlement above and the quote… flips it the same wrong way") without noticing that the parked transition does the same thing to a different flag.

It self-heals: the next load settles the claim and the sentence becomes true. So the **money is right** and only the sentence is wrong, for one render. It is still a false money statement on a screen, which is the exact thing this lane rejected twice in round 1.

**Determined by reading**, not by racing the worker: `page.tsx:193-203`, `pasted-references.tsx:126-141`, and `tests/trends-page.test.tsx:459-462`, which renders precisely this branch under the label "Refunded on an EARLIER load".

**Fix (one line, or three):** correct the docblock to name the fourth member — or, properly, have `settleParkedAutopsies` return the parked claim ids it EXAMINED, and give a displayed parked claim outside that set its own "settling on your next load" copy. The second is the same shape as the `deferred` fix and closes the class instead of the instance.

### ⚠️ CHANGE 2 — `respin/app/(product)/trends/paste-state.ts:52` · `replayed`'s app-side docblock restates the meaning the round-1 fix replaced

`/** \`true\` when the paste landed on an existing claim and charged nothing. */`

**Measured false** (PROBE H, real Postgres). Under a document pricing `creditCosts.autopsy` at 0, the second press of the same URL + transcript lands on the same claim (`sameClaim:true`) and reports `replayed:false`. The paste landed on an existing claim; `replayed` is false.

The credits-side docblock has it right — `pasted-reference.ts:173-178`: *"IT IS THE DEBIT'S EXISTENCE, NOT THE INTAKE'S IDEMPOTENCY."* Two docblocks about one field, one of them stating the property the round-1 fix deliberately removed. CLAUDE.md 2026-07-30: a comment claiming a property is not the property.

**Fix:** one line — restate it as the credits side does (`true` exactly when the ledger already held this claim's `autopsy_claim` debit).

#### The owner question you asked, answered

*"A zero-priced duplicate paste reports `replayed: false`… the builder assigned no owner. Assign one or tell us it does not need one."*

**The behaviour needs no owner. The comment does, and it is this slice's.**

I traced every consumer of `replayed`. There is exactly one: `paste-panel.tsx:320`, inside the `pending | failed` branch of a switch on `claimStatus`. In the `parked` and `completed` branches `replayed` is never read. So the zero-price duplicate renders `paste-panel.tsx:326` — *"Queued for autopsy. 0 credits charged. Balance: N."* — about a claim that is `pending` and cost nothing. **Every clause of that sentence is true.** What the creator does not learn is that they had already pasted it, which is a courtesy, not a false statement, and it exists only under a configuration nobody has shipped (`CONFIG_V1_SEED` prices `autopsy` at 4, and `pasted-reference.test.ts:158` pins the seed above zero so the money witnesses are non-vacuous).

Making the intake report which branch it took is a real improvement and a real cost (a new field on `PastedReferenceIntakeResult`, through the facade, through the action, into a client union). I would not spend it now. What must not stand is a docblock asserting the field means something it does not — that is CHANGE 2, and it is a one-line edit in this slice.

### 💡 NOTE 3 — `respin/packages/credits/src/pasted-reference.ts:419-421` · `neverChargedClaimIds` is a derived population, and the derivation should be written down where a new writer will read it

The builder's own weakest bet, and it is real: I reproduced it (PROBE G). Delete a claim's `autopsy_claim` debit row — a hand-run repair, a future writer that forgets the debit — and the settlement reports the claim as never-charged, and the screen says (`pasted-references.tsx:155,157`) *"nothing was charged"* / *"your balance is untouched"* about a claim that **was** charged. The result carries nothing that separates the two.

I judge this a NOTE rather than a CHANGE, and the reason is a guard that already exists rather than an argument:

- Today the derivation is exact. `profile_private` claims have one writer (`trends-storage.ts:635`), reachable only through `intakePastedReference`, composed only by `submitPastedReference`, which debits unless the price is 0 — so "no debit" really is "priced at 0". I traced the whole chain rather than assuming it.
- A new writer cannot appear silently: `tests/table-writers.test.ts:488-493` enumerates every writer of `autopsy_cache_claims` by file and verb, and an unregistered one fails a red test.
- No better discriminator exists without a new column. Naming the population is the cheap and correct move (CLAUDE.md 2026-08-29 — "state the population as a LIST, and adding to it is what a new path costs").

**Ask:** the registry entry at `table-writers.test.ts:490` should carry the MONEY invariant, not only the scoping one — *"a `profile_private` claim exists only inside `submitPastedReference`'s transaction and carries an `autopsy_claim` debit iff the active document priced it above 0; `settleParkedAutopsies.neverChargedClaimIds` asserts exactly that."* Then the next author registering a writer is told what the screen is saying on their behalf.

### 💡 NOTE 4 — the two deferrals are recorded in a review report, not in the register that exists for them

`docs/progress/respin-finish-open-items.md` opens with a counter (`Deferred with an owner **3**`) and a `## Deferred` section. Neither the C4 structural fix (per-debit refund budget, owner: M6's admin refund surface, trigger: the second caller of `refundCredits`) nor C9 (contain the settlement refusal, owner: M6 / operator-surface work) is in it. Both live only in `8c-gate-code-review-round1.md` §4's Gate-C table.

C4 survives that, because its owner and trigger are also written in the code the fix would change (`ledger.ts:242-248`) and in the title of the test that turns green (`ledger.test.ts:211`). **C9 has neither** — and `page.tsx:269-272` argues that the whole-page refusal *is* containment ("shown, logged by code, never swallowed"), which reads as a settled design choice rather than a known deferral with an owner. A reader of `page.tsx` is told the opposite of what the Gate-C table says.

**I disagree mildly with the C9 deferral itself** and record the disagreement rather than re-litigating it: rendering the page and putting the owed-refund banner in the pasted-references section is a smaller change than the bookkeeping the deferral now needs. I accept it because the trigger is honest — the refusal needs a positive `adjustCredits` with no expiry, which has no app-reachable caller (I re-checked: `refund_source_never_expires` is unreachable from the paste path because free-allowance and grant lots all carry an expiry). I drove PROBE K to try to reach it through a mixed-lot settlement and could not: FIFO consumed the expiring grant first and both claims refunded cleanly.

---

## 3. Judging the C4 rider: does a test that pins a KNOWN-WRONG behaviour entrench it?

**No — because I measured that it is coupled to the fix, not to the defect.** The distinction between a tripwire and a snapshot is not a matter of taste and does not have to be argued: a snapshot stays green when you fix the code, and a tripwire goes red. I planted M6's fix (`pointsAtDebit` made a true per-debit predicate) and `ledger.test.ts:211` went **red**, 1 failed / 24 passed, with the control at 25/25. So the test *forces* the M6 author to open it, read the two `expect`s marked `// <- M6:`, and invert them. That is the correct instrument for a deferral, and it is strictly better than deleting the finding and trusting a document.

Two things it does not do, stated plainly:

1. **Nothing expires it.** The test will sit green and correct forever if M6 never ships. That is what NOTE 4 is about: the deferral needs a home in the open-items register, where a stale entry is visible, rather than only in a test title and a round-1 report.
2. **It pins the mint as a fact, in a suite that otherwise pins invariants.** A reader skimming `ledger.test.ts` sees `expect(refunds).toHaveLength(2)` and `balance 104` against a 4-credit debit. The title carries `KNOWN LIMITATION (owner: M6's admin refund surface)` and the 20-line comment above it is unambiguous, so I do not think this misleads — but it is the one place I would accept an argument the other way.

**The rider's other two parts landed and are correct.** `RefundParams.ref` (`ledger.ts:214-249`) no longer claims a per-debit budget; it states the opposite, names the reproduction, names `refType`/`refId` as the reason it cannot be patched in place, and names owner and trigger. The inline comment at `ledger.ts:290-296` says what `pointsAtDebit` does rather than what it was supposed to do. The round-1 CLAUDE.md 2026-07-30 violation is closed.

**And the census that makes it a CHANGE and not a BLOCK holds under my own search** (§0 item 9), including the class the consolidator flagged as its least-confident line — a dynamic import or a caller outside the four roots it grepped. There is no such caller: I searched every file type in the tree and every `import(` call site, and `refundCredits` is not on the app facade.

---

## 4. Checks run

- **1 · Append-only ledger, derived balance (B1)** — ✅ holds. No stored balance column anywhere in `packages/db/src/*.ts` (scanned for `balance` beside a column constructor or an `UPDATE … SET`; zero hits). `balance.ts`, `fold.ts`, `clock.ts`, `pause.ts`, `state.ts` are **byte-unchanged vs HEAD** (`git status` empty for all five). The debit references its generation-equivalent (`refType:"autopsy_claim"`, `refId:<claim id>`, `pasted-reference.ts:278-285`); the compensating credit names its source kind (`kind:"refund"`, `refType:"autopsy_refund"`, `ledger.ts:340-344`). Balance is `deriveBalanceInTx` inside the debit's own transaction (`:264`, `:288`).
- **2 · Idempotency (B2)** — ✅ holds / n/a for Stripe. `packages/credits/src/stripe/**` is unchanged vs HEAD (`git status --untracked-files=all` lists no file under it), so no webhook path moved and the M1 double-delivery / grace / debit-at-zero set is untouched — I re-ran it as part of the 3780 (the `D-AUDIT-1`, `audit #3` and `round-10` suites are in the tail of the run). The new money path is not webhook-driven; its key is the claim id, enforced by the workspace advisory lock and, underneath, by `credit_ledger_autopsy_claim_uq` / `credit_ledger_autopsy_refund_uq`, both **confirmed present on the live database** by name.
- **3 · Debit in-transaction (B3)** — ✅ holds, proven by mutation in round 1 and unregressed here: `pasted-reference.test.ts`'s M1 atomicity witness is green in the control (38/38) and the debit is still written on the same `tx` the intake was composed on (`:269-285`). Insufficient balance refuses at `:265-267`, before `intakePastedReference`, so before any row and before the worker can ever be handed the claim. No path completes a generation unmetered: the claim only exists if the debit committed with it.
- **4 · Expiry and pause (B4)** — ✅ holds, and the screen now agrees. Pause defers settlement inside the settlement's own transaction (`:410-412`), the refund inherits the consumed lot's expiry (`ledger.ts:276-303`, witnessed), and `refundCredits` refuses to date a refund off a frozen clock (`ledger.ts:326`). RAN PROBE F2 for the round-1 screen defect. I also checked the "pause that never ends" worry and closed it: the subscription-death writers call `ensurePauseEnded` (`stripe/webhooks.ts:179`), which closes the open period, so a cancelled-while-paused workspace still settles — and settlement has no tier gate, so a workspace that has fallen to Free still gets its money back.
- **5 · Config, not code (B5)** — ✅ holds. `PASTED_REFERENCE_CREDIT_COST_KEY = "autopsy" satisfies keyof RespinConfigV1["creditCosts"]`; the price is read from the ACTIVE STORED document inside the debit's transaction (`getActiveConfigRequiringStored`, `:260`) and its version is stamped on the row (`:284`). The refund is the ORIGINAL debit's amount, not today's price (`:424`) — witnessed. No literal price in `pasted-reference.ts`, `paste-panel.tsx` or `pasted-references.tsx`. R-95's closure entry in `decisions.md` moves the tracked-niche allowance out of code into `trackedNiches` and deletes `TIER_TRACKED_NICHES` — I confirmed the symbol is gone from the tree.
- **6 · Tier gates (B6)** — ✅ holds, unchanged. `PASTED_REFERENCE_TIERS` is derived from `ENTITLEMENT_TIERS` minus `free` (`:111-113`) and pinned equal to the vocabulary. Free is the default state (no subscription row), refused before any row, with copy that names the plan and matches `/upgrade|buy|subscribe/i` nowhere. A viewer is refused by the mint's role (`:241-243`). Settlement deliberately has no role gate — it returns the workspace's own money — and that is argued in the docblock and witnessed.
- **7 · Threshold provenance** — ✅ holds. Every number in the changed money code is a config read or a named constant: `AUTOPSY_ATTEMPT_CODE_CEILING` for the "of 5", `POST_CONTENT_MAX` / `PASTED_REFERENCE_TITLE_MAX` for the two ceilings, `creditCosts.autopsy` for the price. R-98 in `decisions.md` carries the money rule and its revisit trigger; R-99, R-96, R-97 and R-95's closure are all appended with owners. No uncited threshold in the diff.
- **8 · Money paths are tested (B7)** — ✅ holds. Six mutations planted against aliased copies outside the repo, **all six red**, against a 38/38 green control through the same alias path: M-A, M-B, M-C, M-F, M-E and my own round-1 survivor. That last one is the load-bearing result — the same two-line revert that survived 34 green tests in round 1 now fails a named case. New coverage is real, not decorative: three two-workspace isolation cases for `submitPastedReference` / `settleParkedAutopsies` / `pastedReferenceQuote` with explicit non-vacuity assertions (`isolation.test.ts:1561-1660`), and page-layer cases that name the exact false sentence they forbid (`trends-page.test.tsx:473-519`).

## 5. The four things you asked me to attack

1. **`neverChargedClaimIds`, the builder's weakest bet.** Reproduced (PROBE G). Judged a NOTE, not a CHANGE, and the reason is the existing `table-writers` registry rather than an argument — see NOTE 3, which also says why no better discriminator exists and what to write down instead.
2. **The zero-priced duplicate reporting `replayed:false`.** Reproduced (PROBE H). **It needs no owner as a behaviour** — every clause the screen prints is true, because `replayed` is only read in the branch where it is harmless. It needs a one-line comment fix in this slice (CHANGE 2). Full reasoning in §2.
3. **`refundedClaimIds` ordering.** Confirmed changed to claim-creation order (PROBE J) and confirmed **no consumer depends on it**: the only two readers are `page.tsx:147-148` (`ids.length === 1 && ids[0] === claimId`) and `page.tsx:199` (`.includes`), both order-independent. I grepped `app`, `packages/*/src`, `worker` and `lib` for `refundedClaimIds` / `neverChargedClaimIds` / `creditsReturned` — those are the only production hits.
4. **Migration 0028.** Read in full, including the 100-line header. It DROPs, UPDATEs and re-ADDs `trend_items_saturation_measurement_nonempty` on `trend_items` and nothing else — no column, no index, no table, no FK, and no ledger object of any kind. Confirmed against the live database that `credit_ledger`'s 9 constraints and 10 indexes are exactly the pre-0028 set, and `pnpm db:check` is clean. **Nothing about it touches money or the ledger.** Its deploy-order and rollback caveats are honestly written and are the tenancy reviewer's lane.
5. **`packages/credits/tests/isolation.test.ts`.** The change is **real, not a workaround.** It registers `pasted-reference.ts` in the internal-module coverage map with its `viaIndex` surface, adds the three facade methods to `COVERED`, and adds three genuine two-workspace cases with named non-vacuity (B pasting the SAME URL and text gets its own claim and pays its own price; A's settlement cannot reach B's parked claim; a cross-workspace scope cannot even name B's profile). The two exemptions it adds are accurate and I checked both rather than reading their prose: `trackedNicheEntitlement` really is pure (`mode-access.ts:215-223`), and `trackedNicheEntitlementFor` really does compose the already-covered `getWorkspaceBillingState` plus a global `getActiveConfig` (`app-server.ts:553-560`). `ModeNotBuiltYetError` was removed from the map because the symbol no longer exists in the tree — I confirmed that.

---

## 6. Coverage

- **Read fully**: `packages/credits/src/pasted-reference.ts`, the `ledger.ts` diff and `refundCredits` in full, `packages/db/migrations/0028_light_mulholland_black.sql`, `app/(product)/trends/page.tsx` (money half), `.../pasted-references.tsx` (states + copy), `.../paste-state.ts`, `.../paste-panel.tsx`'s `SavedOutcome`, `.../actions.ts`'s `pasteReferenceAction`, `packages/db/src/trends-storage.ts:1240-1376` and `:1040-1160`, `packages/credits/tests/ledger.test.ts:170-267`, `packages/credits/tests/pasted-reference.test.ts` (R8/R9 blocks), `tests/trends-page.test.tsx:440-540`, the `isolation.test.ts` diff in full, the round-2 manifest, my round-1 report, and §§0-4 of the round-1 consolidating review.
- **Read in part**: `packages/credits/src/app-server.ts` (the three new binds + `trackedNicheEntitlementFor`), `packages/db/src/system-spend.ts` (`systemAutopsyQueueCandidates`, `finalizeAttempt`'s cache transition), `packages/credits/src/pause.ts` / `stripe/webhooks.ts` (pause-end on subscription death), `tests/table-writers.test.ts` (the `autopsy_cache_claims` registry), `tests/profile-cage.test.ts` (the new entry), `tests/trends-ui.test.tsx` (the state/copy matrices), `docs/initial/decisions.md` R-95 closure through R-99.
- **Not read**: the R-97 spin-prompt / traceability half and migration 0028's saturation semantics (compliance and tenancy lanes), `packages/modes/**`, `worker/**` (hash-verified unchanged since round 1), `packages/db/tests/pasted-reference.test.ts` beyond its `parkedAutopsyClaimsForProfile` block.
- **Commands run**:
  - SHA-256 over all 173 manifest files, **before → 0 mismatches**, **after → 0 mismatches**; plus a set-difference of the working tree against the manifest → **0 unlisted files**.
  - `pnpm -C respin db:check` → *Everything's fine*.
  - `psql` against the live Docker Postgres: `pg_constraint` and `pg_indexes` for `credit_ledger` (quoted in §0 item 10).
  - `vitest run packages/credits/tests/{ledger,pasted-reference,pasted-reference.docker,isolation}.test.ts packages/db/tests/pasted-reference.test.ts` with `TEST_DATABASE_URL` live → **5 files / 115 tests / 0 failed**, the Docker suite verified live rather than skipped.
  - **The full suite, CI shape, Docker live** → **147 files / 3780 tests / 0 failed / 0 skipped, exit 0**, 194s.
  - **8 probes** (B2, SCOPE, F2, G, H, I, J, K) against the real modules on real Postgres, outputs quoted above.
  - **6 planted mutations** (M-A, M-B, M-C, M-E, M-F, and my round-1 `replayed` revert) against aliased copies, each with a green control through the same alias path.
  - Every probe, mutant and vitest config was written **outside the repo**, under the session scratchpad. Nothing was created inside `respin/` or `docs/` except this report. The one artefact I left outside the repo is a directory junction `scratchpad/node_modules -> respin/node_modules`, needed for vitest to resolve its own config from the scratchpad; it reads the repo and modifies nothing.

---

## 7. Verdict

**NEEDS CHANGES** — 0 BLOCK, 2 CHANGE, 2 NOTE.

Four of my six round-1 findings are closed and I closed each one by executing, not by reading the fix: the lost refund comes back, the deferral is the settlement's own boolean, the parked re-paste says what it is, and the mutant that survived 34 green tests now fails a named case. The fifth is a deferral I accept with a recorded objection; the sixth is an arbitration whose rider I verified is a tripwire rather than a snapshot, on a census I re-ran myself. What remains is two comments that assert more than the code does — one of them about money, on a screen — which is the same class as round 1's first finding and costs two lines to close.

**Least-confident line:** whether CHANGE 1 deserves that grade. I established the state by reading the two reads and the branch they feed, not by racing the worker into the window between `page.tsx:275` and `page.tsx:291`, and I did not measure how often a claim is parked in that window — it may be vanishingly rare, and it corrects itself on the next load. If the answer is "rare enough", CHANGE 1 collapses into a docblock correction and this report is one CHANGE and three NOTEs. What I am confident of is that the sentence is reachable and false while it lasts, and that the docblock currently says it cannot be.
