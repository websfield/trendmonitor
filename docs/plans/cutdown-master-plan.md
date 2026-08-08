# Master Plan — cutdown (Phase 0)

**Objective:** Earn `PIPELINE_IMPLEMENTATION_COMPLETE` (D-38): build the local, Claude Code–operated editorial pipeline from multi-asset ingest to an approved, final-tier ContentPackage, with evidence-driven status machinery ready for the four PRD §15 criteria. `PHASE_0_EXIT_EARNED` remains a later operational gate until all four criteria are green on real footage.

**Requirement IDs:** Cutdown PRD REQ set per `docs/progress/cutdown-codebase-review.md` §Requirements (in-scope subset there; deferrals listed there and in the Deferral Ledger below).

**Contract documents (read before any phase):** `docs/video-editing/PRD.md`, `tech-spec.md`, `decisions.md` (D-1…D-38), `developer-guide.md`. The tech-spec supersedes PRD §10.3 mechanics; `decisions.md` is append-only during the build.

## Non-Goals (this plan)

- Anything listed as Phase 1+ in the codebase review's deferral list (review-web UI, Remotion, OTIO bridge, trends, Temporal, analytics import, publishing connectors, hosted anything).
- Accumulating all 20 real outputs across three accounts. Phase 6 attempts and records the first real proving job when D-27 inputs exist, but the remaining accumulation is operations after `PIPELINE_IMPLEMENTATION_COMPLETE`; `cutdown status --phase0` must keep `PHASE_0_EXIT_EARNED` red until the evidence exists.
- Any change to `src/`, `tests/`, `config/`, `docs/initial/` (tech-spec §14).

## Critical Paths touched

| Critical Path | Touched? | Reviewer |
|---|---|---|
| Veto & verdict integrity | No (UGC-specific; tech-spec §14) | — |
| Boundaries & authority | No | — |
| Measurement discipline | No | — |
| Money & exploration | No | — |
| *(Plan gate)* | — | `plan-reviewer` (generalist, mandatory) |
| *(Per-phase code gate)* | — | `code-reviewer` |

## Project Conventions Pinned

Phase 1 carries the canonical pinned block (CLAUDE.md golden rules; tech-spec §14 exemption + independence rule; Cutdown entry gate; agent roster). Phases 2–6 explicitly import that block and must be handed to an agent together with Phase 1; their phase-specific additions are authoritative locally. This reference model avoids six drifting copies.

## Decisions baked in

All of `decisions.md` D-1…D-38; load-bearing for sequencing: D-16 (FFmpeg+libass renderer), D-3 (TikTok AU fixture), D-11 (better-sqlite3 runner), D-24 (contract generators), D-27 (fixture footage unblocks implementation; exit needs real), D-21 (spend gate), D-33 (no CI), D-34 (final-tier rendering), D-35 (warning-only QA waivers), D-36 (stable account/source/contract evidence), D-37 (deterministic editorial blockers), and D-38 (implementation-complete versus Phase 0 exit).

## Dependencies

None on other plans or shipped features (greenfield; codebase review §Roadmap). Owner prerequisites (D-21/D-26/D-27/D-36) do not block recorded-fixture implementation. The D-21 spend ceiling gates Phase 3 **acceptance**, and D-27/D-36 real footage, rights, and account IDs gate the real proving job and `PHASE_0_EXIT_EARNED`.

## Deferral Ledger

