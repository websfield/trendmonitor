# Shaping brief — UGC Intelligence (all four components)

**Request (as stated):** "read the documents in docs/initial and NORTH_STAR.md then /go implement the system with full automation." Standing directive: *when facing open questions, go with the most complete and best quality option.*

**Real job:** An agency needs a compliance gate it can defend to a regulator, an amplification recommendation it can defend to a client's finance partner, and a body of knowledge about *why* content works that is still worth something after the format dies — and it needs each of those to be able to be **shown to be wrong**.

**Chosen scope:** 10-star — build all four components as real, running, tested services, with every deterministic path correct, every fail-closed degradation correct, and the eval plan's architectural regression suites green.

---

## What "full automation" means here (the reframe that governs everything)

The literal reading of "full automation" — the system decides — is the exact failure this doc set exists to prevent. `CLAUDE.md` rules 1 and 2; REQ-011, REQ-021, REQ-037; and the eval plan's P1 definition all say the same thing from different angles.

**Automated (must be, with no human in the loop):**
- Circuit breaker **trips** on the rolling Spearman (Contract C: automatic to trip).
- A `contrasted` mechanism **auto-demotes** to `falsified` on corpus refresh, withdrawn the same cycle (ADR-0006).
- Pattern staleness past `valid_to` excludes from retrieval.
- Corpus refresh, mining, prevalence recount, extraction, performance snapshots at T+24h/48h/7d.
- Every degradation: unreachable C3 → `cold`; triple mismatch → `cold`; model parse failure → `NEEDS_REVIEW`.

