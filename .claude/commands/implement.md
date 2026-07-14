---
description: Execute an implementation plan phase-by-phase yourself (no team spawning), with the project's Critical-Path reviewer gates and the CLAUDE.md Definition of Done. Includes the fast lane — a small, clear change (a shaping brief that names its exact surface) ships with no plan documents at all, through the same gates.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite, Agent
---

# Implement (single-driver execution)

Execute an existing plan **yourself**, phase by phase, instead of spawning a specialist team. Use this for smaller plans, or when you want the main session to do the work directly while still passing through the same gates `/start-teams` enforces.

> Prerequisite: a master plan + phase plans produced by `/create-plan` (ideally plan-review-gated). If none exists, stop and recommend `/create-plan <feature>` — **unless** the ask qualifies for the **Fast lane** below, the one mode that runs without a plan.

## Usage
```
/implement [feature-name] [optional: phase number]
```
`/implement <feature>` with no plan on disk but a clear-and-contained brief at `docs/plans/<feature>-brief.md` enters the **Fast lane** below.

## Fast lane (small changes — gates without the paperwork)

For a small, clear change, the plan documents are overhead the discipline doesn't need — but the gates still are. The fast lane skips the artifacts (codebase review, master plan, phase plans, plan-review gate) and keeps **every gate**. `/go` drives it automatically when `/shape` classifies an ask clear-and-contained; it also runs directly from a clear-and-contained brief (see Usage above).

**Admission test — ALL must hold. Any failure routes out — each bullet names where:**

- **(a) The project is set up.** `CLAUDE.md` is filled (not the skeleton) and its Critical-Path → reviewer table names real paths — a fast lane with no reviewers set up checks nothing; that's not fast, it's unguarded. On a skeleton, run `/bootstrap-claude-pack` first.
- **(b) A clear-and-contained shaping brief with a `Surface:` line** — the closed, named set of files/components/routes (or one mechanical pattern applied uniformly). No brief, or no nameable surface → `/shape` first.
- **(c) Nothing irreversible.** No new dependency, no data migration, no destructive or one-way operation. Any of those → plan it: `/create-plan <feature>`.
- **(d) A single-sitting unit of work** — no phases, no handoff contracts. Bigger than that → plan it: `/create-plan <feature>`.

**Process:**

0. **Checkpoint snapshot:** run the plan lane's Step 2 "Checkpoint snapshot" step first (consent ask included) — the fast lane skips paperwork, not the safety net.
1. **Implement inside the named surface.** The `Surface:` line is the boundary — it stands in for the plan's *Files to Create / Modify* table. In place of a phase plan's pinned-conventions block, read `CLAUDE.md`'s golden rules, the non-negotiables that apply, and every **Lessons** entry touching this ground — the main session can read them directly; the pinned block exists for spawned agents, which the fast lane's implementer isn't. Test-first where practical; the plan lane's Step 2 evidence rule holds — a claim without a run is "not verified yet", never "done".
2. **Entry gate.** The project's typecheck + lint + test clean **before** any reviewer runs — green, or no new failures vs a recorded baseline (the plan lane's Step 3 rule; see Step 3 for the baseline ratchet).
3. **Reviewer gate.** Spawn **every** reviewer whose Critical Path the diff touched, per the plan lane's Step 4 discipline verbatim (read-only, briefed with the diff scope, "think hard before rendering your verdict", PASS / NEEDS CHANGES / BLOCK, the paste-fidelity self-check, max two rounds, missing-reviewer fallback noted). **Zero touched paths → run the generic `code-reviewer` on the diff instead** — no change ships reviewer-less. **Production intent** (the person's words signal it, or `CLAUDE.md`/`NORTH_STAR.md` declares a production target) → `production-reviewer` joins the set, same trigger as `/review-phase`'s on-demand gate.
4. **Definition of Done.** Walk `CLAUDE.md`'s actual DoD items that apply to this diff (tests in the same commit, mandatory specs, docs updated, …). The DoD is a gate, not paperwork — the fast lane skips artifacts, never the DoD.
5. **Report card.** Write `docs/progress/quick/<yyyy-mm-dd>-<slug>.md` in `/review-phase` Step 6's card format and present it plainly. The acceptance rubric is the brief itself: the *Chosen scope* one-liner satisfied, and the diff confined to the `Surface:` set — each cited with evidence (file:line / test name / command output), the same no-pass-without-evidence rule as a phase review. Card rows: entry checks · each reviewer · acceptance (brief satisfied, surface respected) · Definition of Done.

No ledger, no master-plan table, no phase files. One accepted trade-off: an interrupted fast-lane session leaves no ledger — the uncommitted diff on disk is the record, and re-running the same ask re-enters the fast lane and meets that diff; the single-sitting admission rule keeps the window small. Compared to a full phase review, the one pass this lane skips by design is the **advisory simplification pass** — it is advisory-only, never a gate, and a surface-bounded diff carries little over-engineering risk.

