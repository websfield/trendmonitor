# Stage 0B — Make the count honest, and make a contract bump detectable

**Governing PRD phase:** Phase 0 (completion). **Depends on:** Stage 0A (complete, `docs/progress/cutdown-product-program-stage-0a-review.md`).
**Master plan:** `docs/plans/cutdown-product-program-master-plan.md` §7a
**Written from:** `docs/progress/cutdown-product-program-stage-0b-spike.md` — every design claim cites a spike finding (**F-A** … **F-Q**) that was measured or read, not argued.
**Supersedes:** tasks 3–14 of `cutdown-product-program-phase-0.md`. That file is **not deleted**; §1 names exactly which tasks are retired, kept or deferred, and task 12 adds a banner to it.

**Revision 2 (2026-08-10)** — rewritten after the rev-1 plan gate returned **BLOCK** from both Cutdown reviewers. Four BLOCKs, all earned, all verified by me against the code before acceptance. They are marked **[R1-fix]** below, and three of them were defects *introduced by the spike-first rewrite itself*:

| # | BLOCK | Where it came from |
|---|---|---|
| 1 | The `window.length >= 2` predicate under a label saying ten — **the defect this Critical Path exists for** — was marked "KEPT" and then not carried, and rev 1 cited the defective predicate *approvingly* as the mechanism making criterion 3 red. B7 passed identically with the defect intact | measurement, BLOCK 1 |
| 2 | `resolveOutputs` keyed on a bare `creativeBriefId` groups **across jobs and across accounts**, and criterion 1's account count is built from the survivors — so a merge silently removes an account. Spike F-K generalised a single-job measurement | boundary, BLOCK |
| 3 | `resolveOutputs` unpartitioned by `sourceClassification` lets a **fixture evict a real output** from the exit count | measurement, BLOCK 2 |
| 4 | §6 and §7 gave **opposite answers** on what an unreadable package does to a criterion | measurement, BLOCK 3 |

Rev 1's spike document carried three false claims, now corrected in place with their measurements: `.met` has **three** production consumers not one; the generated tree **does** contain numeric-suffixed classes (`Source1`, `Role3`); and **0 of 20** enums carry a `-vN` suffix (the false positives are the 4 files in `schemas/common/`).

**Revision 3 (2026-08-10)** — rewritten after the rev-2 gate returned **BLOCK** from both reviewers again. Round 2 resolved 11 of 12 boundary findings and 8 of 13 measurement findings, and **every number in rev 2 re-derived correctly**. But three new BLOCKs landed, and all three are the same shape — *a rev-2 fix that named one site and left its sibling*. That is this project's documented signature failure, and it is now on its second consecutive appearance in this stage. Marked **[R2-fix]**:

| # | BLOCK | The sibling that was missed |
|---|---|---|
| 5 | Task 9 called `window.length >= 2` "the single wrong token". **It is two tokens.** `status.ts:352` carries the same `2` in the *detail* branch, so changing `:350` alone makes a 3-to-9-output window report `unproven` **while printing `:355`'s "no schema major version moved between consecutive packages"** — F-A's own denial sentence, restored from the other side. Verified on disk | the predicate was fixed; the sentence beside it was not |
| 6 | Task 10 narrowed criterion 3's drift population to **surviving** outputs. **That resurrects F-A through a second door**, and the reachable case is 0B-3's own migration: bump, repackage every affected CreativeBrief, and every pre-bump package is superseded — so the survivors all carry the new major, `diffContractSets` returns nothing, and criterion 3 prints "no major moved" over a window in which it demonstrably did | the *unit* of counting was changed; the *timeline* of contract drift was changed with it, unremarked |
| 7 | Task 8's key partitions on `sourceClassification` and `jobId` but not on **evidence completeness**, and the resolution order against `status.ts:268`'s `complete` filter is unstated. An evidence-incomplete package can supersede a complete one, taking criterion 1 from **1 → 0** | the fixture-eviction case was closed; the incomplete-eviction case is its exact sibling |

Both reviewers also caught, independently, that **D-59 is already reserved**: `cutdown-product-program-phase-0.md:120` allocates it to the `skills serve` transport decision and `phase-1.md:140` allocates D-60. Rev 2 took a number someone else was holding. The drift decision is **D-61**.

**Revision 4 (2026-08-10) — final pre-build corrections.** Round 3 was FINAL by this project's convention (the two-round gate cap, round 3 accepted regardless of verdict, remainder recorded as residuals). Both reviewers returned BLOCK a third time and **both said the same thing about it**: record the CHANGEs and NOTEs as residuals, but apply the BLOCKs, because each is a one-paragraph edit that is far cheaper now than after `status.ts` has been rewritten around it. Four applied, marked **[R3-fix]**. **All four are again siblings of rev-3's own fixes — the third consecutive appearance of this project's signature failure, which is itself the most important thing this gate produced.**

| # | BLOCK | The sibling |
|---|---|---|
| 8 | **Criterion 3's window unit.** Task 10 put the drift *timeline* over delivered real packages; task 9 set the *threshold* to ten; §2/§5/§7 said "outputs". Under T-1 packages ≠ outputs — ten repackages of **one** brief would make criterion 3 decidable and green over **one** output, at roughly 4× dilution (`todos.md:26`) | the population was separated for detection and not for the threshold |
| 9 | **A detected breaking change inside a short window reports UNPROVEN.** Task 9's two-branch rule (`window < 10 ⇒ unproven`) swallows `breaking.length > 0`, so a proven failure wears insufficient-evidence's label — defeating 0B-1 at exactly the moment it is needed (the 0B-3 migration, at ~3 outputs), and making B7c unsatisfiable below ten packages | the *threshold* branch was fixed; its interaction with the *breaking* branch was not |
| 10 | **B14's equation is arithmetically false.** `status.ts:269` filters `real` from `complete`; `:270` filters `fixture` from `all`. One evidence-incomplete real package breaks `total = real + fixture` — and task 13 **mandates creating exactly that package**. Today it passes only vacuously (3 = 2 + 1, zero incompletes) | rev 2 demanded reconciliation without defining it; rev 3 defined it wrong |
| 11 | **`resolveOutputs` cannot be built where rev 3 put it.** It is placed in `packages/contracts` and given a `LoadedPackages` signature and an `evidenceGaps`-filtered population — but `LoadedPackages` is declared at `status.ts:78` and `evidenceGaps` is **non-exported** at `status.ts:213`, both in `apps/cli`, which `packages/contracts` cannot import | this is verbatim the argument rev 3 used to relocate `comparePackages`, not applied to the two symbols its own fixes introduced |

---

## Project Conventions Pinned (READ FIRST)

*Pasted from `CLAUDE.md`. A spawned agent does not auto-read it.*

### Golden rules

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.** Existing conventions beat your preferences.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that.
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.** Pushing, publishing, and deleting what you didn't create wait for explicit confirmation.
9. **Current facts beat trained memory.**

### Lessons that touch this stage's ground

- **2026-07-30** — Fix the **class, not the field**; validate the whole artefact at its boundary; put the guard where every consumer can import it; add a lint.
- **2026-07-30** — A comment claiming a property is not the property: **assert it in a test or delete the claim**, and when a review names an inversion your fix might cause, **write that inversion as a test before calling the fix done**. (Rev 1 earned this one: widening `met` to a tri-state would have made `status.ts:422` render `unproven` as `[x]`.)
- **2026-07-30** — Fail closed, but **never without a way forward**.
- **2026-08-02** — Config resolved by walking UP the tree silently inherits the enclosing repo's; a cross-skill option is only alive when a test drives it from its **real producer's artefact**.
- **2026-08-10** — A diagnostic that reports "present" must distinguish **present-and-verified** from **present-and-unrun**.

