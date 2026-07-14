---
name: measurement-discipline
description: Use whenever a change touches metrics, engagement rates, creator baselines, provenance, calibration, the eval plan, Spearman/breaker thresholds, holdout splits, the trend subsystem, VPS/AWS composition, or reporting to clients. The hard rules — Proxy is never presented as Measured; every rate names a period-stable denominator; organic and boosted are never summed; median/MAD not mean/stddev; temporal holdouts only; trends never enter VPS. Mandatory before writing any scorer, baseline, statistic, or eval code, and before editing the measurement docs.
---

# Measurement Discipline

## The invariants

1. **Provenance is structural, not documentary** (ADR-0001, REQ-002). Every non-measured metric carries sibling `provenance` + `as_of` columns; the query layer refuses to aggregate across mixed provenance without an explicit logged override. A `Proxy` value is **never displayed, aggregated, or compared as `Measured`** (ECHO O1). Every keyless read is `Proxy`, without exception; corroboration upgrades `confidence`, never `provenance`. No adapter ever imputes a missing volume. Every VPS/AWS/effect-size shown to a client is `Estimated` and labelled so.
2. **The denominator rule** (REQ-030): every engagement rate names its denominator (`reach | impressions | followers`), held period-stable. Rates on different denominators are never compared; a denominator changing mid-window invalidates and recomputes the baseline.
3. **Organic and boosted performance are separate series, never summed** (REQ-030).
4. **Median + MAD, never mean/stddev**, for CreatorBaseline and trend baselines — engagement distributions are heavy-tailed.
5. **The signal is outperformance, not raw engagement**: `post_er_24h ÷ creator.median_er_24h` (0.45 of AWS). OutperformanceRatio is **undefined** when `trailing_posts_n < 8` → flag `insufficient_baseline`, redistribute weight to CohortPercentile, widen the band — never impute from creator tier. Ranking by raw ER ranks by follower count.
6. **Temporal holdouts only, never random** — same-campaign posts share brief/product/audience, so a random split leaks. Threshold: Spearman ρ ≥ 0.35, n ≥ 60 per cohort; ρ > 0.5 out-of-sample means "look for the leak." Breaker (REQ-052): below threshold ⇒ VPS auto-degrades to advisory (stored, invisible to clients, zero AWS weight). Automatic to degrade, human decision to restore.
7. **A library promotion resets the calibration window** — a rolling correlation computed across a library swap averages two different scorers and calls it one number. Windows are per-cohort, keyed on the version triple.
8. **Trends never touch the score** (ADR-0004, REQ-005e): no `TrendSignal` value enters VPS at any weight under any configuration. Trend adherence may enter **BAS only**, as a deterministic check against a format explicitly named in the *stored brief* (never a live lookup). Trends feed the brief; patterns feed the score. Also: a submitter may never resolve their own submission (403, logged); the trend feed is never creator-visible (REQ-005g).
9. **Pattern promotion floor**: `sample_size ≥ 30` AND bootstrapped effect-size CI excludes zero, plus Benjamini-Hochberg across the full candidate set, temporal replication, and back-test. Otherwise `insufficient_evidence` — retained as hypothesis, never retrieved. (Distinct from the n ≥ 60 calibration threshold.)
10. **Reporting**: never a bare "accuracy" headline — only rank correlation with CI and n. If the naive baseline beats AWS, ship the baseline and delete AWS.

## Why

The entire product claim is that the outperformance ratio beats a sorted spreadsheet. Every one of these rules exists because its violation produces a number that *looks* fine and is quietly meaningless — the eval plan is built so the claim can be falsified. If none of these tests can fail, none of them are tests.

## Where the canon lives

- ADR-0001 (provenance) · ADR-0004 (trends vs patterns) · `docs/initial/eval-and-calibration-plan.md` (the tests that can fail)
- `docs/initial/rubric-vps-v1.md` (VPS/BAS/AWS maths, denominator, provenance rules) · `docs/initial/schemas/rubric-v1.json`
- `docs/initial/tech-spec-ugc-intelligence.md` (CreatorBaseline, AWS weights) · `docs/initial/tech-spec-trend-subsystem.md` (detection maths)

## Anti-patterns

- `np.mean()` / `.Average()` on engagement series; `train_test_split` without a time axis; a "combined reach" column.
- A trend score, trend weight, or trend feature appearing anywhere in VPS composition or the scoring prompt.
- Backfilling a baseline from a creator's tier, follower band, or vertical average.
- Displaying a proxy-provenance metric on a client surface without its `Estimated` label and `as_of`.

While code doesn't exist yet, these invariants gate **doc edits**: a change that adds a trend term to VPS, drops a denominator, or relaxes the temporal-holdout rule must update ADR-0001/0004 and the eval plan — see CLAUDE.md rules 5 and 8.
