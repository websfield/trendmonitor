# Stage 0 — Make the evidence trustworthy

**Governing PRD phase:** Phase 0 (completion). **Depends on:** none.
**Master plan:** `docs/plans/cutdown-product-program-master-plan.md`
**Objective:** Make every claim the repository makes about itself verifiable — so that `status --phase0`, the roadmap, and git agree, and so the contract-stability clock starts from a schema that will not need breaking again.

> ## ⚠ SUPERSEDED IN PART — read `cutdown-product-program-phase-0b.md` §1 first (2026-08-10)
>
> **This file's tasks 3–14 are superseded by `docs/plans/cutdown-product-program-phase-0b.md`**, whose §1 is the authoritative disposition table: it says, for each of tasks 3–14, whether it was **KEPT** (and which 0B task carries it), **DEFERRED** to work package 0B-3, or **RETIRED** — each with the spike finding that decided it. **Tasks 1, 2 and 15–21 shipped in Stage 0A** and are done.
>
> **Do not execute the task table below directly.** Nine of those twelve tasks existed to support a *stored* output identity that the delivered packages turn out not to need — `lineage.creativeBriefId` is already required and already present, so identity is derived (see `decisions.md` **D-56**). In particular: **task 5's `content-package-v2.json` is deferred, not live**; tasks 6 (`supersession-record-v1`), 8 (`outputId` assignment) and 12 (cross-package lineage validator) are **retired**; task 12b was kept and promoted to first, and is the reason for **D-61**.
>
> **Nothing here is renumbered, restructured or deleted** — the precedent is this file's own task 21 (add a pointer, do not renumber). Task 4's reservation of **D-59** for the `skills serve` transport decision still stands and was **not** consumed by Stage 0B, which took D-61 instead; D-56, D-57 and D-58 have all landed in `decisions.md`.

**Revision 2 (2026-08-08)** — rewritten after the plan-review gate returned **BLOCK**. Round 1 specified an in-place mutation of a published contract (violating tech-spec §3), collided with an existing required field, would have invalidated the two delivered packages that *are* the Phase 0 evidence base, and asserted an acceptance criterion whose evidence cannot exist. Those five defects and their fixes are marked **[R1-fix]** below.

---

## Project Conventions Pinned (READ FIRST)

*Pasted verbatim from `CLAUDE.md`. A spawned agent does not auto-read it.*

### Golden rules

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.** Credentials live in env/config; a leaked secret is a rotate-everything incident.
3. **Never destroy what you didn't create without explicit confirmation** — files, data, branches, running state. Deletion is the one mistake you can't iterate on.
4. **Fix causes, not symptoms.** A change that silences an error without explaining it hides the bug instead of fixing it.
5. **Match the codebase.** Existing conventions beat your preferences; a new dependency needs a reason the standard library can't answer.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that — "done" is a claim the checks have to back.
7. **Small, verifiable steps.** Prefer the change you can test over the big-bang you can't; if you can't verify it, say so.
8. **Scale caution to blast radius.** Reading and analyzing are free. Edits and test runs are cheap. Pushing, publishing, sending anything outside the repo, and deleting what you didn't create are not: those wait for explicit confirmation, and if you catch yourself reaching for reasons one is *probably* fine, that reaching is the signal to stop and ask.
9. **Current facts beat trained memory.** Library APIs, CLI flags, and config schemas are present-day facts: verify against the installed version before use.

### Lessons that touch this stage's ground

*(These exist because something already went wrong here once.)*

- **2026-07-30** — When a review names an unguarded field, fix the **class, not the field**: guard where the path is *built*, validate the whole artefact at its boundary so every `$ref: Ulid` is enforced at once, put the guard in a package **every** consumer can import, and add a lint — "grep every sibling id" is the version of this rule that already failed (why: one id-to-path defect recurred **six** times in one phase across four review rounds, twice *inside* the fixes for the previous ones).
- **2026-07-30** — A comment claiming a property is not the property: **assert it in a test or delete the claim**, and when a review names an inversion your fix might cause, write that inversion as a test before calling the fix done.
- **2026-07-30** — Fail closed, but **never without a way forward**: before making an unreadable or invalid file fatal, grep every *writer* into that directory, and read the refusal's own printed remedy — if it says "delete this evidence", the control is the outage.
- **2026-08-02** — For a tool that resolves config by walking UP the directory tree, a nested self-rooted project having "no config file" means "**the enclosing repo's config**, silently"; and a cross-skill option is only alive when a test drives it from its **real producer's artefact**.

