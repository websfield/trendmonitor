# Respin billing & credits — slice 8c, round 1 (Full gate)

**Reviewer:** `respin-billing-reviewer` · **Verdict: NEEDS CHANGES** · Readiness **Almost · C+** · 0 BLOCK · 6 CHANGE · 3 NOTE

*Filed by the orchestrator: the reviewer is read-only and was told not to edit any file, so it returned the report as its result. The text below is the reviewer's, verbatim except for this header.*

> The money shape is right and the concurrency proof is real, but four screen-or-ledger statements are false in states I reached by running code, and the one fix this session made has no witness.

**Scope**: the 64 slice-8c files in [`8c-review-manifest.md`](8c-review-manifest.md), billing subset. Hashes verified before and after (166/166 match, both runs). Main tree, no worktree. In-scope but not mine: the R11 spin-prompt half (compliance gate). Probe artifacts removed; working tree byte-identical to the manifest.

**Counts: 0 BLOCK · 6 CHANGE · 3 NOTE.** Findings 1–5 were **verified by executing code against PGlite and/or real Postgres**; finding 6 by running a mutant; 7–9 by reading.

---

## Findings

### CHANGE 1 — `respin/packages/credits/src/ledger.ts:266-275` · the over-refund guard is per-SPELLING, not per-debit — and the docblock says the opposite

`pointsAtDebit` counts only refund rows matching *this call's* reference. A second caller naming the same debit differently opens a second full refund budget.

**Verified by running** (PROBE E, PGlite, real module):
```
PROBE E: {"secondRefused":false,"refundRows":2,"refundTotal":8,"afterDebit":31,"balanceNow":39}
```
One 4-credit debit; refund #1 as `{autopsy_refund, claimId}` (the settlement's spelling), refund #2 by the default `{debit, debitId}` (the M6 admin surface's shape). Both accepted. **8 credits returned against a 4-credit debit — a mint out of nothing.**

`ledger.ts:216-222` states: *"the over-refund guard below counts refund rows under EITHER reference against the original debit — a caller cannot open a second refund budget for one debit by naming it differently."* That is exactly what naming it differently does. This is the 2026-07-30 lesson: a comment claiming a property is not the property.

Not reachable today (one production caller, one spelling, and `credit_ledger_autopsy_refund_uq` blocks a repeat of that spelling) — but the same docblock names the M6 admin surface as "still its second reader".

**Fix**: make the budget per *debit*, not per spelling — carry the original debit id on the refund row in its own column and sum over that; or delete the claim reflected in the docblock. `refType`/`refId` cannot carry both facts.

### CHANGE 2 — `respin/app/(product)/trends/page.tsx:292` · the pause deferral is re-derived from the quote, and the quote checks tier before pause

`refundDeferred = !quote.allowed.ok && quote.allowed.reason === "paused"`. But `pastedReferenceQuote` (`pasted-reference.ts:144-148`) tests tier **first**, so a workspace whose tier is not paid reports `reason: "tier"` even with an open pause — while `settleParkedAutopsies` (`pasted-reference.ts:346`) defers on that same open pause.

**Verified by running** (PROBE F — paste on Creator → park → open pause → subscription canceled):
```
PROBE F: {"settled":{"refundedClaimIds":[],"creditsReturned":0},
          "quoteAllowed":{"ok":false,"reason":"tier"},"tier":"free",
          "pageRefundDeferredFlag":false,"refundRows":0,
          "screenSays":"credits returned (PAST TENSE)"}
```
The section then renders `pasted-references.tsx:107,115`: **"Could not be completed — credits returned"** / *"What this paste charged has been returned to your balance."* Zero credits were returned.

A second, narrower instance on any tier: the settlement runs at `page.tsx:261` and the quote at `page.tsx:278` — a pause ending between them flips the flag the same wrong way. The comment at `page.tsx:289-292` ("The quote's pause answer is the same `hasOpenPause` the settlement consulted") is false: two reads, two moments, two precedence orders.

**Fix**: `settleParkedAutopsies` returns `deferred: boolean` from the pause it actually consulted inside its own transaction; the page reads that and never re-derives it.

### CHANGE 3 — `respin/packages/credits/src/pasted-reference.ts:287` + `app/(product)/trends/paste-panel.tsx:277` · `replayed` is the right sentence for "nothing charged" and the wrong one for "already queued"

