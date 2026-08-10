# Stage 0B review — cutdown product program

**Date:** 2026-08-10
**Plan:** `docs/plans/cutdown-product-program-phase-0b.md` (revision 4)
**Spike record:** `docs/progress/cutdown-product-program-stage-0b-spike.md`
**Baseline:** commit `276176e`
**Verdict:** **Ready (Almost — 6 residuals, all named below)**
**Milestones changed:** **none.** `PIPELINE_IMPLEMENTATION_COMPLETE` stands from 2026-08-02. `PHASE_0_EXIT_EARNED` is still red and has deliberately moved **further** from green.

---

## What this stage did, and the direction it moved

Stage 0B was the half of Stage 0 that three prose review rounds could not write correctly. The master plan (§7a) forbade a fourth attempt in prose and mandated a **spike first**: write the failing tests and type signatures, let the compiler and `validate:contracts` answer the questions, then write the plan from what the code proved.

That happened. Two of the five open questions **dissolved** rather than being answered, and nine of the twelve planned tasks were retired or deferred on measured evidence.

**The headline is that the reported number got worse, on purpose.** `status --phase0` used to say *2 of 20 approved real outputs* with criterion 3 green. It now says **1 of 20** with criterion 3 **unproven**. Both changes are corrections:

- the two "real outputs" were two renders of **one** creative angle, sharing a `creativeBriefId` — one output under D-56, not two;
- criterion 3 was green because its predicate said `window.length >= 2` under a label that said **ten**.

Nothing here made a criterion easier to satisfy. Three reviewers checked that specifically.

## Entry gate

| Command | Result |
|---|---|
| `pnpm build` | clean |
| `build:contracts --check` | PASS — trees current |
| `validate:contracts` | PASS — **42 cases**, 0 lint, 0 failures, **0 cross-validator disagreements** |
| `skills sync --check` | PASS — 10 skills |
| `cutdown doctor` | 7/7 |
| `pnpm -r --no-bail run test` | **974 tests = 969 pass + 5 skipped + 0 fail**, run **five consecutive times** with identical results (baseline `276176e`: 906 = 901 + 5) |
| `uv run pytest -q` | **689 passed, 0 fail** — unchanged, which is the evidence that no Python behaviour moved |
| `ruff check --config ruff.toml .` | clean |

Reported as pass / skipped / fail separately, never as one "total" — a gate written as "total > N" accepts a run that converts passes into skips.

**No schema file and no generated file changed.** `git ls-tree -r --name-only 276176e -- cutdown/packages/contracts/schemas cutdown/packages/contracts/generated | wc -l` → **54** (pathspec checked for vacuity first), then `git diff --exit-code 276176e -- <same>` exits 0.

## Delivered

**0B-1 — contract-family drift integrity.** `diffContractSets` now classifies drift by schema **family** (`$id` minus a trailing `-vN`). Before this, obeying tech-spec §3 — a semantic change *adds a new file* — gave the new major a new `$id`, so the drift classified `added`, and `status.ts` printed *"no schema major version moved between consecutive packages"* across the largest breaking change in the program. The family is held as the **set** of its majors, never one representative, because `currentContractSet()` sorts ascending and a first-wins reducer would therefore reproduce the original defect deterministically — a test fails if one does. `subset-lint.ts` gained `version-matches-filename`, because nothing bound a `-v2` filename to a declared major and a mislabelled file defeated the whole scheme. New `contract-set.test.ts`: the module had **zero** direct unit tests, and its only indirect test modelled a major bump as an in-place `$id` mutation — the one state tech-spec §3 declares impossible.

**0B-2 — the honest count.** New `packages/contracts/src/output-identity.ts` holds `resolveOutputs`, the single implementation of output identity, keyed on `(sourceClassification, accountId, jobId, creativeBriefId)`. Each component closes a named eviction: a fixture must never evict a real output; an account must be isolated by construction, not transitively; and `loadAllPackages` walks every job. Identity is **derived**, never stored — every delivered package including the v1 legacy ones already carries a required `lineage.creativeBriefId`, so no schema field, no `outputId`, no `outputLineage`, no supersession artefact and no cross-job addressing model were needed. `comparePackages`, `LoadedPackages` and `evidenceGaps` were relocated into that module because `packages/contracts` cannot import from `apps/cli`.

