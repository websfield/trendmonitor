# Respin spin & source compliance — slice 8c, round 1

**Reviewer:** `respin-compliance-reviewer` · **Verdict: BLOCK** · Readiness **Not yet · D** · 1 BLOCK · 4 CHANGE · 2 NOTE

*Filed by the orchestrator: the reviewer is read-only and has no write tool, so it returned the report as its result. The text below is the reviewer's, verbatim except for this header.*

**Scope:** the 64 slice-8c files in [`8c-review-manifest.md`](8c-review-manifest.md). **Hashes verified before and after: 166/166 match, zero mismatches** (before 21:11, after 21:21). See CHANGE 4 — three *non-manifest* files appeared in in-scope source directories during the review; no manifest file moved, so this result stands.

---

## Findings

### BLOCK — `respin/packages/modes/src/traceability.ts:212` — the `month-date` hard rule fails in **both** directions

The optional day group `(?:\s+\d{1,2}(?:st|nd|rd|th)?)?` is greedy, so `"March 2024"` tokenises as **`"March 20"`** — the year is eaten as a day-of-month. `buildCorpusIndex` does **not** run this regex (it runs `WORDLIKE` + `WRITTEN_NUMBER`), so the two sides are **not self-consistent**. This is the explicit answer to routed question 4: **it is a real defect**, and it is worse than the build lane's own note describes.

**Measured through the real `runGeneration`** (`analyseAndSpin`, `SPIN_CONTEXT`, scripted vendor):

| creator's input (corpus) | model's hook | status | hardRules | traceability |
|---|---|---|---|---|
| `I train 20 minutes a day and I started in June` | `The June 2019 rebuild is the one nobody films` | **`usable`** | `[]` | **`[]`** |
| *(same corpus)* | `The 2019 rebuild is the one nobody films` | `usable` | `[]` | `plain-number:flag:2019` |
| `I rebuilt the whole kitchen in March 2024` | `The March 2024 rebuild is the one nobody films` | **`refused`** (2 vendor calls) | `invented_specific/month-date: 'March 20'` | `month-date:hard:March 20` |

**Failure scenario A — fail-open (REQ-I03).** The creator's material contains a month (`June`) and any bare `20` (from `20 minutes`). The model invents the year **2019**. `month-date` consumes `"June 20"`, `traceable()` decomposes it to `june` + `20`, both are in the index, so it clears — and because the match claims span `[0,8)`, `plain-number`'s match on `2019` at `[6,10)` **overlaps and is skipped**. Row 2 proves the year *would* have been flagged without the month word. Result: an invented date reaches the creator with **zero findings**, rendered under `TRACEABILITY_LIMIT_NOTE` — *"Every number, date and name in this draft was checked against your brain and against what you gave this generation."* That sentence is false for the one specific that was invented. This is the BLOCK criterion "invented specifics without the `[check]` convention".

**Failure scenario B — false hard refusal + dishonest refusal text.** The creator writes `March 2024`; the model repeats it; the scan refuses it as an invented specific. The creator pays for **two** vendor calls and gets an honest-refusal screen whose excerpt quotes **`'March 20'`** — a token that does not appear in their draft, so the refusal is unactionable. Worse, the one rewrite **cannot** succeed: `REWRITE_INSTRUCTION` tells the model to write `[check]` *immediately beside* the specific, and I measured that `"...March 2024 [check]"` still fires (the gap `"24 "` between the match end and the marker is not whitespace-only). Only a marker placed *inside* the date (`March [check] 2024`) clears it.

**Isolation.** I ran the round-trip property (output text == corpus text) over every shape in `SPECIFIC_SHAPES`: `iso-date`, `currency`, `percent`, `multiplier`, `plain-number`, `proper-noun` all pass; **`month-date` is the only failure.**