The session's fix correctly separated `replayed` from the price. It did not separate it from the claim's *state*.

**Verified by running** (PROBE A — paste → park → settle (refunded) → re-paste the same URL+transcript):
```
PROBE A: {"sameClaim":true,"replayed":true,"charged":0,"claimStatus":"parked"}
PROBE A claim row status after re-paste: parked attempts: 5
```
The panel prints **"Already queued — nothing charged."** about a claim that is parked, already refunded, and — because `parked` is terminal for `startAttempt` (`system-spend.ts:1197`) and excluded from `systemAutopsyQueueCandidates` (`system-spend.ts:104`) — will never run again. Nothing is queued. Same class as the R-82 defect this session's change (a) was aimed at, one derivation over. The creator also has no way forward: same URL + same transcript always lands on the dead claim.

**Fix**: condition the replay sentence on `claimStatus` (the writer already returns it) — "Already queued" only for `pending`/`retrying`; a `parked` landing needs its own copy and, ideally, a retry path.

### CHANGE 4 — `respin/packages/credits/src/pasted-reference.ts:349-351` · a parked, debited claim becomes unrefundable once a second claim exists on its item

Settlement iterates `pastedReferencesForProfile`, which projects **only the newest claim per item** (`trends-storage.ts:1272-1275`, `orderBy desc(createdAt), desc(id) … limit 1`). An older parked claim that carries a debit is then invisible forever.

**Verified by running** (PROBE B — parked debited claim, then a second claim row on the same item at `analysis_version = "v2"`):
```
PROBE B settlement: {"refundedClaimIds":[],"creditsReturned":0}
PROBE B refunds for the parked debited claim: 0
PROBE B debits: 1 balance: 96
```
The creator paid 4 credits for an autopsy that could not complete; 100 → 96, permanently, with no operator path named.

A second claim on one item is exactly what an `AUTOPSY_ANALYSIS_VERSION` bump produces — `autopsy_cache_claims_identity_uq` is `(content_digest, analysis_version, rights_scope, cache_scope_key)` (`trends-schema.ts:298`), and `submitPastedReference`'s own docblock (`pasted-reference.ts:168-174`) names that state. So the writer's reasoning already assumes a state the refund reader cannot see. **Latent** at today's `AUTOPSY_ANALYSIS_VERSION = "v1"` (`trends-storage.ts:946`).

**Fix**: settle over the profile's parked *claims* (a claim-level scoped reader), not over the newest claim of each item.

*(Orchestrator note: this is the same defect the tenancy reviewer reached independently as its CHANGE 1 — two Full-gate reviewers, two separate probes, one conclusion.)*

### CHANGE 5 — `respin/app/(product)/trends/page.tsx:259-266` · a settlement refusal takes down the whole Trends surface, permanently

**Verified by running** (PROBE C — paste funded only by a never-expiring lot, then parked):
```
PROBE C: RefundSourceNeverExpiresError: refundCredits: the original debit consumed
only never-expiring lots, so a refund expiry cannot be computed (D-M1-7)…
```
…and it is not self-healing: every later call throws again (asserted). The page returns `<AccessRefusal>` — no feed, no niche tracker, no paste panel, no pasted-references section — for a refund the creator would happily wait for. The copy (`billing-errors.ts: refund_source_never_expires`) is genuinely good and names the operator path; the blast radius is the problem, and it applies to *any* `LedgerIntegrityError` out of `refundCredits`, not just this one.

Reachability today requires a positive `adjustCredits` with no expiry, which has no app-reachable caller; free-allowance lots do carry an expiry (`balance.ts:282`). So: operator/M6-reachable, not creator-reachable.

**Fix**: contain the settlement refusal to the pasted-references section — render the page, show the owed-refund banner where the references are.

### CHANGE 6 — `respin/packages/credits/tests/pasted-reference.test.ts` · the session's `replayed` fix has no witness at the layer that implements it

`replayed` is asserted nowhere in `packages/credits/tests/**`. The only two suites that drive the real `submitPastedReference` are `pasted-reference.test.ts` and `pasted-reference.docker.test.ts`; every other driver (`tests/trends-actions.test.ts:10`, `tests/trends-ui.test.tsx`) mocks the facade.

