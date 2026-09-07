# Respin learning honesty — slice 8c, round 2 (FINAL round)

**Reviewer:** `respin-learning-reviewer` · **Verdict: BLOCK** · Readiness **Not yet · D** · 1 BLOCK · 1 CHANGE · 4 NOTE

*Filed by the orchestrator: the reviewer is read-only and was told to create only this file.*

**Manifest**: all **173** files in [`8c-review-manifest-round2.md`](8c-review-manifest-round2.md) hashed **before and after** — 0 mismatches both times. Nothing moved under me.

---

**Readiness: Not yet · Grade: D · Six of my seven round-1 findings are genuinely closed and I proved five of them by running code — but the traceability fix left the sibling half of its own defect open, so a date the creator never wrote still reaches them under a sentence saying every date was checked.**

**Scope**: the 39 round-1 fix-pass files, read against the 134 unchanged ones. Emphasis on `packages/db/src/{system-spend,trends-storage,trends-schema}.ts`, `packages/credits/src/pasted-reference.ts`, `app/(product)/trends/{page.tsx,pasted-references.tsx,paste-state.ts}`, `packages/modes/src/traceability.ts`, migration 0028, and the six test files that carry the new witnesses.

---

## My seven round-1 findings — closed or not, and how I know

**BLOCK 1 — a private paste proposes a shared framework from n=1. CLOSED. RAN IT.**
Drove `submitPastedReference` → `startAttempt` → `finalizeAttempt` on PGlite through the real
production path. Framework table after: **9 rows, every one `curator_status: "approved"` (the seed
library), zero `proposed`**, and `autopsies.matched_framework_id = NULL`. Round 1's identical probe
printed one `visibility: "shared", curator_status: "proposed", workspace_id: null` row. Same probe,
same path, opposite result — that pair *is* the mutation. R-99's text matches the code
(`system-spend.ts:1185`, the ternary on `cacheClaim.rightsScope === "shared_analysis"`), and the enum
has exactly two members (`trends-schema.ts:33`), so the ternary is total. The false branch has a
counted witness at `system-spend.test.ts:752` (`expect(await db.select().from(frameworks)).toEqual([])`)
against the true branch at `:828` (`toHaveLength(1)`) for the **identical** `CANONICAL_ANALYSIS` — so
the zero is the condition and nothing else. `resolveAutopsyFramework` has exactly one production
caller (grepped `packages/*/src`, `app`, `worker`, `lib`).

**CHANGE 2 — "No channel baseline" typed, not derived. CLOSED. RAN IT.**
Built the exact shape I used in round 1 — a `measured`, `profile_private`, `transcript_available` item
under a `submitted` source, in a tracked niche, owned by the profile. `pastedReferencesForProfile` now
returns **`[]`** for it (round 1: it returned the item). The two readers partition rather than overlap:
`trends-storage.ts:792` selects `= 'measured'`, `:1260` selects `= 'unavailable'`.
`PastedReference.baselineState` carries the column (`:1194`, `:1371`) and `page.tsx:182` spreads it only
when the record says `unavailable`; `AnalysedTrendItem.baselineState` is typed `?: "unavailable"`
(`trends-view.tsx:81`), so `measured` cannot be projected onto the card at all. The M7 witness is
`toEqual` in both directions (`pasted-reference.test.ts:383-384`). Round-1 NOTE 1 (the `else`-precedence
on the no-baseline line) is closed by the same three layers.

**CHANGE 3 — "credits returned" printed for a claim never charged. CLOSED for the state it named. RAN IT.**
Priced `creditCosts.autopsy` at 0 through a real config append, pasted (`creditsChargedNow: 0`), parked
the claim, settled, and rendered `PastedReferences`. Ledger: **one grant row, no debit, no refund**.
Screen: *"Could not be completed — nothing was charged … Nothing was charged for this attempt, so there
is nothing to return and your balance is untouched."* True of that ledger. (But see CHANGE 1 below — the
*fallthrough* branch is still the asserting one.)