**Escape hatch (the loophole-closer).** The moment the work wants to leave the named surface — a file not in the set, a new dependency, a migration — **stop, say so, and upgrade to the plan lane.** Never widen silently; catching yourself arguing the growth is small enough to absorb is the signal to upgrade. Mechanics: keep the working diff, tell the person what grew and why, update the brief's *Chosen scope* (or note the growth alongside it) so planning starts from the true scope, then run `/create-plan <feature>` — its codebase review meets the in-flight diff and phase 1 absorbs it; nothing is discarded.

## How it learns the project
Same as `/start-teams`: `CLAUDE.md` (rules, Critical-Path→reviewer map, Definition of Done), the phase plans (the contract), and `.claude/agents/` + `.claude/skills/` (the reviewers to run). It does not auto-inject anything — read what you need.

## Process (the plan lane)

### Step 1: Load
Read the master plan and the target phase plan(s). Build a `TodoWrite` list from the phase's *Implementation Tasks* table. Locate the **progress ledger** at `docs/progress/<feature>/ledger.md` (append-only timeline; create if absent) — you append one line per lifecycle event (`started` / `entry-gate PASS`/`FAIL` / `reviewer <name>: <verdict>` / `complete` / `blocked` / `residual`) so an interrupted session is resumable and the report card can be rebuilt. It is a convenience layer, never rewritten — proof of completion is the evidence on disk (Step 1.5), so a missing ledger never blocks work.

### Step 1.5: Dependency gate (build only on finished work)
Read the target phase's *Depends on* line (default: the immediately preceding phase; `none` = independent). A predecessor counts as complete **only with proof on disk** — its phase review `docs/progress/<feature>-phase-<P>-review.md` marked Ready/READY, or its entry-gate + Definition-of-Done evidence under `docs/progress/<feature>/`. A `Complete` row in the master plan is a *claim*, not the proof. If any predecessor's proof is missing, the phase is **blocked, not started**: append a `blocked` line to the ledger naming it, surface it, and stop — never build on unproven work. Once startable, append a `started` line and proceed.

### Step 2: Implement the phase

