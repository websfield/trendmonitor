# Plan review — cutdown

**Readiness: READY FOR IMPLEMENTATION · Grade: A- · Round 3: the 16 findings from the Codex engineering re-review are resolved directly in the authoritative contracts and phase plans. `PHASE_0_EXIT_EARNED` still depends on real operational evidence and is not claimed.**

Reviewed (round 2, 2026-07-21): `docs/plans/cutdown-master-plan.md`, `cutdown-phase-1.md` … `cutdown-phase-6.md`, `docs/progress/cutdown-codebase-review.md`, against the **edited** `docs/video-editing/{tech-spec,decisions,developer-guide,PRD}.md` (tech-spec §7/§15 gained `brief` + sidecar rights; decisions.md gained D-33 no-CI and D-34 final-tier). No Critical-Path reviewers apply (master-plan table all-No per tech-spec §14 — still correct); this is the sole, generalist review.

---

## Round 1 (2026-07-21) — historical record, verdict NOT READY

### Round-1 findings list (F1–F18, kept in summary form)

- **F1 · HIGH** — No task anywhere created or submitted a JobBrief instance; `cutdown propose test-1` had no producer for its input.
- **F2 · MEDIUM** — Rights-record capture mechanism undefined (interactive prompting contradicted the non-interactive execution contract).
- **F3 · MEDIUM** — CI referenced as determinism/codegen proof, but the repo has no CI and no phase created one.
- **F4 · MEDIUM** — Phase 6's placeholder e2e would be refused by Phase 5's fail-closed rights gate (no rights records for golden-set clips).
- **F5 · MEDIUM** — Exit criterion 2 says "final renders"; Phase 0 only made drafts.
- **F6 · MEDIUM** — No account attribution field for the "across 3 accounts" criterion.
- **F7 · MEDIUM** — REQ-104 in-scope per codebase review, owned by no phase.
- **F8 · MEDIUM** — Embedding call path unpinned across TS/Python.
- **F9 · MEDIUM** — REQ-002/020/032/035/102/160–166 in neither a checklist nor the deferral ledger.
- **F10 · LOW** — Source-bounds check implemented twice in two languages with no equivalence rule.
- **F11 · LOW** — Phase 1 acceptance ("no file outside cutdown/") contradicted decisions.md appends.
- **F12 · LOW** — Unresolved self-correction left in phase-5 verification text.
- **F13 · LOW** — Job-fixture naming mismatch (clean vs ugly as test-1).
- **F14 · LOW** — `packages/platform-registry/` in files-to-create, never created, foreclosed by D-3.
- **F15 · LOW** — Capability fixture referenced a Phase-4 overlay + uncomputable `account_capability_lookup` duration.
- **F16 · LOW** — Silent test media needed by Phases 2–3, never provisioned.
- **F17 · LOW** — Phase 0 handling of the `final-rendering` runner state unstated.
- **F18 · LOW (info)** — `better-sqlite3` prebuild risk on Node 22 + Windows.

Round-1 verdict: **NOT READY** (grade D), with an ordered fix list F1, F3, F4, F5+F6, F7+F9, F2+F8, F10–F17.

---

## Round 2 (2026-07-21) — re-review of the edited plan set

### F1–F18 resolution table

