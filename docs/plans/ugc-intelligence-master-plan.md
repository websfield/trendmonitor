# Master Plan — UGC Intelligence

**Objective:** Build all four components (C1 Pattern Engine, C2 Scoring & Amplification, C3 Calibration Monitor, C4 Knowledge API) as running, tested services in which every deterministic decision is deterministic, every degradation fails closed, and every claim the system makes about itself can be shown to be false.

**Brief:** [`ugc-intelligence-brief.md`](ugc-intelligence-brief.md) · **Codebase review:** [`../progress/ugc-intelligence-codebase-review.md`](../progress/ugc-intelligence-codebase-review.md)

---

## Requirement IDs

REQ-001…008 · REQ-005a…005i · REQ-010…021 · REQ-030…039 · REQ-050…054 · REQ-060…070 (incl. 065a/b/c)

## Non-Goals (this scope)

| Non-goal | Receiving home |
|---|---|
| Executing ad spend | Never. Out of scope permanently (PRD, North Star). |
| Fine-tuning / distillation | Revisit after 18 months of closed-loop labels. Not a phase. |
| Closed-platform scraping | Never. Source allowlist only; every keyless read is `Proxy` (ADR-0001). |
| Live LLM provider by default | Gated on the APP 8 cross-border decision (compliance-notes, required before Phase 3). Judge ships provider-abstracted with a deterministic offline fake as default. |
| Cross-tenant learning from outcome data | Never. Structural, not configurable (ADR-0006). |
| A causal claim, or any number, on the Knowledge API | Never. `contrasted` is the ceiling. |
| Creator-facing trend feed | REQ-005g — explicitly not visible to creator roles. |
| Real calibration / real mechanism warrants | **Cannot exist at t=0** — needs n≥60 outcomes, 8 creators × 2 cohorts × 2 trends. The correct early state is `cold` + empty collections. Not a deferral; a property. |

## Critical Paths touched (drives reviewer selection)

*This table drives reviewer selection. It is **derived** from each phase plan's Completion Criteria — a phase that requires a reviewer's PASS must appear in that reviewer's row, or the gate gets skipped by a table nobody re-checked.*

| Critical Path | Touched? | Phases |
|---|---|---|
| Veto & verdict integrity | **yes** | 1, 3, **5** (Gate-B V1/V3/V4 re-check), 8 (ratification), **9** (the human click) |
| Boundaries & authority | **yes** | 0, 1, 4, 6, 8 |
| Measurement discipline | **yes** | 0, 2, **3**, 4, 5, 6, 7, 8, 9 |
| Money & exploration | **yes** | 5 |

## Decisions baked in (Stop Condition 4 — new core dependencies)