**Proven by running a mutant**: I aliased in a copy of `pasted-reference.ts` whose only change was `replayed: creditsChargedNow === 0` — the exact predicate this session replaced — and ran both suites with Docker live:
```
Test Files  2 passed (2)      Tests  34 passed (34)
```
The reverted defect survives. The copy has a witness; the code does not.

**Fix**: two package cases — a zero-priced document's FIRST paste has `replayed === false` (I ran this as PROBE D against the real module: `{"replayed":false,"charged":0}` — correct), and a duplicate paste has `replayed === true`.

### NOTE 7 — `respin/packages/db/src/billing-schema.ts:324-334`
The comment says "`IS DISTINCT FROM` rather than `<>` because a CHECK passes when its expression is NULL"; the code emits `ref_type NOT IN ('autopsy_claim','autopsy_refund') OR ref_id IS NOT NULL`, which has the same NULL semantics as `<>`. Both columns are nullable (`billing-schema.ts:132-133`). Harmless — a NULL `ref_type` row is not an autopsy row — but the stated reason is not what the code does.

### NOTE 8 — `respin/packages/db/tests/migration-shape.test.ts`
Covers 0026 structurally in detail; 0027 is not there. The WHERE predicates on the two new partial uniques have only the behavioural Docker witness. The table's other partial uniques (0011's, R17's free-allowance) each have a structural case in this file.

### NOTE 9 — `respin/packages/credits/src/pasted-reference.ts:220-226`
"A replay on a short balance is still refused" is stated honestly in the docblock and is a defensible trade. It has no screen sentence: a creator at zero re-pasting a reference they already paid for is told to top up for something that would have charged nothing.

---

## Checks run

- **B1 append-only ledger, derived balance** — holds. No stored balance column anywhere in `packages/db/src/*.ts`. `balance.ts`, `fold.ts`, `clock.ts`, `pause.ts`, `state.ts` are byte-unchanged vs HEAD. The new debit references its generation-equivalent (`refType: autopsy_claim, refId: <claim id>`, `pasted-reference.ts:273-280`); the new credit names its source kind (`kind: refund`, `refType: autopsy_refund`, `ledger.ts:305-320`).
- **B2 idempotency** — holds / n/a for Stripe. `packages/credits/src/stripe/**` unchanged vs HEAD, so no webhook path moved. The new money path is not webhook-driven; its key is the claim id, enforced twice — writer read under `pg_advisory_xact_lock(hashtextextended(workspaceId))` (`clock.ts:73`) and migration 0027's two partial uniques + CHECK. Proven on real Postgres: 8 identical concurrent pastes → 1 claim, 1 debit; 8 concurrent settlements → 1 refund; both constraints refuse a bypassing raw INSERT **by name** (23505 / `credit_ledger_autopsy_claim_uq`, `…_refund_uq`) and the NULL-`ref_id` hole is refused by `credit_ledger_autopsy_ref` (23514). 5/5 green.
- **B3 debit in-transaction** — holds, **proven not read**. Mutant that ran the debit in its own `db.transaction` reddened `pasted-reference.test.ts:362` (the M1 atomicity witness). Insufficient balance refuses at `pasted-reference.ts:260` — before `intakePastedReference`, so before any row and before the worker can ever be handed the claim. No unmetered path: the claim only exists if the debit committed with it.
- **B4 expiry and pause** — code holds, screen does not. Refund expiry inherits the consumed lot (`ledger.ts:276-303`; witnessed at `pasted-reference.test.ts:459`). Paste refused on open pause (`:250`); settlement defers on open pause (`:346`) and the first settlement after resume returns the money (witnessed, `:507`). Pause-freeze semantics themselves untouched. Violated on screen at `page.tsx:292` — Finding 2.
- **B5 config, not code** — holds. `PASTED_REFERENCE_CREDIT_COST_KEY = "autopsy" satisfies keyof RespinConfigV1["creditCosts"]`; price read from the ACTIVE STORED document inside the debit's transaction (`getActiveConfigRequiringStored`, `:255`) and stamped on the row; ceiling is `AUTOPSY_ATTEMPT_CODE_CEILING`; no digit that is a price in `paste-panel.tsx`. The config-not-literal witness moves the charge and the stamped version with a doctored document.
- **B6 tier gates** — holds. `PASTED_REFERENCE_TIERS` derived from `ENTITLEMENT_TIERS` minus `free` (`:106`), pinned equal to the vocabulary. Free is the default state (no subscription row), refused before any row, copy names the plans and matches `/upgrade|buy|subscribe/i` nowhere. Viewer refused by the mint's role (`:236`). Settlement has no role gate — correct and argued (`:334-336`): it returns the workspace's own money.
- **Threshold provenance** — holds. `UNPROBED_CREDIT_COST_KEYS.autopsy`'s rewritten reason cites R-98, R-90 and the reader file, and `included-build-purposes.test.ts:252` *reads the reader file* to confirm the reason is not prose about a reader that isn't there. `includedBuildPurposes(seed)` still excludes `autopsy`; the R-90 partition assertions are unchanged.
- **B7 money paths are tested** — mostly holds, one hole. Four of the card's named mutations planted against aliased copies: M1 (debit outside the tx) → **red**; M2 (refund uniqueness check dropped) → **red**; M6 (tier gate removed) → **red**; the session's own `replayed` predicate reverted → **GREEN, survives** (Finding 6).

