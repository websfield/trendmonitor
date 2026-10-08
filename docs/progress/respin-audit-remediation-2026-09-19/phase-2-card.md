# Phase 2 — review card

**Scope:** `docs/plans/respin-audit-remediation-2026-09-19-phase-2.md` in full: P2-R1…R12 with their amendments, and P2-A1…A5 (register items 15, 29, 30, 37, 48).

## Measurement (P2-R1, AC1–AC2) — recorded 2026-10-06T20:11+11:00, before any edit to `claims.ts`

**Target, by hash.** It ran against the pre-Phase-2 `packages/modes/src/claims.ts`: git blob `2a1484c2`, LF sha256 `56cd6beb` (full `56cd6beb253c539a457d3c7edf133000332f35ce4bfaf3b4a7ec515db32fa8f6`). That is the **LF column**. `git ls-files --eol` reads `i/lf w/lf attr/text eol=lf`, so this tree has no CRLF form. This hash is **not** the plan's pinned `3e27d58f`/`08b08786`. `3e27d58f` is HEAD's blob. The worktree already carries Phase 1's R-154 edit (`/disclosure/` demoted to flag-only), and the orchestrator told the generator to start from that state. `output.ts` was `17d170d4` / `c0cd0c23`, also post-Phase-1 and unmodified by this phase at measurement time.

**Instrument.** `packages/modes/tests/claims-generative.test.ts` defines four properties, each run for **1,500 iterations**:

- SEPARATOR, seed `20261006`
- OCCURRENCE, seed `20261007`
- FIELD, seed `20261008`
- HONEST, seed `20261009`

The shape and guard populations come from `OUTPUT_CLAIM_SHAPES` and `CLAIM_CONTEXT_GUARDS`. Two things stood in for module data at measurement time:

- **Field axis.** The pre-fix module has no schema-derived pointer set, so the field axis was taken from `outputTextUnits` over the v1 `EVERY_SECTION` fixture plus a v2 script/ideation fixture (35 pointers).
- **FIELD oracle.** The pre-fix module carries no per-shape field scope, so R3-2's population was used: the `certainty` family plus the five own-baseline ids named in `claims.ts`'s own-baseline comment. Those shapes should refuse on every presented field (every pointer except `/disclosure/*`, per R-154). Every other hard shape should refuse on `/whyThisPerforms/` only.

**All rates are over the generator's synthetic vocabulary, not over stored creator drafts.**