### Contract versioning law (`tech-spec.md` §3) — verbatim

> A **semantic** change (new required field, changed meaning, removed field) bumps the major version and **adds a new file** — it never mutates a published schema in place.

### Scope boundary

**Do not change `src/`, `tests/`, `config/`, or `docs/initial/`** (`tech-spec.md` §14). Cutdown work lives in `cutdown/`, `docs/video-editing/`, `docs/plans/`, `docs/progress/`, and the root `todos.md`.

### Stack

TypeScript (pnpm workspace, Node 24); Python worker (`uv`, ruff pinned by `cutdown/ruff.toml`). Contract generators are **committed** (D-24). `decisions.md` is **append-only settled law**.

### Available agents

`general-purpose` owns every implementation task. Gates run `code-reviewer`, `cutdown-boundary-reviewer` and `cutdown-measurement-reviewer` — all three exist natively as of Stage 0A. **Do NOT request** any UGC Critical-Path reviewer.

---

## 1. What the spike retired, and why

The fused Stage 0 plan carried twelve tasks (3–14) into 0B. The spike measured that **nine exist to support a stored output identity the data does not need.**

| Old task | Fate | Evidence |
|---|---|---|
| 3 · counting + comparability policy | **KEPT** → task 6 | still required |
| 4 · D-56 | **KEPT** → task 7 | reserved at `decisions.md:64-69` |
| 5 · `content-package-v2` + `render-v2` | **DEFERRED to 0B-3** | **F-J** — the *identity* motive is gone. `render-v2`'s path-pattern fix survives on its own merits, unbundled |
| 6 · `supersession-record-v1` + writer + reader + cross-job addressing | **RETIRED** | **F-K** — supersession is computable from the packages. The `approve` precedent resolves supersession by derivation over a total order, never a declared pointer. **Note the corrected scope:** F-K retires the *artefact*, not the requirement to state a grouping scope — see task 8 **[R1-fix, BLOCK 2]** |
| 7 · v1 `$id` consumers | **DEFERRED to 0B-3** | no v2 lands here. **F-N** records the order |
| 7b · `render-v2` consumer sweep | **DEFERRED to 0B-3** | ditto |
| 8 · `outputId` assignment + discriminator | **RETIRED** | **F-I** — `input.json:5` forbids a caller-supplied evidence field in its own description. **F-J** — a derived identity needs no assignment mechanism. *(The boundary reviewer independently verified this as the strongest retirement in the set.)* |
| 9 · regenerate trees | **DEFERRED to 0B-3** | nothing to regenerate; **F-F** records the blast radius |
| 10 · v2 + supersession fixtures | **DEFERRED / RETIRED** | follows tasks 5 and 6 |
| 11 · version-dispatching reader | **DEFERRED to 0B-3** | **F-N** — needed *before* a writer emits v2, and only then |
| 12 · cross-package lineage validator | **RETIRED, with a narrowed justification [R1-fix]** | A cycle or dangling parent needs a stored **`parentOutputId`** to point wrongly, and none is built. **Rev 1 over-claimed** that cycles are "unrepresentable" full stop — five stored parent pointers exist today (`creative-brief-v1.json:47`, `master-story-plan-v1.json:21`, `platform-edl-v1.json:26`, `render-manifest-v1.json:21`, `job-brief-v1.json:39`), and the derived key *is* a kind of pointer: a `creativeBriefId` naming a brief in another job is representable and would change the **count** rather than trip a validator. Task 8 catches that class by construction |
| 12b · family-keyed drift classification | **KEPT and PROMOTED to first** → tasks 1–3 | **F-A** measured; **F-B**, **F-C**, **F-D**, **F-E** are its specification |
| 13 · counting model in the evaluator | **KEPT — and its two named sub-fixes are now explicit tasks [R1-fix, BLOCKs 1 and 4]** | Old task 13 said *"the single wrong token is the predicate `window.length >= 2`"* and *"unreadable packages report UNPROVEN rather than dropping"*. Rev 1 labelled the task KEPT and carried **neither**. Tasks 9 and 11 carry them |
| 14 · counting tests | **KEPT and widened** → task 13 | **F-M** — the existing suite stays green under T-1, so these must be *written* |

**Two whole defect classes are gone by construction:** there is no supersession artefact to address cross-job, and no caller-authority contradiction, because neither mechanism is built.

## 2. The three work packages, and why this order

| | Package | Touches a schema file? | Why here |
|---|---|---|---|
| **0B-1** | Contract-family drift integrity | **No** | **F-A** is a live latent defect: criterion 3 would report GREEN across a v1→v2 migration while printing a sentence denying it. It can only bite once a second major exists, so fixing it *before* any v2 lands means the migration can never land undetected |
| **0B-2** | The honest count | **No** | **F-J/F-K** — T-1 is computable today. The only work in the program that moves a PRD §15 exit criterion |
| **0B-3** | The migration, if still wanted | Yes | Re-planned when 0B-1 and 0B-2 are proven on disk |

0B-1 before 0B-2 is a **preference, not a dependency** — they touch disjoint code and share only `status.test.ts`. Sequencing 0B-1 first keeps the trap closed while the count changes.

**Discharging the master plan's order-critical constraint [R1-fix, tightened R2].** `master-plan.md:162` says *"the contract bump lands before real-output accumulation resumes, or the accumulation invalidates itself."* Rev 1 deferred the bump without addressing this. **Resolution: accumulation is safe to resume now, with a stated threshold.**

Reasoning: (a) no bump lands in 0B-1/0B-2, so nothing invalidates accumulated outputs; (b) 0B-3's re-planning trigger re-reads this constraint as its **first** task, recorded in §9. **Rev 2 also offered "a family bump is now *detectable*, which is what makes the reset trustworthy rather than silent" — that reason is withdrawn [R2-fix]:** detectability is not non-invalidation, and it converts "the accumulated window is thrown away" into "you will be told it was thrown away". It does not discharge the constraint and should not have been offered as if it did.

**The threshold, stated rather than left implicit [R2-fix], and derived rather than asserted [R3-fix]:** the cost of 0B-3's bump grows monotonically with every real output produced in the interim, and under T-1 the window fills roughly 4× more slowly (`todos.md:26`), so it stays cheap for longer — but not forever. **0B-3 must land before criterion 3's window holds more than three resolved real outputs** — the same unit task 10 uses for the threshold.

Why three: the window is ten (PRD §15), so three is the point at which a bump would discard **30%** of the accumulated evidence — the largest loss that is still recoverable inside the ~4 further outputs T-4 is expected to produce before anyone reads the criterion as meaningful. It is a judgement, not a PRD number, and is recorded here as one so a later reader does not cite it as derived law. Past it, a bump discards evidence the owner paid for and the deferral stops being free.

**This plan is task-level for 0B-1 and 0B-2 only.** 0B-3 is an outline with a re-planning trigger.

## 3. Critical Paths touched

