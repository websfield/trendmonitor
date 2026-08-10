# Master Plan — cutdown-product-program (Stages 0–7)

**Objective:** Take cutdown from a proven pipeline to a product a Social Soup producer can operate without a terminal and whose output quality is demonstrated by evidence rather than asserted — completing PRD Phase 0 honestly, then delivering PRD Phase 1, then PRD Phase 1.5.

**Starting contract:** `docs/plans/cutdown-product-program-brief.md` (shaping brief, 2026-08-08).
**Audit:** `docs/progress/cutdown-product-program-codebase-review.md`.
**Baseline:** commit `501f212`; entry gate green (848 tests / 0 fail); `PIPELINE_IMPLEMENTATION_COMPLETE` earned, `PHASE_0_EXIT_EARNED` not earned.

**Contract documents (read before any stage):** `docs/video-editing/PRD.md`, `tech-spec.md`, `decisions.md` (D-1…D-55, append-only), `developer-guide.md`.

---

## 0. Roadmap reconciliation — read this first

The source assessment proposes "Stages 0–7". The PRD (§15) already defines Phases 0 / 1 / 1.5 / 2 / 3 / 4. **Two numbering schemes in one `docs/` tree is the exact single-source-of-truth failure the assessment's own finding #2 describes.** This plan therefore keeps stage numbers only as *internal work-package labels* and binds each to its governing PRD phase. **The PRD phase is the authority; the stage number is a filename.**

| Stage | Work package | Governing PRD phase | PRD exit criteria that apply |
|---|---|---|---|
| 0 | Make the evidence trustworthy | **Phase 0** (completion) | §15 Phase 0 row — 20 approved real outputs / 3 accounts / zero invalid ranges / last 10 no breaking change / rights + QA evidence |
| 1 | Quality measurement system | **Phase 0→1 bridge** | §14.2 performance gates; earns the Phase 0 row above |
| 2 | Local Review Studio | **Phase 1** | §14.1 latency + first-pass rows; REQ-110…116 |
| 3 | Editorial intelligence | **Phase 1** | §14.1 first-pass ≥50%, revisions ≤1, distinctness ≥90%, weak-footage ≥90%, style ≥80%, quote integrity 100% |
| 4 | Indexing + rendering upgrade | **Phase 1** | §14.1 technical publish-readiness ≥98%, caption readiness ≥98%; §14.3 index cache ≥95% |
| 5 | Complete social package | **Phase 1** | §15 Phase 1 scope rows (registry, OTIO, package generator) |
| 6 | Close the learning loop | **Phase 1 → Phase 4 preview** | §14.2 — non-inferiority, ≥90% attribution, ≥10% uplift after 30 comparable outputs |
| 7 | Harden for external users | **Phase 1.5** | §15 Phase 1.5 row — 100 consecutive jobs without manual repair; privacy/security review; no cross-workspace leakage |

**Consequence for the existing plan set:** `docs/plans/cutdown-master-plan.md` remains the record of PRD Phase 0 build (its Phases 1–6). It is **not** superseded and **not** renumbered. Stage 0 corrects its two falsified lines and adds a pointer to this plan. Nothing else in it is edited.

---

## 1. Requirement IDs

REQ-017 (remainder) · REQ-032 · REQ-035 · REQ-036 · REQ-051 · REQ-061 · REQ-062…067 · REQ-104 · REQ-105 · REQ-106 · REQ-107 · REQ-110…116 · REQ-120 · **REQ-140 and REQ-145 only** · REQ-150…157 · REQ-152 (remainder). Per-stage bindings in §7.

**Corrected after the round-1 plan gate:** the first draft bound **REQ-140…145** wholesale to Stage 6. REQ-141/142/143/144 are *publishing-connector* requirements, which §2 Non-Goal 1 explicitly excludes from this program. Only the analytics-side requirements are in scope; the connector requirements belong to PRD Phase 2.

**Not owned by any stage, and named here rather than left silent:** PRD §15's Phase 1 exit row also demands **≥60 published outputs**, **unit cost known**, and **≥3 repeat internal users**, and §14.3 demands **cost attribution coverage ≥99%** and p50/p95 unit cost by source minute / final minute / variant / platform. Five stages are governed by PRD Phase 1, and none of them carries these. They are operations and instrumentation obligations that must be assigned before PRD Phase 1 can be claimed complete — flagged for the requester, not silently absorbed.

**REQ-160 remains a standing non-goal** — satisfied by absence, never by a task.

## 2. Non-Goals (this program)

Carried verbatim from the brief:

- **Executing publishing.** No publishing connector before the editing experience and measurable quality are proven (PRD Phase 2).
- **Multi-tenant hosting ahead of proven quality.** Stage 7 is last, deliberately.
- **Any change to `src/`, `tests/`, `config/`, `docs/initial/`** — `tech-spec.md` §14, unchanged.
- **Fine-tuning models.** Provider-neutral adapters, recorded model versions.
- **Silent reversal of a settled decision.** D-1…D-55 is append-only. Stage 4 must *supersede* D-47 with a reasoned new decision, never ignore it.
- **A second roadmap.** See §0.

## 3. Critical Paths touched

