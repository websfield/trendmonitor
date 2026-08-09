# Stage 1 — Quality measurement system

**Governing PRD phase:** Phase 0→1 bridge. **Depends on:** Stage 0 (engineering exit).
**Master plan:** `docs/plans/cutdown-product-program-master-plan.md`
**Objective:** Give the system a way to know whether an edit is any good — objective, changed variable, and evaluation lineage on every variant, and a scorecard that compares against a real account baseline instead of asserting improvement.

**Revision 2 (2026-08-08)** — rewritten after the plan-review gate returned **NEEDS CHANGES**. Round 1 named the right rules in prose but omitted the *artefacts* that make them structural: its criteria were satisfiable by a system emitting a confident non-inferiority verdict from three self-produced outputs at mixed post ages, against a baseline of two, with organic and boosted mixed together. Fixes marked **[R1-fix]**.

> **The honest framing:** analytics is currently graded **F — not implemented**. That is a subsystem to build, not a bug to fix. And its completion is not in the repository's gift: the code can be perfect and the stage still not done. See *Two exits*.

---

## Project Conventions Pinned (READ FIRST)

*Pasted verbatim from `CLAUDE.md`.*

### Golden rules

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.** A new dependency needs a reason the standard library can't answer.
6. **Report honestly.** "Done" is a claim the checks have to back.
7. **Small, verifiable steps.** If you can't verify it, say so.
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.**

### Lessons that touch this stage's ground

- **2026-07-30** — A comment claiming a property is not the property: **assert it in a test or delete the claim.** *(This stage is full of statistical claims. Each is a comment until a test holds it.)*
- **2026-07-30** — Fail closed, but **never without a way forward.**
- **2026-08-02** — A cross-skill option is only alive when a test drives it from its **real producer's artefact**. *(An importer tested only on hand-built CSVs is not tested.)*

### Measurement law for this stage

Encoded as canon in the Stage-0-authored `cd-measurement-honesty` skill, and gated by `cutdown-measurement-reviewer`:

- **Provenance is a sibling label, never a union arm.** A value carries `provenance` + `asOf` in adjacent fields so the label cannot be shed by type-narrowing. `Proxy` is never presented or aggregated as `Measured`, and never enters an effect-size calculation. **[R1-fix — round 1 modelled this as `value | absent | proxy`, which drops the label at first narrowing.]**
- **Every rate stores numerator and denominator *counts* plus the denominator *kind*** — rates are derived, never stored alone, or cohort statistics can only average ratios and Simpson-type reversals hide. Rates on different denominator kinds are never compared.
- **Organic and boosted are separate series, not merely non-additive.** A cohort median over a mixture is as wrong as a sum.
- **An observation that never arrived is not a zero**, and is excluded from aggregation with a counted exclusion — never imputed.
- **Baselines use median/MAD, never mean/stddev**, and never include outputs this system produced.
- **Observations are compared at a matched age since publication.** A post at T+24h and the same post at T+7d are different measurements.
- **Temporal holdouts, never random splits**, for anything claiming predictive value.
- **Nothing is claimed that was not pre-registered:** the primary metric, the secondary metrics and the non-inferiority margin are declared before data is seen.

### Scope boundary (`tech-spec.md` §14)

**Do not change `src/`, `tests/`, `config/`, or `docs/initial/`.**

### Available agents

`general-purpose` owns every task. Gate with `code-reviewer` **and** `cutdown-measurement-reviewer`. **Do NOT request** UGC agents.

---

## Two exits

| Exit | Meaning | In this repo's gift? |
|---|---|---|
| **`MEASUREMENT_MACHINERY_COMPLETE`** | Contracts, `evaluate`, baselines, golden sets and rubrics exist and are tested | **Yes** |
| **`PHASE_0_EXIT_EARNED`** | 20 approved real outputs across 3 accounts, last 10 no breaking change, rights + QA evidence | **No** — needs 18 more outputs and 2 more accounts |

**Named `MACHINERY`, not `SYSTEM`** — "measurement system complete" is what gets quoted upward, and the machinery existing says nothing about whether it has measured anything. **[R1-fix]** `status` prints live counts (observations imported, cohorts constructed, published outputs known) beside the milestone, so a green line is never read alone.

## Requirements Checklist (functional)