| Deferred item | Receiving place |
|---|---|
| Full REQ deferral list (REQ-006/007, 016, **020**, **032** (Hook Lab), **035** (contextual rule engine), 040, 051–059, 062–067, 070–077, 089/090, 101/107, 110–116 remainder, 120–130, 140–145, 150/151 and 153–157, **161/162/165/166**) | Product Phase 1+ (PRD §15 rows 1–4); re-planned then. REQ-160 is a standing non-goal (satisfied by absence, never by a task) |
| REQ-017 remainder | Phase 0 stores transcript embeddings on Moments for retrieval; frame/clip embeddings and near-duplicate grouping move to Product Phase 1 |
| REQ-152 remainder | Phase 0 implements the local state names and progress projection; hosted exposure, `publishing`, and Temporal execution move to Stage B+ |
| `packages/platform-registry` (full effective-dated registry) | Product Phase 1 (REQ-051); Phase 0 uses the D-3 data fixture |
| `evaluate` skill + CSV analytics | Product Phase 1 (REQ-120) |
| Real diarisation, forced alignment | D-17 revisit triggers |
| `skills serve` HTTP shim | D-13 (optional stretch after phase 5; not a plan task) |
| Remotion adapter + determinism tiers 2–3 | D-16 / tech-spec §12 (product Phase 1) |

## Derived Budgets

| Number | Provenance |
|---|---|
| QA thresholds (±40 ms sync, −1 dBTP, 2×42 chars, ≥1 s cues, ≤17 cps) | tech-spec §12.1 (shipped defaults; data-versioned) |
| Proxy recipe (720p-fit, CRF 23, AAC 128k, CFR) | decisions.md D-25 |
| Moment granularity 3–30 s | decisions.md D-31 |
| ASR confidence flag < 0.6 | decisions.md D-28 |
| Spend flag > AUD 200 if ceiling unset | decisions.md D-21 |
| Phase 0 exit numbers (20 outputs / 3 accounts / last 10 / zero invalid ranges) | PRD §15 Phase 0 row |
| Stable `accountId`, `sourceClassification`, package `contractSet` | decisions.md D-36 |
| QA `pass`, `pass_with_waivers`, or `fail`; blocker set | decisions.md D-35 |

## Risk Assessment

Seeded from the brief's pre-mortem + codebase review §Risks: (1) open decisions re-opening mid-build → `decisions.md` is append-only settled law; escalation protocol (developer-guide §5) governs new ones. (2) Unverifiable "done" → every phase's acceptance criteria name a command, fixture, or artefact. (3) Cross-doc contradiction re-emerging → tech-spec is sole layout/command authority; PRD carries pointers. (4) Windows toolchain (phase 1 proves spawning + libass first). (5) Contract churn (schemas front-loaded in phases 1–3; exit criterion 3 measured from changelogs).

## Phase Plans

| Phase | Description | Depends on | Primary Agent(s) | Plan file |
|---|---|---|---|---|
| 1 | Workspace, committed contract codegen + locks, CLI skeleton, `brief` + atomic multi-asset `ingest` | none | general-purpose | `cutdown-phase-1.md` |
| 2 | `index` skill (5 sub-stages) + Moment extraction + source-bounds property test | 1 | general-purpose | `cutdown-phase-2.md` |
| 3 | Editorial skills (`propose`/`plan`/`validate`), deterministic editorial gates, style profile, TikTok fixture, local runner | 2 | general-purpose | `cutdown-phase-3.md` |
| 4 | Render path (`renderer-core`+`renderer-ffmpeg`), captions, technical QA hard gate | 3 | general-purpose | `cutdown-phase-4.md` |
| 5 | draft approval → final render/QA → `package`, `revise`, skills mirror, evidence-based `status --phase0` | 4 | general-purpose | `cutdown-phase-5.md` |
| 6 | End-to-end proving run + `PIPELINE_IMPLEMENTATION_COMPLETE` handover for the later 20-output accumulation | 5 | general-purpose | `cutdown-phase-6.md` |

## Progress Tracking

