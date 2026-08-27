# Plan review — Respin M2b-1 (round 4)

**Draft reviewed:** [`../plans/respin-m2b1-brain-surface-plan.md`](../plans/respin-m2b1-brain-surface-plan.md) (round-4 revision, 2026-08-25), plus the two modules built ahead of it (`respin/packages/db/src/brain-content.ts`, `respin/packages/db/src/echo.ts`) and the edited [`../plans/respin-m2b2-metered-inference-scope.md`](../plans/respin-m2b2-metered-inference-scope.md).
**Verdict: NOT READY.** All four reviewers **BLOCK**.

| Reviewer | Verdict | BLOCK | CHANGE | NOTE | Round-3 blocks closed |
|---|---|---|---|---|---|
| `respin-tenancy-reviewer` | BLOCK | 2 | 6 | 6 | **2 of 2 at the named instance** |
| `respin-compliance-reviewer` | BLOCK | 2 | 8 | 4 | **2 of 2 at the named instance** |
| `respin-learning-reviewer` | BLOCK | 2 | 11 | 4 | **2 of 3 fully, 1 partial** |
| `respin-billing-reviewer` | BLOCK | 1 | 7 | 5 | **1 of 2 fully, 1 partial** |
| **Total** | | **7** | **32** | **19** | |

**Trend: 20 → 12 → 9 → 7 BLOCK.** Still converging. The entry gate is green and independently re-verified: **typecheck 0 · eslint 0 · 696 passed / 696, 38 files, zero skips**, on the CI shape with Docker live.

---

## The defining fact of this round

**Every reviewer closed the round-3 finding it was handed, and every reviewer found the same class open one level down.** Not one of the seven blocks is a re-litigation of round 3; all seven are the *next* instance of a class round 3 named. Four rounds have now produced the same shape, and this round it happened inside code that was built specifically to stop it.

Round 3's diagnosis was that *prose specification of toolchain semantics keeps failing on contact*. Building the two modules fixed that — the toolchain facts are now settled and no reviewer disputed one. What it did not fix is the layer above: **which properties get specified at all.**

## The one finding that matters most, because it is a false claim of mine

**`P-2` is marked RED in the plan. It is green.** The learning reviewer implemented the exact mutation ("enumerate from the payload instead of the schema" — the defect C-1 exists to prevent) and measured it byte-identical to the real enumerator on every fixture the landed suite exercises. **Independently reproduced here before writing this line:**

```
voice     real=["/register","/sentenceRhythm","/signatureMoves/0","/avoid/0"]  mutant=IDENTICAL
voice     real=["/register","/sentenceRhythm"]                                 mutant=IDENTICAL
strategy  real=["/audience","/positioning","/pillars/0","/pillars/1"]          mutant=IDENTICAL
killtest  real=["/rules/0"]                                                    mutant=IDENTICAL
DISCRIMINATING FIXTURES: 0 of 4
UNDECLARED-KEY  real=["/rules/0"]  mutant=["/rules/0","/surprise"]
```

Every registered kind's instance leaves coincide exactly with its schema claims, so no fixture can tell the two implementations apart. Only an undeclared key discriminates, and no fixture has one.

This is **the third occurrence of the vacuous-test class in this milestone**, and the second false verification claim — after the "restored byte-identical" claim that was false, which the plan records as its most useful lesson. Writing that lesson into the plan did not prevent me from reproducing it one round later, on the criterion guarding the root fix.

## The seven blocking findings, by root

**ROOT A — "claim-bearing by construction" is a marker with nothing enforcing that it is applied. Four blocks, all four reviewers.**

1. **`assertClosedSchema` accepts any unmarked scalar leaf** *(learning, billing — both measured)*. `z.strictObject({sneaky: z.string()})` passes: a declared position that needs no evidence, is not confirmable, cannot hold `[check]` (a bare `z.number()` rejects it), passes the activation gate vacuously, and reaches the export. Round-2 V1's harm, with the deciding actor moved from the model to a schema author who forgets a wrapper. `brain-content.ts:63-64` asserts the property in a comment that no test asserts — the 2026-07-30 lesson.
2. **`assertClosedSchema` has no production caller** *(tenancy, measured; compliance + learning as NOTE)*. Its only call sites are its own recursion and `brain-content.test.ts:68`. `parseBrainContent` does not call it. **The plan's claim that it "walks the whole registry" describes a `for` loop in a test.** Verified here independently.
3. **`enumerateClaimFieldsOf` fails OPEN on exactly the shapes `assertClosedSchema` refuses** *(tenancy, measured)*: `record → []`, `any → []`, non-claim union `→ []`, array-claim-with-non-array-instance `→ []`. The sibling walker in the same change fails *closed* (`ContentWalkError`) and says why. No AC, no mutation.
4. **`[check]` is representable but never required** *(compliance, measured)*. `parseBrainContent` accepts an invented specific with `placeholderFields → []`. AC-18 checks entry-pointer → schema-leaf; **nothing checks claim-position → ≥1 entry.** C-1's thesis is that "the model decided what was walked"; C-18 closed representability and left the model deciding which of its claims are placeholders.

**ROOT B — a bar was scoped where it was named, not where the class lives. Two blocks.**

5. **The quote-level bar's corpus is unscoped** *(billing)*. C-24 time-scopes `assertNoReferenceEcho`; the second corpus, built inside `validateSourceEvidence` and re-run at activation by task 11, is untouched. A pause-exempt `appendOnboardingInput` between write and activation still bricks a version permanently, remedy a priced rebuild — round-3 block 9, one path over.
6. **`brain_docs.reason` is model-written unbounded free text on the same row** *(compliance)* — echo-unchecked, quote-budget-unchecked, export-included. `content`'s key space is now server-owned; the free-text sibling column one field over is covered by no instrument in this plan.