| REQ | What this stage must satisfy |
|---|---|
| REQ-120 | Analytics import and an `evaluate` capability |
| PRD §14.2 | Objective-specific, account-normalised performance; non-inferiority **first**, uplift only after ≥30 comparable outputs |
| PRD §13.4 | Every report states sample size, data window, uncertainty, metric-definition caveats, and whether it is exploratory / directional / decision-worthy **[R1-fix]** |
| PRD §12.1 | Each metric stores its window; metric definitions can change and must be accounted for |
| PRD §13.1 | Golden sets are **versioned** and permissioned |
| Stage 0 handoff | Everything keys on `outputId`; "comparable output" means what `output-counting-policy.md` says |

## Requirements Checklist (technical)

- Provenance and missingness are sibling fields, not union arms.
- Numerator, denominator count and denominator kind are all stored; rates are derived.
- **Rules JSON Schema cannot express are enforced in code, with a test — never asserted via a fixture that cannot fail.** Inherited from Stage 0's checklist. **[R2-fix — rev 2 omitted this rule and immediately broke it: see the uplift-threshold item below.]**
- Minimum n is **pinned to PRD §14.2's 30** in the policy *and* in a test — the constant may not drift. **[R1-fix]** **`n` counts distinct policy-counted published `outputId`s, never `observationId`s [R2-fix]** — one output legitimately produces many observations (metrics × horizons × series), so three outputs × ten metrics would otherwise reach "n=30". PRD §14.2's threshold is 30 *outputs*, **and "across multiple accounts"**, which rev 2 dropped.
- **The baseline cohort has its own minimum size.** **[R2-fix]** Rev 2 constrained the baseline for purity, period and denominator but never for size — so a 30-output treatment cohort could be compared against a **two-post baseline** and still emit a verdict, which was round 1's headline scenario surviving intact. With n=2 the median is a mean of two points and MAD is degenerate, making the robustness property vacuous on the side that gives the verdict its meaning.
- No uplift figure may **exist** in a report below the threshold. **The enforcement owner is `packages/evaluation`, not the schema. [R2-fix]** tech-spec §3 pins the schema style subset to tagged unions with a `const` discriminator and forbids `if/then/else`, so "uplift absent when n < 30" — a conditional over two sibling properties — is **inexpressible**. The best a schema achieves is `oneOf` keyed on a self-declared `status`, which an emitter satisfies with `{status:'SUFFICIENT', n:12, uplift:0.2}`. The schema enforces **shape**; the emitter test enforces the **threshold**.
- Contract changes follow tech-spec §3: a semantic change adds a new file.
- **Additive-only where possible.** Stage 0 owns the one deliberate breaking bump; this stage's additions to `content-package-v2` must be optional/minor, or the stability clock resets a second time. **[R1-fix]**

## Edge Cases & Failure Paths

**Inverse events.** An observation can be **retracted** (platforms restate numbers). Retraction invalidates dependent reports rather than silently updating them. A metric **redefinition** does the same and must be detectable — hence a metric-definition identifier on every observation.

**Double failure.** Stale import *and* under-populated cohort → `evaluate` refuses naming both, reporting **INSUFFICIENT_DATA**.

**Degraded mode.** Below minimum n → non-inferiority reports **UNPROVEN** and the report carries **no uplift field at all**. A number that exists is a number that gets screenshotted.

## Failure Modes & Degraded Behavior

| Boundary crossing | Failure | Degraded behavior | Reconciliation | Spec |
|---|---|---|---|---|
| Analytics CSV import | malformed / wrong account | refuses the whole file, names row and column; nothing partially imported | fix and re-import | import tests over a **real platform export** |
| Observation missing at horizon | no data | recorded **absent**; excluded from the cohort; counted in exclusions; never imputed | later import fills it | invalid-fixture + cohort test |
| Platform restates numbers | retraction | dependent reports invalidated and marked stale | re-run `evaluate` | retraction test |
| Platform redefines a metric | definition drift | observations carry a definition id; a mixed-definition cohort refuses | recompute baseline | definition-drift test |
| Cohort below minimum n (30) | too few | **INSUFFICIENT_DATA**; no uplift field emitted | accumulate | refusal test |
| Baseline contains system-produced outputs | self-comparison | refuses | widen baseline period | baseline-purity test |
| Mixed provenance or mixed series in a cohort | invalid aggregation | refuses | separate the series | aggregation tests |
| Live provider benchmark | D-21 unset or exceeded | refuses to spend; records the refusal | owner sets ceiling | spend-gate test |
| Blind rubric | rater disagreement | recorded, not averaged; inter-rater agreement tracked (PRD §13.2) | second pass | rubric test |