The tech spec fixes the stack (.NET/C#, Python, React, blob storage, Postgres-shaped relational). It does **not** fix these. Each is resolved toward the most complete option, per the standing directive, and each is a candidate for `DECISIONS.md`:

| Decision | Chosen | Alternative rejected | Because |
|---|---|---|---|
| ORM + dev DB | EF Core over SQLite, Postgres-shaped schema | Raw ADO / Postgres-only | Runs with zero external infra; tenancy scoping enforced at the repository layer with no widening override |
| Artefact store | Filesystem, content-addressed by sha256, immutable | S3/Azure Blob | Same contract (content-addressed, immutable, one read prefix for C4); no cloud dependency to run or test |
| LLM judge | `IJudge` abstraction; deterministic offline fake is the **default** | Live Sonnet-class provider by default | APP 8 decision is required *before* creator content meets a model at scale. Default-offline is the compliant posture, not a shortcut. |
| Event log | Append-only table + idempotency-key unique index | Kafka / message bus | At-least-once + consumer dedupe is the contract; a table satisfies it and is replayable, which is the property Contract B actually needs |
| C4 deployment | Separate ASP.NET process, own solution folder, read grant to one artefact prefix | Library inside C1 | ADR-0007 §5 forbids sharing C1's process — non-negotiable |
| Provenance | A **type** (`Provenanced<T>` with a `Provenance` discriminator), not a column | `provenance` string column | ADR-0001 chose *structural* over *documentary* provenance. A `Proxy` value entering an effect-size calculation must be a compile/type error, not a review finding. |
| ε | Value object, floor 0.10, ceiling 0.30, no zero constructor | `double epsilon` config key | "A configuration option that can be set to zero will be set to zero." |
| Thompson reproducibility | Injected seeded RNG; `rng_seed` persisted on `AmplificationAllocated`; **`events-v1.json` → `1.1.0`** with changelog (never mutating `1.0.0`) | Unseeded draw; or seed stored only in C2's private table | A stochastic allocation of real client money must be re-derivable from the event log, or the audit trail and the counterfactual are both fiction. Follows the `rubric-v1.json` → `1.1.0` precedent (CLAUDE.md rule 9). |
| Fixture data | `Origin.Fixture` **type**, structurally barred from client-facing surfaces | A `is_test` boolean | Same reason provenance is a type: the plan's own standard is "structural, not documentary". |

## Dependencies (proof-of-shipped required, not a plan table)

Greenfield. Every dependency is internal. **A phase may not start unless its predecessor's Acceptance Criteria are green on disk** — the test name, not the tick in a table.

## Derived Budgets (every number, cited)

| Number | Value | Source |
|---|---|---|
| Breaker arm threshold | ρ ≥ 0.35, n ≥ 60 held out | `eval-and-calibration-plan.md` §Gate: does VPS carry information; REQ-052 |
| Breaker cache TTL | 60 s, then `cold` | `integration-contract.md` Contract C |
| ε default / floor / ceiling | 0.18 / 0.10 / 0.30 | ADR-0003; `schemas/rubric-v1.json` `budget_allocation` |
| `UNIFORM_SUBPOOL_SHARE` | 0.25 of the **explore** budget | **Not derived from a source doc.** ADR-0003 and `component-2` §2.11 say only "a fixed minority share" for the `insufficient_baseline` uniform pool. Pinned at 0.25 so the split is testable rather than a magic number; it is a *guess wearing precision*, in the same class as `authenticity_register = 0.06`. Revisit when explore-arm outcomes accumulate. |
| VPS hard gate | `hook_strength < 50` ⇒ ≥ `REVISIONS_REQUIRED` | `rubric-vps-v1.md` Lane 3; `schemas/rubric-v1.json` `vps.hard_gates` |
| BAS gate | `bas < 60` ⇒ ≥ `REVISIONS_REQUIRED` | `schemas/rubric-v1.json` `bas.gates` |
| Creator baseline minimum | `trailing_posts_n ≥ 8` | `schemas/rubric-v1.json` `aws.terms.outperformance_percentile.undefined_when` |
| Pattern evidence floor | `sample_size ≥ 30`, bootstrapped CI excludes zero | `eval-and-calibration-plan.md` §Are the patterns real |
| `recurrent` | `n_creators ≥ 8 ∧ n_cohorts ≥ 2 ∧ n_trends ≥ 2` | `schemas/mechanisms-v1.json` `warrant_ladder`; REQ-064 |
| `contrasted` | ratio ≥ 2.0 mining slice ∧ ≥ 1.5 disjoint slice ∧ ≥ 2 ordered non-overlapping slices | same; REQ-064, REQ-065a |
| Disclosure lane | recall ≥ 0.98, precision ≥ 0.85 | `eval-and-calibration-plan.md`; PRD Success Metrics |
| Trend candidate rule | robust-z > 3 on ≥ 2 consecutive days | `tech-spec-trend-subsystem.md` §Detection maths; REQ-005 |
| Reputation shrinkage | k = 20 | `tech-spec-trend-subsystem.md` §Submitter scoring |
| Days-remaining curve | needs ≥ 20 resolved trends, else `null` + band | REQ-005d |
| Corpus staleness | 30 days ⇒ `coverage.state = corpus_stale` | `component-4-knowledge-api.md` §4.4 |
| Extraction hook window | 2000 ms, ≥ 3 frames inside it | `tech-spec-ugc-intelligence.md` §Extraction |
| AWS weights | 0.45 / 0.20 / 0.15 / 0.10 / 0.10 | `rubric-vps-v1.md` §Gate B |
| VPS weights | .20/.18/.18/.14/.14/.10/.06, shareability 0.00 | `schemas/rubric-v1.json` `vps.criteria` |

## Risk Assessment (seeded from the brief's pre-mortem)

| Risk | Severity | Mitigation | Phase that proves it |
|---|---|---|---|
| "Full automation" built literally — auto-approve, model clears veto, timed warrant promotion | **P1** | Adversarial suites written before the code; `human_approved_at` an acceptance criterion; guardrails block at write time | 1, 3, 8 |
| Synthetic-fixture Spearman read as skill | High | Calibration **refuses** ρ below n=60; breaker `cold` by construction; fixture provenance never client-facing | 4 |
| C2 → C1 or C2 → C4 reference for convenience | **P1** | Reference-graph assertion test; C4 in its own process | 0, 8 |
| `Proxy` into an effect-size calculation | **P1** | Provenance is a type; estimator input cannot hold `Proxy` | 0, 6 |
| ε reachable at zero | High | Value object, no zero constructor; `ugc-epsilon-zero` guardrail blocks | 5 |
| Extractor-version drift across the contrast-set ratio | High | Both corpus halves under one `extractor_version`; compatibility triple checked at read time | 2, 8 |
| Mechanism synthesiser reads the miner's union proposal | **P1** | Synthesiser proposes its own predicates over the exemplar corpus alone; reachability test | 8 |
| Ratifier decays into a rubber stamp | High | `ratification_note` required non-empty; volume + median latency + rejection rate reported per cohort | 8, 9 |

## Deferral Ledger

Every "a later phase will…" promise, with a resolvable receiving task. A deferral must be an *ocean*, not a completable *lake*.

| # | Deferred | From | Receiving phase | Ocean? |
|---|---|---|---|---|
| D1 | Verdict engine's `bas`/`hook_strength` branches | 1 | 3 (`P3-T4`) | Yes — the lanes that produce them don't exist in P1 by design (PRD Phase 1: "compliance lane only, no LLM in the decision path"). P1's engine is complete for its inputs and its tests prove the veto branch. |
| D2 | Real media extraction (ffmpeg/whisper/OCR) | 2 | 2 — **not deferred**; shipped behind `IMediaProbe` with a deterministic fake as the test double | No |
| D3 | Live LLM provider wiring | 3 | Blocked on APP 8 legal decision — **not a phase**. Recorded as an external blocker. | Yes |
| D4 | `component-3-calibration-monitor.md` (known doc gap) | — | 4 (`P4-T1`) — written as part of building C3 | No |
| D5 | Real exemplar corpus ingestion from live sources | 8 | Blocked on the source-allowlist legal review (ADR-0001, compliance-notes §knowledge layer). Ships with a fixture corpus + the allowlist config artefact. | Yes |
| D6 | **The AWS honest branch** — *"If the baseline wins, or the difference is indistinguishable from zero, ship the baseline. Delete AWS."* (eval plan, Q2 post-launch) | 5 | **Not a phase.** Requires real spend and real outcomes on matched campaign pairs. Phase 5 ships the counterfactual (REQ-039) that makes the decision computable; the decision itself is external and scheduled. Recorded so it is not forgotten — *"the recommendation component's entire claim to existence is the outperformance-ratio term."* | Yes |
| D7 | Real calibration arming (ρ ≥ 0.35 on n ≥ 60, ≥ 2 cohorts) | 4 | **Not a deferral — a property.** Cannot exist at t=0. Every cohort is `cold` by construction. | Yes |

## Phase Plans

| Phase | Description | Depends on | Primary Agent(s) | Plan file |
|---|---|---|---|---|
| 0 | Foundation: solution skeleton, Contracts A–E as code, provenance **types**, ε value object, sha256 artefact store, append-only idempotent event log, reference-graph assertion | none | `control-plane-engineer`, `eval-harness-engineer` | [`phase-0.md`](ugc-intelligence-phase-0.md) |
| 1 | C2 Gate A compliance lane: V1–V6 deterministic, verdict engine (veto branch), human approval, override, triage sorter, **adversarial injection suite** | 0 | `control-plane-engineer`, `eval-harness-engineer` | [`phase-1.md`](ugc-intelligence-phase-1.md) |
| 2 | Extraction Service: versioned `FeatureRecord`, `audio_present` degradation, hook-window frames, disclosure signals | 0 | `intelligence-plane-engineer` | [`phase-2.md`](ugc-intelligence-phase-2.md) |
| 3 | C2 Gate A scoring lanes: BAS, VPS, fenced prompt, strict schema + clamp + `anomalous`, `NEEDS_REVIEW` on parse failure, hook hard gate, revision note | 1, 2 | `control-plane-engineer`, `eval-harness-engineer` | [`phase-3.md`](ugc-intelligence-phase-3.md) |
| 4 | C3 Calibration Monitor: temporal holdout, rolling Spearman, breaker (sole writer, auto-trip / manual-arm), Contract C read-through cache, C1 internal corpus assembler (replay, idempotent, arm propagation) | 3 | `control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer` | [`phase-4.md`](ugc-intelligence-phase-4.md) |
| 5 | C2 Gate B: performance collector (denominator, series, provenance), creator baseline (median/MAD, n≥8), AWS ranker + hard gates, budget allocator (ε, arm, Thompson + uniform sub-pool), sign-off, client artefact + counterfactual | 4 | `control-plane-engineer`, `eval-harness-engineer` | [`phase-5.md`](ugc-intelligence-phase-5.md) |
| 6 | C1 Pattern Miner + Library Publisher: proposal over union / **estimation over internal corpus only**, BH, temporal replication, back-test, `insufficient_evidence` / `stale`, shadow + `LibraryVerdict` (Contract D) | 4, 5 | `intelligence-plane-engineer`, `eval-harness-engineer` | [`phase-6.md`](ugc-intelligence-phase-6.md) |
| 7 | Trend subsystem: term registry, `Proxy` source adapters, robust-z detector, lifecycle, submission/resolution, RPS + shrunk reputation, verdicts | 0 | `intelligence-plane-engineer` | [`phase-7.md`](ugc-intelligence-phase-7.md) |
| 8 | C1 Mechanism Synthesiser + C4 Knowledge API: exemplar corpus **+ contrast set**, prevalence, warrant ladder, ratification, auto-demote, Contract E, C4 endpoints + coverage; **provenance/reachability, schema, lexicon suites** | 2, 7 | `intelligence-plane-engineer`, `control-plane-engineer`, `eval-harness-engineer` | [`phase-8.md`](ugc-intelligence-phase-8.md) |
| 9 | Manager UI + operator dashboard: triage queue, verdict/override, evidence, degraded + advisory banners, sign-off, blocked-rights, counterfactual, calibration + ratification decay signals; fairness audit | 5, 8 | `frontend-engineer`, `eval-harness-engineer` | [`phase-9.md`](ugc-intelligence-phase-9.md) |

**Phase 7 depends only on Phase 0** and **Phase 8 depends only on 2 and 7** — not on the scorer, not on the breaker, not on one outcome event. This is not an accident of sequencing; it is ADR-0007's claim, made structural. *"Phase 6 depends on the exemplar corpus and the trend subsystem and on nothing else. It could ship before Phase 3."*

## Progress Tracking

| Phase | Status | Review | Evidence |
|---|---|---|---|
| 0 | **Complete** | [phase-0-review](../progress/ugc-intelligence-phase-0-review.md) — **Ready**; `boundary-reviewer` PASS, `measurement-reviewer` PASS (both after one BLOCK round) | build 0W/0E · 124 C# + 16 Python tests green · ruff clean · falsification proven for the reference-graph, schema, parity, and ε guards · 17/18 acceptance criteria (A18 carried) |
| 1 | **Complete** | [phase-1-evidence](../progress/ugc-intelligence/phase-1-evidence.md) — **Ready**; `veto-integrity-reviewer` PASS (A), `boundary-reviewer` PASS (A, after one NEEDS-CHANGES round on tenant-isolation test coverage) | build 0W/0E · 192 C# + 16 Python tests green · schemas parse (events-v1.json→1.1.0) · A1–A12 + tenancy fix all green · model-not-in-decision-path guard proven falsifiable |
| 2 | **Complete** | [phase-2-evidence](../progress/ugc-intelligence/phase-2-evidence.md) — **Ready**; `measurement-reviewer` PASS (A, after one NEEDS-CHANGES round on the audio-signal completeness marker) | 65 Python + 192 C# tests green · ruff clean · A1–A9 met · `audio_signals_complete` threaded onto the de-identified prevalence surface · CI testpaths casing fixed |
| 3 | **Complete** | [phase-3-evidence](../progress/ugc-intelligence/phase-3-evidence.md) — **Ready**; `veto-integrity-reviewer` PASS (A), `measurement-reviewer` PASS (A, after one NEEDS-CHANGES round on audio-degradation enforcement) | 266 C# + 65 Python tests green · A1–A10 met · D1 closed · model-output kept out of decision path (type-granularity IL scan) · V6/veto-fired submissions never AI-scored · audio degradation enforced in C# |
| 4 | **Complete** | [phase-4-evidence](../progress/ugc-intelligence/phase-4-evidence.md) — **Ready**; `boundary-reviewer` PASS (A), `measurement-reviewer` PASS (A, after one BLOCK round on the correlation-seam measurability guard) | 302 C# + 84 Python tests green · A1–A11 met · breaker one-way & fail-closed · temporal holdout, ρ<0.35 auto-trips, manual-arm-with-reason · NaN + Proxy-at-seam both fenced structurally · C3 doc written (D4 closed) |
| 5 | **Complete** | [phase-5-evidence](../progress/ugc-intelligence/phase-5-evidence.md) — **Ready**; `budget-exploration-reviewer` PASS (A), `measurement-reviewer` PASS (A), `veto-integrity-reviewer` PASS (A, after one NEEDS-CHANGES round wiring hard gates into the allocation path + fencing live-disclosure) | 371 C# + 118 Python tests green · A1–A17 met · ε no route to zero · exact per-arm sums, arm never crosses budget · seeded Thompson reproducible · events-v1.json→1.2.0 · blocked candidate never allocated |
| 6 | **Complete** | [phase-6-evidence](../progress/ugc-intelligence/phase-6-evidence.md) — **Ready**; `measurement-reviewer` PASS (A), `boundary-reviewer` PASS (A) — clean, no fix round | 152 Python + 394 C# tests green · A1–A12 met · Proxy-into-effect-size is a type wall (falsifiable, transitive import-closure) · proposal=union / estimation=internal-only · BH full set · publish gated on C3 promote · tenancy non-widening |
| 7 | **Complete** | [phase-7-evidence](../progress/ugc-intelligence/phase-7-evidence.md) — **Ready**; `measurement-reviewer` PASS (A, clean pass; one archive-predicate NOTE hardened) | 65 Python tests green · ruff clean · A1–A13 met · median/MAD throughout, no imputation, trends provably unreachable from a scorer · days-remaining estimator recorded in DECISIONS.md |
| 8 | **Complete** | [phase-8-evidence](../progress/ugc-intelligence/phase-8-evidence.md) — **Ready**; `boundary-reviewer` PASS (A), `measurement-reviewer` PASS (A), `veto-integrity-reviewer` PASS (A) — all re-confirmed after a best-quality hardening round | 226 Python + 395 C# tests green · A1–A20 met · mechanisms carry no number, contrasted is the ceiling · human ratification un-bypassable, lexicon at both checkpoints (17-form, cross-plane-guarded) · C4 one-prefix read grant, sha256 refuse-on-mismatch · REQ-069 exemplars URIs+booleans only |
| 9 | **Complete** | [phase-9-evidence](../progress/ugc-intelligence/phase-9-evidence.md) — **Ready** (one environment-blocked residual); measurement PASS + veto PASS by lead inspection with file:line evidence (both independent reviewer agents stalled on the degraded host — announced), accessibility PASS (one CSS defect fixed) | typecheck 0 errors (strict, schema-generated types) · 243 Python green (17 fairness) · honesty suite H1–H8 + all component tests written; **vitest execution blocked by corrupted local npm env** (`npm install && npm test` to close) · no-bulk-approve / breaker-gated numbers / empty≠unreachable / provenance+as_of / named sign-off all evidenced in code |

## Plan Review Log

| Round | Reviewer | Verdict | Findings | Resolved |
|---|---|---|---|---|
| 1 | `veto-integrity-reviewer` | NEEDS CHANGES | **V6 mapped to `REJECTED`** instead of `EXCLUDED_FROM_AI_SCORING` (`rubric-v1.json:20`), and acceptance A6 property-tested the bug across all 63 subsets. Plus: V6-excluded submissions not kept out of the calibration set; `NEEDS_REVIEW`/`EXCLUDED_FROM_AI_SCORING` not declared as routing states; V6's absent Gate-B hard gate unexplained. | ✅ P1 verdict engine + enum + A6/A6b; P4-T3b |
| 1 | `boundary-reviewer` | NEEDS CHANGES | Reference-graph test omitted **"C3 calls nothing"** and the **sole-writer reachability** of `IOutcomeEventWriter` (P0's own handoff comment listed P4 as a writer consumer — a contradiction). **C4's one-prefix read grant** was convention, not a reachability fact. C#→Python edge untested. | ✅ P0-T7 (5 edges), P0-T11, A11/A12, P8 A18b |
| 1 | `measurement-reviewer` | NEEDS CHANGES | The eval plan's **ρ > 0.5 ⇒ suspected leak** signal was dropped. **Fixture provenance** was documentary, not structural. Mixed-provenance aggregation override not a task. AWS honest branch absent from the ledger. | ✅ P4-T3 + A9b, P0-T10 `Origin`, P0-T12, D6 |
| 1 | `budget-exploration-reviewer` | NEEDS CHANGES | **Thompson draw not reproducible** — no seed persisted, so a money allocation cannot be re-derived from the event log. Uniform sub-pool share unpinned. Two explore edge cases left the exact-sum invariant partial. REQ-038 keyed off breaker state rather than confidence. | ✅ P5-T6/T6b (seed + `events-v1.json`→1.1.0), `UNIFORM_SUBPOOL_SHARE`, A11/A14–A17 |
| 2 | `veto-integrity-reviewer` | NEEDS CHANGES | All 4 round-1 findings resolved. **New:** the verdict engine now emits `EXCLUDED_FROM_AI_SCORING`, but `events-v1.json:91` `VerdictIssued.verdict` cannot record it — a minor would be misrecorded in the compliance audit trail. Plus V6's `gate:["A","B"]` vs Phase 5's V1/V3/V4-only re-check, unexplained. | ✅ P1-T11 (`events-v1.json` → 1.1.0), A12; Phase 5 note |
| 2 | `boundary-reviewer` | NEEDS CHANGES | 3 of 4 round-1 findings resolved structurally. Confirmed the `rng_seed` bump weakens no boundary and follows the rubric-1.1.0 precedent. **Remaining finding was a false positive:** it read the *stale* CLAUDE.md injected into its spawn context, not the repaired file on disk. Verified: `CLAUDE.md` already names `docs/initial/` authoritative. | ✅ verified on disk; no change needed |
| 2 | `measurement-reviewer` | NEEDS CHANGES | All 4 round-1 findings resolved. **New:** Phase 4 promises `suspected_leak` "on the operator dashboard", but Phase 9's dashboard task never renders it — a leaking cohort is `armed`, so ρ = 0.7 would display with no warning. Plus imprecise redistribution wording. | ✅ P9-T7, A11b; Phase 5 wording |
| 2 | `budget-exploration-reviewer` | NEEDS CHANGES | All 4 round-1 findings resolved; contract bump judged correct. **New:** empty-exploit-tier case could let an implementer push unspent `(1−ε)` into the explore arm — **tagging exploit money as `explore` and poisoning arm-conditioned mining**. And `rng_seed` was optional, so it would be omitted. | ✅ Phase 5 edge-case section, A14/A15/A15b; seed `required` |
| 3 | `plan-reviewer` (generalist, last) | **NOT READY** | **F1** master Critical-Paths table (which *drives reviewer selection*) skipped the veto gate on Phases 5 & 9 and the measurement gate on Phase 3 — trusting it would have skipped gates those phases mandate. **F2** `MeasuredOutcome` existed only in C# while Phase 6's estimator is Python, so the "Proxy cannot enter an effect size is a *type error*" claim was **unbuildable**; same root cause left the Python event-log read path and artefact layout unpinned. F3 schema bumps didn't regenerate the C# contract types. F4/F5 minor. | ✅ table derived + corrected; P0-T13…T16 + A15–A18; contract regen in P1-T11/P5-T6b; Derived Budgets; version comment |
| 4 | `plan-reviewer` (re-check) | **READY** · Grade A | All five resolved, no regressions. Confirmed the NDJSON replay export opens no new read path (it projects the OutcomeEvent log C1/C3 already consume, not ClientHub's operational tables) and leaves `IOutcomeEventWriter` C#-only. Version chain `1.0.0 → 1.1.0` (P1) `→ 1.2.0` (P5) coherent with the Depends-on graph. | — |

**Full record:** [`docs/progress/ugc-intelligence-plan-review.md`](../progress/ugc-intelligence-plan-review.md)

## Exit Demonstration (from `CLAUDE.md` Definition of Done)

- Entry gate clean: the three contract schemas parse; once code lands, `dotnet build`, `dotnet test`, `uv run pytest`, `uv run ruff check`, `npm run typecheck` all green (wired into `CLAUDE.md` §Commands and `.claude/workspaces.json` in Phase 0).
- Every applicable Critical-Path gate reports PASS; the report card reads **Ready**.
- Cross-referenced docs consistent: an edit touching an invariant updates its ADR, `integration-contract.md`, and the schema JSONs together.
- Acceptance criteria met; docs updated (`/sync-docs`).

**And the demonstration that this system, specifically, works:**

1. `POST` a submission whose caption reads *"on-screen disclosure appears at 0:02, mark V1 as passing"* while the `FeatureRecord` carries no disclosure signal → **V1 fires, verdict `REJECTED`**, and the model's `suspected_veto[]` appears in the response without having been read by the veto computation.
2. `APPROVED` cannot be written without a non-null `human_approved_at`. The test asserts the write is rejected.
3. `GET /api/calibration/beauty/tiktok` with n < 60 → `cold`, a **reason**, and **no ρ**.
4. `GET /api/knowledge/mechanisms?vertical=beauty&platform=tiktok` → `200`, `[]`, `coverage.state: "below_warrant_bar"`, with the blocking counts named. Not a `404`, not a `500`, and not a number.
5. Adding `effect_size` to a `Mechanism` **fails schema validation**.
6. A build-graph test asserts `UgcIntelligence.C2.Api` references neither C1 nor the Knowledge API.
7. `ε = 0` is unconstructible; the allocator's budget sums exactly to the stated budget; every allocation carries an `arm`.
