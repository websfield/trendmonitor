# North Star

> The single outcome this project exists to achieve. Every plan and every change is judged against it.

## Goal

Ship a UGC intelligence layer on ClientHub that does three things, in this order of durability:

1. **Enforces the compliance gate deterministically** at submission — no LLM in any decision path.
2. **Rank-orders published content for amplification** measurably better than a naive baseline, and can prove it (Spearman ρ ≥ 0.35 out-of-sample per cohort, REQ-052) or automatically degrades itself to advisory.
3. **Accumulates transferable knowledge about _why_ content works** — not what is viral — as falsifiable `Mechanism` claims mined from public content, and serves them over a read-only API that holds no tenant data.

The scoring is a means. **The knowledge is the compounding asset.** Trends are disposable; mechanisms compound.

## Why it matters

Agency clients spend real money on amplification and carry real regulatory exposure (ACL disclosure, minors, usage rights, APP 8). A compliance miss is a silent breach; a scorer that can't beat a sorted spreadsheet is theatre. The automatic circuit breaker is the difference between this being a product and this being theatre.

And a system that learns only *what* performed learns nothing that survives the format's death. Every quarter, its patterns expire with the trend that produced them. A system that learns *why* — and can be shown to be wrong about why — is the only version of this that is worth more in year three than in year one.

## Success looks like

- Compliance lane: recall ≥ 0.98 / precision ≥ 0.85 on the eval set (half adversarial); **zero** cases of model output influencing a veto (any such finding is a P1).
- Calibration: Spearman ρ ≥ 0.35 (n ≥ 60, ≥ 2 cohorts) on **temporally** held-out data before any VPS is shown to a client.
- AWS beats the naive baseline on CPM-adjusted incremental reach at 80% confidence within two quarters — or the baseline ships and AWS is deleted.
- A labelled outcome dataset (T+24h/48h/7d snapshots) accumulating from Phase 0, before any scorer exists.
- Every score reproducible from its pinned `(extractor × rubric × pattern_library)` version triple.
- **A Knowledge API serving `contrasted` mechanisms** — each with a stated falsifier, a warrant rung, and `never_tested_against: content that was attempted and failed` — and **zero** responses containing an effect size, a causal verb, or anything derived from a tenant's outcome data (any such finding is a P1).
- **Mechanisms are falsified and withdrawn automatically** on corpus refresh. A quarter where nothing is falsified is a quarter where the refresh tested nothing.

## Constraints (must hold)

- Deterministic decisions live in the .NET/C# control plane; **no LLM in any decision path**. The Python intelligence plane owns extraction, mining, and calibration stats.
- **No auto-approval, ever** (REQ-021): every `APPROVED` has a real human click.
- Exploration budget ε ∈ [0.10, 0.30]; a zero configuration must not exist (ADR-0003).
- Tenant outcome data never crosses tenants; no admin override. **A summary statistic of outcome data is outcome data** — no pooled effect sizes, no cross-tenant confirmation counts (ADR-0006).
- Australian Privacy Act: APP 8 / consent decision required before Phase 3; creators under 18 excluded fail-closed (V6).
- **A `Proxy` value never enters an effect-size calculation** (ADR-0001). Pattern *proposal* reads both corpora; pattern *estimation* reads the internal corpus only.
- Trends never enter VPS (ADR-0004). **Mechanisms never enter VPS, AWS, a veto, a verdict, or a budget allocation** (ADR-0006). C2 has no code path to either.
- A `Mechanism` carries **no effect size, by schema** (`additionalProperties: false`), a **required falsifier**, and a **human ratification** before it is served.
- Mechanism warrant: **automatic to demote, human to promote.** `contrasted` is the ceiling and is not a causal claim.

## Non-goals (out of scope)

- Executing ad spend — the system recommends; it never touches an ad account.
- Fine-tuning models — the labelled dataset is hundreds of posts per year; this is rubric + retrieval + LLM-as-judge + calibration.
- Weekly pattern-library refresh — promotion cadence is bounded by n ≥ 60 outcome accumulation per cohort (~quarterly), not by mining cadence.
- Cross-tenant learning from internal outcome data. The Knowledge API is not an exception: a `Mechanism` crosses tenants because it never contained one.
- **A causal claim about content.** `contrasted` — *recurs among high performers, materially absent from the same creators' non-performers* — is the top rung. The rungs above it (`deconfounded_within_tenant`, `interventional`) are named and refused, because a ladder whose top is invisible gets climbed by accident.
- **A number on the Knowledge API.** No effect size, no `0-100` field, no confidence interval. The number the client wants lives behind their own tenancy boundary, in a Pattern Library built from their own outcomes.
- A creator-facing trend feed (REQ-005g).

## Current focus

Phase 0 → Phase 1 (per the PRD roadmap): instrument the existing approval workflow (timing, decision logging, T+24h/48h/7d performance snapshots) so a labelled dataset predates any scorer; then build the deterministic compliance lane (Gate A) with no LLM in the decision path.

Phase 6 (mechanism synthesis + Knowledge API) depends on the exemplar corpus and the trend subsystem and on **nothing else** — not the scorer, not the breaker, not a single outcome event. It could ship before Phase 3. The reason to sequence it later is attention, not dependency, and the temptation to accelerate it by feeding internal outcomes into a mechanism is the temptation this design exists to refuse.

A built, tested codebase now exists across three planes — `src/ControlPlane/` + `src/KnowledgeApi/` (C#), `src/IntelligencePlane/` (Python), `src/Frontend/` (React/TS) — with runnable ASP.NET hosts for C2/C3/C4 and the real Python↔C# artefact/breaker transport wired behind config. Nothing is production-deployed yet (no CI, no container, no pipeline). The doc set in `docs/initial/` stays authoritative for the invariants.