**CHANGE 4 — the pause deferral inferred from the quote. CLOSED. RAN IT — this is the case I said I was least confident about, and it now behaves.**
Built the free-tier-with-an-open-pause state end to end: paid workspace, real paste (charged 4), parked,
then a config append emptying `stripePriceMap` (→ `getWorkspaceBillingState` resolves
`tier: "free", reason: "unmapped_price"`), then an open `pause_periods` row. Printed:
`quote.allowed = {"ok":false,"reason":"tier"}` — the wrong answer, exactly as round 1 predicted — while
`settleParkedAutopsies` returned `deferred: true`, and the screen rendered *"Could not be completed —
settled when the pause ends"*. The page reads the settlement's own boolean (`page.tsx:198`), read inside
the settlement's transaction (`pasted-reference.ts:410-411`), so the quote's precedence no longer reaches
the sentence. My round-1 doubt is discharged: the state is reachable and the copy is right in it.

**CHANGE 5 — the stored reason misnames the absence, and it ships in the export. CLOSED. RAN IT.**
Real paste → `openBrainExport(…, "json")`, stream consumed:
`{"baselineState":"unavailable","saturation":"unmeasured","saturationUnmeasuredReason":"no_population","outlierRatio":null,"videoViews":null}`.
Round 1 printed `incomplete_provenance` from the same surface. The builder went past the ask: the CHECK is
a **CASE tie**, not a widened `IN` list (`trends-schema.ts:182`, migration `0028:103`), so an
`unavailable` row *cannot* carry `incomplete_provenance` and a `measured` row cannot carry
`no_population` — both directions witnessed at `pasted-reference.test.ts:552-592`, and
`migration-shape.test.ts:946-977` pins the CASE shape with the `IN (…)` mutation named. Pinned in the
export at `export.test.ts:899-903`, which is the surface I found it on.

**CHANGE 6 — `RENDERED_STATES` a hand list guarded by a count. CLOSED. RAN A TYPE PROBE.**
`PASTED_STATE_SPECIMENS` is `Readonly<Record<PastedReferenceState["kind"], …>>` (`trends-ui.test.tsx:230`).
I reproduced that exact shape outside the repo with a ninth union member and ran the repo's own
`tsc --strict`: `error TS2741: Property 'a_ninth_kind' is missing`. The root `tsconfig.json` includes
`**/*.ts(x)` and excludes only `packages`, so `tests/` is under `pnpm typecheck` — the guard is live, not
decorative. It **derives**, it does not agree: `caseLabels()` re-reads the `case "…"` labels out of
`pasted-references.tsx`'s own `switch` and asserts set-equality (`:641-655`), with a regex **literal** and
a planted-specimen non-vacuity test (`:665`). The `>= 41` count survives only as a floor against the
tables collapsing to empty, and says so.

**CHANGE 7 — the refusal-copy sweep enumerated 7 codes. CLOSED. RAN THE SWEEP MYSELF.**
Imported the real `FORBIDDEN_CLAIMS`/`PERFORMANCE_CLAIMS` (23 patterns) and the real `BILLING_ERROR_COPY`
(**109 codes**) and ran the loop `billing-ui.test.tsx:1731-1736` runs: **0 offenders** over the real map;
with one planted entry (`"We guarantee more views" / "This will perform 3x better…"`) the same loop returns
`["a_new_code:guarantee","a_new_code:views","a_new_code:will perform","a_new_code:more views"]`.
Non-vacuous, and the population is `Object.keys(BILLING_ERROR_COPY)` (derived), not a list.

**Six of seven closed. Five of the six proved by running code, one by running the type-checker.**

---

## Findings

### BLOCK 1 — a **date** is still decomposed across words, so an invented date clears the one hard rule that exists for dates — under the sentence saying it was checked

`respin/packages/modes/src/traceability.ts:570` (`traceable`, the `kind === "number"` early return) · claim at `:143` (`TRACEABILITY_LIMIT_NOTE`) · unwitnessed at `packages/modes/tests/traceability.test.ts:437`

`traceable()` refuses decomposition for **numbers only**:

```ts
if (kind === "number") return false;
const parts = token.match(WORDLIKE) ?? [];
return parts.length > 1 && parts.every((p) => index.has(normalise(p)));
```

