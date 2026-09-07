# Consolidating code review — slice 8c, round 1

**Reviewer:** `code-reviewer` (generalist, consolidating) · **Verdict: BLOCK** · Readiness **Not yet · D**

**Readiness: Not yet · Grade: D · One hard integrity rule is wrong in both directions — an invented date reaches a creator under a sentence saying it was checked; 1 BLOCK, 15 CHANGE, 11 NOTE.**

**Scope**: the 64 slice-8c files in [`8c-review-manifest.md`](8c-review-manifest.md), read on the MAIN TREE at `cc3ed43` + uncommitted state, plus the four specialist reports. **Hashes verified before and after: 166/166 match both times, zero mismatches.** No repo file changed under this review; every probe and mutant I wrote lives outside the repo in the session scratchpad.

---

## 0. What I verified by RUNNING, not reading

Stated first because it is what this report rests on.

| # | Claim | Result |
|---|---|---|
| 1 | Entry gate reproduces on this exact tree | **147 files / 3505 tests / 0 failed / 0 skipped, exit 0**, CI shape, `TEST_DATABASE_URL` live, 293s. Matches `entry-gate-slice-8c.txt` exactly. |
| 2 | Compliance's `month-date` **fail-open** | **Reproduced.** Corpus `"I train 20 minutes a day and I started in June"`, hook `"The June 2019 rebuild is the one nobody films"` → `scanTraceability` returns **`[]`**. Control without the month word → `plain-number:flag:2019`. The month word *suppresses* the flag. |
| 3 | Compliance's `month-date` **false refusal** | **Reproduced.** Corpus and hook both containing `"March 2024"` → `month-date:hard:"March 20"`. |
| 4 | `[check]` cannot clear it | **Reproduced.** `"March 2024 [check]"` still fires; only `"March [check] 2024"` clears. |
| 5 | `offerCheck` corrupts the date | **Reproduced.** `offerCheck("We filmed this in March 2024", findings)` → `"We filmed this in March 20 [check]24"`. |
| 6 | `month-date` is the **only** failing shape | **Reproduced.** Round-trip (specimen in corpus → no hard finding) over all 7 `SPECIFIC_SHAPES`: 6 pass, `month-date` fails. |
| 7 | Compliance's proposed fix is correct | **Verified.** With `(?!\d)` added: scenario A now hard-refuses `"June 2019"`; scenario B clears; all 7 shapes round-trip clean; no regression on `March 20th, 2024` / `March 20, 2024` / `Sept 5` / `December 31, 1999` / bare `March` / `May 2024` / `May 5 2024`. |
| 8 | Billing's PROBE E (the mint) | **Independently reproduced** against the real `ledger.ts` on PGlite. One `-4` debit, **two `+4` refunds**, balance 225 → 229. `LEDGER: [grant +200, grant +25, debit -4 autopsy_claim/claim-1, refund +4 autopsy_refund/claim-1, refund +4 debit/<debitId>]`. |
| 9 | `refundCredits` has exactly one production caller | **Verified by grep over `packages/*/src`, `app`, `worker`, `lib`** — only `pasted-reference.ts:360`. No Stripe/webhook caller. This is what makes finding C4 a CHANGE and not a BLOCK; I checked it rather than accepting billing's word for it. |
| 10 | `sharedFrameworkLibrary` withholds `proposed` rows | **Verified.** `frameworks.ts:1334` `.where(and(eq(visibility,"shared"), recommendable()))`, and `recommendable()` (`:1312`) requires `curator_status = 'approved'`. |
| 11 | `pnpm-lock.yaml` agrees with every `package.json` | **Verified by running a real `pnpm install --frozen-lockfile --ignore-scripts` from a clean scratch directory containing only the 8 manifests + the lockfile** — **exit 0**, 242 packages resolved. All 8 importers present (root + 7 packages, including `packages/trends`), every specifier matching. The pre-session staleness is closed. |
| 12 | React 19 really resets the uncontrolled `<select>` | **Verified against the INSTALLED react-dom 19.2.8**, not from memory: `react-dom-client.development.js:8955` calls `requestFormReset$1(formFiber)` on every `<form action>` submit, setting flag `1024`, which `recursivelyResetForms` (`:15152`) turns into `stateNode.reset()` on commit. |
| 13 | `respin/.tmp/` is not gitignored | **Verified.** `git check-ignore --no-index respin/.tmp/foo.ts` → exit **1**; no `.tmp` pattern in any `.gitignore`; `git status --short` lists `?? respin/.tmp/` beside the real 8c files. (I first mis-read a `git check-ignore -v` on a directory as "ignored" and re-ran it properly — the specialist was right and my first reading was wrong.) |
| 14 | The `action-gate` scanner is not fail-open | **Verified by reading its planted-shape suite**: it plants a binding-less `catch {}` in a **`.tsx`** file, a comment-first catch, `.js`/`.jsx` files, and a comment-only decoy, and asserts the **real** `findSwallowingCatches` reports exactly the offenders. This session's `pasted-references.tsx` fix was caught by a red test, not by a human. |

---

## 1. Convergence — the strongest signal in the set

Three findings were reached **independently by two reviewers each, by two separate probes**. I re-derived each from the source myself. Convergence across two lanes that were not talking to each other is the highest-confidence evidence this round produced, and none of the three should be discounted as one reviewer's opinion.

1. **The settlement's population is "newest claim per item", not "the profile's parked claims"** — `respin-tenancy` CHANGE 1 and `respin-billing` CHANGE 4. → **C1**.
2. **`refundDeferred` is re-derived from the paste quote, whose reason order puts tier before pause** — `respin-learning` CHANGE 4 and `respin-billing` CHANGE 2. → **C2**.
3. **A private paste's autopsy proposes a shared, workspace-null framework** — `respin-learning` BLOCK 1 and `respin-tenancy` CHANGE 2, graded differently. → **C3**, severity arbitrated below.

