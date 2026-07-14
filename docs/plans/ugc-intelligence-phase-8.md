# Phase 8 — C1 Mechanism Synthesiser + C4 Knowledge API

**Depends on:** 2, 7
**Primary agents:** `intelligence-plane-engineer`, `control-plane-engineer`, `eval-harness-engineer`
**Requirement IDs:** REQ-060…REQ-070, REQ-065a, REQ-065b, REQ-065c, REQ-005i
**Critical Paths:** Boundaries & authority · Measurement discipline · Veto & verdict integrity (mechanism-statement ratification)

> **This phase depends on the exemplar corpus and the trend subsystem and on nothing else.** Not the scorer. Not the breaker. Not one outcome event. *"The temptation to accelerate it by feeding internal outcomes into a mechanism is the temptation this design exists to refuse."*

---

## Project Conventions Pinned (READ FIRST)

### Golden rules
1. Read before you write. 2. No secrets. 3. Never destroy what you didn't create. 4. Fix causes, not symptoms. 5. Match the codebase. 6. **Report honestly.** 7. Small, verifiable steps. 8. Scale caution to blast radius. 9. Current facts beat trained memory.

### Non-negotiable rules for this phase
- **Rule 6 — Mechanisms are hypotheses, never numbers.** A `Mechanism` carries **no effect size** (schema-forbidden via `additionalProperties: false`), a **required `falsifier`**, and a `warrant` rung computed from corpus counts; it is mined **only** from the public exemplar corpus, is tenant-neutral **by construction**, and is **human-ratified** before serving. **Automatic to demote, human to promote.** `contrasted` is the ceiling and is **not a causal claim** — *causes/lifts/drives/predicts* are forbidden verbs.
- **Rule 3 — Sole authorities.** **C2 never calls C4.** C4 writes nothing, calls nothing, reads no breaker, and its **whole read grant is one artefact-store prefix**.
- **Rule 5 — Measurement discipline.** A `Proxy` value never enters an effect-size calculation. **Prevalence is a count over a proxy-*selected* set, not an aggregation of proxy *values*.**
- **Rule 8 — Tenancy.** A summary statistic of outcome data **is** outcome data. No pooled effect sizes, no cross-tenant confirmation counts.

### Stack
Python for the synthesiser (C1). C# for C4 (**its own ASP.NET process** — ADR-0007 §5 forbids sharing C1's process). `GET` only; there is no verb that writes.

### Anti-patterns
- **Consuming Phase 6's proposal output.** The synthesiser proposes its **own** predicates over the exemplar corpus alone. *"An invariant stated as reachability and implemented as washing out is an invariant that has already been weakened once and will be again."* Never "optimise away" the duplication.
- A `?include_unratified=true` parameter, admin path, or internal-caller exemption.
- Writing `arm` on a `Mechanism`. It carries `ingestion_arm` ∈ {trend_directed, uniform, mixed}. **The two field names must never converge.**
- Treating `prevalence_in_contrast_set = 0` as infinite ratio. It is **undefined**; the mechanism stays `conjectured` and the zero is surfaced.
- A `404` for a cohort with no library. It is a `200` with an empty collection and `coverage.state`.
- A `feature_predicate` referencing creator identity, follower count, or a demographic proxy. **That is not a mechanism and must fail review.**

### Available agents
`control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer`, `frontend-engineer`.

---