`status.ts`: criterion 1 counts resolved outputs and derives its account tally from them; criterion 3's rule is **three-way** (a *detected* breaking change is `not_met` at any window size, only a clean short window is `unproven`); `Criterion.met: boolean` is **replaced** by `state: 'met' | 'not_met' | 'unproven'`; an unreadable package makes all four criteria unproven with a mandatory non-destructive remedy; and the Counts block reconciles against two written identities.

**Docs.** New `output-counting-policy.md` (counting *and* comparability, the definition Stage 1 and Stage 6 will rest on). **D-56** (T-1 graduated) and **D-61** (family-keyed drift) appended. The `decisions.md` table was **repaired** — stray blank lines were terminating it, so D-40…D-58 rendered as literal pipe text; the repair deletes blank lines only, with zero change to any row's text. PRD §15 and tech-spec §15 now state the population the number 20 is over. T-1 retired from `todos.md`; `phase-0.md` bannered.

## The plan gate — three rounds, six BLOCKs, and one pattern

Before a line of code was written, the plan itself was gated three times. **Both reviewers returned BLOCK in all three rounds**, and the shape never changed: **every round's new BLOCKs were siblings of the previous round's fixes.**

| Round | What it caught |
|---|---|
| 1 | The plan marked the `window.length >= 2` fix "KEPT" and then **did not carry it**, while citing the defective predicate *approvingly*. Its acceptance criterion passed with the defect intact. Separately, the resolver grouped across jobs and accounts, silently removing an account from the one criterion the stage exists to make honest |
| 2 | "The single wrong token" was **two** tokens — the predicate *and* the sentence printed beside it, so a fixed predicate would still have printed the denial. Narrowing criterion 3's window to *survivors* resurrected the original defect through a second door. The key partitioned on classification but not on evidence completeness. And the new decision had taken **D-59**, a number another plan file was already holding |
| 3 | The threshold got left denominated in **packages** while the count moved to outputs — ten repackages of one brief would have turned the criterion green over one output. A detected breaking change inside a short window was reported UNPROVEN. `B14`'s reconciliation equation was **arithmetically false**, and the test mandated for it would have passed vacuously today and failed for the wrong reason once its own fixture landed |

Round 2 also **falsified four claims in the spike document itself** — `.met` had three consumers not one (and the third would have rendered `unproven` as `[x]`); the generated tree does contain numeric-suffixed classes; 0 of 20 enums carry a `-vN` suffix; and `status.test.ts:355` was not the anti-vacuity control it had been named as. All corrected in place, with their measurements.

## The code gate — and the fourth door

`code-reviewer` returned **BLOCK**; both Cutdown reviewers returned **NEEDS CHANGES**.

**The BLOCK was earned and was demonstrated, not argued.** Criterion 3's drift timeline was built from *the packages belonging to the windowed outputs* rather than *every package in the span*. Because a windowed output's superseded package can predate an excluded output's survivor, the walk had holes. The reviewer built a 13-package / 12-output corpus in which one package **added** a contract and the next **removed** it, both strictly inside the printed span, both skipped — and criterion 3 reported `met` while printing *"no schema major version moved between consecutive packages"*.

**That is F-A through a fourth door**, after the plan gate had already closed three. It was also asserted as fixed in a code comment *and* propagated into the reviewer canon — so the claim outran the code into two other documents before anyone tested it. The fix derives the population from the span's endpoints, and the printed label was tightened from *"delivered package(s)"* to *"evidence-complete real package(s)"*, because the old wording was false once the count was right.

Other findings, all applied:

- **The family key stopped at `.json`.** `/-v\d+\.json$/` meant an `$id` ending `-v2` without the extension was a different family, so a bump classified `added` — the same defect one door down, reachable by the module's *own* stated argument that a recorded `schemaId` has no pattern and can name anything.
- **The suite was not safe against itself.** `validate.test.ts` wrote a probe file into the **committed** generated tree, and `node:test` runs the two async tests of one `describe` concurrently — so the probe was live while its sibling asserted the tree was current. Not a leftover from a crash: a race the suite lost on some fraction of every run, visible to `apps/cli`'s doctor test in parallel under `pnpm -r`, and capable of dirtying the working tree against CI's D-57 step. Fixed by giving `checkGenerated` an optional roots parameter (additive; both production callers unchanged) so the probe runs against a temp copy.
- **A comment claimed tests that did not drive two of six checks.** Fixed by writing them, not by narrowing the sentence.
- **The `4×` figure had been invented and put in the authoritative doc set.** PRD and tech-spec asserted "package count runs roughly 4× higher than output count", uncited and present-tense. Its ancestor said something different — *jobs* per output, an owner estimate — and the only measurement on disk says **2×**. Deleted and restated with attribution.
- **Retiring T-1 orphaned its citations** in three places, including the measurement canon that documents this very failure mode. Repointed at D-56.
- **The policy's "unrepresentable" argument was false about the schema it cited** — `releaseState`'s enum *does* include `published`. The true argument is that there is no writer and no reader, which is sharper: a hand-authored `published` package would validate and be counted silently.