**Checkpoint snapshot (opt-in, before the phase's first edit) — this is the canonical wording and mechanic; other commands point here.** In a git repo (`git rev-parse --is-inside-work-tree` succeeds), check `CLAUDE.md` for a `Checkpoints:` line. No line → ask **once**, plainly: *"Before each build phase I can save a git snapshot you can restore if anything goes wrong. Claude Code already auto-saves my own file edits (`/rewind` restores them); a git snapshot also covers what commands and code generation change. Want snapshots on?"* Record the answer as a `Checkpoints: on` / `Checkpoints: off` line (show the edit); `off` is never re-asked, and the recorded consent is what makes each later snapshot an *asked-for* git operation. When `Checkpoints: on`:
- Probe with `git status --porcelain` (untracked files count as **not** clean). **Dirty tree** → `git stash push --include-untracked -m "claude-jig checkpoint: <feature> phase <N>"` (in the fast lane, use the brief's slug in place of `phase <N>`) then immediately `git stash apply --index` — tree and staged state end unchanged; the named entry is the restore point. Announce by **name**, never by `stash@{0}`: "Snapshot saved as `claude-jig checkpoint: <feature> phase <N>` — to restore, ask me (or `git stash list` to find it, then `git stash apply <that entry>`)."
- **Clean tree** → push nothing, apply nothing (a clean-tree `git stash push` creates no entry, so a scripted apply would resurrect whatever unrelated stash sits at `stash@{0}`). Announce it plainly: "nothing unsaved to snapshot — your last commit (`<short-sha>`) is the restore point; to restore, just ask me."
- Snapshots accumulate in `git stash list`: at each snapshot moment, if an earlier phase's review has since landed READY, offer once to drop that phase's named snapshot — dropping destroys a restore point, so it is always an announced offer, never automatic.
- A recorded variant (e.g. `Checkpoints: on (work-branch)`) means the person chose their own mechanic — follow their stated preference exactly; never improvise one.
- If a snapshot fails, say so and pause for the person's call — never proceed as if saved.
- Not a git repo but `Checkpoints: on` recorded → say snapshots need git, and offer `git init` or flipping the line to `off`; the person decides.

Work the *Implementation Tasks* in order, respecting handoff contracts. For each task:
- Follow the *Project Conventions Pinned* block exactly. If a Critical-Path **skill** applies (e.g. an idempotency-ledger or isolation skill in `.claude/skills/`), invoke it before writing the relevant code.
- **Test-first where practical:** for each acceptance criterion, write the failing test *before* the behaviour (red → green) — a test written first catches building the wrong thing per-task; a test written after only confirms what was built. Either way, tests ship in the same commit as the behaviour, per the plan's test rows (including the mandatory idempotency-replay and isolation specs, if the project defines them).
- Stay inside the *Files to Create / Modify* table. Do not drive-by refactor adjacent code.
- **Self-review before the gate:** when the phase's tasks are done, re-read your own diff adversarially — assume defects exist, the way `/audit` does — against the *Project Conventions Pinned* block and the *Acceptance Criteria*, and fix what you find. A defect caught here costs seconds; the same defect at the reviewer gate costs a fix round.
- **Done only with evidence:** for each acceptance criterion, name the command or test you ran and its result. A claim without a run is "not verified yet", never "done".

### Step 3: Entry gate (ordering is mandatory)
Before this and each later gate, re-read the phase plan's *Project Conventions Pinned* block — a long session drifts; the plan does not. Run the project's `typecheck` + `lint` + `test` (discover the real scripts). They must be **clean before** any reviewer runs — reviewers read code, they don't run it. Clean = green, or — when a **brownfield baseline** exists (`docs/progress/entry-baseline.md`, recorded by bootstrap — or by this gate, below — on a repo that was already red) — no new failures vs it: no failing identifier it doesn't already record, no count above it; a failure this change introduced is always FAIL. A run that beats the baseline rewrites it down to the smaller set (downward-only, never up); the first all-green run deletes it — the standard reverts to plain green for good. If checks are red with no baseline recorded, ask **once**: do these failures pre-date this work? If yes, offer the pair together: record the baseline and proceed on this rule, **and** update `CLAUDE.md`'s entry-gate Definition-of-Done line to the ratchet-aware wording (show the diff; merge, never clobber) — without that second edit the Step 5 DoD audit still fails on the old "green" line. If they decline, the gate stays red. Capture the run under `docs/progress/<feature>/` and append an `entry-gate PASS`/`FAIL` line to the ledger, with any ratchet movement (e.g. `entry-gate PASS (baseline 12 → 9)`) or retirement.

### Step 4: Critical-Path reviewer gate
From `CLAUDE.md`'s Critical-Path → reviewer table, run **every** reviewer agent whose path this phase touched (N paths → N gates). Spawn them read-only, briefed with the diff scope, "think hard before rendering your verdict", and the PASS / NEEDS CHANGES / BLOCK format. Fix every confirmed finding, re-run only the failing reviewers. Max two rounds; surface residuals. Append one `reviewer <name>: <verdict>` line to the ledger per reviewer.

**Lean gate (`Gate intensity: lean` in `CLAUDE.md`) — consolidate, never skip.** Under lean, the per-path reviewers merge into **one merged reviewer run**: spawn the generalist reviewer (or `general-purpose`, the same type the fallback below sanctions) once, read-only, briefed with the diff scope, "think hard before rendering your verdict", and each touched path's numbered checklist pinned **verbatim from that path's reviewer agent file** (paste-fidelity applies to each pinned checklist) — rendering PASS / NEEDS CHANGES / BLOCK **per path**, max two rounds; a re-run is the merged run scoped to the failing paths' checklists. The merged run is also the consolidation — no separate generalist spawn. Per-agent `model:` pins don't ride along in a merged run — explicitly request the strongest model the account exposes. Write "gates ran lean (consolidated)" in the ledger and on the report card — lean is never silent. Lean changes how many agents run, never what is checked.

**Fallback** — missing reviewer agent → `general-purpose` review walking that path's checklist; note the absence.

**Paste-fidelity self-check — before sending each spawn prompt:** check every pinned block against its source — a phase-plan contract block byte-for-byte, a standard brief intact — nothing summarized or trimmed to fit. A paraphrased contract is a broken contract.

### Step 5: Definition of Done
Walk the phase plan's *Completion Criteria* and *Acceptance Criteria* against the shipped code; each must PASS with cited evidence. Update the master plan's *Progress Tracking* row, drop evidence under `docs/progress/<feature>/`, and append a `complete` line to the ledger citing that evidence — it is what makes the next phase startable at its dependency gate.

### Step 6: Next phase or stop
If more phases remain and the user asked for the whole plan, continue to the next phase — but prefer **one phase per session**: offer a fresh session (`/clear`) between phases — `/go` picks the next phase up from the ledger, and a fresh context window doesn't drift. Otherwise report status and the next handoff.

## Hard rules
- Reviewer gates are mandatory per touched Critical Path — never skipped for size or green tests.
- The fast lane skips plan *artifacts* only — the entry gate, the reviewer gates, and the Definition of Done run in full.
- Tests alone do not satisfy the Definition of Done.
- Commit/branch only if the user asks.