**ROOT C — a criterion that cannot detect its own defect.**

7. **P-2 is marked RED and is green** *(learning, measured; reproduced here)*. See above.

## Notable CHANGEs that are really block-shaped

- **`GUARDED_WRITE_FIELDS` holds drizzle camelCase property names** *(billing, measured on drizzle + PGlite)*. C-23 names `evidence_counts`; the guard would strip a key drizzle never reads while `evidenceCounts` sails through, and a smuggle fixture in snake_case **passes with the guard removed** — P-35 could never redden. Same risk on all five new columns. Verified here: every existing entry is camelCase.
- **`GUARDED_WRITE_FIELDS` has no completeness test** *(learning)*. Round 2 missed `status`, round 3 missed `version`, round 4 missed `evidence_counts` — three consecutive rounds, one field each. C-23 says "the mechanism already exists; being explicit is the whole fix", which is the instance-level fix again.
- **U+00AD SOFT HYPHEN defeats the echo bar entirely** *(compliance, measured)*. `ZERO_WIDTH` is an enumerated list; U+00AD is `\p{Cf}`, untouched by NFKC, and routinely inserted by PDF/web text extraction — so a reference post pasted from a hyphenating source silently disables the bar for that input. The counterexample-list shape the 2026-08-18 lesson forbids, in the module built to honour it.
- **The ICU check is lazy, not load-time** *(learning, measured)*. Importing `echo.ts` with a throwing `Intl.Segmenter` succeeds with **0 constructions**. It still fails closed, but no test stubs the segmenter, so **P-7b is vacuous in the same direction P-7 was.**
- **AC-45's stated mechanism cannot occur** *(compliance + learning, both measured)*. With every node `z.strictObject`, an unknown nested key is **refused, not stripped** — so the smuggle can never reach the store step and a mutant that stores the caller's payload passes. The load-bearing property is TOCTOU (a getter payload yields different text on the second read), which no criterion names.
- **AC-42 records `C-1..C-22` where the plan is `C-1..C-26`** *(compliance + billing)*. The four decisions closing round-3 blocks 5, 7, 8 and 9 can be absent from `decisions.md` with every AC green. My own inconsistency, introduced this round.
- **AC-21 names 3 sites in 1 file where the measurement is 7 type-position guards in 2 files** *(tenancy)*. The same 3-of-12 arithmetic round 3 blocked on, now on the `@ts-expect-error` guards — including the four in `profile-scope.test.ts` protecting against **silent brain activation**.
- **The plan misstates a shipped constant** *(compliance)*. It says `SEGMENT_SEP = "—"`; the code says the escape `\u0000`. Caused by my own blanket control-character cleanup, in the section whose entire argument is that claims should be measured. Golden rule 1.

## What round 4 genuinely closed

Named so they are not reopened:

- **All four round-3 toolchain disputes are settled and undisputed.** Every reviewer independently re-ran the measurements and confirmed them: `.strict()` non-propagation, `z.record` returning the key space, `Intl.Segmenter("und") → en-AU`, zod now a real `@respin/db` dependency at 4.4.3.
- **C-1's declared shapes are genuinely refused.** Compliance ran 13 open-node shapes (`catchall`, `looseObject`, `nullable`, `pipe`, `catch`, `tuple`, `intersection`, `lazy`, `record`-inside-`claim`, `claim(z.any())` …) — **every one refused.** Round-3 block 1 is closed for everything the schema author declares.
- **C-18 is closed.** `claim()` of number / boolean / string / enum all accept `"[check]"`; a bare `z.number()` does not. The placeholder is representable at rest for every JSON type.
- **C-26 (auto-top-up) is RESOLVED** — billing: "No model call happens on the triggering attempt, so the tokens-spent/debit-refuses window is gone rather than moved."
- **C-11's pause classification did not regress**, and billing hunted a third time for an unclassified operation and **found none**.
- **The billing Critical-Path trigger claim is still correct and was not narrowed.**
- **M-7's 12-sites-in-2-files count is exact** — re-measured independently by tenancy and learning.
- **The honesty instruments are working.** Learning: the LANDED/PART/TODO column and the recorded false-restoration claim "separate engineering completion from evidence, and both record the false restoration claim and the two vacuous tests rather than burying them." The exception is the three unearned marks, which is finding 7.

## Recommendation

The seven blocks come with precise fixes and the trend is converging, so a round-5 revision is tractable. But four rounds now show one pattern with no exception: **every round closes the instances it is handed and reopens the class one level down — and this round it happened inside modules built expressly to stop it, with a false RED claim on the criterion guarding the root fix.**

The bottleneck is no longer toolchain semantics (settled) or plan prose (four reviewers accept the structure). It is that **the acceptance criteria are written against the implementation that exists rather than against the property being claimed**, so a mutant that violates the property still passes. Three of this round's blocks and four of its CHANGEs are that single defect.

**Recommended, and put to the owner rather than taken:** before any round-5 prose revision, close ROOT A in code — make `claim()` marking *enforced* (`assertClosedSchema` requires every non-container leaf to be `claim(...)` or an explicit `serverOwned(...)`; call it at module load; make the walker fail closed like its sibling) and add the one fixture that discriminates a payload-walk from a schema-walk. That is a small, bounded change to two pure modules with no database, no migration, no money — and it converts four blocks and the false RED claim into measured facts, the same way round 3's recommendation converted the toolchain disputes.
