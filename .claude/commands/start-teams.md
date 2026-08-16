---
description: Orchestrate a specialist team to implement an existing master plan phase-by-phase, gating each phase through the project's Critical-Path reviewers and the CLAUDE.md Definition of Done. Do NOT use without an existing master plan — /create-plan writes one; for a small, clear change, /shape (or /go) routes to /implement's fast lane instead.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite, Agent
---

# Start Teams (in-project orchestrator)

You are the **lead orchestrator**. You read an existing master plan + its phase plans, right-size a specialist team per phase, spawn the project's real specialist agents, and gate every phase through the Critical-Path reviewer agents and the Definition of Done before moving on. Blocking spawns — you wait for each agent and verify its output; there is no async mailbox.

> Prerequisite: a master plan produced by `/create-plan` that has passed its Step 6 plan-review gate. If none exists, stop and tell the user to run `/create-plan <feature>` first.

## Usage
```
/start-teams [feature-name]
```
- `$ARGUMENTS`: the feature whose master plan lives at `docs/plans/<feature>-master-plan.md`.

## How it learns the project
- **`.claude/agents/`** — the only valid specialist + reviewer agents. Never request an agent that isn't here.
- **`CLAUDE.md`** — the Critical-Path → reviewer mapping, the gate ordering, and the Definition of Done.
- The **phase plans** — the verbatim contract for each spawned agent.

## Process

### Step 1: Load the plan
Read the master plan and every phase plan. Confirm the plan passed its plan-review gate (Plan Review Log shows READY). Build a `TodoWrite` list: one item per phase. If the plan is missing or unreviewed, stop.

Locate the **progress ledger** at `docs/progress/<feature>/ledger.md` — the append-only timeline of this feature's execution; create it if absent. Append one line per lifecycle event as you go, each stamped with the time and phase: `started`, `least-confident: <line>` (each implementer's declared weakest bet — see 2b), `entry-gate PASS`/`FAIL`, `reviewer <name>: <verdict>`, `escalated: <agent> re-spawn at strongest model (round 2)` (see 2d), `complete` (citing the evidence path), `blocked` (naming the missing predecessor), or `residual` (something the user must decide). It is **append-only** — never rewrite a past line; correct an outcome by appending a new one. This timeline is what `/go` and `/review-phase` reconstruct the report card from after an interruption. It is a **convenience layer, not the source of truth** — proof of completion is the evidence on disk (Step 2 gate), so a missing or garbled ledger never blocks work.

### Step 2: For each phase, in order

**Phase pre-gate — start a phase only when the work it builds on is actually finished (do this before 2a).** Read the phase plan's *Depends on* line (default: the immediately preceding phase; `none` = independent). A predecessor counts as done **only with proof on disk** — its phase review at `docs/progress/<feature>-phase-<P>-review.md` marked Ready/READY, **or** its completion evidence under `docs/progress/<feature>/` (the clean entry-gate artefact — green, or no new failures vs the recorded baseline — plus Definition-of-Done evidence). A master-plan *Progress Tracking* row that reads `Complete` is just a *claim* — verify the artefact, not the cell, so a stale or hand-edited table can't let a phase start on unfinished work. If any predecessor's proof is missing, the phase is **blocked, not started**: append a `blocked` line to the ledger naming the missing predecessor, surface it plainly, and stop — never assume a predecessor finished. Once startable, append a `started` line to the ledger and proceed.

**Checkpoint snapshot (opt-in, before any implementer runs).** Run the checkpoint consent-and-snapshot step — the canonical wording and mechanics live in `implement.md` Step 2 ("Checkpoint snapshot"); follow them exactly. In short: in a git repo, no `Checkpoints:` line in `CLAUDE.md` → ask once and record the answer; `Checkpoints: on` → an announced named-stash snapshot (or HEAD as the restore point on a clean tree) before the phase's first edit — never a silent git operation.

**2a. Right-size the team.** From the phase plan's *Implementation Tasks* Owner-agent column, determine which specialist agents this phase needs (typically 1–3). Confirm each exists in `.claude/agents/`.