## Handoff Contracts

Consumed by **Stage 3** and **Stage 6**:

- **`performance-observation-v1`** — `{ observationId, outputId, accountId, platform, objective, metric, metricDefinitionId, numerator, denominatorCount, denominatorKind, provenance: 'measured' | 'proxy', asOf, series: 'organic' | 'boosted', publishedAt, horizon, observedAt, source, absent: bool, retractedAt | null }`. **`accountId`, `platform` and `objective` added in R2** — Stage 0's comparability policy defines five axes (platform, objective, account, denominator kind, horizon), and rev 2's contract could not express three of them, so those refusals were uncomputable from the observation. Without `accountId`, PRD §14.2's "account-normalised" is not expressible at all.
- **`publication-record-v1`** — whether, when, where and by whom an output was published. **Without it, produced-vs-published cannot be computed, survivorship cannot be detected, and "30 comparable published outputs" cannot be counted.** Publishing is a program Non-Goal, so publication happens outside the system and is knowable only through this record. **[R1-fix]**
- **`experiment-v1`** — `{ experimentId, outputIds[], changedVariable, heldConstant[], primaryMetric, secondaryMetrics[], nonInferiorityMargin, hypothesis, declaredAt, attributable }`. `attributable: false` is a first-class outcome.
- **`evaluation-report-v1`** — the scorecard: consumed `observationId`s, n, window, denominator kind, uncertainty, exploratory/directional/decision-worthy tier, exclusions, and **no uplift field below threshold**. **[R1-fix — round 1 named the scorecard in prose and gave it no contract, so its central promises were unit tests rather than structure.]**
- **Baseline cohort definition** — period and denominator pinned, system-produced outputs excluded.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | Measurement policy: metric definitions and controlled vocabulary, the **provenance and missingness taxonomy** (what makes a cutdown value proxy), denominators, cohort construction, **minimum n = 30**, the non-inferiority test and its pre-registered margin, claims language (forbidden causal verbs), and the exact conditions under which an uplift figure may exist. Docs-first — task 2's schema depends on this taxonomy. | general-purpose | `docs/video-editing/measurement-policy.md` (new) |
| 2 | `performance-observation-v1` — sibling provenance + `asOf`; `series`; numerator + denominator count + kind; `publishedAt` + `horizon`; `metricDefinitionId`; `absent`; `retractedAt` | general-purpose | `cutdown/packages/contracts/schemas/performance-observation-v1.json` (new) |
| 3 | `publication-record-v1` | general-purpose | `.../publication-record-v1.json` (new) |
| 4 | `experiment-v1` — pre-registration fields incl. `heldConstant`, `primaryMetric`, `nonInferiorityMargin`, `declaredAt` | general-purpose | `.../experiment-v1.json` (new) |
| 5 | `evaluation-report-v1` — PRD §13.4 fields; uplift field structurally absent below threshold | general-purpose | `.../evaluation-report-v1.json` (new) |
| 6 | Regenerate + commit trees; valid **and** invalid fixtures for what a **per-document schema can actually decide**: proxy in an effect-size field (invalid), measured zero vs absent (both valid, distinct), retraction. **[R2-fix]** The "uplift below threshold", "mixed-series cohort" and "mismatched denominator kind" cases are **removed from the fixture list** — the first is a cross-property conditional and the latter two are all-elements-agree rules over an array, none expressible in tech-spec §3's subset. They are enforced by code tests (B3, B5, B8, B15) and by task 7 | general-purpose | `generated/**`, `fixtures/**` |
| 7 | `packages/evaluation` — cohort construction (median/MAD, system-produced outputs excluded), matched-horizon comparison, non-inferiority test, INSUFFICIENT_DATA arm, exclusions accounting | general-purpose | `cutdown/packages/evaluation/**` (new) |
| 8 | Analytics CSV import — all-or-nothing per file, row/column-named refusals. **Obtain and pin a real platform analytics export** (TikTok/Meta/YouTube) as the test artefact; a hand-built CSV does not test this boundary | general-purpose | `cutdown/packages/evaluation/src/import.ts`, `cutdown/data/golden-sets/analytics/**` |
| 9 | Deterministic `changedVariable` verification: diff the two variants' briefs/plans/EDLs and assert exactly one declared difference; more than one → `attributable: false` | general-purpose | `cutdown/packages/evaluation/src/attribution.ts` |
| 10 | `evaluate` skill + registry + mirror (11th skill) | general-purpose | `cutdown/skills/evaluate/**`, `registry.json`, `.claude/skills/cutdown-evaluate/` |
| 11 | Thread `objective`, `primaryMetric` and `changedVariable` through the editorial chain into the package (**additive/minor**, not a breaking bump) | general-purpose | `cutdown/packages/editorial/**`, `creative-brief-v*.json`, `content-package-v2.json` |
| 12 | **Versioned**, permissioned golden sets with a **frozen holdout split**, plus a permission record per asset | general-purpose | `cutdown/data/golden-sets/**`, `docs/video-editing/golden-set-permissions.md` (new) |
| 13 | Blind rubric harness — raters blind to variant; disagreement recorded not averaged; **inter-rater agreement tracked** (PRD §13.2) | general-purpose | `cutdown/packages/evaluation/src/rubric.ts`, `cutdown/data/rubrics/**` |
| 14 | Live provider benchmark behind the D-21 spend gate | general-purpose | `cutdown/packages/evaluation/src/benchmark.ts` |
| 15 | Extend `status` with `MEASUREMENT_MACHINERY_COMPLETE` + live counts, reported independently of `PHASE_0_EXIT_EARNED` | general-purpose | `cutdown/apps/cli/src/commands/status.ts`, `tests/status.test.ts` |
| 16 | Append **D-60** (measurement policy, minimum n, the refusal-to-emit-uplift rule, claims language) | general-purpose | `docs/video-editing/decisions.md` |