## Requirements Checklist (functional)
| ID | Requirement |
|---|---|
| REQ-060 | `Mechanism`: a falsifiable hypothesis about **why** a structure recurs, keyed by `(vertical, platform)` with **no tenant axis**, mined exclusively from the public exemplar corpus and trend signals. |
| REQ-061 | **No `OutcomeEvent`, `Pattern`, `PerformanceSnapshot`, or operational table is an input to synthesis**, at any weight, under any configuration. Tenant-neutral by construction, not by a scoping check. |
| REQ-062 | No `effect_size`, `effect_ci`, `lift`, `vps`, `aws`, or any magnitude field. `additionalProperties: false` — introducing one **fails validation**. |
| REQ-063 | Every `Mechanism` carries a `falsifier`, **recorded before its evidence is gathered**. Without one it is not persisted. |
| REQ-064 | `warrant ∈ {conjectured, recurrent, contrasted, falsified, retired}`, computed **deterministically from corpus counts**. `recurrent` requires `n_creators ≥ 8 ∧ n_cohorts ≥ 2 ∧ n_trends ≥ 2`. `contrasted` additionally requires ratio ≥ 2.0 on the mining slice and ≥ 1.5 on a temporally disjoint slice. |
| REQ-065 | **Demotion automatic and immediate; promotion requires a named human** to ratify the `statement`. `ratified_by`, `ratified_at`, non-empty `ratification_note` required before any rung is served. **Ratification volume and median latency per cohort reported to the operator** as the rubber-stamp decay signal. |
| REQ-065a | `contrasted` carries ≥ 2 **ordered, non-overlapping** `temporal_slices` (`slice[i].to ≤ slice[i+1].from`). Two-slice minimum by schema; **disjointness enforced by the synthesiser and re-checked at ratification** (JSON Schema cannot express the cross-item comparison). |
| REQ-065b | The corpus builder retains **two** sets per cohort: each creator's top-decile posts, and **the same creators' posts below their own top decile**. Both extracted under the **same `extractor_version`**. Without the second set, `prevalence_in_contrast_set` is uncomputable and no mechanism leaves `conjectured`. |
| REQ-065c | Every `Mechanism` carries `ingestion_arm ∈ {trend_directed, uniform, mixed}`. **It is not the amplification `arm`.** |
| REQ-066 | **No `Mechanism`, and nothing derived from one, is an input to a veto, a verdict, a VPS, a BAS, an AWS term, or a budget allocation. C2 has no code path to a mechanism.** |
| REQ-067 | Every C4 response carries `warrant`, `provenance.label`, `never_tested_against`, `falsifier`, `mechanism_library_version`, `sha256`. **No response carries a `0-100` field or an effect size.** |
| REQ-068 | Collection responses distinguish `served` \| `below_warrant_bar` \| `no_library` \| `corpus_stale`, naming the blocking counts. **An empty response never presents as an absence of structure.** |
| REQ-069 | `/exemplars` returns **public post URIs and predicate-satisfaction booleans only**. Never frames, transcripts, faces, or extracted personal information. |
| REQ-070 | The quarterly "what changed" report is **derived by reading C4**, not assembled independently. |

## The maths
```
prevalence_in_top_decile   = |{ e ∈ TopDecile   : P(e.feature_record) }| / |TopDecile|
prevalence_in_contrast_set = |{ e ∈ ContrastSet : P(e.feature_record) }| / |ContrastSet|
prevalence_ratio           = prevalence_in_top_decile / prevalence_in_contrast_set
```
Computed **strictly within this library's own cohort**. Never pooled across cohorts — *"two (vertical, platform) populations are not one population."* `n_cohorts` is a **recurrence count**, not a pooling instruction.

**Why this is a count, not a lift.** Top-decile membership was selected using `Proxy` engagement. The predicate is evaluated **deterministically** over the `FeatureRecord` extracted from the media itself. A count over a proxy-*selected* set is not an aggregation of proxy *values*. Label: **`Proxy-selected, Measured-evaluated`**.

**No p-value, deliberately.** There is no sampling model that honestly describes *"the top decile of a hand-curated allowlist of creators, ranked on proxy engagement."* A CI would import a precision the sampling frame cannot support.

**The thresholds are guesses wearing precision.** 2.0 and 1.5 are not derived from anything. The mitigation is the **recalibration rule, stated in advance**: *if a majority of proposed predicates reach `contrasted` in year one, the bar is too low and the corpus is too small, in that order.* Implement this as a reported metric, not a silent one.

