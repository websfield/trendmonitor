# Slice 9: Results + learning

## A creator can…
**Log an honestly-labelled result, compare a repeated treatment cohort to a separate personal baseline, and receive an evidence-linked proposal they approve or reject.**

## Why this shape

This is the slice the product's thesis rests on: "gets measurably better per creator as posted results feed back in". It is also the slice with the most ways to be quietly dishonest, and the codebase has already pre-committed against most of them:

- **`performance_meta`'s content schema is deliberately empty** and says so (`brain-content.ts:315-327`): *"the honest version — which needs slots for the declared metric, n, effect, period, population and the paid/organic separation… Its real shape is M5's to declare."* **Declaring it is this slice's first act**, and the list in that comment is the specification.
- **It is not writable** (`WRITABLE_BRAIN_KINDS = {voice, strategy, killtest}`, `brain-content.ts:428-432`), and its refusal message *is* the minimum-n rule (`:434-441`). Slice 3's B-6 rewrote that copy to name the missing surface and the minimum. **This slice makes that copy stale and must replace it**, or the product keeps telling creators to do something they can now do.
- **There is no minimum-n constant anywhere** in the repo. Not a wrong one — none.
- **`Meter` already has a `baseline` tick** (`app/ui/meter.tsx`) and it is wired to nothing.

## Open items closing here
The **`packages/brain` vs `@respin/db`** discrepancy — resolved in advance by **R-44**, which this slice executes.

## Prerequisites
- [ ] Slice 7 shipped (generations exist to log results against, and feedback is captured)
- [ ] R-44 stands: `packages/brain` is created **here**, for **proposal construction only**; brain-document storage stays in `@respin/db`; `tech-spec.md:36` is re-pointed with the reason **in this slice**
- [ ] Slice 4's barred-kind widening shipped — `performance_meta` must already be barred from `reference` provenance *before* it becomes writable, which is why slice 4 did it while it cost nothing

---

## The three questions the stub left open, answered

### 1. What makes results comparable, and what exactly repeated?

**A comparison stratum has five shared predicates; a proposal cohort adds one shared treatment key. All are stored and inspectable.**

| Predicate | Why it is not optional |
|---|---|
| Same creator profile | REQ-A03 / R-9. Cross-profile comparison is a tenant leak, not a weaker claim |
| Same declared north-star metric version | REQ-B03. Historical generations keep the metric they actually used |
| Same platform | A follows/1k on Shorts and on Reels are different populations wearing one name |
| Same paid/organic class | REQ-F01: paid and organic are never pooled |
| Within one stated observation window | A ratio with no period is an undefined denominator |
| Same `treatment_key` for the proposal cohort | Three unrelated posts cannot warrant a rule. The key is a stable normalized tuple of the tested brain/rule or feedback target, framework/hook mechanic and relevant brain activation/version |

The treatment cohort contains at least three results with that treatment key. The historical baseline is
drawn from the same five-predicate stratum but **excludes every result in the treatment cohort and every
result with the treatment key being tested**. It also requires `baseline_n ≥ 3`. The creator can inspect
both id sets. Reach and conversion never collapse (REQ-F04): comparisons are computed per lever.

### 2. What is a creator's "own baseline"?

**The median of their own eligible historical results outside the treatment cohort/key, over a stated window, displayed with its n — and below baseline_n = 3 there is no baseline, only a named absence.**

- **Median, not mean.** The measurement discipline this repo already applies elsewhere; a mean over a handful of results is moved by one outlier, and one outlier is exactly what a creator is trying to find.
- **Their own**, never pooled across creators, and never including the subject/treatment cohort. REQ-A03/R-9 makes the first structural; explicit evidence join rows make the second auditable.
- **Absent is never zero.** A creator with one result has no baseline. The screen says that; it does not draw a bar at zero and it does not draw a bar at their single result. This is the failure mode `spendVisibility` was written for on `/usage` and the same three-state shape applies.
- **Confounders are shown with the comparison, not filed away** (REQ-F02): topic overlap, posting-time unknown, account growth, spillover. A comparison that hides its confounders is a stronger claim than the data supports.