| Phase | Status | Evidence |
|---|---|---|
| 1 | **Complete** | `docs/progress/cutdown-phase-1-review.md` (Ready). Entry gate green: `validate:contracts` 15 cases / 0 cross-validator disagreements, `build:contracts --check` current, 120 tests 0 fail. `code-reviewer` PASS (round 3; rounds 1–2 found 3 BLOCKs + 1 fix-introduced defect, all fixed with regression tests). Decisions D-39…D-42 appended. Residuals and one genuine plan gap (no kill-during-write test) listed in the review §Deviations |
| 2 | **Complete (Almost — 4 residuals)** | `docs/progress/cutdown-phase-2-review.md`. Entry gate green: python 641 + slow 9, TypeScript 311, `validate:contracts` 15 cases / 0 disagreements, `build:contracts --check` current — **952 tests, 0 fail**. Reviewer gate: 3 reviewers round 1 (all BLOCK) + 1 verification round 2 (BLOCK; 17/19 closed, 1 regression + 1 partial found and fixed). Live proving runs on `clean.mp4` (resume 7/7 from checkpoint, identical indexId) and `ugly.mp4` (VFR). D-43 appended. Residuals: `poor_crop` subject-clipping, `quality.py` silent modality omission + unchecked ffmpeg exit status, `silence` semantics disagreement — all four listed in the review §Residuals |
| 3 | **Complete (impl-complete; PHASE_3_ACCEPTED_LIVE BLOCKED-ON-D-21/D-27)** | `docs/progress/cutdown-phase-3-review.md` (Ready). Entry gate green: `build:contracts --check` current, `validate:contracts` 23 cases / 0 disagreements, whole-graph build EXIT 0, **416 TS + 644 Python tests, 0 fail** (Node-24 glob form per D-44). `code-reviewer` PASS · Grade A (0 must-fix, 3 optional notes). 4 editorial schemas + 2 enums + model-provenance def; `packages/editorial` (gateway/brief/retrieval/angles/story-plan/platform-adapt/edl-resolve) + `embed_query.py`; `packages/qa` D-37 gates; `propose`/`plan`/`validate` skills + TikTok fixture + recorded-model fixtures; `packages/style` + 2 profiles; `workflows/local` durable runner + `run`/`rebuild-index`. Decisions D-44 (Node-24 test-script drift), D-45 (`node:sqlite` fallback — better-sqlite3 has no Node-24 ABI). `PHASE_3_ACCEPTED_LIVE` awaits owner spend ceiling (D-21) + real footage (D-27). Known Phase-0 limitation: quote gate is order-preserving-subsequence, not negation-aware (D-37 promotion backlog). |
| 4 | **Complete (Almost — 7 residuals)** | `docs/progress/cutdown-phase-4-review.md`. Entry gate green: `build:contracts --check` current, `validate:contracts` 32 cases / 0 disagreements, `test:skills` 3/3, **596 TS + 661 Python tests, 0 fail**. Reviewer gate: 2 rounds, both **BLOCK** (round 1: 4 BLOCK — the QA gate was built, unit-tested and never wired into the production Runner; round 2: 2 BLOCK — both round-1 gate fixes re-opened the hole from another angle). All 6 BLOCKs fixed. **Tier-1 byte-identical determinism PROVEN on real FFmpeg 8.0.1** for both draft and final tiers; 23/23 QA checks have positive + negative fixtures; D-35 waiver policy proven on both gates. Decisions D-47 (refuse `subject_reframe`/`split_screen`), D-48 (caption wrap = min(ruleset ceiling, geometric fit)), D-49 (libass system-font fallback) appended. Residuals include: 5 throw paths orphan a render with no report; no test covers the runner's gate-refusal branch or `makeQaGateEnv`; `audio.targetLoudnessLufs` is a dead ruleset setting — full list in the review §Residuals |
| 5 | **Complete (Almost — 6 residuals)** | `docs/progress/cutdown-phase-5-review.md`. Entry gate green, re-run after every round: **811 TS tests / 0 fail** (Phase 4 baseline 596 -> 793 -> 805 -> 811, 2 documented Windows skips), `build:contracts --check` current, `validate:contracts` 40 cases / 0 disagreements, `skills sync --check` PASS (10 skills), `ruff` clean, `pnpm audit` clean. Reviewer gate: TWO reviewers x **FOUR** rounds (cap lifted by the user for this phase). Seven of the eight verdicts were BLOCK/NEEDS-CHANGES, and **every round found that the previous round's fixes had introduced or missed something** - round 1's chokepoint fix routed three sibling ids around it; round 2's `indeterminate` arm took the ENTIRE pipeline down (every validated job unpackageable, on the happy path, with the printed remedy telling the operator to delete required evidence); round 3's structural fix skipped the read that gates a final render, leaving tech-spec S11's post-approval comparison silently reducible to `ok: true` on a stripped draft manifest, and one of its security fixes REFUSED every shipped StyleProfile - a blocking gate then ran with fewer prohibitions than the brand declares. All fixed. The signature defect ('guard the field the reviewer named, miss the sibling') recurred SIX times; what closed it was structural, not more review: contract-validating whole artefacts at the boundary (`readContractJson`/`validateContract`), moving the path guards into `@cutdown/contracts` so `renderer-ffmpeg` can reach them, and an `artefact-path-discipline` lint that found six live unguarded sites three review rounds had missed. Delivered: `review-decision-v1` + `content-package-v1` (+`package-release-state`), the single latest-decision resolver (ULID-namespaced), the containment layer, `stills.ts`, `approve`/`package`/`revise` skills, the review-payload assembler, the strict skill meta-schema + generated registry + LIVE 10-skill `.claude/skills/cutdown-*` mirror (round-trip run from the repo root), `status --phase0`, and both `.gitattributes` files. Phase 4 residuals 1, 2, 4 and 5 cleared. D-50 appended. Note honestly: **the round-3 BLOCKs and the round-4 BLOCK were all invisible to a green entry gate**, because none of those paths had a test - now they do. `PHASE_0_EXIT_EARNED` still red and unreachable by fixtures (proven). |
| 6 | **Complete** | `docs/progress/cutdown-phase-6-review.md`. **`PIPELINE_IMPLEMENTATION_COMPLETE` EARNED 2026-08-02** on the skills-only fixture proving run (job `e2e-mixed-1`, record at `cutdown/docs/proving-run-placeholder.md`): brief → atomic 6-class mixed ingest → index ×2 → propose (2 briefs) → plan → validate (D-37 gate pass + separate critic) → draft render+QA (D-35 named waiver) → named approve → final render+QA (second plan-scoped waiver) → runner-driven package = `rights_approved` ContentPackage `01KZ0A62WTAXFAYS9M1WK6PRKM`, `sourceClassification: fixture`. Kill-resume proven at job level twice: index killed mid-OCR (resume served 3 sub-stages from checkpoint, ≤32 ms); final render killed mid-encode (runner refused the orphaned render fail-closed `QA_REPORT_UNREADABLE`, advanced 0; recovery re-render, then package) — zero LLM-stage re-execution in the run log. Cost table: ~6.2 min wall, **AUD 0.00 live spend** (recorded replay + local models) vs unset D-21 ceiling. `status --phase0`: criteria 2+4 green from package evidence, 1+3 honestly red (fixture excluded from real counts; 1 warning-waived counted separately), `PHASE_0_EXIT_EARNED` **not earned** — the D-38 pair reported independently, as required. Real-footage task recorded **BLOCKED-ON-D-27/D-36** (`cutdown/docs/proving-run-real.md`). E2e golden set seeded (`cutdown/data/golden-sets/e2e/`: 27 s `promo-take.mp4` speech fixture + 140 promoted job artefacts, 2.3 MB). One code change, found by the run: `render --audio-events` refused the only artefact the pipeline produces — fixed at the cause with projection + 9 unit tests (**D-51**); developer-guide §7 addendum records CPU-throughput (D-17 not approached), the REQ-036 Moment floor, ASR-verbatim captioning, per-tier waivers, and the skills-run exit-code nuance |