**2b. Spawn implementers.** For each Owner agent, spawn it with a prompt containing **verbatim**: the phase plan's *Project Conventions Pinned* block, that agent's rows from *Implementation Tasks*, the relevant *Files to Create / Modify* rows, and the relevant *Acceptance Criteria*. Spawned agents read nothing automatically — the phase plan is their entire contract. Independent agents can run in parallel; agents with a producer→consumer dependency run in sequence (the handoff contract tells you which).

Every implementer prompt also carries four execution disciplines, verbatim: *"Test-first where practical: for each acceptance criterion, write the failing test before the behaviour (red → green); tests always ship in the same commit as the behaviour."*, *"Before you report done, re-read your own diff adversarially — assume defects exist — against the conventions block and the acceptance criteria, and fix what you find. A defect you catch costs seconds; one the reviewer gate catches costs a fix round."*, *"Report done only with evidence: for each acceptance criterion, name the command or test you ran and its result. A claim without a run is 'not verified yet', never 'done'."*, and *"With your done-report, declare your weakest bet: one line — the thing in this diff you're least confident about, the change you'd bet fails first. Never 'none' — every diff has a weakest point, and only you know where you guessed."* As each done-report arrives, append its declared line to the ledger (`least-confident: <line>`) — the declaration must reach disk so an interrupted session and a later, independent `/review-phase` can read it (the 2d reviewers receive it in their briefing).

**Paste-fidelity self-check — before sending each spawn prompt:** check every pinned block against its source — a phase-plan contract block byte-for-byte, a standard brief intact — nothing summarized or trimmed to fit. A paraphrased contract is a broken contract.

**2c. Entry gate (ordering is mandatory).** Before any reviewer runs, the phase's structural checks must be **clean**: `typecheck`, `lint`, `test` (use the project's actual scripts — read them from `package.json` / the build config, or `.claude/workspaces.json`). Clean = green, or — when a **brownfield baseline** exists (`docs/progress/entry-baseline.md`, recorded by bootstrap — or by this gate, below — on a repo that was already red) — no new failures vs it: no failing identifier it doesn't already record, no count above it; a failure this phase introduced is always FAIL. A run that beats the baseline rewrites it down (downward-only); the first all-green run deletes it — the standard reverts to plain green for good. If checks are red with no baseline recorded, ask **once**: do these failures pre-date this work? If yes, offer the pair together: record the baseline and proceed on this rule, **and** update `CLAUDE.md`'s entry-gate Definition-of-Done line to match (show the diff; merge, never clobber) — without that second edit the DoD audit still fails on the old "green" line. If they decline, the gate stays red. Reviewers read code; they do not run it. Capture the run's output as a completion artefact under `docs/progress/<feature>/` and append an `entry-gate PASS` (or `FAIL`) line to the ledger, with any ratchet movement (`baseline 12 → 9`) or retirement. If **new** failures appear, send them back to the implementer agent before gating — baseline-recorded failures don't route back; those burn down across phases as fixes land, and the ratchet records each step.

**2d. Critical-Path reviewer gate.** From `CLAUDE.md`'s Critical-Path → reviewer table, run **every** reviewer whose path this phase touched (N paths → N gates — skipping one because "tests pass" is drift). Spawn the reviewer agents read-only and in parallel, each briefed with the diff scope, the implementers' declared *least-confident* line(s) from 2b ("probe the declared weakest bet first"), and "think hard before rendering your verdict; report PASS / NEEDS CHANGES / BLOCK with file:line evidence". Run the generalist/qa reviewer **last** so it can consolidate. Fix every confirmed finding (re-spawn the implementer), then re-run only the failing reviewers. Max two rounds; surface residuals to the user. Append one `reviewer <name>: <verdict>` line to the ledger per reviewer (final verdict after fixes).

