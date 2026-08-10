# Cutdown — Output Counting and Comparability Policy

**Status:** authoritative. **Settled by:** `decisions.md` **D-56** (counting) and **D-36** (identity and status evidence). **Written:** 2026-08-10 (Stage 0B task 6).

**Why this file is in the authoritative doc set and not in `cutdown/docs/`:** it narrows a PRD §15 exit criterion. "At least 20 approved real outputs across 3 accounts" is not measurable until *output* has one definition, and the definition changes the amount of real production work behind the gate — the owner's estimate when settling the question was that 20 outputs is *either ~5 jobs or ~20 jobs* of real production work depending on the answer. That reasoning is recorded in **`decisions.md` D-56**, which graduated it; the `todos.md` row it came from (T-1) is retired and no longer exists, so D-56 is the citation.

**Two cautions about that estimate, because it has already been mis-transcribed.** It is an estimate of **jobs per output** — not of packages per output — and it is an owner's estimate, not a measurement. The only packages-per-output ratio that exists on disk is different and smaller: two delivered `real` packages resolve to **one** real output. No packages-per-output multiplier is asserted anywhere in this doc set, and none should be until one is measured. *(D-56's own row cites `todos.md:26` for this reasoning. That line pointer now dangles — T-1 was deleted in the same change that wrote this file — but D-56 quotes the reasoning inline, so nothing is lost, and `decisions.md` is append-only: the row is left exactly as written and the correction lives here. See §5.)*

**Who reads it.** `status --phase0` (the exit-criterion evaluator) and `resolveOutputs` implement §1–§3. **Stage 1** (cohorts and scorecards) and **Stage 6** (the uplift gate) read §4. Both must read this file rather than deriving their own rule — a second sort rule in a second caller is a second answer.

**One home.** The counting *rule* lives here. PRD §15 and tech-spec §15 name the population **kind** the number 20 is over and cite this file; they do not restate the rule. Two homes for one number is how they come to disagree silently (D-54).

---

## 1. What one output is

> **An output is one approved cut per `CreativeBrief`. A second delivered package for the same CreativeBrief supersedes the earlier one rather than adding to the count.** (D-56, owner-settled 2026-08-09 as `todos.md` T-1 — a row now retired into D-56, which is the citation.)

The rationale is REQ-110's: a *variant* is defined by its **angle, audience promise and hook hypothesis**, and every one of those is a property of the CreativeBrief, not of the render. Two packages built from one CreativeBrief are two attempts at one angle.

### 1.1 Identity is derived, not stored