**Never automated (a real human, recorded, with a reason):**
- Every `APPROVED` verdict (`human_approved_at`) — REQ-021, won't-change.
- Every amplification recommendation reaching a client — REQ-037.
- **Arming** a tripped breaker (automatic to trip, manual with a recorded reason to arm).
- **Promoting** a mechanism warrant (`ratified_by` + non-empty `ratification_note`).
- Promoting a pattern library (C3's `LibraryVerdict`).

The asymmetry is the product. *Automatic to demote, human to promote* — in both the breaker and the warrant ladder, for the identical reason: **the pressure to widen a threshold arrives at exactly the moment the threshold is telling the truth.**

## The honest early state (this is a feature, not an unfinished build)

Three headline claims are empirical, and **none of them can be true at t=0**:

| Claim | Needs | Has today |
|---|---|---|
| ρ ≥ 0.35 rank skill (REQ-052) | n ≥ 60 real outcomes per cohort | 0 |
| A `contrasted` mechanism | 8 creators × 2 cohorts × 2 unrelated trends | 0 |
| Disclosure recall ≥ 0.98 | ≥ 200 human-labelled submissions, half adversarial | 0 |

So a **correctly built** system, on the day it ships, presents as: breaker `cold` in every cohort, VPS computed-and-stored but shown to nobody, VPS weight 0 in AWS, and `GET /api/knowledge/mechanisms` returning `[]` with `coverage.state: "below_warrant_bar"` and the blocking counts named.

That is the correct early state. The `coverage` object and the breaker's `cold` reason exist to tell it apart from a broken one. **A build that shows a confident number here has not succeeded — it has lied.**

Therefore the thing that can actually be *verified today* is: every deterministic path, every fail-closed degradation, and the eval plan's suites that test **the architecture rather than the model**. Per the eval plan's own standard — *"if none of these tests can fail, none of them are tests"* — those suites are the deliverable, not decoration.

## 10-star sketch (the aim)

- **C2** control plane in C#: compliance gate (V1–V6), BAS lane, VPS lane, verdict engine, revision-note generator, triage sorter, performance collector, creator baseline (median/MAD), amplification ranker, budget allocator (ε, arm tags, Thompson + uniform sub-pool), client artefact builder with the naive-baseline counterfactual.
- **C1** intelligence plane in Python: term registry, source adapters, trend detector (robust-z, lifecycle), submission/resolution engine (RPS, shrunk reputation), exemplar corpus builder (**top-decile + contrast set**), internal corpus assembler (event replay, idempotent), pattern miner (proposal over union / **estimation over internal corpus only**, BH correction, temporal replication, back-test), library publisher, **mechanism synthesiser** (own predicate proposal over exemplar corpus alone), mechanism publisher.
- **C3** calibration monitor: rolling Spearman on **temporal** holdouts, breaker write authority, paired champion/challenger `LibraryVerdict`.
- **C4** knowledge API: artefact resolver (sha256 verify), warrant filter, response composer, coverage reporter. Separate process. No breaker. No writes.
- **Shared:** extraction service (versioned `FeatureRecord`), append-only idempotency-keyed event log, content-addressed artefact store.
- **Eval harness:** the adversarial injection suite, the provenance suite, the schema suite, the forbidden-verb lexicon, the fairness audit, the counterfactual.
- **Frontend:** React manager queue (triage sort, verdict + override, evidence display, degraded/advisory banners).

## North Star alignment

Advances all three durability tiers, in the North Star's stated order: (1) deterministic compliance gate, no LLM in any decision path; (2) rank-order + the automatic breaker that degrades it; (3) falsifiable mechanisms served by a read-only, tenant-data-free API.

Clears every stated **Non-goal**: no ad-spend execution, no fine-tuning, no weekly library refresh, no cross-tenant learning from outcome data, no causal claim, no number on the Knowledge API, no creator-facing trend feed (REQ-005g).

## Non-goals (this scope)

- No real closed-platform scraping. Source allowlist only; every keyless read is `Proxy` (ADR-0001).
- No live LLM provider by default. The judge is provider-abstracted with a deterministic offline fake as the default, because **the APP 8 / cross-border consent decision is required before creator content meets a model at scale** (compliance-notes, before Phase 3). Shipping default-offline is the compliant posture, not a shortcut.
- No fabricated calibration. The eval harness **refuses** to emit a Spearman below n = 60 rather than printing a meaningless one.
- No ClientHub. The control plane is standalone and owns its own tenancy, campaigns, submissions, and rights records.

## How this fails (pre-mortem)

1. **"Full automation" is built literally.** An auto-approve path, a model-cleared veto, a warrant promoted on a timer. Each is a P1 by the doc set's own definition, and each is one convenient refactor away. *Mitigation:* the three human gates are acceptance criteria on their phases; the adversarial suites are written **before** the code they guard, so they can fail.

2. **Green tests on synthetic fixtures get read as a working product.** The system will cheerfully compute a Spearman over 12 fixture posts and someone will screenshot it. *Mitigation:* cohorts below n = 60 are `cold` by construction and surface no VPS; the calibration endpoint returns the reason, not a number; fixtures carry fixture provenance and are excluded from any client-facing surface.

3. **Boundaries erode under convenience.** In a monorepo, `C2 → C1` is one `using` statement, and `C2 → C4` is one HTTP client. ADR-0007 is explicit that the invariant must be **reachability, not a filter** — "a bug in C4's tenancy check cannot leak tenant data, because there is none in the process." *Mitigation:* enforce structurally — no build-graph reference from C2 to C1 or C4, C4 in its own process with a read grant to one artefact-store prefix, and a permanent test asserting the reference graph and that no exemplar-sourced outcome reaches an effect-size estimator.

**Must-answer ambiguities, resolved (per the standing "most complete option" directive):**

| Question | Resolution |
|---|---|
| Is there a ClientHub to integrate with? | No. Build a standalone control plane owning tenancy/campaigns/submissions/rights. |
| Persistence? | EF Core over SQLite (dev) / Postgres-shaped schema; filesystem content-addressed artefact store keyed by sha256. Runs with no external infra. |
| LLM provider? | Abstracted `IJudge`; deterministic offline fake is the default. Real provider behind config, gated on the APP 8 decision. |
| Frontend? | Real, but last — it is the least load-bearing surface against the invariants. |
| C3 has no component doc | Known gap (CLAUDE.md). Its spec is assembled from ADR-0005 + Contracts C/D; write `component-3-calibration-monitor.md` as part of the phase that builds it. |