| # | Status | Evidence (file · section) |
|---|---|---|
| F1 | **RESOLVED** | `brief` skill: phase-1 task 7 + verification 4 (`cutdown brief test-1 --file ...`); tech-spec §7 `brief` row + §15 steps 1–2 *Done when* ("a brief validates and lands in `brief/`"); REQ-002 in phase-1 functional checklist; phase-3 verification 3's propose now has a producer |
| F2 | **RESOLVED** | Phase-1 REQ-003 row + task 8 (sidecar `<source>.rights.yaml` or `--rights` flag, never interactive; absent = `rights: unknown`); tech-spec §7 `ingest` row carries the identical mechanics; phase-1 verification 6 tests the no-sidecar path |
| F3 | **RESOLVED** | decisions.md **D-33** (no CI at Phase 0; pinned local environment); phase-4 task 10 + verification 3 reworded to "pinned local environment (D-33)"; phase-1 codegen proof cell reworded ("local run, no CI — D-33"). Residual wording in tech-spec §12/§15 tracked as R2-3 below |
| F4 | **RESOLVED** | Phase-1 task 10: all 3 golden-set clips checked in **with completed `.rights.yaml` sidecars** (CC0/self-owned, evidence noted); phase-6 task 1 states the sidecars make the rights gate pass; `status --phase0` still raises the placeholder flag (phase-5 task 5, D-27) |
| F5 | **RESOLVED** | decisions.md **D-34** (final tier in scope); phase-4 task 7 (both tiers, criterion-2 range validation binds to final); phase-5 task 1 (package carries final-tier master) + task 5 (criterion 2 computed over final-tier renders); codebase review in-scope list updated |
| F6 | **RESOLVED** | `account` field pinned in `job-brief-v1` (phase-1 task 2, named as the grouping field); phase-5 task 5 groups approvals by it; tech-spec §7 `brief` row says "incl. `account`"; phase-1 verification 4 tests the missing-`account` failure |
| F7 | **RESOLVED** | REQ-104 *Phase 0 subset* in phase-4 functional checklist (caption file always emitted; ruleset readability; non-speech cues flagged from Phase-2 audio events); codebase review in-scope list names it |
| F8 | **PARTIALLY RESOLVED** | Moment-side fully pinned: phase-2 task 9 computes per-Moment embeddings in the Python indexer (bge-small, D-22), stored on the artefact with model ID; phase-2 handoff + phase-3 task 4 (pure-TS cosine over stored vectors). **Residual (R2-1):** the query-side embedding — how the JobBrief text becomes a vector for the cosine ranking — is still unstated |
| F9 | **PARTIALLY RESOLVED** | Master-plan Deferral Ledger now enumerates REQ-020/032/035/161/162/165/166 with receiving rows; REQ-160 as a standing non-goal; REQ-002 in phase 1; REQ-104 in phase 4; ledger matches codebase-review deferral list 1:1. **Residual (R2-6):** REQ-102 is named in-scope (codebase review, as the advisory-critic subset of REQ-038) but no phase checklist row repeats the ID |
| F10 | **RESOLVED** | Phase-2 task 10: `range-check.ts` is the single implementation; `test_bounds.py` drives it **through the CLI** against a shared fixture corpus; phase-3 `validate` and phase-4 preflight both reuse it (handoffs pinned) |
| F11 | **RESOLVED** | Phase-1 acceptance now: "No file outside `cutdown/` and `docs/`… (`docs/` only for `decisions.md` appends and plan progress notes)"; phase-5 owns `.claude/skills/cutdown-*` explicitly |
| F12 | **RESOLVED** | Phase-5 verification 5 reads "(requires task 4's sync; independent of verification steps 2–4)" — self-correction removed, real precondition stated |
| F13 | **RESOLVED** | clean.mp4 = test-1, ugly.mp4 = test-2, consistent across phase-1 verification 5 and phase-2 verifications 2/4 |
| F14 | **RESOLVED** | Codebase-review files-to-create moves `packages/platform-registry` to the deferred list with the D-3 rationale; master-plan ledger carries the row |
| F15 | **RESOLVED** | Phase-3 task 6 pins two offline substitutions: `duration: {minSeconds: 5, maxSeconds: 180}` replaces `account_capability_lookup`; `safeZoneAsset` declared but consumed only by Phase 4's QA (Phase 3 `validate` ignores it); phase-4 edge case covers "overlay absent = check skipped, reported, never silent" (see R2-9 for a provenance nit on 5/180) |
| F16 | **RESOLVED** | Phase-1 task 10 adds `broll-silent.mp4` (feeds phase-2 silent edge case + phase-3 weak-footage fixture) (see R2-7 for a minor ingest-step nit) |
| F17 | **RESOLVED** | Superseded by D-34's stronger answer: `final-rendering` is now *used*, not skipped — phase-5 task 2 wires `review → final-rendering → packaging` (approval on draft triggers final render); phase-4 handoff names that wiring as Phase 5's; phase-3 task 9 keeps only `publishing` present-but-unused, matching tech-spec §8 |
| F18 | **RESOLVED** | Phase-3 task 9: if the better-sqlite3 prebuild fails on Node 22/Windows, fall back to `node:sqlite` + append the swap to `decisions.md` |