### 3. Does an accepted proposal write through the established confirm/coherent-activate path?

**Yes — the same `writeBrainDoc` → `confirmBrainDocFields` → slice-3b coherent activation path, and that answer forces one schema decision.**

R-8 is the reason: brains are context, never weights, **never silent**, with proposal-approval for every update. Slice 3 built the ceremony and 3b made activation a coherent snapshot; accepting Performance Meta creates a new snapshot carrying unchanged core versions forward. Routing promotions through a second path would produce a second brain-write surface, which R-44 names as the exact trigger that would force storage out of `@respin/db` and invert its own argument.

**The decision it forces.** `brain_docs.source_evidence` is `NOT NULL` with a non-empty CHECK, and every entry is `{field, quote, inputId, startUtf16, endUtf16}` where `inputId` names an `onboarding_inputs` row. A results-derived claim has no onboarding input behind it. Three options, and only one is honest:

- **Chosen: a fourth `input_class`, `result_summary`.** The promotion path writes one input holding the evidence statement — the metric, n, the effect, the window, the result ids — and the new brain version cites it verbatim. `validateSourceEvidence`'s verbatim-at-offsets check passes by construction, the non-empty CHECK is satisfied honestly, and the barred-kind machinery extends to it with no new concept. Cost: one enum value and one migration.
- **Rejected: reuse `creator_authored`** (slice 5's mechanism). The label would be false — this text is written by the product from result rows, not by the creator — and a false provenance label on the one column whose entire job is provenance is worse than a migration.
- **Rejected: relax the non-empty CHECK for `performance_meta`.** That removes a control from a governed column at the moment the column starts carrying performance claims, which is the worst possible moment.

---

## Requirements

### `packages/brain` (R-44)
- [ ] **R1:** `packages/brain` is created containing **proposal construction only**. Storage, validation, claim enumeration, provenance and the echo bar stay in `@respin/db` — roughly 3,000 lines that do not move.
- [ ] **R2:** It is the **sole construction site** for promotion proposals (R-10). The instrument is slice 7's pre-registered reader scan, which named `packages/brain` before it existed — this slice is where that guard stops being pre-registration and starts being enforcement, and its planted-violation case must still fail.
- [ ] **R3:** It joins the import boundary deliberately (`eslint.config.mjs`'s negation catch-all + a deny fixture), like every package before it.
- [ ] **R4:** `tech-spec.md:36` is re-pointed at `@respin/db` for storage, **with R-44's reason**, in this slice.

### Results entry (REQ-F01, F02)
- [ ] **R5:** A `results` table per tech-spec §2, registered in all three instruments. Nullable generation linkage uses same-tenant composite FK `(generation_id, profile_id, workspace_id)` → `generations(id, profile_id, workspace_id)`; when `generation_id` is present both scope columns are required and caller scope is never trusted.
- [ ] **R6:** Evidence state is an enum, never a deceptive boolean: `unquantified`, `quantified_self_reported`, `connector_verified`. Numbers manually entered by a creator are `quantified_self_reported`, not verified. `connector_verified` requires immutable connector/source/event provenance; v1 cannot assign it without that evidence. `unquantified` results are stored but excluded from numerical cohorts.
- [ ] **R7:** Confounders are **structured flags**, not prose — the closed-code discipline `brain-reason.ts` established.
- [ ] **R8:** The normalised metric is computed per 1k against the **declared metric version captured by the generation/result** (REQ-B03). Slice 3b owns declaration and slice 5 owns changes; this slice refuses a result with no compatible declaration and does not create a late second metric path.
- [ ] **R9:** **Reach and conversion are reported as separate levers on every result view** (REQ-F04). Never one score, on any screen, including the summary card.

### The comparison (REQ-F01)
- [ ] **R10:** Comparability is the five-predicate stratum plus treatment-key rule (question 1), implemented as one typed cohort builder shared by result and feedback proposal construction.
- [ ] **R11:** The treatment median uses `cohort_n ≥ 3`. The baseline is the creator's own median over the same stratum/window, explicitly excluding cohort/result ids and the treatment key, with `baseline_n ≥ 3`. Both populations and ids are visible.
- [ ] **R12:** **Absent is never zero.** Below either minimum, show which population is short and how many more observations are needed; never draw a baseline/effect bar at zero.
- [ ] **R13:** **Paid and organic never pool**, asserted by a test (M5's criterion).

### Proposals (REQ-F03, C05)
- [ ] **R14:** A result proposal appears only with `cohort_n ≥ 3` eligible quantified results sharing the treatment key **and** `baseline_n ≥ 3` eligible external-to-treatment results. Effect is the direction-normalized difference between treatment and baseline medians, with unit/window/confounders and both n values displayed.
- [ ] **R14a:** "Confidence" is rendered as **evidence strength**, never a probability or significance claim. Deterministic labels: `early` when either population is 3–4 or all evidence is self-reported; `repeated` when both populations are ≥5 but any evidence is self-reported; `corroborated` only when both are ≥5 and every included result is `connector_verified`. Display the rule and evidence-state counts beside the label.
- [ ] **R15:** The minimum-n is **one named constant with one reader**, not a literal at a comparison site. There is none in the repo today, which means there is also nothing to be inconsistent with — this is the cheap moment.
- [ ] **R16:** `unquantified` never enters a numerical cohort. Self-reported and connector-verified results remain visibly distinct and cannot produce a stronger evidence label than R14a permits.
- [ ] **R17:** Accepting a proposal writes a new brain version through the established confirm + coherent-activation path, with the `result_summary` input as its evidence (question 3). The new snapshot includes optional Performance Meta and carries unchanged core versions forward. Rejecting records the rejection — nothing updates silently (R-8).
- [ ] **R18:** `performance_meta`'s content schema is declared with the slots its own comment specifies — declared metric, n, effect, period, population, paid/organic separation — and joins `WRITABLE_BRAIN_KINDS`.
- [ ] **R19:** `KindNotYetWritableError`'s copy for `performance_meta` is **removed or rewritten**, and `packages/db/tests/brain-content.test.ts:369-372` (which pins that message) updated. Slice 3's B-6 fix becomes false in this slice; leaving it is shipping a promise the product has already kept.
- [ ] **R19a:** `proposal_evidence_results` and `proposal_evidence_feedback` join rows are the source of truth for evidence membership, each with same-tenant FKs. Result joins identify `treatment|baseline`; feedback joins identify normalized target/reaction. `result_summary` cites human-readable ids, n/effect/window, but prose is not the relational authority.
- [ ] **R19b:** Proposal lifecycle is explicit and idempotent: deterministic cohort/evidence digest prevents duplicates; states cover proposed/accepted/rejected/stale/superseded; a changed brain/metric/treatment or evidence set marks prior proposals stale rather than silently reusing them.
- [ ] **R19c:** `packages/brain` consumes repeated structured feedback too. At least three same-scope events with the same normalized target + reaction code create a Voice or Kill Test proposal with feedback join evidence. It still requires review/confirm/activate; feedback never mutates a brain silently.

### Brain as an asset (REQ-G07)
- [ ] **R19d:** `/brain` (or a linked asset view) shows coherent brain versions, which rules/frameworks were tested, the logged results/feedback attached to each, and proposal status. It does not rewrite historical attribution after activation changes.
- [ ] **R19e:** `/usage` may add days-to-empty only with a named trailing window, enough non-zero debit days and the current balance/period shown. Otherwise it retains a named absence. The threshold/window are named constants and the calculation never uses model-cost rollups.

### Honesty (PRD §5, REQ-I04)
- [ ] **R20:** No screen presents a result comparison as a prediction or a guarantee. A post beat a baseline; that is a fact about the past.
- [ ] **R21:** **Engineering completion and evidence completion stay separate claims.** This slice builds the learning loop; it produces **no** evidence about whether the product makes creators better. PRD §5 metric 2 is earned in the post-M6 pilot with real creators, and no fixture substitutes for it.
- [ ] **R22:** The `forbidden-claims.ts` ban on `learn` / `improv` / `train` needs its **narrowest possible** exception here, or none. If the results screen must say "learning", the exception is a named allowlist for named strings on a named screen — not a lifted ban. R-38's rule: a word leaving a ban is indistinguishable from a weakened guard unless positive assertions replace it.

---

## Left to the developer

- **Presentation of effect and evidence strength.** Their computation and labels are fixed by R14/R14a; layout is not.
- **Whether results entry is its own route or lives beside the generation.**
- **The `result_summary` statement's wording**, subject to being verbatim-citable and honest about being product-written.
- **Test file layout.**

## Tasks
1. [ ] `packages/brain` + import-boundary edit + deny fixture; slice 7's scan flips to enforcement (R1–R3)
2. [ ] `results` table + migration + all three registrations (R5)
3. [ ] The `result_summary` input class + migration (question 3)
4. [ ] Results entry UI: honest evidence states/provenance, confounder flags, per-lever display (R6–R9)
5. [ ] Typed treatment cohorts, excluded historical baseline, effect/evidence-strength calculation and absence states (R10–R14a)
6. [ ] `performance_meta`'s content schema; `WRITABLE_BRAIN_KINDS`; the stale-copy fix (R18, R19)
7. [ ] Result + feedback proposal construction in `packages/brain`; relational evidence joins, lifecycle/dedup/staleness and evidence labels (R14–R19c)
8. [ ] Accept/reject through slice 3's confirm/activate path (R17)
9. [ ] `tech-spec.md:36` re-pointed (R4); honesty scans (R20–R22)
10. [ ] Brain-as-asset view and conservative days-to-empty named absence/calculation (R19d/R19e)
11. [ ] Walk it: log three treatment results plus three excluded-baseline results → inspect both populations/evidence states → receive a proposal → accept it → the new brain version is live; repeat with three matching feedback events

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
| File | Action | Purpose |
|---|---|---|
| `respin/packages/brain/**` | Create | Proposal construction only (R-44) |
| `respin/packages/db/src/results-schema.ts` | Create | `results`, proposal lifecycle and relational result/feedback evidence joins |
| `respin/packages/db/migrations/0020_*.sql` | Create | Results/evidence states, proposals/joins, same-tenant FKs, `result_summary` enum |
| `respin/packages/db/src/brain-content.ts` | Modify | `performanceMetaContent`; `WRITABLE_BRAIN_KINDS`; the refusal copy (R18, R19) |
| `respin/packages/db/src/creator-data-registry.ts` | Modify | Export and deletion decisions for both new tables |
| `respin/packages/db/src/export.ts` | Modify | Results and proposals join the export |
| `respin/app/(product)/results/**` | Create | Entry, comparison, proposals |
| `respin/lib/routes.ts`, `respin/middleware.ts`, `respin/app/(product)/nav.tsx` | Modify | `/results` |
| `respin/app/ui/meter.tsx` | Modify | The `baseline` tick's first real consumer |
| `respin/tests/feedback-readers.test.ts` | Modify | R2 — pre-registration becomes enforcement |
| `docs/initial/tech-spec.md` | Modify | R4 |

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **Three same-treatment quantified self-reported results + three eligible outside-treatment baseline results → proposal → accept → new brain version active**, in a browser
3. [ ] A result without numbers → stored as `unquantified`, excluded; manual numbers → `quantified_self_reported`, never `connector_verified` (R6)
4. [ ] Two treatment results + one unquantified → no proposal; three treatment results with only two external baseline rows → no proposal (R11/R16)
5. [ ] Mix paid/organic, platforms, metric versions or treatment keys → no mixed proposal (R10/R13)
6. [ ] A treatment result is also offered to the baseline query → exclusion test fails; the rendered baseline id set never overlaps the cohort/treatment key (R11)
7. [ ] One result → no baseline/effect, a named absence, no bar at zero (R12)
8. [ ] Proposal displays treatment/baseline n and ids, median effect, evidence-state counts and deterministic evidence strength—not a probability (R14/R14a)
9. [ ] Accepting → a new brain version with the evidence attached, through the confirm/activate ceremony (R17, M5's criterion)
10. [ ] Rejecting → recorded, brain unchanged (R17)
11. [ ] A proposal constructed anywhere outside `packages/brain` → the scan fails (R2)
12. [ ] Every result view shows reach and conversion separately (R9)
13. [ ] Three same-target/reaction feedback events → evidence-linked Voice/Kill Test proposal; two or mixed targets do not; accept still requires confirmation/activation (R19c)
14. [ ] Change the brain/metric/evidence set and rerun → prior proposal becomes stale/superseded, no duplicate active proposal exists (R19b)
15. [ ] Cross-workspace generation/result/evidence ids refuse through composite FKs (R5/R19a)

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | Minimum-n lowered to 1 | Verification 4's shape, with n = 1 |
| M2 | `unquantified` rows admitted to a numerical cohort | Verification 4 |
| M3 | Paid/organic predicate dropped from comparability | Verification 5 |
| M4 | Platform predicate dropped | Verification 6 |
| M5 | Baseline switched from median to mean | An outlier fixture |
| M6 | Zero-result baseline renders 0 | Verification 7 |
| M7 | Accept writes the brain directly, bypassing confirm/activate | `table-writers.test.ts` + verification 9 |
| M8 | Reach and conversion summed into one score | Verification 12 |
| M9 | Proposal constructed in `app/` | Verification 11 |
| M10 | Treatment cohort rows included in baseline | Verification 6 |
| M11 | Three unrelated treatment keys create a proposal | Verification 5 |
| M12 | Evidence-strength label upgraded despite self-reported rows | Verification 8 |
| M13 | Proposal evidence stored only in `result_summary` prose | R19a relational-integrity test |
| M14 | Repeated feedback directly mutates Voice | Verification 13 |

**Population note — read before reporting "N of N".** Fourteen mutations on code that will exist. **The hazards this matrix cannot reach:** (a) median difference and deterministic evidence-strength are intentionally descriptive at these sample sizes, not statistical proof; tests can enforce the definition but cannot make the cohort representative, so the limitation stays visible. (b) **R21 is an absence** — nothing fails if this slice quietly starts implying the product has been shown to work. (c) **R19 is a stale-copy fix**, and a stale string is invisible to every test that does not pin it; `brain-content.test.ts:369-372` pins this one, which is why it will be caught — the general class will not be. Before claiming a matrix result, state which requirements have no control, and have someone other than the author plant at least three mutations against cohort construction and evidence membership.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] The "A creator can…" line walked in a browser
- [ ] **Learning honesty** PASS — this is the slice that path exists for — plus **brain tenancy** (Full gates), **billing** (Full gates) and **spin compliance**, reviewers in **isolated worktrees**
- [ ] The `packages/brain` discrepancy closed in the disposition register; `tech-spec.md:36` re-pointed with R-44's reason
- [ ] `decisions.md` carries: the five comparison predicates plus treatment key, treatment-excluding median baseline, evidence-state/strength rules, relational evidence/lifecycle, feedback proposal threshold, the `result_summary` input class **with the two rejected alternatives and why**, and `performance_meta`'s declared schema
- [ ] `build-plan.md` M5's criteria are measured; **PRD §5 metric 2 is untouched by this slice and is said to be**