### Contract versioning law (`tech-spec.md` §3) — verbatim, because round 1 broke it

> A **semantic** change (new required field, changed meaning, removed field) bumps the major version and **adds a new file** — it never mutates a published schema in place.

### Scope boundary

**Do not change `src/`, `tests/`, `config/`, or `docs/initial/`.** Those are the UGC Intelligence planes; this is the prohibition `tech-spec.md` §14 exists to state. (§14 itself states independence and gate-exemption; the path list below is this plan's, not a §14 quotation — **[R2-fix]**, rev 2 presented it as verbatim §14 law.)

Cutdown work for this stage lives in `cutdown/`, `docs/video-editing/`, `docs/plans/`, `docs/progress/`, the generated `.claude/skills/cutdown-*` mirror, **and — specific to this stage — `.claude/agents/`, `.claude/skills/cd-*`, and the root `CLAUDE.md`**, which tasks 1 and 2 must write. **[R2-fix — rev 2's boundary excluded the files its own first two tasks create, so an agent obeying the pinned block would refuse them.]**

### Stack and conventions

- TypeScript control plane (pnpm workspace, Node 24 — `node:sqlite`, per D-45); Python worker (`uv`, ruff pinned by `cutdown/ruff.toml`).
- Contract generators are **committed** (D-24).
- `decisions.md` is **append-only settled law**. Superseding D-33 or D-13 means appending a new decision that says so, with reasoning — never editing the original.
- Any id used to build a path is validated by whole-artefact validation at the boundary (`readContractJson`/`validateContract`), never a field-level guard at the call site. The `artefact-path-discipline` lint enforces this.

### Available agents

`general-purpose` owns every task. **Do NOT request** `control-plane-engineer`, `intelligence-plane-engineer`, `frontend-engineer`, `eval-harness-engineer`, or any UGC Critical-Path reviewer.

---

## Requirements Checklist (functional)

| REQ | What this stage must satisfy |
|---|---|
| PRD §15 Phase 0 exit criterion 3 | The "last 10 outputs" criterion is evaluated over **ten** qualifying outputs, not two |
| D-36 | Stable `accountId`, `sourceClassification`, `contractSet` — extended with a stable output identity |
| D-38 | `PIPELINE_IMPLEMENTATION_COMPLETE` and `PHASE_0_EXIT_EARNED` continue to be reported **independently** |
| REQ-113 | Immutable lineage — a revision creates a new object linked to its parent; previously approved versions stay reproducible |
| REQ-152 (partial) | Local state names and progress projection remain correct after the contract bump |
| D-51 follow-up | `--audio-events` projects correctly for a **multi-asset** EDL |

## Requirements Checklist (technical)

- A semantic schema change **adds a new file**; the published v1 files are never edited (tech-spec §3).
- **Delivered packages are immutable and must remain readable and countable forever.** A contract bump that invalidates existing evidence has destroyed the evidence base it was meant to protect.
- Every new schema field gets **both** a valid and an invalid fixture; `validate:contracts` stays at 0 cross-validator disagreements.
- Rules JSON Schema cannot express (cross-document, cross-property) are enforced **in code**, with a test — never asserted via a fixture that cannot fail.
- Every behaviour claim in a comment is asserted by a test or deleted.
- CI runs the complete entry gate on a **clean clone**, Linux and Windows, scoped by path so a cutdown failure does not gate UGC work.
- `skills sync --check` stays PASS — and nothing is written into the `cutdown-` mirror prefix that is not a generated mirror.

## Edge Cases & Failure Paths

**Inverse events.** Supersession must be undoable **without mutating an immutable artefact** — so it is recorded on a separate, append-only supersession record, never as a mutable field on the superseded package. Task 6 defines the state set and its inverses in a written document; the schema encodes it. **[R1-fix — round 1 delegated this to "task 3 defines it" and then specified only a schema, naming a data-loss bug and then designing it.]**

**Double failure.** CI unavailable *and* the local gate stale → exit criteria are computed from artefacts on disk, never a cached CI verdict. `status --phase0` reads packages, never a CI badge.

**Degraded mode.** A package that is unreadable or fails contract validation makes the criterion **UNPROVEN** and is named — never silently dropped, because a dropped package makes the ten-output window satisfiable by hiding failures. **A package written against an older contract major is not "invalid"** — it is legacy, and is read by a version-dispatching reader. Fail closed, but the printed remedy must never instruct anyone to delete evidence.

## Failure Modes & Degraded Behavior

| Boundary crossing | Failure | Degraded behavior | Reconciliation | Spec that proves it |
|---|---|---|---|---|
| `status --phase0` reads a package | unreadable / malformed | criterion **UNPROVEN**, file named; never deleted | operator repairs | `status.test.ts` unreadable case |
| `status --phase0` reads a **v1** package after the v2 bump | older major | read by the version-dispatching reader; counted under the labelled legacy rule; **stays valid** | none needed | `status.test.ts` mixed-major window case |
| Criterion 3 window spans the major boundary | v1→v2 is a breaking change by definition | criterion legitimately **red** until ten post-bump outputs exist; this is correct, not a bug | accumulate | `status.test.ts` boundary case (A12) |
| Lineage names a parent that does not exist | dangling `parentOutputId` | fail closed: the package is UNPROVEN and named; it does **not** count as a new output | operator repairs lineage | cross-package validator test |
| `--audio-events` on a multi-asset EDL | events from another asset | filtered to the clip's own `assetId`; unmatched events dropped with a counted, reported reason | QA report records the count | `audio-events.test.ts` |
| CI on a clean clone | a needed file was never committed | CI **fails** — that is the point | commit it | the CI job |
| `doctor` finds a missing tool | ffmpeg / uv / node absent | prints the single most important fix, exits non-zero | operator installs | `doctor.test.ts` |

## Handoff Contracts

Consumed by **Stage 1**:

- **`ContentPackage.outputId`** — a stable ULID identifying one publishable output across re-renders and re-packages. Immutable once assigned. **Assignment mechanism is task 8, not an assumption** — a `package` run that mints a fresh ULID per package would make every rerender a new output and silently fork Stage 1's observation keys. **[R1-fix]**
- **`ContentPackage.outputLineage`** — `{ parentOutputId: Ulid | null, relation: 'variant' | 'revision' | 'repackage' | 'rerender' }`. **Named `outputLineage`, not `lineage`** — `lineage` is already a required `PackageLineage` field holding artefact ancestry (`briefId … approvedDraftManifestId, editorialPlanHash`), which is what "the delivered cut is the cut that was approved" reduces to. Overwriting it would destroy the delivered-package evidence chain. **[R1-fix]**
- **Supersession records** — append-only, separate from the package, so supersession is reversible without mutating an immutable artefact.
- **`docs/video-editing/output-counting-policy.md`** — the counting **and comparability** policy. Stage 1 and Stage 6 both read it; it defines "comparable output", on which every later uplift claim rests. **In the authoritative doc set, not `cutdown/docs/`**, because it narrows a PRD §15 criterion. **[R1-fix]**

Consumed by **Stages 1, 6, 7**: the two new reviewer agents and their rule-canon skills.

## Implementation Tasks

> **Task order changed in revision 2.** The reviewers are authored **first**, so they gate Stage 0's own contract work — round 1 authored them last and left the riskiest change in the program (a breaking contract bump, a lineage model, and supersession semantics) gated by `code-reviewer` alone. **[R1-fix]**

| # | Task | Owner agent | File(s) |
|---|---|---|---|
| 1 | Author the two cutdown reviewers + rule-canon skills, per `authoring-project-skills`: a **measurement-honesty** reviewer (baselines, denominators, cohorts, uplift claims, claims language, "an absent observation is not a zero") and a **tenancy/boundary** reviewer (contract authority, immutability, workspace isolation, the studio-is-not-a-second-source-of-truth rule). **Skills must NOT be written under the `cutdown-` prefix in `.claude/skills/`**: `orphanMirrors` (`skills-sync.ts:464`) treats every `cutdown-*` directory with no source skill as an orphan and `--check` fails. Use a non-`cutdown-` prefix. | general-purpose | `.claude/agents/cutdown-measurement-reviewer.md`, `.claude/agents/cutdown-boundary-reviewer.md`, `.claude/skills/cd-measurement-honesty/SKILL.md`, `.claude/skills/cd-tenancy-boundaries/SKILL.md` (all new) |
| 2 | Update `CLAUDE.md`'s Critical-Path table **and** `tech-spec.md` §14, which currently states the Critical-Path gates "do not apply to Cutdown changes". Both must agree, or the plan's own Definition of Done fails on delivery. | general-purpose | `CLAUDE.md`, `docs/video-editing/tech-spec.md` §14 |
| 3 | Write the counting **and comparability** policy. **The principle is SETTLED by owner decision 2026-08-09 (`todos.md` T-1): an output is one approved cut per `CreativeBrief`; a second package for the same CreativeBrief supersedes rather than adds.** Concretely: the two real packages `01KZ8B40TENCWQ72F061FXK79S` and `01KZ9YK48KBRAX85DJ1P76NYMN` share a `creativeBriefId`, so the later supersedes the earlier and the **real-output count is 1, not 2** — `status --phase0` must report 1. Tabulate the rest against it: publishable variant vs revision vs repackage vs rerender vs superseded, and which count toward each PRD §15 criterion. Comparability: same platform, objective, account, denominator kind, post-age horizon — what Stage 1/6 uplift claims rest on. Add a pointer from PRD §15 and tech-spec §15. | general-purpose | `docs/video-editing/output-counting-policy.md` (new), `PRD.md` §15 pointer, `tech-spec.md` §15 pointer |
| 4 | Append decisions: **D-56** (counting + comparability policy, output identity), **D-57** (CI supersedes D-33), **D-58** (ruff selection widened), **D-59** (`skills serve` transport: D-13's "never before Phase 0 exit metrics" is superseded — Stage 2 needs it — with reasoning) | general-purpose | `docs/video-editing/decisions.md` |
| 5 | **Create `content-package-v2.json` and `render-v2.json` as NEW FILES** with new `$id`s and changelog entries (tech-spec §3). v2 adds `outputId` and `outputLineage`; `render-v2` carries the deferred path-pattern fix. **The v1 files are not edited.** **[R1-fix]** | general-purpose | `cutdown/packages/contracts/schemas/content-package-v2.json`, `render-v2.json` (both new) |
| 6 | Define the output state set and its **inverses** in writing, and encode supersession as an **append-only record** (`supersession-record-v1`), not a mutable field — so a supersession can be undone without mutating an immutable delivered package. **A contract with no writer is not an inverse event, it is a schema [R2-fix]:** this task must also name (a) the **writer** — a CLI verb or skill that creates a record, with a `registry.json` entry and `contractsUsed` binding; (b) the **location** under `project-data/jobs/<id>/`, including the addressing model for a **cross-job** supersession, which has none today; (c) the **reader** — `status` must read supersession, because task 3 makes "superseded" a counting state and task 13 filters the window by policy | general-purpose | `docs/video-editing/output-counting-policy.md`, `cutdown/packages/contracts/schemas/supersession-record-v1.json` (new), a supersession writer + `skills/registry.json` |
| 7 | Update the v1 `$id` consumers — **reader and writer differently, which rev 2 conflated [R2-fix]**. The **writer** (`PACKAGE_SCHEMA_ID`, `skills/package/src/main.ts:72`) repoints to v2. The **reader** (`CONTENT_PACKAGE_SCHEMA_ID`, `status.ts:116`) **adds** v2 *alongside* v1 — repointing it, as rev 2's wording implied, recreates the F13 state (both delivered packages unreadable) that task 11 exists to prevent. Also update `skills/package/SKILL.md` `contractsUsed`, `skills/registry.json`, and any dependent `$ref`; run `skills sync` in the **same** change | general-purpose | `cutdown/apps/cli/src/commands/status.ts`, `cutdown/skills/package/src/main.ts`, `skills/package/SKILL.md`, `skills/registry.json`, `.claude/skills/cutdown-package/` |
| 7b | **`render-v2` consumers — a separate, larger sweep [R2-fix].** `render-v1` appears in `contractsUsed` of **four** skills (`approve`, `package`, `render`, `revise`), at four points in `skills/registry.json`, and in `packages/contracts/src/artefact-paths.ts` — the artefact-path-discipline module that exists *because* this defect class recurred six times. Because v1 is not deleted, the registry's dangling-name check will **not** catch a missed consumer: `render-v2` would simply land with zero consumers and the deferred path-pattern fix would never reach a producer | general-purpose | four `SKILL.md` files, `skills/registry.json`, `cutdown/packages/contracts/src/artefact-paths.ts` |
| 8 | Define and implement **`outputId` assignment**. Verified: `skills/package/src/main.ts:570` does `const contentPackageId = ulid()` per run, so every rerender currently mints a new identity. A rerender or repackage **inherits** its `outputId`; only a genuinely new publishable variant mints one. **The discriminator must be specified here, not invented by the implementer [R2-fix]:** state exactly how `package` knows which case it is (an explicit input, not derived from `jobId` — deriving it from `jobId` would collapse two legitimate variants of one job into one output, which is the ~4× decision task 3 owns) and where the parent `outputId` comes from. This is the identity authority for every downstream stage's observation keys | general-purpose | `cutdown/skills/package/src/main.ts` |
| 9 | Regenerate and commit contract trees (D-24) | general-purpose | `cutdown/packages/contracts/generated/**` |
| 10 | Valid **and** invalid fixtures for v2 and for `supersession-record-v1` | general-purpose | `cutdown/packages/contracts/fixtures/content-package-v2/**`, `render-v2/**`, `supersession-record-v1/**` |
| 11 | **Version-dispatching package reader.** `loadAllPackages` validates every candidate against one hard-coded `$id` and pushes failures into `unreadable`; criterion 4 requires `unreadable.length === 0` (`status.ts:365`). Unchanged, the v2 bump turns the two delivered packages permanently unreadable — criterion 4 red forever, criterion 1 losing them, and the only remedy being a repackage that adds no output. The reader must accept v1 **and** v2 and label the major. **[R1-fix]** | general-purpose | `cutdown/apps/cli/src/commands/status.ts` |
| 12 | **Cross-package lineage validator in code**: detect supersession cycles, dangling `parentOutputId`, and orphans. Per-document JSON Schema cannot see across documents, and tech-spec §3 forbids `if/then/else`, so this cannot be a fixture. Follow the existing precedent (`render-v1.json` notes the renderer asserts what the schema cannot). **[R1-fix]** **Wire it to real callers [R2-fix]** — a validator only a test calls is a lint that never runs: `status` calls it (the failure table already promises a dangling parent makes the package UNPROVEN and named), and `package` refuses to mint a package naming a non-existent parent, guarding where the path is built | general-purpose | `cutdown/packages/contracts/src/output-lineage.ts` (new) + tests, `status.ts`, `skills/package/src/main.ts` |
| 12b | **Make the v1→v2 bump detectable by criterion 3 — without this, the whole stage is self-defeating. [R2-fix]** `diffContractSets` (`contract-set.ts:99`) keys entries by full `schemaId`, and a `$id` contains its version. So obeying tech-spec §3 (new file, task 5) means `content-package-v2.json` arrives under a *new* `$id`, `previous === undefined`, and the drift is classified **`added`** — which `status.ts:341` explicitly says "is genuinely additive … neither resets the ten-output clock". **Ten outputs spanning the bump would report criterion 3 GREEN across the largest breaking contract change in the program.** The `breaking` branch can only fire on a major moving *under the same `$id`* — the in-place mutation §3 forbids. Fix: classify drift by **schema family** (id minus version) so a new major of an object already in the set is `breaking`, with tests for both the family bump and a genuinely new object | general-purpose | `cutdown/packages/contracts/src/contract-set.ts` + tests |
| 13 | Implement the counting model in the exit-status evaluator. **Be precise about the defect:** `CONTRACT_WINDOW` is already `10` (`status.ts:48`), the slice is already `real.slice(-CONTRACT_WINDOW)`, and the label already says ten — the single wrong token is the predicate `window.length >= 2` (`status.ts:345`). Require a **full** ten qualifying outputs; only policy-counted outputs enter the window; unreadable packages report UNPROVEN rather than dropping. **Define the legacy identity rule:** a v1 package has no `outputId` (it is a v2 field), so the plan must say explicitly what identity it carries — this decides whether the existing real packages count as 2, 1 or 0 **[R2-fix]** | general-purpose | `cutdown/apps/cli/src/commands/status.ts` |
| 14 | Tests: 9 outputs → UNPROVEN; 10 with a breaking bump → not met; unreadable → UNPROVEN; **v1 legacy package stays readable and counted**; revisions/repackages/rerenders → not counted as new outputs; the v1→v2 boundary makes criterion 3 legitimately red until ten post-bump outputs exist | general-purpose | `cutdown/apps/cli/tests/status.test.ts` |
| 15 | Fix the multi-asset audio-event projection: carry `clip.assetId` into the projected clip list and filter by it; unmatched events dropped with a counted, reported reason | general-purpose | `cutdown/skills/render/src/main.ts` (`loadAudioEvents`, ~L710–730), `cutdown/skills/render/src/audio-events.ts` |
| 16 | Tests for task 15 driven from a **real multi-asset artefact the pipeline produces** — not a hand-built fixture | general-purpose | `cutdown/skills/render/tests/audio-events.test.ts` |
| 17 | Add CI: clean-clone checkout, install, build, `build:contracts --check`, `validate:contracts`, `skills sync --check`, tests, ruff. Linux **and** Windows. **Scope with `paths: cutdown/**` + the cutdown doc paths** so a cutdown failure does not gate UGC work. **Provision FFmpeg 8.0.1 + libass explicitly** — the determinism and QA-gate tests shell out to real FFmpeg over real media, and tech-spec §12 currently pins that proof to "the pinned local environment (D-33 — no CI exists at Phase 0)". | general-purpose | `.github/workflows/cutdown.yml` (new) |
| 18 | Update tech-spec §12 (determinism proof environment, currently pinned to "the pinned local environment (D-33 — no CI exists at Phase 0)"). **Two corrections to rev 2 [R2-fix]:** (a) only **D-39 and D-44** actually carry the "revisit at Stage B, where CI replaces the pinned local machine" trigger — D-45's trigger is Temporal/better-sqlite3 and D-46's is a Node major bump; rev 2 asserted all four, in two documents. Check D-43 too, which carries a Stage-B environment trigger. (b) Do **not** edit those rows in place — the plan's own pinned convention says `decisions.md` is append-only and Out-of-Scope forbids editing D-13/D-33/D-47 in place. **D-57 supersedes them by appending**, or the plan must state why a trigger edit is exempt and D-13 is not | general-purpose | `docs/video-editing/tech-spec.md`, `decisions.md` |
| 19 | Widen the cutdown ruff selection; fix what it surfaces | general-purpose | `cutdown/ruff.toml`, Python sources as needed |
| 20 | Add `cutdown doctor`: node version, pnpm, uv, ffmpeg + libass, fonts, generated-tree freshness; prints the single most important fix | general-purpose | `cutdown/apps/cli/src/commands/doctor.ts` (new), `main.ts`, `tests/doctor.test.ts` (new) |
| 21 | Correct the two falsified lines in the Phase 0 master plan and add a pointer to this program. Do **not** renumber or supersede it. | general-purpose | `docs/plans/cutdown-master-plan.md` |

## Files to Create / Modify

| Path | New/Modified | Notes |
|---|---|---|
| `.claude/agents/cutdown-{measurement,boundary}-reviewer.md` | New | task 1, first |
| `.claude/skills/cd-{measurement-honesty,tenancy-boundaries}/SKILL.md` | New | **not** under the `cutdown-` mirror prefix |
| `CLAUDE.md`, `docs/video-editing/tech-spec.md` | Modified | Critical-Path table + §14 + §12 |
| `docs/video-editing/output-counting-policy.md` | New | authoritative doc set; counting **and** comparability |
| `docs/video-editing/PRD.md` | Modified | §15 pointer only |
| `docs/video-editing/decisions.md` | Modified | append D-56…D-59; D-39/44/45/46 revisit triggers |
| `cutdown/packages/contracts/schemas/content-package-v2.json` | **New** | v1 untouched |
| `cutdown/packages/contracts/schemas/render-v2.json` | **New** | v1 untouched |
| `cutdown/packages/contracts/schemas/supersession-record-v1.json` | New | append-only supersession |
| `cutdown/packages/contracts/generated/**` | Modified | committed (D-24) |
| `cutdown/packages/contracts/fixtures/{content-package-v2,render-v2,supersession-record-v1}/**` | New | valid + invalid |
| `cutdown/packages/contracts/src/output-lineage.ts` | New | cross-package validator |
| `cutdown/apps/cli/src/commands/status.ts` | Modified | version-dispatching reader + counting model |
| `cutdown/apps/cli/tests/status.test.ts` | Modified | incl. mixed-major and boundary cases |
| `cutdown/skills/package/src/main.ts`, `SKILL.md` | Modified | schema id + `outputId` inheritance |
| `cutdown/skills/registry.json`, `.claude/skills/cutdown-package/` | Modified | `skills sync` same change |
| `cutdown/skills/render/src/{main.ts,audio-events.ts}`, `tests/audio-events.test.ts` | Modified | multi-asset projection |
| `.github/workflows/cutdown.yml` | New | path-scoped; FFmpeg 8.0.1 provisioned |
| `cutdown/ruff.toml` | Modified | widened |
| `cutdown/apps/cli/src/commands/doctor.ts`, `tests/doctor.test.ts` | New | + wiring in `main.ts` |
| `docs/plans/cutdown-master-plan.md` | Modified | two lines + pointer |

## Migration Steps

**[R2-fix — round 1 and rev 2 both mis-stated this; verified on disk 2026-08-08.]** **Three** immutable delivered packages exist, and **two of them are real**:

| Package | Job | Classification |
|---|---|---|
| `01KZ0A62WTAXFAYS9M1WK6PRKM` | `e2e-mixed-1` | fixture |
| `01KZ8B40TENCWQ72F061FXK79S` | `schwarzkopf-w1-showcase` | **real** |
| `01KZ9YK48KBRAX85DJ1P76NYMN` | `schwarzkopf-w1-showcase` | **real** |

They are the entire Phase 0 evidence base. **The two real packages share a job and a `creativeBriefId`, differing in story plan, EDL and final render** — so they are the only live instance of the exact ambiguity task 3 must settle: one creative brief, two delivered packages. Under task 3's policy they are either **two outputs or one**, and the program's headline "2 of 20" depends on which. Task 3 must decide it explicitly and task 13 must implement that decision; Verification step 8 asserts whichever answer task 3 gives, not a presumed two.

1. **Do not rewrite them.** Rewriting would falsify their content hashes.
2. **v1 remains a published, valid contract.** v2 is a new file; both are registered and both validate.
3. The version-dispatching reader (task 11) reads either major and labels it. A v1 package is **legacy, not invalid** — round 1's design would have made both delivered packages permanently `unreadable`, turning criterion 4 red forever with no working remedy.
4. Criterion 3 spanning the v1→v2 boundary is **legitimately red** until ten post-bump outputs exist. Task 14 asserts this so a later agent does not "fix" it by dropping legacy packages from the window.
5. Re-packaging an existing job is a **repackage**: it inherits the parent's `outputId` (task 8) and adds no output.

## Verification Steps

1. `cd cutdown && pnpm build` — clean. *(state: source edits complete)*
2. `node apps/cli/dist/src/main.js build:contracts --check` — PASS. *(requires 1; tasks 5, 9)*
3. `node apps/cli/dist/src/main.js validate:contracts` — PASS, 0 disagreements, case count **> 42**. *(requires 2; task 10)*
4. `node apps/cli/dist/src/main.js skills sync --check` — PASS, 10 skills, **no orphan mirrors**. *(requires tasks 1, 7)*
5. `pnpm -r --no-bail run test` — 0 fail; total **> 848**. *(requires 1)*
6. `uv run --with ruff ruff check --config ruff.toml .` — clean under the widened selection. *(requires task 19)*
7. `node apps/cli/dist/src/main.js doctor` — exits 0 here; exits non-zero with one named fix when `ffmpeg` is off PATH. *(requires task 20)*
8. `node apps/cli/dist/src/main.js status --phase0` — **both delivered packages still counted**; criterion 3 UNPROVEN naming ten; `PHASE_0_EXIT_EARNED` red; `PIPELINE_IMPLEMENTATION_COMPLETE` green. *(requires tasks 11–14)*
9. CI green on a clean clone, both OS legs, with FFmpeg provisioned. *(requires task 17 and every step above)*

## Acceptance Criteria (verifiable PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| A1 | Criterion 3 requires ten qualifying outputs; with 2 real packages it reports **UNPROVEN**, and the message states ten | `status.test.ts::"nine outputs is UNPROVEN"` |
| A2 | Label, comment and implementation of criterion 3 agree | `status.test.ts` asserts label text against window size |
| A3 | A supersession cycle and a dangling `parentOutputId` are **rejected by the cross-package validator in code** — not by a fixture, which cannot express a cross-document rule **[R1-fix]** | `output-lineage.test.ts::"rejects a supersession cycle"`, `::"rejects a dangling parent"` |
| A4 | A revision, repackage and rerender each fail to increment the output count, because each inherits its parent's `outputId` | `status.test.ts::"only publishable variants count"` + `package` inheritance test |
| A5 | An unreadable package makes the criterion UNPROVEN and is **named**; no printed remedy instructs deleting evidence | `status.test.ts` + a grep of all printed remedy strings |
| A6 | `--audio-events` on a multi-asset EDL projects only that clip's asset's events, driven by a pipeline-produced artefact | `audio-events.test.ts::"multi-asset EDL filters by assetId"` |
| A7 | CI passes the complete gate on a clean clone, Linux **and** Windows; the 2 Windows-skipped tests run on Linux; the job is path-scoped | the CI run, both legs |
| A8 | `cutdown doctor` names the single most important fix and exits non-zero | `doctor.test.ts::"missing ffmpeg names the fix"` |
| A9 | `cutdown-master-plan.md` contains no statement contradicted by `proving-run-real.md` | diff + manual read |
| A10 | Both reviewers exist; `CLAUDE.md` **and** tech-spec §14 agree on the gate set | files exist; both docs read |
| A11 | Entry gate green (build, `build:contracts --check`, `validate:contracts`, `skills sync --check`, tests 0 fail, ruff clean) | Verification steps 1–6 |
| A12 | **`content-package-v1.json` and `render-v1.json` are byte-identical to their committed versions**, and all three delivered packages remain readable, valid and counted after the bump. **Anchored to the baseline commit, not the index [R2-fix]** — `git diff --exit-code` alone compares working tree to index and passes vacuously once the change is committed, i.e. exactly when it matters | `git diff --exit-code 501f212 -- cutdown/packages/contracts/schemas/content-package-v1.json render-v1.json`, plus a committed sha256 assertion in the contracts suite; `status.test.ts` mixed-major case |
| A13 | **The v1→v2 bump is classified `breaking` by `diffContractSets`, not `added`** — proven by a test over two contract sets spanning the bump — and criterion 3 is consequently red until ten post-bump outputs exist **[R2-fix — rev 2 asserted the red state without the mechanism that produces it, which would have been a test asserting behaviour the code lacks]** | `contract-set.test.ts::"a new major of an existing schema family is breaking"`; `status.test.ts::"major boundary keeps criterion 3 red"` |
| A14 | `outputId` is inherited, not minted, on rerender and repackage — and the **discriminator is specified**, not left to the implementer: `package` is told which case it is, and where the parent comes from **[R2-fix]** | `package` skill test |
| A15 | A legacy v1 package's identity under the counting model is defined and tested, and the number of real outputs it yields matches task 3's stated policy **[R2-fix]** | `status.test.ts::"legacy package identity"` |

## Out of Scope (Surgical Changes)

- **Do not** touch `src/`, `tests/`, `config/`, `docs/initial/` (`tech-spec.md` §14).
- **Do not** edit `content-package-v1.json` or `render-v1.json` — v2 is a new file (tech-spec §3).
- **Do not** rewrite existing delivered ContentPackage files.
- **Do not** repurpose the existing `lineage` field; output lineage is `outputLineage`.
- **Do not** renumber or restructure `docs/plans/cutdown-master-plan.md` beyond the two corrected lines and one pointer.
- **Do not** edit D-13, D-33 or D-47 in place — supersede by appending.
- **Do not** start any Stage 1 contract here.
- **Do not** add an HTTP layer or any UI — that is Stage 2.

## Completion Criteria (Definition of Done)

- **Entry gate clean first** — every command in the Commands block passes, or no **new** failures vs a recorded baseline.
- `code-reviewer` **and** both newly-authored cutdown reviewers report PASS on **this stage's own diff** (task 1 runs first precisely so this is possible), and the report card reads **Ready**.
- Cross-referenced docs consistent: the schema bump updates `decisions.md`, the counting policy, tech-spec §3/§12/§14, PRD §15's pointer, and the plan set **together, in the same change**.
- Acceptance criteria met; docs updated if behaviour or config changed.