| Critical Path | Touched? | Reviewer |
|---|---|---|
| Veto & verdict integrity (UGC) | No — `tech-spec.md` §14 | — |
| Boundaries & authority (UGC) | No — `tech-spec.md` §14 | — |
| Measurement discipline (UGC) | No — `tech-spec.md` §14 | — |
| Money & exploration (UGC) | No — `tech-spec.md` §14 | — |
| *(Plan gate)* | — | `plan-reviewer` (generalist, mandatory) |
| *(Per-stage code gate)* | — | `code-reviewer` |
| **Cutdown measurement honesty** (Stages **1, 2, 3, 4, 6**) | **Yes** | `cutdown-measurement-reviewer` — authored in Stage 0 **task 1** |
| **Cutdown tenancy & boundaries** (Stages **0, 2, 7**) | **Yes** | `cutdown-boundary-reviewer` — authored in Stage 0 **task 1** |

> **Stop Condition 3 is raised, not suppressed.** Rather than fabricate a substitute mid-program, **Stage 0 authors two cutdown reviewers and their rule-canon skills** (per `authoring-project-skills`) as its **first** task, so they gate Stage 0's own contract work.
>
> **Routing corrected after the round-1 plan gate.** The first draft routed measurement to Stages 1 and 6 only, and tenancy to Stage 7 only. Both were too narrow, and the table would have become the permanent gate configuration when Stage 0 task 2 copies it into `CLAUDE.md`:
> - **Measurement** also governs Stage 2 (C2/C3 are latency *percentiles*), Stage 3 (six rates including a blind panel where chance is 20% on five accounts) and Stage 4 (≥98% caption accuracy, ≥95% cache hit). Every one is a rate needing a denominator, a population and a period.
> - **Tenancy/boundaries** also governs Stage 0 (contract authority, immutability, the lineage model, supersession semantics — the riskiest change in the program) and Stage 2 (the studio source-of-truth fork, which `phase-2.md` already says that reviewer gates).

## 4. Decisions baked in

D-1…D-55 (append-only settled law). Load-bearing for sequencing:

- **D-33 (no CI)** — Stage 0 **supersedes**. Note the reach: tech-spec §12 pins the determinism proof to "the pinned local environment (D-33 — no CI exists at Phase 0)", and **D-39 and D-44** carry "revisit at Stage B, where CI replaces the pinned local machine" (**corrected in round 2** — an earlier draft claimed D-45 and D-46 did too; D-45's trigger is Temporal/better-sqlite3 and D-46's is a Node major bump. D-43 carries a Stage-B environment trigger worth checking). All are Stage 0 tasks; a bare `.yml` file is not the change, and the triggers are updated by **appending** a superseding decision, not by editing settled rows.
- **D-13 (`skills serve`: "optional stretch… never before Phase 0 exit metrics")** — Stage 0 **supersedes**, because Stage 2 needs the transport and §7 sequences Stage 2 before the Phase 0 data exit. **Added after the round-1 plan gate**, which found the first draft reversing D-13 by prose in a plan file — exactly the drift the append-only log exists to prevent.
- **D-47 (refuse `subject_reframe` / `split_screen`)** — Stage 4 **supersedes**. Until it does, both stay refused.
- **D-16 (Remotion)** carries an explicit owner escalation: *escalate before `npm install remotion` — the company license is an owner/legal commitment.* Stage 4 must escalate, not install.
- **D-8 (retention: delete nothing automatically; trigger = Stage B hosted design)** and **D-14 (golden sets in-repo; revisit if clone/CI degrades)** are triggered by Stage 7 and Stage 0/1 respectively, and are named in those stages.
- **D-21 (spend ceiling)** — still unset; gates Stage 1 live benchmarks and Stage 3 live model execution.
- **D-17 (no diarisation/forced alignment)** — Stage 4 revisits against its stated triggers.
- **D-24 (committed contract generators)**, **D-36 (stable account/source/contract evidence)**, **D-38 (implementation-complete ≠ Phase 0 exit)** — unchanged, and D-38's independent reporting is what Stage 0's counting-model work must preserve.

## 5. Dependencies (each with its proof-of-shipped artefact, or its blocker)

| Dependency | Needed by | Status |
|---|---|---|
| PRD Phase 0 pipeline end-to-end | all | **Shipped** — `docs/progress/cutdown-phase-6-review.md`, package `01KZ0A62WTAXFAYS9M1WK6PRKM` |
| Real-footage proving run | Stage 0 | **Shipped** — `cutdown/docs/proving-run-real.md`, package `01KZ8B40TENCWQ72F061FXK79S` |
| **D-21 spend ceiling (owner)** | Stage 1 live benchmarks, Stage 3 live models | ❌ **BLOCKED** — unset since Phase 3 |
| **≥3 real accounts + rights records (D-36)** | Stage 0/1 exit | ❌ **BLOCKED** — 1 of 3 accounts today |
| **20 approved real outputs** | Stage 0/1 exit | ❌ **BLOCKED** — 2 of 20 today |
| **Published outputs + platform analytics access** | Stage 6 | ❌ **BLOCKED** — no published outputs; consent question open |
| ADRs for PostgreSQL / object storage / Temporal | Stage 7 | ❌ **not written** — Stop Condition 4 would fire if Stage 7 were task-planned today |
| `DESIGN.md` + design direction | Stage 2 | ❌ **not written** — Stage 2 task |

