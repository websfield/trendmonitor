---
description: Execute an implementation plan phase-by-phase yourself (no team spawning), with the project's Critical-Path reviewer gates and the CLAUDE.md Definition of Done. Includes the fast lane — a small, clear change (a shaping brief that names its exact surface) ships with no plan documents at all, through the same gates.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite, Agent
---

# Implement (single-driver execution)

Execute an existing plan **yourself**, phase by phase, instead of spawning a specialist team. This is the default build lane; `/go` sends a phase to `/start-teams` only when its *Files* Owner column names two or more different specialist agents. The gates are the same ones `/start-teams` runs.

> Prerequisite for the plan lane: a master plan whose Plan Review Log ends READY — `node .claude/scripts/plan-ready.js docs/plans/<feature>-master-plan.md` says `READY:`. `NOT READY:` → `/create-plan <feature>` (it resumes at its Step 6 review gate); `UNCHECKED: cannot read …` → there is no plan yet, `/create-plan <feature>`; any other `UNCHECKED:` → read the plan's Plan Review Log yourself: its last row must say READY. No plan and a small, clear ask → the **Fast lane** below.

## Usage
```
/implement [feature-name] [optional: phase number]
```
`/implement <feature>` with no plan on disk but a clear-and-contained brief at `docs/plans/<feature>-brief.md` enters the **Fast lane**.

## The one record