| Critical Path | Touched? | Reviewer |
|---|---|---|
| The four UGC paths | No — `tech-spec.md` §14 | — |
| **Cutdown measurement honesty** | **Yes** — counting, exit criteria, `status --phase0`, denominators, the criterion state type | `cutdown-measurement-reviewer` |
| **Cutdown tenancy & boundaries** | **Yes** — contract authority and versioning, `contract-set.ts`, `decisions.md`, the grouping scope | `cutdown-boundary-reviewer` |
| *(general)* | — | `code-reviewer` |

## 4. Decisions

- **D-56** — reserved at `decisions.md:64-69`. Task 7 appends it, graduating **T-1** (`todos.md:13-32`, settled 2026-08-09), **and amends the reservation blockquote to record the closure [R1-fix]** — that blockquote is prose, not a decision row, so amending it is not an in-place decision edit.
- **D-61** — **numbered here, not left to the implementer [R1-fix]**: contract drift is classified by schema **family**. Changing how drift is classified changes how a PRD exit criterion is computed; that is settled law. **Not D-59 [R2-fix]** — `cutdown-product-program-phase-0.md:120` reserves **D-59** for the `skills serve` transport decision (superseding D-13) and `cutdown-product-program-phase-1.md:140` reserves **D-60** for the measurement policy. Rev 2 claimed D-59 on the reasoning "D-57/D-58 are taken", which silently consumed a live reservation. Both reservations stand untouched; this stage takes the next free number, **D-61**.
- **The decisions table is already broken and this stage must not append into a broken table [R1-fix].** `decisions.md:74-95` carries stray blank lines between rows; in GFM a blank line terminates a table, so only D-39 renders as a row and D-40…D-58 render as literal pipe text. Stage 0A repaired `:96-102` and left the block behind `:95` orphaned. Task 5 repairs it — **blank-line deletions only**, verifiable by a `git diff` showing zero row-text change.
- **D-13, D-33, D-47** — not edited; not in scope.

## 5. Requirements Checklist

| REQ / source | What this stage must satisfy | Owning task |
|---|---|---|
| PRD §15 Phase 0 criterion 3 | Evaluated over a **full ten** qualifying outputs — the predicate matches its own label | 9 |
| PRD §15 Phase 0 criterion 3 | A **family** major bump resets the clock | 2 |
| PRD §15 Phase 0 criterion 1 | Counts **outputs** under T-1, not packages; the **account tally is over resolved outputs too** | 10 |
| T-1 (settled 2026-08-09) | One approved cut per `CreativeBrief`; a later package supersedes | 8 |
| D-36 | `sourceClassification` remains solely responsible for keeping fixtures out of exit evidence — **enforced by partitioning, not asserted** | 8 |
| D-38 | Both milestones stay independently reported | unchanged |
| tech-spec §3 | A `-vN` filename and its declared `schemaVersion` agree — enforced | 4 |
| `cd-measurement-honesty` R1 | An unproven criterion is never reported met — **and never disproven either**; an unreadable package makes a criterion unproven rather than being ignored | 11, 12 |
| `cd-measurement-honesty` R3 | Every count names its denominator and population; the Counts block **reconciles** | 10 |
| `cd-measurement-honesty` R9 | Every number in the plan matches its artefact | §11 |

## 6. Edge Cases & Failure Paths

**A family holding two majors.** `{v1} → {v1,v2}` is **breaking**. `{v1,v2} → {v2}` — v1 retired — must not silently lose the `removed` signal the current code emits (**F-C**); task 2 decides it *with a stated reason* and task 3 pins it.

**A mislabelled schema file.** A `-v2` file declaring `1.0.0` passes every gate today (**F-D**). After task 4 it fails the lint. **Contracts-only**: the 4 files in `schemas/common/` carry `-v1` and declare no `schemaVersion`; enums carry no `-vN` at all. A contract whose name carries no `-vN` — none today — is **skipped, not failed**, and task 4 states that.

**A minor bump.** `platform-edl-v1` sits at `1.1.0` in the same file under the same `$id` (**F-E**). The reducer must keep it `compatible`, and that must be asserted **directly on `kind === 'compatible'` [R1-fix]** — `status.test.ts`'s *"stays GREEN when only a content hash moves"* asserts only `met === true`, which a reducer that dropped the `compatible` classification entirely would also satisfy. It is a regression guard, not the proof.

**Grouping scope [R1-fix, BLOCK 2].** `loadAllPackages` walks **every** job. A bare `creativeBriefId` key therefore groups across jobs and accounts. The key is composite — see task 8 — so cross-job and cross-account merging is **unrepresentable rather than validated against**.

**A fixture and a real package sharing a CreativeBrief [R1-fix, BLOCK 3].** Unreachable on today's data (the fixture's `creativeBriefId` is `01KZ094GA7JPW9G8594G3G2VNC`, distinct from the real pair's), and therefore exactly the kind of hole no existing test would catch. Resolution happens **within** a `sourceClassification` class, so a fixture can never evict a real output.

**One counted output, ten required.** Criterion 3 is **unproven**, not disproven, and the two must differ in the **type**.

**An unreadable package [R1-fix, BLOCK 4].** Rev 1 said both "makes the criterion unproven" (§6) and "unchanged" (§7). **Settled: unproven.** Criteria 1 and 3 do not read `loaded.unreadable` today, so an unreadable package lets criterion 3 report **met** over a window it knows is incomplete. Task 11 fixes that; the §7 row now says so. Never drop a package silently — a dropped package makes the ten-output window satisfiable by hiding failures.

**A CreativeBrief revision [R1-fix].** A revised CreativeBrief mints a new `creativeBriefId` (`creative-brief-v1.json:47`) and would therefore be a **new output**, inflating the count. Not reachable today — `skills/propose/src/main.ts:143` always writes `parentCreativeBriefId: null`, and `skills/revise` never targets a CreativeBrief — but task 6 must state it and B6 must cover it, exactly as F-Q is required to be stated.

**Degraded mode.** A refusal must never instruct anyone to delete evidence. `status.ts:443-446` currently prints **no remedy at all** (**F-N**) — path and reason only. If task 11 adds one, it follows `reviews.ts:341-342`'s non-destructive wording.

## 7. Failure Modes & Degraded Behavior

