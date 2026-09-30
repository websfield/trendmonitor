---
description: Orchestrate a specialist team to implement an existing master plan phase-by-phase, gating each phase through the project's Critical-Path reviewers and the CLAUDE.md Definition of Done. Do NOT use without an existing master plan — /create-plan writes one; for a small, clear change, /shape (or /go) routes to /implement's fast lane instead.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite, Agent
---

# Start Teams (in-project orchestrator)

You are the **lead orchestrator**. You read an existing master plan + its phase plans, right-size a specialist team per phase, spawn the project's real specialist agents, and gate every phase through the Critical-Path reviewer agents and the Definition of Done before moving on. `/go` routes here when a phase's *Files* Owner column names two or more different specialist agents; otherwise `/implement`.

**A spawn is finished only when you hold its completion report.** A start acknowledgement — "started", "spawned", an id — is **not** a report: treat that agent as still running, and never log it as a completion. Do not poll, do not narrate a wait, and do not spawn a duplicate to check on one. Continuity lives in the record on disk, so an interrupted run resumes from evidence rather than from an agent's memory. While work remains authorized and unblocked, never end a turn idle — either spawn the next step, or stop with a named `blocked` or `residual` line for the user.

> Prerequisite: a master plan whose Plan Review Log ends READY — `node .claude/scripts/plan-ready.js docs/plans/<feature>-master-plan.md` says `READY:`. `NOT READY:` → `/create-plan <feature>` (it resumes at its Step 6 review gate); `UNCHECKED: cannot read …` → there is no plan yet, `/create-plan <feature>`; any other `UNCHECKED:` → read the plan's Plan Review Log yourself: its last row must say READY.

## Usage
```
/start-teams [feature-name]
```
- `$ARGUMENTS`: the feature whose master plan lives at `docs/plans/<feature>-master-plan.md`.

## How it learns the project
- **`.claude/agents/`** — the only valid specialist + reviewer agents. Never invent a named specialist; canon §8 permits a separate `general-purpose` reviewer fallback.
- **`CLAUDE.md`** — the Critical-Path → reviewer mapping, the gate ordering, and the Definition of Done.
- The **phase plans** — the verbatim contract for each spawned agent.

## Process

### Step 1: Load the plan

**Resume before you restart.** Look for `docs/progress/<feature>/progress-and-log.md` (the one record — its shape is defined in `implement.md`, *The one record*). If it exists, this run is a **resume**: read its last section to learn where execution stopped, and continue from there rather than rebuilding phases it shows done. Resume establishes only *where execution stopped*; 2·0 below still verifies the proof on disk. A missing record means a fresh start: create it with the feature header and `Status: in progress`.

Run the plan-ready check (prerequisite above) and act on its first word. Read the master plan and every phase plan. Build a `TodoWrite` list: one item per phase.

Append one time-stamped line per lifecycle event to the phase's section as you go: `started`, `builder <name>`, `least-confident: <line>` (each implementer's declared weakest bet — see 2b), `validation: <command> · exit <n>`, `reviewer <name>: <verdict>` (plus one `## Review log` row per run), `fixed: <file:line>`, `report integrity: truncated — <missing field> · resend requested`, `complete` (citing the evidence), `blocked` (naming the missing predecessor), or `residual` (something the user must decide). Append-only: correct an outcome by appending a new line. It is bookkeeping, never a reviewer finding; proof of completion is the evidence the lines cite.

### Step 2: For each phase, in order

**2·0 Phase pre-gate — start a phase only when the work it builds on is actually finished.** Read the phase plan's *Depends on* line (`none` = independent). A predecessor counts as done **only with proof on disk** — its `## Phase P — review` section in the record shows `Overall: Ready` with its acceptance proof lines. A `Ready` in the master plan's *Status* column is a *claim* — verify the section, not the cell. Missing proof → the phase is **blocked, not started**: append `blocked: <what is missing>`, say so plainly, and stop. Once startable, append `started` and proceed.

**Checkpoint snapshot (opt-in, before any implementer runs).** Run the checkpoint consent-and-snapshot step — the canonical wording and mechanics live in `implement.md` Step 2 ("Checkpoint snapshot"); follow them exactly.

**2a. Right-size the team.** From the phase plan's *Files* table Owner column, determine which specialist agents this phase needs (typically 1–3). Confirm each exists in `.claude/agents/`.

**2b. Spawn implementers.** For each Owner agent, spawn it with a prompt containing **verbatim**: `CLAUDE.md`'s golden rules, the non-negotiables and **Lessons** entries this phase touches, the phase plan in full (Goal, that agent's *Files* rows, the *Acceptance criteria*, *Out of scope*), and the seven build disciplines from `implement.md` Step 2, byte-identical (*Conventions* · *Tests proportional to the change* · *Read boundary* · *Stay inside the Files table* · *Self-review before the gate* · *Done only with evidence* · *Declare your weakest bet*), plus one more for this lane: *"Never commit, push, stash, checkout, or otherwise mutate git state — the orchestrator owns git. Report what you changed and leave it in the working tree."* Never rely on a spawned agent inheriting this project's conventions — pin them into the prompt; the phase plan is its entire contract (`using-the-pack` item 11). Independent agents run in parallel; producer→consumer pairs run in sequence. Append `builder <name>`. As each done-report arrives, append its `least-confident: <line>`.