**Fix** (verified by execution, no regression on `March 20th, 2024` / `March 20, 2024` / `Sept 5` / `December 31, 1999` / bare `March`): add a digit-boundary to the day group —
`(?:\s+\d{1,2}(?:st|nd|rd|th)?(?!\d))?`
Note this correctly moves `prompt_bundle_version` (the pattern source is in `gateDescription()`), and `bundle.test.ts` will need its pin updated. Add the round-trip assertion below (CHANGE 2) as the regression witness.

### CHANGE — `respin/packages/modes/src/traceability.ts:659` — `offerCheck` splits the number it is marking

Consequence of the same extent bug, but a distinct defect. Measured: `offerCheck("We filmed this in March 2024", findings)` returns `"We filmed this in March 20 [check]24"` — the marker is inserted **inside** the year. The docblock claims "Nothing is removed, nothing is reworded" — technically true and materially false: the creator's date becomes nonsense on screen. **Currently latent**: I grepped every caller and `offerCheck` has no production caller (exported from `packages/modes/src/index.ts`, used only in tests), so nothing ships this today. It becomes live the moment the `[check]` offer is wired to a screen. · **Fix**: fixing BLOCK 1 fixes this; add the corruption case as a test so it cannot come back.

### CHANGE — `respin/packages/modes/tests/traceability.test.ts:293` — the `month-date` coverage is one-directional and token-blind

`it.each([... ["month-date", "We filmed it in March 2024."]])` runs against `EMPTY` and asserts only that *something* of that shape fired at `enforcement: "hard"`. It never asserts the **token**, and no test anywhere asserts the round trip "a specific the creator's own material carries is not a hard finding". The sibling `plain-number` test *does* assert its token (`"5"`). Both non-vacuity tests at lines 49–69 also pass, because `"March 20"` is still `kind: "date"`. So 143 green tests across `no-scraping`, `similarity`, `spin-reference`, `traceability` and `trends` are blind to this. · **Fix**: assert the token per hard shape, and add `for (const shape of SPECIFIC_SHAPES)` → specimen in corpus → **no hard finding**. That single loop would have caught this.

### CHANGE — `respin/packages/modes/tests/spin-reference.test.ts:495` — a known hard-rule defect is recorded only in a test comment, and only half of it

The comment says: *"the `month-date` shape's optional day group is greedy, so 'March 2024' tokenises as 'March 20' and is refused whatever the corpus carries — it reddened under NO mutation and so witnesses nothing."* That is an accurate diagnosis of direction B and it correctly routes the M4 witness to an ISO date instead. But it treats the defect as merely over-strict, and **direction A (fail-open) is not in it**. Per CLAUDE.md's 2026-07-30 lesson, a comment asserting a property is not the property. A hard-rule defect knowingly left in place needs a `decisions.md` entry with its cost stated, or a fix. · **Fix**: fix it (BLOCK 1); if it is deliberately deferred, record it in `decisions.md` with **both** directions named.

### CHANGE — `respin/packages/credits/src/__rev_mut1.ts`, `__rev_mut2.ts`, `respin/packages/credits/tests/__rev_probe.test.ts` — untracked review artefacts written into shipped source directories

Created at 21:14:36, 21:15:55 and 21:16:55 **while this review was running** (their own header says *"REVIEW PROBE — slice 8c billing gate. Reads only; writes nothing to the repo."* — it wrote three files). No manifest file changed, so my result stands, but:
- `__rev_mut1.ts` / `__rev_mut2.ts` are 501-line near-copies of the money module `pasted-reference.ts` with single mutations (`replayed: creditsChargedNow === 0`; the debit moved into a nested `db.transaction`). They sit in `packages/credits/src/`, which `tsc`, `next build` and `tests/no-scraping.test.ts`'s `walk()` all traverse. If committed, two mutated copies of the ledger writer ship.
- `__rev_probe.test.ts` sits in `packages/credits/tests/` and **will be collected** by the CI-shape run, so the entry-gate evidence recorded in the manifest (147 files / 3505 tests) no longer describes this tree.
· **Fix**: delete all three before the gate closes and re-record the entry gate; have concurrent probe runs write to a scratch directory outside the repo.