---

## 2. Consolidated findings, most severe first

### BLOCK

**B1 · `respin/packages/modes/src/traceability.ts:212` — the `month-date` hard rule is wrong at its boundary in BOTH directions.**
*(Absorbs compliance BLOCK 1, CHANGE 2, CHANGE 3 and CHANGE 4 — one root cause, four symptoms.)*

The optional day group is greedy with no digit boundary, so `"March 2024"` tokenises as `"March 20"` and the year is eaten as a day-of-month. `buildCorpusIndex` runs a *different* pair of regexes (`WORDLIKE` + `WRITTEN_NUMBER`), so the two sides of the check are not self-consistent.

*Failure scenario A — fail-open, REQ-I03.* A creator's brain/input contains a month word (`June`) and any bare two-digit number (`20`, from "20 minutes"). The model invents the year **2019**. `month-date` claims the span `"June 20"`, `traceable()` decomposes it to `june` + `20` — both in the index — so it clears; and because the claimed span is `[0,8)`, `plain-number`'s match on `2019` at `[6,10)` **overlaps and is skipped**. The invented date reaches the creator with **zero findings**, rendered under `TRACEABILITY_LIMIT_NOTE`: *"Every number, date and name in this draft was checked against your brain and against what you gave this generation."* That sentence is false about the one specific that was invented. **I reproduced this exactly**, including the control proving `2019` would have been flagged without the month word.

*Failure scenario B — false hard refusal with an unactionable excerpt.* A creator writes `"March 2024"`; the model repeats it; the scan refuses it. The creator pays for **two** vendor calls and gets a refusal quoting `'March 20'` — a token absent from their draft. The one rewrite **cannot** succeed: `REWRITE_INSTRUCTION` says to put the marker beside the specific, and I measured that `"March 2024 [check]"` still fires. Only `"March [check] 2024"` clears.

*Third symptom:* `offerCheck` (`:659`) inserts the marker **inside the year** — `"We filmed this in March 20 [check]24"`. Latent (no production caller), live the moment the offer is wired to a screen.

*Fourth symptom:* the defect is recorded only in a test comment (`spin-reference.test.ts:495`) and only its over-strict half; the fail-open half is not in it. CLAUDE.md 2026-07-30: a comment asserting a property is not the property.

**Fix (verified by execution):** add a `(?!\d)` digit-boundary to the day group. Add the regression witness compliance names: `for (const shape of SPECIFIC_SHAPES)` -> specimen in corpus -> **no hard finding**. That one loop catches this whole class. Note it moves `prompt_bundle_version` (the pattern source is in `gateDescription()`), so `bundle.test.ts`'s pin needs updating.

**Why this is the BLOCK and the money findings are not:** it is the only finding in the set reachable **today, by an ordinary creator, on a shipped path, with no version bump, no admin surface and no operator action**, and its output is a false honesty claim — the exact thing REQ-I03 and CLAUDE.md's Respin non-negotiable 6 exist to prevent.

---

### CHANGE — must be fixed before this slice closes

**C1 · `respin/packages/credits/src/pasted-reference.ts:349-351` — a parked, debited claim becomes permanently unrefundable once a second claim exists on its item.** *(tenancy CHANGE 1 + billing CHANGE 4, convergent.)*

`settleParkedAutopsies` iterates `pastedReferencesForProfile`, whose `projectPastedReference` (`trends-storage.ts:1272-1275`) reads **one** claim per item (`orderBy desc(createdAt), desc(id) … limit 1`). The settlement's population is "parked and newest-per-item", strictly narrower than the docblock's "each of the profile's parked claims".

*Scenario (both reviewers drove it):* claim `C1` parks with a `-4` debit; `AUTOPSY_ANALYSIS_VERSION` is bumped — which `trends-storage.ts:946` explicitly plans for and `submitPastedReference`'s own docblock anticipates — and a re-paste mints `C2`. From that instant `C1` is invisible to the settlement forever (which is idempotent, so no later load recovers it), and `/trends` renders the item as **"Queued for autopsy"**. The creator is permanently down `creditCosts.autopsy` with no surface saying so.

This is CLAUDE.md's **2026-08-29** lesson in its exact shape: a population written as one path, narrowing the day a second path appears. Latent only because `AUTOPSY_ANALYSIS_VERSION` is the literal `"v1"`.

**Fix:** settle from a claims query — `autopsyCacheClaims` under the minted pair with `rightsScope='profile_private'` and `status='parked'` — not from the display projection. Then correct the docblock sentence that names `pastedReferencesForProfile` as the population.

**C2 · `respin/app/(product)/trends/page.tsx:292` and `pasted-references.tsx:106-116` — the screen says "credits returned" (past tense) in two states where nothing was returned.** *(learning CHANGE 4 + billing CHANGE 2 convergent, PLUS learning CHANGE 3 — one edit closes all three.)*

- *Pause deferral:* `refundDeferred = !quote.allowed.ok && quote.allowed.reason === "paused"`, but `pastedReferenceQuote` (`pasted-reference.ts:144-148`) tests **tier before pause**, so a workspace that is both non-paid and paused reports `"tier"`. `settleParkedAutopsies` (`:346`) defers on that same open pause and returns `[]`. Billing drove it end to end and the section then renders *"Could not be completed — credits returned"* / *"What this paste charged has been returned to your balance."* **Zero credits were returned.**
- *Second instance, any tier:* the settlement runs at `page.tsx:261` and the quote at `:278`. A pause ending between them flips the flag the same wrong way. The comment at `:289-292` ("The quote's pause answer is the same `hasOpenPause` the settlement consulted") is false — two reads, two moments, two precedence orders.
- *Never-charged claim (learning CHANGE 3):* under a document pricing `creditCosts.autopsy` at 0 — which `schema.ts:14` admits with `min(0)` and `pasted-reference.ts:160-166` explicitly anticipates — no debit row is written, the settlement correctly appends nothing (`:357`), `creditsReturnedFor` returns `null`, and `null` renders the **refunded-on-an-earlier-load** branch. The `null` sentinel collapses three realities — refunded earlier, refunded among several, never charged — into one sentence asserting a return.