**Tally: 16 RESOLVED, 2 PARTIALLY RESOLVED (F8, F9) — both residuals are one-line edits, neither meets a gating condition (reasoning under Verdict).**

### Execution re-simulation (round 2)

- ✅ Phase 1 — 10/10 tasks executable; the new task 7 (`brief` skill) and task 10 (3 clips + rights sidecars) have paths, schemas, and verification steps; renumbering is internally consistent (verification steps reference each other, not old task numbers; acceptance cites tech-spec §15 step 2, which now includes brief intake).
- ✅ Phase 2 — 12/12 executable; task 9's embedding addition and task 10's single range-check are fully specified with paths and fixtures.
- ✅ Phase 3 — 10/10 executable; verification 3's propose now has its brief authored in phase-1 verification 4; the fixture's offline pins make `validate` computable. One interpretation left to the implementer (R2-1, query embedding) — executable via the escalation/decisions protocol the plan itself pins.
- ✅ Phase 4 — 10/10 executable; the determinism proof is now local + pinned (D-33); both tiers specified in task 7 with the same adapter.
- ✅ Phase 5 — 6/6 executable; task 2's `review → final-rendering → packaging` wiring is concrete; `status --phase0` now names all four data sources (account field, final-tier range validations, changelogs, package manifests).
- ✅ Phase 6 — 7/7 executable; the placeholder e2e passes the rights gate (phase-1 sidecars); the chain brief → ingest → index → propose → plan → validate → draft render → QA → approve → final render → package resolves stage-by-stage against phases 1–5.

### Pre-mortem (round 2 — previous ❌ items and new failure shapes from the fixes)

- ✅ JobBrief intake invented mid-build (R1 ❌) — absorbed: phase-1 task 7 + tech-spec §7 `brief` row.
- ✅ Placeholder e2e refused by the rights gate (R1 ❌) — absorbed: phase-1 task 10 sidecars.
- ✅ `status --phase0` cannot compute criteria 1/2 (R1 ❌) — absorbed: `account` field + D-34 final tier + phase-5 task 5.
- ✅ Final render fails QA *after* approval (new shape introduced by D-34) — absorbed: phase-4 task 7 runs QA on both tiers; phase-5 task 1's package gate refuses on missing/failed QA.
- ✅ Final render killed mid-encode — absorbed: phase-4 atomic-output edge case + §6.2 idempotency.
- ✅ Reviewed draft diverges from delivered final (proxy vs original source) — largely absorbed: same EDL/manifest lineage, QA on both tiers, provenance block in the package; residual risk is perceptual, not structural (info only).
- ✅ better-sqlite3 prebuild failure — absorbed: phase-3 task 9 fallback.
- ✅ All round-1 ✅ rows re-checked and still hold (toolchain, spend ceiling, D-27, kill-resume, offline models, D-32, SQLite rebuild, contract churn).

### Mechanical consistency (round 2 re-verification)

- Master-plan Deferral Ledger vs codebase-review deferral list: **1:1 match** (including the 020/032/035/161–166 additions, REQ-160 non-goal, platform-registry row).
- Requirement parity: every in-scope ID from the codebase review has an owning checklist row **except REQ-102** (R2-6 — annotated in the review as the advisory-critic subset of REQ-038, which phase-3 task 7 owns; the work has an owner, the ID label does not).
- Handoffs: 1→2, 2→3 (now incl. per-Moment vectors + model ID and the exported range-check), 3→4, 4→5 (now incl. final-tier layout + the runner wiring explicitly assigned to Phase 5), 5→6 — all pinned and cited by the consuming phase.
- Number provenance: all round-1 provenance holds; new numbers — D-33/D-34 cited where used; the phase-3 duration pin `{5, 180}` is the one uncited pair (R2-9).
- Verifiability: all acceptance criteria remain PASS/FAIL with evidence pointers; the three formerly CI-dependent proofs now name local, pinned evidence.
- Agent roster: `code-reviewer`, `plan-reviewer` exist in `.claude/agents/`; owner `general-purpose` is built-in. Clean.