**A retry re-spawn reads the phase section of the record first**, then the current findings — it starts from the evidence, not from memory. For a BLOCK/High finding, the owner writes one line in the section before editing (what broke, why, the test that now catches it) and fixes the class, not the instance.

**Shed the report, keep the record.** Once a done-report's outcome is recorded, drop the full report from working context and carry forward only a one-paragraph summary and the file-change manifest; the record on disk is the durable copy.

**Report integrity — a truncated report is not a completion.** Before acting on a done-report, confirm it is whole: every field the prompt demanded is present, and the reported work carries no placeholder markers (`// TODO`, "implement here", a bare ellipsis). A missing field or a placeholder is a **truncation**: re-spawn that same owner once asking it to resend the complete report and finish every file, and log `report integrity: truncated — … · resend requested`. If the next report is truncated too, stop: `residual: <owner> report truncated twice — <what was missing>`.

**Paste-fidelity self-check — before sending every spawn prompt in 2b and 2d alike:** check every pinned block against its source — a phase-plan contract block byte-for-byte, a standard brief intact — nothing summarized or trimmed to fit.

**2c. Validation gate (ordering is mandatory).** Before any reviewer runs, the project's `typecheck`, `lint`, `test` must be **clean**: green, or — when a **brownfield baseline** exists (`docs/progress/entry-baseline.md`) — no new failures vs it (the ratchet rule in `implement.md` Step 3 applies as written). Append `validation: <command> · exit <n>`. **New** failures go back to the implementer before gating; baseline-recorded failures burn down across phases.

**2d. Critical-Path reviewer gate.**

<!-- canon: .claude/gate-rules.md#1-8 -->
**Before running this gate, read `.claude/gate-rules.md` and follow it.** This is the `/start-teams` build lane: the owning implementer fixes its own findings; the orchestrator never edits code.

Freeze the tree (§2) and name the snapshot. From `CLAUDE.md`'s Critical-Path → reviewer table, spawn **every** reviewer whose path this phase touched, read-only and in parallel (N paths → N verdicts; lean = one merged run with every checklist pasted verbatim, one verdict per path; `Full gates? yes` paths get their own run), each briefed with: the snapshot, the diff scope, the implementers' *least-confident* line(s) ("probe the declared weakest bet first"), the exact validation command and result, "think hard before rendering your verdict", and the PASS / NEEDS CHANGES / BLOCK format. Run the generalist reviewer **last** so it can consolidate. Announce the spend in one line before dispatch (§7). Append `reviewer <name>: <verdict>` and a `## Review log` row per run.

Apply §3: Medium/Low → one re-spawn of the owning implementer to fix them all, `fixed: file:line` per item, no re-review; BLOCK/High → fix → re-run only the reviewer whose cited files the fix touched — once (§5); then re-run 2c. An implementer re-spawn is a fix, not a run. If BLOCK/High survives the re-run, stop with the residual and one next action. Missing reviewer → `general-purpose` with that path's checklist pasted verbatim (§8). Anything on the §6 list is dropped from the grade and said so on the card.

**Also runs** (the shared list in `implement.md` Step 4): `production-reviewer` when production quality is in scope; `simplification-reviewer` unless lean (advisory, means never coverage); and this lane's **Codex cross-check in Mode 1 (Code diff)** per `.claude/codex-review.md`, scoped to this phase's diff — every Codex `[P1]` is fixed via the same re-spawn or dismissed with a one-line reason; advisory, the verdict stays with this orchestrator; unavailable → skip with a note.

**2e. Definition of Done.** Walk `CLAUDE.md`'s four DoD items and the phase plan's *Acceptance criteria* against the shipped code; each criterion gets one proof line (`AC-n: <test or command> · <result>`). Write the phase's 8-row card (`/review-phase` Step 6 shape) and each reviewer's report under `## Phase N — review`, append `complete` (or `residual: <what remains>`) to the phase section, add this phase's column to the record's `## Field metrics` table (`review-phase.md` Step 6 defines the five rows), and set the phase's *Status* cell in the master plan's *Phases* table to `Ready` — that section is what makes the *next* phase startable at its 2·0 gate. When the last phase reads Ready, set the record's top line to `Status: done`.

### Step 3: Final summary
Continue an authorized whole goal through remaining phases without repeatedly asking whether to continue; answer a mid-build progress question and resume; honor an explicit pause. Present each phase's card, then report per-phase status, every gate verdict, and any residual the user must decide on. Never claim a phase complete unless its gates are green and its acceptance criteria hold with evidence.

## Hard rules (do not violate)
- Never invent a named agent type outside `.claude/agents/`; the `general-purpose` reviewer fallback under canon §8 is the explicit exception.
- Never let a reviewer gate be skipped because a change is "small" or "tests pass".
- Never report a phase complete on green tests alone — the Definition of Done and every applicable reviewer gate must pass.
- Do not commit or branch unless the user asks (per the project's git policy).