Output identity is computed from `lineage.creativeBriefId`, a **required** field of `content-package-v1` (it is in the `lineage` object's own `required` array) that every delivered package already carries as a valid ULID. There is no `outputId`, no `outputLineage`, no supersession artefact, and no legacy-identity rule, because there is no identity gap to cross.

**Why derived rather than stored — this is a rule, not a convenience.** `skills/package/schema/input.json:5` says so in the schema's own top-level description:

> "Names the FINAL render to package. Deliberately minimal: every other input — the approval, the QA report, the rights records, **the lineage**, the contract set — is read from committed artefacts rather than accepted from the caller, **because a caller-supplied evidence field is a caller-supplied claim**."

The packaging skill's input contract has exactly two properties (`jobId`, `finalRenderId`) with `additionalProperties: false`, and it names *the lineage* among the things it refuses to accept from a caller. A stored output identity would therefore have to be either minted per run — which makes every repackage a new output, the exact inflation D-56 exists to stop — or supplied by the caller, which would make the number PRD §15 criterion 1 counts an **operator assertion**, on the one skill whose input contract explicitly refuses operator assertions as evidence.

It also matches this repository's own precedent: `skills/approve` resolves supersession by derivation over a total order within one namespace and never by a declared pointer — its `supersededDecisionIds` is a computed **report**, and the artefact on disk carries no `supersedes` key.

### 1.2 Grouping scope

A bare `creativeBriefId` is **not** the key. `loadAllPackages` walks every job under the jobs root, and nothing binds a package's `creativeBriefId` to its own job, so a bare key would group across jobs and across accounts — and criterion 1's account tally is built from the survivors, so a cross-account merge would silently *remove an account* from the count.

The key is composite: **`(sourceClassification, accountId, jobId, creativeBriefId)`**, resolved over the evidence-complete set. Each component blocks a named eviction — a fixture must never evict a real output (D-36); an account must be isolated by construction rather than transitively; a package that travels away from the job that minted it must not merge into another job's group; and an evidence-incomplete package must never supersede a complete one. The implementation and its tests are Stage 0B task 8 (`packages/contracts/src/output-identity.ts`); this section is the rule it implements.

---

## 2. The classes, and what each counts toward

PRD §15's four Phase 0 exit criteria, numbered as they are cited throughout:

1. at least 20 approved **real** outputs across 3 accounts;
2. zero invalid source ranges in final renders;
3. the last 10 outputs require no breaking contract change;
4. rights records and QA reports accompany **every delivered package**.

**The unit differs by criterion, deliberately.** Criteria 1 and 3 are denominated in **resolved outputs** (§1). Criteria 2 and 4 are denominated in **delivered packages** — their subject is the evidence obligation that attaches to an artefact, and a superseded package is still a delivered artefact that had to carry rights records and a QA report. Criterion 3 is the one hybrid, and it is a hybrid on purpose: its **threshold** counts resolved outputs (ten), while its **drift timeline** compares every delivered real package spanning those outputs, because `contractSet` is a property of the *package* — the artefact that recorded it — not of the *output*. Narrowing the timeline to survivors would let a bump be absorbed by repackaging every affected brief and read clean.

| Class | What it is | New output? | c1 (≥20 real) | c2 (ranges) | c3 (drift) | c4 (evidence) |
|---|---|---|---|---|---|---|
| **Variant** | A distinct `CreativeBrief` — a distinct angle, audience promise and hook hypothesis (REQ-110) — carried to an approved, packaged cut | **Yes** | counts (if `real` and evidence-complete) | its package counts | its package enters the window; the output counts toward the ten | its package counts |
| **CreativeBrief revision** | A *revised CreativeBrief*. Mints a new `creativeBriefId`, so it would be a **new output** — see §2.1: **out of scope at Phase 0** | (out of scope) | — | — | — | — |
| **Downstream revision** | `cutdown revise` regenerating the story plan, EDL or captions **under the same CreativeBrief** | No | does not add; the re-packaged result supersedes | its package counts | its package enters the window; **no** new output toward the ten | its package counts |
| **Repackage** | `cutdown package` re-run over the same approved final render | No | does not add; supersedes | its package counts | its package enters the window; **no** new output | its package counts |
| **Rerender** | A new final render from the same CreativeBrief, re-approved and re-packaged | No | does not add; supersedes | its package counts | its package enters the window; **no** new output | its package counts |
| **Superseded** | An earlier package displaced by a later one under the same composite key | No — it is not an output, it is a package | excluded from the count, and **named** in the report | still counts | still enters the drift timeline | still counts |

**A superseded package is reported by name, never only as a count.** A superseded count of `0` is indistinguishable from "supersession was not computed".

### 2.0 Real and fixture

`sourceClassification` is the **sole** mechanism keeping fixture runs out of exit evidence (D-36), and it is enforced by partitioning the resolver's key, not asserted in prose.

| Class | c1 (≥20 real) | c2 (ranges) | c3 (drift) | c4 (evidence) |
|---|---|---|---|---|
| `real` | **counts** — c1 is real-only, by its own wording | counts | **counts** — the window is real packages | counts |
| `fixture` | **excluded (D-36)**, and reported separately so the exclusion is visible | **counts** | **excluded** | **counts** |

Criteria 2 and 4 carry **no "real" qualifier in PRD §15**, and today they legitimately include the delivered fixture package: the live report reads *"3 package(s) carry range-validation evidence"*, which is two real packages plus the fixture, and criterion 4's denominator is every readable delivered package. That is arguably right — the obligation to carry a QA report and rights records attaches to any artefact the pipeline delivers, fixture or not — and saying it out loud is exactly what an authoritative policy is for. What is **not** allowed is summing the two classes into a single "outputs" number: real-class and fixture-class counts are reported separately and never added.

### 2.1 Which "revision" the revision row means — and why it is out of scope

There are two distinct things called a revision, and conflating them mis-states the count.

A **downstream revision** (`cutdown revise` on the story plan, EDL or captions) keeps the same `creativeBriefId` and is therefore *not* a new output. That is the common case and it is settled above.

A **CreativeBrief revision** is different: a revised CreativeBrief mints a **new `creativeBriefId`**, so under §1's rule it would be a **new output** — and would inflate the count by one for what a human would call the same angle, edited.

**It is not reachable today**, and the evidence is:

- `skills/propose/src/main.ts:143` writes `parentCreativeBriefId: null` **unconditionally** for every candidate brief it mints. The field exists on `creative-brief-v1` but no producer ever populates it.
- `skills/revise` never regenerates a CreativeBrief. It can *classify* a reviewer note as requiring one (`target: 'creative-brief'`), and when it does it **refuses** — `skills/revise/src/main.ts:234-241` returns a structured refusal naming the target and directing the operator to run `cutdown propose` instead, because "the model call that owns that object" must make it.

So the only route to a revised brief is a fresh `propose` run, which produces a brief with a `null` parent — indistinguishable, on disk, from a genuinely new variant.

**Declared out of scope at Phase 0.** The revision row above counts nothing, and no resolver behaviour depends on it. This is a deliberate declaration rather than an omission: the case is *stated* so that a later reader does not discover it as a surprise, and so that the day `propose` starts linking parents, this row is re-decided rather than silently inherited. D-56's revisit trigger names that day.

### 2.2 The escape clause — out of scope at Phase 0

D-56's rule arrived from T-1 with an escape clause: "unless both are separately approved for publication". **That exception is out of scope at Phase 0, and it is out of scope because nothing writes it and nothing reads it — not because it is unimportant, and not because it is unrepresentable.**

**Representable it is, and this must be stated accurately.** `releaseState` is a **required** property of `content-package-v1`, and it `$ref`s `../enums/package-release-state.json`, whose enum declares **all five** states: `draft`, `editorially_approved`, `rights_approved`, `publish_ready`, `published`. The enum's own description says all five are declared deliberately, "so a later phase adds behaviour rather than a contract version". So the value `published` is a legal value of a required field today.

What is missing is a writer and a reader:

- **No writer.** `skills/package/src/main.ts:564-567` computes the state as `'editorially_approved' | 'rights_approved'` and records in its own comment that the skill "never emits `publish_ready` (REQ-088's post copy/hashtags/alt text are product Phase 1, REQ-054) or `published` (Stage B+), **because it cannot substantiate them**". No other producer in the repository writes the field. Both delivered real packages are `rights_approved`.
- **No reader.** Neither `apps/cli/src/commands/status.ts` nor `packages/contracts/src/output-identity.ts` (`resolveOutputs`) mentions `releaseState` at all. Nothing on the counting path branches on it.

**The consequence is sharper than "the exception is unrecorded", and it is a live hazard rather than a comfort:** a hand-authored package carrying `releaseState: "published"` would **validate against the schema today and be counted under §1's rule exactly like any other package, silently** — no error, no warning, no separate tally. So asserting the exception out-of-band is not impossible; it is merely *inert*. Either way the exception is indistinguishable from the rule in the number, and a policy that admitted it would be admitting a condition nothing enforces.

**This is deliberately not resolved by leaning on the field that already exists.** A field nothing writes and nothing reads would make the exit count depend on a claim no check can test — the same caller-supplied-evidence failure §1.1 refuses. If the exception is wanted later, the decision that admits it must arrive with the field's **writer**, its **reader**, its enforcement and an enforcing test, together.

**Open item — the missing test.** Nothing asserts the behaviour described above. A test should pin it: a `published` package still resolves under §1's rule (and is not silently excluded, nor silently privileged). This section states a reading of the code that was verified by reading it, not a property held by a test — and the difference is exactly the one this doc set refuses to let a comment paper over. The test belongs in `packages/contracts/tests/output-identity.test.ts`; it is **not written**, and it was out of scope for the change that wrote this paragraph.

**Why deferring is safe, stated as an asymmetry:** adopting the exception can only ever **raise** the count (it splits one output into two), never lower it. So the count published under this policy is a **floor**, and the direction of the error is known and conservative. Raising an exit-criterion count is a re-gated change — it must re-run the criteria and be recorded as a superseding decision — never something that arrives by drift.

---

## 3. Degraded and indeterminate cases

- **An unreadable package makes a criterion unproven, never zero and never disproven.** A dropped package would make the ten-output window satisfiable by hiding failures. Unproven is a distinct state from disproven and must be distinguishable in the type, not only in English prose.
- **Never a remedy that deletes evidence.** A refusal over an unreadable package names the file and offers a non-destructive way forward.
- **A `creativeBriefId` appearing under two `jobId`s, or under two `accountId`s, is an anomaly and is reported.** The composite key prevents the merge; the report prevents the silence. The two directions differ and both matter: a job split inflates the output count by one, and an account split additionally adds a spurious account, moving criterion 1 *toward* green.

---

## 4. Comparability

This section is what Stage 1's cohorts and **Stage 6's uplift gate** rest on. Nothing here is a Cutdown invention where PRD §14.2 has a number; every threshold below is cited to §14.2 by row.

### 4.1 The five axes

Two outputs, or an output and a baseline, are **comparable** only when all five hold. (Restated here in full because they were previously defined only in `docs/plans/cutdown-product-program-phase-0.md:119` — a plan file now superseded by Stage 0B. A live rule must not live in a superseded document.)

1. **Same platform.** The delivery surface, including aspect and organic-versus-paid placement. Phase 0 has exactly one (TikTok organic 9:16 AU, D-3). A cross-platform comparison is not a comparison.
2. **Same objective.** The declared primary objective (PRD §12.2's objective scorecards). §14.2's gate is *"primary objective score versus relevant account baseline"* — a different objective is a different metric, not a worse score.
3. **Same account.** The stable owner-issued `accountId` (D-36), never a display name — D-36 keeps the display name off the package precisely so a rename cannot split a count. See §4.6: pooling across accounts is **not** settled here.
4. **Same denominator kind.** Every rate names its denominator, and two rates over different denominator kinds (views, impressions, followers-at-post-time) are not comparable even with identical numerators. The denominator must also be period-stable: a denominator that grows while the numerator accrues is not a rate.
5. **Same post-age horizon.** Measured at the same age since publication (e.g. 7 days), because engagement accrues non-linearly. A 30-day number and a 3-day number are two different measurements.

### 4.2 What is compared to what

**An output is compared to its own account's baseline** — not to another output. PRD §14.2 (`PRD.md:913`) gates on *"Primary objective score versus relevant account baseline"*, and §14.2's preamble (`PRD.md:909`) states that "Performance is objective-specific and account-normalised" and that Phase 1 must first prove **non-inferiority** before any uplift target applies.

Output-versus-output comparison is a **variant experiment**, a different question governed by §14.2's attribution row (§4.4), and it never substitutes for the baseline comparison. Reporting a variant A-versus-B delta under the label "uplift" would answer a question §14.2 did not ask.

### 4.3 Baseline exclusion — a baseline must not include Cutdown's own outputs

The account baseline cohort **excludes every post produced by a Cutdown-delivered ContentPackage.** A baseline contaminated by the treatment regresses toward it: as adoption rises the measured uplift shrinks toward zero regardless of whether the product works, so the metric would quietly stop being able to detect its own success.

Where an account's recent history is *entirely* Cutdown output, there are two honest options and no third: use an explicitly dated **pre-adoption window** as the baseline and say so with its dates, or **produce no uplift number**. Silently letting Cutdown posts into the baseline is not one of them.

**This exclusion is not checkable today — and that is §4.5's fact, not an oversight here.** §4.5 establishes that **no record links a published post to a `contentPackageId`**, and that no such record is a contract or has a writer. Without it, "was this post produced by a Cutdown package?" is unanswerable per post, so the exclusion above cannot be *applied*, only asserted — and "the baseline is clean" would then be exactly the kind of unverifiable assertion §4.4's structural-withholding rule exists to refuse.

**Therefore, by the same structural withholding §4.4 commits to: no publication record, no uplift number.** Until §4.5's publication record exists — naming the delivered `contentPackageId`, the publication timestamp and the `accountId` — the treatment set cannot be identified, the baseline cohort cannot be constructed, and **no uplift figure is computed, rendered, exported or logged**. The scorecard shows the state instead, for example *"no publication record: Cutdown-produced posts cannot be excluded from the baseline"*, and no percentage anywhere.

**The one route that survives, and why.** The dated **pre-adoption window** above is the single exception, because it excludes by *date* rather than per post: a window ending no later than the earliest Cutdown package delivery date cannot contain a Cutdown-produced post, whatever the per-post record says. Using it requires publishing its dates and the delivery date that bounds it. Anything narrower than that — "we filtered out the Cutdown ones" — needs the §4.5 record and does not have it.

**Read §4.3 and §4.5 together.** Neither is complete alone: §4.3 states the exclusion the baseline requires, §4.5 states why it cannot yet be evaluated. A reader who takes §4.3 as an executable instruction without §4.5 will build a baseline it cannot verify.

### 4.4 Minimum n, pre-registration, and structural withholding

**Minimum n (PRD §14.2, `PRD.md:913`).** Non-inferiority is judged "across the first comparable cohort"; the uplift target — "**≥ 10% median uplift**" — applies only "**after at least 30 comparable published outputs across multiple accounts**". The 30 is §14.2's number, quoted, not a local choice. See §4.5: the *unit* of those 30 is not the resolver's unit.

**Pre-registration.** Before the outputs a comparison will judge are published, the comparison is written down: the five axes' values, the baseline window and its exclusion (§4.3), the primary objective metric, the horizon, and the minimum n. A comparison selected after the numbers are visible is a selected comparison, and its p-value means nothing.

**Structural withholding — the number is not produced.** Below minimum n, or without a pre-registration, **no uplift figure is computed, rendered, exported or logged.** The scorecard shows the state instead — for example *"insufficient comparable published outputs: 4 of 30"* — and no percentage anywhere. This is deliberately stronger than hedging: a hedged number is still a number, and a caveat does not survive the trip into a slide. A figure that was never produced cannot be quoted.

**Experiment interpretability (PRD §14.2, `PRD.md:917`), quoted whole:**

> "≥ 90% of **labelled experiments** have stable variant attribution **and** a documented changed variable"

Both conjuncts are load-bearing and both are measured. The common gloss "≥90% attribution" drops the second one, and a set of experiments with perfect attribution and no documented changed variable would pass the gloss while failing the actual gate — an experiment whose changed variable is unrecorded cannot be interpreted, which is the property the row is named for. The population is *labelled experiments*, not all outputs.

### 4.5 The unit mismatch, stated

§14.2 and the output resolver count **different populations**, and the difference must be carried explicitly or the min-n of 30 gets counted in the wrong unit.

- **§14.2's unit** is a *comparable **published** output* (`PRD.md:913`).
- **The resolver's unit** is an ***approved cut*** — one per CreativeBrief, resolved from delivered ContentPackages (§1). That is the unit `resolveOutputs` returns and the unit PRD §15's criteria 1 and 3 count.
- **`package` cannot emit `published` at all** (`skills/package/src/main.ts:564-567`). At Phase 0, therefore, **the number of published outputs in this repository is zero**, and approval is not publication: an approved cut may never be published, may be published later, or may be published more than once.

**The bridge, and its precondition.** An output may be counted toward §14.2's 30 only when a **publication record** exists that (a) names the delivered `contentPackageId`, (b) carries the publication timestamp that starts the post-age horizon (axis 5), and (c) names the `accountId` it published to (axis 3). No such record is a contract today, and it has no writer. Until it exists, **§14.2's cohort size is zero** and the resolver's approved-cut count must never be substituted for it — a count of approved cuts printed under §14.2's label would be the wrong unit wearing the right name, and it would over-count, because approval is cheaper than publication.

Building that record is Stage 6 work and is gated on **T-8** (analytics access and consent, `todos.md`), which is open. It is named here so Stage 6 inherits the gap rather than discovering it.

**The same absence disables §4.3's baseline exclusion, and §4.3 now says so explicitly.** The missing record is one gap with two consequences: it makes §14.2's cohort size zero (above), *and* it makes "the baseline excludes every Cutdown-produced post" unverifiable. Both resolve on the same day and neither resolves before it — so §4.3 and this section are read together, and the record's absence withholds the uplift number twice over, once for want of a cohort and once for want of a clean baseline.

### 4.6 Multi-account pooling is blocked on T-9, not settled here

§14.2 requires "at least 30 comparable published outputs **across multiple accounts**" — a **pooled** statistic. Axis 3 (§4.1) requires the account to be held **constant**. These collide, and the collision is not an editing error in either document: pooling per-account results into one figure is a decision about whether the Social Soup accounts are one tenant or many, which is **T-9** (`todos.md`, cited by id — this file never anchors to a line number in a file that reflows) and **open**.

**Until T-9 is answered: uplift is reported per account, and no pooled number is produced** (the same structural withholding as §4.4 — not a pooled number with a caveat). T-9 itself records the precedent that makes this worth pausing on, from the other product line in this repository: *a summary statistic of outcome data is outcome data*. A pooled cross-account uplift is a cross-account statistic, and whether that is permissible is exactly what T-9 decides. Stage 6 must not build the pooled statistic first and ask afterwards.

### 4.7 `real` is a claim about footage, not about live inference

`sourceClassification: real` means the **source assets and their rights records are real client material rather than fixtures** — `skills/package/src/main.ts:560-562` derives it from the rights entries, requiring *every* entry to be real before the package is classified real, so a mixed job cannot contribute exit evidence on the strength of its real half.

It is **not** a claim that the editorial stages ran against live model inference. D-21's spend ceiling is unset (`todos.md` T-2), and every editorial stage to date has run on recorded replies — a recorded reply got the pipeline built, but it is not a decision. A `real` output is therefore **real footage, possibly assembled by recorded editorial decisions**, and Stage 1 must not read "real" as "live". The two claims are separated by D-38's milestones for exactly this reason: `PIPELINE_IMPLEMENTATION_COMPLETE` is about the machine, `PHASE_3_ACCEPTED_LIVE` is about live editorial judgement, and neither is Phase 0 exit.

---

## 5. Changing this policy

The counting rule is settled law (D-56) and the drift classification it interacts with is settled law (D-61). A change to either:

- appends a **superseding decision** to `decisions.md` — never edits D-56 or D-61 in place;
- updates PRD §15 and tech-spec §15's population sentences **in the same change**, so the numeral and the population never disagree;
- re-runs `status --phase0` and states the direction of the movement, because a change that *raises* a criterion's count is a loosening and must be recognisable as one.

### 5.1 Known stale text inside D-56, corrected here rather than edited there

`decisions.md` is **append-only**. Two things in D-56's row are stale, neither changes the decision, and both are corrected in this file instead of by editing the row:

1. **A dangling line pointer.** D-56 cites `todos.md:26` for the jobs-per-output reasoning. T-1 was deleted from `todos.md` in the same change that created this file, and that line is now T-3's. D-56 quotes the reasoning inline, so nothing is lost. Corrected in the header note above.
2. **An over-strong sentence about the escape clause.** D-56 says that because `package` emits neither `publish_ready` nor `published`, "no operator can assert the exception even informally". §2.2 above shows the accurate version: `releaseState` is a required field whose enum admits all five states, so a hand-authored `published` package validates and counts — the exception is *inert*, not unassertable. The conclusion D-56 draws (out of scope at Phase 0) is unchanged and correct; only the argument for it is.

**Why no superseding row was appended for either.** §5's supersession route exists for a change to the *rule*, and neither of these changes the rule, the count, or any criterion's state — appending a D-row would advertise a decision change that did not happen, which is its own form of drift. If a later reader disagrees, the legal correction is a **new appended row**, never an edit to D-56.