## Residuals (open, with reasons)

| # | Residual | Why it is open |
|---|---|---|
| 1 | No test asserts that a hand-authored `published` package still resolves under the counting rule | Found while correcting the policy's §2.2 argument. Nothing writes `published` today and nothing reads `releaseState`, so it is latent — but it is exactly the "no writer, no reader" gap the corrected text now names |
| 2 | `resolveOutputs`' `excludedIncomplete` channel has no production consumer | `status.ts` recomputes the same set from the same rule. Defensible as one rule read twice, but Stage 1/6 will be the first to consume the channel untested |
| 3 | Policy §4.3/§4.4/§4.6 (baseline exclusion, minimum n, no pooling) have **no enforcing artefact** | Nothing in the repo fails when Stage 1 violates them. The enforcing home is named (`packages/evaluation`, sole-emitter test) but is Stage 1's to build |
| 4 | Criterion 1 reports `not_met` on an empty corpus where criteria 2–4 report `unproven` | Defensible — a count of zero is a count — but undocumented, and it makes a clean clone print "1 of 4 criteria are not met" where nothing was measured |
| 5 | The `status.test.ts` intermittency was **never reproduced by the fixer** | The reviewer saw three consecutive failures, each a different test; the fixer saw five clean runs before and after. The fix (a fresh `mkdtemp` jobs root per test, plus a loud emptiness assertion) removes the race rather than narrowing it, but five green runs is not proof a rare Windows delete race is gone |
| 6 | **A7 — CI green on a clean clone — is still open**, carried from Stage 0A | The workflow has run, but this session has no `gh` CLI and cannot read the result. Reporting one would be inventing it |

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| B1 | A new major of an existing family classifies **breaking**, not `added` | **Met** — verified by execution, both `.json` and extension-less spellings |
| B2 | Brand-new contract stays `added`; a minor bump stays `compatible`, asserted on the **kind** | **Met** — the real `platform-edl-v1` 1.0.0→1.1.0 precedent holds |
| B3 | Family retirement is not silently swallowed | **Met** — `{v1,v2}→{v2}` still yields `removed`, naming v1 |
| B4 | A first-wins family reducer **fails** the suite | **Met** — the family is a `Set` of majors; `from` is the max, order-independent |
| B5 | A `-vN` file whose declared major is not N fails the lint; 0 false positives | **Met** — 0 violations on all 14 contracts, 4 commons, 20 enums |
| B6 / B6b | One CreativeBrief → one output, later surviving, earlier **named**; different jobs, different accounts, fixtures and evidence-incomplete packages never merge or evict | **Met** |
| B7 | Nine outputs unproven, ten decidable, predicate reads `CONTRACT_WINDOW`, detail text does not claim no major moved | **Met** |
| B7b | An unreadable package leaves **all four** criteria unproven, with a non-destructive remedy | **Met** |
| B7c | A bump absorbed by repackaging every affected brief is still red | **Met** — and extended after the BLOCK to a package sitting between two windowed packages |
| B8 | No schema or generated file changed; pathspec vacuity checked | **Met** — 54 files, `git diff --exit-code` clean |
| B9 | Live `status --phase0` reports 1 real output; `not_met` and `unproven` rendered and worded as different states | **Met** — verbatim below |
| B10 | Entry gate green; `validate:contracts` still exactly 42 cases; pass/skip/fail asserted separately | **Met** |
| B11 | `resolveOutputs` is the only implementation; `comparePackages` has one home | **Met** — verified by grep across `apps`, `packages`, `skills`, `workers`, `workflows` |
| B12 | `Criterion.met` removed; three states; four criteria; `exitEarned` treats unproven as not earned | **Met** |
| B13 | The account tally is over resolved outputs, proven by a 2-account test | **Met** |
| B14 | The Counts block reconciles against both identities, including an incomplete case and a non-empty rejected case | **Met** — the equation shipped in rev 3 was false and was corrected before build |
| B15 | `decisions.md` renders D-40…D-61 as table rows; repair diff shows zero row-text change | **Met** — 11 insertions / 11 deletions, every deletion a blank line |
| B16 | Every behaviour claim in a comment is asserted by a test or absent | **Met after the gate** — two claims failed this and were fixed |