## Edge Cases & Failure Paths
| Question | Answer | Becomes |
|---|---|---|
| **Inverse** | ratify (human) ↔ auto-demote to `falsified` (no human step, same cycle). Both logged as `MechanismWarrantTransition` with the causing `corpus_snapshot_sha256`. | `P8-T6`, `P8-T7` |
| **Double failure** | Artefact store unreachable **and** no verified cache → C4 serves nothing and alarms. **Never a bare 500** to a caller who will read it as "the knowledge is broken"; a 503 with `stale_as_of: null` and a reason. | test `C4_StoreDown_NoCache_AlarmsWithReason` |
| **Degraded mode** | Store unreachable, cache present → serve last verified cache stamped `stale_as_of`. | `P8-T9` |
| `sha256` mismatch on load | **Refuse the artefact.** Serve the previous verified version. **Alarm P1** — the store is not what the contract says it is. | test `C4_HashMismatch_RefusesAndAlarmsP1` |
| No library for a cohort | `200`, `[]`, `coverage.state = "no_library"`. **Not a 404.** *Absence of a library is not absence of a cohort.* | test `C4_NoLibrary_200_Empty_WithCoverage` |
| Nothing clears `recurrent` | `200`, `[]`, `coverage.state = "below_warrant_bar"`, **with the blocking counts named**. | test `C4_BelowBar_NamesBlockingCounts` |
| Corpus not refreshed in 30 days | `coverage.state = "corpus_stale"`. Mechanisms still served, staleness surfaced. | test `C4_CorpusStale_SurfacedNotHidden` |
| `prevalence_in_contrast_set = 0` | Ratio **undefined, not infinite**. Stays `conjectured`; the zero is surfaced. | test `Prevalence_ZeroContrast_Undefined` |
| Predicate in only one trend | Stays `conjectured` **regardless of how many creators carry it**. It is a trend, not a mechanism. | test `OneTrend_StaysConjectured` |
| Ten posts by one creator | `n_creators = 1`. | test `Independence_TenPostsOneCreator` |
| Source post deleted after snapshot | URI dies, **counts survive** (computed at `corpus_snapshot_sha256`). `/exemplars` returns the dead URI marked `unresolvable`. | test `DeletedPost_CountsSurvive_UriUnresolvable` |
| Source permits ingestion but not redistribution | C4 **serves the counts and withholds the URI**. | test `NoRedistribute_CountsOnly` |
| A caller requests a score from C4 | **There is no field and no endpoint.** A design property, not a validation error. | test `C4_HasNoScoreField` |
| Model drafts a causal statement | Rejected at ratification; the lexicon check is the **regression test on the ratifier**, not the primary control. Logged. | test `Lexicon_ForbiddenVerb_Rejected` |
| An injection that avoids every forbidden verb | **Passes every automated control.** It must reach the human ratifier and cannot be served without ratification. **This is the point of the suite.** | test `SubtleInjection_UnservableWithoutRatification` |

## Failure Modes & Degraded Behavior
| Boundary | Failure | Degraded | Reconciliation | Spec |
|---|---|---|---|---|
| C4 → artefact store | Unreachable | Last verified cache + `stale_as_of`. Alarm. Never a bare 500. | Retry | `C4_StoreDown_ServesStale` |
| C4 → artefact store | sha256 mismatch | **Refuse**; serve previous verified. **P1.** | Investigate | `C4_HashMismatch_RefusesAndAlarmsP1` |
| C1, C2, C3 down | — | **C4 unaffected.** It reads an artefact store. | — | `C4_UnaffectedByOtherComponents` |
| C4 down | — | **Nothing else affected.** No scoring, compliance, or calibration path depends on C4. | — | `C4_Down_NothingElseAffected` |

## The statement drafter is C1's own, not C2's

Phase 8 drafts prose with a model. It **must not** import or call C2's `IJudge` (Phase 3) — that would give C1 a dependency on C2, which the call-graph forbids in both directions (*"C1 never calls C2"*). The synthesiser owns a **separate Python drafting client**, with its own fenced prompt, its own deterministic offline fake, and no shared process with the control plane.

This is why Phase 8 depends on 2 and 7 and **not** on 3: it needs `FeatureRecord`s and trends, never a scorer. A test asserts `c1_pattern_engine` imports nothing from the control plane.

## Handoff Contracts
```python
# C1 → C4, Contract E. Consumed by C4 only. NEVER by C2.
# Note: no `arm`, no `effect_size`, no `tenant_id`, no `0-100` field. Enforced by schema.
def synthesise(cohort: Cohort, exemplar_corpus: ExemplarCorpus, contrast_set: ContrastSet,
               trends: Sequence[TrendSignal]) -> list[Mechanism]: ...
# The signature is the invariant: there is no parameter through which an OutcomeEvent,
# a Pattern, a Submission, or a tenant_id could arrive.
```