`month-date` is `kind: "date"`, `enforcement: "hard"` (`:208-210`). So a two-word date falls through to
the multi-word-**name** rule and is cleared whenever both of its words appear anywhere in the corpus,
separately.

**Verified by running `scanTraceability` against the real module:**

| corpus | draft | findings |
|---|---|---|
| `"I film every March."` + `"2024 was the year I stopped."` | `"The March 2024 rebuild…"` | **`[]`** |
| `"I film a lot."` | same draft | `month-date:hard:"March 2024"` |
| `"I film every March."` | same draft | `month-date:hard:"March 2024"` |
| `"I film every March."` + `"5 minutes is all it takes."` + `"2024 was the year."` | `"…on March 5, 2024 in the kitchen"` | **`[]`** |

Row 1 against rows 2-3 is the control pair: the *only* difference is whether the year appears somewhere
else in the creator's own material, and its mere presence anywhere vouches for a date they never wrote.

**Failure scenario.** A creator's brain is built from their own posts and interview. It says *"I film
every March"* in one post and *"2024 was the year I went full time"* in another — ordinary, near-certain
content. The model writes *"the March 2024 rebuild"*, a date the creator never gave. `month-date` is the
hard rule whose entire job is to refuse that. It does not fire. Nothing is flagged, nothing is refused,
no `[check]` is offered, and the draft ships under `TRACEABILITY_LIMIT_NOTE`: *"Every number, date and
name in this draft was checked against your brain and against what you gave this generation."* **That
sentence is false about the one specific that was invented.** My lane owns the sentence, and the sentence
is a claim the code does not back — CLAUDE.md's 2026-07-30 lesson, on a creator-facing surface.

**Why this is round 2's characteristic defect and not a leftover.** Round 1's BLOCK was the same rule
failing open; the fix pass corrected the *regex extent* (`(?!\d)`, `:211-217`) and wrote
`traceability.test.ts:437` — *"a number is never decomposed into words the brain happens to hold"* — for
`$1,200` against `"1 take"` / `"200 takes"`. It wrote the decomposition guard for one kind and a test for
one kind, and left its sibling **hard** shape open in the same function it was editing. The new
regression test at `:447` (*"an INVENTED YEAR beside a month the brain does hold is still caught"*)
passes only because its corpus omits `2019`; put the year anywhere in the brain and it goes from green to
open. The round-1 code review's round-trip proof (`SPECIFIC_SHAPES`, all 7) cannot see this either — it
puts the whole specimen in the corpus, which is the *traceable* direction.

**Fix**: `if (kind === "number" || kind === "date") return false;` — a date is one specific, like a
quantity — plus the mirror of `:437` for a date. Compliance owns the enforcement call and I am deferring
it there; **what I am blocking on is that until it lands, `TRACEABILITY_LIMIT_NOTE` must not ship as
written**, and no card may tick verification item 6.

*Confidence: high on the behaviour (four runs, with controls). Medium on my grading: another lane could
reasonably call this compliance's BLOCK rather than mine. I grade it BLOCK because the consolidating
review's own stated bar last round was "B1 ships a lie to a creator today", and this ships the same lie by
the same function on the happy path.*

### CHANGE 1 — `parked_returned` is reached **by elimination**, so "no information about this claim" renders as a past-tense money claim

`respin/app/(product)/trends/page.tsx:193-203` · `respin/app/(product)/trends/pasted-references.tsx:126-142`

The fix added two branches that require **positive evidence** (`deferred`, `neverChargedClaimIds`) and
left `parked_returned` as the **fallthrough**. Its precondition is therefore "parked, and the settlement
said nothing about you" — which is true of a claim refunded on an earlier load, *and* of a claim the
settlement never saw.

The settlement runs at `page.tsx:275`; the pasted read is a separate round-trip at `:291`. A claim that
parks in that window is not in the settlement's population at all.