## Files to Create / Modify

| Path | New/Modified |
|---|---|
| `docs/video-editing/measurement-policy.md`, `golden-set-permissions.md` | New |
| `cutdown/packages/contracts/schemas/{performance-observation,publication-record,experiment,evaluation-report}-v1.json` | New |
| `cutdown/packages/contracts/schemas/{creative-brief,content-package}-v*.json` | Modified (additive/minor only) |
| `cutdown/packages/contracts/generated/**`, `fixtures/**` | New + Modified |
| `cutdown/packages/evaluation/**` | New |
| `cutdown/skills/evaluate/**`, `registry.json`, `.claude/skills/cutdown-evaluate/` | New + Modified |
| `cutdown/packages/editorial/**` | Modified |
| `cutdown/data/golden-sets/**`, `data/rubrics/**` | New |
| `cutdown/apps/cli/src/commands/status.ts`, `tests/status.test.ts` | Modified |
| `docs/video-editing/decisions.md` | Modified (append D-60) |

## Migration Steps

Additive only. Existing packages are immutable and read under Stage 0's version-dispatching reader. An output with no declared changed variable is genuinely unattributable — recording that is correct, not a gap.

## Verification Steps

1. `pnpm build` — clean.
2. `build:contracts --check` — PASS. *(requires 1; tasks 2–6)*
3. `validate:contracts` — PASS, 0 disagreements; includes the proxy-in-effect-size and uplift-below-threshold **invalid** cases. *(requires 2)*
4. `skills sync --check` — PASS, **11** skills. *(requires task 10)*
5. `pnpm -r --no-bail run test` — 0 fail.
6. `ruff check --config ruff.toml .` — clean.
7. `evaluate` on a **29**-output cohort → INSUFFICIENT_DATA, and the emitted report has **no uplift field**. *(requires tasks 5, 7, 12)*
8. `evaluate` on a cohort meeting n=30 → non-inferiority verdict carrying n, window, denominator kind, uncertainty and tier. *(requires 7)*
9. `status` — `MEASUREMENT_MACHINERY_COMPLETE` green with live counts; `PHASE_0_EXIT_EARNED` **red**. *(requires task 15)*
10. CI green, both legs.