**Escalation ladder (round 2 = stronger implementer).** A finding that survives into a second fix round has proven the work is harder than its tier — re-spawn that implementer for the round-2 fix **passing the strongest model the account exposes as the dispatch `model` parameter**, briefed with the round-1 findings. The per-invocation parameter outranks an agent's `model:` frontmatter (documented from Claude Code v2.1.196; *time-sensitive — verify against current docs*), so it lifts even a consented economy pin (bootstrap Phase 6); on an older Claude Code, or with `CLAUDE_CODE_SUBAGENT_MODEL` set (it outranks everything), the re-spawn simply runs at its pinned tier — no worse than today, and the two-rounds-then-surface discipline still catches anything unresolved. The ladder only ever moves **up**: an upgrade needs no consent; a downgrade is never automatic. Append `escalated: <agent> re-spawn at strongest model (round 2)` to the ledger.

**Lean gate (`Gate intensity: lean` in `CLAUDE.md`) — consolidate, never skip.** Under lean, the per-path reviewers merge into **one merged reviewer run**: spawn the generalist reviewer (or `general-purpose`, the same type the missing-reviewer fallback sanctions) once, read-only, briefed with the diff scope, the implementers' declared *least-confident* line(s) ("probe them first"), "think hard before rendering your verdict", and each touched path's numbered checklist pinned **verbatim from that path's reviewer agent file** (paste-fidelity applies to each pinned checklist) — rendering PASS / NEEDS CHANGES / BLOCK **per path**, max two rounds; a re-run is the merged run scoped to the failing paths' checklists. The merged run is also the consolidation — no separate generalist spawn. Per-agent `model:` pins don't ride along in a merged run — explicitly request the strongest model the account exposes. The Codex Mode 1 cross-check below keeps running unchanged; the advisory simplification pass is skipped (advisory-only, never a gate). Write "gates ran lean (consolidated)" into the phase evidence and on the report card — lean is never silent. Lean changes how many agents run, never what is checked.

Alongside the Claude reviewer agents, run the **Codex cross-check in Mode 1 (Code diff)** per `.claude/codex-review.md`, scoped to this phase's diff — an independent cross-model second opinion. Fold its output into the generalist reviewer's consolidation: every Codex `[P1]` is triaged (fixed via re-spawn, or dismissed with a one-line reason) in the same fix loop; note where Codex and the Claude reviewers agreed or diverged. Codex is advisory — the gate verdict stays with this orchestrator. If Codex is unavailable the cross-check skips with a note and the gate proceeds on the Claude reviewers alone.

Also spawn the **`simplification-reviewer`** (read-only, same diff scope) as an **additive, subordinate** voice that hunts over-engineering only — what to delete/replace with stdlib or native features. It is governed by the *Economy of means* principle: it judges **means, never coverage**. Fold its findings into the consolidation, but apply a cut **only if coverage stays identical** — it can never flag a test/guard/edge-case for removal, never reduce the Definition of Done, and never block or downgrade a completeness PASS. When leanness and completeness conflict, completeness wins. Its absence is never a gate failure (it's not a Critical Path of its own).

**Paste-fidelity self-check — before sending each spawn prompt:** check every pinned block against its source — a phase-plan contract block byte-for-byte, a standard brief intact — nothing summarized or trimmed to fit. A paraphrased contract is a broken contract.

**2e. Definition of Done.** Walk the phase plan's *Completion Criteria* against the shipped code. Each acceptance criterion must PASS with cited evidence. Update the master plan's *Progress Tracking* row to `Complete`, drop evidence under `docs/progress/<feature>/`, and append a `complete` line to the ledger citing that evidence path — that evidence is exactly what makes the *next* phase startable at its 2·0 gate.

**Fallback** — if a required reviewer agent is missing from `.claude/agents/`, fall back to a `general-purpose` review that explicitly walks that Critical Path's checklist and note the absence in the phase evidence.

### Step 3: Final summary
Report per-phase status, every gate verdict, evidence file locations, and any residual findings the user must decide on. Do not claim a phase complete unless its gates are green and its acceptance criteria PASS with evidence.

## Hard rules (do not violate)
- Never spawn an agent type that isn't in `.claude/agents/`.
- Never let a reviewer gate be skipped because a change is "small" or "tests pass".
- Never report a phase complete on green tests alone — the Definition of Done and every applicable reviewer gate must pass.
- Do not commit or branch unless the user asks (per the project's git policy).
