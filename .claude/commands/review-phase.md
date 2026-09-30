---
description: Mandatory phase review — walk a phase plan's Acceptance criteria row-by-row, run the Critical-Path reviewer gates, audit the Definition of Done, and write the review into the feature's progress-and-log.md. Do NOT use to audit the whole codebase — that's /audit.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, Agent
---

# Review Phase

Independently verify that a shipped phase actually satisfies its plan — separate from the agent that built it. This is the gate that converts "the code compiles" into "the phase is done".

## Usage
```
/review-phase [feature-name] [phase-number]
```

## How it learns the project
- The **phase plan** at `docs/plans/<feature>-phase-<N>.md` — its *Acceptance criteria* are the rubric.
- **`CLAUDE.md`** — the Critical-Path → reviewer mapping and the Definition of Done.
- **`.claude/agents/`** — the reviewer agents to spawn.
- **`docs/progress/<feature>/progress-and-log.md`** — the build record (its shape: `implement.md`, *The one record*). Read the phase's section: `least-confident:` lines, `validation:` lines, `reviewer` lines and the `## Review log` rows already run.

## Process

### Step 1: Establish the diff scope
Determine what this phase changed (git diff against the phase's start point, or the phase plan's *Files* table). List the files in scope. Read the phase plan and the phase's section of the record. A build-lane reviewer run already recorded in `## Review log` for this exact snapshot counts as coverage for that path — do not re-run it; count it on the card. A run against an older snapshot does not.

### Step 2: Validation gate
Confirm `typecheck` + `lint` + `test` are **clean** on the current tree (run the project's real scripts): green, or — when a brownfield baseline exists (`docs/progress/entry-baseline.md`) — no new failures vs it, with the ratchet movement noted for the card (e.g. `baseline 12 → 9`; an improving run rewrites the baseline down, an all-green run retires it). If not clean, the phase is Not yet — report the new failures and stop; there is nothing to gate yet. (Red with no baseline and the failures look older than this phase? Say that `/go` will offer to record a baseline at its validation gate — the person's call, made there, not here.)

### Step 3: Acceptance criteria walk (row by row)
For **each** criterion in the phase plan, render PASS or FAIL with concrete evidence — the test name + result, the command + exit code, or `file:line`. One proof line per criterion: `AC-n: <test or command> · <result>`. A criterion you cannot evidence is a FAIL, not a pass-by-default. UI phases: browser evidence follows the `verifying-webapps` skill and the same one-line shape; a missing browser or fixture is `unverified`, never Ready.

### Step 4: Critical-Path reviewer gates

<!-- canon: .claude/gate-rules.md#1-8 -->
**Before running this gate, read `.claude/gate-rules.md` and follow it.** This is the independent-review lane: verify and route, never fix — findings go back to the build lane (`/implement` or `/start-teams`), which applies §3 and returns.

Freeze the tree (§2) and name the snapshot. From `CLAUDE.md`'s Critical-Path table, spawn **every** reviewer whose path this phase touched and is not already covered per Step 1 (N paths → N verdicts; lean = one merged run with every checklist pasted verbatim, one verdict per path; `Full gates? yes` paths get their own run; zero touched paths → the generic `code-reviewer`). Brief each, read-only, with: the snapshot, the diff scope, the declared *least-confident* line(s) from the phase plan and the record ("probe the declared weakest bet first"; none anywhere → say so on the card, never manufacture one), the exact validation command and result, "think hard before rendering your verdict", and the PASS / NEEDS CHANGES / BLOCK format. Run the generalist reviewer **last** to consolidate. Announce the spend in one line before dispatch (§7). Append one `reviewer <name>: <verdict>` line and one `## Review log` row per run. A missing reviewer → `general-purpose` with that path's checklist pasted verbatim (§8). Anything on the §6 list (docs, tables, counts, paperwork) is dropped from the grade and said so on the card.

**Order findings by reachability.** A finding against code that **no user path reaches yet** is recorded as a deferred item against the phase that will make it live — not as a blocker on this phase. Unreachable means the master plan's *Phases* table says this code goes live in a later phase — a reviewer's own guess is not enough. Two exceptions never defer: anything a security reviewer rates **High or above**, and anything that can **lose or corrupt data**. The gate still runs and every finding is still written down; what reachability changes is the blocking status, never whether the path was looked at. Write a deferred finding as one line under `## Deferred` in the record: `- <YYYY-MM-DD> — <finding, one sentence> — <file:line> — activates with: <capability> (<feature> phase <N>)`. Two readers bring it back: `/create-plan` Step 3 reads every feature's `## Deferred` list and picks up entries whose capability a new plan builds; this step re-briefs every entry whose activating phase is the one under review — those re-enter as ordinary findings at their original severity (mark the line `— re-entered <date>`, then `— done` when closed). A deferred finding with no activating phase named is not deferrable: it blocks.

**Simplification gate (advisory).** Unless `Gate intensity: lean`, also spawn the `simplification-reviewer` (read-only, same diff) — an additive voice that hunts over-engineering only. It judges **means, never coverage**: apply a cut only if coverage stays identical; it never flags a test, guard or edge case for removal, never reduces the Definition of Done, and cannot block. Its absence is never a gate failure.

**Production-readiness gate (on demand).** *Additionally* spawn the `production-reviewer` when production quality is in scope — the person asked for it ("make this production-ready", "ship to prod", "go live"), or `CLAUDE.md` / `NORTH_STAR.md` declares a production target. Not run on every phase by default. When it runs, it is a gate like any other.