**Verified by running it** — settle, then park (as the worker's `finalizeAttempt` does), then read:

```
settlement: {"refundedClaimIds":[],"creditsReturned":0,"deferred":false,"neverChargedClaimIds":[]}
claim status at READ time: parked
LEDGER: [{"ref_type":"test","delta":500},{"ref_type":"autopsy_claim","delta":-4}]   (no refund row)
SCREEN: "Could not be completed - credits returned ... What this paste charged has been
         returned to your balance."
```

The creator's balance is 496 and the screen says it is back. It self-corrects on the next load and the
window is small — hence CHANGE, not BLOCK. But the *structure* is the finding: three of the four parked
realities are now positively evidenced and the fourth is "everything else", which is the same
absent-is-not-zero shape as round-1 CHANGE 3, one layer in.

**Fix**: have `settleParkedAutopsies` also report `alreadyRefundedClaimIds` (the `continue` at
`pasted-reference.ts:429` already knows them) and render `parked_returned` only for
`refundedClaimIds` plus `alreadyRefundedClaimIds`. Anything else parked is a fourth, non-asserting
state — "we have not settled this yet; reload". Then every parked sentence is a positive claim about an
observed fact, and the population is a list rather than a complement.

### NOTES

1. `respin/packages/credits/src/pasted-reference.ts:418-421` — **`neverChargedClaimIds`'s sentence is
   honest today, and I checked why rather than assuming.** "Nothing was charged" is derived from "no
   `autopsy_claim` debit row for this claim in this workspace". `credit_ledger` is append-only with no
   delete path, `submitPastedReference:272` is the only writer of that `refType`, and both
   `autopsyClaimDebit` and the settlement scope to `profile.workspaceId`, so the only way to have no
   debit is to have never written one. The sentence is safe **because** the ledger is append-only —
   which means the day anything can remove or re-scope a debit row, this copy becomes a lie with no test
   between it and the creator. Worth a one-line comment tying the claim to the property it rests on.
2. `respin/packages/db/src/trends-storage.ts:286-289, 339` and `:1260` — the private writer **explicitly
   sanctions** lifting a pasted item from `unavailable` to `measured` ("metadata arrived later"). The new
   reader predicate means that the moment it happens the item **disappears from the pasted-references
   section** — its Ready card, its Spin action, and any parked-refund banner with it — and reappears in
   the ranked feed. The money is safe (the settlement's population is claims, not the display, `:1323`),
   so nothing false is *said*; a record the creator is looking for silently stops being listed.
   Unreachable today: the only production caller is `intakePastedReference` (`:1106`), always with the
   unavailable shape. If the upgrade is ever wired, the pasted section wants to be "items under my
   submitted sources", with the caption read from `baselineState` — which it now is.
3. `respin/packages/db/src/trends-storage.ts:1272` — `pastedReferenceForProfile` (the single-claim
   reader) deliberately does **not** carry the `unavailable` predicate, and has **no app caller** today
   (grepped `app`, `worker`, `lib`). When one appears it will be able to render a `measured` item through
   `pastedStateFor`, whose `baselineState` spread (`page.tsx:182`) then silently omits the caption rather
   than saying anything wrong. Honest by omission, but the asymmetry between the two readers deserves a
   line at the call site that creates it.
4. `docs/plans/respin-finish-phase-8c.md:66` — verification item 6 reads *"A number present only in the
   mechanism block is **refused** as untraced"*, while R-97's own 2026-09-03 amendment records that a
   bare number is `enforcement: "flag"` by design under R-64. The box is unticked so nothing false is
   claimed, but the box as worded cannot be ticked truthfully. (Doc, compliance's decision; flagging
   only.)

---

## Checks run

1. **Sole emitter (L1)** — **n/a, and re-verified not vacuous.** `promotion_proposals` /
   `promotionProposal` appears nowhere in the Respin tree (`*.ts`, `*.tsx`, `*.sql`, excluding
   `node_modules`) — zero hits, so there is no emitter to be sole. The adjacent surface, the shared
   framework proposal, now has exactly one persisting caller (`system-spend.ts:1186`) gated by R-99,
   with `assertAutopsyFrameworkCandidate` (`frameworks.ts:1606`) proven pure — it touches no database.
2. **Minimum n (L2)** — n/a for brain proposals (M5 / slice 9). The framework library's effective n is 1
   **by design** (R-94, no strength threshold), and that was round 1's BLOCK. R-99 removes the population
   8c added to it: private, unverified, baseline-less material no longer feeds the queue at all. Holds at
   `system-spend.ts:1185`, verified by running.
3. **Unverified never learns (L2)** — **holds.** Voice inference filters `input_class` in SQL
   (`infer-voice.ts:168`, `ownPostsNewest`), so a pasted third-party transcript cannot ground a voice
   document; unchanged this round. The framework path is closed by R-99. The pasted item's absent baseline
   is stored, visible, exported, and now correctly named (`no_population`) rather than inferred away.
4. **No pooling, no collapsing (L3)** — n/a. No paid/organic series and no reach/conversion surface in
   this slice. The feed's ordering score (`trends-storage.ts:798-801`) is rank-only and never rendered;
   pasted items are structurally excluded from it (`:792`) with a `toEqual` witness I ran green
   (`pasted-reference.test.ts:374, 383`).
5. **Own baseline, stated exclusions (L4)** — **holds at all three layers now, verified by running.**
   Database: 0026's shape CHECK plus 0028's CASE tie, both directions driven. Reader: the two readers
   partition on `baseline_state` and the exclusion rule is written in the docblock as a rule, not a
   decoration (`:1239-1253`). Export: `no_population` printed from a real export. No cross-creator or
   cross-profile statistic enters a creator's results view — the pasted section is pair-predicated and I
   re-ran the sibling-isolation cases green.
6. **Declared metric (L5)** — n/a. No north-star metric surface here; no composite or engagement score on
   any rendered state (swept: 109 billing codes x 23 canon patterns, 0 hits; plus the pasted-state sweep,
   all kinds).
7. **Approval writes (L6)** — n/a for brain docs. The one page-load write is `settleParkedAutopsies`,
   named as such at `page.tsx:6-12` and ordered before the read — and that ordering is now itself a
   finding (CHANGE 1), not because the order is wrong but because the gap it opens is rendered as a claim.
8. **Two claims (L7)** — **holds. No document in this diff claims the vendor browser walk ran.**
   `respin-finish-phase-8c.md:62-70` leaves all eight verification boxes unticked, item 2 being the walk
   and item 1 the entry gate. The master plan's 8c row is unchanged. The only changed doc is
   `decisions.md`, and R-95 through R-99 make engineering claims only — R-95 even carries an explicit
   *"What this decision does not yet claim"* paragraph naming the two lines that had not moved. R-99's
   evidence claims ("both reviewers drove it and printed the row", "the guard's deletion reddening a named
   test") are true: I am one of the two reviewers, I drove it in both rounds, and the round-1/round-2
   probe pair on the identical production path is the mutation.
9. **Number provenance** — **holds for everything new.** `creditsChargedNow: 4` traced to
   `content.creditCosts.autopsy` read under the lock (`pasted-reference.ts:255-258`), seeded at 4, never a
   literal — driven and printed. `creditsReturned: 4` traced to the `autopsy_refund` ledger row (`+4`
   against the `-4` debit), printed from `credit_ledger`. `attemptCeiling` is
   `AUTOPSY_ATTEMPT_CODE_CEILING` (R-93). The `109` and `23` in CHANGE 7 above are counts I derived from
   the modules themselves, not from a doc. The two claim-shaped absences round 1 flagged as not
   re-derivable (findings 3 and 5) now are.

## Coverage

- **Read fully**: `app/(product)/trends/page.tsx`, `pasted-references.tsx`,
  `packages/db/migrations/0028_light_mulholland_black.sql`, `decisions.md` R-95 to R-99,
  `packages/credits/src/pasted-reference.ts` (settlement + submit + result type),
  `traceability.ts:130-160, 540-610`.
- **Read in the parts that matter**: `system-spend.ts` (finalize, the R-99 guard, the attempt lifecycle),
  `trends-storage.ts` (both private writers, both feed readers, both pasted readers,
  `parkedAutopsyClaimsForProfile`, `projectPastedReference`), `trends-schema.ts` (all five CHECKs),
  `frameworks.ts` (`frameworkTrendItemRef`, `assertAutopsyFrameworkCandidate`,
  `insertProposedSharedFramework`), `ledger.ts:230-268`, `paste-state.ts`, `paste-panel.tsx` (the four
  claim-status branches), `trends-view.tsx:244-262`, `export.ts` (absence sentences,
  `EXPORT_EVIDENCE_UNVERIFIED`), and the six changed test files carrying the new witnesses.
- **Skimmed**: `migration-shape.test.ts`, `brain-schema.test.ts`, `profile-cage.test.ts`,
  `symbol-citations.test.ts`, `bundle.test.ts`, `spin-reference.test.ts`.
- **Not reached**: `pnpm-lock.yaml`, `eslint.config.mjs`, `.gitignore`, `tests/probe-artifacts.test.ts` +
  `tests/support/probe-artifacts.ts` (C14, tooling — outside my lane),
  `packages/credits/tests/isolation.test.ts` and `pasted-reference.docker.test.ts` (money's lane; I
  checked only that the numbers they produce are displayed honestly), `packages/credits/tests/ledger.test.ts`
  (billing's C4 rider — I read the corrected docblock and confirmed it no longer asserts a property the
  code lacks).

**Commands run**

- SHA-256 over all **173** manifest paths, **twice** — 0 mismatches each time. Nothing changed under me.
- `npx vitest run packages/db/tests/{pasted-reference,system-spend,migration-shape}.test.ts packages/modes/tests/traceability.test.ts`
  → **159 passed**.
- `npx vitest run tests/{trends-ui,trends-page,trends-actions,billing-ui}.test.* packages/credits/tests/pasted-reference.test.ts packages/db/tests/export.test.ts`
  → **599 passed**.
- `tsc --noEmit --strict` on a scratch reproduction of the `Record<PastedReferenceState["kind"], ...>`
  guard with a planted ninth kind → `error TS2741` (the guard bites).
- **Seven read-only probes**, all in the session scratchpad, none in the repo, no repo file created or
  edited:
  1. `submitPastedReference` -> `startAttempt` -> `finalizeAttempt` on PGlite, framework rows counted →
     **0 proposed** (round 1: 1) — BLOCK 1;
  2. a `measured` private submitted item driven into existence, both readers queried → pasted section
     empty, no overlap — CHANGE 2;
  3. real paste → `openBrainExport` stream consumed → `saturationUnmeasuredReason: "no_population"` —
     CHANGE 5;
  4. five parked scenarios (paid/no pause, paid/paused, **free-tier + open pause**, price 0,
     refunded-earlier) each settled and **rendered through the real `PastedReferences` component**, with
     the ledger printed beside each sentence — CHANGE 3 and CHANGE 4;
  5. settle-then-park-then-read, rendered → "credits returned" over a ledger with no refund — new
     CHANGE 1;
  6. the real `BILLING_ERROR_COPY` (109) against the real canon (23), clean, then the same loop over a
     planted entry → 4 hits — CHANGE 7;
  7. `scanTraceability` against seven date corpora with controls → the decomposition fail-open — new
     BLOCK 1.

**Verified by running code**: round-1 findings 1, 2, 3, 4, 5, 7; new BLOCK 1; new CHANGE 1; checks 2, 3,
5, 9. **Verified by the type-checker**: round-1 finding 6. **Verified by reading and grepping**: checks
1, 8; all four notes.

## Verdict

**BLOCK**

The fix pass is good work — six of seven findings closed, five of them provably, two of them (0028's CASE
tie, the derived state map) built stronger than I asked for. It fails on the one thing round 2 exists to
catch: the traceability fix guarded decomposition for numbers, wrote the test for numbers, and left the
sibling **hard** date shape open in the same function, so an invented date still reaches a creator under a
sentence promising every date was checked.

**Least-confident line:** whether new CHANGE 1's race is worth an edit at all. I proved the sequence
produces a false past-tense money claim by driving it, but I did not measure the window, and it is a
page-load read of a row a background worker flips — plausibly milliseconds a few times a year,
self-healing on the next load. I am confident about the *structure* (the asserting branch is the
complement, not a positive fact) and much less confident that anyone will ever see it.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