## Acceptance Criteria (verifiable PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| B1 | Absent and measured-zero are distinct and cannot coerce into each other | two valid fixtures + a no-coercion test |
| B2 | A proxy value in an effect-size field fails validation | `invalid/proxy-in-effect-size.json` |
| B3 | Below n=30 → INSUFFICIENT_DATA and the report has **no uplift field at all** | test asserting the field's structural absence |
| B4 | Median/MAD: multiplying the maximum element arbitrarily leaves the median **exactly unchanged** | outlier test **[R1-fix — round 1 said "not materially", which is unfalsifiable]** |
| B5 | Every rate names denominator **kind** and count and a period stable across both sides; mismatched kind **or** period refuses | two refusal tests |
| B6 | A retracted observation invalidates dependent reports | retraction test |
| B7 | Every variant carries objective + primary metric + changed variable; one without is `attributable: false` | editorial test + fixture |
| B8 | Organic and boosted can be neither summed **nor** pooled into one cohort statistic | two tests |
| B9 | The live benchmark refuses to spend when D-21 is unset | benchmark test |
| B10 | The two milestones are reported independently; `PHASE_0_EXIT_EARNED` still red; live counts printed | `status.test.ts` |
| B11 | `evaluate` is driven in at least one test by a **pipeline-produced** package, and the importer by a **real platform analytics export** | `skills/evaluate/tests` |
| B12 | Entry gate green; `skills sync --check` PASS at 11 skills | steps 1–6 |
| B13 | A baseline containing system-produced outputs **refuses** | baseline-purity test |
| B14 | Observations at mismatched horizons cannot be compared | horizon test |
| B15 | A cohort mixing metric definitions refuses | definition-drift test |
| B16 | `changedVariable` is verified against the artefacts, not trusted; >1 real difference → `attributable: false` | attribution test |
| B17 | Every emitted report carries n, window, uncertainty, metric-definition caveats and its exploratory/directional/decision-worthy tier (PRD §13.4) | report schema + test |
| B18 | Attribution rate is reported against **all published outputs in the period**, not only labelled experiments | `evaluate` test |
| B19 | Golden sets are **versioned** with a frozen holdout | golden-set test |
| B20 | **A frozen holdout is not a temporal holdout [R2-fix]** — the pinned law says temporal, never random. Any split used for a predictive claim is **temporal**, asserted by a test that fails on a random split. If Stage 1 makes no predictive claim, this criterion is recorded as **not-yet-applicable with the stage that first triggers it named** — never silently satisfied by absence | split test, or a named deferral to Stage 3 |
| B21 | A **baseline** cohort below its own minimum refuses with INSUFFICIENT_DATA naming **which side** is short | baseline-size test |
| B22 | `n` counts distinct published `outputId`s: ten observations of one output collapse to n=1 | n-unit test |
| B23 | An experiment whose `declaredAt` is later than the earliest consumed observation's `observedAt` **refuses**; amending `nonInferiorityMargin` or `primaryMetric` after first observation refuses or forks a new `experimentId` **[R2-fix — rev 2 added the pre-registration fields and nothing that compares them, so a margin chosen after seeing the data passes]** | pre-registration ordering test |
| B24 | Cohorts mixing **platform**, **objective** or **account** refuse | three tests |
| B25 | The exploratory / directional / decision-worthy **tier has a stated derivation** from n *and* interval width relative to the margin; a result whose interval spans the non-inferiority margin cannot be tiered decision-worthy **[R2-fix — n is a count, not power]** | tier test |
| B26 | `n`, the consumed-`observationId` list and the exclusions count **reconcile arithmetically** (included + excluded = imported-in-window; n = distinct outputs after exclusions) | reconciliation test |
| B27 | An absent observation is **excluded and counted in `exclusions`**, and `exclusions` is a required report field | exclusion-count test |

## Out of Scope (Surgical Changes)

- **No analytics connector.** CSV/manual import only; connectors are Stage 6.
- **No account-style learning.** Stage 3/6.
- **No UI.** The report is an artefact; rendering it is Stage 2.
- **No breaking contract bump** — Stage 0 owns the one.
- **Do not** touch `src/`, `tests/`, `config/`, `docs/initial/`.
- **Do not** claim uplift anywhere in code, docs or output strings until ≥30 comparable published outputs exist.

## Completion Criteria (Definition of Done)

- **Entry gate clean first.**
- `code-reviewer` **and** `cutdown-measurement-reviewer` report PASS; report card **Ready**.
- Docs consistent: schemas, `measurement-policy.md`, `decisions.md` (D-60), plan set — same change.
- **Both exits reported separately.** `MEASUREMENT_MACHINERY_COMPLETE` green does **not** license calling Stage 1 done while the data exit is red — say which is which.