## Coverage

- **Read fully**: `packages/credits/src/pasted-reference.ts`, `src/ledger.ts`, `migrations/0027_curious_paper_doll.sql`, `app/(product)/trends/page.tsx`, `.../actions.ts`, `.../paste-state.ts`, `.../pasted-references.tsx`, `packages/credits/tests/pasted-reference.test.ts`, `.../pasted-reference.docker.test.ts`, `vitest.config.ts`, the manifest, `docs/plans/respin-finish-phase-8c.md`, R-96/R-97/R-98 verbatim.
- **Read in part**: `packages/db/src/trends-storage.ts` (intake, claim, readers, normaliser), `src/system-spend.ts` (claim lifecycle / park terminality), `src/billing-schema.ts` (diff), `src/trends-schema.ts` (claim unique), `app/(product)/billing-errors.ts` (diff), `packages/credits/src/generate.ts` (diff — spin reference resolved before price/slot/claim/vendor, and `spinAutopsyId`/`spinAnalysisVersion` join the request hash, so no idempotency collision), `src/included-build.ts`, `src/balance.ts`, `src/clock.ts`, `paste-panel.tsx`, `packages/credits/tests/included-build-purposes.test.ts` (diff), `packages/db/tests/migration-shape.test.ts` (index).
- **Not read**: the R11/R-97 spin-prompt and traceability half (compliance gate's), `trends-view.tsx`, `packages/modes/**`, `worker/**` (slice-8 context, hash-verified unchanged), `packages/db/tests/pasted-reference.test.ts` beyond its headings.
- **Commands run**: SHA-256 of all 166 manifest files, before → 0 mismatches; after → 0 mismatches. `pnpm db:check` → *Everything's fine*. `vitest run packages/credits/tests/pasted-reference{,.docker}.test.ts packages/db/tests/pasted-reference.test.ts` with `TEST_DATABASE_URL` → **54 passed**, docker suite live (5/5, verified not skipped). `vitest run packages/credits tests/trends-actions tests/trends-page tests/trends-ui tests/billing-ui tests/gate-completeness tests/profile-cage tests/table-writers` with Docker → **36 files / 978 tests / 0 failed**. Six probes (PROBE A–F) against the real modules, outputs quoted above; four planted mutations against aliased copies. All probe/mutant files created outside the manifest and **deleted**; post-review hashes clean.

## Verdict

**NEEDS CHANGES**

Six changes, none blocking: the ledger's first compensating credit is genuinely idempotent by claim id, creator-scoped, and settled in the schema on real Postgres — the card's least-confident line survives its own probe. What does not survive is everything *around* it: two screen sentences about money that I made false by running code, a parked claim the settlement can lose sight of, a refund guard whose docblock promises more than the code does, and the one fix this session made without a witness.

**Least-confident line:** whether Finding 1 should be a BLOCK. I graded it CHANGE because no current application path can produce a second refund spelling, and `credit_ledger_autopsy_refund_uq` blocks a repeat of the one spelling that exists — but I minted 4 credits out of nothing with two lines of package code against the real module, and the only thing between that and production is that M6's admin refund surface has not shipped. If this gate's bar is "a mint out of nothing must be structurally impossible, not merely unreached", it is a BLOCK and the verdict is *Not yet*.
