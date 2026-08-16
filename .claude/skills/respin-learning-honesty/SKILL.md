---
name: respin-learning-honesty
description: Use whenever a Respin change touches results entry, verification flags, baselines, the declared north-star metric, promotion proposals, minimum-n enforcement, `packages/brain`, reach-vs-conversion reporting, confounder flags, or any success-metric or pilot claim (PRD §5, the post-M6 evidence phase). The hard rules — promotion proposals are constructed only in `packages/brain` at n ≥ 3 comparable verified results; unverified reports are stored but excluded from learning; paid and organic never pool; reach and conversion are never collapsed into one score; engineering completion and evidence completion are reported separately. Mandatory before writing any result computation, baseline comparison, proposal logic, or metric display, and before editing PRD §4F/§5.
---

# Respin Learning & Measurement Honesty

This is the rule canon for the **Respin learning honesty** Critical Path. Its gate is
`.claude/agents/respin-learning-reviewer.md`. Sources: `docs/initial/PRD.md` §4F
(REQ-F01–F04), §4B (REQ-B03), §5, `docs/initial/tech-spec.md` §2 (`results`,
`promotion_proposals`), `docs/initial/decisions.md` R-10, `docs/initial/build-plan.md`
M5 and the post-M6 evidence phase. Scope is Respin (`app/`, `packages/`).

This path inherits the predecessor programs' measurement discipline deliberately — R-10
cites "two withdrawn rankings; three review rounds on baseline honesty" as the cost of
claims below evidential minimums. The general canons (`measurement-discipline`,
`cd-measurement-honesty`) govern the old products; this skill is their Respin
instantiation, and their principles (absent is never zero, a rate names its denominator,
claims language matches evidence strength) apply here unchanged.

## Why this path exists

The product's promise is "gets measurably better as results feed back in" — which makes
the learning loop the one place where a dishonest number doesn't just mislead a
dashboard, it **rewrites a creator's brain**. And the product's own kill test (PRD §5
metric 2 — beating one's own baseline) is the claim the marketing site must not make
before the pilot data earns it.

## The rules

### L1 — `packages/brain` is the sole emitter of promotion proposals (R-10, M5)

A promotion proposal is constructed in `packages/brain` and **nowhere else** — no other
code path may create one. Enforce with a test (the sole-writer pattern this repo already
knows from C2/OutcomeEvent). The n threshold is config; the sole-emitter rule is not.

### L2 — Minimum n, and unverified never learns (REQ-F02, REQ-F03, R-10)

A proposal appears only at **n ≥ 3 comparable verified results**, displaying n, effect,
and confidence. Below minimum n, findings display as *exploratory* and no rule is
proposed. A result without numbers is stored with `verified=false` — kept, shown, and
**excluded from learning**. The UI never accepts a ranking claim without numbers.

### L3 — Paid and organic never pool; reach and conversion never collapse (REQ-F01, REQ-F04, R-10)

Two separate series, never summed, never averaged together — with a test. Every result
view reports reach and conversion as separate levers; the product never collapses them
into one score. (Same law as the UGC `ugc-organic-plus-boosted` guardrail — the
principle survived two product pivots because it keeps being true.)

### L4 — The baseline is the creator's own comparable posts (REQ-F01, PRD §5)

Comparison is against the profile's own baseline, scoped to comparable posts — never
another creator's numbers, never a pooled cross-creator average. Confounders (topic
overlap, posting-time unknown, account growth, spillover) are structured flags recorded
on every entry, and success metrics report "with n and confounders, never as a pooled
average".

### L5 — Judged against the declared metric (REQ-B03)

Every output and result is judged against the creator's **declared** north-star metric
(follows/1k, saves/1k, clicks, watch-through, sales) — never a generic engagement score.
The metric is changeable; historical results keep the metric they were judged under.

### L6 — Approval writes, nothing else does (REQ-F03, REQ-C05)

Accepting a proposal creates a new brain-doc version with the evidence attached;
rejecting records the rejection (it can become a KillTest rule — via a proposal). No
result, no feedback event, and no proposal mutates a brain silently.

### L7 — Engineering and evidence are two claims (build-plan, PRD §5)

Every milestone reports engineering completion and evidence completion separately. The
pilot exit (each pilot creator ≥3 verified results; ≥50% with a post beating their own
baseline) is **not markable from fixtures** — until it reads green on real creators, the
product claim stays "in pilot" on the marketing site (the outbound-truth skill gates
that copy).

## Checklist before shipping a change on this path

- [ ] Proposal construction exists only in `packages/brain`; the sole-emitter test covers any new path.
- [ ] n ≥ 3 enforced where proposals emerge; below-n renders as exploratory, not as a rule.
- [ ] `verified=false` results are visibly stored and provably excluded from learning.
- [ ] Paid/organic pooling and reach/conversion collapsing each have a failing-test guard.
- [ ] Baseline scoping states its comparability rule; confounders recorded per entry.
- [ ] Any success-metric or pilot claim names n and its evidence, or says "in pilot".