### New findings (round 2) — none gating

**R2-1 · LOW-MEDIUM · confidence Medium — Query-side embedding path unpinned (residual of F8).**
Phase-2 task 9 stores per-Moment vectors; phase-3 task 4 ranks them by cosine "pure TS, no Python call at retrieval time" — but the JobBrief text must itself become a vector in the same bge-small space, and no task says how (Python `embed.py` invoked by `propose` before the ranking step? brief embedded at index time?). Executable — the natural reading is a one-shot `embed.py` subprocess call from the `propose` skill prior to retrieval, logged as a `decisions.md` row — but pin it with one sentence to prevent a second interpretation.

**R2-2 · LOW · High — tech-spec §2 skills tree and D-12 omit the new `brief` skill.**
§2's `skills/` listing (ingest…evaluate) has no `brief/`; D-12's language-mix table lists neither `brief` (new) nor `revise` (pre-existing omission). §7 and §15 carry it correctly; codebase-review files-to-create carries it. One-line doc edits.

**R2-3 · LOW · High — tech-spec §12 tier-1 row and §15 step 6 still say "CI" while D-33 says no CI exists.**
Phase-4's acceptance cites "§15 steps 6–7 *Done when* verbatim", and step 6's text still reads "passes on CI". D-33 (settled, later, and explicitly restating the mechanism) governs, and every plan proof cell was reworded — but the two tech-spec sentences should be aligned to remove the literal-reading trap.

**R2-4 · LOW · High — Master plan says "D-1…D-32" twice (Contract documents line; Decisions baked in) while D-33/D-34 are load-bearing** (cited by phases 1, 4, 5). Update to D-1…D-34.

**R2-5 · LOW · High — Master-plan phase-table row 1 description omits the `brief` skill** ("Workspace, contracts package, CLI skeleton, `ingest` skill"); cosmetic, but the row is the phase's one-line contract.

**R2-6 · LOW · High — REQ-102's ID appears in no phase checklist (residual of F9).**
The codebase review scopes it as "REQ-102's editorial-QA checks in their advisory-critic subset", i.e. phase-3 task 7's critic — the work is owned and specified; only the ID label is missing. Add "REQ-102 advisory subset" to phase-3's REQ-038 checklist row.

**R2-7 · LOW · High — `broll-silent.mp4` is checked in (phase-1 task 10) but never ingested in phase-1's verification steps;** phase-2 verification 4 then says "also index broll-silent.mp4" with no job ID assigned. Trivially executable (`cutdown ingest ... --job test-3`), but name the job ID in one of the two files.

**R2-8 · LOW-MEDIUM · Medium — Who runs technical QA after a render is unpinned.**
Phase-4 task 8 builds the validators and task 9 makes the runner's `draft-rendering → review` transition require a QA report — but no task says which component *produces* the report (render-skill post-step vs runner-gate execution), and there is no `qa` skill/CLI verb; phase-6's skills-only chain lists "QA" as a stage. The gate architecture implies runner-driven; one sentence in phase-4 task 9 would remove the ambiguity.

**R2-9 · LOW · High — The `{minSeconds: 5, maxSeconds: 180}` duration pin has no provenance.**
PRD §11's fixture says `mode: account_capability_lookup` (uncomputable offline — correctly replaced), but 5/180 are invented numbers cited to nothing. Record them as a `decisions.md` append (or Derived Budgets row) at implementation time, per the plan's own escalation protocol.

### Consolidated reviewer findings