## `status --phase0`, verbatim

**Before (`276176e`):**

```
  [ ] >= 20 approved real outputs across 3 accounts
      2/20 approved real output(s) across 1/3 account(s); 1 fixture package(s) EXCLUDED (D-36)
  [x] the last 10 outputs require no breaking contract change
      2 output(s) in the window; no schema major version moved between consecutive packages
    PHASE_0_EXIT_EARNED               not earned
      1 of 4 criteria are not met: approved-real-outputs.
```

**After:**

```
  [x] met   [ ] not met (measured)   [?] unproven (the evidence to decide is not there)

  [ ] >= 20 approved real outputs across 3 accounts
      1/20 approved real output(s) across 1/3 account(s) (T-1/D-56: one approved cut per CreativeBrief, from 2 complete real package(s)); 1 fixture package(s) EXCLUDED (D-36)
  [x] zero invalid source ranges in final renders
      3 package(s) carry range-validation evidence; 17 range(s) validated, 0 package(s) without acceptable evidence
  [?] the last 10 outputs require no breaking contract change
      only 1/10 resolved real output(s) exist (2 evidence-complete real package(s) in the span), so stability across 10 outputs is UNPROVEN (not proven by absence)
  [x] rights records and QA reports accompany every delivered package
      3/3 readable package(s) carry complete rights + QA evidence

  Counts (readable = real + fixture + missing evidence; resolved outputs + superseded + rejected = real)
    packages readable ........ 3   (an unreadable file is counted nowhere here — see below)
    real, complete ........... 2
    fixture, complete ........ 1   (NOT counted toward criterion 1, D-36)
    missing evidence ......... 0
    warning-waived ........... 3   (D-35: reported separately from clean packages)
    resolved real OUTPUTS .... 1   (T-1/D-56: one approved cut per CreativeBrief)
    superseded real .......... 1
    rejected real ............ 0   (unresolvable: the package set is incomplete)

  Superseded packages (T-1 — folded into a later package of the same CreativeBrief, NAMED not just counted)
    01KZ8B40TENCWQ72F061FXK79S (real) superseded by 01KZ9YK48KBRAX85DJ1P76NYMN — CreativeBrief 01KZ8ARV5A260Z7D3VJAY94C3Q

    PHASE_0_EXIT_EARNED               not earned
      1 of 4 criteria are not met: approved-real-outputs; 1 unproven: no-breaking-contract-change.
```

**The single output is `pass_with_waivers`.** All three delivered packages carry warning waivers (D-35), so "1 of 20" must not be read as "one clean output". The Counts block reports it separately, and it is stated here so the review record cannot be read without it.

## What Phase 0 exit still needs

Unchanged by this stage, and all owner/operations input:

- **T-2** — the D-21 spend ceiling, unset since Phase 3.
- **T-3** — two more accounts with rights records (1 of 3 today).
- **T-4** — **19** more approved real outputs (1 of 20). This number got larger, not smaller, and that is the correct direction.
- **A7** — a green CI run on a clean clone, unreadable from this session.

Criterion 3 now stays **unproven** until ten resolved outputs exist. That is a consequence of the fix, not a regression: a criterion about stability across ten outputs cannot be satisfied by having produced one.

## Next

**0B-3 — the migration** (`content-package-v2` / `render-v2`), re-planned when its trigger fires. Its **first** task is to re-read the master plan's order-critical constraint and decide whether criterion 3's window is empty enough to bump. The plan records the threshold: **before the window holds more than three resolved real outputs**. What the spike already settled for it — the build order, the exact codegen blast radius, the retired Python-collision hazard, reader-before-writer, and the fact that `skills sync --check` will *not* catch the bump — is in `phase-0b.md` §9's 0B-3 outline.