## Post-completion residual closure (2026-08-06)

`PIPELINE_IMPLEMENTATION_COMPLETE` was earned on 2026-08-02 with a named residual backlog carried in the Phase 2/4/5/6 reviews. This pass closed the ones that could be closed without owner inputs; it is **not** a new phase and changes no milestone. Full record: `docs/progress/cutdown-residual-closure-review.md`, ledger entries 2026-08-06.

**Closed:** Phase 2 residuals 2, 3 and 4 (the silent modality omission; `iter_luma_frames` discarding ffmpeg's exit status — a real defect, a truncated frame series read as clean footage; the `silence` semantics disagreement, settled as **D-53**) plus the `_SAFE_ID` reserved-device gap in all three mirrors. Phase 4 residuals 3 and 6 (the dead `audio.targetLoudnessLufs`, settled as **D-54**, with the "every field is READ" test rebuilt to derive its leaves from the shipped ruleset; the two overstated comments, one fixed in the CODE — `assertDeterministicArgv` now checks `-flags:a +bitexact`). Phase 5 residuals 2, 3 and 5 (**D-55** on the mirror location; the evidence-gap reachability annotations, now pinned by a test; the `revise` quote-caption refusal that stated the wrong reason; the mirror tests writing the repo's real registry).

**Open, with reasons:** `poor_crop` subject-clipping (Phase 2 residual 1 — needs a subject/face model this worker does not carry). `render-v1` path patterns (Phase 5 residual 1 — a BREAKING change to a Phase 4 contract; belongs in a deliberate version bump, not a residual pass). The `artefact-path-discipline` lint's grep shape (Phase 5 residual 4 — a tripwire by construction). The cutdown ruff selection (Phase 6 deviation 3 — widening it is a separate deliberate call).