Every goal — planned or fast — keeps one file: `docs/progress/<feature>/progress-and-log.md` (the fast lane uses the brief's slug as `<feature>`). Create it with the feature header and a `Status: in progress` line if absent; resume from its last section if present. It holds, per phase, a `## Phase N` section of time-stamped lines (`started` · `least-confident: <line>` · `validation: <command> · exit <n>` · `reviewer <name>: <verdict>` · `fixed: <file:line>` · `complete` / `blocked` / `residual`) followed by a `## Phase N — review` section holding the acceptance proof lines, the 8-row card, and each reviewer's full report under `### <reviewer> report`; plus one `## Review log` table (`| Date | Phase | Round | Reviewer | Reviewed ref | Verdict | Notes |`, one row per reviewer run), a `## Deferred` list, and a `## Field metrics` table (one column per phase; rows and their definition in `review-phase.md` Step 6). `Status: done` on the top line closes the goal — whoever finishes the last phase writes it (Step 6 here; `/go` action 9). It is bookkeeping: never a reviewer finding, and a missing or garbled record never blocks authorized reading or building — proof is the evidence the sections cite.

## Fast lane (small changes — gates without the paperwork)

For a small, clear change, the plan documents are overhead the discipline doesn't need — but the gates still are. The fast lane skips the artifacts (codebase review, master plan, phase plans, plan-review gate) and keeps **every gate**. `/go` drives it automatically when `/shape` classifies an ask clear-and-contained.

**Admission test — ALL must hold. Any failure routes out — each bullet names where:**

- **(a) The project is set up.** `CLAUDE.md` is filled (not the skeleton), with a Critical-Path → reviewer mapping derived from this project. Zero touched paths still gets one independent `code-reviewer` run (canon §1). On a skeleton, run `/bootstrap-claude-pack` first.
- **(b) A clear-and-contained shaping brief with a `Surface:` line** — the closed, named set of files/components/routes (or one mechanical pattern applied uniformly). No brief, or no nameable surface → `/shape` first.
- **(c) Nothing irreversible.** No new dependency, no data migration, no destructive or one-way operation. Any of those → `/create-plan <feature>`.
- **(d) A single-sitting unit of work** — no phases, no handoff contracts. Bigger → `/create-plan <feature>`.

**Process:**

0. **Checkpoint snapshot:** run the plan lane's Step 2 checkpoint (consent ask included) — the fast lane skips paperwork, not the safety net.
1. **Implement inside the named surface.** The `Surface:` line is the boundary — it stands in for a phase plan's *Files* table. Read `CLAUDE.md`'s golden rules, the non-negotiables that apply, and every **Lessons** entry touching this ground. The Step 2 build disciplines apply as written.
2. **Validation gate.** The project's typecheck + lint + test clean **before** any reviewer runs — green, or no new failures vs the recorded baseline (Step 3).
3. **Reviewer gate.** Write your one-line *least-confident* declaration; freeze the tree (canon §2); spawn **every** reviewer whose Critical Path the diff touched, briefed as in Step 4. Zero touched paths → the generic `code-reviewer` on the diff. **Production intent** (the person's words, or `CLAUDE.md`/`NORTH_STAR.md` declares a production target) → `production-reviewer` joins the set. Apply canon §3: you fix your own findings — Medium/Low in one batch, `fixed: file:line` in the record, no re-review; BLOCK/High → fix → re-run that reviewer once (§5).
4. **Definition of Done.** Walk `CLAUDE.md`'s four DoD items against this diff. The DoD is a gate, not paperwork.
5. **Report card.** Write the 8-row card from `/review-phase` Step 6 under `## Phase 1 — review` in `docs/progress/<feature>/progress-and-log.md` (the brief's slug is `<feature>` here), set the top line to `Status: done`, and present the card plainly. The acceptance rubric is the brief itself: the *Chosen scope* one-liner satisfied and the diff confined to the `Surface:` set, each with evidence (`file:line` / test name / command · exit). Reachability is the brief's `Surface:` caller. The fast lane runs no advisory simplification pass.

**Escape hatch.** The moment the work wants to leave the named surface — a file not in the set, a new dependency, a migration — **stop, say so, and upgrade to the plan lane.** Never widen silently; catching yourself arguing the growth is small enough to absorb is the signal to upgrade. Keep the working diff, tell the person what grew and why, update the brief's *Chosen scope*, then run `/create-plan <feature>` — its codebase review meets the in-flight diff and phase 1 absorbs it; nothing is discarded.

## How it learns the project
Same as `/start-teams`: `CLAUDE.md` (rules, Critical-Path→reviewer map, Definition of Done), the phase plans (the contract), and `.claude/agents/` + `.claude/skills/` (the reviewers to run). Read what you need; never assume anything was injected for you.

## Process (the plan lane)

### Step 1: Load
Run the plan-ready check (prerequisite above) and act on its first word. Read the master plan and the target phase plan(s); build a `TodoWrite` list from the phase's *Files* and *Acceptance criteria*. Open or create the record; append `started`.

### Step 1.5: Dependency gate (build only on finished work)
Read the target phase's *Depends on* line (`none` = independent). A predecessor counts as complete **only with proof on disk** — its `## Phase P — review` section in the record shows `Overall: Ready` with its acceptance proof lines. A `Ready` in the master plan's *Status* column is a *claim*, not the proof. Missing proof → the phase is **blocked, not started**: append `blocked: <what is missing>`, say so, and stop — never build on unproven work.

### Step 2: Implement the phase

**Honor existing authorization first.** If the person forbids git operations or has declined checkpoints, skip the snapshot and its consent question. A previous authorization remains applicable within its stated scope; never ask again simply because this is another phase or session.

**Checkpoint snapshot (opt-in, before the phase's first edit) — this is the canonical wording and mechanic; other commands point here.** In a git repo (`git rev-parse --is-inside-work-tree` succeeds), check `CLAUDE.md` for a `Checkpoints:` line. No line → ask **once**, plainly: *"Before each build phase I can save a git snapshot you can restore if anything goes wrong. Claude Code already auto-saves my own file edits (`/rewind` restores them); a git snapshot also covers what commands and code generation change. Want snapshots on?"* Record the answer as a `Checkpoints: on` / `Checkpoints: off` line (show the edit); `off` is never re-asked, and the recorded consent is what makes each later snapshot an *asked-for* git operation. When `Checkpoints: on`:
- Probe with `git status --porcelain` (untracked files count as **not** clean). **Dirty tree** → `git stash push --include-untracked -m "claude-jig checkpoint: <feature> phase <N>"` (in the fast lane, use the brief's slug in place of `phase <N>`) then immediately `git stash apply --index` — tree and staged state end unchanged; the named entry is the restore point. Announce by **name**, never by `stash@{0}`: "Snapshot saved as `claude-jig checkpoint: <feature> phase <N>` — to restore, ask me (or `git stash list` to find it, then `git stash apply <that entry>`)."
- **Clean tree** → push nothing, apply nothing (a clean-tree `git stash push` creates no entry, so a scripted apply would resurrect whatever unrelated stash sits at `stash@{0}`). Announce it plainly: "nothing unsaved to snapshot — your last commit (`<short-sha>`) is the restore point; to restore, just ask me."
- Snapshots accumulate in `git stash list`: at each snapshot moment, if an earlier phase's review has since landed Ready, offer once to drop that phase's named snapshot — dropping destroys a restore point, so it is always an announced offer, never automatic.
- A recorded variant (e.g. `Checkpoints: on (work-branch)`) means the person chose their own mechanic — follow their stated preference exactly; never improvise one.
- If a snapshot fails, say so and pause for the person's call — never proceed as if saved.
- Not a git repo but `Checkpoints: on` recorded → say snapshots need git, and offer `git init` or flipping the line to `off`; the person decides.

Work the phase's *Files* table in order. Build disciplines (pinned verbatim into every spawn prompt by `/start-teams`; the main session follows them directly here):
- *Conventions:* follow `CLAUDE.md`'s golden rules, the non-negotiables this phase touches, and every **Lessons** entry on this ground. If a Critical-Path **skill** applies (e.g. an idempotency-ledger or isolation skill in `.claude/skills/`), invoke it before writing the relevant code.
- *Tests proportional to the change:* for each acceptance criterion write the failing test before the behaviour where practical (red → green), and ship tests in the same change — but only the tests the change earns: at the seams you touched, using the project's existing runner and harness. Add characterization tests only where you touch behaviour that has none. Never build a bespoke harness — source scanner, screenshot matrix, tautological snapshot suite — unless the phase plan names it. A test that cannot fail on the defect it guards is not evidence: make it fail first or delete it.
- *Read boundary:* read your own phase plan, the master plan, the brief, this feature's codebase review and audit (`docs/progress/<feature>-codebase-review.md`, `-audit.md` when present — they carry the pattern to replicate, the stopgaps to retire and the behaviour contract), the files in your *Files* table and what they directly import. Other features' `docs/plans/*` and `docs/progress/*` are off-limits unless this phase's *Depends on* line names them (then only that phase's section of the record). Need something outside that set? Name it and why; do not go read it.
- *Stay inside the Files table.* Do not drive-by refactor adjacent code.
- *Self-review before the gate:* when the tasks are done, re-read your own diff adversarially — assume defects exist — against the conventions and the *Acceptance criteria*, and fix what you find. A defect caught here costs seconds; the same defect at the reviewer gate costs a round.
- *Done only with evidence:* for each acceptance criterion, name the command or test you ran and its result — the command this project sanctions, run against the real target. A result from any other method is discarded and re-run before you report, never reported and corrected afterwards; if you did re-run, name both commands. A claim without a run is "not verified yet", never "done". UI changes: browser evidence per the `verifying-webapps` skill — `command · exit · assertion`, or `unverified`.
- *Declare your weakest bet:* after the self-review, write one line — the thing in this diff you're least confident about. Append `least-confident: <line>` to the record and hand it to every Step 4 reviewer, briefed to probe it first. Never "none".

**For a BLOCK/High finding**, before editing write one line in the phase section: what broke, why, and the test that now catches it — the fix covers the class (every caller or boundary the invariant governs), not the instance. A second recurrence of the same finding means the last fix was narrow: diagnose before editing again.

### Step 3: Validation gate (ordering is mandatory)
Run the project's `typecheck` + `lint` + `test` (discover the real scripts). They must be **clean before** any reviewer runs. Clean = green, or — when a **brownfield baseline** exists (`docs/progress/entry-baseline.md`, recorded by bootstrap or by this gate on a repo that was already red) — no new failures vs it: no failing identifier it doesn't already record, no count above it. A run that beats the baseline rewrites it down (never up); the first all-green run deletes it. If checks are red with no baseline recorded, ask **once**: do these failures pre-date this work? If yes, record the baseline and proceed on this rule; if they decline, the gate stays red. Append `validation: <command> · exit <n>` (with any ratchet movement, e.g. `baseline 12 → 9`).

### Step 4: Critical-Path reviewer gate

<!-- canon: .claude/gate-rules.md#1-8 -->
**Before running this gate, read `.claude/gate-rules.md` and follow it.** This is the `/implement` build lane: the main session fixes its own findings.

Freeze the tree (§2) and name the snapshot. From `CLAUDE.md`'s Critical-Path → reviewer table, spawn **every** reviewer whose path this phase touched (N paths → N verdicts; under `Gate intensity: lean`, one merged run with every checklist pasted verbatim, still one verdict per path; `Full gates? yes` paths get their own run; zero touched paths → the generic `code-reviewer`). Brief each, read-only, with: the snapshot, the diff scope, the *least-confident* line ("probe the author's weakest bet first"), the exact validation command and result, "think hard before rendering your verdict", and the PASS / NEEDS CHANGES / BLOCK format. Announce the spend in one line before dispatch (§7). Append one `reviewer <name>: <verdict>` line and one `## Review log` row per run.

**Also runs, in every build lane and in `/review-phase`:** the `production-reviewer` when production quality is in scope (the person asked for it, or `CLAUDE.md` / `NORTH_STAR.md` declares a production target) — a gate like any other; the `simplification-reviewer` unless `Gate intensity: lean` — advisory, judges means never coverage, cannot block; and, in `/start-teams` only, the Codex Mode 1 cross-check (`.claude/codex-review.md`), advisory.

Apply §3: Medium/Low → fix in one batch now, `fixed: file:line` per item, no re-review; BLOCK/High → fix, re-run only the reviewer whose cited files the fix touched — once (§5). Then re-run the validation gate. If BLOCK/High survives the re-run, stop with the residual and one next action. A missing reviewer → `general-purpose` with that path's checklist pasted verbatim (§8). Anything on the §6 list (docs, tables, counts, paperwork) is dropped from the grade and said so on the card.

**Paste-fidelity self-check — before sending each spawn prompt:** check every pinned block against its source — a phase-plan contract block byte-for-byte, a standard brief intact — nothing summarized or trimmed to fit.

### Step 5: Definition of Done
Walk `CLAUDE.md`'s four DoD items and the phase plan's *Acceptance criteria* against the shipped code; each criterion gets one proof line (`AC-n: <test or command> · <result>`). Write the phase's 8-row card (`/review-phase` Step 6 shape) and each reviewer's report under `## Phase N — review`, append `complete` (or `residual: <what remains>`) to the phase section, add this phase's column to the record's `## Field metrics` table (`review-phase.md` Step 6 defines the five rows), and set the phase's *Status* cell in the master plan's *Phases* table to `Ready`.

### Step 6: Next phase or stop
Present the card. If the person authorized the whole goal, continue through its remaining phases without asking whether to continue; an explicit pause is honored. When the last phase's section reads Ready, set the record's top line to `Status: done`. At a decision or session boundary the record already holds the next action — a fresh session resumes from it.

## Hard rules
- Reviewer gates are mandatory per touched Critical Path — never skipped for size or green tests.
- The fast lane skips plan *artifacts* only — the validation gate, the reviewer gates, and the Definition of Done run in full.
- Tests alone do not satisfy the Definition of Done.
- Commit/branch only if the user asks.