| Boundary crossing | Failure | Degraded behavior | Spec that proves it |
|---|---|---|---|
| New major of an existing family | classified `added` today | **breaking**; criterion 3 red | `contract-set.test.ts::"a new major of an existing family is breaking"` |
| Brand-new contract | must stay `added` | `added`; clock not reset | `contract-set.test.ts::"a brand-new contract is added, not breaking"` |
| Minor bump under one `$id` | must stay `compatible` | `compatible`, asserted on the **kind** | `contract-set.test.ts::"a minor bump stays compatible"` |
| A family loses a major | signal could be swallowed | decided in task 2, asserted in task 3 | `contract-set.test.ts::"retiring a major is not invisible"` |
| Schema name and version disagree | accepted silently | lint violation naming both | `subset-lint.test.ts::"a -vN filename must match its declared major"` |
| Two packages, one CreativeBrief, one job, same class | counted as two | later supersedes; counted once; earlier **named** | `status.test.ts::"two packages of one CreativeBrief count once"` |
| Two packages, one CreativeBrief, **different jobs** | would merge across jobs | **not grouped** — composite key | `output-identity.test.ts::"packages in different jobs never merge"` |
| A **fixture** shares a CreativeBrief with a real package | fixture could evict the real output | **not grouped** — partitioned by class | `output-identity.test.ts::"a fixture never supersedes a real output"` |
| Criterion 3 window holds 9 outputs | reported met at 2 today | **unproven**; the label, the predicate **and the detail sentence** all say ten | `status.test.ts::"nine outputs leave criterion 3 unproven"`, asserting state **and** detail |
| An **evidence-incomplete** package would supersede a complete one | criterion 1 could go 1 → 0 | resolution runs over the evidence-complete set; never grouped | `output-identity.test.ts::"an incomplete package never supersedes a complete one"` |
| A contract bump is **absorbed by repackaging** every affected brief | survivors all carry the new major, so drift reads clean | the drift timeline is **delivered real packages**, not survivors | `status.test.ts::"a bump absorbed by repackaging is still breaking"` |
| One `creativeBriefId` appears under two `jobId`s | two groups, count silently inflated by one | **reported as an anomaly** — the composite key prevents the merge, and the report prevents the silence | `output-identity.test.ts::"a creativeBriefId spanning two jobs is reported"` |
| A package cannot be validated | criteria 1 and 3 ignore it; criterion 4 calls it disproven | **all four criteria unproven**, package named, non-destructive remedy printed | `status.test.ts` ×4 |
| One member of a CreativeBrief group is unreadable | supersession answer computed from an incomplete set | `resolveOutputs` takes **`LoadedPackages`** — both channels — so the unreadable set is visible to it; it returns the affected group on a **`rejected` channel**, as `loadReviewDecisions` does | `output-identity.test.ts::"an incomplete group is reported, not silently resolved"` |

## 8. Handoff Contracts

Consumed by **Stage 1**:

- **`resolveOutputs(packages)`** — the single implementation of output identity and supersession, in `packages/contracts/src/output-identity.ts`. Returns, per package, its derived output key, whether it is superseded and by what, plus a **`rejected` channel** for packages it cannot resolve. One implementation, following `reviews.ts` (*"a second sort rule in a second caller is a second answer"*). Stage 1's cohorts and Stage 6's uplift denominators read this, never their own rule.
- **`docs/video-editing/output-counting-policy.md`** — the counting **and comparability** policy, in the authoritative doc set because it narrows a PRD §15 criterion.
- **The criterion state type** — `unproven` is a distinct state Stage 1's scorecards can render.

**Not handed off, deliberately:** no `outputId` field, no `outputLineage`, no supersession artefact. Stage 1 must not assume one.

## 9. Implementation Tasks

### 0B-1 — Contract-family drift integrity

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | **Write `contract-set.test.ts` FIRST, red.** The module has **zero** direct unit tests (**F-P**), and its one indirect `breaking` test models an in-place `$id` mutation — a state tech-spec §3 declares impossible. Cover: the family bump (**F-A**), a brand-new contract, the minor-bump precedent asserted on `kind === 'compatible'` (**F-E**), family retirement (**F-C**), and the first-wins trap (**F-B**) as a test that a reducer reporting major 1 for a `{1,2}` family **fails** | general-purpose | `cutdown/packages/contracts/tests/contract-set.test.ts` (new) |
| 2 | **State the family semantics in the module doc, then implement.** Family key = the `$id` with a trailing `-v<digits>` stripped before `.json`, **derived from the id string** because neither `schemaVersion` nor `majorVersion` can carry it (**F-E**). An id with **no** `-vN` suffix has itself as its family key — `content-package-v1.json`'s `contractSet.items.schemaId` is `type: string, minLength: 1` with no pattern, so this is reachable input. Decide and write down what `{1,2}→{2}` is (**F-C** — the plan does not pre-decide it; task 2 decides it *with a stated reason*, bounded by the invariant that it must not silently lose the `removed` signal the current code emits). **Do not reduce a family to one representative entry** — **F-B** proves first-wins reproduces the original defect deterministically | general-purpose | `cutdown/packages/contracts/src/contract-set.ts` |
| 3 | Make task 1 green, and re-run the three existing controls — cited **by test name**, not line number, since task 4b rewrites that block: *"stays GREEN when only a content hash moves under an unchanged major"*, *"counts a REMOVED contract as breaking"*, *"only looks at the last ten"*. A family fix that turns the first red or the second green is wrong | general-purpose | as above |
| 4 | **Bind a `-vN` filename to its declared major** (**F-D**). New rule in the existing `if (isContract)` block at `subset-lint.ts:247`. **Contracts-only** (the 4 `schemas/common/*-v1.json` declare no `schemaVersion`; enums carry no `-vN` at all). A contract with no `-vN` is **skipped**. Negative test uses a temp file, because `subset-lint.test.ts:38` asserts the live tree is clean — **and the temp file has a trap to name [R2-fix]**: `expectedId` derives the required `$id` from `relative(CONTRACTS_ROOT, absPath)` (`paths.ts:83-86`), so a temp file outside the contracts root fails on `id-matches-path` rather than on the new rule, while writing one *inside* `schemas/` races the live-tree control, dirties `build:contracts --check`, and trips CI's "the gate did not modify the working tree" step (D-57). Compute the fixture's `$id` with `expectedId(tmpPath)`, and write nothing under `schemas/`. Verified in the spike by execution: the rule yields **0 violations** on all 14 contracts today, so it cannot force a schema edit | general-purpose | `cutdown/packages/contracts/src/subset-lint.ts`, `tests/subset-lint.test.ts` |
| 4b | **Re-anchor the criterion-3 breaking test** — today the only proof that criterion 3 catches a breaking change models a state the versioning policy forbids (**F-P**). Rewrite it on two coexisting **contract-set entries** (not files — that test hand-authors the array and reads no schema). Keep an in-place-mutation case if still worth refusing, but it must not be the only proof | general-purpose | `cutdown/apps/cli/tests/status.test.ts` |
| 5 | **Repair the decisions table, then append D-61** (family-keyed drift classification, with its reasoning and the three cases). The repair is **blank-line deletions only** in `decisions.md:74-95`; a `git diff` must show zero row-text change | general-purpose | `docs/video-editing/decisions.md` |

### 0B-2 — The honest count

| # | Task | Owner | File(s) |
|---|---|---|---|
| 6 | **Write the counting and comparability policy.** T-1: one approved cut per `CreativeBrief`; a later package supersedes. Tabulate variant / revision / repackage / rerender / superseded and which count toward each PRD §15 criterion. State the derivation and **why identity is derived rather than stored** (**F-I**, **F-J**). **State which "revision" the row means** and declare CreativeBrief revision out of scope at Phase 0 with the evidence (`propose` always writes `parentCreativeBriefId: null`; `revise` never targets a CreativeBrief). **Settle F-Q as out-of-scope-at-Phase-0** with the unrepresentability argument — `skills/package/src/main.ts:564-567` records that the skill *cannot* emit `publish_ready`/`published`, so no operator can assert the exception even informally, and adopting it later can only *raise* the count, which §14's never-softened rule makes a re-gated change. **The "name the field" branch is forbidden** unless it lands with an enforcing test (R8). **Add a real/fixture row to the tabulation [R2-fix]** — the one axis D-36 governs, and the only one rev 2 omitted. State per criterion which classes count: criterion 1 is real-only, while criteria 2 and 4 carry no "real" qualifier in PRD §15 and today legitimately include the fixture package (live: *"3 package(s) carry range-validation evidence"* counts it). That is arguably right and is exactly what an authoritative policy exists to say out loud.