**Owner-blocked, unchanged:** `PHASE_0_EXIT_EARNED` (D-27/D-36: real footage, rights records, account ids) and `PHASE_3_ACCEPTED_LIVE` (D-21: spend ceiling). Neither is reachable from this repo.

## Plan Review Log

| Date | Reviewer | Verdict | Notes |
|---|---|---|---|
| 2026-07-21 | plan-reviewer (round 1) | NOT READY | 18 findings (1 HIGH: no JobBrief intake task; CI phantom; final-tier gap; REQ parity). All fixed same day — see `docs/progress/cutdown-plan-review.md` |
| 2026-07-21 | plan-reviewer (round 2) | **READY** | 16/18 RESOLVED, 2 PARTIAL + 9 polish findings (R2-1…R2-9) — all nine applied to the plan set after the verdict. No Critical-Path reviewers required (all-No table; tech-spec §14) |
| 2026-07-21 | Codex engineering re-review | NOT READY | 16 open findings: approval/package cycle, scope-ledger conflicts, conditional phase gates, QA policy, ingest/index coverage, status evidence, reproducibility, and milestone ambiguity |
| 2026-07-21 | Codex remediation pass | READY FOR IMPLEMENTATION | Findings incorporated into PRD, tech spec, D-35…D-38, master plan, and Phases 1–6; cross-document consistency checks recorded in `docs/progress/cutdown-plan-review.md` Round 3 |
| 2026-08-06 | `code-reviewer` + `security-reviewer` (residual closure, round 1) | **NEEDS CHANGES** ×2 | Both earned; two findings were defects this session introduced (the decode guard killed ffmpeg on every successful decode then judged by that exit code — measured 180/180; the `-flags:a` fix left its twin live in the content-addressed `proxy.ts`). Security: the three id-guard mirrors were not equivalent (Python `$` vs JS `$` on a trailing newline), the CLI mirror leaked a stack trace under exit 1, the stderr drain was unbounded. All fixed and verified; one finding rejected with evidence. See `docs/progress/cutdown-residual-closure-review.md` |

## Exit Demonstration

`PIPELINE_IMPLEMENTATION_COMPLETE` requires: Cutdown entry gate green (`cutdown validate:contracts`, `build:contracts --check`, `test:skills`), every phase implementation gate green, docs consistent, and an end-to-end skills-only fixture proving job producing an approved final-tier ContentPackage with rights manifest and final QA report. `PHASE_3_ACCEPTED_LIVE` is reported independently and may be blocked on D-21/D-27. `PHASE_0_EXIT_EARNED` stays red until all four real-footage criteria are green.
