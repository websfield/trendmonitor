# Stage 6 — Close the learning loop (OUTLINE)

**Governing PRD phase:** Phase 1 → Phase 4 preview. **Depends on:** Stage 1, Stage 5.
**Detail level:** Outline + gates. **Re-planning trigger:** run `/create-plan` when Stages 1 and 5 are proven complete on disk **and** published outputs with analytics access exist.

---

## Objective

Turn published results into account-specific knowledge — so the engine gets better at a particular account rather than better at editing in general.

## Requirement bindings

REQ-120 remainder · REQ-140 and REQ-145 only (REQ-141–144 are publishing connectors, excluded by the program Non-Goal) · PRD §14.2 (non-inferiority, attribution, uplift).

## The dependency that is not engineering

This stage needs three things no code produces:

1. **Published outputs** — at least 30 comparable ones for the uplift gate.
2. **Analytics access, with consent.** The real proving run's rights records already note that formal creator agreements are held by the campaign and not attached; performance data carries a similar question. Resolve it before building a connector, not after.
3. **Account baselines** that predate the system's own outputs, or the comparison is against itself.

**A stage marked complete with a working pipeline and zero observations is the F-grade wearing a green badge.** Report the engineering exit and the data exit separately, as Stage 1 does.

## Exit gate (PASS/FAIL) — all from PRD §14.2

| # | Criterion |
|---|---|
| G1 | Published outputs **non-inferior** to relevant account baselines across the first comparable cohort |
| G2 | Experiment interpretability ≥ **90%** of labelled experiments have stable variant attribution and a documented changed variable |
| G3 | Opening performance at or above account/platform cohort median for the declared opening metric |
| G4 | Value signal at or above cohort median for shares/sends, saves or qualified comments where declared secondary |
| G5 | No material deterioration in negative feedback versus cohort baseline |
| G6 | **Target** ≥ 10% median uplift after ≥ 30 comparable published outputs across multiple accounts — a target, not a gate, and never claimed before the threshold |

## Risks that must not be discovered late

1. **This is where a video tool starts making statistical claims to clients.** Every rule pinned in Stage 1's measurement discipline applies with more force here. Gated by the Stage-0-authored `cutdown-measurement-reviewer`.
2. **Account-style learning proposals must require human ratification.** Automatic to demote, human to promote — the same discipline the UGC plane applies to mechanisms, for the same reason: a silently-learned style is an unreviewed brand change.
3. **Connector scope creep into publishing.** Reading analytics is not posting. Keep the boundary explicit.
4. **Survivorship bias.** Outputs that were never published because a producer rejected them are data too; excluding them silently inflates every result. Stage 1's `publication-record-v1` is what makes produced-vs-published computable at all.
5. **G6 pools across accounts; Stage 7 isolates them. Unreconciled** (round-1 gate finding). G6 targets uplift "across multiple accounts" — a pooled statistic over accounts that Stage 7 turns into isolated workspaces. Whether the Social Soup accounts are one tenant, and whether a pooled effect size survives tenancy, is undecided. The repo already holds the resolved form of this exact question one product line over — *a summary statistic of outcome data is outcome data* — and this program has not imported it. **Decide before building the pooled statistic, not after.**
6. **G3/G4 are coin flips as written, and G5 is unfalsifiable** (round-1 gate finding). "At or above cohort median" is P≈0.5 by construction for a small cohort; as PRD §14.2 *metrics* they are fine, but promoted verbatim into a PASS/FAIL exit gate with no n, no interval and no pre-declared cohort, they are met by noise. G5's "no material deterioration" needs a stated threshold. Re-planning this stage must give G1–G5 an n, a margin and a pre-registration, all of which Stage 1's `experiment-v1` now carries.