> **Three of these are owner/operations inputs that no amount of engineering produces.** Stages 0, 1 and 6 each have an engineering exit and a *data* exit; the plan reports them separately, exactly as D-38 separates `PIPELINE_IMPLEMENTATION_COMPLETE` from `PHASE_0_EXIT_EARNED`. A stage whose code is done and whose data is absent is reported **as that**, never as green.

## 6. Deferral Ledger

| Deferred item | Receiving stage |
|---|---|
| `poor_crop` subject clipping (Phase 2 residual 1) | Stage 4 (subject/face tracks) |
| `render-v1` path patterns (Phase 5 residual 1, BREAKING) | **Stage 0** — bundled into the one deliberate contract bump |
| cutdown ruff selection widening (Phase 6 deviation 3) | **Stage 0** — with CI |
| `artefact-path-discipline` lint grep shape | Stage 7 review (tripwire by construction; kept) |
| Frame/clip embeddings + near-duplicate grouping (REQ-017 remainder) | Stage 4 |
| Hosted exposure, `publishing` state, Temporal (REQ-152 remainder) | Stage 7 |
| `skills serve` HTTP shim (D-13) | **Stage 2** — the Review Studio needs a transport; this is where the stretch becomes a requirement |
| Remotion adapter + determinism tiers 2–3 | Stage 4 |
| Publishing connectors, billing, multi-tenant workspaces | Out of program (PRD Phase 2+) |

**Every row names a receiving stage. No row says "later".**

## 7. Stage Plans

| Stage | Description | Depends on | Plan file | Detail level |
|---|---|---|---|---|
| 0 | Make the evidence trustworthy | none | `cutdown-product-program-phase-0.md` | **Full task-level** |
| 1 | Quality measurement system | 0 | `cutdown-product-program-phase-1.md` | **Full task-level** |
| 2 | Local Review Studio | 0 | `cutdown-product-program-phase-2.md` | Outline + gates |
| 3 | Editorial intelligence | 1, 2 | `cutdown-product-program-phase-3.md` | Outline + gates |
| 4 | Indexing + rendering upgrade | 1 | `cutdown-product-program-phase-4.md` | Outline + gates |
| 5 | Complete social package | 4 | `cutdown-product-program-phase-5.md` | Outline + gates |
| 6 | Close the learning loop | 1, 5 | `cutdown-product-program-phase-6.md` | Outline + gates |
| 7 | Harden for external users | 2, 6 | `cutdown-product-program-phase-7.md` | Outline + gates |

> **Why detail decays with distance.** Task-level plans for Stages 2–7 written today would be wrong on arrival and obeyed anyway, because a written table outranks a reader's judgment. Each outline stage carries a **re-planning trigger**: run `/create-plan` for that stage when its `Depends on` stages are proven complete on disk. Stages 0 and 1 are planned to task level because they start now.