Comparability, for Stage 1/6: the five axes **plus** what is compared to what, a **baseline exclusion rule** (a baseline must not include Cutdown's own outputs — R6), **minimum n and pre-registration** (R7), and every threshold cited to **PRD §14.2** by number. Three further gaps rev 2 left open **[R2-fix]**: (a) **the unit mismatch** — §14.2's gate is over *"comparable **published** outputs"* (`PRD.md:913`) while §8 hands Stage 6 `resolveOutputs`, whose unit is an *approved cut*, and `package` cannot emit `published` at all (`skills/package/src/main.ts:564-567`); the policy states that the two populations differ and how the bridge is built, or the min-n of 30 is counted in the wrong unit; (b) **quote §14.2's attribution row whole** — `PRD.md:917` is *"≥ 90% of **labelled experiments** have stable variant attribution **and** a documented changed variable"*, not the "≥90% attribution" gloss; (c) **structural withholding** (R7) — say that below min-n or without pre-registration the uplift number is **not produced**, not produced-and-hedged. **Record that multi-account pooling is blocked on T-9**, not settled here — §14.2's "across multiple accounts" collides with a same-account comparability axis, and T-9 is open. Note also that `sourceClassification: real` is a claim about **footage**, not about live inference (D-21 is unset; every editorial stage to date ran on recorded replies) — the policy is the right home to say so before Stage 1 reads it | general-purpose | `docs/video-editing/output-counting-policy.md` (new) |
| 6b | **PRD §15 and tech-spec §15 must state the population the number 20 is over**, in this same change — not merely carry a pointer. The numeral is unchanged; the denominator kind becomes resolved outputs, which T-1 itself puts at "roughly 4×" the work (`todos.md:26`). A pointer is not a denominator | general-purpose | `docs/video-editing/PRD.md` §15, `tech-spec.md` §15 |
| 7 | Append **D-56**, graduating T-1 into the (now repaired) table, and **amend the reservation blockquote at `decisions.md:64-69` to record the closure**. Then **retire T-1 from `todos.md`**, whose own convention (`todos.md:5`) is that it holds only what is open — leaving a settled T-1 there after D-56 lands is a second home for the counting rule | general-purpose | `docs/video-editing/decisions.md`, `todos.md` |
| 8 | **`resolveOutputs` — one implementation; its key, its population and its input channel are all stated, not implied.** **Key = `(sourceClassification, accountId, jobId, creativeBriefId)`.** Each component earns its place against a named eviction: `sourceClassification` so a fixture can never evict a real output (**[R1-fix, BLOCK 3]**, D-36); `accountId` because `status.ts:148-152`'s own comment says packages *"travel away from the job that minted them"*, so an account must be isolated by construction rather than transitively via `jobId` (**[R2-fix]**); `jobId` because `loadAllPackages` walks **every** job (**[R1-fix, BLOCK 2]**). **Population: resolution runs over the evidence-complete set, i.e. after `status.ts:268`'s `evidenceGaps` filter [R2-fix, BLOCK 7].** Otherwise an incomplete package supersedes a complete one and criterion 1 goes **1 → 0** while criterion 4 separately reports the offender — the exact sibling of the fixture-eviction case. **Signature takes `LoadedPackages`, not `packages` [R2-fix]:** rev 2's `rejected` channel was dead policy, because `loadAllPackages` never puts an unreadable file into `packages`, so nothing could ever populate it. Taking both channels makes the unreadable set visible to the resolver, which is what task 11 needs.

**Relocate the two symbols that signature depends on, or this task cannot be built [R3-fix, BLOCK 11].** `LoadedPackages` is declared at `status.ts:78` and `evidenceGaps` is **non-exported** at `status.ts:213` — both in `apps/cli`, which `packages/contracts` cannot import. This is verbatim the argument that moved `comparePackages`, and rev 3 failed to apply it to the two symbols its own fixes introduced. Move **`LoadedPackages`, `evidenceGaps` and `comparePackages`** into `output-identity.ts` (precedent: `reviews.ts:65-82` owns `LoadedReviewDecisions`), have `status.ts` import all three, and list them in §10. **The completeness filter runs *inside* `resolveOutputs`** — if it ran in the caller, Stage 1's cohorts and Stage 6's denominators (§8, calling with raw `loadAllPackages()` output) would get a *different answer* than `status.ts` does, which is one implementation with two answers, the thing B11 exists to prevent.

**Scope the `rejected` channel to what is knowable [R3-fix, residual made explicit].** An entry in `LoadedPackages.unreadable` is `{path, reason}` (`status.ts:80`) — it failed validation, so its `creativeBriefId`, `accountId` and `sourceClassification` are unknowable and only `jobId` is recoverable from the path template at `:170`. "The affected group" is therefore uncomputable. Follow the precedent exactly: `resolveApprovalForManifest` (`reviews.ts:352-353`) goes **indeterminate** on *any* unreadable file in the namespace. Do the same — any unreadable package makes resolution indeterminate — which costs nothing, because task 11 already makes all four criteria unproven in that case. Resolve supersession by the existing total order — **relocate `comparePackages` (`status.ts:83-114`) into this module, `status.ts` importing it [R1-fix]**: `packages/contracts` cannot import from `apps/cli`, so "reuse the existing comparator" was unsatisfiable as rev 1 wrote it, and reimplementing it is the second-sort-rule failure this module exists to prevent. **Report as an anomaly** (never merge) a `creativeBriefId` appearing under two `jobId`s — the composite key makes it two groups, which inflates the count silently unless it is named. **Do not add a schema field**, and do not materialise the family key or output key onto `ContractSetEntry`/`ContentPackage` — both are `additionalProperties: false`, so a materialised field makes every new package schema-invalid | general-purpose | `cutdown/packages/contracts/src/output-identity.ts` (new) + tests, `cutdown/apps/cli/src/commands/status.ts` |
| 9 | **Fix the predicate the label already promises — and the sentence beside it [R1-fix BLOCK 1; R2-fix BLOCK 5].** `CONTRACT_WINDOW` is already `10` and the label already says ten. The `2` appears **twice**, and rev 2's "single wrong token" was wrong: `status.ts:350` (`met: window.length >= 2 && …`) **and** `status.ts:352` (`window.length < 2 ? …`), which selects between the UNPROVEN string at `:353` and the *"no schema major version moved between consecutive packages"* string at `:355`. Change **both**, plus the `:353`/`:355` wording, in one edit — otherwise a 3-to-9-output window reports `unproven` while printing the sentence that denies a bump happened. Cite PRD §15's Phase 0 row beside the predicate. **This is the defect this Critical Path exists for**, open since before Stage 0A.

**The rule is three-way, not two-way [R3-fix, BLOCK 9].** A two-branch rule (`window < 10 ⇒ unproven`, else breaking/clean) swallows a *detected* breaking change inside a short window, reporting a **proven failure** under **insufficient evidence**'s label — and it defeats 0B-1 at exactly the moment it is needed, since the 0B-3 migration lands at ~3 outputs. Write it as:

- `breaking.length > 0` ⇒ **`not_met`**, at **any** window size, naming the offenders;
- `breaking.length === 0 && window < CONTRACT_WINDOW` ⇒ **`unproven`**;
- otherwise ⇒ **`met`**.

`offendingPackageIds` (`status.ts:358`, printed at `:424`) must be empty under `unproven`, or the output lists offenders for a criterion it says it cannot judge | general-purpose | `cutdown/apps/cli/src/commands/status.ts` |
| 10 | Wire `resolveOutputs` into `status.ts`. Criterion 1 counts resolved outputs **and derives its account tally from resolved outputs too** — otherwise the numerator and denominator disagree about what an output is (**[R1-fix]**; today's single-account repo cannot distinguish the two implementations, so this needs a 2-account test, not a live check). **Criterion 3's drift timeline stays over every delivered real package, NOT over survivors [R2-fix, BLOCK 6].** Rev 2 narrowed it to survivors and thereby resurrected F-A through a second door: bump a contract, repackage every affected CreativeBrief, and every pre-bump package becomes superseded — so the survivors all carry the new major, `diffContractSets` returns nothing, and criterion 3 prints "no major moved" over a window in which it demonstrably did. **The reason the timeline and the count legitimately differ: `contractSet` is a property of the *package* — the artefact that recorded it — not of the *output*.** State that in the module doc and assert it.

**But the threshold counts OUTPUTS, not packages [R3-fix, BLOCK 8].** Rev 3 separated the two populations for *drift detection* and left the *ten* denominated in packages, which re-opens F-A's family through a third door: ten repackages of a single CreativeBrief would make criterion 3 decidable and green over **one** output, at roughly the 4× dilution T-1 itself predicts (`todos.md:26`). PRD §15 (`PRD.md:947`) and the label at `status.ts:347` both say **outputs**. So: **the window is the delivered real packages spanning the last `CONTRACT_WINDOW` resolved real outputs** — drift is compared across every package in that span, and the ten-threshold counts the resolved outputs within it. §2, §5 and §7 are corrected to that unit. Add the test `10 packages / 1 output ⇒ unproven`. And name the filter: "delivered real packages" means the **evidence-complete** ones (`status.ts:269`), matching the population resolution runs over — reading it as "all" would silently widen criterion 3. The **Counts block must reconcile** — see B14's equation — and the superseded package is reported **by name, not only as a count** (a superseded count of `0` is indistinguishable from "supersession was not computed" — R1) | general-purpose | `cutdown/apps/cli/src/commands/status.ts` |
| 11 | **An unreadable package makes a criterion unproven, and the mapping is stated per criterion — not for a chosen subset [R1-fix BLOCK 4; R2-fix].** Rev 2 named criteria 1 and 3 and silently left 2 and 4. The required mapping, all four rows: **c1** unproven (the count is incomplete); **c2** unproven (it runs over the same population and cannot know whether the unreadable file carried invalid ranges); **c3** unproven; **c4** unproven, **not** `not_met` — `status.ts:365`'s `unreadable.length === 0` currently reports *disproven* where the evidence is merely unreadable, and two existing tests (`status.test.ts:407`, `:498`) would cement that during task 12's migration. Name the file; never delete evidence. **The remedy is mandatory, not conditional [R2-fix]** — task 11 triples the blast radius of an unreadable file, and the 2026-07-30 lesson is that a widened fatal path ships *with* its way forward. Follow `reviews.ts:341-342`'s non-destructive wording; the only writer under `jobs/*/packages/` is `skills/package/src/main.ts:572-573`, so the remedy is "re-run `cutdown package`, or move the bad file aside" | general-purpose | `cutdown/apps/cli/src/commands/status.ts` |
| 12 | **Replace `Criterion.met: boolean` with a discriminated `state: 'met' \| 'not_met' \| 'unproven'` — replace, never widen [R1-fix].** Widening leaves `status.ts:422`'s `criterion.met ? 'x' : ' '` rendering any truthy value as `[x]`, so `unproven` would print as MET — the exact inversion F-L exists to prevent, introduced by F-L's own fix. Replacing makes `tsc` enumerate every site. **All three production consumers handled**: `:384` `exitEarned` (unproven ⇒ **not** earned); `:422` the renderer (three distinguishable glyphs — e.g. `[x]` / `[ ]` / `[?]`); and `:408`'s sentence, **whose new form is decided here rather than left to the implementer [R2-fix]**: `"<n> of 4 criteria are not met: <ids>; <m> unproven: <ids>"`, with either clause omitted when its count is zero. Rev 2 left this open while B9 quietly pre-decided the two-state wording — the same §-versus-§ disagreement as BLOCK 4, at a new site. **All four criteria take the typed state, not the three that carry UNPROVEN prose today [R2-fix]** — `approved-real-outputs` (task 11 makes it unproven on an unreadable package, and rev 2's enumeration omitted it), `zero-invalid-source-ranges` (`:300`), `no-breaking-contract-change` (`:353`), `rights-and-qa-evidence` (`:368`). 19 assertions in `status.test.ts` migrate — verified count, not an estimate | general-purpose | `cutdown/apps/cli/src/commands/status.ts`, `tests/status.test.ts` |
| 13 | **Tests — written, not inherited** (**F-M**: `status.test.ts:111` mints a fresh `creativeBriefId` per package, so every existing test stays green under T-1). **`PackageOptions` already carries `sourceClassification` (`:56`) and `jobId` (`:67`) — only `creativeBriefId` is new [R2-fix]**; and `writePackage` defaults `jobId` to a **fresh job per package** (`:79`), so any "one CreativeBrief, one job" test must pass `jobId` explicitly or it passes vacuously under the composite key. Then: two packages of one CreativeBrief count once and the **later** survives; the superseded one is **named**; two in **different jobs** do not merge; two under **different accountIds** do not merge; a **fixture** sharing a CreativeBrief with a real package does not evict it; an **evidence-incomplete** package never supersedes a complete one; **nine** outputs leave criterion 3 unproven **and the detail text does not claim no major moved**, **ten** make it decidable; a bump followed by a **repackage of every affected brief** still shows criterion 3 red (the BLOCK-6 case); an **unreadable** package leaves all four criteria unproven; a **2-account** case proving the account tally is over resolved outputs; the live `2 → 1` transition | general-purpose | `cutdown/apps/cli/tests/status.test.ts`, `cutdown/packages/contracts/tests/output-identity.test.ts` |
| 14 | Add a **"superseded by Stage 0B §1"** banner to the old plan — the precedent its own task 21 set (add a pointer, do not renumber). A reader opening it today still sees twelve live tasks including "create `content-package-v2.json`" | general-purpose | `docs/plans/cutdown-product-program-phase-0.md` |
| 15 | Write the review record with the verbatim before/after `status --phase0`. **Note that all three delivered packages are `pass_with_waivers`** (D-35), so the "1 of 20" is one *warning-waived* output and must not read as clean | general-purpose | `docs/progress/cutdown-product-program-stage-0b-review.md` |

### 0B-3 — The migration (outline; re-plan when 0B-1 and 0B-2 are proven on disk)

**Its first task is to re-read the master plan's order-critical constraint** (`master-plan.md:162`) and decide whether criterion 3's window is empty enough to bump. What the spike already settled:

- **Build order** (**F-H**): schema → `pnpm build` → `build:contracts` → `pnpm build` → consumer code → fixtures → the three checks. Not negotiable.
- **Blast radius** (**F-F**): 2 modified (`generated/typescript/index.ts`, `generated/python/cutdown_contracts/style_profile_v1.py`) + 2 new files per schema. `style_profile_v1.py` changes because datamodel-codegen renumbers colliding class names globally; a "files to modify" list omitting it is wrong. **Nothing pins `Role3` today** (spike residual 5) — decide whether to pin it.
- **The Python collision hazard is retired** (**F-G**, as corrected): a second `ContentPackage` title does not break `getattr(module, title)`; both modules export the symbol.
- **Reader before writer** (**F-N**): `status.ts:116` accepts v2 before `package` emits it, or criterion 4 goes red on the first v2 package.
- **`skills sync --check` will not catch the bump** (**F-O**), and its doc comment at `skills-sync.ts:213-214` claims it will. Correct the comment in the same change.
- **Open scope question:** whether `content-package` needs a v2 at all. The identity motive is gone; `render-v2`'s path-pattern fix stands on its own.

## 10. Files to Create / Modify

| Path | New/Modified | Package |
|---|---|---|
| `cutdown/packages/contracts/tests/contract-set.test.ts` | **New** | 0B-1 |
| `cutdown/packages/contracts/src/contract-set.ts` | Modified | 0B-1 |
| `cutdown/packages/contracts/src/subset-lint.ts` | Modified | 0B-1 |
| `cutdown/packages/contracts/tests/subset-lint.test.ts` | Modified | 0B-1 |
| `cutdown/packages/contracts/src/output-identity.ts` | **New** | 0B-2 — **and the new home of `comparePackages`, `LoadedPackages` and `evidenceGaps`**, all three relocated out of `apps/cli` **[R3-fix, BLOCK 11]** |
| `cutdown/packages/contracts/tests/output-identity.test.ts` | **New** | 0B-2 |
| `cutdown/packages/contracts/src/index.ts` | Modified | export the new module |
| `cutdown/apps/cli/src/commands/status.ts` | Modified | 0B-2 (imports `comparePackages`) |
| `cutdown/apps/cli/tests/status.test.ts` | Modified | 0B-1 (4b) + 0B-2 (13) |
| `docs/video-editing/output-counting-policy.md` | **New** | 0B-2 |
| `docs/video-editing/decisions.md` | Modified | table repair + D-61 + D-56 + blockquote amendment |
| `docs/video-editing/PRD.md`, `tech-spec.md` | Modified | §15 population, not just a pointer |
| `todos.md` (repo root) | Modified | retire the settled T-1 |
| `docs/plans/cutdown-product-program-phase-0.md` | Modified | superseded banner |
| `docs/plans/cutdown-product-program-master-plan.md` | Modified | Progress Tracking |
| `docs/progress/cutdown-product-program-stage-0b-review.md` | **New** | the record |

**No file under `cutdown/packages/contracts/schemas/` or `generated/` is touched** — acceptance criterion **B8**.

## 11. Verification Steps

1. `cd cutdown && pnpm build` — clean.
2. `build:contracts --check` — PASS, trees current (nothing regenerated).
3. `validate:contracts` — PASS, **42 cases** (unchanged), 0 lint, 0 disagreements.
4. `skills sync --check` — PASS, 10 skills.
5. `pnpm -r --no-bail run test` — **`fail == 0` AND `pass >= 901` AND `skipped <= 5`**, each named separately. **[R1-fix]** The baseline is *tests 906 = 901 pass + 5 skipped, 217 suites*; rev 1 wrote "total > 901", which is the pass count wearing the total's name and would accept a run that converted passes into skips.
6. `uv run --with ruff ruff check --config ruff.toml .` — clean.
7. `uv run pytest -q` — 0 fail, **and capture the summary line** (the spike could not, and said so).
8. `doctor` — 7/7.
9. `status --phase0` — **1** real output across **1** account; criterion 3 **unproven** and saying so distinctly; the superseded package **named**; `PHASE_0_EXIT_EARNED` red; `PIPELINE_IMPLEMENTATION_COMPLETE` green.
10. `git ls-tree -r --name-only 276176e -- cutdown/packages/contracts/schemas cutdown/packages/contracts/generated | wc -l` prints **54** (pathspec non-vacuous), then `git diff --exit-code 276176e -- <same>` exits 0.
11. Render-check `decisions.md`: D-56 and D-61 appear **inside** the table, and D-40…D-58 no longer render as literal pipe text.

## 12. Acceptance Criteria (verifiable PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| B1 | A new major of an existing family classifies **breaking**, not `added` | `contract-set.test.ts::"a new major of an existing family is breaking"` |
| B2 | A brand-new contract stays `added`; a minor bump stays `compatible` — asserted **on the `kind`**, not on a downstream `met` | `contract-set.test.ts::"a minor bump stays compatible"` **[R1-fix]** |
| B3 | Family retirement is not silently swallowed; the behaviour is stated in the module **and** asserted | `contract-set.test.ts::"retiring a major is not invisible"` |
| B4 | A first-wins family reducer **fails** the suite | a test that a `{1,2}` family reported as major 1 is a failure |
| B5 | A `-vN` file whose declared major is not N fails the lint; 0 false positives; a no-`-vN` contract is skipped | `subset-lint.test.ts` positive + negative + live-tree control |
| B6 | Two packages of one CreativeBrief, one job, one class → **one** output, later surviving, earlier **named**. A CreativeBrief **revision** is stated as out of scope with its evidence | `status.test.ts::"two packages of one CreativeBrief count once"`; policy §revision |
| B6b | Two packages of one CreativeBrief in **different jobs** do **not** merge; two under **different `accountId`s** do not merge; a **fixture** never supersedes a real output; an **evidence-incomplete** package never supersedes a complete one | `output-identity.test.ts` ×4 **[R1-fix BLOCKs 2 & 3; R2-fix BLOCK 7]** |
| B7 | **Nine** outputs leave criterion 3 unproven; **ten** make it decidable; the predicate reads `CONTRACT_WINDOW`, not `2`; **and at nine the detail text does not claim "no schema major version moved"** | `status.test.ts::"nine outputs leave criterion 3 unproven"` asserting **both the state and the detail string**, plus a test reading the constant **[R1-fix BLOCK 1; R2-fix BLOCK 5 — rev 1's B7 passed with the defect intact, and rev 2's would have passed with the detail branch still saying `< 2`]** |
| B7b | An **unreadable** package leaves **all four** criteria **unproven** — criterion 4 included, which reports `not_met` today — and the printed remedy is non-destructive | `status.test.ts` ×4 + a grep of the remedy string **[R1-fix BLOCK 4; R2-fix]** |
| B7c | **A contract bump followed by a repackage of every affected CreativeBrief still shows criterion 3 red.** The drift timeline is delivered real packages, not survivors | `status.test.ts::"a bump absorbed by repackaging is still breaking"` **[R2-fix, BLOCK 6]** |
| B8 | No schema file and no generated file changed; pathspec vacuity checked | verification step 10 |
| B9 | `status --phase0` live reports **1** real output; criterion 1 `not_met` and criterion 3 `unproven`, **rendered and worded as different states** — the summary line reads *"1 of 4 criteria are not met: approved-real-outputs; 1 unproven: no-breaking-contract-change"*, not "2 of 4 not met" **[R2-fix — rev 2's B9 quietly re-merged the two states in the one string a human reads]**. The `pass_with_waivers` status is stated so "1 of 20" cannot read as clean (D-35) | verbatim before/after in the review record |
| B10 | Entry gate green; `validate:contracts` still exactly **42** cases; the test gate asserts pass/skip/fail separately | steps 1–8 |
| B11 | `resolveOutputs` is the **only** implementation of output identity, and `comparePackages` has **one** home | a recorded grep + the module docstring |
| B12 | `Criterion.met` is **removed**; all three states render distinguishably; all three UNPROVEN-carrying criteria take the typed state; `exitEarned` treats unproven as not earned | the type + `status.test.ts` **[R1-fix]** |
| B13 | The account tally is over **resolved outputs**, proven by a 2-account test rather than by the 1-account repo | `status.test.ts::"the account tally counts outputs, not packages"` **[R1-fix]** |
| B14 | The Counts block **reconciles against a written equation**. **Rev 3's equation was false and is corrected here [R3-fix, BLOCK 10]:** `status.ts:269` filters `real` from `complete` while `:270` filters `fixture` from `all`, so `total = real + fixture` breaks on any evidence-incomplete real package — and task 13 **mandates creating exactly that package**, so rev 3's mandated test would have passed vacuously today (3 = 2 + 1) and failed for the wrong reason the moment its own fixture landed. The identities are `totalPackages = realPackages + fixturePackages + packagesMissingEvidence` and `resolvedRealOutputs + supersededRealPackages + rejectedRealPackages = realPackages` — with `real` and `fixture` derived over the **same** population, and the `rejected` term present because a rejected package is neither a survivor nor superseded. `totalPackages` counts **readable** packages only (`status.ts:388` is `all.length`, which excludes unreadable files) — so it is renamed rather than left as a subset wearing a total's name, exactly like the resolved-outputs field. Real-class and fixture-class outputs are **never summed**, and the superseded package appears **by name** | live output + a test asserting both identities, **including an evidence-incomplete real case and a non-empty `rejected` case** |
| B15 | `decisions.md` renders D-40…D-61 as table rows; the repair diff shows **zero** row-text change | verification step 11 + `git diff` |
| B16 | Every behaviour claim added in a comment is asserted by a test or absent | reviewer check |

**Retired from the old plan:** A3 (supersession cycles / dangling `parentOutputId` — no such pointer is built), A4 and A14 (`outputId` inheritance — no such field; the *property* A4 protected is preserved by B6's revision row), A15 (legacy identity rule — **F-J**). A1/A2/A5 fold into B6/B7/B7b. A13 becomes B1.

## 13. Out of Scope (Surgical Changes)

- **Do not** create `content-package-v2.json`, `render-v2.json` or `supersession-record-v1.json` — that is 0B-3.
- **Do not** add `outputId` or `outputLineage` to any schema.
- **Do not** touch `src/`, `tests/`, `config/`, `docs/initial/`.
- **Do not** edit a published schema in place, or any file under `generated/`.
- **Do not** rewrite existing delivered ContentPackage files.
- **Do not** edit D-13, D-33 or D-47 in place — supersede by appending.
- **Do not** renumber `decisions.md`; D-56 fills its reserved gap and the drift decision is D-61 (D-59 and D-60 are reserved elsewhere). The table repair deletes **blank lines only**.
- **Do not** resolve F-Q by naming an unenforced field.
- **Do not** start any Stage 1 contract, HTTP layer, or UI.
- **Do not** delete `cutdown-product-program-phase-0.md` — task 14 banners it.

## 13a. Recorded residuals — carried into the build, not fixed in another plan round

Round 3 was FINAL by this project's gate convention. Its four BLOCKs were applied as rev 4 (they each produce a wrong build); the rest is recorded here so the build carries them knowingly rather than rediscovering them.

| # | Residual | Owner |
|---|---|---|
| 1 | **The measurement canon points at the wrong task.** `.claude/skills/cd-measurement-honesty/SKILL.md` (`:29`, `:45`, `:137`) and `.claude/agents/cutdown-measurement-reviewer.md` (`:16`, `:40`) all pin the `window.length >= 2` fix to "Stage 0B **task 13**"; here it is **task 9**. Neither file is in §10 | fix during the build, in the same change as task 9 |
| 2 | **Task 11's stated reason for criterion 2 is wrong**, though its outcome is right: c2 runs over `complete` (all classes, **including the fixture** — live: *"3 package(s) carry range-validation evidence"*), not "the same population as c1". Keep the outcome; replace the reason with "an unreadable file may have carried invalid ranges" | build |
| 3 | **No precedence rule** for a run holding *both* an evidence-incomplete package (genuinely disproven) and an unreadable one (unproven). R1 keeps those distinct; the plan leaves the choice to the implementer | build — decide and test |
| 4 | **Task 2 does not specify the family drift *payload*.** `ContractDrift.breaking` carries scalar `from`/`to` (`contract-set.ts:81`) and `status.ts:320`/`:326` print `schemaId.split('/').pop()` and `v{from}→v{to}`. Under family keying the printed detail could name a file that does not exist (`platform-edl.json`), and `from`/`to` are ill-defined when a family holds two majors. **The printed detail string is exactly what BLOCK 5 was about** | build — specify the payload and pin the detail in a test |
| 5 | **Two homes for one population statement** — task 6b requires PRD §15 *and* tech-spec §15 to state the population while `output-counting-policy.md` is the authoritative home. D-54's own lesson: *"two homes for one number is how they come to disagree silently."* Preferred resolution: the policy states the rule; PRD/tech-spec name the denominator **kind** and cite | build |
| 6 | **Three wrong citations** in the plan: `status.ts:148-152` (the "travel away from the job" comment is at `:209-210`/`:264`), `status.test.ts:79` (the fresh-`jobId` default is `:81`), `skills-sync.ts:213-214` (the claim is `:214-216`). Also "Stage 0A repaired `decisions.md:96-102`" is false — Stage 0A appended into that block (9 insertions, 0 deletions) and repaired nothing; the **task** is still correct and sufficient | build |
| 7 | "19 assertions" is 19 `.met` **references** — 17 assertions plus 2 `.filter((c) => c.met)` predicates. Count right, noun loose | cosmetic |
| 8 | **"The five axes"** is defined only in `cutdown-product-program-phase-0.md:119`, the file task 14 banners as superseded. Restate them in the policy | build |
| 9 | An `accountId`-spanning `creativeBriefId` gets a non-merge test but **no anomaly report** — the inverse of the jobId case: it *splits* one output into two and adds a spurious account, moving criterion 1 **toward** green | build — report it too |
| 10 | A semantic change to a file under `schemas/common/` or `enums/` is invisible to criterion 3 entirely — `currentContractSet()` records only the 14 top-level `schemas/*.json`. Pre-existing, out of this stage's scope, named so it is not rediscovered as new | 0B-3 or later |

## 14. Completion Criteria (Definition of Done)

- **Entry gate clean first** — every command in §11 passes, or no **new** failures vs the recorded baseline.
- `code-reviewer`, `cutdown-boundary-reviewer` **and** `cutdown-measurement-reviewer` report PASS, and the report card reads **Ready**.
- Cross-referenced docs consistent in the same change: `decisions.md` (repair + D-56 + D-61 + blockquote), `output-counting-policy.md`, PRD §15, tech-spec §15, `todos.md`, both plan files, the master plan's Progress Tracking.
- Acceptance criteria B1–B16 met, or any miss reported as exactly that.
- **The milestone claim is honest**: this stage makes the count *stricter*. `PHASE_0_EXIT_EARNED` stays red and moves **further** from green (1 of 20, not 2), and criterion 3 becomes unproven rather than green. That is the intended direction and must be reported as such, never softened.