## Implementation Tasks
| # | Task | Owner | File(s) |
|---|---|---|---|
| P8-T1 | Exemplar corpus builder: **top-decile + contrast set**, ranked against each creator's **own** baseline, same `extractor_version`; per-creator recorded sampling | `intelligence-plane-engineer` | `.../c1_pattern_engine/corpora/exemplar.py` |
| P8-T2 | **Independent** predicate proposal over the exemplar corpus alone (does **not** import Phase 6's proposer) | `intelligence-plane-engineer` | `.../synthesiser/propose.py` |
| P8-T3 | Prevalence counting; undefined-on-zero-contrast | `intelligence-plane-engineer` | `.../synthesiser/prevalence.py` |
| P8-T4 | Warrant ladder, deterministic from counts; `n_creators` counts **distinct creators**; `n_trends` counts **unrelated** trends | `intelligence-plane-engineer` | `.../synthesiser/warrant.py` |
| P8-T5 | Statement drafting (model, fenced) + `falsifier` recorded **before** evidence | `intelligence-plane-engineer` | `.../synthesiser/statement.py` |
| P8-T6 | Ratification: `ratified_by` + non-empty `ratification_note`; **volume + median latency + rejection rate per cohort** reported | `intelligence-plane-engineer` | `.../synthesiser/ratify.py` |
| P8-T7 | **Auto-demotion** on corpus refresh → `falsified`, withdrawn same cycle, transition logged with causing snapshot hash | `intelligence-plane-engineer` | `.../synthesiser/demote.py` |
| P8-T8 | Mechanism publisher: immutable, content-addressed, `corpus_snapshot_sha256`, **no tenant axis on the key** | `intelligence-plane-engineer` | `.../publishers/mechanism_library.py` |
| P8-T9 | **C4**: resolver (sha256 verify, refuse-on-mismatch, stale cache), warrant filter, response composer, coverage reporter, 5 `GET` endpoints | `control-plane-engineer` | `src/KnowledgeApi/**` |
| P8-T10 | **Provenance/reachability suite** — the eval plan's 8 day-one cases | `eval-harness-engineer` | `tests/Architecture/test_mechanism_provenance.py` |
| P8-T11 | **Lexicon suite** — forbidden verbs at ratification **and again at serve time** | `eval-harness-engineer` | `tests/Architecture/test_lexicon.py` |
| P8-T12 | **Poisoned-exemplar suite** — 5 adversarial captions, incl. the one that obeys the lexicon perfectly | `eval-harness-engineer` | `tests/Architecture/test_poisoned_exemplar.py` |

## Files to Create / Modify
New: `.../c1_pattern_engine/{corpora,synthesiser,publishers}/**`, `src/KnowledgeApi/**`, tests. Modify: `.claude/workspaces.json` (add C4 build).

## Migration Steps
`Mechanism`, `MechanismEvidence`, `MechanismWarrantTransition` — **no `tenant_id` column exists**, and no nullable one waiting to be filled. C4 has **no database**.

## Verification Steps
1. `uv run pytest && dotnet build && dotnet test` green. *(requires P8-T1..T12)*
2. `GET /api/knowledge/mechanisms?vertical=beauty&platform=tiktok` on a fresh corpus → `200`, `[]`, `coverage.state="below_warrant_bar"`, blocking counts named. *(requires step 1)*
3. Add `effect_size` to a `Mechanism` fixture → **schema validation fails**. *(requires step 1)*
4. Add `arm` to a `Mechanism` fixture → **schema validation fails**. *(requires step 1)*
5. Construct a `contrasted` mechanism with one temporal slice → fails. With two overlapping slices → fails (synthesiser check). *(requires step 1)*
6. Serve an unratified statement → refused. Empty `ratification_note` → refused. No `?include_unratified` parameter exists. *(requires step 1)*
7. Refresh the corpus so a `contrasted` mechanism's asymmetry vanishes → **auto-demoted to `falsified`, withdrawn the same cycle, no human step**; visible on `/history`. *(requires step 1)*
8. Mutate a published artefact byte → C4 **refuses**, serves previous verified version, alarms **P1**. *(requires step 1)*
9. Add a `Mechanism` import to any C2 scoring file → **`test_c2_has_no_mechanism_path` fails.** Revert. *(proves the test can fail)*
10. Attempt to pass an `OutcomeEvent` to `synthesise()` → **no parameter accepts it**; type error. *(requires step 1)*

## Acceptance Criteria
| # | Criterion | Evidence |
|---|---|---|
| A1 | Adding `effect_size`/`effect_ci`/`lift`/`vps`/`aws`/`arm` to a `Mechanism` **fails schema validation** | `test_forbidden_fields` (6 cases) |
| A2 | `synthesise()` has **no parameter** through which an `OutcomeEvent`, `Pattern`, `PerformanceSnapshot`, or `tenant_id` could arrive | `test_synthesiser_reachability` |
| A3 | The synthesiser does **not** import Phase 6's proposer | `test_independent_proposal` |
| A4 | C2 has **no code path** to a mechanism; the test **fails** when one is added | `test_c2_has_no_mechanism_path` + step 9 |
| A4b | `c1_pattern_engine` imports nothing from the control plane; the drafter is C1's own | `test_c1_does_not_import_control_plane` |
| A5 | `MechanismLibraryVersion` key carries **no tenant axis** | `test_no_tenant_axis` |
| A6 | `recurrent` requires `n_creators ≥ 8 ∧ n_cohorts ≥ 2 ∧ n_trends ≥ 2`; one trend ⇒ stays `conjectured` | `test_warrant_ladder` |
| A7 | `contrasted` requires ≥ 2 **ordered, non-overlapping** slices; disjointness re-checked at ratification | `test_temporal_slices` |
| A8 | `prevalence_in_contrast_set = 0` ⇒ ratio **undefined**, stays `conjectured`, zero surfaced | `test_zero_contrast_undefined` |
| A9 | Demotion automatic and same-cycle; promotion requires `ratified_by` + non-empty note | `test_demote_auto_promote_human` |
| A10 | No `?include_unratified`, no admin path, no internal-caller exemption | `test_no_unratified_path` |
| A11 | No C4 response carries a `0-100` field or an effect size | `test_c4_no_numbers` |
| A12 | Every C4 response carries warrant, provenance label, `never_tested_against`, falsifier, version, sha256 | `test_c4_response_composition` |
| A13 | `coverage.state` distinguishes all four states, naming blocking counts | `test_coverage_states` |
| A14 | sha256 mismatch ⇒ refuse + previous verified + **P1 alarm** | `test_hash_mismatch_p1` |
| A15 | `/exemplars` returns URIs + booleans only — never frames, transcripts, faces | `test_exemplars_no_pii` |
| A16 | Forbidden verbs rejected at ratification **and** at serve time | `test_lexicon` (2 checkpoints) |
| A17 | An injection obeying the lexicon perfectly is **unservable without ratification** | `test_poisoned_exemplar_subtle` |
| A18 | C4 reads no breaker; C4 emits no events; C4 has no write path | `test_c4_readonly` |
| A18b | **C4's read grant is one artefact-store prefix, structurally.** C4's resolver is a `PrefixScopedReader` bound to the mechanism prefix and **cannot resolve a `PatternLibraryVersion`** — attempting it fails, rather than being merely unattempted. *"If C4 ever needs a second data source, the design is wrong."* | `C4_CannotResolvePatternLibrary` |
| A19 | A `feature_predicate` referencing creator identity / follower count / demographic proxy **fails review** | `test_predicate_is_about_content_not_creator` |
| A20 | `contrasted`-rate by `ingestion_arm` is reported (REQ-005f's coupling gate) | `test_ingestion_arm_stratified_report` |

## Out of Scope
No pattern mining. No breaker read from C4 — **ever**. Do not fold C4 into C1's process.

## Completion Criteria
Entry gate clean; all suites green; `boundary-reviewer` **PASS**, `measurement-reviewer` **PASS**, `veto-integrity-reviewer` **PASS** (ratification). **The eval plan's schema, lexicon, and provenance suites must be green before any C4 response ships.**
