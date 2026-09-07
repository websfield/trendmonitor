# Respin spin & source compliance — slice 8c, ROUND 2

**Reviewer:** `respin-compliance-reviewer` · **Verdict: BLOCK** · Readiness **Not yet · D** · 1 BLOCK · 3 CHANGE · 2 NOTE

*Filed by the orchestrator: the reviewer is read-only and has no write tool. Text is the reviewer's, verbatim except this header.*

> The `(?!\d)` fix closed the instance and left the class open: a month word beside a number still cancels a hard finding on an invented `3x`, and still refuses a number the creator typed.

**Scope**: the 39 round-1 fix-pass files in [`8c-review-manifest-round2.md`](8c-review-manifest-round2.md), primary. **Hashes verified before and after: 173/173 match both times, zero mismatches.** No repo file changed under the review; every probe lives in the session scratchpad outside the repo (`git status --short --untracked-files=all` over `respin/{packages,app,lib,worker}` shows no new untracked file).

---

## 1. The round-1 BLOCK — verified by RUNNING each of the five claims

All five reproduce exactly as the builder reported. Driven against the real `scanTraceability` / `offerCheck` / `runGeneration`:

| claim | measured |
|---|---|
| fail-open: corpus `"I train 20 minutes a day and I started in June"` + hook `"The June 2019 rebuild…"` | `month-date:hard:"June 2019"` (was `[]`) |
| …and through `runGeneration` | `refused`, `invented_specific` |
| false refusal: creator's own `"March 2024"` | `[]` → `usable` |
| `"March 2024 [check]"` clears | `[]` |
| `offerCheck("We filmed this in March 2024", …)` | `"We filmed this in March 2024 [check]"` |
| round trip over all 7 `SPECIFIC_SHAPES` | **7/7** (was 6/7) |

Every named symptom of round-1 BLOCK 1 is closed **for the date forms the fix pass enumerated**. What follows is what the enumeration missed.

---

## Findings

### BLOCK — `respin/packages/modes/src/traceability.ts:235` — the fix closed the instance; the class is open in both directions, on **hard** enforcement

`(?!\d)` constrains the **day** group. The **year** group `(?:,?\s+\d{4})?` still has no digit boundary, and the day group still claims a complete 1–2 digit number that is followed by `%`, `x` or `,`. Because `month-date` is second in priority order and `scanTraceability:639` skips any later match overlapping a claimed span, an over-wide `month-date` span **cancels the scan of the number inside it**. This is round-1's own scenario A and scenario B, one regex group over.

**A — fail-open on a HARD shape, measured end to end through `runGeneration`** (`analyseAndSpin`, `SPIN_CONTEXT`, scripted vendor):

| creator's material | model's hook | vendor calls | status | hardRules | traceability |
|---|---|---|---|---|---|
| `…I run 3 times a week and I started in June.` | `Since June 3x more people watch the slow way` | 1 | **`usable`** | `[]` | **`[]`** |
| *(same)* | `It is 3x more people watching the slow way` | 2 | `refused` | `invented_specific/multiplier '3x'` | `multiplier:hard:"3x"` |
| `…I shot 12 videos in March.` | `In March 12,000 people signed up…` | 1 | **`usable`** | `[]` | **`[]`** |
| *(same)* | `Then 12,000 people signed up…` | 1 | `usable` | `[]` | `plain-number:flag:"12,000"` |

One adjacent month word is the entire difference between a hard refusal and a silent pass on an **invented `3x` reach claim** — which is also REQ-I04 territory, since `3x more people watch` is a performance claim. It renders under `TRACEABILITY_LIMIT_NOTE`'s sentence that every number and date was checked against the creator's brain. That is the BLOCK criterion "invented specifics without the `[check]` convention", and it is the identical failure round 1 blocked on.

**B — false refusal on the creator's own text, remedy still unreachable.** Corpus and hook both `"By June 250000 views it was over"` → **`refused` after 2 vendor calls**, excerpt `'June 2500' in: By June 250000 views…` — a token absent from the draft. The model's own remedy fails: `"By June 250000 [check] views"` still fires. `offerCheck` still splits the number: `"By June 2500 [check]00 views"`. Round-1 CHANGE 1's third symptom, alive.