> ### ⚠️ What "Depends on Stage 1" means — read before sequencing anything
>
> Stage 1 has **two exits** (§5, and `cutdown-product-program-phase-1.md`): an engineering exit (`MEASUREMENT_MACHINERY_COMPLETE`, in this repo's gift) and a data exit (`PHASE_0_EXIT_EARNED`, needing 18 more real outputs and 2 more accounts from the owner).
>
> **Every `Depends on: 1` in the table above means the *engineering* exit only.** Stages 3, 4 and 6 need the measurement *machinery* — contracts, cohorts, `evaluate` — not the accumulated *data*.
>
> Without this rule the program deadlocks: Stage 1's data exit is blocked on owner inputs that have been outstanding since Phase 3, so reading `Depends on: 1` as "both exits" would block Stages 3, 4, 5, 6 and 7 — the entire remaining program — behind an input no engineer can produce. Stage 6 is the sole exception, and only for its *own* exit gate: it cannot demonstrate non-inferiority without published outputs, which is a property of its exit criteria, not of its start condition.
>
> Practically: **Stage 2 and Stage 4 can proceed in parallel with the data accumulation**, and should. Stage 2 depends only on Stage 0.

## 7a. Stage 0 is split — 0A builds now, 0B is designed in code

Decided 2026-08-09 after the third plan-review round returned BLOCK for the third time, with each round's fixes introducing new defects.

**The findings are not evenly distributed.** Across three rounds, essentially all of them landed on the contract migration; the rest of Stage 0 attracted almost none. And the migration's defects share a character — family-reduction ordering, a `schemaVersion`↔filename binding nobody enforces, a git pathspec that matches nothing, tasks that cannot typecheck before codegen runs, a caller-authority rule that lives in a schema's `description` field. **Every one of those is found in minutes by a compiler or a test run, and has now survived three rounds of people reading prose.**

| | **Stage 0A — build now** | **Stage 0B — design in code** |
|---|---|---|
| Tasks | 1, 2, 15, 16, 17, 18, 19, 20, 21 | 3, 4(part), 5–14 |
| Content | the two cutdown reviewers; `CLAUDE.md` + tech-spec §14; multi-asset audio-event fix; CI; tech-spec §12 + revisit triggers; ruff widening; `doctor`; master-plan correction | `content-package-v2`, `render-v2`, `supersession-record-v1`, `outputLineage`, `outputId` identity, counting model, drift classification, version-dispatching reader |
| Risk | low — each is independently verifiable, and three review rounds found little | high — three rounds, three BLOCKs |
| Method | implement against the plan as written | **spike first**: write the failing tests and the type signatures, let the compiler and `validate:contracts` answer the questions prose kept getting wrong, then write the plan from what the code proved |

**0A delivers real value independently:** a genuine multi-asset projection defect fixed, CI standing up on a clean clone, `doctor`, a widened lint, the two missing reviewers, and the roadmap stopping saying something false about the real proving run. None of it depends on the migration.

**0B keeps its open questions**, which are now *design* inputs rather than plan defects: how a contract family holding two majors reduces; whether identity derives from `lineage.creativeBriefId` (which the settled T-1 supplies and `input.json`'s committed-artefact rule requires) rather than a caller input; what a v2 repackage of a v1 parent writes; and how T-1's derived supersession and task 6's supersession record arbitrate. **0B does not start until a spike answers these in code.**

### Stage summaries, acceptance gates and known risks

**Stage 0 — Make the evidence trustworthy** *(PRD Phase 0 completion)*
Correct the two falsified `cutdown-master-plan.md` lines; require ten qualifying outputs for contract stability; introduce `outputId`/`variantId` + parent/supersession lineage and a written counting policy; fix multi-asset audio-event projection by filtering on clip `assetId`; add CI (superseding D-33) and a one-command `doctor`; widen the ruff selection; author the two missing cutdown reviewers.
**Exit:** clean clone passes the complete suite in CI; `status --phase0` is semantically accurate against its own labels; docs and git agree; both reviewers exist. **Order-critical:** the contract bump lands *before* real-output accumulation resumes, or the accumulation invalidates itself.

**Stage 1 — Quality measurement system** *(Phase 0→1 bridge)*
`PerformanceObservation` and `Experiment` contracts; baseline cohorts; an `evaluate` skill; permissioned golden sets; blind human rubrics; live provider benchmarks under a cost/privacy ceiling.
**Exit (engineering):** every variant carries an objective, a changed variable and evaluation lineage; `evaluate` runs on the golden set. **Exit (data):** the real 20-output / 3-account gate. Reported separately. **Blocked on:** D-21, D-36.
**Risk:** the code can be complete with zero observations. The exit criterion requires data, not a working code path.

**Stage 2 — Local Review Studio** *(PRD Phase 1; REQ-110…116)*
Browser upload, rights intake, brief builder, progress, variant grid, frame-accurate player with platform overlays, caption correction, crop anchors, locks/bans/replacements, timecoded notes, revision diff, approval.
**Exit:** a producer completes upload→package with **no terminal access**; first draft ≤20 min after indexing; package p50 <45 min (§14.1).
**Risk — the largest in the program:** cutdown has *no* HTTP layer and *no* frontend (verified: zero matches for express/fastify/react across every `package.json`). This is a new product surface, not a view over an existing one. `DESIGN.md` and the D-13 `skills serve` transport are tasks, not assumptions. **The studio must never become a second source of truth** — its only writes are artefacts the skills already define.

**Stage 3 — Editorial intelligence** *(PRD Phase 1)*
Hook Lab (REQ-032); versioned contextual rules (REQ-035); alternative moments; live model execution; weak-footage narrowing (REQ-036); semantic distinctness; style onboarding; learned preferences with per-field confidence and provenance (REQ-061); anti-homogenisation.
**Exit:** first-pass ≥50%; revisions ≤1; distinctness ≥90%; weak-footage honesty ≥90%; style fidelity ≥80% (blind 5+ account panel); quote integrity 100%.
**Risk:** learned tendencies must stay schema-distinct from invariants — `style-profile-v1` was deliberately built so a preference cannot be silently promoted to an invariant. Preserve that. **Blocked on:** D-21 for live models.

**Stage 4 — Indexing + rendering upgrade** *(PRD Phase 1)*
Selective/deduplicated OCR (the ~95%-of-3-hours cost); diarisation + forced alignment (D-17 triggers); subject/product/crop tracks; visual embeddings + near-duplicate (REQ-017); mixed silent/audio timelines; dialogue cleanup and ducking; licensed + native music modes; animated captions; reframe; crossfade; split-screen; motion graphics; colour/HDR; clean masters.
**Exit:** technical QA first-pass ≥98%; caption accuracy ≥98%; no routine waiver reliance; indexing latency budget met per worker class; index cache hit ≥95%.
**Risk:** Tier-1 byte-identical determinism is proven on FFmpeg 8.0.1 and is easy to destroy — every new filter path needs its determinism test in the **same** phase. Requires a decision superseding **D-47**.

**Stage 5 — Complete the social package** *(PRD Phase 1)*
Effective-dated TikTok/Reels/Shorts capability registry replacing the single fixture (REQ-051); child EDLs per platform; overlay simulation; covers, post copy, hashtags, alt text, first comment, native-audio checklist; OTIO export.
**Exit:** each requested platform receives a complete, validated, independently reviewable package.
**Risk:** `content-package-v1` grows substantially — sequence its bump against Stage 0's counting policy so exit criterion 3 isn't reset twice.

**Stage 6 — Close the learning loop** *(PRD Phase 1 → Phase 4 preview)*
CSV/manual analytics import first, then authorised connectors; account-normalised scorecards; hook/angle/package experiments; account-style learning proposals requiring human ratification.
**Exit:** non-inferior to account baselines; ≥90% experiment attribution; target ≥10% median uplift after ≥30 comparable published outputs.
**Risk:** this is where a video tool starts making statistical claims. Needs the Stage 0 measurement reviewer. An observation that never arrives must never become a zero. **Blocked on:** published outputs + analytics consent.

**Stage 7 — Harden for external users** *(PRD Phase 1.5)*
Temporal; PostgreSQL; object storage; auth/RBAC; tenant isolation; encryption; deletion/retention; observability; metering; support tooling.
**Exit:** 100 consecutive jobs recover without manual state repair; privacy/security review complete; no cross-workspace leakage.
**Risk:** three new core dependencies, each requiring a decision record before task planning (**Stop Condition 4**). Do not task-plan this stage until those ADRs exist.

## 8. Derived Budgets

| Number | Provenance |
|---|---|
| 20 outputs / 3 accounts / last 10 / zero invalid ranges | PRD §15 Phase 0 row |
| ≤20 min p50 to first draft; <45 min p50 to package | PRD §14.1 |
| ≥50% first-pass; ≤1 revision; ≥80% style; ≥90% distinctness; ≥90% weak-footage; 100% quote integrity | PRD §14.1 |
| ≥98% technical publish-readiness; ≥98% caption accuracy | PRD §14.1 |
| ≥95% index cache hit; 100% recoverable jobs; <2% render failure | PRD §14.3 |
| Non-inferiority; ≥10% uplift after ≥30 comparable outputs; ≥90% attribution | PRD §14.2 |
| 100 consecutive jobs; no cross-workspace leakage | PRD §15 Phase 1.5 row |
| **10** qualifying outputs for the contract-stability window | PRD §15 Phase 0 row ("last 10"), which the current `>= 2` implementation contradicts |

**Every number is cited. None is invented here.**

## 9. Risk Assessment

Seeded from the brief's pre-mortem, plus the codebase review:

1. **The roadmap forks.** → §0 mapping table; stage numbers are filenames, PRD phases are authority.
2. **Stages 1/6 planned as engineering, unbuildable as engineering.** → owner inputs are named blocking dependencies (§5); each has a separate engineering exit and data exit.
3. **Stage 2 is a new product surface, not a view.** → `DESIGN.md` + transport are tasks; thin-slice exit criterion; no second source of truth.
4. **The contract-stability clock resets itself.** → Stage 0 bundles every known breaking bump into **one** deliberate change, landed before accumulation resumes. **This is a rule, not an intention** (round-1 gate finding): after Stage 0, every later contract change to `content-package` is **additive-only / minor**, or it waits until the criterion-3 window is empty. Stage 1 task 11 and Stage 5 are both bound by it — without the rule, two later stages could each reset a clock the program claims resets once.
5. **Determinism regression in Stage 4.** → determinism test in the same phase as every new filter path.
6. **A settled decision reversed silently.** → D-47/D-33 supersession is an explicit task with a written rationale.
7. **The gate set is too thin for Stages 1/6/7.** → two cutdown reviewers authored in Stage 0, required before Stage 1 ships.
8. **Detail rot in far stages.** → deliberate decay + per-stage re-planning triggers.

## 10. Progress Tracking

| Stage | Status | Evidence |
|---|---|---|
| **0A** | **Complete (Ready — Almost, 4 residuals)** | `docs/progress/cutdown-product-program-stage-0a-review.md`. Tasks 1, 2, 15, 16, 17, 18, 19, 20, 21. Entry gate green: **901 TS pass / 0 fail / 5 skipped**, **689 Python**, `build:contracts --check` PASS, `validate:contracts` PASS (42 cases / 0 disagreements), `skills sync --check` PASS (10 skills), `doctor` 7/7, ruff clean under the widened selection. Reviewer gate: **three** reviewers — `code-reviewer` **BLOCK** round 1 (`doctor` printed a green OK for a tool it had just failed to execute; demonstrated, not argued), then `cutdown-boundary-reviewer` **NEEDS CHANGES · B** and `cutdown-measurement-reviewer` **NEEDS CHANGES · C**, both running on the diff that created them. All findings applied; **two of the round-2 findings were defects the round-1 fixes introduced** (the append broke the decisions table; the ruff `exclude` replaced rather than extended ruff's defaults, so the clean run was carried by `.gitignore` — 238,569 findings without it). **D-57** (CI supersedes D-33) and **D-58** (ruff widening) appended; **D-56 reserved** for 0B. **No contract schema touched**; no milestone changed. **A7 not met and not claimed** — the branch is unpushed (T-13), so CI has never executed |
| **0B-1 + 0B-2** | **Complete (Ready — Almost, 6 residuals)** | `docs/progress/cutdown-product-program-stage-0b-review.md`. Entry gate: **974 TS tests = 969 pass / 5 skipped / 0 fail** across five consecutive identical runs (baseline 906 = 901 + 5), **689 Python** unchanged, `validate:contracts` 42 cases / 0 disagreements, `skills sync --check` 10 skills, `doctor` 7/7, ruff clean. **No schema file and no generated file touched** — 54-file pathspec checked for vacuity, `git diff --exit-code 276176e` clean. **`status --phase0` moved from 2/20 with criterion 3 GREEN to 1/20 with criterion 3 UNPROVEN** — both corrections, and the milestone is now further from green, which is the intended direction. Contract drift is classified by **family** (D-61), so a §3-compliant major bump can no longer classify `added`; identity is **derived** from `lineage.creativeBriefId` (D-56), so no schema field, no `outputId`, no supersession artefact and no cross-job addressing were needed. Reviewer gate: `code-reviewer` **BLOCK** (criterion 3's drift walk had holes — F-A through a *fourth* door, demonstrated on a 13-package corpus, and already asserted as fixed in a comment and in the reviewer canon), both Cutdown reviewers **NEEDS CHANGES**. All applied |
| **0B-3** | **Not started — the migration** | `content-package-v2` / `render-v2`, re-planned when triggered. Its first task is the order-critical constraint; the threshold is **before criterion 3's window holds more than three resolved real outputs** |
| ~~0B~~ | ~~Spiked and re-planned~~ — **split into 0B-1 / 0B-2 (done) and 0B-3** | **The §7a method ran.** Spike record: `docs/progress/cutdown-product-program-stage-0b-spike.md` (findings F-A…F-Q, each MEASURED / READ / DESIGN; three probe schemas created, generated into temp dirs, deleted; tree verified restored). **All five open questions answered by execution, and two dissolved** — F-J/F-K show T-1 is computable from `lineage.creativeBriefId`, which every delivered package already carries, so output identity needs no stored field, no `outputId`, no `outputLineage`, no `supersession-record-v1`, and no v2 schema. **Nine of the twelve old tasks (3–14) retired or deferred on measured evidence.** New plan: `docs/plans/cutdown-product-program-phase-0b.md`, split into **0B-1** (contract-family drift integrity), **0B-2** (the honest count) — neither touches a schema file — and **0B-3** (the migration, re-planned later). Plan gate: **2 rounds, both BLOCK, all findings applied** (rev 3). Round 2 also corrected **four false claims in the spike document itself**, in place. See the Plan Review Log |
| 0 | ~~Planned~~ — **split, see 0A / 0B above** | this plan §7a + `cutdown-product-program-phase-0.md` |
| 1 | **Planned** | `cutdown-product-program-phase-1.md` |
| 2 | Outlined — re-plan when 0 complete | — |
| 3 | Outlined — re-plan when 1, 2 complete | — |
| 4 | Outlined — re-plan when 1 complete | — |
| 5 | Outlined — re-plan when 4 complete | — |
| 6 | Outlined — re-plan when 1, 5 complete | — |
| 7 | Outlined — re-plan when 2, 6 complete **and** the three ADRs exist | — |

## 11. Plan Review Log

| Date | Reviewer | Verdict | Notes |
|---|---|---|---|
| 2026-08-08 | Step 5.5 mechanical consistency audit (self) | **PASS** | Coverage parity (8 stages / 8 plan files); task↔file closure verified for Stages 0 and 1; every Owner agent exists (`general-purpose`); every `Depends on` names only lower-numbered stages and matches the master table; deferral ledger fully closed (every row names a receiving stage); handoff contracts pinned Stage 0→1; every budget cited to a PRD section. **Two defects found and fixed in this pass:** (1) the finding-1a diagnosis was imprecise — `CONTRACT_WINDOW` is already 10 and only the `met` predicate is wrong; (2) `Depends on: 1` was ambiguous between Stage 1's two exits and, read as "both", would have deadlocked Stages 3–7 behind an owner input outstanding since Phase 3. A third gap was added to Stage 2 (nothing currently measures the latency its exit criteria assert). |
| 2026-08-08 | Measurement-honesty reviewer, round 1 (`general-purpose` **fallback** — `cutdown-measurement-reviewer` does not exist yet; authoring it is Stage 0 task 1) | **NEEDS CHANGES** | 23 findings. Core: the rules lived in prose while the *artefacts* that make them structural were missing — no scorecard contract (M1), "comparable output" declared defined and defined nowhere (M2), minimum n never bound to PRD §14.2's 30 (M3, the same defect class as `status.ts`'s `window.length >= 2`), no publication record so survivorship was unrepresentable (M4), baseline could include the system's own outputs (M5), provenance modelled as a union arm that sheds its label at first type-narrowing (M10), one `denominator` field unable to support correct aggregation (M8), no pre-registration (M11), no holdout despite the rule being pinned (M15), PRD §13.4 reporting unbound (M18). Verdict accepted; all 8 required changes applied to `phase-1.md` rev 2 and the §3 routing table. |
| 2026-08-08 | Boundaries/tenancy reviewer, round 1 (`general-purpose` **fallback** — `cutdown-boundary-reviewer` does not exist yet) | **BLOCK** | 26 findings, 5 on Stage 0's critical path. **I verified each load-bearing claim against the code before accepting it, and every one held.** (a) Round 1 said "Modified" for `content-package-v1.json`, but tech-spec §3 states a semantic change "adds a new file — it never mutates a published schema in place" (F9). (b) `lineage` is **already** a required `PackageLineage` field holding artefact ancestry incl. `approvedDraftManifestId`; the plan would have overwritten the delivered-cut evidence chain (F10). (c) `loadAllPackages` validates against one hard-coded `$id` and criterion 4 requires `unreadable.length === 0` (`status.ts:365`), so the bump would have made both delivered packages permanently unreadable — criterion 4 red forever, remedy a repackage that adds no output: fail-closed with no way forward, the project's own 2026-07-30 lesson recurring (F13). (d) A3 cited a fixture as evidence for a supersession **cycle**, which per-document JSON Schema cannot see (F14). (e) `orphanMirrors` (`skills-sync.ts:464`) would have failed `skills sync --check` on the two new skills written under the `cutdown-` prefix. Plus: D-13 reversed by prose rather than superseded (F6); D-33's supersession not carrying tech-spec §12 and the D-39/44/45/46 revisit triggers (F7); no `outputId` assignment mechanism, so every rerender would mint a new output (F16); the routing table stale against its own phase files (F22); REQ-141…144 (publishing connectors) bound to Stage 6 against the program's own Non-Goal (F25). Verdict accepted; `phase-0.md` rewritten as rev 2, `phase-1/2/6/7.md` and the master plan amended. |
| 2026-08-08 | Measurement-honesty reviewer, round 2 | **NEEDS CHANGES** | Round-1 artefact gap largely closed (scorecard contract, sibling provenance, denominator counts, publication record, pre-registration fields, comparability owned in the authoritative doc set, 19 criteria replacing prose). What was **not** closed is the *join* between artefacts and rules, and **the rewrite introduced a new defect of the same class that BLOCKed the sibling plan one round earlier**: B3's "structural, not suppressed" uplift refusal was assigned to a JSON-Schema fixture, but tech-spec §3's style subset forbids `if/then/else` and allows only `const`-discriminated unions, so "uplift absent when n<30" is inexpressible and would bind to a self-declared status field. Also: no baseline-side minimum n (round 1's "baseline of two" scenario survived intact); `n` had no unit, so 3 outputs × 10 metrics reaches "30"; PRD §14.2's "across multiple accounts" dropped; pre-registration timestamps with nothing comparing them; three of five comparability axes neither enforced nor representable; the tier field with no derivation. **Fixes applied** — enforcement owner moved to `packages/evaluation`, fixture list corrected, `accountId`/`platform`/`objective` added to the observation contract, and B20–B27 added. |
| 2026-08-08 | Boundaries/tenancy reviewer, round 2 | **BLOCK** | F10, F6, F22, F24 and the skills-sync orphan cleanly **RESOLVED**; F9, F13, F15/F16 **PARTIAL**. **Three of the round-1 fixes introduced their own defects** — this project's documented signature failure. The severe one (**N0**, verified against `contract-set.ts:99`): obeying tech-spec §3 by adding `content-package-v2.json` as a *new file* gives it a *new `$id`*, and `diffContractSets` keys by `schemaId`, so the drift classifies as **`added`** — which `status.ts:341` says "neither resets the ten-output clock". **Ten outputs spanning the bump would report criterion 3 GREEN across the largest breaking contract change in the program**, and rev 2's A13 would have locked the contradiction in as a test asserting behaviour the code lacks. Also **N1**, verified on disk: the plan mis-stated its own evidence base — there are **three** delivered packages and **two are real**, both from the same job and creative brief, which is precisely the ambiguity task 3 must settle. Plus: task 7 vs task 11 contradicting on the same constant; the lineage validator with no caller; the supersession record with no writer, location or reader; `outputId` assignment with no discriminator; D-45/D-46 revisit triggers mis-stated; the scope boundary excluding the files tasks 1–2 must write. **Fixes applied** — new task 12b (drift classification by schema family), evidence base corrected, tasks 6/7/7b/8/12/13/18 rewritten, A12–A15 rewritten. |
| 2026-08-09 | Boundaries/tenancy reviewer, round 3 | **BLOCK** | 14 findings. N1/N4a/N4b/N5/N8/N9 **RESOLVED**; N0/N2/N3/N6/N7 **PARTIAL or UNRESOLVED**, and **most new findings are again defects introduced by round 2's fixes**. Two verified by execution: **F4** — A12's anti-vacuity fix is itself vacuous (`git diff --exit-code 501f212 -- … render-v1.json` exits 0 because the bare pathspec matches nothing); **F5** — task 8 mandates a caller-supplied `outputId` discriminator, while `skills/package/schema/input.json` states in its own description that *"a caller-supplied evidence field is a caller-supplied claim"*, making the number criterion 1 counts by an operator assertion. Plus **F1/F3** — task 12b's family-keying fix admits a first-wins implementation that reproduces N0 exactly while passing every test 12b demands, and nothing binds a filename's `-vN` to the file's `schemaVersion`; **F12** — tasks 6/7/8 cannot typecheck before task 9 regenerates the trees. |
| 2026-08-09 | Measurement reviewer, round 3 | **NEEDS CHANGES** | N4/N7/N9 **RESOLVED**; N1/N3/N5/N6 **PARTIAL**; N8/N10 **UNRESOLVED**. Sharpest: **NEW-1** — moving threshold enforcement into code closed the schema hole and opened a sole-emitter hole, with no guarantee `packages/evaluation` is the only construction site; **NEW-2** — the plan now simultaneously requires cohorts to be single-account (B24) and "across multiple accounts" (checklist), making the gate unreachable by construction and colliding with open owner decision T-9; **NEW-3** — the settled T-1 supersession decision appears nowhere in Stage 1, so two packages of one CreativeBrief can enter a cohort as two correlated samples; **NEW-5** — `performance-observation-v1` as a flat closed object cannot express "absent has no numerator" under §3, so it must either write the zero its own law forbids or drop the denominator rule. Eight criteria (B20–B27) were added without touching the Implementation Tasks table, so four have no owning task. |
| 2026-08-10 | Stage 0A **build** gate: `code-reviewer`, then `cutdown-boundary-reviewer` + `cutdown-measurement-reviewer` (the two this stage authored, run via the `general-purpose` fallback — the agent registry is snapshotted at session start) | **BLOCK**, then **NEEDS CHANGES** ×2 | The split paid off exactly as §7a predicted: **zero** findings on contract ground, because 0A touches none. The BLOCK was a real defect in the new code and was *demonstrated* — `cutdown doctor` printing a green `OK` for a `uv`/`pnpm` present on PATH but unrunnable, surviving because no test called either check. Round 2's sharpest two findings were introduced by round 1's fixes, on schedule for this project: the append that broke the decisions table, and a ruff `exclude` that replaced ruff's built-in defaults so the clean run was carried by `.gitignore` (238,569 findings without it). Also: three tests reporting PASS having asserted nothing, two of them the positive controls for the BLOCK fix. All applied; a new rule **R9** added to `cd-measurement-honesty` because the check that found most findings had no rule behind it. Record: `docs/progress/cutdown-product-program-stage-0a-review.md` |
| 2026-08-10 | **Stage 0B spike (§7a method), then plan gate rounds 1 and 2**: `cutdown-boundary-reviewer` + `cutdown-measurement-reviewer`, both **native for the first time** | **BLOCK** ×2, then **BLOCK** ×2 | **The method worked, and it worked in both directions.** The spike answered all five open questions by execution and **dissolved two of them**: every delivered package already carries a required `lineage.creativeBriefId`, so identity derives rather than being stored — retiring `supersession-record-v1` (with its writer, reader and the cross-job addressing model that "has none today"), the `outputId` discriminator that contradicted `input.json`'s own description, and the cross-package lineage validator. It also measured what prose had guessed: the codegen blast radius is 2 modified files + 2 per schema, one of them the *unrelated* `style_profile_v1.py` (datamodel-codegen renumbers colliding class names globally); the highest-risk unknown — a second `ContentPackage` title breaking `getattr(module, title)` — cost one throwaway run to retire. **Then the gates earned their keep twice.** Round 1: the plan had marked old task 13 "KEPT" and dropped the `window.length >= 2`-under-a-label-of-ten fix *that is the whole reason this Critical Path exists*, while citing the defective predicate approvingly; and the derived resolver silently grouped across jobs and accounts, on the one criterion the stage exists to make honest. Round 2, after those fixes: **all three new BLOCKs were the same shape — a round-1 fix that named one site and left its sibling.** "The single wrong token" was two (`status.ts:350` *and* `:352`, so the fixed predicate would still print "no schema major version moved"); narrowing criterion 3's window to *survivors* resurrected the original defect through a second door (bump, then repackage everything, and the bump vanishes); and the key partitioned on classification but not on evidence completeness. Both reviewers independently caught that the new decision had taken **D-59**, a number `phase-0.md:120` was already holding. **Round 2 also falsified four claims in the spike document itself** — `.met` has three consumers not one (and the third would have rendered `unproven` as `[x]`, the exact inversion the finding exists to prevent); the generated tree does contain numeric-suffixed classes; 0 of 20 enums carry a `-vN` suffix; and `status.test.ts:355` is not the anti-vacuity control it was named as. All corrected in place, with their measurements. Rev 3 applied |
| 2026-08-09 | **Method change — Stage 0 split into 0A and 0B** | — | Three rounds, three BLOCKs, and in every round the fixes introduced new defects. The findings cluster almost entirely in one place: the contract migration (v2 files, lineage, supersession, counting, drift classification). Those defects — family-reduction order, `schemaVersion`↔filename binding, a vacuous pathspec, codegen ordering, a caller-authority rule living in a schema description — are all things a compiler and a test runner surface in minutes and that prose review has now missed for three rounds. **Prose is the wrong medium for this particular work.** The remaining Stage 0 tasks attracted almost no findings across three rounds. See §7a. |

## 12. Exit Demonstration

The program is complete when the PRD §15 **Phase 1.5** exit row is met: 100 consecutive jobs complete or recover without manual state repair; p50/p95 latency and cost stable; privacy and security review completed; no cross-workspace data leakage — with the Phase 0 and Phase 1 exit rows already green beneath it.

**Reported independently, always** (the D-38 discipline extended): engineering completion and data/evidence completion are separate claims. A stage whose code is finished and whose evidence is absent is reported as exactly that.