**Paste-fidelity self-check — before sending each spawn prompt:** check every pinned block against its source — a phase-plan contract block byte-for-byte, a standard brief intact — nothing summarized or trimmed to fit.

### Step 5: Definition of Done
Walk `CLAUDE.md`'s four DoD items against this phase: validation gate (Step 2), every criterion has its proof (Step 3), one verdict per touched path (Step 4), a user path reaches it (the *Phases* table's *Makes live* entry, or the phase it names). A reviewer finding about docs, tables or counts is bookkeeping — drop it from the grade and say so.

### Step 6: Write the review
Write `## Phase <N> — review` into `docs/progress/<feature>/progress-and-log.md` (no separate review file). **Lead with a plain-language report card** anyone can read, then the evidence below it. The template is an output shape, not observed results — fill every cell only from evidence actually obtained; a pending gate keeps **Overall: Not yet**.

```markdown
## Phase <N> — review

**Overall: <Ready / Almost / Not yet>** — <what is done, what remains, one next action>. Ready means locally ready; nothing was released (`/release` is a separate, asked-for step).

| Gate | Result | One line |
|------|--------|----------|
| Validation (typecheck/lint/test) | green / `baseline 12 → 9` / red | <command · exit> |
| <Critical-Path reviewer> (one row per touched path) | Ready A / Almost B–C / Not yet D–F | <link to verdict · `2 fixed · 1 open`> |
| Acceptance criteria | <proven>/<total> | <each `AC-n: <test or command> · <result>`; list failed or unverified ones> |
| Least-confident probe | held / broke | <the declared line and what the reviewer found — or "no declaration"> |
| Reachability | reached via <route/screen/job> / lands in phase <N> | <deferred findings parked: <count>> |
| Fixed without re-review | <count> | <`fixed: file:line` per Medium/Low item> |
| Gate ran | <N> runs · <M> re-runs | <as announced before dispatch> |
| Gate intensity | lean / full | <paths escalated to their own run, or "none"> |

**Top things to fix (in order):** <1–3 plain-language items with file:line, or "none">

*Ask `/go` to explain any finding in plain words — or to just fix them.*
```

Before writing the card, self-check it: the **Overall** line is the first thing a reader sees; every *Top things to fix* item says where (file:line); and a person reading *only* the card knows exactly what to do next (the standing footer closes that loop — a card missing it fails this check). If any of the three fails, fix the card, not the standard.

A card that passes that self-check, and one that fails it — same review, opposite outcome for the person reading it:

*Good* — showing just the three self-check points (verdict leads, each fix names where, the footer gives a next move):
```markdown
**Overall: Not yet** — tests pass, but the login review found an account-lockout bypass that must be fixed before shipping.

**Top things to fix (in order):**
1. `auth/login.ts:42` — the password check runs before the rate limiter, so account lockout can be bypassed.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
```
*Why it works:* a non-expert reads the tier first, sees exactly which line to fix, and knows their next move.

*Bad* — same findings, unreadable to the person who needs them:
```markdown
## Report card
code-reviewer: NEEDS CHANGES (auth path); security-reviewer: PASS; DoD nominal.
Recommend hardening middleware ordering and revisiting the token TTL invariant.
```
*Why it fails:* the tier a person acts on is missing entirely — replaced by reviewer jargon; no fix cites a file:line, and there's no next step.

Aggregate the card from the reviewers' own headlines per canon §4: the worst open finding wins (any Not yet ⇒ Not yet; any Almost ⇒ Almost; all Ready ⇒ Ready). Preserve each original report and verdict in linked detail; never rewrite a reviewer's verdict; an unrated CHANGE is Medium (fix, note on the card, no re-review), never High. On a re-review after fixes, show the movement ("Not yet → Ready"). Put each reviewer's full report under the card as `### <reviewer> report` (that is the "link to verdict" the card rows point at). Then add this phase's column to the `## Field metrics` table at the end of the record — five rows, computed from the record and git, no harness:

| Metric | How to compute | 2.0 target |
|---|---|---|
| Docs per phase | new files under `docs/` between this phase's `started` and Ready, excluding the record and `/create-plan` output (`git log --diff-filter=A --name-only`) | ≤ 1 |
| Reviewer runs | rows in `## Review log` for this phase | ≤ 2 |
| Evidence lines | lines in this phase's review section matching ` · exit <n> · ` or `AC-n:` | ≤ 30 |
| First-pass headline | the Readiness tier in this phase's first reviewer report, before any fix | Almost or better |
| Wall-clock | `started` timestamp → Ready review timestamp | one session |

Set the phase's *Status* cell in the master plan's *Phases* table to `Ready` only on Ready. This Ready section is the **proof of completion** a dependent phase gates on.

## Hard rules
- Never mark a criterion PASS without cited evidence.
- Never skip a reviewer gate for a touched Critical Path.
- A gate's verdict exists only if the reviewer actually ran in a separate independent context (including a declared `general-purpose` fallback). Reporting a gate as passed without the run is fabricating the verdict, not reviewing.
- Ready requires: a clean validation gate **and** every acceptance criterion proven **and** one verdict per touched path with no open BLOCK/High **and** the Definition of Done met. Anything less is Almost or Not yet, per canon §4.