**How wide the class is (fuzzed, not argued).** Over 768 generated month×number×frame sentences with `corpus == draft`, **42 violate the self-vouch property** (all the ≥5-digit-after-month family). Over 100 generated suppression cases (brain holds the month word and the number's plain token; model invents the unit-bearing form), **50 show the month word cancelling a finding the control produces, 8 of them HARD** (`3x`, `1.5x`, `5x`).

**Fix**: stop patching directions of a greedy group — make the extent a computed property. Either (a) validate after match that the claimed span does not end inside a `plain-number`/`multiplier`/`percent` token, or (b) index the corpus with the **same `SPECIFIC_SHAPES` regexes** that tokenise the output, so the two sides agree by construction rather than by enumeration. (b) also closes CHANGE 1 below for free. Add the **generative** property as the witness: for random creator text `T`, `scanTraceability(T, corpus=[T])` has no hard finding — that loop found this in one run and the specimen loop cannot see it. CLAUDE.md 2026-08-18: prove the property generatively; a list of counterexamples fixes instances and leaves the class open.

### CHANGE — `respin/packages/modes/src/traceability.ts:570` — the routed residual: **the trade is not sound as taken**, but the naive tightening the builder feared is the wrong fix

Measured, confirming and extending the builder's own report:

- brain `["I filmed in March", "2024 was a hard year"]` + hook `"The March 2024 rebuild"` → **`[]`**; either part alone → `month-date:hard:"March 2024"`.
- The parts need not be in separate documents: one sentence `"In March I bought 20 lenses. Later, 2024 rolled around and I quit."` also vouches → `[]`.
- **It is worse than reported for a full date**: brain `"I shot in March, took 20 lenses, and 2024 was hard"` vouches for `"On March 20, 2024 we filmed"` → `[]`. Three unrelated tokens vouch for one specific.
- The contrast is the argument: `iso-date` is `kind: "date"` too and **never** decomposes — but only by accident of tokenisation (it is one `WORDLIKE` token, so `parts.length > 1` is false). The two hard date shapes have opposite decomposition behaviour for no stated reason.

**Verdict as the compliance authority: it should change.** The code at `:566` already states the correct principle — *"A NUMBER IS ONE SPECIFIC AND IS NEVER DECOMPOSED… would let a brain that merely contains the digits 1 and 200 vouch for the quantity 1,200"* — and then applies it to one of the two kinds it governs. A date is one specific by exactly that argument.

**Concrete failure scenario.** A creator's brain (four docs of their own material) says *"I started this channel in 2024"* and *"March is when I posted the tutorial."* The model writes *"The March 2024 collapse nobody talks about."* The creator never asserted that anything happened in March 2024. It renders with zero findings under the sentence claiming every date was checked, and they post a dated claim about their own history that they did not make. Month names and a recent year are near-certain to both appear somewhere in any real brain, so this is not a corner.

**The builder is right that the naive tightening is wrong** — `buildCorpusIndex` only ever holds single tokens, so `"march 2024"` can never be in the index, and `kind === "date" → return false` would hard-refuse *every* month-date including one the creator typed verbatim, i.e. round-1 BLOCK direction B restored. **Fix**: the rule should be *"a multi-token date is traceable only against a **composite** corpus entry"*, which requires the corpus index to carry composites — the same edit as BLOCK 1's option (b). One change, both findings.

### CHANGE — `respin/worker/system-autopsy.ts:423` — the routed R-99 consequence, and **the fix is much cheaper than judged**

`assertAutopsyFrameworkCandidate` runs on every completed autopsy with no scope condition, while its only purpose — the shared-library proposal — is now gated at `packages/db/src/system-spend.ts:1185` on `rightsScope === "shared_analysis"`. Two places decide the framework question and only one knows the scope.

**Cost, stated precisely** (checked rather than accepting the routing's wording): the credit is **not** lost — five failures park the claim and R-98's settlement returns it. What is lost is (i) the creator's paste is **permanently parked** and never analysed, refused for a shared-library content rule R-99 says no longer governs them; (ii) up to `5 × AUTOPSY_VENDOR_CALLS_PER_ATTEMPT = 20` vendor calls of **system** spend burned on a deterministic failure that will recur every attempt; (iii) the recorded reason `framework_candidate_invalid` / `analysis_invalid` is now false about a private claim. Re-pasting the same video under the same `AUTOPSY_ANALYSIS_VERSION` returns the same claim, so the creator cannot get unstuck.

**Reachability is high**, because `MECHANISM_CONTENT_RULES` is broad and its own docblock records two measured false positives — `metric_unit` refuses *"Shoot 4k footage so you can crop in post"* and *"Leave 20% of the frame empty."* A creator pasting a filmmaking tutorial hits this on ordinary content.

**The orchestrator's "not cheap" judgement is wrong on the facts.** No CLI or runbook change is needed: `startAttempt` already has the `cacheClaim` row in hand inside its own transaction and returns `{status: "granted", …, transcript, contentDigest}` at `system-spend.ts:1057`. **Fix**: add `rightsScope` to that returned shape and guard the worker preflight with `if (claim.rightsScope === "shared_analysis")`. Two lines plus the type. (Do **not** simply delete the preflight — it exists to fail the attempt before the finalize transaction.) **Severity: CHANGE.** It shows nothing false on screen and costs no credits; it wastes vendor spend and parks a legitimate paste against a retired rule.

### CHANGE — `respin/app/(product)/trends/spin-state.ts:12` and `packages/modes/src/kill-test.ts:446` — the newly-common refusal is honest but not always actionable

For the case the fix now handles correctly — an invented `"June 2019"` — the copy is **honest and the remedy works**: the excerpt quotes the real token, `REMEDIES.invented_specific` tells the creator to mark it `[check]`, and `"…March 2024 [check]"` now clears, which it could not before. That is a genuine improvement and the right shape for a newly-common refusal.

Two gaps, both widened by the shift:

1. **On the Spin surface the creator is told which *rule* fired and never which *specific*.** `SpinWithheldReason` is `{rule, remedy}` by deliberate design (the excerpt is candidate text and stays on the server), and the draft is withheld. So the screen says *"invented specific: This specific is in neither your brain nor what you gave this generation"* about a token the creator cannot see, in an output they cannot see. That was tolerable when the refusal population was rare shapes; a month-year is the commonest date a model writes. The creator's only move is a new, separately priced generation (`errors.ts:506`).
2. **For the extent cases BLOCK 1 leaves open, the Studio excerpt at `kill-test.ts:446` quotes a phantom.** `invented_specific at /hooks/0/text: 'June 2500' in: By June 250000 views it was over` — the quoted token does not appear in the sentence printed beside it. Round-1's "unactionable excerpt" symptom, live.

**Fix**: (1) surface a **redacted** locator on the Spin panel — the shape and the field, e.g. *"a date in your hook"* — without the token, so the sentence is actionable without leaking the withheld draft; (2) is closed by BLOCK 1.

### NOTE — `respin/packages/modes/tests/bundle.test.ts:108` — the boundary assertion is not scoped to `month-date`

`expect(parts.gates).toContain(boundary)` tests one flat string. The literal occurs **exactly once** in the hashed gate description today and only in `month-date`, so the test is currently precise — but the day a second shape carries `(?!\d)`, deleting `month-date`'s boundary keeps this green. **Fix**: assert on the `"month-date~"` segment, not on `gates` as a whole.

### NOTE — `respin/packages/modes/tests/traceability.test.ts:496` — the date-form table is a list of counterexamples wearing the shape of a property

Eight enumerated forms, each pinned to its exact token — good work, and it is precisely the shape CLAUDE.md's 2026-08-18 lesson names as insufficient. The forms that fail (`June 250000`, `March 12,000`, `June 3x`) are the ones nobody thought to type.

---

## Status of every round-1 finding

| round-1 finding | status | determined by |
|---|---|---|
| **BLOCK 1** — `month-date` wrong in both directions | **PARTIALLY CLOSED → re-raised as BLOCK 1** | RUNNING. All 5 named symptoms verified closed for the enumerated forms; a fuzz over 768 self-vouch + 100 suppression cases re-opens the class in both directions, confirmed end to end through `runGeneration` |
| **CHANGE 1** — `offerCheck` splits the number | **CLOSED for the named case, class open** | RUNNING. `"…March 2024 [check]"` correct; `"By June 2500 [check]00 views"` still wrong |
| **CHANGE 2** — coverage one-directional and token-blind | **CLOSED for the specimen population** | READING + RUNNING. `traceability.test.ts:92` round-trip loop is derived from `SPECIFIC_SHAPES`; `:210` asserts the marker never lands inside a token over the same population; `:496` pins each form's exact token. It cannot see arbitrary creator text — that is NOTE 2 |
| **CHANGE 3** — defect recorded only in a test comment | **CLOSED** | READING. Fixed rather than documented; the comment at `traceability.ts:211-233` now records **both** directions with the measurement, and `spin-reference.test.ts:508` turned the routed-around row into a real witness |
| **CHANGE 4** — reviewer artefacts in shipped source | **CLOSED, and well** | RUNNING `tests/probe-artifacts.test.ts` (14 pass). Not fail-open: it plants a real tree with a probe **directory**, a probe **file** and a **real** file, asserts non-vacuity (`toContain(real)` first), asserts the default walk hides both and the opt-in walk finds both, drives the **installed git** `check-ignore` per planted path, names the three actual reviewer files, and has a reverse non-vacuity check that real product files are **not** ignored. `PROBE_FILE_RE` is a regex **literal** (2026-08-21). The module honestly records its own residual |
| **NOTE 1** — R-97 over-claims for bare numbers | **CLOSED** | RUNNING. Amended text names five hard shapes; the code's hard set is exactly `iso-date, month-date, currency, percent, multiplier`; flag set is `plain-number, proper-noun`; `"You lose 47 hours every Sunday"` → `plain-number:flag:47`. Text and code agree |
| **NOTE 2** — two `/trends` states outside the canon sweep | **CLOSED** | READING + RUNNING. `RENDERED_STATES` now derives from a total `Record<PastedReferenceState["kind"], …>`; `refund_source_never_expires` and `pasted_reference_input` are specimens at `trends-ui.test.tsx:295-296`; `billing-ui.test.tsx:1717` now imports the canon and sweeps `Object.keys(BILLING_ERROR_COPY)` |

## Re-checks

- **R-97 / R11 — still holds.** `spin-reference.test.ts` (29 tests) green; `REFERENCE_MECHANISM_FIELDS` pinned to exactly the four; `hook` and `subjectTerms` do not compile onto `SpinReferenceMechanism`; the transcript is structurally absent. `assemble.ts` and `bundle.ts` both hash-unchanged.
- **The traceability corpus still excludes the reference block**, and **the new M4 pair does witness something.** The `month-date` row at `:508` refuses end to end with the excerpt naming `March 2024`, and its control at `:549` — the same date in the creator's own input — is `usable`. Two rows, opposite directions, same token: stronger than the ISO row it replaced.
- **Similarity gate untouched, population not narrowed.** `similarity.ts`, `output.ts`, `pipeline.ts` all hash-identical to round 1; 19 similarity + 47 pipeline tests green.
- **`prompt_bundle_version`'s move is WITNESSED, not merely asserted.** Both recorded digests reproduced from the real hasher: current `modes/hooks@cc41f0cd57b3`, and by reverting `(?!\d)` **in memory** (never in the repo) `modes/hooks@4812d0cdfa7b` — exactly as `bundle.test.ts:99` claims. The decision not to pin a literal digest is **right**: a pinned derived digest pins the hash function and reddens on every unrelated prompt edit. Only NOTE 1 qualifies it.
- **R-99 read.** The ingest/compliance half is sound: private paid analysis proposes nothing to anyone else, the queue stays fed only by evidence its curators can open, and the revisit trigger names the question it deferred. Its consequence at `system-autopsy.ts:423` is CHANGE 3.

## Checks run

- **1 (sources allowlist)** — holds. `TREND_SOURCE_ADAPTERS` exactly `{youtube, submitted}` behind `assertExactlyCompliantAdapters`; YouTube origin-pinned. All 8 manifests scanned for scraping deps — **clean, 60 deps total**; `no-scraping.test.ts` 10/10 including planted-specimen non-vacuity.
- **2 (similarity gate before display)** — holds; nothing in the fix pass touched it; thresholds still config-derived and clamped upward.
- **3 (minimum-difference rule)** — computed, not prose; side-by-side render unchanged.
- **4 (kill-test honesty)** — one rewrite then honest refusal holds, but see CHANGE 4: one refusal class names no token to the creator and another names a phantom one. Nothing streams.
- **5 (no invented specifics, REQ-I03)** — **violated** at `traceability.ts:235` (BLOCK) and `:570` (CHANGE 1). Planted-violation fixtures exist and are non-vacuous.
- **6 (no guarantees, REQ-I04)** — holds; the only hits are two code comments about a code invariant, not creator-facing copy. BLOCK 1's `3x` case is a performance claim reaching display, so it costs this check too.
- **7 (no automation, no concealment)** — holds.
- **8 (autopsy caching and honesty)** — holds; unchanged apart from CHANGE 3's preflight, which parks rather than mis-states.

## Coverage

- **Read fully**: `traceability.ts`, `traceability.test.ts`, `bundle.test.ts`, `spin-reference.test.ts` (M4/M5 blocks), `tests/support/probe-artifacts.ts`, `tests/probe-artifacts.test.ts`, `bundle.ts`'s `gateDescription`/`promptBundleVersion`, decisions R-97 (amended) and R-99, the round-2 manifest, the round-1 compliance report, code-review round-1 §0/§1/§2/§4.
- **Read in the parts that matter**: `kill-test.ts`, `assemble.ts` (`REWRITE_INSTRUCTION`), `spin-state.ts`, `spin-panel.tsx`, `generation-outcome.tsx`, `worker/system-autopsy.ts:390-445`, `frameworks.ts` (`assertMechanismLevel`, `MECHANISM_CONTENT_RULES`), `system-spend.ts` (`startAttempt`'s granted return, the R-99 gate), `autopsy-policy.ts`, `sources.ts`, `trends-ui.test.tsx`, `billing-ui.test.tsx`'s canon block.
- **Not reached** (out of lane, hash-verified unchanged): migrations 0026–0028 and snapshots, `ledger.ts`, `included-build.ts`, `export.ts`, the docker suites, `pnpm-lock.yaml`.
- **Commands run**: manifest SHA-256 over all 173 paths **before and after** (173/173, 0 mismatches both); `git status --short --untracked-files=all` over the four source roots (no new untracked file); `vitest run` on `traceability`, `spin-reference`, `bundle`, `similarity`, `no-scraping`, `probe-artifacts` (**155 passed**); `vitest run` on `trends-ui`, `trends-page`, `trends-actions`, `packages/trends`, `pipeline`, `output`, `hard-rules` (**374 passed**); eight `tsx` harnesses against the real `scanTraceability`/`offerCheck`/`buildCorpusIndex`/`bundlePartsFor`/`promptBundleVersion`/`runGeneration`, including two fuzzes (768 self-vouch, 100 suppression) and one **in-memory** regex revert to reproduce the pre-fix digest; a scan of all 8 `package.json` files for scraping dependencies.
- **Verified by RUNNING**: every one of the five BLOCK sub-claims; all of BLOCK 1 (both directions, end to end, with controls); CHANGE 1's split-corpus and three-token cases; both bundle digests; R-97's amended text; the probe-artifact guard's non-vacuity; the ingest allowlist and dependency scan. **Verified by READING**: CHANGE 3's cost model, CHANGE 4's copy paths, R-99's rationale.

## Verdict

**BLOCK**

The fix is correct as far as it was enumerated and the surrounding work is unusually good — the M4 witness pair, the probe-artifact guard and the derived canon populations are all genuine closures. But the defect that blocked round 1 was a *class*, not an instance: a `month-date` span that claims part of a following number both refuses a number the creator typed and cancels the check on one the model invented, and after the fix an adjacent month word still silently clears an invented `3x` performance claim on a shipped path with no version bump and no operator action.

**Least-confident line:** how often a creator's brain holds a month word and the *plain* form of a number the model then writes with a unit (`3` → `3x`), which is what BLOCK 1's hard-enforcement direction needs. The false-refusal direction is not in doubt — it fires on `"By June 250000 views"` against a corpus containing that exact sentence, and 42 of 768 generated self-vouch sentences reproduce it. The suppression direction is proven *systematic* (50 of 100 generated pairs, 8 hard) but real brains were not sampled, and `"June 3x"` is less likely than round 1's `"March 2024"` — an argument about frequency, not about whether the rule is wrong, and the same argument would have kept round 1's BLOCK open.