| Property | Escapes / 1,500 | Classes found |
|---|---|---|
| SEPARATOR (`<hedge><sep><claim>` must refuse) | **304** | dash separators: ` — ` 49, ` – ` 44, ` - ` 59, ` — but ` 48 (**R3-3a**); colon `: ` 50 (**new class 4**); bare conjunction ` but ` 54 (**new class 5**). `, `, `; ` and `, but ` had 0. |
| OCCURRENCE (a guarded earlier occurrence hides a later unguarded one) | **360** | k=2: 189, k=3: 171 (**R3-3b**); k=1: 0 |
| FIELD (R3-2 group outside `/whyThisPerforms/`) | **441** | beats your baseline 82, better than your last 68, best-performing 65, cannot fail 62, guarantee 61, more views 57, proven to 46 (**R3-2**). All 35 presented non-explanation pointers were affected. |
| HONEST (false-fire: a hedge naming the shape in its own clause refuses) | **982** | every comma or semicolon lead-in: `Honestly, ` 252, `For now, ` 250, `In short; ` 241, `To be clear, ` 239 (**new class 6**: the guard's `^[^,;]*` needs the *whole* left text to be separator-free, so a lead-in clause detaches the negator) |

**Total: 2,087 violations in 6,000 cases, across six classes.** Three are the round-3 classes. Three are new, and each becomes a requirement of this phase:

- colon as a clause separator;
- `but` as a clause boundary with no punctuation;
- a lead-in clause causing a debited false-fire.

**False-fire numbers for the P2-R2 population choice.** Each line of text was scanned on the hard field, so the question asked was "would it refuse if this field were hard?". The population is the seven-shape R3-2 group, counted over presented units outside `/whyThisPerforms/` and `/disclosure/`:

- **Pipeline fixtures** (`packages/modes/tests/support/*`; 21 documents, 356 units): **0** would refuse.
- **Stored generations** (local `respin-postgres`, 42 rows with output, 564 units): **0** would refuse.
- **Synthetic non-claim vocabulary** (10 hand-written lines, one or two per shape, e.g. "You can't miss the switch on the left side.", "Want more views? Cut the first second."): **10 / 10** would refuse. No non-claim reading of `proven to` was found, so no line was written for it.

**After the fix** (same seeds, same 1,500 iterations, schema-derived field axis, per-shape scope read from the module): SEPARATOR 0, OCCURRENCE 0, FIELD 0, HONEST 0. Non-vacuity holds in both directions:
- every hedgeable shape is reached at k = 1, 2 and 3;
- every hard shape is seen refusing;
- refusals and flags each exceed 20% of FIELD draws.

The population choice this count made is R-168: `guarantee`, `proven to` and `best-performing` refuse on every presented field. The other four stay explanation-only.

## Build (2026-10-06, `respin-engineer`) — engineering only; no gate has run

| Req | Proof | Result |
|---|---|---|
| P2-R1 | `claims-generative.test.ts`, four properties × 1,500, seeds `20261006`–`20261009` | pre-fix 2,087 / 6,000 (above); post-fix 0 |
| P2-R2 | `claims.test.ts` "THE PER-FIELD × PER-SHAPE TABLE": every schema pointer × every shape, the `/disclosure/*` row, and AC4 (`guarantee` / `proven to` / `best-performing` refuse on `/caption/text`, `/hooks/0/text`, `/beats/0/vo`, `/thesis/statement`) | pass |
| P2-R3/R4 | AC3 sentences, plus colon / `but` / spaced-hyphen / en-dash / lead-in cases in `claims.test.ts`; `hard-rules.test.ts` covers the shared separator in all three antithesis shapes | pass |
| P2-R5 | `output.test.ts`: the schema's string leaves equal `outputTextUnits` across both contracts (31 pointers). AC5 plant: a `planted: line()` added to `beatsSection` turned it red (`'/beats/*/planted'`); removing it turned it green | pass |
| AC8 | `TRACEABILITY_LIMIT_NOTE` is **true** in the AC's sense (every string leaf is scanned, now asserted), so the wording is unchanged and Phase 6 AC6 is unaffected. Residual: closed numbers (`atSeconds`, filming `minutes`) are structure, not text, and are not traced | true |
| P2-R6 | `displayableSpin` = `presentedTextUnits` minus `SPIN_RESULT_EXCLUDED_FIELDS`. `trends-actions.test.ts` asserts set equality on a document carrying every section. `import-boundary.test.ts` shows `outputTextUnits` is denied by name, by deep path and by relative path, and that neither facade re-exports it. **Omission stated, not parity** (`spin-honesty-omission`) | pass |
| P2-R7 | Both counterexamples now refuse, and the whole-sentence reading would clear them; the comment and test are corrected. `REMEDIES.performance` is reworded and pinned, and the `kill-test.test.ts` canon scan still passes | pass |
| P2-R8 | `check-marker.test.ts`: exact-token triple; 37 prose lines in 15 files (re-measured; the plan said 17 sites in 11 files, but launch-era copy has been added since); plants. `results/page.tsx` → `checkMarker` prop | pass |
| AC10 | `modes/hooks` `c6a3db7a00f0` (pre-change) → `03a8d94438bf`. Source mutations: `guarantee` scope → `3c09657247ce`; one negator dropped → `ef90cf69c00c`; first-occurrence only → `ab8e2e115cff` | moves |
| P2-R9 | `proposal.test.ts` "R-169 property 4"; strength witness added to `promotion-ops.test.ts` | pass |
| P2-R10 | Migration **0068**. `promotion-ops.test.ts` runs stale → fresh row (the stale row byte-identical); rejected / accepted gain no sibling; an index-level refusal; legacy-unverified stale row never reopened. `db:check` clean | pass |
| P2-R11 | `trends.test.ts` checks enum = names and CHECK = reasons, with plants. `tiktok` plants at three `trends-storage.ts` sites each fail typecheck. `grep -rn quote_budget_exceeded packages` → 0 | pass |
| P2-R12 | Measured writer set `{with-workspace.ts: shorthand}`; 14 context-excluded keyed sites pinned; 4 plants red, 2 non-plants clear, a deleted derivation → red | pass |
| P2-A1 | `comparison.test.ts`: n = 1 for nested windows; a self-reported-only population builds no group. `results-verification-unavailable.test.tsx` drives real `buildComparisonGroups`; the four sentences pass the canon | pass |
| P2-A2 | `promotion-ops.test.ts` (i), (ii), (iii): version count unchanged; `decision_reason` CHECK | pass |
| P2-A3/A5 | `results-log-action.test.tsx`: count 2 of 5; sentinel never serialises. `results-honesty.test.tsx`: versions sentence | pass |
| P2-A4 | `similarity.test.ts`: "If this is you" verbatim refused; prose sharing stopwords passes; empty-return list `[sequenceSimilarityOf, scoreSpan]`; a planted third → red | pass |

**Mutations.** 12 source mutations, all red, each restored byte-identical: M1 span exclusion, M2 clause boundary, M3 occurrence, M4 stopword fallback, M5 n by rows, M6 unfillable group, M7–M9 family guard (i)/(ii)/(iii), M10 count, M11 whole review, M12 home → `[verify]`. Under M12 only `check-marker.test.ts` goes red; `promotion-panel`'s `asPlaceholder` follows.

**Plan deviations, stated.**
- **Pre-fix hash.** The measurement ran on the post-Phase-1 bytes, not on the plan's pinned `3e27d58f` (orchestrator instruction).
- **Separator constant.** It gains the colon, and an in-word hyphen is no longer a separator. Both were measured, and both are recorded in R-168.
- **drizzle API.** `onConflictDoNothing` takes `{ target, where }` in drizzle-orm 0.44.7. The plan named `targetWhere`, which belongs to `onConflictDoUpdate`.
- **Prose-mention count.** The set is pinned as file → count, because line numbers drift.
- **R-171 column.** R-171 needed a column (`decision_reason`) plus a CHECK, which went into the census.
- **Files beyond the table**, each a direct consequence:
  - `spin-state.ts` (the exclusion list);
  - `trends-actions.test.ts`, `results-comparison.test.tsx`, `results-comparison-contract.test.ts`, `results-schema-write.test.ts`, `results-log-action.test.tsx`, `profile-cage.test.ts` (sentences / n / projection / pinned surface);
  - `results-schema.ts` (projection);
  - `lifecycle-column-census.ts`;
  - `packages/modes/src/index.ts`.
- **Probe race.** `connector-verified-closure.test.ts` skips planted probes (`isPlantedProbePath`). It had raced `lib/__p6b_probe.ts`.

**Line endings.** `git ls-files --eol` reads `w/lf` on every touched file. `similarity.ts` was `w/crlf` before this phase and was normalised. `brain-content.ts` is `w/crlf`; that predates this phase, and it is not edited here.

**Validation (final, after the last edit).** Every command below was run by the builder and exited 0: `typecheck`, `lint`, `worker:typecheck`, `preflight`, `db:check` (with 0068 applied live first) and `build`.

- Unit run: 6,717 passed, 0 failed, 140 skipped.
- Live run (`TEST_DATABASE_URL`): 6,854 passed, 0 failed, 18 skipped. It passed on the first run.

An earlier unit run is not counted. It had 9 failures: 7 from this phase, all fixed above, and 2 timeouts in spawn-bound suites (`setup.test.ts`, `restore-verify.test.ts`) that passed on the final run.

## Gate batch 0 fixes — widened generator, measured BEFORE the redesign

Recorded 2026-10-06T22:32+11:00, before any edit to `claims.ts` in this batch. Target: blob `674025e6`, LF sha256 `648da4ef` (the first-build bytes). Seeds 20261006–09 with 1,500 iterations each. All counts are over the generator's synthetic vocabulary.

The generator was widened in four ways:

- **Connective axis:** 21 forms — separators; and/but/or/so/yet/because/while/although/since/that/which-means; a parenthesis; a slash.
- **Aside axis:** dash pair, parentheses, comma parenthetical.
- **Negation-form axis:** subject through a reporting verb, determiner, auxiliary (hand table, 13 shapes).
- **Fields:** every field each shape refuses on. The FIELD oracle is now a hand-written table, not `claimFieldsFor`.

| Property | Escapes / 1,500 | Classes |
|---|---|---|
| AFFIRMED (claim after a negated clause must refuse) | **764** | every conjunction / relative pronoun / paren / slash connective: `that` 80, `(and` 72, `/` 66, `although` 67, `because` 65, `which means` 63, `since` 63, `and` 63, `or` 59, `while` 57, `yet` 57, `so` 52. Punctuation connectives had 0 |
| OCCURRENCE | **0** | — |
| FIELD (hand oracle) | **10** | `/premise/basis/excerpt` 6, `/ideas/0/premise/basis/excerpt` 4 — the creator's own quote refused |
| HONEST (negator governs the claim; must not refuse) | **1,237** | verb/determiner forms 742 ("can't guarantee", "isn't proven to", "won't go viral" — not read at all); subject+aside 463; subject 32 |

**Total: 2,011 / 6,000.** The narrow first generator reported 0 against these bytes. It never varied the axes that fail.

**After the redesign** (same seeds and iterations, and the same widened generator, now with a hand-written FIELD oracle): AFFIRMED 0, OCCURRENCE 0, FIELD 0, HONEST 0.

One residual is pinned in `KNOWN_VOCABULARY_GAPS` as a false-fire: "No draft is one that can't miss." — a negated antecedent reaching into its own relative clause. It was taken out of the generator's negated-form table with that reason.

### Gate specimens — outcome after the fix (`claims.test.ts`)

- **Not refused (flag):**
  - "I can't guarantee this works for you." (caption)
  - "No guarantees, just what worked for me." (hook)
  - "This isn't proven to work for everyone." (VO)
  - "Nothing — and I mean nothing — is guaranteed here."
  - "Nobody but you can guarantee it lands." — flagged as `ambiguous-clause`
  - "Nothing in this draft, as written, is guaranteed."
- **Refused (hard):**
  - "Nothing beats a method that is guaranteed to work."
  - "Nobody talks about this and it's proven to work."
  - "Nothing else matters and this hook goes viral."
  - `which means`, `because`, `(and …)` and `/` connectives
  - "No doubt this will perform."
  - "Not only will this perform, it will outperform…"

### Fixes in this batch

- **Claims:** `readClause` / `withoutAsides` / `withoutCommaAside` / `clauseStart` / `NEGATOR` / `CLAUSE_WORDS` / `AMBIGUOUS_CLAUSE` / `CREATOR_QUOTE_LEAVES` (`packages/modes/src/claims.ts`); bundle hashes `CLAUSE_WORDS` plus two new probes.
- **Surfaces:** Spin renders `KillTestBlock`; Sample Spin `claimFlags`; the export witness; `tests/claim-flag-surfaces.test.tsx`.
- **Scope authority:** `presentedTextUnits` reads `NOT_PRESENTED_FIELD_PREFIXES`; Spin's exclusion list is the weakest point only (R-172).
- **Similarity:** hook units only; contractions expanded; token edit distance ≤ `k = floor(n × (1 − strictness))`; `NEAR_VERBATIM_RUN` removed.
- **Learning:**
  - `billing-errors.ts` `result_treatment_key` copy reworded, and the scanned sentence-class test added;
  - the results-family guard compares treatment members only and re-derives through the comparison, with three live witnesses;
  - R-170's no-generation fallback is a deferral row in the master plan.
- **Tenancy:**
  - `projectPromotionReview` (`results/promotion-review.ts`) is applied on page load and in the action, with a page-props sentinel witness;
  - the scoped `brainActivationsByIds` accessor plus `latestBrainActivation` replace both raw selects;
  - `brain-content.test.ts` normalises CRLF.
- **Hard-rules Low:** the in-word-hyphen splice is pinned by `hard-rules.test.ts`.

**Mutations, this batch:** 11 planted mutations. 10 went red on the first run. B7 (fallback reads every unit) stayed green, so a witness was added for it — the same stopwords as a whole VO beat — and B7 is now red. Each mutated file was restored byte-identical.

**Validation, gate batch 0 fixes, after the last edit.** Builder-run commands, all exit 0: `typecheck`, `lint`, `worker:typecheck`, `preflight`, `db:check` and `build`.

- **Unit:** 6,761 passed, 0 failed, 140 skipped.
- **Live (`TEST_DATABASE_URL`):** 6,898 passed, 0 failed, 18 skipped, first run.

An earlier unit run in this batch had 1 failure: AC-13 had not pinned `resultDraftsFrom`. That is now pinned, and the run is not counted.

## Owner decision 2026-10-07 — "strict + free refusal" (R-173)

**Generator re-cut for the strict contract, measured before the change** (`claims.ts` blob `38e9eb30`, LF sha256 `0758f8bd`; seeds 20261006–10; 1,500 iterations each). HONEST now asserts that allowlisted hedges flag. A new UNDER property asserts that an off-allowlist negator never softens a claim. The 7 compliance specimens are fixed cases run on every field that refuses. The weakest point is now a flag-only field in the oracle.

| Property | Before | After |
|---|---|---|
| AFFIRMED | 0 | 0 |
| OCCURRENCE | 0 | 0 |
| FIELD (hand oracle; weakest point flag-only) | 33 (all `/whyThisPerforms/weakestPoint`) | 0 |
| HONEST (allowlisted hedges flag) | 0 | 0 |
| UNDER, generative (off-allowlist negators) | 843 (`never post again until you know` 182, `nobody talks about how` 185, `not everyone knows` 176, `nothing beats knowing` 155, `you won't believe how` 145) | 0 |
| UNDER, compliance specimens × refusing fields | 157 | 0 |

**Total before: 1,033. After: 0.**

The first allowlist draft let "Nothing else matters yet it is proven" and "Nothing beats knowing results are guaranteed" read as hedges. The generator measured 26 such cases. The fix was to restrict the words between a negated subject and its verb to a written-out noun-phrase vocabulary.

### Specimen outcomes (`packages/modes/tests/claims.test.ts`, "STRICT + FREE REFUSAL")

**Compliance gate: all 7 REFUSE.** They are also fixed cases in the generator, run on every field that refuses.
- "Don't miss this guaranteed growth hack."
- "Never post again without this guaranteed hook."
- "No more guessing with this guaranteed method."
- "Not everyone knows this method is proven to work."
- "You won't believe how this is guaranteed to work."
- "Nothing but guaranteed growth."
- "Nothing is certain-this will perform."

**Billing gate: these REFUSE now, and each is free under R-173.**
- "Zero guarantees here."
- "Without any guarantee, this is how I shoot it."
- "Is this guaranteed to work?"
- "If this were guaranteed to work, everyone would do it."
- "They say it's proven to work."
- "Nothing about this low-key hook will perform."
- "Nothing — and I mean nothing — is guaranteed here."
- "Nobody but you can guarantee it lands."
- "Nothing in this draft, as written, is guaranteed."

**Allowlisted hedges FLAG.**
- "I can't guarantee this works for you."
- "No guarantees, just what worked for me."
- "This isn't proven to work for everyone."
- "There's no guarantee this works."
- "Nothing in this draft is guaranteed."
- "Nothing here makes it go viral."

**Weakest point is flag-only.** "It's unlikely to go viral." and "It is not guaranteed that this will perform." both FLAG.

**Similarity** (`packages/modes/tests/similarity.test.ts`)
- REFUSE: the stopword reference copied verbatim into the caption, the thesis or a beat VO.
- PASS: "…if this is the only take" in a beat.
- PASS: "What if" against the hook "What if you shot it in one take?". The identical hook "What if" refuses.

### Free refusal (R-173 part 2)

**Producers.** `grep -rn "debitCredits(" --include=*.ts --include=*.tsx .`, excluding `node_modules` and tests, finds three call sites:
- `generate.ts:1822` — every generation path. This is the only one changed.
- `inference.ts:1133` — no claim scan runs on it.
- `pasted-reference.ts:307` — debits before any model call.

The definition is `ledger.ts:406`, and `ledger.ts:425` is the only `kind: "debit"` writer.

**Priced paths × three outcomes.** These are in `packages/credits/tests/saved-generation.test.ts` and run on PGlite and on real Postgres, 30 passing.
- Paths: `studio (hooks)`, `first ideas (onboarding ideation)`, `Spin`, `saved revision`, `piece commission`.
- `R-173 $path: a CLAIM-ONLY refusal costs 0 credits, writes no debit, and leaves its usage as system spend`
- `R-173 $path: a claim the REWRITE clears is charged EXACTLY ONCE at the normal price`
- `R-173 $path: a MIXED-CAUSE refusal keeps today's charge`

**Race** (`generate-race.docker.test.ts`, live):
- "R-173: a FREE claim refusal and CONCURRENT charged presses in one workspace — the free one never debits, each charged one debits exactly once" — this case includes two concurrent replays of the settled free attempt.
- "R-173: a free claim refusal SETTLES even when another connection drains the balance mid-flight".

**Copy tests.** In `tests/studio-ui.test.tsx`, four "R-173:" cases: the charge sentences, the honest-refusal panel plus held-settle, the saved revision sentence, and the projection. In `tests/trends-ui.test.tsx`, the Spin withheld and held-settle cases.

**Mutations.** 3 planted, all red; each file was restored from its copy.
- Debit the free refusal: 5 red.
- Consume its usage: 5 red.
- Count every failed rule as claim-only: 5 mixed-cause cases red.

**Validation after the last edit.** Builder-run commands, all exit 0: `typecheck`, `lint`, `worker:typecheck`, `preflight`, `db:check` and `build`.
- **Unit:** 6,806 passed, 0 failed, 142 skipped.
- **Live (`TEST_DATABASE_URL`):** 6,960 passed, 0 failed, 18 skipped.

Two earlier runs in this batch are not counted:
- A unit run with 2 failures. `isolation.test.ts` flagged an exported helper with no claim; it is now module-private. A `setup.test.ts` CLI timeout happened while `build` ran concurrently; that file passes alone.
- A `build` that was killed by my 290 s timeout while the tests ran.

## R-173 verification fixes (compliance BLOCK, billing NEEDS CHANGES), 2026-10-07

**Closed allowlist.** `CLAIM_HEDGE_ALLOWLIST` holds 5 entries and 83 written-out phrases, with no free word and no reporting or factive verb. A phrase counts only through `hedgeHolds`: no second negator in the sentence, not a question or "who says", and no exception after it. The full list is in R-173.

**Generator, measured before the change.** The previous `claims.ts` (blob sha256 prefix `29e3e89f`) was run against the new generator. The new allowlist was appended as DATA only, so the imports resolve; the old scan does not use it. The "before" counts include the weakest-point oracle change (item 5).

| Property | Before | After |
|---|---|---|
| AFFIRMED | 558 | 0 |
| OCCURRENCE | 615 | 0 |
| FIELD | 224 | 0 |
| HONEST (allowlist phrases flag) | 0 | 0 |
| UNDER, off-allowlist frames | 256 | 0 |
| UNDER, allowlisted phrase negated, questioned or excepted (new, seed 20261011) | 1,500 | 0 |
| UNDER, 15 compliance specimens × fields | 183 | 0 |

**Total before: 3,336. After: 0.** The first run after the change found 183 more: questions such as "No guarantee here?" read as statements, because `sentenceUnits` drops the `?`. The scan now keeps each sentence's terminator.

**Specimens** (`claims.test.ts`)
- REFUSE: "Nobody tells you this hook is guaranteed to work."
- REFUSE: "Nothing says growth like this guaranteed hook."
- REFUSE: "Nothing makes it go viral faster than this hook."
- REFUSE: "Nothing shows this is the best-performing hook like the numbers do."
- REFUSE: "Who says this isn't guaranteed?"
- REFUSE: "Nothing here means the results aren't guaranteed."
- REFUSE: "Never not guaranteed."
- REFUSE: "Nothing is ever guaranteed, except this hook."
- On the weakest point: "Results are guaranteed." REFUSES; "It's unlikely to go viral." and "It is not guaranteed that this will perform." FLAG.

**Similarity** (`similarity.test.ts`). Each of these REFUSES:
- "It’s not you" (curly apostrophe) as a hook, against "It's not you";
- "It is not you, it is the lens" in a beat;
- "Do not do this before a shoot", against "Don't do this";
- "If it is you, keep watching" in a caption, against "If it's you";
- "I cannot even", against "I can't even".

A subject term now matches across apostrophe spellings and across a hyphen.

**Billing**
- **Item 6.** A refused draft's sentences are not projected. The witnesses are the `SENTINEL:` tests in `studio-ui.test.tsx` and `saved-generation.test.ts`.
- **Item 7.** Both generation-cap messages name the claim cause and its remedy (`usage-honesty.test.tsx`, "R-173: both generation caps…").
- **Item 8.** `settleGeneration` derives the system-spend flag and refuses a caller value that disagrees (`generation-write.test.ts`, "R-173: settleGeneration DERIVES…"). `tests/claim-refusal-agreement.test.ts` binds the db and modes copies of the predicate.
- **Item 9.** The copy is neutral: "a claim this product won't make".

**Mutations, all red, each file restored byte-identical.**
- Stopword decision moved back to content words: 4 red.
- Apostrophe and hyphen normalisation removed: 1 red.
- Each of three refusal redactions removed in turn: the projection's `unit`, `honestRefusal`'s excerpt, and the stored-reason headline cut. 1 red each.
- The settlement's disagreement check disabled: 1 red.

**Validation after the last edit.** Builder-run commands, all exit 0: `typecheck`, `lint`, `worker:typecheck`, `preflight`, `db:check` and `build`.
- **Unit:** 6,839 passed, 0 failed, 142 skipped.
- **Live (`TEST_DATABASE_URL`):** 6,993 passed, 0 failed, 18 skipped.

These runs are not counted:
- An earlier unit run with 3 failures. Two credits tests asserted that a refusal reason quoted a finding's excerpt; that excerpt now lives only on the stored kill test, and the assertions moved there.
- A lint run that found two control bytes my edit script had written into `usage-honesty.test.tsx`. Each was replaced with `\b`, and every touched file was re-scanned.

One comment-only edit landed in `saved-generation.ts` while the unit run was in progress. It was a docblock correction; the live run started after it and ran on the final bytes.

## Endpoint rule after the final compliance BLOCK (2026-10-07) — NOT RE-REVIEWED

The final compliance check returned BLOCK, in the same class. The owner capped reviewer runs, so **Phase 2 is recorded as Not yet**. The coordinator directed this endpoint rule to be applied anyway, because it only refuses more and a claim-only refusal is free (R-173). **No reviewer has seen this change.**

**The rule.** A hard performance or certainty shape is admitted (flag) only when all of these hold:
- its WHOLE normalised sentence is an allowlisted phrase plus at most one `CLAIM_HEDGE_TAILS` entry;
- it is the unit's last sentence;
- no other sentence of the unit carries an exception word.

On the weakest point, an exact `ADMISSION_HEDGE_PHRASES` sentence is also admitted. Everything else refuses. `cannot fail` now also covers won't, will not and never. The similarity main path splits hyphens with the same normaliser.

**Generator, measured before the change.** The previous `claims.ts` (sha256 prefix `af932657`) was run against the new generator, with the tail list appended as data only.

| Property | Before | After |
|---|---|---|
| AFFIRMED (admission field no longer skipped) | 28 | 0 |
| OCCURRENCE | 0 | 0 |
| FIELD | 0 | 0 |
| HONEST (allowlist × tail list) | 77 | 0 |
| UNDER, off-allowlist frames (admission field included) | 281 | 0 |
| UNDER, negated, questioned or excepted | 0 | 0 |
| UNDER, trailing affirmation or later sentence (new, seed 20261012) | 1,405 | 0 |
| UNDER, 25 compliance specimens × every refusing field | 253 | 0 |

**Total before: 2,044. After: 0.**

**Reviewer specimens: all REFUSE** (`claims.test.ts`, "THE ENDPOINT RULE (final verification)" and the weakest-point cases).
- "There's no guarantee like this hook."
- "No guarantee comes close to this hook."
- "I don't guarantee results, the hook does."
- "Nothing is guaranteed; this hook is."
- "No guarantee, it just works every time."
- "I can't guarantee anything less than results."
- "Results aren't guaranteed, they're inevitable."
- "Nothing here is guaranteed... except results."
- "Nothing here is guaranteed! Results are."
- On the weakest point: "Nobody tells you this hook is guaranteed to work." and "It's unlikely this won't go viral."
- "This won't fail." now produces a hard `cannot fail` finding.

"We promise it lands." and "It's certain." are pinned as misses in `KNOWN_VOCABULARY_GAPS`.

**Mutations, all red, each file restored byte-identical.**
- The main similarity path's hyphen split removed: 1 red.
- The last-sentence condition removed: 3 red.

**Validation after the last edit.** Builder-run commands, all exit 0: `typecheck`, `lint`, `worker:typecheck`, `preflight`, `db:check` and `build`.
- **Unit:** 6,862 passed, 0 failed, 142 skipped.
- **Live, second run:** 7,016 passed, 0 failed, 18 skipped.

**The first live run failed and is reported.** It had 7,015 passed and 1 failed: `setup.test.ts` › "with NEITHER env var set…" timed out at 60 s. That test spawns the `stripe:setup` CLI, and this change does not touch it. The file passed alone (9/9) and in the full second run.

An earlier `lint` run caught an unused helper in the generator. It is now asserted against `ADMISSION_CLAIM_FIELDS`.

---

## Review card (2026-10-07)

| # | Row | Result |
|---|---|---|
| 1 | **Overall** | **Not yet / D**, by the owner's decision. The last authorised compliance run (round 3) returned **BLOCK**, the same class as before: a sentence that matches a hedge phrase can still promise. The endpoint rule above answers that BLOCK and is **not re-reviewed**. Learning honesty and tenancy are closed. Billing's R-173 Mediums are fixed and noted. |
| 2 | Validation gate | After the last edit: `typecheck`, `lint`, `worker:typecheck`, `preflight`, `db:check` and `build` exit 0. Unit: 6,862 passed / 0 failed. Live run 2: 7,016 passed / 0 failed. Live run 1 had 1 timeout in `setup.test.ts` (Stripe CLI spawn, untouched by this phase); it passed 9/9 alone and passed in run 2. Migration `0068` (plan label 0064) applied live. |
| 3 | Acceptance criteria | See the sections above. Generator measured before any fix: 2,087 escapes (P2-R1). Each later round re-measured before its fix (2,011 → 0; 1,033 → 0; 3,336 → 0; 2,044 → 0). A1: n counts distinct posts. A2: duplicate accept writes no version. A3: proposed-only count. A4: stopword-hook copies refuse in every presented unit. A5: review transport projected on both producers. R-173: five priced paths × three outcomes, plus two Docker race cases. |
| 4 | Critical Paths | **Spin compliance:** NEEDS CHANGES (1 High) → re-run NEEDS CHANGES (2 High, same class) → owner decision R-173 → verification BLOCK → fixes → final run (owner's last) **BLOCK**, same class → endpoint rule, unreviewed. **Billing:** NEEDS CHANGES (3 High) → re-run NEEDS CHANGES (1 High, same class) → owner decision R-173 → verification NEEDS CHANGES (2 Medium) → fixed and noted. **Learning honesty:** NEEDS CHANGES (2 Medium) → re-run **PASS**. **Brain tenancy:** NEEDS CHANGES (2 Medium, 1 Low) → fixed and noted. |
| 5 | Open | The round-3 BLOCK is answered by the sentence-equals-hedge rule, not verified by any reviewer. Known vocabulary gaps are pinned in `KNOWN_VOCABULARY_GAPS`: "We promise it lands.", "It's certain.", "No draft is one that can't miss." Free refusals count toward the uncharged-attempt cap; the cap copy now names the remedy. |
| 6 | Definition of Done | (1) Green, as in row 2. (2) Row 3. (3) Row 4: compliance is not PASS. (4) Decisions R-168 (label R-142), R-169 (R-143), R-170 (R-156), R-171 (R-157), R-172 and R-173. **R-173 is owner-decided (2026-10-07)** and amends R-68, R-168 and R-172. (5) Reachable: `/studio`, `/trends`, first-ideas, saved, Sample Spin, `/results`. |
| 7 | Diagnosis (same-class recurrence) | Three rounds tightened a hand-written English parser that decides whether a negator governs a claim. Each tightening moved the hole rather than closing it. R-173 changed the economics: a claim-only refusal is free. That made the closed-allowlist endpoint possible (a sentence is admitted only if it **is** a known hedge). The remaining risk is vocabulary gaps (synonym promises), not scope parsing. |
| 8 | Gate spend | `Gate ran: 4 runs · 2 re-runs · 2 owner-authorised verification runs` (billing, tenancy, merged compliance+learning; billing and compliance re-run; R-173 billing and compliance verification; final compliance run). Frozen fingerprints: `70da7d55e48f78c6`, `bb7c59faac562b8c`, `72c9691efe828447`, `29c4218afa5ba285`. |