> **Orchestrator note (2026-09-03):** all three files were removed by the billing reviewer before it finished; verified absent after both money reviewers completed. The entry gate was **re-run on the final tree** after the fix pass, so the recorded evidence describes a tree with no probe artefacts. The process risk stands and is carried to the card.

### NOTE — `docs/initial/decisions.md` R-97 — "refused as untraced" over-claims for bare numbers

R-97 says *"a number that appears only in the reference block is refused as untraced."* Measured: a mechanism reading *"…stated as a loss of 47 hours"* with an output hook *"You lose 47 hours every Sunday"* produces `plain-number:flag:47` — **flagged, not refused**, because `plain-number` is `enforcement: "flag"` by design (R-64's listicle decision). The refusal claim holds only for the hard shapes (currency, percent, multiplier, ISO date), which is exactly what `spin-reference.test.ts`'s M4 witness plants, and the suite is honest about the adjacent gap in its "STATED LIMIT" test for written quantities. The *decision text* is the thing that is wider than the code. · Suggest narrowing R-97's sentence to "a hard-shaped specific … is refused; a bare number is flagged".

### NOTE — `respin/tests/trends-ui.test.tsx:238` — two `/trends` rendered states are outside the claims-canon sweep

R15 requires the sweep to cover *every* new rendered state. `RENDERED_STATES` covers the paste panel and pasted section thoroughly, but not `refund_source_never_expires` (which `page.tsx:265` renders **instead of the feed** via `AccessRefusal`) or `pasted_reference_input`. I read both copies and neither makes a performance, guarantee or concealment claim, so this is a coverage gap and not a live violation. `billing-ui.test.tsx` sweeps `BILLING_ERROR_COPY` for completeness and "does not sell a plan" but does not import `FORBIDDEN_CLAIMS`/`PERFORMANCE_CLAIMS`.

---

## Answers to the routed questions

1. **R-97 / R11 — verified BY EXECUTION.** I rendered the real `analyseAndSpin` prompt. The four mechanism fields render under `"Another creator's mechanism — adapt it, never quote it:"` plus the note *"It is not this creator's material…"*. The reference `hook`, the `subjectTerms` and the transcript are **absent** — structurally, not incidentally: `SpinReferenceMechanism` has no slot and `assertReferenceMechanism` refuses any extra key **by name, before the vendor**, with the value never appearing in the message. `inputLabel` is `"The angle they want to make their own:"` — the creator's own material. Block order (brain → reference → creator's angle) is pinned. `generate.ts:726-737` constructs the four fields explicitly rather than spreading. Clean.
2. **Traceability corpus — clean, witness is non-vacuous.** `traceabilityCorpusFor` returns `{brain, input:[input, platform], unvouched}` and never reads `reference` — confirmed by running it. `spin-reference.test.ts`'s M4 witness plants a currency amount **and** an ISO date and drives them end to end through `runGeneration` to `status: "refused"` with `invented_specific`, with a control proving the same amount in the creator's own input survives. This is the class slice 7's round-1 BLOCK was about, and it is properly shut. (The `month-date` weakness is in the shape list, not in the corpus boundary.)
3. **Similarity gate — untouched and not narrowed.** `similarity.ts` and `similarity.test.ts` are manifest-context (unchanged); `output.ts` (which owns `outputTextUnits`, the population) is unchanged since slice 7. The gate still compares the reference hook against **every** unit, retains the worst overlap and names the carrying field; `actions.ts`'s `displayableSpin` renders exactly that population (thesis, hooks, idea hooks, beat VO, caption). All 19 similarity fixtures pass. No display path bypasses it: `pipeline.ts` folds gate failures into `hardRules` → `decideAfterKillTest` → one rewrite → refuse. Nothing in 8c narrowed it.
4. **`month-date` — answered above: a real defect, not self-consistent.** The corpus extraction does **not** run the same regex, and both failure directions reproduce end to end.
5. **R-96 ingest — clean.** `TREND_SOURCE_ADAPTERS` is exactly `{youtube, submitted}` behind `assertExactlyCompliantAdapters`; YouTube is origin-pinned to `https://www.googleapis.com` Data API v3. `pastedReferenceIntakePort` makes **no network call at all** — it composes `submitPastedReference` over creator-supplied text. `tests/no-scraping.test.ts` walks `packages/*/src`, `lib`, `worker`, `app` recursively plus root + all 7 package manifests, so every new 8c file is in the population by construction; all 10 tests pass including the planted-specimen non-vacuity checks. The paste is `reference`-class end to end (`intakePastedReference` → `appendReferencePost`, `inputClass: "reference"`, `POST_CONTENT_MAX` in code points), and `trends-storage.ts:498` refuses a `creator_paste` transcript from ever being stored as shared analysis.
6. **REQ-I03/I04 at the new surface — clean.** No performance claim, no guarantee, no invented specific, no apology for the gate working. The paste panel says *"A spin that comes out too close to the original is withheld."* The parked state says *"Could not be completed — N credits returned"* with the real number or none. `pasted_reference_tier` names the plans and does not sell one. Links carry `rel="noopener noreferrer"`; the header reads *"Pasted reference · another creator's work"*. Every number is a prop from config or a package constant. `app/(product)/trends` is in `GENERATION_SCREEN_DIRS`, so the no-streaming guard covers the new files by construction.
7. **The session's `BILLING_ERROR_COPY` fix does not weaken any control I rely on.** `code` still travels beside `copy`, the copy is resolved through the one map (never re-enumerated), `billing-ui.test.tsx` still sweeps every code for completeness and "does not sell a plan", and `trends-ui.test.tsx` renders the resolved copy into the canon sweep. The `catch (err) { rethrowNextControlFlow(err); ... }` in `referenceHost` is correct and first-statement.
8. **R-98 (the card's own least-confident line) — I found no dishonest sentence.** The refund is idempotent by claim id, creator-scoped via `pastedReferencesForProfile`, guarded by the workspace advisory lock **and** two partial uniques (0027), and never refunds a non-parked claim; the pause case *defers* and the copy says so rather than claiming a return that has not happened; `replayed` is read from the writer rather than inferred from `creditsChargedNow === 0` (which would lie under a zero-priced document); a multi-claim settlement declines to attribute a total to one claim rather than dividing it. All 392 tests in that batch pass. Money is billing's verdict, not mine — but nothing here produces a false sentence on screen.

## Checks run

- **1 (sources allowlist)** — holds at `packages/trends/src/sources.ts:155`, `packages/credits/src/pasted-reference.ts:393`, `tests/no-scraping.test.ts:87`
- **2 (similarity gate before display)** — holds at `packages/modes/src/similarity.ts:99`, `packages/modes/src/pipeline.ts:236`, `app/(product)/trends/actions.ts:36`
- **3 (minimum-difference rule)** — computed, not prose: subject / hook / structure at `packages/modes/src/similarity.ts:106,135,142`; side-by-side at `app/(product)/trends/trends-view.tsx:230`
- **4 (kill-test honesty)** — one rewrite then honest refusal holds at `packages/modes/src/kill-test.ts:360`, and `withheldState` correctly withholds the excerpt — **but** the BLOCK makes one refusal's excerpt name a token absent from the draft. "checking until finalised" is n/a: nothing streams, guarded by `tests/support/no-streaming.ts:97`
- **5 (no invented specifics)** — **violated** at `packages/modes/src/traceability.ts:212`. The planted-violation fixture exists and is non-vacuous (`spin-reference.test.ts:492`)
- **6 (no guarantees)** — holds; grepped the 8c-changed source and copy, only the guards' own patterns/specimens matched
- **7 (no automation, no concealment)** — holds: no auto-post/engagement surface anywhere in `actions.ts`; disclosure guidance is a required output section; no config flag weakens the gate (`effectiveSpinStrictness` clamps **upward** to `CODE_SPIN_STRICTNESS_FLOOR`)
- **8 (autopsy caching and honesty)** — holds: one claim per URL+text, replay charges 0 (witnessed); fixed order hook → beats → ending → follow trigger at `trends-view.tsx:177-185`; pasted items carry no invented baseline (`page.tsx:176`, `trends-view.tsx:255`); stale marked never deleted

## Coverage

- **Read fully**: `traceability.ts`, `assemble.ts`, `bundle.ts`, `similarity.ts`, `sources.ts`, `pasted-reference.ts`, `paste-panel.tsx`, `paste-state.ts`, `pasted-references.tsx`, `page.tsx`, `actions.ts`, `spin-reference.test.ts`, `no-scraping.test.ts`, `mode-fixtures.ts`, decisions R-96/R-97/R-98, the 8c plan card, the manifest.
- **Skimmed**: `generate.ts` (§5, §6d, the reference wiring), `kill-test.ts` (runKillTest / decideAfterKillTest / refusal), `pipeline.ts` (gate fold), `trends-view.tsx`, `billing-errors.ts` (paste codes), `trends-storage.ts`, `traceability.test.ts`, `trends-ui.test.tsx`, `billing-ui.test.tsx`.
- **Not reached**: migrations 0026/0027 and their snapshots, `billing-schema.ts`, `creator-data-registry.ts`, `with-workspace.ts`, `included-build.ts`, `ledger.ts`, the docker suites, `pnpm-lock.yaml` — tenancy/billing paths, out of my lane.
- **Commands run**: manifest SHA-256 verify x3 (166/166 clean each time, before and after); `git status` reconciliation against the manifest (no in-scope changed file omitted); `vitest run` on `no-scraping`, `similarity`, `spin-reference`, `traceability`, `trends` (**143 passed**); `vitest run` on `trends-ui`, `trends-page`, `trends-actions`, `credits/pasted-reference`, `db/pasted-reference`, `pipeline`, `kill-test`, `claims` (**392 passed**); five `tsx` harnesses driving the **real** `scanTraceability`, `buildCorpusIndex`, `offerCheck`, `assembleGenerationPrompt`, `traceabilityCorpusFor` and `runGeneration` (outputs quoted above); a node harness comparing the current and proposed `month-date` regexes on eight date forms.
- **Verified by running code**: the entire BLOCK (both directions, through `runGeneration`), the `offerCheck` corruption, the `[check]`-cannot-clear behaviour, the round-trip survey over all seven shapes, the prompt render and its leak checks, the corpus contents, the `47`-is-flagged-not-refused NOTE, the proposed fix. **Verified by reading only**: the ingest allowlist reasoning, the UI copy honesty, the R-98 money shape, the canon-sweep coverage gap.

## Verdict

**BLOCK**

One hard integrity rule is wrong at its boundary in both directions — an invented date can reach a creator with zero findings under a sentence claiming it was checked, and a date the creator typed themselves can be refused after two paid vendor calls with an unactionable excerpt. Everything else this slice touched is clean and, in the case of R-97/R11 and the M4/M5 witnesses, unusually well proven.

**Least-confident line:** that the fail-open direction is as reachable in production as my fixtures make it look. It needs the corpus to contain both the month word and a bare one-or-two-digit number that happens to equal the year's first two digits (`20` for any 20xx year, which is every plausible year a creator mentions) — I judge that common, since `20` arrives from "20 minutes", "20 takes", or any `March 20th`, but I have not sampled real creator brains to say how often. The false-refusal direction I am not uncertain about at all: it fires on `"March 2024"` against a corpus containing exactly `"March 2024"`.
