# Codebase review — cutdown-product-program

**Date:** 2026-08-08
**Workflow type:** Refactoring/Hardening (the request is "upgrade/harden an existing system"), so this audit precedes the plan per `/create-plan` Step 1.
**Baseline commit:** `501f212` (after this session's three commits; tree clean except `cutdown/.env.example`).

---

## 1. What is actually shipped (verified, not recalled)

Entry gate run on the baseline tree, 2026-08-08:

| Check | Command | Result |
|---|---|---|
| Build | `pnpm build` | clean |
| Contract codegen current | `build:contracts --check` | **PASS** |
| Contract fixtures | `validate:contracts` | **PASS** — 42 cases, 0 lint violations, 0 cross-validator disagreements |
| Skill registry + mirror | `skills sync --check` | **PASS** — 10 skills current |
| Tests | `pnpm -r run test` | **848 pass, 0 fail, 2 skipped** (documented Windows skips) |
| Python lint | `ruff check --config ruff.toml .` | all checks passed |

Inventory:

- **7 packages** — `contracts`, `editorial`, `qa`, `renderer-core`, `renderer-ffmpeg`, `skill-runtime`, `style`
- **10 skills** — `brief`, `ingest`, `index`, `propose`, `plan`, `validate`, `render`, `approve`, `package`, `revise` (+ `registry.json`, `meta-schema.json`), mirrored live to `.claude/skills/cutdown-*`
- **14 contract schemas** — `job-brief`, `source-asset`, `source-index`, `moment`, `creative-brief`, `master-story-plan`, `platform-edl`, `render`, `render-manifest`, `technical-qa-report`, `qa-waiver`, `review-decision`, `content-package`, `style-profile` (+ `common/`)
- **1 app** (`apps/cli`), **1 workflow runner** (`workflows/local`), **1 worker** (`workers/indexer-python`)
- **Data:** 2 style profiles, 1 platform-capability fixture + 1 dated overlay set, 1 QA ruleset, 1 e2e golden set

Milestones: `PIPELINE_IMPLEMENTATION_COMPLETE` **earned** 2026-08-02. `PHASE_0_EXIT_EARNED` **not earned**. `PHASE_3_ACCEPTED_LIVE` **blocked** on D-21.

## 2. Findings from the assessment — verified individually

Each claim was checked against the file, not accepted. Verdicts:

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1a | `status --phase0` proves a "last 10" criterion on 2 outputs | **CONFIRMED — and narrower than described** | `status.ts:48` already defines `CONTRACT_WINDOW = 10`; `:311` already slices `real.slice(-CONTRACT_WINDOW)`; `:347` already labels it "the last 10". The defect is a single token at `:345` — `met: window.length >= 2 && breaking.length === 0` — which declares the criterion met on a window of two, directly beneath its own comment stating that a criterion about ten "cannot be satisfied by having produced one". The assessment's proposed fix ("require ten qualifying outputs") is right; its implied diagnosis (the window size is wrong) is not |
| 1b | No output/variant/revision distinction | **CONFIRMED** | zero occurrences of `outputId`, `variantId`, `supersede`, `parentPackage` in `schemas/content-package-v1.json` |
| 2 | Master plan stale on the real proving run | **CONFIRMED** | `docs/plans/cutdown-master-plan.md` rows say `BLOCKED-ON-D-27/D-36` and "Neither is reachable from this repo"; `cutdown/docs/proving-run-real.md` records **DONE 2026-08-05** with `rights_approved` package `01KZ8B40TENCWQ72F061FXK79S` |
| 3 | No user editing product | **CONFIRMED, and understated** | **zero** matches for `express`/`fastify`/`http.createServer`/`react` across all `package.json` in the workspace. There is no HTTP layer at all, not merely no UI |
| 4 | Quality never demonstrated | **CONFIRMED** | `proving-run-real.md` — recorded fixtures, AUD 0.00 live spend, one job/one account, 4 waivers, "internal stakeholder showcase only", rights not agreement-backed |
| 5 | Narrow creative vocabulary | **CONFIRMED, by deliberate decision** | D-47 refuses `subject_reframe`/`split_screen`. This is settled law, not an oversight — Stage 4 must *supersede* D-47, not ignore it |
| 6 | Indexing ~3 h for 183 s, ~95% OCR | **CONFIRMED** | `proving-run-real.md` §"What the machinery did" |
| 7 | One hard-coded platform fixture | **CONFIRMED** | `data/platform-capabilities/` holds exactly `tiktok-organic-au-fixture.yaml` + `overlays/tiktok/organic-video/2026-07.json` |
| 8 | Style profiles are manual invariants only | **CONFIRMED, by deliberate decision** | `data/style-profiles/` holds 2 files; `style-profile-v1.json` documents that learned tendencies are excluded so that "a schema that cannot hold a learned tendency cannot silently treat a preference as an invariant" |

**One correction to the assessment's framing.** Finding #2 attributes the staleness to Phase 4–6 being unrecorded. That is not the case: Phase 4, 5 and 6 all carry Complete rows and full review documents, and a residual-closure section is dated 2026-08-06. The staleness is narrow and specific — two lines falsified by the 2026-08-05 real run. The fix is a correction, not a reconstruction.

**One correction on scale.** The assessment reports "169 dirty worktree entries" as un-committed Phase 4–6 implementation. 94 of those were untracked source/contract/doc files totalling 6.1 MB (now committed); **one** entry was `work/`, 202 MB of real creator footage and campaign exports carrying third-party personal data, which must never be tracked and is now git-ignored. Treating the 169 as a homogeneous "commit it all" would have published licensed footage and PII.

## 3. Requirement bindings

The program binds to the cutdown PRD. Per stage (full detail in the master plan):

- **Stage 0** — REQ-152 (state/progress), PRD §15 Phase 0 exit row, D-36, D-38, D-51 follow-up
- **Stage 1** — REQ-120 (analytics/evaluate), PRD §14.2 performance gates, PRD §14.1 golden sets
- **Stage 2** — REQ-110…REQ-116 (side-by-side review, structured controls, NL revision, immutable lineage, approval roles), REQ-107 (device/feed simulation), REQ-105/106
- **Stage 3** — REQ-032 (Hook Lab), REQ-035 (contextual rule engine), REQ-036 (weak-footage refusal), REQ-061 (learned style)
- **Stage 4** — REQ-017 remainder (frame/clip embeddings, near-duplicate), REQ-104 (caption accuracy), D-17 revisit triggers, supersession of D-47
- **Stage 5** — REQ-051 (Platform Capability Registry), REQ-062…067 (package deliverables), OTIO export
- **Stage 6** — REQ-120 remainder, REQ-140…145, PRD §14.2 experiment attribution
- **Stage 7** — REQ-150…157, PRD §15 Phase 1.5 exit row

**Stop Condition 1 does not fire** — every stage binds to ≥1 tracked REQ.

## 4. Critical-Path triggers

The four `CLAUDE.md` Critical Paths (veto/verdict, boundaries, measurement, money) govern **UGC Intelligence**, not cutdown. `tech-spec.md` §14 forbids cutdown from touching `src/`, `tests/`, `config/`, `docs/initial/`, and the existing `cutdown-master-plan.md` table is all-No on the same basis. That holds for this program: **no UGC Critical Path triggers.**

**This is a genuine gap, not a clean bill of health.** Available gates are `plan-reviewer` (plan-time) and `code-reviewer` (code-time), both generalist. Two later stages introduce exactly the kinds of risk UGC has dedicated reviewers for:

- **Stage 1 and Stage 6** introduce baselines, cohorts, uplift claims and experiment attribution — statistical honesty work. UGC gates this with `measurement-reviewer`; cutdown would gate it with a generalist.
- **Stage 7** introduces tenant isolation. UGC gates this with `boundary-reviewer`; cutdown would gate it with a generalist.

**Stop Condition 3 is therefore raised deliberately rather than suppressed**: rather than fabricate a substitute reviewer mid-program, Stage 0 carries a task to author two cutdown-specific reviewers (a measurement-honesty reviewer and a tenancy/boundary reviewer) plus their rule-canon skills, following `authoring-project-skills`. They must exist before Stage 1 ships, not before Stage 0 does.

## 5. Inherited stopgaps

Grep over `packages`, `apps`, `skills`, `workflows`, `workers` (excluding `dist/` and tests):

```
grep -rn "TODO\|FIXME\|SHORTCUT:\|placeholder\|HACK" --include=*.ts --include=*.py
```

**Zero** `TODO`, `FIXME`, `HACK` or `SHORTCUT:` markers. Every `placeholder` hit is prose *documenting placeholder semantics* — `style-profile-v1.json` explaining that `approval: null` marks a draft awaiting D-26 owner inputs; `ocr.py` explaining that a missing observation is recorded as absent rather than as a zero-confidence placeholder; `visual.py` and `assemble_index.py` making the same distinction. These are the opposite of stopgaps: they are the codebase refusing to fake data.

The real carried debt is tracked in prose, not markers, and lives in `cutdown-master-plan.md` §"Post-completion residual closure" — four open items with stated reasons:

| Open residual | Receiving stage |
|---|---|
| `poor_crop` cannot detect subject clipping (needs a subject/face model) | Stage 4 (subject/face/crop tracks) |
| `render-v1` path patterns (a BREAKING change to a Phase 4 contract) | Stage 0 (deliberate version bump, with the counting-model bump) |
| `artefact-path-discipline` lint's grep shape (a tripwire by construction) | Stays; reviewed at Stage 7 |
| cutdown ruff selection deliberately narrow | Stage 0 (widen with CI) |

## 6. Cross-boundary reach

- **Stage 1/6 → published platform data.** No connector exists and none is in scope before Stage 6's second half. The reach is a **manual/CSV import boundary** with a consent question attached, not an API call. Degraded mode must be first-class: an observation that never arrives cannot silently become a zero.
- **Stage 2 → the pipeline.** The Review Studio must not become a second brain. Its only writes are the artefacts the skills already define (`ReviewDecision`, revision constraints); it reads the review payload the `render` skill already assembles. Any studio-only state is a source-of-truth fork and must be refused at review.
- **Stage 7 → PostgreSQL/object storage/Temporal.** Three new core dependencies. Per `CLAUDE.md` §Conventions each needs a decision record; **Stop Condition 4 would fire** if Stage 7 were planned to task level today without ADRs. It is deliberately not planned to task level (see the brief's decay rationale), and its plan explicitly requires the decision records first.

## 7. Risks to shared ground

- **Contract churn resets the Phase 0 clock.** Stage 0 must add `outputId`/lineage to `content-package-v1` — a schema change to the very contract whose *stability across ten outputs* is exit criterion 3. Sequencing matters: make the breaking bump **before** accumulating the ten, or the accumulation is invalidated by its own fix. This is the single most order-sensitive fact in the program and is called out as a Stage 0 acceptance criterion.
- **The skills mirror is live.** `.claude/skills/cutdown-*` is generated and round-tripped from the repo root; any skill signature change must run `skills sync` in the same change or `--check` goes stale for everyone.
- **Determinism is proven, and fragile.** Tier-1 byte-identical renders on FFmpeg 8.0.1 are an asset Stage 4 can easily destroy; every new filter/codec path needs its determinism test in the same phase.
- **D-47/D-54/D-55 are settled law.** Stage 4 supersedes D-47 by appending a new decision with reasoning. Silent reversal is the drift the decision log exists to prevent.

## 8. Files this program will touch

Stage 0 only (later stages resolve their file lists at their own planning time, per the decay rationale):

| Path | New/Modified | Note |
|---|---|---|
| `cutdown/packages/contracts/schemas/content-package-v1.json` | Modified | add `outputId`, `variantId`, lineage; major bump |
| `cutdown/packages/contracts/schemas/render-v1.json` | Modified | path-pattern residual, bundled into the same deliberate bump |
| `cutdown/packages/contracts/generated/**` | Modified | regenerated, committed (D-24) |
| `cutdown/packages/contracts/fixtures/content-package-v1/**` | New + Modified | valid/invalid cases for every new field |
| `cutdown/apps/cli/src/commands/status.ts` | Modified | ten-output window; counting policy |
| `cutdown/apps/cli/tests/status.test.ts` | Modified | the criterion's own negative cases |
| `cutdown/packages/renderer-core/src/*` (audio-event projection) | Modified | filter events by clip `assetId` |
| `.github/workflows/*.yml` | New | CI (supersedes D-33) |
| `cutdown/apps/cli/src/commands/doctor.ts` | New | one-command bootstrap/doctor |
| `docs/plans/cutdown-master-plan.md` | Modified | the two stale lines |
| `docs/video-editing/decisions.md` | Modified | append D-56… (CI supersedes D-33; counting policy) |
| `.claude/agents/`, `.claude/skills/` | New | two cutdown reviewers + rule-canon skills |

## 9. Existing patterns to replicate verbatim

- **Contract change:** schema → `build:contracts` → commit generated trees → add valid *and* invalid fixtures → `validate:contracts`. Pattern: the Phase 5 addition of `review-decision-v1`.
- **A new deterministic gate:** implement in `packages/qa`, positive **and** negative fixture per check, then wire into the production `Runner` — Phase 4's reviewer found the gate built, unit-tested and never wired, twice. Pattern: `packages/qa/src/technical/`.
- **Any id used to build a path:** validate the whole artefact at its boundary via `readContractJson`/`validateContract` from `@cutdown/contracts`, never a field-level guard at the call site. This defect class recurred **six times**; the `artefact-path-discipline` lint exists to catch relapse. Pattern and rationale: `CLAUDE.md` Lessons 2026-07-30.
- **A claim in a comment:** assert it in a test or delete it. Pattern: `assertDeterministicArgv`.