**Fix (one edit, three findings):** widen `SettleParkedAutopsiesResult` to carry `deferred: boolean` and `neverChargedClaimIds: string[]`, computed inside the settlement's own transaction from the pause it actually consulted, and have the page read those instead of re-deriving anything from a screen quote. Add the third copy branch.

**C3 · `respin/packages/db/src/system-spend.ts:1170` — a private paste's autopsy proposes a shared, workspace-null framework from n=1, citing evidence no outside curator can read.** *(learning BLOCK 1 + tenancy CHANGE 2. Severity arbitrated in section 3.2 -> CHANGE.)*

`resolveAutopsyFramework` runs on every autopsy completion with **no `rightsScope` branch**. Before 8c the only production producer was shared YouTube items; 8c makes `profile_private` claims reachable, so the producing population widened silently — 2026-08-29 again. Both reviewers drove it and got a `visibility:"shared", curatorStatus:"proposed", workspaceId:null, ownerProfileId:null` row whose `sourceReferences` point at a `profile_private` `trend_item`. R-94 rests the whole control on human curation, and the human is handed a citation they cannot open. No decision entry, no registry sentence, and **no test in either direction** (`system-spend.test.ts:697`'s private-claim test stops one assertion short of counting `frameworks`, while the shared test at `:820` does count them).

**Fix — in this order:** (a) put the substantive question to the owner: *should a private paste propose into the shared library at all?* I recommend **no** — gate on `cacheClaim.rightsScope === "shared_analysis"`, a one-line change that closes both reviewers' concerns outright, because the unresolvable-evidence problem has no good fix while the gate is open and R-94's rationale was written when every autopsy was shared. (b) Whichever way it goes, record it (amend R-96 or add R-99) **and** add the `frameworks` count to the private test, so the choice has a witness rather than a silence. (c) Add tenancy's witness: a private claim's finalize produces a shared/proposed ownerless mechanism-level row, with a planted-personal-detail mutation reddening it.

**C4 · `respin/packages/credits/src/ledger.ts:266-275` — the over-refund guard is per-SPELLING, not per-debit, and the docblock asserts the opposite.** *(billing CHANGE 1. Severity arbitrated in section 3.1 -> CHANGE with a mandatory rider.)*

`pointsAtDebit` counts refund rows matching `(refType==="debit" && refId===originalDebitId)` **OR** the caller's own `p.ref`. A caller that passes **no** `ref` therefore cannot see a refund written under a named `ref`. **I reproduced the mint myself** against the real module: refund #1 as `{autopsy_refund, claim-1}`, refund #2 with the default `{debit, debitId}` — both accepted, **8 credits returned against a 4-credit debit**, balance 225 -> 229.

`ledger.ts:216-222` states: *"the over-refund guard below counts refund rows under EITHER reference against the original debit — a caller cannot open a second refund budget for one debit by naming it differently."* Naming it differently is exactly what opens the second budget. CLAUDE.md **2026-07-30**: a comment claiming a property is not the property.

**Fix, split by urgency:**
- **This slice (mandatory):** correct or delete the docblock sentence — it is a live falsehood the next engineer will rely on, and it is a one-line edit with no risk. **And** add a red test that plants the second spelling, because `ref` is *optional* and its absent branch is precisely the hole — CLAUDE.md **2026-08-26**: a parameter that reads like a guard is not one until a test drives its false branch.
- **Deferred, owner = whoever builds M6's admin refund surface, trigger = the second caller of `refundCredits`:** make the budget per *debit* — carry the original debit id in its own column and sum over that. `refType`/`refId` cannot carry both facts.

**C5 · `respin/app/(product)/trends/paste-panel.tsx:234-247` — the niche `<select>` is UNCONTROLLED while the file's own comment claims every field is controlled; React resets it after every submit. (NEW — nobody owned this.)**

`paste-panel.tsx:130-134` says *"CONTROLLED, so a refused paste keeps what the creator typed (a form action resets uncontrolled fields when it settles)"* — and then three of the four controls are controlled (`sourceUrl`, `title`, `transcript`) and the fourth, `<select id="paste-niche" defaultValue="">`, is not. **Verified against the installed react-dom 19.2.8** (`:8955` `requestFormReset$1` -> flag `1024` -> `:15152` `stateNode.reset()`): every `<form action>` submit resets the form, controlled inputs are immediately re-driven from state, and the select snaps back to its selected default — **"None"**.

`niche` is a refusable field: `pasted-reference.ts:478` classifies the untracked-niche message to `field: "niche"`.

*Failure scenario:* a creator selects "home cooking", pastes, the server refuses (short balance, or the niche was untracked in another tab). The form returns with URL and transcript intact and the niche **silently cleared**. They press "Paste for autopsy" again; the paste now succeeds and the item is stored with **no niche** — quietly not what they chose, and unrecoverable without a re-paste under a different transcript. Worse when `niche` *is* the refused field: `PastePanel`'s `useEffect` moves focus to a select that has just been reset to "None" while `aria-invalid="true"` — a screen-reader user is told the control they are on is invalid while it shows the neutral default they never picked.

**Fix:** make the select controlled like its three siblings, or state the reset in the comment and clear the other three too. The comment must not keep asserting a property one control does not have.

**C6 · `respin/app/(product)/trends/paste-panel.tsx:277` + `packages/credits/src/pasted-reference.ts:287` — "Already queued — nothing charged" is printed about a claim that is parked, refunded and dead.** *(billing CHANGE 3.)*

Billing drove it: paste -> park -> settle -> re-paste the same URL+transcript -> `{"sameClaim":true,"replayed":true,"charged":0,"claimStatus":"parked"}`. `parked` is terminal for `startAttempt` (`system-spend.ts:1197`) and excluded from `systemAutopsyQueueCandidates` (`:104`), so **nothing is queued and nothing ever will be**. The creator has no way forward: the same URL + same transcript always lands on the dead claim. Same class as the R-82 defect this session's `replayed` change was aimed at, one derivation over. **Fix:** condition the sentence on `claimStatus` — "Already queued" only for `pending`/`retrying`; a `parked` landing gets its own copy and, ideally, a retry path.

**C7 · `respin/packages/credits/tests/pasted-reference.test.ts` — this session's `replayed` fix has no witness at the layer that implements it.** *(billing CHANGE 6.)*

Billing **proved it with a mutant**: an aliased copy of `pasted-reference.ts` whose only change was reverting `replayed` to `creditsChargedNow === 0` ran **34/34 green** with Docker live. The copy has a witness; the code does not. Every other driver mocks the facade. **Fix:** two package cases — a zero-priced document's *first* paste has `replayed === false`; a duplicate paste has `replayed === true`.

*I looked for siblings of this, as asked. The sibling I found is C8. The other candidate — this session's `copy` fix — **does** have a witness: `trends-actions.test.ts`'s `refused()` helper reads the real `BILLING_ERROR_COPY[code]` rather than pinning a retyped sentence, and `billing-errors.ts` is deliberately not mocked. That one is fine.*

**C8 · `respin/app/(product)/trends/actions.ts:212` — the one new refusal path indexes `BILLING_ERROR_COPY` with a CAST instead of the clamp that exists three files away. (NEW.)**

`const code = logRefusal(...) as BillingErrorCode` then `copy: BILLING_ERROR_COPY[code]`. `logRefusal` (`safe-log.ts:160-168`) is typed to return **`string`**, not `BillingErrorCode` — the type is erased at that boundary and re-asserted by an unchecked cast. If `code` is ever not a key, `copy` is `undefined` and `PasteOutcome`'s `copy.title` (`paste-panel.tsx:294`) throws **on the client, on the refusal path** — i.e. exactly when something has already gone wrong. It is safe today only by construction (`safeLogFields` clamps to `"unknown"` on throw and otherwise returns `billingErrorCode(err)`), and `trends-actions.test.ts` **stubs `logRefusal` entirely**, so no test drives the real one into the real map. This is the only place in `app/**` that indexes the map from a cast: every other consumer uses `billingErrorFromCode` (which clamps via `isBillingErrorCode`, `billing-errors.ts:1606-1612`) or a typed `billingErrorDisplay`. **Fix:** `copy: billingErrorFromCode(code)`, or type `logRefusal`'s return as `BillingErrorCode`. One line either way.

**C9 · `respin/app/(product)/trends/page.tsx:259-266` — a settlement refusal takes down the whole Trends surface, permanently.** *(billing CHANGE 5.)*

Billing drove `RefundSourceNeverExpiresError` out of `refundCredits` and showed it is not self-healing: every later load throws again. The page returns `<AccessRefusal>` — **no feed, no niche tracker, no paste panel, no pasted-references section** — for a refund the creator would happily wait for. This applies to *any* `LedgerIntegrityError` out of `refundCredits`, not just that one. Operator/M6-reachable, not creator-reachable today. **Fix:** contain the refusal to the pasted-references section; render the page and show the owed-refund banner where the references are.

**C10 · `respin/app/(product)/trends/page.tsx:176` + `packages/db/src/trends-storage.ts:1223-1232` — "No channel baseline — pasted reference" is TYPED, not derived.** *(learning CHANGE 2.)*

`pastedReferencesForProfile`'s predicate is "profile_private items under a submitted source" with **no `baseline_state` condition**, and `PastedReference` does not carry the column; `pastedStateFor` stamps `outlier: null, baselineState: "unavailable"` unconditionally. Learning drove a `measured` profile-private item under a submitted source — a shape the codebase itself builds — and got the same item rendering *"Outlier ratio 2.00x…"* in the feed and *"No channel baseline — pasted reference"* in the section above it. No production writer creates that shape today. The honesty claim is asserted by the page instead of read from the record. **Fix:** add `eq(trendItems.baselineState, "unavailable")` to the reader **and** carry `baselineState` on `PastedReference` so the line is derived; tighten the M7 witness at `pasted-reference.test.ts:374` from `toContain` to `toEqual`.

**C11 · `respin/packages/db/src/trends-storage.ts:307` — the stored reason misnames why saturation is absent, and it ships in the creator's export.** *(learning CHANGE 5.)*

Every pasted item is stamped `saturation: "unmeasured", saturationUnmeasuredReason: "incomplete_provenance"`, and the writer's own comment concedes why (*"the one reason the CHECK admits"*). A pasted reference's provenance is complete; there is no **population**. Learning printed it out of the real JSON export. Slice 5's finding recurring: an absence attributed to the wrong cause. **Fix:** extend the CHECK's reason vocabulary with `no_population` and stamp that when `baseline_state = 'unavailable'`.

**C12 · `respin/tests/trends-ui.test.tsx:238-285` — the claims-canon sweep's population is a hand-written list guarded by a count; and the refusal words it sweeps are 7 of a set the action can draw any member from.** *(learning CHANGE 6 + CHANGE 7 + compliance NOTE 2 — one class.)*

`RENDERED_STATES` is enumerated by hand with only `expect(RENDERED_STATES.length).toBeGreaterThanOrEqual(41)` as a totality guard. It happens to cover every `PastedReferenceState` kind and `PasteActionState` status **today**; a seventh kind joins the union and the type-checker, the count and the sweep all stay green. Slice 6's and slice 7's round-1/2 BLOCKs were this class, and the neighbouring source scan at `:828` gets it right with a `readdirSync`. Separately, `BILLING_ERROR_COPY` as a whole is never swept against `FORBIDDEN_CLAIMS`/`PERFORMANCE_CLAIMS` — `billing-ui.test.tsx` does not import `tests/support/forbidden-claims.ts` at all — while the paste action can return **any** `BillingErrorCode` its `catch` classifies. Compliance additionally names `refund_source_never_expires` and `pasted_reference_input` as rendered states outside the sweep (both read clean; a coverage gap, not a live violation). **Fix:** derive `RENDERED_STATES` from the discriminant kinds, and add one `it.each(Object.keys(BILLING_ERROR_COPY))` sweeping title + detail against the canon. Both populations are already derivable.

**C13 · `respin/app/(product)/trends/paste-panel.tsx:85-97` — `PastePanel`, the component that owns every interactive behaviour R15 requires, is rendered by NO test, and the repo has no environment that could render it. (NEW.)**

`grep` over `tests/` and `app/`: `PastePanel` (as distinct from `PastePanelView`) is referenced only by `trends-view.tsx:284`. Its `useActionState` wiring and its `useEffect` focus-move — the behaviour its own docblock argues for at length (*"the move is what makes the description reach a screen-reader user without a hunt"*) — have **zero witnesses**. And they cannot be given one with the current infrastructure: `vitest.config.ts` sets `environment: "node"` and there is no `jsdom`, `happy-dom` or `@testing-library` in `node_modules`. Every UI test in this repo is `renderToStaticMarkup`. Deleting the entire `useEffect` would leave 3505 tests green. This is CLAUDE.md's **2026-08-26** lesson — an absence no mutation can reach.

**This is not a demand to install jsdom in this slice.** It is a demand that R15 not be ticked on static-markup evidence: *"keyboard-only; visible focus; a live region announces the paste result; reduced motion"* is discharged by **the browser walk (Verification item 2, currently unticked)** and by nothing else. Say so on the card.

**C14 · `respin/.gitignore` / `respin/eslint.config.mjs:616` — `respin/.tmp/` is untracked and un-ignored, and this slice is entirely uncommitted.** *(tenancy NOTE 6 + compliance CHANGE 5, escalated to CHANGE.)*

**Verified:** `git check-ignore --no-index respin/.tmp/foo.ts` -> exit 1; no `.tmp` pattern in any `.gitignore`; `git status --short` currently lists `?? respin/.tmp/` **directly beside the real slice-8c files**. Since every 8c file is untracked, the commit that lands this slice will be a `git add`, and `.tmp/` is one `-A` away from riding along. It is also outside eslint's `ignores` (`.next/**`, `node_modules/**`, `**/node_modules/**`, `next-env.d.ts`), which is why tenancy saw `pnpm lint` exit 1 with 14 errors from a scratch file — so "lint 0" is not reproducible on an untidy tree.

The related process failure is real and separate: during this very round a reviewer wrote `__rev_mut1.ts`, `__rev_mut2.ts` (501-line mutated copies of the money module) into `packages/credits/src/` and `__rev_probe.test.ts` into `packages/credits/tests/`. The repo **has** excellent machinery for exactly this (`tests/support/probe-artifacts.ts`, `tests/probe-artifacts.test.ts`, three `.gitignore` patterns, both directions tested) — but its population is "probes a *suite* plants", and none of the three patterns (`__scan_probe__/`, `__stripe_scan_probe__/`, `__*_probe.ts`) matches `__rev_mut1.ts` or `__rev_probe.test.ts`. So while they existed they were committable, `isolation.test.ts` was red, and the recorded entry gate did not describe the tree. **Fix:** add `respin/.tmp/` to `.gitignore` and to the eslint `ignores`; widen the probe patterns to cover reviewer artifacts; and make "probes go in the scratchpad, never the repo" an explicit line in the review protocol rather than an assumption.

**C15 · `respin/packages/credits/src/pasted-reference.ts:345` — the workspace advisory lock is taken UNCONDITIONALLY on every `/trends` GET. (NEW.)**

`settleParkedAutopsies` opens a transaction and calls `takeWorkspaceLock` **before** it knows whether there is anything to settle, and `page.tsx:33` is `dynamic = "force-dynamic"`, so this happens on **every** navigation, for **every** seat including viewers (correctly, per tenancy NOTE 5 — but that widens the population rather than narrowing it). That is the same `hashtextextended(workspaceId, 0)` lock every generation debit, every paste, every pause write and every `deriveBalanceInTx` takes (`clock.ts:67-74`). Two seats refreshing `/trends` serialise against the workspace's money path; a creator sitting on `/trends` while a generation runs waits on it.

Not a correctness defect — the transaction is short and the lock is `xact`-scoped — but it is a contention surface introduced on a **GET**, and it is cheaply avoidable. **Fix:** read the profile's parked-claim set outside the transaction and return early when it is empty; take the lock and re-read only when there is something to settle (a standard double-check — the outside read is advisory, the inside one is authoritative).

*Related, and I checked it rather than assuming: lock ORDERING is clean.* The only two non-`hashtextextended` locks are `hashtext(profileId)` at `trends-storage.ts:706` and `:1077`, both reached **after** the workspace lock (`submitPastedReference`) or standalone. No path takes the profile lock and then the workspace lock, so there is no inversion. Hunted for a deadlock; did not find one.

---

### NOTE

- **`respin/packages/db/tests/migration-shape.test.ts` — 0027 has no structural case.** *(billing NOTE 8.)* **Confirmed by grep:** the file covers 0011, 0012, 0020, 0022, 0023, 0024 and 0026 and stops. 0027's two partial uniques and its CHECK have only the behavioural Docker witness, while every sibling partial unique on that table has a structural case. 0027 adds *money* constraints; it should be there.
- **`respin/packages/db/src/billing-schema.ts:324-334` — the CHECK's comment misstates its own NULL semantics.** *(billing NOTE 7.)* Confirmed by reading the emitted SQL: `ref_type NOT IN ('autopsy_claim','autopsy_refund') OR ref_id IS NOT NULL` has the same NULL behaviour as `<>`, not the `IS DISTINCT FROM` the comment claims it needed. The *guarantee* is sound (a NULL `ref_type` row is not an autopsy row, and a NULL CHECK passes); only the stated reason is wrong.
- **`respin/packages/modes/src/assemble.ts:56` — the comment names the wrong module.** *(tenancy NOTE 3.)* `assertMechanismLevel` lives in `@respin/db` (`frameworks.ts:1205`), not `@respin/trends`. Property true, attribution wrong.
- **`respin/packages/db/src/frameworks.ts:1504` — "contains no creator identity" is weaker after 8c.** *(tenancy NOTE 4.)* `frameworkTrendItemRef` reversibly encodes a `trend_items.id` onto an ownerless shared row, and after 8c that id can name a profile-private row. Not exploitable from a tenant. If kept, say "no creator identity **column**; the ref is an opaque encoding of a row that may be profile-private."
- **`docs/initial/decisions.md` R-97 over-claims for bare numbers.** *(compliance NOTE 1.)* R-97 says "a number that appears only in the reference block is refused as untraced"; `plain-number` is `enforcement: "flag"` by design (R-64). The refusal claim holds only for the hard shapes. Narrow the sentence.
- **`respin/app/(product)/trends/pasted-references.tsx:81` — "Retrying — attempt 2 of 5" names the attempt that just FAILED.** *(learning NOTE.)* `displayClaimStatus` returns `retrying` with `attemptCount` = the finished attempt. The ceiling itself is honest (`AUTOPSY_ATTEMPT_CODE_CEILING` is the real parking threshold).
- **`respin/app/(product)/trends/trends-view.tsx:253-259` — the no-baseline line renders in the `else` of `item.outlier`.** *(learning NOTE.)* Precedence, not mutual exclusion; a row carrying both would show the ratio and suppress the honest line. The guard belongs on `baselineState`.
- **`respin/packages/db/src/trends-storage.ts:1212-1216` — the "unbounded is safe because `REFERENCE_COUNT_MAX` is 50" argument does not hold** for the population the reader actually selects (see C10), nor for a paste re-stored after its input cascaded away. *(learning NOTE.)*
- **Manifest provenance:** `docs/plans/respin-finish-phase-6.md` and `respin-finish-phase-7.md` are labelled "new in 8c" but exist at `cc3ed43`. Hashes right, status column wrong. *(learning NOTE.)*
- **`respin/app/(product)/trends/pasted-references.tsx:193` — `<ol style={{listStyle:"none"}}>` drops list semantics in WebKit/VoiceOver.** (NEW, low confidence, cosmetic.) `role="list"` restores it. Worth noting only because the new section is the *only* list in Trends — the ranked feed uses a bare `<div className="trends-feed">`, so the new code is already the better of the two.
- **Inline styles are NOT a DESIGN.md violation here.** (NEW — hunted for, did not find.) `paste-panel.tsx`'s `style={{width:"100%"}}` and `style={{minHeight:"1.2em"}}` are byte-identical to the established `spin-panel.tsx:21,29` and `track-niche-panel.tsx:74` precedent, and `prefers-reduced-motion` is handled globally in the tokens file (DESIGN.md:101) with no animation in the new files. No invented token values.

---

## 3. The two arbitrations

### 3.1 Billing CHANGE 1 (`ledger.ts` over-refund guard) — BLOCK or CHANGE?

**Decision: CHANGE, with a mandatory in-slice rider. The bar I applied: is the defect reachable, today, from a shipped surface — by a user, by an operator on a screen that exists, or by an external system?**

I did not take the reachability claim on trust. I re-ran the mint myself (section 0 item 8 — 8 credits against a 4-credit debit, against the real module) *and* I enumerated every caller of `refundCredits` across `packages/*/src`, `app`, `worker` and `lib` (section 0 item 9): there is exactly **one**, `pasted-reference.ts:360`, and it always passes the same `ref`. There is no Stripe caller, no webhook caller, no admin caller. Migration 0027's `credit_ledger_autopsy_refund_uq` blocks a repeat of that one spelling. To reach the mint you must **write a new caller**.

That is the same standard this gate applied to C1 (latent until `AUTOPSY_ANALYSIS_VERSION` moves), to C9 (operator-reachable only) and to C10 (no production writer makes the shape). Grading this one BLOCK while grading those CHANGE would be an inconsistency inside a single gate, and consistency of the bar is the thing that makes a gate mean something.

**But the reason it is only a CHANGE is not that the guard works — it is that the guard has one caller.** That is precisely the structure CLAUDE.md's 2026-08-29 lesson is about, and the docblock **names the second member by name** ("the M6 admin surface, which is still its second reader"). So the rider is not optional:

1. **In this slice:** correct or delete the docblock sentence. It currently asserts a property the code does not have — a live CLAUDE.md 2026-07-30 violation, and a one-line edit with no risk. Leaving a false invariant comment on the money module while shipping is worse than the latent defect, because the next engineer reads the comment, not the boolean.
2. **In this slice:** add a red test that plants the second spelling. `ref` is *optional*, and its absent branch is exactly the hole — CLAUDE.md 2026-08-26 in its sharpest form: a parameter that reads like a guard is not one until a test drives its false branch.
3. **Deferred — owner: whoever builds M6's admin refund surface. Trigger: the second caller of `refundCredits`.** Make the budget per *debit*: carry the original debit id in its own column and sum over that. `refType`/`refId` cannot carry both facts, which is why the current shape cannot be patched in place.

To the reviewer's own framing — *"a mint out of nothing must be structurally impossible, not merely unreached"* — I agree that is the right end state and it is why (3) is mandatory rather than optional. It is not the right **gate bar**, because applied literally it makes every unexercised branch of every money helper a BLOCK, and this gate would then never render a meaningful distinction. The distinction it renders instead: **B1 ships a lie to a creator today; C4 cannot be reached without new code.**

### 3.2 Learning BLOCK 1 vs tenancy CHANGE 2 (private paste -> shared framework proposal)

**Decision: CHANGE.** Both reviewers are right about what they measured; they graded differently because they measured different things, and neither measurement reaches the BLOCK bar.

- **Nothing is served and nothing is shown.** I verified independently that `sharedFrameworkLibrary` (`frameworks.ts:1334`) filters on `recommendable()`, which requires `curator_status = 'approved'` (`:1312`). Tenancy's probe agrees. The row reaches a **queue behind a human gate**, not a creator and not another tenant.
- **Nothing the tenancy contract forbids crosses.** Tenancy checked each: the content passes `assertMechanismLevel` before persistence, the ownership pair is NULL by CHECK, and R-94 explicitly sanctions "every canonical mechanism emitted by a completed autopsy" entering proposed-only curation. The *population* widened; the *authority* did not weaken.
- **Learning's strongest sub-point is real and is not a BLOCK.** A curator handed a `sourceReferences` pointer at a `profile_private` `trend_item` they cannot open will review the mechanism text alone. That is a **degraded human review**, not an automatic promotion. Degraded review of an unserved proposal is a CHANGE.

**What makes it the highest-urgency CHANGE in the set, and why it must not close on "tenancy said it's fine":** the two reviewers' disagreement is itself the finding. Both concerns are **unwitnessed in either direction** — grep finds no test anywhere tying a `profile_private` claim to a shared-library proposal, and the private-claim test stops one assertion short of the one that would have recorded the choice. A flow that two Full-gate reviewers reached opposite conclusions about, and that no test describes, is not something to leave to the next reader. Hence the three-part fix in C3, with the owner question first — and my recommendation that the answer be *no*, gate on `rightsScope === "shared_analysis"`, because that single line closes both reviewers' concerns at once and R-94's rationale predates the existence of a private producer.

---

## 4. Recommended fix order

**Gate A — must be fixed and re-reviewed before this slice can close (the slice is BLOCK until these land).**

1. **B1 — the `month-date` regex** + the `SPECIFIC_SHAPES` round-trip loop as its regression witness + the `bundle.test.ts` pin update. *Re-review needed:* compliance, because it moves `prompt_bundle_version`. **This is the only thing standing between the slice and NEEDS CHANGES.**
2. **C3 — the owner question on private->shared proposals**, then the decision entry and the two tests. *Re-review needed:* learning + tenancy, one round, because the two lanes disagreed and the resolution has to satisfy both.
3. **C2 — widen `SettleParkedAutopsiesResult`** to carry `deferred` and `neverChargedClaimIds` from inside the settlement's own transaction; page reads them; add the third parked-copy branch. **One edit closes three findings** (learning CHANGE 3 + learning CHANGE 4 + billing CHANGE 2). *Re-review needed:* billing, and it is the same read as (4).
4. **C1 — settle from a claims query, not the display projection**, and fix the docblock's population sentence. *Re-review needed:* billing + tenancy (both reached it; both should confirm the new population).

**Gate B — fix now, no re-review needed (mechanical, or already fully diagnosed with the fix named).**

5. **C4 rider** — correct the `ledger.ts` docblock + plant the second-spelling test. Two small edits, both with an exact target.
6. **C7** — the two `replayed` package cases. Billing already named both and ran one of them.
7. **C8** — one line: `billingErrorFromCode(code)` in `actions.ts:212`, or type `logRefusal`'s return.
8. **C5** — make the niche `<select>` controlled, and fix the comment that claims it already is.
9. **C6** — condition the replay sentence on `claimStatus`.
10. **C14** — `respin/.tmp/` into `.gitignore` and the eslint `ignores`; widen the probe-artifact patterns. **Do this before the `git add` that lands the slice**, since everything here is untracked.
11. **C11** — `no_population` in the CHECK's reason vocabulary and the writer stamping it. (Touches migration 0026's CHECK, so it wants a small follow-up migration rather than an edit in place.)
12. **C10** — the reader predicate + `baselineState` on `PastedReference` + `toEqual` at `pasted-reference.test.ts:374`.
13. **C12** — derive `RENDERED_STATES` from the discriminant kinds; add the `Object.keys(BILLING_ERROR_COPY)` canon sweep. Both are a few lines and both close a class the last two slices blocked on.
14. All eleven NOTEs above except the last two (which are "no action").