Sole reviewer (generalist; no Critical-Path gates apply). Round-2 open items, prioritized: R2-1, R2-8 (one-sentence interface pins, closable as `decisions.md` appends during phases 3–4), then R2-2/R2-3/R2-4/R2-5/R2-6/R2-7/R2-9 (one-line doc/label edits, any order). None blocks an implementer or breaks a gate.

---

## Round 3 (2026-07-21) — Codex engineering remediation

The re-review found nine still-open Round-2/document issues plus seven deeper execution gaps. All were applied to the plan set rather than deferred to implementation:

| # | Resolution |
|---|---|
| R3-1 | Phase 5 now verifies `approve draft → final render → final QA → package`; pre-approval and draft packaging are negative tests. |
| R3-2 | ReviewDecision references draft/EDL/manifest; ContentPackage references the approval, removing the package-reference cycle. |
| R3-3 | REQ-152 is a named Phase-0 local-state subset; hosted/publishing behavior is the only deferred remainder. |
| R3-4 | Phase 3 has separate `PHASE_3_IMPLEMENTATION_COMPLETE` and `PHASE_3_ACCEPTED_LIVE` gates; D-21/D-27 blockers are explicit. |
| R3-5 | D-35 defines warning-only waivers, immutable waiver evidence, and a non-waivable blocker set on both draft and final QA. |
| R3-6 | The nonexistent live-model CI job is replaced by the explicit local `cutdown test:models --live` command. |
| R3-7 | REQ-017 scope is split correctly: Phase 0 owns transcript/Moment embeddings; frame/clip/near-duplicate work is deferred. |
| R3-8 | PRD §15 now agrees that distinct briefs, critic/gates, renderer adapter, and draft/final tiers are Phase 0 subsets. |
| R3-9 | Decision references now cover D-1…D-38; D-35…D-38 record the new load-bearing choices. |
| R3-10 | Phase 1 commits `pnpm-lock.yaml`, `uv.lock`, and generated TS/Python contract types; `build:contracts --check` detects drift. |
| R3-11 | REQ-001 has an atomic mixed-directory ingest design and fixtures for every supported asset class plus rollback on an unsupported member. |
| R3-12 | Phase 2 assigns manual speaker correction, fades/camera changes/semantic scenes, and every REQ-014 quality signal to concrete tasks and fixture matrices. |
| R3-13 | D-37 resolves critic semantics: LLM findings are advisory; explicit deterministic/versioned rules alone block. |
| R3-14 | D-36 adds stable `accountId`, `sourceClassification`, package `contractSet`, and immutable evidence IDs/timestamps so status claims are computable. |
| R3-15 | Contract changelogs now have typed/timestamped entries and run-log events; the last-ten-output criterion has an executable algorithm and scenario test. |
| R3-16 | D-38 separates `PIPELINE_IMPLEMENTATION_COMPLETE`, `PHASE_3_ACCEPTED_LIVE`, and `PHASE_0_EXIT_EARNED`; Phase 6 and the master exit text use those exact names. |

### Round-3 verification

- Approval/package lineage is acyclic and the state order agrees across tech spec, Phases 4–6, and D-9.
- The master deferral ledger has no full-deferral collision with REQ-017 or REQ-152 Phase-0 work.
- Every in-scope REQ-001/004/011/012/014/037/038/100 behavior called out by the re-review has a task, failure path, and acceptance proof.
- No current contract references a Phase-0 CI job.
- Status inputs are schema fields or immutable referenced artefacts, not filename/manual-tally inference.
- Real-footage exit is explicitly not claimed by this documentation review.

## Verdict

READY FOR IMPLEMENTATION

Reasoning: the Round-3 plan has an executable, acyclic pipeline; explicit partial-requirement boundaries; deterministic ownership of hard gates; complete evidence inputs for status; reproducible contract tooling; and unambiguous milestone names. Implementation may begin on fixtures. `PHASE_3_ACCEPTED_LIVE` and `PHASE_0_EXIT_EARNED` remain evidence gates, not documentation claims.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