**Gate C — deferred, with an owner and a trigger stated.**

| Finding | Owner | Trigger |
|---|---|---|
| **C4 structural fix** (per-debit refund budget, own column) | whoever builds M6's admin refund surface | the **second** caller of `refundCredits` |
| **C9** (contain the settlement refusal to its section) | M6 / operator-surface work | the first `adjustCredits` with no expiry reaching production, or M6 shipping |
| **C13** (an environment that can render a client component) | whoever next needs an interactive UI assertion | the first R15-class requirement a browser walk cannot discharge |
| **C15** (double-check before taking the lock) | performance work on `/trends` | the first workspace with more than one active seat, or the first lock-contention report |
| **NOTE: 0027 in `migration-shape.test.ts`** | next migration touching `credit_ledger` | any change to either partial unique |

**Findings that collapse into one edit, stated plainly as asked:**

- **compliance BLOCK 1 + CHANGE 2 + CHANGE 3 + CHANGE 4 -> one regex character class** plus one test loop. Four of the nineteen.
- **learning CHANGE 3 + learning CHANGE 4 + billing CHANGE 2 -> one return-type widening** on `settleParkedAutopsies`. Three more.
- **tenancy CHANGE 1 + billing CHANGE 4 -> one reader swap.** Two more.
- **learning BLOCK 1 + tenancy CHANGE 2 -> one `rightsScope` condition** (if the owner answers "no") plus one decision entry. Two more.
- **learning CHANGE 6 + CHANGE 7 + compliance NOTE 2 -> two derived populations** in `trends-ui.test.tsx`. Three more.

Fourteen of the nineteen specialist findings collapse into **five edits**.

---

## 5. Coverage

- **Read fully:** `app/(product)/trends/{page.tsx,paste-panel.tsx,pasted-references.tsx,paste-state.ts,actions.ts}`; `packages/modes/src/traceability.ts` (`SPECIFIC_SHAPES`, `buildCorpusIndex`, `scanTraceability`, `offerCheck`); `packages/credits/src/ledger.ts:195-330`; `packages/credits/src/pasted-reference.ts:300-400,455-520`; migrations `0026_lazy_vector.sql` and `0027_curious_paper_doll.sql` including both headers; `pnpm-lock.yaml`'s importers section against all 8 `package.json` files; `docs/plans/respin-finish-phase-8c.md`; decisions R-96/R-97/R-98; `tests/support/probe-artifacts.ts`; all four specialist reports.
- **Read in the parts that matter:** `packages/db/src/trends-storage.ts` (intake, the bare-`Error` inventory, readers, projection); `packages/db/src/frameworks.ts` (`recommendable`, `sharedFrameworkLibrary`); `app/(product)/safe-log.ts`; `app/(product)/billing-errors.ts` (`billingErrorCode`, `billingErrorFromCode`, the copy map's totality); `tests/action-gate.test.ts` (the planted-shape suite); `tests/trends-ui.test.tsx` (imports and the paste cases); `tests/trends-actions.test.ts` (the `importOriginal` mocks); `packages/db/tests/migration-shape.test.ts` (its `describe` inventory); `vitest.config.ts`; `eslint.config.mjs` ignores; `respin/.gitignore`; `DESIGN.md`.
- **Not read (owned by a specialist who did read them, and I did not re-derive):** `packages/modes/src/{assemble,bundle,pipeline,similarity}.ts` beyond the traceability boundary; `packages/credits/src/generate.ts`'s spin wiring; `worker/**` (slice-8 context, hash-verified unchanged); the two `meta/*_snapshot.json` files; `packages/trends/src/sources.ts`; the seven changed docs/plan files beyond R-96/97/98 and the 8c card.
- **Commands run:** SHA-256 over all 166 manifest paths **before and after** (166/166 both times, 0 mismatches, no repo file changed under me); full `vitest run` CI-shape with `TEST_DATABASE_URL` live (147 files / 3505 tests / 0 failed, exit 0, 293s); `pnpm install --frozen-lockfile --ignore-scripts` in an isolated scratch directory (exit 0, 242 packages); three `tsx` probes against the real `traceability.ts` (fail-open, false-refusal, `offerCheck`, the 7-shape round trip, the proposed fix, seven date forms, the split-corpus case); one `tsx` probe against the real `ledger.ts` on PGlite (the double-refund mint); `git check-ignore --no-index`, `git status --short --untracked-files=all`; greps for `refundCredits` callers, advisory-lock sites, `PastePanel` references, `BILLING_ERROR_COPY[` index sites, and the `migration-shape` `describe` inventory. **Every probe and mutant file was written to the session scratchpad outside the repo; the post-review hash run confirms it.**

**What I hunted for and did NOT find** (so a clean section is not mistaken for a skim):

- A stale or inconsistent `pnpm-lock.yaml` — **not found**, it is now correct and provably installable frozen.
- A fail-open source scanner in the new action surface — **not found**; `action-gate.test.ts` plants a binding-less `catch {}` in a `.tsx` file and drives the real function.
- A lock-ordering inversion between the workspace lock and the profile lock — **not found**; the only two profile-lock sites are both reached after the workspace lock or standalone.
- A DESIGN.md token violation or an invented value in the new UI — **not found**; the inline styles match the established sibling precedent exactly.
- A missing `rel="noopener noreferrer"`, a `javascript:` href, or a raw transcript reaching the client — **not found**; `referenceHost` gates the `<a>` on an http(s) protocol and falls back to text.
- A second vacuous this-session fix beside `replayed` — **not found**; the `copy` fix has a real witness (`trends-actions.test.ts` reads the live map rather than a retyped sentence).
- A `revalidatePath` failure reported to the creator as a refused write — **not found**; both new actions place it after the commit with the reasoning stated.

---

## 6. Verdict

**BLOCK · Not yet · D**

**1 BLOCK · 15 CHANGE · 11 NOTE.** Four of the five Gate-A items are money or learning correctness that two independent reviewers each reached from opposite directions, and the BLOCK is an integrity rule that is wrong in both directions on a path an ordinary creator walks today: an invented date reaches them with zero findings, rendered under a sentence that says every date was checked. I reproduced that by running the real module, and I reproduced the proposed fix closing it without regressing seven other date forms. The engineering around it is, in several places, unusually well proven — the concurrency proof, the R-97 prompt isolation, the `action-gate` scanner and the export/deletion registry all survived attack — and the lockfile and entry gate both reproduce exactly as recorded.

**Least-confident line:** my arbitration of C4 to CHANGE rests on a caller census I ran with `grep` over `packages/*/src`, `app`, `worker` and `lib`. A caller reached by dynamic import, by a string-built module specifier, or from a surface outside those four roots would not appear in it, and I did not build the call graph to rule that out — I ruled out the *plausible* second caller (Stripe/webhooks) and stopped. If such a caller exists, C4 is a BLOCK and the fix order changes: it moves to Gate A ahead of everything except B1. The finding itself I am not uncertain about at all — I minted four credits out of nothing against the real module with two lines of package code.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
